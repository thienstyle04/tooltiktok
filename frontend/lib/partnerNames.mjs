// Pure shared contract: backend pre-save checks and XLSX export see the same
// rendered photographs and the same actual partner names. No DOM/network use.
import { renderListPage } from './pageMarkup.js';
import { escapeHtml } from './utils.js';
import { isThreadsLocalDeck } from './threadsFoodExport.mjs';

function includesImage(markup, imageUrl) {
  const source = String(imageUrl || '').trim();
  if (!source) return false;
  if (markup.includes(encodeURIComponent(source))) return true;
  const driveId = source.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] || '';
  return driveId ? markup.includes(driveId) : markup.includes(source) || markup.includes(escapeHtml(source));
}

export function collectPartnerNames(list) {
  const names = new Set();
  const id = String(list?.id || '');
  const threads = ['threads-food-local', 'threads-cafe-local', 'threads-mix-local', 'threads-mix-text'].some(deck => isThreadsLocalDeck(deck) && (id === deck || id.startsWith(deck + '-')));
  list.pages?.forEach((page, index) => {
    if (page?.type !== 'list') return;
    const hasImages = !threads && page.items?.some(item => String(item?.imageUrl || '').trim());
    const markup = hasImages ? renderListPage(page, index, list.pages.length, list.id, list.captionHashtags || [], list) : '';
    page.items?.forEach(item => {
      if (!item?.isPartner) return;
      const raw = String(threads ? item.name || '' : item.rawName || item.name || '');
      const name = (threads ? raw : raw.replace(/^[^:]{1,30}:\s*/, '')).trim();
      if (!name) return;
      const image = page.layoutVariant === 'spotlight-v5-place' ? String(page.backgroundImage || item.imageUrl || '').trim() : String(item.imageUrl || '').trim();
      if (!threads && image && !includesImage(markup, image)) return;
      names.add(name);
    });
  });
  return [...names].sort((a, b) => a.localeCompare(b, 'vi'));
}
