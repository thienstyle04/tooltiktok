import type { GuideItem, ListPage, PageItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { itemUsageKey } from './data-allocator';
import { stableHash } from './image-resolver';

export const ITINERARY_NOTE_TIMED_TEMPLATE_VERSION = 1;
export const ITINERARY_NOTE_TIMED_CAPTION = 'Lịch trình Đà Lạt 2 ngày theo khung giờ tham khảo mình đã tổng hợp ở bên dưới.\nMọi người xem giúp mình lịch trình này có ổn không ạ?';

const VISIT_SECTIONS: SectionKey[] = ['check_in', 'khu_du_lich', 'hoat_dong', 'dia_diem_lich_su'];
const ALL_SECTIONS: SectionKey[] = ['quan_an', 'cafe', ...VISIT_SECTIONS, 'choi_dem'];
type VenueSlot = { time: string; groups: SectionKey[] };

const DAY_SLOTS: VenueSlot[][] = [
  [
    { time: '07:00–07:45', groups: ['quan_an'] },
    { time: '08:15–09:15', groups: ['cafe'] },
    { time: '10:00–11:15', groups: VISIT_SECTIONS },
    { time: '11:15–12:15', groups: VISIT_SECTIONS },
    { time: '14:15–15:30', groups: VISIT_SECTIONS },
    { time: '16:00–17:15', groups: VISIT_SECTIONS },
    { time: '17:30–19:00', groups: ['quan_an'] },
    { time: '19:00–21:00', groups: ['choi_dem'] },
  ],
  [
    { time: '07:00–07:45', groups: ['quan_an'] },
    { time: '08:00–09:00', groups: ['cafe'] },
    { time: '09:15–10:00', groups: VISIT_SECTIONS },
    { time: '10:30–12:00', groups: VISIT_SECTIONS },
    { time: '12:30–13:30', groups: ['quan_an'] },
  ],
];
const PARTNER_TARGETS = [4, 3] as const;

function normalizeIdentity(value: string): string {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
}

function venueIcon(sectionKey: SectionKey): string {
  if (sectionKey === 'quan_an') return '🍽️';
  if (sectionKey === 'cafe') return '☕';
  if (sectionKey === 'check_in') return '📍';
  if (sectionKey === 'khu_du_lich') return '🌲';
  if (sectionKey === 'hoat_dong') return '🌿';
  if (sectionKey === 'dia_diem_lich_su') return '🏛️';
  if (sectionKey === 'choi_dem') return '🌙';
  return '📍';
}

function noteTimestamp(now: Date): { statusTime: string; displayDate: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value || '';
  const statusTime = `${read('hour')}:${read('minute')}`;
  return { statusTime, displayDate: `${statusTime} ngày ${Number(read('day'))} tháng ${Number(read('month'))}, ${read('year')}` };
}

function makePageItem(item: GuideItem, slot: VenueSlot): PageItem {
  return {
    id: item.id, sourceKey: itemUsageKey(item), sourceSectionKey: item.sectionKey, label: '',
    name: item.name.trim(), rawName: item.name.trim(), metaPrimary: item.address.trim(), metaSecondary: '',
    imageUrl: '', imageMapped: false, imageSource: 'fallback', imageNote: 'text-only', isPartner: item.isPartner,
    scheduleTime: slot.time, scheduleIcon: venueIcon(item.sectionKey),
  };
}

function fixedItem(id: string, time: string, icon: string, name: string): PageItem {
  return {
    id, sourceKey: id, label: '', name, rawName: name, metaPrimary: '', metaSecondary: '', imageUrl: '', imageMapped: false,
    imageSource: 'fallback', imageNote: 'fixed-note-row', isPartner: false, scheduleTime: time, scheduleIcon: icon, fixedRow: true,
  };
}

export function buildItineraryNoteTimedPages(
  common: { itemsBySection: WorkbookItemsBySection; globalUsedItemIds?: Set<string> },
  seed: string,
  now = new Date(),
): ListPage[] {
  const pools = Object.fromEntries(ALL_SECTIONS.map((sectionKey) => [sectionKey,
    (common.itemsBySection[sectionKey] || []).filter((item) => item.name?.trim() && item.address?.trim()),
  ])) as Record<SectionKey, GuideItem[]>;

  const requiredCounts: Partial<Record<SectionKey, number>> = { quan_an: 4, cafe: 2, choi_dem: 1 };
  for (const [sectionKey, required] of Object.entries(requiredCounts) as Array<[SectionKey, number]>) {
    const available = new Set(pools[sectionKey].map((item) => normalizeIdentity(item.name))).size;
    if (available < required) throw new Error(`Lịch trình Note theo giờ thiếu dữ liệu ${sectionKey}: cần ${required}, hiện có ${available} địa điểm hợp lệ có tên và địa chỉ.`);
  }
  const visitAvailable = new Set(VISIT_SECTIONS.flatMap((key) => pools[key]).map((item) => normalizeIdentity(item.name))).size;
  if (visitAvailable < 6) throw new Error(`Lịch trình Note theo giờ cần 6 điểm tham quan/trải nghiệm không trùng, hiện có ${visitAvailable}.`);
  const partnerAvailable = new Set(ALL_SECTIONS.flatMap((key) => pools[key]).filter((item) => item.isPartner).map((item) => normalizeIdentity(item.name))).size;
  if (partnerAvailable < 7) throw new Error(`Lịch trình Note theo giờ cần đúng 7 đối tác khác nhau, hiện chỉ có ${partnerAvailable} đối tác hợp lệ trong các nhóm được dùng.`);

  const flatSlots = DAY_SLOTS.flatMap((slots, day) => slots.map((slot) => ({ day, slot })));
  const chosen: GuideItem[] = [];
  const usedNames = new Set<string>();
  const partnerCounts = [0, 0];
  const sectionCounts: Array<Partial<Record<SectionKey, number>>> = [{}, {}];
  let attempts = 0;
  const remainingDaySlots = (from: number, day: number): number => flatSlots.slice(from).filter((entry) => entry.day === day).length;

  function select(index: number): boolean {
    if (index === flatSlots.length) return partnerCounts[0] === PARTNER_TARGETS[0] && partnerCounts[1] === PARTNER_TARGETS[1];
    if (++attempts > 750000) return false;
    for (const day of [0, 1]) {
      const remaining = remainingDaySlots(index, day);
      const needed = PARTNER_TARGETS[day] - partnerCounts[day];
      if (needed < 0 || needed > remaining) return false;
    }
    const { day, slot } = flatSlots[index];
    const remainingForDay = remainingDaySlots(index, day);
    const partnerNeeded = PARTNER_TARGETS[day] - partnerCounts[day];
    const candidates = slot.groups.flatMap((key) => pools[key]).filter((item) => {
      const key = normalizeIdentity(item.name);
      if (!key || usedNames.has(key)) return false;
      if (VISIT_SECTIONS.includes(item.sectionKey) && (sectionCounts[day][item.sectionKey] || 0) >= 2) return false;
      if (item.isPartner && partnerNeeded <= 0) return false;
      if (!item.isPartner && partnerNeeded >= remainingForDay) return false;
      return true;
    });
    candidates.sort((a, b) => {
      const score = (item: GuideItem): number => {
        const previouslyUsed = common.globalUsedItemIds?.has(itemUsageKey(item)) || common.globalUsedItemIds?.has(item.id) ? 50 : 0;
        const sameGroup = VISIT_SECTIONS.includes(item.sectionKey) ? (sectionCounts[day][item.sectionKey] || 0) * 20 : 0;
        const partnerPreference = item.isPartner ? (partnerNeeded > 0 ? 0 : 100) : (partnerNeeded >= remainingForDay ? 100 : 4);
        return previouslyUsed + sameGroup + partnerPreference;
      };
      return score(a) - score(b) || stableHash(`${seed}:${day}:${index}:${a.id}`) - stableHash(`${seed}:${day}:${index}:${b.id}`);
    });
    for (const item of candidates) {
      const key = normalizeIdentity(item.name);
      chosen.push(item); usedNames.add(key);
      sectionCounts[day][item.sectionKey] = (sectionCounts[day][item.sectionKey] || 0) + 1;
      if (item.isPartner) partnerCounts[day]++;
      if (select(index + 1)) return true;
      if (item.isPartner) partnerCounts[day]--;
      sectionCounts[day][item.sectionKey]!--;
      usedNames.delete(key); chosen.pop();
    }
    return false;
  }

  if (!select(0)) throw new Error('Không thể tạo Lịch trình Note theo giờ đúng ràng buộc: Ngày 1 cần 4 đối tác, Ngày 2 cần 3 đối tác; tổng 13 địa điểm không trùng, đúng nhóm và tối đa 2 điểm cùng nhóm tham quan mỗi ngày.');
  chosen.forEach((item) => { common.globalUsedItemIds?.add(itemUsageKey(item)); common.globalUsedItemIds?.add(item.id); });

  const timestamp = noteTimestamp(now);
  const dayOneItems = chosen.slice(0, DAY_SLOTS[0].length).map((item, index) => makePageItem(item, DAY_SLOTS[0][index]));
  const dayTwoVenueItems = chosen.slice(DAY_SLOTS[0].length).map((item, index) => makePageItem(item, DAY_SLOTS[1][index]));
  const dayTwoItems = [...dayTwoVenueItems,
    fixedItem('itinerary-note-timed|hotel', '13:30–14:30', '🏨', 'Về khách sạn lấy đồ'),
    fixedItem('itinerary-note-timed|return', '14:30–15:00', '🚗', 'Khởi hành về')];

  return [dayOneItems, dayTwoItems].map((items, day): ListPage => ({
    type: 'list', chipTone: 'slate', chipText: `🌷 Ngày ${day + 1}`, title: '', subtitle: timestamp.displayDate,
    noteStatusTime: timestamp.statusTime, items, backgroundImage: '', layoutVariant: 'itinerary-note-timed-day',
    canvasPreset: 'tiktok-9x16', titlePlacement: 'top-left',
  }));
}
