import assert from 'node:assert/strict';
import type { GuideItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { buildSpotlightV6Pages, V2_DECK_IDS } from '../logic/deck-builder-v2';

const keys: SectionKey[] = ['quan_an','cafe','check_in','choi_dem','hoat_dong','dia_diem_lich_su','khu_du_lich','homestay','dich_vu'];
const item = (sectionKey: SectionKey, index: number): GuideItem => ({
  id: `${sectionKey}-${index}`, sectionKey, sectionTitle: sectionKey, name: `${sectionKey} ${index}`,
  address: `${index} Ngô Quyền, Cam Ly - Đà Lạt`, type: sectionKey, openHours:'', style:'', highlight:'', partnerFlag:'', isPartner:false,
  headPrice:'', hasHeadPriceColumn:false, price:'', phone:'', imageUrl:`https://example.invalid/${sectionKey}-${index}.jpg`, imageMapped:true, imageMappingKey:`${sectionKey}-${index}`, imageSource:'manual', candidateImageUrls:[`https://example.invalid/${sectionKey}-${index}.jpg`],
});
const itemsBySection = Object.fromEntries(keys.map((k) => [k, (k === 'homestay' || k === 'dich_vu') ? [] : Array.from({length:3}, (_,i)=>item(k,i+1))])) as WorkbookItemsBySection;
const coverImageUrls = Array.from({length:12}, (_,i)=>`https://example.invalid/bg-${i+1}.jpg`);
assert.ok(V2_DECK_IDS.includes('spotlight-v6'));
const pages = buildSpotlightV6Pages({ itemsBySection, imageUrls:[], libraryEntries:[], coverImageUrls }, 'spotlight-v6-test', { hooks:['Hook A','Hook B'], destinationId:'dalat' });
assert.equal(pages.length, 14);
assert.equal(pages[0].layoutVariant, 'spotlight-v6-cover');
assert.ok(['Hook A','Hook B'].includes(pages[0].title));
assert.ok(pages.every((p) => p.canvasPreset === 'tiktok-9x16' && p.titlePlacement === 'center'));
assert.equal(new Set(pages.filter((p)=>p.backgroundImage).map((p)=>p.backgroundImage)).size, 14);
assert.equal(pages.filter((p)=>p.layoutVariant === 'spotlight-v6-page').length, 8);
assert.equal(pages.filter((p)=>p.layoutVariant === 'spotlight-v6-image').length, 5);
console.log('PASS spotlight-v6: 9:16, 14 trang, hook hiện hành, ảnh/địa điểm không trùng, title căn giữa.');