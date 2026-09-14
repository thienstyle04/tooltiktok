import type { GuideItem, ListPage, PageItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { itemUsageKey } from './data-allocator';
import { stableHash } from './image-resolver';

export const ITINERARY_NOTE_TIMED_TEMPLATE_VERSION = 1;
export const ITINERARY_NOTE_TIMED_CAPTION = 'Lịch trình Đà Lạt 2 ngày theo khung giờ tham khảo mình đã tổng hợp ở bên dưới.\nMọi người xem giúp mình lịch trình này có ổn không ạ?';

const VISIT_SECTIONS: SectionKey[] = ['check_in', 'khu_du_lich', 'hoat_dong', 'dia_diem_lich_su'];
const ALL_SECTIONS: SectionKey[] = ['quan_an', 'cafe', ...VISIT_SECTIONS, 'choi_dem'];
type VenueSlot = { time: string; groups: SectionKey[] };
type TimedCandidate = {
  item: GuideItem;
  identity: string;
  previouslyUsed: boolean;
};

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
  const chosenBySlot: Array<GuideItem | undefined> = new Array(flatSlots.length);
  const usedNames = new Set<string>();
  const partnerCounts = [0, 0];
  const sectionCounts: Array<Partial<Record<SectionKey, number>>> = [{}, {}];
  let attempts = 0;
  const MAX_SEARCH_ATTEMPTS = 100_000;
  const MAX_CANDIDATES_PER_SECTION_AND_PARTNER_KIND = flatSlots.length;

  // Chuẩn hóa tên và kiểm tra vòng luân phiên đúng một lần. Bản cũ thực hiện
  // normalizeIdentity trong từng nhánh của phép tìm kiếm (tới 750.000 lần), khiến
  // riêng mẫu này có thể chặn quá trình dựng toàn bộ catalog hơn một phút.
  const candidatesBySection = Object.fromEntries(ALL_SECTIONS.map((sectionKey) => {
    const unique = new Map<string, TimedCandidate>();
    for (const item of pools[sectionKey]) {
      const identity = normalizeIdentity(item.name);
      if (!identity || unique.has(identity)) continue;
      const usageKey = itemUsageKey(item);
      unique.set(identity, {
        item,
        identity,
        previouslyUsed: Boolean(common.globalUsedItemIds?.has(usageKey) || common.globalUsedItemIds?.has(item.id)),
      });
    }
    const ranked = [...unique.values()].sort((left, right) => (
      Number(left.previouslyUsed) - Number(right.previouslyUsed)
      || stableHash(`${seed}:pool:${sectionKey}:${left.item.id}`) - stableHash(`${seed}:pool:${sectionKey}:${right.item.id}`)
    ));
    // Có 13 slot trong cả list. Giữ tối đa 13 tên cho mỗi nhánh đối tác/thường
    // vẫn đủ để tránh mọi tên đã bị tối đa 12 slot còn lại chiếm, đồng thời chặn
    // không gian tìm kiếm tăng theo hàng trăm dòng trong Sheet.
    return [sectionKey, [
      ...ranked.filter((entry) => entry.item.isPartner).slice(0, MAX_CANDIDATES_PER_SECTION_AND_PARTNER_KIND),
      ...ranked.filter((entry) => !entry.item.isPartner).slice(0, MAX_CANDIDATES_PER_SECTION_AND_PARTNER_KIND),
    ]];
  })) as Record<SectionKey, TimedCandidate[]>;

  const remainingSlotIndexes = (day: number): number[] => flatSlots
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) => entry.day === day && !chosenBySlot[index])
    .map(({ index }) => index);

  const candidatesForSlot = (slotIndex: number): TimedCandidate[] => {
    const { day, slot } = flatSlots[slotIndex];
    const remainingForDay = remainingSlotIndexes(day).length;
    const partnerNeeded = PARTNER_TARGETS[day] - partnerCounts[day];
    const candidates = slot.groups.flatMap((key) => candidatesBySection[key]).filter((candidate) => {
      const { item, identity } = candidate;
      if (usedNames.has(identity)) return false;
      if (VISIT_SECTIONS.includes(item.sectionKey) && (sectionCounts[day][item.sectionKey] || 0) >= 2) return false;
      if (item.isPartner && partnerNeeded <= 0) return false;
      if (!item.isPartner && partnerNeeded >= remainingForDay) return false;
      return true;
    });
    const score = (candidate: TimedCandidate): number => {
      const sameGroup = VISIT_SECTIONS.includes(candidate.item.sectionKey)
        ? (sectionCounts[day][candidate.item.sectionKey] || 0) * 20
        : 0;
      const partnerPreference = candidate.item.isPartner
        ? (partnerNeeded > 0 ? 0 : 100)
        : (partnerNeeded >= remainingForDay ? 100 : 4);
      return (candidate.previouslyUsed ? 50 : 0) + sameGroup + partnerPreference;
    };
    return candidates.sort((left, right) => (
      score(left) - score(right)
      || stableHash(`${seed}:${day}:${slotIndex}:${left.item.id}`) - stableHash(`${seed}:${day}:${slotIndex}:${right.item.id}`)
    ));
  };

  const partnerBoundsArePossible = (): boolean => {
    for (const day of [0, 1]) {
      const remaining = remainingSlotIndexes(day);
      const needed = PARTNER_TARGETS[day] - partnerCounts[day];
      if (needed < 0 || needed > remaining.length) return false;
      let partnerCapable = 0;
      let regularCapable = 0;
      for (const slotIndex of remaining) {
        const candidates = candidatesForSlot(slotIndex);
        if (candidates.some((entry) => entry.item.isPartner)) partnerCapable += 1;
        if (candidates.some((entry) => !entry.item.isPartner)) regularCapable += 1;
      }
      if (partnerCapable < needed || regularCapable < remaining.length - needed) return false;
    }
    return true;
  };

  function select(assignedCount: number): boolean {
    if (assignedCount === flatSlots.length) {
      return partnerCounts[0] === PARTNER_TARGETS[0] && partnerCounts[1] === PARTNER_TARGETS[1];
    }
    if (++attempts > MAX_SEARCH_ATTEMPTS || !partnerBoundsArePossible()) return false;

    // Chọn slot đang có ít phương án nhất trước (MRV) để phát hiện ràng buộc
    // không thể đáp ứng sớm, thay vì thử hàng trăm tên theo thứ tự thời gian.
    const next = flatSlots
      .map((_, slotIndex) => ({ slotIndex, candidates: chosenBySlot[slotIndex] ? [] : candidatesForSlot(slotIndex) }))
      .filter(({ slotIndex }) => !chosenBySlot[slotIndex])
      .sort((left, right) => left.candidates.length - right.candidates.length || left.slotIndex - right.slotIndex)[0];
    if (!next || next.candidates.length === 0) return false;

    const { day } = flatSlots[next.slotIndex];
    for (const candidate of next.candidates) {
      const { item, identity } = candidate;
      chosenBySlot[next.slotIndex] = item;
      usedNames.add(identity);
      sectionCounts[day][item.sectionKey] = (sectionCounts[day][item.sectionKey] || 0) + 1;
      if (item.isPartner) partnerCounts[day] += 1;
      if (select(assignedCount + 1)) return true;
      if (item.isPartner) partnerCounts[day] -= 1;
      sectionCounts[day][item.sectionKey] = Math.max(0, (sectionCounts[day][item.sectionKey] || 0) - 1);
      usedNames.delete(identity);
      chosenBySlot[next.slotIndex] = undefined;
    }
    return false;
  }

  if (!select(0)) throw new Error('Không thể tạo Lịch trình Note theo giờ đúng ràng buộc: Ngày 1 cần 4 đối tác, Ngày 2 cần 3 đối tác; tổng 13 địa điểm không trùng, đúng nhóm và tối đa 2 điểm cùng nhóm tham quan mỗi ngày.');
  const chosen = chosenBySlot.filter((item): item is GuideItem => Boolean(item));
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
