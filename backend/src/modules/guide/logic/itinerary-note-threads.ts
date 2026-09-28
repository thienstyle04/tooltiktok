import type { GuideItem, ListPage, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { stableHash } from './image-resolver';
import { itemUsageKey } from './data-allocator';

export const THREADS_NOTE_IDS = ['itinerary-note-threads-3n2d', 'itinerary-note-threads-2n1d'] as const;
export const isThreadsNote = (id: string) => (THREADS_NOTE_IDS as readonly string[]).includes(id);
const visits: SectionKey[] = ['check_in', 'khu_du_lich', 'hoat_dong', 'dia_diem_lich_su', 'choi_dem'];
const recipes: Record<number, Array<[string, SectionKey[]]>> = {
  9: [['Sáng', ['quan_an']], ['Sáng', ['cafe']], ['Sáng', visits], ['Trưa', ['quan_an']], ['Chiều', visits], ['Chiều', ['cafe']], ['Chiều', visits], ['Tối', ['quan_an']], ['Tối', visits]],
  10: [['Sáng', ['quan_an']], ['Sáng', ['cafe']], ['Sáng', visits], ['Sáng', visits], ['Trưa', ['quan_an']], ['Chiều', visits], ['Chiều', ['cafe']], ['Chiều', visits], ['Chiều', ['quan_an']], ['Chiều', visits]],
  12: [['Sáng', ['quan_an']], ['Sáng', ['cafe']], ['Sáng', visits], ['Sáng', visits], ['Trưa', ['quan_an']], ['Chiều', visits], ['Chiều', ['cafe']], ['Chiều', ['quan_an']], ['Chiều', visits], ['Tối', ['quan_an']], ['Tối', visits], ['Tối', ['cafe']]],
  6: [['Sáng', ['quan_an']], ['Sáng', ['cafe']], ['Sáng', visits], ['Trưa', ['quan_an']], ['Chiều', visits], ['Chiều', ['cafe']]],
  8: [['Sáng', ['quan_an']], ['Sáng', ['cafe']], ['Sáng', visits], ['Trưa', ['quan_an']], ['Chiều', visits], ['Chiều', ['cafe']], ['Chiều', visits], ['Tối', ['quan_an']]],
};
const identity = (item: GuideItem) => item.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');

/** Catalog-only example: never fed to generation or persisted as user data. */
export function buildThreadsNoteExample(deckId: string, destination: string): ListPage[] {
  const itemsBySection = {} as WorkbookItemsBySection;
  for (const sectionKey of ['quan_an', 'cafe', 'check_in'] as SectionKey[]) {
    itemsBySection[sectionKey] = Array.from({ length: 20 }, (_, i) => ({
      id: `example-${sectionKey}-${i}`, name: `${sectionKey === 'quan_an' ? 'Quán ăn' : sectionKey === 'cafe' ? 'Cafe' : 'Điểm check-in'} minh họa ${i + 1}`,
      address: 'Địa chỉ minh họa — không phải dữ liệu thực', sectionKey, isPartner: i % 2 === 0,
    } as GuideItem));
  }
  return buildThreadsNotePages({ itemsBySection }, deckId, 'example', destination).map(page => ({
    ...page, subtitle: 'MẪU MINH HỌA · Cập nhật dữ liệu để tạo list thật',
  }));
}

/** Text-only selection: no image/cache/hook dependency and no mutation of usage state. */
export function buildThreadsNotePages(common: { itemsBySection: WorkbookItemsBySection; globalUsedItemIds?: Set<string> }, deckId: string, seed: string, destination: string): ListPage[] {
  const days = deckId === THREADS_NOTE_IDS[0] ? [9, 9, 8] : [12, 10];
  const slots = days.flatMap((count, day) => recipes[count].map(([period, groups]) => ({ day, period, groups })));
  const pools = slots.map(slot => slot.groups.flatMap(key => common.itemsBySection[key] || []).filter(item => item.name?.trim() && item.address?.trim()));
  const all = pools.flat();
  for (const [label, keys] of [['Quán ăn', ['quan_an']], ['Cafe', ['cafe']], ['tham quan/check-in', visits]] as Array<[string, string[]]>) {
    const needed = slots.filter(s => s.groups.some(k => keys.includes(k))).length;
    const available = new Set(all.filter(x => keys.includes(x.sectionKey)).map(identity)).size;
    if (available < needed) throw new Error(`Note Threads thiếu ${label}: cần ${needed}, hiện có ${available}.`);
  }
  // Augmenting matching avoids exponential quota backtracking. Partner preference
  // is soft: alternate preferred slots, then fall back to any valid same-group venue.
  const owners = new Map<string, number>();
  const chosen: GuideItem[] = new Array(slots.length);
  const localPositions = slots.map((slot, i) => i - slots.findIndex(s => s.day === slot.day));
  const ranked = pools.map((pool, i) => [...pool].sort((a, b) => {
    const preferPartner = localPositions[i] % 2 === 0;
    const score = (x: GuideItem) => Number(Boolean(x.isPartner) !== preferPartner) * 10
      + Number(Boolean(common.globalUsedItemIds?.has(itemUsageKey(x))));
    return score(a) - score(b) || stableHash(seed + i + a.id) - stableHash(seed + i + b.id);
  }));
  function assign(slot: number, seen: Set<string>): boolean {
    for (const item of ranked[slot]) {
      const key = identity(item);
      if (seen.has(key)) continue;
      seen.add(key);
      const owner = owners.get(key);
      if (owner === undefined || assign(owner, seen)) {
        owners.set(key, slot); chosen[slot] = item; return true;
      }
    }
    return false;
  }
  for (const i of slots.map((_, i) => i).sort((a,b) => ranked[a].length - ranked[b].length)) {
    if (!assign(i, new Set())) throw new Error('Note Threads không đủ địa điểm không trùng đúng nhóm. Hãy cập nhật dữ liệu; không tự giảm số điểm.');
  }
  const pages: ListPage[] = days.map((_, day) => ({
    type: 'list', chipTone: 'slate', backgroundImage: '', chipText: `Ngày ${day + 1}`,
    title: `${destination} ${days.length}N${days.length - 1}Đ · Ngày ${day + 1}`, subtitle: 'Lịch trình gợi ý · Chủ động điều chỉnh thời gian',
    layoutVariant: 'itinerary-note-threads-day', canvasPreset: 'tiktok-9x16', titlePlacement: 'top-left',
    items: slots.flatMap((slot, i) => slot.day !== day ? [] : [{
      id: chosen[i].id, sourceKey: itemUsageKey(chosen[i]), sourceSectionKey: chosen[i].sectionKey,
      scheduleTime: '',
      label: slot.period, name: chosen[i].name, rawName: chosen[i].name, metaPrimary: chosen[i].address.trim(), metaSecondary: '',
      imageUrl: '', imageMapped: false, imageSource: 'fallback' as const, imageNote: 'text-only', isPartner: chosen[i].isPartner,
    }]),
  }));
  return [{ ...pages[0], title: `${destination} ${days.length}N${days.length - 1}Đ`, chipText: 'Lịch trình tổng hợp',
    items: pages.flatMap((page, day) => page.items.map(item => ({ ...item, label: `Ngày ${day + 1}|${item.label}` }))),
  }];
}
