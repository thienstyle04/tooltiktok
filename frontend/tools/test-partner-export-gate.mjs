import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright'), esbuild = require('esbuild');
const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'lib/exportClient.js'), 'utf8');
const bundle = await esbuild.build({stdin:{contents:source+'\nexport { assertPartnerExportReady, assertExportContextPartners, addListMetadataFiles, JSZip };',resolveDir:path.join(root,'lib')},bundle:true,write:false,format:'iife',globalName:'Gate'});
const executablePath = [process.env.PROGRAMFILES+'/Google/Chrome/Application/chrome.exe',process.env['PROGRAMFILES(X86)']+'/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({headless:true,executablePath});
try {
  const page=await browser.newPage(); const requests=[];
  await page.route('**/*',route=>{requests.push(new URL(route.request().url()).pathname);return route.fulfill({json:{ok:true}});});
  await page.goto('http://gate.local/'); requests.length=0;
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const result=await page.evaluate(async()=>{
    const list=(id,partner)=>({id,navTitle:id,title:id,postCaption:'Caption thử',pages:[{type:'cover',title:'Cover'},{type:'list',title:'Bảng',items:[{name:'Quán thử',rawName:'Quán thử',imageUrl:'',isPartner:partner}]}]});
    const good=list('summary-note-caption-01-test',true),bad=list('summary-note-caption-02-test',false);
    const deck={id:'summary-note',lists:[good,bad]},dataset={decks:[deck]};
    const snapshot=JSON.stringify(dataset);
    const names=Gate.assertPartnerExportReady(good,deck.id);
    // A cover-only selected page may pass if its saved list contains partners.
    Gate.assertExportContextPartners({deck,list:good,selectedPageIndex:0});
    Gate.assertExportContextPartners({dataset,selectedListIds:new Set([good.id])},true);
    let badError='';try{Gate.assertPartnerExportReady(bad,deck.id);}catch(e){badError=e.message;}
    const zip=new Gate.JSZip();let metadataError='';
    try{await Gate.addListMetadataFiles(zip,bad,2,deck.id);}catch(e){metadataError=e.message;}
    const emptyFileCount=Object.keys(zip.files).length;
    await Gate.addListMetadataFiles(zip,good,1,deck.id);
    const workbook=await Gate.JSZip.loadAsync(await zip.file('partners-set1.xlsx').async('uint8array'),{checkCRC32:true});
    const xml=await workbook.file('xl/worksheets/sheet1.xml').async('string');
    const statuses=[],blocked=[];
    for(const [method,context] of [[Gate.exportActiveList,{deck,list:bad,dataset}],
      [Gate.exportSelectedPagePng,{deck,list:bad,dataset,selectedPageIndex:0}],
      [Gate.exportBatch,{deck,list:good,dataset,selectedListIds:new Set([good.id,bad.id])}]]){
      blocked.push(await method(context,{failProgress:msg=>statuses.push(msg)}));
    }
    const threads={id:'threads-mix-text-caption-test',postCaption:'Hook',pages:[{type:'list',items:Array.from({length:12},(_,i)=>({name:'Quán '+i,isPartner:i<6,metaPrimary:'Xuân Hương - Đà Lạt',sourceSectionKey:['quan_an','cafe','check_in','choi_dem'][i%4],imageUrl:''}))}]};
    const threadsNames=Gate.assertPartnerExportReady(threads,'threads-mix-text');
    let threadsError='';threads.pages[0].items.forEach(x=>x.isPartner=false);
    try{Gate.assertPartnerExportReady(threads,'threads-mix-text');}catch(e){threadsError=e.message;}
    return {names,badError,metadataError,emptyFileCount,xml,blocked,statuses,threadsNames,threadsError,unchanged:snapshot===JSON.stringify(dataset)};
  });
  assert.deepEqual(result.names,['Quán thử']);
  assert.match(result.badError,/không có đối tác/);
  assert.match(result.metadataError,/không có đối tác/);
  assert.equal(result.emptyFileCount,0);
  assert.match(result.xml,/<t>Quán thử<\/t>/);
  assert.ok(result.blocked.every(r=>r.success===false && r.exportedLists.length===0));
  assert.match(result.statuses[2],/1 list.*Bỏ chọn/);
  assert.equal(result.threadsNames.length,6); assert.match(result.threadsError,/đối tác/);
  assert.equal(result.unchanged,true);
  assert.ok(requests.every(p=>p==='/api/night-sync/export-lease'),'Blocked before health/image/render/download');
  console.log('PASS partner export gate: zero blocked before export (single ZIP, PNG/JPG page, mixed batch), positive XLSX populated, cover uses list partners, unselected invalid list ignored, Threads quota retained, snapshots unchanged.');
} finally {await browser.close();}
