import { compactThreadsLocalAddress } from './threadsFoodExport.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = body => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
const share = icon('<path d="M8 8H5v14h14V8h-3M12 15V1m-4 4 4-4 4 4"/>');
const more = icon('<circle cx="12" cy="12" r="10"/><circle cx="7" cy="12" r=".7" fill="currentColor"/><circle cx="12" cy="12" r=".7" fill="currentColor"/><circle cx="17" cy="12" r=".7" fill="currentColor"/>');
export function renderItineraryNotePage(page, index, listId) {
  if (page.layoutVariant === 'itinerary-note-threads-day') {
    const items = page.items || [];
    if (items.some(item => /^Ngày \d+\|/.test(item.label || ''))) {
      let previousDay = '';
      const rows = items.map((item, itemIndex) => {
        const day = String(item.label || '').split('|')[0];
        const number = Number(day.match(/\d+/)?.[0]) || 1;
        const showDay = day !== previousDay; previousDay = day;
        const period = String(item.label || '').split('|')[1] || '';
        const activity = item.sourceSectionKey === 'quan_an' ? ({ Sáng: 'Ăn sáng', Trưa: 'Ăn trưa', Tối: 'Ăn tối' }[period] || 'Ăn uống') : item.sourceSectionKey === 'cafe' ? 'Cà phê' : item.sourceSectionKey === 'choi_dem' ? 'Đi chơi đêm' : 'Tham quan / check-in';
        const note = item.metaSecondary || activity;
        const next = items[itemIndex + 1];
        const rest = period === 'Trưa' && next && String(next.label || '').startsWith(day + '|') && !String(next.label).endsWith('|Trưa')
          ? '<tr class="threads-rest"><td></td><td colspan="3">Quay lại chỗ nghỉ · nghỉ ngơi</td></tr>' : '';
        return `<tr class="threads-place-row day-${number}"><td${showDay ? ` class="threads-day-label threads-day-${number}"` : ''}>${showDay ? escape(day) : ''}</td><td>${escape(item.name)}</td><td>${escape(item.metaPrimary)}</td><td>${escape(note)}</td></tr>${rest}`;
      }).join('');
      return `<article class="story-page itinerary-note-day itinerary-note-threads-day threads-summary threads-portrait" data-list-id="${escape(listId)}" data-page-index="${index}" data-export-name="lich-trinh-tong-hop.png"><div class="in-content"><table class="threads-table"><colgroup><col style="width:12%"><col style="width:26%"><col style="width:40%"><col style="width:22%"></colgroup><thead><tr><th>Ngày</th><th>Địa điểm / hoạt động</th><th>Địa chỉ</th><th>Ghi chú</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
    }
    const groups = ['Sáng', 'Trưa', 'Chiều', 'Tối'].map(period => {
      const selected = items.filter(item => item.label === period);
      if (!selected.length) return '';
      const rows = selected.map(item => {
        const visit = ['check_in', 'khu_du_lich', 'hoat_dong', 'dia_diem_lich_su', 'choi_dem'].includes(item.sourceSectionKey);
        const note = item.metaSecondary || (item.sourceSectionKey === 'quan_an' ? 'Ăn uống' : item.sourceSectionKey === 'cafe' ? 'Cafe' : visit ? 'Tham quan / check-in' : '');
        return `<tr class="threads-place-row"><td>${escape(item.scheduleTime || '')}</td><td${visit ? ' class="threads-highlight"' : ''}>${escape(item.name)}</td><td>${escape(item.metaPrimary)}</td></tr>`;
      }).join('');
      return `<tr class="threads-period"><th colspan="3">${period}</th></tr>${rows}${period === 'Trưa' ? '<tr class="threads-rest"><td colspan="3">Về chỗ nghỉ · nghỉ ngơi</td></tr>' : ''}`;
    }).join('');
    return `<article class="story-page itinerary-note-day itinerary-note-threads-day threads-portrait" data-list-id="${escape(listId)}" data-page-index="${index}" data-export-name="${index+1}-note-threads.png"><div class="in-content"><h1>${escape(page.title)}</h1><p class="threads-subtitle">${escape(page.subtitle)}</p><table class="threads-table"><colgroup><col style="width:17%"><col style="width:45%"><col style="width:38%"></colgroup><thead><tr><th>Giờ dự kiến</th><th>Hoạt động / địa điểm</th><th>Địa chỉ</th></tr></thead><tbody>${groups}</tbody></table></div></article>`;
  }
  const dark = page.layoutVariant === 'itinerary-note-dark-day';
  const rows = (page.items || []).map(item => {
    const name = item.name ?? item.rawName ?? '';
    const address = item.metaPrimary ?? '';
    const place = name ? [item.label, name].filter(Boolean).join(' ') : '';
    const text = dark
      ? place + (item.isPartner && address ? ' (' + compactThreadsLocalAddress(address) + ')' : '')
      : [place, address].filter(Boolean).join(' - ');
    return '<li>' + escape(text) + '</li>';
  }).join('');
  return `<article class="story-page itinerary-note-day${dark ? ' itinerary-note-dark-day' : ''}" data-list-id="${escape(listId)}" data-page-index="${index}" data-export-name="${String(index+1).padStart(2,'0')}-ngay-${index+1}.png">
    <div class="in-toolbar" aria-hidden="true"><span>${icon('<path d="m15 3-9 9 9 9"/>')}Ghi chú</span><span>${share}${more}</span></div>
    <div class="in-content">${dark ? '' : `<h1>${escape(page.title)}</h1><p class="in-day">${escape(page.chipText ?? 'Ngày ' + (index+1))}</p>`}<ul>${rows}</ul></div>
    <div class="in-home" aria-hidden="true"></div>
  </article>`;
}

// Same measured fitting in preview and every export path. Never clip overflowing copy.
export function fitItineraryNote(root, strict = false) {
  const nodes = root?.matches?.('.itinerary-note-day') ? [root] : [...(root?.querySelectorAll?.('.itinerary-note-day') || [])];
  for (const node of nodes) {
    const content = node.querySelector('.in-content');
    if (!content || !content.clientHeight) continue;
    const threads = node.classList.contains('itinerary-note-threads-day');
    const budget = node.classList.contains('itinerary-note-threads-budget');
    const portrait = node.classList.contains('threads-portrait');
    const explicitSize = Number(node.dataset.textFontSize);
    const hasExplicitSize = explicitSize >= 8 && explicitSize <= 72;
    const summary = node.classList.contains('threads-summary');
    const overflows = () => content.scrollHeight > content.clientHeight + 1 || content.scrollWidth > content.clientWidth + 1;
    if (summary && portrait) {
      node.style.removeProperty('--threads-table-width');
      node.style.removeProperty('--threads-cell-pad-y');
    }
    let size = budget ? 20 : summary ? (portrait ? 20 : 8) : threads ? 16 : 18;
    node.style.setProperty('--in-font-size', size + 'px');
    while (overflows()
      && size > (budget ? 12 : summary ? (portrait ? 11 : 7) : threads ? 11 : 14) && !((threads || budget) && hasExplicitSize)) {
      size -= .5;
      node.style.setProperty('--in-font-size', size + 'px');
    }
    // Keep the compact Threads table by default; borrow page width only for unusually long rows.
    if (summary && portrait && overflows()) {
      for (const width of [774]) {
        node.style.setProperty('--threads-table-width', width + 'px');
        if (!overflows()) break;
      }
      if (!hasExplicitSize) {
        while (overflows() && size > 10) {
          size -= .5;
          node.style.setProperty('--in-font-size', size + 'px');
        }
      }
    }
    // Use spare vertical room for even row spacing, without enlarging the columns again.
    if (summary && portrait && !hasExplicitSize && !overflows()) {
      const table = content.querySelector('.threads-table');
      if (table?.rows.length) {
        const spareHeight = content.clientHeight - 12 - table.offsetHeight;
        const extraPadding = Math.min(12, Math.max(0, spareHeight / (table.rows.length * 2)));
        if (extraPadding >= .1) {
          node.style.setProperty('--threads-cell-pad-y', (2 + extraPadding).toFixed(2) + 'px');
          if (overflows()) node.style.removeProperty('--threads-cell-pad-y');
        }
      }
    }
    const overflow = overflows();
    node.dataset.noteOverflow = String(overflow);
    node.title = overflow ? 'Nội dung quá dài. Vui lòng rút gọn trước khi xuất.' : '';
    if (overflow && strict) throw new Error('Lịch trình Note: nội dung quá dài ở ' + (node.querySelector('.in-day')?.textContent || node.querySelector('h1')?.textContent || `trang ${Number(node.dataset.pageIndex || 0) + 1}`) + '. Vui lòng giảm cỡ chữ hoặc rút gọn trước khi xuất.');
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
