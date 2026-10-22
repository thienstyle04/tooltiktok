import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

async function main(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'note01-')),data=path.join(root,'data');fs.mkdirSync(data);
  Object.assign(process.env,{DALAT_DATA_DIR:data,DALAT_AUTO_SYNC_SHEET:'false',DALAT_AUTO_WARM_DRIVE_CACHE:'false'});
  require('../../../../../scripts/test-support/source-links-fixture.cjs').seedSourceLinks(data);
  const {GuideService}=require('../guide.service');
  const {NOTE_DARK_ID:id,buildNoteDarkPages,assertNoteDarkPages,noteDarkCaptions,pickNoteCaption}=require('../logic/threads-note-dark-list');
  const {DESTINATIONS,isDeckAllowedForSource}=require('../sync/destination-config');
  const {buildPageTextOverride,applyPageTextOverrides}=require('../page-text-overrides');
  const items:any={};
  for(const section of ['cafe','check_in','quan_an'])items[section]=Array.from({length:12},(_,i)=>({id:section+'-'+i,sectionKey:section,name:`${section==='cafe'?'Cà phê':section==='quan_an'?'Quán ăn':'Đi chơi'} ${i+1}`,isPartner:i<3,imageUrl:'',address:'',streetAddress:'',metaPrimary:'',candidateImageUrls:[]}));
  items.quan_an.push({...items.cafe[0],id:'shared-quan-an',sectionKey:'quan_an'});
  const initial=buildNoteDarkPages(items,'initial');assertNoteDarkPages(initial);
  const forced=buildNoteDarkPages(items,'forced',[],[items.cafe[2].name,items.quan_an[2].name]);assert.ok(forced[0].items.some((i:any)=>i.name===items.cafe[2].name));assert.ok(forced[0].items.some((i:any)=>i.name===items.quan_an[2].name));
  const onlyCafe=structuredClone(items);onlyCafe.quan_an=onlyCafe.quan_an.filter((i:any)=>i.id!=='shared-quan-an');
  assert.throws(()=>buildNoteDarkPages(onlyCafe,'three-cafe',[],items.cafe.slice(0,3).map((i:any)=>i.name)),/đối tác bắt buộc/);
  assertNoteDarkPages(buildNoteDarkPages(items,'three-with-valid-cross-category',[],items.cafe.slice(0,3).map((i:any)=>i.name)));
  const mainList={id:id+'-main',navTitle:'List chính',title:'Đà Lạt lưu lại nè',description:'',pages:initial};
  const deck:any={id,navTitle:'Note 01 · Đen tối giản',title:'Note 01',description:'',lists:[mainList]};
  const store:any={version:1,savedAt:'',decks:{}};
  const context={itemsBySection:items,decks:[deck],imageUrls:[],coverImageUrls:[],imageLibraryEntries:[],hinhNenImagePools:{default:[],dark:[],green:[],random:[]}};
  const attach=(service:any)=>{service.activeDestinationId='dalat-threads';service.resetDestinationScopedState();service.assertDriveCacheReady=()=>{throw Error('Must not require Drive');};service.prepareWorkbookForDataset=async()=>{};service.buildLocallyVerifiedGenerationContext=async(verify:boolean)=>{assert.equal(verify,false);return structuredClone(context);};service.loadPageTextOverrides=()=>store;return service;};
  const service=attach(new GuideService()),lists:any[]=[];
  try{
    assert.ok(isDeckAllowedForSource('dalat-threads',id));
    DESTINATIONS['wrong-thread']={...DESTINATIONS['dalat-threads'],id:'wrong-thread',label:'Đà Lạt',contentDestinationId:'greenland'};
    for(const source of ['dalat','dalat-test','greenland','wrong-thread'])assert.equal(isDeckAllowedForSource(source,id),false);
    const captions=noteDarkCaptions();assert.equal(captions.length,30);assert.equal(new Set(captions).size,30);
    for(let i=0;i<61;i++){
      const response=await service.generateDeckFromCaption({deckId:id,caption:{}}),list=service.generatedListsByDeckId.get(id).find((l:any)=>l.id===response.listId);
      assertNoteDarkPages(list.pages);assert.ok(captions.includes(list.postCaption));assert.equal(list.pages[0].title,'Đà Lạt lưu lại nè');assert.equal(list.templateVersion,1);assert.equal(list.canvasPreset,'tiktok-9x16');
      for(let g=0;g<3;g++)assert.equal(list.pages[0].items.slice(g*6,g*6+6).filter((x:any)=>x.isPartner).length,2);
      assert.notEqual(list.postCaption,lists[lists.length-1]?.postCaption);lists.push(list);
      // Lịch sử xoay đối tác được ghi như mọi mẫu (trước đây Note 01 bỏ qua, partnerRotation luôn rỗng).
      assert.ok(Array.isArray(list.warnings));assert.ok(Object.keys(service.partnerRotation[id]||{}).length>0,'Note 01 phải ghi lịch sử xoay đối tác');
      if((i+1)%30===0)assert.equal(new Set(lists.slice(-30).map(l=>l.postCaption)).size,30);
    }
    assert.ok(new Set(lists.slice(0,4).map(l=>l.pages[0].items.map((i:any)=>i.id).join('|'))).size>1,'Locations/order rotate');
    const reloaded=attach(new GuideService());reloaded.ensureGeneratedListsLoaded();assert.deepEqual(reloaded.generatedListsByDeckId.get(id),lists);assert.deepEqual(reloaded.partnerRotation[id],service.partnerRotation[id]);
    const before=JSON.stringify(service.generatedListsByDeckId.get(id)),persist=service.persistGeneratedLists;
    const rotationBefore=JSON.stringify(service.partnerRotation[id]);
    service.persistGeneratedLists=()=>{throw Error('isolated disk failure');};await assert.rejects(service.generateDeckFromCaption({deckId:id,caption:{}}),/disk failure/);assert.equal(JSON.stringify(service.generatedListsByDeckId.get(id)),before);assert.equal(JSON.stringify(service.partnerRotation[id]),rotationBefore,'Rollback giữ lịch sử xoay');service.persistGeneratedLists=persist;
    assert.equal(pickNoteCaption(lists.map(l=>l.postCaption),'retry'),pickNoteCaption(service.generatedListsByDeckId.get(id).map((l:any)=>l.postCaption),'retry'));
    store.decks[id]={[mainList.id]:{'0':buildPageTextOverride(id,initial[0],{title:'Đà Lạt để dành nè',textFontSize:40,titlePlacement:'mid-left'},undefined,[])}};
    deck.lists=applyPageTextOverrides(id,[mainList],store);
    const styled=await service.generateDeckFromCaption({deckId:id,caption:{}}),styledList=service.generatedListsByDeckId.get(id).find((l:any)=>l.id===styled.listId);
    assert.equal(styledList.pages[0].textFontSize,40);assert.equal(styledList.pages[0].titlePlacement,'mid-left');assert.equal(styledList.pages[0].title,'Đà Lạt để dành nè');
    const noPartner=structuredClone(items);Object.values(noPartner).forEach((rows:any)=>rows.forEach((i:any)=>i.isPartner=false));
    const zeroPages=buildNoteDarkPages(noPartner,'zero');assertNoteDarkPages(zeroPages);assert.equal(zeroPages[0].items.filter((i:any)=>i.isPartner).length,0);
    context.itemsBySection=noPartner;
    const zeroResponse=await service.generateDeckFromCaption({deckId:id,caption:{}}),zeroSaved=service.generatedListsByDeckId.get(id).find((l:any)=>l.id===zeroResponse.listId);
    assert.equal(zeroSaved.pages[0].items.filter((i:any)=>i.isPartner).length,0);context.itemsBySection=items;
    assert.throws(()=>buildPageTextOverride(id,initial[0],{title:'x'.repeat(100)},undefined,[]),/không tự cắt chữ/);
    const zero={...lists[0],id:id+'-caption-99-zero',navTitle:'Mẫu 99',pages:zeroPages,postCaption:pickNoteCaption([],'zero')};
    for(const count of [0,1,2]){const partial=structuredClone(items);Object.values(partial).forEach((rows:any)=>rows.forEach((item:any,i:number)=>item.isPartner=i<count));const p=buildNoteDarkPages(partial,'partial'+count);for(let g=0;g<3;g++)assert.ok(p[0].items.slice(g*6,g*6+6).filter((i:any)=>i.isPartner).length<=2);}
    const missing=structuredClone(items);missing.cafe=missing.cafe.slice(0,5);assert.throws(()=>buildNoteDarkPages(missing,'missing'),/Cà phê/);
    const tooMany=structuredClone(items);tooMany.cafe.forEach((i:any,n:number)=>i.isPartner=n<10);assert.throws(()=>buildNoteDarkPages(tooMany,'regular-short'),/địa điểm thường/);
    const bad=structuredClone(initial);bad[0].items[6].name=bad[0].items[0].name;assert.throws(()=>assertNoteDarkPages(bad),/trùng/);
    const capacity=await service.checkTemplatesCapacity([{deckId:id,count:4}]);assert.equal(capacity[0].possible,4);assert.equal(JSON.stringify(service.generatedListsByDeckId.get(id)),JSON.stringify([...lists,styledList,zeroSaved]));
    const {AutomationSchedulerService}=require('../automation-scheduler.service'),scheduler=new AutomationSchedulerService(service);
    const schedule=scheduler.create({name:'Note01 isolated',destinationId:'dalat-threads',frequency:'daily',dailyTime:'23:30',enabled:false,outputDir:root,format:'jpg',hook:{mode:'normal'},templates:[{deckId:id,count:3}]});assert.ok(schedule.schedules.some((s:any)=>s.templates.some((t:any)=>t.deckId===id)));
    service.getDriveCacheWarmStatus=()=>{throw Error('Must not warm images');};await scheduler.waitForDriveCache({templates:[{deckId:id}]});
    service.activeDestinationId='dalat';await assert.rejects(service.generateDeckFromCaption({deckId:id,caption:{}}),/Threads.*Đà Lạt/);
    fs.writeFileSync(path.join(root,'fixture.json'),JSON.stringify({lists:[...lists.slice(0,4),zero,styledList],report:'61 successful lists; 2 full caption cycles + 1; synthetic/no images/no addresses',root}));
    console.log('PASS Note01: selection, zero partners, source guards, 61 captions, typography, rollback, reload, capacity and scheduler without Drive.');console.log('NOTE01_FIXTURE='+path.join(root,'fixture.json'));
  }finally{await service.onModuleDestroy?.();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
