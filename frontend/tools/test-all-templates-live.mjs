import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),esbuild=require('esbuild');
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(root,'../outputs',process.env.TEST_REPORT_DIR || 'all-template-export-tests');
fs.mkdirSync(out,{recursive:true});
const API='http://127.0.0.1:3000';
async function api(url,method='GET',body){const r=await fetch(API+url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(180000)});const s=await r.text();if(!r.ok)throw new Error(r.status+' '+s.slice(0,500));return s?JSON.parse(s):{};}
let source=fs.readFileSync(path.join(root,'lib/exportClient.js'),'utf8').replace('function downloadBlobFile(', 'function originalDownloadBlobFile(');
source=source.replace('export async function renderPageBlob(pageNode, options = {}) {',`export async function renderPageBlob(pageNode, options = {}) {
 window.__fallbacks.push(...Array.from(pageNode.querySelectorAll('[data-export-fallback-src]')).map(n=>n.dataset.exportFallbackSrc));
`);
source+='\nfunction downloadBlobFile(blob,name){window.__downloads.push({blob,name});return true;}\nexport {JSZip};';
const bundle=await esbuild.build({stdin:{contents:source,resolveDir:path.join(root,'lib')},bundle:true,write:false,platform:'browser',format:'iife',globalName:'TestApp'});
const css=[...fs.readFileSync(path.join(root,'app/globals.css'),'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m=>fs.readFileSync(path.join(root,'app',m[1]),'utf8')).join('\n');
const executablePath=[process.env.PROGRAMFILES+'/Google/Chrome/Application/chrome.exe',process.env['PROGRAMFILES(X86)']+'/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const report=[];let active;
try{
 const catalog=await api('/api/guide-data');active=catalog.source.destinationId;
 const filter=process.env.TEST_DECKS?.split(',');
 for(const deck of catalog.decks.filter(d=>!filter||filter.includes(d.id))){
  const row={destination:active,deckId:deck.id,title:deck.title,status:'running'};let id,page;
  report.push(row);console.log('START',deck.id);
  try{
   let created;
   if(deck.id==='spotlight-partner'){
    const data=await api('/api/partners');const partners=Array.isArray(data)?data:(data.partners||data.items||[]);
    if(!partners.length)throw new Error('No partner available');
    created=await api('/api/decks/generate-partner-spotlight','POST',{partnerId:partners[0].id,partnerName:partners[0].name});
   }else created=await api('/api/decks/generate-from-caption','POST',{deckId:deck.id,tone:'lich_trinh_huu_ich',caption:{coverTitle:'Gợi ý chuyến đi Đà Lạt',headline:'Lịch trình tham khảo',body:'Các địa điểm gợi ý cho chuyến đi.',hashtags:[]}});
   id=created.listId;if(!id)throw new Error('No generated list ID');row.listId=id;
   const dataset=await api('/api/guide-data');const current=dataset.decks.find(d=>d.id===deck.id),list=current.lists.find(l=>l.id===id);
   if(!list?.pages?.length)throw new Error('Empty generated list');row.expectedPages=list.pages.length;
   page=await browser.newPage({viewport:{width:1400,height:2200}});
   await page.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<html><head><style>'+css+'</style></head><body></body></html>'});
    if(u.pathname.startsWith('/fonts/')){const f=path.join(root,'public',u.pathname);if(fs.existsSync(f))return route.fulfill({body:fs.readFileSync(f)});}
    if(u.pathname.startsWith('/api/')||u.pathname.startsWith('/assets/')){try{const response=await route.fetch({url:API+u.pathname+u.search,timeout:60000});return route.fulfill({response});}catch{return route.abort();}}
    return route.abort();
   });
   await page.goto('http://localhost:3001/');await page.addScriptTag({content:bundle.outputFiles[0].text});
   const metrics=await Promise.race([page.evaluate(async({deck,list,dataset})=>{
    window.__downloads=[];window.__fallbacks=[];const errors=[];let zipStart=0,zipMs=0;
    const cb={failProgress:m=>errors.push(m),updateProgress:(n,m)=>{if(n>=85&&String(m).includes('ZIP')&&!zipStart)zipStart=performance.now();if(n===99&&zipStart)zipMs=performance.now()-zipStart;}};
    const start=performance.now();
    await TestApp.exportSelectedPagePng({deck,list,dataset,quality:'optimized',selectedPageIndex:0},cb);
    await TestApp.exportActiveList({deck,list,dataset,quality:'optimized'},cb);
    if(errors.length)throw new Error(errors.join('; '));if(window.__downloads.length!==2)throw new Error('Missing export');
    const zipBlob=window.__downloads[1].blob;const zip=await TestApp.JSZip.loadAsync(await zipBlob.arrayBuffer(),{checkCRC32:true});
    const files=Object.values(zip.files).filter(f=>f.name.endsWith('.png'));if(files.length!==list.pages.length)throw new Error('Wrong page count '+files.length);
    const dimensions=[];
    for(const f of files){const bitmap=await createImageBitmap(new Blob([await f.async('uint8array')],{type:'image/png'}));if(bitmap.width<900||bitmap.height<900)throw new Error('Undersized PNG '+f.name);dimensions.push(bitmap.width+'x'+bitmap.height);bitmap.close();}
    const first=await createImageBitmap(window.__downloads[0].blob);const single=first.width+'x'+first.height;first.close();
    if(single!==dimensions[0])throw new Error('Single/ZIP dimensions differ');
    return {pages:files.length,dimensions:[...new Set(dimensions)],zipBytes:zipBlob.size,elapsedMs:Math.round(performance.now()-start),zipMs:Math.round(zipMs),fallbacks:[...new Set(window.__fallbacks)]};
   },{deck:current,list,dataset}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Export exceeded 180 seconds')),180000);timer.unref();})]);
   Object.assign(row,metrics,{status:metrics.fallbacks.length?'warning':'pass'});
  }catch(e){row.status='fail';row.error=e.message;}
  finally{await page?.close();if(id){try{await api('/api/decks/'+deck.id+'/lists/'+id,'DELETE');row.cleaned=true;}catch(e){row.cleanupError=e.message;}}fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log('RESULT',JSON.stringify(row));}
 }
}finally{await browser.close();}
console.log('SUMMARY',JSON.stringify({total:report.length,pass:report.filter(x=>x.status==='pass').length,warning:report.filter(x=>x.status==='warning').length,fail:report.filter(x=>x.status==='fail').length,report:path.join(out,'report.json')}));
