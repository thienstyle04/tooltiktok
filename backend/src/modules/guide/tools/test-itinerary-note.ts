import assert from 'node:assert/strict';
import type { GuideItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { buildItineraryNotePages } from '../logic/itinerary-note';
const keys: SectionKey[] = ['quan_an','cafe','check_in','khu_du_lich','hoat_dong','dia_diem_lich_su','choi_dem','homestay','dich_vu'];
const pools = Object.fromEntries(keys.map(key => [key, Array.from({length:8}, (_,i) => ({
 id:key+i, name:key+' '+i, address:'33 Ngô Quyền, Cam Ly - Đà Lạt', sectionKey:key, isPartner:i===0,
 imageUrl:'', imageMapped:false,
} as GuideItem))])) as WorkbookItemsBySection;
const common={itemsBySection:pools,globalUsedItemIds:new Set<string>()};
const pages=buildItineraryNotePages(common,'test',new Date('2026-09-30T18:00:00Z'));
assert.equal(pages.length,2);
assert.equal(pages[0].title,'Đi Đà Lạt tháng 10');
assert.equal(new Set(pages.flatMap(page=>page.items.map(item=>item.name))).size,14);
for(const [pageIndex,page] of pages.entries()) {
 assert.equal(page.items.length,7); assert.equal(page.type,'list');
 const count=(key:string)=>page.items.filter(item=>item.sourceSectionKey===key).length;
 assert.equal(count('quan_an'),2); assert.equal(count('cafe'),1);
 assert.ok(keys.every(key=>count(key)<=2));
 assert.equal(count('homestay'),0); assert.equal(count('dich_vu'),0);
 assert.equal(page.items.filter(item=>item.isPartner).length,pageIndex===0?4:3);
 assert.ok(page.items.every(item=>item.metaPrimary==='33 Ngô Quyền, Cam Ly - Đà Lạt' && !item.imageUrl));
 assert.equal(page.items[6].sourceSectionKey,'choi_dem');
}
const previous=new Set(pages.flatMap(page=>page.items.map(item=>item.id)));
const second=buildItineraryNotePages(common,'next');
assert.ok(second.flatMap(page=>page.items).some(item=>!previous.has(item.id)));
assert.throws(()=>buildItineraryNotePages({itemsBySection:{...pools,quan_an:[]}},'missing'),/không đủ|cần đúng/);
const normal=Object.fromEntries(keys.map(key=>[key,pools[key].map(item=>({...item,isPartner:false}))])) as WorkbookItemsBySection;
assert.throws(()=>buildItineraryNotePages({itemsBySection:normal},'normal'),/cần đúng 7 đối tác/);
const duplicate={...pools,cafe:pools.quan_an.slice(0,2).map(item=>({...item,sectionKey:'cafe' as SectionKey,isPartner:true}))};
const dupPages=buildItineraryNotePages({itemsBySection:duplicate},'duplicate');
assert.equal(new Set(dupPages.flatMap(page=>page.items.map(item=>item.name))).size,14);
console.log('PASS itinerary note: 2 days, category quotas, exact 4/3 partners, unique places, original addresses, no images, timezone and missing data.');
