// Offline smoke: reads saved snapshots/cache; never creates or modifies backend lists.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), { chromium } = require('playwright'), esbuild = require('esbuild');
const root = path.resolve(import.meta.dirname, '..'), data = path.resolve(root, '../backend/data');
const saved = JSON.parse(fs.readFileSync(path.join(data, 'generated-caption-lists.dalat.json'), 'utf8'));
const decks = ['spotlight-v6-green', 'spotlight-v6'].map(id => ({ id, lists: saved.decks[id]?.slice(0, 1) || [] }));
if (decks[0].lists[0]?.pages.length !== 11 || decks[1].lists[0]?.pages.length !== 14) {
  console.log('SKIP cached V6 Green export: cần snapshot runtime V6 Green 11 trang và V6 14 trang.');
  process.exit(0);
}
let source = fs.readFileSync(path.join(root, 'lib/exportClient.js'), 'utf8').replace('function downloadBlobFile(', 'function originalDownloadBlobFile(');
source += '\nfunction downloadBlobFile(blob, name) { window.__downloads.push({blob,name}); return true; }\nexport { JSZip };';
const bundle = await esbuild.build({ stdin: { contents: source, resolveDir: path.join(root, 'lib') }, bundle: true, platform: 'browser', format: 'iife', globalName: 'Smoke', write: false });
const executablePath = [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
let external = 0, missing = new Set();
try {
 const page = await browser.newPage({viewport:{width:1200,height:2100}});
 const css = [...fs.readFileSync(path.join(root,'app/globals.css'),'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m=>fs.readFileSync(path.join(root,'app',m[1]),'utf8')).join('\n');
 await page.route('**/*', async route => {
   const url = new URL(route.request().url());
   if(url.pathname === '/') return route.fulfill({contentType:'text/html',body:'<html><head><style>'+css+'</style></head><body></body></html>'});
   if(url.pathname === '/api/drive-files/cache-status') {
     const ids = route.request().postDataJSON().fileIds;
     const absent = ids.filter(id=>!fs.existsSync(path.join(data,'drive-file-cache',id+'.bin')));
     return route.fulfill({json:{missing:absent,cached:ids.length-absent.length}});
   }
   if(url.pathname === '/api/runtime-performance' || url.pathname === '/api/runtime-performance/report') {
     return route.fulfill({json:{mode:'modern',reason:'smoke test',evaluatedAt:new Date().toISOString(),totalMemoryBytes:16*1024**3,freeMemoryBytes:8*1024**3,logicalCpuCount:8}});
   }
   if(url.pathname === '/assets/drive-file') {
     const id=url.searchParams.get('id');
     if(!/^[\w-]+$/.test(id)) return route.abort();
     const file=path.join(data,'drive-file-cache',id+'.bin');
     if(fs.existsSync(file)) return route.fulfill({body:fs.readFileSync(file)});
     missing.add(id); return route.abort();
   }
   if(url.pathname.startsWith('/fonts/')) {
     const file=path.join(root,'public',url.pathname);
     if(fs.existsSync(file)) return route.fulfill({body:fs.readFileSync(file)});
   }
   external++; return route.abort();
 });
 await page.goto('http://localhost:3001/');
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const result=await page.evaluate(async decks=>{
   window.__downloads=[];
   const dataset={decks,source:{destinationId:'dalat'}}, deck=decks[0],list=deck.lists[0];
   const failures=[]; const callbacks={failProgress:m=>failures.push(m)};
   const start=performance.now();
   await Smoke.exportSelectedPagePng({deck,list,selectedPageIndex:0,quality:'optimized',dataset},callbacks);
   await Smoke.exportActiveList({deck,list,quality:'optimized',dataset},callbacks);
   await Smoke.exportBatch({dataset,selectedListIds:new Set(decks.flatMap(d=>d.lists.map(l=>l.id))),quality:'optimized'},callbacks);
   if(failures.length) throw new Error(failures.join('\n'));
   const results=[];
   for(const {blob,name} of window.__downloads){
   if(name.endsWith('.zip')){
       const zip=await Smoke.JSZip.loadAsync(await blob.arrayBuffer());
       const files=Object.values(zip.files).filter(f=>f.name.endsWith('.png'));
       let v6=0;
       for(const file of files){
         if(!/spotlight[\s_-]*v6/i.test(file.name) && files.length!==11)continue;
         const bitmap=await createImageBitmap(new Blob([await file.async('uint8array')],{type:'image/png'}));
         if(bitmap.width!==1080||bitmap.height!==1920)throw new Error('Wrong dimensions '+file.name);
         bitmap.close();v6++;
       }
       results.push({name,bytes:blob.size,pages:files.length,v6Checked:v6});
     }else{
       const bitmap=await createImageBitmap(blob);
       if(bitmap.width!==1080||bitmap.height!==1920)throw new Error('Wrong single-page dimensions');
       bitmap.close();results.push({name,bytes:blob.size,pages:1});
     }
   }
   return {results,elapsedMs:Math.round(performance.now()-start)};
 },decks);
 assert.equal(result.results.length,3,JSON.stringify(result));
 assert.equal(result.results[1].pages,11);
 assert.equal(result.results[2].v6Checked,25);
 assert.equal(external,0,'Unexpected network request');
 assert.equal(missing.size,0,'Missing cached images');
 console.log('PASS cached V6 Green single/list + V6 mixed batch',JSON.stringify(result));
} finally {await browser.close();}
