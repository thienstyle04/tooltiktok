import assert from 'node:assert/strict';
import { buildThreadsNotePages, buildThreadsNoteExample, THREADS_NOTE_IDS, threadsNoteCaption } from '../logic/itinerary-note-threads';
import type { WorkbookItemsBySection, GuideItem, SectionKey } from '../../../common/interfaces/guide.types';
const itemsBySection = {} as WorkbookItemsBySection;
for (const sectionKey of ['quan_an', 'cafe', 'check_in', 'choi_dem'] as SectionKey[]) {
  itemsBySection[sectionKey] = Array.from({ length: 20 }, (_, i) => ({ id: `${sectionKey}-${i}`, name: `${sectionKey} ${i}`, address: `Địa chỉ ${i}`, sectionKey, isPartner: i % 2 === 0 } as GuideItem));
}
for (const id of THREADS_NOTE_IDS) {
  const captions = [0, 1, 2].map(variant => threadsNoteCaption(id, variant));
  assert.equal(new Set(captions).size, 3);
  assert(captions.every(caption => caption.length <= 150 && /lưu|save|cmt/i.test(caption)));
  assert(captions.every(caption => caption.includes(id.endsWith('3n2d') ? '3N2Đ' : '2N1Đ')));
  const examples = buildThreadsNoteExample(id, 'Nguồn thử');
  assert.equal(examples.length, 1);
  assert(examples.every(p => p.canvasPreset === 'tiktok-3x4'));
  assert(examples.every(p => p.subtitle.includes('MINH HỌA') && p.items.every(i => i.id?.startsWith('example-'))));
  if (id.endsWith('2n1d')) assert.equal(examples[0].items.filter(item => item.sourceSectionKey === 'choi_dem').length, 2);
  const used = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const pages = buildThreadsNotePages({itemsBySection, globalUsedItemIds: used}, id, String(i), 'Nguồn thử');
    assert(pages.every(p => p.canvasPreset === 'tiktok-3x4'));
    assert.deepEqual(pages.map(p => p.items.length), [18]);
    const items = pages.flatMap(p => p.items);
    assert.deepEqual([1,2,3].map(day => items.filter(item => item.label.startsWith(`Ngày ${day}|`)).length), id.endsWith('3n2d') ? [6,6,6] : [9,9,0]);
    for (const day of (id.endsWith('3n2d') ? [1,2,3] : [1,2])) {
      const daily = items.filter(item => item.label.startsWith(`Ngày ${day}|`));
      assert(daily.some(item => item.label.endsWith('|Tối') && item.sourceSectionKey === 'quan_an'));
      assert(daily.some(item => item.sourceSectionKey === 'cafe'));
      assert(daily.some(item => item.sourceSectionKey === 'check_in'));
      const breakfast = daily.findIndex(item => item.label.endsWith('|Sáng') && item.sourceSectionKey === 'quan_an');
      const firstMorningVisit = daily.findIndex(item => item.label.endsWith('|Sáng') && item.sourceSectionKey === 'check_in');
      assert(breakfast >= 0 && firstMorningVisit > breakfast, 'Ăn sáng phải đứng trước tham quan/check-in buổi sáng');
      const dinner = daily.findIndex(item => item.label.endsWith('|Tối') && item.sourceSectionKey === 'quan_an');
      const night = daily.findIndex(item => item.sourceSectionKey === 'choi_dem');
      assert(night < 0 || night > dinner, 'Ăn tối phải đứng trước địa điểm chơi đêm');
      assert(daily.every(item => item.sourceSectionKey !== 'choi_dem' || item.label.endsWith('|Tối')));
      if (id.endsWith('2n1d')) assert(night > dinner, 'Có dữ liệu chơi đêm thì chọn sau bữa tối');
    }
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
    assert.equal(pages.flatMap(p => p.items).length, 18);
  }
}
console.log('PASS: 40 lists with 6/6/6 or 9/9 rows; flexible partners, unique places, no usage mutation; empty pools rejected');
