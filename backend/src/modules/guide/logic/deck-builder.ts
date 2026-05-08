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
export const ITINERARY_3N2D_TEMPLATE_VERSION = 15;
export const ITINERARY_4N3D_TEMPLATE_VERSION = 11;
export const ITINERARY_4N2D_GRID8_TEMPLATE_VERSION = 13;
export const POV_3_DAY_TEMPLATE_VERSION = 10;
export const GRID_4_TEMPLATE_VERSION = 15;
export const GRID_6_TEMPLATE_VERSION = 14;
export const GRID_8_TEMPLATE_VERSION = 13;
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

function hasDisplayText(value: string | undefined | null): boolean {
  return String(value ?? '').trim().length > 0;
}

function hasUsableImage(item: GuideItem): boolean {
  return hasDisplayText(item.imageUrl) || Boolean(item.candidateImageUrls?.some((url) => hasDisplayText(url)));
}

function hasMappedImage(item: GuideItem): boolean {
  return item.imageSource === 'manual' || item.imageSource === 'auto' || Boolean(item.imageMapped);
}

function preferMappedImageItems(items: GuideItem[]): GuideItem[] {
  const deduped = dedupeItems(items);
  const mappedItems = deduped.filter(hasMappedImage);
  return mappedItems.length > 0 ? mappedItems : deduped;
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
      title: 'HOẠT ĐỘNG ĐÀ LẠT',
      items: items.length > 0 ? items : pools.historyItems,
      isActivity: true,
    };
  }

  return {
    chip: 'Khu du lịch',
    title: 'KHU DU LỊCH ĐÀ LẠT',
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

function isDisplayReadyItem(item: GuideItem): boolean {
  return hasDisplayText(item.name)
    && hasUsableImage(item)
    && (
      hasDisplayText(item.address)
      || hasDisplayText(item.openHours)
      || hasDisplayText(item.price)
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
  const primary = item.address || 'Đang cập nhật địa chỉ';
  const secondaryParts: string[] = [];
  if (item.openHours) secondaryParts.push(`Khung giờ: ${item.openHours}`);
  if (item.price) secondaryParts.push(`Giá: ${item.price}`);
  else if (item.phone) secondaryParts.push(`Liên hệ: ${item.phone}`);
  return [primary, secondaryParts.join(' · ')];
}

function serviceMetaText(item: GuideItem): [string, string] {
  const primary = item.address || 'Đang cập nhật địa chỉ';
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
  mappedImageUrls: string[],
  imageUrls: string[],
  seed: string,
  usedImageUrls?: Set<string>,
): string {
  const coverImage = backgroundFor(coverImageUrls.filter(isPortableImageUrl), seed, usedImageUrls);
  return coverImage || portableBackgroundFor(mappedImageUrls, imageUrls, seed, usedImageUrls);
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
  return isFreePrice(item.price);
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

function seededRank(seed: string, value: string): number {
  return (stableHash(seed) ^ stableHash(value)) >>> 0;
}

function candidateScore(item: GuideItem, seed: string): { total: number; tieBreaker: number } {
  let infoScore = 0;
  if (item.openHours) infoScore += 15;
  if (item.price) infoScore += 10;
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
  const targetPartnerCount = partnerCount === 2 ? 1 : Math.min(2, combinedPartnerCount);
  return pickPartnerBalancedItems(primaryItems, fallbackItems, count, targetPartnerCount, seed, pick);
}

function pickGridItemsWithPartnerQuota(primaryItems: GuideItem[], fallbackItems: GuideItem[], count: number, seed: string, pick: PickFn): GuideItem[] {
  if (count === 4) return pickGrid4ItemsWithPartnerQuota(primaryItems, fallbackItems, count, seed, pick);
  const partnerCount = primaryItems.filter((i) => i.isPartner).length;
  const combinedPartnerCount = dedupeItems([...primaryItems, ...fallbackItems]).filter((i) => i.isPartner).length;
  const targetPartnerCount = partnerCount === 2 ? 1 : Math.min(2, partnerTargetCount(count, combinedPartnerCount));
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
    const preferredPool = preferDisplayReadyItems(slot.preferredItems, 1);
    const fallbackPool = remainingItems(preferDisplayReadyItems(slot.fallbackItems, 1), preferredPool);
    const pool = dedupeItems([...preferredPool, ...fallbackPool]);
    const partnerPool = dedupeItems([
      ...preferredPool.filter((item) => item.isPartner),
      ...(slot.allowFallbackPartner === false ? [] : fallbackPool.filter((item) => item.isPartner)),
    ]);
    let selected = partnerCount < DEFAULT_PARTNER_TARGET_PER_PAGE && partnerPool.length > 0
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
  const foodItems = itemsBySection.quan_an;
  const cafeItems = itemsBySection.cafe;
  const stayItems = itemsBySection.homestay;
  const checkinItems = itemsBySection.check_in;
  const serviceItems = itemsBySection.dich_vu;
  const nightlifeItems = itemsBySection.choi_dem;
  const nightlifeImageItems = dedupeItems([...foodItems, ...cafeItems, ...serviceItems, ...nightlifeItems].filter(isImageBackedNightlifeItem));
  const activityItems = itemsBySection.hoat_dong;
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
  const breakfastItems = morningFoodItems;
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
  coverImageUrls: string[] = [],
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:itinerary`, mappedImageUrls, globalUsedImageUrls || []);
  const background = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const coverBackground = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const displayItemCount = 8;
  const breakfastItems = pools.morningFoodItems;
  const lunchItems = pools.lightMealItems.length > 0 ? pools.lightMealItems : pools.lunchScheduleItems;
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
  coverImageUrls: string[] = [],
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:journey-4n2d-grid8`, mappedImageUrls, globalUsedImageUrls || []);
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
  const lunchItems = lightMealItems.length > 0 ? lightMealItems : pools.lunchScheduleItems;
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
        '4N2Đ ĐÀ LẠT\n8 ĐIỂM MỖI TRANG',
        'Lịch trình dạng lưới: ảnh bao quanh, tiêu đề ở giữa, mỗi điểm có thời gian rõ ràng.',
        coverBackground(`${seedPrefix}-cover`),
      ),
      layoutVariant: 'journey-4n2d-grid8',
    },
    dayPage(
      'Day 01',
      'terracotta',
      'Vào phố nhẹ nhàng',
      'Một nhịp mở đầu dễ đi, đủ ăn uống, cafe và check-in trong ngày đầu.',
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
      'Săn ảnh và bắt sáng',
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
      'Một ngày cuối gọn nhịp, vẫn đủ điểm ghé và chốt bữa tối.',
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
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:journey-4n3d`, mappedImageUrls, globalUsedImageUrls || []);
  const background = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const coverBackground = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const breakfastItems = pools.morningFoodItems;
  const lunchItems = pools.lightMealItems.length > 0 ? pools.lightMealItems : pools.lunchScheduleItems;
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
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:must-go`, mappedImageUrls, globalUsedImageUrls || []);
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
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:first-time`, mappedImageUrls, globalUsedImageUrls || []);
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
    { orientation: 'portrait' },
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
  const coverImage = coverBackground(`${seedPrefix}-cover-bg`) || (coverItem
    ? photomodePageItemWithResolver(coverItem, 'Đà Lạt', imageResolver).imageUrl
    : '');

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
  coverImageUrls: string[] = [],
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:grid-6`, mappedImageUrls, globalUsedImageUrls || []);
  const background = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const coverBackground = (seed: string) => coverBackgroundFor(coverImageUrls, mappedImageUrls, imageUrls, seed, globalUsedImageUrls);
  const pick = createListPicker(globalUsedItemIds);
  const activityPage = finalActivityPagePool(pools, seedPrefix);
  const nightlifeItems = pageReadyNightlifeItems(pools.nightlifeItems);

  return [
    {
      ...buildCoverPage(
        'TOP 6 ĐỊA ĐIỂM ĐÀ LẠT',
        'Một bộ gợi ý ngắn, dễ quét nhanh để chọn điểm đi, ăn uống và chụp hình trong ngày.',
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
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:grid-8`, mappedImageUrls, globalUsedImageUrls || []);
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
        'ĐÀ LẠT 8 ĐIỂM / 1 TRANG',
        'Mẫu lưới dày để xem nhiều lựa chọn hơn trong một lần lướt.',
        coverBackground(`${seedPrefix}-cover`),
      ),
      layoutVariant: 'grid-8',
    },
    ...contentPages,
  ];
}

function buildGrid4Pages(
  pools: DeckBuildPools,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
  coverImageUrls: string[] = [],
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(imageUrls, libraryEntries, `${seedPrefix}:grid-4`, mappedImageUrls, globalUsedImageUrls || []);
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
      buildGridPageItems(pools.foodItems, pools.foodItems, 4, `${seedPrefix}-food`, pick, imageResolver, mealLabelForItem),
      background(`${seedPrefix}-food-cover-bg`),
      'grid-4',
    ),
    buildListPage(
      'Cà phê',
      'gold',
      'QUÁN CAFE ĐÀ LẠT',
      '4 quán cafe được tách riêng khỏi nhóm ăn uống.',
      buildGridPageItems(pools.cafeItems, pools.cafeItems, 4, `${seedPrefix}-cafe`, pick, imageResolver, (item) => item.type),
      background(`${seedPrefix}-cafe-cover-bg`),
      'grid-4',
    ),
    buildListPage(
      'Check-in',
      'terracotta',
      'ĐỊA ĐIỂM CHECK-IN',
      '4 địa điểm check-in rõ nhóm, không trộn khu du lịch.',
      buildBalancedCheckinGridItems(pools.checkinItems, 4, `${seedPrefix}-checkin`, pick, imageResolver),
      background(`${seedPrefix}-checkin-cover-bg`),
      'grid-4',
    ),
    buildListPage(
      'Chơi đêm',
      'slate',
      'CHƠI ĐÊM ĐÀ LẠT',
      'Các điểm đi buổi tối, nghe nhạc, ăn đêm và lên kế hoạch sau 20h.',
      buildGridPageItems(nightlifeItems, nightlifeItems, 4, `${seedPrefix}-nightlife`, pick, imageResolver, photomodeServiceLabel),
      background(`${seedPrefix}-nightlife-cover-bg`),
      'grid-4',
    ),
    buildListPage(
      'Dịch vụ',
      'pine',
      'DỊCH VỤ CẦN CHÚ Ý',
      'Lưu trú, thuê xe & quà tặng',
      buildGridPageItems(pools.serviceItems, pools.serviceItems, 4, `${seedPrefix}-services`, pick, imageResolver, photomodeServiceLabel),
      background(`${seedPrefix}-services-cover-bg`),
      'grid-4',
    ),
    buildListPage(
      'Homestay',
      'pine',
      'HOMESTAY ĐÀ LẠT',
      'Các chỗ nghỉ nên xem riêng để dễ chốt phòng, không trộn với dịch vụ khác.',
      buildGridPageItems(pools.stayItems, pools.stayItems, 4, `${seedPrefix}-homestay`, pick, imageResolver, photomodeServiceLabel),
      background(`${seedPrefix}-homestay-cover-bg`),
      'grid-4',
    ),
    buildListPage(
      activityPage.chip,
      'slate',
      activityPage.title,
      activityPage.isActivity ? 'Các hoạt động và điểm ghé được luân phiên với trang khu du lịch giữa các list.' : 'Các khu du lịch được tách riêng khỏi check-in.',
      buildGridPageItems(activityPage.items, activityPage.items, 4, `${seedPrefix}-activity`, pick, imageResolver, (item) => item.type),
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
  const pools = createDeckBuildPools(itemsBySection);
  if (deckId === 'itinerary-3n2d') return buildItineraryPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'itinerary-4n3d') return buildItinerary4N3DPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'itinerary-4n2d-grid8') return buildItinerary4N2DGrid8Pages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'pov-3-day') return buildPov3DayPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'must-go') return buildMustGoPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'first-time') return buildFirstTimePages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'grid-6') return buildGrid6Pages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'grid-8') return buildGrid8Pages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
  if (deckId === 'grid-4') return buildGrid4Pages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls, coverImageUrls);
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
      id: 'itinerary-4n3d',
      navTitle: 'Lịch trình 4N3Đ',
      title: 'Bộ trang 4N3Đ kiểu travel journal',
      description: 'Format mới khác 3N2Đ: cover poster, route map, mỗi ngày có ảnh hero lớn và 5 stop nhỏ theo nhịp đi chậm.',
      lists: [buildDeckList('itinerary-4n3d', 'main', 'List chính', 'List lịch trình 4N3Đ', 'Danh sách ảnh chính cho bộ 4N3Đ thiết kế kiểu travel journal.', buildPagesForDeck('itinerary-4n3d', common.itemsBySection, common.imageUrls, common.libraryEntries, 'itinerary-4n3d-main', common.globalUsedItemIds, common.globalUsedImageUrls, common.coverImageUrls))],
    },
    {
      id: 'itinerary-4n2d-grid8',
      navTitle: 'Lịch trình 4N2Đ lưới 8',
      title: 'Bộ trang 4N2Đ dạng 8 ảnh quanh tiêu đề',
      description: 'Mẫu mới dùng chủ đề 4N2Đ, mỗi trang có 8 ảnh bao quanh tiêu đề ở giữa và mỗi địa điểm có thời gian cụ thể.',
      lists: [buildDeckList('itinerary-4n2d-grid8', 'main', 'List chính', 'List lịch trình 4N2Đ lưới 8', 'Danh sách ảnh chính cho mẫu 4N2Đ dạng 8 ảnh quanh tiêu đề, có Lưu trú và Dịch vụ.', buildPagesForDeck('itinerary-4n2d-grid8', common.itemsBySection, common.imageUrls, common.libraryEntries, 'itinerary-4n2d-grid8-main', common.globalUsedItemIds, common.globalUsedImageUrls, common.coverImageUrls))],
    },
    {
      id: 'pov-3-day',
      navTitle: 'POV 3 ngày',
      title: 'Bộ trang POV 3 ngày vi vu khắp Đà Lạt',
      description: 'Format này bám sát photomode TikTok: cover mạnh, rồi chia theo nhóm điểm local như check-in free, cafe, ăn uống và dịch vụ cần lưu ý.',
      lists: [buildDeckList('pov-3-day', 'main', 'List chính', 'List POV 3 ngày', 'Danh sách ảnh chính cho bộ POV 3 ngày vi vu khắp Đà Lạt.', buildPagesForDeck('pov-3-day', common.itemsBySection, common.imageUrls, common.libraryEntries, 'pov-3-day-main', common.globalUsedItemIds, common.globalUsedImageUrls, common.coverImageUrls))],
    },
    {
      id: 'must-go',
      navTitle: 'Điểm không thể bỏ qua',
      title: 'Bộ trang các điểm không thể bỏ qua',
      description: 'Format này bám gần series must-go: cover mạnh, sau đó tách riêng điểm nổi tiếng, check-in free, cafe và lưu trú.',
      lists: [buildDeckList('must-go', 'main', 'List chính', 'List must-go', 'Danh sách ảnh chính cho bộ điểm không thể bỏ qua.', buildPagesForDeck('must-go', common.itemsBySection, common.imageUrls, common.libraryEntries, 'must-go-main', common.globalUsedItemIds, common.globalUsedImageUrls, common.coverImageUrls))],
    },
    {
      id: 'first-time',
      navTitle: 'Lưu ý cho người mới',
      title: 'Bộ trang dành cho người chuẩn bị đến Đà Lạt',
      description: 'Format này đi theo logic tư vấn trước chuyến đi: đi sớm, ăn gì, ngồi cafe ở đâu, check-in ở đâu và cần nhớ gì.',
      lists: [buildDeckList('first-time', 'main', 'List chính', 'List cho người mới', 'Danh sách ảnh chính cho bộ lưu ý người mới đến Đà Lạt.', buildPagesForDeck('first-time', common.itemsBySection, common.imageUrls, common.libraryEntries, 'first-time-main', common.globalUsedItemIds, common.globalUsedImageUrls, common.coverImageUrls))],
    },
    {
      id: 'grid-6',
      navTitle: 'Mẫu Lưới 6 Ô',
      title: 'Bộ trang bố cục lưới 2x3 (6 địa điểm)',
      description: 'Mẫu thiết kế mật độ thông tin cao, mỗi trang hiển thị 6 địa điểm theo dạng lưới 2 cột x 3 hàng.',
      lists: [buildDeckList('grid-6', 'main', 'List chính', 'List lưới 6 ô', 'Danh sách ảnh chính cho mẫu lưới 2x3.', buildPagesForDeck('grid-6', common.itemsBySection, common.imageUrls, common.libraryEntries, 'grid-6-main', common.globalUsedItemIds, common.globalUsedImageUrls, common.coverImageUrls))],
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
  ];
}
