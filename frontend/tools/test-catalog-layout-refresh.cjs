// Full studio regression, synthetic local layout only. Never touches the live
// browser, private package, user lists, Google Sheet or published data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const front=path.resolve(__dirname,'..'),esbuild=require(path.join(front,'../backend/node_modules/esbuild'));
const {chromium}=require('playwright'),{APP_VERSION}=require('../lib/appVersion.js');
const id='local-layout-fixture';
const model={templateId:id,version:1,width:1080,height:1440,fonts:[],nodes:[
 {kind:'shape',x:100,y:150,width:880,height:1100,style:{background:'#eee',borderRadius:44}},
 ...[0,1,2,3].map(i=>({kind:'image',itemIndices:[i],x:150+430*(i%2),y:210+500*Math.floor(i/2),width:350,height:350,required:true,style:{objectFit:'cover'}})),
]};
const list={id:id+'-main',navTitle:'List chính',title:'Centered fixture',pages:[{type:'list',title:'Centered fixture',subtitle:'',backgroundImage:'',items:[0,1,2,3].map(i=>({name:'Place '+i,imageUrl:'/assets/drive-file?id=fixture-'+i,isPartner:i<2})),localRender:model}]};
const fresh={generatedAt:'2026-10-15T00:00:00Z',source:{destinationId:'dalat-test',destinationLabel:'Đà Lạt Test',allowedDeckIds:[id],totalItems:4,coverImageUrls:[]},sections:[],decks:[{id,navTitle:'Layout fixture',title:'Layout fixture',description:'',localTemplate:{version:1,pageCount:1},lists:[list]}]};
const stale=structuredClone(fresh);stale.decks[0].lists[0].pages[0].localRender.nodes.filter(n=>n.kind==='image').forEach(n=>{n.x+=30;});
async function main(){
 const bundle=await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Studio from './components/DeckStudio';import{DATASET_CACHE_KEY,STUDIO_CATALOG_REVISION_KEY,SELECTION_STORAGE_KEY}from'./lib/utils';
  for(const storage of [localStorage,sessionStorage]){storage.setItem(DATASET_CACHE_KEY,JSON.stringify({savedAt:Date.now(),dataset:window.fixture}));storage.setItem(STUDIO_CATALOG_REVISION_KEY,'2026-10-15-cherry-blossom');storage.setItem(DATASET_CACHE_KEY+':checkedAt',String(Date.now()));storage.setItem('draft-sentinel','keep-me');}
  localStorage.setItem(SELECTION_STORAGE_KEY,JSON.stringify({activeDeckId:'${id}',activeListId:'${id}-main',selectedPageIndex:0}));
  createRoot(document.getElementById('root')).render(<Studio/>);`,resolveDir:front,loader:'jsx'},bundle:true,write:false,format:'iife',loader:{'.js':'jsx'},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 const css=[...fs.readFileSync(front+'/app/globals.css','utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m=>fs.readFileSync(path.join(front,'app',m[1]),'utf8')).join('\n');
 const browser=await chromium.launch({headless:true,executablePath:[process.env.PROGRAMFILES+'/Google/Chrome/Application/chrome.exe',process.env['PROGRAMFILES(X86)']+'/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync)});
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'catalog-layout-refresh-'));
 try{for(const fail of [false,true]){
  const page=await browser.newPage({viewport:{width:1280,height:1200}});let release,requested,mutations=0;
  const pending=new Promise(resolve=>{release=resolve;}),seen=new Promise(resolve=>{requested=resolve;});const guideRequests=[];
  await page.route('**/*',async route=>{const req=route.request(),u=new URL(req.url()),p=u.pathname;
   if(p==='/')return route.fulfill({contentType:'text/html',body:`<style>${css}</style><div id="root"></div><script>window.fixture=${JSON.stringify(stale)}</script><script>${bundle.outputFiles[0].text}</script>`});
   if(!['GET','HEAD'].includes(req.method()))mutations++;
   if(p==='/api/guide-data'){guideRequests.push(u.search);requested();await pending;return route.fulfill(fail?{status:503,json:{message:'offline fixture'}}:{json:fresh});}
   if(p==='/api/destinations')return route.fulfill({json:{active:{id:'dalat-test',label:'Đà Lạt Test',allowedDeckIds:[id]},destinations:[{id:'dalat-test',label:'Đà Lạt Test',allowedDeckIds:[id]}]}});
   if(p==='/api/health')return route.fulfill({json:{status:'ok',sessionId:'layout-fixture',appVersion:APP_VERSION}});
   if(p==='/api/automation')return route.fulfill({json:{locked:false,schedules:[],runs:[]}});
   if(p==='/api/hook-sources')return route.fulfill({json:{mode:'normal',sources:[]}});
   if(p==='/api/photo-presets')return route.fulfill({json:{presets:[{id:null,label:'Ảnh gốc'}]}});
   if(p==='/api/partners')return route.fulfill({json:[]});
   if(p==='/api/night-sync/status')return route.fulfill({json:{phase:'idle',locked:false,sources:[]}});
   if(p==='/api/drive-cache/status')return route.fulfill({json:{ready:true,phase:'ready',destinationId:'dalat-test'}});
   if(p.startsWith('/api/runtime-performance'))return route.fulfill({json:{mode:'modern',reason:'fixture'}});
   if(p.startsWith('/api/app-update/'))return route.fulfill({json:{enabled:false,currentVersion:APP_VERSION}});
   if(p==='/assets/drive-file')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="350" height="350"><rect width="350" height="350" fill="#567d62"/></svg>'});
   if(p.startsWith('/fonts/'))return route.fulfill({body:fs.readFileSync(path.join(front,'public',p))});
   return route.fulfill({status:404,body:'Isolated fixture'});
  });
  if(process.env.DEBUG_UI){page.on('pageerror',e=>console.log('[pageerror]',e.message));page.on('console',m=>console.log('[console]',m.type(),m.text().slice(0,200)));}
  await page.goto('http://catalog-layout.test/');
  await Promise.race([seen,new Promise((_,reject)=>setTimeout(()=>reject(Error('No catalog refresh: stale cache was reused')),10000))]);
  await page.getByRole('navigation',{name:'Điều hướng chính'}).getByRole('button',{name:/^Tạo/}).click();
  assert.equal(await page.locator('.local-template-page').count(),0,'Do not show known-stale cached layout before current response');
  assert.equal(await page.getByRole('button',{name:'Tạo list từ mẫu Layout fixture',exact:true}).count(),0,'Do not paint stale gallery first');
  release();await page.getByRole('button',{name:'Tạo list từ mẫu Layout fixture',exact:true}).waitFor();
  if(fail)await page.getByText(/Chưa tải được mẫu mới/).waitFor();
  await page.getByRole('navigation',{name:'Điều hướng chính'}).getByRole('button',{name:/^Duyệt & Xuất/}).click();await page.locator('.v2-canvas .local-template-page').waitFor();
  const xs=await page.locator('.v2-canvas .local-template-page img').evaluateAll(nodes=>nodes.map(n=>parseFloat(n.style.left)));
  assert.deepEqual(xs,fail?[180,610,180,610]:[150,580,150,580]);
  const keep=await page.evaluate(()=>[localStorage.getItem('draft-sentinel'),sessionStorage.getItem('draft-sentinel')]);assert.deepEqual(keep,['keep-me','keep-me']);
  assert.ok(guideRequests.length>0);assert.ok(guideRequests.every(query=>query===''),'Read published dataset only, never ?refresh=1 / Sheet sync, including offline retries');
  if(!fail)assert.equal(guideRequests.length,1,'Only one successful catalog read');assert.equal(mutations,0);
  await page.screenshot({path:path.join(output,fail?'offline-fallback.png':'fresh-layout.png')});await page.close();
 }
 console.log('PASS real DeckStudio stale layout cache: no stale flash, fresh geometry despite recent background-check timestamp, local-only GET, offline fallback warning, unrelated draft storage retained, no writes. OUTPUT='+output);
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
