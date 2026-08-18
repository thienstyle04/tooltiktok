import assert from 'node:assert/strict';
import type { GuideItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { buildOneWayStoryPages } from '../logic/deck-builder-v2';
import { BUNDLED_ONE_WAY_HOOKS } from '../sync/hook-fallbacks';
import { getPremadeHookPoolKey } from '../sync/premade-hook-source';

const allSections: SectionKey[] = [
  'quan_an', 'cafe', 'homestay', 'check_in', 'dich_vu', 'choi_dem',
  'hoat_dong', 'dia_diem_lich_su', 'khu_du_lich',
];

function item(sectionKey: SectionKey, index: number, options: { name?: string; partner?: boolean } = {}): GuideItem {
  const name = options.name || `${sectionKey} ${index}`;
  const id = `${sectionKey}-${index}-${name.replace(/\s+/g, '-').toLowerCase()}`;
  const imageUrl = `https://example.invalid/one-way/${id}.jpg`;
  return {
    id,
    sectionKey,
    sectionTitle: sectionKey,
    name,
    address: `${index} Đường Đà Lạt`,
    type: sectionKey,
    openHours: '07:00–22:00',
    style: '',
    highlight: '',
    partnerFlag: options.partner ? 'x' : '',
    isPartner: Boolean(options.partner),
    headPrice: '',
    hasHeadPriceColumn: false,
    price: '',
    phone: '',
    imageUrl,
    imageMapped: true,
    imageMappingKey: id,
    imageSource: 'manual',
    candidateImageUrls: [imageUrl],
  };
}

function dataset(): WorkbookItemsBySection {
  const empty = Object.fromEntries(allSections.map((section) => [section, []])) as unknown as WorkbookItemsBySection;
  empty.check_in = [
    item('check_in', 1, { name: 'Dốc Nhà Bò' }),
    ...Array.from({ length: 18 }, (_, index) => item('check_in', index + 2, { name: `Điểm check-in ${index + 1}` })),
  ];
  empty.cafe = Array.from({ length: 15 }, (_, index) => item('cafe', index + 1, { partner: true }));
  empty.quan_an = Array.from({ length: 10 }, (_, index) => item('quan_an', index + 1, { partner: true }));
  empty.homestay = [
    item('homestay', 1, { name: 'Lagom Homestay' }),
    item('homestay', 2, { name: 'Little Fish Dalat' }),
    item('homestay', 3, { name: 'Tori Wooden House' }),
  ];
  return empty;
}

const itemsBySection = dataset();
const coverImageUrls = Array.from({ length: 10 }, (_, index) => `https://example.invalid/one-way/cover-${index + 1}.jpg`);
const globalUsedItemIds = new Set<string>();
const globalUsedImageUrls = new Set<string>();
const seeds = [
  'one-way-story-main',
  'one-way-story|caption-01|0|lich_trinh_huu_ich',
  'one-way-story|caption-02|1|lich_trinh_huu_ich',
  'one-way-story|caption-03|2|lich_trinh_huu_ich',
];
const expectedHomestays = ['Lagom Homestay', 'Little Fish Dalat', 'Tori Wooden House', 'Lagom Homestay'];

for (let listIndex = 0; listIndex < seeds.length; listIndex += 1) {
  const pages = buildOneWayStoryPages({
    itemsBySection,
    imageUrls: [],
    libraryEntries: [],
    coverImageUrls,
    globalUsedItemIds,
    globalUsedImageUrls,
  }, seeds[listIndex]);

  assert.equal(pages.length, 12, `list ${listIndex + 1}: phải có 12 trang`);
  assert.deepEqual(pages.map((page) => page.layoutVariant), [
    'one-way-story-cover', 'one-way-story-road', 'one-way-story-slope',
    'one-way-story-photo', 'one-way-story-photo', 'one-way-story-photo',
    'one-way-story-photo', 'one-way-story-photo', 'one-way-story-photo',
    'one-way-story-photo', 'one-way-story-photo', 'one-way-story-photo',
  ]);
  assert.equal(pages[0].type, 'cover');
  assert.equal(pages[0].title, BUNDLED_ONE_WAY_HOOKS[0]);
  assert.notEqual(pages[0].backgroundImage, pages[1].backgroundImage, 'hai ảnh Hinh_nen đầu phải khác nhau');

  const road = pages[1];
  assert.equal(road.type, 'list');
  assert.match(road.title, /Nguyễn Văn Trỗi/);
  assert.match(road.subtitle, /Khu Hòa Bình có đường bạn không được rẽ á/);

  const slope = pages[2];
  assert.equal(slope.type, 'list');
  assert.equal(slope.items[0].rawName, 'Dốc Nhà Bò');

  const listPages = pages.slice(2).filter((page) => page.type === 'list');
  const imageUrls = listPages.map((page) => page.items[0]?.imageUrl || '');
  assert.equal(new Set(imageUrls).size, imageUrls.length, `list ${listIndex + 1}: không lặp ảnh`);
  assert.ok(imageUrls.every((url) => url.includes('/one-way/')), 'mọi ảnh phải thuộc đúng bản ghi test');

  const homestayPage = pages[7];
  assert.equal(homestayPage.type, 'list');
  assert.equal(homestayPage.items[0].rawName, expectedHomestays[listIndex], `list ${listIndex + 1}: đúng vòng homestay`);

  for (const pageIndex of [5, 6, 8, 9, 11]) {
    const page = pages[pageIndex];
    assert.equal(page.type, 'list');
    assert.equal(page.items[0].isPartner, true, `trang ${pageIndex + 1}: phải là đối tác`);
    assert.equal(page.title, '', `trang ${pageIndex + 1}: không hiện tên trong title`);
    assert.ok(page.items[0].metaPrimary, `trang ${pageIndex + 1}: có địa chỉ`);
  }
}

assert.equal(getPremadeHookPoolKey('one-way-story'), 'one_way');
assert.equal(BUNDLED_ONE_WAY_HOOKS.length, 4);

const missingPartnerCafe = dataset();
missingPartnerCafe.cafe = missingPartnerCafe.cafe.map((entry) => ({ ...entry, isPartner: false, partnerFlag: '' }));
assert.throws(() => buildOneWayStoryPages({
  itemsBySection: missingPartnerCafe,
  imageUrls: [],
  libraryEntries: [],
  coverImageUrls,
}, 'one-way-story-main'), /cafe đối tác/);

console.log('PASS one-way-story: 4 list, 12 trang/list, đúng vòng homestay, đúng nhóm đối tác, không lặp/sai ảnh và lỗi rõ khi thiếu dữ liệu.');
