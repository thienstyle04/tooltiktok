import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GuideDeck, GuideDeckList, GuideItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { GuideService } from '../guide.service';
import { buildItineraryNoteTimedPages } from '../logic/itinerary-note-timed';

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-timed-note-overrides-'));
const keys: SectionKey[] = ['quan_an', 'cafe', 'check_in', 'khu_du_lich', 'hoat_dong', 'dia_diem_lich_su', 'choi_dem', 'homestay', 'dich_vu'];
const itemsBySection = Object.fromEntries(keys.map((sectionKey) => [sectionKey, Array.from({ length: 10 }, (_, index) => ({
  id: `${sectionKey}-${index}`, sectionKey, sectionTitle: sectionKey, name: `${sectionKey} ${index}`, address: `${index} Cam Ly - Đà Lạt`, type: '', openHours: '', style: '', highlight: '', partnerFlag: index < 5 ? 'X' : '', isPartner: index < 5, headPrice: '', hasHeadPriceColumn: false, price: '', phone: '', imageUrl: '', imageMapped: false, imageMappingKey: '', imageSource: 'fallback', candidateImageUrls: [],
} as GuideItem))])) as WorkbookItemsBySection;
const pages = buildItineraryNoteTimedPages({ itemsBySection }, 'override-test', new Date('2026-09-10T06:00:00Z'));
const list: GuideDeckList = { id: 'itinerary-note-timed-caption-01-test', navTitle: 'Mẫu 01', title: 'Lịch trình Note theo giờ', description: '', pages };
const deck: GuideDeck = { id: 'itinerary-note-timed', navTitle: 'Lịch trình Note theo giờ', title: 'Lịch trình Note theo giờ', description: '', lists: [list] };
const context = { imageUrls: [], coverImageUrls: [], hinhNenImagePools: { regular: [], green: [], dark: [], random: [] }, imageLibraryEntries: [], itemsBySection, baseDecks: [deck], totalItems: 0, mappedItemCount: 0, manualMappedItemCount: 0, autoMappedItemCount: 0 };

try {
  const writeService = new GuideService() as any;
  Object.defineProperty(writeService, 'dataRoot', { value: dataRoot });
  writeService.activeDestinationId = 'dalat';
  writeService.workbookDerivedCache = context;
  const requestItems = pages[0].items.map((item, index) => index === 0
    ? { name: '', metaPrimary: '', scheduleTime: '' }
    : { name: item.name, metaPrimary: item.metaPrimary, scheduleTime: item.scheduleTime });
  const saved = writeService.updatePageText(deck.id, list.id, 0, { title: '', subtitle: pages[0].subtitle, chipText: '', items: requestItems });
  assert.equal(saved.chipText, '');
  assert.equal(saved.items?.[0].name, '');
  assert.equal(saved.items?.[0].metaPrimary, '');
  assert.equal(saved.items?.[0].scheduleTime, '');

  const restarted = new GuideService() as any;
  Object.defineProperty(restarted, 'dataRoot', { value: dataRoot });
  restarted.activeDestinationId = 'dalat';
  restarted.workbookDerivedCache = context;
  const merged = restarted.mergeGeneratedLists([deck]);
  const restored = merged[0].lists[0].pages[0];
  assert.equal(restored.chipText, '');
  assert.equal(restored.items[0].name, '');
  assert.equal(restored.items[0].metaPrimary, '');
  assert.equal(restored.items[0].scheduleTime, '');
  assert.equal(restored.noteStatusTime, pages[0].noteStatusTime);
  console.log('PASS itinerary-note-timed overrides: nhãn ngày, giờ, tên và địa chỉ rỗng tồn tại sau restart; timestamp snapshot không đổi.');
} finally {
  fs.rmSync(dataRoot, { recursive: true, force: true });
}
