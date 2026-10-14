// ─── Kho list đã tạo (generated-caption-lists.<nguồn>.json) ───────────────────
// Hàm thuần đọc/kiểm tra/sửa nội dung kho; GuideService giữ trạng thái trong bộ
// nhớ và quyết định khi nào ghi file.
import type { GeneratedListsStore, GuideDeckList, PartnerRotationHistory } from '../../common/interfaces/guide.types';
import type { DestinationId } from './sync/destination-config';
import { cloneJson } from './guide-file-io';
import * as captionText from './caption-text';
import * as listDisplay from './list-display';
import { isSpotlightV5Deck, isTextNoteDeck } from './deck-kinds';
import { SPOTLIGHT_DESIGN_DECKS } from './logic/spotlight-design';
import { isThreadsLocalDeck } from './logic/threads-food-local';
import { validateRotationStore } from './logic/partner-rotation';
import { GuideItem, ListPage, PageItem, WorkbookItemsBySection } from '../../common/interfaces/guide.types';
import { itemUsageKey } from './logic/data-allocator';
import { truncatePov3V2StackTagline } from './logic/deck-builder';
import { itemMappingKey } from './logic/image-resolver';
import { filterKnownAvailableDriveProxyUrls, listUncachedDriveFileIds } from './sync/drive-images';

export interface GeneratedListStoreContent {
  localTemplateState?: Record<string, Record<string, unknown>>;
  lists: Map<string, GuideDeckList[]>;
  partnerRotation: Record<string, PartnerRotationHistory>;
  diaryUsedLines: Record<string, string[]>;
}

/** Đọc nội dung file kho; lỗi JSON hoặc lịch sử luân phiên hỏng sẽ ném lỗi. */
export function parseGeneratedListStore(raw: string): GeneratedListStoreContent {
  const parsed = JSON.parse(raw.replace(/^﻿/, '')) as Partial<GeneratedListsStore>;
  const partnerRotation = validateRotationStore(parsed.partnerRotation);
  const diaryUsedLines = Object.fromEntries(Object.entries(parsed.diaryUsedLines || {})
    .filter(([, lines]) => Array.isArray(lines) && lines.every(line => typeof line === 'string')));
  const lists = new Map<string, GuideDeckList[]>();
  const deckEntries = parsed.decks && typeof parsed.decks === 'object' ? parsed.decks : {};
  Object.entries(deckEntries).forEach(([deckId, deckLists]) => {
    if (!Array.isArray(deckLists)) return;
    const normalizedLists = deckLists
      .filter((item) => item && typeof item === 'object')
      .map((item) => cloneJson(item as GuideDeckList))
      .filter((item) => item.id && Array.isArray(item.pages));
    if (normalizedLists.length > 0) lists.set(deckId, normalizedLists);
  });
  const localTemplateState = parsed.localTemplateState || {};
  if (typeof localTemplateState !== 'object' || Array.isArray(localTemplateState)) throw new Error('Lịch sử mẫu local bị hỏng.');
  return { lists, partnerRotation, diaryUsedLines, localTemplateState };
}

export function buildGeneratedListStorePayload(content: GeneratedListStoreContent, savedAt: string): GeneratedListsStore {
  const decks = Array.from(content.lists.entries()).reduce(
    (carry, [deckId, lists]) => { carry[deckId] = cloneJson(lists); return carry; },
    {} as Record<string, GuideDeckList[]>,
  );
  return { version: 1, savedAt, decks, diaryUsedLines: content.diaryUsedLines, partnerRotation: content.partnerRotation, localTemplateState: content.localTemplateState || {} };
}

/** Sửa list Maps tạo bởi bản cũ bị refresh item về ảnh Link_drive; null nếu không cần sửa. */
export function repairSpotlightV6MapsLists(lists: GuideDeckList[] | undefined): GuideDeckList[] | null {
  if (!lists?.length) return null;
  let changed = false;
  const repaired = lists.map((list) => list.partnerRotationVersion ? list : ({
    ...list,
    pages: list.pages.map((page) => {
      if (page.type !== 'list'
        || (page.layoutVariant !== 'spotlight-v6-map-page' && page.layoutVariant !== 'spotlight-v6-map-place')
        || !page.items[0]
        || !String(page.backgroundImage || '').trim()) return page;
      const expectedImage = String(page.backgroundImage).trim();
      const firstItem = page.items[0];
      if (firstItem.imageUrl === expectedImage
        && firstItem.candidateImageUrls?.length === 1
        && firstItem.candidateImageUrls[0] === expectedImage) return page;
      changed = true;
      return {
        ...page,
        items: [{
          ...firstItem,
          imageUrl: expectedImage,
          candidateImageUrls: [expectedImage],
          imageMapped: true,
          imageSource: 'manual' as const,
          ...(page.layoutVariant === 'spotlight-v6-map-page' ? { isPartner: false } : {}),
        }, ...page.items.slice(1)],
      };
    }),
  }));
  return changed ? repaired : null;
}

/** Chuẩn hóa chữ của list cũ theo luật làm sạch hiện tại (sửa trực tiếp map); true nếu có thay đổi. */
export function migrateGeneratedListText(destinationId: DestinationId, lists: Map<string, GuideDeckList[]>): boolean {
  if (lists.size === 0) return false;

  let changed = false;
  for (const [deckId, deckLists] of lists.entries()) {
    if (SPOTLIGHT_DESIGN_DECKS.includes(deckId)) continue;
    if (isSpotlightV5Deck(deckId) || (deckId === 'spotlight-v6' || deckId === 'spotlight-v6-color-edit') || deckId === 'spotlight-v6-green' || deckId === 'spotlight-v6-dark' || deckId === 'spotlight-v6-persimmon' || deckId === 'spotlight-v6-diary' || deckId === 'spotlight-v6-maps' || isTextNoteDeck(deckId)) continue;
    if (isThreadsLocalDeck(deckId)) continue;
    const sanitizedLists = deckLists.map((list) => {
      if (list.partnerRotationVersion || list.photoPreset) return list;
      const sanitizedList = captionText.sanitizeGeneratedListText(destinationId, list, deckId);
      if (JSON.stringify(list) !== JSON.stringify(sanitizedList)) changed = true;
      return sanitizedList;
    });
    lists.set(deckId, sanitizedLists);
  }
  return changed;
}

/**
 * Cập nhật tên/địa chỉ/ảnh của địa điểm trong list đã lưu theo dữ liệu nguồn mới
 * (sửa trực tiếp map); true nếu có thay đổi cần ghi file.
 */
export function refreshListImagesFromSource(
  destinationId: DestinationId,
  listsByDeck: Map<string, GuideDeckList[]>,
  itemsBySection: WorkbookItemsBySection,
): boolean {
  if (listsByDeck.size === 0) return false;

  const itemsByKey = new Map<string, GuideItem>();
  const addItemKey = (key: string | undefined, item: GuideItem): void => {
    const cleanKey = String(key ?? '').trim();
    if (cleanKey && !itemsByKey.has(cleanKey)) itemsByKey.set(cleanKey, item);
  };
  Object.values(itemsBySection).forEach((items) => {
    items.forEach((item) => {
      addItemKey(item.id, item);
      addItemKey(itemUsageKey(item), item);
      addItemKey(item.imageMappingKey, item);
      addItemKey(itemMappingKey(item.sectionKey, item.name, item.address), item);
    });
  });

  const findSourceItem = (pageItem: PageItem): GuideItem | undefined => {
    const sourceKey = String(pageItem.sourceKey ?? '').trim();
    if (sourceKey && itemsByKey.has(sourceKey)) return itemsByKey.get(sourceKey);

    const sectionKey = listDisplay.pageItemSectionKey(pageItem);
    const sourceName = listDisplay.pageItemSourceName(pageItem);
    const address = String(pageItem.metaPrimary ?? '').trim();
    if (sectionKey && sourceName) {
      const mappingKey = itemMappingKey(sectionKey, sourceName, address);
      const normalizedMappingKey = itemMappingKey(sectionKey, listDisplay.normalizeDisplayName(sourceName), address);
      if (itemsByKey.has(mappingKey)) return itemsByKey.get(mappingKey);
      if (itemsByKey.has(normalizedMappingKey)) return itemsByKey.get(normalizedMappingKey);
    }

    const legacyId = String(pageItem.id ?? '').trim();
    return legacyId ? itemsByKey.get(legacyId) : undefined;
  };

  let changed = false;
  for (const [deckId, lists] of listsByDeck.entries()) {
    if (SPOTLIGHT_DESIGN_DECKS.includes(deckId)) continue;
    if (isThreadsLocalDeck(deckId)) continue;
    // Maps lưu snapshot theo cặp: item của trang Maps phải giữ file Anh_GG_maps.
    // Luồng refresh chung chỉ biết ảnh thật Link_drive và sẽ thay nhầm trang Maps
    // thành ảnh địa điểm sau lần reload/getDataset đầu tiên.
    if (deckId === 'spotlight-partner' || deckId === 'spotlight-v6-diary' || deckId === 'spotlight-v6-maps' || isTextNoteDeck(deckId)) continue;
    const refreshedLists = lists.map((list) => list.partnerRotationVersion ? list : ({
      ...list,
      pages: list.pages.map((page) => {
        if (page.type !== 'list') return page;
        const mappedPage = {
          ...page,
          items: page.items.map((pageItem) => {
            const sourceItem = findSourceItem(pageItem);
            if (!sourceItem) return pageItem;
            if (page.layoutVariant === 'budget-3n2d-table') {
              return {
                ...pageItem,
                id: sourceItem.id,
                sourceKey: itemUsageKey(sourceItem),
                sourceSectionKey: sourceItem.sectionKey,
                name: listDisplay.refreshedPageItemName(pageItem, sourceItem.name),
                rawName: listDisplay.normalizeDisplayName(sourceItem.name),
                metaPrimary: pageItem.metaPrimary || sourceItem.address || 'Đang cập nhật',
                isPartner: sourceItem.isPartner,
              };
            }

            const [metaPrimary, metaSecondaryRaw] = page.layoutVariant === 'budget-3n2d-gallery'
              ? listDisplay.budgetGalleryItemMetaFromSource(sourceItem)
              : page.layoutVariant === 'spotlight-v3'
                ? listDisplay.spotlightV3ItemMetaFromSource(sourceItem, page.chipText)
              : (page.layoutVariant === 'spotlight-v4-page' || page.layoutVariant === 'spotlight-v5-place' || page.layoutVariant === 'spotlight-v6-page' || (page.layoutVariant === 'summary-note-page' || (page.layoutVariant === 'itinerary-note-day' || page.layoutVariant === 'itinerary-note-dark-day' || page.layoutVariant === 'itinerary-note-threads-day') || page.layoutVariant === 'itinerary-note-timed-day'))
                  ? [String(sourceItem.address || '').trim(), ''] as [string, string]
                : page.layoutVariant === 'carousel-mau-1-page'
                  ? [String(sourceItem.address || '').trim(), ''] as [string, string]
                : listDisplay.pageItemMetaFromSource(sourceItem);
            const metaSecondary = page.layoutVariant === 'itinerary-timeline-day'
              ? listDisplay.mergeTimelineDayMetaSecondary(String(pageItem.metaSecondary || ''), metaSecondaryRaw)
              : metaSecondaryRaw;
            const isPov3V2Stack = page.layoutVariant === 'pov-3-v2-stack';
            const isMenuTextOnly = page.layoutVariant === 'grid-8-quaytung-menu'
              && !String(pageItem.imageUrl || '').trim();
            const highlight = String(sourceItem.highlight || sourceItem.style || '')
              .replace(/\s+/g, ' ')
              .trim();
            const mappingNote = sourceItem.imageSource === 'manual'
              ? 'Ảnh đã map đúng địa điểm từ sheet'
              : pageItem.imageNote;
            const sourceItemDriveUrls = [...new Set(filterKnownAvailableDriveProxyUrls(
              [...(sourceItem.candidateImageUrls || []), sourceItem.imageUrl].filter(Boolean),
            ))].filter((url) => {
              const fileId = String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] || '';
              return !fileId || !listUncachedDriveFileIds([fileId]).length;
            });
            const sourceItemHasReadyImage = sourceItem.imageSource === 'manual'
              && sourceItemDriveUrls.length > 0;
            const nextPageItem = {
              ...pageItem,
              id: sourceItem.id,
              sourceKey: itemUsageKey(sourceItem),
              sourceSectionKey: sourceItem.sectionKey,
              name: listDisplay.refreshedPageItemName(pageItem, sourceItem.name),
              rawName: listDisplay.normalizeDisplayName(sourceItem.name),
              metaPrimary,
              metaSecondary,
              isPartner: sourceItem.isPartner,
              label: isPov3V2Stack && highlight
                ? truncatePov3V2StackTagline(highlight)
                : pageItem.label,
              imageNote: isPov3V2Stack && highlight
                ? truncatePov3V2StackTagline(highlight)
                : mappingNote,
              candidateImageUrls: sourceItemHasReadyImage && !isMenuTextOnly
                ? sourceItemDriveUrls
                : pageItem.candidateImageUrls,
              ...(sourceItemHasReadyImage && !isMenuTextOnly
                ? {
                    imageUrl: sourceItemDriveUrls.includes(sourceItem.imageUrl)
                      ? sourceItem.imageUrl
                      : sourceItemDriveUrls[0],
                    imageMapped: true,
                    imageSource: 'manual' as const,
                  }
                : {}),
            };

            if (JSON.stringify(pageItem) !== JSON.stringify(nextPageItem)) changed = true;
            return nextPageItem;
          }),
        };
        if (page.layoutVariant === 'grid-8-quaytung-menu') {
          return captionText.enforceGrid8QuaytungMenuPage(mappedPage as ListPage);
        }
        return mappedPage;
      }),
    }));
    const sanitizedLists = refreshedLists.map((list) => {
      if (list.partnerRotationVersion) return list;
      const sanitizedList = captionText.sanitizeGeneratedListText(destinationId, list, deckId);
      if (JSON.stringify(list) !== JSON.stringify(sanitizedList)) changed = true;
      return sanitizedList;
    });
    listsByDeck.set(deckId, sanitizedLists);
  }

  return changed;
}
