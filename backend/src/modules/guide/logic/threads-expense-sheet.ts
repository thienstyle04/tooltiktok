import { createHash } from 'node:crypto';
import type { GuideItem, ListPage, PageItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { hasItemKey, itemUsageKey } from './data-allocator';
import { requiredPartnerRank } from './required-partners';

// Bảng chi tiêu kiểu ảnh chụp Google Sheet cho Threads: một trang, 3 cột
// Nội dung · Số tiền · Ghi chú. Số tiền = Giá đầu người × 2 người (× số đêm,
// ngày hoặc chiều xe), viết theo nghìn đồng như bảng tự ghi ("1.900").
export const THREADS_EXPENSE_2N1D_ID = 'itinerary-note-threads-expense-2n1d';
export const THREADS_EXPENSE_3N2D_ID = 'itinerary-note-threads-expense-3n2d';
export const THREADS_EXPENSE_IDS = [THREADS_EXPENSE_2N1D_ID, THREADS_EXPENSE_3N2D_ID] as const;
export type ThreadsExpenseId = (typeof THREADS_EXPENSE_IDS)[number];
export const THREADS_EXPENSE_TEMPLATE_VERSION = 1;
export const THREADS_EXPENSE_PEOPLE = 2;
export const isThreadsExpense = (id: string): id is ThreadsExpenseId => (THREADS_EXPENSE_IDS as readonly string[]).includes(id);

type Meal = 'sáng' | 'trưa' | 'tối' | 'vặt';
type Slot =
  | { kind: 'meal'; meal: Meal }
  | { kind: 'cafe'; time: 'sáng' | 'trưa' | 'chiều' | 'tối' }
  | { kind: 'visit' }
  | { kind: 'night' }
  | { kind: 'gift' };

const PLANS: Record<ThreadsExpenseId, { days: number; nights: number; fuel: number; slots: Slot[] }> = {
  [THREADS_EXPENSE_2N1D_ID]: {
    days: 2, nights: 1, fuel: 50,
    slots: [
      { kind: 'meal', meal: 'trưa' }, { kind: 'cafe', time: 'chiều' }, { kind: 'visit' }, { kind: 'meal', meal: 'tối' }, { kind: 'night' },
      { kind: 'meal', meal: 'sáng' }, { kind: 'visit' }, { kind: 'meal', meal: 'trưa' }, { kind: 'cafe', time: 'chiều' }, { kind: 'visit' },
      { kind: 'meal', meal: 'vặt' }, { kind: 'gift' },
    ],
  },
  [THREADS_EXPENSE_3N2D_ID]: {
    days: 3, nights: 2, fuel: 80,
    slots: [
      { kind: 'meal', meal: 'trưa' }, { kind: 'cafe', time: 'chiều' }, { kind: 'visit' }, { kind: 'meal', meal: 'tối' }, { kind: 'night' },
      { kind: 'meal', meal: 'sáng' }, { kind: 'visit' }, { kind: 'meal', meal: 'trưa' }, { kind: 'cafe', time: 'chiều' }, { kind: 'visit' },
      { kind: 'meal', meal: 'tối' }, { kind: 'meal', meal: 'vặt' },
      { kind: 'meal', meal: 'sáng' }, { kind: 'cafe', time: 'sáng' }, { kind: 'visit' }, { kind: 'meal', meal: 'trưa' }, { kind: 'gift' },
    ],
  },
};

const captions: Record<ThreadsExpenseId, readonly string[]> = {
  [THREADS_EXPENSE_2N1D_ID]: [
    'Đà Lạt 2N1Đ 2 đứa đi hết nhiêu đây nè 💸 Lưu lại tham khảo, cmt khoản nào nên cắt bớt nha 👇',
    'Đi Đà Lạt 2N1Đ 2 người tốn nhiêu? Tui note lại hết rồi nè, save để đi khỏi lố ngân sách 📝👇',
    'Bảng chi tiêu 2N1Đ Đà Lạt cho 2 người đây. Mấy ní đi hết tầm bao nhiêu, cmt cho tui so với 👀👇',
  ],
  [THREADS_EXPENSE_3N2D_ID]: [
    'Đà Lạt 3N2Đ 2 đứa hết nhiêu đây nè 💸 Lưu lại tham khảo, cmt khoản nào dễ đội giá nhất nha 👇',
    'Đi Đà Lạt 3N2Đ 2 người tốn nhiêu? Tui ghi lại từng khoản rồi nè, save để đi khỏi lố ngân sách 📝👇',
    'Bảng chi tiêu 3N2Đ Đà Lạt cho 2 người đây. Mấy ní đi hết tầm bao nhiêu, cmt cho tui so với 👀👇',
  ],
};

export function threadsExpenseCaption(deckId: ThreadsExpenseId, variant = 0): string {
  const list = captions[deckId];
  return list[((Math.trunc(variant) % list.length) + list.length) % list.length];
}

export function threadsExpenseTitle(deckId: ThreadsExpenseId, destination: string): string {
  return `${destination} ${deckId === THREADS_EXPENSE_2N1D_ID ? '2N1Đ' : '3N2Đ'}`;
}

const identity = (item: GuideItem) => String(item.name || '').normalize('NFD')
  .replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd');

/** Giá đầu người trong Sheet ("45,000 đ", "120.000 đ", "0") ra VND; không đọc được thì null. */
export function headPriceVnd(item?: GuideItem): number | null {
  const raw = String(item?.headPrice || '').trim().toLowerCase();
  if (!raw) return null;
  if (/^(?:free|miễn phí)$/.test(raw)) return 0;
  const match = raw.match(/^([\d.,\s]+)\s*(tr|triệu|k|nghìn|ngàn|đ|vnd|vnđ)?(?:\s*\/\s*người)?$/);
  if (!match) return null;
  const digits = match[1].replace(/\s/g, '');
  const unit = match[2] || '';
  const amount = ['tr', 'triệu', 'k', 'nghìn', 'ngàn'].includes(unit)
    ? Number(digits.replace(',', '.')) * (unit === 'tr' || unit === 'triệu' ? 1_000_000 : 1_000)
    : Number(/^\d{1,3}(?:[.,]\d{3})+$/.test(digits) ? digits.replace(/[.,]/g, '') : digits);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

/** VND ra số nghìn kiểu bảng tự ghi: 1900000 → "1.900", 90000 → "90". */
export function formatThousands(vnd: number): string {
  return Math.round(vnd / 1000).toLocaleString('vi-VN');
}

function rank(seed: string, slot: string, item: GuideItem): number {
  return rankText(seed, `${slot}|${itemUsageKey(item)}`);
}

function rankText(seed: string, value: string): number {
  return createHash('sha256').update(`${seed}|${value}`).digest().readUInt32BE(0);
}

/**
 * Chưa dùng ở list trước → đối tác → thứ tự theo seed (mỗi lần tạo ra bộ khác).
 * Giữa các quán đã dùng không ưu tiên đối tác, để một đối tác không chiếm mãi một ô;
 * mức tối thiểu 1 đối tác/list do buildThreadsExpensePages bảo đảm.
 */
function prefer(items: GuideItem[], seed: string, slot: string, used?: Set<string>, extra?: (item: GuideItem) => number): GuideItem[] {
  const isUsed = (item: GuideItem) => Boolean(used && hasItemKey(used, item));
  return [...items].sort((a, b) =>
    requiredPartnerRank(a) - requiredPartnerRank(b)
    || Number(isUsed(a)) - Number(isUsed(b))
    || (extra ? extra(a) - extra(b) : 0)
    || (isUsed(a) ? 0 : Number(!a.isPartner) - Number(!b.isPartner))
    || rank(seed, slot, a) - rank(seed, slot, b));
}

function shortNote(value: string): string {
  const first = String(value || '').split(/[,;/]|\s-\s|-(?=\S)/)[0].replace(/\s+/g, ' ').trim();
  if (!first) return '';
  const lower = first.toLocaleLowerCase('vi');
  if (lower.length <= 30) return lower;
  // Ô ghi chú tự thu nhỏ chữ; chỉ cắt món quá dài theo từ, bỏ từ nối treo ở cuối.
  const words = lower.slice(0, 30).split(' ').slice(0, -1);
  while (words.length > 1 && /^(kèm|với|và|có|hoặc)$/.test(words[words.length - 1])) words.pop();
  return words.join(' ');
}

function row(label: string, name: string, vnd: number, note: string, source?: GuideItem, key = ''): PageItem {
  return {
    id: source?.id || `expense-${key}`,
    sourceKey: source ? itemUsageKey(source) : `expense-${key}`,
    sourceSectionKey: source?.sectionKey,
    label,
    name,
    rawName: source?.name || name,
    metaPrimary: note,
    metaSecondary: formatThousands(vnd),
    imageUrl: '', imageMapped: false, imageSource: 'fallback', imageNote: 'text-only',
    candidateImageUrls: [], isPartner: source?.isPartner,
  };
}

const named = (item: GuideItem) => String(item.name || '').trim();
const ofType = (pattern: RegExp) => (item: GuideItem) => pattern.test(fold(String(item.type || '')));
const MEAL_TYPE: Record<Meal, RegExp> = { sáng: /an sang/, trưa: /an trua/, tối: /an toi/, vặt: /an vat/ };

export function buildThreadsExpensePages(
  deckId: ThreadsExpenseId,
  itemsBySection: WorkbookItemsBySection,
  seed: string,
  destination: string,
  usedItemIds?: Set<string>,
): ListPage[] {
  const plan = PLANS[deckId];
  const rows = buildExpenseRows(deckId, itemsBySection, seed, usedItemIds);
  // Mỗi list cần ít nhất 1 đối tác. Mẫu dùng nhiều ô nên vài list đầu đã dùng hết đối tác
  // "chưa dùng"; khi đó dành một ô ăn/cà phê cho đối tác (được dùng lại), ô chọn xoay theo seed.
  if (!rows.some(item => item.isPartner)) {
    const slots = plan.slots.map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot.kind === 'meal' || slot.kind === 'cafe')
      .sort((a, b) => rankText(seed, `partner-slot|${a.index}`) - rankText(seed, `partner-slot|${b.index}`));
    for (const { index } of slots) {
      let forced: PageItem[];
      try { forced = buildExpenseRows(deckId, itemsBySection, seed, usedItemIds, index); } catch { continue; }
      if (forced.some(item => item.isPartner)) return expensePages(deckId, destination, forced);
    }
  }
  return expensePages(deckId, destination, rows);
}

function buildExpenseRows(
  deckId: ThreadsExpenseId,
  itemsBySection: WorkbookItemsBySection,
  seed: string,
  usedItemIds?: Set<string>,
  partnerSlot = -1,
): PageItem[] {
  const plan = PLANS[deckId];
  const people = THREADS_EXPENSE_PEOPLE;
  const taken = new Set<string>();
  const pick = (pool: GuideItem[], slot: string, label: string, extra?: (item: GuideItem) => number): GuideItem => {
    // Ô dành cho đối tác: chỉ xét đối tác, bỏ qua việc đã dùng ở list trước.
    const forced = slot === `${partnerSlot}-${plan.slots[partnerSlot]?.kind}`;
    const choice = prefer(pool.filter(item => named(item) && headPriceVnd(item) !== null && !taken.has(identity(item)) && (!forced || item.isPartner)),
      seed, slot, forced ? undefined : usedItemIds, extra)[0];
    if (!choice) throw new Error(`Bảng chi tiêu Threads thiếu ${label} có Giá đầu người. Hãy cập nhật dữ liệu.`);
    taken.add(identity(choice));
    return choice;
  };
  const section = (...keys: SectionKey[]) => keys.flatMap(key => itemsBySection[key] || []);
  const services = section('dich_vu');
  // Nhận diện dịch vụ theo cả Loại dịch vụ lẫn tên, chấp nhận nhiều cách ghi trên Sheet.
  const serviceText = (item: GuideItem) => fold(`${item.type || ''} ${named(item)}`);
  const coaches = services.filter(item => /nha xe|xe khach|limousine|xe giuong/.test(serviceText(item)));
  const bikes = services.filter(item => /thue xe|xe may|xe dien/.test(serviceText(item)) && !coaches.includes(item));
  const gifts = services.filter(item => /dac san|\bqua\b/.test(serviceText(item)) && !coaches.includes(item) && !bikes.includes(item));
  // Dòng phụ: Sheet không có nhóm này thì bỏ dòng, không làm hỏng cả bảng.
  const optional = (pool: GuideItem[], slot: string, label: string) => (pool.some(item => named(item) && headPriceVnd(item) !== null && !taken.has(identity(item))) ? pick(pool, slot, label) : undefined);

  const coach = optional(coaches, 'coach', 'nhà xe');
  const stay = pick(section('homestay'), 'stay', 'homestay');
  const bike = optional(bikes, 'bike', 'chỗ thuê xe');
  const rows: PageItem[] = [
    ...(coach ? [row('Đi lại', /\bxe\b/.test(fold(named(coach))) ? named(coach) : `xe ${named(coach)}`, headPriceVnd(coach)! * people * 2, 'khứ hồi', coach)] : []),
    row('Ở', `phòng ${named(stay)}`, headPriceVnd(stay)! * people * plan.nights, `${plan.nights} đêm`, stay),
    ...(bike ? [row('Đi lại', /thue/.test(fold(named(bike))) ? named(bike) : `thuê xe ${named(bike)}`, headPriceVnd(bike)! * people * plan.days, `thuê ${plan.days} ngày`, bike)] : []),
    row('Đi lại', 'đổ xăng', plan.fuel * 1000, '', undefined, 'fuel'),
  ];

  const foods = section('quan_an');
  const visits = section('khu_du_lich', 'hoat_dong', 'check_in');
  plan.slots.forEach((slot, index) => {
    const slotKey = `${index}-${slot.kind}`;
    if (slot.kind === 'meal') {
      const partnersOnly = index === partnerSlot;
      const open = (item: GuideItem) => !taken.has(identity(item)) && (!partnersOnly || item.isPartner);
      const exact = foods.filter(ofType(MEAL_TYPE[slot.meal]));
      const fallback = foods.filter(item => !ofType(MEAL_TYPE.vặt)(item));
      const pool = exact.some(open) ? exact : slot.meal === 'vặt' ? foods : fallback;
      const item = pick(pool, slotKey, slot.meal === 'vặt' ? 'quán ăn vặt' : `quán ăn ${slot.meal}`);
      const name = slot.meal === 'vặt' ? `ăn vặt ${named(item)}` : slot.meal === 'tối' ? `tối ăn ${named(item)}` : `ăn ${slot.meal} ${named(item)}`;
      rows.push(row('Ăn uống', name, headPriceVnd(item)! * people, shortNote(item.signatureDish || ''), item));
    } else if (slot.kind === 'cafe') {
      const item = pick(section('cafe'), slotKey, 'quán cà phê');
      rows.push(row('Cà phê', `cà phê ${named(item)}`, headPriceVnd(item)! * people, `cf ${slot.time}`, item));
    } else if (slot.kind === 'visit') {
      // Ưu tiên điểm có vé như bảng thật; điểm miễn phí chỉ dùng khi hết điểm có vé.
      const item = pick(visits, slotKey, 'điểm tham quan', candidate => Number(!(headPriceVnd(candidate)! > 0)));
      const price = headPriceVnd(item)!;
      const activity = item.sectionKey === 'hoat_dong';
      const name = activity ? named(item).charAt(0).toLocaleLowerCase('vi') + named(item).slice(1) : price > 0 ? `vé ${named(item)}` : named(item);
      rows.push(row('Tham quan', name, price * people, price > 0 ? '' : 'free', item));
    } else if (slot.kind === 'night') {
      // Sheet chưa có tab Chơi đêm (vd. nguồn mới ngoài Đà Lạt): buổi tối ghé một điểm tham quan.
      const nightlife = section('choi_dem').some(item => named(item) && headPriceVnd(item) !== null && !taken.has(identity(item)));
      const item = pick(nightlife ? section('choi_dem') : visits, slotKey, 'chỗ chơi đêm', candidate => Number(!(headPriceVnd(candidate)! > 0)));
      const price = headPriceVnd(item)!;
      rows.push(row('Buổi tối', `${nightlife ? 'tối lên' : 'tối ghé'} ${named(item)}`, price * people, price > 0 ? (/bar|pub/.test(fold(String(item.type || ''))) ? 'bar' : '') : 'free', item));
    } else {
      const item = optional(gifts, slotKey, 'chỗ mua đặc sản');
      if (item) rows.push(row('Quà', `quà ${named(item)}`, headPriceVnd(item)! * people, 'mang về', item));
    }
  });

  // Vị trí dòng mang nghĩa (bữa sáng/trưa/tối theo ngày): mỗi dòng một nhóm riêng
  // để bước xoay vị trí đối tác không đổi chỗ các dòng.
  rows.forEach((item, index) => { item.rotationGroup = `threads-expense-${index}`; });
  return rows;
}

function expensePages(deckId: ThreadsExpenseId, destination: string, rows: PageItem[]): ListPage[] {
  return [{
    type: 'list', layoutVariant: 'threads-expense-sheet', canvasPreset: 'tiktok-3x4',
    titlePlacement: 'top-left', title: threadsExpenseTitle(deckId, destination),
    subtitle: '', chipText: `${THREADS_EXPENSE_PEOPLE} người`, chipTone: 'slate', backgroundImage: '',
    items: rows,
  }];
}

/** Chỉ để xem trong thư viện mẫu khi nguồn chưa có dữ liệu; không lưu thành list. */
export function buildThreadsExpenseExample(deckId: ThreadsExpenseId, destination: string): ListPage[] {
  const make = (sectionKey: SectionKey, label: string, type: string, price: number, count: number): GuideItem[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `example-${sectionKey}-${type}-${i}`, sectionKey, name: `${label} minh họa ${i + 1}`, address: '', type,
      headPrice: String(price + i * 5000), price: '', isPartner: false, signatureDish: 'món minh họa',
    } as GuideItem));
  const itemsBySection = {
    quan_an: [...make('quan_an', 'Quán sáng', 'Ăn Sáng', 35000, 4), ...make('quan_an', 'Quán trưa', 'Ăn Trưa', 50000, 4),
      ...make('quan_an', 'Quán tối', 'Ăn Tối', 150000, 4), ...make('quan_an', 'Quán vặt', 'Ăn Vặt', 40000, 2)],
    cafe: make('cafe', 'Cà phê', 'Cafe', 45000, 4),
    homestay: make('homestay', 'Homestay', 'Homestay', 250000, 1),
    dich_vu: [...make('dich_vu', 'Nhà xe', 'Nhà xe', 250000, 1), ...make('dich_vu', 'Thuê xe', 'Thuê xe', 100000, 1), ...make('dich_vu', 'Đặc sản', 'Đặc sản', 50000, 1)],
    khu_du_lich: make('khu_du_lich', 'Điểm tham quan', 'Khu du lịch', 60000, 5),
    choi_dem: make('choi_dem', 'Quán bar', 'Bar-Pub', 150000, 1),
  } as unknown as WorkbookItemsBySection;
  return buildThreadsExpensePages(deckId, itemsBySection, 'preview', destination).map(page => ({
    ...page,
    subtitle: 'MẪU MINH HỌA · Không phải chi phí thực. Cập nhật dữ liệu rồi tạo list mới.',
  }));
}
