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
  pickSpotlightV3CoverPlacement,
  pickSpotlightV3Hook,
} from '../sync/spotlight-hook-source';
import type { TitlePlacement } from '../../../common/interfaces/guide.types';

export const GRID_8_FEED_TEMPLATE_VERSION = 16;
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
export const SPOTLIGHT_V2_TEMPLATE_VERSION = 16;
export const SPOTLIGHT_V3_TEMPLATE_VERSION = 2;
export const POV_3_V2_TEMPLATE_VERSION = 13;
export const BUDGET_4N3D_WALLET_TEMPLATE_VERSION = 5;
export const ITINERARY_4N3D_STACK_TEMPLATE_VERSION = 8;
export const ITINERARY_TIMELINE_TEMPLATE_VERSION = 10;

export const V2_DECK_IDS = [
  'grid-6-quaytung',
  'grid-8-feed',
  'grid-8-quaytung',
  'spotlight-v2',
  'spotlight-v3',
  'pov-3-v2',
  'itinerary-4n3d-stack',
  'itinerary-timeline',
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
        backgroundImage: nextItem.imageUrl || listPage.backgroundImage,
      };
    }

    return {
      ...listPage,
      items: [nextItem],
      backgroundImage: nextItem.imageUrl || listPage.backgroundImage,
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
  'pov-3-v2': POV_3_V2_TEMPLATE_VERSION,
  'itinerary-4n3d-stack': ITINERARY_4N3D_STACK_TEMPLATE_VERSION,
  'itinerary-timeline': ITINERARY_TIMELINE_TEMPLATE_VERSION,
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

type SpotlightV3BuildContext = {
  hooks?: string[];
  usedHookTitles?: string[];
  destinationId?: string;
};

let spotlightV3BuildContext: SpotlightV3BuildContext = {};

export function setSpotlightV3BuildContext(context: SpotlightV3BuildContext): void {
  spotlightV3BuildContext = { ...context };
}

export function clearSpotlightV3BuildContext(): void {
  spotlightV3BuildContext = {};
}

function getSpotlightV3BuildContext(): SpotlightV3BuildContext {
  return spotlightV3BuildContext;
}

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
    case 'pov-3-v2':
      return buildPov3V2DeckPages(common, seedPrefix);
    case 'itinerary-4n3d-stack':
      return buildItinerary4N3DStackDeckPages(common, seedPrefix);
    case 'itinerary-timeline':
      return buildItineraryTimelineDeckPages(common, seedPrefix);
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
  return list;
}

export function getV2DeckDefinitions(common: DeckBuildCommon): GuideDeck[] {
  return V2_DECK_IDS.map((deckId) => {
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
