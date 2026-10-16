// Explicit browser audit against isolated live snapshots, not user list stores.
const assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path');
const front=path.resolve(__dirname,'..'),back=path.resolve(front,'../backend');
const esbuild=require(path.join(back,'node_modules/esbuild'));
const {chromium}=require('playwright');
const helper=require('./exportClientTestHelper.cjs');
process.env.TS_NODE_PROJECT=path.join(back,'tsconfig.json');
require(path.join(back,'node_modules/ts-node/register/transpile-only'));
const {getColorEditAsset}=require(path.join(back,'src/modules/guide/color-edit.ts'));
const XLSX=require(path.join(back,'node_modules/xlsx'));

async function main(){
 const input=path.resolve(process.argv[2]), output=path.join(path.dirname(input),'exports');fs.mkdirSync(output,{recursive:true});
 const {lists}=JSON.parse(fs.readFileSync(input,'utf8'));assert.equal(lists.length,8);
 const bundle=await esbuild.build({...helper.bundleOptions({names:['renderPagesForExport','waitForPageImagesSettled'],overrides:{downloadBlobFile:'downloadBlobFile = (blob,name) => { window.downloads.push({blob,name}); return true; };'},extra:"export {default as JSZip} from 'jszip'; export {renderCoverPage,renderListPage} from './pageMarkup'; export {applyPageTextScale} from './pageTextScale'; export {checkCherryBlossomLayout} from './cherryBlossom';"}),bundle:true,write:false,format:'iife',globalName:'Smoke',platform:'browser'});
 const css=[...fs.readFileSync(path.join(front,'app/globals.css'),'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m=>fs.readFileSync(path.join(front,'app',m[1]),'utf8')).join('\n');
 const executablePath=[process.env.PROGRAMFILES+'/Google/Chrome/Application/chrome.exe',process.env['PROGRAMFILES(X86)']+'/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
 const browser=await chromium.launch({headless:true,executablePath});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}});
  page.on('console',msg=>{if(msg.type()==='error')console.error('BROWSER',msg.text().slice(0,200));});
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url()),p=url.pathname;
   if(p==='/')return route.fulfill({contentType:'text/html',body:`<style>${css}</style><div id="preview"></div>`});
   if(p==='/assets/drive-file'||p==='/assets/color-edit'){
    const source=p==='/assets/color-edit'?new URL(url.searchParams.get('source'),'http://cherry.test'):url;
    const id=source.searchParams.get('id');if(!/^[\w-]+$/.test(id||''))return route.abort();
    const body=fs.readFileSync(path.join(path.dirname(input),'drive-file-cache',id+'.bin'));
    return route.fulfill({contentType:'image/png',body:p==='/assets/color-edit'?await getColorEditAsset(body,path.dirname(input),'iphone-color-edit-v1'):body});
   }
   if(p.startsWith('/fonts/'))return route.fulfill({body:fs.readFileSync(path.join(front,'public',p))});
   if(p==='/api/health')return route.fulfill({json:{status:'ok',sessionId:'cherry-audit',appVersion:require('../lib/appVersion.js').APP_VERSION}});
   if(p==='/api/night-sync/export-lease')return route.fulfill({json:{ok:true}});
   if(p.startsWith('/api/runtime-performance'))return route.fulfill({json:{mode:'modern',totalMemoryBytes:16*1024**3,freeMemoryBytes:8*1024**3,logicalCpuCount:8}});
   if(p==='/api/drive-cache/status')return route.fulfill({json:{ready:true,phase:'ready'}});
   if(p==='/api/drive-files/cache-status')return route.fulfill({json:{missing:[],cached:0}});
   console.error('UNEXPECTED',url.href);return route.abort();
  });
  await page.goto('http://cherry.test/');await page.addScriptTag({content:bundle.outputFiles[0].text});
  // Real preview and typography; verify that output-pixel size 45 is scaled
  // once into the preview frame, never silently shrunk by a diary fitter.
  for(const index of [0,3,4,10]){
   await page.evaluate(({list,index})=>{const p=list.pages[index];document.getElementById('preview').innerHTML=p.type==='cover'?Smoke.renderCoverPage(p,index,16,list.id,[],list):Smoke.renderListPage(p,index,16,list.id,[],list);}, {list:lists[0],index});
   await page.evaluate(async()=>{await document.fonts.ready;await Smoke.waitForPageImagesSettled(document.querySelector('#preview .story-page'));});
   await page.locator('#preview .story-page').screenshot({path:path.join(output,`preview-${index+1}.png`)});
  }
  const overflow=await page.evaluate(()=>{const p=document.querySelector('#preview .story-page');p.querySelector('.cherry-blossom-copy').textContent='Nội dung quá dài '.repeat(1000);try{Smoke.checkCherryBlossomLayout(p,true);return false;}catch{return true;}});assert.ok(overflow);
  for(const color of ['original','color'])for(const format of ['png','jpg']){
   const selected=color==='original'?lists.slice(0,4):lists.slice(4);
   console.log('EXPORT',color,format,selected.length,'lists');
   const result=await page.evaluate(async({lists,format})=>{
    window.downloads=[];const busy=[],status=[];
    const cb={setStatus:s=>status.push(s),setBusy:b=>busy.push(b),setExportBusy:b=>busy.push(b),setExportProgress:()=>{},startProgress:()=>{},updateProgress:()=>{},completeProgress:()=>{},failProgress:()=>{},resetProgress:()=>{}};
    const deck={id:'spotlight-v6-cherry-blossom',navTitle:'Spotlight Mùa hoa đào',lists};
    const dataset={source:{destinationId:'dalat-test',allowedDeckIds:[deck.id]},decks:[deck]};
    const outcome=await Smoke.exportBatch({dataset,selectedListIds:new Set(lists.map(l=>l.id)),quality:'optimized',format},cb);
    if(outcome?.success===false||!window.downloads.length)throw Error(JSON.stringify({outcome,status}));
    const downloads=[];
    for(const item of window.downloads){const bytes=new Uint8Array(await item.blob.arrayBuffer());let s='';for(let n=0;n<bytes.length;n+=16384)s+=String.fromCharCode(...bytes.slice(n,n+16384));downloads.push({name:item.name,data:btoa(s)});}
    return {downloads,busy:busy.at(-1),status:status.at(-1)};
   },{lists:selected,format});
   assert.equal(result.busy,false);let count=0,sheets=0;
   const JSZip=require('jszip'),sharp=require(path.join(back,'node_modules/sharp'));
   for(const download of result.downloads){
    const bytes=Buffer.from(download.data,'base64');fs.writeFileSync(path.join(output,`${color}-${format}-${download.name}`),bytes);
    const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
    for(const entry of Object.values(zip.files).filter(f=>!f.dir)){
     if(entry.name.endsWith('.'+format)){count++;const image=await entry.async('nodebuffer'),info=await sharp(image).metadata();assert.equal(info.width,1080);assert.equal(info.height,1920);
      if(count<=16)fs.writeFileSync(path.join(output,`${color}-${format}-${String(count).padStart(2,'0')}.${format}`),image);
     }
     if(entry.name.endsWith('.xlsx')){sheets++;const wb=XLSX.read(await entry.async('nodebuffer'));const cells=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1}).flat().filter(Boolean);assert.equal(cells.length,7);assert.equal(new Set(cells).size,7);assert.ok(cells.every(name=>typeof name==='string'&&!name.includes(' — ')));const expected=[...new Set(selected[sheets-1].pages.flatMap(page=>(page.items||[]).filter(item=>item.isPartner).map(item=>item.rawName||item.name)))];assert.deepEqual(cells.sort(),expected.sort(),'XLSX must match this saved list, not another list in the batch');}
    }
   }
   assert.equal(count,64);assert.equal(sheets,4);console.log('PASS',color,format,count,'1080×1920 images,',sheets,'XLSX; busy cleared');
  }
  console.log('PASS export audit',output);
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
