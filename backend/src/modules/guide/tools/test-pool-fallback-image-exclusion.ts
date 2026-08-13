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

// Trường hợp 2: một nhóm toàn bộ là fallback -> pool phải giảm nhẹ về danh sách gốc (không rỗng),
// tránh chặn hẳn deck dùng nhóm đó (đúng tinh thần fix Mẫu 1 cho Green Land).
const allFallbackItemsBySection = Object.fromEntries(
  sectionKeys.map((sectionKey) => [
    sectionKey,
    sectionKey === 'check_in' ? makeSection(sectionKey, 5, 5) : makeSection(sectionKey, 5, 0),
  ]),
) as WorkbookItemsBySection;

const degradedPools = createDeckBuildPools(allFallbackItemsBySection);
assert.equal(degradedPools.checkinItems.length, 5, 'checkinItems toàn fallback vẫn phải giảm nhẹ về đủ 5 item gốc, không rỗng');
assert.ok(degradedPools.checkinItems.every((item) => item.imageSource === 'fallback'));
console.log('PASS all-fallback section degrades to full pool instead of going empty');
