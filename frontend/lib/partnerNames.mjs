// Pure shared contract: backend pre-save checks and XLSX export see the same
// rendered photographs and the same actual partner names. No DOM/network use.
import { renderListPage } from './pageMarkup.js';
import { escapeHtml } from './utils.js';
import { isThreadsLocalDeck } from './threadsFoodExport.mjs';
import { cherryBlossomCopy } from './cherryBlossom.js';

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
    // Tổng kết chuyến đi: ảnh của dòng nằm ở trang ảnh phía sau; tên đối tác phải hiện trên dòng note.
    const recap = page.layoutVariant === 'threads-recap-note';
    const hasImages = !threads && !recap && page.items?.some(item => String(item?.imageUrl || '').trim());
    const markup = hasImages ? renderListPage(page, index, list.pages.length, list.id, list.captionHashtags || [], list) : '';
    page.items?.forEach(item => {
      if (!item?.isPartner) return;
      if (recap) {
        const source = String(item.rawName || item.name || '').trim();
        if (source && String(item.name || '').toLocaleLowerCase('vi').includes(source.toLocaleLowerCase('vi'))) names.add(source);
        return;
      }
      const raw = String(threads || (page.layoutVariant === 'threads-note-dark-list' || page.layoutVariant === 'threads-grid6-page') ? item.name || '' : item.rawName || item.name || '');
      const name = (threads || (page.layoutVariant === 'threads-note-dark-list' || page.layoutVariant === 'threads-grid6-page') ? raw : raw.replace(/^[^:]{1,30}:\s*/, '')).trim();
      if (!name) return;
      const image = page.layoutVariant === 'spotlight-v5-place' ? String(page.backgroundImage || item.imageUrl || '').trim() : String(item.imageUrl || '').trim();
      if (!threads && image && !includesImage(markup, image)) return;
      // An img alt/title is not visible copy. Count only the actual text used
      // by this renderer, not a venue name merely present in metadata/alt.
      if (page.imageRole && !cherryBlossomCopy(page).includes(name)) return;
      names.add(name);
    });
  });
  return [...names].sort((a, b) => a.localeCompare(b, 'vi'));
}
