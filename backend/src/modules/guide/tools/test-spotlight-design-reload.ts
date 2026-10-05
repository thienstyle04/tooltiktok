import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../app.module';
import { GuideService } from '../guide.service';
import { coverSourceId } from '../logic/spotlight-design';

async function main() {
  const root = path.resolve(process.env.AUDIT_ROOT!);
  assert.ok(root.includes('outputs') && fs.existsSync(path.join(root, 'generation.json')));
  const sourceData = path.join(root, 'data'), data = path.join(root, `reload-data-${Date.now()}`);
  fs.mkdirSync(data, {recursive:true});
  for (const name of fs.readdirSync(sourceData)) if (fs.statSync(path.join(sourceData,name)).isFile()) fs.copyFileSync(path.join(sourceData,name),path.join(data,name));
  const fixture=JSON.parse(fs.readFileSync(path.join(root,'generation.json'),'utf8'));
  const file=path.join(data,'generated-caption-lists.dalat.json');
  const store=JSON.parse(fs.readFileSync(file,'utf8'));
  const oldLists:any[]=[];
  for (const deck of fixture.decks) {
    for(const list of deck.lists) assert.deepEqual(store.decks[deck.id].find((saved:any)=>saved.id===list.id).pages,list.pages,'Rendered list differs from persisted snapshot');
    const old=JSON.parse(JSON.stringify(deck.lists[0]));
    old.id += '-legacy'; old.templateVersion--;
    delete old.spotlightDesignRevision; delete old.coverReview;
    for(const page of old.pages) delete page.spotlightDesignRevision;
    store.decks[deck.id].push(old); oldLists.push({deckId:deck.id,list:old});
  }
  fs.writeFileSync(file,JSON.stringify(store));
  Object.assign(process.env,{DALAT_DATA_DIR:data,DALAT_DRIVE_FILE_CACHE_DIR:path.join(sourceData,'drive-file-cache'),DALAT_AUTO_SYNC_SHEET:'false',DALAT_AUTO_WARM_DRIVE_CACHE:'false'});
  globalThis.fetch=(async()=>{throw Error('Audit: network disabled');}) as typeof fetch;
  const start=async()=>{
    const app=await NestFactory.create(AppModule,{logger:false});
    await app.listen(0,'127.0.0.1');
    const service:any=app.get(GuideService);
    while(service.destinationDataLoading) await new Promise(r=>setTimeout(r,50));
    if(service.destinationDataError) throw Error(service.destinationDataError);
    return {app,service};
  };
  let runtime=await start();
  const pick=(dataset:any,deckId:string,id:string)=>dataset.decks.find((d:any)=>d.id===deckId).lists.find((l:any)=>l.id===id);
  const before=await runtime.service.getDataset();
  const services=Object.values(runtime.service.ensureWorkbookDerivedContext().itemsBySection).flat() as any[];
  const suspicious=services.filter(item=>/dich.?vu|service/i.test(item.sectionKey)&&/tp\.?\s*hcm|\bhcm\b|hồ chí minh|sài gòn|ha noi|hà nội|nha trang|vũng tàu/i.test(item.address||''))
    .map(item=>({name:item.name,address:item.address,section:item.sectionKey}));
  fs.writeFileSync(path.join(root,'service-address-review.json'),JSON.stringify(suspicious,null,2));
  for(const deck of fixture.decks) for(const list of deck.lists) assert.deepEqual(pick(before,deck.id,list.id).pages,list.pages,'Saved pages must not refresh');
  for(const old of oldLists) assert.deepEqual(pick(before,old.deckId,old.list.id).pages,old.list.pages,'Legacy pages must stay unchanged');
  const deck=fixture.decks.find((d:any)=>d.id==='spotlight-v4'), list=deck.lists[0];
  const pool=runtime.service.ensureWorkbookDerivedContext().coverImageUrls;
  const image=pool.find((u:string)=>u!==list.pages[0].backgroundImage);
  assert.ok(image);
  const title='Địa điểm xanh giữa rừng, lưu lại để tham khảo một chuyến đi thật vui với bạn bè và gia đình';
  const approval=JSON.stringify([title,[coverSourceId(image)]]);
  runtime.service.updatePageText(deck.id,list.id,0,{title,coverImages:[image],coverApproval:approval,titlePlacement:'bottom-center'});
  assert.throws(()=>runtime.service.updatePageText(deck.id,list.id,0,{coverImages:['https://example.invalid/not-in-pool.jpg']}));
  const v2=fixture.decks.find((d:any)=>d.id==='spotlight-v2');
  assert.throws(()=>runtime.service.updatePageText(v2.id,v2.lists[0].id,0,{coverImages:[pool[0],pool[0],pool[1],pool[2]]}));
  const edited=await runtime.service.getDataset();
  await runtime.app.close(); runtime=await start();
  try {
    const reloaded=await runtime.service.getDataset();
    for(const deck of fixture.decks) for(const list of deck.lists) assert.deepEqual(pick(reloaded,deck.id,list.id).pages,pick(edited,deck.id,list.id).pages,'Reload snapshot changed');
    const page=pick(reloaded,deck.id,list.id).pages[0];
    assert.equal(page.title,title);assert.equal(page.coverApproval,approval);assert.deepEqual(page.coverImages,[image]);assert.equal(page.titlePlacement,'bottom-center');
    for(const old of oldLists) assert.deepEqual(pick(reloaded,old.deckId,old.list.id).pages,old.list.pages);
    // Exercise the exact batch entry used by the scheduler without creating a
    // real timer or making paid AI/network calls.
    let counter=0;
    runtime.service.fetchDeepSeekChat=async()=>({ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({coverTitle:'Chuyến đi bình yên '+(++counter),headline:'Đi Đà Lạt',body:'Caption thử độc lập',hashtags:[]})}}]})});
    const batches=[];
    for(const deck of fixture.decks){
      const response=await runtime.service.generateBatchLists({deckId:deck.id,count:1,hookSelection:{mode:'normal'},automationRunId:'spotlight-isolated-scheduler-test'});
      assert.equal(response.successCount,1,JSON.stringify(response.errors));
      const generated=pick(await runtime.service.getDataset(),deck.id,response.lists[0].listId);
      assert.equal(generated.spotlightDesignRevision,1);assert.equal(generated.automationRunId,'spotlight-isolated-scheduler-test');
      assert.equal(generated.pages.length,deck.lists[0].pages.length);
      batches.push({deckId:deck.id,listId:generated.id,pages:generated.pages.length});
    }
    fs.writeFileSync(path.join(root,'reload-verification.json'),JSON.stringify({savedLists:20,legacyLists:5,manualImage:true,manualPlacement:true,longHook:true,approval:true,invalidImagesRejected:true,schedulerBatchPipeline:batches},null,2));
    console.log('PASS: 20 saved lists + 5 legacy fixtures, restart, manual cover/image/approval and invalid image rejection.');
  } finally {await runtime.app.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
