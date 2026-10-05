import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),esbuild=require('esbuild');
const front=path.resolve(import.meta.dirname,'..'), root=path.resolve(process.env.AUDIT_ROOT);
const fixture=JSON.parse(fs.readFileSync(path.join(root,'generation.json')));
const css=[...fs.readFileSync(path.join(front,'app/globals.css'),'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m=>fs.readFileSync(path.join(front,'app',m[1]),'utf8')).join('\n');
const bundle=await esbuild.build({entryPoints:[path.join(front,'lib/pageMarkup.js')],bundle:true,write:false,platform:'browser',format:'iife',globalName:'Markup'});
const browser=await chromium.launch({headless:true,executablePath:[process.env.PROGRAMFILES+'/Google/Chrome/Application/chrome.exe',process.env['PROGRAMFILES(X86)']+'/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync)});
try {
 const page=await browser.newPage({viewport:{width:1100,height:800}});
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:`<html><head><style>${css}</style></head><body></body></html>`});
  if(url.pathname==='/assets/drive-file') {const id=url.searchParams.get('id'); if(/^[\w-]+$/.test(id||'')){const f=path.join(root,'data/drive-file-cache',id+'.bin');if(fs.existsSync(f))return route.fulfill({body:fs.readFileSync(f)});} }
  if(url.pathname.startsWith('/fonts/')){const f=path.join(front,'public/fonts',path.basename(url.pathname));if(fs.existsSync(f))return route.fulfill({body:fs.readFileSync(f)});}
  return route.abort();
 });
 await page.goto('http://visual.local/');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const results=[];
 for(const deck of fixture.decks) {
  const list=deck.lists[0];
  const samples=[{page:list.pages[0],index:0},{page:list.pages.find(p=>p.type==='list'&&p.items?.length)||list.pages[1],index:1}];
  if(deck.id==='spotlight-guide') {const service=list.pages.find(p=>p.layoutVariant==='spotlight-list'&&/dịch vụ/i.test(p.title+' '+p.chipText));if(service)samples.push({page:service,index:list.pages.indexOf(service)});}
  if(deck.id==='spotlight-v5')samples.push({page:list.pages[1],index:1});
  for(const [n,sample] of samples.entries()) {
   const result=await page.evaluate(({list,sample})=>{
    const after=sample.page,before={...after};delete before.spotlightDesignRevision;
    const render=p=>p.type==='cover'?Markup.renderCoverPage(p,sample.index,list.pages.length,list.id,[],list):Markup.renderListPage(p,sample.index,list.pages.length,list.id,[],list);
    document.body.innerHTML=`<div style="display:flex;gap:30px;padding:10px">${render(before)}${render(after)}</div>`;
    const node=document.querySelectorAll('.story-page')[1];const rect=node.getBoundingClientRect();
    const issues=[...node.querySelectorAll('h1,h2,p,.spotlight-v5-playlist-line')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&(r.top<rect.top-1||r.bottom>rect.bottom+1||r.left<rect.left-1||r.right>rect.right+1);}).map(el=>el.textContent);
    return {issues,width:rect.width,height:rect.height,revision:node.classList.contains('spotlight-design-1')};
   },{list,sample});
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})));});
   const out=path.join(root,`${deck.id}-before-after-${n}.png`);await page.screenshot({path:out,fullPage:true});
   assert.equal(result.revision,true);results.push({deck:deck.id,page:sample.index,...result,screenshot:out});
  }
 }
 const stress=[];
 for(const deck of fixture.decks) {
  const list=JSON.parse(JSON.stringify(deck.lists[0]));
  list.pages[0].title='Đà Lạt không chỉ có những góc phố quen thuộc, lưu lại chuyến đi này để cùng bạn bè khám phá';
  const venue=list.pages.find(p=>p.type==='list'&&p.items?.length);
  const cases=[list.pages[0]];
  if(venue){venue.items[0].name='Quán cà phê và khu vườn nhỏ bên sườn đồi dành cho những ngày nghỉ';venue.items[0].metaPrimary='123 Đường Nguyễn Trung Trực, khu dân cư trên đồi, phường Xuân Hương - Đà Lạt';cases.push(venue);}
  for(const p of cases){
   const row=await page.evaluate(({list,p})=>{
    document.body.innerHTML=p.type==='cover'?Markup.renderCoverPage(p,0,list.pages.length,list.id,[],list):Markup.renderListPage(p,1,list.pages.length,list.id,[],list);
    const node=document.querySelector('.story-page'),rect=node.getBoundingClientRect();
    const fields=[...node.querySelectorAll('h1,h2,p,.spotlight-v2-name-text,.spotlight-v5-place-name,.spotlight-list-copy strong,.spotlight-meta')];
    return {outside:fields.filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&(r.top<rect.top-1||r.bottom>rect.bottom+1||r.left<rect.left-1||r.right>rect.right+1);}).map(el=>el.textContent),clipped:fields.filter(el=>{const s=getComputedStyle(el);return s.webkitLineClamp!=='none'&&s.webkitLineClamp!=='unset'&&Number(s.webkitLineClamp)>0&&el.scrollHeight>el.clientHeight+1;}).map(el=>el.textContent)};
   },{list,p});
   stress.push({deck:deck.id,type:p.type,...row});
  }
 }
 fs.writeFileSync(path.join(root,'visual-stress.json'),JSON.stringify(stress,null,2));
 assert.ok(stress.every(row=>!row.outside.length&&!row.clipped.length),JSON.stringify(stress));
 fs.writeFileSync(path.join(root,'visual-results.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.map(r=>({deck:r.deck,page:r.page,issues:r.issues}))));
} finally {await browser.close();}
