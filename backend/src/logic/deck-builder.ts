// ─── Deck builder: builds pages for every deck type ──────────────────────────
import {
  AccentTone,
  CoverPage,
  DeckBuildPools,
  DeckPage,
  GuideDeck,
  GuideDeckList,
  GuideItem,
  ImageLibraryFolderEntry,
  ListPage,
  PageItem,
  WorkbookItemsBySection,
} from '../core/types';
import { allowedImageKindsForItem, createListImageResolver, stableHash, topDirKind } from './image-resolver';

// ─── Utility helpers shared by all deck builders ─────────────────────────────

export function normalizeItemType(item: GuideItem, ...needles: string[]): boolean {
  const itemType = item.type
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return needles.some((n) => itemType.includes(n));
}

export function dedupeItems(items: GuideItem[]): GuideItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function metaText(item: GuideItem): [string, string] {
  const primary = item.address || 'Đang cập nhật địa chỉ';
  const secondaryParts: string[] = [];
  if (item.openHours) secondaryParts.push(`Khung giờ: ${item.openHours}`);
  if (item.price) secondaryParts.push(`Giá: ${item.price}`);
  else if (item.phone) secondaryParts.push(`Liên hệ: ${item.phone}`);
  return [primary, secondaryParts.join(' · ')];
}

export function backgroundFor(imageUrls: string[], seed: string): string {
  if (imageUrls.length === 0) return '';
  return imageUrls[stableHash(seed) % imageUrls.length];
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function firstHourFromOpenHours(value: string): number | null {
  const match = String(value ?? '').match(/(\d{1,2})\s*[:hH]\s*(\d{2})|(\d{1,2})/);
  if (!match) return null;
  const hour = Number(match[1] ?? match[3]);
  return Number.isFinite(hour) ? hour : null;
}

function isMorningCafe(item: GuideItem): boolean {
  if (item.sectionKey !== 'cafe') return false;
  const hour = firstHourFromOpenHours(item.openHours);
  if (hour !== null) return hour <= 8;
  const normalized = normalizeText(`${item.type} ${item.highlight}`);
  return normalized.includes('sang') || normalized.includes('breakfast');
}

function isOutdoorSpot(item: GuideItem): boolean {
  const normalized = normalizeText(`${item.name} ${item.address} ${item.type} ${item.highlight}`);
  return [
    'doi',
    'ho',
    'suoi',
    'thac',
    'rung',
    'trai',
    'lang',
    'vuon',
    'ngoai_canh',
    'mimosa',
    'lam_ha',
    'ta_nung',
    'cung_duong',
    'cay',
    'quan_truong',
    'huyen',
  ].some((token) => normalized.includes(token));
}

function photomodeMetaPrimary(item: GuideItem): string {
  if (item.sectionKey === 'dich_vu' && item.phone && item.address) {
    return `(${item.phone}) ${item.address}`;
  }
  return item.address || item.phone || 'Đang cập nhật';
}

function photomodeServiceLabel(item: GuideItem): string {
  const normalized = normalizeText(`${item.type} ${item.name}`);
  if (item.sectionKey === 'homestay') return 'lưu trú';
  if (normalized.includes('dac_san') || normalized.includes('qua')) return 'quà tặng';
  if (normalized.includes('thue_xe') || normalized.includes('xe')) return 'dịch vụ thuê xe';
  return 'dịch vụ cần lưu ý';
}

function photomodePageItemWithResolver(
  item: GuideItem,
  label: string,
  resolveImage: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote'>,
): PageItem {
  const resolvedImage = resolveImage(item);
  return {
    label,
    name: item.name,
    metaPrimary: photomodeMetaPrimary(item),
    metaSecondary: '',
    imageUrl: resolvedImage.imageUrl,
    imageMapped: resolvedImage.imageMapped,
    imageSource: resolvedImage.imageSource,
    imageNote: resolvedImage.imageNote,
    isPartner: item.isPartner,
    rawName: item.name,
  };
}

// ─── Page item factories ──────────────────────────────────────────────────────

export function pageItemWithResolver(
  item: GuideItem,
  label: string,
  resolveImage: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote'>,
): PageItem {
  const [metaPrimary, metaSecondary] = metaText(item);
  const resolvedImage = resolveImage(item);
  return {
    label,
    name: item.name,
    metaPrimary,
    metaSecondary,
    imageUrl: resolvedImage.imageUrl,
    imageMapped: resolvedImage.imageMapped,
    imageSource: resolvedImage.imageSource,
    imageNote: resolvedImage.imageNote,
    isPartner: item.isPartner,
    rawName: item.name,
  };
}

export function schedulePageItemWithResolver(
  time: string,
  prefix: string,
  item: GuideItem,
  resolveImage: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote'>,
): PageItem {
  const [metaPrimary, metaSecondary] = metaText(item);
  const resolvedImage = resolveImage(item);
  return {
    label: time,
    name: `${prefix} ${item.name}`,
    metaPrimary,
    metaSecondary,
    imageUrl: resolvedImage.imageUrl,
    imageMapped: resolvedImage.imageMapped,
    imageSource: resolvedImage.imageSource,
    imageNote: resolvedImage.imageNote,
    isPartner: item.isPartner,
    rawName: item.name,
  };
}

export function buildCoverPage(title: string, subtitle: string, backgroundImage: string): CoverPage {
  return { type: 'cover', title, subtitle, backgroundImage };
}

export function buildListPage(
  chipText: string,
  chipTone: AccentTone,
  title: string,
  subtitle: string,
  items: PageItem[],
  backgroundImage: string,
  layoutVariant: 'standard' | 'dense' | 'itinerary' | 'compact' | 'photomode' | 'grid-6' = 'standard',
): ListPage {
  return { type: 'list', chipText, chipTone, title, subtitle, items, backgroundImage, layoutVariant };
}

export function buildDeckList(
  deckId: string,
  listSuffix: string,
  navTitle: string,
  title: string,
  description: string,
  pages: DeckPage[],
): GuideDeckList {
  return { id: `${deckId}-${listSuffix}`, navTitle, title, description, pages };
}

// ─── Item selection helpers ───────────────────────────────────────────────────

type PickFn = (items: GuideItem[], count: number, seed: string, predicate?: (item: GuideItem) => boolean) => GuideItem[];

function candidateScore(item: GuideItem, seed: string): { total: number; tieBreaker: number } {
  let infoScore = 0;
  if (item.openHours) infoScore += 15;
  if (item.price) infoScore += 10;
  if (item.highlight) infoScore += 8;
  if (item.phone) infoScore += 8;
  return {
    total: (item.isPartner ? 100 : 0) + infoScore,
    tieBreaker: 10_000 - (stableHash(seed + item.id) % 10_000),
  };
}

function sortCandidates(items: GuideItem[], seed: string): GuideItem[] {
  return [...items].sort((l, r) => {
    const sl = candidateScore(l, seed);
    const sr = candidateScore(r, seed);
    if (sr.total !== sl.total) return sr.total - sl.total;
    if (sr.tieBreaker !== sl.tieBreaker) return sr.tieBreaker - sl.tieBreaker;
    return l.name.localeCompare(r.name, 'vi');
  });
}

export function createListPicker(): PickFn {
  const usedIds = new Set<string>();
  return (items, count, seed, predicate) => {
    const filtered = predicate ? items.filter(predicate) : items;
    const source = filtered.length > 0 ? filtered : items;
    const sorted = sortCandidates(source, seed);
    const fresh = sorted.filter((item) => !usedIds.has(item.id));
    const reused = sorted.filter((item) => usedIds.has(item.id));
    const selected = [...fresh.slice(0, count), ...reused.slice(0, Math.max(0, count - fresh.length))].slice(0, count);
    selected.forEach((item) => usedIds.add(item.id));
    return selected;
  };
}

export function pickMixedItemsWithPartnerQuota(items: GuideItem[], count: number, seed: string, pick: PickFn): GuideItem[] {
  const partnerPool = items.filter((i) => i.isPartner);
  const regularPool = items.filter((i) => !i.isPartner);

  const targetPartnerCount = Math.min(3, partnerPool.length);
  const targetRegularCount = count - targetPartnerCount;

  const selectedPartners = pick(partnerPool, targetPartnerCount, `${seed}-partners`);
  const selectedRegulars = pick(regularPool, targetRegularCount, `${seed}-regular`);

  return [...selectedPartners, ...selectedRegulars].slice(0, count);
}

export function pickMixedItemsWithPartnerAndRegularPools(
  partnerItems: GuideItem[],
  regularItems: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
): GuideItem[] {
  const partnerPool = partnerItems.filter((i) => i.isPartner);
  const regularPool = regularItems.filter((i) => !i.isPartner);

  const targetPartnerCount = Math.min(3, partnerPool.length);
  const targetRegularCount = count - targetPartnerCount;

  const selectedPartners = pick(partnerPool, targetPartnerCount, `${seed}-partners`);
  const selectedRegulars = pick(regularPool, targetRegularCount, `${seed}-regular`);

  return [...selectedPartners, ...selectedRegulars].slice(0, count);
}

export function pickContextualItems(
  preferredItems: GuideItem[],
  fallbackItems: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
): GuideItem[] {
  const preferredPool = dedupeItems(preferredItems);
  if (preferredPool.length >= count) return pick(preferredPool, count, seed);
  return pick(dedupeItems([...preferredItems, ...fallbackItems]), count, seed);
}

function pickSingleContextualItem(preferred: GuideItem[], fallback: GuideItem[], seed: string, pick: PickFn): GuideItem[] {
  return pickContextualItems(preferred, fallback, 1, seed, pick);
}

function pickItineraryPageItems(
  slots: Array<{ time: string; prefix: string; preferredItems: GuideItem[]; fallbackItems: GuideItem[]; seed: string }>,
  pick: PickFn,
  resolveImage: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote'>,
): PageItem[] {
  return slots.map((slot) => {
    const selected = pickSingleContextualItem(slot.preferredItems, slot.fallbackItems, slot.seed, pick)[0];
    return schedulePageItemWithResolver(slot.time, slot.prefix, selected, resolveImage);
  });
}

function pickItineraryListItems(
  preferredItems: GuideItem[],
  fallbackItems: GuideItem[],
  count: number,
  seed: string,
  label: string,
  pick: PickFn,
  resolveImage: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote'>,
): PageItem[] {
  const pools = [...dedupeItems(preferredItems), ...dedupeItems(fallbackItems)];
  return pickMixedItemsWithPartnerQuota(pools, count, seed, pick).map((item) =>
    pageItemWithResolver(item, label, resolveImage),
  );
}

// ─── Pool helpers ─────────────────────────────────────────────────────────────

export function createDeckBuildPools(itemsBySection: WorkbookItemsBySection): DeckBuildPools {
  const foodItems = itemsBySection.quan_an;
  const cafeItems = itemsBySection.cafe;
  const stayItems = itemsBySection.homestay;
  const checkinItems = itemsBySection.check_in;
  const serviceItems = itemsBySection.dich_vu;
  const historyItems = itemsBySection.dia_diem_lich_su;
  const tourismItems = itemsBySection.khu_du_lich;
  return {
    foodItems, cafeItems, stayItems, checkinItems, serviceItems, historyItems, tourismItems,
    breakfastItems: foodItems.filter((i) => normalizeItemType(i, 'sang')),
    lunchItems: foodItems.filter((i) => normalizeItemType(i, 'trua')),
    dinnerItems: foodItems.filter((i) => normalizeItemType(i, 'toi')),
    freeCheckinItems: checkinItems.filter((i) => i.price.toLowerCase().includes('free')),
    famousItems: [...historyItems, ...tourismItems],
  };
}

export function collectMappedImageUrls(pools: DeckBuildPools): string[] {
  return [
    ...pools.foodItems, ...pools.cafeItems, ...pools.stayItems,
    ...pools.checkinItems, ...pools.serviceItems, ...pools.historyItems, ...pools.tourismItems,
  ]
    .filter((i) => i.imageSource === 'manual' || i.imageSource === 'auto')
    .map((i) => i.imageUrl)
    .filter(Boolean);
}

// ─── Caption helpers ──────────────────────────────────────────────────────────

export function splitCaptionBody(text: string, count: number): string[] {
  if (!text) return Array.from({ length: count }, () => '');
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length >= count) {
    const chunks = Array.from({ length: count }, () => [] as string[]);
    sentences.forEach((s, i) => chunks[i % count].push(s));
    return chunks.map((c) => c.join(' ').trim());
  }
  const words = text.split(/\s+/).filter(Boolean);
  const wordsPerChunk = Math.ceil(words.length / Math.max(count, 1));
  return Array.from({ length: count }, (_, i) =>
    words.slice(i * wordsPerChunk, (i + 1) * wordsPerChunk).join(' ').trim(),
  );
}

export function applyCaptionToPages(pages: DeckPage[], caption: { headline: string; body: string }): DeckPage[] {
  const bodyChunks = splitCaptionBody(caption.body, Math.max(pages.length - 1, 1));
  return pages.map((page, index) => {
    if (page.type === 'cover') return { ...page, title: caption.headline, subtitle: caption.body.replace(/#\w+/g, '').trim().slice(0, 180) };
    return { ...page, subtitle: bodyChunks[index - 1] || page.subtitle };
  });
}

// ─── Individual deck page builders ───────────────────────────────────────────

function buildItineraryPages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
): DeckPage[] {
  const initialUsedUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:itinerary`, initialUsedUrls);
  const pick = createListPicker();
  const breakfastOrLunchItems = dedupeItems([...pools.breakfastItems, ...pools.lunchItems]);
  const arrivalServiceItems = pools.serviceItems.filter((item) => {
    const t = item.type.toLowerCase();
    const n = item.name.toLowerCase();
    return t.includes('thue') || n.includes('thue') || t.includes('rental') || n.includes('rental');
  });

  return [
    buildCoverPage(
      'Gợi ý lịch trình 3N2Đ',
      'Một bộ khung ngắn để đi Đà Lạt lần đầu mà vẫn có ăn sáng, cafe, check-in và chỗ chơi đáng lưu.',
      backgroundFor(imageUrls, `${seedPrefix}-cover-itinerary`),
    ),
    buildListPage('Ngày 1', 'terracotta', 'Ngày 1 - tuyến trung tâm',
      'Một page gom đủ gửi đồ, ăn sáng, cafe, ăn trưa, check-in và ăn tối của ngày đầu.',
      pickItineraryPageItems([
        { time: '05:00', prefix: 'Gửi đồ:', preferredItems: pools.stayItems, fallbackItems: [...arrivalServiceItems, ...pools.serviceItems, ...pools.stayItems], seed: `${seedPrefix}-it-day1-stay` },
        { time: '07:30', prefix: 'Ăn sáng:', preferredItems: pools.breakfastItems, fallbackItems: breakfastOrLunchItems, seed: `${seedPrefix}-it-day1-breakfast` },
        { time: '09:00', prefix: 'Cafe:', preferredItems: pools.cafeItems, fallbackItems: pools.cafeItems, seed: `${seedPrefix}-it-day1-cafe` },
        { time: '12:00', prefix: 'Ăn trưa:', preferredItems: pools.lunchItems, fallbackItems: pools.foodItems, seed: `${seedPrefix}-it-day1-lunch` },
        { time: '15:00', prefix: 'Check-in:', preferredItems: [...pools.freeCheckinItems, ...pools.checkinItems], fallbackItems: [...pools.checkinItems, ...pools.famousItems], seed: `${seedPrefix}-it-day1-checkin` },
        { time: '18:30', prefix: 'Ăn tối:', preferredItems: pools.dinnerItems, fallbackItems: pools.dinnerItems, seed: `${seedPrefix}-it-day1-dinner` },
      ], pick, imageResolver),
      backgroundFor(imageUrls, `${seedPrefix}-it-day1`), 'itinerary',
    ),
    buildListPage('Ngày 2', 'pine', 'Ngày 2 - săn ảnh và đi chơi',
      'Tuyến ngày hai ưu tiên cảnh đẹp, cafe nghỉ chân, ăn trưa, check-in và ăn tối.',
      pickItineraryPageItems([
        { time: '06:30', prefix: 'Ăn sáng:', preferredItems: pools.breakfastItems, fallbackItems: breakfastOrLunchItems, seed: `${seedPrefix}-it-day2-breakfast` },
        { time: '08:30', prefix: 'Bắt đầu:', preferredItems: pools.famousItems, fallbackItems: [...pools.famousItems, ...pools.checkinItems], seed: `${seedPrefix}-it-day2-famous` },
        { time: '10:30', prefix: 'Cafe:', preferredItems: pools.cafeItems, fallbackItems: pools.cafeItems, seed: `${seedPrefix}-it-day2-cafe` },
        { time: '12:30', prefix: 'Ăn trưa:', preferredItems: pools.lunchItems, fallbackItems: pools.foodItems, seed: `${seedPrefix}-it-day2-lunch` },
        { time: '15:00', prefix: 'Check-in:', preferredItems: [...pools.freeCheckinItems, ...pools.checkinItems], fallbackItems: [...pools.checkinItems, ...pools.famousItems], seed: `${seedPrefix}-it-day2-checkin` },
        { time: '18:30', prefix: 'Ăn tối:', preferredItems: pools.dinnerItems, fallbackItems: pools.dinnerItems, seed: `${seedPrefix}-it-day2-dinner` },
      ], pick, imageResolver),
      backgroundFor(imageUrls, `${seedPrefix}-it-day2`), 'itinerary',
    ),
    buildListPage('Ngày 3', 'gold', 'Ngày 3 - chill nhẹ rồi mua quà',
      'Ngày cuối giữ nhịp nhẹ: ăn sáng, cafe, điểm ghé, ăn trưa và dịch vụ chốt chuyến.',
      pickItineraryPageItems([
        { time: '07:30', prefix: 'Ăn sáng:', preferredItems: pools.breakfastItems, fallbackItems: breakfastOrLunchItems, seed: `${seedPrefix}-it-day3-breakfast` },
        { time: '09:00', prefix: 'Cafe:', preferredItems: pools.cafeItems, fallbackItems: pools.cafeItems, seed: `${seedPrefix}-it-day3-cafe` },
        { time: '10:30', prefix: 'Điểm ghé:', preferredItems: pools.famousItems, fallbackItems: [...pools.famousItems, ...pools.checkinItems], seed: `${seedPrefix}-it-day3-famous` },
        { time: '12:00', prefix: 'Ăn trưa:', preferredItems: pools.lunchItems, fallbackItems: pools.foodItems, seed: `${seedPrefix}-it-day3-lunch` },
        { time: '15:00', prefix: 'Dịch vụ:', preferredItems: pools.serviceItems, fallbackItems: [...pools.serviceItems, ...pools.stayItems], seed: `${seedPrefix}-it-day3-service` },
        { time: '17:00', prefix: 'Chốt chuyến:', preferredItems: pools.stayItems, fallbackItems: [...pools.stayItems, ...pools.serviceItems], seed: `${seedPrefix}-it-day3-stay` },
      ], pick, imageResolver),
      backgroundFor(imageUrls, `${seedPrefix}-it-day3`), 'itinerary',
    ),
    buildListPage('Check-in', 'berry', 'Địa điểm check-in',
      'Các điểm check-in không thể bỏ qua, ưu tiên các đối tác và các điểm tham quan miễn phí tại Đà Lạt.',
      pickPhotomodeItemsWithQuota(
        dedupeItems([...pools.checkinItems, ...pools.freeCheckinItems]),
        6, `${seedPrefix}-it-checkin-page`, pick
      ).map((item) => pageItemWithResolver(item, 'Check-in', imageResolver)),
      backgroundFor(imageUrls, `${seedPrefix}-it-checkin-page`), 'compact',
    ),
    buildListPage('Dịch vụ', 'slate', 'Một số dịch vụ cần lưu ý cho bạn',
      'Một trang chốt để nhắc về thuê xe, mua quà hoặc chỗ nghỉ trước khi chốt hành trình, nên bổ sung nhiều điểm hơn để dễ chọn nhanh.',
      pickPhotomodeItemsWithQuota(
        dedupeItems([...pools.serviceItems, ...pools.stayItems]),
        6, `${seedPrefix}-it-service-page`, pick,
      ).map((item) => pageItemWithResolver(item, 'Cần lưu', imageResolver)),
      backgroundFor(imageUrls, `${seedPrefix}-it-service-page`), 'compact',
    ),
  ];
}

function buildMustGoPages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
): DeckPage[] {
  const initialUsedUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:must-go`, initialUsedUrls);
  const pick = createListPicker();
  const breakfastOrLunchItems = dedupeItems([...pools.breakfastItems, ...pools.lunchItems]);
  return [
    buildCoverPage('Những điểm không thể bỏ qua', 'Dùng cho các bộ ảnh kiểu must-go: điểm nổi tiếng, check-in free, cafe có concept và chỗ ở đáng ghim.', backgroundFor(imageUrls, `${seedPrefix}-cover-must-go`)),
    buildListPage('Must go', 'terracotta', 'Điểm nổi tiếng nên ghé', 'Trang này gom nhiều điểm nổi bật hơ để người xem lưu ngay nếu không muốn bỏ lỡ nơi nổi tiếng khi đến Đà Lạt.',
      pickMixedItemsWithPartnerQuota(pools.famousItems, 4, `${seedPrefix}-must-famous-page`, pick).map((i) => pageItemWithResolver(i, 'Điểm nổi tiếng', imageResolver)),
      backgroundFor(imageUrls, `${seedPrefix}-must-famous-page`), 'dense'),
    buildListPage('Gợi ý', 'gold', 'Check-in miễn phí', 'Các điểm free được tăng thêm số lượng để trang này thật sự có giá trị lưu lại, không chỉ dừng ở 1-2 địa điểm.',
      pickMixedItemsWithPartnerQuota(pools.freeCheckinItems.length > 0 ? pools.freeCheckinItems : pools.checkinItems, 4, `${seedPrefix}-must-free-page`, pick).map((i) => pageItemWithResolver(i, 'Check-in free', imageResolver)),
      backgroundFor(imageUrls, `${seedPrefix}-must-free-page`), 'dense'),
    buildListPage('Cafe', 'pine', 'Quán cafe có concept', 'Giữ layout chữ to, tên quán nổi rõ nhưng tăng thêm dữ liệu để page cafe trông thật sự đáng lưu.',
      pickMixedItemsWithPartnerQuota(pools.cafeItems, 4, `${seedPrefix}-must-cafe-page`, pick).map((i) => pageItemWithResolver(i, 'Cafe đẹp', imageResolver)),
      backgroundFor(imageUrls, `${seedPrefix}-must-cafe-page`), 'dense'),
    buildListPage('Ăn uống', 'berry', 'Ăn sáng rồi đi đâu', 'Một trang xen giữa ăn sáng và điểm đến để bộ carousel bớt lặp toàn check-in, đồng thời có đủ dữ liệu để dùng được ngay.',
      pickMixedItemsWithPartnerQuota(breakfastOrLunchItems, 4, `${seedPrefix}-must-food-page`, pick).map((i) => pageItemWithResolver(i, 'Ăn sáng', imageResolver)),
      backgroundFor(imageUrls, `${seedPrefix}-must-food-page`), 'dense'),
    buildListPage('Lưu trú', 'slate', 'Homestay và dịch vụ nên nhớ', 'Trang cuối dùng để chốt các điểm thực dụng như ở đâu, thuê gì, mua quà ở đâu trước khi kết thúc bộ nội dung, nên mình tăng thêm lựa chọn.',
      pickMixedItemsWithPartnerQuota([...pools.stayItems, ...pools.serviceItems], 4, `${seedPrefix}-must-stay-page`, pick).map((i) => pageItemWithResolver(i, 'Chốt chuyến', imageResolver)),
      backgroundFor(imageUrls, `${seedPrefix}-must-stay-page`), 'dense'),
  ];
}

function buildFirstTimePages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
): DeckPage[] {
  const initialUsedUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:first-time`, initialUsedUrls);
  const pick = createListPicker();
  const breakfastOrLunchItems = dedupeItems([...pools.breakfastItems, ...pools.lunchItems]);
  return [
    buildCoverPage('Đi Đà Lạt lần đầu nên lưu gì', 'Một bộ trang dành cho người chuẩn bị đi Đà Lạt: ăn sáng, cafe, check-in, địa điểm nổi tiếng và dịch vụ cần nhớ.', backgroundFor(imageUrls, `${seedPrefix}-cover-first-time`)),
    buildListPage('Lưu ý', 'terracotta', 'Đi sớm để săn ảnh đẹp', 'Mở đầu bằng các điểm hợp buổi sáng để bộ nội dung có nhịp giống mẫu, nhưng tăng số điểm để người mới nhìn là có nhiều gợi ý hơn.',
      pickMixedItemsWithPartnerQuota([...pools.breakfastItems, ...pools.cafeItems, ...pools.freeCheckinItems], 4, `${seedPrefix}-first-morning-page`, pick).map((i) => pageItemWithResolver(i, 'Sáng sớm', imageResolver)),
      backgroundFor(imageUrls, `${seedPrefix}-first-morning-page`), 'dense'),
    buildListPage('Ăn sáng', 'gold', 'Quán ăn sáng dễ chốt', 'Ưu tiên những chỗ có địa chỉ rõ, dữ liệu đủ sạch để dùng cho bộ ảnh dành cho người mới lên kế hoạch, nên bổ sung thêm số lượng.',
      pickMixedItemsWithPartnerQuota(breakfastOrLunchItems, 4, `${seedPrefix}-first-breakfast-page`, pick).map((i) => pageItemWithResolver(i, 'Buổi sáng', imageResolver)),
      backgroundFor(imageUrls, `${seedPrefix}-first-breakfast-page`), 'dense'),
    buildListPage('Cafe', 'pine', 'Cafe để ngồi và chụp', 'Trang này đóng vai trò cầu nối giữa lịch trình và visual, nên tăng số quán để người mới dễ chọn concept phù hợp.',
      pickMixedItemsWithPartnerQuota(pools.cafeItems, 4, `${seedPrefix}-first-cafe-page`, pick).map((i) => pageItemWithResolver(i, 'Cafe', imageResolver)),
      backgroundFor(imageUrls, `${seedPrefix}-first-cafe-page`), 'dense'),
    buildListPage('Check-in', 'berry', 'Điểm chụp hình nên ghé', 'Một trang tập trung vào check-in và điểm nổi tiếng để người chuẩn bị đi có thể lưu nhanh nhiều chỗ hơn, không chỉ 1-2 điểm.',
      pick([...pools.checkinItems, ...pools.famousItems], 4, `${seedPrefix}-first-checkin-page`).map((i) => pageItemWithResolver(i, 'Nên ghé', imageResolver)),
      backgroundFor(imageUrls, `${seedPrefix}-first-checkin-page`), 'dense'),
    buildListPage('Cuối list', 'slate', 'Dịch vụ và chỗ nghỉ cần nhớ', 'Trang chốt tổng hợp các thứ thực dụng: ở đâu, liên hệ gì, mua quà hay thuê xe ở đâu cho gọn, nên mình tăng thêm điểm để tiện chốt nhanh.',
      pick([...pools.serviceItems, ...pools.stayItems], 4, `${seedPrefix}-first-service-page`).map((i) => pageItemWithResolver(i, 'Cần nhớ', imageResolver)),
      backgroundFor(imageUrls, `${seedPrefix}-first-service-page`), 'dense'),
  ];
}

export function pickPhotomodeItemsWithQuota(
  items: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
): GuideItem[] {
  const partnerPool = items.filter((i) => i.isPartner);
  const regularPool = items.filter((i) => !i.isPartner);

  // Tỉ lệ 2/3 đối tác, 1/3 không phải đối tác
  let targetPartnerCount = Math.floor((count * 2) / 3);
  if (partnerPool.length < targetPartnerCount) {
    targetPartnerCount = partnerPool.length;
  }

  const selectedPartners = pick(partnerPool, targetPartnerCount, `${seed}-partners`);
  const selectedRegulars = pick(regularPool, count - selectedPartners.length, `${seed}-regular`);

  const combined = [...selectedPartners, ...selectedRegulars];
  return combined.sort((a, b) => stableHash(`${seed}:shuffle:${a.id}`) - stableHash(`${seed}:shuffle:${b.id}`));
}

function buildPhotomodeItems(
  preferredItems: GuideItem[],
  fallbackItems: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
  resolveImage: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote'>,
  labelForItem: (item: GuideItem) => string,
): PageItem[] {
  const pool = dedupeItems([...preferredItems, ...fallbackItems]);
  return pickPhotomodeItemsWithQuota(pool, count, seed, pick).map((item) =>
    photomodePageItemWithResolver(item, labelForItem(item), resolveImage),
  );
}

function buildPov3DayPages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
): DeckPage[] {
  const initialUsedUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:pov-3-day`, initialUsedUrls);
  const pick = createListPicker();
  const allSpots = dedupeItems([...pools.checkinItems, ...pools.famousItems]);
  const outdoorSpots = allSpots.filter(isOutdoorSpot);
  const morningCafes = pools.cafeItems.filter(isMorningCafe);
  const chillCafes = pools.cafeItems.filter((item) => !isMorningCafe(item));
  const catchAllItems = dedupeItems([
    ...pools.checkinItems,
    ...pools.cafeItems,
    ...pools.foodItems,
    ...pools.serviceItems,
    ...pools.stayItems,
    ...pools.famousItems,
  ]);
  const coverItem = pickSingleContextualItem(
    [...outdoorSpots, ...pools.freeCheckinItems],
    [...allSpots, ...pools.cafeItems, ...catchAllItems],
    `${seedPrefix}-cover`,
    pick,
  )[0];
  const coverImage = coverItem
    ? photomodePageItemWithResolver(coverItem, 'checkin ngoại cảnh', imageResolver).imageUrl
    : backgroundFor(imageUrls, `${seedPrefix}-cover-bg`);

  return [
    {
      ...buildCoverPage(
        'POV: có 3 ngày\nvi vu khắp Đà Lạt',
        'dalat. [gợi ý local guide ngắn ngày]',
        coverImage,
      ),
      layoutVariant: 'photomode',
    },
    buildListPage(
      'Check-in free',
      'terracotta',
      'Check-in free cho 3 ngày vi vu',
      'Gom các điểm check-in free local, dùng layout photomode bám sát mẫu tham chiếu.',
      buildPhotomodeItems(
        [...pools.freeCheckinItems, ...pools.checkinItems],
        [...allSpots, ...catchAllItems],
        3,
        `${seedPrefix}-free-checkin`,
        pick,
        imageResolver,
        () => 'checkin free',
      ),
      '',
      'photomode',
    ),
    buildListPage(
      'Cafe sáng',
      'gold',
      'Cafe sáng',
      'Ưu tiên các quán mở sớm và hợp nhịp buổi sáng.',
      buildPhotomodeItems(
        morningCafes,
        [...pools.cafeItems, ...catchAllItems],
        3,
        `${seedPrefix}-morning-cafe`,
        pick,
        imageResolver,
        () => 'cà phê sáng',
      ),
      '',
      'photomode',
    ),
    buildListPage(
      'Cafe chill',
      'pine',
      'Cafe chill',
      'Những quán có vibe ngồi lâu, chill hoặc săn ảnh cuối ngày.',
      buildPhotomodeItems(
        chillCafes,
        [...pools.cafeItems, ...catchAllItems],
        3,
        `${seedPrefix}-chill-cafe`,
        pick,
        imageResolver,
        () => 'cà phê chill',
      ),
      '',
      'photomode',
    ),
    buildListPage(
      'Ngoại cảnh',
      'berry',
      'Check-in ngoại cảnh',
      'Ưu tiên các cảnh rộng, điểm ngoại cảnh và spots hợp chụp ảnh.',
      buildPhotomodeItems(
        [...outdoorSpots, ...pools.famousItems],
        [...allSpots, ...catchAllItems],
        3,
        `${seedPrefix}-outdoor-checkin`,
        pick,
        imageResolver,
        () => 'checkin ngoại cảnh',
      ),
      '',
      'photomode',
    ),
    buildListPage(
      'Ăn sáng',
      'gold',
      'Ăn sáng',
      'Các quán dễ chèn vào buổi sớm trong chuỗi 3 ngày vi vu.',
      buildPhotomodeItems(
        pools.breakfastItems,
        [...pools.foodItems, ...catchAllItems],
        3,
        `${seedPrefix}-breakfast`,
        pick,
        imageResolver,
        () => 'ăn sáng',
      ),
      '',
      'photomode',
    ),
    buildListPage(
      'Ăn trưa',
      'terracotta',
      'Ăn trưa',
      'Các quán hợp buổi trưa, nhìn là biết nên lưu ngay.',
      buildPhotomodeItems(
        pools.lunchItems,
        [...pools.foodItems, ...catchAllItems],
        3,
        `${seedPrefix}-lunch`,
        pick,
        imageResolver,
        () => 'ăn trưa',
      ),
      '',
      'photomode',
    ),
    buildListPage(
      'Ăn tối',
      'slate',
      'Ăn tối',
      'Nhóm quán nên lưu cho buổi tối, ưu tiên ảnh món và không khí quán.',
      buildPhotomodeItems(
        pools.dinnerItems,
        [...pools.foodItems, ...catchAllItems],
        3,
        `${seedPrefix}-dinner`,
        pick,
        imageResolver,
        () => 'ăn tối',
      ),
      '',
      'photomode',
    ),
    buildListPage(
      'Dịch vụ',
      'pine',
      'Dịch vụ cần lưu ý',
      'Trang chốt gom các dịch vụ thực dụng như lưu trú, mua quà, thuê xe và những điểm nên lưu trước khi chốt chuyến.',
      pickPhotomodeItemsWithQuota(
        dedupeItems([...pools.stayItems, ...pools.serviceItems, ...catchAllItems]),
        3,
        `${seedPrefix}-services`,
        pick,
      ).map((item) => photomodePageItemWithResolver(item, photomodeServiceLabel(item), imageResolver)),
      '',
      'photomode',
    ),
  ];
}

function buildGrid6Pages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
): DeckPage[] {
  const pick = createListPicker();
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, seedPrefix);
  const catchAllItems = dedupeItems([...pools.famousItems, ...pools.checkinItems, ...pools.cafeItems, ...pools.foodItems]);

  return [
    {
      ...buildCoverPage(
        'TOP 6 ĐỊA ĐIỂM ĐÀ LẠT',
        'Lịch trình tinh gọn, lưu ngay nhé!',
        backgroundFor(imageUrls, `${seedPrefix}-cover`),
      ),
      layoutVariant: 'grid-6',
    },
    buildListPage(
      'Check-in',
      'terracotta',
      'DANH SÁCH ĐỊA ĐIỂM',
      'Check-in free cực đỉnh',
      pickMixedItemsWithPartnerQuota(pools.checkinItems.length > 0 ? pools.checkinItems : catchAllItems, 6, `${seedPrefix}-checkin`, pick).map((item) =>
        photomodePageItemWithResolver(item, item.type, imageResolver),
      ),
      '',
      'grid-6',
    ),
    buildListPage(
      'Cà phê',
      'gold',
      'QUÁN CAFE ĐÀ LẠT',
      'View cực chill, săn mây đỉnh',
      pickMixedItemsWithPartnerQuota(pools.cafeItems.length > 0 ? pools.cafeItems : catchAllItems, 6, `${seedPrefix}-cafe`, pick).map((item) =>
        photomodePageItemWithResolver(item, item.type, imageResolver),
      ),
      '',
      'grid-6',
    ),
    buildListPage(
      'Ẩm thực',
      'berry',
      'MÓN NGON ĐÀ LẠT',
      'Ăn là ghiền, nhất định phải thử',
      pickMixedItemsWithPartnerQuota(pools.foodItems.length > 0 ? pools.foodItems : catchAllItems, 6, `${seedPrefix}-food`, pick).map((item) =>
        photomodePageItemWithResolver(item, item.type, imageResolver),
      ),
      '',
      'grid-6',
    ),
    buildListPage(
      'Khu du lịch',
      'slate',
      'KHU DU LỊCH HOT',
      'Điểm đến không thể bỏ qua',
      pickMixedItemsWithPartnerQuota(pools.tourismItems.length > 0 ? pools.tourismItems : catchAllItems, 6, `${seedPrefix}-tourism`, pick).map((item) =>
        photomodePageItemWithResolver(item, item.type, imageResolver),
      ),
      '',
      'grid-6',
    ),
    buildListPage(
      'Dịch vụ',
      'pine',
      'DỊCH VỤ CẦN LƯU',
      'Lưu trú, thuê xe & quà tặng',
      pickMixedItemsWithPartnerQuota([...pools.stayItems, ...pools.serviceItems].length > 0 ? [...pools.stayItems, ...pools.serviceItems] : catchAllItems, 6, `${seedPrefix}-services`, pick).map((item) =>
        photomodePageItemWithResolver(item, photomodeServiceLabel(item), imageResolver),
      ),
      '',
      'grid-6',
    ),
  ];
}

// ─── Public entry point ───────────────────────────────────────────────────────

export function buildPagesForDeck(
  deckId: string,
  itemsBySection: WorkbookItemsBySection,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
): DeckPage[] {
  const pools = createDeckBuildPools(itemsBySection);
  if (deckId === 'itinerary-3n2d') return buildItineraryPages(pools, imageUrls, libraryEntries, seedPrefix);
  if (deckId === 'pov-3-day') return buildPov3DayPages(pools, imageUrls, libraryEntries, seedPrefix);
  if (deckId === 'must-go') return buildMustGoPages(pools, imageUrls, libraryEntries, seedPrefix);
  if (deckId === 'first-time') return buildFirstTimePages(pools, imageUrls, libraryEntries, seedPrefix);
  if (deckId === 'grid-6') return buildGrid6Pages(pools, imageUrls, libraryEntries, seedPrefix);
  throw new Error(`Không hỗ trợ deck: ${deckId}`);
}

export function buildDecks(
  itemsBySection: WorkbookItemsBySection,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
): GuideDeck[] {
  return [
    {
      id: 'itinerary-3n2d',
      navTitle: 'Lịch trình 3N2Đ',
      title: 'Bộ trang gợi ý lịch trình 3N2Đ',
      description: 'Format này nghiêng về kiểu kể theo ngày: có cover riêng, mỗi ngày là một trang, rồi chốt thêm trang ăn sáng và dịch vụ.',
      lists: [buildDeckList('itinerary-3n2d', 'main', 'List chính', 'List lịch trình 3N2Đ', 'Danh sách ảnh chính cho bộ lịch trình 3N2Đ.', buildPagesForDeck('itinerary-3n2d', itemsBySection, imageUrls, libraryEntries, 'itinerary-main'))],
    },
    {
      id: 'pov-3-day',
      navTitle: 'POV 3 ngày',
      title: 'Bộ trang POV 3 ngày vi vu khắp Đà Lạt',
      description: 'Format này bám sát photomode TikTok: cover mạnh, rồi chia theo nhóm điểm local như check-in free, cafe, ăn uống và dịch vụ cần lưu ý.',
      lists: [buildDeckList('pov-3-day', 'main', 'List chính', 'List POV 3 ngày', 'Danh sách ảnh chính cho bộ POV 3 ngày vi vu khắp Đà Lạt.', buildPagesForDeck('pov-3-day', itemsBySection, imageUrls, libraryEntries, 'pov-3-day-main'))],
    },
    {
      id: 'must-go',
      navTitle: 'Điểm không thể bỏ qua',
      title: 'Bộ trang các điểm không thể bỏ qua',
      description: 'Format này bám gần series must-go: cover mạnh, sau đó tách riêng điểm nổi tiếng, check-in free, cafe và lưu trú.',
      lists: [buildDeckList('must-go', 'main', 'List chính', 'List must-go', 'Danh sách ảnh chính cho bộ điểm không thể bỏ qua.', buildPagesForDeck('must-go', itemsBySection, imageUrls, libraryEntries, 'must-go-main'))],
    },
    {
      id: 'first-time',
      navTitle: 'Lưu ý cho người mới',
      title: 'Bộ trang dành cho người chuẩn bị đến Đà Lạt',
      description: 'Format này đi theo logic tư vấn trước chuyến đi: đi sớm, ăn gì, ngồi cafe ở đâu, check-in ở đâu và cần nhớ gì.',
      lists: [buildDeckList('first-time', 'main', 'List chính', 'List cho người mới', 'Danh sách ảnh chính cho bộ lưu ý người mới đến Đà Lạt.', buildPagesForDeck('first-time', itemsBySection, imageUrls, libraryEntries, 'first-time-main'))],
    },
    {
      id: 'grid-6',
      navTitle: 'Mẫu Lưới 6 Ô',
      title: 'Bộ trang bố cục lưới 2x3 (6 địa điểm)',
      description: 'Mẫu thiết kế mật độ thông tin cao, mỗi trang hiển thị 6 địa điểm theo dạng lưới 2 cột x 3 hàng.',
      lists: [buildDeckList('grid-6', 'main', 'List chính', 'List lưới 6 ô', 'Danh sách ảnh chính cho mẫu lưới 2x3.', buildPagesForDeck('grid-6', itemsBySection, imageUrls, libraryEntries, 'grid-6-main'))],
    },
  ];
}
