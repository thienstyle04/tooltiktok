import { createHash } from 'node:crypto';
import type { GuideItem, ListPage, PageItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { hasItemKey, itemUsageKey } from './data-allocator';

export const THREADS_BUDGET_ID = 'itinerary-note-threads-budget-3n2d';
export const THREADS_BUDGET_TEMPLATE_VERSION = 3;
const visits: SectionKey[] = ['check_in', 'khu_du_lich', 'hoat_dong', 'dia_diem_lich_su', 'choi_dem'];
const dailyGroups: SectionKey[][] = [['quan_an'], ['cafe'], visits, ['quan_an']];
const captions = [
  '3N2Đ Đà Lạt tiêu hết nhiêu là vừa mng? 🥹 Tui để bảng chi phí đây, lưu lại rồi cmt khoản nào nên bớt nha 👇',
  'Đi Đà Lạt 3N2Đ mà ví còn ổn khum? 💸 Save bảng này rồi cmt khoản nào dễ đội giá nhất dứiii 👇',
  'Bảng chi phí 3N2Đ đây nè. Mấy ní đi hết tầm bao nhiêu, cmt để tui tham khảo với 👀👇',
] as const;

export function threadsBudgetCaption(variant = 0): string {
  return captions[((Math.trunc(variant) % captions.length) + captions.length) % captions.length];
}

const identity = (item: GuideItem) => String(item.name || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');

function choiceRank(seed: string, slot: string, item: GuideItem): number {
  return createHash('sha256').update(`${seed}|${slot}|${itemUsageKey(item)}`).digest().readUInt32BE(0);
}

function preferFreshItems(items: GuideItem[], seed: string, slot: string, usedItemIds?: Set<string>): GuideItem[] {
  return [...items].sort((a, b) =>
    Number(Boolean(usedItemIds && hasItemKey(usedItemIds, a))) - Number(Boolean(usedItemIds && hasItemKey(usedItemIds, b)))
    || Number(!a.isPartner) - Number(!b.isPartner)
    || choiceRank(seed, slot, a) - choiceRank(seed, slot, b));
}

function distinctPlaces(items: GuideItem[]): GuideItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = identity(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function priceFromSource(item?: GuideItem): string {
  const price = String(item?.headPrice || '').trim();
  return /(?:\d|free|miễn phí)/i.test(price) ? price : '';
}

function lodgingPerPersonPrice(item?: GuideItem): string {
  const raw = String(item?.headPrice || '').trim().toLowerCase();
  const match = raw.match(/^([\d.,\s]+)\s*(tr|triệu|k|nghìn|ngàn|đ|vnd|vnđ)?(?:\s*\/\s*người)?$/i);
  if (!match) return '';
  const digits = match[1].replace(/\s/g, '');
  const unit = match[2] || '';
  let amount: number;
  if (['tr', 'triệu', 'k', 'nghìn', 'ngàn'].includes(unit)) {
    amount = Number(digits.replace(',', '.')) * (unit === 'tr' || unit === 'triệu' ? 1_000_000 : 1_000);
  } else {
    amount = Number(/^\d{1,3}(?:[.,]\d{3})+$/.test(digits) ? digits.replace(/[.,]/g, '') : digits);
  }
  return Number.isSafeInteger(amount) && amount >= 0 ? `${amount.toLocaleString('vi-VN')} đ/người` : '';
}

function row(group: string, name: string, price = '', source?: GuideItem, suffix = ''): PageItem {
  return {
    id: source?.id || `budget-${group}-${suffix}`,
    sourceKey: source ? itemUsageKey(source) : `budget-${group}-${suffix}`,
    sourceSectionKey: source?.sectionKey,
    label: group,
    name,
    rawName: source?.name || name,
    metaPrimary: source?.address || '',
    metaSecondary: price,
    imageUrl: '', imageMapped: false, imageSource: 'fallback', imageNote: 'text-only',
    candidateImageUrls: [], isPartner: source?.isPartner,
  };
}

/** Unknown expenses remain blank until the user supplies an amount. */
export function buildThreadsBudgetPages(
  itemsBySection: WorkbookItemsBySection,
  seed: string,
  destination: string,
  usedItemIds?: Set<string>,
): ListPage[] {
  const slots = Array.from({ length: 3 }, (_, day) => dailyGroups.map((groups, index) => ({ day, index, groups }))).flat();
  const pools = slots.map(slot => slot.groups.flatMap(key => itemsBySection[key] || [])
    .filter(item => String(item.name || '').trim()));
  for (const [label, keys] of [['Quán ăn', ['quan_an']], ['Cafe', ['cafe']], ['tham quan/check-in', visits]] as Array<[string, SectionKey[]]>) {
    const needed = slots.filter(slot => slot.groups.some(key => keys.includes(key))).length;
    const available = new Set(pools.flat().filter(item => keys.includes(item.sectionKey)).map(identity)).size;
    if (available < needed) throw new Error(`Threads chi phí thiếu ${label}: cần ${needed}, hiện có ${available}. Hãy cập nhật dữ liệu.`);
  }
  const ranked = pools.map((pool, index) => preferFreshItems(pool, seed, `day-${index}`, usedItemIds));
  const owners = new Map<string, number>();
  const chosen: GuideItem[] = new Array(slots.length);
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
  for (const index of slots.map((_, i) => i).sort((a, b) => ranked[a].length - ranked[b].length)) {
    if (!assign(index, new Set())) throw new Error('Threads chi phí không đủ địa điểm không trùng đúng nhóm. Hãy cập nhật dữ liệu.');
  }

  const service = distinctPlaces(preferFreshItems((itemsBySection.dich_vu || [])
    .filter(item => String(item.name || '').trim() && /xe|grab|taxi|bus|di chuyển/i.test(`${item.name} ${item.type}`)), seed, 'transport', usedItemIds));
  const stayCandidates = distinctPlaces(preferFreshItems((itemsBySection.homestay || [])
    .filter(item => String(item.name || '').trim() && lodgingPerPersonPrice(item)), seed, 'lodging', usedItemIds));
  const stay = stayCandidates[0];
  if (!stay) throw new Error(`Threads chi phí thiếu Homestay có giá đầu người: cần 1, hiện có ${stayCandidates.length}. Hãy cập nhật dữ liệu.`);
  const transport = [0, 1].map(index => service[index]
    ? row('Di chuyển', service[index].name, priceFromSource(service[index]), service[index], String(index))
    : row('Di chuyển', index === 0 ? 'Xe khách (khứ hồi)' : 'Di chuyển nội thành', '', undefined, String(index)));
  const lodging = row('Lưu trú', String(stay.name).trim(), lodgingPerPersonPrice(stay), stay);
  const dayRows = slots.map((slot, index) => row(`Ngày ${slot.day + 1}`,
    chosen[index].name, priceFromSource(chosen[index]), chosen[index], String(index)));
  return [{
    type: 'list', layoutVariant: 'itinerary-note-threads-budget', canvasPreset: 'tiktok-3x4',
    titlePlacement: 'top-left', title: `${destination} 3N2Đ · Chi phí chuyến đi`,
    subtitle: 'Một chỗ lưu trú; giá lấy từ cột Giá đầu người, không tự nhân theo số đêm. Khoản thiếu giá cần nhập để có tổng đầy đủ.',
    chipText: 'Bảng chi phí', chipTone: 'slate', backgroundImage: '',
    items: [...transport, lodging, ...dayRows],
  }];
}

/** Catalog preview only; never persisted as a generated list. */
export function buildThreadsBudgetExample(destination: string): ListPage[] {
  const itemsBySection = {} as WorkbookItemsBySection;
  for (const sectionKey of ['quan_an', 'cafe', 'check_in', 'dich_vu', 'homestay'] as SectionKey[]) {
    itemsBySection[sectionKey] = Array.from({ length: 12 }, (_, i) => ({
      id: `example-${sectionKey}-${i}`, sectionKey,
      name: `${sectionKey === 'quan_an' ? 'Quán ăn' : sectionKey === 'cafe' ? 'Cafe' : sectionKey === 'check_in' ? 'Điểm tham quan' : sectionKey === 'homestay' ? 'Chỗ nghỉ' : 'Xe dịch vụ'} minh họa ${i + 1}`,
      address: 'Địa chỉ minh họa', type: '', headPrice: sectionKey === 'homestay' ? String(150000 + i * 10000) : '', price: '', isPartner: false,
    } as GuideItem));
  }
  const examplePrices = [
    '610.000 đ', '223.000 đ', '150.000 đ/người',
    '12.000 đ', '18.000 đ', '65.000 đ', '80.000 đ',
    '57.000 đ', '42.750 đ', '47.000 đ', '98.000 đ',
    '234.000 đ', '30.000 đ', '30.000 đ', '50.000 đ',
  ];
  return buildThreadsBudgetPages(itemsBySection, 'preview', destination).map(page => ({
    ...page,
    subtitle: 'MẪU MINH HỌA · Không phải chi phí thực. Cập nhật dữ liệu rồi tạo list mới.',
    items: page.items.map((item, index) => ({ ...item, metaSecondary: examplePrices[index] })),
  }));
}
