import assert from 'node:assert/strict';

import type { GuideItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import {
  buildSpotlightV6GreenPages,
  buildV2MainList,
  spotlightV6GreenVenuePool,
  V2_DECK_IDS,
} from '../logic/deck-builder-v2';
import { setActiveDestinationLocalize } from '../sync/destination-localize';

const keys: SectionKey[] = ['quan_an', 'cafe', 'homestay', 'check_in', 'dich_vu', 'choi_dem', 'hoat_dong', 'dia_diem_lich_su', 'khu_du_lich'];
function makeItem(sectionKey: SectionKey, index: number, theme = 'Mảng xanh'): GuideItem {
  const imageUrl = `http://localhost:3000/api/drive-image?id=${sectionKey}-green-${index}`;
  return {
    id: `${sectionKey}-${index}`, sectionKey, sectionTitle: sectionKey,
    name: `Địa điểm xanh ${sectionKey} ${index}`,
    address: index === 3 ? '' : `${index} Địa chỉ thử`,
    type: sectionKey, openHours: '', style: '', highlight: '', theme,
    partnerFlag: '', isPartner: false, headPrice: '', hasHeadPriceColumn: false,
    price: '', phone: '', imageUrl, imageMapped: true,
    imageMappingKey: `${sectionKey}|green|${index}`, imageSource: 'manual',
    candidateImageUrls: [imageUrl],
  };
}
const itemsBySection = Object.fromEntries(keys.map((key) => [key, []])) as unknown as WorkbookItemsBySection;
itemsBySection.quan_an.push(makeItem('quan_an', 1, ' MẢNG   XANH '));
itemsBySection.cafe.push(makeItem('cafe', 2, 'mang xanh'));
itemsBySection.hoat_dong.push(makeItem('hoat_dong', 3, 'Mảng xanh'));
itemsBySection.check_in.push(makeItem('check_in', 4, 'MẢNG XANH'));
itemsBySection.khu_du_lich.push(makeItem('khu_du_lich', 5, 'mảng xanh'));
itemsBySection.choi_dem.push(makeItem('choi_dem', 6, 'Mảng xanh'));
itemsBySection.quan_an.push(makeItem('quan_an', 7, 'Tone đen'));
itemsBySection.quan_an.push(makeItem('quan_an', 8, 'Mảng xanh'));
itemsBySection.cafe.push(makeItem('cafe', 9, 'Mảng xanh'));
itemsBySection.hoat_dong.push(makeItem('hoat_dong', 10, 'Mảng xanh'));
itemsBySection.check_in.push(makeItem('check_in', 11, 'Mảng xanh'));
itemsBySection.khu_du_lich.push(makeItem('khu_du_lich', 12, 'Mảng xanh'));

const green = Array.from({ length: 8 }, (_, index) => `http://localhost:3000/api/drive-image?id=green-bg-${index + 1}`);
const common = {
  itemsBySection,
  imageUrls: [],
  libraryEntries: [],
  coverImageUrls: [],
  hinhNenImagePools: { default: [], green, dark: ['dark'], random: ['random'] },
};

assert.ok(V2_DECK_IDS.includes('spotlight-v6-green'));
assert.equal(spotlightV6GreenVenuePool(itemsBySection).length, 10);
setActiveDestinationLocalize('dalat');
const previewList = buildV2MainList('spotlight-v6-green', common);
assert.ok(previewList, 'Spotlight V6 Mảng xanh phải có List chính để preview.');
assert.equal(previewList?.id, 'spotlight-v6-green-main');
assert.equal(previewList?.pages.length, 11);
const usedItems = new Set<string>();
const listCommon = { ...common, globalUsedItemIds: usedItems };
const pages = buildSpotlightV6GreenPages(listCommon, 'green-test', {
  destinationId: 'dalat',
  hooks: ['Hook chỉ dành cho mảng xanh'],
});
assert.equal(pages.length, 11);
assert.equal(pages[0].type, 'cover');
assert.equal(pages[0].title, 'Hook chỉ dành cho mảng xanh');
assert.ok(pages.every((page) => page.canvasPreset === 'tiktok-9x16'));
const imagePages = pages.filter((page) => page.layoutVariant === 'spotlight-v6-image');
const venuePages = pages.filter((page) => page.layoutVariant === 'spotlight-v6-page');
assert.equal(imagePages.length, 5);
assert.equal(venuePages.length, 5);
const backgrounds = pages.filter((page) => page.layoutVariant !== 'spotlight-v6-page').map((page) => page.backgroundImage);
assert.equal(new Set(backgrounds).size, 6);
assert.ok(backgrounds.every((url) => green.includes(url)));
assert.ok(!pages.some((page) => page.backgroundImage === 'dark' || page.backgroundImage === 'random'));
assert.equal(new Set(venuePages.map((page) => page.type === 'list' ? page.items[0]?.sourceKey : '')).size, 5);
assert.deepEqual(
  venuePages.map((page) => page.type === 'list' ? page.items[0]?.sourceSectionKey : ''),
  ['quan_an', 'cafe', 'hoat_dong', 'check_in', 'khu_du_lich'],
);
assert.ok(spotlightV6GreenVenuePool(itemsBySection).some((item) => item.address === ''), 'Pool phải giữ địa điểm Mảng xanh không có địa chỉ.');

const secondPages = buildSpotlightV6GreenPages(listCommon, 'green-test-2', {
  destinationId: 'dalat',
  hooks: ['Hook chỉ dành cho mảng xanh'],
});
const secondVenuePages = secondPages.filter((page) => page.layoutVariant === 'spotlight-v6-page');
const firstKeys = new Set(venuePages.map((page) => page.type === 'list' ? page.items[0]?.sourceKey : ''));
assert.ok(secondVenuePages.every((page) => page.type === 'list' && !firstKeys.has(page.items[0]?.sourceKey)), 'List thứ hai phải luân phiên sang địa điểm mới trong từng nhóm.');

assert.throws(
  () => buildSpotlightV6GreenPages({ ...common, hinhNenImagePools: { ...common.hinhNenImagePools, green: green.slice(0, 5) } }, 'short-images', { destinationId: 'dalat', hooks: ['Hook xanh'] }),
  /5\/6/,
);
assert.throws(
  () => buildSpotlightV6GreenPages({ ...common, itemsBySection: { ...itemsBySection, khu_du_lich: [] } }, 'short-venues', { destinationId: 'dalat', hooks: ['Hook xanh'] }),
  /đang thiếu: Khu du lịch/,
);
assert.throws(
  () => buildSpotlightV6GreenPages(common, 'wrong-destination', { destinationId: 'greenland', hooks: ['Hook xanh'] }),
  /chỉ áp dụng cho Đà Lạt/,
);

console.log('PASS Spotlight V6 Mảng xanh: catalog, Chu_de, 11 trang, 6 ảnh xanh, đủ 5 nhóm, luân phiên và lỗi thiếu pool.');
