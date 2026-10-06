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
  await page.route('**/*',route=>{requests.push(new URL(route.request().url()).pathname);return route.fulfill({json:{ok:true,sessionId:'isolated-partner-gate',mode:'legacy'}});});
  await page.goto('http://gate.local/'); requests.length=0;
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const result=await page.evaluate(async()=>{
    const list=(id,partner)=>({id,navTitle:id,title:id,postCaption:'Caption thử',pages:[{type:'cover',title:'Cover'},{type:'list',title:'Bảng',items:[{name:'Quán thử',rawName:'Quán thử',imageUrl:'',isPartner:partner}]}]});
    const good=list('summary-note-caption-01-test',true),bad=list('summary-note-caption-02-test',false);
    const deck={id:'summary-note',navTitle:'Mẫu ghi chú',lists:[good,bad]},dataset={decks:[deck]};
    const snapshot=JSON.stringify(dataset);
    const names=Gate.assertPartnerExportReady(good,deck.id);
    // A cover-only selected page may pass if its saved list contains partners.
    Gate.assertExportContextPartners({deck,list:good,selectedPageIndex:0});
    const filtered=Gate.assertExportContextPartners({dataset,selectedListIds:new Set([good.id,bad.id])},true);
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
      [Gate.exportBatch,{dataset,selectedListIds:new Set([bad.id])}]]){
      blocked.push(await method(context,{failProgress:msg=>statuses.push(msg)}));
    }
    const threads={id:'threads-mix-text-caption-test',postCaption:'Hook',pages:[{type:'list',items:Array.from({length:12},(_,i)=>({name:'Quán '+i,isPartner:i<6,metaPrimary:'Xuân Hương - Đà Lạt',sourceSectionKey:['quan_an','cafe','check_in','choi_dem'][i%4],imageUrl:''}))}]};
    const threadsNames=Gate.assertPartnerExportReady(threads,'threads-mix-text');
    const threadsGood=structuredClone(threads);threadsGood.id='threads-mix-text-caption-01-test';threadsGood.navTitle='List tổng hợp 01';
    let threadsError='';threads.pages[0].items.forEach(x=>x.isPartner=false);threads.navTitle='List thiếu đối tác';
    try{Gate.assertPartnerExportReady(threads,'threads-mix-text');}catch(e){threadsError=e.message;}
    const threadsGood2=structuredClone(threadsGood);threadsGood2.id='threads-mix-text-caption-02-test';threadsGood2.navTitle='List tổng hợp 02';
    const threadsDeck={id:'threads-mix-text',navTitle:'Threads Tổng hợp chữ',lists:[threadsGood,threadsGood2,threads]};
    const mixedDataset={decks:[deck,threadsDeck]},mixedBefore=JSON.stringify(mixedDataset);
    let archiveFiles=[],report='',xlsxNames=[],outcome;
    const mixed=await Gate.exportBatch({dataset:mixedDataset,selectedListIds:new Set([bad.id,threadsGood.id,threadsGood2.id,threads.id]),quality:'optimized',
      onArchive:async(blob,name,result)=>{
        outcome=result;const archive=await Gate.JSZip.loadAsync(blob,{checkCRC32:true});
        archiveFiles=Object.keys(archive.files).filter(name=>!archive.files[name].dir);
        report=await archive.file('BAO-CAO-LIST-BO-QUA.txt').async('string');
        for(const file of archiveFiles.filter(name=>name.endsWith('.xlsx'))){
          const xlsx=await Gate.JSZip.loadAsync(await archive.file(file).async('uint8array'),{checkCRC32:true});
          xlsxNames.push(await xlsx.file('xl/worksheets/sheet1.xml').async('string'));
        }
      }},{setStatus:msg=>statuses.push(msg)});
    let emptyOutcome;
    const empty=await Gate.exportBatch({dataset:mixedDataset,selectedListIds:new Set([bad.id,threads.id]),onExportOutcome:result=>{emptyOutcome=result;},
      onArchive:()=>{throw new Error('Must not create empty archive');}});
    return {names,badError,metadataError,emptyFileCount,xml,blocked,statuses,threadsNames,threadsError,unchanged:snapshot===JSON.stringify(dataset)&&mixedBefore===JSON.stringify(mixedDataset),
      filtered:{ids:Array.from(filtered.selectedListIds),skipped:filtered._partnerSkippedLists},mixed,archiveFiles,report,xlsxNames,outcome,empty,emptyOutcome};
  });
  assert.deepEqual(result.names,['Quán thử']);
  assert.match(result.badError,/không có đối tác/);
  assert.match(result.metadataError,/không có đối tác/);
  assert.equal(result.emptyFileCount,0);
  assert.match(result.xml,/<t>Quán thử<\/t>/);
  assert.ok(result.blocked.every(r=>r.success===false && r.exportedLists.length===0));
  assert.match(result.statuses[2],/Không có list hợp lệ.*Mẫu ghi chú/);
  assert.equal(result.threadsNames.length,6); assert.match(result.threadsError,/đối tác/);
  assert.equal(result.unchanged,true);
  assert.deepEqual(result.filtered.ids,['summary-note-caption-01-test']);assert.equal(result.filtered.skipped.length,1);
  assert.equal(result.mixed.success,true);assert.equal(result.mixed.exportedLists.length,2);assert.equal(result.mixed.skippedLists.length,2);
  assert.deepEqual(result.outcome,result.mixed);assert.equal(result.xlsxNames.length,2);
  assert.ok(result.xlsxNames.every(xml=>(xml.match(/<c r="[A-Z]+1"/g)||[]).length===6));
  assert.match(result.report,/Mẫu ghi chú.*summary-note-caption-02-test/);
  assert.match(result.report,/Threads Tổng hợp chữ.*List thiếu đối tác/);
  assert.ok(result.archiveFiles.every(name=>!name.includes('summary-note')));
  assert.ok(result.archiveFiles.includes('BAO-CAO-LIST-BO-QUA.json'));
  assert.equal(result.empty.success,false);assert.equal(result.empty.skippedLists.length,2);assert.deepEqual(result.emptyOutcome.exportedLists,[]);
  assert.ok(!requests.some(p=>p.startsWith('/assets/')),'Text-only successful batch needs no image rendering');
  console.log('PASS partial partner export: mixed-template batch saves only two valid lists with populated XLSX; reports both skipped template/list names, single/all-invalid blocked, snapshots unchanged.');
} finally {await browser.close();}
