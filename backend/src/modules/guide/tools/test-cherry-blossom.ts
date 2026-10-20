import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCherryBlossom, CHERRY_ID, cherryDeck, cherryHistory } from '../logic/spotlight-cherry-blossom';
import { GuideItem, HinhNenImageUrlPools, PartnerRotationHistory, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { getAllowedDeckIds, isDeckAllowedForSource } from '../sync/destination-config';
import { classifyHinhNenImageGroup } from '../sync/sheet-drive-manifest';
import { cherryBlossomChildFolders, configureDriveFileDiskCache } from '../sync/drive-images';
import { partnerIdentity, sourcePhotoId } from '../logic/partner-rotation';
import { normalizeText } from '../logic/image-resolver';
import { inheritPageTypography } from '../logic/inherit-page-typography';
import { buildPageTextOverride, applyPageTextOverrides } from '../page-text-overrides';
import { buildGeneratedListStorePayload, parseGeneratedListStore } from '../generated-list-store';

const image = (id: string) => `/assets/drive-file?id=${id}`;
const venue = (name: string, sectionKey: 'cafe' | 'quan_an', n = 6): GuideItem => ({ name, id: name, sectionKey, sectionTitle: sectionKey,
  imageMappingKey: `${sectionKey}|${name}`, isPartner: true, address: '1 Đường Đà Lạt', streetAddress: '1 Đường Đà Lạt',
  diaryDescriptionRaw: 'Một dòng mô tả từ Sheet', imageSource: 'manual', imageUrl: image(name+'0'),
  diaryImageUrls: Array.from({length:n}, (_,i)=>image(name+i)), candidateImageUrls: Array.from({length:n}, (_,i)=>image(name+i)),
  themedImageUrls: {'cherry-blossom': Array.from({length:n}, (_,i)=>image('hoa'+name+i))} } as GuideItem);
const items = { cafe: [venue('1/2 Circle Coffee','cafe'), venue('D’Lart Garden','cafe'), venue('Cổ Làng Mơ','cafe'), venue('Quán khác','cafe')],
  quan_an: [venue('D’Lart Garden','quan_an'), ...Array.from({length:6}, (_,i)=>venue('Ăn'+i,'quan_an'))] } as WorkbookItemsBySection;
const pools: HinhNenImageUrlPools = { default: [], green: [], dark: [], random: [], 'cherry-blossom': Array.from({length:6},(_,i)=>image('cover'+i)), 'cherry-blossom-random': Array.from({length:16},(_,i)=>image('scene'+i)) };
const hooks = Array.from({length:9},(_,i)=>`Hook nguồn ${i}`);
let history: PartnerRotationHistory = {};
const lists: any[] = [];
for (let n=0;n<12;n++) {
  const before = JSON.stringify(history);
  const result = buildCherryBlossom({items,pools,hooks,history,seed:'test'+n});
  assert.equal(JSON.stringify(history), before, 'builder must not mutate committed history');
  const list = result.list; list.id = `${CHERRY_ID}-caption-${n}`; lists.push(list);
  assert.equal(list.pages.length,16); assert.equal(new Set(list.pages.map(p=>p.backgroundImage)).size,16);
  const venues = [...new Set(list.pages.flatMap(p=>p.type==='list'?p.items.map(i=>i.rawName):[]))];
  assert.equal(venues.length,7); assert.ok(venues.includes('1/2 Circle Coffee')); assert.ok(venues.includes('D’Lart Garden'));
  assert.deepEqual(list.pages.map(p=>p.type==='list' && p.items.length ? p.items[0].sourceSectionKey : '-'), ['-','-','-','cafe','cafe','cafe','cafe','-','cafe','cafe','quan_an','-','-','quan_an','quan_an','quan_an']);
  assert.ok(list.pages.filter(p=>p.type==='list'&&p.items[0]?.sourceSectionKey==='quan_an').every(p=>p.title===''),'Restaurant copy must not contain a description');
  for (const start of [3,5,8]) {
    const a:any=list.pages[start], b:any=list.pages[start+1]; assert.equal(a.items[0].rawName,b.items[0].rawName);
    const source=items.cafe.find(i=>i.name===a.items[0].rawName)!;
    assert.ok((a.imageRole==='venue-cherry-blossom'?source.themedImageUrls!['cherry-blossom']:source.diaryImageUrls)!.includes(a.backgroundImage));
    assert.ok(source.diaryImageUrls!.includes(b.backgroundImage));
  }
  for (const [key,state] of Object.entries(result.history).filter(([key])=>key.startsWith('venue|'))) {
    if (history[key] && venues.some(name=>`venue|${normalizeText(String(name))}`===key)) { assert.notEqual(state.position,history[key].position); assert.ok(!state.lastPhotos.some(id=>history[key].lastPhotos.includes(id))); }
  }
  history=result.history;
}
assert.ok(history[partnerIdentity(items.cafe[0])].photoPools!['venue-cherry-blossom'].cycle>=2);
assert.equal(new Set(lists.slice(0,9).map(l=>l.title)).size,9,'use all hooks before repeating');
const noFoodDescriptions=structuredClone(items);
noFoodDescriptions.quan_an.forEach(item=>{item.diaryDescriptionRaw='';});
assert.equal(buildCherryBlossom({items:noFoodDescriptions,pools,hooks,history:{},seed:'no-food-description'}).list.pages.length,16,'Restaurants without Mo_ta remain eligible when name/address/photos are valid');
assert.throws(()=>buildCherryBlossom({items,pools,hooks:[],history:{},seed:'x'}),/Hook/);
assert.throws(()=>buildCherryBlossom({items:{...items,quan_an:items.quan_an.slice(0,4)},pools,hooks,history:{},seed:'x'}),/3\/4/);
assert.throws(()=>buildCherryBlossom({items,pools:{...pools,'cherry-blossom-random':[image('one')]},hooks,history:{},seed:'x'}),/random/);
const one = {...items,cafe:items.cafe.map(i=>({...i,themedImageUrls:{'cherry-blossom':[image(i.name+'one')]}}))};
const first=buildCherryBlossom({items:one,pools,hooks,history:{},seed:'x'});
assert.throws(()=>buildCherryBlossom({items:one,pools,hooks,history:first.history,seed:'y'}),/ảnh/);
const mother=cherryDeck(items,pools,hooks);
const override=buildPageTextOverride(CHERRY_ID,mother.lists[0].pages[0],{textFontSize:45,titlePlacement:'bottom-center'},undefined,[]);
const store:any={version:1,savedAt:'',decks:{[CHERRY_ID]:{[mother.lists[0].id]:{'0':override}}}};
const inherited=inheritPageTypography(mother,lists[0].pages,store);
assert.equal(inherited[0].textFontSize,45); assert.equal(inherited[0].title,lists[0].pages[0].title,'hook does not inherit');
assert.equal(applyPageTextOverrides(CHERRY_ID,mother.lists,store)[0].pages[0].titlePlacement,'bottom-center');
const payload=buildGeneratedListStorePayload({lists:new Map([[CHERRY_ID,lists]]),partnerRotation:{[CHERRY_ID]:history},diaryUsedLines:{}},'test');
const reopened=parseGeneratedListStore(JSON.stringify(payload)); assert.deepEqual(reopened.partnerRotation[CHERRY_ID],history);
assert.deepEqual(cherryHistory(lists,items,history),history,'delete/reload does not reset persisted history');
assert.equal(sourcePhotoId('/assets/color-edit?preset=x&source='+encodeURIComponent(image('abc'))),sourcePhotoId(image('abc')));
assert.ok(getAllowedDeckIds('dalat-test').includes(CHERRY_ID));
for(const source of ['dalat','greenland','dalat-threads','missing']) assert.equal(isDeckAllowedForSource(source,CHERRY_ID),false);
assert.equal(classifyHinhNenImageGroup('Ảnh hoa đào random'),'cherry-blossom-random'); assert.equal(classifyHinhNenImageGroup('Ảnh hoa đào'),'cherry-blossom');
const duplicateCache=fs.mkdtempSync(path.join(os.tmpdir(),'cherry-duplicate-'));
const identical=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBbUAAAAASUVORK5CYII=','base64');
const reuploads=Array.from({length:5},(_,i)=>'cherry-duplicate-'+i);
for(const id of reuploads){fs.writeFileSync(path.join(duplicateCache,id+'.bin'),identical);fs.writeFileSync(path.join(duplicateCache,id+'.json'),JSON.stringify({contentType:'image/png',contentLength:identical.length}));}
configureDriveFileDiskCache(duplicateCache);
assert.throws(()=>buildCherryBlossom({items,pools:{...pools,'cherry-blossom-random':reuploads.map(image)},hooks,history:{},seed:'duplicate-uploads'}),/5 ảnh cảnh/,'different Drive IDs for identical content cannot make five scenery photographs');
configureDriveFileDiskCache('');
assert.deepEqual(cherryBlossomChildFolders('<a href="https://drive.google.com/drive/folders/flower">Hoa đào Circle</a><a href="https://drive.google.com/drive/folders/map">Bản đồ</a>'),[{folderId:'flower',name:'Hoa đào Circle'}]);
assert.deepEqual(cherryBlossomChildFolders('<a href="https://drive.google.com/drive/folders/uppercase">HOA ĐÀO CIRCLE</a>'),[{folderId:'uppercase',name:'HOA ĐÀO CIRCLE'}]);
console.log('PASS cherry: 12 sequential lists, 16 photos/pages, 7 partners, block/position/pool/hook cycles, shortages, mother typography, source policy, atomic store roundtrip.');
