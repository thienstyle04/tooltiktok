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

const timedIcon = body => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
const timedShare = timedIcon('<path d="M8 8H5v14h14V8h-3M12 15V1m-4 4 4-4 4 4"/>');
const timedMore = timedIcon('<circle cx="12" cy="12" r="10"/><circle cx="7" cy="12" r=".65" fill="currentColor"/><circle cx="12" cy="12" r=".65" fill="currentColor"/><circle cx="17" cy="12" r=".65" fill="currentColor"/>');
const timedSignal = '<svg viewBox="0 0 20 14" aria-hidden="true"><rect x="1" y="9" width="3" height="4" rx=".6"/><rect x="6" y="6" width="3" height="7" rx=".6"/><rect x="11" y="3" width="3" height="10" rx=".6"/><rect x="16" y="0" width="3" height="13" rx=".6"/></svg>';
const timedWifi = '<svg viewBox="0 0 20 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M2 4.5c4.8-4 11.2-4 16 0M5 8c3-2.5 7-2.5 10 0M8.5 11.2c1-.8 2-.8 3 0"/><circle cx="10" cy="13" r=".8" fill="currentColor" stroke="none"/></svg>';
const timedChecklist = timedIcon('<circle cx="5" cy="6" r="2"/><path d="m4 6 1 1 2-3M10 6h10M3 13h4M10 13h10M3 19h4M10 19h10"/>');
const timedCamera = timedIcon('<path d="M4 7h4l2-3h4l2 3h4v13H4z"/><circle cx="12" cy="13" r="4"/>');
const timedPen = timedIcon('<circle cx="12" cy="12" r="9"/><path d="m8 15 1-4 6-6 3 3-6 6z"/>');
const timedCompose = timedIcon('<path d="M13 4H5v15h15v-8M12 12l8-8m-5 0h5v5"/>');

export function renderItineraryNoteTimedPage(page, index, listId) {
  const rows = (page.items || []).map((item) => {
    const time = item.scheduleTime ?? '';
    const iconValue = item.scheduleIcon ?? '📍';
    const name = item.name ?? item.rawName ?? '';
    const address = item.metaPrimary ?? '';
    const text = [name, address].filter(Boolean).join(address ? ' - ' : '');
    return `<div class="int-row${item.fixedRow ? ' is-fixed' : ''}">
      <div class="int-time">${escape(time)}</div>
      <div class="int-place"><span class="int-place-icon" aria-hidden="true">${text ? escape(iconValue) : ''}</span><span class="int-place-text">${escape(text)}</span></div>
    </div>`;
  }).join('');
  const statusTime = page.noteStatusTime ?? String(page.subtitle || '').match(/^\d{2}:\d{2}/)?.[0] ?? '';
  return `<article class="story-page itinerary-note-timed-day" data-list-id="${escape(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-ngay-${index + 1}.png">
    <div class="int-status" aria-hidden="true"><strong>${escape(statusTime)}</strong><span class="int-status-icons">${timedSignal}${timedWifi}<span class="int-battery">48</span></span></div>
    <div class="int-nav" aria-hidden="true"><span class="int-back"><b>‹</b>Tất cả iCloud</span><span class="int-actions">${timedShare}${timedMore}</span></div>
    <div class="int-date">${escape(page.subtitle ?? '')}</div>
    <div class="int-content"><p class="int-day">${escape(page.chipText ?? `🌷 Ngày ${index + 1}`)}</p>${rows}</div>
    <div class="int-bottom-toolbar" aria-hidden="true"><span>${timedChecklist}</span><span>${timedCamera}</span><span>${timedPen}</span><span>${timedCompose}</span></div>
    <div class="int-home" aria-hidden="true"></div>
  </article>`;
}

export function fitItineraryNoteTimed(root, strict = false) {
  const nodes = root?.matches?.('.itinerary-note-timed-day') ? [root] : [...(root?.querySelectorAll?.('.itinerary-note-timed-day') || [])];
  for (const node of nodes) {
    const content = node.querySelector('.int-content');
    if (!content || !content.clientHeight) continue;
    let size = 16;
    node.style.setProperty('--int-font-size', size + 'px');
    while ((content.scrollHeight > content.clientHeight + 1 || content.scrollWidth > content.clientWidth + 1) && size > 13) {
      size -= .25;
      node.style.setProperty('--int-font-size', size + 'px');
    }
    const overflow = content.scrollHeight > content.clientHeight + 1 || content.scrollWidth > content.clientWidth + 1;
    node.dataset.noteOverflow = String(overflow);
    node.title = overflow ? 'Nội dung quá dài. Vui lòng rút gọn trước khi xuất.' : '';
    if (overflow && strict) throw new Error(`Lịch trình Note theo giờ: nội dung quá dài ở ${node.querySelector('.int-day')?.textContent || `trang ${Number(node.dataset.pageIndex || 0) + 1}`}. Vui lòng rút gọn trước khi xuất.`);
  }
}
