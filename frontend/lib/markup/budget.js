// Mẫu ngân sách: Budget 3N2Đ (bảng, gallery, story), Budget 72h và ví ngân sách.
import { escapeHtml, sanitizeFilePart } from '../utils.js';
import { coverBackgroundImage, firstPortablePageImage, gridPriceMetaFromSecondary, imageSourceClass, normalizeVietnameseDisplayText, renderPreviewImage, storyPageClass } from './shared.js';

export function isBudget3N2DCover(page) {
  return page.layoutVariant === 'budget-3n2d' && page.type === 'cover';
}

export function isBudget3N2DStoryCover(page) {
  return page.layoutVariant === 'budget-3n2d-story' && page.type === 'cover';
}

// Chỉ bắt đúng dấu hiệu mojibake (UTF-8 bị đọc nhầm thành Latin-1), KHÔNG bắt
// các chữ hoa có dấu hợp lệ trong tiếng Việt (Â, Ã, Ä, Å, Æ đều là chữ cái
// tiếng Việt bình thường, đặc biệt khi tiêu đề viết HOA) — nếu không, chữ do
// người dùng nhập/xóa sẽ bị âm thầm reset về text mặc định.
const MOJIBAKE_TEXT_RE = /(?:áÂ|â€|ï¿½)/;

const BUDGET72_STORY_TEXT = {
  coverTitle: '"72H" \u1ede \u0110\u00c0 L\u1ea0T V\u1edaI 3TR',
  coverSubtitle: 'L\u1ecbch tr\u00ecnh 3 ng\u00e0y 2 \u0111\u00eam g\u1ecdn h\u01a1n: xem theo t\u1eebng ng\u00e0y, c\u00f3 chi ph\u00ed v\u00e0 c\u00e1c \u0111i\u1ec3m n\u00ean l\u01b0u.',
  day1: {
    chip: 'Ng\u00e0y 01',
    title: 'Ng\u00e0y \u0111\u1ea7u v\u00e0o ph\u1ed1',
    subtitle: '\u0102n s\u00e1ng, cafe, check-in v\u00e0 m\u1ed9t bu\u1ed5i t\u1ed1i v\u1eeba \u0111\u1ee7 nh\u1ecbp \u0111\u1ec3 l\u00e0m quen \u0110\u00e0 L\u1ea1t.',
  },
  day2: {
    chip: 'Ng\u00e0y 02',
    title: 'M\u1ed9t ng\u00e0y \u0111i tr\u1ecdn h\u01a1n',
    subtitle: 'D\u00e0nh ng\u00e0y gi\u1eefa chuy\u1ebfn cho c\u00e1c \u0111i\u1ec3m ch\u00ednh, qu\u00e1n \u0111\u1eb9p v\u00e0 ho\u1ea1t \u0111\u1ed9ng \u0111\u00e1ng gh\u00e9.',
  },
  day3: {
    chip: 'Ng\u00e0y 03',
    title: 'Ng\u00e0y cu\u1ed1i nh\u1eb9 nh\u00e0ng',
    subtitle: 'Gi\u1eef l\u1ecbch g\u1ecdn \u0111\u1ec3 k\u1ecbp \u0103n, mua qu\u00e0, check-out v\u00e0 quay v\u1ec1 kh\u00f4ng b\u1ecb g\u1ea5p.',
  },
  total: {
    chip: 'Chi ph\u00ed',
    title: 'T\u1ed5ng chi ph\u00ed d\u1ef1 ki\u1ebfn',
    subtitle: 'C\u00e1c kho\u1ea3n ch\u00ednh \u0111\u01b0\u1ee3c gom l\u1ea1i \u0111\u1ec3 d\u1ec5 c\u00e2n ng\u00e2n s\u00e1ch tr\u01b0\u1edbc khi \u0111i.',
    label: '72H \u0110\u00e0 L\u1ea1t',
    finalLabel: 'T\u1ed5ng thanh to\u00e1n d\u1ef1 ki\u1ebfn',
  },
};

function hasMojibakeText(value) {
  return MOJIBAKE_TEXT_RE.test(String(value || ''));
}

export function cleanStoryText(value, fallback = '') {
  const text = String(value || '').trim();
  if (!text || hasMojibakeText(text)) return fallback;
  return text;
}

function budgetStoryDayNumber(page, index) {
  const raw = `${page?.chipText || ''} ${page?.title || ''} ${index + 1}`.toLowerCase();
  const numberMatch = raw.match(/\b0?([123])\b/);
  if (numberMatch) return Number(numberMatch[1]);
  const pageOffset = index - 1;
  if (pageOffset >= 1 && pageOffset <= 3) return pageOffset;
  return 1;
}

function cleanBudgetStoryDayCopy(page, index) {
  const defaults = BUDGET72_STORY_TEXT[`day${budgetStoryDayNumber(page, index)}`] || BUDGET72_STORY_TEXT.day1;
  return {
    chip: cleanStoryText(page?.chipText, defaults.chip),
    title: cleanStoryText(page?.title, ''),
    subtitle: cleanStoryText(page?.subtitle, ''),
  };
}

function cleanBudgetStoryTotalCopy(page) {
  return {
    chip: cleanStoryText(page?.chipText, BUDGET72_STORY_TEXT.total.chip),
    title: cleanStoryText(page?.title, ''),
    subtitle: cleanStoryText(page?.subtitle, ''),
  };
}

export function renderBudgetWalletCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
  const titleParts = String(coverTitle || '').split('·').map((part) => part.trim()).filter(Boolean);
  const subtitleParts = String(coverSubtitle || '').split('·').map((part) => part.trim()).filter(Boolean);
  const mainTitle = titleParts[0] || coverTitle || '';
  const hookLine = titleParts[1] || subtitleParts[0] || '';
  const subLine = subtitleParts.length > 1
    ? subtitleParts.slice(1).join(' · ')
    : (titleParts.length > 1 ? '' : subtitleParts.slice(1).join(' · '));
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'budget-wallet-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="budget-wallet-cover-bg">
        ${renderPreviewImage(backgroundImage, coverTitle)}
      </div>
      <div class="budget-wallet-cover-shade"></div>
      <div class="budget-wallet-cover-copy">
        <div class="budget-wallet-script">dalat.</div>
        ${mainTitle ? `<h1 class="budget-wallet-title">${escapeHtml(mainTitle)}</h1>` : ''}
        ${hookLine ? `<h2 class="budget-wallet-hook">${escapeHtml(hookLine)}</h2>` : ''}
        ${subLine ? `<p class="budget-wallet-sub">${escapeHtml(subLine)}</p>` : ''}
      </div>
    </article>
  `;
}

export function renderBudgetWalletDayPage(page, index, listId, list) {
  const items = (page.items || []).slice(0, 7);
  const thumbs = items.filter((item) => item.imageUrl).slice(0, 3);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'budget-wallet-day'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText || 'ngay')}.png">
      <section class="budget-wallet-slip">
        <header class="budget-wallet-slip-head">
          <div>
            <span>${escapeHtml(String(page.chipText || '').toUpperCase())}</span>
            <h2>${escapeHtml(page.title || '')}</h2>
          </div>
          <span class="budget-wallet-slip-total">${escapeHtml(page.subtitle || '')}</span>
        </header>
        <div class="budget-wallet-lines">
          ${items.map((item) => {
            const { time } = budgetStoryParts(item);
            return `
              <article class="budget-wallet-line">
                <span>${escapeHtml(time)}</span>
                <strong>${escapeHtml(budgetStoryDisplayTitle(item.name))}</strong>
                <em>${escapeHtml(item.metaSecondary || '')}</em>
              </article>
            `;
          }).join('')}
        </div>
        ${thumbs.length > 0 ? `
          <div class="budget-wallet-thumbs">
            ${thumbs.map((item) => `
              <div class="budget-wallet-thumb">${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}</div>
            `).join('')}
          </div>
        ` : ''}
      </section>
    </article>
  `;
}

export function renderBudgetWalletFixedPage(page, index, listId) {
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'budget-wallet-fixed'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-phi-co-dinh.png">
      <section class="budget-wallet-fixed-panel">
        <span>${escapeHtml(page.chipText || '')}</span>
        <h2>${escapeHtml(page.title || '')}</h2>
        <p>${escapeHtml(page.subtitle || '')}</p>
        <div class="budget-wallet-lines">
          ${(page.items || []).map((item) => `
            <article class="budget-wallet-line">
              <span>${escapeHtml(item.label || '')}</span>
              <strong>${escapeHtml(item.name || '')}</strong>
              <em>${escapeHtml(item.metaSecondary || '')}</em>
            </article>
          `).join('')}
        </div>
      </section>
    </article>
  `;
}

export function renderBudgetWalletBillPage(page, index, listId) {
  const items = page.items || [];
  const total = items.find((item) => /tong|total/i.test(String(item.id || ''))) || items[items.length - 1] || {};
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'budget-wallet-bill'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-bill.png">
      <section class="budget-wallet-bill-panel">
        <span>${escapeHtml(String(page.chipText || 'BILL').toUpperCase())}</span>
        ${page.title ? `<h2>${escapeHtml(page.title)}</h2>` : ''}
        <div class="budget-wallet-lines">
          ${items.filter((item) => !/tong|total/i.test(String(item.id || ''))).map((item) => `
            <article class="budget-wallet-line">
              <span></span>
              <strong>${escapeHtml(item.name || '')}</strong>
              <em>${escapeHtml(item.metaSecondary || '')}</em>
            </article>
          `).join('')}
        </div>
        <div class="budget-wallet-bill-final">
          <span>Tổng bill</span>
          <strong>${escapeHtml(total.metaSecondary || '~4.2tr')}</strong>
        </div>
      </section>
    </article>
  `;
}

function budgetTableParts(item) {
  const parts = String(item?.label || '').split('|');
  return {
    day: parts[0] || '',
    time: parts[1] || '',
  };
}

function budget72CostDisplay(value) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  if (/^free$/i.test(raw) || /miễn\s*phí/i.test(raw)) return 'Free';
  let text = raw
    .replace(/(?:Khung giờ|Open|Hoạt động):\s*[^·]+(?:\s*·\s*)?/gi, '')
    .replace(/^Giá:\s*/i, '')
    .trim();
  const inlinePrice = text.match(/Giá:\s*([^·]+)/i);
  if (inlinePrice) return inlinePrice[1].trim();
  const segments = text.split('·').map((part) => part.trim()).filter(Boolean);
  if (segments.length > 1) {
    const priceSegment = segments.find((part) => /~?\d/.test(part) && /(?:k|tr|đ\b)/i.test(part));
    if (priceSegment) return priceSegment.replace(/^Giá:\s*/i, '').trim();
  }
  return text.replace(/^·\s*/, '').trim();
}

function renderBudget3N2DTableRows(items) {
  let lastDay = '';
  return (items || [])
    .filter((item) => !String(item.label || '').startsWith('Tổng|'))
    .map((item) => {
      const { day, time } = budgetTableParts(item);
      const showDay = day && day !== lastDay;
      lastDay = day || lastDay;
      return `
        <tr>
          <td class="budget72-day">${showDay ? escapeHtml(day) : ''}</td>
          <td class="budget72-time">${escapeHtml(time)}</td>
          <td class="budget72-activity">${escapeHtml(item.name || '')}</td>
          <td class="budget72-address">${escapeHtml(item.metaPrimary || '')}</td>
          <td class="budget72-cost">${escapeHtml(budget72CostDisplay(item.metaSecondary))}</td>
        </tr>
      `;
    }).join('');
}

function renderBudget3N2DSummaryRows(items) {
  return (items || [])
    .filter((item) => String(item.label || '').startsWith('Tổng|'))
    .filter((item) => item.id !== 'budget-3n2d-main-summary-total')
    .map((item) => `
      <tr>
        <td>${escapeHtml(item.name || '')}</td>
        <td>${escapeHtml(item.metaSecondary || '')}</td>
        <td>${escapeHtml(item.metaPrimary || '')}</td>
      </tr>
    `).join('');
}

function budget3N2DTotalItem(items) {
  return (items || []).find((item) => String(item.label || '').startsWith('Tổng|') && /tong|total/i.test(String(item.id || '')))
    || (items || []).filter((item) => String(item.label || '').startsWith('Tổng|')).slice(-1)[0]
    || null;
}

export function renderBudget3N2DTablePage(page, index, listId) {
  const totalItem = budget3N2DTotalItem(page.items);
  const totalValue = String(totalItem?.metaSecondary || '').trim() || '~0k';
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'budget72-table-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-bang-chi-phi.png">
      <div class="budget72-table-shell">
        ${page.title ? `<h2>${escapeHtml(page.title)}</h2>` : ''}
        <table class="budget72-schedule-table">
          <colgroup>
            <col class="budget72-col-day" />
            <col class="budget72-col-time" />
            <col class="budget72-col-activity" />
            <col class="budget72-col-address" />
            <col class="budget72-col-cost" />
          </colgroup>
          <thead>
            <tr>
              <th class="budget72-day">Ngày</th>
              <th class="budget72-time">Thời gian</th>
              <th class="budget72-activity">Hoạt động</th>
              <th class="budget72-address">Địa chỉ</th>
              <th class="budget72-cost">Chi phí</th>
            </tr>
          </thead>
          <tbody>
            ${renderBudget3N2DTableRows(page.items)}
          </tbody>
        </table>
        <table class="budget72-summary-table">
          <thead>
            <tr>
              <th>Tên mục</th>
              <th>Chi phí</th>
              <th>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            ${renderBudget3N2DSummaryRows(page.items)}
          </tbody>
        </table>
        <div class="budget72-total-bar">
          <span>Tổng thanh toán dự kiến</span>
          <strong>${escapeHtml(totalValue)}</strong>
        </div>
      </div>
    </article>
  `;
}

function renderBudget3N2DGalleryRow(item, rowIndex) {
  const secondary = budgetGalleryMetaText(item);
  return `
    <article class="budget72-gallery-row ${escapeHtml(imageSourceClass(item))}">
      <div class="budget72-gallery-row-index">${String(rowIndex + 2).padStart(2, '0')}</div>
      <div class="budget72-gallery-row-thumb">
        ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
      </div>
      <div class="budget72-gallery-row-copy">
        ${item.label ? `<span class="budget72-gallery-label">${escapeHtml(item.label)}</span>` : ''}
        <strong class="story-image-title">${escapeHtml(item.rawName || item.name || '')}</strong>
        ${secondary ? `<div class="budget72-gallery-price">${escapeHtml(secondary)}</div>` : ''}
      </div>
    </article>
  `;
}

function renderBudget3N2DGalleryPage(page, index, listId, list) {
  const items = Array.isArray(page.items) ? page.items.slice(0, 4) : [];
  const hero = items[0] || {};
  const heroMeta = budgetGalleryMetaText(hero);
  const backgroundImage = page.backgroundImage || hero.imageUrl || coverBackgroundImage(page, list);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'budget72-gallery-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText || page.title || 'gallery')}.png">
      <div class="budget72-gallery-backdrop">
        ${renderPreviewImage(backgroundImage, page.title)}
      </div>
      <div class="budget72-gallery-shell">
        <header class="budget72-gallery-head">
          <span>72H Đà Lạt</span>
          <h2>${escapeHtml(page.title || '')}</h2>
        </header>
        <section class="budget72-gallery-hero ${escapeHtml(imageSourceClass(hero))}">
          ${renderPreviewImage(hero.imageUrl || backgroundImage, hero.name || page.title, '', hero.candidateImageUrls)}
          <div class="budget72-gallery-hero-copy">
            <div class="budget72-gallery-hero-top">
              <span class="budget72-gallery-index">01</span>
              ${hero.label ? `<span class="budget72-gallery-label">${escapeHtml(hero.label)}</span>` : ''}
              ${hero.isPartner ? '<span class="budget72-gallery-partner">Đối tác</span>' : ''}
            </div>
            <h3 class="story-image-title">${escapeHtml(hero.rawName || hero.name || '')}</h3>
            ${heroMeta ? `<div class="budget72-gallery-price">${escapeHtml(heroMeta)}</div>` : ''}
          </div>
        </section>
        <section class="budget72-gallery-stack">
          ${items.slice(1).map((item, rowIndex) => renderBudget3N2DGalleryRow(item, rowIndex)).join('')}
        </section>
      </div>
    </article>
  `;
}

function budgetGalleryMetaText(item) {
  const primary = String(item?.metaPrimary || '').replace(/\s+/g, ' ').trim();
  const secondary = String(item?.metaSecondary || '').replace(/\s+/g, ' ').trim();
  const combined = `${primary} ${secondary}`.trim();
  const hoursMatch = combined.match(/Khung gi(?:ờ|á»):\s*([^·]+)/i);
  if (hoursMatch?.[1]) {
    return `Khung giờ: ${hoursMatch[1].trim()}`;
  }
  if (/^Khung gi(?:ờ|á»):/i.test(secondary)) {
    return secondary.replace(/\s*·.*$/, '').trim();
  }
  return '';
}

function renderBudget3N2DGalleryCorner(item, cornerIndex) {
  const secondary = budgetGalleryMetaText(item);
  return `
    <article class="budget72-corner-card budget72-corner-${cornerIndex + 1} ${escapeHtml(imageSourceClass(item))}">
      ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
      <div class="budget72-corner-copy">
        <div class="budget72-corner-topline">
          <span class="budget72-gallery-index">${String(cornerIndex + 1).padStart(2, '0')}</span>
          ${item.label ? `<span class="budget72-gallery-label">${escapeHtml(item.label)}</span>` : ''}
          ${item.isPartner ? '<span class="budget72-gallery-partner">Đối tác</span>' : ''}
        </div>
        <strong class="story-image-title">${escapeHtml(item.rawName || item.name || '')}</strong>
        <div class="budget72-corner-meta">
          ${secondary ? `<div class="budget72-gallery-price">${escapeHtml(secondary)}</div>` : ''}
        </div>
      </div>
    </article>
  `;
}

export function renderBudget3N2DGalleryCornerPage(page, index, listId, list) {
  const items = Array.isArray(page.items) ? page.items.slice(0, 4) : [];
  const backgroundImage = page.backgroundImage || firstPortablePageImage(page) || coverBackgroundImage(page, list);
  const subtitle = String(page.subtitle ?? '').trim();
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'budget72-gallery-page budget72-corner-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText || page.title || 'gallery')}.png">
      <div class="budget72-gallery-backdrop">
        ${renderPreviewImage(backgroundImage, page.title)}
      </div>
      <div class="budget72-gallery-shell">
        <div class="budget72-corner-grid">
          ${items.map((item, cornerIndex) => renderBudget3N2DGalleryCorner(item, cornerIndex)).join('')}
        </div>
        <section class="budget72-gallery-center">
          <span>dalat.</span>
          <h2>${escapeHtml(page.title || '')}</h2>
          ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
        </section>
      </div>
    </article>
  `;
}

function budgetStoryParts(item) {
  const parts = String(item?.label || '').split('|');
  return {
    day: parts[0] || '',
    time: parts[1] || '',
  };
}

function budgetStoryActivityTitle(value) {
  return String(value || '')
    .replace(/^\s*(Ăn sáng|Ăn trưa|Ăn tối|Cà phê chiều|Cà phê|Check-in|Chơi đêm|Mua quà|Hoạt động)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function budgetStoryActivityType(value) {
  const clean = String(value || '').trim();
  const match = clean.match(/^\s*([^:]{2,24})\s*:/);
  return match?.[1]?.trim() || 'Điểm ghé';
}

function budgetStoryDisplayTitle(value) {
  const clean = normalizeVietnameseDisplayText(value);
  if (/di chuy[eể]n b[aằ]ng xe/i.test(clean) || /ph[uươ]ng trang/i.test(clean)) {
    return 'Xe SG - \u0110\u00e0 L\u1ea1t';
  }
  if (/check\s*out|l[eê]n xe|v[eề]\s+l[aạ]i\s+sg/i.test(clean)) {
    return 'V\u1ec1 l\u1ea1i SG';
  }
  return normalizeVietnameseDisplayText(budgetStoryActivityTitle(clean)
    .replace(/^\s*(\u0102n s\u00e1ng|\u0102n tr\u01b0a|\u0102n t\u1ed1i|C\u00e0 ph\u00ea chi\u1ec1u|C\u00e0 ph\u00ea|Check-in|Ch\u01a1i \u0111\u00eam|Mua qu\u00e0|Ho\u1ea1t \u0111\u1ed9ng|D\u1ecbch v\u1ee5|L\u01b0u tr\u00fa|Cafe|\u0102n nh\u1eb9)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim());
}

function budgetStoryDisplayType(value) {
  const clean = String(value || '').trim();
  if (/di chuy[eể]n b[aằ]ng xe/i.test(clean) || /ph[uươ]ng trang/i.test(clean) || /check\s*out|l[eê]n xe|v[eề]\s+l[aạ]i\s+sg/i.test(clean)) {
    return 'Di chuy\u1ec3n';
  }
  const type = budgetStoryActivityType(clean);
  return hasMojibakeText(type) ? '\u0110i\u1ec3m gh\u00e9' : type;
}

export function renderBudget3N2DDayPage(page, index, listId, list) {
  const items = Array.isArray(page.items) ? page.items.slice(0, 8) : [];
  const hero = items.find((item) => item.imageUrl) || items[0] || {};
  const backgroundImage = hero.imageUrl || page.backgroundImage || coverBackgroundImage(page, list);
  const copy = cleanBudgetStoryDayCopy(page, index);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'budget72-story-day'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(copy.chip || copy.title || 'ngay')}.png">
      <div class="budget72-story-bg">
        ${renderPreviewImage(backgroundImage, copy.title)}
      </div>
      <div class="budget72-story-day-shade"></div>
      <section class="budget72-story-panel">
        <header class="budget72-story-head">
          <span>${escapeHtml(copy.chip)}</span>
          <h2>${escapeHtml(copy.title)}</h2>
          <p>${escapeHtml(copy.subtitle)}</p>
        </header>
        <div class="budget72-story-timeline">
          ${items.map((item) => {
            const { time } = budgetStoryParts(item);
            // Dòng "time" ở trên đã là giờ ghé theo lịch trình — không lặp lại "Khung giờ" (giờ mở cửa quán) ở đây, chỉ giữ Giá/Liên hệ.
            const secondary = gridPriceMetaFromSecondary(item.metaSecondary);
            return `
              <article class="budget72-story-stop">
                <div class="budget72-story-time">${escapeHtml(time)}</div>
                <div class="budget72-story-dot"></div>
                <div class="budget72-story-copy">
                  <span>${escapeHtml(budgetStoryDisplayType(item.name))}</span>
                  <strong>${escapeHtml(budgetStoryDisplayTitle(item.name))}</strong>
                  <p>${escapeHtml(item.metaPrimary || '')}</p>
                  ${secondary ? `<em>${escapeHtml(secondary)}</em>` : ''}
                </div>
              </article>
            `;
          }).join('')}
        </div>
      </section>
    </article>
  `;
}

export function renderBudget3N2DTotalPage(page, index, listId, list) {
  const items = Array.isArray(page.items) ? page.items : [];
  const total = items.find((item) => /tong|total/i.test(String(item.id || ''))) || items[items.length - 1] || {};
  const backgroundImage = page.backgroundImage || firstPortablePageImage(page) || coverBackgroundImage(page, list);
  const copy = cleanBudgetStoryTotalCopy(page);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'budget72-story-total'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-tong-chi-phi.png">
      <div class="budget72-story-bg">
        ${renderPreviewImage(backgroundImage, copy.title)}
      </div>
      <div class="budget72-story-total-shade"></div>
      <section class="budget72-total-card">
        <span>${escapeHtml(BUDGET72_STORY_TEXT.total.label)}</span>
        <h2>${escapeHtml(copy.title)}</h2>
        <p>${escapeHtml(copy.subtitle)}</p>
        <div class="budget72-total-list">
          ${items.filter((item) => !/tong|total/i.test(String(item.id || ''))).map((item) => `
            <article>
              <strong>${escapeHtml(item.name || '')}</strong>
              <span>${escapeHtml(item.metaSecondary || '')}</span>
              <p>${escapeHtml(item.metaPrimary || '')}</p>
            </article>
          `).join('')}
        </div>
        <div class="budget72-total-final">
          <span>${escapeHtml(BUDGET72_STORY_TEXT.total.finalLabel)}</span>
          <strong>${escapeHtml(total.metaSecondary || '~2.5tr - 3tr')}</strong>
        </div>
      </section>
    </article>
  `;
}
