import assert from 'node:assert/strict';
import { buildThreadsBudgetExample, buildThreadsBudgetPages, threadsBudgetCaption, THREADS_BUDGET_ID } from '../logic/itinerary-note-threads-budget';
import { DataAllocator } from '../logic/data-allocator';
import { buildPagesForDeck } from '../logic/deck-builder';
import type { GuideItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';

const itemsBySection = {} as WorkbookItemsBySection;
for (const sectionKey of ['quan_an', 'cafe', 'check_in', 'homestay', 'dich_vu'] as SectionKey[]) {
  itemsBySection[sectionKey] = Array.from({ length: 12 }, (_, i) => ({
    id: `${sectionKey}-${i}`, name: `${sectionKey} ${i}`, address: `Địa chỉ ${i}`,
    sectionKey, type: sectionKey === 'dich_vu' ? 'Xe dịch vụ' : '', headPrice: i % 3 ? `${40 + i}k` : '',
    price: '', isPartner: i % 2 === 0,
    imageUrl: `/assets/drive-file?id=source-image-${i}`, candidateImageUrls: ['/assets/drive-file?id=candidate-image'],
  } as GuideItem));
}
itemsBySection.homestay.forEach(item => { item.headPrice = '200000'; item.price = '450k - 700k'; });
const captions = [0, 1, 2].map(threadsBudgetCaption);
assert.equal(new Set(captions).size, 3);
assert(captions.every(caption => caption.includes('3N2Đ') && /lưu|save|cmt/i.test(caption)));
const examples = buildThreadsBudgetExample('Đà Lạt');
assert.equal(examples.length, 1);
assert.match(examples[0].subtitle, /MẪU MINH HỌA/);
assert.equal(examples[0].items.length, 15);
assert(examples[0].items.every(item => item.metaSecondary), 'Catalog example should show a complete illustrative total');
assert(examples[0].items.filter(item => item.label === 'Lưu trú').every(item => item.metaSecondary?.endsWith('đ/người')));
assert(examples[0].items.every(item => !item.imageUrl && !(item.candidateImageUrls || []).length));
for (let i = 0; i < 12; i++) {
  const pages = buildThreadsBudgetPages(itemsBySection, `seed-${i}`, 'Đà Lạt');
  assert.equal(pages.length, 1);
  const page = pages[0];
  assert.equal(page.layoutVariant, 'itinerary-note-threads-budget');
  assert.equal(page.canvasPreset, 'tiktok-3x4');
  assert.equal(page.items.length, 15);
  assert.deepEqual(['Di chuyển', 'Lưu trú', 'Ngày 1', 'Ngày 2', 'Ngày 3'].map(group => page.items.filter(item => item.label === group).length), [2, 1, 4, 4, 4]);
  const venues = page.items.filter(item => /^Ngày/.test(item.label));
  assert.equal(new Set(venues.map(item => item.name)).size, 12);
  assert(page.backgroundImage === '');
  assert(page.items.every(item => item.imageUrl === '' && !(item.candidateImageUrls || []).length));
  assert(venues.every(item => item.sourceSectionKey));
  const lodging = page.items.filter(item => item.label === 'Lưu trú');
  assert(lodging.every(item => item.name === String(item.rawName).trim()), 'Lodging rows should display only the homestay name');
  assert.equal(lodging.length, 1, 'Only one homestay appears in the expense table');
  assert(lodging.every(item => item.sourceSectionKey === 'homestay' && item.metaSecondary === '200.000 đ/người'));
  assert(!page.items.some(item => item.name === 'Check-in sớm'));
}
const used = new DataAllocator();
const batches = [0, 1].map(index => {
  const pages = buildThreadsBudgetPages(itemsBySection, `batch-${index}`, 'Đà Lạt', used.itemIds);
  used.markPages(pages);
  return pages[0].items;
});
const firstIds = new Set(batches[0].map(item => item.id));
assert.equal(batches[1].filter(item => firstIds.has(item.id)).length, 0, 'Second list should use fresh transport, stays, and daily venues when enough exist');
assert.equal(new Set(batches[1].map(item => item.rawName)).size, 15, 'All places within one list must be distinct');
assert(batches[0].filter(item => item.sourceSectionKey === 'quan_an').every(item => item.isPartner), 'Unused partners should remain preferred within their group');
assert.equal(buildThreadsBudgetPages(itemsBySection, 'batch-2', 'Đà Lạt', used.itemIds)[0].items.length, 15, 'Reuse must remain possible after a group is exhausted');
const seedChoices = new Set(Array.from({ length: 10 }, (_, index) =>
  buildThreadsBudgetPages(itemsBySection, `different-seed-${index}`, 'Đà Lạt')[0].items
    .filter(item => item.label === 'Lưu trú').map(item => item.id).join('|')));
assert(seedChoices.size >= 3, 'Different seeds should not keep choosing the same homestay');
const wiredUsage = new DataAllocator();
const wiredFirst = buildPagesForDeck(THREADS_BUDGET_ID, itemsBySection, [], [], 'wired-0');
wiredUsage.markPages(wiredFirst);
const wiredSecond = buildPagesForDeck(THREADS_BUDGET_ID, itemsBySection, [], [], 'wired-1', wiredUsage.itemIds);
const wiredFirstIds = new Set(wiredFirst.flatMap(page => page.type === 'list' ? page.items.map(item => item.id) : []));
assert.equal(wiredSecond.flatMap(page => page.type === 'list' ? page.items : []).filter(item => wiredFirstIds.has(item.id)).length, 0, 'Public deck builder must forward used IDs to the Threads budget selector');
const priceOnly = Object.fromEntries(Object.entries(itemsBySection).map(([key, items]) => [key, items.map(item => ({ ...item, headPrice: key === 'homestay' ? item.headPrice : '', price: '999.000 đ' }))])) as WorkbookItemsBySection;
const priceOnlyRows = buildThreadsBudgetPages(priceOnly, 'head-price-only', 'Đà Lạt')[0].items;
assert(priceOnlyRows.filter(item => item.label !== 'Lưu trú').every(item => item.metaSecondary === ''), 'Cột Tiền không được lấy giá thường khi Giá đầu người trống');
assert.throws(() => buildThreadsBudgetPages({} as WorkbookItemsBySection, 'empty', 'Đà Lạt'), /thiếu Quán ăn/);
itemsBySection.homestay.forEach(item => { item.headPrice = ''; });
assert.throws(() => buildThreadsBudgetPages(itemsBySection, 'price-range-only', 'Đà Lạt'), /thiếu Homestay có giá đầu người: cần 1, hiện có 0/);
itemsBySection.homestay[0].headPrice = '200k';
const onePricedStay = buildThreadsBudgetPages(itemsBySection, 'one-priced-stay', 'Đà Lạt')[0].items.filter(item => item.label === 'Lưu trú');
assert.equal(onePricedStay.length, 1);
assert.equal(onePricedStay[0].metaSecondary, '200.000 đ/người');
itemsBySection.homestay[1].headPrice = '350000';
itemsBySection.homestay[1].name = itemsBySection.homestay[0].name;
assert.equal(buildThreadsBudgetPages(itemsBySection, 'duplicate-stay', 'Đà Lạt')[0].items.filter(item => item.label === 'Lưu trú').length, 1);
itemsBySection.homestay[1].name = 'homestay 1';
const formattedStays = buildThreadsBudgetPages(itemsBySection, 'two-priced-stays', 'Đà Lạt')[0].items.filter(item => item.label === 'Lưu trú');
assert.equal(formattedStays.length, 1);
assert(['200.000 đ/người', '350.000 đ/người'].includes(formattedStays[0].metaSecondary));
console.log('PASS: Threads budget one priced homestay, Giá đầu người only, 15 text-only rows, cross-list diversity, reuse after exhaustion');
