import type {
  CoverPage,
  DeckPage,
  GuideDeck,
  GuideDeckList,
  GuideItem,
  ImageLibraryFolderEntry,
  ListPage,
  PageItem,
  WorkbookItemsBySection,
} from '../../../common/interfaces/guide.types';
import {
  buildDeckList,
  buildGrid5Pages,
  buildGrid6QuaytungPages,
  buildGrid8QuaytungPages,
  buildItinerary4N3DStackPages,
  buildItineraryTimelinePages,
  buildListPage,
  buildPagesForDeck,
  buildPov3V2Pages,
  collectMappedImageUrls,
  createDeckBuildPools,
  createListPicker,
  dedupeItems,
  displayPrice,
  pageItemWithResolver,
  pickMixedItemsWithPartnerQuota,
} from './deck-builder';
import { itemUsageKey } from './data-allocator';
import { createListImageResolver, stableHash } from './image-resolver';
import {
  getCachedSpotlightV3Hooks,
  getSpotlightV3BuildContext,
  pickSpotlightV3CoverPlacement,
  pickSpotlightV3Hook,
  setSpotlightV3BuildContext,
  clearSpotlightV3BuildContext,
  type SpotlightV3BuildContext,
} from '../sync/spotlight-hook-source';
import type { TitlePlacement } from '../../../common/interfaces/guide.types';
import { BUNDLED_ONE_WAY_HOOKS } from '../sync/hook-fallbacks';
import { getActiveDestinationLocalize } from '../sync/destination-localize';

export const GRID_8_FEED_TEMPLATE_VERSION = 17;
export const GRID_8_FEED_DEFAULT_POST_CAPTION = 'đều là những chọn lựa có tâm';

export function normalizeGrid8FeedPostCaption(value: string): string {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return GRID_8_FEED_DEFAULT_POST_CAPTION;
  if (/mỗi lựa chọn\s*1 tâm/i.test(clean) || /moi lua chon\s*1 tam/i.test(clean)) {
    return GRID_8_FEED_DEFAULT_POST_CAPTION;
  }
  return clean;
}
export const GRID_6_QUAYTUNG_TEMPLATE_VERSION = 6;
export const GRID_8_QUAYTUNG_TEMPLATE_VERSION = 8;
export const SPOTLIGHT_V2_TEMPLATE_VERSION = 17;
export const SPOTLIGHT_V3_TEMPLATE_VERSION = 2;
export const SPOTLIGHT_V4_TEMPLATE_VERSION = 3;
export const SPOTLIGHT_V5_TEMPLATE_VERSION = 1;
export const CAROUSEL_MAU_1_TEMPLATE_VERSION = 1;
export const POV_3_V2_TEMPLATE_VERSION = 13;
export const BUDGET_4N3D_WALLET_TEMPLATE_VERSION = 5;
export const ITINERARY_4N3D_STACK_TEMPLATE_VERSION = 8;
export const ITINERARY_TIMELINE_TEMPLATE_VERSION = 10;
export const ONE_WAY_STORY_TEMPLATE_VERSION = 2;

export const V2_DECK_IDS = [
  'grid-6-quaytung',
  'grid-8-feed',
  'grid-8-quaytung',
  'spotlight-v2',
  'spotlight-v3',
  'spotlight-v4',
  'spotlight-v5',
  'carousel-mau-1',
  'pov-3-v2',
  'itinerary-4n3d-stack',
  'itinerary-timeline',
  'one-way-story',
] as const;

export type V2DeckId = typeof V2_DECK_IDS[number];

export function isV2DeckId(deckId: string): deckId is V2DeckId {
  return (V2_DECK_IDS as readonly string[]).includes(deckId);
}

export function remapDeckLayouts(pages: DeckPage[], mapping: Record<string, string>): DeckPage[] {
  return pages.map((page) => {
    const variant = page.layoutVariant;
    if (!variant || !mapping[variant]) return page;
    if (page.type === 'cover') {
      return { ...page, layoutVariant: mapping[variant] as CoverPage['layoutVariant'] };
    }
    return { ...page, layoutVariant: mapping[variant] as ListPage['layoutVariant'] };
  });
}

type DeckBuildCommon = {
  itemsBySection: WorkbookItemsBySection;
  imageUrls: string[];
  libraryEntries: ImageLibraryFolderEntry[];
  coverImageUrls: string[];
  globalUsedItemIds?: Set<string>;
  globalUsedImageUrls?: Set<string>;
};

function buildArgs(common: DeckBuildCommon, seedPrefix: string) {
  return [
    common.itemsBySection,
    common.imageUrls,
    common.libraryEntries,
    seedPrefix,
    common.globalUsedItemIds,
    common.globalUsedImageUrls,
    common.coverImageUrls,
  ] as const;
}

function stripChipPrefixFromTitle(chipText: string, title: string): string {
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

function normalizeChipKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function isPortableCoverImageUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || url.startsWith('/assets/drive-file');
}

export function collectSpotlightV2CoverGridImages(coverImageUrls: string[], seedPrefix: string): string[] {
  const seen = new Set<string>();
  const portable = coverImageUrls.filter((url) => {
    if (!isPortableCoverImageUrl(url) || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
  if (portable.length === 0) return [];

  const ordered = [...portable].sort(
    (left, right) => stableHash(`${seedPrefix}:${left}`) - stableHash(`${seedPrefix}:${right}`),
  );
  return ordered.slice(0, 4);
}

/** Spotlight V3 cover: chỉ 1 ảnh nền full-bleed. */
export function collectSpotlightV3CoverImage(coverImageUrls: string[], seedPrefix: string): string {
  return collectSpotlightV2CoverGridImages(coverImageUrls, seedPrefix)[0] || '';
}

export function tuneSpotlightV2Cover(
  pages: DeckPage[],
  coverImageUrls: string[],
  seedPrefix: string,
): DeckPage[] {
  const coverGridImages = collectSpotlightV2CoverGridImages(coverImageUrls, seedPrefix);
  const coverSingleImage = collectSpotlightV3CoverImage(coverImageUrls, `${seedPrefix}|v3-single`);

  return pages.map((page) => {
    if (page.type !== 'cover') return page;
    const variant = page.layoutVariant || '';
    if (variant === 'spotlight-v3') {
      const url = coverSingleImage || page.backgroundImage || '';
      if (!url) return page;
      return {
        ...page,
        coverImages: url ? [url] : [],
        backgroundImage: url,
      };
    }
    if (coverGridImages.length === 0) return page;
    if (variant === 'spotlight-v2') {
      return {
        ...page,
        coverImages: coverGridImages,
        backgroundImage: coverGridImages[0] || page.backgroundImage,
      };
    }
    if (variant === 'grid-8-feed') {
      return {
        ...page,
        coverImages: coverGridImages,
        backgroundImage: coverGridImages[0] || page.backgroundImage,
      };
    }
    if (variant === 'itinerary-4n3d-stack-cover') {
      return {
        ...page,
        coverImages: coverGridImages,
        backgroundImage: coverGridImages[0] || page.backgroundImage,
      };
    }
    return page;
  });
}

export function tuneGrid8FeedCover(
  pages: DeckPage[],
  coverImageUrls: string[],
  seedPrefix: string,
): DeckPage[] {
  return tuneSpotlightV2Cover(pages, coverImageUrls, seedPrefix);
}

function allGuideItemsFromSection(itemsBySection: WorkbookItemsBySection): GuideItem[] {
  return Object.values(itemsBySection).flat();
}

function findGuideItemForPageItem(
  itemsBySection: WorkbookItemsBySection,
  pageItem: PageItem,
): GuideItem | null {
  const allItems = allGuideItemsFromSection(itemsBySection);
  if (pageItem.id) {
    const byId = allItems.find((item) => item.id === pageItem.id);
    if (byId) return byId;
  }
  const sourceKey = String(pageItem.sourceKey || '').trim();
  if (sourceKey) {
    const byKey = allItems.find((item) => itemUsageKey(item) === sourceKey);
    if (byKey) return byKey;
  }
  const name = String(pageItem.rawName || pageItem.name || '').trim();
  if (!name) return null;
  return allItems.find((item) => item.name === name) || null;
}

export function retuneSpotlightV2SpotImages(
  pages: DeckPage[],
  common: DeckBuildCommon,
  seedPrefix: string,
): DeckPage[] {
  const mappedImageUrls = collectMappedImageUrls(createDeckBuildPools(common.itemsBySection));

  return pages.map((page, index) => {
    if (page.type !== 'list' || (page.layoutVariant !== 'spotlight-v2' && page.layoutVariant !== 'spotlight-v3')) return page;
    const listPage = page as ListPage;
    const pageItem = listPage.items?.[0];
    if (!pageItem) return page;

    const guideItem = findGuideItemForPageItem(common.itemsBySection, pageItem);
    if (!guideItem) return page;

    const resolver = createListImageResolver(
      common.imageUrls,
      common.libraryEntries,
      `${seedPrefix}:spotlight-v2:${index}:${guideItem.id}`,
      mappedImageUrls,
      common.globalUsedImageUrls || [],
      { orientation: 'any', strictMapping: true },
    );
    const nextItem = pageItemWithResolver(
      guideItem,
      pageItem.label || listPage.chipText,
      resolver,
    );

    // V3: giữ address + giá đầu người (không để resolver ghi đè thành SĐT/giờ như V2).
    if (listPage.layoutVariant === 'spotlight-v3') {
      const chip = String(listPage.chipText || '');
      const withPrice = chip === 'Homestay' || chip === 'Dịch vụ';
      const priced = spotlightV3PageItem(guideItem, pageItem.label || chip, resolver, withPrice);
      return {
        ...listPage,
        items: [{ ...nextItem, metaPrimary: priced.metaPrimary, metaSecondary: priced.metaSecondary }],
        backgroundImage: listPage.backgroundImage,
      };
    }

    return {
      ...listPage,
      items: [nextItem],
      backgroundImage: listPage.backgroundImage,
    };
  });
}

function tuneV2ListPageTitles(pages: DeckPage[]): DeckPage[] {
  return pages.map((page) => {
    if (page.type !== 'list') return page;
    const listPage = page as ListPage;
    const layout = String(listPage.layoutVariant || '');
    const isSpotlightList = layout === 'spotlight-v2-list' || layout === 'spotlight-list';
    const chipKey = normalizeChipKey(listPage.chipText || '');
    if (isSpotlightList) {
      if (chipKey.includes('homestay') || chipKey.includes('luu tru')) {
        return { ...listPage, title: 'Homestay cần lưu' };
      }
      if (chipKey.includes('dich vu')) {
        return { ...listPage, title: 'Dịch vụ cần lưu' };
      }
      return page;
    }
    const stripped = stripChipPrefixFromTitle(listPage.chipText || '', listPage.title || '');
    if (!stripped || stripped === listPage.title) return page;
    return { ...listPage, title: stripped };
  });
}

export function buildGrid8FeedPages(common: DeckBuildCommon, seedPrefix: string): DeckPage[] {
  const pages = buildPagesForDeck('grid-8', ...buildArgs(common, seedPrefix));
  const remapped = remapDeckLayouts(pages, { 'grid-8': 'grid-8-feed' });
  const tuned = tuneV2ListPageTitles(remapped);
  return tuneGrid8FeedCover(tuned, common.coverImageUrls, seedPrefix);
}

export function buildGrid6QuaytungDeckPages(common: DeckBuildCommon, seedPrefix: string): DeckPage[] {
  const pools = createDeckBuildPools(common.itemsBySection);
  return buildGrid6QuaytungPages(
    pools,
    common.imageUrls,
    common.libraryEntries,
    seedPrefix,
    common.globalUsedItemIds,
    common.globalUsedImageUrls,
    common.coverImageUrls,
  );
}

export function buildGrid8QuaytungDeckPages(common: DeckBuildCommon, seedPrefix: string): DeckPage[] {
  const pools = createDeckBuildPools(common.itemsBySection);
  return buildGrid8QuaytungPages(
    pools,
    common.imageUrls,
    common.libraryEntries,
    seedPrefix,
    common.globalUsedItemIds,
    common.globalUsedImageUrls,
    common.coverImageUrls,
  );
}

export function buildSpotlightV2Pages(common: DeckBuildCommon, seedPrefix: string): DeckPage[] {
  const pages = buildPagesForDeck('spotlight-guide', ...buildArgs(common, seedPrefix));
  const remapped = remapDeckLayouts(pages, {
    spotlight: 'spotlight-v2',
    'spotlight-list': 'spotlight-v2-list',
  });
  const tuned = tuneSpotlightV2Cover(tuneV2ListPageTitles(remapped), common.coverImageUrls, seedPrefix);
  return retuneSpotlightV2SpotImages(tuned, common, seedPrefix);
}

function isDisplayableSpotlightPrice(price: string): boolean {
  const cleaned = String(price || '').trim();
  if (!cleaned) return false;
  if (/mien\s*phi|free/i.test(cleaned)) return false;
  return !/^0+\s*(đ|d|vnd|vnđ)?$/i.test(cleaned);
}

function spotlightV3PageItem(
  item: GuideItem,
  label: string,
  imageResolver: (item: GuideItem) => Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'>,
  withPrice: boolean,
): PageItem {
  const base = pageItemWithResolver(item, label, imageResolver);
  const address = String(item.address || '').trim() || 'Đang cập nhật địa chỉ';
  if (!withPrice) {
    return { ...base, metaPrimary: address, metaSecondary: '' };
  }
  const price = displayPrice(item);
  return {
    ...base,
    metaPrimary: address,
    metaSecondary: isDisplayableSpotlightPrice(price) ? `Giá: ${price}` : '',
  };
}

function pickSpotlightV3Item(
  items: GuideItem[],
  seed: string,
  pick: ReturnType<typeof createListPicker>,
): GuideItem | null {
  const ready = dedupeItems(items).filter((item) => {
    const name = String(item.name || '').trim();
    if (!name) return false;
    return Boolean(String(item.imageUrl || '').trim())
      || Boolean((item.candidateImageUrls || []).some((url) => String(url || '').trim()));
  });
  const pool = ready.length > 0 ? ready : dedupeItems(items).filter((item) => String(item.name || '').trim());
  return pickMixedItemsWithPartnerQuota(pool, 1, seed, pick)[0] || null;
}

type SpotlightV3Slot = {
  chip: string;
  tone: ListPage['chipTone'];
  sectionItems: GuideItem[];
  withPrice: boolean;
};

export function buildSpotlightV3Pages(
  common: DeckBuildCommon,
  seedPrefix: string,
  options: { hooks?: string[]; usedHookTitles?: string[]; destinationId?: string } = {},
): DeckPage[] {
  const pools = createDeckBuildPools(common.itemsBySection);
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(
    common.imageUrls,
    common.libraryEntries,
    `${seedPrefix}:spotlight-v3`,
    mappedImageUrls,
    common.globalUsedImageUrls || [],
    { orientation: 'any', strictMapping: true },
  );
  const pick = createListPicker(common.globalUsedItemIds);
  const usedImages = common.globalUsedImageUrls || new Set<string>();

  const checkinPool = pools.dayCheckinItems.length > 0 ? pools.dayCheckinItems : pools.checkinItems;
  const cafePool = pools.dayCafeItems.length > 0 ? pools.dayCafeItems : pools.cafeItems;
  const foodPool = pools.daytimeFoodItems.length > 0 ? pools.daytimeFoodItems : pools.foodItems;
  const nightlifePool = pools.nightlifeItems.length > 0 ? pools.nightlifeItems : pools.nightlifeImageItems;
  const stayPool = pools.stayItems;
  const servicePool = pools.serviceItems;

  const slots: SpotlightV3Slot[] = [
    { chip: 'Check-in', tone: 'terracotta', sectionItems: checkinPool, withPrice: false },
    { chip: 'Check-in', tone: 'terracotta', sectionItems: checkinPool, withPrice: false },
    { chip: 'Cafe', tone: 'gold', sectionItems: cafePool, withPrice: false },
    { chip: 'Cafe', tone: 'gold', sectionItems: cafePool, withPrice: false },
    { chip: 'Quán ăn', tone: 'berry', sectionItems: foodPool, withPrice: false },
    { chip: 'Quán ăn', tone: 'berry', sectionItems: foodPool, withPrice: false },
    { chip: 'Chơi đêm', tone: 'slate', sectionItems: nightlifePool, withPrice: false },
    { chip: 'Chơi đêm', tone: 'slate', sectionItems: nightlifePool, withPrice: false },
    { chip: 'Homestay', tone: 'pine', sectionItems: stayPool, withPrice: true },
    { chip: 'Homestay', tone: 'pine', sectionItems: stayPool, withPrice: true },
    { chip: 'Dịch vụ', tone: 'slate', sectionItems: servicePool, withPrice: true },
    { chip: 'Dịch vụ', tone: 'slate', sectionItems: servicePool, withPrice: true },
  ];

  const spotPages: ListPage[] = [];
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    const item = pickSpotlightV3Item(slot.sectionItems, `${seedPrefix}-slot-${index + 1}`, pick);
    if (!item) continue;
    const pageItem = spotlightV3PageItem(item, slot.chip, imageResolver, slot.withPrice);
    if (pageItem.imageUrl) usedImages.add(pageItem.imageUrl);
    spotPages.push({
      ...buildListPage(
        slot.chip,
        slot.tone,
        item.name,
        '',
        [pageItem],
        pageItem.imageUrl,
        'spotlight-v3',
      ),
      title: item.name,
      subtitle: '',
    });
  }

  const destinationId = String(options.destinationId || '').toLowerCase();
  const hooks = options.hooks?.length ? options.hooks : getCachedSpotlightV3Hooks();
  const canUseDocHooks = destinationId !== 'phanthiet' && hooks.length > 0;
  const coverTitle = canUseDocHooks
    ? pickSpotlightV3Hook(hooks, options.usedHookTitles || [], `${seedPrefix}|hook`)
    : (destinationId === 'phanthiet' ? 'Phan Thiết đáng thử ngay' : 'Đà Lạt đáng lưu ngay');
  const coverPlacement = pickSpotlightV3CoverPlacement(`${seedPrefix}|place`) as TitlePlacement;
  const coverImage = collectSpotlightV3CoverImage(common.coverImageUrls, `${seedPrefix}|v3-cover`);
  if (coverImage) usedImages.add(coverImage);

  const cover: CoverPage = {
    type: 'cover',
    title: coverTitle || 'Đà Lạt đáng lưu ngay',
    subtitle: '',
    backgroundImage: coverImage,
    coverImages: coverImage ? [coverImage] : [],
    layoutVariant: 'spotlight-v3',
    titlePlacement: coverPlacement,
  };

  return finalizeSpotlightV3Pages([cover, ...spotPages], common, seedPrefix);
}

function uniquePortableImages(urls: string[]): string[] {
  const seen = new Set<string>();
  return (urls || []).map((url) => String(url || '').trim()).filter((url) => {
    if (!isPortableCoverImageUrl(url) || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

const SPOTLIGHT_V4_BACKGROUND_COUNT = 6;
const SPOTLIGHT_V4_VENUE_COUNT = 8;
const SPOTLIGHT_V4_EXCLUDED_BACKGROUND_FILE_IDS = new Set([
  // 111.png là cùng cảnh Phân Viện Sinh Học với ảnh riêng của địa điểm.
  '10Ag0aESSGkGCmExm3UuWxWFGRyYb0M8-',
]);

function spotlightV4BackgroundAllowed(url: string): boolean {
  const fileId = String(url || '').match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] || '';
  return !fileId || !SPOTLIGHT_V4_EXCLUDED_BACKGROUND_FILE_IDS.has(fileId);
}

type SpotlightV4VenueGroup = { key: string; items: GuideItem[] };

function spotlightV4VenueGroups(pools: ReturnType<typeof createDeckBuildPools>): SpotlightV4VenueGroup[] {
  const groups: SpotlightV4VenueGroup[] = [
    { key: 'quan_an', items: pools.foodItems },
    { key: 'cafe', items: pools.cafeItems },
    { key: 'check_in', items: pools.checkinItems },
    { key: 'khu_du_lich', items: pools.tourismItems },
    { key: 'hoat_dong', items: pools.activityItems },
    { key: 'dia_diem_lich_su', items: pools.historyItems },
    { key: 'choi_dem', items: pools.nightlifeItems },
  ];
  return groups
    .map((group) => ({
      ...group,
      items: dedupeItems(group.items).filter((item) => (
        Boolean(String(item.name || '').trim())
          && (Boolean(String(item.imageUrl || '').trim()) || Boolean((item.candidateImageUrls || []).some((url) => String(url || '').trim())))
      )),
    }))
    .filter((group) => group.items.length > 0);
}

function spotlightV4VenuePool(pools: ReturnType<typeof createDeckBuildPools>): GuideItem[] {
  return dedupeItems(spotlightV4VenueGroups(pools).flatMap((group) => group.items));
}

function pickSpotlightV4Venues(
  pools: ReturnType<typeof createDeckBuildPools>,
  seed: string,
  pick: ReturnType<typeof createListPicker>,
): GuideItem[] {
  const groups = spotlightV4VenueGroups(pools)
    .sort((a, b) => stableHash(`${seed}:group:${a.key}`) - stableHash(`${seed}:group:${b.key}`));
  const selected: GuideItem[] = [];
  const selectedKeys = new Set<string>();
  const addFromGroup = (group: SpotlightV4VenueGroup, suffix: string): boolean => {
    if (selected.length >= SPOTLIGHT_V4_VENUE_COUNT) return false;
    const candidate = pick(group.items, 1, `${seed}:${suffix}:${group.key}`)[0];
    if (!candidate) return false;
    const key = itemUsageKey(candidate);
    if (selectedKeys.has(key)) return false;
    selected.push(candidate);
    selectedKeys.add(key);
    return true;
  };

  // Lượt đầu lấy một đại diện từ mỗi nhóm có ảnh. Các lượt sau tiếp tục theo
  // vòng tròn cho đến khi đủ 8 địa điểm, nên V4 không còn dồn vào quán/cafe.
  groups.forEach((group, index) => addFromGroup(group, `representative-${index}`));
  let round = 0;
  while (selected.length < SPOTLIGHT_V4_VENUE_COUNT && groups.length > 0) {
    let added = false;
    groups.forEach((group, index) => {
      if (selected.length >= SPOTLIGHT_V4_VENUE_COUNT) return;
      added = addFromGroup(group, `round-${round}-${index}`) || added;
    });
    if (!added) break;
    round += 1;
  }

  if (selected.length < SPOTLIGHT_V4_VENUE_COUNT) {
    const fallback = spotlightV4VenuePool(pools).filter((item) => !selectedKeys.has(itemUsageKey(item)));
    for (const item of pick(fallback, SPOTLIGHT_V4_VENUE_COUNT - selected.length, `${seed}:fill`)) {
      const key = itemUsageKey(item);
      if (selectedKeys.has(key)) continue;
      selected.push(item);
      selectedKeys.add(key);
    }
  }
  return selected.slice(0, SPOTLIGHT_V4_VENUE_COUNT);
}
/**
 * Spotlight V4: một cover Hinh_nen có hook, năm ảnh nghỉ xen giữa tám địa điểm.
 * Ảnh cover được chọn từ pool Hinh_nen
 * và ưu tiên URL chưa dùng ở các list trước; khi hết pool thì mở vòng mới.
 */
export function buildSpotlightV4Pages(
  common: DeckBuildCommon,
  seedPrefix: string,
  options: SpotlightV3BuildContext = {},
): DeckPage[] {
  const imagePool = uniquePortableImages(common.coverImageUrls).filter(spotlightV4BackgroundAllowed);
  if (imagePool.length < SPOTLIGHT_V4_BACKGROUND_COUNT) {
    throw new Error(`Mẫu Spotlight V4 cần ít nhất ${SPOTLIGHT_V4_BACKGROUND_COUNT} ảnh Hinh_nen khác nhau (${imagePool.length}/${SPOTLIGHT_V4_BACKGROUND_COUNT}).`);
  }

  const globallyUsedImages = common.globalUsedImageUrls || new Set<string>();
  const freshImages = imagePool.filter((url) => !globallyUsedImages.has(url));
  const candidateImages = freshImages.length >= SPOTLIGHT_V4_BACKGROUND_COUNT ? freshImages : imagePool;
  const selectedImages = [...candidateImages]
    .sort((left, right) => stableHash(`${seedPrefix}:spotlight-v4-image:${left}`) - stableHash(`${seedPrefix}:spotlight-v4-image:${right}`))
    .slice(0, SPOTLIGHT_V4_BACKGROUND_COUNT);
  if (selectedImages.length < SPOTLIGHT_V4_BACKGROUND_COUNT) {
    throw new Error(`Mẫu Spotlight V4 cần ít nhất ${SPOTLIGHT_V4_BACKGROUND_COUNT} ảnh Hinh_nen khác nhau (${selectedImages.length}/${SPOTLIGHT_V4_BACKGROUND_COUNT}).`);
  }
  selectedImages.forEach((url) => globallyUsedImages.add(url));

  const pools = createDeckBuildPools(common.itemsBySection);
  const venuePool = spotlightV4VenuePool(pools);
  if (venuePool.length < SPOTLIGHT_V4_VENUE_COUNT) {
    throw new Error(`Mẫu Spotlight V4 cần ít nhất ${SPOTLIGHT_V4_VENUE_COUNT} địa điểm có ảnh từ các nhóm dữ liệu (${venuePool.length}/${SPOTLIGHT_V4_VENUE_COUNT}).`);
  }

  const mappedImageUrls = collectMappedImageUrls(pools);
  const listImageUrls = new Set(selectedImages);
  const imageResolver = createListImageResolver(
    common.imageUrls,
    common.libraryEntries,
    `${seedPrefix}:spotlight-v4-venues`,
    mappedImageUrls,
    globallyUsedImages,
    { orientation: 'any', strictMapping: true },
  );
  const pick = createListPicker(common.globalUsedItemIds);
  const venues = pickSpotlightV4Venues(pools, `${seedPrefix}:spotlight-v4-venues`, pick);
  if (venues.length < SPOTLIGHT_V4_VENUE_COUNT) {
    throw new Error(`Mẫu Spotlight V4 cần đủ ${SPOTLIGHT_V4_VENUE_COUNT} địa điểm không trùng (${venues.length}/${SPOTLIGHT_V4_VENUE_COUNT}).`);
  }

  const venuePages = venues.map((item, index): ListPage => {
    const resolved = pageItemWithResolver(item, `Địa điểm ${index + 1}`, imageResolver);
    const pageItem: PageItem = {
      ...resolved,
      metaPrimary: String(item.address || '').trim(),
      metaSecondary: '',
    };
    if (!String(pageItem.imageUrl || '').trim()) {
      throw new Error(`Mẫu Spotlight V4 không tìm được ảnh cho địa điểm "${item.name}".`);
    }
    if (listImageUrls.has(pageItem.imageUrl)) {
      throw new Error(`Mẫu Spotlight V4 không tìm được ảnh riêng, không trùng cho "${item.name}".`);
    }
    listImageUrls.add(pageItem.imageUrl);
    globallyUsedImages.add(pageItem.imageUrl);
    return buildListPage('', 'gold', item.name, '', [pageItem], pageItem.imageUrl, 'spotlight-v4-page');
  });

  const destinationId = String(options.destinationId || '').toLowerCase();
  const hooks = options.hooks?.length ? options.hooks : getCachedSpotlightV3Hooks();
  const coverTitle = hooks.length > 0
    ? pickSpotlightV3Hook(hooks, options.usedHookTitles || [], `${seedPrefix}|spotlight-v4-hook`)
    : (destinationId === 'greenland' ? 'Green Land đáng lưu ngay' : 'Đà Lạt đáng lưu ngay');
  const cover: CoverPage = {
    type: 'cover',
    title: coverTitle || (destinationId === 'greenland' ? 'Green Land đáng lưu ngay' : 'Đà Lạt đáng lưu ngay'),
    subtitle: '',
    backgroundImage: selectedImages[0],
    coverImages: [selectedImages[0]],
    layoutVariant: 'spotlight-v4-cover',
    titlePlacement: pickSpotlightV3CoverPlacement(`${seedPrefix}|spotlight-v4-place`) as TitlePlacement,
  };

  const imagePage = (url: string): ListPage => buildListPage('', 'slate', '', '', [], url, 'spotlight-v4-image');
  return [
    cover,
    imagePage(selectedImages[1]),
    venuePages[0],
    venuePages[1],
    imagePage(selectedImages[2]),
    venuePages[2],
    venuePages[3],
    imagePage(selectedImages[3]),
    venuePages[4],
    imagePage(selectedImages[4]),
    venuePages[5],
    imagePage(selectedImages[5]),
    venuePages[6],
    venuePages[7],
  ];
}

const SPOTLIGHT_V5_HOOK = 'có nhạc rồi đi Đà Lạt thoiiii';
const SPOTLIGHT_V5_PLAYLIST = [
  'Giấc mơ - Tùng',
  'An - Lil Wuyn',
  'Dalat Mango - PC',
  'Trốn những đau thương - Minh Huy',
  '1000 Ánh Mắt - Shiki, Obito',
  'Perfect - shiki & Tyronee',
  'Dancing in the dark - Soobin Hoàng Sơn',
  'Anh đã lớn hơn thế nhiều - Huỳnh Công Hiếu',
  'Đoạn đường sao băng - Kha',
  'Hư Không - Kha',
  'Đưa nhau đi trốn - Đen Vâu & Linh Cáo',
  'Thành phố phía Đông - Vương Bình',
  'Không điều kiện - Cá Hồi Hoang',
  'Hai đứa nhóc - Ronboogz',
  'Ngày nào - Cá Hồi Hoang',
  'Giấc mơ loài người - Dấu Vân Tay',
  'Cho Tôi Lang Thang - Ngọt & Đen',
  'Bình yên - Vũ, Binz',
  '2004 - Cá Hồi Hoang',
  'Vị Nhà - Đen',
] as const;

type SpotlightV5VenueGroup = { key: string; items: GuideItem[] };

function spotlightV5VenueGroups(pools: ReturnType<typeof createDeckBuildPools>): SpotlightV5VenueGroup[] {
  const groups: SpotlightV5VenueGroup[] = [
    { key: 'quan_an', items: pools.foodItems },
    { key: 'cafe', items: pools.cafeItems },
    { key: 'check_in', items: pools.checkinItems },
    { key: 'khu_du_lich', items: pools.tourismItems },
    { key: 'hoat_dong', items: pools.activityItems },
    { key: 'dia_diem_lich_su', items: pools.historyItems },
    { key: 'choi_dem', items: pools.nightlifeItems },
  ];
  return groups
    .map((group) => ({
      ...group,
      items: dedupeItems(group.items).filter((item) => (
        Boolean(String(item.name || '').trim())
          && (Boolean(String(item.imageUrl || '').trim()) || Boolean((item.candidateImageUrls || []).some((url) => String(url || '').trim())))
      )),
    }))
    .filter((group) => group.items.length > 0);
}

function spotlightV5VenuePool(pools: ReturnType<typeof createDeckBuildPools>): GuideItem[] {
  return dedupeItems(spotlightV5VenueGroups(pools).flatMap((group) => group.items));
}

/**
 * Chọn venue theo vòng tròn giữa các nhóm. Bộ chọn cũ ưu tiên item chưa từng
 * dùng trên toàn bộ deck; vì các deck trước thường đã dùng hết check-in/KDL,
 * V5 dễ bị dồn toàn bộ vào Quan_an/Cafe. Vòng đầu tiên dưới đây bắt buộc lấy
 * mỗi nhóm còn dữ liệu ít nhất một item, sau đó mới lấp đủ 13 trang.
 */
function pickSpotlightV5Venues(
  pools: ReturnType<typeof createDeckBuildPools>,
  count: number,
  seed: string,
  pick: ReturnType<typeof createListPicker>,
): GuideItem[] {
  const groups = spotlightV5VenueGroups(pools)
    .sort((a, b) => stableHash(`${seed}:group:${a.key}`) - stableHash(`${seed}:group:${b.key}`));
  const selected: GuideItem[] = [];
  const selectedKeys = new Set<string>();
  const addFromGroup = (group: SpotlightV5VenueGroup, suffix: string): void => {
    if (selected.length >= count) return;
    const candidate = pick(group.items, 1, `${seed}:spotlight-v5:${suffix}:${group.key}`)[0];
    if (!candidate) return;
    const key = itemUsageKey(candidate);
    if (selectedKeys.has(key)) return;
    selected.push(candidate);
    selectedKeys.add(key);
  };

  // Một lượt đại diện: không để các nhóm có dữ liệu bị bỏ qua chỉ vì item của
  // chúng đã được các deck khác đánh dấu là đã dùng.
  groups.forEach((group, index) => addFromGroup(group, `representative-${index}`));

  let round = 0;
  while (selected.length < count && groups.length > 0) {
    let added = false;
    groups.forEach((group, index) => {
      if (selected.length >= count) return;
      const before = selected.length;
      addFromGroup(group, `round-${round}-${index}`);
      if (selected.length > before) added = true;
    });
    if (!added) break;
    round += 1;
  }

  // Nếu có duplicate key giữa hai section, bù từ pool phẳng nhưng vẫn giữ
  // nguyên khóa chống trùng và cơ chế luân phiên toàn cục.
  if (selected.length < count) {
    const fallback = spotlightV5VenuePool(pools).filter((item) => !selectedKeys.has(itemUsageKey(item)));
    for (const item of pick(fallback, count - selected.length, `${seed}:spotlight-v5:fill`)) {
      if (selected.length >= count) break;
      const key = itemUsageKey(item);
      if (selectedKeys.has(key)) continue;
      selected.push(item);
      selectedKeys.add(key);
    }
  }
  return selected.slice(0, count);
}

export function buildSpotlightV5Pages(common: DeckBuildCommon, seedPrefix: string): DeckPage[] {
  if (getActiveDestinationLocalize() !== 'dalat') {
    throw new Error('Mẫu Spotlight V5 hiện chỉ áp dụng cho Đà Lạt.');
  }
  const imagePool = uniquePortableImages(common.coverImageUrls);
  if (imagePool.length < 2) {
    throw new Error(`Mẫu Spotlight V5 cần ít nhất 2 ảnh Hinh_nen khác nhau (${imagePool.length}/2).`);
  }
  const globallyUsedImages = common.globalUsedImageUrls || new Set<string>();
  const fresh = imagePool.filter((url) => !globallyUsedImages.has(url));
  const candidate = fresh.length >= 2 ? fresh : imagePool;
  const selectedImages = [...candidate]
    .sort((a, b) => stableHash(`${seedPrefix}:spotlight-v5-bg:${a}`) - stableHash(`${seedPrefix}:spotlight-v5-bg:${b}`))
    .slice(0, 2);
  if (selectedImages.length < 2) throw new Error('Mẫu Spotlight V5 không chọn đủ 2 ảnh Hinh_nen.');
  selectedImages.forEach((url) => globallyUsedImages.add(url));

  const pools = createDeckBuildPools(common.itemsBySection);
  const venuePool = spotlightV5VenuePool(pools);
  if (venuePool.length < 13) {
    throw new Error(`Mẫu Spotlight V5 cần ít nhất 13 địa điểm có ảnh (${venuePool.length}/13).`);
  }
  const pick = createListPicker(common.globalUsedItemIds);
  const venues = pickSpotlightV5Venues(pools, 13, `${seedPrefix}:spotlight-v5-places`, pick);
  if (venues.length < 13 || new Set(venues.map((item) => itemUsageKey(item))).size < 13) {
    throw new Error('Mẫu Spotlight V5 không chọn đủ 13 địa điểm không trùng.');
  }
  const mappedImageUrls = collectMappedImageUrls(pools);
  const resolver = createListImageResolver(
    common.imageUrls,
    common.libraryEntries,
    `${seedPrefix}:spotlight-v5-images`,
    mappedImageUrls,
    globallyUsedImages,
    { orientation: 'any', strictMapping: true },
  );
  const usedListImages = new Set(selectedImages);
  const placePages = venues.map((item, index): ListPage => {
    const resolved = pageItemWithResolver(item, `Địa điểm ${index + 1}`, resolver);
    const imageUrl = String(resolved.imageUrl || '').trim();
    if (!imageUrl) throw new Error(`Mẫu Spotlight V5 không tìm được ảnh cho địa điểm "${item.name}".`);
    if (usedListImages.has(imageUrl)) throw new Error(`Mẫu Spotlight V5 bị trùng ảnh ở địa điểm "${item.name}".`);
    usedListImages.add(imageUrl);
    globallyUsedImages.add(imageUrl);
    return {
      ...buildListPage('', 'slate', item.name, '', [{
        ...resolved,
        metaPrimary: String(item.address || '').trim(),
        metaSecondary: '',
      }], imageUrl, 'spotlight-v5-place'),
      canvasPreset: 'tiktok-4x5',
    };
  });
  const cover: CoverPage = {
    type: 'cover', title: SPOTLIGHT_V5_HOOK, subtitle: '', backgroundImage: selectedImages[0],
    coverImages: [selectedImages[0]], layoutVariant: 'spotlight-v5-cover', titlePlacement: 'bottom-right', canvasPreset: 'tiktok-4x5',
  };
  const playlist: ListPage = {
    ...buildListPage('', 'slate', 'Playlist Đà Lạt', '', [], selectedImages[1], 'spotlight-v5-playlist'),
    playlistLines: [...SPOTLIGHT_V5_PLAYLIST], titlePlacement: 'center', canvasPreset: 'tiktok-4x5',
  };
  return [cover, playlist, ...placePages];
}
type CarouselMau1Slot = {
  label: string;
  sectionItems: GuideItem[];
  count: number;
};

function hasOwnImage(item: GuideItem): boolean {
  if (item.imageSource !== 'manual') return false;
  return Boolean(String(item.imageUrl || '').trim())
    || Boolean((item.candidateImageUrls || []).some((url) => String(url || '').trim()));
}

/** Mẫu 1: 1 cover Hinh_nen + đúng 13 địa điểm, không fallback chéo nhóm. */
export function buildCarouselMau1Pages(
  common: DeckBuildCommon,
  seedPrefix: string,
  options: SpotlightV3BuildContext = {},
): DeckPage[] {
  const pools = createDeckBuildPools(common.itemsBySection);
  const mappedImageUrls = collectMappedImageUrls(pools);
  const imageResolver = createListImageResolver(
    common.imageUrls,
    common.libraryEntries,
    `${seedPrefix}:carousel-mau-1`,
    mappedImageUrls,
    common.globalUsedImageUrls || [],
    { orientation: 'any', strictMapping: true },
  );
  const pick = createListPicker(common.globalUsedItemIds);
  const slots: CarouselMau1Slot[] = [
    { label: 'Check-in miễn phí', sectionItems: pools.freeCheckinItems, count: 2 },
    { label: 'Khu du lịch', sectionItems: pools.dayTourismItems.length ? pools.dayTourismItems : pools.tourismItems, count: 2 },
    { label: 'Quán ăn', sectionItems: pools.foodItems, count: 3 },
    { label: 'Cafe', sectionItems: pools.cafeItems, count: 3 },
    { label: 'Chơi đêm', sectionItems: pools.nightlifeItems, count: 2 },
    { label: 'Homestay', sectionItems: pools.stayItems, count: 1 },
  ];

  const pages: ListPage[] = [];
  const selectedItemKeys = new Set<string>();
  const selectedImageUrls = new Set<string>();
  for (const [slotIndex, slot] of slots.entries()) {
    const eligible = dedupeItems(slot.sectionItems)
      .filter(hasOwnImage)
      .filter((item) => !selectedItemKeys.has(itemUsageKey(item)));
    const partnerItems = eligible.filter((item) => item.isPartner);
    const selectionPool = options.destinationId === 'greenland' && partnerItems.length >= slot.count
      ? partnerItems
      : eligible;
    const selected = pickMixedItemsWithPartnerQuota(
      selectionPool,
      slot.count,
      `${seedPrefix}|${slotIndex}|${slot.label}`,
      pick,
    );
    if (selected.length < slot.count) {
      throw new Error(`Mẫu 1 thiếu dữ liệu có ảnh cho nhóm "${slot.label}" (${selected.length}/${slot.count}).`);
    }
    for (const item of selected) {
      const itemKey = itemUsageKey(item);
      const resolved = pageItemWithResolver(item, slot.label, imageResolver);
      const imageUrl = String(resolved.imageUrl || '').trim();
      const ownImageUrls = new Set([item.imageUrl, ...(item.candidateImageUrls || [])].map((url) => String(url || '').trim()).filter(Boolean));
      if (!imageUrl || !ownImageUrls.has(imageUrl) || selectedImageUrls.has(imageUrl)) {
        throw new Error(`Mẫu 1 không tìm được ảnh riêng, không trùng cho "${item.name}" (${slot.label}).`);
      }
      selectedItemKeys.add(itemKey);
      selectedImageUrls.add(imageUrl);
      pages.push({
        type: 'list',
        chipText: slot.label,
        chipTone: 'slate',
        title: item.name,
        subtitle: '',
        items: [{
          ...resolved,
          metaPrimary: String(item.address || '').trim(),
          metaSecondary: '',
        }],
        backgroundImage: imageUrl,
        layoutVariant: 'carousel-mau-1-page',
        titlePlacement: 'bottom-center',
      });
    }
  }

  const hooks = options.hooks?.length ? options.hooks : getCachedSpotlightV3Hooks();
  const coverTitle = pickSpotlightV3Hook(hooks, options.usedHookTitles || [], `${seedPrefix}|hook`)
    || 'Đà Lạt đáng lưu ngay';
  const coverImage = collectSpotlightV3CoverImage(common.coverImageUrls, `${seedPrefix}|cover`);
  if (!coverImage) throw new Error('Mẫu 1 chưa có ảnh trong nhóm Hinh_nen để làm trang bìa.');
  if (selectedImageUrls.has(coverImage)) throw new Error('Ảnh bìa Mẫu 1 bị trùng với ảnh địa điểm.');

  const cover: CoverPage = {
    type: 'cover',
    title: coverTitle,
    subtitle: '',
    backgroundImage: coverImage,
    coverImages: [coverImage],
    layoutVariant: 'carousel-mau-1-cover',
    titlePlacement: 'bottom-center',
  };
  return [cover, ...pages];
}

const ONE_WAY_ROAD_TITLE = 'tui đi ngược chiều mấy bà ơi huhu, tui quẹo vô đường Nguyễn Văn Trỗi xong bị hốt';
const ONE_WAY_ROAD_SUBTITLE = [
  'haizzz, tui chia sẻ thêm mấy con đường để mấy bà tránh nha',
  '',
  'Trần Nhật Duật',
  'Yagout',
  'Thông Thiên Học',
  'Trương Công Định',
  'Khu Hòa Bình có đường bạn không được rẽ á',
].join('\n');
const ONE_WAY_SLOPE_TITLE = 'Đà Lạt nhiều dốc lắm mấy bà ơi, ai tay lái yếu thì đừng thuê xe mà đặt grab nha, có nhiều quán cà phê đẹp nhưng đường xuống ghê lắm';
const ONE_WAY_SLOPE_SUBTITLE = 'trừ khúc bị phạt tiền xui chứ chuyến đi của tui mê lắm';
const ONE_WAY_HOMESTAYS = ['lagom homestay', 'little fish dalat', 'tori wooden house'];
const ONE_WAY_PREFERRED_SLOPES = [
  'doc nha bo',
  'doc suong nguyet anh',
  'con doc nhat ban',
  'doc hung vuong',
  'doc tang bat ho',
  'doc nha lang',
];

function normalizeOneWayText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function oneWayOwnImageUrls(item: GuideItem): string[] {
  return [...new Set([item.imageUrl, ...(item.candidateImageUrls || [])]
    .map((url) => String(url || '').trim())
    .filter(isPortableCoverImageUrl))];
}

function hasOneWayOwnImage(item: GuideItem): boolean {
  return item.imageSource === 'manual' && oneWayOwnImageUrls(item).length > 0;
}

function oneWaySequenceIndex(seedPrefix: string): number {
  if (seedPrefix === 'one-way-story-main' || seedPrefix.includes('one-way-story-main')) return 0;
  if (seedPrefix.startsWith('refresh:one-way-story:')) {
    const parts = seedPrefix.split(':');
    const listIndex = Number(parts[3]);
    return Number.isFinite(listIndex) ? Math.max(0, Math.trunc(listIndex)) + 1 : 0;
  }
  const parts = seedPrefix.split('|');
  if (parts[0] === 'one-way-story') {
    const existingCount = Number(parts[2]);
    return Number.isFinite(existingCount) ? Math.max(0, Math.trunc(existingCount)) + 1 : 0;
  }
  return stableHash(seedPrefix) % ONE_WAY_HOMESTAYS.length;
}

function pickOneWayCoverImages(
  coverImageUrls: string[],
  seedPrefix: string,
  usedImages: Set<string>,
): [string, string] {
  const unique = [...new Set(coverImageUrls.filter(isPortableCoverImageUrl))];
  const ordered = [...unique].sort(
    (left, right) => stableHash(`${seedPrefix}|cover|${left}`) - stableHash(`${seedPrefix}|cover|${right}`),
  );
  const fresh = ordered.filter((url) => !usedImages.has(url));
  const selected = [...fresh, ...ordered.filter((url) => usedImages.has(url))].slice(0, 2);
  if (selected.length < 2 || selected[0] === selected[1]) {
    throw new Error(`Mẫu Đường một chiều cần ít nhất 2 ảnh khác nhau trong nhóm Hinh_nen (${selected.length}/2).`);
  }
  selected.forEach((url) => usedImages.add(url));
  return [selected[0], selected[1]];
}

function oneWayPageItem(
  item: GuideItem,
  label: string,
  resolveImage: ReturnType<typeof createListImageResolver>,
  selectedImageUrls: Set<string>,
): PageItem {
  const resolved = pageItemWithResolver(item, label, resolveImage);
  const imageUrl = String(resolved.imageUrl || '').trim();
  const ownImages = new Set(oneWayOwnImageUrls(item));
  if (!imageUrl || !ownImages.has(imageUrl)) {
    throw new Error(`Mẫu Đường một chiều không lấy được ảnh riêng của "${item.name}" (${label}).`);
  }
  if (selectedImageUrls.has(imageUrl)) {
    throw new Error(`Mẫu Đường một chiều bị trùng ảnh "${item.name}" (${label}).`);
  }
  selectedImageUrls.add(imageUrl);
  return {
    ...resolved,
    metaPrimary: String(item.address || '').trim(),
    metaSecondary: '',
  };
}

function pickOneWayItems(
  pool: GuideItem[],
  count: number,
  seed: string,
  label: string,
  pick: ReturnType<typeof createListPicker>,
  predicate?: (item: GuideItem) => boolean,
): GuideItem[] {
  const eligible = dedupeItems(pool).filter(hasOneWayOwnImage).filter((item) => predicate ? predicate(item) : true);
  const selected = pick(eligible, count, seed);
  if (selected.length < count) {
    throw new Error(`Mẫu Đường một chiều thiếu dữ liệu có ảnh cho nhóm "${label}" (${selected.length}/${count}).`);
  }
  return selected;
}

/** Mẫu kể chuyện 12 trang, chỉ dùng dữ liệu Đà Lạt và ảnh riêng của từng bản ghi. */
export function buildOneWayStoryPages(common: DeckBuildCommon, seedPrefix: string): DeckPage[] {
  const pools = createDeckBuildPools(common.itemsBySection);
  const usedImages = common.globalUsedImageUrls || new Set<string>();
  const selectedImageUrls = new Set<string>();
  const mappedImageUrls = collectMappedImageUrls(pools);
  const resolveImage = createListImageResolver(
    common.imageUrls,
    common.libraryEntries,
    `${seedPrefix}:one-way-story`,
    mappedImageUrls,
    usedImages,
    { orientation: 'any', strictMapping: true },
  );
  const pick = createListPicker(common.globalUsedItemIds);
  const [coverImage, roadImage] = pickOneWayCoverImages(common.coverImageUrls, seedPrefix, usedImages);

  const slopeToken = (item: GuideItem) => /\b(doc|deo)\b/.test(normalizeOneWayText(`${item.name} ${item.address} ${item.type}`));
  const preferredSlope = (item: GuideItem) => ONE_WAY_PREFERRED_SLOPES.some(
    (name) => normalizeOneWayText(item.name).includes(name),
  );
  const preferredSlopePool = pools.checkinItems.filter(preferredSlope);
  const slope = pickOneWayItems(
    preferredSlopePool.length > 0 ? preferredSlopePool : pools.checkinItems,
    1,
    `${seedPrefix}|slope`,
    'dốc Đà Lạt',
    pick,
    preferredSlopePool.length > 0 ? undefined : slopeToken,
  )[0];
  const checkins = pickOneWayItems(pools.checkinItems, 3, `${seedPrefix}|checkin`, 'check-in', pick, (item) => !slopeToken(item));
  const partnerCafes = pickOneWayItems(pools.cafeItems, 3, `${seedPrefix}|partner-cafe`, 'cafe đối tác', pick, (item) => item.isPartner);
  const partnerFoods = pickOneWayItems(pools.foodItems, 2, `${seedPrefix}|partner-food`, 'quán ăn đối tác', pick, (item) => item.isPartner);

  const homestayIndex = oneWaySequenceIndex(seedPrefix) % ONE_WAY_HOMESTAYS.length;
  const wantedHomestay = ONE_WAY_HOMESTAYS[homestayIndex];
  const homestay = dedupeItems(pools.stayItems)
    .filter(hasOneWayOwnImage)
    .find((item) => normalizeOneWayText(item.name) === wantedHomestay);
  if (!homestay) {
    throw new Error(`Mẫu Đường một chiều không tìm thấy homestay "${wantedHomestay}" có ảnh riêng.`);
  }
  common.globalUsedItemIds?.add(itemUsageKey(homestay));

  const slopeItem = oneWayPageItem(slope, 'Dốc Đà Lạt', resolveImage, selectedImageUrls);
  const checkinPageItems = checkins.map((item) => oneWayPageItem(item, 'Check-in', resolveImage, selectedImageUrls));
  const cafePageItems = partnerCafes.map((item) => oneWayPageItem(item, 'Cafe đối tác', resolveImage, selectedImageUrls));
  const stayPageItem = oneWayPageItem(homestay, 'Homestay', resolveImage, selectedImageUrls);
  const foodPageItems = partnerFoods.map((item) => oneWayPageItem(item, 'Quán ăn đối tác', resolveImage, selectedImageUrls));
  selectedImageUrls.forEach((url) => usedImages.add(url));

  const photoPage = (item: PageItem, chipText: string): ListPage => ({
    type: 'list',
    chipText,
    chipTone: 'slate',
    title: '',
    subtitle: '',
    items: [item],
    backgroundImage: item.imageUrl,
    layoutVariant: 'one-way-story-photo',
  });

  return [
    {
      type: 'cover',
      title: BUNDLED_ONE_WAY_HOOKS[0],
      subtitle: '',
      backgroundImage: coverImage,
      coverImages: [coverImage],
      layoutVariant: 'one-way-story-cover',
      titlePlacement: 'center',
    },
    {
      type: 'list', chipText: 'Đường một chiều', chipTone: 'slate',
      title: ONE_WAY_ROAD_TITLE, subtitle: ONE_WAY_ROAD_SUBTITLE,
      items: [], backgroundImage: roadImage, layoutVariant: 'one-way-story-road',
    },
    {
      type: 'list', chipText: 'Đường dốc', chipTone: 'slate',
      title: ONE_WAY_SLOPE_TITLE, subtitle: ONE_WAY_SLOPE_SUBTITLE,
      items: [slopeItem], backgroundImage: slopeItem.imageUrl, layoutVariant: 'one-way-story-slope',
    },
    photoPage(checkinPageItems[0], 'Check-in'),
    photoPage(checkinPageItems[1], 'Check-in'),
    photoPage(cafePageItems[0], 'Cafe đối tác'),
    photoPage(cafePageItems[1], 'Cafe đối tác'),
    photoPage(stayPageItem, 'Homestay'),
    photoPage(foodPageItems[0], 'Quán ăn đối tác'),
    photoPage(foodPageItems[1], 'Quán ăn đối tác'),
    photoPage(checkinPageItems[2], 'Check-in'),
    photoPage(cafePageItems[2], 'Cafe đối tác'),
  ];
}

// Retune images for V3 spot pages (same pipeline as V2).
function finalizeSpotlightV3Pages(pages: DeckPage[], common: DeckBuildCommon, seedPrefix: string): DeckPage[] {
  return retuneSpotlightV2SpotImages(
    tuneSpotlightV2Cover(pages, common.coverImageUrls, `${seedPrefix}|v3-cover`),
    common,
    seedPrefix,
  );
}

export function buildPov3V2DeckPages(common: DeckBuildCommon, seedPrefix: string): DeckPage[] {
  const pools = createDeckBuildPools(common.itemsBySection);
  return buildPov3V2Pages(
    pools,
    common.imageUrls,
    common.libraryEntries,
    seedPrefix,
    common.globalUsedItemIds,
    common.globalUsedImageUrls,
    common.coverImageUrls,
  );
}

function splitStoryDayItems(items: ListPage['items'], dayLabel: string) {
  return items.filter((item) => {
    const label = String(item.label || '');
    const name = String(item.name || '');
    return label.startsWith(dayLabel) || name.startsWith(dayLabel);
  });
}

function dayTotalFromItems(items: ListPage['items']) {
  let total = 0;
  for (const item of items) {
    const raw = String(item.metaSecondary || item.name || '');
    const match = raw.match(/(\d+)\s*k/i);
    if (match) total += Number(match[1]) || 0;
  }
  return total > 0 ? `~${total * 1000 >= 1000000 ? `${(total / 1000).toFixed(1)}tr` : `${total * 1000}k`}` : '~0k';
}

export function buildBudget4N3DWalletPages(common: DeckBuildCommon, seedPrefix: string): DeckPage[] {
  const storyPages = buildPagesForDeck('budget-3n2d-story', ...buildArgs(common, `${seedPrefix}-story`));
  const pools = createDeckBuildPools(common.itemsBySection);
  const cafePages = buildGrid5Pages(
    pools,
    common.imageUrls,
    common.libraryEntries,
    `${seedPrefix}-wallet-gallery`,
    common.globalUsedItemIds,
    common.globalUsedImageUrls,
    common.coverImageUrls,
  )
    .filter((page) => page.type === 'list')
    .filter((page) => {
      const chip = String((page as ListPage).chipText || '').toLowerCase();
      return chip.includes('cafe') || chip.includes('cà phê') || chip.includes('quán ăn') || chip.includes('an');
    })
    .slice(0, 2);

  const cover = storyPages[0];
  if (cover?.type === 'cover') {
    cover.layoutVariant = 'budget-wallet-cover';
    cover.title = '4N3Đ ĐÀ LẠT';
    cover.subtitle = 'MỞ VÍ ~4.2TR · 4 ngày · 3 đêm';
  }

  const dayPages = storyPages
    .filter((page): page is ListPage => page.type === 'list' && page.layoutVariant === 'budget-3n2d-day')
    .map((page, index) => ({
      ...page,
      layoutVariant: 'budget-wallet-day' as const,
      chipText: `Ngày ${String(index + 1).padStart(2, '0')}`,
      subtitle: dayTotalFromItems(page.items),
    }));

  const day3 = dayPages[2];
  const day4Items = day3 ? splitStoryDayItems(day3.items, 'Ngày 03').slice(0, 4) : [];
  const day4 = day3 ? {
    ...day3,
    chipText: 'Ngày 04',
    title: 'Sáng gọn rồi về',
    subtitle: dayTotalFromItems(day4Items),
    items: day4Items.length > 0 ? day4Items : day3.items.slice(0, 4),
    layoutVariant: 'budget-wallet-day' as const,
  } : null;

  const totalPage = storyPages.find((page) => page.type === 'list' && page.layoutVariant === 'budget-3n2d-total') as ListPage | undefined;
  const fixedItems = (totalPage?.items || []).slice(0, 4).map((item) => ({
    ...item,
    label: item.label || 'Phí cố định',
  }));
  const fixedPage = buildListPage(
    'Phí cố định',
    'gold',
    'Ở · xe · vé',
    'Các khoản cố định nên cộng trước khi xem bill tổng.',
    fixedItems,
    '',
    'budget-wallet-fixed',
  );

  const billPage = totalPage ? {
    ...totalPage,
    layoutVariant: 'budget-wallet-bill' as const,
    title: 'BILL 4N3Đ',
    chipText: 'Tổng bill',
  } : buildListPage('Tổng bill', 'gold', 'BILL 4N3Đ', '', [], '', 'budget-wallet-bill');

  return [
    cover,
    ...dayPages,
    ...(day4 ? [day4] : []),
    fixedPage,
    billPage,
    ...cafePages,
  ].filter(Boolean) as DeckPage[];
}

const V2_TEMPLATE_VERSIONS: Record<V2DeckId, number> = {
  'grid-6-quaytung': GRID_6_QUAYTUNG_TEMPLATE_VERSION,
  'grid-8-feed': GRID_8_FEED_TEMPLATE_VERSION,
  'grid-8-quaytung': GRID_8_QUAYTUNG_TEMPLATE_VERSION,
  'spotlight-v2': SPOTLIGHT_V2_TEMPLATE_VERSION,
  'spotlight-v3': SPOTLIGHT_V3_TEMPLATE_VERSION,
  'spotlight-v4': SPOTLIGHT_V4_TEMPLATE_VERSION,
  'spotlight-v5': SPOTLIGHT_V5_TEMPLATE_VERSION,
  'carousel-mau-1': CAROUSEL_MAU_1_TEMPLATE_VERSION,
  'pov-3-v2': POV_3_V2_TEMPLATE_VERSION,
  'itinerary-4n3d-stack': ITINERARY_4N3D_STACK_TEMPLATE_VERSION,
  'itinerary-timeline': ITINERARY_TIMELINE_TEMPLATE_VERSION,
  'one-way-story': ONE_WAY_STORY_TEMPLATE_VERSION,
};

const V2_DECK_META: Record<V2DeckId, { nav: string; title: string; description: string; listName: string }> = {
  'grid-6-quaytung': {
    nav: 'Lưới 6 Quaytung',
    title: 'Bộ lưới 6 ô — bản Quaytung (V2)',
    description: 'Song song Lưới 6 Ô: cover xếp đôi + lưới 3×3 overlay (6 địa điểm + hook giữa). Tham chiếu @quaytungdalat.hihi.',
    listName: 'List lưới 6 quaytung V2',
  },
  'grid-8-feed': {
    nav: 'Lưới 8 Feed',
    title: 'Bộ trang 8 ô — bản Feed (V2)',
    description: 'Song song Lưới 8 Ô: chữ to hơn, badge 01–08, title giữa 2 dòng. Tham chiếu rong_choi / quaytung.',
    listName: 'List lưới 8 feed V2',
  },
  'grid-8-quaytung': {
    nav: 'Lưới 8 Quaytung',
    title: 'Bộ lưới 8 ô — bản Quaytung (V2)',
    description: 'Cover script vàng + 5 trang lưới 3×3 overlay + trang tổng hợp ăn uống. Tham chiếu quaytungdalat.hihi.',
    listName: 'List lưới 8 quaytung V2',
  },
  'spotlight-v2': {
    nav: 'Spotlight V2',
    title: 'Bộ spotlight top-left (V2)',
    description: 'Cover lưới 2×2 ảnh nền + trang địa điểm tên vàng. Tham chiếu dalatdidauchoi49.',
    listName: 'List spotlight V2',
  },
  'spotlight-v3': {
    nav: 'Spotlight V3',
    title: 'Bộ spotlight 13 trang (V3)',
    description: 'Cover hook từ Google Doc + 12 trang 1 địa điểm (check-in/cafe/quán ăn/chơi đêm/homestay/dịch vụ). Không còn trang list cuối.',
    listName: 'List spotlight V3',
  },
  'spotlight-v4': {
    nav: 'Spotlight V4',
    title: 'Bộ spotlight ảnh xen kẽ (V4)',
    description: 'Cover hook + 5 ảnh Hinh_nen rải đều + 8 địa điểm đa nhóm, đúng 14 trang; chống ảnh nền trùng nội dung địa điểm.',
    listName: 'List spotlight V4',
  },
  'spotlight-v5': {
    nav: 'Spotlight V5',
    title: 'Bộ photo carousel TikTok (V5)',
    description: 'Carousel 15 ảnh dọc 4:5: hook, playlist cố định và 13 địa điểm Đà Lạt.',
    listName: 'List spotlight V5',
  },
  'carousel-mau-1': {
    nav: 'Mẫu 1 – Địa điểm',
    title: 'Mẫu 1 – 14 trang địa điểm',
    description: 'Bìa dùng hook Google Docs; 13 trang địa điểm lấy trực tiếp từ đúng nhóm dữ liệu và ảnh của Google Sheet đang chọn.',
    listName: 'Mẫu 1 – Địa điểm',
  },
  'pov-3-v2': {
    nav: 'POV 3 V2',
    title: 'Bộ POV dalat.maikem (V2)',
    description: 'Cover script vàng + 2 trang check-in + 2 trang khu du lịch + grid 3×3 cafe, quán ăn & dịch vụ. Tham chiếu dalat.maikem.',
    listName: 'List POV 3 V2',
  },
  'itinerary-4n3d-stack': {
    nav: '4N3Đ Stack',
    title: 'Bộ 4N3Đ theo nhóm (V2)',
    description: 'Cover nền mờ tone vàng + 7 trang x 4 gợi ý theo ngày (sáng/trưa/tối/cafe/check-in/hoạt động/dịch vụ). Homestay & chơi đêm gộp trang dịch vụ.',
    listName: 'List 4N3Đ stack V2',
  },
  'itinerary-timeline': {
    nav: 'Lịch trình Timeline',
    title: 'Bộ lịch trình timeline 3 ngày (V2)',
    description: 'Cover serif + script trên ảnh; mỗi ngày một thẻ timeline dọc: thumb | chấm | giờ + hoạt động + tên địa điểm + địa chỉ. Ref @rongchoidalattala.',
    listName: 'List lịch trình timeline 3N2Đ',
  },
  'one-way-story': {
    nav: 'Đường một chiều',
    title: 'Đà Lạt: câu chuyện đường một chiều',
    description: 'Mẫu kể chuyện 12 trang: cảnh báo đường một chiều, dốc Đà Lạt và các địa điểm có ảnh riêng theo đúng nhóm dữ liệu.',
    listName: 'Đường một chiều Đà Lạt',
  },
};

export function buildItineraryTimelineDeckPages(common: DeckBuildCommon, seedPrefix: string): DeckPage[] {
  const pools = createDeckBuildPools(common.itemsBySection);
  return buildItineraryTimelinePages(
    pools,
    common.imageUrls,
    common.libraryEntries,
    seedPrefix,
    common.globalUsedItemIds,
    common.globalUsedImageUrls,
    common.coverImageUrls,
  );
}

export function buildItinerary4N3DStackDeckPages(common: DeckBuildCommon, seedPrefix: string): DeckPage[] {
  const pools = createDeckBuildPools(common.itemsBySection);
  const pages = buildItinerary4N3DStackPages(
    pools,
    common.imageUrls,
    common.libraryEntries,
    seedPrefix,
    common.globalUsedItemIds,
    common.globalUsedImageUrls,
    common.coverImageUrls,
  );
  return tuneSpotlightV2Cover(pages, common.coverImageUrls, `${seedPrefix}|cover-grid`);
}

export { setSpotlightV3BuildContext, clearSpotlightV3BuildContext };

export function buildPagesForDeckV2(
  deckId: V2DeckId,
  itemsBySection: WorkbookItemsBySection,
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seedPrefix: string,
  globalUsedItemIds?: Set<string>,
  globalUsedImageUrls?: Set<string>,
  coverImageUrls: string[] = [],
): DeckPage[] {
  const common: DeckBuildCommon = {
    itemsBySection,
    imageUrls,
    libraryEntries,
    coverImageUrls,
    globalUsedItemIds,
    globalUsedImageUrls,
  };

  switch (deckId) {
    case 'grid-6-quaytung':
      return buildGrid6QuaytungDeckPages(common, seedPrefix);
    case 'grid-8-feed':
      return buildGrid8FeedPages(common, seedPrefix);
    case 'grid-8-quaytung':
      return buildGrid8QuaytungDeckPages(common, seedPrefix);
    case 'spotlight-v2':
      return buildSpotlightV2Pages(common, seedPrefix);
    case 'spotlight-v3':
      return buildSpotlightV3Pages(common, seedPrefix, getSpotlightV3BuildContext());
    case 'spotlight-v4':
      return buildSpotlightV4Pages(common, seedPrefix, getSpotlightV3BuildContext());
    case 'spotlight-v5':
      return buildSpotlightV5Pages(common, seedPrefix);
    case 'carousel-mau-1':
      return buildCarouselMau1Pages(common, seedPrefix, getSpotlightV3BuildContext());
    case 'pov-3-v2':
      return buildPov3V2DeckPages(common, seedPrefix);
    case 'itinerary-4n3d-stack':
      return buildItinerary4N3DStackDeckPages(common, seedPrefix);
    case 'itinerary-timeline':
      return buildItineraryTimelineDeckPages(common, seedPrefix);
    case 'one-way-story':
      return buildOneWayStoryPages(common, seedPrefix);
    default:
      throw new Error(`Không hỗ trợ deck V2: ${deckId}`);
  }
}

function buildV2MainList(deckId: V2DeckId, common: DeckBuildCommon): GuideDeckList | null {
  const meta = V2_DECK_META[deckId];
  const pages = buildPagesForDeckV2(
    deckId,
    common.itemsBySection,
    common.imageUrls,
    common.libraryEntries,
    `${deckId}-main`,
    common.globalUsedItemIds,
    common.globalUsedImageUrls,
    common.coverImageUrls,
  );
  if (pages.length === 0) return null;

  const list = buildDeckList(
    deckId,
    'main',
    'List chính',
    meta.listName,
    meta.description,
    pages,
  );
  list.templateVersion = V2_TEMPLATE_VERSIONS[deckId];
  if (deckId === 'spotlight-v5') list.canvasPreset = 'tiktok-4x5';
  return list;
}

export function getV2DeckDefinitions(common: DeckBuildCommon): GuideDeck[] {
  const activeDestinationId = getActiveDestinationLocalize();
  const v4VenueCount = spotlightV4VenuePool(createDeckBuildPools(common.itemsBySection)).length;
  const v5VenueCount = spotlightV5VenuePool(createDeckBuildPools(common.itemsBySection)).length;
  return V2_DECK_IDS
    .filter((deckId) => deckId !== 'carousel-mau-1')
    // Không làm hỏng lần nạp dataset chung khi máy đang có pool Hinh_nen/ảnh
    // venue chưa sẵn sàng. List mới vẫn đi qua builder strict và trả lỗi rõ ràng;
    // catalog chỉ bỏ tạm mẫu không thể dựng khung cho đến lần sync kế tiếp.
    .filter((deckId) => deckId !== 'spotlight-v4' || (
      (activeDestinationId === 'dalat' || activeDestinationId === 'greenland')
      &&
      uniquePortableImages(common.coverImageUrls).filter(spotlightV4BackgroundAllowed).length >= SPOTLIGHT_V4_BACKGROUND_COUNT
      && v4VenueCount >= SPOTLIGHT_V4_VENUE_COUNT
    ))
    .filter((deckId) => deckId !== 'spotlight-v5' || (activeDestinationId === 'dalat' && uniquePortableImages(common.coverImageUrls).length >= 2 && v5VenueCount >= 13))
    .filter((deckId) => deckId !== 'one-way-story' || activeDestinationId === 'dalat')
    .map((deckId) => {
    const meta = V2_DECK_META[deckId];
    const mainList = buildV2MainList(deckId, common);
    return {
      id: deckId,
      navTitle: meta.nav,
      title: meta.title,
      description: meta.description,
      lists: mainList ? [mainList] : [],
    };
    });
}
