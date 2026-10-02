import assert from 'node:assert/strict';
import type { GuideItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { buildThreadsCafePages, buildThreadsFoodPages, buildThreadsMixPages, buildThreadsMixTextPages, threadsCafeCaption, threadsFoodCaption, threadsMixCaption, threadsMixTextCaption } from '../logic/threads-food-local';

function food(index: number, partner: boolean, classification = 'Local'): GuideItem {
  const id = (partner ? 'partner-' : 'local-') + index;
  const imageUrl = 'https://example.invalid/' + id + '.jpg';
  return {
    id, sectionKey: 'quan_an', sectionTitle: 'Quán ăn', name: 'Quán ' + id,
    address: partner ? '12 Đường Quán ' + index + ', Đà Lạt' : '', type: 'Quán ăn', openHours: '', style: '', highlight: '',
    partnerFlag: partner ? 'x' : '', isPartner: partner, classification,
    headPrice: '', hasHeadPriceColumn: false, price: '', phone: '',
    imageUrl, imageMapped: true, imageMappingKey: id, imageSource: 'manual',
    candidateImageUrls: [imageUrl],
  };
}

const pool = (partners: number, locals: number) => ({
  quan_an: [
    ...Array.from({ length: partners }, (_, index) => food(index + 1, true)),
    ...Array.from({ length: locals }, (_, index) => food(index + 1, false)),
    food(99, false, 'Khách du lịch'),
  ],
}) as WorkbookItemsBySection;

assert.throws(() => buildThreadsFoodPages(pool(0, 8), 'empty'), /đối tác có địa chỉ \(hiện có 0\)/);
assert.throws(() => buildThreadsFoodPages(pool(4, 8), 'four'), /đối tác có địa chỉ \(hiện có 4\)/);
assert.throws(() => buildThreadsFoodPages(pool(7, 4), 'few-local'), /Local.*\(hiện có 4\)/);

const built = buildThreadsFoodPages(pool(7, 10), 'first');
assert.equal(built.length, 1);
const page = built[0];
assert.equal(page.type, 'list');
if (page.type !== 'list') throw new Error('Expected list page');
assert.equal(page.items.length, 10);
assert.equal(page.items.filter((item) => item.isPartner).length, 5);
assert.ok(page.items.filter((item) => item.isPartner).every((item) => item.metaPrimary.includes('Đà Lạt')));
assert.ok(page.items.filter((item) => item.isLocal).every((item) => !item.metaPrimary));
assert.equal(page.items.filter((item) => item.isLocal).length, 5);
assert.equal(new Set(page.items.map((item) => item.name)).size, 10);
assert.equal(page.items.filter((item) => item.imageUrl).length, 6);
assert.equal(page.items.filter((item) => item.imageUrl && item.isPartner).length, 3);
assert.equal(page.items.filter((item) => item.imageUrl && item.isLocal).length, 3);
assert.equal(new Set(page.items.filter((item) => item.imageUrl).map((item) => item.imageUrl)).size, 6);
assert.ok(threadsFoodCaption().includes('?'));
assert.ok(threadsFoodCaption().includes('Tuiiiii'));
const next = buildThreadsFoodPages(pool(7, 10), 'second', new Set(page.items.map((item) => item.sourceKey || '')))[0];
if (next.type !== 'list') throw new Error('Expected second list page');
assert.ok(next.items.some((item) => !page.items.some((previous) => previous.name === item.name)), 'list sau cần ưu tiên quán chưa dùng');

const noPhoto = pool(7, 10);
for (const item of noPhoto.quan_an.filter((item) => item.isPartner).slice(2)) item.imageMapped = false;
assert.throws(() => buildThreadsFoodPages(noPhoto, 'no-photo'), /ảnh riêng hợp lệ/);
const noAddress = pool(7, 10);
for (const item of noAddress.quan_an.filter((item) => item.isPartner).slice(4)) item.address = '';
assert.throws(() => buildThreadsFoodPages(noAddress, 'no-address'), /đối tác có địa chỉ \(hiện có 4\)/);
const cafePool = { cafe: pool(7, 10).quan_an.map((item) => ({ ...item, sectionKey: 'cafe' })) } as WorkbookItemsBySection;
const cafePages = buildThreadsCafePages(cafePool, 'cafe-first');
assert.equal(cafePages.length, 1);
assert.equal(cafePages[0].type, 'list');
if (cafePages[0].type !== 'list') throw new Error('Expected cafe list page');
assert.equal(cafePages[0].items.length, 10);
assert.equal(cafePages[0].items.filter((item) => item.isPartner).length, 5);
assert.equal(cafePages[0].items.filter((item) => item.isLocal).length, 5);
assert.equal(cafePages[0].items.filter((item) => item.imageUrl).length, 6);
assert.ok(cafePages[0].items.every((item) => item.sourceSectionKey === 'cafe'));
assert.ok(cafePages[0].title.includes('Cà phê'));
assert.ok(threadsCafeCaption().includes('?'));
assert.throws(() => buildThreadsCafePages({ cafe: cafePool.cafe.filter((item) => !item.isPartner) } as WorkbookItemsBySection, 'no-cafe-partner'), /Threads Cà phê cần 5 quán đối tác/);
const mixedItem = (index: number, sectionKey: SectionKey, partner: boolean): GuideItem => ({
  ...food(index, partner), sectionKey,
});
const mixPool = {
  quan_an: [mixedItem(1, 'quan_an', true), mixedItem(6, 'quan_an', true), mixedItem(11, 'quan_an', false)],
  cafe: [mixedItem(2, 'cafe', true), mixedItem(12, 'cafe', false)],
  homestay: [mixedItem(3, 'homestay', true), mixedItem(13, 'homestay', false)],
  dich_vu: [mixedItem(4, 'dich_vu', true), mixedItem(14, 'dich_vu', false)],
  choi_dem: [mixedItem(5, 'choi_dem', true), mixedItem(15, 'choi_dem', false)],
  check_in: [mixedItem(16, 'check_in', false)],
  khu_du_lich: [mixedItem(17, 'khu_du_lich', false)],
  hoat_dong: [mixedItem(18, 'hoat_dong', false)],
} as WorkbookItemsBySection;
const mixPages = buildThreadsMixPages(mixPool, 'mix-first');
assert.equal(mixPages.length, 1);
assert.equal(mixPages[0].type, 'list');
if (mixPages[0].type !== 'list') throw new Error('Expected mixed list page');
assert.equal(mixPages[0].items.length, 10);
assert.equal(mixPages[0].items.filter((item) => item.isPartner).length, 5);
assert.equal(mixPages[0].items.filter((item) => item.imageUrl).length, 6);
assert.equal(new Set(mixPages[0].items.map((item) => item.sourceSectionKey)).size >= 4, true);
assert.equal(new Set(mixPages[0].items.map((item) => item.name)).size, 10);
assert.equal(new Set(mixPages[0].items.filter((item) => item.imageUrl).map((item) => item.imageUrl)).size, 6);
assert.ok(threadsMixCaption().includes('?'));
assert.throws(() => buildThreadsMixPages({ check_in: mixPool.check_in } as WorkbookItemsBySection, 'mix-no-partner'), /đối tác có địa chỉ/);
const textPages = buildThreadsMixTextPages(mixPool, 'mix-text-first');
assert.equal(textPages.length, 1);
assert.equal(textPages[0].type, 'list');
if (textPages[0].type !== 'list') throw new Error('Expected text-only mixed list page');
assert.equal(textPages[0].items.length, 12);
assert.equal(textPages[0].items.filter((item) => item.isPartner).length, 6);
assert.equal(textPages[0].items.filter((item) => item.imageUrl).length, 0);
assert.ok(new Set(textPages[0].items.map((item) => item.sourceSectionKey)).size >= 4);
assert.equal(new Set(textPages[0].items.map((item) => item.name)).size, 12);
assert.ok(threadsMixTextCaption().includes('?'));
assert.throws(() => buildThreadsMixTextPages({ check_in: mixPool.check_in } as WorkbookItemsBySection, 'text-no-partner'), /6 đối tác có địa chỉ/);
console.log('Threads food source selection OK');
