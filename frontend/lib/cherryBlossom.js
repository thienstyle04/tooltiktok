import { escapeHtml } from './utils.js';
import { renderPreviewImage } from './markup/shared.js';

// Preview is the established 397px design frame; export scales it to 1080px.
// Sizes in the inspector remain output-pixel sizes (44/34), never auto-shrunk.
export function cherryBlossomCopy(page) {
  const item = page.items?.[0];
  // Restaurant pages are names/address only, including older saved snapshots
  // whose title still contains the original long Sheet description.
  if (item?.sourceSectionKey === 'quan_an') {
    return [item.name, item.metaPrimary].filter(Boolean).join(' — ');
  }
  const address = item && !(item.sourceSectionKey === 'cafe' && page.title) ? `${item.name}${item.metaPrimary ? ' — ' + item.metaPrimary : ''}` : '';
  return [page.title, address].filter(Boolean).join('\n');
}

export function renderCherryBlossom(page, index, listId) {
  const item = page.items?.[0];
  const copy = cherryBlossomCopy(page);
  const placement = page.titlePlacement || (page.type === 'cover' ? 'center' : 'top-center');
  const top = placement === 'bottom-center' ? 76 : placement === 'center' ? 50 : 32;
  return `<article class="story-page cherry-blossom-page" data-text-unit-scale="${397 / 1080}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-hoa-dao.png" data-export-strict="true">
    <style>
    .story-page.cherry-blossom-page{position:relative;display:block;width:397px!important;height:${397 * 16 / 9}px!important;min-height:0!important;max-width:none!important;flex:0 0 397px!important;aspect-ratio:9/16;border-radius:0!important;box-shadow:none;padding:0;overflow:hidden;background:#111;isolation:isolate;box-sizing:border-box}
    .cherry-blossom-bg{position:absolute;inset:0;z-index:0}.cherry-blossom-bg img{display:block;width:100%;height:100%;object-fit:cover;object-position:center;border-radius:0}
    .cherry-blossom-copy{position:absolute;z-index:1;left:8%;width:84%;margin:0;transform:translateY(-50%);color:#fff;text-align:center;font-family:'Be Vietnam Pro',sans-serif;font-weight:600;line-height:1.25;white-space:pre-wrap;overflow-wrap:normal;word-break:normal;-webkit-text-stroke:${2 * 397 / 1080}px #000;paint-order:stroke fill;text-shadow:none}
    </style>
    <div class="cherry-blossom-bg">${renderPreviewImage(page.backgroundImage, item?.name || 'Hoa đào Đà Lạt')}</div>
    ${copy ? `<div class="cherry-blossom-copy" style="top:${top}%;font-size:${(page.type === 'cover' ? 44 : 34) * 397 / 1080}px">${escapeHtml(copy)}</div>` : ''}
    </article>`;
}

export function checkCherryBlossomLayout(root, strict = false) {
  const pages = root?.matches?.('.cherry-blossom-page') ? [root] : [...(root?.querySelectorAll?.('.cherry-blossom-page') || [])];
  for (const page of pages) {
    const copy = page.querySelector('.cherry-blossom-copy');
    if (!copy) continue;
    const box = copy.getBoundingClientRect(), frame = page.getBoundingClientRect();
    const invalid = copy.scrollWidth > copy.clientWidth + 1 || box.top < frame.top + 1 || box.bottom > frame.bottom - 1;
    page.dataset.cherryOverflow = String(invalid);
    page.title = invalid ? 'Chữ vượt khung; hãy rút gọn nội dung hoặc chỉnh vị trí/cỡ chữ trước khi xuất.' : '';
    if (invalid && strict) throw new Error(`Spotlight Mùa hoa đào: tràn chữ trang ${Number(page.dataset.pageIndex) + 1}; hãy rút gọn nội dung hoặc chỉnh vị trí/cỡ chữ trước khi xuất.`);
  }
}
