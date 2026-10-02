import assert from 'node:assert/strict';
import { buildThreadsToplistPages, buildThreadsToplistExample, THREADS_TOPLIST_ID } from '../logic/threads-toplist';
import { getV2DeckDefinitions, V2_DECK_IDS } from '../logic/deck-builder-v2';
import type { GuideItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';

const itemsBySection = {} as WorkbookItemsBySection;
for (const sectionKey of ['quan_an', 'cafe', 'check_in'] as SectionKey[]) {
  itemsBySection[sectionKey] = Array.from({ length: 8 }, (_, index) => ({
    id: `${sectionKey}-${index}`, sectionKey, name: `${sectionKey} ${index}`,
    address: `Địa chỉ ${index}`, isPartner: index % 2 === 0, imageUrl: '',
  } as GuideItem));
}
assert(V2_DECK_IDS.includes(THREADS_TOPLIST_ID));
const used = new Set<string>();
for (let variation = 0; variation < 8; variation += 1) {
  const pages = buildThreadsToplistPages(itemsBySection, String(variation), used);
  assert.equal(pages.length, 4);
  assert.equal(pages[0].layoutVariant, 'threads-toplist-cover');
  assert.equal(pages[0].title, 'Top list các địa điểm Đà Lạt');
  assert(pages.every(page => page.canvasPreset === 'tiktok-4x5'));
  const lists = pages.slice(1).map(page => {
    assert.equal(page.type, 'list');
    assert.equal(page.layoutVariant, 'threads-toplist-page');
    return page as Extract<typeof page, { type: 'list' }>;
  });
  assert.deepEqual(lists.map(page => page.items.length), [5, 5, 5]);
  assert.deepEqual(lists.map(page => page.title), ['Quán ăn', 'Cà phê', 'Check-in']);
  const items = lists.flatMap(page => page.items);
  assert.equal(new Set(items.map(item => item.name)).size, 15);
  assert(items.every(item => item.label === ''), 'New lists must not retain visible numbering');
  assert(items.every(item => item.metaPrimary && !item.imageUrl));
  assert.equal(used.size, 0, 'Builder must not record usage before saving');
}
assert.throws(() => buildThreadsToplistPages({} as WorkbookItemsBySection, 'empty'), /thiếu Quán ăn: cần 5.*hiện có 0/);
const examples = buildThreadsToplistExample();
assert.equal(examples.length, 4);
assert(examples.slice(1).every(page => page.type === 'list' && page.subtitle.includes('MINH HỌA')));
const emptySections = Object.fromEntries((['quan_an', 'cafe', 'homestay', 'check_in', 'dich_vu', 'choi_dem', 'hoat_dong', 'dia_diem_lich_su', 'khu_du_lich'] as SectionKey[]).map(key => [key, []])) as unknown as WorkbookItemsBySection;
const emptyCatalog = getV2DeckDefinitions({ itemsBySection: emptySections, imageUrls: [], libraryEntries: [], coverImageUrls: [] });
const deck = emptyCatalog.find(item => item.id === THREADS_TOPLIST_ID);
assert(deck, 'Cold catalog must show the new template');
assert.equal(deck.lists[0]?.pages.length, 4);
console.log('PASS threads toplist: cold catalog, 4 pages, 15 unique text-only places, no usage mutation');
