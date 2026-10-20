// Trạng thái list cho màn Duyệt & Xuất (giao diện V2).
// main: list chính của mẫu · new: vừa tạo · edited: đã sửa và chưa xuất lại · exported: đã xuất, không sửa sau đó.
export const LIST_STATUS_LABEL = { main: 'Mẫu mẹ', new: 'Mới', edited: 'Đã sửa', exported: 'Đã xuất' };

const MAIN_LIST_RE = /-main$/i;

export function isMainList(list) {
  const id = String(list?.id || '');
  return MAIN_LIST_RE.test(id) || id.toLowerCase() === 'main' || String(list?.navTitle || '').trim().toLowerCase() === 'list chính';
}

export function listStatus(list) {
  if (!list || isMainList(list)) return 'main';
  const exportedAt = Date.parse(list.exportedAt || '') || 0;
  const editedAt = Date.parse(list.editedAt || '') || 0;
  if (exportedAt && editedAt <= exportedAt) return 'exported';
  if (editedAt) return 'edited';
  return 'new';
}

/** Mọi list trong dataset kèm mẫu và trạng thái; list mới tạo (cuối mảng của mẫu) đứng trước. */
export function collectLists(dataset, { includeMain = false } = {}) {
  const entries = [];
  for (const deck of dataset?.decks || []) {
    (deck.lists || []).forEach((list, index) => {
      const status = listStatus(list);
      if (status === 'main' && !includeMain) return;
      entries.push({ deck, list, status, order: index });
    });
  }
  return entries.sort((a, b) => Number(a.status === 'main') - Number(b.status === 'main') || b.order - a.order);
}

/** Gom list đã xuất theo mẫu để gửi /api/decks/mark-exported và cập nhật dataset tại chỗ. */
export function groupListIds(items) {
  const groups = new Map();
  for (const item of items || []) {
    if (!item?.deckId || !item?.listId) continue;
    const ids = groups.get(item.deckId) || new Set();
    ids.add(item.listId);
    groups.set(item.deckId, ids);
  }
  return Array.from(groups, ([deckId, ids]) => ({ deckId, listIds: [...ids] }));
}

export function applyExportedAt(dataset, groups, exportedAt) {
  if (!dataset?.decks || !groups?.length) return dataset;
  const byDeck = new Map(groups.map(group => [group.deckId, new Set(group.listIds)]));
  return {
    ...dataset,
    decks: dataset.decks.map(deck => {
      const ids = byDeck.get(deck.id);
      return ids ? { ...deck, lists: deck.lists.map(list => (ids.has(list.id) && !isMainList(list) ? { ...list, exportedAt } : list)) } : deck;
    }),
  };
}
