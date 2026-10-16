import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { parseListSetIndex, formatListSetLabel, sanitizeFilePart } from '../lib/utils.js';
const require=createRequire(import.meta.url);
const {declarationSource}=require('./exportClientTestHelper.cjs');

assert.equal(parseListSetIndex({id:'local-fixture-caption-38050d4e-ed71-4fe6-b6b4-535d127817fc',navTitle:'Mẫu 01 · fixture'}),1);
assert.equal(parseListSetIndex({id:'local-fixture-caption-12345678-1234-4def-8123-123456789abc',navTitle:'Mẫu 07 · fixture'}),7);
assert.equal(parseListSetIndex({id:'local-fixture-caption-12345678-1234-4def-8123-123456789abc',navTitle:'Không đánh số'}),1);
assert.equal(parseListSetIndex({id:'fixture-caption-03-a1b2c3',navTitle:'AI 09'}),3);
assert.equal(parseListSetIndex({id:'fixture-caption-04',navTitle:'AI 09'}),4);
assert.equal(parseListSetIndex({id:'fixture-caption-928f53a4-5700-47e2-a4ce-1b0638dbd662',navTitle:'AI 06'}),6);
assert.equal(parseListSetIndex({id:'fixture-main',navTitle:'List chính'}),1);
assert.equal(parseListSetIndex({id:'fixture-caption-19xyz',navTitle:'Mẫu 08'}),8);
assert.equal(parseListSetIndex({id:'fixture-caption-abcdef00-1234-4def-8123-123456789abc',navTitle:'Mẫu 12 · fixture'}),12);
// Use the real folder/order functions, with synthetic lists and ZIP only.
const scope=vm.createContext({parseListSetIndex,formatListSetLabel,sanitizeFilePart});
for(const name of ['deckOrderIndex','orderListsForBatchExport','deckShortName','batchFolderName','uniqueBatchFolderNames'])vm.runInContext(declarationSource(name),scope);
const deck={id:'local-fixture'},dataset={decks:[deck]},entries=[5,1,2].map(n=>({deck,list:{id:`local-fixture-caption-12345678-1234-4def-8123-123456789ab${n}`,navTitle:`Mẫu 0${n} · fixture`}}));
const ordered=scope.orderListsForBatchExport(entries,dataset),names=scope.uniqueBatchFolderNames(ordered,dataset);
assert.deepEqual(Array.from(ordered,entry=>parseListSetIndex(entry.list)),[1,2,5]);
assert.deepEqual(Array.from(names),['set1 01 local-fixture','set2 01 local-fixture','set5 01 local-fixture']);
const JSZip=require('jszip'),zip=new JSZip();for(const [i,name] of names.entries())zip.folder(name).file('fixture.txt',ordered[i].list.navTitle);
const opened=await JSZip.loadAsync(await zip.generateAsync({type:'nodebuffer'}),{checkCRC32:true});
for(const [i,name] of names.entries())assert.equal(await opened.file(name+'/fixture.txt').async('string'),ordered[i].list.navTitle);
console.log('PASS UUIDs never become set numbers; legacy caption/AI labels, real batch order/folders and ZIP CRC remain compatible.');
