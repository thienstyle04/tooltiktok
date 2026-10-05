import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

async function main(){
 const original=path.resolve(__dirname,'../../../../data');
 const root=process.env.AUDIT_RESUME_ROOT?path.resolve(process.env.AUDIT_RESUME_ROOT):path.resolve(original,'../../outputs',`color-new-sheet-${Date.now()}`),data=path.join(root,'data'),cache=path.join(data,'drive-file-cache');
 assert.ok(root.startsWith(path.resolve(original,'../../outputs')+path.sep),'Audit root must stay inside outputs');
 fs.mkdirSync(cache,{recursive:true});
 const hash=(file:string)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const before=new Map(fs.readdirSync(original).filter(name=>fs.statSync(path.join(original,name)).isFile()).map(name=>[path.join(original,name),hash(path.join(original,name))]));
 // Hooks only: do not import old workbook, image mappings, manifests or photos.
 for(const name of fs.readdirSync(original)) if(/hooks|hook-sources/.test(name)&&fs.statSync(path.join(original,name)).isFile()) fs.copyFileSync(path.join(original,name),path.join(data,name));
 const sheetId='1QlMXQ1XH-uHS6bBEC7Pps5f1p9rYJ780';
 const sheetUrl=`https://docs.google.com/spreadsheets/d/${sheetId}/edit`,exportUrl=`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
 Object.assign(process.env,{DALAT_DATA_DIR:data,DALAT_DRIVE_FILE_CACHE_DIR:cache,DALAT_FNB_SHEET_URL:sheetUrl,DALAT_FNB_EXPORT_URL:exportUrl,DALAT_AUTO_SYNC_SHEET:'false',DALAT_AUTO_WARM_DRIVE_CACHE:'false',DALAT_SESSION_ID:'new-sheet-color-test'});
 console.log('AUDIT_ROOT='+root);
 const response=process.env.AUDIT_RESUME_ROOT?null:await fetch(exportUrl,{signal:AbortSignal.timeout(35000)});
 assert.ok(!response||response.ok,'Sheet download failed: '+response?.status);
 const bytes=response?Buffer.from(await response.arrayBuffer()):fs.readFileSync(path.join(data,'workbook-cache.dalat.xlsx'));
 const snapshot=path.join(data,'workbook-cache.dalat.xlsx');fs.writeFileSync(snapshot,bytes);
 const {parseWorkbookBuffer}=require('../sync/workbook-source') as typeof import('../sync/workbook-source');
 const {normalizeText,normalizeWorkbookHeaders,firstValue}=require('../logic/image-resolver') as typeof import('../logic/image-resolver');
 const {resolveSectionKeyFromSheetName}=require('../sync/sheet-section') as typeof import('../sync/sheet-section');
 const {buildSheetDriveManifest}=require('../sync/sheet-drive-manifest') as typeof import('../sync/sheet-drive-manifest');
 const {withSyncPermit}=require('../sync/night-sync-policy') as typeof import('../sync/night-sync-policy');
 const {warmDriveFileDiskCache,resolveDriveLinkToEntries}=require('../sync/drive-images') as typeof import('../sync/drive-images');
 const source=parseWorkbookBuffer(bytes,{workbookName:'Đà Lạt Sheet mới — test',destinationId:'dalat',sourceUrl:sheetUrl,sourceType:'google-sheet'});
 // Resolve a bounded representative photo sample, including every partner.
 // The backend still reads the COMPLETE new workbook for names and prices.
 const sample=XLSX.read(bytes,{type:'buffer'}),selected:any[]=[];
 for(const name of sample.SheetNames){
  const sheet=sample.Sheets[name],rows=XLSX.utils.sheet_to_json<any[]>(sheet,{header:1,raw:false,defval:''}),headers=normalizeWorkbookHeaders(rows[0]||[]),section=resolveSectionKeyFromSheetName(name);
  const linkColumn=headers.indexOf('link_drive'),mapColumn=headers.indexOf('anh_gg_maps');
  let ordinary=0,background=0;
  for(let offset=1;offset<rows.length;offset++){
   const row=Object.fromEntries(headers.map((header,col)=>[header,String(rows[offset][col]||'').trim()]));
   const partner=normalizeText(firstValue(row,'doi_tac'))==='x';
   const venue=firstValue(row,'ten_quan','hoat_dong');
   const allowance=['quan_an','cafe','check_in'].includes(section||'')?4:['khu_du_lich','choi_dem','hoat_dong'].includes(section||'')?2:0;
   const isBackground=normalizeText(name)==='hinh_nen';
   const keep=isBackground ? Boolean(rows[offset][linkColumn])&&background++<2 : Boolean(venue)&&(partner||ordinary++<allowance);
   if(keep&&!isBackground)selected.push({sheet:name,row:offset+1,name:venue,partner});
   if(!keep&&linkColumn>=0)delete sheet[XLSX.utils.encode_cell({r:offset,c:linkColumn})];
   if(mapColumn>=0)delete sheet[XLSX.utils.encode_cell({r:offset,c:mapColumn})];
  }
 }
 fs.writeFileSync(path.join(root,'photo-sample.json'),JSON.stringify(selected,null,2));
 const controller=new AbortController();
 const permit={manual:true,signal:controller.signal,waitForIdle:async()=>{}};
 const manifest: import('../sync/sheet-drive-manifest').SheetDriveImageManifest=process.env.AUDIT_RESUME_ROOT?JSON.parse(fs.readFileSync(path.join(data,'sheet-drive-images.dalat.json'),'utf8')):await withSyncPermit(permit,()=>buildSheetDriveManifest({...source,workbook:sample},undefined,{forceRevalidate:true,onProgress:(done,total)=>{if(done===total||done%5===0)console.log(`RESOLVE ${done}/${total}`);}}));
 for(const entry of Object.values(manifest.items)){
  entry.candidateImages=(entry.candidateImages||[]).slice(0,3);
  if(entry.candidateImages.length){entry.fileId=entry.candidateImages[0].fileId;entry.fileName=entry.candidateImages[0].fileName;}
 }
 manifest.coverImages=manifest.coverImages.slice(0,18);
 if(manifest.coverImageGroups)manifest.coverImageGroups.default=manifest.coverImages;
 // V6 / Color Edit needs both labeled pools. Resolve directly from the NEW
 // workbook, never substitute the default pool or copy the installed cache.
 const backgroundSheet=source.workbook.Sheets[source.workbook.SheetNames.find(name=>normalizeText(name)==='hinh_nen')!];
 const backgroundRows=XLSX.utils.sheet_to_json<any[]>(backgroundSheet,{header:1,raw:false,defval:''});
 for(const group of ['dark','random'] as const){
  if((manifest.coverImageGroups?.[group]||[]).length>=6)continue;
  const rowIndex=backgroundRows.findIndex(row=>normalizeText(row[1]).includes(group==='dark'?'tone_den':'random'));
  assert.ok(rowIndex>0,'Missing NEW Sheet background group '+group);
  const cell=backgroundSheet[XLSX.utils.encode_cell({r:rowIndex,c:1})];
  const link=cell?.l?.Target;assert.ok(link,'Missing background hyperlink '+group);
  const photos=await withSyncPermit(permit,()=>resolveDriveLinkToEntries(link!,'hinh nen','',18));
  assert.ok(photos.length>=6,'Insufficient new background photos '+group);
  manifest.coverImageGroups![group]=photos;
  manifest.coverSourceLinkGroups![group]=[link!];
  console.log('NEW BACKGROUNDS '+group+' '+photos.length);
 }
 fs.writeFileSync(path.join(data,'sheet-drive-images.dalat.json'),JSON.stringify(manifest,null,2));
 const ids=[...new Set([...Object.values(manifest.coverImageGroups||{}).flatMap(entries=>entries.map(entry=>entry.fileId)),...manifest.coverImages.map(entry=>entry.fileId),...Object.values(manifest.items).flatMap(entry=>(entry.candidateImages||[]).map(photo=>photo.fileId))])];
 const warmed=await withSyncPermit(permit,()=>warmDriveFileDiskCache(ids,{concurrency:2,onProgress:result=>{if((result.ok+result.fail)%10===0)console.log('WARM '+JSON.stringify(result));}}));
 fs.writeFileSync(path.join(root,'sync-result.json'),JSON.stringify({newSheet:sheetUrl,sourceBytes:bytes.length,sampledVenues:selected.length,resolvedVenues:Object.keys(manifest.items).length,backgrounds:manifest.coverImages.length,warmed},null,2));
 const newIds=new Set(ids);
 globalThis.fetch=(async()=>{throw Error('Generation test: external network disabled');}) as typeof fetch;
 const {NestFactory}=require('@nestjs/core');const {AppModule}=require('../../../app.module');const {GuideService}=require('../guide.service');
 const app=await NestFactory.create(AppModule,{logger:false});
 try{
  await app.listen(0,'127.0.0.1');const service:any=app.get(GuideService);
  while(service.destinationDataLoading)await new Promise(r=>setTimeout(r,100));
  if(service.destinationDataError)throw Error(service.destinationDataError);
  const initial=await service.getDataset(),deckId=process.env.AUDIT_DECK_ID||'spotlight-v6-color-edit',refs:string[]=[],errors:any[]=[];
  const v5=deckId==='spotlight-v5-color-edit';
  for(let i=0;i<4;i++){
   try{const result=await service.generateDeckFromCaption({deckId,caption:{coverTitle:'Thử Sheet mới '+(i+1),headline:'Đà Lạt',body:'List kiểm thử độc lập',hashtags:[]},hookSelection:{mode:'normal'}});refs.push(result.listId);}catch(error:any){errors.push({index:i+1,message:error.message});}
  }
  const dataset=await service.getDataset(),deck=dataset.decks.find((value:any)=>value.id===deckId);
  fs.writeFileSync(path.join(root,'dataset-diagnostics.json'),JSON.stringify({deckIds:dataset.decks.map((d:any)=>d.id),errors,source:dataset.source,eligible:Object.entries(service.ensureWorkbookDerivedContext().itemsBySection).map(([section,items]:any)=>({section,total:items.length,partners:items.filter((i:any)=>i.isPartner).length,mapped:items.filter((i:any)=>i.imageMapped&&i.imageSource==='manual').length}))},null,2));
  assert.ok(deck,'Color Edit deck missing; see dataset-diagnostics.json: '+JSON.stringify(errors));
  const lists=deck.lists.filter((list:any)=>refs.includes(list.id));
  const results=[{deckId,lists:lists.map((list:any)=>({id:list.id,pages:list.pages.length,partners:list.pages.flatMap((page:any)=>page.items||[]).filter((item:any)=>item.isPartner).map((item:any)=>item.rawName||item.name)})),errors}];
  fs.writeFileSync(path.join(root,'generation.json'),JSON.stringify({root,source:initial.source,results,decks:[{...deck,lists}],newSheet:sheetUrl},null,2));
  for(const list of lists){assert.equal(list.pages.length,v5?15:14);assert.equal(list.pages.flatMap((page:any)=>page.items||[]).filter((item:any)=>item.isPartner).length,v5?7:4);
   for(const page of list.pages){const id=String(page.backgroundImage||'').match(/[?&]id=([\w-]+)/)?.[1];assert.ok(id&&newIds.has(id),'Photo not resolved from NEW Sheet: '+page.backgroundImage);}
  }
  console.log('GENERATION '+JSON.stringify(results));
  assert.equal(lists.length,4,'Not all four lists generated');
 }finally{
  await app.close();const changed=[...before].filter(([file,value])=>hash(file)!==value).map(([file])=>file);
  fs.writeFileSync(path.join(root,'original-integrity.json'),JSON.stringify({changed}));assert.equal(changed.length,0,'User source data changed');
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
