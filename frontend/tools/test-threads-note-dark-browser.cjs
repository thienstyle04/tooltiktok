const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const front=path.resolve(__dirname,'..'),back=path.resolve(front,'../backend'),esbuild=require(back+'/node_modules/esbuild'),sharp=require(back+'/node_modules/sharp');
const {chromium}=require('playwright'),JSZip=require('jszip'),helper=require('./exportClientTestHelper.cjs');
async function main(){
 let input=process.argv[2];if(!input){const text=cp.execFileSync(process.execPath,['-r','ts-node/register/transpile-only','src/modules/guide/tools/test-threads-note-dark-list.ts'],{cwd:back,encoding:'utf8',timeout:90000});input=text.match(/NOTE01_FIXTURE=(.+)/)[1].trim();}
 const fixture=JSON.parse(fs.readFileSync(input)),lists=fixture.lists,out=path.join(path.dirname(input),'visual-export');fs.mkdirSync(out,{recursive:true});
 const bundle=await esbuild.build({...helper.bundleOptions({overrides:{downloadBlobFile:'downloadBlobFile = (blob,name) => { window.downloads.push({blob,name});return true; };'},extra:"export {renderListPage} from './pageMarkup';export {checkNoteDarkLayout,assertNoteDarkExport} from './threadsNoteDark';export {assertPartnerExportReady} from './exporter/checks';export {collectPartnerNames} from './partnerNames.mjs';"}),bundle:true,write:false,platform:'browser',format:'iife',globalName:'Audit'});
 const css=[...fs.readFileSync(front+'/app/globals.css','utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m=>fs.readFileSync(path.join(front,'app',m[1]),'utf8')).join('\n');
 const executablePath=[process.env.PROGRAMFILES+'/Google/Chrome/Application/chrome.exe',process.env['PROGRAMFILES(X86)']+'/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
 const browser=await chromium.launch({headless:true,executablePath});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}});
  await page.route('**/*',async route=>{const p=new URL(route.request().url()).pathname;
   if(p==='/')return route.fulfill({contentType:'text/html',body:`<style>${css}</style><div id="preview"></div>`});
   if(p.startsWith('/fonts/'))return route.fulfill({body:fs.readFileSync(path.join(front,'public',p))});
   if(p==='/api/health')return route.fulfill({json:{status:'ok',sessionId:'note01-test',appVersion:require('../lib/appVersion').APP_VERSION}});
   if(p==='/api/night-sync/export-lease')return route.fulfill({json:{ok:true}});
   if(p.startsWith('/api/runtime-performance'))return route.fulfill({json:{mode:'modern',totalMemoryBytes:16*1024**3,freeMemoryBytes:8*1024**3,logicalCpuCount:8}});
   if(p==='/api/drive-cache/status')return route.fulfill({json:{ready:false,phase:'error',message:'no image cache in text-only test'}});
   if(p==='/api/drive-files/cache-status')return route.fulfill({json:{missing:[],cached:0}});
   return route.abort();
  });
  await page.goto('http://note01.test/');await page.addScriptTag({content:bundle.outputFiles[0].text});
  for(const index of [0,5]){
   const metrics=await page.evaluate(async list=>{document.querySelector('#preview').innerHTML=Audit.renderListPage(list.pages[0],0,1,list.id,[],list);await document.fonts.ready;const node=document.querySelector('article');Audit.checkNoteDarkLayout(node,true);return {width:node.offsetWidth,height:node.getBoundingClientRect().height,rows:node.querySelectorAll('.note-dark-row').length,groups:node.querySelectorAll('h2').length,images:node.querySelectorAll('img').length,titles:node.querySelectorAll('h1').length,name:getComputedStyle(node.querySelector('.note-dark-row')).fontSize,text:node.textContent};},lists[index]);
   assert.equal(metrics.width,397);assert.ok(Math.abs(metrics.height-1920*397/1080)<.05);assert.equal(metrics.rows,18);assert.equal(metrics.groups,3);assert.equal(metrics.images,0);assert.equal(metrics.titles,0);assert.equal(parseFloat(metrics.name),lists[index].pages[0].textFontSize);assert.ok(!metrics.text.includes(lists[index].postCaption));
   await page.locator('#preview article').screenshot({path:path.join(out,index===0?'preview-default.png':'preview-inherited.png')});
  }
  const overflow=await page.evaluate(list=>{const p=structuredClone(list.pages[0]);p.items[0].name='Tên quán rất dài không cắt chữ '.repeat(80);document.querySelector('#preview').innerHTML=Audit.renderListPage(p,0,1,list.id,[],list);try{Audit.checkNoteDarkLayout(document.querySelector('article'),true);return false;}catch{return true;}},lists[0]);assert.ok(overflow);
  const oldGuard=await page.evaluate(list=>{try{Audit.assertPartnerExportReady(list,'grid-6');return false;}catch{return true;}},lists[4]);assert.ok(oldGuard,'Zero-partner exception must not leak to old templates');
  const runExport=async(selected,format,single=false)=>page.evaluate(async({lists,format,single})=>{
   window.downloads=[];const status=[],cb={setStatus:s=>status.push(s)};const deck={id:'threads-note-dark-list',navTitle:'Note 01 · Đen tối giản',lists};
   const result=single?await Audit.exportActiveList({deck,list:lists[0],quality:'optimized',format},cb):await Audit.exportBatch({dataset:{source:{destinationId:'dalat-threads',allowedDeckIds:[deck.id]},decks:[deck]},selectedListIds:new Set(lists.map(l=>l.id)),quality:'optimized',format,skipImageErrors:true},cb);
   const files=[];for(const file of window.downloads){const bytes=new Uint8Array(await file.blob.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.slice(i,i+16384));files.push({name:file.name,data:btoa(s)});}return {files,status,result};
  },{lists:selected,format,single});
  for(const format of ['png','jpg'])for(const single of [false,true]){
   const selected=single?[lists[4]]:lists.slice(0,5),result=await runExport(selected,format,single);assert.ok(result.files.length,result.status.join('\n'));let imageCount=0,txt=0,xlsx=0;
   for(const file of result.files){const body=Buffer.from(file.data,'base64');fs.writeFileSync(path.join(out,`${single?'single-zero':'batch'}-${format}.zip`),body);const zip=await JSZip.loadAsync(body,{checkCRC32:true});for(const entry of Object.values(zip.files).filter(e=>!e.dir)){
    if(entry.name.endsWith('.'+format)){const bytes=await entry.async('nodebuffer'),meta=await sharp(bytes).metadata();assert.equal(meta.width,1080);assert.equal(meta.height,1920);await sharp(bytes).stats();if(!imageCount)fs.writeFileSync(path.join(out,`export-${single?'zero':'default'}.${format}`),bytes);imageCount++;}
    if(entry.name.endsWith('.txt')){const text=await entry.async('string');assert.ok(selected.some(list=>text.includes(list.postCaption)));txt++;}
    if(entry.name.endsWith('.xlsx')){const book=await JSZip.loadAsync(await entry.async('nodebuffer'));const xml=await book.file('xl/worksheets/sheet1.xml').async('string');const names=await page.evaluate(xml=>[...new DOMParser().parseFromString(xml,'application/xml').querySelectorAll('t')].map(t=>t.textContent),xml);assert.ok(names.length>0);assert.equal(new Set(names).size,names.length);assert.ok(selected.some(list=>JSON.stringify(list.pages[0].items.filter(i=>i.isPartner).map(i=>i.name).sort())===JSON.stringify([...names].sort())),'Partner workbook must match a rendered list');xlsx++;}
   }}
   assert.equal(imageCount,selected.length);assert.equal(txt,selected.length);assert.equal(xlsx,selected.filter(list=>list.pages[0].items.some(i=>i.isPartner)).length);console.log('PASS',format,single?'single zero-partner':'batch 4 lists + zero-partner');
  }
  const invalid=structuredClone(lists[0]);invalid.id='threads-note-dark-list-caption-100-invalid';invalid.pages[0].items[0].name='Tên dài '.repeat(300);
  const partial=await runExport([lists[4],invalid],'jpg');assert.ok(partial.files.length,partial.status.join('\n'));
  const zip=await JSZip.loadAsync(Buffer.from(partial.files[0].data,'base64')),entries=Object.values(zip.files).filter(f=>!f.dir);assert.equal(entries.filter(f=>f.name.endsWith('.jpg')).length,1);assert.equal(entries.filter(f=>f.name.includes('/')&&f.name.endsWith('.txt')).length,1);assert.equal(entries.filter(f=>f.name.endsWith('.xlsx')).length,0);assert.ok(partial.status.join(' ').includes('tràn chữ'));
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,frames:'1080x1920',imageExports:12,textOnly:true,zeroPartnerExport:true,oldPartnerGuardPreserved:true,overflowBlocked:true,partialCleanup:true},null,2));
  console.log('PASS Note01 renderer + single/batch PNG/JPG + TXT/XLSX + zero-partner + overflow cleanup. NOTE01_VISUAL='+out);
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
