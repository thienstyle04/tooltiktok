import assert from 'node:assert/strict';
import type { GuideItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { buildSpotlightV4Pages, getV2DeckDefinitions, V2_DECK_IDS } from '../logic/deck-builder-v2';
import { setActiveDestinationLocalize } from '../sync/destination-localize';

const sectionKeys: SectionKey[] = ['quan_an', 'cafe', 'homestay', 'check_in', 'dich_vu', 'choi_dem', 'hoat_dong', 'dia_diem_lich_su', 'khu_du_lich'];

function item(sectionKey: SectionKey, index: number): GuideItem {
  const id = `${sectionKey}-${index}`;
  const imageUrl = `https://example.invalid/venue/${id}.jpg`;
  return {
    id, sectionKey, sectionTitle: sectionKey, name: `Địa điểm ${sectionKey} ${index}`,
    address: `${index} Ngô Quyền, Cam Ly - Đà Lạt`, type: sectionKey,
    openHours: '07:00 - 22:00', style: '', highlight: '', partnerFlag: '', isPartner: false,
    headPrice: '', hasHeadPriceColumn: false, price: '', phone: '', imageUrl,
    imageMapped: true, imageMappingKey: id, imageSource: 'manual', candidateImageUrls: [imageUrl],
  };
}

const itemsBySection = Object.fromEntries(sectionKeys.map((key) => [
  key,
  key === 'homestay' || key === 'dich_vu' ? [] : Array.from({ length: 3 }, (_, index) => item(key, index + 1)),
])) as WorkbookItemsBySection;
const blockedBackground = '/assets/drive-file?id=10Ag0aESSGkGCmExm3UuWxWFGRyYb0M8-';
const coverImages = [blockedBackground, ...Array.from({ length: 12 }, (_, index) => `https://example.invalid/hinh-nen/${index + 1}.jpg`)];
const usedItems = new Set<string>();
const usedImages = new Set<string>();
const hooks = ['Hook V4 A', 'Hook V4 B', 'Hook V4 C'];
assert.ok(V2_DECK_IDS.includes('spotlight-v4'), 'V4 phải được đăng ký trong catalog V2');
setActiveDestinationLocalize('greenland');
const catalog = getV2DeckDefinitions({ itemsBySection, imageUrls: [], libraryEntries: [], coverImageUrls: coverImages });
assert.equal(catalog.find((deck) => deck.id === 'spotlight-v4')?.navTitle, 'Spotlight V4');
setActiveDestinationLocalize('dalat');

const build = (seed: string) => buildSpotlightV4Pages({
  itemsBySection,
  imageUrls: [],
  libraryEntries: [],
  coverImageUrls: coverImages,
  globalUsedItemIds: usedItems,
  globalUsedImageUrls: usedImages,
}, seed, { hooks, destinationId: 'dalat' });

const first = build('spotlight-v4-list-1');
assert.equal(first.length, 14);
assert.deepEqual(first.map((page) => page.layoutVariant), [
  'spotlight-v4-cover', 'spotlight-v4-image',
  'spotlight-v4-page', 'spotlight-v4-page', 'spotlight-v4-image',
  'spotlight-v4-page', 'spotlight-v4-page', 'spotlight-v4-image',
  'spotlight-v4-page', 'spotlight-v4-image', 'spotlight-v4-page',
  'spotlight-v4-image', 'spotlight-v4-page', 'spotlight-v4-page',
]);
assert.ok(hooks.includes(first[0].title));
const firstImages = first.filter((page) => page.backgroundImage).map((page) => page.backgroundImage);
assert.equal(new Set(firstImages).size, 14, 'ảnh Hinh_nen và ảnh địa điểm trong list không được trùng');
assert.ok(!firstImages.includes(blockedBackground), 'V4 phải loại ảnh 111.png trùng cảnh Phân Viện Sinh Học');
const firstVenuePages = first.filter((page) => page.layoutVariant === 'spotlight-v4-page');
assert.equal(new Set(firstVenuePages.map((page) => page.type === 'list' ? page.items[0].id : '')).size, 8);
assert.deepEqual(new Set(firstVenuePages.map((page) => page.type === 'list' ? page.items[0].sourceSectionKey : '')), new Set(['quan_an', 'cafe', 'check_in', 'khu_du_lich', 'hoat_dong', 'dia_diem_lich_su', 'choi_dem']));
assert.ok(firstVenuePages.every((page) => page.type === 'list' && page.items[0].metaSecondary === ''));
assert.ok(firstVenuePages.every((page) => page.type === 'list' && !/^(?:Đường|Phường)\s/i.test(page.items[0].metaPrimary)));

const second = build('spotlight-v4-list-2');
const secondVenueIds = second.filter((page) => page.layoutVariant === 'spotlight-v4-page').map((page) => page.type === 'list' ? page.items[0].id : '');
assert.equal(new Set([...firstVenuePages.map((page) => page.type === 'list' ? page.items[0].id : ''), ...secondVenueIds]).size, 16, 'địa điểm tiếp tục luân phiên giữa hai list');
const secondHinhNen = second.filter((page) => page.layoutVariant === 'spotlight-v4-cover' || page.layoutVariant === 'spotlight-v4-image').map((page) => page.backgroundImage);
const firstHinhNen = first.filter((page) => page.layoutVariant === 'spotlight-v4-cover' || page.layoutVariant === 'spotlight-v4-image').map((page) => page.backgroundImage);
assert.equal(new Set([...firstHinhNen, ...secondHinhNen]).size, 12, 'hai list dùng luân phiên pool Hinh_nen');

assert.throws(() => buildSpotlightV4Pages({
  itemsBySection,
  imageUrls: [],
  libraryEntries: [],
  coverImageUrls: coverImages.slice(0, 5),
}, 'spotlight-v4-short-images'), /ít nhất 6 ảnh Hinh_nen/);

const shortage = Object.fromEntries(sectionKeys.map((key) => [key, key === 'quan_an' ? itemsBySection.quan_an : key === 'cafe' ? itemsBySection.cafe : []])) as WorkbookItemsBySection;
assert.throws(() => buildSpotlightV4Pages({
  itemsBySection: shortage,
  imageUrls: [],
  libraryEntries: [],
  coverImageUrls: coverImages,
}, 'spotlight-v4-short-venues'), /ít nhất 8 địa điểm/);

console.log('PASS spotlight-v4: đúng 14 trang, hook, ảnh Hinh_nen luân phiên, 8 venue đa nhóm không trùng và lỗi thiếu dữ liệu rõ ràng.');
