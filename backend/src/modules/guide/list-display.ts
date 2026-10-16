// ─── Hiển thị và làm mới list đã lưu (hàm thuần) ─────────────────────────────
// Làm sạch list/trang trước khi gửi cho giao diện, chọn ảnh bìa/nền, câu phụ đề
// theo ngữ cảnh, phiên bản mẫu và các hàm phụ trợ khi làm mới địa điểm từ Sheet.
import type { DestinationId } from './sync/destination-config';
import { cloneJson } from './guide-file-io';
import * as captionText from './caption-text';
import { CaptionTone, isSpotlightV5Deck, isTextNoteDeck } from './deck-kinds';
import { SECTION_CONFIG } from '../../common/constants/guide.constants';
import { CaptionBlocks, DeckPage, GuideDeckList, GuideItem, PageItem, SectionKey, WorkbookItemsBySection } from '../../common/interfaces/guide.types';
import { itemUsageKey } from './logic/data-allocator';
import { BUDGET_3N2D_STORY_TEMPLATE_VERSION, BUDGET_3N2D_TEMPLATE_VERSION, BUDGET_72H_SUMMARY_TEMPLATE_VERSION, GRID_4_MUTANT_TEMPLATE_VERSION, GRID_4_TEMPLATE_VERSION, GRID_5_TEMPLATE_VERSION, GRID_6_TEMPLATE_VERSION, GRID_6_ZIGZAG_TEMPLATE_VERSION, GRID_8_TEMPLATE_VERSION, ITINERARY_3N2D_TEMPLATE_VERSION, ITINERARY_4N2D_GRID8_TEMPLATE_VERSION, ITINERARY_4N3D_TEMPLATE_VERSION, POV_3_DAY_TEMPLATE_VERSION, SPOTLIGHT_GUIDE_TEMPLATE_VERSION, SPOTLIGHT_PARTNER_TEMPLATE_VERSION, displayPrice, metaText, sanitizeCaptionBodyForPages, sanitizeDeckHeadline, truncateGrid8CoverSubtitle, truncateGrid8FeedCoverSubtitle } from './logic/deck-builder';
import { BUDGET_4N3D_WALLET_TEMPLATE_VERSION, CAROUSEL_MAU_1_TEMPLATE_VERSION, GRID_6_QUAYTUNG_TEMPLATE_VERSION, GRID_8_FEED_TEMPLATE_VERSION, GRID_8_QUAYTUNG_TEMPLATE_VERSION, ITINERARY_4N3D_STACK_TEMPLATE_VERSION, ITINERARY_TIMELINE_TEMPLATE_VERSION, ONE_WAY_STORY_TEMPLATE_VERSION, POV_3_V2_TEMPLATE_VERSION, SPOTLIGHT_V2_TEMPLATE_VERSION, SPOTLIGHT_V3_TEMPLATE_VERSION, SPOTLIGHT_V4_TEMPLATE_VERSION, SPOTLIGHT_V5_TEMPLATE_VERSION, SPOTLIGHT_V6_DARK_TEMPLATE_VERSION, SPOTLIGHT_V6_GREEN_TEMPLATE_VERSION, SPOTLIGHT_V6_MAPS_TEMPLATE_VERSION, SPOTLIGHT_V6_PERSIMMON_TEMPLATE_VERSION, SPOTLIGHT_V6_TEMPLATE_VERSION, SUMMARY_NOTE_TEMPLATE_VERSION, tuneSpotlightV2Cover } from './logic/deck-builder-v2';
import { normalizeText, stableHash } from './logic/image-resolver';
import { ITINERARY_NOTE_DARK_ID, ITINERARY_NOTE_DARK_TEMPLATE_VERSION, ITINERARY_NOTE_TEMPLATE_VERSION } from './logic/itinerary-note';
import { THREADS_BUDGET_ID, THREADS_BUDGET_TEMPLATE_VERSION } from './logic/itinerary-note-threads-budget';
import { isThreadsExpense, THREADS_EXPENSE_TEMPLATE_VERSION } from './logic/threads-expense-sheet';
import { ITINERARY_NOTE_TIMED_TEMPLATE_VERSION } from './logic/itinerary-note-timed';
import { SPOTLIGHT_DESIGN_DECKS, prepareSpotlightDesign } from './logic/spotlight-design';
import { DIARY_TEMPLATE_VERSION } from './logic/spotlight-diary';
import { THREADS_CAFE_ID, THREADS_CAFE_TEMPLATE_VERSION, THREADS_FOOD_ID, THREADS_FOOD_TEMPLATE_VERSION, THREADS_MIX_ID, THREADS_MIX_TEMPLATE_VERSION, THREADS_MIX_TEXT_ID, THREADS_MIX_TEXT_TEMPLATE_VERSION, isThreadsLocalDeck } from './logic/threads-food-local';
import { THREADS_TOPLIST_ID, THREADS_TOPLIST_TEMPLATE_VERSION } from './logic/threads-toplist';
import { THREADS_NOTE_DECK_IDS } from './sync/destination-config';
import { getMarketingCopy, localizeText } from './sync/destination-localize';

const RECENT_LIST_IMAGE_WINDOW = 1;

export function applyRecentImageReuseGuard(lists: GuideDeckList[]): GuideDeckList[] {
  const recentListImageSets: Array<Set<string>> = [];

  return lists.map((list) => {
    if (list.partnerRotationVersion || list.photoPreset || list.id.startsWith('spotlight-v6-diary-')) return list;
    const recentImageUrls = mergeRecentImageSets(recentListImageSets);
    const currentListVisualImageUrls = new Set<string>();
    const currentListItemImageUrls = new Set<string>();
    const guardedList: GuideDeckList = {
      ...list,
      pages: list.pages.map((page) => {
        if (page.backgroundImage) currentListVisualImageUrls.add(page.backgroundImage);
        if (page.type !== 'list') return page;

        const currentPageImageUrls = new Set<string>();
        return {
          ...page,
          items: page.items.map((item) => {
            const nextImageUrl = pickFreshCandidateImage(
              item.imageUrl,
              item.candidateImageUrls,
              recentImageUrls,
              currentListItemImageUrls,
              currentPageImageUrls,
            );
            if (nextImageUrl) currentListVisualImageUrls.add(nextImageUrl);
            return nextImageUrl && nextImageUrl !== item.imageUrl
              ? { ...item, imageUrl: nextImageUrl }
              : item;
          }),
        };
      }),
    };

    recentListImageSets.push(currentListVisualImageUrls);
    while (recentListImageSets.length > RECENT_LIST_IMAGE_WINDOW) recentListImageSets.shift();
    return guardedList;
  });
}

export function mergeRecentImageSets(imageSets: Array<Set<string>>): Set<string> {
  const merged = new Set<string>();
  for (const imageSet of imageSets) {
    imageSet.forEach((url) => merged.add(url));
  }
  return merged;
}

export function pickFreshCandidateImage(
  currentUrl: string | undefined,
  candidateUrls: string[] | undefined,
  recentImageUrls: Set<string>,
  currentListImageUrls: Set<string>,
  currentPageImageUrls: Set<string>,
): string {
  const current = String(currentUrl ?? '').trim();
  const candidates = [...new Set([...(candidateUrls ?? []), current].map((url) => String(url ?? '').trim()).filter(Boolean))];
  if (current && !recentImageUrls.has(current) && !currentListImageUrls.has(current) && !currentPageImageUrls.has(current)) {
    currentListImageUrls.add(current);
    currentPageImageUrls.add(current);
    return current;
  }

  const freshCandidate = candidates.find((url) => !recentImageUrls.has(url) && !currentListImageUrls.has(url) && !currentPageImageUrls.has(url));
  const pageFreshCandidate = candidates.find((url) => !recentImageUrls.has(url) && !currentPageImageUrls.has(url));
  const pageUniqueCandidate = candidates.find((url) => !currentPageImageUrls.has(url));
  const currentPageUnique = current && !currentPageImageUrls.has(current) ? current : '';
  const picked = freshCandidate || pageFreshCandidate || pageUniqueCandidate || currentPageUnique || current;
  if (picked) {
    currentListImageUrls.add(picked);
    currentPageImageUrls.add(picked);
  }
  return picked;
}

export function templateVersionForDeck(deckId: string): number | undefined {
  if (deckId === 'spotlight-v6-cherry-blossom') return 1;
  if (deckId === 'spotlight-v6-diary') return DIARY_TEMPLATE_VERSION;
  if (deckId === 'itinerary-3n2d') return ITINERARY_3N2D_TEMPLATE_VERSION;
  if (deckId === 'budget-3n2d') return BUDGET_3N2D_TEMPLATE_VERSION;
  if (deckId === 'budget-72h-summary') return BUDGET_72H_SUMMARY_TEMPLATE_VERSION;
  if (deckId === 'budget-3n2d-story') return BUDGET_3N2D_STORY_TEMPLATE_VERSION;
  if (deckId === 'itinerary-4n3d') return ITINERARY_4N3D_TEMPLATE_VERSION;
  if (deckId === 'itinerary-4n2d-grid8') return ITINERARY_4N2D_GRID8_TEMPLATE_VERSION;
  if (deckId === 'pov-3-day') return POV_3_DAY_TEMPLATE_VERSION;
  if (deckId === 'grid-4') return GRID_4_TEMPLATE_VERSION;
  if (deckId === 'grid-4-mutant') return GRID_4_MUTANT_TEMPLATE_VERSION;
  if (deckId === 'grid-5') return GRID_5_TEMPLATE_VERSION;
  if (deckId === 'grid-6-zigzag') return GRID_6_ZIGZAG_TEMPLATE_VERSION;
  if (deckId === 'grid-6') return GRID_6_TEMPLATE_VERSION;
  if (deckId === 'grid-8') return GRID_8_TEMPLATE_VERSION;
  if (deckId === 'spotlight-guide') return SPOTLIGHT_GUIDE_TEMPLATE_VERSION;
  if (deckId === 'spotlight-partner') return SPOTLIGHT_PARTNER_TEMPLATE_VERSION;
  if (deckId === 'grid-8-feed') return GRID_8_FEED_TEMPLATE_VERSION;
  if (deckId === 'grid-6-quaytung') return GRID_6_QUAYTUNG_TEMPLATE_VERSION;
  if (deckId === 'grid-8-quaytung') return GRID_8_QUAYTUNG_TEMPLATE_VERSION;
  if (deckId === 'spotlight-v2') return SPOTLIGHT_V2_TEMPLATE_VERSION;
  if (deckId === 'spotlight-v3') return SPOTLIGHT_V3_TEMPLATE_VERSION;
  if (deckId === 'spotlight-v4') return SPOTLIGHT_V4_TEMPLATE_VERSION;
  if (isSpotlightV5Deck(deckId)) return SPOTLIGHT_V5_TEMPLATE_VERSION;
  if (deckId === 'spotlight-v6-color-edit') return 1;
  if (deckId === 'spotlight-v6') return SPOTLIGHT_V6_TEMPLATE_VERSION;
  if (deckId === 'spotlight-v6-green') return SPOTLIGHT_V6_GREEN_TEMPLATE_VERSION;
  if (deckId === 'spotlight-v6-dark') return SPOTLIGHT_V6_DARK_TEMPLATE_VERSION;
  if (deckId === 'spotlight-v6-persimmon') return SPOTLIGHT_V6_PERSIMMON_TEMPLATE_VERSION;
  if (deckId === 'spotlight-v6-maps') return SPOTLIGHT_V6_MAPS_TEMPLATE_VERSION;
  if (deckId === THREADS_BUDGET_ID) return THREADS_BUDGET_TEMPLATE_VERSION;
  if (isThreadsExpense(deckId)) return THREADS_EXPENSE_TEMPLATE_VERSION;
  if (deckId === THREADS_FOOD_ID) return THREADS_FOOD_TEMPLATE_VERSION;
  if (deckId === THREADS_CAFE_ID) return THREADS_CAFE_TEMPLATE_VERSION;
  if (deckId === THREADS_MIX_ID) return THREADS_MIX_TEMPLATE_VERSION;
  if (deckId === THREADS_MIX_TEXT_ID) return THREADS_MIX_TEXT_TEMPLATE_VERSION;
  if (deckId === ITINERARY_NOTE_DARK_ID) return ITINERARY_NOTE_DARK_TEMPLATE_VERSION;
  if (deckId === THREADS_TOPLIST_ID) return THREADS_TOPLIST_TEMPLATE_VERSION;
  if (isTextNoteDeck(deckId)) return deckId === 'itinerary-note-timed' ? ITINERARY_NOTE_TIMED_TEMPLATE_VERSION : (deckId === 'itinerary-note-2days' || deckId.startsWith('itinerary-note-threads-')) ? ITINERARY_NOTE_TEMPLATE_VERSION : SUMMARY_NOTE_TEMPLATE_VERSION;
  if (deckId === 'carousel-mau-1') return CAROUSEL_MAU_1_TEMPLATE_VERSION;
  if (deckId === 'pov-3-v2') return POV_3_V2_TEMPLATE_VERSION;
  if (deckId === 'itinerary-4n3d-stack') return ITINERARY_4N3D_STACK_TEMPLATE_VERSION;
  if (deckId === 'itinerary-timeline') return ITINERARY_TIMELINE_TEMPLATE_VERSION;
  if (deckId === 'one-way-story') return ONE_WAY_STORY_TEMPLATE_VERSION;
  if (deckId === 'budget-4n3d-wallet') return BUDGET_4N3D_WALLET_TEMPLATE_VERSION;
  return undefined;
}

export function normalizeCaptionTone(value?: string): CaptionTone {
  const allowed: CaptionTone[] = ['gen_z', 'tinh_te', 'review_chan_that', 'ban_hang_nhe', 'lich_trinh_huu_ich'];
  return allowed.includes(value as CaptionTone) ? value as CaptionTone : 'lich_trinh_huu_ich';
}

export function budget3N2DCoverCaption(caption: CaptionBlocks): CaptionBlocks {
  // Tiêu đề cover 3 mẫu budget giờ lấy từ pool hook tĩnh (resolvePremadeHookCoverTitle),
  // không còn ghi đè bằng pool tiêu đề theo tone cũ ở đây nữa.
  // Người dùng đã quyết định bỏ hẳn mô tả (body) khỏi app — không còn pool body mặc định cho 3 mẫu budget nữa.
  return {
    ...caption,
    body: '',
  };
}

export function canRefreshGeneratedTemplate(deckId: string): boolean {
  // Snapshot templates retain approved content, even when their template version changes.
  return !isThreadsLocalDeck(deckId) && !isTextNoteDeck(deckId)
    && !['spotlight-guide', 'spotlight-v2', 'spotlight-v3', 'spotlight-v4', 'spotlight-v5', 'spotlight-v5-color-edit', 'spotlight-v6', 'spotlight-v6-color-edit', 'spotlight-v6-green',
      'spotlight-v6-dark', 'spotlight-v6-persimmon', 'spotlight-v6-diary', 'spotlight-v6-maps'].includes(deckId);
}

export function sanitizeGeneratedListForDisplay(destinationId: DestinationId,
  list: GuideDeckList,
  coverImageUrls: string[] = [],
  usedCoverUrls?: Set<string>,
  deckId?: string,
): GuideDeckList {
  if (list.partnerRotationVersion || list.photoPreset || SPOTLIGHT_DESIGN_DECKS.includes(deckId || '') || THREADS_NOTE_DECK_IDS.includes(deckId || '')) return cloneJson(list);
  const cleanList = captionText.sanitizeGeneratedListText(destinationId, list, deckId);
  if (isThreadsLocalDeck(deckId || '') || deckId === 'spotlight-v6-diary') return cleanList;
  if (!/caption-/i.test(cleanList.id)) return cleanList;

  const safeDescription = captionText.sanitizeContentText(sanitizeCaptionBodyForPages(cleanList.description, cleanList.pages));
  const pages = cleanList.pages.map((page) => sanitizeGeneratedPageForDisplay(destinationId, page, cleanList, safeDescription));
  const enrichedPages = tuneSpotlightV2Cover(pages, coverImageUrls, `${cleanList.id}|cover-grid`);
  const portableCoverImage = coverImageForList(cleanList, coverImageUrls, usedCoverUrls);
  return {
    ...cleanList,
    description: safeDescription,
    pages: enrichedPages.map((page, pageIndex) => {
      if (String(page.layoutVariant || '').startsWith('one-way-story-') || (String(page.layoutVariant || '').startsWith('spotlight-v4-') || String(page.layoutVariant || '').startsWith('spotlight-v5-') || String(page.layoutVariant || '').startsWith('spotlight-v6-') || (String(page.layoutVariant || '').startsWith('summary-note-') || (page.layoutVariant === 'itinerary-note-day' || page.layoutVariant === 'itinerary-note-dark-day' || page.layoutVariant === 'itinerary-note-threads-day') || page.layoutVariant === 'itinerary-note-timed-day'))) {
        return page;
      }
      const pageBackgroundImage = backgroundImageForPage(cleanList, page, pageIndex, coverImageUrls);
      if (page.type === 'cover') {
        const grid = Array.isArray(page.coverImages) ? page.coverImages.filter(Boolean) : [];
        if (grid.length > 0) return { ...page, backgroundImage: grid[0] };
        return { ...page, backgroundImage: portableCoverImage };
      }
      return { ...page, backgroundImage: pageBackgroundImage };
    }),
  };
}

export function sanitizeBaseListForDisplay(destinationId: DestinationId, list: GuideDeckList, coverImageUrls: string[] = []): GuideDeckList {
  // Declarative local samples already own their photos and layout snapshot.
  // Generic workbook cover rotation can replace them (or blank them with no pool).
  if (list.pages.some(page => Boolean(page.localRender) || Boolean(page.imageRole))) return cloneJson(list);
  // Threads/Note builders own their backgrounds, including the fixed Top list cover.
  // Generic cover rotation must not replace these assets while displaying saved lists.
  if (THREADS_NOTE_DECK_IDS.some(id => list.id.startsWith(`${id}-`))) return cloneJson(list);
  const spotlightId = SPOTLIGHT_DESIGN_DECKS.find(id => list.id === `${id}-main`);
  if (spotlightId) return prepareSpotlightDesign(cloneJson(list), spotlightId, coverImageUrls);
  if (list.id.startsWith(THREADS_FOOD_ID) || list.id.startsWith(THREADS_CAFE_ID) || list.id.startsWith(THREADS_MIX_ID) || list.id.startsWith(THREADS_MIX_TEXT_ID)) return cloneJson(list);
  if (list.id.startsWith('spotlight-v6-diary-')) return cloneJson(list);
  const pages = list.pages.map((page) => sanitizeBasePageForDisplay(destinationId, page, list));
  const enrichedPages = tuneSpotlightV2Cover(pages, coverImageUrls, `${list.id}|cover-grid`);
  return {
    ...list,
    pages: enrichedPages.map((page, pageIndex) => {
      if (String(page.layoutVariant || '').startsWith('one-way-story-') || (String(page.layoutVariant || '').startsWith('spotlight-v4-') || String(page.layoutVariant || '').startsWith('spotlight-v5-') || String(page.layoutVariant || '').startsWith('spotlight-v6-') || (String(page.layoutVariant || '').startsWith('summary-note-') || (page.layoutVariant === 'itinerary-note-day' || page.layoutVariant === 'itinerary-note-dark-day' || page.layoutVariant === 'itinerary-note-threads-day') || page.layoutVariant === 'itinerary-note-timed-day'))) {
        return page;
      }
      if (page.type === 'cover') {
        const coverImages = Array.isArray(page.coverImages) ? page.coverImages.filter(Boolean) : [];
        return { ...page, backgroundImage: coverImages[0] || backgroundImageForPage(list, page, pageIndex, coverImageUrls) };
      }
      return { ...page, backgroundImage: backgroundImageForPage(list, page, pageIndex, coverImageUrls) };
    }),
  };
}

export function sanitizeBasePageForDisplay(destinationId: DestinationId, page: DeckPage, list: GuideDeckList): DeckPage {
  const cleanPage = captionText.sanitizeDeckPageText(destinationId, page);
  if (cleanPage.type === 'cover' && (cleanPage.layoutVariant === 'spotlight-v2' || cleanPage.layoutVariant === 'spotlight-v3' || cleanPage.layoutVariant === 'spotlight-v4-cover' || cleanPage.layoutVariant === 'spotlight-v5-cover' || cleanPage.layoutVariant === 'spotlight-v6-cover' || cleanPage.layoutVariant === 'carousel-mau-1-cover')) {
    return { ...cleanPage, subtitle: '' };
  }
  if (cleanPage.type !== 'list' || cleanPage.layoutVariant !== 'journey-4n3d') {
    if (cleanPage.type === 'list' && cleanPage.layoutVariant === 'grid-8-quaytung-menu') {
      return captionText.enforceGrid8QuaytungMenuPage({
        ...cleanPage,
        items: cleanPage.items.map((item) => captionText.sanitizePageItemText(item, cleanPage)),
      });
    }
    return cleanPage;
  }

  const rawSubtitle = String(cleanPage.subtitle ?? '').trim();
  const pageSubtitle = rawSubtitle ? captionText.sanitizeContentText(sanitizeCaptionBodyForPages(cleanPage.subtitle, [cleanPage])) : '';
  const shouldUseContextualSubtitle =
    !rawSubtitle ||
    samePlainText(pageSubtitle, captionBodyFallback(destinationId));

  return {
    ...cleanPage,
    subtitle: shouldUseContextualSubtitle
      ? captionText.sanitizeContentText(contextualGeneratedPageSubtitle(destinationId, cleanPage, list))
      : localizeText(pageSubtitle, destinationId),
  };
}

export function coverImageForList(list: GuideDeckList, coverImageUrls: string[], usedCoverUrls?: Set<string>): string {
  const pool = coverImageUrls.filter((url) => isPortableImageUrl(url));
  if (pool.length === 0) return '';
  const seed = `${list.id}|${list.title}|${list.description}|cover`;
  const ordered = [...pool].sort((left, right) => stableHash(`${seed}:${left}`) - stableHash(`${seed}:${right}`));
  const picked = ordered.find((url) => !usedCoverUrls?.has(url)) || ordered[0] || '';
  if (picked) usedCoverUrls?.add(picked);
  return picked;
}

export function backgroundImageForPage(
  list: GuideDeckList,
  page: DeckPage,
  pageIndex: number,
  coverImageUrls: string[],
): string {
  const pool = coverImageUrls.filter((url) => isPortableImageUrl(url));
  if (pool.length === 0) return '';
  const seed = `${list.id}|${pageIndex}|${page.type}|${page.layoutVariant || ''}|background`;
  return [...pool].sort(
    (left, right) => stableHash(`${seed}:${left}`) - stableHash(`${seed}:${right}`),
  )[0] || '';
}

export function isPortableImageUrl(value?: string): boolean {
  const url = String(value ?? '').trim();
  return /^https?:\/\//i.test(url) || url.startsWith('/assets/drive-file');
}

export function firstPortableImageForPages(pages: DeckPage[]): string {
  for (const page of pages) {
    if (isPortableImageUrl(page.backgroundImage)) return page.backgroundImage;
    if (page.type !== 'list') continue;
    for (const item of page.items) {
      if (isPortableImageUrl(item.imageUrl)) return item.imageUrl;
      const candidate = item.candidateImageUrls?.find((url) => isPortableImageUrl(url));
      if (candidate) return candidate;
    }
  }
  return '';
}

export function sanitizeGeneratedPageForDisplay(destinationId: DestinationId, page: DeckPage, list: GuideDeckList, safeDescription: string): DeckPage {
  if (page.type === 'cover') {
    const layout = String(page.layoutVariant || '');
    if (layout === 'spotlight-v3' || layout === 'spotlight-v4-cover' || layout === 'spotlight-v5-cover' || layout === 'spotlight-v6-cover' || layout === 'carousel-mau-1-cover') {
      return { ...page, subtitle: '' };
    }
    if (layout === 'spotlight-v2') {
      return {
        ...page,
        title: captionText.sanitizeContentText(sanitizeDeckHeadline(list.coverTitle || list.title || page.title)),
        subtitle: '',
      };
    }
    if (layout === 'grid-8-feed') {
      const rawSubtitle = String(page.subtitle ?? '').trim() || safeDescription;
      return {
        ...page,
        title: captionText.sanitizeContentText(sanitizeDeckHeadline(list.coverTitle || list.title || page.title)),
        subtitle: captionText.sanitizeContentText(truncateGrid8FeedCoverSubtitle(rawSubtitle)),
      };
    }
    if (layout === 'grid-8' || layout === 'journey-4n2d-grid8') {
      const rawSubtitle = String(page.subtitle ?? '').trim() || safeDescription;
      return {
        ...page,
        title: captionText.sanitizeContentText(sanitizeDeckHeadline(list.coverTitle || list.title || page.title)),
        subtitle: captionText.sanitizeContentText(truncateGrid8CoverSubtitle(rawSubtitle)),
      };
    }
    // Use page's own subtitle if available, otherwise use the list description (body).
    // Truncate to ~150 chars, cutting at sentence boundary for natural reading — không thêm "...".
    const rawSubtitle = String(page.subtitle ?? '').trim() || safeDescription;
    let coverSubtitle = rawSubtitle;
    if (rawSubtitle.length > 150) {
      // Try to cut at sentence end (. ! ?) within first 150 chars
      const truncated = rawSubtitle.slice(0, 150);
      const lastSentenceEnd = Math.max(
        truncated.lastIndexOf('. '),
        truncated.lastIndexOf('! '),
        truncated.lastIndexOf('? '),
        truncated.lastIndexOf('.\n'),
      );
      if (lastSentenceEnd > 60) {
        coverSubtitle = rawSubtitle.slice(0, lastSentenceEnd + 1).trim();
      } else {
        const lastSpace = truncated.lastIndexOf(' ');
        coverSubtitle = (lastSpace > 60 ? truncated.slice(0, lastSpace) : truncated).trim();
      }
    }
    return {
      ...page,
      title: captionText.sanitizeContentText(sanitizeDeckHeadline(list.coverTitle || list.title || page.title)),
      subtitle: captionText.sanitizeContentText(coverSubtitle),
    };
  }

  if (String(page.layoutVariant || '').startsWith('one-way-story-')) {
    return captionText.sanitizeDeckPageText(destinationId, page);
  }

  if ((String(page.layoutVariant || '').startsWith('spotlight-v4-') || String(page.layoutVariant || '').startsWith('spotlight-v5-') || String(page.layoutVariant || '').startsWith('spotlight-v6-') || (String(page.layoutVariant || '').startsWith('summary-note-') || (page.layoutVariant === 'itinerary-note-day' || page.layoutVariant === 'itinerary-note-dark-day' || page.layoutVariant === 'itinerary-note-threads-day') || page.layoutVariant === 'itinerary-note-timed-day'))) {
    return {
      ...page,
      title: captionText.sanitizeContentText(sanitizeDeckHeadline(page.title)),
      subtitle: page.layoutVariant === 'itinerary-note-timed-day'
        ? captionText.sanitizeContentText(page.subtitle)
        : '',
      items: page.items.map((item) => captionText.sanitizePageItemText(item, page)),
    };
  }

  const rawSubtitle = String(page.subtitle ?? '').trim();
  const pageSubtitle = captionText.sanitizeContentText(sanitizeCaptionBodyForPages(page.subtitle, [page]));
  const shouldUseContextualSubtitle =
    !rawSubtitle ||
    page.layoutVariant === 'grid-8' ||
    samePlainText(pageSubtitle, safeDescription) ||
    samePlainText(pageSubtitle, captionBodyFallback(destinationId));
  const sanitizedPage = {
    ...page,
    title: captionText.sanitizeContentText(sanitizeDeckHeadline(page.title)),
    chipText: captionText.sanitizeContentText(page.chipText),
    items: page.items.map((item) => captionText.sanitizePageItemText(item, page)),
    subtitle: shouldUseContextualSubtitle
      ? captionText.sanitizeContentText(contextualGeneratedPageSubtitle(destinationId, page, list))
      : localizeText(pageSubtitle, destinationId),
  };
  if (page.layoutVariant === 'grid-8-quaytung-menu') {
    return captionText.enforceGrid8QuaytungMenuPage(sanitizedPage);
  }
  return sanitizedPage;
}

export function samePlainText(left: string, right: string): boolean {
  return normalizeText(left) === normalizeText(right);
}

export function contextualGeneratedPageSubtitle(destinationId: DestinationId, page: DeckPage, list: GuideDeckList): string {
  if (page.type !== 'list') return '';

  const kind = generatedPageKind(page);
  const variants = generatedSubtitleVariants(kind);
  return localizeText(variants[generatedListVariantIndex(list, variants.length, kind)] || variants[0] || '', destinationId);
}

export function generatedPageKind(page: DeckPage): string {
  if (page.type !== 'list') return 'generic';

  const key = normalizeText(`${page.chipText} ${page.title}`);
  if (page.layoutVariant === 'journey-4n3d') {
    if (key.includes('day_01') || key.includes('ngay_1') || key.includes('vao_pho')) return 'journey_day1';
    if (key.includes('day_02') || key.includes('ngay_2') || key.includes('san_anh')) return 'journey_day2';
    if (key.includes('day_03') || key.includes('ngay_3') || key.includes('di_sau')) return 'journey_day3';
    if (key.includes('day_04') || key.includes('ngay_4') || key.includes('cham_roi')) return 'journey_day4';
  }
  if (key.includes('quan_an') || key.includes('mon_ngon')) return 'food';
  if (key.includes('cafe') || key.includes('ca_phe')) return 'cafe';
  if (key.includes('check_in')) return 'checkin';
  if (key.includes('choi_dem')) return 'nightlife';
  if (key.includes('dich_vu') || key.includes('luu_y')) return 'service';
  if (key.includes('homestay') || key.includes('luu_tru')) return 'stay';
  if (key.includes('hoat_dong')) return 'activity';
  if (key.includes('khu_du_lich')) return 'tourism';
  return 'generic';
}

export function generatedListVariantIndex(list: GuideDeckList, variantCount: number, salt: string): number {
  if (variantCount <= 1) return 0;

  const captionMatch = list.id.match(/caption-(\d+)/i);
  if (captionMatch) return Math.max(0, Number(captionMatch[1]) - 1) % variantCount;

  return stableHash(`${list.id}|${list.title}|${salt}`) % variantCount;
}

export function generatedSubtitleVariants(kind: string): string[] {
  const variants: Record<string, string[]> = {
    journey_day1: [
      'Ngày đầu đi nhẹ trong phố: ăn sáng, cafe, check-in và một điểm ghé vừa đủ nhịp.',
      'Khởi động lịch bằng các điểm dễ đi, ít vòng xa, hợp để quen nhịp Đà Lạt.',
      'Một ngày mở màn gọn gàng: có bữa sáng, có cafe, có góc chụp và thời gian nghỉ.',
      'Day 01 ưu tiên các điểm gần nhau để đi chậm, dễ chọn và không bị cuốn lịch quá dày.',
    ],
    journey_day2: [
      'Ngày thứ hai ưu tiên ảnh đẹp, quán dễ nghỉ chân và các điểm đi trong cùng cung.',
      'Một ngày dành cho check-in nhiều hơn, xen kẽ cafe và bữa ăn để lịch không bị đuối.',
      'Day 02 gom các điểm lên hình ổn, phù hợp khi đã bắt nhịp và muốn đi sâu hơn.',
      'Lịch ngày hai rõ cung hơn: chọn điểm chính trước, rồi thêm quán nghỉ chân vừa đủ.',
    ],
    journey_day3: [
      'Ngày giữa chuyến đi sâu hơn một chút, thêm điểm trải nghiệm và bữa tối rõ ràng.',
      'Day 03 dành cho các điểm cần nhiều thời gian hơn, có chỗ ăn và chỗ dừng hợp nhịp.',
      'Một ngày để đổi mood: bớt vội, thêm trải nghiệm, vẫn giữ các điểm ăn nghỉ dễ theo.',
      'Lịch ngày ba cân bằng giữa điểm chơi, bữa ăn và vài nơi đáng ghé trước khi tối xuống.',
    ],
    journey_day4: [
      'Ngày cuối đi chậm, chốt vài điểm dễ ghé rồi dành thời gian nghỉ và mua quà.',
      'Day 04 giữ lịch nhẹ để còn trả phòng, mua quà và không bị gấp trước lúc về.',
      'Một ngày kết chuyến vừa đủ: ít điểm hơn, dễ xoay giờ và có khoảng trống nghỉ chân.',
      'Lịch ngày cuối ưu tiên những điểm thuận đường, không nhồi quá nhiều để về nhẹ nhàng.',
    ],
    food: [
      'Nhóm quán ăn được gom riêng để người xem chọn bữa nhanh, dễ scan trước khi đi.',
      'Một trang chỉ dành cho đồ ăn, ưu tiên chỗ dễ gọi món và tiện ghé theo lịch.',
      'Ghim sẵn các quán ăn để lúc đói chỉ cần mở list, chọn nhanh, khỏi lướt lại.',
      'Các quán được lọc riêng để dễ đổi bữa mà không làm rối lịch di chuyển.',
      'Trang này gom các quán đáng thử, hợp để chốt bữa chính hoặc bữa phụ trong ngày.',
      'Một cụm địa chỉ ăn ngon, gọn mắt, dành cho lúc cần quyết nhanh trong chuyến đi.',
    ],
    cafe: [
      'Các quán cafe nên lưu riêng để chọn điểm ngồi chill, nghỉ chân hoặc chụp ảnh.',
      'Trang cafe này ưu tiên chỗ có không khí dễ chịu, hợp để dừng lại giữa lịch đi.',
      'Ghim trước vài quán cafe để có điểm nghỉ, lên ảnh đẹp và không phải tìm phút cuối.',
      'Một cụm cafe để đổi nhịp chuyến đi: ngồi lâu được, chụp ổn, di chuyển vừa phải.',
      'Các điểm cafe được gom riêng cho lúc muốn chậm lại mà vẫn có ảnh đẹp mang về.',
      'Trang này dành cho mood cafe: chọn nhanh một chỗ ngồi, rồi để Đà Lạt tự dịu lại.',
    ],
    checkin: [
      'Một trang scan nhanh các điểm check-in, ưu tiên tên ngắn và hình ảnh rõ.',
      'Các góc lên hình được tách riêng để dễ chọn điểm chụp theo cung đường trong ngày.',
      'Ghim sẵn các điểm check-in để lúc trời đẹp chỉ cần mở list và đi thẳng.',
      'Trang này gom các điểm nhìn phát hiểu ngay, hợp cho lịch cần ảnh đẹp mà không vòng vèo.',
      'Một cụm điểm chụp dễ scan, giúp bạn chọn nhanh nơi đáng ghé nhất trong buổi đó.',
      'Các địa điểm lên ảnh ổn được xếp riêng để chuyến đi có vài khung hình chắc tay.',
    ],
    nightlife: [
      'Các điểm đi buổi tối, ăn đêm và nghe nhạc được tách riêng để dễ lưu sau 20h.',
      'Trang này dành cho buổi tối: chọn chỗ ăn, nghe nhạc hoặc đổi không khí sau lịch ngày.',
      'Ghim riêng các điểm chơi đêm để tối đến không phải lục lại cả list dài.',
      'Một cụm lựa chọn sau hoàng hôn, hợp để kéo dài lịch mà vẫn dễ quyết.',
      'Các điểm buổi tối được gom riêng để lịch đêm có nhịp, có món, có chỗ ngồi.',
      'Trang này giúp chốt nhanh phần sau 20h: ăn nhẹ, đi nghe nhạc hoặc ghé một nơi có vibe.',
    ],
    service: [
      'Các dịch vụ hỗ trợ chuyến đi được gom riêng để người xem dễ liên hệ nhanh.',
      'Trang dịch vụ này để lưu những thứ cần chốt trước: xe, đồ, quà hoặc hỗ trợ tại chỗ.',
      'Ghim riêng nhóm dịch vụ để lúc cần liên hệ không phải trộn với quán ăn và điểm chơi.',
      'Một trang thực dụng cho chuyến đi: các mục cần chuẩn bị, đặt trước hoặc lưu số.',
      'Các dịch vụ quan trọng được tách riêng để lịch đi trơn hơn và ít phải xử lý gấp.',
      'Trang này gom những thứ hậu cần nên có sẵn trước khi bắt đầu chạy lịch.',
    ],
    stay: [
      'Các chỗ nghỉ nên xem riêng để dễ chốt phòng, không trộn với dịch vụ khác.',
      'Trang lưu trú này giúp so nhanh vài lựa chọn trước khi quyết chỗ ở cho chuyến đi.',
      'Ghim riêng homestay để lúc chốt phòng có ngay nhóm lựa chọn sạch và dễ xem.',
      'Một cụm chỗ nghỉ để cân vị trí, vibe và lịch di chuyển trước khi đặt.',
      'Các lựa chọn lưu trú được tách riêng để không lẫn với điểm chơi trong ngày.',
      'Trang này dành cho bước chốt nơi ở: xem nhanh, so nhanh, rồi quay lại lịch đi.',
    ],
    activity: [
      'Các hoạt động và điểm ghé được gom riêng để đổi nhịp cho lịch đi.',
      'Trang hoạt động này thêm lựa chọn trải nghiệm, hợp khi muốn chuyến đi bớt chỉ check-in.',
      'Ghim các hoạt động riêng để dễ chen vào lịch khi còn dư thời gian hoặc muốn đổi mood.',
      'Một cụm trải nghiệm để ngày đi có thêm việc đáng làm, không chỉ chụp ảnh rồi đi tiếp.',
      'Các hoạt động được tách riêng để bạn chọn nhịp vui hơn cho từng buổi.',
      'Trang này dành cho những lúc muốn làm gì đó khác hơn: ghé, thử, chơi, rồi đi tiếp.',
    ],
    tourism: [
      'Các khu du lịch được tách riêng khỏi trang check-in để người xem cân lịch dễ hơn.',
      'Trang khu du lịch này hợp để chọn điểm đi dài hơi, cần cân thời gian hơn điểm ghé nhanh.',
      'Ghim riêng các khu du lịch để dễ quyết nơi nào đáng dành hẳn một buổi.',
      'Một cụm điểm lớn hơn, phù hợp khi muốn có lịch rõ thay vì chỉ ghé chụp nhanh.',
      'Các khu du lịch được gom riêng để bạn xem trước độ xa, độ rộng và thời gian cần dành.',
      'Trang này giúp chọn các điểm đi chính trong ngày, trước khi thêm cafe hay điểm ăn.',
    ],
    generic: [
      'Trang này gom riêng các mục cùng nhóm để scan nhanh và lưu trước khi đi.',
      'Một trang phụ được tách riêng để list dễ đọc hơn và không phải quyết từ một đống hỗn hợp.',
      'Các mục cùng nhóm được đặt chung để người xem chọn nhanh theo đúng nhu cầu lúc đó.',
      'Trang này giúp list gọn hơn: mở ra là hiểu nhóm nào, dùng lúc nào, lưu vì sao.',
      'Một cụm lựa chọn riêng để chuyến đi dễ xoay nhịp mà không bị loãng thông tin.',
      'Các gợi ý được gom thành một trang rõ ý, hợp để scan nhanh trước khi chốt lịch.',
    ],
  };
  return variants[kind] || variants.generic;
}

export function findPartnerItemForGeneratedList(list: GuideDeckList, itemsBySection: WorkbookItemsBySection): GuideItem | undefined {
  const allItems = Object.values(itemsBySection).flat().filter((item) => item.isPartner);
  const sourceKeys = new Set<string>();
  const names = new Set<string>();
  for (const page of list.pages) {
    if (page.type !== 'list') continue;
    for (const item of page.items) {
      if (item.sourceKey) sourceKeys.add(item.sourceKey);
      if (item.rawName) names.add(normalizeText(item.rawName));
      if (item.metaPrimary) names.add(normalizeText(item.metaPrimary));
    }
  }
  const listName = normalizeText(list.navTitle || list.title || list.coverTitle || '');
  return allItems.find((item) =>
    sourceKeys.has(itemUsageKey(item)) ||
    names.has(normalizeText(item.name)) ||
    normalizeText(item.name) === listName,
  );
}

export function normalizeDisplayName(value: string): string {
  const clean = String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (normalizeText(clean).startsWith('quoa_dac_san')) {
    return clean.replace(/^[^-]+/, 'Quà');
  }
  return clean;
}

export function pageItemSectionKey(pageItem: PageItem): SectionKey | '' {
  if (pageItem.sourceSectionKey && SECTION_CONFIG[pageItem.sourceSectionKey]) {
    return pageItem.sourceSectionKey;
  }
  const id = String(pageItem.id ?? '');
  const matchedKey = Object.keys(SECTION_CONFIG).find((key) => id.startsWith(`${key}-`));
  return (matchedKey as SectionKey | undefined) ?? '';
}

export function pageItemSourceName(pageItem: PageItem): string {
  const rawName = String(pageItem.rawName ?? '').trim();
  if (rawName) return rawName;
  const name = String(pageItem.name ?? '').replace(/^[^:]{1,30}:\s*/, '').trim();
  return name || String(pageItem.name ?? '').trim();
}

export function refreshedPageItemName(pageItem: PageItem, sourceName: string): string {
  const normalizedSourceName = normalizeDisplayName(sourceName);
  const currentName = String(pageItem.name ?? '').trim();
  const rawName = String(pageItem.rawName ?? '').trim();
  if (rawName && currentName.includes(rawName)) {
    return currentName.replace(rawName, normalizedSourceName);
  }
  const prefixMatch = currentName.match(/^([^:]{1,30}:\s*)/);
  return prefixMatch ? `${prefixMatch[1]}${normalizedSourceName}` : normalizedSourceName;
}

export function mergeTimelineDayMetaSecondary(existing: string, freshMeta: string): string {
  const activity = String(existing || '').trim();
  const detail = String(freshMeta || '').trim();
  if (!detail) return activity;
  if (!activity || /Khung giờ:|Giá:/i.test(activity)) return detail;
  return `${activity}${activity.endsWith(' ') ? '' : ' '}${detail}`;
}

export function pageItemMetaFromSource(item: GuideItem): [string, string] {
  if (item.sectionKey === 'homestay') {
    const primary = item.address || 'Đang cập nhật địa chỉ';
    const secondaryParts: string[] = [];
    const price = displayPrice(item);
    if (price) secondaryParts.push(`Giá: ${price}`);
    if (item.phone) secondaryParts.push(`SĐT: ${item.phone}`);
    return [primary, secondaryParts.join(' · ')];
  }
  if (item.sectionKey === 'dich_vu') {
    const primary = item.address || 'Đang cập nhật địa chỉ';
    return [primary, item.phone ? `SĐT: ${item.phone}` : ''];
  }
  return metaText(item);
}

/** Spotlight V3: Homestay/Dịch vụ chỉ hiện giá đầu người (không SĐT). */
export function spotlightV3ItemMetaFromSource(item: GuideItem, chipText = ''): [string, string] {
  const primary = item.address || 'Đang cập nhật địa chỉ';
  const chip = String(chipText || '').trim();
  const withPrice = chip === 'Homestay' || chip === 'Dịch vụ'
    || item.sectionKey === 'homestay'
    || item.sectionKey === 'dich_vu';
  if (!withPrice) return [primary, ''];
  const price = displayPrice(item);
  const cleaned = String(price || '').trim();
  const displayable = cleaned
    && !/mien\s*phi|free/i.test(cleaned)
    && !/^0+\s*(đ|d|vnd|vnđ)?$/i.test(cleaned);
  return [primary, displayable ? `Giá: ${cleaned}` : ''];
}

export function budgetGalleryItemMetaFromSource(item: GuideItem): [string, string] {
  const openHours = String(item.openHours || '').replace(/\s+/g, ' ').trim();
  return ['', openHours ? `Khung giờ: ${openHours}` : ''];
}

export function captionBodyFallback(destinationId: DestinationId): string {
  return getMarketingCopy(destinationId).captionBodyFallback;
}
