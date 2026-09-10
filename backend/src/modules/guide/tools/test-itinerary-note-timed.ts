import assert from 'node:assert/strict';
import type { GuideItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { buildItineraryNoteTimedPages } from '../logic/itinerary-note-timed';
import { getV2DeckDefinitions, V2_DECK_IDS } from '../logic/deck-builder-v2';
import { setActiveDestinationLocalize } from '../sync/destination-localize';

const keys: SectionKey[] = ['quan_an', 'cafe', 'check_in', 'khu_du_lich', 'hoat_dong', 'dia_diem_lich_su', 'choi_dem', 'homestay', 'dich_vu'];
function item(sectionKey: SectionKey, index: number, isPartner: boolean): GuideItem {
  const id = `${sectionKey}-${index}`;
  return {
    id, sectionKey, sectionTitle: sectionKey, name: `${sectionKey} ${index}`,
    address: `${index} Ngô Quyền, Cam Ly - Đà Lạt`, type: sectionKey, openHours: '', style: '', highlight: '',
    partnerFlag: isPartner ? 'X' : '', isPartner, headPrice: '', hasHeadPriceColumn: false, price: '', phone: '',
    imageUrl: '', imageMapped: false, imageMappingKey: id, imageSource: 'fallback', candidateImageUrls: [],
  };
}

const pools = Object.fromEntries(keys.map((key) => [key,
  Array.from({ length: 10 }, (_, index) => item(key, index + 1, index < (key === 'quan_an' ? 5 : 3))),
])) as WorkbookItemsBySection;

assert.ok(V2_DECK_IDS.includes('itinerary-note-timed'));
setActiveDestinationLocalize('greenland');
assert.ok(!getV2DeckDefinitions({ itemsBySection: pools, imageUrls: [], libraryEntries: [], coverImageUrls: [] }).some((deck) => deck.id === 'itinerary-note-timed'));
setActiveDestinationLocalize('dalat');
const pages = buildItineraryNoteTimedPages({ itemsBySection: pools, globalUsedItemIds: new Set<string>() }, 'timed-test', new Date('2026-09-09T17:05:00.000Z'));
assert.equal(pages.length, 2);
assert.equal(pages[0].layoutVariant, 'itinerary-note-timed-day');
assert.equal(pages[1].layoutVariant, 'itinerary-note-timed-day');
assert.equal(pages[0].canvasPreset, 'tiktok-9x16');
assert.equal(pages[0].noteStatusTime, '00:05');
assert.equal(pages[0].subtitle, '00:05 ngày 10 tháng 9, 2026');
assert.equal(pages[0].chipText, '🌷 Ngày 1');
assert.equal(pages[1].chipText, '🌷 Ngày 2');
assert.equal(pages[0].items.length, 8);
assert.equal(pages[1].items.length, 7);
assert.equal(pages[0].items.filter((entry) => entry.isPartner).length, 4);
assert.equal(pages[1].items.filter((entry) => entry.isPartner).length, 3);
assert.equal(pages[1].items.filter((entry) => entry.fixedRow).length, 2);
assert.deepEqual(pages[1].items.slice(-2).map((entry) => entry.scheduleTime), ['13:30–14:30', '14:30–15:00']);
assert.deepEqual(pages[1].items.slice(-2).map((entry) => entry.name), ['Về khách sạn lấy đồ', 'Khởi hành về']);

const venueItems = pages.flatMap((page) => page.items).filter((entry) => !entry.fixedRow);
assert.equal(venueItems.length, 13);
assert.equal(new Set(venueItems.map((entry) => entry.rawName)).size, 13);
assert.equal(new Set(venueItems.filter((entry) => entry.isPartner).map((entry) => entry.rawName)).size, 7);
assert.ok(venueItems.every((entry) => entry.metaPrimary.endsWith('Cam Ly - Đà Lạt')));
assert.ok(venueItems.every((entry) => !entry.imageUrl));
for (const page of pages) {
  for (const key of ['check_in', 'khu_du_lich', 'hoat_dong', 'dia_diem_lich_su'] as SectionKey[]) {
    assert.ok(page.items.filter((entry) => entry.sourceSectionKey === key).length <= 2);
  }
}
assert.deepEqual(pages[0].items.map((entry) => entry.scheduleTime), ['07:00–07:45', '08:15–09:15', '10:00–11:15', '11:15–12:15', '14:15–15:30', '16:00–17:15', '17:30–19:00', '19:00–21:00']);

const noPartners = Object.fromEntries(keys.map((key) => [key, pools[key].map((entry) => ({ ...entry, isPartner: false, partnerFlag: '' }))])) as WorkbookItemsBySection;
assert.throws(() => buildItineraryNoteTimedPages({ itemsBySection: noPartners }, 'missing-partners'), /cần đúng 7 đối tác/);
assert.throws(() => buildItineraryNoteTimedPages({ itemsBySection: { ...pools, choi_dem: [] } }, 'missing-night'), /choi_dem/);

console.log('PASS itinerary-note-timed: 2 trang, giờ cố định, 13 địa điểm không trùng, 4\/3 đối tác, 2 dòng cố định, snapshot giờ Việt Nam và lỗi thiếu dữ liệu.');
