import assert from 'node:assert/strict';
import type { GuideItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import type { DeckBuildPools } from '../../../common/interfaces/guide.types';
import { createDeckBuildPools } from '../logic/deck-builder';

function makeItem(sectionKey: SectionKey, index: number, imageSource: GuideItem['imageSource']): GuideItem {
  const id = `${sectionKey}-${index}`;
  return {
    id, sectionKey, sectionTitle: sectionKey, name: id, address: `Địa chỉ ${index}`,
    type: sectionKey, openHours: '', style: '', highlight: '', partnerFlag: '', isPartner: false,
    headPrice: '', hasHeadPriceColumn: false, price: '', phone: '',
    imageUrl: imageSource === 'fallback' ? 'https://example.invalid/fallback.jpg' : `https://example.invalid/${id}.jpg`,
    imageMapped: imageSource !== 'fallback',
    imageMappingKey: id,
    imageSource,
    candidateImageUrls: imageSource === 'fallback' ? [] : [`https://example.invalid/${id}.jpg`],
  };
}

function makeSection(sectionKey: SectionKey, count: number, fallbackCount: number): GuideItem[] {
  return Array.from({ length: count }, (_, index) => (
    makeItem(sectionKey, index, index < fallbackCount ? 'fallback' : 'manual')
  ));
}

function makeMixedSourceSection(
  sectionKey: SectionKey,
  manualCount: number,
  autoCount: number,
  fallbackCount: number,
): GuideItem[] {
  const sources: Array<GuideItem['imageSource']> = [
    ...Array.from({ length: manualCount }, () => 'manual' as const),
    ...Array.from({ length: autoCount }, () => 'auto' as const),
    ...Array.from({ length: fallbackCount }, () => 'fallback' as const),
  ];
  return sources.map((imageSource, index) => makeItem(sectionKey, index, imageSource));
}

const POOL_KEY_BY_SECTION: Record<SectionKey, keyof DeckBuildPools> = {
  quan_an: 'foodItems',
  cafe: 'cafeItems',
  homestay: 'stayItems',
  check_in: 'checkinItems',
  dich_vu: 'serviceItems',
  choi_dem: 'nightlifeItems',
  hoat_dong: 'activityItems',
  dia_diem_lich_su: 'historyItems',
  khu_du_lich: 'tourismItems',
};
const sectionKeys = Object.keys(POOL_KEY_BY_SECTION) as SectionKey[];

// Trường hợp 1: mỗi nhóm có vài item fallback lẫn với item ảnh thật -> pool phải loại hết fallback.
const mixedItemsBySection = Object.fromEntries(
  sectionKeys.map((sectionKey) => [sectionKey, makeSection(sectionKey, 10, 4)]),
) as WorkbookItemsBySection;

const mixedPools = createDeckBuildPools(mixedItemsBySection);
for (const sectionKey of sectionKeys) {
  const pool = mixedPools[POOL_KEY_BY_SECTION[sectionKey]] as GuideItem[];
  assert.ok(pool.every((item) => item.imageSource !== 'fallback'), `${sectionKey}: pool không được còn item fallback khi vẫn có item ảnh thật`);
  assert.equal(pool.length, 6, `${sectionKey}: pool phải còn đúng 6 item ảnh thật (10 - 4 fallback)`);
}
console.log('PASS mixed sections: fallback items excluded, real-image items kept');

// Trường hợp 2: một nhóm toàn bộ là fallback -> pool phải RỖNG, KHÔNG được dùng lại các item đó
// (theo yêu cầu: item chưa có ảnh riêng thì tuyệt đối không dùng, kể cả khi cả nhóm đều vậy).
const allFallbackItemsBySection = Object.fromEntries(
  sectionKeys.map((sectionKey) => [
    sectionKey,
    sectionKey === 'check_in' ? makeSection(sectionKey, 5, 5) : makeSection(sectionKey, 5, 0),
  ]),
) as WorkbookItemsBySection;

const emptiedPools = createDeckBuildPools(allFallbackItemsBySection);
assert.equal(emptiedPools.checkinItems.length, 0, 'checkinItems toàn fallback phải rỗng, không được dùng lại item chưa có ảnh riêng');
console.log('PASS all-fallback section is excluded entirely, not reused');

// Trường hợp 3: item 'auto' (ảnh mượn thư viện chung, KHÔNG phải ảnh Drive riêng của địa điểm) phải
// bị gác lại như 'fallback' khi vẫn còn item 'manual' (ảnh Drive riêng thật) trong nhóm — đây là kẽ hở
// đã gây lỗi "địa điểm chưa có ảnh vẫn được dùng" trước đây (chỉ loại 'fallback', chưa loại 'auto').
const autoMixedItemsBySection = Object.fromEntries(
  sectionKeys.map((sectionKey) => [sectionKey, makeMixedSourceSection(sectionKey, 3, 3, 0)]),
) as WorkbookItemsBySection;

const autoMixedPools = createDeckBuildPools(autoMixedItemsBySection);
for (const sectionKey of sectionKeys) {
  const pool = autoMixedPools[POOL_KEY_BY_SECTION[sectionKey]] as GuideItem[];
  assert.ok(pool.every((item) => item.imageSource === 'manual'), `${sectionKey}: pool phải chỉ còn item 'manual' (ảnh Drive riêng), loại cả 'auto'`);
  assert.equal(pool.length, 3, `${sectionKey}: pool phải còn đúng 3 item 'manual'`);
}
console.log("PASS mixed manual+auto sections: 'auto' (borrowed library image) excluded like fallback");

// Trường hợp 4: nhóm toàn 'auto' (không có 'manual' nào) cũng phải RỖNG, không dùng lại.
const allAutoItemsBySection = Object.fromEntries(
  sectionKeys.map((sectionKey) => [
    sectionKey,
    sectionKey === 'cafe' ? makeMixedSourceSection(sectionKey, 0, 4, 0) : makeSection(sectionKey, 4, 0),
  ]),
) as WorkbookItemsBySection;
const allAutoPools = createDeckBuildPools(allAutoItemsBySection);
assert.equal(allAutoPools.cafeItems.length, 0, "cafeItems toàn 'auto' phải rỗng, không được dùng lại ảnh mượn thư viện");
console.log("PASS all-'auto' section is excluded entirely, not reused");
