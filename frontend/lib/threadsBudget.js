const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const groups = ['Di chuyển', 'Lưu trú', 'Ngày 1', 'Ngày 2', 'Ngày 3'];

export function parseThreadsBudgetAmount(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (/^(?:free|miễn phí|0(?:[.,]0+)?\s*(?:đ|vnd|vnđ)?)$/i.test(raw)) return 0;
  if (/[~–—]|\b(?:từ|khoảng|đến|triệu\s*\/|mỗi|\/người|\/đêm)\b/i.test(raw)) return null;
  const match = raw.match(/^([\d.,\s]+)\s*(tr|triệu|k|nghìn|ngàn|đ|vnd|vnđ)?(?:\s*\/\s*người)?$/i);
  if (!match) return null;
  const digits = match[1].replace(/\s/g, '');
  const unit = match[2] || '';
  let amount;
  if (unit === 'tr' || unit === 'triệu' || unit === 'k' || unit === 'nghìn' || unit === 'ngàn') {
    amount = Number(digits.replace(',', '.')) * (unit === 'tr' || unit === 'triệu' ? 1_000_000 : 1_000);
  } else {
    const normalized = /^[\d]{1,3}(?:[.,]\d{3})+$/.test(digits) ? digits.replace(/[.,]/g, '') : digits;
    amount = Number(normalized);
  }
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

export function threadsBudgetTotals(items) {
  const totals = {};
  for (const group of groups) {
    const rows = (items || []).filter(item => item.label === group);
    const prices = rows.map(item => parseThreadsBudgetAmount(item.metaSecondary));
    const known = prices.filter(price => price !== null);
    totals[group] = {
      amount: known.length ? known.reduce((sum, price) => sum + price, 0) : null,
      count: rows.length,
      missingCount: rows.length - known.length,
      complete: rows.length > 0 && known.length === rows.length,
    };
  }
  const knownGroups = groups.filter(group => totals[group].amount !== null);
  const amount = knownGroups.length
    ? knownGroups.reduce((sum, group) => sum + totals[group].amount, 0) : null;
  const missingCount = groups.reduce((sum, group) => sum + totals[group].missingCount, 0);
  return { groups: totals, amount, missingCount, complete: missingCount === 0 && groups.every(group => totals[group].count > 0) };
}

const money = amount => amount === null ? 'Chưa có giá' : `${new Intl.NumberFormat('vi-VN').format(amount)} đ`;

export function renderThreadsBudgetPage(page, index, listId) {
  const items = page.items || [];
  const totals = threadsBudgetTotals(items);
  const grouped = Object.fromEntries(groups.map(group => [group, items.filter(item => item.label === group)]));
  const ordinary = (group, firstCell = '', category = '') => grouped[group].map((item, rowIndex) => `<tr class="threads-budget-detail">${rowIndex === 0 ? firstCell : ''}${rowIndex === 0 && category ? `<td class="threads-budget-category" rowspan="${grouped[group].length}">${escape(category)}</td>` : ''}<td>${escape(item.name)}</td><td class="threads-budget-money${parseThreadsBudgetAmount(item.metaSecondary) === null ? ' is-missing' : ''}${/\/người\s*$/i.test(item.metaSecondary || '') ? ' is-per-person' : ''}">${escape(item.metaSecondary || 'Chưa có giá')}</td></tr>`).join('');
  const subtotal = (label, amount, missingCount, tone) => `<tr class="threads-budget-subtotal ${tone}"><th colspan="2">${escape(label)}${missingCount ? `<small>Tạm tính · thiếu ${missingCount} khoản</small>` : ''}</th><th>${escape(money(amount))}</th></tr>`;
  const transport = grouped['Di chuyển'].length
    ? ordinary('Di chuyển', `<td class="threads-budget-index" rowspan="${grouped['Di chuyển'].length + 1}">1</td>`, 'Di chuyển')
      + subtotal('Tổng di chuyển', totals.groups['Di chuyển'].amount, totals.groups['Di chuyển'].missingCount, 'tone-green') : '';
  const lodging = grouped['Lưu trú'].length
    ? ordinary('Lưu trú', `<td class="threads-budget-index" rowspan="${grouped['Lưu trú'].length + 1}">2</td>`, 'Lưu trú')
      + subtotal('Tổng lưu trú', totals.groups['Lưu trú'].amount, totals.groups['Lưu trú'].missingCount, 'tone-blue') : '';
  const dailyRows = ['Ngày 1', 'Ngày 2', 'Ngày 3'].map((group, day) => ordinary(group,
    day === 0 ? `<td class="threads-budget-index" rowspan="${['Ngày 1', 'Ngày 2', 'Ngày 3'].reduce((count, key) => count + grouped[key].length, 0) + 1}">3</td>` : '', group)).join('');
  const dailyGroups = ['Ngày 1', 'Ngày 2', 'Ngày 3'];
  const dailyKnown = dailyGroups.filter(group => totals.groups[group].amount !== null);
  const dailySubtotal = subtotal('Tổng ăn uống / sinh hoạt', dailyKnown.length
    ? dailyKnown.reduce((sum, group) => sum + totals.groups[group].amount, 0) : null,
    dailyGroups.reduce((sum, group) => sum + totals.groups[group].missingCount, 0), 'tone-yellow');
  const previewLabel = /MẪU MINH HỌA/i.test(page.subtitle || '') ? `<p class="threads-budget-foot">${escape(page.subtitle)}</p>` : '';
  return `<article class="story-page itinerary-note-day itinerary-note-threads-budget${previewLabel ? ' is-example' : ''}" data-list-id="${escape(listId)}" data-page-index="${index}" data-export-name="chi-phi-threads-3n2d.png"><div class="in-content"><table class="threads-budget-table"><colgroup><col style="width:8%"><col style="width:23%"><col style="width:49%"><col style="width:20%"></colgroup><thead><tr><th>STT</th><th>Hạng mục</th><th>Chi tiết</th><th>Tiền</th></tr></thead><tbody>${transport}${lodging}${dailyRows}${dailySubtotal}<tr class="threads-budget-grand"><th colspan="3">Tổng chi phí${totals.missingCount ? `<small>Tạm tính · còn ${totals.missingCount} khoản chưa có giá</small>` : ''}</th><th>${escape(money(totals.amount))}</th></tr></tbody></table>${previewLabel}</div></article>`;
}
