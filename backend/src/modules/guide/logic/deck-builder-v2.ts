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
  buildGrid8QuaytungPages,
  buildListPage,
  buildPagesForDeck,
  buildPov3V2Pages,
  collectMappedImageUrls,
  createDeckBuildPools,
  pageItemWithResolver,
} from './deck-builder';
import { itemUsageKey } from './data-allocator';
import { createListImageResolver, stableHash } from './image-resolver';

export const GRID_8_FEED_TEMPLATE_VERSION = 15;
export const GRID_8_FEED_DEFAULT_POST_CAPTION = 'đều là những chọn lựa có tâm';

export function normalizeGrid8FeedPostCaption(value: string): string {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return GRID_8_FEED_DEFAULT_POST_CAPTION;
  if (/mỗi lựa chọn\s*1 tâm/i.test(clean) || /moi lua chon\s*1 tam/i.test(clean)) {
    return GRID_8_FEED_DEFAULT_POST_CAPTION;
  }
  return clean;
}
export const GRID_8_QUAYTUNG_TEMPLATE_VERSION = 3;
export const SPOTLIGHT_V2_TEMPLATE_VERSION = 16;
export const POV_3_V2_TEMPLATE_VERSION = 8;
export const BUDGET_4N3D_WALLET_TEMPLATE_VERSION = 5;

export const V2_DECK_IDS = [
  'grid-8-feed',
  'grid-8-quaytung',
  'spotlight-v2',
  'pov-3-v2',
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

export function tuneSpotlightV2Cover(
  pages: DeckPage[],
  coverImageUrls: string[],
  seedPrefix: string,
): DeckPage[] {
  const coverGridImages = collectSpotlightV2CoverGridImages(coverImageUrls, seedPrefix);

  return pages.map((page) => {
    if (page.type !== 'cover') return page;
    const variant = page.layoutVariant || '';
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
    if (page.type !== 'list' || page.layoutVariant !== 'spotlight-v2') return page;
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
  'grid-8-feed': GRID_8_FEED_TEMPLATE_VERSION,
  'grid-8-quaytung': GRID_8_QUAYTUNG_TEMPLATE_VERSION,
  'spotlight-v2': SPOTLIGHT_V2_TEMPLATE_VERSION,
  'pov-3-v2': POV_3_V2_TEMPLATE_VERSION,
};

const V2_DECK_META: Record<V2DeckId, { nav: string; title: string; description: string; listName: string }> = {
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
  'pov-3-v2': {
    nav: 'POV 3 V2',
    title: 'Bộ POV dalat.maikem (V2)',
    description: 'Cover script vàng + trang 3 hàng check-in + grid 3×3 cafe & quán ăn. Tham chiếu dalat.maikem.',
    listName: 'List POV 3 V2',
  },
};

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
    case 'grid-8-feed':
      return buildGrid8FeedPages(common, seedPrefix);
    case 'grid-8-quaytung':
      return buildGrid8QuaytungDeckPages(common, seedPrefix);
    case 'spotlight-v2':
      return buildSpotlightV2Pages(common, seedPrefix);
    case 'pov-3-v2':
      return buildPov3V2DeckPages(common, seedPrefix);
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
