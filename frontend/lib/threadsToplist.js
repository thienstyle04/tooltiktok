import { escapeHtml, sanitizeFilePart } from './utils.js';

export function renderThreadsToplistCover(page, index, listId) {
  return `<article class="story-page threads-toplist-cover" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="01-top-list-da-lat.png">
    <img class="threads-toplist-door" src="${escapeHtml(page.backgroundImage || '/templates/threads-toplist-door.png')}" alt="Cửa đỏ Đà Lạt" loading="eager" decoding="sync" draggable="false">
    <div class="threads-toplist-cover-shade" aria-hidden="true"></div>
    <h1>${escapeHtml(page.title || 'Top list các địa điểm Đà Lạt')}</h1>
  </article>`;
}

export function renderThreadsToplistPage(page, index, listId) {
  const items = Array.isArray(page.items) ? page.items : [];
  const rows = items.map(item => `<li class="threads-toplist-place"><strong>${escapeHtml(item.name || '')}</strong><span>${escapeHtml(item.metaPrimary || '')}</span></li>`).join('');
  return `<article class="story-page threads-toplist-page" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText || 'dia-diem')}.png">
    <div class="threads-toplist-paper">
      <h2>${escapeHtml(page.title || page.chipText || '')}</h2>
      <ul>${rows}</ul>
      ${page.subtitle ? `<p class="threads-toplist-example">${escapeHtml(page.subtitle)}</p>` : ''}
    </div>
  </article>`;
}

// Keep the notebook readable in both the editor and exported PNG. A long
// address may wrap onto several ruled lines; never silently clip the last row.
export function fitThreadsToplist(root, strict = false) {
  const pages = root?.matches?.('.threads-toplist-page') ? [root] : [...(root?.querySelectorAll?.('.threads-toplist-page') || [])];
  for (const page of pages) {
    const paper = page.querySelector('.threads-toplist-paper');
    const rows = [...page.querySelectorAll('.threads-toplist-paper li')];
    if (!paper || !rows.length || !page.clientHeight) continue;
    const hasExplicitSize = Number(page.dataset.textFontSize) >= 8 && Number(page.dataset.textFontSize) <= 72;
    const overflows = () => {
      const bounds = paper.getBoundingClientRect();
      const last = rows.at(-1).getBoundingClientRect();
      const title = paper.querySelector('h2');
      return last.bottom > bounds.bottom - 25 || (title && title.scrollHeight > title.clientHeight + 1) || paper.scrollWidth > paper.clientWidth + 1;
    };
    page.style.removeProperty('--toplist-fit');
    page.style.removeProperty('--toplist-row-min-height');
    // A wrapped name/address needs an extra ruled line. Reclaim only the
    // otherwise empty line between entries before shrinking the text.
    if (overflows()) page.style.setProperty('--toplist-row-min-height', '52px');
    if (!hasExplicitSize) {
      for (let percent = 95; percent >= 75 && overflows(); percent -= 5) {
        page.style.setProperty('--toplist-fit', (percent / 100).toFixed(2));
      }
    }
    const overflow = overflows();
    page.dataset.toplistOverflow = String(overflow);
    page.title = overflow ? 'Nội dung quá dài. Hãy rút gọn tên hoặc địa chỉ trước khi xuất.' : '';
    if (overflow && strict) throw new Error('Top list Đà Lạt: nội dung quá dài ở trang ' + (page.querySelector('h2')?.textContent || 'đang chọn') + '. Vui lòng rút gọn tên hoặc địa chỉ trước khi xuất.');
  }
}
