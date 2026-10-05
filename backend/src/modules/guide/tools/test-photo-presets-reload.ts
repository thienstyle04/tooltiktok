import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
async function main(){
 const root=path.resolve(process.env.AUDIT_ROOT!),source=path.join(root,'data'),data=path.join(root,'migration-reload-'+Date.now());
 fs.mkdirSync(data,{recursive:true});
 for(const name of fs.readdirSync(source))if(fs.statSync(path.join(source,name)).isFile())fs.copyFileSync(path.join(source,name),path.join(data,name));
 const file=path.join(data,'generated-caption-lists.dalat.json'),store=JSON.parse(fs.readFileSync(file,'utf8'));
 const expected:any[]=[];
 for(const deckId of ['spotlight-v5','spotlight-v6']){
  const list=structuredClone(store.decks[deckId].find((l:any)=>l.photoPreset));list.id=deckId+'-color-edit-caption-legacy';
  list.pages[0].title='Hook đã duyệt tuiiiii';list.pages[0].titlePlacement='bottom-center';list.templateVersion=0;
  store.decks[deckId+'-color-edit']=[list];expected.push({deckId,list});
 }
 fs.writeFileSync(file,JSON.stringify(store));
 fs.writeFileSync(path.join(data,'page-text-overrides.dalat.json'),JSON.stringify({version:1,decks:{'spotlight-v5-color-edit':{[expected[0].list.id]:{'0':{title:'Hook chỉnh tay zuiiiii'}}}}}));
 const oldSchedule={version:1,schedules:[{id:'legacy-schedule',enabled:false,templates:[{deckId:'spotlight-v6-color-edit',count:4}]}],runs:[]};
 fs.writeFileSync(path.join(data,'automation-schedules.json'),JSON.stringify(oldSchedule));
 Object.assign(process.env,{DALAT_DATA_DIR:data,DALAT_DRIVE_FILE_CACHE_DIR:path.join(source,'drive-file-cache'),DALAT_AUTO_SYNC_SHEET:'false',DALAT_AUTO_WARM_DRIVE_CACHE:'false'});
 globalThis.fetch=(async()=>{throw Error('Isolated test: external network disabled');})as typeof fetch;
 const {NestFactory}=require('@nestjs/core'),{AppModule}=require('../../../app.module'),{GuideService}=require('../guide.service');
 let snapshot:any;
 for(let restart=0;restart<2;restart++){
  const app=await NestFactory.create(AppModule,{logger:false});
  try{
   await app.listen(0,'127.0.0.1');const service:any=app.get(GuideService);while(service.destinationDataLoading)await new Promise(r=>setTimeout(r,50));
   const dataset=await service.getDataset();
   for(const {deckId,list}of expected){const actual=dataset.decks.find((d:any)=>d.id===deckId).lists.find((l:any)=>l.id===list.id);assert(actual);const want=structuredClone(list);if(deckId==='spotlight-v5'){want.title=want.coverTitle=want.pages[0].title='Hook chỉnh tay zuiiiii';want.pages[0].subtitle=undefined;}assert.deepEqual(actual,want);}
   const stored=JSON.parse(fs.readFileSync(file,'utf8'));assert(!stored.decks['spotlight-v6-color-edit']);for(const {deckId,list}of expected)assert.deepEqual(stored.decks[deckId].find((l:any)=>l.id===list.id),list);
   if(snapshot)assert.deepEqual(stored,snapshot);snapshot=stored;
   const schedules=JSON.parse(fs.readFileSync(path.join(data,'automation-schedules.json'),'utf8'));assert.equal(schedules.schedules[0].templates[0].photoPreset,'iphone-color-edit-v1');
  }finally{await app.close();}
 }
 console.log('PASS real migration/restart twice: legacy IDs, pages, edited hook/placement, original URLs, schedule preset, no duplicates or regeneration.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
