import { createHash } from 'node:crypto';
import type { DeckPage, GuideItem, ListPage, PageItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { hasItemKey, itemUsageKey } from './data-allocator';
import { requiredPartnerRank } from './required-partners';
import { headPriceVnd } from './threads-expense-sheet';

// "Tổng kết chuyến đi" kiểu bài Threads: trang 1 là note trắng (Ghi chú iPhone)
// liệt kê chi phí 3N2Đ cho 2 người, 8 trang sau là ảnh riêng của đúng các địa
// điểm có trong note, theo thứ tự dòng. Mọi số tiền tính từ Giá đầu người.
export const THREADS_RECAP_ID = 'threads-trip-recap-3n2d';
export const THREADS_RECAP_NAME = 'Tổng kết chuyến đi 3N2Đ';
export const THREADS_RECAP_VERSION = 1;
export const THREADS_RECAP_PEOPLE = 2;
export const THREADS_RECAP_PHOTOS = 8;
export const THREADS_RECAP_PAGES = 1 + THREADS_RECAP_PHOTOS;
const NIGHTS = 2, BIKE_DAYS = 3, FUEL_VND = 80_000;

type PlaceSlot = 'visit' | 'paid-visit' | 'food' | 'cafe';
// Thứ tự dòng như một chuyến đi thật: chơi, ăn, cà phê xen nhau. 8 dòng đầu có ảnh.
const PLACE_SLOTS: PlaceSlot[] = ['paid-visit', 'food', 'cafe', 'visit', 'food', 'visit', 'cafe', 'food', 'food'];
const VISIT_SECTIONS: SectionKey[] = ['check_in', 'khu_du_lich', 'hoat_dong', 'dia_diem_lich_su'];

const identity = (item: Pick<GuideItem, 'name'>) => String(item.name || '').normalize('NFD')
  .replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd');
const named = (item: GuideItem) => String(item.name || '').trim();
const rankText = (seed: string, value: string) => createHash('sha256').update(`${seed}|${value}`).digest().readUInt32BE(0);

export function recapOwnPhoto(item: GuideItem): boolean {
  return item.imageMapped === true && item.imageSource === 'manual'
    && /^https?:\/\/|^\/assets\/drive-file/i.test(String(item.imageUrl || '').trim());
}

/** Kiểu note tự ghi: 0k, 450k, 1tr, 2tr700k, 1tr050k. Giá Sheet tròn nghìn nên không làm tròn mất tiền. */
export function recapMoney(vnd: number): string {
  const k = Math.round(vnd / 1000);
  if (k < 1000) return `${k}k`;
  const tr = Math.floor(k / 1000), rest = k % 1000;
  return rest ? `${tr}tr${String(rest).padStart(3, '0')}k` : `${tr}tr`;
}

/** Số gọn cho caption như "hết 2tr4": làm tròn xuống 100k, dưới 1 triệu giữ nghìn. */
export function recapShortMoney(vnd: number): string {
  if (vnd < 1_000_000) return `${Math.round(vnd / 1000)}k`;
  const tenths = Math.floor(vnd / 100_000);
  return tenths % 10 ? `${Math.floor(tenths / 10)}tr${tenths % 10}` : `${tenths / 10}tr`;
}

const CAPTIONS = [
  'Chi phí tham khảo {destination} 3N2Đ cho 2 người hết {perPerson}/người mà đẹp cỡ này 😍 Mấy ní thấy hợp lý khum?',
  '{destination} 3N2Đ chỉ tầm {perPerson}/người mà đẹp cỡ này 😍 Tag đứa hay than hết tiền vô coi nè 👇',
  'Tổng chi phí tham khảo {destination} 3N2Đ 2 người: {total}, chia ra {perPerson}/người 💸 Lưu lại để đi khỏi lố ngân sách nha',
  'Ai nói đi {destination} tốn kém? 3N2Đ tầm {perPerson}/người là đủ ăn chơi rồi nè 😍 Gửi cho đứa bạn cần đi trốn liền 👇',
  'Bảng chi phí {destination} 3N2Đ cho 2 người, tổng {total} 📝 Mấy ní đi thường hết nhiêu, cmt so thử coi 👀',
  '{perPerson}/người cho 3N2Đ ở {destination}, có ăn có chơi có cà phê đủ cả 😍 Tag hội bạn chốt kèo liền nè 👇',
  'Lưu lại chi phí tham khảo {destination} 3N2Đ: 2 người {total}, mỗi người {perPerson} 💸 Khoản nào mấy ní thấy nên bớt?',
  'Đi {destination} 3N2Đ hết tầm {perPerson}/người mà về vẫn còn tiếc 🥹 Gửi người hay rủ đi mà không chịu đi nè 👇',
  'Chi phí {destination} 3N2Đ cho 2 đứa: {total} 📝 Ảnh mấy chỗ trong list ở phía sau nha, lướt xem có đáng tiền khum 😍',
  'Tầm {perPerson}/người là có chuyến {destination} 3N2Đ như này nè 😍 Mấy ní muốn đi mùa nào, cmt nha 👇',
  '{destination} 3N2Đ 2 người {total} có cao quá khum mng? 👀 Tui để từng khoản rồi, ai đi rồi góp ý giúp nha',
  'Save bảng chi phí tham khảo {destination} 3N2Đ này lại nè 💸 {perPerson}/người, tag đứa bạn đi chung liền 👇',
] as const;

export function threadsRecapCaptions(): readonly string[] { return CAPTIONS; }

/** Hết vòng mới lặp, không lặp liền nhau ở ranh giới vòng (giống Note 01). */
export function pickThreadsRecapCaption(history: string[], seed: string, money: { total: number; perPerson: number }, destination = 'Đà Lạt'): string {
  const fill = (template: string) => template.replace(/\{destination\}/g, destination)
    .replace(/\{total\}/g, recapMoney(money.total)).replace(/\{perPerson\}/g, recapShortMoney(money.perPerson));
  const templateOf = (caption: string) => CAPTIONS.findIndex(template => {
    const pattern = new RegExp(`^${template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{(?:destination|total|perPerson)\\\}/g, '.+?')}$`, 's');
    return pattern.test(caption);
  });
  const used = new Set<number>(); let last = -1;
  for (const caption of history) {
    const index = templateOf(caption);
    if (index < 0) continue;
    if (used.size === CAPTIONS.length) used.clear();
    used.add(index); last = index;
  }
  if (used.size === CAPTIONS.length) used.clear();
  const fresh = CAPTIONS.map((_, index) => index).filter(index => !used.has(index) && index !== last);
  return fill(CAPTIONS[fresh[rankText(seed, 'caption') % fresh.length]]);
}

export interface RecapRow {
  kind: 'coach' | 'stay' | 'bike' | 'fuel' | PlaceSlot;
  vnd: number;
}

function row(kind: RecapRow['kind'], name: string, vnd: number, source?: GuideItem, formula = '', photo = false, index = 0): PageItem {
  return {
    id: source?.id || `recap-${kind}-${index}`,
    sourceKey: source ? itemUsageKey(source) : `recap-${kind}-${index}`,
    sourceSectionKey: source?.sectionKey,
    label: kind,
    name,
    rawName: source?.name || name,
    metaPrimary: formula,
    metaSecondary: String(vnd),
    imageUrl: photo && source ? source.imageUrl : '',
    imageMapped: Boolean(photo && source),
    imageSource: photo && source ? source.imageSource : 'fallback',
    imageNote: photo ? '' : 'text-only',
    candidateImageUrls: photo && source ? [source.imageUrl] : [],
    isPartner: source?.isPartner,
    // Dòng giữ nguyên vị trí (giá và ảnh đi theo đúng dòng); bước xoay chỉ đổi ảnh đối tác.
    rotationGroup: `threads-recap-${index}`,
  };
}

export function recapRowAmount(item: Pick<PageItem, 'metaSecondary'>): number | null {
  const raw = String(item.metaSecondary ?? '').trim();
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

export function recapTotals(page: ListPage): { total: number; perPerson: number } {
  const total = page.items.reduce((sum, item) => sum + (recapRowAmount(item) || 0), 0);
  return { total, perPerson: Math.round(total / THREADS_RECAP_PEOPLE) };
}

export function buildThreadsRecapPages(
  itemsBySection: WorkbookItemsBySection,
  seed: string,
  destination: string,
  usedItemIds?: Set<string>,
  usedImageUrls?: Set<string>,
): DeckPage[] {
  const rows = recapRows(itemsBySection, seed, usedItemIds, usedImageUrls);
  // Mỗi list cần ít nhất 1 đối tác hiển thị; khi đối tác "chưa dùng" đã hết thì
  // dành một ô ăn/cà phê cho đối tác (được dùng lại), ô chọn xoay theo seed.
  const partnersAvailable = Object.values(itemsBySection).flat().some(item => item.isPartner);
  if (partnersAvailable && !rows.some(item => item.isPartner)) {
    const slots = PLACE_SLOTS.map((slot, index) => ({ slot, index })).filter(({ slot }) => slot === 'food' || slot === 'cafe')
      .sort((a, b) => rankText(seed, `partner-slot|${a.index}`) - rankText(seed, `partner-slot|${b.index}`));
    for (const { index } of slots) {
      let forced: PageItem[];
      try { forced = recapRows(itemsBySection, seed, usedItemIds, usedImageUrls, index); } catch { continue; }
      if (forced.some(item => item.isPartner)) return recapPages(destination, forced);
    }
  }
  return recapPages(destination, rows);
}

function recapRows(itemsBySection: WorkbookItemsBySection, seed: string, usedItemIds?: Set<string>, usedImageUrls?: Set<string>, partnerSlot = -1): PageItem[] {
  const people = THREADS_RECAP_PEOPLE, taken = new Set<string>(), photos = new Set<string>();
  const section = (...keys: SectionKey[]) => keys.flatMap(key => itemsBySection[key] || []);
  const priced = (item: GuideItem) => Boolean(named(item)) && headPriceVnd(item) !== null && !taken.has(identity(item));
  const isUsed = (item: GuideItem) => Boolean(usedItemIds && hasItemKey(usedItemIds, item));
  const photoUsed = (item: GuideItem) => Boolean(usedImageUrls?.has(item.imageUrl));
  const pick = (pool: GuideItem[], slot: string, label: string, options: { photo?: boolean; partnerOnly?: boolean; extra?: (item: GuideItem) => number } = {}): GuideItem => {
    const candidates = pool.filter(item => priced(item) && (!options.partnerOnly || item.isPartner)
      && (!options.photo || (recapOwnPhoto(item) && !photos.has(item.imageUrl))));
    const choice = [...candidates].sort((a, b) =>
      requiredPartnerRank(a) - requiredPartnerRank(b)
      || (options.partnerOnly ? 0 : Number(isUsed(a)) - Number(isUsed(b)))
      || (options.photo ? Number(photoUsed(a)) - Number(photoUsed(b)) : 0)
      || (options.extra ? options.extra(a) - options.extra(b) : 0)
      // Giữa các địa điểm đã dùng không ưu tiên đối tác (tránh một đối tác chiếm mãi một ô).
      || (isUsed(a) ? 0 : Number(!a.isPartner) - Number(!b.isPartner))
      || rankText(seed, `${slot}|${itemUsageKey(a)}`) - rankText(seed, `${slot}|${itemUsageKey(b)}`))[0];
    if (!choice) throw new Error(`${THREADS_RECAP_NAME} thiếu ${label} có Giá đầu người${options.photo ? ' và ảnh riêng chưa trùng' : ''}. Hãy cập nhật dữ liệu.`);
    taken.add(identity(choice));
    if (options.photo) photos.add(choice.imageUrl);
    return choice;
  };
  const services = section('dich_vu');
  const serviceText = (item: GuideItem) => fold(`${item.type || ''} ${named(item)}`);
  const coaches = services.filter(item => /nha xe|xe khach|limousine|xe giuong/.test(serviceText(item)));
  const bikes = services.filter(item => /thue xe|xe may/.test(serviceText(item)) && !/xe dien|o to|oto/.test(serviceText(item)) && !coaches.includes(item));
  const optional = (pool: GuideItem[], slot: string, label: string) => (pool.some(priced) ? pick(pool, slot, label) : undefined);

  const coach = optional(coaches, 'coach', 'nhà xe');
  const stay = pick(section('homestay'), 'stay', 'homestay');
  const bike = optional(bikes, 'bike', 'chỗ thuê xe máy');
  const rows: PageItem[] = [];
  if (coach) rows.push(row('coach', `${/\b(xe|limousine)\b/.test(fold(named(coach))) ? named(coach) : `Xe ${named(coach)}`} khứ hồi`, headPriceVnd(coach)! * people * 2, coach, '', false, rows.length));
  rows.push(row('stay', `${named(stay)} ${NIGHTS} đêm`, headPriceVnd(stay)! * people * NIGHTS, stay, '', false, rows.length));
  if (bike) {
    const perDay = headPriceVnd(bike)!;
    rows.push(row('bike', /^thue xe|^xe may/.test(fold(named(bike))) ? named(bike) : `Xe máy ${named(bike)}`, perDay * BIKE_DAYS, bike, `${recapMoney(perDay)}×${BIKE_DAYS}`, false, rows.length));
  }
  rows.push(row('fuel', 'Xăng', FUEL_VND, undefined, '', false, rows.length));

  PLACE_SLOTS.forEach((slot, index) => {
    const photo = index < THREADS_RECAP_PHOTOS;
    const partnerOnly = index === partnerSlot;
    const key = `${index}-${slot}`;
    let item: GuideItem;
    if (slot === 'food') item = pick(section('quan_an'), key, 'quán ăn', { photo, partnerOnly });
    else if (slot === 'cafe') item = pick(section('cafe'), key, 'quán cà phê', { photo, partnerOnly });
    // Dòng tham quan đầu ưu tiên điểm có vé để bảng giống chi tiêu thật; các dòng khác chọn tự do (có thể 0k).
    else item = pick(section(...VISIT_SECTIONS), key, 'điểm tham quan', { photo, extra: slot === 'paid-visit' ? candidate => Number(!(headPriceVnd(candidate)! > 0)) : undefined });
    rows.push(row(slot, named(item), headPriceVnd(item)! * people, item, '', photo, rows.length));
  });
  return rows;
}

function recapPages(destination: string, rows: PageItem[]): DeckPage[] {
  const note: ListPage = {
    type: 'list', layoutVariant: 'threads-recap-note', canvasPreset: 'tiktok-3x4',
    titlePlacement: 'top-left', title: `${destination} 3N2Đ`, subtitle: '',
    chipText: `${THREADS_RECAP_PEOPLE} Người`, chipTone: 'slate', backgroundImage: '', items: rows,
  };
  return syncThreadsRecapPhotos([note]);
}

/** Trang ảnh luôn dựng lại từ các dòng có ảnh của note, đúng thứ tự dòng (cả sau bước xoay ảnh đối tác). */
export function syncThreadsRecapPhotos(pages: DeckPage[]): DeckPage[] {
  const note = pages[0] as ListPage;
  const featured = note.items.filter(item => String(item.imageUrl || '').trim());
  return [note, ...featured.map((item, index): ListPage => ({
    type: 'list', layoutVariant: 'threads-recap-photo', canvasPreset: 'tiktok-3x4',
    title: item.name, subtitle: '', chipText: `Ảnh ${index + 1}`, chipTone: 'slate',
    backgroundImage: item.imageUrl, items: [], ...(note.photoPreset ? { photoPreset: note.photoPreset } : {}),
  }))];
}

export function assertThreadsRecapPages(pages: DeckPage[]): void {
  const note = pages[0];
  if (pages.length !== THREADS_RECAP_PAGES || note?.type !== 'list' || note.layoutVariant !== 'threads-recap-note' || !note.title.trim()) {
    throw new Error(`${THREADS_RECAP_NAME}: cần 1 trang note và ${THREADS_RECAP_PHOTOS} trang ảnh.`);
  }
  const names = new Set<string>();
  for (const item of note.items) {
    if (!String(item.name || '').trim() || recapRowAmount(item) === null) throw new Error(`${THREADS_RECAP_NAME}: dòng chi phí thiếu tên hoặc số tiền.`);
    if (item.sourceSectionKey) {
      const key = identity(item);
      if (names.has(key)) throw new Error(`${THREADS_RECAP_NAME}: địa điểm bị trùng trong note.`);
      names.add(key);
    }
  }
  const featured = note.items.filter(item => String(item.imageUrl || '').trim()).map(item => item.imageUrl);
  const shown = pages.slice(1).map(page => page.backgroundImage || '');
  if (featured.length !== THREADS_RECAP_PHOTOS || new Set(featured).size !== THREADS_RECAP_PHOTOS
    || shown.some((url, index) => url !== featured[index] || pages[index + 1].layoutVariant !== 'threads-recap-photo')) {
    throw new Error(`${THREADS_RECAP_NAME}: ${THREADS_RECAP_PHOTOS} ảnh phải là ảnh riêng, không trùng, đúng thứ tự các địa điểm trong note.`);
  }
}

/** Chỉ để xem trong thư viện mẫu khi nguồn chưa đủ dữ liệu; không lưu thành list. */
export function buildThreadsRecapExample(destination: string): DeckPage[] {
  const make = (sectionKey: SectionKey, label: string, type: string, price: number, count: number): GuideItem[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `example-${sectionKey}-${i}`, sectionKey, name: `${label} minh họa ${i + 1}`, address: '', type,
      headPrice: String(price + i * 5000), price: '', isPartner: false,
      imageUrl: `/assets/drive-file?id=example-${sectionKey}-${i}`, imageMapped: true, imageSource: 'manual',
    } as GuideItem));
  const itemsBySection = {
    quan_an: make('quan_an', 'Quán ăn', 'Ăn Trưa', 50000, 5), cafe: make('cafe', 'Cà phê', 'Cafe', 40000, 3),
    homestay: make('homestay', 'Homestay', 'Lưu trú', 250000, 1),
    dich_vu: [...make('dich_vu', 'Nhà xe', 'Nhà xe', 250000, 1), ...make('dich_vu', 'Thuê xe', 'Thuê xe', 100000, 1)],
    khu_du_lich: make('khu_du_lich', 'Điểm tham quan', 'Khu du lịch', 60000, 4),
  } as unknown as WorkbookItemsBySection;
  const [note, ...photos] = buildThreadsRecapPages(itemsBySection, 'preview', destination) as ListPage[];
  return [{ ...note, subtitle: 'MẪU MINH HỌA · Không phải chi phí thực. Cập nhật dữ liệu rồi tạo list mới.',
    items: note.items.map(item => ({ ...item, imageUrl: '', imageMapped: false, imageSource: 'fallback' as const, candidateImageUrls: [] })) },
    ...photos.map(page => ({ ...page, backgroundImage: '' }))];
}
