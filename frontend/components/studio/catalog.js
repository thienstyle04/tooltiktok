'use client';
// DeckStudio: phát hiện danh mục mẫu đã cũ/thiếu để tải lại catalog từ backend.
import { templateAllowed } from '../../lib/sourceTemplatePolicy.mjs';
import { RETIRED_DECK_IDS, STUDIO_CATALOG_REVISION, STUDIO_CATALOG_REVISION_KEY, budget72HListHasLegacyScheduleCosts, budget72HTableMatchesMain, listIsMain } from '../../lib/utils';
import { SPOTLIGHT_PARTNER_DECK_ID } from './shared';

const V2_TEMPLATE_DECK_IDS = [
  'threads-note-dark-list',
  'threads-grid6-collage',
  'threads-trip-recap-3n2d',
  'spotlight-v6-cherry-blossom',
  'grid-6-quaytung',
  'grid-8-feed',
  'grid-8-quaytung',
  'spotlight-v2',
  'spotlight-v3',
  'spotlight-v4',
  'spotlight-v5',
  'spotlight-v6',
  'spotlight-v6-green',
  'spotlight-v6-dark',
  'spotlight-v6-persimmon',
  'spotlight-v6-maps',
  'spotlight-v6-diary',
  'summary-note',
  'itinerary-note-threads-3n2d', 'itinerary-note-threads-2n1d', 'itinerary-note-threads-budget-3n2d', 'itinerary-note-threads-expense-2n1d', 'itinerary-note-threads-expense-3n2d', 'itinerary-note-threads-expense-2n1d', 'itinerary-note-threads-expense-3n2d', 'threads-toplist-dalat', 'threads-food-local', 'threads-cafe-local', 'threads-mix-local', 'threads-mix-text', 'itinerary-note-2days', 'itinerary-note-dark',
  'itinerary-note-timed',
  'one-way-story',
  'itinerary-4n3d-stack',
  'itinerary-timeline',
];

const DALAT_ONLY_CATALOG_DECK_IDS = new Set([
  'threads-note-dark-list',
  'threads-grid6-collage',
  'threads-trip-recap-3n2d',
  'spotlight-v5',
  'spotlight-v6-green',
  'spotlight-v6-dark',
  'spotlight-v6-persimmon',
  'spotlight-v6-maps',
  'spotlight-v6-diary',
  'itinerary-note-threads-3n2d', 'itinerary-note-threads-2n1d', 'itinerary-note-threads-budget-3n2d', 'itinerary-note-threads-expense-2n1d', 'itinerary-note-threads-expense-3n2d', 'itinerary-note-threads-expense-2n1d', 'itinerary-note-threads-expense-3n2d', 'threads-toplist-dalat', 'threads-food-local', 'threads-cafe-local', 'threads-mix-local', 'threads-mix-text', 'itinerary-note-2days', 'itinerary-note-dark',
  'itinerary-note-timed',
  'one-way-story',
]);

const REQUIRED_CATALOG_DECK_IDS = [
  'grid-5',
  ...V2_TEMPLATE_DECK_IDS,
];

function hasEmptySpotlightPartnerDeck(dataset) {
  const deck = (dataset?.decks || []).find((item) => item.id === SPOTLIGHT_PARTNER_DECK_ID);
  return Boolean(deck && (deck.lists || []).length === 0);
}

function missingCatalogDecks(dataset) {
  const deckIds = new Set((dataset?.decks || []).map((deck) => deck.id));
  const destinationId = String(dataset?.source?.contentDestinationId || dataset?.source?.destinationId || 'dalat');
  return REQUIRED_CATALOG_DECK_IDS.filter((deckId) => (
    templateAllowed(dataset?.source, deckId)
    &&
    !deckIds.has(deckId)
    && !(destinationId !== 'dalat' && DALAT_ONLY_CATALOG_DECK_IDS.has(deckId))
  ));
}

function hasRetiredCatalogDecks(dataset) {
  return (dataset?.decks || []).some((deck) => RETIRED_DECK_IDS.has(deck.id));
}

function needsSpotlightCoverRefresh(dataset) {
  if (!templateAllowed(dataset?.source, 'spotlight-v2')) return false;
  const coverCount = dataset?.source?.coverImageCount;
  if (typeof coverCount !== 'number' || coverCount < 4) return true;
  const deck = (dataset?.decks || []).find((item) => item.id === 'spotlight-v2');
  const cover = deck?.lists?.[0]?.pages?.find((page) => page.type === 'cover');
  const images = Array.isArray(cover?.coverImages) ? cover.coverImages.filter(Boolean) : [];
  return new Set(images).size < 4;
}

function needsGrid6QuaytungCatalogRefresh(dataset) {
  if (!templateAllowed(dataset?.source, 'grid-6-quaytung')) return false;
  const deck = (dataset?.decks || []).find((item) => item.id === 'grid-6-quaytung');
  if (!deck) return true;
  const main = (deck.lists || []).find((list) => listIsMain(list));
  if (!main) return true;
  if (Number(main.templateVersion || 0) < 6) return true;
  if ((main.pages || []).length < 8) return true;
  const cover = main.pages.find((page) => page.type === 'cover');
  return cover?.layoutVariant !== 'grid-6-quaytung-cover';
}

function needsGrid8QuaytungCatalogRefresh(dataset) {
  if (!templateAllowed(dataset?.source, 'grid-8-quaytung')) return false;
  const deck = (dataset?.decks || []).find((item) => item.id === 'grid-8-quaytung');
  if (!deck) return true;
  const main = (deck.lists || []).find((list) => listIsMain(list));
  if (!main) return true;
  if (Number(main.templateVersion || 0) < 9) return true;
  if ((main.pages || []).length < 6) return true;
  const cover = main.pages.find((page) => page.type === 'cover');
  return cover?.layoutVariant !== 'grid-8-quaytung-cover';
}

const GRID_5_MIN_TEMPLATE_VERSION = 4;

function needsGrid5CatalogRefresh(dataset) {
  if (!templateAllowed(dataset?.source, 'grid-5')) return false;
  const deck = (dataset?.decks || []).find((item) => item.id === 'grid-5');
  if (!deck) return true;
  const main = (deck.lists || []).find((list) => listIsMain(list));
  if (!main) return true;
  if (Number(main.templateVersion || 0) < GRID_5_MIN_TEMPLATE_VERSION) return true;
  if ((main.pages || []).length < 8) return true;
  const cover = main.pages.find((page) => page.type === 'cover');
  return cover?.layoutVariant !== 'grid-5';
}

const BUDGET_72H_SUMMARY_MIN_TEMPLATE_VERSION = 7;

function isStaleBudget72HSummaryList(list, deck = null) {
  if (!list) return true;
  if (Number(list.templateVersion || 0) < BUDGET_72H_SUMMARY_MIN_TEMPLATE_VERSION) return true;
  if (budget72HListHasLegacyScheduleCosts(list)) return true;
  if (!listIsMain(list) && deck) {
    const mainList = (deck.lists || []).find((entry) => listIsMain(entry));
    if (mainList && budget72HTableMatchesMain(list, mainList)) return true;
  }
  return false;
}

function needsBudget72HSummaryCatalogRefresh(dataset) {
  if (!templateAllowed(dataset?.source, 'budget-72h-summary')) return false;
  const deck = (dataset?.decks || []).find((item) => item.id === 'budget-72h-summary');
  if (!deck) return true;
  return (deck.lists || []).some((list) => isStaleBudget72HSummaryList(list, deck));
}

function storedCatalogRevision() {
  if (typeof window === 'undefined') return '';
  try {
    return String(window.localStorage.getItem(STUDIO_CATALOG_REVISION_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function markCatalogRevisionStored() {
  if (typeof window === 'undefined') return;
  const value = STUDIO_CATALOG_REVISION;
  for (const storage of [window.localStorage, window.sessionStorage].filter(Boolean)) {
    try {
      storage.setItem(STUDIO_CATALOG_REVISION_KEY, value);
    } catch {
      // Ignore quota errors.
    }
  }
}

export function needsTemplateCatalogRefresh(dataset, activeSource = null) {
  if (!Array.isArray(dataset?.source?.allowedDeckIds)) return true;
  // A cache can have the current frontend revision but an older backend's
  // permissions. Compare with the freshly loaded source, not its cached copy.
  if (activeSource) {
    if (activeSource.id && dataset.source.destinationId !== activeSource.id) return true;
    // Export reads this flag to accept zero-partner lists; a stale cache would block them.
    if (Boolean(dataset.source.partnerLogicOff) !== Boolean(activeSource.partnerLogicOff)) return true;
    if (Array.isArray(activeSource.allowedDeckIds)) {
      const cachedIds = new Set(dataset.source.allowedDeckIds);
      const currentIds = new Set(activeSource.allowedDeckIds);
      if (cachedIds.size !== currentIds.size || [...currentIds].some((id) => !cachedIds.has(id))) return true;
    }
  }
  if (storedCatalogRevision() !== STUDIO_CATALOG_REVISION) return true;
  return hasEmptySpotlightPartnerDeck(dataset)
    || hasRetiredCatalogDecks(dataset)
    || missingCatalogDecks(dataset).length > 0
    || needsSpotlightCoverRefresh(dataset)
    || needsGrid6QuaytungCatalogRefresh(dataset)
    || needsGrid8QuaytungCatalogRefresh(dataset)
    || needsGrid5CatalogRefresh(dataset)
    || needsBudget72HSummaryCatalogRefresh(dataset);
}
