import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),JSZip=require('jszip'),backendRequire=createRequire(path.resolve('../backend/package.json'));
backendRequire('ts-node').register({project:path.resolve('../backend/tsconfig.json'),transpileOnly:true});
const sharp=backendRequire('sharp'),{getColorEditAsset}=backendRequire(path.resolve('../backend/src/modules/guide/color-edit.ts'));
const decode=text=>text.replace(/&(apos|quot|amp|lt|gt);/g,(_,key)=>({apos:"'",quot:'"',amp:'&',lt:'<',gt:'>'}[key]));
for(const rootArg of process.argv.slice(2)){
 const root=path.resolve(rootArg),fixture=JSON.parse(fs.readFileSync(path.join(root,'generation.json'))),results=JSON.parse(fs.readFileSync(path.join(root,'matrix-results.json')));
 let images=0,books=0,photoBytes=0;
 for(const deck of fixture.decks){
  const row=results.find(row=>row.deckId===deck.id);assert(row);assert.equal(row.archives,1);assert.deepEqual(row.errors,[]);assert.equal(row.result.exportedLists.length,deck.lists.length);assert.deepEqual(row.result.skippedLists,[]);
  const zip=await JSZip.loadAsync(fs.readFileSync(path.join(root,'matrix-zips',deck.id+'.zip')),{checkCRC32:true});
  for(const [i,book]of row.books.entries()){
   const list=deck.lists[i],threads=deck.id.startsWith('threads-');
   const names=[...new Set(list.pages.flatMap(p=>p.items||[]).filter(item=>item.isPartner && !(deck.id==='spotlight-partner'&&['Địa chỉ','Giá tham khảo','Khung giờ'].includes(item.name))).map(item=>threads?item.name:String(item.rawName||item.name).replace(/^[^:]{1,30}:\s*/, '').trim()))].sort((a,b)=>a.localeCompare(b,'vi'));
   const actual=book.names.map(decode).filter(name=>!(deck.id==='spotlight-partner'&&name==='Địa chỉ')).sort((a,b)=>a.localeCompare(b,'vi'));
   assert.deepEqual(actual,names,book.file);books++;
  }
  for(const file of Object.values(zip.files).filter(file=>/\.(png|jpg|webp)$/.test(file.name))){
   const bytes=await file.async('nodebuffer'),info=await sharp(bytes).metadata();assert(info.width>0&&info.height>0);await sharp(bytes).raw().toBuffer();images++;
   if(deck.id.startsWith('threads-')){
    const index=Number(path.basename(file.name).slice(0,2))-1,item=deck.lists[0].pages[0].items.filter(item=>item.imageUrl)[index];
    const id=new URL(item.imageUrl,'http://test.local').searchParams.get('id');
    const original=fs.readFileSync(path.join(root,'data/drive-file-cache',id+'.bin'));
    const expected=await getColorEditAsset(original,path.join(root,'data'),'iphone-color-edit-v1');assert(bytes.equals(expected),'Threads image must exactly match the processed asset: '+file.name);photoBytes++;
   }
  }
 }
 const summary={lists:results.reduce((total,row)=>total+row.result.exportedLists.length,0),books,images,processedThreadsPhotosVerified:photoBytes,errors:[]};
 fs.writeFileSync(path.join(root,'verified-exports.json'),JSON.stringify(summary,null,2));console.log('PASS exports',root,summary);
}
