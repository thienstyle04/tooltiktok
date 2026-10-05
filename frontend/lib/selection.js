import { SELECTION_STORAGE_KEY } from './utils';

export const emptyCaption = { coverTitle: '', headline: '', body: '', hashtags: '' };
const legacyDeckId = id => ({'spotlight-v5-color-edit':'spotlight-v5','spotlight-v6-color-edit':'spotlight-v6'}[id] || id);

export function normalizeSelection(dataset, selection) {
  const decks = dataset?.decks || [];
  const deck = decks.find((item) => item.id === legacyDeckId(selection.activeDeckId)) || decks[0] || null;
  const list = deck?.lists?.find((item) => item.id === selection.activeListId) || deck?.lists?.[0] || null;
  const pageCount = list?.pages?.length || 0;
  const selectedPageIndex = pageCount > 0 && selection.selectedPageIndex < pageCount
    ? Math.max(0, selection.selectedPageIndex)
    : 0;
  return {
    activeDeckId: deck?.id || null,
    activeListId: list?.id || null,
    selectedPageIndex,
  };
}

export function readStoredSelection() {
  try {
    const raw = window.localStorage.getItem(SELECTION_STORAGE_KEY);
    if (!raw) return { activeDeckId: null, activeListId: null, selectedPageIndex: 0 };
    const parsed = JSON.parse(raw);
    return {
      activeDeckId: typeof parsed.activeDeckId === 'string' ? legacyDeckId(parsed.activeDeckId) : null,
      activeListId: typeof parsed.activeListId === 'string' ? parsed.activeListId : null,
      selectedPageIndex: Number.isInteger(parsed.selectedPageIndex) && parsed.selectedPageIndex >= 0 ? parsed.selectedPageIndex : 0,
    };
  } catch {
    return { activeDeckId: null, activeListId: null, selectedPageIndex: 0 };
  }
}

export function normalizeHashtagInput(value) {
  return String(value || '')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
