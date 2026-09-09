import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), {chromium}=require('playwright'), esbuild=require('esbuild');
const root=path.resolve(import.meta.dirname,'..'), output=path.resolve(root,'../outputs/itinerary-note');
fs.mkdirSync(output,{recursive:true});
async function api(route,method='GET',body){
 const response=await fetch('http://127.0.0.1:3000'+route,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const text=await response.text();const result=text?JSON.parse(text):{};assert.ok(response.ok,JSON.stringify(result));return result;
}
const deckId='itinerary-note-2days';let ids=[],browser;
try{
 const created=await api('/api/decks/generate-batch','POST',{deckId,count:1,requestId:'note-test-'+Date.now()});
 ids=(created.lists||[]).map(row=>row.listId);assert.equal(ids.length,1,JSON.stringify(created));
 const find=async()=> (await api('/api/guide-data')).decks.find(d=>d.id===deckId).lists.find(l=>l.id===ids[0]);
 const list=await find();assert.equal(list.pages.length,2);
 assert.equal(new Set(list.pages.flatMap(p=>p.items.map(i=>i.name.toLowerCase().trim()))).size,14);
 assert.equal(list.captionHashtags.length,0);
 for(const p of list.pages){assert.equal(p.items.length,7);assert.equal(p.items.filter(i=>i.sourceSectionKey==='quan_an').length,2);assert.equal(p.items.filter(i=>i.sourceSectionKey==='cafe').length,1);}
 const bundle=await esbuild.build({stdin:{contents:"export {renderListPage} from './lib/pageMarkup.js'; export {fitItineraryNote} from './lib/itineraryNote.js'; export {buildCaptionExportText} from './lib/captionText.js'; export {default as html2canvas} from 'html2canvas';",resolveDir:root},bundle:true,platform:'browser',format:'iife',globalName:'NoteTest',write:false});
 const executablePath=[process.env.PROGRAMFILES+'/Google/Chrome/Application/chrome.exe',process.env['PROGRAMFILES(X86)']+'/Microsoft/Edge/Application/msedge.exe'].find(f=>fs.existsSync(f));
 browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
 const page=await browser.newPage({viewport:{width:1200,height:2100}});
 const css=[...fs.readFileSync(path.join(root,'app/globals.css'),'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m=>fs.readFileSync(path.join(root,'app',m[1]),'utf8')).join('\n');
 await page.route('**/fonts/**',async route=>{const f=path.join(root,'public',new URL(route.request().url()).pathname);if(fs.existsSync(f))await route.fulfill({body:fs.readFileSync(f)});else await route.abort();});
 await page.setContent('<html><head><base href="http://localhost:3001/"><style>'+css+'</style></head><body style="margin:0;background:white"></body></html>');
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const images=await page.evaluate(async list=>{
  const results=[];
  for(let i=0;i<2;i++){
   document.body.innerHTML=NoteTest.renderListPage(list.pages[i],i,2,list.id,[],list);
   await document.fonts.ready;const node=document.querySelector('article');NoteTest.fitItineraryNote(node,true);
   const canvas=await NoteTest.html2canvas(node,{scale:1080/397,backgroundColor:'#fff',logging:false});
   const normalized=document.createElement('canvas');normalized.width=1080;normalized.height=1920;normalized.getContext('2d').drawImage(canvas,0,0,1080,1920);
   results.push({data:normalized.toDataURL('image/png'),font:node.style.getPropertyValue('--in-font-size')});
  }
  if(NoteTest.buildCaptionExportText(list).includes('#'))throw new Error('Unexpected hashtag');
  const long={...list.pages[0],items:list.pages[0].items.map(row=>({...row,metaPrimary:'địa chỉ rất dài '.repeat(150)}))};
  document.body.innerHTML=NoteTest.renderListPage(long,0,2,list.id,[],list);
  let rejected=false;try{NoteTest.fitItineraryNote(document.querySelector('article'),true);}catch{rejected=true;}if(!rejected)throw new Error('Overflow not rejected');
  return results;
 },list);
 images.forEach((image,i)=>{const buffer=Buffer.from(image.data.split(',')[1],'base64');assert.equal(buffer.readUInt32BE(16),1080);assert.equal(buffer.readUInt32BE(20),1920);fs.writeFileSync(path.join(output,'0'+(i+1)+'-ngay-'+(i+1)+'.png'),buffer);});
 const items=list.pages[0].items.map(({name,metaPrimary})=>({name,metaPrimary}));items[0]={name:'',metaPrimary:''};items[1]={name:'Tên sửa riêng',metaPrimary:'Địa chỉ riêng'};
 await api('/api/decks/'+deckId+'/lists/'+ids[0]+'/pages/0/text','PATCH',{title:'',subtitle:'',items});
 const edited=await find();assert.equal(edited.pages[0].title,'');assert.equal(edited.pages[0].items[0].name,'');assert.equal(edited.pages[0].items[0].metaPrimary,'');assert.equal(edited.pages[0].items[1].name,'Tên sửa riêng');assert.deepEqual(edited.pages[1],list.pages[1]);
 fs.writeFileSync(path.join(output,'restart-snapshot.json'),JSON.stringify({id:ids[0],pages:edited.pages},null,2));
 console.log(JSON.stringify({ok:true,id:ids[0],fonts:images.map(i=>i.font),groups:list.pages.map(p=>p.items.map(i=>i.sourceSectionKey)),output}));
}finally{await browser?.close();if(!process.env.KEEP_NOTE_TEST)for(const id of ids)await api('/api/decks/'+deckId+'/lists/'+id,'DELETE');}
