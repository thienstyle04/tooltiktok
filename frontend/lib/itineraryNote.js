const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = body => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
const share = icon('<path d="M8 8H5v14h14V8h-3M12 15V1m-4 4 4-4 4 4"/>');
const more = icon('<circle cx="12" cy="12" r="10"/><circle cx="7" cy="12" r=".7" fill="currentColor"/><circle cx="12" cy="12" r=".7" fill="currentColor"/><circle cx="17" cy="12" r=".7" fill="currentColor"/>');
export function renderItineraryNotePage(page, index, listId) {
  const rows = (page.items || []).map(item => {
    const name = item.name ?? item.rawName ?? '';
    const address = item.metaPrimary ?? '';
    const text = [name ? [item.label, name].filter(Boolean).join(' ') : '', address].filter(Boolean).join(' - ');
    return '<li>' + escape(text) + '</li>';
  }).join('');
  return `<article class="story-page itinerary-note-day" data-list-id="${escape(listId)}" data-page-index="${index}" data-export-name="${String(index+1).padStart(2,'0')}-ngay-${index+1}.png">
    <div class="in-toolbar" aria-hidden="true"><span>${icon('<path d="m15 3-9 9 9 9"/>')}Ghi chú</span><span>${share}${more}</span></div>
    <div class="in-content"><h1>${escape(page.title)}</h1><p class="in-day">${escape(page.chipText ?? 'Ngày ' + (index+1))}</p><ul>${rows}</ul></div>
    <div class="in-home" aria-hidden="true"></div>
  </article>`;
}

// Same measured fitting in preview and every export path. Never clip overflowing copy.
export function fitItineraryNote(root, strict = false) {
  const nodes = root?.matches?.('.itinerary-note-day') ? [root] : [...(root?.querySelectorAll?.('.itinerary-note-day') || [])];
  for (const node of nodes) {
    const content = node.querySelector('.in-content');
    if (!content || !content.clientHeight) continue;
    let size = 18;
    node.style.setProperty('--in-font-size', size + 'px');
    while (content.scrollHeight > content.clientHeight + 1 && size > 14) {
      size -= .5;
      node.style.setProperty('--in-font-size', size + 'px');
    }
    const overflow = content.scrollHeight > content.clientHeight + 1 || content.scrollWidth > content.clientWidth + 1;
    node.dataset.noteOverflow = String(overflow);
    node.title = overflow ? 'Nội dung quá dài. Vui lòng rút gọn trước khi xuất.' : '';
    if (overflow && strict) throw new Error('Lịch trình Note: nội dung quá dài ở ' + node.querySelector('.in-day')?.textContent + '. Vui lòng rút gọn trước khi xuất.');
  }
}
