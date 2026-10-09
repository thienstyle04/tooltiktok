import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { WorkbookItemsBySection, GuideItem, GuideDeckList, PartnerRotationHistory } from '../../../common/interfaces/guide.types';
import { buildThreadsNotePages } from '../logic/itinerary-note-threads';
import { itemUsageKey } from '../logic/data-allocator';
import { rotatePartnerList } from '../logic/partner-rotation';

const pools = {} as WorkbookItemsBySection;
for (const sectionKey of ['quan_an', 'cafe', 'check_in', 'choi_dem'] as const) {
  pools[sectionKey] = Array.from({ length: 24 }, (_, i) => ({ id: `${sectionKey}-${i}`, name: `${sectionKey} ${i}`,
    sectionKey, address: `Địa chỉ ${i}`, type: '', isPartner: i % 2 === 0 } as GuideItem));
}
const dinner = { id: 'tac-dinner', name: 'Tắc kè hoa', sectionKey: 'quan_an', type: 'Ăn Tối',
  address: '4 Nguyễn Văn Trỗi, Xuân Hương - Đà Lạt', openHours: '18:00 - 00:00', isPartner: true } as GuideItem;
pools.quan_an.push(dinner, { ...dinner, id: 'tac-snack', type: 'Ăn Vặt' });
pools.cafe.push({ ...dinner, id: 'tac-cafe', name: 'Tắc Kè Hoa', sectionKey: 'cafe' });
const norm = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const matches = (item: any) => norm(item.rawName || item.name).includes('tac ke hoa');
const old2n1d = Array.from({ length: 12 }, (_, i) => buildThreadsNotePages({ itemsBySection: pools }, 'itinerary-note-threads-2n1d', `tac-${i}`, 'Đà Lạt'));
const checksum = crypto.createHash('sha256').update(JSON.stringify(old2n1d)).digest('hex');
if (process.env.THREADS_TAC_CAPTURE) { console.log('UNCHANGED_2N1D=' + checksum); process.exit(0); }
assert.equal(checksum, '2c6591796f48281a025f7bbbcc727c4872871df1e439a6e59c3e488f84bdd2c8', '2N1Đ must not change');

const used = new Set([itemUsageKey(dinner)]), beforePools = JSON.stringify(pools);
let history: PartnerRotationHistory = {};
for (let i = 0; i < 12; i++) {
  const pages = buildThreadsNotePages({ itemsBySection: pools, globalUsedItemIds: used }, 'itinerary-note-threads-3n2d', `tac-${i}`, 'Đà Lạt');
  assert.equal(pages[0].items.length, 18);
  assert.equal(new Set(pages[0].items.map(item => norm(item.name))).size, 18);
  const chosen = pages[0].items.filter(matches);
  assert.equal(chosen.length, 1); assert.equal(chosen[0].id, 'tac-dinner'); assert(chosen[0].isPartner);
  assert(chosen[0].label.endsWith('|Tối')); assert.equal(chosen[0].sourceSectionKey, 'quan_an');
  const list = { id: `itinerary-note-threads-3n2d-caption-${i}`, navTitle: 'Thử', title: '', description: '', pages } as GuideDeckList;
  const result = rotatePartnerList(list, 'itinerary-note-threads-3n2d', pools, history, `rotate-${i}`);
  const target = result.list.pages.flatMap((page: any) => page.items || []).filter(matches);
  assert.equal(target.length, 1); assert(target[0].label.endsWith('|Tối'));
  const key = Object.keys(result.history).find(key => key.includes('tac_ke_hoa'))!;
  assert(key); if (history[key]) assert.notEqual(result.history[key].position, history[key].position);
  history = result.history;
}
assert.equal(JSON.stringify(pools), beforePools); assert.equal(used.size, 1);
const unavailable = structuredClone(pools);
unavailable.quan_an = unavailable.quan_an.map(item => matches(item) ? { ...item, isPartner: false } : item);
// Without an eligible partner dinner row, do not invent/force a partner.
const fallback = buildThreadsNotePages({ itemsBySection: unavailable }, 'itinerary-note-threads-3n2d', 'fallback', 'Đà Lạt');
assert.equal(fallback[0].items.length, 18);
console.log('PASS Tắc Kè Hoa: 12 new 3N2Đ lists include one real dinner partner, valid evening/rotating position; no duplicate cafe/snack row; 2N1Đ unchanged; no usage/source mutation.');
