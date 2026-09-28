import assert from 'node:assert/strict';
import { buildThreadsNotePages, buildThreadsNoteExample, THREADS_NOTE_IDS } from '../logic/itinerary-note-threads';
import type { WorkbookItemsBySection, GuideItem, SectionKey } from '../../../common/interfaces/guide.types';
const itemsBySection = {} as WorkbookItemsBySection;
for (const sectionKey of ['quan_an', 'cafe', 'check_in'] as SectionKey[]) {
  itemsBySection[sectionKey] = Array.from({ length: 20 }, (_, i) => ({ id: `${sectionKey}-${i}`, name: `${sectionKey} ${i}`, address: `Địa chỉ ${i}`, sectionKey, isPartner: i % 2 === 0 } as GuideItem));
}
for (const id of THREADS_NOTE_IDS) {
  const examples = buildThreadsNoteExample(id, 'Nguồn thử');
  assert.equal(examples.length, 1);
  assert(examples.every(p => p.subtitle.includes('MINH HỌA') && p.items.every(i => i.id?.startsWith('example-'))));
  const used = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const pages = buildThreadsNotePages({itemsBySection, globalUsedItemIds: used}, id, String(i), 'Nguồn thử');
    assert.deepEqual(pages.map(p => p.items.length), id.endsWith('3n2d') ? [26] : [22]);
    const items = pages.flatMap(p => p.items);
    assert.deepEqual([1,2,3].map(day => items.filter(item => item.label.startsWith(`Ngày ${day}|`)).length), id.endsWith('3n2d') ? [9,9,8] : [12,10,0]);
    assert(items.some(i => i.isPartner));
    assert(items.every(i => i.scheduleTime === ''));
    assert.equal(new Set(items.map(i => i.id)).size, items.length);
    assert(items.every(i => i.imageUrl === ''));
    assert.equal(used.size, 0, 'Selection must not consume usage before save');
  }
  assert.throws(() => buildThreadsNotePages({itemsBySection:{} as WorkbookItemsBySection}, id, 'empty', 'Empty'), /thiếu/);
  for (const isPartner of [false, true]) {
    const pool = Object.fromEntries(Object.entries(itemsBySection).map(([key, items]) => [key, items.map(item => ({...item, isPartner}))])) as WorkbookItemsBySection;
    const pages = buildThreadsNotePages({itemsBySection: pool}, id, 'fallback', 'Test');
    assert.equal(pages.flatMap(p => p.items).length, id.endsWith('3n2d') ? 26 : 22);
  }
}
console.log('PASS: 40 lists with 9/9/8 or 12/10 rows; flexible partners, unique places, no usage mutation; empty pools rejected');
