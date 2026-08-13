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
  MutantContentStyle,
  PageItem,
  SectionKey,
  TitlePlacement,
  WorkbookItemsBySection,
} from '../../../common/interfaces/guide.types';
import { hasItemKey, itemUsageKey, markItemKey } from './data-allocator';
import { allowedImageKindsForItem, createListImageResolver, stableHash, topDirKind } from './image-resolver';
import { SECTION_CONFIG } from '../../../common/constants/guide.constants';
import { buildPagesForDeckV2, getV2DeckDefinitions, isV2DeckId } from './deck-builder-v2';
import { cityLabel, cityLabelUpper, getMarketingCopy, buildCaptionHashtags, getActiveDestinationLocalize } from '../sync/destination-localize';
import { isPartnerFirstDestination } from '../sync/destination-config';
import { getCachedSpotlightV3Hooks, getSpotlightV3BuildContext, pickSpotlightV3Hook } from '../sync/spotlight-hook-source';

// ─── Utility helpers shared by all deck builders ─────────────────────────────

/**
 * Green Land (và các điểm đến "partnerFirst" tương lai): mẫu ưu tiên hiển thị hết dữ liệu đối tác (isPartner)
 * trước, chỉ dùng dữ liệu thường để bổ sung khi thiếu — không giới hạn số đối tác/trang như Đà Lạt/Phan Thiết.
 */
function partnerFirstActive(): boolean {
  return isPartnerFirstDestination(getActiveDestinationLocalize());
}

const DEFAULT_PARTNER_TARGET_PER_PAGE = 3;
/** Cap DL riêng cho pov-3-v2 (lưới 9 ô) và grid-8-quaytung. */
const POV_3_V2_GRID_PARTNER_CAP = 4;
/** Cap DL đối tác trang lưới 9 ô cafe & quán ăn (pov-3-v2). */
const POV_3_V2_CAFE_FOOD_PARTNER_CAP = 6;
const GRID_8_QUAYTUNG_PARTNER_CAP = 4;
export const ITINERARY_3N2D_TEMPLATE_VERSION = 17;
export const ITINERARY_4N3D_TEMPLATE_VERSION = 13;
export const ITINERARY_4N2D_GRID8_TEMPLATE_VERSION = 18;
export const POV_3_DAY_TEMPLATE_VERSION = 13;
export const GRID_4_TEMPLATE_VERSION = 18;
export const GRID_4_MUTANT_TEMPLATE_VERSION = 2;
export const GRID_5_TEMPLATE_VERSION = 4;
export const GRID_6_TEMPLATE_VERSION = 18;
export const GRID_6_ZIGZAG_TEMPLATE_VERSION = 3;
export const GRID_8_TEMPLATE_VERSION = 19;
export const SPOTLIGHT_GUIDE_TEMPLATE_VERSION = 5;
export const BUDGET_3N2D_TEMPLATE_VERSION = 7;
export const BUDGET_3N2D_STORY_TEMPLATE_VERSION = 5;
export const BUDGET_72H_SUMMARY_TEMPLATE_VERSION = 7;
const budget72StoryText = {
  coverTitle: '\u002272H\u0022 \u1ede \u0110\u00c0 L\u1ea0T V\u1edaI 3TR',
  coverSubtitle: 'L\u1ecbch tr\u00ecnh 3 ng\u00e0y 2 \u0111\u00eam g\u1ecdn h\u01a1n: xem theo t\u1eebng ng\u00e0y, c\u00f3 chi ph\u00ed v\u00e0 c\u00e1c \u0111i\u1ec3m n\u00ean l\u01b0u.',
  day1Chip: 'Ng\u00e0y 01',
  day1Title: 'Ng\u00e0y \u0111\u1ea7u v\u00e0o ph\u1ed1',
  day1Subtitle: '\u0102n s\u00e1ng, cafe, check-in v\u00e0 m\u1ed9t bu\u1ed5i t\u1ed1i v\u1eeba \u0111\u1ee7 nh\u1ecbp \u0111\u1ec3 l\u00e0m quen \u0110\u00e0 L\u1ea1t.',
  day2Chip: 'Ng\u00e0y 02',
  day2Title: 'M\u1ed9t ng\u00e0y \u0111i tr\u1ecdn h\u01a1n',
  day2Subtitle: 'D\u00e0nh ng\u00e0y gi\u1eefa chuy\u1ebfn cho c\u00e1c \u0111i\u1ec3m ch\u00ednh, qu\u00e1n \u0111\u1eb9p v\u00e0 ho\u1ea1t \u0111\u1ed9ng \u0111\u00e1ng gh\u00e9.',
  day3Chip: 'Ng\u00e0y 03',
  day3Title: 'Ng\u00e0y cu\u1ed1i nh\u1eb9 nh\u00e0ng',
  day3Subtitle: 'Gi\u1eef l\u1ecbch g\u1ecdn \u0111\u1ec3 k\u1ecbp \u0103n, mua qu\u00e0, check-out v\u00e0 quay v\u1ec1 kh\u00f4ng b\u1ecb g\u1ea5p.',
  totalChip: 'Chi ph\u00ed',
  totalTitle: 'T\u1ed5ng chi ph\u00ed d\u1ef1 ki\u1ebfn',
  totalSubtitle: 'C\u00e1c kho\u1ea3n ch\u00ednh \u0111\u01b0\u1ee3c gom l\u1ea1i \u0111\u1ec3 d\u1ec5 c\u00e2n ng\u00e2n s\u00e1ch tr\u01b0\u1edbc khi \u0111i.',
  deckTitle: 'B\u1ed9 trang 72H 3N2\u0110 b\u1ea3n story',
  deckDescription: 'Phi\u00ean b\u1ea3n 2 t\u1eadp trung xem nhanh: cover, t\u1eebng ng\u00e0y ri\u00eang, trang t\u1ed5ng chi ph\u00ed v\u00e0 3 trang g\u1ee3i \u00fd \u0111\u1ecba \u0111i\u1ec3m ph\u00eda sau.',
  listLabel: 'List ch\u00ednh',
  listName: 'List 72H 3N2\u0110 Story',
  listDescription: 'Danh s\u00e1ch \u1ea3nh ch\u00ednh cho m\u1eabu 72H b\u1ea3n story d\u1ec5 xem tr\u00ean TikTok.',
};

function partnerTargetCount(count: number, availablePartners: number, cap = DEFAULT_PARTNER_TARGET_PER_PAGE): number {
  // partnerFirst: bỏ mọi cap, chỉ giới hạn bởi số chỗ trống trên trang và số đối tác thực có sẵn.
  const effectiveCap = partnerFirstActive() ? Math.max(count, availablePartners) : cap;
  return Math.min(Math.max(count, 0), Math.max(availablePartners, 0), Math.max(effectiveCap, 0));
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

function hasDisplayText(value: string | undefined | null): boolean {
  return String(value ?? '').trim().length > 0;
}

function hasUsableImage(item: GuideItem): boolean {
  return hasDisplayText(item.imageUrl) || Boolean(item.candidateImageUrls?.some((url) => hasDisplayText(url)));
}

function hasMappedImage(item: GuideItem): boolean {
  if (!hasUsableImage(item)) return false;
  return item.imageSource === 'manual' || item.imageSource === 'auto' || Boolean(item.imageMapped);
}

function preferMappedImageItems(items: GuideItem[]): GuideItem[] {
  const deduped = dedupeItems(items);
  const mappedItems = deduped.filter(hasMappedImage);
  return mappedItems.length > 0 ? mappedItems : deduped;
}

/** Chỉ tính ảnh Drive thật của chính địa điểm (map từ Sheet, không phải ảnh mượn thư viện chung). */
function hasOwnDriveImage(item: GuideItem): boolean {
  return hasUsableImage(item) && item.imageSource === 'manual';
}

/**
 * Item chưa lấy được ảnh Drive riêng (đang dùng ảnh mượn thư viện 'auto'/'fallback') bị loại thẳng
 * khỏi pool — KHÔNG có bước "giảm nhẹ dùng lại toàn bộ" như trước, để không lọt bất kỳ dữ liệu nào
 * thuộc các item này vào list. Nếu một pool bị rỗng do cả nhóm đều chưa có ảnh riêng, các lớp dự
 * phòng đa tầng khác đã có sẵn trong deck-builder (pickWithUsedFallback, pool rộng hơn của budget...)
 * sẽ tự lấp bằng item từ nhóm khác — không dùng lại chính các item đã bị loại ở đây. Item sẽ tự
 * xuất hiện lại khi ảnh Drive lấy được ở lần đồng bộ sau (tính theo imageSource, không cần bật tay).
 */
function preferOwnImageItems(items: GuideItem[]): GuideItem[] {
  return dedupeItems(items).filter(hasOwnDriveImage);
}

function listOrdinalFromSeed(seed: string): number {
  const captionMatch = seed.match(/caption-(\d+)/i) || seed.match(/\|(\d{2})-/);
  return captionMatch ? Number(captionMatch[1]) + 1 : 1;
}

function useActivityVariant(seed: string): boolean {
  return listOrdinalFromSeed(seed) % 2 === 0;
}

function finalActivityPagePool(pools: DeckBuildPools, seed: string): { chip: string; title: string; items: GuideItem[]; isActivity: boolean } {
  if (useActivityVariant(seed)) {
    const items = preferMappedImageItems(pools.activityItems);
    return {
      chip: 'Hoạt động',
      title: `HOẠT ĐỘNG ${cityLabelUpper()}`,
      items: items.length > 0 ? items : pools.historyItems,
      isActivity: true,
    };
  }

  return {
    chip: 'Khu du lịch',
    title: `KHU DU LỊCH ${cityLabelUpper()}`,
    items: preferMappedImageItems(pools.tourismItems),
    isActivity: false,
  };
}

function itineraryActivitySlotPool(pools: DeckBuildPools, seed: string): { label: string; prefix: string; items: GuideItem[] } {
  const pagePool = finalActivityPagePool(pools, seed);
  return {
    label: pagePool.isActivity ? 'HOẠT ĐỘNG' : 'KHU DU LỊCH',
    prefix: `${pagePool.chip}:`,
    items: pagePool.items,
  };
}

/** Giá hiển thị trên slide: ưu tiên `gia_dau_nguoi`, fallback `gia`. */
export function displayPrice(item: GuideItem): string {
  const headPrice = String(item.headPrice || '').replace(/\s+/g, ' ').trim();
  if (headPrice) return headPrice;
  return String(item.price || '').replace(/\s+/g, ' ').trim();
}

/**
 * Sheet nhiều dòng ghi "0" cho mục miễn phí (check-in, hoạt động...) thay vì để trống. Giá trị này vẫn
 * là chuỗi non-empty nên `if (price)` coi là "có giá" và hiển thị badge xấu "Giá: 0 đ". Dùng hàm này ở
 * mọi nơi build badge giá (cả list chính và list AI dùng chung logic này) để ẩn badge khi giá = 0/miễn phí,
 * thay vì hiển thị "0 đ".
 */
function isDisplayablePrice(price: string): boolean {
  const cleaned = String(price || '').trim();
  if (!cleaned) return false;
  if (isFreePrice(cleaned)) return false;
  return !/^0+\s*(đ|d|vnd|vnđ)?$/i.test(cleaned);
}

function isDisplayReadyItem(item: GuideItem): boolean {
  return hasDisplayText(item.name)
    && hasUsableImage(item)
    && (
      hasDisplayText(item.address)
      || hasDisplayText(item.openHours)
      || hasDisplayText(displayPrice(item))
      || hasDisplayText(item.phone)
      || hasDisplayText(item.type)
      || hasDisplayText(item.highlight)
    );
}

function preferDisplayReadyItems(items: GuideItem[], minimumCount: number): GuideItem[] {
  const deduped = dedupeItems(items);
  const readyItems = deduped.filter(isDisplayReadyItem);
  return readyItems.length >= minimumCount ? readyItems : deduped;
}

function ensureGuideItemCount(selectedItems: GuideItem[], sourceItems: GuideItem[], count: number, seed: string): GuideItem[] {
  const selected = dedupeItems(selectedItems);
  if (selected.length >= count) return selected.slice(0, count);

  const selectedKeys = new Set<string>();
  selected.forEach((item) => markItemKey(selectedKeys, item));
  const fillItems = sortCandidates(preferDisplayReadyItems(sourceItems, count), `${seed}-ensure`)
    .filter((item) => !hasItemKey(selectedKeys, item));
  return dedupeItems([...selected, ...fillItems]).slice(0, count);
}

export function metaText(item: GuideItem): [string, string] {
  const secondaryParts: string[] = [];
  if (item.openHours) secondaryParts.push(`Khung giờ: ${item.openHours}`);
  const price = displayPrice(item);
  if (isDisplayablePrice(price)) secondaryParts.push(`Giá: ${price}`);
  else if (item.phone) secondaryParts.push(`Liên hệ: ${item.phone}`);
  const secondary = secondaryParts.join(' · ');
  if (item.sectionKey === 'hoat_dong') {
    return ['', secondary];
  }
  const primary = item.address || 'Đang cập nhật địa chỉ';
  return [primary, secondary];
}

function serviceMetaText(item: GuideItem): [string, string] {
  const primary = item.address || 'Đang cập nhật địa chỉ';
  if (item.sectionKey === 'homestay') {
    const secondaryParts: string[] = [];
    const price = displayPrice(item);
    if (isDisplayablePrice(price)) secondaryParts.push(`Giá: ${price}`);
    if (item.phone) secondaryParts.push(`SĐT: ${item.phone}`);
    return [primary, secondaryParts.join(' · ')];
  }
  return [primary, item.phone ? `SĐT: ${item.phone}` : ''];
}

export function backgroundFor(imageUrls: string[], seed: string, usedImageUrls?: Set<string>): string {
  if (imageUrls.length === 0) return '';
  const ordered = [...imageUrls].sort((left, right) => stableHash(`${seed}:${left}`) - stableHash(`${seed}:${right}`));
  const picked = ordered.find((url) => !usedImageUrls?.has(url)) || ordered[0] || '';
  if (picked) usedImageUrls?.add(picked);
  return picked;
}

function isPortableImageUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || url.startsWith('/assets/drive-file');
}

function portableBackgroundFor(
  mappedImageUrls: string[],
  imageUrls: string[],
  seed: string,
  usedImageUrls?: Set<string>,
): string {
  const portableMapped = mappedImageUrls.filter(isPortableImageUrl);
  const preferred = portableMapped.length > 0 ? portableMapped : [];
  const primary = backgroundFor(preferred, seed, usedImageUrls);
  return primary || backgroundFor(imageUrls, seed, usedImageUrls);
}

function coverBackgroundFor(
  coverImageUrls: string[],
  _mappedImageUrls: string[],
  _imageUrls: string[],
  seed: string,
  usedImageUrls?: Set<string>,
): string {
  // Background là nguồn riêng từ sheet/thư mục Hình_nền. Không fallback sang
  // ảnh của địa điểm vì ảnh đó còn phải dành cho đúng ô nội dung khi export.
  return backgroundFor(coverImageUrls.filter(isPortableImageUrl), seed, usedImageUrls);
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

function itemSearchText(item: GuideItem): string {
  return normalizeText([
    item.sectionKey,
    item.sectionTitle,
    item.type,
    item.name,
    item.address,
    item.openHours,
    item.style,
    item.highlight,
  ].join(' '));
}

function textMatchesAny(text: string, tokens: string[]): boolean {
  return tokens.some((token) => text.includes(token));
}

const STRICT_NIGHTLIFE_TOKENS = [
  'cho_dem',
  'dem',
  'night',
  'bar',
  'pub',
  'club',
  'lounge',
  'cocktail',
  'homebar',
  'ruou',
  'beer',
  'nobar',
  'the_roof',
  'peng',
  'fox_s_den',
  'kyama',
  '444',
  'blue_rose',
  'cava',
  'warm',
  'la_tulipe_rouge',
  'hem_ky_uc',
  'cho_da_lat',
  'choi',
  'dao_bo',
  'ngam_nha_long',
  'xom_leo',
  'cong_chieng',
  'acoustic',
  'nhac',
  'vinaphone',
];

const DAYTIME_NIGHTLIFE_NOISE_TOKENS = [
  'check_in',
  'checkin',
  'quang_truong',
  'cafe_view',
  'thung_lung',
  'trai_mat',
];

function isNightlifePageItem(item: GuideItem): boolean {
  if (item.sectionKey !== 'choi_dem') return false;
  const text = normalizeText([
    item.name,
    item.address,
    item.openHours,
    item.style,
    item.highlight,
  ].join(' '));
  const hasNightlifeSignal = textMatchesAny(text, STRICT_NIGHTLIFE_TOKENS);
  if (!hasNightlifeSignal) return false;
  if (textMatchesAny(text, DAYTIME_NIGHTLIFE_NOISE_TOKENS)) return false;

  const looksDaytimeOnly = textMatchesAny(text, DAYTIME_NIGHTLIFE_NOISE_TOKENS)
    && !textMatchesAny(text, ['dem', 'night', 'bar', 'pub', 'club', 'lounge', 'cocktail', 'ruou', 'nhac', 'acoustic', 'dao_bo', 'ngam_nha_long']);
  return !looksDaytimeOnly;
}

function pageReadyNightlifeItems(items: GuideItem[]): GuideItem[] {
  const filtered = dedupeItems(items.filter(isNightlifePageItem));
  return filtered.length > 0 ? filtered : dedupeItems(items);
}

function checkinTopicKey(item: GuideItem): string {
  const text = normalizeText([item.type, item.name, item.style, item.highlight].join(' '));
  const tokens = new Set(text.split('_').filter(Boolean));
  if (textMatchesAny(text, ['nha_tho', 'giao_xu', 'thanh_mau', 'thanh_tam', 'domaine'])) return 'church';
  if (textMatchesAny(text, ['chua', 'tu_vien', 'thien_vien'])) return 'temple';
  if (tokens.has('ho') || textMatchesAny(text, ['thac', 'suoi', 'tuyen_lam', 'xuan_huong'])) return 'water';
  if (tokens.has('doi') || tokens.has('nui') || textMatchesAny(text, ['langbiang', 'thung_lung', 'hon_bo', 'da_phu'])) return 'hill';
  if (textMatchesAny(text, ['vuon', 'farm', 'canh_dong', 'cam_tu_cau', 'vuon_hoa', 'hoa_da_lat'])) return 'garden';
  if (tokens.has('cho') || textMatchesAny(text, ['quang_truong', 'doc', 'pho', 'hem'])) return 'urban';
  if (textMatchesAny(text, ['ga_', 'nha_ga', 'dinh', 'biet_dien', 'bao_tang', 'truong', 'dai_hoc'])) return 'architecture';
  if (textMatchesAny(text, ['cafe', 'ca_phe'])) return 'cafe-view';
  return normalizeText(item.type || item.name).split('_').filter(Boolean).slice(0, 2).join('_') || item.id;
}

function topicBalancedPool(
  items: GuideItem[],
  count: number,
  seed: string,
  topicForItem: (item: GuideItem) => string,
  maxPerTopic: number,
): GuideItem[] {
  const pool = preferDisplayReadyItems(items, count);
  const groups = new Map<string, GuideItem[]>();
  for (const item of pool) {
    const key = topicForItem(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const orderedGroups = Array.from(groups.entries())
    .map(([key, groupItems]) => ({ key, items: sortCandidates(groupItems, `${seed}-${key}`) }))
    .sort((left, right) => stableHash(`${seed}:topic:${left.key}`) - stableHash(`${seed}:topic:${right.key}`));

  const selected: GuideItem[] = [];
  const selectedKeys = new Set<string>();
  const addItem = (item: GuideItem | undefined): void => {
    if (!item || selected.length >= count || hasItemKey(selectedKeys, item)) return;
    selected.push(item);
    markItemKey(selectedKeys, item);
  };

  for (let round = 0; selected.length < count && round < maxPerTopic; round += 1) {
    for (const group of orderedGroups) {
      addItem(group.items[round]);
      if (selected.length >= count) break;
    }
  }

  if (selected.length < count) {
    sortCandidates(pool, `${seed}-fill`)
      .filter((item) => !hasItemKey(selectedKeys, item))
      .forEach(addItem);
  }

  return ensureGuideItemCount(selected, pool, count, `${seed}-balanced-pool`).slice(0, count);
}

function balancedCheckinPool(items: GuideItem[], count: number, seed: string): GuideItem[] {
  return topicBalancedPool(items, count, seed, checkinTopicKey, count >= 8 ? 2 : 1);
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

function isGrillOrHotpotItem(item: GuideItem): boolean {
  const normalized = normalizeText(`${item.name} ${item.type} ${item.highlight}`);
  return ['nuong', 'lau', 'nau', 'bbq', 'grill', 'buffet', 'long_nuong'].some((token) => normalized.includes(token));
}

function withoutGrillOrHotpot(items: GuideItem[]): GuideItem[] {
  return items.filter((item) => !isGrillOrHotpotItem(item));
}

function isMorningFoodItem(item: GuideItem): boolean {
  if (isGrillOrHotpotItem(item)) return false;
  const firstHour = firstHourFromOpenHours(item.openHours);
  if (firstHour !== null && firstHour >= 10) return false;
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

/** Kem, chè, ăn vặt — không dùng cho trang ĂN TRƯA / bữa chính. */
function isSnackOrDessertItem(item: GuideItem): boolean {
  if (isGrillOrHotpotItem(item)) return false;
  const normalized = normalizeText(`${item.name} ${item.type} ${item.highlight}`);
  if (normalized.includes('an_vat')) return true;
  return [
    'kem_bo',
    'kembo',
    'kem',
    'che',
    'snack',
    'tra_sua',
    'trasua',
    'waffle',
    'matcha',
    'sua_chua',
    'nuoc_ep',
    'banh_flan',
    'smoothie',
    'cham_kem',
  ].some((token) => normalized.includes(token));
}

function buildLunchFoodItems(daytimeFoodItems: GuideItem[]): GuideItem[] {
  const lunchTyped = daytimeFoodItems.filter(
    (item) => normalizeItemType(item, 'trua') && !isSnackOrDessertItem(item),
  );
  const mainMeals = daytimeFoodItems.filter(
    (item) => !isSnackOrDessertItem(item) && !isMorningFoodItem(item),
  );
  const merged = dedupeItems([...lunchTyped, ...mainMeals]);
  if (merged.length >= 4) return merged;
  return dedupeItems(daytimeFoodItems.filter((item) => !isSnackOrDessertItem(item)));
}

function isImageBackedNightlifeItem(item: GuideItem): boolean {
  if (!item.imageMapped) return false;
  if (item.sectionKey === 'choi_dem') return true;

  const normalized = normalizeText(`${item.name} ${item.address} ${item.type} ${item.highlight} ${item.openHours}`);
  return [
    'cho_dem',
    'bar',
    'lounge',
    'cocktail',
    'ruou',
  ].some((token) => normalized.includes(token));
}

function photomodeMetaPrimary(item: GuideItem): string {
  if (item.sectionKey === 'hoat_dong') return '';
  return item.address || item.phone || 'Đang cập nhật';
}

function photomodeServiceLabel(item: GuideItem): string {
  const normalized = normalizeText(`${item.type} ${item.name}`);
  if (item.sectionKey === 'choi_dem' || isImageBackedNightlifeItem(item)) return 'chơi đêm';
  if (item.sectionKey === 'homestay') return 'lưu trú';
  if (item.sectionKey === 'dich_vu') return item.type || 'dịch vụ';
  if (normalized.includes('dac_san') || normalized.includes('qua')) return 'quà tặng';
  if (normalized.includes('thue_xe') || normalized.includes('xe')) return 'dịch vụ thuê xe';
  return '';
}

function practicalServiceItems(pools: DeckBuildPools): GuideItem[] {
  return dedupeItems([
    ...pools.serviceItems,
    ...pools.nightlifeImageItems,
    ...pools.nightlifeItems,
  ]);
}

function serviceTypeKey(item: GuideItem): string {
  if (item.sectionKey === 'choi_dem' || isImageBackedNightlifeItem(item)) return 'choi_dem';
  if (item.sectionKey === 'homestay') return 'homestay';
  return normalizeText(item.type || item.sectionTitle || item.sectionKey) || item.sectionKey;
}

function groupPracticalServiceItems(items: GuideItem[], seed: string): Array<{ key: string; items: GuideItem[] }> {
  const groups = new Map<string, GuideItem[]>();
  dedupeItems(items).forEach((item) => {
    const key = serviceTypeKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });
  return [...groups.entries()]
    .map(([key, groupItems]) => ({ key, items: groupItems }))
    .sort((left, right) => stableHash(`${seed}:service-type:${left.key}`) - stableHash(`${seed}:service-type:${right.key}`));
}

function pickServiceTypeBalancedItems(
  pools: DeckBuildPools,
  fallbackItems: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
  targetPartnerCount = 2,
): GuideItem[] {
  const primaryServicePool = preferDisplayReadyItems(practicalServiceItems(pools), count);
  const servicePool = primaryServicePool.length >= count
    ? primaryServicePool
    : preferDisplayReadyItems(practicalServiceFallbackItems(pools, fallbackItems), count);
  const selected: GuideItem[] = [];
  const selectedKeys = new Set<string>();
  const groupCounts = new Map<string, number>();

  const addItems = (items: GuideItem[]): void => {
    for (const item of items) {
      if (selected.length >= count || hasItemKey(selectedKeys, item)) continue;
      selected.push(item);
      markItemKey(selectedKeys, item);
      const key = serviceTypeKey(item);
      groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
    }
  };

  addItems(pickWithUsedFallback(
    servicePool.filter((item) => item.isPartner),
    Math.min(targetPartnerCount, count),
    `${seed}-partners`,
    pick,
  ));

  const canAddPartner = (): boolean => selected.filter((item) => item.isPartner).length < targetPartnerCount;
  const groups = groupPracticalServiceItems(servicePool, seed);
  for (let round = 0; selected.length < count && round < 3; round += 1) {
    let addedInRound = false;
    for (const group of groups) {
      if (selected.length >= count) break;
      if ((groupCounts.get(group.key) ?? 0) >= 3) continue;
      const nextItem = pickWithUsedFallback(
        group.items.filter((item) => !hasItemKey(selectedKeys, item) && (canAddPartner() || !item.isPartner)),
        1,
        `${seed}-${group.key}-round-${round}`,
        pick,
      )[0];
      if (!nextItem) continue;
      addItems([nextItem]);
      addedInRound = true;
    }
    if (!addedInRound) break;
  }

  if (selected.length < count) {
    addItems(pickWithUsedFallback(
      servicePool.filter((item) => !hasItemKey(selectedKeys, item) && (canAddPartner() || !item.isPartner)),
      count - selected.length,
      `${seed}-fill`,
      pick,
    ));
  }

  if (selected.length < count) {
    addItems(pickWithUsedFallback(
      servicePool.filter((item) => !hasItemKey(selectedKeys, item)),
      count - selected.length,
      `${seed}-partner-fill`,
      pick,
    ));
  }

  const filledSelection = ensureGuideItemCount(selected, servicePool, count, `${seed}-service`);
  return shuffleItems(filledSelection, `${seed}-order`).slice(0, count);
}

type ItineraryServiceCategory = 'choi_dem' | 'dac_san' | 'thue_xe' | 'spa' | 'thue_do' | 'nha_xe';

function matchesItineraryServiceCategory(item: GuideItem, category: ItineraryServiceCategory): boolean {
  const normalized = normalizeText(`${item.sectionKey} ${item.sectionTitle} ${item.type} ${item.name} ${item.highlight}`);
  if (category === 'choi_dem') return item.sectionKey === 'choi_dem';
  if (item.sectionKey !== 'dich_vu') return false;
  if (category === 'dac_san') return normalized.includes('dac_san');
  if (category === 'thue_xe') return !normalized.includes('nha_xe') && (normalized.includes('thue_xe') || normalized.includes('xe_may'));
  if (category === 'spa') return normalized.includes('spa') || normalized.includes('goi_dau') || normalized.includes('massage');
  if (category === 'thue_do') return normalized.includes('thue_do') || normalized.includes('rental');
  return normalized.includes('nha_xe') || normalized.includes('limousine') || normalized.includes('phuong_trang');
}

function pickItinerary3N2DServicePageItems(
  pools: DeckBuildPools,
  fallbackItems: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
): GuideItem[] {
  const servicePool = preferDisplayReadyItems(practicalServiceFallbackItems(pools, fallbackItems), count);
  const selected: GuideItem[] = [];
  const selectedKeys = new Set<string>();
  const orderedSlots: ItineraryServiceCategory[] = [
    'choi_dem',
    'dac_san',
    'dac_san',
    'thue_xe',
    'thue_xe',
    'spa',
    'thue_do',
    'nha_xe',
  ];

  const addItem = (item: GuideItem | undefined): void => {
    if (!item || selected.length >= count || hasItemKey(selectedKeys, item)) return;
    selected.push(item);
    markItemKey(selectedKeys, item);
  };

  orderedSlots.slice(0, count).forEach((category, index) => {
    const categoryItems = servicePool.filter((item) => (
      !hasItemKey(selectedKeys, item) && matchesItineraryServiceCategory(item, category)
    ));
    addItem(pickWithUsedFallback(categoryItems, 1, `${seed}-${category}-${index + 1}`, pick)[0]);
  });

  if (selected.length < count) {
    pickWithUsedFallback(
      servicePool.filter((item) => !hasItemKey(selectedKeys, item)),
      count - selected.length,
      `${seed}-fill`,
      pick,
    ).forEach(addItem);
  }

  return selected.slice(0, count);
}

function practicalServiceFallbackItems(pools: DeckBuildPools, fallbackItems: GuideItem[] = []): GuideItem[] {
  return dedupeItems([
    ...practicalServiceItems(pools),
    ...pools.stayItems,
    ...fallbackItems,
  ]);
}

function pickPracticalServiceItemsWithNightlife(
  pools: DeckBuildPools,
  fallbackItems: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
): GuideItem[] {
  const primaryItems = practicalServiceItems(pools);
  const fillItems = primaryItems.length >= count
    ? primaryItems
    : practicalServiceFallbackItems(pools, fallbackItems);
  const nightlifePool = dedupeItems([...pools.nightlifeImageItems, ...pools.nightlifeItems]);
  const nightlifeTarget = Math.min(nightlifePool.length, count >= 6 ? 3 : count >= 4 ? 2 : 1);
  const imageBackedNightlifeItems = pickWithUsedFallback(
    pools.nightlifeImageItems,
    Math.min(pools.nightlifeImageItems.length, nightlifeTarget > 0 ? 1 : 0),
    `${seed}-nightlife-image`,
    pick,
  );
  const nightlifeItems = dedupeItems([
    ...imageBackedNightlifeItems,
    ...pickWithUsedFallback(
      remainingItems(nightlifePool, imageBackedNightlifeItems),
      nightlifeTarget - imageBackedNightlifeItems.length,
      `${seed}-nightlife`,
      pick,
    ),
  ]);
  const serviceItems = pickMixedItemsWithPartnerQuota(
    remainingItems(fillItems, nightlifeItems),
    count - nightlifeItems.length,
    `${seed}-services`,
    pick,
  );
  const combined = dedupeItems([...nightlifeItems, ...serviceItems]);

  if (combined.length < count) {
    combined.push(...pickWithUsedFallback(
      remainingItems(fillItems, combined),
      count - combined.length,
      `${seed}-fill`,
      pick,
    ));
  }

  return shuffleItems(combined, `${seed}-order`).slice(0, count);
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
  return isFreePrice(displayPrice(item));
}

function photomodePageItemWithResolver(
  item: GuideItem,
  label: string,
  resolveImage: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
): PageItem {
  const resolvedImage = resolveImage(item);
  const [, metaSecondary] = serviceMetaText(item);
  return {
    label,
    id: item.id,
    sourceKey: itemUsageKey(item),
    sourceSectionKey: item.sectionKey,
    name: item.name,
    metaPrimary: photomodeMetaPrimary(item),
    metaSecondary: item.sectionKey === 'homestay' || item.sectionKey === 'dich_vu' ? metaSecondary : '',
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
  const [metaPrimary, metaSecondary] = item.sectionKey === 'homestay' || item.sectionKey === 'dich_vu'
    ? serviceMetaText(item)
    : metaText(item);
  const resolvedImage = resolveImage(item);
  return {
    label,
    id: item.id,
    sourceKey: itemUsageKey(item),
    sourceSectionKey: item.sectionKey,
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

function pageItemMenuTextOnly(item: GuideItem, label: string): PageItem {
  const [metaPrimary, metaSecondary] = item.sectionKey === 'homestay' || item.sectionKey === 'dich_vu'
    ? serviceMetaText(item)
    : metaText(item);
  return {
    label,
    id: item.id,
    sourceKey: itemUsageKey(item),
    sourceSectionKey: item.sectionKey,
    name: item.name,
    metaPrimary,
    metaSecondary,
    imageUrl: '',
    imageMapped: false,
    imageSource: 'fallback',
    imageNote: '',
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
  const [metaPrimary, metaSecondary] = item.sectionKey === 'homestay' || item.sectionKey === 'dich_vu'
    ? serviceMetaText(item)
    : metaText(item);
  const resolvedImage = resolveImage(item);
  return {
    label: time,
    id: item.id,
    sourceKey: itemUsageKey(item),
    sourceSectionKey: item.sectionKey,
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
  [/\bKHONG\s+THE\s+BO\s+QUA\b/giu, 'không thể bỏ qua'],
  [/\bSANG\s+MO\s+SOM\b/giu, 'sáng mơ sớm'],
  [/\bKHO\s+BAU\s+AN\s+GIAU\b/giu, 'kho báu ẩn giấu'],
  [/\bCHOT\s+DON\b/giu, 'chốt đơn'],
  [/\bDANH\s+THUC\b/giu, 'đánh thức'],
  [/\bDANH\s+SACH\b/giu, 'danh sách'],
  [/\bDIA\s+DIEM\b/giu, 'địa điểm'],
  [/\bDIEM\b/giu, 'điểm'],
  [/\bGOI\s+GON\b/giu, 'gói gọn'],
  [/\bGON\s+VI\b/giu, 'gọn ví'],
  [/\bDICH\s+VU\b/giu, 'dịch vụ'],
  [/\bDOI\s+TAC\b/giu, 'đối tác'],
  [/\bTHUE\s+XE\b/giu, 'thuê xe'],
  [/\bXE\s+MAY\b/giu, 'xe máy'],
  [/\bDAT\s+XE\b/giu, 'đặt xe'],
  [/\bAN\s+SANG\b/giu, 'ăn sáng'],
  [/\bDI\s+DA\s+LAT\b/giu, 'đi Đà Lạt'],
  [/\bDA\s+LAT\b/giu, 'Đà Lạt'],
  [/\bDALAT\b/giu, 'Đà Lạt'],
  [/\bPHAN\s+THIET\b/giu, 'Phan Thiết'],
  [/\bGOI\s+Y\b/giu, 'gợi ý'],
  [/\bQUAN\s+CAFE\b/giu, 'quán cafe'],
  [/\bBUC\s+ANH\b/giu, 'bức ảnh'],
  [/\bSU\s+THAT\b/giu, 'sự thật'],
  [/\bBAT\s+NGO\b/giu, 'bất ngờ'],
  [/\bCHAY\s+HET\s+MINH\b/giu, 'cháy hết mình'],
  [/\bPHA\s+DAO\b/giu, 'phá đảo'],
  [/\bGOM\s+TRON\b/giu, 'gom trọn'],
  [/\bLOP\s+SUONG\b/giu, 'lớp sương'],
  [/\bCAM\s+NANG\b/giu, 'cẩm nang'],
  [/\bCHAM\s+SAU\b/giu, 'chạm sâu'],
  [/\bHET\s+NAC\b/giu, 'hết nấc'],
  [/\bNHIP\s+DIEU\b/giu, 'nhịp điệu'],
  [/\bDIU\s+DANG\b/giu, 'dịu dàng'],
  [/\bDI\s+CHAM\b/giu, 'đi chậm'],
  [/\bSIEU\s+CHILL\b/giu, 'siêu chill'],
  [/\bCHAM\s+MA\s+NGAM\b/giu, 'chậm mà ngấm'],
  [/\bMOI\s+GHIEN\b/giu, 'mới ghiền'],
  [/\bMA\s+GHIEN\b/giu, 'mà ghiền'],
  [/\bDEP\b/giu, 'đẹp'],
  [/\bLUU\b/giu, 'lưu'],
  [/\bTHI(?!\p{L})/giu, 'thì'],
  [/\bNAY(?!\p{L})/giu, 'này'],
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
    .replace(/\b(\d+\s*N\s*\d+)(D)\b/giu, (_match, prefix: string, day: string) => `${prefix}${matchHeadlineCase(day, 'Đ')}`)
    .replace(/\b(\d+\s*)(NGAY)\b/giu, (_match, prefix: string, word: string) => `${prefix}${matchHeadlineCase(word, 'ngày')}`)
    .replace(/\b(NGAY)(\s+\d+)\b/giu, (_match, word: string, suffix: string) => `${matchHeadlineCase(word, 'ngày')}${suffix}`)
    .replace(/\b(\d+\s*)(ANH)\b/giu, (_match, prefix: string, word: string) => `${prefix}${matchHeadlineCase(word, 'ảnh')}`)
    .replace(/\b(DEM)\b/giu, (match) => matchHeadlineCase(match, 'đêm'));

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
    .replace(/THÌẾT/g, 'THIẾT')
    .replace(/Thìết/g, 'Thiết')
    .replace(/thìết/g, 'thiết')
    .replace(/\bFREE\b/giu, 'ĐẸP')
    .replace(/\bFree\b/giu, 'Đẹp')
    .replace(/\bfree\b/giu, 'đẹp')
    .replace(/miễn\s*phí/giu, 'dễ đi')
    .replace(/\bĐà\s*Lạt\s*ẩn\s*mình\s*sau\s*vách\s*núi\b/giu, 'Đầy đủ kinh nghiệm cho chuyến đi Đà Lạt')
    .replace(/\bĐà\s*Lạt\s*đủ\s*để\s*đi\s*ngay\b/giu, 'Đầy đủ kinh nghiệm cho chuyến đi Đà Lạt')
    .replace(/\bĐà\s*Lạt\s+VN\b/giu, 'Đà Lạt')
    .replace(/\s+\/\s*VN\b/giu, '')
    .replace(/\s+\bVN\b(?=\s|$|[./])/giu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function coverSubtitleFromCaption(body: string): string {
  // Người dùng đã quyết định bỏ hẳn mô tả khỏi trang cover — body rỗng thì để rỗng
  // thật sự, không quay lại dùng câu mô tả tĩnh có sẵn của mẫu nữa.
  const cleanBody = String(body || '').replace(/\s+/g, ' ').trim();
  return sanitizeDeckHeadline(cleanBody);
}

const SPOTLIGHT_V2_COVER_SUBTITLE_MAX = 58;
/** ~3 dòng chữ phụ cover lưới 8 ô (giống độ dài lịch trình 4N3Đ lưới 8); cắt câu/từ, không thêm … */
export const GRID_8_COVER_SUBTITLE_MAX = 118;
/** ~4 dòng tagline cover grid-8-feed; cắt câu/từ, không thêm … */
export const GRID_8_FEED_COVER_SUBTITLE_MAX = 168;

export function truncateGrid8CoverSubtitle(value: string, max = GRID_8_COVER_SUBTITLE_MAX): string {
  return truncateGrid8FeedCoverSubtitle(value, max);
}

export function truncateGrid8FeedCoverSubtitle(value: string, max = GRID_8_FEED_COVER_SUBTITLE_MAX): string {
  const stripped = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  // Bỏ hẳn mô tả khi rỗng — không quay lại dùng câu mô tả tĩnh có sẵn của mẫu.
  const clean = sanitizeDeckHeadline(stripped).trim();
  if (!clean) return '';
  if (clean.length <= max) return clean;

  const truncated = clean.slice(0, max);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('? '),
    truncated.lastIndexOf('.\n'),
  );
  if (lastSentenceEnd > max * 0.35) {
    return clean.slice(0, lastSentenceEnd + 1).trim();
  }

  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > max * 0.45) return truncated.slice(0, lastSpace).trim();
  return truncated.trim();
}

function grid8CoverSubtitleFromCaption(caption: { headline: string; body: string }): string {
  const body = String(caption.body || '').replace(/\s+/g, ' ').trim();
  const firstSentence = body.match(/^[^.!?]+[.!?]?/)?.[0]?.trim() || body;
  const secondSentence = body.slice(firstSentence.length).match(/^\s*[^.!?]+[.!?]?/)?.[0]?.trim() || '';
  // Ưu tiên 1–2 câu ngắn như lịch trình 4N3Đ lưới 8 — không nhét cả body dài vào cover.
  let combined = firstSentence;
  if (secondSentence && `${firstSentence} ${secondSentence}`.length <= GRID_8_COVER_SUBTITLE_MAX) {
    combined = `${firstSentence} ${secondSentence}`.trim();
  }
  return truncateGrid8CoverSubtitle(combined || body);
}

function grid8FeedCoverSubtitleFromCaption(caption: { headline: string; body: string }): string {
  const body = String(caption.body || '').replace(/\s+/g, ' ').trim();
  const firstSentence = body.match(/^[^.!?]+[.!?]?/)?.[0]?.trim() || body;
  const secondSentence = body.slice(firstSentence.length).match(/^\s*[^.!?]+[.!?]?/)?.[0]?.trim() || '';
  const combined = [firstSentence, secondSentence].filter(Boolean).join(' ').trim();
  return truncateGrid8FeedCoverSubtitle(combined || body);
}

/** ~2 dòng tagline trên stack row; cắt tại ranh giới câu/từ, không để cụt "khi/và/của". */
export const POV_3_V2_STACK_TAGLINE_MAX = 92;

const POV3_V2_TAGLINE_TRAILING_FRAGMENT = /\s+(?:khi|va|và|và|cua|của|cho|với|với|mà|nên|để|de|trong|tại|tại|ở|o|là|la|còn|con|mà|như|nhu|nếu|neu|sau|trước|trước)$/i;

function trimIncompleteTaglineTail(text: string): string {
  let result = String(text || '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 4 && POV3_V2_TAGLINE_TRAILING_FRAGMENT.test(result); i += 1) {
    result = result.replace(POV3_V2_TAGLINE_TRAILING_FRAGMENT, '').trim();
  }
  return result;
}

export function truncatePov3V2StackTagline(
  value: string,
  max = POV_3_V2_STACK_TAGLINE_MAX,
): string {
  const clean = trimIncompleteTaglineTail(
    String(value || '')
      .replace(/^\[+|\]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  if (!clean) return '';
  if (clean.length <= max) {
    return /[.!?…]$/.test(clean) ? clean : `${clean}.`;
  }

  const slice = clean.slice(0, max + 1);
  const sentenceEnd = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
  if (sentenceEnd >= max * 0.35) {
    return clean.slice(0, sentenceEnd + 1).trim();
  }

  const truncated = clean.slice(0, max);
  const lastSpace = truncated.lastIndexOf(' ');
  const wordCut = (lastSpace > max * 0.45 ? truncated.slice(0, lastSpace) : truncated).trim();
  const trimmed = trimIncompleteTaglineTail(wordCut);
  if (!trimmed) return '';
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}…`;
}

export function truncateSpotlightV2CoverSubtitle(value: string): string {
  const stripped = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  const clean = sanitizeDeckHeadline(stripped).trim();
  if (!clean) return '';
  if (clean.length <= SPOTLIGHT_V2_COVER_SUBTITLE_MAX) return clean;

  const truncated = clean.slice(0, SPOTLIGHT_V2_COVER_SUBTITLE_MAX);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > SPOTLIGHT_V2_COVER_SUBTITLE_MAX * 0.45) {
    return `${truncated.slice(0, lastSpace).trim()}…`;
  }
  return `${truncated.trim()}…`;
}

function spotlightV2CoverSubtitleFromCaption(caption: { headline: string; body: string }): string {
  const headline = String(caption.headline || '').replace(/\s+/g, ' ').trim();
  const body = String(caption.body || '').replace(/\s+/g, ' ').trim();
  const firstSentence = body.match(/^[^.!?]+[.!?]?/)?.[0]?.trim() || body;
  const source = headline || firstSentence || body;
  return truncateSpotlightV2CoverSubtitle(source);
}

export function buildListPage(
  chipText: string,
  chipTone: AccentTone,
  title: string,
  subtitle: string,
  items: PageItem[],
  backgroundImage: string,
  layoutVariant: NonNullable<ListPage['layoutVariant']> = 'standard',
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

function seededRank(seed: string, value: string): number {
  return (stableHash(seed) ^ stableHash(value)) >>> 0;
}

function candidateScore(item: GuideItem, seed: string): { total: number; tieBreaker: number } {
  let infoScore = 0;
  if (item.openHours) infoScore += 15;
  if (displayPrice(item)) infoScore += 10;
  if (item.highlight) infoScore += 8;
  if (item.phone) infoScore += 8;
  const imageScore = item.imageSource === 'manual' ? 180 : item.imageSource === 'auto' ? 100 : 0;
  const seedJitter = seededRank(`${seed}:jitter`, item.id) % 60;
  return {
    total: imageScore + (item.isPartner ? 120 : 0) + infoScore + seedJitter,
    tieBreaker: 10_000 - (seededRank(`${seed}:tie`, item.id) % 10_000),
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
    const selected = [
      ...fresh.filter(hasMappedImage),
      ...previouslyUsed.filter(hasMappedImage),
      ...fresh.filter((item) => !hasMappedImage(item)),
      ...previouslyUsed.filter((item) => !hasMappedImage(item)),
    ].slice(0, count);
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
    const freshMappedPool = freshPool.filter(hasMappedImage);
    if (freshMappedPool.length > 0) {
      addItems(pick(freshMappedPool, Math.min(count, freshMappedPool.length), `${seed}-fresh-mapped`));
    }
  }

  if (selected.length < count) {
    addItems(pick(
      pool.filter((item) => hasMappedImage(item) && !hasItemKey(selectedIds, item)),
      count - selected.length,
      `${seed}-mapped-reuse`,
    ));
  }

  if (selected.length < count && freshPool.length > 0) {
    addItems(pick(
      freshPool.filter((item) => !hasMappedImage(item) && !hasItemKey(selectedIds, item)),
      count - selected.length,
      `${seed}-fresh-unmapped`,
    ));
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

function pickShuffledWithUsedFallback(items: GuideItem[], count: number, seed: string, pick: PickFn): GuideItem[] {
  const pool = dedupeItems(items);
  if (count <= 0 || pool.length === 0) return [];

  const selected: GuideItem[] = [];
  const selectedIds = new Set<string>();
  const addCandidates = (candidates: GuideItem[], suffix: string): void => {
    const orderedCandidates = [
      ...shuffleItems(candidates.filter(hasMappedImage), `${seed}-${suffix}-mapped`),
      ...shuffleItems(candidates.filter((item) => !hasMappedImage(item)), `${seed}-${suffix}-unmapped`),
    ];
    for (const item of orderedCandidates) {
      if (selected.length >= count || hasItemKey(selectedIds, item)) continue;
      const picked = pick([item], 1, `${seed}-${suffix}-${item.id}`)[0];
      if (!picked || hasItemKey(selectedIds, picked)) continue;
      selected.push(picked);
      markItemKey(selectedIds, picked);
    }
  };

  addCandidates(freshForPicker(pool, pick), 'fresh');
  if (selected.length < count) {
    addCandidates(pool.filter((item) => !hasItemKey(selectedIds, item)), 'fallback');
  }

  return selected.slice(0, count);
}

export function pickMixedItemsWithPartnerQuota(
  items: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
  partnerCap = DEFAULT_PARTNER_TARGET_PER_PAGE,
): GuideItem[] {
  const partnerPool = dedupeItems(items.filter((i) => i.isPartner));
  const regularPool = dedupeItems(items.filter((i) => !i.isPartner));
  const targetPartnerCount = partnerTargetCount(count, partnerPool.length, partnerCap);

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
  return [...items].sort((a, b) => {
    const leftRank = seededRank(`${seed}:shuffle`, a.id);
    const rightRank = seededRank(`${seed}:shuffle`, b.id);
    if (leftRank !== rightRank) return leftRank - rightRank;
    return a.name.localeCompare(b.name, 'vi');
  });
}

function shuffleListPages(pages: ListPage[], seed: string): ListPage[] {
  return [...pages].sort((a, b) => stableHash(`${seed}:page:${a.title}`) - stableHash(`${seed}:page:${b.title}`));
}

function shuffleSpotlightPages(pages: ListPage[], seed: string): ListPage[] {
  return [...pages].sort((left, right) => {
    const leftKey = `${left.title}:${left.items[0]?.sourceKey || left.items[0]?.id || left.items[0]?.name || ''}`;
    const rightKey = `${right.title}:${right.items[0]?.sourceKey || right.items[0]?.id || right.items[0]?.name || ''}`;
    return stableHash(`${seed}:page:${leftKey}`) - stableHash(`${seed}:page:${rightKey}`);
  });
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
    allowUsedPartnerFallback ? pickShuffledWithUsedFallback(items, itemCount, itemSeed, pick) : pick(items, itemCount, itemSeed);
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
  const targetPartnerCount = partnerFirstActive()
    ? Math.min(count, combinedPartnerCount)
    : (partnerCount === 2 ? 1 : Math.min(2, combinedPartnerCount));
  return pickPartnerBalancedItems(primaryItems, fallbackItems, count, targetPartnerCount, seed, pick);
}

function pickGridItemsWithPartnerQuota(primaryItems: GuideItem[], fallbackItems: GuideItem[], count: number, seed: string, pick: PickFn): GuideItem[] {
  if (count === 4) return pickGrid4ItemsWithPartnerQuota(primaryItems, fallbackItems, count, seed, pick);
  const partnerCount = primaryItems.filter((i) => i.isPartner).length;
  const combinedPartnerCount = dedupeItems([...primaryItems, ...fallbackItems]).filter((i) => i.isPartner).length;
  const targetPartnerCount = partnerFirstActive()
    ? Math.min(count, combinedPartnerCount)
    : (partnerCount === 2 ? 1 : Math.min(2, partnerTargetCount(count, combinedPartnerCount)));
  return pickPartnerBalancedItems(primaryItems, fallbackItems, count, targetPartnerCount, seed, pick);
}

function pickGrid8ItemsWithPartnerQuota(
  primaryItems: GuideItem[],
  fallbackItems: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
  partnerCap = DEFAULT_PARTNER_TARGET_PER_PAGE,
): GuideItem[] {
  const primaryPartnerCount = dedupeItems(primaryItems).filter((i) => i.isPartner).length;
  const targetPartnerCount = partnerTargetCount(count, primaryPartnerCount, partnerCap);
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
    const preferredPool = preferDisplayReadyItems(slot.preferredItems, 1);
    const fallbackPool = remainingItems(preferDisplayReadyItems(slot.fallbackItems, 1), preferredPool);
    const pool = dedupeItems([...preferredPool, ...fallbackPool]);
    const partnerPool = dedupeItems([
      ...preferredPool.filter((item) => item.isPartner),
      ...(slot.allowFallbackPartner === false ? [] : fallbackPool.filter((item) => item.isPartner)),
    ]);
    let selected = (partnerFirstActive() || partnerCount < DEFAULT_PARTNER_TARGET_PER_PAGE) && partnerPool.length > 0
      ? pickWithUsedFallback(partnerPool, 1, `${slot.seed}-partner`, pick)[0]
      : undefined;
    if (!selected) {
      selected = pickSingleContextualItem(preferredPool, fallbackPool, slot.seed, pick)[0];
    }
    selected ??= sortCandidates(pool, `${slot.seed}-fallback-any`)[0];
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
  const foodItems = preferOwnImageItems(itemsBySection.quan_an);
  const cafeItems = preferOwnImageItems(itemsBySection.cafe);
  const stayItems = preferOwnImageItems(itemsBySection.homestay);
  const checkinItems = preferOwnImageItems(itemsBySection.check_in);
  const serviceItems = preferOwnImageItems(itemsBySection.dich_vu);
  const nightlifeItems = preferOwnImageItems(itemsBySection.choi_dem);
  const nightlifeImageItems = dedupeItems([...foodItems, ...cafeItems, ...serviceItems, ...nightlifeItems].filter(isImageBackedNightlifeItem));
  const activityItems = preferOwnImageItems(itemsBySection.hoat_dong);
  const historyItems = preferOwnImageItems(itemsBySection.dia_diem_lich_su);
  const tourismItems = preferOwnImageItems(itemsBySection.khu_du_lich);
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
  const breakfastItems = morningFoodItems;
  const lunchItems = buildLunchFoodItems(daytimeFoodItems);
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
    foodItems, cafeItems, stayItems, checkinItems, serviceItems, nightlifeItems, nightlifeImageItems, activityItems, historyItems, tourismItems,
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
    ...pools.checkinItems, ...pools.serviceItems, ...pools.nightlifeItems, ...pools.activityItems, ...pools.historyItems, ...pools.tourismItems,
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
  // Người dùng đã quyết định bỏ hẳn mô tả (body) khỏi trang cover — không còn fallback
  // text mặc định nữa, body rỗng (hoặc bị lọc vì lộ tên địa điểm) thì để rỗng thật sự.
  const clean = String(body || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  const placeNames = collectPagePlaceNames(pages);
  if (hasPagePlaceName(clean, placeNames) || looksLikeStopList(clean) || looksLocationSpecific(clean)) {
    return '';
  }

  return clean.slice(0, 250);
}

export function applyCaptionToPages(pages: DeckPage[], caption: { coverTitle?: string; headline: string; body: string }): DeckPage[] {
  const safeBody = sanitizeCaptionBodyForPages(caption.body, pages);
  const coverTitle = String(caption.coverTitle ?? '').trim();
  return pages.map((page) => {
    if (page.type === 'cover') {
      // Spotlight V3: title lấy từ Google Doc hook — không ghi đè bằng caption AI.
      if (page.layoutVariant === 'spotlight-v3' || page.layoutVariant === 'carousel-mau-1-cover') {
        return { ...page, subtitle: '' };
      }
      const subtitle = page.layoutVariant === 'spotlight-v2'
        ? spotlightV2CoverSubtitleFromCaption({ headline: caption.headline, body: safeBody })
        : page.layoutVariant === 'grid-8-feed'
          ? grid8FeedCoverSubtitleFromCaption({ headline: caption.headline, body: safeBody })
          : page.layoutVariant === 'grid-8' || page.layoutVariant === 'journey-4n2d-grid8'
            ? grid8CoverSubtitleFromCaption({ headline: caption.headline, body: safeBody })
            : coverSubtitleFromCaption(safeBody);
      return {
        ...page,
        title: sanitizeDeckHeadline(coverTitle || caption.headline || page.title),
        subtitle,
      };
    }
    return page;
  });
}

// ─── Individual deck page builders ───────────────────────────────────────────

function lowBudgetPriceForItem(item: GuideItem): string {
  if (item.sectionKey === 'cafe') return '~30k';
  if (item.sectionKey === 'quan_an') return isMorningFoodItem(item) ? '~30k' : '~50k';
  if (item.sectionKey === 'check_in') return '~20k';
  if (item.sectionKey === 'choi_dem') return '~40k';
  if (item.sectionKey === 'hoat_dong' || item.sectionKey === 'khu_du_lich' || item.sectionKey === 'dia_diem_lich_su') return '~50k';
  if (item.sectionKey === 'homestay') return '~500k';
  if (item.sectionKey === 'dich_vu') return '~80k';
  return '~30k';
}

type BudgetVndRange = { min: number; max: number };

function budgetTableCostOnly(raw: string): string {
  let text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  text = text
    .replace(/(?:Khung giờ|Open|Hoạt động):\s*[^·]+(?:\s*·\s*)?/gi, '')
    .replace(/^Giá:\s*/i, '')
    .trim();
  const inlinePrice = text.match(/Giá:\s*([^·]+)/i);
  if (inlinePrice) return inlinePrice[1].trim();
  const segments = text.split('·').map((part) => part.trim()).filter(Boolean);
  if (segments.length > 1) {
    const priceSegment = segments.find((part) => /~?\d/.test(part) && /(?:k|tr|đ\b)/i.test(part));
    if (priceSegment) return priceSegment.replace(/^Giá:\s*/i, '').trim();
  }
  return text.replace(/^·\s*/, '').trim();
}

function parseBudgetVndNumber(raw: string): number {
  const normalized = String(raw || '').trim().replace(',', '.');
  if (!normalized) return 0;
  if (normalized.includes('.') && normalized.split('.')[1]?.length === 3) {
    return Number(normalized.replace('.', '')) || 0;
  }
  return Number(normalized) || 0;
}

function parseBudgetVndCost(raw: string): BudgetVndRange {
  const cleaned = budgetTableCostOnly(raw).toLowerCase();
  if (!cleaned || /đã tính|miễn phí|free|^0\s*đ?$/.test(cleaned)) {
    return { min: 0, max: 0 };
  }

  const trRange = cleaned.match(/([\d.,]+)\s*tr\s*-\s*([\d.,]+)\s*tr/);
  if (trRange) {
    return {
      min: parseBudgetVndNumber(trRange[1]) * 1_000_000,
      max: parseBudgetVndNumber(trRange[2]) * 1_000_000,
    };
  }

  const singleTr = cleaned.match(/~?\s*([\d.,]+)\s*tr/);
  if (singleTr) {
    const value = parseBudgetVndNumber(singleTr[1]) * 1_000_000;
    return { min: value, max: value };
  }

  const kRange = cleaned.match(/([\d.,]+)\s*k\s*-\s*([\d.,]+)\s*k/);
  if (kRange) {
    return {
      min: parseBudgetVndNumber(kRange[1]) * 1_000,
      max: parseBudgetVndNumber(kRange[2]) * 1_000,
    };
  }

  const singleK = cleaned.match(/~?\s*([\d.,]+)\s*k/);
  if (singleK) {
    const value = parseBudgetVndNumber(singleK[1]) * 1_000;
    return { min: value, max: value };
  }

  const plainVnd = cleaned.match(/([\d.,]+)\s*(?:đ|vnd|vnđ)/);
  if (plainVnd) {
    const value = parseBudgetVndNumber(plainVnd[1]);
    return { min: value, max: value };
  }

  return { min: 0, max: 0 };
}

function addBudgetVndRanges(left: BudgetVndRange, right: BudgetVndRange): BudgetVndRange {
  return { min: left.min + right.min, max: left.max + right.max };
}

function formatBudgetVndSingle(vnd: number): string {
  if (vnd <= 0) return '';
  if (vnd >= 1_000_000) {
    const tr = vnd / 1_000_000;
    const rounded = Math.round(tr * 10) / 10;
    return `~${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}tr`;
  }
  return `~${Math.round(vnd / 1000)}k`;
}

function formatBudgetVndRange(range: BudgetVndRange): string {
  if (range.min <= 0 && range.max <= 0) return '';
  if (range.min === range.max) return formatBudgetVndSingle(range.min);
  if (Math.abs(range.max - range.min) <= Math.max(range.min, range.max) * 0.08) {
    return formatBudgetVndSingle(Math.round((range.min + range.max) / 2));
  }
  return `${formatBudgetVndSingle(range.min)} - ${formatBudgetVndSingle(range.max)}`;
}

type BudgetTableCostMode = 'default' | 'head-price-then-free';

function formatBudgetTableHeadPrice(raw: string): string {
  const cleaned = budgetTableCostOnly(raw);
  if (!cleaned || isFreePrice(cleaned) || /^0\s*đ?$/i.test(cleaned)) return '';
  if (/(?:đ|vnd|vnđ)/i.test(cleaned)) return cleaned;
  const digits = cleaned.replace(/[^\d.,]/g, '');
  const vnd = parseBudgetVndNumber(digits);
  if (vnd <= 0) return cleaned;
  return `${vnd.toLocaleString('vi-VN')} đ`;
}

function budgetTableCost(
  item: GuideItem,
  fallbackPrice?: string,
  mode: BudgetTableCostMode = 'default',
): string {
  const headPrice = formatBudgetTableHeadPrice(String(item.headPrice || ''));
  const hasHeadPrice = Boolean(headPrice);

  const cleanPrice = budgetTableCostOnly(String(item.price || ''));
  const hasPrice = Boolean(cleanPrice && !isFreePrice(cleanPrice) && !/^0\s*đ?$/i.test(cleanPrice));

  if (mode === 'head-price-then-free') {
    if (hasHeadPrice) return headPrice;
    if (item.hasHeadPriceColumn) return 'Free';
    if (hasPrice) return cleanPrice;
    return 'Free';
  }

  if (hasHeadPrice) return headPrice;
  if (item.isPartner && cleanPrice) return cleanPrice;
  if (hasPrice) return cleanPrice;
  if (item.sectionKey === 'check_in' || isFreeCheckinItem(item)) return 'Free';
  return fallbackPrice || lowBudgetPriceForItem(item);
}

function budgetRowIsTransport(row: BudgetScheduleRow): boolean {
  const text = normalizeText(`${row.activity} ${row.address} ${row.cost}`);
  return text.includes('di_chuyen')
    || text.includes('xe_phuong_trang')
    || text.includes('ben_xe')
    || text.includes('check_out')
    || text.includes('len_xe_ve');
}

function budgetSummaryItemsFromRows(
  rows: BudgetScheduleRow[],
  pools: DeckBuildPools,
  seedPrefix: string,
  tableFallbackImage: string,
  costMode: BudgetTableCostMode = 'default',
): PageItem[] {
  let foodRange: BudgetVndRange = { min: 0, max: 0 };
  let transportRange: BudgetVndRange = { min: 0, max: 0 };

  rows.forEach((row) => {
    const costRange = parseBudgetVndCost(row.cost);
    if (budgetRowIsTransport(row)) {
      transportRange = addBudgetVndRanges(transportRange, costRange);
      return;
    }
    foodRange = addBudgetVndRanges(foodRange, costRange);
  });

  const stayItem = pools.stayItems[0];
  const hotelRange = parseBudgetVndCost(stayItem ? budgetTableCost(stayItem, '~500k', costMode) : '~500k');
  const bikeItem = pools.serviceItems.find((item) => /thue_xe|thue xe|xe_may|xe may/.test(normalizeText(`${item.type} ${item.name}`)));
  const bikeRange = parseBudgetVndCost(bikeItem ? budgetTableCost(bikeItem, '~150k', costMode) : '~150k');
  const hotelFormatted = formatBudgetVndRange(hotelRange) || '~500k';
  const bikeFormatted = formatBudgetVndRange(bikeRange) || '~150k';
  const foodFormatted = formatBudgetVndRange(foodRange) || '~0k';
  const transportFormatted = formatBudgetVndRange(transportRange) || '~540k';
  const totalRange = addBudgetVndRanges(
    addBudgetVndRanges(parseBudgetVndCost(hotelFormatted), parseBudgetVndCost(bikeFormatted)),
    addBudgetVndRanges(parseBudgetVndCost(foodFormatted), parseBudgetVndCost(transportFormatted)),
  );
  const totalFormatted = formatBudgetVndRange(totalRange) || '~0k';

  return [
    budgetSummaryPageItem('Khách sạn', hotelFormatted, '1 đêm phòng đôi/nhóm nhỏ', `${seedPrefix}-summary-stay`, tableFallbackImage),
    budgetSummaryPageItem('Thuê xe', bikeFormatted, 'Xe máy 1 ngày rưỡi', `${seedPrefix}-summary-bike`, tableFallbackImage),
    budgetSummaryPageItem('Quán ăn', foodFormatted, 'Các bữa chính, cafe, ăn vặt', `${seedPrefix}-summary-food`, tableFallbackImage),
    budgetSummaryPageItem('Di chuyển', transportFormatted, 'Xe khách khứ hồi', `${seedPrefix}-summary-bus`, tableFallbackImage),
    budgetSummaryPageItem('Tổng cộng', totalFormatted, 'Tổng các khoản trên', `${seedPrefix}-summary-total`, tableFallbackImage),
  ];
}

function budgetDisplayPrice(item: GuideItem, fallbackPrice?: string): string {
  return budgetTableCost(item, fallbackPrice);
}

function budgetDisplayHours(item: GuideItem): string {
  const cleanHours = String(item.openHours || '').replace(/\s+/g, ' ').trim();
  return cleanHours ? `Khung giờ: ${cleanHours}` : '';
}

type BudgetScheduleRow = {
  day: string;
  time: string;
  activity: string;
  address: string;
  cost: string;
  item?: GuideItem;
  id: string;
};

function budgetActivityName(prefix: string, item: GuideItem): string {
  return `${prefix}: ${item.name}`.replace(/\s+/g, ' ').trim();
}

function createBudgetStaticRow(day: string, time: string, activity: string, address: string, cost: string, id: string): BudgetScheduleRow {
  return { day, time, activity, address, cost, id };
}

function budgetRowPageItem(
  row: BudgetScheduleRow,
  _resolveImage: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
  fallbackImageUrl = '',
): PageItem {
  // Bảng chi phí không hiển thị ảnh từng dòng — bỏ qua resolver để giữ pool ảnh cho gallery.
  const resolvedImage = { imageUrl: '', imageMapped: false, imageSource: 'fallback' as const, imageNote: '', candidateImageUrls: [] as string[] };
  return {
    label: `${row.day}|${row.time}`,
    id: row.item?.id || row.id,
    sourceKey: row.item ? itemUsageKey(row.item) : row.id,
    sourceSectionKey: row.item?.sectionKey,
    name: row.activity,
    metaPrimary: row.address,
    metaSecondary: row.cost,
    imageUrl: resolvedImage.imageUrl,
    imageMapped: resolvedImage.imageMapped,
    imageSource: resolvedImage.imageSource,
    imageNote: resolvedImage.imageNote,
    candidateImageUrls: resolvedImage.candidateImageUrls,
    isPartner: row.item?.isPartner,
    rawName: row.item?.name || row.activity,
  };
}

function budgetSummaryPageItem(label: string, amount: string, detail: string, id: string, fallbackImageUrl = ''): PageItem {
  return {
    label: `Tổng|${label}`,
    id,
    sourceKey: id,
    name: label,
    metaPrimary: detail,
    metaSecondary: amount,
    imageUrl: fallbackImageUrl,
    imageMapped: false,
    imageSource: 'fallback',
    imageNote: '',
    candidateImageUrls: fallbackImageUrl ? [fallbackImageUrl] : [],
    rawName: label,
  };
}

function withoutBudgetTableImages(items: PageItem[]): PageItem[] {
  return items.map((item) => ({
    ...item,
    imageUrl: '',
    imageMapped: false,
    imageSource: 'fallback',
    imageNote: '',
    candidateImageUrls: [],
  }));
}

function budgetGalleryPageItemWithResolver(
  item: GuideItem,
  label: string,
  resolveImage: ResolveListImageFn,
): PageItem {
  const resolvedImage = resolveImage(item);
  return {
    label,
    id: item.id,
    sourceKey: itemUsageKey(item),
    sourceSectionKey: item.sectionKey,
    name: item.name,
    metaPrimary: item.address || 'Đang cập nhật địa chỉ',
    metaSecondary: budgetDisplayHours(item),
    imageUrl: resolvedImage.imageUrl,
    imageMapped: resolvedImage.imageMapped,
    imageSource: resolvedImage.imageSource,
    imageNote: resolvedImage.imageNote,
    candidateImageUrls: resolvedImage.candidateImageUrls,
    isPartner: item.isPartner,
    rawName: item.name,
  };
}

function pickBudgetSlotItem(
  preferredItems: GuideItem[],
  fallbackItems: GuideItem[],
  seed: string,
  pick: PickFn,
  selectedKeys: Set<string>,
  preferPartner = true,
): GuideItem | undefined {
  const pool = dedupeItems([...preferredItems, ...fallbackItems]).filter((item) => !hasItemKey(selectedKeys, item));
  if (pool.length === 0) return undefined;
  const partnerPool = preferPartner ? pool.filter((item) => item.isPartner) : [];
  const selected = partnerPool.length > 0
    ? pickWithUsedFallback(partnerPool, 1, `${seed}-partner`, pick)[0]
    : pickWithUsedFallback(pool, 1, `${seed}-any`, pick)[0];
  if (selected) markItemKey(selectedKeys, selected);
  return selected;
}

type ResolveListImageFn = (
  item: GuideItem,
  options?: { forceFallback?: boolean },
) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>;

function buildBudgetGalleryItems(
  selectedItems: GuideItem[],
  fallbackItems: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
  resolveImage: ResolveListImageFn,
  labelForItem: (item: GuideItem) => string,
): PageItem[] {
  const selectedKeys = new Set<string>();
  const chosen: GuideItem[] = [];
  const add = (item?: GuideItem) => {
    if (!item || chosen.length >= count || hasItemKey(selectedKeys, item)) return;
    chosen.push(item);
    markItemKey(selectedKeys, item);
  };

  sortCandidates(dedupeItems(selectedItems), `${seed}-selected`).forEach(add);
  pickWithUsedFallback(
    sortCandidates(dedupeItems(fallbackItems).filter((item) => item.isPartner), `${seed}-partners`),
    count - chosen.length,
    `${seed}-partner-fill`,
    pick,
  ).forEach(add);
  pickWithUsedFallback(
    sortCandidates(dedupeItems(fallbackItems).filter((item) => !item.isPartner), `${seed}-regular`),
    count - chosen.length,
    `${seed}-regular-fill`,
    pick,
  ).forEach(add);

  const pageUsedImageUrls = new Set<string>();
  return chosen.slice(0, count).map((item) => {
    let resolved = resolveImage(item);
    if (resolved.imageUrl && pageUsedImageUrls.has(resolved.imageUrl)) {
      const alternates = [
        ...(item.candidateImageUrls || []),
        item.imageUrl,
      ].filter((url): url is string => Boolean(url) && !pageUsedImageUrls.has(url));
      if (alternates.length > 0) {
        resolved = {
          ...resolved,
          imageUrl: alternates[0],
          imageMapped: true,
          imageSource: resolved.imageSource === 'manual' ? 'manual' : 'auto',
        };
      } else {
        resolved = resolveImage(item, { forceFallback: true });
      }
    }
    if (resolved.imageUrl) pageUsedImageUrls.add(resolved.imageUrl);
    return budgetGalleryPageItemWithResolver(item, labelForItem(item), () => resolved);
  });
}

type Budget3N2DBuildOptions = {
  costMode?: BudgetTableCostMode;
};

function buildBudget3N2DPages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
  coverImageUrls: string[] = [],
  options: Budget3N2DBuildOptions = {},
): DeckPage[] {
  const costMode = options.costMode ?? 'default';
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:budget-3n2d`, mappedImageUrls, globalUsedImageUrls || [], { orientation: 'any', strictMapping: true });
  const background = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const selectedKeys = new Set<string>();
  const selectedGuideItems: GuideItem[] = [];
  const rows: BudgetScheduleRow[] = [];
  const activitySlot = itineraryActivitySlotPool(pools, seedPrefix);
  const breakfastItems = pools.morningFoodItems.length > 0 ? pools.morningFoodItems : pools.breakfastItems;
  const lunchItems = pools.lunchItems;
  const dinnerItems = pools.eveningScheduleItems.length > 0 ? pools.eveningScheduleItems : pools.dinnerItems;
  const checkinItems = balancedCheckinPool(pools.dayCheckinItems.length > 0 ? pools.dayCheckinItems : pools.checkinItems, 16, `${seedPrefix}-budget-checkin-pool`);

  const addPickedRow = (day: string, time: string, prefix: string, preferredItems: GuideItem[], fallbackItems: GuideItem[], seed: string, fallbackPrice?: string) => {
    const item = pickBudgetSlotItem(preferredItems, fallbackItems, seed, pick, selectedKeys);
    if (!item) return;
    selectedGuideItems.push(item);
    rows.push({
      day,
      time,
      activity: budgetActivityName(prefix, item),
      address: item.address || 'Đang cập nhật',
      cost: budgetTableCost(item, fallbackPrice, costMode),
      item,
      id: `${seed}-${item.id}`,
    });
  };

  const copy = getMarketingCopy();
  rows.push(createBudgetStaticRow('Ngày 01', '05:00', copy.budgetBusInActivity, copy.budgetBusInAddress, copy.budgetBusInCost, `${seedPrefix}-bus-in`));
  addPickedRow('Ngày 01', '07:00', 'Ăn sáng', breakfastItems, breakfastItems, `${seedPrefix}-d1-breakfast`, '~30k');
  addPickedRow('Ngày 01', '09:00', 'Cà phê', pools.dayCafeItems, pools.cafeItems, `${seedPrefix}-d1-cafe`, '~30k');
  addPickedRow('Ngày 01', '10:30', 'Check-in', checkinItems, pools.checkinItems, `${seedPrefix}-d1-checkin`);
  addPickedRow('Ngày 01', '12:00', 'Ăn trưa', lunchItems, pools.foodItems, `${seedPrefix}-d1-lunch`, '~50k');
  addPickedRow('Ngày 01', '15:00', activitySlot.label, activitySlot.items, pools.dayFamousItems, `${seedPrefix}-d1-activity`, '~50k');
  addPickedRow('Ngày 01', '18:30', 'Ăn tối', dinnerItems, pools.foodItems, `${seedPrefix}-d1-dinner`, '~120k');
  addPickedRow('Ngày 01', '20:00', 'Chơi đêm', pools.nightlifeItems, pools.nightlifeImageItems, `${seedPrefix}-d1-night`, '~40k');
  addPickedRow('Ngày 02', '07:30', 'Ăn sáng', breakfastItems, breakfastItems, `${seedPrefix}-d2-breakfast`, '~30k');
  addPickedRow('Ngày 02', '09:00', 'Cà phê', pools.dayCafeItems, pools.cafeItems, `${seedPrefix}-d2-cafe`, '~30k');
  addPickedRow('Ngày 02', '10:30', 'Check-in', checkinItems, pools.checkinItems, `${seedPrefix}-d2-checkin`);
  addPickedRow('Ngày 02', '12:00', 'Ăn trưa', lunchItems, pools.foodItems, `${seedPrefix}-d2-lunch`, '~60k');
  addPickedRow('Ngày 02', '15:00', activitySlot.label, activitySlot.items, pools.dayFamousItems, `${seedPrefix}-d2-activity`, '~70k');
  addPickedRow('Ngày 02', '17:00', 'Cà phê chiều', pools.dayCafeItems, pools.cafeItems, `${seedPrefix}-d2-cafe-2`, '~35k');
  addPickedRow('Ngày 02', '18:30', 'Ăn tối', dinnerItems, pools.foodItems, `${seedPrefix}-d2-dinner`, '~120k');
  addPickedRow('Ngày 02', '20:30', 'Chơi đêm', pools.nightlifeItems, pools.nightlifeImageItems, `${seedPrefix}-d2-night`, '~40k');
  addPickedRow('Ngày 03', '07:00', 'Ăn sáng', breakfastItems, breakfastItems, `${seedPrefix}-d3-breakfast`, '~30k');
  addPickedRow('Ngày 03', '08:30', 'Cà phê', pools.dayCafeItems, pools.cafeItems, `${seedPrefix}-d3-cafe`, '~30k');
  addPickedRow('Ngày 03', '10:00', 'Check-in', checkinItems, pools.checkinItems, `${seedPrefix}-d3-checkin`);
  addPickedRow('Ngày 03', '11:30', 'Ăn trưa', lunchItems, pools.foodItems, `${seedPrefix}-d3-lunch`, '~70k');
  addPickedRow('Ngày 03', '13:00', 'Mua quà', pools.serviceItems, pools.serviceItems, `${seedPrefix}-d3-service`, '~80k');
  rows.push(createBudgetStaticRow('Ngày 03', '14:30', copy.budgetBusOutActivity, copy.budgetBusOutAddress, 'Đã tính vé xe', `${seedPrefix}-bus-out`));

  const tableFallbackImage = background(`${seedPrefix}-table-fallback`);
  const summaryItems = budgetSummaryItemsFromRows(rows, pools, seedPrefix, tableFallbackImage, costMode);
  const tableItems = withoutBudgetTableImages([
    ...rows.map((row) => budgetRowPageItem(row, imageResolver, tableFallbackImage)),
    ...summaryItems,
  ]);

  const selectedFood = selectedGuideItems.filter((item) => item.sectionKey === 'quan_an');
  const selectedCafe = selectedGuideItems.filter((item) => item.sectionKey === 'cafe');
  const selectedSupport = selectedGuideItems.filter((item) => item.sectionKey === 'dich_vu');
  const supportPlaces = dedupeItems([...selectedSupport, ...pools.serviceItems, ...pools.stayItems]);
  const partnerPlaces = supportPlaces;

  const pages: DeckPage[] = [
    {
      ...buildCoverPage(copy.budgetCoverTitle, '/Gợi ý lịch trình du hí 3N2Đ/', background(`${seedPrefix}-cover`)),
      layoutVariant: 'budget-3n2d' as const,
    },
    buildListPage('Bảng chi phí', 'gold', copy.budgetTableTitle, 'Bảng lịch trình dày thông tin: giờ đi, điểm ghé, địa chỉ và chi phí dự kiến.', tableItems, '', 'budget-3n2d-table'),
    buildListPage('Quán ăn', 'berry', 'QUÁN ĂN ĐÃ ĐI', '4 quán trong lịch trình, ưu tiên quán là đối tác để người xem dễ lưu và ghé đúng chỗ.', buildBudgetGalleryItems(selectedFood, pools.foodItems, 4, `${seedPrefix}-gallery-food`, pick, imageResolver, mealLabelForItem), background(`${seedPrefix}-gallery-food-bg`), 'grid-4'),
    buildListPage('Cà phê', 'gold', 'QUÁN CAFE ĐÃ GHÉ', '4 điểm cafe trong lịch trình, ưu tiên đối tác và điểm có đủ ảnh, địa chỉ, giá.', buildBudgetGalleryItems(selectedCafe, pools.cafeItems, 4, `${seedPrefix}-gallery-cafe`, pick, imageResolver, (item) => item.type || 'Cafe'), background(`${seedPrefix}-gallery-cafe-bg`), 'grid-4'),
    buildListPage('Đối tác', 'pine', 'ĐỐI TÁC NÊN LƯU', '4 địa điểm ưu tiên đối tác trong chuyến đi, giữ đúng giá nếu dữ liệu đối tác đã có giá.', buildBudgetGalleryItems(selectedSupport, partnerPlaces, 4, `${seedPrefix}-gallery-partners`, pick, imageResolver, photomodeServiceLabel), background(`${seedPrefix}-gallery-partners-bg`), 'grid-4'),
  ];

  const foodPage = pages[2];
  if (foodPage?.type === 'list') {
    foodPage.title = 'QUÁN ĂN NÈ';
    foodPage.subtitle = 'Một vài quán ăn dễ ghé trong lịch trình, ưu tiên điểm có giá rõ để lưu nhanh.';
  }

  const cafePage = pages[3];
  if (cafePage?.type === 'list') {
    cafePage.title = 'QUÁN CÀ PHÊ VIEW ĐẸP';
    cafePage.subtitle = 'Một vài quán cà phê có view ổn, hợp nghỉ chân và chụp vài tấm xinh.';
  }

  const supportPage = pages[4];
  if (supportPage?.type === 'list') {
    supportPage.chipText = 'Dịch vụ';
    supportPage.title = 'DỊCH VỤ NÊN LƯU';
    supportPage.subtitle = 'Một số dịch vụ hỗ trợ chuyến đi, ưu tiên đối tác và giữ đúng giá nếu dữ liệu đã có giá.';
    supportPage.items = buildBudgetGalleryItems(selectedSupport, supportPlaces, 4, `${seedPrefix}-gallery-services`, pick, imageResolver, photomodeServiceLabel);
    supportPage.backgroundImage = background(`${seedPrefix}-gallery-services-bg`);
  }

  return pages.map((page, pageIndex) => (
    page.type === 'list' && pageIndex >= 2
      ? { ...page, layoutVariant: 'budget-3n2d-gallery' as const }
      : page
  ));
}

export function buildBudget72HSummaryPages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
  coverImageUrls: string[] = [],
): DeckPage[] {
  return buildBudget3N2DPages(
    pools,
    imageUrls,
    libraryEntries,
    seedPrefix,
    globalUsedItemIds,
    globalUsedImageUrls,
    coverImageUrls,
    { costMode: 'head-price-then-free' },
  ).slice(0, 2);
}

const BUDGET_STORY_FILLER_TIMES = ['15:30', '16:30', '17:30', '19:00'];

function budgetStoryItemKey(item: PageItem): string {
  return normalizeText(item.sourceKey || item.rawName || item.name || item.id || '');
}

function budgetStoryFillerLabel(page: ListPage, item?: PageItem): string {
  if (item?.sourceSectionKey === 'cafe') return 'Cafe';
  if (item?.sourceSectionKey === 'dich_vu') return 'D\u1ecbch v\u1ee5';
  if (item?.sourceSectionKey === 'homestay') return 'L\u01b0u tr\u00fa';
  if (item?.sourceSectionKey === 'quan_an') return '\u0102n nh\u1eb9';
  if (item?.sourceSectionKey === 'check_in') return 'Check-in';
  const pageText = normalizeText(`${page.chipText || ''} ${page.title || ''}`);
  if (pageText.includes('cafe') || pageText.includes('ca_phe')) return 'Cafe';
  if (pageText.includes('dich_vu') || pageText.includes('doi_tac')) return 'Mua qu\u00e0';
  if (pageText.includes('quan_an') || pageText.includes('an')) return '\u0102n nh\u1eb9';
  return '\u0110i\u1ec3m gh\u00e9';
}

function budgetStoryFillerRows(galleryPages: ListPage[], dayLabel: string): PageItem[] {
  return galleryPages.flatMap((page, pageIndex) => {
    return (page.items || [])
      .filter((item) => item.sourceSectionKey !== 'choi_dem')
      .map((item, itemIndex) => ({
      ...item,
      id: `${item.id || item.sourceKey || item.rawName || item.name}-story-fill-${pageIndex}-${itemIndex}`,
      label: `${dayLabel}|${BUDGET_STORY_FILLER_TIMES[itemIndex % BUDGET_STORY_FILLER_TIMES.length]}`,
      name: `${budgetStoryFillerLabel(page, item)}: ${item.rawName || item.name}`,
    }));
  });
}

function budgetStoryRowsForDay(items: PageItem[], dayLabel: string, fillerItems: PageItem[] = [], blockedItems: PageItem[] = []): PageItem[] {
  const dayNumber = dayLabel.match(/\d{2}/)?.[0] || '';
  const rows = (items || [])
    .filter((item) => {
      const label = String(item.label || '');
      return label.startsWith(`${dayLabel}|`) || Boolean(dayNumber && label.includes(`${dayNumber}|`));
    })
    .slice(0, 8);
  if (rows.length >= 8) return rows;

  const usedKeys = new Set([...rows, ...blockedItems].map(budgetStoryItemKey).filter(Boolean));
  const additions: PageItem[] = [];
  for (const item of fillerItems) {
    const key = budgetStoryItemKey(item);
    if (!key || usedKeys.has(key)) continue;
    usedKeys.add(key);
    additions.push({
      ...item,
      label: `${dayLabel}|${BUDGET_STORY_FILLER_TIMES[additions.length % BUDGET_STORY_FILLER_TIMES.length]}`,
    });
    if (rows.length + additions.length >= 8) break;
  }

  return [...rows, ...additions].slice(0, 8);
}

function budgetStoryTotalItems(items: PageItem[]): PageItem[] {
  const summaryItems = (items || []).filter((item) => String(item.id || '').includes('-summary-'));
  if (summaryItems.length) return summaryItems.slice(0, 5);

  return (items || [])
    .filter((item) => String(item.label || '').includes('|') && !/^Ng/.test(String(item.label || '')))
    .slice(0, 5);
}

function cloneBudgetStoryPage(page: DeckPage): DeckPage {
  return {
    ...page,
    ...(page.type === 'list' ? { items: page.items.map((item) => ({ ...item })) } : {}),
  } as DeckPage;
}

function buildBudget3N2DStoryPages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
  coverImageUrls: string[] = [],
): DeckPage[] {
  const basePages = buildBudget3N2DPages(pools, imageUrls, libraryEntries, `${seedPrefix}-story-source`, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  const coverPage = cloneBudgetStoryPage(basePages[0]) as CoverPage;
  const tablePage = basePages.find((page) => page.type === 'list' && page.layoutVariant === 'budget-3n2d-table') as ListPage | undefined;
  const galleryPages = basePages
    .filter((page) => page.type === 'list' && page.layoutVariant === 'budget-3n2d-gallery')
    .map((page) => cloneBudgetStoryPage(page)) as ListPage[];

  if (coverPage.type === 'cover') {
    coverPage.layoutVariant = 'budget-3n2d-story';
    coverPage.title = getMarketingCopy().budgetCoverTitle;
    // Bỏ hẳn mô tả trang bìa (đồng bộ với budget-3n2d/budget-72h-summary) — không dùng
    // coverSubtitle tĩnh nữa, tránh bị lộ ra khi caption.body rỗng.
    coverPage.subtitle = '';
  }

  const scheduleItems = tablePage?.items || [];
  const storyFillerItems = budgetStoryFillerRows(galleryPages, budget72StoryText.day3Chip);
  const dayPages: DeckPage[] = [
    buildListPage(budget72StoryText.day1Chip, 'gold', budget72StoryText.day1Title, budget72StoryText.day1Subtitle, budgetStoryRowsForDay(scheduleItems, budget72StoryText.day1Chip, storyFillerItems, scheduleItems), '', 'budget-3n2d-day'),
    buildListPage(budget72StoryText.day2Chip, 'pine', budget72StoryText.day2Title, budget72StoryText.day2Subtitle, budgetStoryRowsForDay(scheduleItems, budget72StoryText.day2Chip, storyFillerItems, scheduleItems), '', 'budget-3n2d-day'),
    buildListPage(budget72StoryText.day3Chip, 'berry', budget72StoryText.day3Title, budget72StoryText.day3Subtitle, budgetStoryRowsForDay(scheduleItems, budget72StoryText.day3Chip, storyFillerItems, scheduleItems), '', 'budget-3n2d-day'),
    buildListPage(budget72StoryText.totalChip, 'gold', budget72StoryText.totalTitle, budget72StoryText.totalSubtitle, budgetStoryTotalItems(scheduleItems), '', 'budget-3n2d-total'),
  ];

  return [
    coverPage,
    ...dayPages,
    ...galleryPages,
  ];
}

function buildItineraryPages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
  coverImageUrls: string[] = [],
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:itinerary`, mappedImageUrls, globalUsedImageUrls || [], { orientation: 'any', strictMapping: true });
  const background = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const coverBackground = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const displayItemCount = 8;
  const breakfastItems = pools.morningFoodItems;
  const lunchItems = pools.lunchItems;
  const checkinItems = balancedCheckinPool(
    pools.dayCheckinItems.length > 0 ? pools.dayCheckinItems : pools.checkinItems,
    12,
    `${seedPrefix}-it-checkin-pool`,
  );
  const activitySlot = itineraryActivitySlotPool(pools, seedPrefix);
  const activityItems = activitySlot.items;
  const dinnerItems = pools.eveningScheduleItems.length > 0 ? pools.eveningScheduleItems : pools.dinnerItems;
  const nightlifeScheduleItems = pageReadyNightlifeItems(pools.nightlifeItems);
  const servicePageSeed = `${seedPrefix}-it-service-page`;
  const homestayPageSeed = `${seedPrefix}-it-homestay-page`;
  const servicePageItems = ensureGuideItemCount(
    pickPhotomodeItemsWithQuota(pools.serviceItems, displayItemCount, servicePageSeed, pick),
    pools.serviceItems,
    displayItemCount,
    servicePageSeed,
  );
  const homestayPageItems = ensureGuideItemCount(
    pickPhotomodeItemsWithQuota(pools.stayItems, displayItemCount, homestayPageSeed, pick),
    pools.stayItems,
    displayItemCount,
    homestayPageSeed,
  );

  return [
    buildCoverPage(
      'Gợi ý lịch trình 3N2Đ',
      'Một bộ khung ngắn để đi Đà Lạt lần đầu mà vẫn có ăn sáng, cafe, check-in và chỗ chơi đáng lưu.',
      coverBackground(`${seedPrefix}-cover-itinerary`),
    ),
    buildListPage('Ngày 1', 'terracotta', 'Ngày 1 - tuyến trung tâm',
      'Một page gom đủ check-in sớm, ăn sáng, cafe, ăn trưa và ăn tối của ngày đầu.',
      pickItineraryPageItems([
        { time: '07:30', prefix: 'Ăn sáng:', preferredItems: breakfastItems, fallbackItems: breakfastItems, seed: `${seedPrefix}-it-day1-breakfast` },
        { time: '09:00', prefix: 'Cafe:', preferredItems: pools.dayCafeItems, fallbackItems: pools.dayCafeItems, seed: `${seedPrefix}-it-day1-cafe` },
        { time: '10:30', prefix: 'Check-in:', preferredItems: checkinItems, fallbackItems: checkinItems, seed: `${seedPrefix}-it-day1-checkin` },
        { time: '12:00', prefix: 'Ăn trưa:', preferredItems: lunchItems, fallbackItems: lunchItems, seed: `${seedPrefix}-it-day1-lunch` },
        { time: '15:00', prefix: activitySlot.prefix, preferredItems: activityItems, fallbackItems: activityItems, seed: `${seedPrefix}-it-day1-activity` },
        { time: '18:30', prefix: 'Ăn tối:', preferredItems: dinnerItems, fallbackItems: dinnerItems, seed: `${seedPrefix}-it-day1-dinner` },
        { time: '20:30', prefix: 'Chơi đêm:', preferredItems: nightlifeScheduleItems, fallbackItems: nightlifeScheduleItems, seed: `${seedPrefix}-it-day1-nightlife` },
      ], pick, imageResolver),
      background(`${seedPrefix}-it-day1`), 'itinerary',
    ),
    buildListPage('Ngày 2', 'pine', 'Ngày 2 - săn ảnh và đi chơi',
      'Tuyến ngày hai ưu tiên cảnh đẹp, cafe nghỉ chân, ăn trưa, check-in và ăn tối.',
      pickItineraryPageItems([
        { time: '07:30', prefix: 'Ăn sáng:', preferredItems: breakfastItems, fallbackItems: breakfastItems, seed: `${seedPrefix}-it-day2-breakfast` },
        { time: '09:00', prefix: 'Cafe:', preferredItems: pools.dayCafeItems, fallbackItems: pools.dayCafeItems, seed: `${seedPrefix}-it-day2-cafe` },
        { time: '10:30', prefix: 'Check-in:', preferredItems: checkinItems, fallbackItems: checkinItems, seed: `${seedPrefix}-it-day2-checkin` },
        { time: '12:00', prefix: 'Ăn trưa:', preferredItems: lunchItems, fallbackItems: lunchItems, seed: `${seedPrefix}-it-day2-lunch` },
        { time: '15:00', prefix: activitySlot.prefix, preferredItems: activityItems, fallbackItems: activityItems, seed: `${seedPrefix}-it-day2-activity` },
        { time: '18:30', prefix: 'Ăn tối:', preferredItems: dinnerItems, fallbackItems: dinnerItems, seed: `${seedPrefix}-it-day2-dinner` },
        { time: '20:30', prefix: 'Chơi đêm:', preferredItems: nightlifeScheduleItems, fallbackItems: nightlifeScheduleItems, seed: `${seedPrefix}-it-day2-nightlife` },
      ], pick, imageResolver),
      background(`${seedPrefix}-it-day2`), 'itinerary',
    ),
    buildListPage('Ngày 3', 'gold', 'Ngày 3 - chill nhẹ rồi mua quà',
      'Ngày cuối giữ nhịp nhẹ: ăn sáng, cafe, điểm ghé, ăn trưa, check-in và ăn tối.',
      pickItineraryPageItems([
        { time: '07:30', prefix: 'Ăn sáng:', preferredItems: breakfastItems, fallbackItems: breakfastItems, seed: `${seedPrefix}-it-day3-breakfast` },
        { time: '09:00', prefix: 'Cafe:', preferredItems: pools.dayCafeItems, fallbackItems: pools.dayCafeItems, seed: `${seedPrefix}-it-day3-cafe` },
        { time: '10:30', prefix: 'Check-in:', preferredItems: checkinItems, fallbackItems: checkinItems, seed: `${seedPrefix}-it-day3-checkin` },
        { time: '12:00', prefix: 'Ăn trưa:', preferredItems: lunchItems, fallbackItems: lunchItems, seed: `${seedPrefix}-it-day3-lunch` },
        { time: '15:00', prefix: activitySlot.prefix, preferredItems: activityItems, fallbackItems: activityItems, seed: `${seedPrefix}-it-day3-activity` },
        { time: '18:30', prefix: 'Ăn tối:', preferredItems: dinnerItems, fallbackItems: dinnerItems, seed: `${seedPrefix}-it-day3-dinner` },
        { time: '20:30', prefix: 'Chơi đêm:', preferredItems: nightlifeScheduleItems, fallbackItems: nightlifeScheduleItems, seed: `${seedPrefix}-it-day3-nightlife` },
      ], pick, imageResolver),
      background(`${seedPrefix}-it-day3`), 'itinerary',
    ),
    buildListPage('Dịch vụ', 'slate', 'Một số dịch vụ cần lưu ý cho bạn',
      'Trang này chỉ lấy nhóm dịch vụ như thuê xe, đặc sản, spa, thuê đồ và nhà xe để người xem lưu nhanh.',
      servicePageItems.map((item) => pageItemWithResolver(item, photomodeServiceLabel(item), imageResolver)),
      background(servicePageSeed), 'compact',
    ),
    buildListPage('Homestay', 'pine', 'Homestay nên lưu trước chuyến đi',
      'Các lựa chọn lưu trú được tách riêng để dễ chốt phòng, không trộn cùng dịch vụ khác.',
      homestayPageItems.map((item) => pageItemWithResolver(item, photomodeServiceLabel(item), imageResolver)),
      background(homestayPageSeed), 'compact',
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

    if ((partnerFirstActive() || partnerCount < DEFAULT_PARTNER_TARGET_PER_PAGE) && partnersInPool.length > 0) {
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
    if ((partnerFirstActive() || partnerCount < DEFAULT_PARTNER_TARGET_PER_PAGE) && partnersInPool.length > 0) {
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

type TimelineSlotDef = {
  time: string;
  activity: string;
  pool: GuideItem[];
};

/** Khung giờ bám ref @rongchoidalattala (ảnh Ngày 01–03 gốc). */
const TIMELINE_REF_DAY1_SLOTS: Omit<TimelineSlotDef, 'pool'>[] = [
  { time: '05:00', activity: 'Gửi đồ ở home ' },
  { time: '08:00', activity: 'Ăn sáng ở ' },
  { time: '10:00', activity: 'Cà phê ' },
  { time: '12:00', activity: 'Ăn trưa ' },
  { time: '15:00', activity: 'Đi chụp hình ở ' },
  { time: '18:00', activity: 'Ăn tối ở ' },
  { time: '20:00', activity: 'Dạo ' },
  { time: '21:00', activity: 'Uống cafe tại ' },
];

const TIMELINE_REF_DAY2_SLOTS: Omit<TimelineSlotDef, 'pool'>[] = [
  { time: '05:00', activity: 'Săn mây ' },
  { time: '09:00', activity: 'Ăn sáng ở ' },
  { time: '10:00', activity: 'Cafe ' },
  { time: '12:00', activity: 'Ăn trưa ' },
  { time: '15:00', activity: 'Đi chụp hình ở ' },
  { time: '18:30', activity: 'Ăn tối ở ' },
  { time: '21:00', activity: 'Check-in ' },
  { time: '22:00', activity: 'Về nghỉ ' },
];

const TIMELINE_REF_DAY3_SLOTS: Omit<TimelineSlotDef, 'pool'>[] = [
  { time: '05:00', activity: 'Đi ' },
  { time: '07:00', activity: 'Ăn sáng ở ' },
  { time: '08:30', activity: 'Đi Cafe ' },
  { time: '10:00', activity: 'Ăn vặt tại ' },
  { time: '11:00', activity: 'Ăn trưa ' },
  { time: '12:00', activity: 'Ăn ' },
  { time: '14:00', activity: 'Check-in ' },
  { time: '17:00', activity: 'Ghé ' },
];

function bindTimelineRefSlots(
  defs: Omit<TimelineSlotDef, 'pool'>[],
  pools: GuideItem[][],
): TimelineSlotDef[] {
  return defs.map((def, index) => ({
    ...def,
    pool: pools[index] || pools[pools.length - 1] || [],
  }));
}

function buildTimelineDayItems(
  slots: TimelineSlotDef[],
  fallbackItems: GuideItem[],
  seed: string,
  pick: PickFn,
  imageResolver: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
): PageItem[] {
  const slotPools = slots.map((slot) => slot.pool);
  const times = slots.map((slot) => slot.time);
  const items = pickTimedJourneyGridItems(slotPools, fallbackItems, seed, pick, imageResolver, times);
  return items.map((item, index) => {
    const slot = slots[index];
    const activity = String(slot?.activity || '').trim();
    const detail = String(item.metaSecondary || '').trim();
    const address = String(item.metaPrimary || '').trim();
    const note = String(item.imageNote || '').trim();
    const metaSecondary = activity && detail
      ? `${activity}${activity.endsWith(' ') ? '' : ' '}${detail}`
      : activity || detail;
    return {
      ...item,
      label: slot?.time || item.label,
      metaSecondary,
      metaPrimary: address,
      imageNote: note,
    };
  });
}

export function buildItineraryTimelinePages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
  coverImageUrls: string[] = [],
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(
    imageUrls,
    libraryEntries,
    `${seedPrefix}:itinerary-timeline`,
    mappedImageUrls,
    globalUsedImageUrls || [],
    { orientation: 'any', strictMapping: true },
  );
  const background = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const coverBackground = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const breakfastItems = pools.morningFoodItems.length > 0 ? pools.morningFoodItems : pools.breakfastItems;
  const lunchItems = pools.lunchItems;
  const dinnerItems = pools.eveningScheduleItems.length > 0 ? pools.eveningScheduleItems : pools.dinnerItems;
  const checkinItems = balancedCheckinPool(
    pools.dayCheckinItems.length > 0 ? pools.dayCheckinItems : pools.checkinItems,
    16,
    `${seedPrefix}-timeline-checkin`,
  );
  const cafeItems = pools.dayCafeItems.length > 0 ? pools.dayCafeItems : pools.cafeItems;
  const stayItems = pools.stayItems;
  const activitySlot = itineraryActivitySlotPool(pools, seedPrefix);
  const activityItems = activitySlot.items;
  const tourismItems = pools.dayTourismItems.length > 0 ? pools.dayTourismItems : pools.tourismItems;
  const nightlifeItems = pageReadyNightlifeItems(pools.nightlifeItems);
  const serviceItems = pools.serviceItems;
  const dayFallback = dedupeItems([
    ...breakfastItems,
    ...cafeItems,
    ...checkinItems,
    ...lunchItems,
    ...activityItems,
    ...dinnerItems,
    ...nightlifeItems,
    ...stayItems,
    ...serviceItems,
    ...tourismItems,
  ]);

  const timelineDay = (
    chipText: string,
    chipTone: AccentTone,
    subtitle: string,
    slots: TimelineSlotDef[],
    seed: string,
  ): ListPage => buildListPage(
    chipText,
    chipTone,
    chipText,
    subtitle,
    buildTimelineDayItems(slots, dayFallback, seed, pick, imageResolver),
    background(`${seed}-bg`),
    'itinerary-timeline-day',
  );

  return [
    {
      ...buildCoverPage('Đà Lạt 3N2Đ', 'Lịch trình theo ngày — bám ref timeline @rongchoidalattala.', coverBackground(`${seedPrefix}-cover`)),
      layoutVariant: 'itinerary-timeline-cover',
    },
    timelineDay('Ngày 01', 'terracotta', 'Ngày mở đầu — khung giờ ref @rongchoidalattala.', bindTimelineRefSlots(TIMELINE_REF_DAY1_SLOTS, [
      stayItems,
      breakfastItems,
      cafeItems,
      lunchItems,
      checkinItems.length ? checkinItems : tourismItems,
      dinnerItems,
      nightlifeItems,
      cafeItems,
    ]), `${seedPrefix}-day1`),
    timelineDay('Ngày 02', 'gold', 'Ngày săn ảnh — khung giờ ref @rongchoidalattala.', bindTimelineRefSlots(TIMELINE_REF_DAY2_SLOTS, [
      checkinItems.length ? checkinItems : tourismItems,
      breakfastItems,
      cafeItems,
      lunchItems,
      checkinItems.length ? checkinItems : tourismItems,
      dinnerItems,
      checkinItems,
      stayItems,
    ]), `${seedPrefix}-day2`),
    timelineDay('Ngày 03', 'berry', 'Ngày cuối — khung giờ ref @rongchoidalattala.', bindTimelineRefSlots(TIMELINE_REF_DAY3_SLOTS, [
      checkinItems.length ? checkinItems : tourismItems,
      breakfastItems,
      cafeItems,
      cafeItems,
      lunchItems,
      lunchItems,
      activityItems.length ? activityItems : tourismItems,
      cafeItems,
    ]), `${seedPrefix}-day3`),
  ];
}

function buildItinerary4N2DGrid8Pages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
  coverImageUrls: string[] = [],
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:journey-4n2d-grid8`, mappedImageUrls, globalUsedImageUrls || [], { orientation: 'any', strictMapping: true });
  const background = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const coverBackground = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const cafeDayItems = pools.dayCafeItems;
  const checkinDayItems = balancedCheckinPool(pools.dayCheckinItems, 16, `${seedPrefix}-4n2d-checkin-pool`);
  const tourismDayItems = pools.dayTourismItems;
  const famousDayItems = pools.dayFamousItems;
  const morningFoodItems = pools.morningFoodItems;
  const lightMealItems = pools.lightMealItems;
  const eveningFoodItems = pools.eveningScheduleItems;
  const breakfastItems = morningFoodItems;
  const lunchItems = pools.lunchItems;
  const checkinItems = checkinDayItems.length > 0 ? checkinDayItems : balancedCheckinPool(pools.checkinItems, 16, `${seedPrefix}-4n2d-checkin-fallback`);
  const activitySlot = itineraryActivitySlotPool(pools, seedPrefix);
  const activityItems = activitySlot.items;
  const dinnerItems = eveningFoodItems.length > 0 ? eveningFoodItems : pools.dinnerItems;
  const nightlifeScheduleItems = pageReadyNightlifeItems(pools.nightlifeItems);
  const dayFallbackItems = dedupeItems([
    ...cafeDayItems,
    ...morningFoodItems,
    ...lightMealItems,
    ...checkinDayItems,
    ...tourismDayItems,
    ...famousDayItems,
  ]);
  const dayTimes = ['ĂN SÁNG', 'CAFE', 'CHECK-IN', 'ĂN TRƯA', activitySlot.label, activitySlot.label, 'ĂN TỐI', 'CHƠI ĐÊM'];

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
        `ĐÀ LẠT 4N3Đ\nCHUYẾN ĐI KHÔNG MUỐN KẾT THÚC`,
        'Cứ lưu board này về — từ sáng đến tối có sẵn khung giờ, khỏi lo lạc đường hay đói.',
        coverBackground(`${seedPrefix}-cover`),
      ),
      layoutVariant: 'journey-4n2d-grid8',
    },
    dayPage(
      'Day 01',
      'terracotta',
      'Vào phố nhẹ nhàng',
      'Một nhịp mở đầu dễ đi, đủ bữa ăn, cafe và check-in trong ngày đầu.',
      [
        breakfastItems,
        cafeDayItems,
        checkinItems,
        lunchItems,
        activityItems,
        activityItems,
        dinnerItems,
        nightlifeScheduleItems,
      ],
      `${seedPrefix}-grid8-day1`,
    ),
    dayPage(
      'Day 02',
      'gold',
      'Săn ảnh và ăn sáng',
      'Ưu tiên các điểm có ảnh đẹp, di chuyển theo nhịp sáng đến tối.',
      [
        breakfastItems,
        cafeDayItems,
        checkinItems,
        lunchItems,
        activityItems,
        activityItems,
        dinnerItems,
        nightlifeScheduleItems,
      ],
      `${seedPrefix}-grid8-day2`,
    ),
    dayPage(
      'Day 03',
      'berry',
      'Đi sâu hơn một nhịp',
      'Ngày giữa chuyến đi dành cho điểm xa hơn, trải nghiệm rõ chất Đà Lạt.',
      [
        breakfastItems,
        cafeDayItems,
        checkinItems,
        lunchItems,
        activityItems,
        activityItems,
        dinnerItems,
        nightlifeScheduleItems,
      ],
      `${seedPrefix}-grid8-day3`,
    ),
    dayPage(
      'Day 04',
      'slate',
      'Sáng chậm rồi rời phố',
      'Một ngày cuối gọn nhịp, vẫn đủ điểm ghé và chốt bữa tối. Lưu lại ngay nhé.',
      [
        breakfastItems,
        cafeDayItems,
        checkinItems,
        lunchItems,
        activityItems,
        activityItems,
        dinnerItems,
        nightlifeScheduleItems,
      ],
      `${seedPrefix}-grid8-day4`,
    ),
    buildListPage(
      'Dịch vụ',
      'slate',
      'Dịch vụ cần chú ý',
      'Các dịch vụ hỗ trợ chuyến đi, ưu tiên mục có thông tin rõ để liên hệ nhanh.',
      buildGrid8PageItems(pools.serviceItems, pools.serviceItems, 8, `${seedPrefix}-grid8-services`, pick, imageResolver, photomodeServiceLabel),
      background(`${seedPrefix}-grid8-services-center`),
      'journey-4n2d-grid8',
    ),
    buildListPage(
      'Homestay',
      'pine',
      'Homestay Đà Lạt',
      'Các chỗ nghỉ nên xem riêng để dễ chốt phòng, không trộn với dịch vụ khác.',
      buildGrid8PageItems(pools.stayItems, pools.stayItems, 8, `${seedPrefix}-grid8-homestay`, pick, imageResolver, photomodeServiceLabel),
      background(`${seedPrefix}-grid8-homestay-center`),
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
  coverImageUrls: string[] = [],
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:journey-4n3d`, mappedImageUrls, globalUsedImageUrls || [], { orientation: 'any', strictMapping: true });
  const background = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const coverBackground = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const breakfastItems = pools.morningFoodItems;
  const lunchItems = pools.lunchItems;
  const checkinItems = balancedCheckinPool(
    pools.dayCheckinItems.length > 0 ? pools.dayCheckinItems : pools.checkinItems,
    16,
    `${seedPrefix}-4n3d-checkin-pool`,
  );
  const activitySlot = itineraryActivitySlotPool(pools, seedPrefix);
  const activityItems = activitySlot.items;
  const dinnerItems = pools.eveningScheduleItems.length > 0 ? pools.eveningScheduleItems : pools.dinnerItems;
  const nightlifeItems = pageReadyNightlifeItems(pools.nightlifeItems);

  const day1Items = pickJourneySlots(
    [
      breakfastItems, // ĂN SÁNG
      pools.dayCafeItems, // CAFE
      checkinItems, // CHECK-IN
      lunchItems, // ĂN TRƯA
      activityItems, // HOẠT ĐỘNG / KHU DU LỊCH
      dinnerItems, // ĂN TỐI
      nightlifeItems, // CHƠI ĐÊM
    ],
    `${seedPrefix}-journey-day1`,
    pick,
    imageResolver,
    ['ĂN SÁNG', 'CAFE', 'CHECK-IN', 'ĂN TRƯA', activitySlot.label, 'ĂN TỐI', 'CHƠI ĐÊM'],
  );

  const day2Items = pickJourneySlots(
    [
      breakfastItems, // ĂN SÁNG
      pools.dayCafeItems, // CAFE
      checkinItems, // CHECK-IN
      lunchItems, // ĂN TRƯA
      activityItems, // HOẠT ĐỘNG / KHU DU LỊCH
      dinnerItems, // ĂN TỐI
      nightlifeItems, // CHƠI ĐÊM
    ],
    `${seedPrefix}-journey-day2`,
    pick,
    imageResolver,
    ['ĂN SÁNG', 'CAFE', 'CHECK-IN', 'ĂN TRƯA', activitySlot.label, 'ĂN TỐI', 'CHƠI ĐÊM'],
  );

  const day3Items = pickJourneySlots(
    [
      breakfastItems, // ĂN SÁNG
      pools.dayCafeItems, // CAFE
      checkinItems, // CHECK-IN
      lunchItems, // ĂN TRƯA
      activityItems, // HOẠT ĐỘNG / KHU DU LỊCH
      dinnerItems, // ĂN TỐI
      nightlifeItems, // CHƠI ĐÊM
    ],
    `${seedPrefix}-journey-day3`,
    pick,
    imageResolver,
    ['ĂN SÁNG', 'CAFE', 'CHECK-IN', 'ĂN TRƯA', activitySlot.label, 'ĂN TỐI', 'CHƠI ĐÊM'],
  );

  const day4Items = pickJourneySlots(
    [
      breakfastItems, // ĂN SÁNG
      pools.dayCafeItems, // CAFE
      checkinItems, // CHECK-IN
      lunchItems, // ĂN TRƯA
      activityItems, // HOẠT ĐỘNG / KHU DU LỊCH
      dinnerItems, // ĂN TỐI
      nightlifeItems, // CHƠI ĐÊM
    ],
    `${seedPrefix}-journey-day4`,
    pick,
    imageResolver,
    ['ĂN SÁNG', 'CAFE', 'CHECK-IN', 'ĂN TRƯA', activitySlot.label, 'ĂN TỐI', 'CHƠI ĐÊM'],
  );

  return [
    {
      ...buildCoverPage(
        '4N3Đ ĐÀ LẠT\nĐI CHẬM CHILL SÂU',
        '', // subtitle removed as requested
        coverBackground(`${seedPrefix}-journey-cover`),
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
      'Săn ảnh và ăn sáng',
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
      'Homestay',
      'pine',
      'Homestay Đà Lạt',
      '',
      pickJourneySlots(
        Array(7).fill(pools.stayItems),
        `${seedPrefix}-journey-stay`,
        pick,
        imageResolver,
          ['KHÁCH SẠN', 'LƯU TRÚ', 'GẦN TRUNG TÂM', 'NGHỈ NGƠI', 'CHECK-IN', 'CHỐT PHÒNG', 'GỢI Ý THÊM'],
      ),
      background(`${seedPrefix}-journey-stay-bg`),
      'journey-4n3d',
    ),
    buildListPage(
      'Dịch vụ',
      'slate',
      'Dịch vụ cần chú ý',
      '',
      pickMixedItemsWithPartnerQuota(pools.serviceItems, 7, `${seedPrefix}-journey-services`, pick)
        .map((item) => photomodePageItemWithResolver(item, photomodeServiceLabel(item), imageResolver)),
      background(`${seedPrefix}-journey-services-bg`),
      'journey-4n3d',
    ),
  ];
}

const ITINERARY_4N3D_STACK_DAY_LABELS = ['NGÀY 1', 'NGÀY 2', 'NGÀY 3', 'NGÀY 4'] as const;
const ITINERARY_4N3D_STACK_ITEM_COUNT = 4;
const ITINERARY_4N3D_STACK_PARTNER_CAP = 2;

function pickItinerary4N3DStackItems(items: GuideItem[], seed: string, pick: PickFn): GuideItem[] {
  const pool = preferDisplayReadyItems(items, ITINERARY_4N3D_STACK_ITEM_COUNT);
  return pickMixedItemsWithPartnerQuota(
    pool,
    ITINERARY_4N3D_STACK_ITEM_COUNT,
    seed,
    pick,
    ITINERARY_4N3D_STACK_PARTNER_CAP,
  );
}

function buildItinerary4N3DStackPageItems(
  items: GuideItem[],
  seed: string,
  pick: PickFn,
  imageResolver: ReturnType<typeof createListImageResolver>,
): PageItem[] {
  return pickItinerary4N3DStackItems(items, seed, pick).map((item, index) => {
    const resolved = imageResolver(item);
    const tuned = tuneStackBandImageUrl(item, resolved, seed);
    return pageItemWithResolver(item, ITINERARY_4N3D_STACK_DAY_LABELS[index], () => tuned);
  });
}

function prefersStackBandAlternateImage(name: string): boolean {
  const normalized = normalizeText(name);
  return normalized.includes('phong_mi')
    || (normalized.includes('stell') && normalized.includes('studio'))
    || normalized.includes('nha_xe');
}

function tuneStackBandImageUrl(
  item: GuideItem,
  resolved: Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
  seed: string,
): Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'> {
  const pool = [...new Set([
    ...(resolved.candidateImageUrls || []),
    ...(item.candidateImageUrls || []),
    resolved.imageUrl,
  ].filter(Boolean))];
  if (pool.length < 2 || !prefersStackBandAlternateImage(item.name)) return resolved;

  const sorted = pool.sort(
    (left, right) => stableHash(`${seed}:stack-alt:${item.id}:${left}`) - stableHash(`${seed}:stack-alt:${item.id}:${right}`),
  );
  const alternate = sorted.find((url) => url !== resolved.imageUrl) || sorted[1] || sorted[0];
  if (!alternate || alternate === resolved.imageUrl) return resolved;
  return { ...resolved, imageUrl: alternate };
}

export function buildItinerary4N3DStackPages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
  coverImageUrls: string[] = [],
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(
    imageUrls,
    libraryEntries,
    `${seedPrefix}:itinerary-4n3d-stack`,
    mappedImageUrls,
    globalUsedImageUrls || [],
    { orientation: 'any', strictMapping: true },
  );
  const background = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const coverBackground = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);

  const breakfastItems = pools.morningFoodItems;
  const lunchItems = pools.lunchItems;
  const dinnerItems = pools.eveningScheduleItems.length > 0 ? pools.eveningScheduleItems : pools.dinnerItems;
  const checkinItems = balancedCheckinPool(
    pools.dayCheckinItems.length > 0 ? pools.dayCheckinItems : pools.checkinItems,
    16,
    `${seedPrefix}-stack-checkin-pool`,
  );
  const activitySlot = itineraryActivitySlotPool(pools, seedPrefix);
  const servicePool = dedupeItems([
    ...pools.serviceItems,
    ...pools.stayItems,
    ...pageReadyNightlifeItems(pools.nightlifeItems),
  ]);

  const stackPage = (
    chipText: string,
    chipTone: AccentTone,
    title: string,
    subtitle: string,
    pool: GuideItem[],
    seed: string,
  ): ListPage => buildListPage(
    chipText,
    chipTone,
    title,
    subtitle,
    buildItinerary4N3DStackPageItems(pool, seed, pick, imageResolver),
    background(`${seed}-bg`),
    'itinerary-4n3d-stack-page',
  );

  return [
    {
      ...buildCoverPage(
        '4N3Đ ĐÀ LẠT',
        'Gom gọn gợi ý theo từng nhóm — đi chậm, chill từng ngày',
        coverBackground(`${seedPrefix}-stack-cover`),
      ),
      layoutVariant: 'itinerary-4n3d-stack-cover',
    },
    stackPage('Ăn sáng', 'terracotta', 'ĂN SÁNG', 'Gợi ý quán sáng theo từng buổi — lưu để khỏi mò từng ngày.', breakfastItems, `${seedPrefix}-stack-breakfast`),
    stackPage('Ăn trưa', 'gold', 'ĂN TRƯA', 'Mỗi ngày một quán trưa gọn — dễ ghép vào lịch đi chậm.', lunchItems, `${seedPrefix}-stack-lunch`),
    stackPage('Ăn tối', 'berry', 'ĂN TỐI', 'Chốt bữa tối theo từng ngày, ưu tiên quán có địa chỉ rõ.', dinnerItems, `${seedPrefix}-stack-dinner`),
    stackPage('Cafe', 'slate', 'CAFE', 'Cafe nghỉ chân và góc chill — chia theo từng ngày.', pools.dayCafeItems, `${seedPrefix}-stack-cafe`),
    stackPage('Check-in', 'pine', 'CHECK-IN', 'Điểm chụp và view đẹp — gom theo ngày cho dễ lưu.', checkinItems, `${seedPrefix}-stack-checkin`),
    stackPage(activitySlot.label, 'terracotta', activitySlot.label, 'Hoạt động và trải nghiệm nên thử — mỗi ngày một gợi ý.', activitySlot.items, `${seedPrefix}-stack-activity`),
    stackPage('Dịch vụ', 'gold', 'DỊCH VỤ · LƯU TRÚ & ĐÊM', 'Homestay, chơi đêm và dịch vụ cần lưu trước chuyến đi.', servicePool, `${seedPrefix}-stack-service`),
  ];
}

function buildMustGoPages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
  coverImageUrls: string[] = [],
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:must-go`, mappedImageUrls, globalUsedImageUrls || [], { orientation: 'any', strictMapping: true });
  const background = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const coverBackground = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const freeCheckinItems = balancedCheckinPool(
    pools.freeCheckinItems.length > 0 ? pools.freeCheckinItems : pools.checkinItems,
    4,
    `${seedPrefix}-must-checkin-balanced`,
  );
  return [
    buildCoverPage('Những điểm không thể bỏ qua', 'Dùng cho các bộ ảnh kiểu must-go: điểm nổi tiếng, check-in đẹp, cafe có concept và chỗ ở đáng ghim.', coverBackground(`${seedPrefix}-cover-must-go`)),
    buildListPage('Must go', 'terracotta', 'Điểm nổi tiếng nên ghé', 'Trang này gom nhiều điểm nổi bật hơ để người xem lưu ngay nếu không muốn bỏ lỡ nơi nổi tiếng khi đến Đà Lạt.',
      pickMixedItemsWithPartnerQuota(pools.famousItems, 4, `${seedPrefix}-must-famous-page`, pick).map((i) => pageItemWithResolver(i, 'Điểm nổi tiếng', imageResolver)),
      background(`${seedPrefix}-must-famous-page`), 'dense'),
    buildListPage('Gợi ý', 'gold', 'Điểm check-in dễ đi', 'Các điểm đẹp được tăng thêm số lượng để trang này thật sự có giá trị lưu lại, không chỉ dừng ở 1-2 địa điểm.',
      pickWithUsedFallback(freeCheckinItems, 4, `${seedPrefix}-must-free-page`, pick).map((i) => pageItemWithResolver(i, '', imageResolver)),
      background(`${seedPrefix}-must-free-page`), 'dense'),
    buildListPage('Cafe', 'pine', 'Quán cafe có concept', 'Giữ layout chữ to, tên quán nổi rõ nhưng tăng thêm dữ liệu để page cafe trông thật sự đáng lưu.',
      pickMixedItemsWithPartnerQuota(pools.cafeItems, 4, `${seedPrefix}-must-cafe-page`, pick).map((i) => pageItemWithResolver(i, 'Cafe đẹp', imageResolver)),
      background(`${seedPrefix}-must-cafe-page`), 'dense'),
    buildListPage('Ăn uống', 'berry', 'Ăn sáng rồi đi đâu', 'Một trang xen giữa ăn sáng và điểm đến để bộ carousel bớt lặp toàn check-in, đồng thời có đủ dữ liệu để dùng được ngay.',
      pickMixedItemsWithPartnerQuota(pools.morningFoodItems.length > 0 ? pools.morningFoodItems : pools.lightMealItems, 4, `${seedPrefix}-must-food-page`, pick).map((i) => pageItemWithResolver(i, 'Ăn sáng', imageResolver)),
      background(`${seedPrefix}-must-food-page`), 'dense'),
    buildListPage('Lưu trú', 'slate', 'Homestay và dịch vụ nên nhớ', 'Trang cuối dùng để chốt các điểm thực dụng như ở đâu, thuê gì, mua quà ở đâu trước khi kết thúc bộ nội dung, nên mình tăng thêm lựa chọn.',
      pickPracticalServiceItemsWithNightlife(pools, pools.stayItems, 4, `${seedPrefix}-must-stay-page`, pick).map((i) => pageItemWithResolver(i, photomodeServiceLabel(i), imageResolver)),
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
  coverImageUrls: string[] = [],
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:first-time`, mappedImageUrls, globalUsedImageUrls || [], { orientation: 'any', strictMapping: true });
  const background = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const coverBackground = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const firstCheckinItems = balancedCheckinPool(
    dedupeItems([...pools.dayCheckinItems, ...pools.dayFamousItems]),
    4,
    `${seedPrefix}-first-checkin-balanced`,
  );
  return [
    buildCoverPage('Đi Đà Lạt lần đầu nên lưu gì', 'Một bộ trang dành cho người chuẩn bị đi Đà Lạt: ăn sáng, cafe, check-in, địa điểm nổi tiếng và dịch vụ cần nhớ.', coverBackground(`${seedPrefix}-cover-first-time`)),
    buildListPage('Lưu ý', 'terracotta', 'Đi sớm để săn ảnh đẹp', 'Mở đầu bằng các điểm hợp buổi sáng để bộ nội dung có nhịp giống mẫu, nhưng tăng số điểm để người mới nhìn là có nhiều gợi ý hơn.',
      pickMixedItemsWithPartnerQuota(pools.morningScheduleItems, 4, `${seedPrefix}-first-morning-page`, pick).map((i) => pageItemWithResolver(i, 'Sáng sớm', imageResolver)),
      background(`${seedPrefix}-first-morning-page`), 'dense'),
    buildListPage('Ăn sáng', 'gold', 'Quán ăn sáng dễ chốt', 'Ưu tiên những chỗ có địa chỉ rõ, dữ liệu đủ sạch để dùng cho bộ ảnh dành cho người mới lên kế hoạch, nên bổ sung thêm số lượng.',
      pickMixedItemsWithPartnerQuota(pools.morningFoodItems.length > 0 ? pools.morningFoodItems : pools.lightMealItems, 4, `${seedPrefix}-first-breakfast-page`, pick).map((i) => pageItemWithResolver(i, 'Buổi sáng', imageResolver)),
      background(`${seedPrefix}-first-breakfast-page`), 'dense'),
    buildListPage('Cafe', 'pine', 'Cafe để ngồi và chụp', 'Trang này đóng vai trò cầu nối giữa lịch trình và visual, nên tăng số quán để người mới dễ chọn concept phù hợp.',
      pickMixedItemsWithPartnerQuota(pools.dayCafeItems, 4, `${seedPrefix}-first-cafe-page`, pick).map((i) => pageItemWithResolver(i, 'Cafe', imageResolver)),
      background(`${seedPrefix}-first-cafe-page`), 'dense'),
    buildListPage('Check-in', 'berry', 'Điểm chụp hình nên ghé', 'Một trang tập trung vào check-in và điểm nổi tiếng để người chuẩn bị đi có thể lưu nhanh nhiều chỗ hơn, không chỉ 1-2 điểm.',
      pickWithUsedFallback(firstCheckinItems, 4, `${seedPrefix}-first-checkin-page`, pick).map((i) => pageItemWithResolver(i, 'Nên ghé', imageResolver)),
      background(`${seedPrefix}-first-checkin-page`), 'dense'),
    buildListPage('Cuối list', 'slate', 'Dịch vụ và chỗ nghỉ cần nhớ', 'Trang chốt tổng hợp các thứ thực dụng: ở đâu, liên hệ gì, mua quà hay thuê xe ở đâu cho gọn, nên mình tăng thêm điểm để tiện chốt nhanh.',
      pickPracticalServiceItemsWithNightlife(pools, pools.stayItems, 4, `${seedPrefix}-first-service-page`, pick).map((i) => pageItemWithResolver(i, photomodeServiceLabel(i), imageResolver)),
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
  coverImageUrls: string[] = [],
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(
    imageUrls,
    libraryEntries,
    `${seedPrefix}:pov-3-day`,
    mappedImageUrls,
    globalUsedImageUrls || [],
    { orientation: 'any', strictMapping: true },
  );
  const background = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const coverBackground = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const checkinItems = balancedCheckinPool(
    pools.dayCheckinItems.length > 0 ? pools.dayCheckinItems : pools.checkinItems,
    8,
    `${seedPrefix}-pov-checkin-pool`,
  );
  const activityPage = finalActivityPagePool(pools, seedPrefix);
  const nightlifeItems = pageReadyNightlifeItems(pools.nightlifeItems);
  const coverItem = pickSingleContextualItem(
    [...checkinItems, ...activityPage.items],
    [...checkinItems, ...activityPage.items],
    `${seedPrefix}-cover`,
    pick,
  )[0];
  const copy = getMarketingCopy();
  const coverImage = coverBackground(`${seedPrefix}-cover-bg`) || (coverItem
    ? photomodePageItemWithResolver(coverItem, cityLabel(), imageResolver).imageUrl
    : '');

  return [
    {
      ...buildCoverPage(
        copy.povCoverTitle,
        copy.povCoverSubtitle,
        coverImage,
      ),
      layoutVariant: 'photomode',
    },
    buildListPage(
      'Quán ăn',
      'berry',
      'Quán ăn nên lưu',
      'Các quán ăn được gom riêng để không lẫn với cafe hay lịch trình trong ngày.',
      buildPhotomodeItems(
        pools.foodItems,
        pools.foodItems,
        3,
        `${seedPrefix}-food`,
        pick,
        imageResolver,
        mealLabelForItem,
      ),
      '',
      'photomode',
    ),
    buildListPage(
      'Cafe',
      'gold',
      'Cafe nên ghim',
      'Các quán cafe được tách riêng để người xem dễ chọn vibe trước khi đi.',
      buildPhotomodeItems(
        pools.cafeItems,
        pools.cafeItems,
        3,
        `${seedPrefix}-cafe`,
        pick,
        imageResolver,
        (item) => item.type,
      ),
      '',
      'photomode',
    ),
    buildListPage(
      'Check-in',
      'terracotta',
      'Điểm check-in',
      'Các điểm check-in được gom đúng nhóm, không trộn khu du lịch.',
      buildPhotomodeItems(
        checkinItems,
        checkinItems,
        3,
        `${seedPrefix}-checkin`,
        pick,
        imageResolver,
        () => '',
      ),
      '',
      'photomode',
    ),
    buildListPage(
      'Chơi đêm',
      'slate',
      'Chơi đêm Đà Lạt',
      'Các điểm đi buổi tối, ăn đêm hoặc nghe nhạc nên lưu riêng sau 20h.',
      buildPhotomodeItems(
        nightlifeItems,
        nightlifeItems,
        3,
        `${seedPrefix}-nightlife`,
        pick,
        imageResolver,
        photomodeServiceLabel,
      ),
      '',
      'photomode',
    ),
    buildListPage(
      'Dịch vụ',
      'pine',
      'Dịch vụ cần lưu ý',
      'Các dịch vụ hỗ trợ chuyến đi được tách riêng để người xem dễ liên hệ nhanh.',
      buildPhotomodeItems(
        pools.serviceItems,
        pools.serviceItems,
        3,
        `${seedPrefix}-services`,
        pick,
        imageResolver,
        photomodeServiceLabel,
      ),
      '',
      'photomode',
    ),
    buildListPage(
      'Homestay',
      'pine',
      'Homestay Đà Lạt',
      'Các chỗ nghỉ nên xem riêng để dễ chốt phòng và không trộn với dịch vụ khác.',
      buildPhotomodeItems(
        pools.stayItems,
        pools.stayItems,
        3,
        `${seedPrefix}-homestay`,
        pick,
        imageResolver,
        photomodeServiceLabel,
      ),
      '',
      'photomode',
    ),
    buildListPage(
      activityPage.chip,
      'slate',
      activityPage.isActivity ? 'Hoạt động Đà Lạt' : 'Khu du lịch Đà Lạt',
      activityPage.isActivity ? 'Các hoạt động và điểm ghé được luân phiên với trang khu du lịch giữa các list.' : 'Các khu du lịch được tách riêng khỏi trang check-in.',
      buildPhotomodeItems(
        activityPage.items,
        activityPage.items,
        3,
        `${seedPrefix}-activity`,
        pick,
        imageResolver,
        (item) => item.type,
      ),
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

function buildBalancedCheckinGridItems(
  items: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
  imageResolver: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
): PageItem[] {
  const pool = balancedCheckinPool(items, count, seed);
  return pickWithUsedFallback(pool, count, seed, pick).map((item) =>
    photomodePageItemWithResolver(item, '', imageResolver),
  );
}

function buildBalancedCheckinGrid8Items(
  items: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
  imageResolver: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
): PageItem[] {
  const pool = balancedCheckinPool(items, count, seed);
  return pickWithUsedFallback(pool, count, seed, pick).map((item) =>
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
  partnerCap = DEFAULT_PARTNER_TARGET_PER_PAGE,
): PageItem[] {
  return pickGrid8ItemsWithPartnerQuota(primaryItems, fallbackItems, count, seed, pick, partnerCap).map((item) =>
    photomodePageItemWithResolver(item, labelForItem(item), imageResolver),
  );
}

function spotlightLabelForItem(item: GuideItem, fallbackLabel: string): string {
  if (item.sectionKey === 'quan_an') return mealLabelForItem(item);
  if (item.sectionKey === 'dich_vu' || item.sectionKey === 'homestay') {
    return photomodeServiceLabel(item) || fallbackLabel;
  }
  return item.type || fallbackLabel;
}

function pickSpotlightItem(
  items: GuideItem[],
  seed: string,
  pick: PickFn,
): GuideItem | null {
  const displayReadyItems = preferDisplayReadyItems(items, 1);
  const mappedReadyItems = preferMappedImageItems(displayReadyItems);
  return pickMixedItemsWithPartnerQuota(mappedReadyItems, 1, seed, pick)[0] || null;
}

function buildSpotlightPage(
  chipText: string,
  chipTone: AccentTone,
  title: string,
  subtitle: string,
  item: GuideItem | null,
  imageResolver: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
): ListPage | null {
  if (!item) return null;
  const pageItem = pageItemWithResolver(item, spotlightLabelForItem(item, chipText), imageResolver);
  return buildListPage(
    chipText,
    chipTone,
    title,
    subtitle,
    [pageItem],
    pageItem.imageUrl,
    'spotlight',
  );
}

function buildSpotlightPagesForCategory(
  chipText: string,
  chipTone: AccentTone,
  title: string,
  subtitle: string,
  items: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
  imageResolver: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
): ListPage[] {
  return Array.from({ length: count }, (_, index) => {
    const item = pickSpotlightItem(items, `${seed}-${index + 1}`, pick);
    return buildSpotlightPage(chipText, chipTone, title, subtitle, item, imageResolver);
  }).filter((page): page is ListPage => Boolean(page));
}

function buildSpotlightListItems(
  items: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
  imageResolver: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
  labelFallback: string,
): PageItem[] {
  return shuffleItems(
    pickMixedItemsWithPartnerQuota(
      preferMappedImageItems(preferDisplayReadyItems(items, count)),
      count,
      seed,
      pick,
    ),
    `${seed}-order`,
  ).map((item) => pageItemWithResolver(item, spotlightLabelForItem(item, labelFallback), imageResolver));
}

function buildSpotlightGuidePages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
  coverImageUrls: string[] = [],
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(
    imageUrls,
    libraryEntries,
    `${seedPrefix}:spotlight-guide`,
    mappedImageUrls,
    globalUsedImageUrls || [],
    { orientation: 'any', strictMapping: true },
  );
  const background = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const activityPage = finalActivityPagePool(pools, seedPrefix);
  const tourismItems = preferDisplayReadyItems(
    dedupeItems([
      ...pools.dayTourismItems,
      ...activityPage.items,
      ...pools.dayFamousItems,
    ]),
    2,
  );

  const spotlightPages = shuffleSpotlightPages([
    ...buildSpotlightPagesForCategory(
      'Check-in',
      'terracotta',
      'Check-in Đà Lạt',
      'Một điểm dễ lưu riêng để người xem nhớ rõ tên, ảnh và vị trí.',
      balancedCheckinPool(pools.dayCheckinItems.length > 0 ? pools.dayCheckinItems : pools.checkinItems, 8, `${seedPrefix}-spotlight-checkin-pool`),
      2,
      `${seedPrefix}-checkin`,
      pick,
      imageResolver,
    ),
    ...buildSpotlightPagesForCategory(
      'Cafe',
      'gold',
      'Quán cafe Đà Lạt',
      'Một quán cafe nổi bật, giữ thông tin gọn để người xem dễ quyết định.',
      pools.dayCafeItems.length > 0 ? pools.dayCafeItems : pools.cafeItems,
      2,
      `${seedPrefix}-cafe`,
      pick,
      imageResolver,
    ),
    ...buildSpotlightPagesForCategory(
      'Quán ăn',
      'berry',
      'Quán ăn Đà Lạt',
      'Một quán ăn được tách riêng để hình, tên và thông tin không bị chen lẫn.',
      pools.daytimeFoodItems.length > 0 ? pools.daytimeFoodItems : pools.foodItems,
      2,
      `${seedPrefix}-food`,
      pick,
      imageResolver,
    ),
    ...buildSpotlightPagesForCategory(
      activityPage.isActivity ? 'Hoạt động' : 'Khu du lịch',
      'pine',
      activityPage.isActivity ? 'Hoạt động Đà Lạt' : 'Khu du lịch Đà Lạt',
      activityPage.isActivity
        ? 'Một hoạt động đáng lưu riêng để người xem không nhầm với nhóm check-in.'
        : 'Một khu du lịch được tách riêng để tránh trộn sai với check-in.',
      tourismItems,
      2,
      `${seedPrefix}-tourism`,
      pick,
      imageResolver,
    ),
  ], `${seedPrefix}-spotlight-order`);

  const spotlightGuideHooks = getCachedSpotlightV3Hooks();
  const spotlightGuideCoverTitle = spotlightGuideHooks.length
    ? pickSpotlightV3Hook(spotlightGuideHooks, getSpotlightV3BuildContext().usedHookTitles || [], `${seedPrefix}|hook`)
    : 'ĐÀ LẠT GỌN TRONG 10 TRANG';

  return [
    {
      ...buildCoverPage(
        spotlightGuideCoverTitle,
        'Một bộ gợi ý dạng spotlight: mỗi trang một địa điểm rõ ảnh, rõ tên, rõ thông tin để lưu và đi nhanh hơn.',
        backgroundFor(coverImageUrls.filter(isPortableImageUrl), `${seedPrefix}-cover`) || coverImageUrls[0] || background(`${seedPrefix}-cover`),
      ),
      layoutVariant: 'spotlight',
    },
    ...spotlightPages,
    buildListPage(
      'Dịch vụ',
      'slate',
      'Dịch vụ cần lưu',
      '9 lựa chọn hỗ trợ chuyến đi, ưu tiên đối tác và chỉ hiện SĐT khi dữ liệu có số.',
      buildSpotlightListItems(pools.serviceItems, 9, `${seedPrefix}-services`, pick, imageResolver, 'Dịch vụ'),
      background(`${seedPrefix}-services-bg`),
      'spotlight-list',
    ),
    buildListPage(
      'Homestay',
      'pine',
      'Homestay cần lưu',
      '9 lựa chọn lưu trú được gom riêng để dễ chốt chỗ ở trước chuyến đi.',
      buildSpotlightListItems(pools.stayItems, 9, `${seedPrefix}-homestay`, pick, imageResolver, 'Lưu trú'),
      background(`${seedPrefix}-homestay-bg`),
      'spotlight-list',
    ),
  ];
}

// ─── Spotlight Partner: one partner, all their images as spotlight pages ──────

export const SPOTLIGHT_PARTNER_TEMPLATE_VERSION = 17;

const LOW_RES_FULL_BLEED_DRIVE_FILE_IDS = new Set([
  // These Drive files are valid images, but Google Drive returns only 206x206 originals.
  // Keep them available for small info rows, but never stretch them onto full spotlight pages.
  '1PsjiCIYmv5fCfDOPvdq1p-gE_NRG2E3C',
  '1DU8MzPat5gC8bVem-TgTxpMk622vst0L',
  '1yyLV70vp9OohQlylWscnYizeASL4TVrz',
  '1I2UqrhZ9MRl8DSiGC3N0MM-iL7NdOrTw',
  '1-XVpIi6Uz3BrKG7ZLZX37P0clVsksiUs',
  // Tiệm nướng Hoàng Hôn Drive images are public, but current Drive originals are only ~243px wide.
  '1Fzq5CPCKrmYpPBdtKOzL9Y2lMouHf-Ce',
  '1nLFtj19vJbH09CxXQ-GuLO4NYGAz4yE1',
  '1N3TiUG-IXLF3wnkeZUpuOUfC18o823ql',
  '12w7LB0-QEZAo-cJMvd9QNtfFTsy5359i',
  '1to9Lh5NGEzYR8yQkhwM0I88HZQLd5lH9',
  '1FQmMeUmnLpd8NIqnP3OuUIYvHV9P-DAX',
]);

function driveFileIdFromAssetUrl(url: string): string {
  const text = String(url ?? '').trim();
  if (!text) return '';
  const queryMatch = text.match(/[?&]id=([^&]+)/);
  if (queryMatch) return decodeURIComponent(queryMatch[1] || '');
  const drivePathMatch = text.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (drivePathMatch) return drivePathMatch[1] || '';
  return '';
}

function isLowResFullBleedImage(url: string): boolean {
  const fileId = driveFileIdFromAssetUrl(url);
  return Boolean(fileId && LOW_RES_FULL_BLEED_DRIVE_FILE_IDS.has(fileId));
}

function fullBleedPartnerImageUrls(candidateUrls: string[]): string[] {
  const seen = new Set<string>();
  return candidateUrls.filter((url) => {
    if (!url || isLowResFullBleedImage(url) || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

type PartnerSpotlightCopy = {
  title: string;
  description: string;
};

const PARTNER_SPOTLIGHT_COPY: Record<string, PartnerSpotlightCopy[]> = {
  food: [
    { title: 'Món nhìn phát là muốn ghé', description: 'Hợp cho một bữa tối ấm, có món rõ ràng và không khí dễ ngồi lâu.' },
    { title: 'Đi cùng nhau sẽ vui hơn', description: 'Không gian có cảm giác gần gũi, hợp nhóm bạn hoặc cặp đôi cần một bữa gọn.' },
    { title: 'Trời se lạnh ghé là hợp', description: 'Một điểm ăn dễ thêm vào lịch khi muốn ngồi lại lâu hơn một chút.' },
    { title: 'Góc quán cũng khá ăn ảnh', description: 'Không chỉ để ăn, vài góc của quán lên hình cũng có vibe riêng.' },
    { title: 'Lưu lại cho bữa tối', description: 'Khi cần chốt nhanh một quán ăn ở Đà Lạt, mở lại trang này là đủ thông tin.' },
    { title: 'Một chỗ ăn dễ nhớ', description: 'Tên quán, địa chỉ và khung giờ được giữ gọn để xem lại nhanh trước khi đi.' },
  ],
  cafe: [
    { title: 'View ngồi chill dễ chịu', description: 'Một góc đủ rõ vibe quán để biết có hợp dừng chân trong lịch không.' },
    { title: 'Góc này lên hình khá xinh', description: 'Khung hình có cảm giác riêng, hợp lưu lại trước khi chọn điểm ghé.' },
    { title: 'Ngồi chậm một chút ở đây', description: 'Hợp lúc muốn nghỉ chân, uống nước và để lịch Đà Lạt nhẹ hơn.' },
    { title: 'Một góc rất Đà Lạt', description: 'Có những chi tiết nhỏ làm quán dễ nhớ hơn trong cả bộ ảnh.' },
    { title: 'Buổi chiều ghé sẽ đẹp', description: 'Dành cho mood ánh sáng mềm, nhẹ và thong thả hơn.' },
    { title: 'Lưu lại cho buổi cafe', description: 'Một điểm dễ mở lại khi cần chọn quán có view và không khí ổn.' },
  ],
  stay: [
    { title: 'Không gian nghỉ nhìn khá êm', description: 'Nhìn tổng thể là biết chỗ này hợp kiểu chuyến đi nào.' },
    { title: 'Góc phòng đáng xem trước', description: 'Một chi tiết giúp so nhanh vibe phòng trước khi đặt.' },
    { title: 'View nghỉ chân nhẹ nhàng', description: 'Hợp với ai muốn chỗ ở có cảm giác thư giãn hơn.' },
    { title: 'Chi tiết làm phòng có gu', description: 'Những điểm nhỏ giúp nơi ở dễ nhớ và dễ phân biệt hơn.' },
    { title: 'Hợp cho chuyến đi chậm', description: 'Một lựa chọn đáng lưu nếu lịch Đà Lạt ưu tiên nghỉ ngơi tử tế.' },
    { title: 'Lưu lại trước khi đặt phòng', description: 'Khi cần so chỗ ở, mở lại trang này là có thông tin chính.' },
  ],
  scenery: [
    { title: 'Khung cảnh đáng dừng lại', description: 'Một góc đủ đẹp để cân nhắc thêm vào lịch đi Đà Lạt.' },
    { title: 'Góc lên hình rộng và thoáng', description: 'Nhìn qua là hiểu vì sao nơi này đáng để ghé thử.' },
    { title: 'Một mảng xanh rất Đà Lạt', description: 'Cảm giác thiên nhiên nhẹ, dễ chịu và hợp đi chậm.' },
    { title: 'Lối đi có chiều sâu', description: 'Một khung hình có câu chuyện hơn, hợp cho bộ ảnh review.' },
    { title: 'View hợp để đi chậm', description: 'Dành cho lịch không vội, ghé và ngắm lâu hơn một chút.' },
    { title: 'Lưu lại cho ngày trời đẹp', description: 'Khi cần một điểm có cảnh ổn, trang này đủ để xem nhanh.' },
  ],
  service: [
    { title: 'Dịch vụ nên lưu trước', description: 'Thông tin thực dụng để giữ liên hệ khi cần hỗ trợ ở Đà Lạt.' },
    { title: 'Giúp chuyến đi gọn hơn', description: 'Một lựa chọn hậu cần để đỡ mất thời gian tìm lại lúc cần.' },
    { title: 'Thông tin cần khi phát sinh', description: 'Hợp lúc cần xử lý xe, đồ, quà hoặc hỗ trợ tại chỗ.' },
    { title: 'Lưu lại để liên hệ nhanh', description: 'Mở ra là biết cần gọi ai và dùng vào việc gì.' },
    { title: 'Một lựa chọn hỗ trợ lịch đi', description: 'Nhu cầu nhỏ nhưng đôi khi quyết định cả độ mượt của chuyến.' },
    { title: 'Ghim sẵn cho yên tâm', description: 'Có sẵn phương án dự phòng vẫn dễ chịu hơn khi đi xa.' },
  ],
  generic: [
    { title: 'Góc đáng lưu của nơi này', description: 'Một điểm nhìn nhanh để biết có hợp thêm vào lịch không.' },
    { title: 'Một chi tiết dễ nhớ', description: 'Giúp phân biệt nơi này với những điểm khác trong list.' },
    { title: 'Không gian nên xem trước', description: 'Hình dung vibe trước khi quyết định ghé.' },
    { title: 'Góc lên hình hợp lưu lại', description: 'Một khung hình dùng để nhớ nơi này trong cả list.' },
    { title: 'Điểm nhấn của địa điểm', description: 'Gom lại lý do nên cân nhắc thêm vào lịch.' },
    { title: 'Lưu lại khi cần chọn nhanh', description: 'Một trang chốt để quay lại xem khi cần ra quyết định.' },
  ],
};

function partnerCoverVariantIndex(item: GuideItem, seedPrefix: string, salt: string, count: number): number {
  if (count <= 0) return 0;
  const variantMatch = seedPrefix.match(/variant:(\d+)/i);
  if (variantMatch) {
    const offset = stableHash(`${item.id}:${salt}`) % count;
    return (Number(variantMatch[1]) + offset) % count;
  }
  return stableHash(`${seedPrefix}:${item.id}:${item.name}:${salt}`) % count;
}

function partnerCoverHook(item: GuideItem, seedPrefix = ''): string {
  const kind = partnerSpotlightCopyKind(item);
  const placeLine = item.address ? `${item.name} · ${item.address}` : item.name;
  const hooksByKind: Record<string, string[]> = {
    food: [
      'Gom nhanh món, không gian và thông tin cần lưu trước khi ghé.',
      'Một trang để xem nhanh vibe quán, giá và lý do nên ghé.',
      'Lưu trước nếu cần một điểm ăn dễ chốt trong lịch Đà Lạt.',
      'Tóm gọn món nên thử, khung giờ và cảm giác quán.',
    ],
    cafe: [
      'Gom nhanh vibe, góc ngồi và thời điểm hợp để ghé.',
      'Một trang để xem nhanh view, không gian và lý do nên lưu.',
      'Lưu lại khi cần một quán cafe dễ ghé trong lịch Đà Lạt.',
      'Tóm gọn góc đẹp, địa chỉ và cảm giác ngồi tại quán.',
    ],
    stay: [
      'Xem nhanh không gian, vibe nghỉ và thông tin nên lưu trước.',
      'Tóm gọn cảm giác phòng, vị trí và lý do nên cân nhắc.',
      'Lưu lại nếu cần một điểm nghỉ dễ so trước chuyến đi.',
      'Một trang để nhìn nhanh nơi ở trước khi đặt phòng.',
    ],
    service: [
      'Lưu trước để chuyến đi gọn hơn khi cần dùng dịch vụ hoặc mua quà.',
      'Tóm gọn thông tin cần lưu và lý do nên giữ sẵn.',
      'Một lựa chọn tiện để đỡ mất thời gian tìm lại lúc cần.',
      'Ghim sẵn thông tin cần thiết cho chuyến Đà Lạt nhẹ hơn.',
    ],
    scenery: [
      'Gom nhanh vibe, góc đẹp và thông tin cần lưu trước khi ghé.',
      'Một trang để xem nhanh cảnh, địa chỉ và lý do nên thêm vào lịch.',
      'Lưu lại nếu cần một góc Đà Lạt dễ đi và dễ nhớ.',
      'Tóm gọn khung cảnh, cảm giác và điểm đáng dừng lại.',
    ],
    generic: [
      'Gom nhanh vibe, góc đẹp và thông tin cần lưu trước khi ghé.',
      'Một trang để xem nhanh nơi này có hợp thêm vào lịch không.',
      'Lưu lại khi cần chọn nhanh một điểm đáng ghé.',
      'Tóm gọn điểm đáng nhớ và thông tin chính của địa điểm.',
    ],
  };
  const hooks = hooksByKind[kind] || hooksByKind.generic;
  const hook = hooks[partnerCoverVariantIndex(item, seedPrefix, 'cover-hook', hooks.length)] || hooks[0];
  return `${placeLine}. ${hook}`;
}

function partnerCoverTitle(item: GuideItem, seedPrefix = ''): string {
  const kind = partnerSpotlightCopyKind(item);
  const name = item.name;
  const titlesByKind: Record<string, string[]> = {
    food: [
      `${name} có đáng ghé?`,
      `Ghé ${name} ăn gì?`,
      `${name} hợp đi nhóm không?`,
      `${name} có gì ngon?`,
      `${name} nên lưu cho bữa tối?`,
    ],
    cafe: [
      `${name} có chill như lời đồn?`,
      `${name} có view ổn không?`,
      `Ghé ${name} ngồi gì?`,
      `${name} hợp buổi nào?`,
      `${name} có đáng lưu?`,
    ],
    stay: [
      `${name} có hợp để ở?`,
      `${name} có gì nên xem?`,
      `Ở ${name} có ổn không?`,
      `${name} hợp kiểu chuyến nào?`,
      `${name} có đáng đặt trước?`,
    ],
    service: [
      `${name} có gì nên lưu?`,
      `Lưu ${name} trước chuyến đi`,
      `${name} giúp chuyến đi gọn hơn`,
      `Có nên lưu ${name} không?`,
      `${name} dùng lúc nào?`,
    ],
    scenery: [
      `${name} có đáng ghé?`,
      `${name} có gì đáng xem?`,
      `Ghé ${name} mùa nào đẹp?`,
      `${name} hợp đi chậm không?`,
      `${name} có đáng lưu?`,
    ],
    generic: [
      `${name} có gì đáng lưu?`,
      `${name} có đáng ghé?`,
      `${name} hợp lịch nào?`,
      `Có nên lưu ${name} không?`,
      `${name} có gì nổi bật?`,
    ],
  };
  const titles = titlesByKind[kind] || titlesByKind.generic;
  return titles[partnerCoverVariantIndex(item, seedPrefix, 'cover-title', titles.length)] || titles[0];
}

function partnerSpotlightTone(sectionKey: SectionKey): AccentTone {
  if (sectionKey === 'cafe') return 'gold';
  if (sectionKey === 'quan_an') return 'berry';
  if (sectionKey === 'homestay') return 'pine';
  if (sectionKey === 'check_in') return 'terracotta';
  return 'slate';
}

function partnerSpotlightChip(item: GuideItem): string {
  return item.type || SECTION_CONFIG[item.sectionKey]?.title || 'Đối tác';
}

function partnerSpotlightCopyKind(item: GuideItem): keyof typeof PARTNER_SPOTLIGHT_COPY {
  const normalized = normalizeText([item.sectionKey, item.type, item.style, item.highlight, item.name].join(' '));
  if (item.sectionKey === 'cafe' || textMatchesAny(normalized, ['cafe', 'ca_phe', 'coffee'])) return 'cafe';
  if (item.sectionKey === 'homestay' || textMatchesAny(normalized, ['homestay', 'hotel', 'villa', 'luu_tru', 'phong'])) return 'stay';
  if (item.sectionKey === 'quan_an' || textMatchesAny(normalized, ['quan_an', 'nha_hang', 'an_toi', 'an_sang', 'mon_an', 'do_an', 'nuong', 'lau', 'com', 'bun', 'banh', 'pho', 'mi', 'ramen', 'chao', 'oc'])) return 'food';
  if (textMatchesAny(normalized, ['dac_san', 'thue', 'spa', 'goi_dau', 'chup_anh', 'camera', 'limousine', 'xe_may', 'xe_dien', 'qua'])) return 'service';
  if (item.sectionKey === 'dich_vu') return 'service';
  if (['check_in', 'hoat_dong', 'dia_diem_lich_su', 'khu_du_lich', 'choi_dem'].includes(item.sectionKey)) return 'scenery';
  return 'generic';
}

function partnerSpotlightCopy(item: GuideItem, index: number): PartnerSpotlightCopy {
  const copies = PARTNER_SPOTLIGHT_COPY[partnerSpotlightCopyKind(item)] || PARTNER_SPOTLIGHT_COPY.generic;
  return copies[index % copies.length] || PARTNER_SPOTLIGHT_COPY.generic[0];
}

function partnerInfoItems(item: GuideItem, imageUrl: string, candidateImageUrls: string[]): PageItem[] {
  const rows: Array<{ label: string; name: string; value: string }> = [
    { label: 'ĐỊA CHỈ', name: 'Địa chỉ', value: item.address },
    { label: 'KHUNG GIỜ', name: 'Khung giờ', value: item.openHours },
    { label: 'GIÁ', name: 'Giá tham khảo', value: displayPrice(item) },
    { label: 'LIÊN HỆ', name: 'Số điện thoại', value: item.phone },
  ].filter((row) => hasDisplayText(row.value));

  if (rows.length === 0) {
    rows.push({ label: 'GHI CHÚ', name: 'Thông tin', value: 'Lưu lại để xem khi cần.' });
  }

  return rows.map((row, index) => ({
    label: row.label,
    id: `${item.id}-info-${index}`,
    sourceKey: itemUsageKey(item),
    sourceSectionKey: item.sectionKey,
    name: row.name,
    metaPrimary: row.value,
    metaSecondary: '',
    imageUrl,
    imageMapped: true,
    imageSource: 'manual',
    imageNote: 'Thông tin đối tác từ Google Sheet',
    candidateImageUrls,
    isPartner: true,
    rawName: row.name,
  }));
}

function partnerBackgroundImage(
  coverImageUrls: string[],
  mappedImageUrls: string[],
  imageUrls: string[],
  seed: string,
  partnerImageUrls: string[],
  usedImageUrls?: Set<string>,
): string {
  const localUsed = new Set(usedImageUrls ?? []);
  partnerImageUrls.filter(Boolean).forEach((url) => localUsed.add(url));
  const picked = coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, localUsed);
  if (picked) usedImageUrls?.add(picked);
  return picked || partnerImageUrls[0] || '';
}

export function buildSpotlightPartnerPages(
  partnerItem: GuideItem,
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
  coverImageUrls: string[] = [],
): DeckPage[] {
  const candidateUrls = (partnerItem.candidateImageUrls || []).filter(Boolean);
  if (candidateUrls.length === 0 && partnerItem.imageUrl) {
    candidateUrls.push(partnerItem.imageUrl);
  }
  const fullBleedUrls = fullBleedPartnerImageUrls(candidateUrls);

  const mappedImageUrls = collectMappedImageUrls(pools);
  const background = (seed: string) => partnerBackgroundImage(coverImageUrls, mappedImageUrls, imageUrls, seed, fullBleedUrls, globalUsedImageUrls);
  const chipText = partnerSpotlightChip(partnerItem);
  const chipTone = partnerSpotlightTone(partnerItem.sectionKey);

  const spotlightPages: ListPage[] = fullBleedUrls.slice(0, 6).map((imageUrl, index) => {
    const pageCopy = partnerSpotlightCopy(partnerItem, index);
    const pageItem: PageItem = {
      label: chipText,
      id: `${partnerItem.id}-img-${index}`,
      sourceKey: itemUsageKey(partnerItem),
      sourceSectionKey: partnerItem.sectionKey,
      name: pageCopy.title,
      metaPrimary: partnerItem.name,
      metaSecondary: pageCopy.description,
      imageUrl,
      imageMapped: true,
      imageSource: 'manual',
      imageNote: 'Ảnh đối tác từ Drive',
      candidateImageUrls: fullBleedUrls,
      isPartner: true,
      rawName: partnerItem.name,
    };
    return buildListPage(
      chipText,
      chipTone,
      pageCopy.title,
      partnerItem.address || partnerItem.openHours || '',
      [pageItem],
      imageUrl,
      'spotlight-partner',
    );
  });

  const coverImage = background(`${seedPrefix}-cover`) || fullBleedUrls[0] || candidateUrls[0] || '';
  const infoImage = background(`${seedPrefix}-info`) || coverImage;
  const infoPage = buildListPage(
    'Thông tin',
    chipTone,
    'Lưu thông tin trước khi ghé',
    partnerItem.name,
    partnerInfoItems(partnerItem, infoImage, fullBleedUrls),
    infoImage,
    'spotlight-partner-info',
  );

  return [
    {
      ...buildCoverPage(
        partnerCoverTitle(partnerItem, seedPrefix),
        partnerCoverHook(partnerItem, seedPrefix),
        coverImage,
      ),
      layoutVariant: 'spotlight-partner' as const,
    },
    ...spotlightPages,
    infoPage,
  ];
}

function partnerImageCount(item: GuideItem): number {
  const urls = new Set<string>();
  (item.candidateImageUrls || []).filter(Boolean).forEach((url) => urls.add(url));
  if (item.imageUrl) urls.add(item.imageUrl);
  return urls.size;
}

function pickSpotlightPartnerSample(itemsBySection: WorkbookItemsBySection): GuideItem | null {
  const partners = dedupeItems(Object.values(itemsBySection).flat())
    .filter((item) => item.isPartner && hasUsableImage(item));
  if (partners.length === 0) return null;
  return [...partners].sort((a, b) => {
    const imageDiff = partnerImageCount(b) - partnerImageCount(a);
    if (imageDiff !== 0) return imageDiff;
    return a.name.localeCompare(b.name, 'vi');
  })[0] || null;
}

function buildSpotlightPartnerSampleLists(
  itemsBySection: WorkbookItemsBySection,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  coverImageUrls: string[] = [],
): GuideDeckList[] {
  const partnerItem = pickSpotlightPartnerSample(itemsBySection);
  if (!partnerItem) return [];

  const pages = buildSpotlightPartnerPages(
    partnerItem,
    createDeckBuildPools(itemsBySection),
    imageUrls,
    libraryEntries,
    `spotlight-partner:sample:${partnerItem.id}`,
    new Set<string>(),
    new Set<string>(),
    coverImageUrls,
  );
  const list = buildDeckList(
    'spotlight-partner',
    'main',
    'List mẫu',
    partnerItem.name.toUpperCase(),
    partnerItem.address || partnerItem.type || 'Mẫu xem trước cho spotlight đối tác.',
    pages,
  );
  list.coverTitle = partnerItem.name.toUpperCase().slice(0, 35);
  list.postCaption = 'Bỏ túi ngay, kẻo đi Đà Lạt lại loay hoay 😉';
  list.description = '';
  list.captionHashtags = buildCaptionHashtags([], 'lich_trinh_huu_ich', undefined, 'spotlight-partner');
  list.templateVersion = SPOTLIGHT_PARTNER_TEMPLATE_VERSION;
  return [list];
}

// ─── Grid 6 Zigzag ──────────────────────────────────────────────────────────────

function buildGrid6ZigzagPages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
  coverImageUrls: string[] = [],
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:grid-6-zigzag`, mappedImageUrls, globalUsedImageUrls || [], { orientation: 'any', strictMapping: true });
  const background = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const coverBackground = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const activityPage = finalActivityPagePool(pools, seedPrefix);
  const nightlifeItems = pageReadyNightlifeItems(pools.nightlifeItems);

  return [
    {
      ...buildCoverPage(
        'TOP 6 ĐỊA ĐIỂM ĐÀ LẠT',
        'Mỗi trang 6 gợi ý, ảnh và thông tin xen kẽ để lướt nhanh và lưu dễ.',
        coverBackground(`${seedPrefix}-cover`),
      ),
      layoutVariant: 'grid-6-zigzag',
    },
    buildListPage(
      'Quán ăn', 'berry', 'MÓN NGON ĐÀ LẠT',
      '6 quán ăn xếp zigzag để dễ lướt và lưu nhanh.',
      buildGridPageItems(pools.foodItems, pools.foodItems, 6, `${seedPrefix}-food`, pick, imageResolver, mealLabelForItem),
      '', 'grid-6-zigzag',
    ),
    buildListPage(
      'Cà phê', 'gold', 'QUÁN CAFE ĐÀ LẠT',
      '6 quán cafe view đẹp, sương mây đỉnh.',
      buildGridPageItems(pools.cafeItems, pools.cafeItems, 6, `${seedPrefix}-cafe`, pick, imageResolver, (item) => item.type),
      '', 'grid-6-zigzag',
    ),
    buildListPage(
      'Check-in', 'terracotta', 'ĐỊA ĐIỂM CHECK-IN',
      '6 địa điểm check-in được tách riêng để lưu nhanh.',
      buildBalancedCheckinGridItems(pools.checkinItems, 6, `${seedPrefix}-checkin`, pick, imageResolver),
      '', 'grid-6-zigzag',
    ),
    buildListPage(
      'Chơi đêm', 'slate', 'CHƠI ĐÊM ĐÀ LẠT',
      'Các điểm đi buổi tối, ăn đêm và nghe nhạc.',
      buildGridPageItems(nightlifeItems, nightlifeItems, 6, `${seedPrefix}-nightlife`, pick, imageResolver, photomodeServiceLabel),
      '', 'grid-6-zigzag',
    ),
    buildListPage(
      'Dịch vụ', 'pine', 'DỊCH VỤ CẦN CHÚ Ý',
      'Thuê xe, đặc sản, spa và nhà xe cần lưu trước chuyến đi.',
      buildGridPageItems(pools.serviceItems, pools.serviceItems, 6, `${seedPrefix}-services`, pick, imageResolver, photomodeServiceLabel),
      '', 'grid-6-zigzag',
    ),
    buildListPage(
      'Homestay', 'pine', 'HOMESTAY ĐÀ LẠT',
      'Các chỗ nghỉ nên xem riêng để dễ chốt phòng.',
      buildGridPageItems(pools.stayItems, pools.stayItems, 6, `${seedPrefix}-homestay`, pick, imageResolver, photomodeServiceLabel),
      '', 'grid-6-zigzag',
    ),
    buildListPage(
      activityPage.chip, 'slate', activityPage.title,
      activityPage.isActivity ? 'Các hoạt động và điểm ghé được luân phiên giữa các list.' : 'Các khu du lịch nên ghim riêng khỏi nhóm check-in.',
      buildGridPageItems(activityPage.items, activityPage.items, 6, `${seedPrefix}-activity`, pick, imageResolver, (item) => item.type),
      '', 'grid-6-zigzag',
    ),
  ];
}

export function buildGrid6QuaytungPages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
  coverImageUrls: string[] = [],
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(
    imageUrls,
    libraryEntries,
    `${seedPrefix}:grid-6-quaytung`,
    mappedImageUrls,
    globalUsedImageUrls || [],
    { orientation: 'any', strictMapping: true },
  );
  const background = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const coverBackground = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const activityPage = finalActivityPagePool(pools, seedPrefix);
  const nightlifeItems = pageReadyNightlifeItems(pools.nightlifeItems);

  return [
    {
      ...buildCoverPage(
        'List này toàn địa điểm "vuýp"',
        'Lưu list này cho chuyến đi thành công',
        coverBackground(`${seedPrefix}-cover`),
      ),
      layoutVariant: 'grid-6-quaytung-cover',
    },
    buildListPage(
      'Quán ăn',
      'berry',
      'MÓN NGON',
      '6 quán ăn gom riêng để chọn bữa nhanh.',
      buildGridPageItems(pools.foodItems, pools.foodItems, 6, `${seedPrefix}-food`, pick, imageResolver, mealLabelForItem),
      background(`${seedPrefix}-food-bg`),
      'grid-6-quaytung',
    ),
    buildListPage(
      'Cà phê',
      'gold',
      'CAFE',
      'View cực chill, săn mây đỉnh',
      buildGridPageItems(pools.cafeItems, pools.cafeItems, 6, `${seedPrefix}-cafe`, pick, imageResolver, (item) => item.type),
      background(`${seedPrefix}-cafe-bg`),
      'grid-6-quaytung',
    ),
    buildListPage(
      'Check-in',
      'terracotta',
      'MẢNG XANH',
      '6 điểm check-in hòa mình thiên nhiên siu đẹp.',
      buildBalancedCheckinGridItems(pools.checkinItems, 6, `${seedPrefix}-checkin`, pick, imageResolver),
      background(`${seedPrefix}-checkin-bg`),
      'grid-6-quaytung',
    ),
    buildListPage(
      'Chơi đêm',
      'slate',
      'CHƠI ĐÊM',
      'Các điểm đi buổi tối, ăn đêm và nghe nhạc dễ lưu sau 20h.',
      buildGridPageItems(nightlifeItems, nightlifeItems, 6, `${seedPrefix}-nightlife`, pick, imageResolver, photomodeServiceLabel),
      background(`${seedPrefix}-nightlife-bg`),
      'grid-6-quaytung',
    ),
    buildListPage(
      'Dịch vụ',
      'pine',
      'TIỆN ÍCH',
      'Thuê xe, đặc sản, spa và nhà xe cần lưu trước chuyến đi.',
      buildGridPageItems(pools.serviceItems, pools.serviceItems, 6, `${seedPrefix}-services`, pick, imageResolver, photomodeServiceLabel),
      background(`${seedPrefix}-services-bg`),
      'grid-6-quaytung',
    ),
    buildListPage(
      'Homestay',
      'pine',
      'HOMESTAY',
      'Các chỗ nghỉ nên xem riêng để dễ chốt phòng.',
      buildGridPageItems(pools.stayItems, pools.stayItems, 6, `${seedPrefix}-homestay`, pick, imageResolver, photomodeServiceLabel),
      background(`${seedPrefix}-homestay-bg`),
      'grid-6-quaytung',
    ),
    buildListPage(
      activityPage.chip,
      'slate',
      activityPage.isActivity ? 'HOẠT ĐỘNG' : 'KHU DU LỊCH',
      activityPage.isActivity
        ? 'Các hoạt động và điểm ghé luân phiên giữa các list.'
        : 'Các khu du lịch nên ghim riêng khỏi nhóm check-in.',
      buildGridPageItems(activityPage.items, activityPage.items, 6, `${seedPrefix}-activity`, pick, imageResolver, (item) => item.type),
      background(`${seedPrefix}-activity-bg`),
      'grid-6-quaytung',
    ),
  ];
}

function buildGrid6Pages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
  coverImageUrls: string[] = [],
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:grid-6`, mappedImageUrls, globalUsedImageUrls || [], { orientation: 'any', strictMapping: true });
  const background = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const coverBackground = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const activityPage = finalActivityPagePool(pools, seedPrefix);
  const nightlifeItems = pageReadyNightlifeItems(pools.nightlifeItems);

  return [
    {
      ...buildCoverPage(
        'TOP 6 ĐỊA ĐIỂM ĐÀ LẠT',
        'Một bộ gợi ý ngắn, dễ quét nhanh để chọn điểm đi, quán ăn và góc chụp trong ngày.',
        coverBackground(`${seedPrefix}-cover`),
      ),
      layoutVariant: 'grid-6',
    },
    buildListPage(
      'Quán ăn',
      'berry',
      'QUÁN ĂN ĐÀ LẠT',
      '6 quán ăn được gom riêng để người xem chọn bữa nhanh.',
      buildGridPageItems(pools.foodItems, pools.foodItems, 6, `${seedPrefix}-food`, pick, imageResolver, mealLabelForItem),
      '',
      'grid-6',
    ),
    buildListPage(
      'Cà phê',
      'gold',
      'QUÁN CAFE ĐÀ LẠT',
      'View cực chill, săn mây đỉnh',
      buildGridPageItems(pools.cafeItems, pools.cafeItems, 6, `${seedPrefix}-cafe`, pick, imageResolver, (item) => item.type),
      '',
      'grid-6',
    ),
    buildListPage(
      'Check-in',
      'terracotta',
      'ĐỊA ĐIỂM CHECK-IN',
      '6 địa điểm check-in được tách riêng để người xem lưu nhanh.',
      buildBalancedCheckinGridItems(pools.checkinItems, 6, `${seedPrefix}-checkin`, pick, imageResolver),
      '',
      'grid-6',
    ),
    buildListPage(
      'Chơi đêm',
      'slate',
      'CHƠI ĐÊM ĐÀ LẠT',
      'Các điểm đi buổi tối, ăn đêm và nghe nhạc được tách riêng để dễ lưu sau 20h.',
      buildGridPageItems(nightlifeItems, nightlifeItems, 6, `${seedPrefix}-nightlife`, pick, imageResolver, photomodeServiceLabel),
      '',
      'grid-6',
    ),
    buildListPage(
      'Dịch vụ',
      'pine',
      'DỊCH VỤ CẦN CHÚ Ý',
      'Thuê xe, đặc sản, spa, thuê đồ và nhà xe cần lưu trước chuyến đi.',
      buildGridPageItems(pools.serviceItems, pools.serviceItems, 6, `${seedPrefix}-services`, pick, imageResolver, photomodeServiceLabel),
      '',
      'grid-6',
    ),
    buildListPage(
      'Homestay',
      'pine',
      'HOMESTAY ĐÀ LẠT',
      'Các chỗ nghỉ nên xem riêng để dễ chốt phòng, không trộn với dịch vụ khác.',
      buildGridPageItems(pools.stayItems, pools.stayItems, 6, `${seedPrefix}-homestay`, pick, imageResolver, photomodeServiceLabel),
      '',
      'grid-6',
    ),
    buildListPage(
      activityPage.chip,
      'slate',
      activityPage.title,
      activityPage.isActivity ? 'Các hoạt động và điểm ghé được luân phiên với trang khu du lịch giữa các list.' : 'Các khu du lịch nên ghim riêng khỏi nhóm check-in.',
      buildGridPageItems(activityPage.items, activityPage.items, 6, `${seedPrefix}-activity`, pick, imageResolver, (item) => item.type),
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
  coverImageUrls: string[] = [],
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:grid-8`, mappedImageUrls, globalUsedImageUrls || [], { orientation: 'any', strictMapping: true });
  const background = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const coverBackground = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const activityPage = finalActivityPagePool(pools, seedPrefix);
  const nightlifeItems = pageReadyNightlifeItems(pools.nightlifeItems);
  const contentPages = [
    buildListPage(
      'Quán ăn',
      'berry',
      '8 QUÁN ĂN ĐÀ LẠT',
      'Nhóm quán ăn được gom gọn để người xem chọn nhanh.',
      buildGrid8PageItems(pools.foodItems, pools.foodItems, 8, `${seedPrefix}-food`, pick, imageResolver, mealLabelForItem),
      background(`${seedPrefix}-food-center`),
      'grid-8',
    ),
    buildListPage(
      'Cafe',
      'gold',
      '8 QUÁN CAFE',
      'Gợi ý quán ngồi chill, dễ lưu trước khi đi.',
      buildGrid8PageItems(pools.cafeItems, pools.cafeItems, 8, `${seedPrefix}-cafe`, pick, imageResolver, (item) => item.type),
      background(`${seedPrefix}-cafe-center`),
      'grid-8',
    ),
    buildListPage(
      'Check-in',
      'terracotta',
      '8 ĐIỂM CHECK-IN',
      'Một trang scan nhanh 8 điểm, ưu tiên ảnh rõ và tên ngắn.',
      buildBalancedCheckinGrid8Items(pools.checkinItems, 8, `${seedPrefix}-checkin`, pick, imageResolver),
      background(`${seedPrefix}-checkin-center`),
      'grid-8',
    ),
    buildListPage(
      'Chơi đêm',
      'slate',
      '8 ĐIỂM CHƠI ĐÊM',
      'Các điểm đi buổi tối, ăn đêm và nghe nhạc được tách riêng để dễ lưu sau 20h.',
      buildGrid8PageItems(nightlifeItems, nightlifeItems, 8, `${seedPrefix}-nightlife`, pick, imageResolver, photomodeServiceLabel),
      background(`${seedPrefix}-nightlife-center`),
      'grid-8',
    ),
    buildListPage(
      'Dịch vụ',
      'pine',
      '8 LƯU Ý CẦN NHỚ',
      'Các dịch vụ hỗ trợ chuyến đi được tách riêng để người xem dễ liên hệ nhanh.',
      buildGrid8PageItems(pools.serviceItems, pools.serviceItems, 8, `${seedPrefix}-services`, pick, imageResolver, photomodeServiceLabel),
      background(`${seedPrefix}-services-center`),
      'grid-8',
    ),
    buildListPage(
      'Homestay',
      'pine',
      '8 HOMESTAY ĐÀ LẠT',
      'Các chỗ nghỉ nên xem riêng để dễ chốt phòng, không trộn với dịch vụ khác.',
      buildGrid8PageItems(pools.stayItems, pools.stayItems, 8, `${seedPrefix}-homestay`, pick, imageResolver, photomodeServiceLabel),
      background(`${seedPrefix}-homestay-center`),
      'grid-8',
    ),
    buildListPage(
      activityPage.chip,
      'slate',
      activityPage.isActivity ? '8 HOẠT ĐỘNG ĐÀ LẠT' : '8 KHU DU LỊCH ĐÀ LẠT',
      activityPage.isActivity ? 'Các hoạt động và điểm ghé được luân phiên với trang khu du lịch giữa các list.' : 'Các khu du lịch được tách riêng khỏi trang check-in.',
      buildGrid8PageItems(activityPage.items, activityPage.items, 8, `${seedPrefix}-activity`, pick, imageResolver, (item) => item.type),
      background(`${seedPrefix}-activity-center`),
      'grid-8',
    ),
  ];

  return [
    {
      ...buildCoverPage(
        `${cityLabelUpper()} – MỖI GÓC PHỐ LÀ MỘT BỨC TRANH`,
        'List điểm đáng lưu để đi chơi đỡ phải mò từng nơi.',
        coverBackground(`${seedPrefix}-cover`),
      ),
      layoutVariant: 'grid-8',
    },
    ...contentPages,
  ];
}

export function buildGrid8QuaytungPages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
  coverImageUrls: string[] = [],
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(
    imageUrls,
    libraryEntries,
    `${seedPrefix}:grid-8-quaytung`,
    mappedImageUrls,
    globalUsedImageUrls || [],
    { orientation: 'any', strictMapping: true },
  );
  const background = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const coverBackground = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const nightlifeItems = pageReadyNightlifeItems(pools.nightlifeItems);

  type GridConfig = {
    chipText: string;
    chipTone: AccentTone;
    hook: string;
    tagline: string;
    seed: string;
    pool: GuideItem[];
    label?: (item: GuideItem) => string;
    checkin?: boolean;
  };

  // Trước đây 3/5 trang lưới (CAFE SÁNG, CHẤT LIỆU, CAFE ĐẸP) đều lấy từ cùng pools.cafeItems
  // (chỉ khác tên hook, không lọc phân nhóm thật) → pool cà phê không đủ 24 chỗ riêng biệt nên
  // bị lặp lại nhiều lần (vd. "1/2 Circle Coffee", "Mê Lá") và người dùng thấy mẫu "chỉ chuyên cà phê".
  // Đổi 2 trang trùng cà phê sang Chơi đêm + Homestay để cân bằng chủ đề như các mẫu grid-6/grid-8 khác,
  // đồng thời chỉ giữ 1 trang Cafe nên pool đủ lớn để không phải lặp ảnh/tên trong cùng 1 list.
  const gridConfigs: GridConfig[] = [
    {
      chipText: 'Cafe sáng',
      chipTone: 'gold',
      hook: 'CAFE SÁNG',
      tagline: 'những quán cafe local vừa chill vừa có gu',
      seed: '-cafe-sang',
      pool: pools.dayCafeItems.length > 0 ? pools.dayCafeItems : pools.cafeItems,
      label: (item) => item.type || 'Cafe',
    },
    {
      chipText: 'Check-in',
      chipTone: 'terracotta',
      hook: 'MẢNG XANH',
      tagline: 'địa điểm hòa mình với thiên nhiên siu đẹp',
      seed: '-mang-xanh',
      pool: pools.checkinItems,
      checkin: true,
    },
    {
      chipText: 'Chơi đêm',
      chipTone: 'slate',
      hook: 'CHƠI ĐÊM',
      tagline: 'ăn đêm, nghe nhạc, quẩy nhẹ sau 20h',
      seed: '-choi-dem',
      pool: nightlifeItems,
      label: photomodeServiceLabel,
    },
    {
      chipText: 'Homestay',
      chipTone: 'pine',
      hook: 'CHỖ NGHỈ XINH',
      tagline: 'homestay đẹp nên ghim riêng để dễ chốt phòng',
      seed: '-homestay',
      pool: pools.stayItems,
      label: photomodeServiceLabel,
    },
    {
      chipText: 'Ăn vặt',
      chipTone: 'berry',
      hook: 'ĂN VẶT',
      tagline: 'tổng hợp quán ăn vặt ngon cho hệ thích mukbang',
      seed: '-an-vat',
      pool: pools.lightMealItems.length > 0 ? pools.lightMealItems : pools.foodItems,
      label: mealLabelForItem,
    },
  ];

  // Không cho cùng tên địa điểm xuất hiện ở nhiều trang (vd. D'Lart vừa cafe vừa quán ăn — khác id sheet).
  const listUsedKeys = new Set<string>();
  const scopedPool = (pool: GuideItem[]) => pool.filter((item) => !hasItemKey(listUsedKeys, item));
  const markPicked = (picked: GuideItem[]) => {
    picked.forEach((item) => markItemKey(listUsedKeys, item));
  };

  const gridPages = gridConfigs.map((cfg) => {
    const pageSeed = `${seedPrefix}${cfg.seed}`;
    const basePool = cfg.checkin ? pools.checkinItems : cfg.pool;
    const picked = cfg.checkin
      ? pickWithUsedFallback(balancedCheckinPool(scopedPool(basePool), 8, pageSeed), 8, pageSeed, pick)
      : pickGrid8ItemsWithPartnerQuota(scopedPool(basePool), scopedPool(basePool), 8, pageSeed, pick, GRID_8_QUAYTUNG_PARTNER_CAP);
    markPicked(picked);
    const items = picked.map((item) =>
      cfg.checkin
        ? photomodePageItemWithResolver(item, '', imageResolver)
        : photomodePageItemWithResolver(item, (cfg.label || mealLabelForItem)(item), imageResolver),
    );
    return buildListPage(
      cfg.chipText,
      cfg.chipTone,
      cfg.hook,
      cfg.tagline,
      items,
      background(`${seedPrefix}${cfg.seed}-bg`),
      'grid-8-quaytung',
    );
  });

  const menuSections = [
    { title: 'QUÁN ĂN SÁNG', pool: pools.morningFoodItems.length > 0 ? pools.morningFoodItems : pools.daytimeFoodItems, count: 7, seed: '-menu-sang' },
    { title: 'CƠM NHÀ SIU NGON', pool: pools.lunchItems.length > 0 ? pools.lunchItems : pools.daytimeFoodItems, count: 5, seed: '-menu-com' },
    { title: 'MẤY MÓN NGON KHÁC', pool: pools.lightMealItems.length > 0 ? pools.lightMealItems : pools.foodItems, count: 5, seed: '-menu-khac' },
    { title: 'BBQ - LẨU NƯỚNG', pool: pools.grillHotpotItems.length > 0 ? pools.grillHotpotItems : pools.dinnerItems, count: 7, seed: '-menu-bbq' },
  ];
  const menuItems: PageItem[] = [];
  for (const section of menuSections) {
    const picked = pickMixedItemsWithPartnerQuota(
      scopedPool(section.pool),
      section.count,
      `${seedPrefix}${section.seed}`,
      pick,
      GRID_8_QUAYTUNG_PARTNER_CAP,
    );
    markPicked(picked);
    const sectionPages = picked.map((item) => pageItemWithResolver(item, section.title, imageResolver));
    const photoIndex = sectionPages.findIndex((item) => hasDisplayText(item.imageUrl));
    sectionPages.forEach((item, index) => {
      menuItems.push(index === photoIndex ? item : pageItemMenuTextOnly(picked[index], section.title));
    });
  }

  const menuPage = buildListPage(
    'Ăn uống',
    'berry',
    'ĐỊA ĐIỂM ĂN UỐNG NGON',
    'Tổng hợp quán ăn theo buổi để lưu nhanh.',
    menuItems,
    '',
    'grid-8-quaytung-menu',
  );

  return [
    {
      ...buildCoverPage(
        'List này toàn địa điểm "vuýp"',
        'Lưu list này cho chuyến đi thành công',
        coverBackground(`${seedPrefix}-cover`),
      ),
      layoutVariant: 'grid-8-quaytung-cover',
    },
    ...gridPages,
    menuPage,
  ];
}

// ─── Grid 4 Mutant ──────────────────────────────────────────────────────────────

const MUTANT_COVER_PLACEMENTS: TitlePlacement[] = [
  'top-left', 'top-right', 'bottom-left', 'bottom-right',
  'mid-left', 'mid-right', 'top-center', 'bottom-center',
];

const MUTANT_CONTENT_STYLES: MutantContentStyle[] = ['strip', 'center-card'];

function randomMutantCoverPlacement(): TitlePlacement {
  return MUTANT_COVER_PLACEMENTS[Math.floor(Math.random() * MUTANT_COVER_PLACEMENTS.length)];
}

function randomMutantContentStyle(): MutantContentStyle {
  return MUTANT_CONTENT_STYLES[Math.floor(Math.random() * MUTANT_CONTENT_STYLES.length)];
}

function buildGrid4MutantPages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
  coverImageUrls: string[] = [],
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:grid-4-mutant`, mappedImageUrls, globalUsedImageUrls || [], { orientation: 'any', strictMapping: true });
  const background = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const coverBackground = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const activityPage = finalActivityPagePool(pools, seedPrefix);
  const nightlifeItems = pageReadyNightlifeItems(pools.nightlifeItems);

  const contentPages: ListPage[] = [
    buildListPage(
      'Quán ăn', 'berry', 'MÓN NGON ĐÀ LẠT',
      '4 quán ăn được gom riêng để người xem chọn bữa nhanh.',
      buildGridPageItems(pools.foodItems, pools.foodItems, 4, `${seedPrefix}-food`, pick, imageResolver, mealLabelForItem),
      background(`${seedPrefix}-food-cover-bg`), 'grid-4-mutant',
    ),
    buildListPage(
      'Cà phê', 'gold', 'QUÁN CAFE ĐÀ LẠT',
      '4 quán cafe được tách riêng khỏi nhóm quán ăn.',
      buildGridPageItems(pools.cafeItems, pools.cafeItems, 4, `${seedPrefix}-cafe`, pick, imageResolver, (item) => item.type),
      background(`${seedPrefix}-cafe-cover-bg`), 'grid-4-mutant',
    ),
    buildListPage(
      'Check-in', 'terracotta', 'ĐỊA ĐIỂM CHECK-IN',
      '4 địa điểm check-in rõ nhóm, không trộn khu du lịch.',
      buildBalancedCheckinGridItems(pools.checkinItems, 4, `${seedPrefix}-checkin`, pick, imageResolver),
      background(`${seedPrefix}-checkin-cover-bg`), 'grid-4-mutant',
    ),
    buildListPage(
      'Chơi đêm', 'slate', 'CHƠI ĐÊM ĐÀ LẠT',
      'Các điểm đi buổi tối, nghe nhạc, ăn đêm và lên kế hoạch sau 20h.',
      buildGridPageItems(nightlifeItems, nightlifeItems, 4, `${seedPrefix}-nightlife`, pick, imageResolver, photomodeServiceLabel),
      background(`${seedPrefix}-nightlife-cover-bg`), 'grid-4-mutant',
    ),
    buildListPage(
      'Dịch vụ', 'pine', 'DỊCH VỤ CẦN CHÚ Ý',
      'Lưu trú, thuê xe & quà tặng',
      buildGridPageItems(pools.serviceItems, pools.serviceItems, 4, `${seedPrefix}-services`, pick, imageResolver, photomodeServiceLabel),
      background(`${seedPrefix}-services-cover-bg`), 'grid-4-mutant',
    ),
    buildListPage(
      'Homestay', 'pine', 'HOMESTAY ĐÀ LẠT',
      'Các chỗ nghỉ nên xem riêng để dễ chốt phòng, không trộn với dịch vụ khác.',
      buildGridPageItems(pools.stayItems, pools.stayItems, 4, `${seedPrefix}-homestay`, pick, imageResolver, photomodeServiceLabel),
      background(`${seedPrefix}-homestay-cover-bg`), 'grid-4-mutant',
    ),
    buildListPage(
      activityPage.chip, 'slate', activityPage.title,
      activityPage.isActivity ? 'Các hoạt động và điểm ghé được luân phiên với trang khu du lịch giữa các list.' : 'Các khu du lịch được tách riêng khỏi check-in.',
      buildGridPageItems(activityPage.items, activityPage.items, 4, `${seedPrefix}-activity`, pick, imageResolver, (item) => item.type),
      background(`${seedPrefix}-activity-cover-bg`), 'grid-4-mutant',
    ),
  ];

  // Assign random content style to each page
  for (const page of contentPages) {
    page.contentStyle = randomMutantContentStyle();
  }

  const coverPage: CoverPage = {
    ...buildCoverPage(
      'TOP 4 ĐỊA ĐIỂM ĐÀ LẠT',
      'Mẫu đột biến — title xuất hiện ngẫu nhiên, mỗi trang một phong cách riêng.',
      coverBackground(`${seedPrefix}-cover`),
    ),
    layoutVariant: 'grid-4-mutant',
    titlePlacement: randomMutantCoverPlacement(),
  };

  return [coverPage, ...contentPages];
}

export function buildGrid4Pages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
  coverImageUrls: string[] = [],
  itemsPerPage = 4,
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:grid-4`, mappedImageUrls, globalUsedImageUrls || [], { orientation: 'any', strictMapping: true });
  const background = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const coverBackground = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const activityPage = finalActivityPagePool(pools, seedPrefix);
  const nightlifeItems = pageReadyNightlifeItems(pools.nightlifeItems);
  const contentPages = [
    buildListPage(
      'Quán ăn',
      'berry',
      'MÓN NGON ĐÀ LẠT',
      '4 quán ăn được gom riêng để người xem chọn bữa nhanh.',
      buildGridPageItems(pools.foodItems, pools.foodItems, itemsPerPage, `${seedPrefix}-food`, pick, imageResolver, mealLabelForItem),
      background(`${seedPrefix}-food-cover-bg`),
      'grid-4',
    ),
    buildListPage(
      'Cà phê',
      'gold',
      'QUÁN CAFE ĐÀ LẠT',
      '4 quán cafe được tách riêng khỏi nhóm quán ăn.',
      buildGridPageItems(pools.cafeItems, pools.cafeItems, itemsPerPage, `${seedPrefix}-cafe`, pick, imageResolver, (item) => item.type),
      background(`${seedPrefix}-cafe-cover-bg`),
      'grid-4',
    ),
    buildListPage(
      'Check-in',
      'terracotta',
      'ĐỊA ĐIỂM CHECK-IN',
      '4 địa điểm check-in rõ nhóm, không trộn khu du lịch.',
      buildBalancedCheckinGridItems(pools.checkinItems, itemsPerPage, `${seedPrefix}-checkin`, pick, imageResolver),
      background(`${seedPrefix}-checkin-cover-bg`),
      'grid-4',
    ),
    buildListPage(
      'Chơi đêm',
      'slate',
      'CHƠI ĐÊM ĐÀ LẠT',
      'Các điểm đi buổi tối, nghe nhạc, ăn đêm và lên kế hoạch sau 20h.',
      buildGridPageItems(nightlifeItems, nightlifeItems, itemsPerPage, `${seedPrefix}-nightlife`, pick, imageResolver, photomodeServiceLabel),
      background(`${seedPrefix}-nightlife-cover-bg`),
      'grid-4',
    ),
    buildListPage(
      'Dịch vụ',
      'pine',
      'DỊCH VỤ CẦN CHÚ Ý',
      'Lưu trú, thuê xe & quà tặng',
      buildGridPageItems(pools.serviceItems, pools.serviceItems, itemsPerPage, `${seedPrefix}-services`, pick, imageResolver, photomodeServiceLabel),
      background(`${seedPrefix}-services-cover-bg`),
      'grid-4',
    ),
    buildListPage(
      'Homestay',
      'pine',
      'HOMESTAY ĐÀ LẠT',
      'Các chỗ nghỉ nên xem riêng để dễ chốt phòng, không trộn với dịch vụ khác.',
      buildGridPageItems(pools.stayItems, pools.stayItems, itemsPerPage, `${seedPrefix}-homestay`, pick, imageResolver, photomodeServiceLabel),
      background(`${seedPrefix}-homestay-cover-bg`),
      'grid-4',
    ),
    buildListPage(
      activityPage.chip,
      'slate',
      activityPage.title,
      activityPage.isActivity ? 'Các hoạt động và điểm ghé được luân phiên với trang khu du lịch giữa các list.' : 'Các khu du lịch được tách riêng khỏi check-in.',
      buildGridPageItems(activityPage.items, activityPage.items, itemsPerPage, `${seedPrefix}-activity`, pick, imageResolver, (item) => item.type),
      background(`${seedPrefix}-activity-cover-bg`),
      'grid-4',
    ),
  ];

  return [
    {
      ...buildCoverPage(
        'TOP 4 ĐỊA ĐIỂM ĐÀ LẠT',
        'Biến thể lưới gọn, mỗi trang 4 hình để xem rõ tên điểm, ảnh và vị trí trước khi chọn.',
        coverBackground(`${seedPrefix}-cover`),
      ),
      layoutVariant: 'grid-4',
    },
    ...contentPages,
  ];
}

function stripChipPrefixFromGridTitle(chipText: string, title: string): string {
  const chip = String(chipText || '').trim();
  const raw = String(title || '').trim();
  if (!raw) return '';
  if (!chip) return raw;
  const lowerTitle = raw.toLowerCase();
  const lowerChip = chip.toLowerCase();
  if (lowerTitle === lowerChip) return '';
  if (lowerTitle.startsWith(`${lowerChip} - `)) return raw.slice(chip.length + 3).trim();
  if (lowerTitle.startsWith(`${lowerChip}-`)) return raw.slice(chip.length + 1).trim();
  if (lowerTitle.startsWith(lowerChip)) return raw.slice(chip.length).replace(/^[\s\-–—:]+/, '').trim();
  return raw;
}

function tuneGrid5ListPageTitles(pages: DeckPage[]): DeckPage[] {
  return pages.map((page) => {
    if (page.type !== 'list') return page;
    const listPage = page as ListPage;
    const stripped = stripChipPrefixFromGridTitle(listPage.chipText || '', listPage.title || '');
    if (!stripped || stripped === listPage.title) return page;
    return { ...listPage, title: stripped };
  });
}

/** Mẫu 5 = mẫu 4 + 1 địa điểm/trang; list dùng lưới 2×3 (ô title + 5 ảnh). */
export function buildGrid5Pages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
  coverImageUrls: string[] = [],
): DeckPage[] {
  const pages = buildGrid4Pages(
    pools,
    imageUrls,
    libraryEntries,
    seedPrefix,
    globalUsedItemIds,
    globalUsedImageUrls,
    coverImageUrls,
    5,
  );

  return tuneGrid5ListPageTitles(
    pages.map((page) => {
      if (page.type === 'cover') {
        return {
          ...page,
          layoutVariant: 'grid-5',
          title: 'Dalat',
          subtitle: 'Tháng 5+6 nên đi đâu? Làm gì?',
        } satisfies CoverPage;
      }
      if (page.type === 'list') {
        const listPage = page as ListPage;
        return {
          ...listPage,
          layoutVariant: 'grid-5',
          backgroundImage: '',
        } satisfies ListPage;
      }
      return page;
    }),
  );
}

const POV_3_V2_STACK_PARTNER_CAP = 2;
const POV_3_V2_SERVICE_HOMESTAY_SLOTS = 2;

const POV_3_V2_CAFE_GRID_TITLES = [
  'Những chiếc quán cafe xinh',
  'Quán cafe chill đáng ghé',
  'Góc cafe Đà Lạt nên lưu',
  'Các quán cafe có view đẹp',
  'Cafe xinh nhất nên check-in',
  'Quán cafe ấm cúng ở Đà Lạt',
  'Những góc cafe dễ chụp',
  'Cafe hidden gem ở Đà Lạt',
  'Quán cafe vintage đáng thử',
  'Top quán cafe nên ghé',
];

const POV_3_V2_FOOD_GRID_TITLES = [
  'các quán ăn ngon',
  'quán ăn đáng thử nhất',
  'món ngon Đà Lạt nên ăn',
  'những quán ăn nổi bật',
  'quán ăn local đáng ghé',
  'địa chỉ ăn uống không thể bỏ',
  'quán ăn ngon giá hợp lý',
  'top quán ăn nên check-in',
  'quán ăn view đẹp ở Đà Lạt',
  'những món ngon phải thử',
];

function pickPov3V2RotatingTitle(variants: string[], seed: string, slot: string): string {
  if (!variants.length) return '';
  const index = stableHash(`${seed}:${slot}`) % variants.length;
  return variants[index] || variants[0];
}

function pov3V2PriceLabel(item: GuideItem): string {
  if (item.sectionKey === 'check_in' || item.sectionKey === 'khu_du_lich') {
    return isFreeCheckinItem(item) ? 'Free' : 'Có phí';
  }
  const clean = displayPrice(item);
  if (!clean || isFreePrice(clean)) return 'Free';
  return 'Có phí';
}

function pov3V2Tagline(item: GuideItem): string {
  return String(item.highlight || item.style || '').replace(/\s+/g, ' ').trim();
}

function isCompletePov3V2Tagline(text: string): boolean {
  const t = String(text || '').trim();
  if (t.length < 18) return false;
  if (!/[.!?…]$/.test(t)) return false;
  return !POV3_V2_TAGLINE_TRAILING_FRAGMENT.test(t);
}

function buildFallbackPov3V2Tagline(item: GuideItem): string {
  const name = String(item.name || 'địa điểm này').trim();
  if (item.sectionKey === 'check_in') {
    return `${name} là góc check-in nổi bật ở Đà Lạt, dễ chụp và dễ ghép vào lịch đi.`;
  }
  if (item.sectionKey === 'khu_du_lich' || item.sectionKey === 'hoat_dong') {
    return `${name} — điểm tham quan đáng ghé nếu bạn thích view rộng và không gian chill.`;
  }
  if (item.sectionKey === 'cafe') {
    return `${name} hợp để ghé nghỉ chân, chụp vài tấm rồi tiếp tục lịch đi Đà Lạt.`;
  }
  return `Ghé ${name} nếu muốn thêm một điểm dừng gọn trong chuyến đi Đà Lạt.`;
}

function highlightLooksTruncated(raw: string): boolean {
  const t = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!t) return true;
  if (!/[.!?…]$/.test(t)) return true;
  return POV3_V2_TAGLINE_TRAILING_FRAGMENT.test(t);
}

export function finalizePov3V2Tagline(item: GuideItem): string {
  const raw = pov3V2Tagline(item);
  if (highlightLooksTruncated(raw)) {
    return truncatePov3V2StackTagline(buildFallbackPov3V2Tagline(item));
  }
  const fromHighlight = truncatePov3V2StackTagline(raw);
  if (isCompletePov3V2Tagline(fromHighlight)) return fromHighlight;
  return truncatePov3V2StackTagline(buildFallbackPov3V2Tagline(item));
}

function pov3V2PageItem(
  item: GuideItem,
  resolveImage: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
  options: { foodGrid?: boolean } = {},
): PageItem {
  const resolvedImage = resolveImage(item);
  const tagline = finalizePov3V2Tagline(item);
  return {
    label: tagline,
    id: item.id,
    sourceKey: itemUsageKey(item),
    sourceSectionKey: item.sectionKey,
    name: item.name,
    metaPrimary: item.address || 'Đang cập nhật',
    metaSecondary: pov3V2PriceLabel(item),
    imageUrl: resolvedImage.imageUrl,
    imageMapped: resolvedImage.imageMapped,
    imageSource: resolvedImage.imageSource,
    imageNote: tagline,
    candidateImageUrls: resolvedImage.candidateImageUrls,
    isPartner: item.isPartner,
    rawName: item.name,
  };
}

function buildPov3V2StackItems(
  pool: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
  resolveImage: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
): PageItem[] {
  const picked = ensureGuideItemCount(
    pickPhotomodeItemsWithQuota(pool, count, seed, pick),
    pool,
    count,
    `${seed}-stack`,
  );
  return picked.slice(0, count).map((item) => pov3V2PageItem(item, resolveImage));
}

function buildPov3V2StackItemsWithPartner(
  pool: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
  resolveImage: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
  partnerCap = POV_3_V2_STACK_PARTNER_CAP,
): PageItem[] {
  const picked = ensureGuideItemCount(
    pickMixedItemsWithPartnerQuota(pool, count, seed, pick, partnerCap),
    pool,
    count,
    `${seed}-stack`,
  );
  return picked.slice(0, count).map((item) => pov3V2PageItem(item, resolveImage));
}

function buildPov3V2ServiceGridItems(
  pools: DeckBuildPools,
  count: number,
  seed: string,
  pick: PickFn,
  resolveImage: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
): PageItem[] {
  const stayPool = dedupeItems(pools.stayItems);
  const homestayPicked = stayPool.length > 0
    ? pickPartnerBalancedItems(
      stayPool,
      stayPool,
      Math.min(POV_3_V2_SERVICE_HOMESTAY_SLOTS, count),
      POV_3_V2_SERVICE_HOMESTAY_SLOTS,
      `${seed}-homestay`,
      pick,
      true,
    )
    : [];
  const homestayIds = new Set(homestayPicked.map((item) => item.id));
  const remaining = count - homestayPicked.length;
  const servicePool = dedupeItems(pools.serviceItems).filter((item) => !homestayIds.has(item.id));
  const servicePicked = remaining > 0
    ? pickMixedItemsWithPartnerQuota(servicePool, remaining, `${seed}-services`, pick, POV_3_V2_GRID_PARTNER_CAP)
    : [];
  return shuffleItems([...homestayPicked, ...servicePicked], `${seed}-mix`)
    .slice(0, count)
    .map((item) => pov3V2PageItem(item, resolveImage));
}

function buildPov3V2GridItems(
  primaryItems: GuideItem[],
  fallbackItems: GuideItem[],
  count: number,
  seed: string,
  pick: PickFn,
  resolveImage: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
  foodGrid = false,
): PageItem[] {
  return pickGrid8ItemsWithPartnerQuota(primaryItems, fallbackItems, count, seed, pick, POV_3_V2_CAFE_FOOD_PARTNER_CAP).map((item) =>
    pov3V2PageItem(item, resolveImage, { foodGrid }),
  );
}

export function buildPov3V2Pages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
  coverImageUrls: string[] = [],
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(
    imageUrls,
    libraryEntries,
    `${seedPrefix}:pov-3-v2`,
    mappedImageUrls,
    globalUsedImageUrls || [],
    { orientation: 'any', strictMapping: true },
  );
  const resolveImage = (item: GuideItem) => imageResolver(item);
  const background = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const coverBackground = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const checkinItems = balancedCheckinPool(
    pools.dayCheckinItems.length > 0 ? pools.dayCheckinItems : pools.checkinItems,
    6,
    `${seedPrefix}-checkin-pool`,
  );
  const tourismItems = dedupeItems(
    pools.dayTourismItems.length > 0 ? pools.dayTourismItems : pools.tourismItems,
  );
  const cafeGridTitle = pickPov3V2RotatingTitle(POV_3_V2_CAFE_GRID_TITLES, seedPrefix, 'cafe-grid-title');
  const foodGridTitle = pickPov3V2RotatingTitle(POV_3_V2_FOOD_GRID_TITLES, seedPrefix, 'food-grid-title');
  const coverItem = pickSingleContextualItem(
    checkinItems,
    checkinItems,
    `${seedPrefix}-cover`,
    pick,
  )[0];
  const coverImage = coverBackground(`${seedPrefix}-cover-bg`) || (coverItem
    ? pov3V2PageItem(coverItem, resolveImage).imageUrl
    : '');

  const pages: DeckPage[] = [
    {
      ...buildCoverPage(
        'đứng đâu\ncũng đẹp',
        '[ Những địa điểm checkin mang đậm vibe Đà Lạt ]',
        coverImage,
      ),
      title: 'đứng đâu\ncũng đẹp',
      layoutVariant: 'pov-3-v2-cover',
    },
  ];

  for (let pageIndex = 0; pageIndex < 2; pageIndex += 1) {
    const stackItems = buildPov3V2StackItems(
      checkinItems,
      3,
      `${seedPrefix}-checkin-stack-${pageIndex + 1}`,
      pick,
      resolveImage,
    );
    if (stackItems.length < 3) continue;
    pages.push(buildListPage(
      'Check-in',
      'berry',
      '',
      '',
      stackItems,
      stackItems[0]?.imageUrl || background(`${seedPrefix}-checkin-stack-${pageIndex + 1}-bg`),
      'pov-3-v2-stack',
    ));
  }

  for (let pageIndex = 0; pageIndex < 2; pageIndex += 1) {
    const stackItems = buildPov3V2StackItemsWithPartner(
      tourismItems,
      3,
      `${seedPrefix}-tourism-stack-${pageIndex + 1}`,
      pick,
      resolveImage,
    );
    if (stackItems.length < 3) continue;
    pages.push(buildListPage(
      'Khu du lịch',
      'pine',
      '',
      '',
      stackItems,
      stackItems[0]?.imageUrl || background(`${seedPrefix}-tourism-stack-${pageIndex + 1}-bg`),
      'pov-3-v2-stack',
    ));
  }

  const cafeItems = buildPov3V2GridItems(
    pools.cafeItems,
    pools.cafeItems,
    9,
    `${seedPrefix}-cafe-grid`,
    pick,
    resolveImage,
    false,
  );
  if (cafeItems.length > 0) {
    pages.push(buildListPage(
      'Cafe',
      'gold',
      cafeGridTitle,
      '',
      cafeItems,
      cafeItems[0]?.imageUrl || background(`${seedPrefix}-cafe-grid-bg`),
      'pov-3-v2-grid',
    ));
  }

  const foodItems = buildPov3V2GridItems(
    pools.foodItems,
    pools.foodItems,
    9,
    `${seedPrefix}-food-grid`,
    pick,
    resolveImage,
    false,
  );
  if (foodItems.length > 0) {
    pages.push(buildListPage(
      'Quán ăn',
      'berry',
      foodGridTitle,
      '',
      foodItems,
      foodItems[0]?.imageUrl || background(`${seedPrefix}-food-grid-bg`),
      'pov-3-v2-grid',
    ));
  }

  const serviceItems = buildPov3V2ServiceGridItems(
    pools,
    9,
    `${seedPrefix}-service-grid`,
    pick,
    resolveImage,
  );
  if (serviceItems.length > 0) {
    pages.push(buildListPage(
      'Dịch vụ',
      'slate',
      'các dịch vụ cần lưu ý',
      '',
      serviceItems,
      serviceItems[0]?.imageUrl || background(`${seedPrefix}-service-grid-bg`),
      'pov-3-v2-grid',
    ));
  }

  return pages;
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
  coverImageUrls: string[] = [],
): DeckPage[] {
  if (isV2DeckId(deckId)) {
    return buildPagesForDeckV2(
      deckId,
      itemsBySection,
      imageUrls,
      libraryEntries,
      seedPrefix,
      globalUsedItemIds,
      globalUsedImageUrls,
      coverImageUrls,
    );
  }
  const pools = createDeckBuildPools(itemsBySection);
  if (deckId === 'itinerary-3n2d') return buildItineraryPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'budget-3n2d') return buildBudget3N2DPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'budget-72h-summary') return buildBudget72HSummaryPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'budget-3n2d-story') return buildBudget3N2DStoryPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'itinerary-4n3d') return buildItinerary4N3DPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'itinerary-4n2d-grid8') return buildItinerary4N2DGrid8Pages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'pov-3-day') return buildPov3DayPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'must-go') return buildMustGoPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'first-time') return buildFirstTimePages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'grid-6') return buildGrid6Pages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'grid-6-zigzag') return buildGrid6ZigzagPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'grid-8') return buildGrid8Pages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'grid-4') return buildGrid4Pages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'grid-4-mutant') return buildGrid4MutantPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'grid-5') return buildGrid5Pages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'spotlight-guide') return buildSpotlightGuidePages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  throw new Error(`Không hỗ trợ deck: ${deckId}`);
}

export function buildDecks(
  itemsBySection: WorkbookItemsBySection,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  coverImageUrls: string[] = [],
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
): GuideDeck[] {
  const common = { itemsBySection, imageUrls, libraryEntries, coverImageUrls, globalUsedItemIds, globalUsedImageUrls };
  return [
    {
      id: 'itinerary-3n2d',
      navTitle: 'Lịch trình 3N2Đ',
      title: 'Bộ trang gợi ý lịch trình 3N2Đ',
      description: 'Format này nghiêng về kiểu kể theo ngày: có cover riêng, mỗi ngày là một trang, rồi chốt thêm trang ăn sáng và dịch vụ.',
      lists: [buildDeckList('itinerary-3n2d', 'main', 'List chính', 'List lịch trình 3N2Đ', 'Danh sách ảnh chính cho bộ lịch trình 3N2Đ.', buildPagesForDeck('itinerary-3n2d', common.itemsBySection, common.imageUrls, common.libraryEntries, 'itinerary-main', common.globalUsedItemIds, common.globalUsedImageUrls, common.coverImageUrls))],
    },
    {
      id: 'budget-3n2d',
      navTitle: '72H 3N2Đ',
      title: 'Bộ trang 72H ở Đà Lạt với 3tr',
      description: 'Mẫu đang làm trước: cover theo style TikTok tham chiếu, 1 trang bảng lịch trình chi phí, 3 trang lưới 4 ảnh phía sau tập trung quán/đối tác.',
      lists: [buildDeckList('budget-3n2d', 'main', 'List chính', 'List 72H 3N2Đ', 'Danh sách ảnh chính cho mẫu 72H ngân sách 3N2Đ.', buildPagesForDeck('budget-3n2d', common.itemsBySection, common.imageUrls, common.libraryEntries, 'budget-3n2d-main', common.globalUsedItemIds, common.globalUsedImageUrls, common.coverImageUrls))],
    },
    {
      id: 'budget-72h-summary',
      navTitle: '72H Tổng hợp',
      title: 'Bộ 72H — cover + bảng tổng hợp',
      description: 'Chỉ 2 trang: cover “72H ở Đà Lạt với 3tr” và bảng lịch trình 3N2Đ (ngày, giờ, hoạt động, địa chỉ, chi phí + tổng bill).',
      lists: [buildDeckList('budget-72h-summary', 'main', 'List chính', 'List 72H tổng hợp', 'Danh sách 2 trang: cover và bảng chi phí 3N2Đ.', buildPagesForDeck('budget-72h-summary', common.itemsBySection, common.imageUrls, common.libraryEntries, 'budget-72h-summary-main', common.globalUsedItemIds, common.globalUsedImageUrls, common.coverImageUrls))],
    },
    {
      id: 'budget-3n2d-story',
      navTitle: '72H Story',
      title: budget72StoryText.deckTitle,
      description: budget72StoryText.deckDescription,
      lists: [buildDeckList('budget-3n2d-story', 'main', budget72StoryText.listLabel, budget72StoryText.listName, budget72StoryText.listDescription, buildPagesForDeck('budget-3n2d-story', common.itemsBySection, common.imageUrls, common.libraryEntries, 'budget-3n2d-story-main', common.globalUsedItemIds, common.globalUsedImageUrls, common.coverImageUrls))],
    },
    {
      id: 'itinerary-4n3d',
      navTitle: 'Lịch trình 4N3Đ',
      title: 'Bộ trang 4N3Đ kiểu travel journal',
      description: 'Format mới khác 3N2Đ: cover poster, route map, mỗi ngày có ảnh hero lớn và 5 stop nhỏ theo nhịp đi chậm.',
      lists: [buildDeckList('itinerary-4n3d', 'main', 'List chính', 'List lịch trình 4N3Đ', 'Danh sách ảnh chính cho bộ 4N3Đ thiết kế kiểu travel journal.', buildPagesForDeck('itinerary-4n3d', common.itemsBySection, common.imageUrls, common.libraryEntries, 'itinerary-4n3d-main', common.globalUsedItemIds, common.globalUsedImageUrls, common.coverImageUrls))],
    },
    {
      id: 'itinerary-4n2d-grid8',
      navTitle: 'Lịch trình 4N3Đ lưới 8',
      title: 'Bộ trang 4N3Đ dạng 8 ảnh quanh tiêu đề',
      description: 'Lịch trình 4N3Đ: mỗi ngày một trang lưới 8 ô bao quanh tiêu đề giữa, mỗi địa điểm có khung giờ cụ thể. Có thêm trang Lưu trú và Dịch vụ.',
      lists: [buildDeckList('itinerary-4n2d-grid8', 'main', 'List chính', 'List lịch trình 4N3Đ lưới 8', 'Danh sách ảnh chính cho mẫu 4N3Đ dạng 8 ảnh quanh tiêu đề, có Lưu trú và Dịch vụ.', buildPagesForDeck('itinerary-4n2d-grid8', common.itemsBySection, common.imageUrls, common.libraryEntries, 'itinerary-4n2d-grid8-main', common.globalUsedItemIds, common.globalUsedImageUrls, common.coverImageUrls))],
    },
    // POV 3 ngày: gỡ khỏi danh sách mẫu hiển thị cho người dùng — ảnh định dạng
    // ngang không chỉnh được trong layout này (giữ nguyên logic build phía trên
    // phòng khi cần dùng lại, chỉ ẩn khỏi buildDecks()).
    {
      id: 'grid-6',
      navTitle: 'Mẫu Lưới 6 Ô',
      title: 'Bộ trang bố cục lưới 2x3 (6 địa điểm)',
      description: 'Mẫu thiết kế mật độ thông tin cao, mỗi trang hiển thị 6 địa điểm theo dạng lưới 2 cột x 3 hàng.',
      lists: [buildDeckList('grid-6', 'main', 'List chính', 'List lưới 6 ô', 'Danh sách ảnh chính cho mẫu lưới 2x3.', buildPagesForDeck('grid-6', common.itemsBySection, common.imageUrls, common.libraryEntries, 'grid-6-main', common.globalUsedItemIds, common.globalUsedImageUrls, common.coverImageUrls))],
    },
    {
      id: 'grid-6-zigzag',
      navTitle: 'Mẫu Zigzag 6',
      title: 'Bộ trang zigzag 6 địa điểm',
      description: 'Biến thể từ mẫu lưới 6 ô: ảnh và text xen kẽ trái/phải kiểu scrapbook, nền sáng, có chip giá nếu có dữ liệu.',
      lists: [buildDeckList('grid-6-zigzag', 'main', 'List chính', 'List zigzag 6', 'Danh sách ảnh chính cho mẫu zigzag 6 địa điểm.', buildPagesForDeck('grid-6-zigzag', common.itemsBySection, common.imageUrls, common.libraryEntries, 'grid-6-zigzag-main', common.globalUsedItemIds, common.globalUsedImageUrls, common.coverImageUrls))],
    },
    {
      id: 'grid-8',
      navTitle: 'Mẫu Lưới 8 Ô',
      title: 'Bộ trang bố cục lưới 2x4 (8 địa điểm)',
      description: 'Biến thể dày hơn của mẫu lưới 6 ô, mỗi trang hiển thị 8 dữ liệu ảnh cùng tên và vị trí ngắn để scan nhanh.',
      lists: [buildDeckList('grid-8', 'main', 'List chính', 'List lưới 8 ô', 'Danh sách ảnh chính cho mẫu lưới 2x4.', buildPagesForDeck('grid-8', common.itemsBySection, common.imageUrls, common.libraryEntries, 'grid-8-main', common.globalUsedItemIds, common.globalUsedImageUrls, common.coverImageUrls))],
    },
    {
      id: 'grid-4',
      navTitle: 'Mẫu Lưới 4 Ô',
      title: 'Bộ trang bố cục lưới 2x2 (4 địa điểm)',
      description: 'Biến thể từ mẫu lưới 6 ô, giữ cùng phong cách hiển thị nhưng mỗi trang chỉ còn 4 hình và cân bằng đối tác/không đối tác.',
      lists: [buildDeckList('grid-4', 'main', 'List chính', 'List lưới 4 ô', 'Danh sách ảnh chính cho mẫu lưới 2x2.', buildPagesForDeck('grid-4', common.itemsBySection, common.imageUrls, common.libraryEntries, 'grid-4-main', common.globalUsedItemIds, common.globalUsedImageUrls, common.coverImageUrls))],
    },
    {
      id: 'grid-4-mutant',
      navTitle: 'Lưới 4 Đột Biến',
      title: 'Bộ trang lưới 4 ô — bản đột biến',
      description: 'Biến thể từ mẫu lưới 4 ô: bỏ header cố định, title xuất hiện ngẫu nhiên giữa trang (strip hoặc card tâm), cover title đặt ở vị trí random mỗi lần sinh.',
      lists: [buildDeckList('grid-4-mutant', 'main', 'List chính', 'List lưới 4 đột biến', 'Danh sách ảnh chính cho mẫu lưới 2x2 đột biến.', buildPagesForDeck('grid-4-mutant', common.itemsBySection, common.imageUrls, common.libraryEntries, 'grid-4-mutant-main', common.globalUsedItemIds, common.globalUsedImageUrls, common.coverImageUrls))],
    },
    {
      id: 'grid-5',
      navTitle: 'Mẫu Lưới 5 Ô',
      title: 'Bộ trang bố cục lưới 2×3 (5 địa điểm)',
      description: 'Cùng nhóm trang với Lưới 4 Ô nhưng thêm 1 địa điểm/trang (4+1=5). Lưới 2×3: ô title kem + 5 ảnh, cover @camedalat.',
      lists: [buildDeckList('grid-5', 'main', 'List chính', 'List lưới 5 ô', 'Danh sách ảnh chính cho mẫu lưới 2×3 (5 địa điểm).', buildPagesForDeck('grid-5', common.itemsBySection, common.imageUrls, common.libraryEntries, 'grid-5-main', common.globalUsedItemIds, common.globalUsedImageUrls, common.coverImageUrls))],
    },
    {
      id: 'spotlight-guide',
      navTitle: 'Mẫu Spotlight',
      title: 'Bộ trang spotlight 1 địa điểm',
      description: 'Mẫu mới gồm cover, 8 trang mỗi trang một địa điểm nổi bật, thêm 1 trang dịch vụ và 1 trang homestay dạng danh sách 7 mục.',
      lists: [buildDeckList('spotlight-guide', 'main', 'List chính', 'List spotlight Đà Lạt', 'Danh sách ảnh chính cho mẫu spotlight một dữ liệu mỗi trang.', buildPagesForDeck('spotlight-guide', common.itemsBySection, common.imageUrls, common.libraryEntries, 'spotlight-guide-main', common.globalUsedItemIds, common.globalUsedImageUrls, common.coverImageUrls))],
    },
    {
      id: 'spotlight-partner',
      navTitle: 'Spotlight Đối tác',
      title: 'Bộ trang spotlight cho 1 đối tác',
      description: 'Mẫu dành riêng cho đối tác: cover + mỗi ảnh Drive của đối tác là 1 trang spotlight + trang list đối tác liên quan. Chọn đối tác từ danh sách để sinh mẫu.',
      lists: buildSpotlightPartnerSampleLists(common.itemsBySection, common.imageUrls, common.libraryEntries, common.coverImageUrls),
    },
    // pov-3-v2: gỡ khỏi danh sách mẫu hiển thị — cùng lý do (ảnh ngang không
    // chỉnh được), giữ nguyên logic build trong deck-builder-v2, chỉ lọc ra ở đây.
    ...getV2DeckDefinitions(common).filter((deck) => deck.id !== 'pov-3-v2'),
  ];
}
