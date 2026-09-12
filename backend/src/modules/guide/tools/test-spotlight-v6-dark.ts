import assert from 'node:assert/strict';

import type { GuideItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import {
  buildSpotlightV6DarkPages,
  buildV2MainList,
  spotlightV6DarkVenuePool,
  V2_DECK_IDS,
} from '../logic/deck-builder-v2';
import { setActiveDestinationLocalize } from '../sync/destination-localize';

const keys: SectionKey[] = ['quan_an', 'cafe', 'homestay', 'check_in', 'dich_vu', 'choi_dem', 'hoat_dong', 'dia_diem_lich_su', 'khu_du_lich'];
function makeItem(sectionKey: SectionKey, index: number, theme = 'Tone đen'): GuideItem {
  const imageUrl = `http://localhost:3000/assets/drive-file/${sectionKey}-dark-${index}`;
  return {
    id: `${sectionKey}-${index}`, sectionKey, sectionTitle: sectionKey,
    name: `Địa điểm tối ${sectionKey} ${index}`,
    address: `${index} Địa chỉ thử`,
    type: sectionKey, openHours: '', style: '', highlight: '', theme,
    partnerFlag: '', isPartner: false, headPrice: '', hasHeadPriceColumn: false,
    price: '', phone: '', imageUrl, imageMapped: true,
    imageMappingKey: `${sectionKey}|dark|${index}`, imageSource: 'manual',
    candidateImageUrls: [imageUrl],
  };
}

const itemsBySection = Object.fromEntries(keys.map((key) => [key, []])) as unknown as WorkbookItemsBySection;
for (let index = 1; index <= 6; index += 1) itemsBySection.quan_an.push(makeItem('quan_an', index, index === 1 ? ' TONE   ĐEN ' : 'tone den'));
for (let index = 1; index <= 5; index += 1) itemsBySection.hoat_dong.push(makeItem('hoat_dong', index));
for (let index = 1; index <= 8; index += 1) itemsBySection.check_in.push(makeItem('check_in', index));
itemsBySection.cafe.push(makeItem('cafe', 1, 'Mảng xanh'));
itemsBySection.choi_dem.push(makeItem('choi_dem', 1, 'Tone đen'));

const dark = Array.from({ length: 14 }, (_, index) => `http://localhost:3000/assets/drive-file/dark-bg-${index + 1}`);
const common = {
  itemsBySection,
  imageUrls: [],
  libraryEntries: [],
  coverImageUrls: [],
  hinhNenImagePools: { default: [], green: ['green'], dark, random: ['random'] },
};

assert.ok(V2_DECK_IDS.includes('spotlight-v6-dark'));
assert.equal(spotlightV6DarkVenuePool(itemsBySection).length, 19);
assert.ok(spotlightV6DarkVenuePool(itemsBySection).every((item) => ['quan_an', 'hoat_dong', 'check_in'].includes(item.sectionKey)));
setActiveDestinationLocalize('dalat');
const previewList = buildV2MainList('spotlight-v6-dark', common);
assert.ok(previewList, 'Spotlight V6 Tone đen phải có List chính để preview.');
assert.equal(previewList?.pages.length, 11);

const usedItems = new Set<string>();
const usedImages = new Set<string>();
const pages = buildSpotlightV6DarkPages({ ...common, globalUsedItemIds: usedItems, globalUsedImageUrls: usedImages }, 'dark-test', {
  destinationId: 'dalat',
  hooks: ['Hook chỉ dành cho tone tối'],
});
assert.equal(pages.length, 11);
assert.equal(pages[0].type, 'cover');
assert.equal(pages[0].title, 'Hook chỉ dành cho tone tối');
assert.ok(pages.every((page) => page.canvasPreset === 'tiktok-9x16'));
const imagePages = pages.filter((page) => page.layoutVariant === 'spotlight-v6-image');
const venuePages = pages.filter((page) => page.layoutVariant === 'spotlight-v6-page');
assert.equal(imagePages.length, 5);
assert.equal(venuePages.length, 5);
const backgrounds = pages.filter((page) => page.layoutVariant !== 'spotlight-v6-page').map((page) => page.backgroundImage);
assert.equal(new Set(backgrounds).size, 6);
assert.ok(backgrounds.every((url) => dark.includes(url)));
assert.ok(!pages.some((page) => page.backgroundImage === 'green' || page.backgroundImage === 'random'));
const venueSections = venuePages.map((page) => page.type === 'list' ? page.items[0]?.sourceSectionKey : '');
assert.ok(venueSections.includes('quan_an'));
assert.ok(venueSections.includes('hoat_dong'));
assert.ok(venueSections.includes('check_in'));
assert.equal(new Set(venuePages.map((page) => page.type === 'list' ? page.items[0]?.sourceKey : '')).size, 5);

assert.throws(
  () => buildSpotlightV6DarkPages({ ...common, hinhNenImagePools: { ...common.hinhNenImagePools, dark: dark.slice(0, 5) } }, 'short-images', { destinationId: 'dalat', hooks: ['Hook tối'] }),
  /5\/6/,
);
const shortItems = { ...itemsBySection, quan_an: itemsBySection.quan_an.slice(0, 2), hoat_dong: itemsBySection.hoat_dong.slice(0, 1), check_in: itemsBySection.check_in.slice(0, 1) };
assert.throws(
  () => buildSpotlightV6DarkPages({ ...common, itemsBySection: shortItems }, 'short-venues', { destinationId: 'dalat', hooks: ['Hook tối'] }),
  /4\/5/,
);
assert.throws(
  () => buildSpotlightV6DarkPages(common, 'wrong-destination', { destinationId: 'greenland', hooks: ['Hook tối'] }),
  /chỉ áp dụng cho Đà Lạt/,
);

console.log('PASS Spotlight V6 Tone đen: catalog, Chu_de, 11 trang, 6 ảnh tối, cân bằng nhóm, chống trùng và lỗi thiếu pool.');
