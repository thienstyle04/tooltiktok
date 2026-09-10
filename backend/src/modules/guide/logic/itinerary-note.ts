import type { GuideItem, SectionKey, ListPage, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { itemUsageKey } from './data-allocator';
import { stableHash } from './image-resolver';

export const ITINERARY_NOTE_TEMPLATE_VERSION = 2;
export const ITINERARY_NOTE_CAPTION = 'Mình tổng hợp lịch trình Đà Lạt 2 ngày như hình bên dưới.\nMọi người xem giúp mình lịch này có ổn không, có điểm nào nên ghé thêm không ạ?';
const visits: SectionKey[] = ['check_in', 'khu_du_lich', 'hoat_dong', 'dia_diem_lich_su', 'choi_dem'];
const PARTNER_TARGETS = [4, 3] as const;
const identity = (item: GuideItem) => item.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');

export function buildItineraryNotePages(common: { itemsBySection: WorkbookItemsBySection; globalUsedItemIds?: Set<string> }, seed: string, now = new Date()): ListPage[] {
  const pools = Object.fromEntries(['quan_an', 'cafe', ...visits].map(key => [key,
    (common.itemsBySection[key as SectionKey] || []).filter(item => item.name?.trim() && item.address?.trim()),
  ])) as Record<SectionKey, GuideItem[]>;
  const chosen: GuideItem[] = [];
  const used = new Set<string>();
  const counts: Record<string, number>[] = [{}, {}];
  const partners = [0, 0];
  const partnerAvailable = new Set(Object.values(pools).flat()
    .filter(item => item.isPartner)
    .map(identity)).size;
  if (partnerAvailable < 7) {
    throw new Error(`Lịch trình Note 2 ngày cần đúng 7 đối tác khác nhau, hiện chỉ có ${partnerAvailable} đối tác hợp lệ trong các nhóm được dùng.`);
  }
  let attempts = 0;
  // Backtracking across both days avoids consuming a scarce category on day one.
  function select(slot: number): boolean {
    if (slot === 14) return partners[0] === PARTNER_TARGETS[0] && partners[1] === PARTNER_TARGETS[1];
    if (++attempts > 200000) return false;
    // Reserve enough distinct candidates for later mandatory slots, including
    // venues duplicated across Sheet categories.
    for (const key of ['quan_an', 'cafe'] as SectionKey[]) {
      let required = 0;
      for (let next = slot; next < 14; next++) {
        const p = next % 7;
        if (key === 'quan_an' ? p === 0 || p === 5 : p === 1) required++;
      }
      if (new Set(pools[key].filter(item => !used.has(identity(item))).map(identity)).size < required) return false;
    }
    const day = Math.floor(slot / 7), position = slot % 7;
    if (position === 0 && day > 0 && partners[day - 1] !== PARTNER_TARGETS[day - 1]) return false;
    const remainingForDay = 7 - position;
    const partnerNeeded = PARTNER_TARGETS[day] - partners[day];
    if (partnerNeeded < 0 || partnerNeeded > remainingForDay) return false;
    const groups: SectionKey[] = position === 0 || position === 5 ? ['quan_an'] : position === 1 ? ['cafe'] : visits;
    const candidates = groups.flatMap(key => pools[key]).filter(item =>
      !used.has(identity(item))
      && (counts[day][item.sectionKey] || 0) < 2
      && (!item.isPartner || partnerNeeded > 0)
      && (item.isPartner || partnerNeeded < remainingForDay));
    candidates.sort((a, b) => {
      const rank = (item: GuideItem) => {
        const key = item.sectionKey;
        return (counts[day][key] || 0) * 100
          + (position === 6 ? (key === 'choi_dem' ? 0 : 20) : (key === 'choi_dem' ? 20 : 0))
          + (item.isPartner ? 0 : 4)
          + (common.globalUsedItemIds?.has(itemUsageKey(item)) || common.globalUsedItemIds?.has(item.id) ? 2 : 0);
      };
      return rank(a) - rank(b) || stableHash(seed + ':' + slot + ':' + a.id) - stableHash(seed + ':' + slot + ':' + b.id);
    });
    for (const item of candidates) {
      chosen.push(item); used.add(identity(item));
      counts[day][item.sectionKey] = (counts[day][item.sectionKey] || 0) + 1;
      if (item.isPartner) partners[day]++;
      if (select(slot + 1)) return true;
      chosen.pop(); used.delete(identity(item)); counts[day][item.sectionKey]--;
      if (item.isPartner) partners[day]--;
    }
    return false;
  }
  if (!select(0)) throw new Error('Lịch trình Note 2 ngày không đủ địa điểm hợp lệ, không trùng để tạo đúng 4 đối tác ngày 1 và 3 đối tác ngày 2; vẫn cần 4 Quán ăn, 2 Cafe, 8 điểm tham quan/trải nghiệm và mỗi nhóm tối đa 2/ngày.');
  chosen.forEach(item => { common.globalUsedItemIds?.add(itemUsageKey(item)); common.globalUsedItemIds?.add(item.id); });
  const month = new Intl.DateTimeFormat('en-US', { month: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
  return [0, 1].map(day => ({
    type: 'list', chipTone: 'slate', backgroundImage: '', chipText: 'Ngày ' + (day + 1), title: 'Đi Đà Lạt tháng ' + month, subtitle: '',
    layoutVariant: 'itinerary-note-day', canvasPreset: 'tiktok-9x16', titlePlacement: 'top-left',
    items: chosen.slice(day * 7, day * 7 + 7).map(item => ({
      id: item.id, sourceKey: itemUsageKey(item), sourceSectionKey: item.sectionKey,
      label: item.sectionKey === 'quan_an' ? 'Ăn tại' : item.sectionKey === 'cafe' ? 'Ghé cà phê' : 'Ghé',
      name: item.name, rawName: item.name, metaPrimary: item.address.trim(), metaSecondary: '',
      imageUrl: '', imageMapped: false, imageSource: 'fallback', imageNote: 'text-only', isPartner: item.isPartner,
    })),
  }));
}
