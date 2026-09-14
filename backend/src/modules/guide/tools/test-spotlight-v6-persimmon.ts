import assert from 'node:assert/strict';

import type { GuideItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import {
  buildSpotlightV6PersimmonPages,
  buildV2MainList,
  spotlightV6PersimmonPartnerPool,
  V2_DECK_IDS,
} from '../logic/deck-builder-v2';
import { setActiveDestinationLocalize } from '../sync/destination-localize';
import { normalizeText } from '../logic/image-resolver';

const sectionKeys: SectionKey[] = ['quan_an', 'cafe', 'homestay', 'check_in', 'dich_vu', 'choi_dem', 'hoat_dong', 'dia_diem_lich_su', 'khu_du_lich'];
function item(sectionKey: SectionKey, index: number, isPartner = true): GuideItem {
  const imageUrl = `http://localhost:3000/assets/drive-file?id=partner-${sectionKey}-${index}`;
  return {
    id: `${sectionKey}-${index}`, sectionKey, sectionTitle: sectionKey,
    name: `Đối tác ${sectionKey} ${index}`, address: index % 2 ? `${index} địa chỉ` : '',
    type: sectionKey, openHours: '', style: '', highlight: '', theme: '', partnerFlag: isPartner ? 'x' : '',
    isPartner, headPrice: '', hasHeadPriceColumn: false, price: '', phone: '', imageUrl,
    imageMapped: true, imageMappingKey: `${sectionKey}|${index}`, imageSource: 'manual', candidateImageUrls: [imageUrl],
  };
}
function itemsByCount(count: number): WorkbookItemsBySection {
  const result = Object.fromEntries(sectionKeys.map((key) => [key, []])) as unknown as WorkbookItemsBySection;
  for (let index = 0; index < count; index += 1) {
    const sectionKey = sectionKeys[index % sectionKeys.length];
    result[sectionKey].push(item(sectionKey, index + 1));
  }
  result.cafe.push(item('cafe', 99, false));
  return result;
}
const backgrounds = Array.from({ length: 8 }, (_, index) => `http://localhost:3000/assets/drive-file?id=persimmon-${index + 1}`);
const common = (count: number) => ({
  itemsBySection: itemsByCount(count), imageUrls: [], libraryEntries: [], coverImageUrls: [],
  hinhNenImagePools: { default: [], green: [], dark: [], random: [], persimmon: backgrounds },
});

assert.ok(V2_DECK_IDS.includes('spotlight-v6-persimmon'));
setActiveDestinationLocalize('dalat');
const preview = buildV2MainList('spotlight-v6-persimmon', common(8));
assert.equal(preview?.pages.length, 11);
assert.equal(preview?.canvasPreset, 'tiktok-9x16');

for (const partnerCount of [5, 6, 7, 9]) {
  const pages = buildSpotlightV6PersimmonPages(common(partnerCount), `persimmon-${partnerCount}`, {
    destinationId: 'dalat', hooks: ['Hook mùa hồng thử nghiệm'],
  });
  const expectedPartners = Math.min(7, partnerCount);
  assert.equal(pages.length, 4 + expectedPartners);
  assert.equal(pages[0].type, 'cover');
  assert.equal(pages[0].title, 'Hook mùa hồng thử nghiệm');
  assert.equal(pages.filter((page) => page.layoutVariant === 'spotlight-v6-image').length, 3);
  assert.equal(pages[1].title, '');
  assert.equal(pages[2].title, '');
  assert.equal(pages[3].title, 'Lên Đà Lạt để tui giới thiệu vài chỗ ăn ngon, cà phê view đẹp cho mọi người nè');
  const venuePages = pages.filter((page) => page.layoutVariant === 'spotlight-v6-page');
  assert.equal(venuePages.length, expectedPartners);
  assert.ok(venuePages.every((page) => page.type === 'list' && page.items.length === 1 && page.items[0].isPartner));
  assert.equal(new Set(venuePages.map((page) => page.type === 'list' ? page.items[0].sourceKey : '')).size, expectedPartners);
  assert.ok(new Set(venuePages.map((page) => page.type === 'list' ? page.items[0].sourceSectionKey : '')).size >= Math.min(expectedPartners, sectionKeys.length));
  const allImages = pages.map((page) => page.backgroundImage);
  assert.equal(new Set(allImages).size, pages.length);
}

assert.equal(spotlightV6PersimmonPartnerPool(itemsByCount(7)).length, 7, 'Không được lấy dữ liệu thường vào pool đối tác.');
const firstRotation = buildSpotlightV6PersimmonPages({ ...common(16), globalUsedItemIds: new Set<string>(), globalUsedImageUrls: new Set<string>() }, 'rotation-1', { destinationId: 'dalat', hooks: ['Hook 1'] });
const previousSnapshotKeys = new Set<string>();
firstRotation.flatMap((page) => page.type === 'list' ? page.items : []).forEach((entry) => {
  if (entry.id) previousSnapshotKeys.add(entry.id);
  previousSnapshotKeys.add(normalizeText(entry.rawName || entry.name));
});
const secondRotation = buildSpotlightV6PersimmonPages({ ...common(16), globalUsedItemIds: previousSnapshotKeys, globalUsedImageUrls: new Set<string>() }, 'rotation-2', { destinationId: 'dalat', hooks: ['Hook 2'] });
const firstPartnerKeys = new Set(firstRotation.flatMap((page) => page.type === 'list' ? page.items.map((entry) => entry.sourceKey) : []).filter(Boolean));
const secondPartnerKeys = secondRotation.flatMap((page) => page.type === 'list' ? page.items.map((entry) => entry.sourceKey) : []).filter(Boolean);
assert.ok(secondPartnerKeys.every((key) => !firstPartnerKeys.has(key)), 'Hai list phải dùng đối tác chưa xuất hiện trước khi mở vòng mới.');
assert.throws(() => buildSpotlightV6PersimmonPages(common(4), 'short-partners', { destinationId: 'dalat', hooks: ['Hook'] }), /4\/5/);
assert.throws(() => buildSpotlightV6PersimmonPages({ ...common(7), hinhNenImagePools: { ...common(7).hinhNenImagePools, persimmon: backgrounds.slice(0, 3) } }, 'short-images', { destinationId: 'dalat', hooks: ['Hook'] }), /3\/4/);
assert.throws(() => buildSpotlightV6PersimmonPages(common(7), 'wrong-destination', { destinationId: 'greenland', hooks: ['Hook'] }), /chỉ áp dụng cho Đà Lạt/);

console.log('PASS Spotlight Mùa hồng: 4 ảnh chủ đề, 5–7 đối tác đa nhóm, mỗi trang một địa điểm, không trùng và chỉ Đà Lạt.');
