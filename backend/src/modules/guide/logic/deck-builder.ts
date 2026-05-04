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
} from '../../../common/interfaces/guide.types';
import { hasItemKey, itemUsageKey, markItemKey } from './data-allocator';
import { allowedImageKindsForItem, createListImageResolver, stableHash, topDirKind } from './image-resolver';

// ─── Utility helpers shared by all deck builders ─────────────────────────────

const DEFAULT_PARTNER_TARGET_PER_PAGE = 3;
const CAPTION_BODY_FALLBACK = 'Lưu list này để có lịch đi Đà Lạt gọn hơn, dễ chọn điểm theo buổi và đỡ mất thời gian mò từng nơi.';

function partnerTargetCount(count: number, availablePartners: number, cap = DEFAULT_PARTNER_TARGET_PER_PAGE): number {
  return Math.min(Math.max(count, 0), Math.max(availablePartners, 0), Math.max(cap, 0));
}

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
    const key = itemUsageKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
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

export function backgroundFor(imageUrls: string[], seed: string, usedImageUrls?: Set<string>): string {
  if (imageUrls.length === 0) return '';
  const ordered = [...imageUrls].sort((left, right) => stableHash(`${seed}:${left}`) - stableHash(`${seed}:${right}`));
  const picked = ordered.find((url) => !usedImageUrls?.has(url)) || ordered[0] || '';
  if (picked) usedImageUrls?.add(picked);
  return picked;
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

function isGrillOrHotpotItem(item: GuideItem): boolean {
  const normalized = normalizeText(`${item.name} ${item.type} ${item.highlight}`);
  return ['nuong', 'lau', 'nau', 'bbq', 'grill', 'buffet', 'long_nuong'].some((token) => normalized.includes(token));
}

function withoutGrillOrHotpot(items: GuideItem[]): GuideItem[] {
  return items.filter((item) => !isGrillOrHotpotItem(item));
}

function isMorningFoodItem(item: GuideItem): boolean {
  if (isGrillOrHotpotItem(item)) return false;
  const normalized = normalizeText(`${item.name} ${item.type} ${item.highlight}`);
  return [
    'an_sang',
    'sang',
    'bun',
    'pho',
    'mi',
    'hu_tieu',
    'banh_mi',
    'banh_can',
    'banh_uot',
    'xiu_mai',
    'chao',
  ].some((token) => normalized.includes(token));
}

function isLightMealItem(item: GuideItem): boolean {
  if (isGrillOrHotpotItem(item)) return false;
  const normalized = normalizeText(`${item.name} ${item.type} ${item.highlight}`);
  return [
    'an_nhe',
    'mon_nhe',
    'an_vat',
    'banh',
    'goi',
    'cuon',
    'salad',
    'kem',
    'che',
    'snack',
    'bun',
    'mi',
  ].some((token) => normalized.includes(token));
}

function photomodeMetaPrimary(item: GuideItem): string {
  return item.address || item.phone || 'Đang cập nhật';
}

function photomodeServiceLabel(item: GuideItem): string {
  const normalized = normalizeText(`${item.type} ${item.name}`);
  if (item.sectionKey === 'homestay') return 'lưu trú';
  if (normalized.includes('dac_san') || normalized.includes('qua')) return 'quà tặng';
  if (normalized.includes('thue_xe') || normalized.includes('xe')) return 'dịch vụ thuê xe';
  return 'dịch vụ cần lưu ý';
}

function mealLabelForItem(item: GuideItem): string {
  if (isGrillOrHotpotItem(item)) return 'Ăn tối';
  if (isMorningFoodItem(item)) return 'Ăn sáng';
  if (isLightMealItem(item) || normalizeItemType(item, 'trua')) return 'Ăn trưa';
  return item.type || 'Ăn uống';
}

function isFreePrice(value: string): boolean {
  const normalized = normalizeText(value);
  return normalized === 'free'
    || normalized.includes('free')
    || normalized.includes('mien_phi')
    || normalized === '0'
    || normalized === '0d'
    || normalized === '0_vnd';
}

function isFreeCheckinItem(item: GuideItem): boolean {
  return isFreePrice(item.price);
}

function photomodePageItemWithResolver(
  item: GuideItem,
  label: string,
  resolveImage: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
): PageItem {
  const resolvedImage = resolveImage(item);
  return {
    label,
    id: item.id,
    name: item.name,
    metaPrimary: photomodeMetaPrimary(item),
    metaSecondary: '',
    imageUrl: resolvedImage.imageUrl,
    imageMapped: resolvedImage.imageMapped,
    imageSource: resolvedImage.imageSource,
    imageNote: resolvedImage.imageNote,
    candidateImageUrls: resolvedImage.candidateImageUrls,
    isPartner: item.isPartner,
    rawName: item.name,
  };
}

// ─── Page item factories ──────────────────────────────────────────────────────

export function pageItemWithResolver(
  item: GuideItem,
  label: string,
  resolveImage: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
): PageItem {
  const [metaPrimary, metaSecondary] = metaText(item);
  const resolvedImage = resolveImage(item);
  return {
    label,
    id: item.id,
    name: item.name,
    metaPrimary,
    metaSecondary,
    imageUrl: resolvedImage.imageUrl,
    imageMapped: resolvedImage.imageMapped,
    imageSource: resolvedImage.imageSource,
    imageNote: resolvedImage.imageNote,
    candidateImageUrls: resolvedImage.candidateImageUrls,
    isPartner: item.isPartner,
    rawName: item.name,
  };
}

export function schedulePageItemWithResolver(
  time: string,
  prefix: string,
  item: GuideItem,
  resolveImage: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
): PageItem {
  const [metaPrimary, metaSecondary] = metaText(item);
  const resolvedImage = resolveImage(item);
  return {
    label: time,
    id: item.id,
    name: `${prefix} ${item.name}`,
    metaPrimary,
    metaSecondary,
    imageUrl: resolvedImage.imageUrl,
    imageMapped: resolvedImage.imageMapped,
    imageSource: resolvedImage.imageSource,
    imageNote: resolvedImage.imageNote,
    candidateImageUrls: resolvedImage.candidateImageUrls,
    isPartner: item.isPartner,
    rawName: item.name,
  };
}

const HEADLINE_ACCENT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bKHONG\s+THE\s+BO\s+QUA\b/gi, 'không thể bỏ qua'],
  [/\bSANG\s+MO\s+SOM\b/gi, 'sáng mơ sớm'],
  [/\bKHO\s+BAU\s+AN\s+GIAU\b/gi, 'kho báu ẩn giấu'],
  [/\bCHOT\s+DON\b/gi, 'chốt đơn'],
  [/\bDANH\s+THUC\b/gi, 'đánh thức'],
  [/\bDANH\s+SACH\b/gi, 'danh sách'],
  [/\bDIA\s+DIEM\b/gi, 'địa điểm'],
  [/\bDIEM\b/gi, 'điểm'],
  [/\bGOI\s+GON\b/gi, 'gói gọn'],
  [/\bGON\s+VI\b/gi, 'gọn ví'],
  [/\bDICH\s+VU\b/gi, 'dịch vụ'],
  [/\bDOI\s+TAC\b/gi, 'đối tác'],
  [/\bTHUE\s+XE\b/gi, 'thuê xe'],
  [/\bXE\s+MAY\b/gi, 'xe máy'],
  [/\bDAT\s+XE\b/gi, 'đặt xe'],
  [/\bAN\s+SANG\b/gi, 'ăn sáng'],
  [/\bDI\s+DA\s+LAT\b/gi, 'đi Đà Lạt'],
  [/\bDA\s+LAT\b/gi, 'Đà Lạt'],
  [/\bDALAT\b/gi, 'Đà Lạt'],
  [/\bGOI\s+Y\b/gi, 'gợi ý'],
  [/\bQUAN\s+CAFE\b/gi, 'quán cafe'],
  [/\bBUC\s+ANH\b/gi, 'bức ảnh'],
  [/\bSU\s+THAT\b/gi, 'sự thật'],
  [/\bBAT\s+NGO\b/gi, 'bất ngờ'],
  [/\bCHAY\s+HET\s+MINH\b/gi, 'cháy hết mình'],
  [/\bPHA\s+DAO\b/gi, 'phá đảo'],
  [/\bGOM\s+TRON\b/gi, 'gom trọn'],
  [/\bLOP\s+SUONG\b/gi, 'lớp sương'],
  [/\bCAM\s+NANG\b/gi, 'cẩm nang'],
  [/\bCHAM\s+SAU\b/gi, 'chạm sâu'],
  [/\bHET\s+NAC\b/gi, 'hết nấc'],
  [/\bNHIP\s+DIEU\b/gi, 'nhịp điệu'],
  [/\bDIU\s+DANG\b/gi, 'dịu dàng'],
  [/\bDI\s+CHAM\b/gi, 'đi chậm'],
  [/\bSIEU\s+CHILL\b/gi, 'siêu chill'],
  [/\bCHAM\s+MA\s+NGAM\b/gi, 'chậm mà ngấm'],
  [/\bMOI\s+GHIEN\b/gi, 'mới ghiền'],
  [/\bMA\s+GHIEN\b/gi, 'mà ghiền'],
  [/\bDEP\b/gi, 'đẹp'],
  [/\bLUU\b/gi, 'lưu'],
  [/\bTHI\b/gi, 'thì'],
  [/\bNAY\b/gi, 'này'],
];

function matchHeadlineCase(source: string, replacement: string): string {
  const letters = (source.match(/[A-Za-zÀ-ỹĐđ]/g) || []).join('');
  if (!letters) return replacement;
  const upper = letters.toLocaleUpperCase('vi-VN');
  const lower = letters.toLocaleLowerCase('vi-VN');
  if (letters === upper && letters !== lower) return replacement.toLocaleUpperCase('vi-VN');
  if (letters === lower && letters !== upper) return replacement.toLocaleLowerCase('vi-VN');
  return replacement;
}

function restoreVietnameseHeadlineAccents(value: string): string {
  let result = value
    .replace(/\b(\d+\s*N\s*\d+)(D)\b/gi, (_match, prefix: string, day: string) => `${prefix}${matchHeadlineCase(day, 'Đ')}`)
    .replace(/\b(\d+\s*)(NGAY)\b/gi, (_match, prefix: string, word: string) => `${prefix}${matchHeadlineCase(word, 'ngày')}`)
    .replace(/\b(NGAY)(\s+\d+)\b/gi, (_match, word: string, suffix: string) => `${matchHeadlineCase(word, 'ngày')}${suffix}`)
    .replace(/\b(\d+\s*)(ANH)\b/gi, (_match, prefix: string, word: string) => `${prefix}${matchHeadlineCase(word, 'ảnh')}`)
    .replace(/\b(DEM)\b/gi, (match) => matchHeadlineCase(match, 'đêm'));

  for (const [pattern, replacement] of HEADLINE_ACCENT_REPLACEMENTS) {
    result = result.replace(pattern, (match) => matchHeadlineCase(match, replacement));
  }

  return result.normalize('NFC');
}

export function buildCoverPage(title: string, subtitle: string, backgroundImage: string): CoverPage {
  return { type: 'cover', title: sanitizeDeckHeadline(title), subtitle, backgroundImage };
}

export function sanitizeDeckHeadline(value: string): string {
  return restoreVietnameseHeadlineAccents(String(value || ''))
    .replace(/\bFREE\b/g, 'ĐẸP')
    .replace(/\bFree\b/g, 'Đẹp')
    .replace(/\bfree\b/g, 'đẹp')
    .replace(/miễn\s*phí/gi, 'dễ đi')
    .replace(/\s+/g, ' ')
    .trim();
}

function coverSubtitleFromCaption(body: string, fallback: string): string {
  const cleanBody = String(body || '').replace(/\s+/g, ' ').trim();
  return sanitizeDeckHeadline(cleanBody || fallback || '');
}

export function buildListPage(
  chipText: string,
  chipTone: AccentTone,
  title: string,
  subtitle: string,
  items: PageItem[],
  backgroundImage: string,
  layoutVariant: 'standard' | 'dense' | 'itinerary' | 'compact' | 'photomode' | 'grid-6' | 'grid-8' | 'grid-4' | 'journey-4n3d' | 'journey-4n2d-grid8' = 'standard',
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

type PickFn = ((items: GuideItem[], count: number, seed: string, predicate?: (item: GuideItem) => boolean) => GuideItem[]) & {
  isUsed?: (item: GuideItem) => boolean;
};

function remainingItems(items: GuideItem[], selectedItems: GuideItem[]): GuideItem[] {
  const selectedKeys = new Set<string>();
  selectedItems.forEach((item) => markItemKey(selectedKeys, item));
  return items.filter((item) => !hasItemKey(selectedKeys, item));
}

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

export function createListPicker(initialUsedIds: Set<string> = new Set()): PickFn {
  const softUsedIds = initialUsedIds;
  const localUsedIds = new Set<string>();
  const pick: PickFn = (items, count, seed, predicate) => {
    const filtered = predicate ? items.filter(predicate) : items;
    const source = filtered.length > 0 ? filtered : items;
    const sorted = sortCandidates(dedupeItems(source), seed).filter((item) => !hasItemKey(localUsedIds, item));
    const fresh = sorted.filter((item) => !hasItemKey(softUsedIds, item));
    const previouslyUsed = sorted.filter((item) => hasItemKey(softUsedIds, item));
    const selected = (fresh.length > 0 ? fresh : previouslyUsed).slice(0, count);
    selected.forEach((item) => {
      markItemKey(localUsedIds, item);
      markItemKey(softUsedIds, item);
    });
    return selected;
  };
  pick.isUsed = (item: GuideItem) => hasItemKey(localUsedIds, item) || hasItemKey(softUsedIds, item);
  return pick;
}

function freshForPicker(items: GuideItem[], pick: PickFn): GuideItem[] {
  return pick.isUsed ? items.filter((item) => !pick.isUsed?.(item)) : items;
}

function pickWithUsedFallback(items: GuideItem[], count: number, seed: string, pick: PickFn): GuideItem[] {
  const pool = dedupeItems(items);
  if (count <= 0 || pool.length === 0) return [];

  const selected: GuideItem[] = [];
  const selectedIds = new Set<string>();
  const addItems = (nextItems: GuideItem[]): void => {
    for (const item of nextItems) {
      if (hasItemKey(selectedIds, item)) continue;
      selected.push(item);
      markItemKey(selectedIds, item);
      if (selected.length >= count) return;
    }
  };

  const freshPool = freshForPicker(pool, pick);
  if (freshPool.length > 0) {
    addItems(pick(freshPool, Math.min(count, freshPool.length), `${seed}-fresh`));
  }

  if (selected.length < count) {
    addItems(pick(
      pool.filter((item) => !hasItemKey(selectedIds, item)),
      count - selected.length,
      `${seed}-used-fallback`,
    ));
  }

  return selected.slice(0, count);
}

export function pickMixedItemsWithPartnerQuota(items: GuideItem[], count: number, seed: string, pick: PickFn): GuideItem[] {
  const partnerPool = dedupeItems(items.filter((i) => i.isPartner));
  const regularPool = dedupeItems(items.filter((i) => !i.isPartner));
  const targetPartnerCount = partnerTargetCount(count, partnerPool.length);

  const selectedPartners = pickWithUsedFallback(partnerPool, targetPartnerCount, `${seed}-partners`, pick);
  const selectedRegulars = pickWithUsedFallback(regularPool, count - selectedPartners.length, `${seed}-regular`, pick);

  const selected = [...selectedPartners, ...selectedRegulars];
  if (selected.length < count) {
    selected.push(...pick(remainingItems(items, selected), count - selected.length, `${seed}-fill`));
  }
  return selected.slice(0, count);
}

export function pickMixedItemsWithPartnerAndRegularPools(
  partnerItems: GuideItem[],
  regularItems: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
): GuideItem[] {
  const partnerPool = dedupeItems(partnerItems.filter((i) => i.isPartner));
  const regularPool = dedupeItems(regularItems.filter((i) => !i.isPartner));
  const targetPartnerCount = partnerTargetCount(count, partnerPool.length);

  const selectedPartners = pickWithUsedFallback(partnerPool, targetPartnerCount, `${seed}-partners`, pick);
  const selectedRegulars = pickWithUsedFallback(regularPool, count - selectedPartners.length, `${seed}-regular`, pick);

  const selected = [...selectedPartners, ...selectedRegulars];
  if (selected.length < count) {
    selected.push(...pick(remainingItems([...partnerItems, ...regularItems], selected), count - selected.length, `${seed}-fill`));
  }
  return selected.slice(0, count);
}

function shuffleItems(items: GuideItem[], seed: string): GuideItem[] {
  return [...items].sort((a, b) => stableHash(`${seed}:shuffle:${a.id}`) - stableHash(`${seed}:shuffle:${b.id}`));
}

function shuffleListPages(pages: ListPage[], seed: string): ListPage[] {
  return [...pages].sort((a, b) => stableHash(`${seed}:page:${a.title}`) - stableHash(`${seed}:page:${b.title}`));
}

function pickPartnerBalancedItems(
  primaryItems: GuideItem[],
  fallbackItems: GuideItem[],
  count: number,
  targetPartnerCount: number,
  seed: string,
  pick: PickFn,
  allowUsedPartnerFallback = true,
): GuideItem[] {
  const primaryPool = dedupeItems(primaryItems);
  const primaryIds = new Set(primaryPool.map((item) => item.id));
  const fallbackPool = dedupeItems(fallbackItems).filter((item) => !primaryIds.has(item.id));
  const primaryPartnerPool = primaryPool.filter((i) => i.isPartner);
  const primaryRegularPool = primaryPool.filter((i) => !i.isPartner);
  const fallbackPartnerPool = fallbackPool.filter((i) => i.isPartner);
  const fallbackRegularPool = fallbackPool.filter((i) => !i.isPartner);
  const selected: GuideItem[] = [];
  const selectedIds = new Set<string>();

  const addItems = (nextItems: GuideItem[]): void => {
    for (const item of nextItems) {
      if (hasItemKey(selectedIds, item)) continue;
      selected.push(item);
      markItemKey(selectedIds, item);
      if (selected.length >= count) return;
    }
  };

  const partnerCount = Math.min(Math.max(targetPartnerCount, 0), count);
  const pickPartners = (items: GuideItem[], itemCount: number, itemSeed: string): GuideItem[] =>
    allowUsedPartnerFallback ? pickWithUsedFallback(items, itemCount, itemSeed, pick) : pick(items, itemCount, itemSeed);
  addItems(pickPartners(primaryPartnerPool, Math.min(partnerCount, primaryPartnerPool.length), `${seed}-partners-primary`));

  addItems(pickWithUsedFallback(primaryRegularPool, count - selected.length, `${seed}-regular-primary`, pick));
  if (selected.length < count) {
    addItems(pickPartners(fallbackPartnerPool, count - selected.length, `${seed}-partners-fallback`));
  }
  if (selected.length < count) {
    addItems(pickWithUsedFallback(fallbackRegularPool, count - selected.length, `${seed}-regular-fallback`, pick));
  }

  if (selected.length < count) {
    addItems(pick([...primaryPool, ...fallbackPool].filter((item) => !hasItemKey(selectedIds, item)), count - selected.length, `${seed}-fill`));
  }

  return shuffleItems(selected.slice(0, count), seed);
}

function pickGrid4ItemsWithPartnerQuota(primaryItems: GuideItem[], fallbackItems: GuideItem[], count: number, seed: string, pick: PickFn): GuideItem[] {
  const partnerCount = primaryItems.filter((i) => i.isPartner).length;
  const combinedPartnerCount = dedupeItems([...primaryItems, ...fallbackItems]).filter((i) => i.isPartner).length;
  const targetPartnerCount = partnerCount === 2 ? 1 : Math.min(2, combinedPartnerCount);
  return pickPartnerBalancedItems(primaryItems, fallbackItems, count, targetPartnerCount, seed, pick);
}

function pickGridItemsWithPartnerQuota(primaryItems: GuideItem[], fallbackItems: GuideItem[], count: number, seed: string, pick: PickFn): GuideItem[] {
  if (count === 4) return pickGrid4ItemsWithPartnerQuota(primaryItems, fallbackItems, count, seed, pick);
  const partnerCount = primaryItems.filter((i) => i.isPartner).length;
  const combinedPartnerCount = dedupeItems([...primaryItems, ...fallbackItems]).filter((i) => i.isPartner).length;
  const targetPartnerCount = partnerCount === 2 ? 1 : partnerTargetCount(count, combinedPartnerCount);
  return pickPartnerBalancedItems(primaryItems, fallbackItems, count, targetPartnerCount, seed, pick);
}

function pickGrid8ItemsWithPartnerQuota(primaryItems: GuideItem[], fallbackItems: GuideItem[], count: number, seed: string, pick: PickFn): GuideItem[] {
  const primaryPartnerCount = dedupeItems(primaryItems).filter((i) => i.isPartner).length;
  const targetPartnerCount = partnerTargetCount(count, primaryPartnerCount);
  const selected = pickPartnerBalancedItems(primaryItems, fallbackItems, count, targetPartnerCount, seed, pick, true);
  const currentPartnerCount = selected.filter((item) => item.isPartner).length;
  if (currentPartnerCount >= targetPartnerCount) return selected;

  const selectedIds = new Set<string>();
  selected.forEach((item) => markItemKey(selectedIds, item));
  const extraPartners = sortCandidates(dedupeItems(primaryItems).filter((item) => item.isPartner), `${seed}-visible-partners`)
    .filter((item) => !hasItemKey(selectedIds, item))
    .slice(0, targetPartnerCount - currentPartnerCount);
  if (extraPartners.length === 0) return selected;

  const keptRegulars = selected.filter((item) => !item.isPartner).slice(0, count - currentPartnerCount - extraPartners.length);
  return shuffleItems([...selected.filter((item) => item.isPartner), ...extraPartners, ...keptRegulars].slice(0, count), `${seed}-visible-partners`);
}

export function pickContextualItems(
  preferredItems: GuideItem[],
  fallbackItems: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
): GuideItem[] {
  const preferredPool = dedupeItems(preferredItems);
  const selected = preferredPool.length > 0 ? pick(preferredPool, count, seed) : [];
  if (selected.length >= count) return selected.slice(0, count);
  const fallbackPool = remainingItems(dedupeItems([...preferredItems, ...fallbackItems]), selected);
  return [
    ...selected,
    ...pick(fallbackPool, count - selected.length, `${seed}-fallback`),
  ].slice(0, count);
}

function pickSingleContextualItem(preferred: GuideItem[], fallback: GuideItem[], seed: string, pick: PickFn): GuideItem[] {
  return pickContextualItems(preferred, fallback, 1, seed, pick);
}

type ItinerarySlot = {
  time: string;
  prefix: string;
  preferredItems: GuideItem[];
  fallbackItems: GuideItem[];
  seed: string;
  allowFallbackPartner?: boolean;
};

function pickItineraryPageItems(
  slots: ItinerarySlot[],
  pick: PickFn,
  resolveImage: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
): PageItem[] {
  const pageItems: PageItem[] = [];
  let partnerCount = 0;
  slots.forEach((slot) => {
    const preferredPool = dedupeItems(slot.preferredItems);
    const fallbackPool = remainingItems(dedupeItems(slot.fallbackItems), preferredPool);
    const pool = dedupeItems([...preferredPool, ...fallbackPool]);
    const partnerPool = dedupeItems([
      ...preferredPool.filter((item) => item.isPartner),
      ...(slot.allowFallbackPartner === false ? [] : fallbackPool.filter((item) => item.isPartner)),
    ]);
    let selected = partnerCount < DEFAULT_PARTNER_TARGET_PER_PAGE && partnerPool.length > 0
      ? pickWithUsedFallback(partnerPool, 1, `${slot.seed}-partner`, pick)[0]
      : undefined;
    if (!selected) {
      selected = pickSingleContextualItem(slot.preferredItems, slot.fallbackItems, slot.seed, pick)[0];
    }
    if (selected?.isPartner) partnerCount += 1;
    if (selected) pageItems.push(schedulePageItemWithResolver(slot.time, slot.prefix, selected, resolveImage));
  });
  return pageItems;
}

function pickItineraryListItems(
  preferredItems: GuideItem[],
  fallbackItems: GuideItem[],
  count: number,
  seed: string,
  label: string,
  pick: PickFn,
  resolveImage: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
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
  const famousItems = dedupeItems([...historyItems, ...tourismItems]);
  const freeCheckinItems = checkinItems.filter(isFreeCheckinItem);
  const paidCheckinItems = checkinItems.filter((i) => !isFreeCheckinItem(i));
  const daytimeFoodItems = dedupeItems(withoutGrillOrHotpot(foodItems));
  const morningFoodItems = dedupeItems([
    ...daytimeFoodItems.filter(isMorningFoodItem),
    ...daytimeFoodItems.filter((i) => normalizeItemType(i, 'sang')),
  ]);
  const lightMealItems = dedupeItems([
    ...daytimeFoodItems.filter(isLightMealItem),
    ...daytimeFoodItems.filter((i) => normalizeItemType(i, 'trua')),
  ]);
  const grillHotpotItems = dedupeItems(foodItems.filter(isGrillOrHotpotItem));
  const dayCafeItems = dedupeItems(withoutGrillOrHotpot(cafeItems));
  const dayCheckinItems = dedupeItems(withoutGrillOrHotpot(checkinItems));
  const dayTourismItems = dedupeItems(withoutGrillOrHotpot(tourismItems));
  const dayFamousItems = dedupeItems(withoutGrillOrHotpot(famousItems));
  const breakfastItems = morningFoodItems.length > 0 ? morningFoodItems : daytimeFoodItems.filter((i) => normalizeItemType(i, 'sang'));
  const lunchItems = lightMealItems.length > 0 ? lightMealItems : daytimeFoodItems.filter((i) => normalizeItemType(i, 'trua'));
  const dinnerItems = dedupeItems([...grillHotpotItems, ...foodItems.filter((i) => normalizeItemType(i, 'toi')), ...foodItems]);
  const morningScheduleItems = dedupeItems([
    ...dayCafeItems,
    ...breakfastItems,
    ...freeCheckinItems,
    ...dayCheckinItems,
  ]);
  const lunchScheduleItems = dedupeItems([
    ...lightMealItems,
    ...dayCafeItems,
    ...daytimeFoodItems,
  ]);
  const eveningScheduleItems = dedupeItems([
    ...grillHotpotItems,
    ...dinnerItems,
    ...foodItems,
  ]);
  return {
    foodItems, cafeItems, stayItems, checkinItems, serviceItems, historyItems, tourismItems,
    breakfastItems,
    lunchItems,
    dinnerItems,
    daytimeFoodItems,
    morningFoodItems: breakfastItems,
    lightMealItems,
    grillHotpotItems,
    dayCafeItems,
    dayCheckinItems,
    dayTourismItems,
    dayFamousItems,
    morningScheduleItems,
    lunchScheduleItems,
    eveningScheduleItems,
    freeCheckinItems,
    paidCheckinItems,
    famousItems,
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

function stripVietnameseMarks(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function placeNameCandidates(name: string): string[] {
  const normalized = String(name || '').replace(/\s+/g, ' ').trim();
  const unaccented = stripVietnameseMarks(normalized);
  return [...new Set([normalized, unaccented].filter((value) => value.length >= 3))];
}

function collectPagePlaceNames(pages: DeckPage[]): string[] {
  const names = new Map<string, string>();
  const addName = (value?: string) => {
    const name = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (name.length < 3) return;
    names.set(stripVietnameseMarks(name).toLowerCase(), name);
  };

  for (const page of pages) {
    if (page.type !== 'list') continue;
    for (const item of page.items) {
      addName(item.rawName);
      addName(item.name);
      addName(item.name.split(/:\s*/).slice(1).join(': '));
    }
  }

  return [...names.values()].sort((a, b) => b.length - a.length);
}

function hasPagePlaceName(value: string, placeNames: string[]): boolean {
  return placeNames.some((name) => placeNameCandidates(name).some((candidate) => {
    const escaped = escapeRegExp(candidate).replace(/\s+/g, '\\s+');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(value);
  }));
}

function looksLikeStopList(value: string): boolean {
  const dayMarkers = value.match(/\b(?:ngày\s*(?:đầu|một|hai|ba|bốn|1|2|3|4)|sáng|trưa|chiều|tối)\b/giu) ?? [];
  const stopVerbs = value.match(/\b(?:ghé|qua|đi|lượn|chạy|săn|ăn|uống|check-?in|chụp)\b/giu) ?? [];
  return dayMarkers.length >= 2 && stopVerbs.length >= 2;
}

function looksLocationSpecific(value: string): boolean {
  const normalized = stripVietnameseMarks(value).toLowerCase();
  return /\b(?:nha tho|duong|hem|doc|kdl|bun|banh|lau|xien)\b/.test(normalized)
    || /\b\d+\s*k\b/i.test(value);
}

export function sanitizeCaptionBodyForPages(body: string, pages: DeckPage[]): string {
  const clean = String(body || '').replace(/\s+/g, ' ').trim();
  if (!clean) return CAPTION_BODY_FALLBACK;

  const placeNames = collectPagePlaceNames(pages);
  if (hasPagePlaceName(clean, placeNames) || looksLikeStopList(clean) || looksLocationSpecific(clean)) {
    return CAPTION_BODY_FALLBACK;
  }

  return clean.slice(0, 250);
}

export function applyCaptionToPages(pages: DeckPage[], caption: { headline: string; body: string }): DeckPage[] {
  const safeBody = sanitizeCaptionBodyForPages(caption.body, pages);
  return pages.map((page) => {
    if (page.type === 'cover') {
      return {
        ...page,
        title: sanitizeDeckHeadline(caption.headline || page.title),
        subtitle: coverSubtitleFromCaption(safeBody, page.subtitle),
      };
    }
    return page;
  });
}

// ─── Individual deck page builders ───────────────────────────────────────────

function buildItineraryPages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:itinerary`, mappedImageUrls, globalUsedImageUrls || []);
  const background = (seed: string) => backgroundFor(imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const servicePagePick = createListPicker(globalUsedItemIds);
  const breakfastOrLunchItems = dedupeItems([...pools.morningFoodItems, ...pools.lightMealItems]);

  return [
    buildCoverPage(
      'Gợi ý lịch trình 3N2Đ',
      'Một bộ khung ngắn để đi Đà Lạt lần đầu mà vẫn có ăn sáng, cafe, check-in và chỗ chơi đáng lưu.',
      background(`${seedPrefix}-cover-itinerary`),
    ),
    buildListPage('Ngày 1', 'terracotta', 'Ngày 1 - tuyến trung tâm',
      'Một page gom đủ check-in sớm, ăn sáng, cafe, ăn trưa và ăn tối của ngày đầu.',
      pickItineraryPageItems([
        { time: '05:00', prefix: 'Check-in sớm:', preferredItems: [...pools.freeCheckinItems, ...pools.dayCheckinItems, ...pools.dayFamousItems], fallbackItems: [...pools.dayCheckinItems, ...pools.dayFamousItems], seed: `${seedPrefix}-it-day1-checkin-early` },
        { time: '07:30', prefix: 'Ăn sáng:', preferredItems: pools.morningFoodItems, fallbackItems: breakfastOrLunchItems, seed: `${seedPrefix}-it-day1-breakfast` },
        { time: '09:00', prefix: 'Cafe:', preferredItems: pools.dayCafeItems, fallbackItems: pools.dayCafeItems, seed: `${seedPrefix}-it-day1-cafe` },
        { time: '12:00', prefix: 'Ăn trưa:', preferredItems: pools.lightMealItems, fallbackItems: pools.lunchScheduleItems, seed: `${seedPrefix}-it-day1-lunch` },
        { time: '15:00', prefix: 'Check-in:', preferredItems: [...pools.freeCheckinItems, ...pools.dayCheckinItems], fallbackItems: [...pools.dayCheckinItems, ...pools.dayFamousItems], seed: `${seedPrefix}-it-day1-checkin` },
        { time: '18:30', prefix: 'Ăn tối:', preferredItems: pools.eveningScheduleItems, fallbackItems: pools.eveningScheduleItems, seed: `${seedPrefix}-it-day1-dinner` },
      ], pick, imageResolver),
      background(`${seedPrefix}-it-day1`), 'itinerary',
    ),
    buildListPage('Ngày 2', 'pine', 'Ngày 2 - săn ảnh và đi chơi',
      'Tuyến ngày hai ưu tiên cảnh đẹp, cafe nghỉ chân, ăn trưa, check-in và ăn tối.',
      pickItineraryPageItems([
        { time: '06:30', prefix: 'Ăn sáng:', preferredItems: pools.morningFoodItems, fallbackItems: breakfastOrLunchItems, seed: `${seedPrefix}-it-day2-breakfast` },
        { time: '08:30', prefix: 'Bắt đầu:', preferredItems: pools.dayFamousItems, fallbackItems: [...pools.dayFamousItems, ...pools.dayCheckinItems], seed: `${seedPrefix}-it-day2-famous` },
        { time: '10:30', prefix: 'Cafe:', preferredItems: pools.dayCafeItems, fallbackItems: pools.dayCafeItems, seed: `${seedPrefix}-it-day2-cafe` },
        { time: '12:30', prefix: 'Ăn trưa:', preferredItems: pools.lightMealItems, fallbackItems: pools.lunchScheduleItems, seed: `${seedPrefix}-it-day2-lunch` },
        { time: '15:00', prefix: 'Check-in:', preferredItems: [...pools.freeCheckinItems, ...pools.dayCheckinItems], fallbackItems: [...pools.dayCheckinItems, ...pools.dayFamousItems], seed: `${seedPrefix}-it-day2-checkin` },
        { time: '18:30', prefix: 'Ăn tối:', preferredItems: pools.eveningScheduleItems, fallbackItems: pools.eveningScheduleItems, seed: `${seedPrefix}-it-day2-dinner` },
      ], pick, imageResolver),
      background(`${seedPrefix}-it-day2`), 'itinerary',
    ),
    buildListPage('Ngày 3', 'gold', 'Ngày 3 - chill nhẹ rồi mua quà',
      'Ngày cuối giữ nhịp nhẹ: ăn sáng, cafe, điểm ghé, ăn trưa và dịch vụ chốt chuyến.',
      pickItineraryPageItems([
        { time: '07:30', prefix: 'Ăn sáng:', preferredItems: pools.morningFoodItems, fallbackItems: breakfastOrLunchItems, seed: `${seedPrefix}-it-day3-breakfast` },
        { time: '09:00', prefix: 'Cafe:', preferredItems: pools.dayCafeItems, fallbackItems: pools.dayCafeItems, seed: `${seedPrefix}-it-day3-cafe` },
        { time: '10:30', prefix: 'Điểm ghé:', preferredItems: pools.dayFamousItems, fallbackItems: [...pools.dayFamousItems, ...pools.dayCheckinItems], seed: `${seedPrefix}-it-day3-famous` },
        { time: '12:00', prefix: 'Ăn trưa:', preferredItems: pools.lightMealItems, fallbackItems: pools.lunchScheduleItems, seed: `${seedPrefix}-it-day3-lunch` },
        { time: '15:00', prefix: 'Dịch vụ:', preferredItems: pools.serviceItems, fallbackItems: [...pools.serviceItems, ...pools.stayItems], seed: `${seedPrefix}-it-day3-service` },
        { time: '17:00', prefix: 'Chốt chuyến:', preferredItems: pools.stayItems, fallbackItems: [...pools.stayItems, ...pools.serviceItems], seed: `${seedPrefix}-it-day3-stay` },
      ], pick, imageResolver),
      background(`${seedPrefix}-it-day3`), 'itinerary',
    ),
    buildListPage('Check-in', 'berry', 'Địa điểm check-in',
      'Các điểm check-in không thể bỏ qua, ưu tiên các đối tác và các điểm tham quan miễn phí tại Đà Lạt.',
      pickPhotomodeItemsWithQuota(
        dedupeItems([...pools.dayCheckinItems, ...pools.freeCheckinItems, ...pools.dayFamousItems, ...pools.dayTourismItems]),
        6, `${seedPrefix}-it-checkin-page`, pick
      ).map((item) => pageItemWithResolver(item, 'Check-in', imageResolver)),
      background(`${seedPrefix}-it-checkin-page`), 'compact',
    ),
    buildListPage('Dịch vụ', 'slate', 'Một số dịch vụ cần lưu ý cho bạn',
      'Một trang chốt để nhắc về thuê xe, mua quà hoặc chỗ nghỉ trước khi chốt hành trình, nên bổ sung nhiều điểm hơn để dễ chọn nhanh.',
      pickContextualItems(
        dedupeItems([...pools.serviceItems, ...pools.stayItems]),
        dedupeItems([...pools.dayCheckinItems, ...pools.dayCafeItems, ...pools.dayFamousItems]),
        6, `${seedPrefix}-it-service-page`, servicePagePick,
      ).map((item) => pageItemWithResolver(item, 'Cần lưu', imageResolver)),
      background(`${seedPrefix}-it-service-page`), 'compact',
    ),
  ];
}

function pickJourneySlots(
  slotPools: GuideItem[][],
  seed: string,
  pick: PickFn,
  imageResolver: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
  labels: string[]
): PageItem[] {
  const selected: Array<{ item: GuideItem; label: string }> = [];
  let partnerCount = 0;

  for (let i = 0; i < slotPools.length; i++) {
    const pool = slotPools[i];
    if (!pool || pool.length === 0) continue;

    // Keep the same partner cadence as itinerary pages.
    let chosen: GuideItem | undefined;

    // If we need more partners and this pool has partners, try to pick one
    const partnersInPool = pool.filter(item => item.isPartner);
    const regularsInPool = pool.filter(item => !item.isPartner);

    if (partnerCount < DEFAULT_PARTNER_TARGET_PER_PAGE && partnersInPool.length > 0) {
      chosen = pick(partnersInPool, 1, `${seed}-slot${i}-partner`)[0];
      if (chosen) partnerCount++;
    }
    // If we have enough partners, or couldn't pick a partner, try to pick regular
    if (!chosen && regularsInPool.length > 0) {
      chosen = pick(regularsInPool, 1, `${seed}-slot${i}-regular`)[0];
    }
    // Fallback if needed
    if (!chosen) {
      chosen = pick(pool, 1, `${seed}-slot${i}-fallback`)[0];
    }

    if (chosen) {
      selected.push({ item: chosen, label: labels[i] || `ĐIỂM ${i + 1}` });
    }
  }

  return selected.map(({ item, label }) =>
    pageItemWithResolver(item, label, imageResolver),
  );
}

function pickTimedJourneyGridItems(
  slotPools: GuideItem[][],
  fallbackItems: GuideItem[],
  seed: string,
  pick: PickFn,
  imageResolver: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
  times: string[],
): PageItem[] {
  const selected: GuideItem[] = [];
  const selectedKeys = new Set<string>();
  let partnerCount = 0;

  const pickOne = (items: GuideItem[], slotSeed: string): GuideItem | undefined => {
    const pool = dedupeItems(items).filter((item) => !hasItemKey(selectedKeys, item));
    if (pool.length === 0) return undefined;
    const partnersInPool = pool.filter((item) => item.isPartner);
    const regularsInPool = pool.filter((item) => !item.isPartner);

    let chosen: GuideItem | undefined;
    if (partnerCount < DEFAULT_PARTNER_TARGET_PER_PAGE && partnersInPool.length > 0) {
      chosen = pick(partnersInPool, 1, `${slotSeed}-partner`)[0];
      if (chosen) partnerCount++;
    }
    if (!chosen && regularsInPool.length > 0) {
      chosen = pick(regularsInPool, 1, `${slotSeed}-regular`)[0];
    }
    if (!chosen) {
      chosen = pick(pool, 1, `${slotSeed}-fallback`)[0];
    }
    if (!chosen) {
      chosen = sortCandidates(pool, `${slotSeed}-reuse`).find((item) => !hasItemKey(selectedKeys, item));
    }
    return chosen;
  };

  for (let i = 0; i < times.length; i++) {
    const slotPool = slotPools[i]?.length ? slotPools[i] : fallbackItems;
    const chosen = pickOne(slotPool, `${seed}-slot${i}`);
    if (!chosen) continue;
    selected.push(chosen);
    markItemKey(selectedKeys, chosen);
  }

  if (selected.length < times.length) {
    selected.push(...pickWithUsedFallback(
      remainingItems(fallbackItems, selected),
      times.length - selected.length,
      `${seed}-fill`,
      pick,
    ));
  }

  return selected.slice(0, times.length).map((item, index) =>
    pageItemWithResolver(item, times[index] || '', imageResolver),
  );
}

function buildItinerary4N2DGrid8Pages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:journey-4n2d-grid8`, mappedImageUrls, globalUsedImageUrls || []);
  const background = (seed: string) => backgroundFor(imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const cafeDayItems = pools.dayCafeItems;
  const checkinDayItems = pools.dayCheckinItems;
  const tourismDayItems = pools.dayTourismItems;
  const famousDayItems = pools.dayFamousItems;
  const morningFoodItems = pools.morningFoodItems;
  const lightMealItems = pools.lightMealItems;
  const mealItems = dedupeItems([...morningFoodItems, ...lightMealItems, ...pools.daytimeFoodItems]);
  const eveningFoodItems = pools.eveningScheduleItems;
  const scenicItems = dedupeItems([...famousDayItems, ...tourismDayItems, ...checkinDayItems]);
  const outdoorItems = dedupeItems([...scenicItems.filter(isOutdoorSpot), ...tourismDayItems, ...famousDayItems, ...checkinDayItems]);
  const eveningHangoutItems = dedupeItems([...cafeDayItems, ...outdoorItems, ...scenicItems]);
  const catchAllItems = dedupeItems([
    ...pools.dayCheckinItems,
    ...pools.dayTourismItems,
    ...pools.dayFamousItems,
    ...pools.dayCafeItems,
    ...pools.daytimeFoodItems,
    ...pools.eveningScheduleItems,
    ...pools.stayItems,
    ...pools.serviceItems,
  ]);
  const dayFallbackItems = dedupeItems([
    ...cafeDayItems,
    ...morningFoodItems,
    ...lightMealItems,
    ...checkinDayItems,
    ...tourismDayItems,
    ...famousDayItems,
    ...pools.serviceItems,
  ]);
  const dayTimes = ['06:30', '08:00', '09:30', '11:30', '14:00', '16:00', '18:30', '20:00'];
  const noTimeLabels = Array(8).fill('');

  const dayPage = (
    chipText: string,
    chipTone: AccentTone,
    title: string,
    subtitle: string,
    slotPools: GuideItem[][],
    seed: string,
  ): ListPage => buildListPage(
    chipText,
    chipTone,
    title,
    subtitle,
    pickTimedJourneyGridItems(slotPools, dayFallbackItems, seed, pick, imageResolver, dayTimes),
    background(`${seed}-center`),
    'journey-4n2d-grid8',
  );

  return [
    {
      ...buildCoverPage(
        '4N2Đ ĐÀ LẠT\n8 ĐIỂM MỖI TRANG',
        'Lịch trình dạng lưới: ảnh bao quanh, tiêu đề ở giữa, mỗi điểm có thời gian rõ ràng.',
        background(`${seedPrefix}-cover`),
      ),
      layoutVariant: 'journey-4n2d-grid8',
    },
    dayPage(
      'Day 01',
      'terracotta',
      'Vào phố nhẹ nhàng',
      'Một nhịp mở đầu dễ đi, đủ ăn uống, cafe và check-in trong ngày đầu.',
      [
        cafeDayItems,
        morningFoodItems,
        dedupeItems([...checkinDayItems, ...tourismDayItems]),
        lightMealItems.length > 0 ? lightMealItems : mealItems,
        cafeDayItems,
        dedupeItems([...outdoorItems, ...checkinDayItems]),
        eveningFoodItems,
        eveningHangoutItems,
      ],
      `${seedPrefix}-grid8-day1`,
    ),
    dayPage(
      'Day 02',
      'gold',
      'Săn ảnh và bắt sáng',
      'Ưu tiên các điểm có ảnh đẹp, di chuyển theo nhịp sáng đến tối.',
      [
        cafeDayItems,
        morningFoodItems,
        outdoorItems,
        lightMealItems.length > 0 ? lightMealItems : mealItems,
        cafeDayItems,
        tourismDayItems.length > 0 ? tourismDayItems : scenicItems,
        eveningFoodItems,
        eveningHangoutItems,
      ],
      `${seedPrefix}-grid8-day2`,
    ),
    dayPage(
      'Day 03',
      'berry',
      'Đi sâu hơn một nhịp',
      'Ngày giữa chuyến đi dành cho điểm xa hơn, trải nghiệm rõ chất Đà Lạt.',
      [
        cafeDayItems,
        morningFoodItems,
        dedupeItems([...checkinDayItems, ...outdoorItems]),
        lightMealItems.length > 0 ? lightMealItems : mealItems,
        cafeDayItems,
        tourismDayItems.length > 0 ? tourismDayItems : scenicItems,
        eveningFoodItems,
        eveningHangoutItems,
      ],
      `${seedPrefix}-grid8-day3`,
    ),
    dayPage(
      'Day 04',
      'slate',
      'Sáng chậm rồi rời phố',
      'Một ngày cuối gọn nhịp, vẫn đủ điểm ghé và chốt bữa tối.',
      [
        cafeDayItems,
        morningFoodItems,
        dedupeItems([...famousDayItems, ...checkinDayItems]),
        lightMealItems.length > 0 ? lightMealItems : mealItems,
        cafeDayItems,
        dedupeItems([...checkinDayItems, ...outdoorItems]),
        eveningFoodItems,
        eveningHangoutItems,
      ],
      `${seedPrefix}-grid8-day4`,
    ),
    buildListPage(
      'Lưu trú',
      'pine',
      'Địa điểm lưu trú',
      'Các lựa chọn nên xem trước để chốt nơi nghỉ phù hợp lịch trình.',
      pickTimedJourneyGridItems(Array(8).fill(pools.stayItems), dedupeItems([...pools.stayItems, ...catchAllItems]), `${seedPrefix}-grid8-stay`, pick, imageResolver, noTimeLabels),
      background(`${seedPrefix}-grid8-stay-center`),
      'journey-4n2d-grid8',
    ),
    buildListPage(
      'Dịch vụ',
      'slate',
      'Dịch vụ cần chú ý',
      'Các dịch vụ hỗ trợ chuyến đi, ưu tiên mục có thông tin rõ để liên hệ nhanh.',
      pickTimedJourneyGridItems(Array(8).fill(pools.serviceItems), dedupeItems([...pools.serviceItems, ...pools.stayItems, ...catchAllItems]), `${seedPrefix}-grid8-services`, pick, imageResolver, noTimeLabels),
      background(`${seedPrefix}-grid8-services-center`),
      'journey-4n2d-grid8',
    ),
  ];
}

function buildItinerary4N3DPages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:journey-4n3d`, mappedImageUrls, globalUsedImageUrls || []);
  const background = (seed: string) => backgroundFor(imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const breakfastOrLunchItems = dedupeItems([...pools.morningFoodItems, ...pools.lightMealItems]);
  const mealItems = dedupeItems([...pools.daytimeFoodItems, ...pools.eveningScheduleItems]);
  const scenicItems = dedupeItems([...pools.dayFamousItems, ...pools.dayTourismItems, ...pools.dayCheckinItems]);
  const outdoorItems = dedupeItems([...scenicItems.filter(isOutdoorSpot), ...pools.dayTourismItems, ...pools.dayFamousItems]);

  const day1Items = pickJourneySlots(
    [
      breakfastOrLunchItems, // ĂN SÁNG
      pools.dayCafeItems, // CAFE
      dedupeItems([...pools.dayCheckinItems, ...pools.dayTourismItems]), // ĐI DẠO
      pools.lightMealItems.length > 0 ? pools.lightMealItems : pools.lunchScheduleItems, // ĂN TRƯA
      dedupeItems([...outdoorItems, ...pools.dayCheckinItems]), // CHECK-IN
      pools.eveningScheduleItems, // ĂN TỐI
    ],
    `${seedPrefix}-journey-day1`,
    pick,
    imageResolver,
    ['ĂN SÁNG', 'CAFE', 'ĐI DẠO', 'ĂN TRƯA', 'CHECK-IN', 'ĂN TỐI'],
  );

  const day2Items = pickJourneySlots(
    [
      pools.morningScheduleItems, // ĐI SỚM
      outdoorItems, // OUTDOOR
      pools.dayCafeItems, // CAFE
      pools.dayCheckinItems, // CHECK-IN
      pools.lightMealItems, // ĂN TRƯA
      pools.eveningScheduleItems // ĂN TỐI
    ],
    `${seedPrefix}-journey-day2`,
    pick,
    imageResolver,
    ['ĐI SỚM', 'OUTDOOR', 'CAFE', 'CHECK-IN', 'ĂN TRƯA', 'ĂN TỐI'],
  );

  const day3Items = pickJourneySlots(
    [
      pools.dayTourismItems, // ĐIỂM NEO
      dedupeItems([...pools.dayFamousItems, ...outdoorItems]), // VIEWPOINT
      pools.dayCafeItems, // CAFE
      pools.lightMealItems, // ĂN TRƯA
      pools.dayCheckinItems, // TRẢI NGHIỆM
      pools.eveningScheduleItems // ĂN TỐI
    ],
    `${seedPrefix}-journey-day3`,
    pick,
    imageResolver,
    ['ĐIỂM NEO', 'VIEWPOINT', 'CAFE', 'ĂN TRƯA', 'TRẢI NGHIỆM', 'ĂN TỐI'],
  );

  const day4Items = pickJourneySlots(
    [
      pools.dayCafeItems, // CAFE SÁNG
      breakfastOrLunchItems, // ĂN NHẸ
      dedupeItems([...pools.dayFamousItems, ...pools.dayCheckinItems]), // ĐIỂM GHÉ
      pools.lightMealItems.length > 0 ? pools.lightMealItems : pools.lunchScheduleItems, // ĂN TRƯA
      dedupeItems([...pools.dayCheckinItems, ...outdoorItems]), // CHECK-IN
      pools.eveningScheduleItems.length > 0 ? pools.eveningScheduleItems : mealItems // ĂN TỐI
    ],
    `${seedPrefix}-journey-day4`,
    pick,
    imageResolver,
    ['CAFE SÁNG', 'ĂN NHẸ', 'ĐIỂM GHÉ', 'ĂN TRƯA', 'CHECK-IN', 'ĂN TỐI'],
  );

  return [
    {
      ...buildCoverPage(
        '4N3Đ ĐÀ LẠT\nĐI CHẬM CHILL SÂU',
        '', // subtitle removed as requested
        background(`${seedPrefix}-journey-cover`),
      ),
      layoutVariant: 'journey-4n3d',
    },
    buildListPage(
      'Day 01',
      'terracotta',
      'Vào phố nhẹ nhàng',
      '',
      day1Items,
      background(`${seedPrefix}-journey-day1-bg`),
      'journey-4n3d',
    ),
    buildListPage(
      'Day 02',
      'gold',
      'Săn ảnh và bắt sáng',
      '',
      day2Items,
      background(`${seedPrefix}-journey-day2-bg`),
      'journey-4n3d',
    ),
    buildListPage(
      'Day 03',
      'berry',
      'Đi sâu hơn một nhịp',
      '',
      day3Items,
      background(`${seedPrefix}-journey-day3-bg`),
      'journey-4n3d',
    ),
    buildListPage(
      'Day 04',
      'slate',
      'Sáng chậm rồi rời phố',
      '',
      day4Items,
      background(`${seedPrefix}-journey-day4-bg`),
      'journey-4n3d',
    ),
    buildListPage(
      'Lưu trú',
      'pine',
      'Địa điểm lưu trú',
      '',
      pickJourneySlots(
        Array(6).fill(pools.stayItems),
        `${seedPrefix}-journey-stay`,
        pick,
        imageResolver,
        ['KHÁCH SẠN', 'LƯU TRÚ', 'GẦN TRUNG TÂM', 'NGHỈ NGƠI', 'CHECK-IN', 'CHỐT PHÒNG'],
      ),
      background(`${seedPrefix}-journey-stay-bg`),
      'journey-4n3d',
    ),
    buildListPage(
      'Dịch vụ',
      'slate',
      'Dịch vụ cần chú ý',
      '',
      pickJourneySlots(
        Array(6).fill(pools.serviceItems),
        `${seedPrefix}-journey-services`,
        pick,
        imageResolver,
        ['THUÊ XE', 'DỊCH VỤ', 'ĐẶT TRƯỚC', 'MUA QUÀ', 'HỖ TRỢ', 'CẦN NHỚ'],
      ),
      background(`${seedPrefix}-journey-services-bg`),
      'journey-4n3d',
    ),
  ];
}

function buildMustGoPages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:must-go`, mappedImageUrls, globalUsedImageUrls || []);
  const background = (seed: string) => backgroundFor(imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const breakfastOrLunchItems = dedupeItems([...pools.morningFoodItems, ...pools.lightMealItems]);
  return [
    buildCoverPage('Những điểm không thể bỏ qua', 'Dùng cho các bộ ảnh kiểu must-go: điểm nổi tiếng, check-in đẹp, cafe có concept và chỗ ở đáng ghim.', background(`${seedPrefix}-cover-must-go`)),
    buildListPage('Must go', 'terracotta', 'Điểm nổi tiếng nên ghé', 'Trang này gom nhiều điểm nổi bật hơ để người xem lưu ngay nếu không muốn bỏ lỡ nơi nổi tiếng khi đến Đà Lạt.',
      pickMixedItemsWithPartnerQuota(pools.famousItems, 4, `${seedPrefix}-must-famous-page`, pick).map((i) => pageItemWithResolver(i, 'Điểm nổi tiếng', imageResolver)),
      background(`${seedPrefix}-must-famous-page`), 'dense'),
    buildListPage('Gợi ý', 'gold', 'Điểm check-in dễ đi', 'Các điểm đẹp được tăng thêm số lượng để trang này thật sự có giá trị lưu lại, không chỉ dừng ở 1-2 địa điểm.',
      pickMixedItemsWithPartnerQuota(pools.freeCheckinItems.length > 0 ? pools.freeCheckinItems : pools.checkinItems, 4, `${seedPrefix}-must-free-page`, pick).map((i) => pageItemWithResolver(i, 'Check-in', imageResolver)),
      background(`${seedPrefix}-must-free-page`), 'dense'),
    buildListPage('Cafe', 'pine', 'Quán cafe có concept', 'Giữ layout chữ to, tên quán nổi rõ nhưng tăng thêm dữ liệu để page cafe trông thật sự đáng lưu.',
      pickMixedItemsWithPartnerQuota(pools.cafeItems, 4, `${seedPrefix}-must-cafe-page`, pick).map((i) => pageItemWithResolver(i, 'Cafe đẹp', imageResolver)),
      background(`${seedPrefix}-must-cafe-page`), 'dense'),
    buildListPage('Ăn uống', 'berry', 'Ăn sáng rồi đi đâu', 'Một trang xen giữa ăn sáng và điểm đến để bộ carousel bớt lặp toàn check-in, đồng thời có đủ dữ liệu để dùng được ngay.',
      pickMixedItemsWithPartnerQuota(pools.morningFoodItems.length > 0 ? pools.morningFoodItems : breakfastOrLunchItems, 4, `${seedPrefix}-must-food-page`, pick).map((i) => pageItemWithResolver(i, 'Ăn sáng', imageResolver)),
      background(`${seedPrefix}-must-food-page`), 'dense'),
    buildListPage('Lưu trú', 'slate', 'Homestay và dịch vụ nên nhớ', 'Trang cuối dùng để chốt các điểm thực dụng như ở đâu, thuê gì, mua quà ở đâu trước khi kết thúc bộ nội dung, nên mình tăng thêm lựa chọn.',
      pickMixedItemsWithPartnerQuota([...pools.stayItems, ...pools.serviceItems], 4, `${seedPrefix}-must-stay-page`, pick).map((i) => pageItemWithResolver(i, 'Chốt chuyến', imageResolver)),
      background(`${seedPrefix}-must-stay-page`), 'dense'),
  ];
}

function buildFirstTimePages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:first-time`, mappedImageUrls, globalUsedImageUrls || []);
  const background = (seed: string) => backgroundFor(imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const breakfastOrLunchItems = dedupeItems([...pools.morningFoodItems, ...pools.lightMealItems]);
  return [
    buildCoverPage('Đi Đà Lạt lần đầu nên lưu gì', 'Một bộ trang dành cho người chuẩn bị đi Đà Lạt: ăn sáng, cafe, check-in, địa điểm nổi tiếng và dịch vụ cần nhớ.', background(`${seedPrefix}-cover-first-time`)),
    buildListPage('Lưu ý', 'terracotta', 'Đi sớm để săn ảnh đẹp', 'Mở đầu bằng các điểm hợp buổi sáng để bộ nội dung có nhịp giống mẫu, nhưng tăng số điểm để người mới nhìn là có nhiều gợi ý hơn.',
      pickMixedItemsWithPartnerQuota(pools.morningScheduleItems, 4, `${seedPrefix}-first-morning-page`, pick).map((i) => pageItemWithResolver(i, 'Sáng sớm', imageResolver)),
      background(`${seedPrefix}-first-morning-page`), 'dense'),
    buildListPage('Ăn sáng', 'gold', 'Quán ăn sáng dễ chốt', 'Ưu tiên những chỗ có địa chỉ rõ, dữ liệu đủ sạch để dùng cho bộ ảnh dành cho người mới lên kế hoạch, nên bổ sung thêm số lượng.',
      pickMixedItemsWithPartnerQuota(pools.morningFoodItems.length > 0 ? pools.morningFoodItems : breakfastOrLunchItems, 4, `${seedPrefix}-first-breakfast-page`, pick).map((i) => pageItemWithResolver(i, 'Buổi sáng', imageResolver)),
      background(`${seedPrefix}-first-breakfast-page`), 'dense'),
    buildListPage('Cafe', 'pine', 'Cafe để ngồi và chụp', 'Trang này đóng vai trò cầu nối giữa lịch trình và visual, nên tăng số quán để người mới dễ chọn concept phù hợp.',
      pickMixedItemsWithPartnerQuota(pools.dayCafeItems, 4, `${seedPrefix}-first-cafe-page`, pick).map((i) => pageItemWithResolver(i, 'Cafe', imageResolver)),
      background(`${seedPrefix}-first-cafe-page`), 'dense'),
    buildListPage('Check-in', 'berry', 'Điểm chụp hình nên ghé', 'Một trang tập trung vào check-in và điểm nổi tiếng để người chuẩn bị đi có thể lưu nhanh nhiều chỗ hơn, không chỉ 1-2 điểm.',
      pickMixedItemsWithPartnerQuota([...pools.dayCheckinItems, ...pools.dayFamousItems], 4, `${seedPrefix}-first-checkin-page`, pick).map((i) => pageItemWithResolver(i, 'Nên ghé', imageResolver)),
      background(`${seedPrefix}-first-checkin-page`), 'dense'),
    buildListPage('Cuối list', 'slate', 'Dịch vụ và chỗ nghỉ cần nhớ', 'Trang chốt tổng hợp các thứ thực dụng: ở đâu, liên hệ gì, mua quà hay thuê xe ở đâu cho gọn, nên mình tăng thêm điểm để tiện chốt nhanh.',
      pickMixedItemsWithPartnerQuota([...pools.serviceItems, ...pools.stayItems], 4, `${seedPrefix}-first-service-page`, pick).map((i) => pageItemWithResolver(i, 'Cần nhớ', imageResolver)),
      background(`${seedPrefix}-first-service-page`), 'dense'),
  ];
}

export function pickPhotomodeItemsWithQuota(
  items: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
): GuideItem[] {
  const partnerPool = dedupeItems(items.filter((i) => i.isPartner));
  const regularPool = dedupeItems(items.filter((i) => !i.isPartner));

  const targetPartnerCount = partnerTargetCount(count, partnerPool.length, Math.floor((count * 2) / 3));

  const selectedPartners = pickWithUsedFallback(partnerPool, targetPartnerCount, `${seed}-partners`, pick);
  const selectedRegulars = pickWithUsedFallback(regularPool, count - selectedPartners.length, `${seed}-regular`, pick);

  const combined = [...selectedPartners, ...selectedRegulars];
  if (combined.length < count) {
    combined.push(...pick(remainingItems(items, combined), count - combined.length, `${seed}-fill`));
  }
  return combined.sort((a, b) => stableHash(`${seed}:shuffle:${a.id}`) - stableHash(`${seed}:shuffle:${b.id}`));
}

function buildPhotomodeItems(
  preferredItems: GuideItem[],
  fallbackItems: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
  resolveImage: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
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
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(
    imageUrls,
    libraryEntries,
    `${seedPrefix}:pov-3-day`,
    mappedImageUrls,
    globalUsedImageUrls || [],
    { orientation: 'portrait' },
  );
  const background = (seed: string) => backgroundFor(imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const allSpots = dedupeItems([...pools.dayCheckinItems, ...pools.dayFamousItems]);
  const outdoorSpots = allSpots.filter(isOutdoorSpot);
  const morningCafes = pools.dayCafeItems.filter(isMorningCafe);
  const chillCafes = pools.dayCafeItems.filter((item) => !isMorningCafe(item));
  const catchAllItems = dedupeItems([
    ...pools.dayCheckinItems,
    ...pools.dayCafeItems,
    ...pools.daytimeFoodItems,
    ...pools.eveningScheduleItems,
    ...pools.serviceItems,
    ...pools.stayItems,
    ...pools.famousItems,
  ]);
  const coverItem = pickSingleContextualItem(
    [...outdoorSpots, ...pools.freeCheckinItems],
    [...allSpots, ...pools.dayCafeItems, ...catchAllItems],
    `${seedPrefix}-cover`,
    pick,
  )[0];
  const coverImage = coverItem
    ? photomodePageItemWithResolver(coverItem, 'checkin ngoại cảnh', imageResolver).imageUrl
    : background(`${seedPrefix}-cover-bg`);

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
      'Check-in',
      'terracotta',
      'Check-in đẹp cho 3 ngày vi vu',
      'Gom các điểm check-in đẹp local, dùng layout photomode bám sát mẫu tham chiếu.',
      buildPhotomodeItems(
        [...pools.freeCheckinItems, ...pools.dayCheckinItems],
        allSpots,
        3,
        `${seedPrefix}-free-checkin`,
        pick,
        imageResolver,
        () => 'check-in',
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
        pools.dayCafeItems,
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
        pools.dayCafeItems,
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
        allSpots,
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
        pools.morningFoodItems,
        pools.daytimeFoodItems,
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
        pools.lightMealItems,
        pools.lunchScheduleItems,
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
        pools.eveningScheduleItems,
        pools.eveningScheduleItems,
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
        dedupeItems([...pools.stayItems, ...pools.serviceItems]),
        3,
        `${seedPrefix}-services`,
        pick,
      ).map((item) => photomodePageItemWithResolver(item, photomodeServiceLabel(item), imageResolver)),
      '',
      'photomode',
    ),
  ];
}

function buildGridPageItems(
  primaryItems: GuideItem[],
  fallbackItems: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
  imageResolver: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
  labelForItem: (item: GuideItem) => string,
): PageItem[] {
  return pickGridItemsWithPartnerQuota(primaryItems, fallbackItems, count, seed, pick).map((item) =>
    photomodePageItemWithResolver(item, labelForItem(item), imageResolver),
  );
}

function buildCheckinCostBalancedGridItems(
  pools: DeckBuildPools,
  fallbackItems: GuideItem[],
  seed: string,
  pick: PickFn,
  imageResolver: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
): PageItem[] {
  const paidItems = pickWithUsedFallback(pools.paidCheckinItems, 3, `${seed}-paid`, pick);
  const freeItems = pickWithUsedFallback(pools.freeCheckinItems, 3, `${seed}-free`, pick);
  const selected = [...paidItems, ...freeItems];

  if (selected.length < 6) {
    selected.push(...pickWithUsedFallback(
      remainingItems(dedupeItems([...pools.checkinItems, ...fallbackItems]), selected),
      6 - selected.length,
      `${seed}-fill`,
      pick,
    ));
  }

  return selected.slice(0, 6).map((item) =>
    photomodePageItemWithResolver(item, '', imageResolver),
  );
}

function buildGrid8PageItems(
  primaryItems: GuideItem[],
  fallbackItems: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
  imageResolver: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
  labelForItem: (item: GuideItem) => string,
): PageItem[] {
  return pickGrid8ItemsWithPartnerQuota(primaryItems, fallbackItems, count, seed, pick).map((item) =>
    photomodePageItemWithResolver(item, labelForItem(item), imageResolver),
  );
}

function buildGrid6Pages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:grid-6`, mappedImageUrls, globalUsedImageUrls || []);
  const background = (seed: string) => backgroundFor(imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const catchAllItems = dedupeItems([
    ...pools.famousItems,
    ...pools.checkinItems,
    ...pools.cafeItems,
    ...pools.foodItems,
    ...pools.stayItems,
    ...pools.serviceItems,
  ]);
  const tourismFallbackItems = dedupeItems(pools.tourismItems);

  return [
    {
      ...buildCoverPage(
        'TOP 6 ĐỊA ĐIỂM ĐÀ LẠT',
        'Một bộ gợi ý ngắn, dễ quét nhanh để chọn điểm đi, ăn uống và chụp hình trong ngày.',
        background(`${seedPrefix}-cover`),
      ),
      layoutVariant: 'grid-6',
    },
    buildListPage(
      'Check-in',
      'terracotta',
      'Địa điểm check-in',
      '6 địa điểm check-in được cân bằng theo ngân sách để người xem chọn nhanh.',
      buildCheckinCostBalancedGridItems(pools, catchAllItems, `${seedPrefix}-checkin`, pick, imageResolver),
      '',
      'grid-6',
    ),
    buildListPage(
      'Cà phê',
      'gold',
      'QUÁN CAFE ĐÀ LẠT',
      'View cực chill, săn mây đỉnh',
      buildGridPageItems(pools.cafeItems, catchAllItems, 6, `${seedPrefix}-cafe`, pick, imageResolver, (item) => item.type),
      '',
      'grid-6',
    ),
    buildListPage(
      'Ẩm thực',
      'berry',
      'MÓN NGON ĐÀ LẠT',
      'Ăn là ghiền, nhất định phải thử',
      buildGridPageItems(pools.foodItems, catchAllItems, 6, `${seedPrefix}-food`, pick, imageResolver, mealLabelForItem),
      '',
      'grid-6',
    ),
    buildListPage(
      'Khu du lịch',
      'slate',
      'KHU DU LỊCH HOT',
      'Điểm đến không thể bỏ qua',
      buildGridPageItems(pools.tourismItems, tourismFallbackItems, 6, `${seedPrefix}-tourism`, pick, imageResolver, (item) => item.type),
      '',
      'grid-6',
    ),
    buildListPage(
      'Dịch vụ',
      'pine',
      'DỊCH VỤ CẦN CHÚ Ý',
      'Lưu trú, thuê xe & quà tặng',
      buildGridPageItems([...pools.stayItems, ...pools.serviceItems], catchAllItems, 6, `${seedPrefix}-services`, pick, imageResolver, photomodeServiceLabel),
      '',
      'grid-6',
    ),
  ];
}

function buildGrid8Pages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:grid-8`, mappedImageUrls, globalUsedImageUrls || []);
  const background = (seed: string) => backgroundFor(imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const catchAllItems = dedupeItems([
    ...pools.famousItems,
    ...pools.checkinItems,
    ...pools.cafeItems,
    ...pools.foodItems,
    ...pools.tourismItems,
    ...pools.stayItems,
    ...pools.serviceItems,
  ]);
  const tourismFallbackItems = dedupeItems(pools.tourismItems);
  const contentPages = [
    buildListPage(
      'Check-in',
      'terracotta',
      '8 ĐIỂM CHECK-IN',
      'Một trang scan nhanh 8 điểm, ưu tiên ảnh rõ và tên ngắn.',
      buildGrid8PageItems(pools.checkinItems, catchAllItems, 8, `${seedPrefix}-checkin`, pick, imageResolver, (item) => item.type),
      background(`${seedPrefix}-checkin-center`),
      'grid-8',
    ),
    buildListPage(
      'Cafe',
      'gold',
      '8 QUÁN CAFE',
      'Gợi ý quán ngồi chill, dễ lưu trước khi đi.',
      buildGrid8PageItems(pools.cafeItems, catchAllItems, 8, `${seedPrefix}-cafe`, pick, imageResolver, (item) => item.type),
      background(`${seedPrefix}-cafe-center`),
      'grid-8',
    ),
    buildListPage(
      'Ăn uống',
      'berry',
      '8 MÓN NÊN THỬ',
      'Nhóm quán ăn được gom gọn để người xem chọn nhanh.',
      buildGrid8PageItems(pools.foodItems, catchAllItems, 8, `${seedPrefix}-food`, pick, imageResolver, mealLabelForItem),
      background(`${seedPrefix}-food-center`),
      'grid-8',
    ),
    buildListPage(
      'Vào phố',
      'slate',
      '8 ĐIỂM VÀO PHỐ',
      'Các điểm tham quan và khu du lịch đặt trong lưới dày hơn.',
      buildGrid8PageItems(pools.tourismItems, tourismFallbackItems, 8, `${seedPrefix}-tourism`, pick, imageResolver, (item) => item.type),
      background(`${seedPrefix}-tourism-center`),
      'grid-8',
    ),
    buildListPage(
      'Dịch vụ',
      'pine',
      '8 LƯU Ý CẦN NHỚ',
      'Lưu trú, thuê xe và dịch vụ thực dụng được đặt ở trang cuối.',
      buildGrid8PageItems([...pools.stayItems, ...pools.serviceItems], catchAllItems, 8, `${seedPrefix}-services`, pick, imageResolver, photomodeServiceLabel),
      background(`${seedPrefix}-services-center`),
      'grid-8',
    ),
  ];
  const shuffledContentPages = shuffleListPages(contentPages.slice(0, -1), seedPrefix);
  const servicePage = contentPages[contentPages.length - 1];

  return [
    {
      ...buildCoverPage(
        'ĐÀ LẠT 8 ĐIỂM / 1 TRANG',
        'Mẫu lưới dày để xem nhiều lựa chọn hơn trong một lần lướt.',
        background(`${seedPrefix}-cover`),
      ),
      layoutVariant: 'grid-8',
    },
    ...shuffledContentPages,
    ...(servicePage ? [servicePage] : []),
  ];
}

function buildGrid4Pages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:grid-4`, mappedImageUrls, globalUsedImageUrls || []);
  const background = (seed: string) => backgroundFor(imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const catchAllItems = dedupeItems([...pools.famousItems, ...pools.checkinItems, ...pools.cafeItems, ...pools.foodItems]);
  const tourismFallbackItems = dedupeItems(pools.tourismItems);
  const contentPages = [
    buildListPage(
      'Check-in',
      'terracotta',
      'ĐỊA ĐIỂM CHECK-IN',
      'Mỗi trang cân bằng đối tác và địa điểm thường',
      buildGridPageItems(pools.checkinItems, catchAllItems, 4, `${seedPrefix}-checkin`, pick, imageResolver, (item) => item.type),
      '',
      'grid-4',
    ),
    buildListPage(
      'Cà phê',
      'gold',
      'QUÁN CAFE ĐÀ LẠT',
      '2 đối tác và 2 địa điểm thường khi đủ dữ liệu',
      buildGridPageItems(pools.cafeItems, catchAllItems, 4, `${seedPrefix}-cafe`, pick, imageResolver, (item) => item.type),
      '',
      'grid-4',
    ),
    buildListPage(
      'Ẩm thực',
      'berry',
      'MÓN NGON ĐÀ LẠT',
      'Ảnh được đổi theo seed của từng bộ AI',
      buildGridPageItems(pools.foodItems, catchAllItems, 4, `${seedPrefix}-food`, pick, imageResolver, mealLabelForItem),
      '',
      'grid-4',
    ),
    buildListPage(
      'Khu du lịch',
      'slate',
      'KHU DU LỊCH HOT',
      'Gọn hơn mẫu 6 ô nhưng giữ cùng tinh thần thiết kế',
      buildGridPageItems(pools.tourismItems, tourismFallbackItems, 4, `${seedPrefix}-tourism`, pick, imageResolver, (item) => item.type),
      '',
      'grid-4',
    ),
    buildListPage(
      'Dịch vụ',
      'pine',
      'DỊCH VỤ CẦN CHÚ Ý',
      'Lưu trú, thuê xe & quà tặng',
      buildGridPageItems([...pools.stayItems, ...pools.serviceItems], catchAllItems, 4, `${seedPrefix}-services`, pick, imageResolver, photomodeServiceLabel),
      '',
      'grid-4',
    ),
  ];
  const shuffledContentPages = shuffleListPages(contentPages.slice(0, -1), seedPrefix);
  const servicePage = contentPages[contentPages.length - 1];

  return [
    {
      ...buildCoverPage(
        'TOP 4 ĐỊA ĐIỂM ĐÀ LẠT',
        'Biến thể lưới gọn, mỗi trang 4 hình để xem rõ tên điểm, ảnh và vị trí trước khi chọn.',
        background(`${seedPrefix}-cover`),
      ),
      layoutVariant: 'grid-4',
    },
    ...shuffledContentPages,
    ...(servicePage ? [servicePage] : []),
  ];
}

// ─── Public entry point ───────────────────────────────────────────────────────

export function buildPagesForDeck(
  deckId: string,
  itemsBySection: WorkbookItemsBySection,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
): DeckPage[] {
  const pools = createDeckBuildPools(itemsBySection);
  if (deckId === 'itinerary-3n2d') return buildItineraryPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls);
  if (deckId === 'itinerary-4n3d') return buildItinerary4N3DPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls);
  if (deckId === 'itinerary-4n2d-grid8') return buildItinerary4N2DGrid8Pages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls);
  if (deckId === 'pov-3-day') return buildPov3DayPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls);
  if (deckId === 'must-go') return buildMustGoPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls);
  if (deckId === 'first-time') return buildFirstTimePages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls);
  if (deckId === 'grid-6') return buildGrid6Pages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls);
  if (deckId === 'grid-8') return buildGrid8Pages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls);
  if (deckId === 'grid-4') return buildGrid4Pages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls);
  throw new Error(`Không hỗ trợ deck: ${deckId}`);
}

export function buildDecks(
  itemsBySection: WorkbookItemsBySection,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
): GuideDeck[] {
  const common = { itemsBySection, imageUrls, libraryEntries, globalUsedItemIds, globalUsedImageUrls };
  return [
    {
      id: 'itinerary-3n2d',
      navTitle: 'Lịch trình 3N2Đ',
      title: 'Bộ trang gợi ý lịch trình 3N2Đ',
      description: 'Format này nghiêng về kiểu kể theo ngày: có cover riêng, mỗi ngày là một trang, rồi chốt thêm trang ăn sáng và dịch vụ.',
      lists: [buildDeckList('itinerary-3n2d', 'main', 'List chính', 'List lịch trình 3N2Đ', 'Danh sách ảnh chính cho bộ lịch trình 3N2Đ.', buildPagesForDeck('itinerary-3n2d', common.itemsBySection, common.imageUrls, common.libraryEntries, 'itinerary-main', common.globalUsedItemIds, common.globalUsedImageUrls))],
    },
    {
      id: 'itinerary-4n3d',
      navTitle: 'Lịch trình 4N3Đ',
      title: 'Bộ trang 4N3Đ kiểu travel journal',
      description: 'Format mới khác 3N2Đ: cover poster, route map, mỗi ngày có ảnh hero lớn và 5 stop nhỏ theo nhịp đi chậm.',
      lists: [buildDeckList('itinerary-4n3d', 'main', 'List chính', 'List lịch trình 4N3Đ', 'Danh sách ảnh chính cho bộ 4N3Đ thiết kế kiểu travel journal.', buildPagesForDeck('itinerary-4n3d', common.itemsBySection, common.imageUrls, common.libraryEntries, 'itinerary-4n3d-main', common.globalUsedItemIds, common.globalUsedImageUrls))],
    },
    {
      id: 'itinerary-4n2d-grid8',
      navTitle: 'Lịch trình 4N2Đ lưới 8',
      title: 'Bộ trang 4N2Đ dạng 8 ảnh quanh tiêu đề',
      description: 'Mẫu mới dùng chủ đề 4N2Đ, mỗi trang có 8 ảnh bao quanh tiêu đề ở giữa và mỗi địa điểm có thời gian cụ thể.',
      lists: [buildDeckList('itinerary-4n2d-grid8', 'main', 'List chính', 'List lịch trình 4N2Đ lưới 8', 'Danh sách ảnh chính cho mẫu 4N2Đ dạng 8 ảnh quanh tiêu đề, có Lưu trú và Dịch vụ.', buildPagesForDeck('itinerary-4n2d-grid8', common.itemsBySection, common.imageUrls, common.libraryEntries, 'itinerary-4n2d-grid8-main', common.globalUsedItemIds, common.globalUsedImageUrls))],
    },
    {
      id: 'pov-3-day',
      navTitle: 'POV 3 ngày',
      title: 'Bộ trang POV 3 ngày vi vu khắp Đà Lạt',
      description: 'Format này bám sát photomode TikTok: cover mạnh, rồi chia theo nhóm điểm local như check-in free, cafe, ăn uống và dịch vụ cần lưu ý.',
      lists: [buildDeckList('pov-3-day', 'main', 'List chính', 'List POV 3 ngày', 'Danh sách ảnh chính cho bộ POV 3 ngày vi vu khắp Đà Lạt.', buildPagesForDeck('pov-3-day', common.itemsBySection, common.imageUrls, common.libraryEntries, 'pov-3-day-main', common.globalUsedItemIds, common.globalUsedImageUrls))],
    },
    {
      id: 'must-go',
      navTitle: 'Điểm không thể bỏ qua',
      title: 'Bộ trang các điểm không thể bỏ qua',
      description: 'Format này bám gần series must-go: cover mạnh, sau đó tách riêng điểm nổi tiếng, check-in free, cafe và lưu trú.',
      lists: [buildDeckList('must-go', 'main', 'List chính', 'List must-go', 'Danh sách ảnh chính cho bộ điểm không thể bỏ qua.', buildPagesForDeck('must-go', common.itemsBySection, common.imageUrls, common.libraryEntries, 'must-go-main', common.globalUsedItemIds, common.globalUsedImageUrls))],
    },
    {
      id: 'first-time',
      navTitle: 'Lưu ý cho người mới',
      title: 'Bộ trang dành cho người chuẩn bị đến Đà Lạt',
      description: 'Format này đi theo logic tư vấn trước chuyến đi: đi sớm, ăn gì, ngồi cafe ở đâu, check-in ở đâu và cần nhớ gì.',
      lists: [buildDeckList('first-time', 'main', 'List chính', 'List cho người mới', 'Danh sách ảnh chính cho bộ lưu ý người mới đến Đà Lạt.', buildPagesForDeck('first-time', common.itemsBySection, common.imageUrls, common.libraryEntries, 'first-time-main', common.globalUsedItemIds, common.globalUsedImageUrls))],
    },
    {
      id: 'grid-6',
      navTitle: 'Mẫu Lưới 6 Ô',
      title: 'Bộ trang bố cục lưới 2x3 (6 địa điểm)',
      description: 'Mẫu thiết kế mật độ thông tin cao, mỗi trang hiển thị 6 địa điểm theo dạng lưới 2 cột x 3 hàng.',
      lists: [buildDeckList('grid-6', 'main', 'List chính', 'List lưới 6 ô', 'Danh sách ảnh chính cho mẫu lưới 2x3.', buildPagesForDeck('grid-6', common.itemsBySection, common.imageUrls, common.libraryEntries, 'grid-6-main', common.globalUsedItemIds, common.globalUsedImageUrls))],
    },
    {
      id: 'grid-8',
      navTitle: 'Mẫu Lưới 8 Ô',
      title: 'Bộ trang bố cục lưới 2x4 (8 địa điểm)',
      description: 'Biến thể dày hơn của mẫu lưới 6 ô, mỗi trang hiển thị 8 dữ liệu ảnh cùng tên và vị trí ngắn để scan nhanh.',
      lists: [buildDeckList('grid-8', 'main', 'List chính', 'List lưới 8 ô', 'Danh sách ảnh chính cho mẫu lưới 2x4.', buildPagesForDeck('grid-8', common.itemsBySection, common.imageUrls, common.libraryEntries, 'grid-8-main', common.globalUsedItemIds, common.globalUsedImageUrls))],
    },
    {
      id: 'grid-4',
      navTitle: 'Mẫu Lưới 4 Ô',
      title: 'Bộ trang bố cục lưới 2x2 (4 địa điểm)',
      description: 'Biến thể từ mẫu lưới 6 ô, giữ cùng phong cách hiển thị nhưng mỗi trang chỉ còn 4 hình và cân bằng đối tác/không đối tác.',
      lists: [buildDeckList('grid-4', 'main', 'List chính', 'List lưới 4 ô', 'Danh sách ảnh chính cho mẫu lưới 2x2.', buildPagesForDeck('grid-4', common.itemsBySection, common.imageUrls, common.libraryEntries, 'grid-4-main', common.globalUsedItemIds, common.globalUsedImageUrls))],
    },
  ];
}
