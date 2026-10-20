// Bảng chi tiêu Threads kiểu ảnh chụp Google Sheet: Nội dung · Số tiền · Ghi chú.
// Số tiền ghi theo nghìn đồng như bảng tự ghi ("1.900" = 1.900.000đ); tổng và
// "Mỗi người" luôn tự tính từ các dòng nên sửa một khoản là tổng cập nhật theo.
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const THREADS_EXPENSE_PEOPLE = 2;
const PAGE_HEIGHT = 1080;
// Cột theo px trên trang 810px; cột cuối bị cắt ở mép phải như ảnh chụp màn hình.
const COLUMNS = [18, 380, 150, 210, 140];
const FRAME_ROWS = 9; // trống, tiêu đề, trống, header, trống sau bảng, tổng, trống, mỗi người, trống cuối

/** "1.900" | "1900" | "90k" | "1,5tr" → số nghìn đồng; ô trống hoặc không phải số → null. */
export function parseThousands(value) {
  const raw = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!raw) return null;
  let match = raw.match(/^(\d+(?:[.,]\d+)?)(tr|triệu)$/);
  if (match) return Math.round(Number(match[1].replace(',', '.')) * 1000);
  match = raw.match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:k|nghìn|ngàn)?$/);
  if (match) return Number(match[1].replace(/\./g, ''));
  return null;
}

export const formatThousands = amount => Math.round(amount).toLocaleString('vi-VN');

export function threadsExpenseTotals(items, people = THREADS_EXPENSE_PEOPLE) {
  const amounts = (items || []).map(item => parseThousands(item.metaSecondary));
  const total = amounts.reduce((sum, amount) => sum + (amount ?? 0), 0);
  return { total, perPerson: Math.round(total / people), missingCount: amounts.filter(amount => amount === null).length };
}

/** Cỡ chữ và chiều cao dòng để toàn bộ bảng luôn vừa khung 3:4, không phụ thuộc đo DOM. */
export function threadsExpenseMetrics(rowCount, requestedFontSize) {
  const maxRowHeight = Math.min(46, Math.floor(PAGE_HEIGHT / (rowCount + FRAME_ROWS)));
  const defaultFont = Math.round(maxRowHeight * 0.5 * 2) / 2;
  const requested = Number(requestedFontSize);
  const font = requested >= 8 && requested <= 72 ? Math.min(requested, maxRowHeight * 0.62) : defaultFont;
  return { font, rowHeight: maxRowHeight };
}

function fittedCell(text, columnWidth, font, className = '') {
  // Chữ dài thu nhỏ riêng ô đó thay vì xuống dòng làm vỡ lưới bảng.
  const capacity = columnWidth / (font * 0.5);
  const scale = text.length > capacity ? Math.max(0.62, capacity / text.length) : 1;
  const style = scale < 1 ? ` style="font-size:${scale.toFixed(3)}em"` : '';
  return `<td class="${className}"${style}>${escape(text)}</td>`;
}

export function renderThreadsExpensePage(page, index, listId) {
  const items = page.items || [];
  const { total, perPerson, missingCount } = threadsExpenseTotals(items);
  const { font, rowHeight } = threadsExpenseMetrics(items.length, page.textFontSize);
  const blank = () => `<tr class="tes-grid">${'<td></td>'.repeat(5)}</tr>`;
  const dataRows = items.map(item => {
    const amount = String(item.metaSecondary ?? '').trim();
    const invalid = amount && parseThousands(amount) === null;
    return `<tr class="tes-row"><td class="tes-gutter"></td>${fittedCell(item.name || '', COLUMNS[1], font)}`
      + `<td class="tes-amount${invalid ? ' is-invalid' : ''}">${escape(amount)}</td>${fittedCell(item.metaPrimary || '', COLUMNS[3], font)}<td class="tes-outside"></td></tr>`;
  }).join('');
  const fillerCount = Math.max(0, Math.ceil(PAGE_HEIGHT / rowHeight) - (items.length + FRAME_ROWS) + 1);
  const example = /MẪU MINH HỌA/i.test(page.subtitle || '');
  return `<article class="story-page threads-expense-sheet${example ? ' is-example' : ''}" data-list-id="${escape(listId)}" data-page-index="${index}"`
    + ` data-export-name="bang-chi-tieu-threads.png" style="--tes-font:${font}px;--tes-row:${rowHeight}px">`
    + `<div class="tes-content"><table class="tes-table"><colgroup>${COLUMNS.map(width => `<col style="width:${width}px">`).join('')}</colgroup><tbody>`
    + blank()
    + `<tr class="tes-grid tes-title-row"><td></td><td class="tes-title" colspan="2">${escape(page.title || '')}</td><td></td><td></td></tr>`
    + blank()
    + '<tr class="tes-head"><td class="tes-gutter"></td><th>NỘI DUNG</th><th>SỐ TIỀN</th><th>GHI CHÚ</th><td class="tes-outside"></td></tr>'
    + dataRows
    + '<tr class="tes-row tes-empty"><td class="tes-gutter"></td><td></td><td></td><td></td><td class="tes-outside"></td></tr>'
    + `<tr class="tes-row tes-total"><td class="tes-gutter"></td><td></td><td class="tes-amount">${escape(formatThousands(total))}</td><td>${missingCount ? `<small>thiếu ${missingCount} khoản</small>` : ''}</td><td class="tes-outside"></td></tr>`
    + blank()
    + `<tr class="tes-person"><td class="tes-gutter"></td><td class="tes-person-label">Mỗi người</td><td class="tes-amount">${escape(formatThousands(perPerson))}</td><td></td><td></td></tr>`
    + Array.from({ length: fillerCount }, () => blank()).join('')
    + `</tbody></table>${example ? `<p class="tes-example">${escape(page.subtitle)}</p>` : ''}</div></article>`;
}
