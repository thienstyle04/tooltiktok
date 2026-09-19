export class ExportImageError extends Error {
  constructor(message, details = {}) { super(message); this.name = 'ExportImageError'; this.code = 'EXPORT_IMAGE_UNAVAILABLE'; this.details = details; }
}

export function lateImageListFailure(entry, task, error) {
  const id = error.details?.id || error.message.match(/[?&]id=([\w-]+)/)?.[1] || '';
  const owner = task.page.items?.find(item => id && JSON.stringify(item).includes(id));
  return { deckId: entry.deck.id, listId: task.list.id, label: `${entry.deck.navTitle || entry.deck.id} / ${task.list.navTitle || task.list.id}`, late: true,
    errors: [{ page: task.pageIndex + 1, id, place: owner?.name || task.page.title || 'Ảnh nền', reason: error.message }] };
}

// Only the selected source in final export markup matters, not unused candidates.
export async function inspectExportImages(entries, renderPage) {
  const refs = [];
  for (const { deck, list, onlyPageIndex } of entries) for (const [index, page] of (list.pages || []).entries()) {
    if (onlyPageIndex !== undefined && index !== onlyPageIndex) continue;
    const markup = renderPage(list, page, index).replace(/\sdata-candidate-srcs="[^"]*"/g, '');
    for (const match of markup.matchAll(/\/assets\/drive-file\?(?:[^"'<>\s]*?&(?:amp;)?)?id=([a-zA-Z0-9_-]{10,})/g)) {
      const owner = page.items?.find(item => JSON.stringify(item).includes(match[1]));
      refs.push({ id: match[1], deckId: deck.id, listId: list.id, page: index + 1, place: owner?.name || page.title || 'Ảnh nền', label: `${deck.navTitle || deck.id} / ${list.navTitle || list.id} / trang ${index + 1}` });
    }
  }
  const ids = [...new Set(refs.map(ref => ref.id))];
  const missing = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const response = await fetch('/api/drive-files/cache-status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileIds: ids.slice(i, i + 50) }), signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`Không xác minh được cache (HTTP ${response.status}); chưa render.`);
    const status = await response.json();
    if (!Array.isArray(status.missing)) throw new Error('Phản hồi kiểm tra ảnh không hợp lệ; chưa render.');
    for (const id of status.missing) {
      const detail = status.images?.find(image => image.id === id);
      missing.set(id, detail || { status: 'missing', reason: 'Chưa có cache hợp lệ trên máy' });
    }
  }
  const failures = refs.filter(ref => missing.has(ref.id)).map(ref => ({ ...ref, ...missing.get(ref.id) }));
  const skippedLists = entries.flatMap(({ deck, list }) => {
    const errors = failures.filter(ref => ref.deckId === deck.id && ref.listId === list.id);
    return errors.length ? [{ deckId: deck.id, listId: list.id, label: `${deck.navTitle || deck.id} / ${list.navTitle || list.id}`, errors }] : [];
  });
  const validEntries = entries.filter(({ deck, list }) => !skippedLists.some(skip => skip.deckId === deck.id && skip.listId === list.id));
  return { validEntries, skippedLists, validPages: validEntries.reduce((n, entry) => n + entry.list.pages.length, 0) };
}
