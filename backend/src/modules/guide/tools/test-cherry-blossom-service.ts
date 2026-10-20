import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GuideService } from '../guide.service';
import { AutomationSchedulerService } from '../automation-scheduler.service';
import { CHERRY_ID, cherryDeck } from '../logic/spotlight-cherry-blossom';
import type { GuideItem, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';

async function main() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'dalat-cherry-service-'));
  const oldFetch=global.fetch;global.fetch=(async()=>{throw Error('No network permitted');}) as typeof fetch;
  const image=(id:string)=>'/assets/test-cherry-'+Buffer.from(id).toString('base64url')+'.png';
  const venue=(name:string,sectionKey:string)=>({name,id:name,imageMappingKey:sectionKey+name,sectionKey,sectionTitle:sectionKey,address:'12 Đường thử',streetAddress:'12 Đường thử',isPartner:true,
    imageSource:'manual',imageUrl:image(name+'0'),diaryDescriptionRaw:'Mô tả thật từ fixture',diaryImageUrls:Array.from({length:8},(_,i)=>image(name+i)),themedImageUrls:{'cherry-blossom':Array.from({length:8},(_,i)=>image(name+'hoa'+i))}} as GuideItem);
  const items={cafe:[venue('1/2 Circle Coffee','cafe'),venue("D'Lart Garden",'cafe'),venue('Cà phê 3','cafe'),venue('Cà phê 4','cafe')],quan_an:Array.from({length:5},(_,i)=>venue('Quán ăn '+i,'quan_an'))} as WorkbookItemsBySection;
  const pools={default:[],green:[],dark:[],random:[],'cherry-blossom':Array.from({length:12},(_,i)=>image('cover'+i)),'cherry-blossom-random':Array.from({length:20},(_,i)=>image('scene'+i))};
  const hooks=Array.from({length:12},(_,i)=>'Hook Doc '+i), deck=cherryDeck(items,pools,hooks);
  const context={itemsBySection:items,hinhNenImagePools:pools,decks:[deck],imageUrls:[],coverImageUrls:[],imageLibraryEntries:[]};
  const attach=()=>{
    const s:any=new GuideService();Object.defineProperty(s,'dataRoot',{value:root});s.activeDestinationId='dalat-test';
    s.prepareWorkbookForDataset=async()=>undefined;s.assertDriveCacheReady=()=>undefined;
    s.ensureWorkbookDerivedContext=()=>({baseDecks:[deck],coverImageUrls:[],itemsBySection:items});
    s.buildLocallyVerifiedGenerationContext=async()=>structuredClone(context);s.assertGeneratedImageCache=async()=>undefined;
    s.loadSheetDriveManifest=()=>({generatedAt:'fixture-revision',hookSourceGroups:{'cherry-blossom':'https://docs.google.com/document/d/fixture/edit'}});
    s.hooksForSource=()=>({cherry:{ensureReady:async()=>undefined,getCachedHooks:()=>hooks,getSourceIdentity:()=>({sourceId:'fixture',sourceRevision:'fixture-revision'})}});
    return s;
  };
  try {
    const service=attach();
    const saved=service.updatePageText(CHERRY_ID,CHERRY_ID+'-main',0,{title:'Hook mẹ đã sửa, không được chép vào con',textFontSize:45,titlePlacement:'bottom-center'});assert.equal(saved.textFontSize,45);
    const batch=await service.enqueueGeneration(()=>service.generateBatchLists({deckId:CHERRY_ID,count:4}));assert.equal(batch.successCount,4);assert.equal(batch.failCount,0);
    const first=service.generatedListsByDeckId.get(CHERRY_ID)[0];assert.equal(first.pages[0].textFontSize,45);assert.ok(hooks.includes(first.title));assert.notEqual(first.title,saved.title,'mother hook must not overwrite rotating Doc hook');
    const hidden=structuredClone(first);
    const food=hidden.pages.find((page:any)=>page.items?.[0]?.sourceSectionKey==='quan_an');food.items[0].name='Tên khác, không phải đối tác gốc';
    assert.equal(service.renderedPartnerNames(hidden).length,6,'metadata and img alt must not stand in for an actually displayed partner name');
    const disk=fs.readFileSync(path.join(root,'generated-caption-lists.dalat-test.json'));
    const snapshot=JSON.stringify({lists:[...service.generatedListsByDeckId],history:service.partnerRotation});
    const original=service.persistGeneratedLists.bind(service);service.persistGeneratedLists=()=>{throw Error('simulated disk full');};
    await assert.rejects(service.generateDeckFromCaption({deckId:CHERRY_ID}),/chưa bị tiêu hao/);
    assert.equal(JSON.stringify({lists:[...service.generatedListsByDeckId],history:service.partnerRotation}),snapshot);assert.ok(disk.equals(fs.readFileSync(path.join(root,'generated-caption-lists.dalat-test.json'))));
    service.persistGeneratedLists=original;
    const reload=attach();reload.ensureGeneratedListsLoaded();assert.deepEqual(reload.partnerRotation,service.partnerRotation);assert.deepEqual(reload.generatedListsByDeckId.get(CHERRY_ID),service.generatedListsByDeckId.get(CHERRY_ID));
    const scheduler:any=Object.create(AutomationSchedulerService.prototype);
    Object.assign(scheduler,{manualExportUntil:0,waitForExistingSync:async()=>{},assertOutputDirectory:()=>{},findBrowser:()=>({}),assertHookSelectionReady:()=>{},assertFrontendReady:async()=>{},waitForDriveCache:async()=>{},touch:()=>{},closeBrowser:async()=>{},persist:()=>{},launchRenderer:async(run:any)=>{run.status='completed';},guideService:reload});
    reload.getDestinations=()=>({active:{id:'dalat-test'}});
    const run:any={id:'cherry-test',templates:[{deckId:CHERRY_ID,count:4,photoPreset:'iphone-color-edit-v1'}],destinationId:'dalat-test',hook:{mode:'normal'},outputDir:'mock-no-write',generated:[],listIds:[],errors:[],status:'queued'};
    await scheduler.executeWithAi(run);assert.equal(run.status,'completed');assert.equal(run.listIds.length,4);assert.equal(run.errors.length,0);
    assert.ok(reload.generatedListsByDeckId.get(CHERRY_ID).slice(-4).every((list:any)=>list.photoPreset==='iphone-color-edit-v1'));
    const before=JSON.stringify(reload.partnerRotation);reload.generatedListsByDeckId.set(CHERRY_ID,[]);reload.persistGeneratedLists();assert.equal(JSON.stringify(attach().partnerRotation),'{}');
    const afterDelete=attach();afterDelete.ensureGeneratedListsLoaded();assert.equal(JSON.stringify(afterDelete.partnerRotation),before,'deleting snapshots must retain cycles');
    for(const source of ['dalat','greenland','dalat-threads']){const bad=attach();bad.activeDestinationId=source;await assert.rejects(bad.generateDeckFromCaption({deckId:CHERRY_ID}),/Đà Lạt Test/);await assert.rejects(bad.generateBatchLists({deckId:CHERRY_ID,count:1}),/Đà Lạt Test/);}
    console.log('PASS cherry real service: mother45 save/reload, batch4, atomic write failure rollback, schedule4 Color Edit, source API guards, deletion retains history; no network/user writes.');
  }finally{global.fetch=oldFetch;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
