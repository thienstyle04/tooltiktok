export const SELECTION_STORAGE_KEY = 'dalat-carousel-active-selection-v1';
export const DATASET_CACHE_KEY = 'dalat-carousel-dataset-cache-v82';
export const DESTINATION_STORAGE_KEY = 'dalat-carousel-active-destination-v1';
export const STUDIO_CATALOG_REVISION = '2026-07-03-destination-titles';
export const STUDIO_CATALOG_REVISION_KEY = `${DATASET_CACHE_KEY}:catalog-revision`;

/** Deck đã gỡ khỏi app — lọc khỏi cache/dataset cũ. */
export const RETIRED_DECK_IDS = new Set([
  'grid-cafe-light',
  'budget-4n3d-wallet',
  'must-go',
  'first-time',
  'spotlight-partner-v2',
  'pov-maikem',
]);

export function isLegacyBudget72HScheduleCost(cost) {
  const value = String(cost || '').trim();
  if (/khứ hồi|đã tính/i.test(value)) return false;
  if (!value) return true;
  if (/^free$/i.test(value)) return false;
  if (/[\d.,]+\s*(?:đ|vnd|vnđ)\b/i.test(value)) return false;
  if (/~/.test(value) && /\bk\b/i.test(value)) return true;
  if (/giá:/i.test(value)) return true;
  if (/khung giờ:/i.test(value)) return true;
  return false;
}

export function budget72HListHasLegacyScheduleCosts(list) {
  const tablePage = (list?.pages || []).find((page) => page.layoutVariant === 'budget-3n2d-table');
  if (!tablePage) return true;
  const scheduleRows = (tablePage.items || []).filter((item) => !String(item.label || '').startsWith('Tổng|'));
  return scheduleRows.some((item) => isLegacyBudget72HScheduleCost(item.metaSecondary));
}

export function resolveBudget72HExportList(deck, list, dataset = null) {
  if (!deck || !list || deck.id !== 'budget-72h-summary') return list;
  if (listIsMain(list)) return list;
  const deckEntry = dataset?.decks?.find((entry) => entry.id === deck.id) || deck;
  const mainList = (deckEntry.lists || []).find((entry) => listIsMain(entry));
  if (!mainList) return list;
  return {
    ...list,
    templateVersion: mainList.templateVersion ?? list.templateVersion,
  };
}

function budget72HTablePage(list) {
  return (list?.pages || []).find((page) => page.layoutVariant === 'budget-3n2d-table') || null;
}

/** List AI bị ghi đè bảng từ main (bug cũ) — cần refresh để mỗi list có lịch trình riêng. */
export function budget72HTableMatchesMain(list, mainList) {
  if (!list || !mainList || listIsMain(list)) return false;
  const table = budget72HTablePage(list);
  const mainTable = budget72HTablePage(mainList);
  if (!table?.items?.length || !mainTable?.items?.length) return false;
  return JSON.stringify(table.items) === JSON.stringify(mainTable.items);
}

export function sanitizeDataset(dataset) {
  if (!dataset?.decks?.length) return dataset;
  const decks = dataset.decks.filter((deck) => !RETIRED_DECK_IDS.has(deck.id));
  if (decks.length === dataset.decks.length) return dataset;
  return { ...dataset, decks };
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function sanitizeFilePart(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function listIsMain(list) {
  return /-main$/i.test(String(list?.id || ''));
}

/** 1-based caption/set index from list id (caption-01-…) or navTitle (AI 01). */
export function parseListSetIndex(list) {
  const id = String(list?.id || '');
  const captionMatch = id.match(/caption-(\d+)/i);
  if (captionMatch) return Number(captionMatch[1]);
  const navMatch = String(list?.navTitle || '').match(/AI\s*0*(\d+)/i);
  if (navMatch) return Number(navMatch[1]);
  return 1;
}

export function formatListSetLabel(setIndex) {
  return `set${Number(setIndex) || 1}`;
}

export function countDeckPages(deck) {
  return (deck?.lists || []).reduce((total, list) => total + (list.pages?.length || 0), 0);
}

export function imageSourceClass(item) {
  return item?.imageSource || (item?.imageMapped ? 'manual' : 'fallback');
}

export function sourceLabel(item) {
  const source = imageSourceClass(item);
  if (source === 'manual') return 'Đúng ảnh';
  if (source === 'auto') return 'Tự map';
  return 'Minh họa';
}

export function currentPageLabel(selectedPageIndex, list) {
  if (!list) return '';
  return `${selectedPageIndex + 1}/${list.pages.length}`;
}
