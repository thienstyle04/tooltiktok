export const SELECTION_STORAGE_KEY = 'dalat-carousel-active-selection-v1';
export const DATASET_CACHE_KEY = 'dalat-carousel-dataset-cache-v41';

/** Deck đã gỡ khỏi app — lọc khỏi cache/dataset cũ. */
export const RETIRED_DECK_IDS = new Set([
  'grid-cafe-light',
  'budget-4n3d-wallet',
  'must-go',
  'first-time',
  'spotlight-partner-v2',
  'pov-maikem',
]);

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
