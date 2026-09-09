import assert from 'node:assert/strict';
import type { GuideItem, HinhNenImageUrlPools, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { buildSpotlightV6Pages, V2_DECK_IDS } from '../logic/deck-builder-v2';

const keys: SectionKey[] = ['quan_an','cafe','check_in','choi_dem','hoat_dong','dia_diem_lich_su','khu_du_lich','homestay','dich_vu'];
const item = (sectionKey: SectionKey, index: number): GuideItem => ({
  id: `${sectionKey}-${index}`, sectionKey, sectionTitle: sectionKey, name: `${sectionKey} ${index}`,
  address: `${index} Ngô Quyền, Cam Ly - Đà Lạt`, type: sectionKey, openHours:'', style:'', highlight:'', partnerFlag:'', isPartner:false,
  headPrice:'', hasHeadPriceColumn:false, price:'', phone:'', imageUrl:`https://example.invalid/${sectionKey}-${index}.jpg`, imageMapped:true, imageMappingKey:`${sectionKey}-${index}`, imageSource:'manual', candidateImageUrls:[`https://example.invalid/${sectionKey}-${index}.jpg`],
});
const itemsBySection = Object.fromEntries(keys.map((k) => [k, (k === 'homestay' || k === 'dich_vu') ? [] : Array.from({length:3}, (_,i)=>item(k,i+1))])) as WorkbookItemsBySection;
const coverImageUrls = Array.from({length:12}, (_,i)=>`https://example.invalid/bg-${i+1}.jpg`);
const hinhNenImagePools: HinhNenImageUrlPools = {
  default: coverImageUrls,
  green: Array.from({length:6}, (_,i)=>`https://example.invalid/green-${i+1}.jpg`),
  dark: Array.from({length:3}, (_,i)=>`https://example.invalid/dark-${i+1}.jpg`),
  random: Array.from({length:15}, (_,i)=>`https://example.invalid/random-${i+1}.jpg`),
};
assert.ok(V2_DECK_IDS.includes('spotlight-v6'));
const pages = buildSpotlightV6Pages({ itemsBySection, imageUrls:[], libraryEntries:[], coverImageUrls, hinhNenImagePools }, 'spotlight-v6-test', { hooks:['Hook A','Hook B'], destinationId:'dalat' });
assert.equal(pages.length, 14);
assert.equal(pages[0].layoutVariant, 'spotlight-v6-cover');
assert.ok(hinhNenImagePools.dark.includes(pages[0].backgroundImage));
assert.ok(['Hook A','Hook B'].includes(pages[0].title));
assert.ok(pages.every((p) => p.canvasPreset === 'tiktok-9x16' && p.titlePlacement === 'center'));
assert.equal(new Set(pages.filter((p)=>p.backgroundImage).map((p)=>p.backgroundImage)).size, 14);
assert.equal(pages.filter((p)=>p.layoutVariant === 'spotlight-v6-page').length, 8);
const randomPages = pages.filter((p)=>p.layoutVariant === 'spotlight-v6-image');
assert.equal(randomPages.length, 5);
assert.ok(randomPages.every((p)=>hinhNenImagePools.random.includes(p.backgroundImage)));
assert.equal(new Set(randomPages.map((p)=>p.backgroundImage)).size, 5);
assert.ok(!pages.some((p)=>hinhNenImagePools.green.includes(p.backgroundImage)));
assert.ok(!pages.slice(0, 2).some((p)=>coverImageUrls.includes(p.backgroundImage)));

assert.throws(
  () => buildSpotlightV6Pages(
    { itemsBySection, imageUrls:[], libraryEntries:[], coverImageUrls, hinhNenImagePools: { ...hinhNenImagePools, dark: [] } },
    'spotlight-v6-no-dark',
    { hooks:['Hook A'], destinationId:'dalat' },
  ),
  /Ảnh tone đen \(0\/1\)/,
);
assert.throws(
  () => buildSpotlightV6Pages(
    { itemsBySection, imageUrls:[], libraryEntries:[], coverImageUrls, hinhNenImagePools: { ...hinhNenImagePools, random: hinhNenImagePools.random.slice(0, 4) } },
    'spotlight-v6-short-random',
    { hooks:['Hook A'], destinationId:'dalat' },
  ),
  /Ảnh random \(4\/5\)/,
);

const greenlandPages = buildSpotlightV6Pages(
  { itemsBySection, imageUrls:[], libraryEntries:[], coverImageUrls },
  'spotlight-v6-greenland',
  { hooks:['Hook GL'], destinationId:'greenland' },
);
assert.ok(coverImageUrls.includes(greenlandPages[0].backgroundImage));
assert.ok(greenlandPages.filter((p)=>p.layoutVariant === 'spotlight-v6-image').every((p)=>coverImageUrls.includes(p.backgroundImage)));

console.log('PASS spotlight-v6: Đà Lạt dùng Tone đen/Random, Green Land giữ pool cũ, thiếu pool báo lỗi rõ.');
