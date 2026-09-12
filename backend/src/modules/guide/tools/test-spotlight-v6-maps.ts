import assert from 'node:assert/strict';

import type { GuideItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import {
  buildSpotlightV6MapsPages,
  buildV2MainList,
  spotlightV6MapsVenuePool,
  V2_DECK_IDS,
} from '../logic/deck-builder-v2';
import { setActiveDestinationLocalize } from '../sync/destination-localize';
import { preferredGoogleMapsImageLink } from '../sync/sheet-drive-manifest';

const keys: SectionKey[] = ['quan_an', 'cafe', 'homestay', 'check_in', 'dich_vu', 'choi_dem', 'hoat_dong', 'dia_diem_lich_su', 'khu_du_lich'];
const makeItem = (sectionKey: SectionKey, index: number, withMap = true, withReal = true): GuideItem => {
  const real = withReal ? `/assets/drive-file?id=real-${sectionKey}-${index}` : '';
  const map = withMap ? `/assets/drive-file?id=map-${sectionKey}-${index}` : '';
  return {
    id: `${sectionKey}-${index}`, sectionKey, sectionTitle: sectionKey,
    name: `Địa điểm ${sectionKey} ${index}`, address: index === 1 ? '' : `${index} Địa chỉ`,
    type: sectionKey, openHours: '', style: '', highlight: '', partnerFlag: '', isPartner: index % 2 === 0,
    headPrice: '', hasHeadPriceColumn: false, price: '', phone: '', imageUrl: real,
    imageMapped: withReal, imageMappingKey: `${sectionKey}-${index}`, imageSource: withReal ? 'manual' : 'fallback',
    candidateImageUrls: real ? [real, `${real}-alt`] : [], mapImageUrl: map, mapCandidateImageUrls: map ? [map] : [],
  };
};

const itemsBySection = Object.fromEntries(keys.map((key) => [key, []])) as unknown as WorkbookItemsBySection;
for (let index = 1; index <= 4; index += 1) itemsBySection.check_in.push(makeItem('check_in', index));
for (let index = 1; index <= 4; index += 1) itemsBySection.hoat_dong.push(makeItem('hoat_dong', index));
itemsBySection.cafe.push(makeItem('cafe', 1, true, false));
itemsBySection.quan_an.push(makeItem('quan_an', 1, false, true));

assert.equal(preferredGoogleMapsImageLink({ anh_gg_maps: 'display', anh_gg_maps__hyperlink: 'https://drive.google.com/maps-folder' }), 'https://drive.google.com/maps-folder');
assert.equal(preferredGoogleMapsImageLink({ link_drive__hyperlink: 'https://drive.google.com/real-folder' }), '');
assert.ok(V2_DECK_IDS.includes('spotlight-v6-maps'));
assert.equal(spotlightV6MapsVenuePool(itemsBySection).length, 8);

setActiveDestinationLocalize('dalat');
const common = { itemsBySection, imageUrls: [], libraryEntries: [], coverImageUrls: [] };
const preview = buildV2MainList('spotlight-v6-maps', common);
assert.equal(preview?.pages.length, 14);
assert.equal(preview?.canvasPreset, 'tiktok-3x4');
assert.equal(preview?.postCaption, 'tới Đà Lạt vì');
assert.deepEqual(preview?.captionHashtags, ['#dalat', '#reviewdalat', '#dalatreview', '#dalatdidau', '#dalattrip']);

const pages = buildSpotlightV6MapsPages({ ...common, globalUsedItemIds: new Set(), globalUsedImageUrls: new Set() }, 'maps-test');
assert.equal(pages.length, 14);
assert.ok(pages.every((page) => page.type === 'list' && page.canvasPreset === 'tiktok-3x4'));
assert.deepEqual(pages.map((page) => page.layoutVariant), Array.from({ length: 7 }, () => ['spotlight-v6-map-page', 'spotlight-v6-map-place']).flat());
const selectedKeys = pages.filter((_, index) => index % 2 === 1).map((page) => page.type === 'list' ? page.items[0]?.sourceKey : '');
assert.equal(new Set(selectedKeys).size, 7);
for (let pair = 0; pair < 7; pair += 1) {
  const mapPage = pages[pair * 2];
  const placePage = pages[pair * 2 + 1];
  assert.equal(mapPage.type, 'list');
  assert.equal(placePage.type, 'list');
  if (mapPage.type === 'list' && placePage.type === 'list') {
    assert.equal(mapPage.items[0]?.sourceKey, placePage.items[0]?.sourceKey);
    assert.match(mapPage.backgroundImage, /map-/);
    assert.match(placePage.backgroundImage, /real-/);
    assert.notEqual(mapPage.backgroundImage, placePage.backgroundImage);
  }
}
assert.equal(new Set(pages.map((page) => page.backgroundImage)).size, 14);
assert.throws(() => buildSpotlightV6MapsPages({ ...common, itemsBySection: { ...itemsBySection, check_in: itemsBySection.check_in.slice(0, 3), hoat_dong: itemsBySection.hoat_dong.slice(0, 3) } }, 'short'), /6 địa điểm có cả ảnh thật/);
setActiveDestinationLocalize('greenland');
assert.throws(() => buildSpotlightV6MapsPages(common, 'greenland'), /chỉ áp dụng cho Đà Lạt/);
setActiveDestinationLocalize('dalat');

console.log('PASS Spotlight V6 Google Maps: parser riêng, catalog, 7 cặp/14 trang, 3:4, ghép đúng địa điểm và lỗi thiếu pool.');
