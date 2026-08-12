import assert from 'node:assert/strict';
import type { GuideItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { buildCarouselMau1Pages } from '../logic/deck-builder-v2';

const sectionCounts: Partial<Record<SectionKey, number>> = {
  check_in: 6,
  khu_du_lich: 6,
  quan_an: 9,
  cafe: 9,
  choi_dem: 6,
  homestay: 3,
};

function item(destination: string, sectionKey: SectionKey, index: number): GuideItem {
  const id = `${destination}-${sectionKey}-${index}`;
  const imageUrl = `https://example.invalid/test/${id}.jpg`;
  return {
    id,
    sectionKey,
    sectionTitle: sectionKey,
    name: `${destination} ${sectionKey} ${index}`,
    address: `${index} Đường ${destination}`,
    type: sectionKey,
    openHours: '',
    style: '',
    highlight: '',
    partnerFlag: index % 3 === 0 ? 'x' : '',
    isPartner: index % 3 === 0,
    headPrice: '',
    hasHeadPriceColumn: false,
    price: sectionKey === 'check_in' ? 'Free' : '',
    phone: '',
    imageUrl,
    imageMapped: true,
    imageMappingKey: id,
    imageSource: 'manual',
    candidateImageUrls: [imageUrl],
  };
}

function dataset(destination: string): WorkbookItemsBySection {
  const keys: SectionKey[] = ['quan_an', 'cafe', 'homestay', 'check_in', 'dich_vu', 'choi_dem', 'hoat_dong', 'dia_diem_lich_su', 'khu_du_lich'];
  return Object.fromEntries(keys.map((key) => [
    key,
    Array.from({ length: sectionCounts[key] || 0 }, (_, index) => item(destination, key, index + 1)),
  ])) as WorkbookItemsBySection;
}

function auditDestination(destination: string): void {
  const itemsBySection = dataset(destination);
  const usedItems = new Set<string>();
  const usedImages = new Set<string>();
  const hooks = [
    `${destination} hook ngắn`,
    `${destination} – Một hook dài có đầy đủ dấu tiếng Việt để kiểm tra xuống dòng`,
    `${destination} hook thứ ba`,
  ];
  const expectedSections: SectionKey[] = [
    'check_in', 'check_in',
    'khu_du_lich', 'khu_du_lich',
    'quan_an', 'quan_an', 'quan_an',
    'cafe', 'cafe', 'cafe',
    'choi_dem', 'choi_dem',
    'homestay',
  ];
  const usedHooks: string[] = [];

  for (let listIndex = 0; listIndex < 3; listIndex += 1) {
    const pages = buildCarouselMau1Pages({
      itemsBySection,
      imageUrls: [],
      libraryEntries: [],
      coverImageUrls: Array.from({ length: 3 }, (_, index) => `https://example.invalid/test/${destination}-cover-${index + 1}.jpg`),
      globalUsedItemIds: usedItems,
      globalUsedImageUrls: usedImages,
    }, `${destination}-list-${listIndex + 1}`, {
      hooks,
      usedHookTitles: usedHooks,
      destinationId: destination,
    });

    assert.equal(pages.length, 14, `${destination}: list phải có 14 trang`);
    assert.equal(pages[0].type, 'cover');
    assert.equal(pages[0].layoutVariant, 'carousel-mau-1-cover');
    assert.match(pages[0].backgroundImage, new RegExp(`${destination}-cover-`));
    assert.ok(hooks.includes(pages[0].title));
    usedHooks.push(pages[0].title);

    const listPages = pages.slice(1);
    assert.deepEqual(listPages.map((page) => page.type === 'list' ? page.items[0].sourceSectionKey : null), expectedSections);
    const itemIds = listPages.map((page) => page.type === 'list' ? page.items[0].id : '');
    const imageUrls = listPages.map((page) => page.type === 'list' ? page.items[0].imageUrl : '');
    assert.equal(new Set(itemIds).size, 13, `${destination}: không lặp địa điểm trong list`);
    assert.equal(new Set(imageUrls).size, 13, `${destination}: không lặp ảnh trong list`);
    assert.ok(itemIds.every((id) => String(id).startsWith(`${destination}-`)), `${destination}: không trộn nguồn`);
    assert.ok(imageUrls.every((url) => url.includes(`/test/${destination}-`)), `${destination}: ảnh phải thuộc đúng nguồn`);
  }
  assert.equal(new Set(usedHooks).size, 3, `${destination}: hook không lặp trước khi hết pool`);
}

auditDestination('dalat');
auditDestination('greenland');

const missingNightlife = dataset('missing');
missingNightlife.choi_dem = [];
assert.throws(() => buildCarouselMau1Pages({
  itemsBySection: missingNightlife,
  imageUrls: [],
  libraryEntries: [],
  coverImageUrls: ['https://example.invalid/test/missing-cover.jpg'],
}, 'missing-list', { hooks: ['Hook hợp lệ cho test'] }), /Chơi đêm/);

console.log('PASS carousel-mau-1: 3 list Đà Lạt + 3 list Green Land, đúng 14 trang, không trộn/lặp ảnh, lỗi rõ khi thiếu nhóm.');
