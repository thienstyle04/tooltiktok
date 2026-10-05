import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

async function main(){
 const original=path.resolve(__dirname,'../../../../data');
 const source=path.resolve(original,'../../outputs/color-new-sheet-1791169927416/data');
 const root=path.resolve(original,'../../outputs',`photo-presets-${Date.now()}`),data=path.join(root,'data');
 fs.mkdirSync(data,{recursive:true});
 const hash=(file:string)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const before=new Map(fs.readdirSync(original).filter(name=>fs.statSync(path.join(original,name)).isFile()).map(name=>[path.join(original,name),hash(path.join(original,name))]));
 for(const name of fs.readdirSync(source))if(/^(workbook-cache|sheet-drive-images|.*hooks|hook-sources)/.test(name)&&fs.statSync(path.join(source,name)).isFile())fs.copyFileSync(path.join(source,name),path.join(data,name));
 fs.symlinkSync(path.join(source,'drive-file-cache'),path.join(data,'drive-file-cache'),'junction');
 Object.assign(process.env,{DALAT_DATA_DIR:data,DALAT_DRIVE_FILE_CACHE_DIR:path.join(data,'drive-file-cache'),DALAT_AUTO_SYNC_SHEET:'false',DALAT_AUTO_WARM_DRIVE_CACHE:'false',DALAT_SESSION_ID:'preset-audit'});
 globalThis.fetch=(async()=>{throw Error('Audit external network disabled');})as typeof fetch;
 const {NestFactory}=require('@nestjs/core'),{AppModule}=require('../../../app.module'),{GuideService}=require('../guide.service');
 const app=await NestFactory.create(AppModule,{logger:false});
 const results:any[]=[],decks:any[]=[];
 try{
  await app.listen(0,'127.0.0.1');const service:any=app.get(GuideService);
  while(service.destinationDataLoading)await new Promise(r=>setTimeout(r,50));
  const initial=await service.getDataset();
  assert(!initial.decks.some((d:any)=>d.id.includes('color-edit')),'Standalone color templates must disappear');
  for(const deckId of ['spotlight-v5','spotlight-v6']){
   const refs:string[]=[];
   for(const preset of [null,'iphone-color-edit-v1']){
    for(let index=0;index<4;index++){
     const created=await service.generateDeckFromCaption({deckId,photoPreset:preset,caption:{coverTitle:'Đà Lạt thử',headline:'Đà Lạt',body:'Kiểm thử',hashtags:[]},hookSelection:{mode:'normal'}});
     refs.push(created.listId);
    }
   }
   const dataset=await service.getDataset(),deck=dataset.decks.find((d:any)=>d.id===deckId);
   const lists=deck.lists.filter((l:any)=>refs.includes(l.id));assert.equal(lists.length,8);
   lists.forEach((list:any,i:number)=>{assert.equal(list.photoPreset,i<4?undefined:'iphone-color-edit-v1');assert(list.pages.every((p:any)=>p.photoPreset===list.photoPreset));assert.equal(list.pages.length,deckId==='spotlight-v5'?15:14);assert.equal(list.pages.flatMap((p:any)=>p.items||[]).filter((item:any)=>item.isPartner).length,deckId==='spotlight-v5'?7:4);assert(list.pages.every((p:any)=>!p.backgroundImage.includes('/color-edit')));});
   decks.push({...deck,lists});results.push({deckId,lists:lists.map((l:any)=>({id:l.id,pages:l.pages.length,preset:l.photoPreset||null})),errors:[]});
   fs.writeFileSync(path.join(root,'generation.json'),JSON.stringify({root,source:initial.source,decks,results},null,2));
  }
  // Persist/reload snapshot assertion without changing any production data.
  const saved=JSON.parse(fs.readFileSync(path.join(data,'generated-caption-lists.dalat.json'),'utf8'));
  for(const deck of decks)for(const list of deck.lists){
   const stored=saved.decks[deck.id].find((l:any)=>l.id===list.id);
   assert.equal(stored.photoPreset,list.photoPreset);
   if(list.photoPreset)assert.deepEqual(stored,list);
  }
  const batch=await service.generateBatchLists({deckId:'spotlight-v5',count:2,photoPreset:'iphone-color-edit-v1',requestId:'palette-batch',hookSelection:{mode:'normal'}});
  assert.equal(batch.successCount,2);
  const partner=await service.generatePartnerSpotlight({partnerId:(await service.getPartnerList())[0].id,photoPreset:'iphone-color-edit-v1'});
  const latest=await service.getDataset();assert.equal(latest.decks.find((d:any)=>d.id===partner.deckId).lists.find((l:any)=>l.id===partner.listId).photoPreset,'iphone-color-edit-v1');
  console.log('PASS 16 V5/V6 lists (4 original + 4 Color Edit each), batch and partner generation, persisted URLs/snapshots.');
 }finally{await app.close();const changed=[...before].filter(([file,value])=>hash(file)!==value).map(([file])=>file);fs.writeFileSync(path.join(root,'original-integrity.json'),JSON.stringify({changed}));assert.equal(changed.length,0);}
 console.log('AUDIT_ROOT='+root);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
