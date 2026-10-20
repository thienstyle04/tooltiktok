// Hàm và hằng dùng chung cho mọi mẫu trang (ảnh, tiêu đề, phụ đề, item list cơ bản).
import { escapeHtml } from '../utils.js';

function sourceLabel(item) {
  const source = item?.imageSource || (item?.imageMapped ? 'manual' : 'fallback');
  if (source === 'manual') return 'Đúng ảnh';
  if (source === 'auto') return 'Tự map';
  return 'Minh họa';
}

export function imageSourceClass(item) {
  return item?.imageSource || (item?.imageMapped ? 'manual' : 'fallback');
}

function previewImageAttrs() {
  return 'loading="lazy" decoding="async" fetchpriority="low" draggable="false"';
}

const TITLE_FONT_VARIANT_COUNT = 8;
const GENERIC_CAPTION_BODY = 'Lưu list này để có lịch đi Đà Lạt gọn hơn, dễ chọn điểm theo buổi và đỡ mất thời gian mò từng nơi.';

function titleFontVariantFromId(raw) {
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return (hash % TITLE_FONT_VARIANT_COUNT) + 1;
}

function titleFontClass(listId) {
  const raw = String(listId || '');
  const captionNumber = raw.match(/^(.*?)-caption-(\d+)/i);
  if (captionNumber) {
    // Caption lists inherit the parent deck main typography so AI lists match the template design.
    return `title-font-${titleFontVariantFromId(`${captionNumber[1]}-main`)}`;
  }

  return `title-font-${titleFontVariantFromId(raw)}`;
}

export function storyPageClass(listId, ...classNames) {
  return ['story-page', titleFontClass(listId), ...classNames.filter(Boolean)].join(' ');
}

function previewImageCandidateAttr(src, candidates = []) {
  const urls = [src, ...(Array.isArray(candidates) ? candidates : [])]
    .map((url) => String(url || '').trim())
    .filter((url) => isPortableImageUrl(url));
  const uniqueUrls = [...new Set(urls)];
  if (uniqueUrls.length <= 1) return '';
  return ` data-candidate-srcs="${escapeHtml(JSON.stringify(uniqueUrls))}"`;
}

export function renderPreviewImage(src, alt, className = '', candidates = []) {
  if (!src) return '';
  const classAttr = className ? ` class="${escapeHtml(className)}"` : '';
  const candidateAttr = previewImageCandidateAttr(src, candidates);
  return `<img${classAttr} src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${candidateAttr} ${previewImageAttrs()}>`;
}

export function isPortableImageUrl(src) {
  const value = String(src || '').trim();
  return /^https?:\/\//i.test(value) || value.startsWith('/assets/drive-file') || value.startsWith('/assets/color-edit?');
}

function collectPortableListImages(list) {
  const urls = [];
  for (const page of list?.pages || []) {
    if (isPortableImageUrl(page?.backgroundImage)) urls.push(page.backgroundImage);
    for (const item of page?.items || []) {
      if (isPortableImageUrl(item.imageUrl)) urls.push(item.imageUrl);
      for (const candidate of item.candidateImageUrls || []) {
        if (isPortableImageUrl(candidate)) urls.push(candidate);
      }
    }
  }
  return [...new Set(urls)];
}

export function coverBackgroundImage(page, list) {
  if (isPortableImageUrl(page.backgroundImage)) return page.backgroundImage;
  const fallback = collectPortableListImages(list)[0];
  return fallback || page.backgroundImage || '';
}

export function firstPortablePageImage(page) {
  for (const item of page?.items || []) {
    if (isPortableImageUrl(item.imageUrl)) return item.imageUrl;
    for (const candidate of item.candidateImageUrls || []) {
      if (isPortableImageUrl(candidate)) return candidate;
    }
  }
  return '';
}

export function portablePageImageCandidates(page, primary = '') {
  const urls = [];
  for (const item of page?.items || []) {
    if (isPortableImageUrl(item.imageUrl)) urls.push(item.imageUrl);
    for (const candidate of item.candidateImageUrls || []) {
      if (isPortableImageUrl(candidate)) urls.push(candidate);
    }
  }
  return [...new Set(urls)].filter((url) => url !== primary);
}

export function pageCounter(index, total) {
  return `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
}

export function isServiceListPage(page) {
  const key = `${page?.chipText || ''} ${page?.title || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase();
  return key.includes('dich vu');
}

export function isStayListPage(page) {
  const key = `${page?.chipText || ''} ${page?.title || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase();
  return key.includes('homestay') || key.includes('luu tru');
}

export function isServiceOrStayListPage(page) {
  return isServiceListPage(page) || isStayListPage(page);
}

export function isActivityListPage(page) {
  const chip = String(page?.chipText || '').trim().toLowerCase();
  if (chip === 'hoạt động') return true;
  return gridPageKind(page) === 'activity';
}

export function shouldShowItemAddress(item, showAddress = true) {
  if (!showAddress) return false;
  if (String(item?.sourceSectionKey || '').trim() === 'hoat_dong') return false;
  return true;
}

function isGeneratedCaptionList(list) {
  return /caption-/i.test(String(list?.id || ''));
}

export function gridContextKey(value) {
  return normalizeGridText(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function polishShortVietnameseCopy(value) {
  let text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';

  text = text
    .replace(/\bĐà\s*Lạt\s+VN\b/giu, 'Đà Lạt')
    .replace(/\s+\/\s*VN\b/giu, '')
    .replace(/\s+\bVN\b(?=\s|$|[./])/giu, '')
    .replace(/\bĐà\s*Lạt\s*ẩn\s*mình\s*sau\s*vách\s*núi\b/giu, 'Đầy đủ kinh nghiệm cho chuyến đi Đà Lạt')
    .replace(/\bĐà\s*Lạt\s*đủ\s*để\s*đi\s*ngay\b/giu, 'Đầy đủ kinh nghiệm cho chuyến đi Đà Lạt')
    .replace(/\bmở\s+to\s+mắt\b/giu, 'mở mang tầm mắt')
    .replace(/\bnhấn\s+lưu\s+liền\s+kẻo\b[^.!?]*[.!?]?$/giu, 'Nhấn lưu liền tay để khỏi quên list này nhé.')
    .replace(/\blưu\s+liền\s+kẻo\b[^.!?]*[.!?]?$/giu, 'lưu liền tay để khỏi quên list này nhé.')
    .replace(/\blưu\s+lại\s*[.!?]*$/giu, 'lưu lại ngay nhé.')
    .replace(/\blưu\s+liền\s*[.!?]*$/giu, 'lưu liền tay nhé.')
    .replace(/\bmấy\s+chỗ\s+ăn\s+uống\b/giu, 'mấy chỗ ăn ngon')
    .replace(/\bchọn\s+điểm\s+đi,\s*ăn\s+uống\s+và\s+chụp\s+hình\b/giu, 'chọn điểm đi, quán ăn và góc chụp')
    .replace(/\btừ\s+ăn\s+uống,\s*check-?in\b/giu, 'từ quán ăn, check-in')
    .replace(/\bnhóm\s+ăn\s+uống\b/giu, 'nhóm quán ăn')
    .replace(/[,\-–:;]\s*ăn\s+uống\s*$/giu, ', có điểm ăn hợp lịch.')
    .replace(/(^|[^\p{L}\p{N}])ăn\s+uống\s*[.!?]*$/giu, '$1điểm ăn hợp lịch.');

  return text.replace(/\s+([,.!?;:])/g, '$1').replace(/\s+/g, ' ').trim();
}

export function gridPageKind(page) {
  const key = gridContextKey(`${page?.chipText || ''} ${page?.title || ''}`);
  if (key.includes('quan_an') || key.includes('mon_ngon')) return 'food';
  if (key.includes('cafe') || key.includes('ca_phe')) return 'cafe';
  if (key.includes('check_in')) return 'checkin';
  if (key.includes('choi_dem')) return 'nightlife';
  if (key.includes('dich_vu') || key.includes('luu_y')) return 'service';
  if (key.includes('homestay') || key.includes('luu_tru')) return 'stay';
  if (key.includes('hoat_dong')) return 'activity';
  if (key.includes('khu_du_lich')) return 'tourism';
  return 'generic';
}

function listVariantIndex(list, variantCount, salt = '') {
  if (variantCount <= 1) return 0;
  const rawId = String(list?.id || '');
  const captionMatch = rawId.match(/caption-(\d+)/i);
  if (captionMatch) return Math.max(0, Number(captionMatch[1]) - 1) % variantCount;

  const raw = `${rawId}|${list?.title || ''}|${salt}`;
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return hash % variantCount;
}

export function pickListVariant(list, variants, salt) {
  return variants[listVariantIndex(list, variants.length, salt)] || variants[0] || '';
}

// ─── End Grid 6 Zigzag ───────────────────────────────────────────────────────

export function renderInlineHashtags(hashtags) {
  if (!Array.isArray(hashtags) || hashtags.length === 0) {
    return '';
  }

  return `
    <div class="page-inline-hashtags">
      ${hashtags.map((tag) => {
        let cleanTag = tag.trim().toLowerCase();
        if (cleanTag && !cleanTag.startsWith('#')) {
          cleanTag = '#' + cleanTag;
        }
        return `<span class="page-inline-hashtag">${escapeHtml(cleanTag)}</span>`;
      }).join('')}
    </div>
  `;
}

function stripVietnameseMarks(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectPagePlaceNames(pages) {
  const names = new Map();
  const addName = (value) => {
    const name = String(value || '').replace(/\s+/g, ' ').trim();
    if (name.length < 3) return;
    names.set(stripVietnameseMarks(name).toLowerCase(), name);
  };

  for (const page of pages || []) {
    if (page?.type !== 'list') continue;
    for (const item of page.items || []) {
      addName(item.rawName);
      addName(item.name);
      addName(String(item.name || '').split(/:\s*/).slice(1).join(': '));
    }
  }

  return [...names.values()].sort((a, b) => b.length - a.length);
}

function getPlaceNameCandidates(name) {
  const normalized = String(name || '').replace(/\s+/g, ' ').trim();
  const unaccented = stripVietnameseMarks(normalized);
  return [...new Set([normalized, unaccented].filter((value) => value.length >= 3))];
}

// Một list có thể có hàng trăm tên địa điểm; thử từng regex riêng cho mọi trang/thumbnail làm
// cuộn thư viện mẫu khựng. Gộp thành một regex (?:tên1|tên2|…) — khớp khi và chỉ khi có một tên
// khớp, như cách cũ — và nhớ lại theo danh sách tên. Không có cờ g nên .test() không giữ trạng thái.
const placeNamePatterns = new Map();
function placeNamesPattern(placeNames) {
  const key = placeNames.join('\u0000');
  if (placeNamePatterns.has(key)) return placeNamePatterns.get(key);
  const alternatives = [...new Set(placeNames.flatMap(getPlaceNameCandidates))]
    .map((candidate) => escapeRegExp(candidate).replace(/\s+/g, '\\s+'));
  const pattern = alternatives.length
    ? new RegExp(`(^|[^\\p{L}\\p{N}])(?:${alternatives.join('|')})(?=$|[^\\p{L}\\p{N}])`, 'iu')
    : null;
  if (placeNamePatterns.size > 500) placeNamePatterns.clear();
  placeNamePatterns.set(key, pattern);
  return pattern;
}

function hasPagePlaceName(value, placeNames) {
  return Boolean(placeNamesPattern(placeNames)?.test(value));
}

function looksLikeStopList(value) {
  const dayMarkers = value.match(/\b(?:ngày\s*(?:đầu|một|hai|ba|bốn|1|2|3|4)|sáng|trưa|chiều|tối)\b/giu) || [];
  const stopVerbs = value.match(/\b(?:ghé|qua|đi|lượn|chạy|săn|ăn|uống|check-?in|chụp)\b/giu) || [];
  return dayMarkers.length >= 2 && stopVerbs.length >= 2;
}

function looksLocationSpecific(value) {
  const normalized = stripVietnameseMarks(value).toLowerCase();
  return /\b(?:nha tho|duong|hem|doc|kdl|bun|banh|lau|xien)\b/.test(normalized)
    || /\b\d+\s*k\b/i.test(value);
}

export function sanitizeSubtitleForDisplay(value, pages) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  if ((pages || []).some((page) => page?.layoutVariant === 'spotlight-partner')) {
    return polishShortVietnameseCopy(clean);
  }

  const placeNames = collectPagePlaceNames(pages);
  if (hasPagePlaceName(clean, placeNames) || looksLikeStopList(clean) || looksLocationSpecific(clean)) {
    return GENERIC_CAPTION_BODY;
  }

  return polishShortVietnameseCopy(clean);
}

export const V2_COVER_VARIANTS = new Set([
  'threads-toplist-cover',
  'grid-6-quaytung-cover',
  'grid-8-feed',
  'grid-8-quaytung-cover',
  'spotlight-v2',
  'spotlight-v3',
  'spotlight-v4-cover',
  'spotlight-v5-cover',
  'spotlight-v6-cover',
  'carousel-mau-1-cover',
  'one-way-story-cover',
  'spotlight-partner-v2',
  'pov-maikem',
  'pov-3-v2-cover',
  'budget-wallet-cover',
  'itinerary-4n3d-stack-cover',
  'itinerary-timeline-cover',
]);

export const V2_LIST_VARIANTS = new Set([
  'threads-toplist-page',
  'grid-6-quaytung',
  'grid-8-feed',
  'grid-8-quaytung',
  'grid-8-quaytung-menu',
  'spotlight-v2',
  'spotlight-v3',
  'spotlight-v4-image',
  'spotlight-v4-page',
  'spotlight-v5-playlist',
  'spotlight-v5-place',
  'spotlight-v6-image',
  'spotlight-v6-page',
  'spotlight-v6-map-page',
  'spotlight-v6-map-place',
  'spotlight-v6-diary-page',
  'summary-note-page',
  'itinerary-note-day',
  'itinerary-note-dark-day',
  'itinerary-note-threads-day',
  'itinerary-note-threads-budget',
  'threads-expense-sheet',
  'itinerary-note-timed-day',
  'carousel-mau-1-page',
  'one-way-story-road',
  'one-way-story-slope',
  'one-way-story-photo',
  'spotlight-v2-list',
  'spotlight-partner-v2',
  'spotlight-partner-v2-info',
  'pov-maikem',
  'pov-3-v2-stack',
  'pov-3-v2-grid',
  'itinerary-4n3d-stack-page',
  'itinerary-timeline-day',
  'budget-wallet-day',
  'budget-wallet-fixed',
  'budget-wallet-bill',
]);

export function cafeLightPrice(item) {
  const raw = String(item.metaSecondary || item.metaPrimary || '').trim();
  const match = raw.match(/(\d+\s*k|\d+[.,]?\d*\s*tr)/i);
  return match ? match[1] : (raw.includes('Giá') ? raw : '');
}

/** Grid8: chỉ giá (đã ưu tiên gia_dau_nguoi từ backend), bỏ khung giờ. */
export function gridPriceMetaFromSecondary(value) {
  const secondary = String(value || '').replace(/\s+/g, ' ').trim();
  if (!secondary) return '';
  const parts = secondary.split('·').map((part) => part.trim()).filter(Boolean);
  const pricePart = parts.find((part) => /^Giá:/i.test(part));
  if (pricePart) return pricePart;
  const withoutHours = parts.filter((part) => !/^Khung giờ:/i.test(part)).join(' · ');
  return withoutHours.replace(/(?:^|\s*·\s*)Khung giờ:\s*[^·]+/gi, '').replace(/^[\s·]+|[\s·]+$/g, '').trim();
}

export function formatGrid8FeedCoverTagline(value) {
  let text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  text = text.replace(/\.{3,}$/, '').replace(/…+$/, '').trim();
  return escapeHtml(text.toUpperCase());
}

function spotlightCoverGridSeed(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function pickUniqueCoverGridImages(pool, seed, count = 4) {
  const unique = [...new Set((pool || []).map((url) => String(url || '').trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  const ordered = [...unique].sort(
    (left, right) => spotlightCoverGridSeed(`${seed}:${left}`) - spotlightCoverGridSeed(`${seed}:${right}`),
  );
  return ordered.slice(0, count);
}

export let spotlightV2CoverImagePool = [];

export function setSpotlightV2CoverImagePool(urls) {
  spotlightV2CoverImagePool = Array.isArray(urls) ? urls.filter(Boolean) : [];
}

export function pov3V2BracketSubtitle(subtitle) {
  const clean = String(subtitle || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const inner = clean.replace(/^[\[\(\s]+|[\]\)\s]+$/g, '');
  return `[ ${inner} ]`;
}

export function portraitFocusClass(item) {
  const section = String(item?.sourceSectionKey || '').trim();
  if (['check_in', 'khu_du_lich', 'dich_vu', 'hoat_dong', 'homestay'].includes(section)) {
    return ' is-portrait-focus';
  }
  const name = String(item?.name || item?.rawName || '').toLowerCase();
  if (/tháp|thap|vinaphone|nhà thờ|nha tho|con gà|con ga|chụp|check.?in|thuê|thue|spa|nail|tóc|toc|makeup|photo|chụp hình|đồ|ao|váy|vay/.test(name)) {
    return ' is-portrait-focus';
  }
  return '';
}

export function truncateMenuLine(value, maxLen = 42) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > maxLen * 0.45 ? cut.slice(0, sp) : cut).trim()}…`;
}
export function responsiveTitleFitClass(value, prefix, mediumAt = 32, smallAt = 48) {
  const length = String(value || '').replace(/\s+/g, ' ').trim().length;
  if (length >= smallAt) return `${prefix}-fit-xs`;
  if (length >= mediumAt) return `${prefix}-fit-sm`;
  return '';
}

export function formatBalancedTitleLines(value, maxLines = 2) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const words = raw.split(' ');
  if (words.length <= 3 || maxLines <= 1) return escapeHtml(raw);

  const lines = [];
  let remaining = [...words];
  for (let lineIndex = 0; lineIndex < maxLines - 1 && remaining.length > 1; lineIndex += 1) {
    const remainingLineCount = maxLines - lineIndex;
    const remainingChars = remaining.join(' ').length;
    const target = remainingChars / remainingLineCount;
    let bestSplit = 1;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (let split = 1; split <= remaining.length - (remainingLineCount - 1); split += 1) {
      const length = remaining.slice(0, split).join(' ').length;
      const diff = Math.abs(length - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestSplit = split;
      }
    }
    lines.push(remaining.slice(0, bestSplit).join(' '));
    remaining = remaining.slice(bestSplit);
  }
  if (remaining.length > 0) lines.push(remaining.join(' '));
  return lines.map((line) => escapeHtml(line)).join('<br>');
}

export function normalizeVietnameseDisplayText(value) {
  return String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** @param {import('../types').PageItem[]} items @returns {string} */
export function renderListItems(items) {
  return items.map((item) => `
    <div class="item-row">
      <div class="thumb-block ${escapeHtml(item.imageSource || (item.imageMapped ? 'manual' : 'fallback'))}">
        ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
      </div>
      <div class="item-copy">
        ${item.label ? `<div class="item-label">${escapeHtml(item.label)}</div>` : ''}
        <div class="item-name story-image-title">${escapeHtml(item.name)}</div>
        <p class="item-meta story-image-meta">${escapeHtml(item.metaPrimary)}</p>
        ${(() => { const secondary = gridPriceMetaFromSecondary(item.metaSecondary); return secondary ? `<p class="item-meta story-image-meta secondary">${escapeHtml(secondary)}</p>` : ''; })()}
        <div class="mapping-chip compact ${escapeHtml(item.imageSource || (item.imageMapped ? 'manual' : 'fallback'))}">
          ${item.imageSource === 'manual' ? 'Đúng ảnh' : item.imageSource === 'auto' ? 'Tự map' : 'Minh họa'}
        </div>
      </div>
    </div>
  `).join('');
}

export function renderPhotomodePin() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" class="photomode-pin-icon">
      <path fill="currentColor" d="M12 2.25a7.25 7.25 0 0 0-7.25 7.25c0 5.29 5.42 10.74 6.57 11.84a.98.98 0 0 0 1.36 0c1.15-1.1 6.57-6.55 6.57-11.84A7.25 7.25 0 0 0 12 2.25Zm0 9.5a2.25 2.25 0 1 1 0-4.5a2.25 2.25 0 0 1 0 4.5Z"/>
    </svg>
  `;
}

export function cleanGridAddress(value) {
  return String(value || '')
    .replace(/^\s*\(?\s*(?:\+?84|0|1900|1800)(?:[\s.-]?\d){3,11}\s*\)?\s*/g, '')
    .replace(/\s*\((?:\+?84|0|1900|1800)(?:[\s.-]?\d){3,11}\)\s*/g, ' ')
    .replace(/^\s*(đường|duong|đ\.|hẻm|hem|dốc|doc)\s+/i, '')
    .replace(/(^|\s)(đường|duong|đ\.)\s+/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeGridText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function compactGridItemName(value) {
  const original = String(value || '').replace(/\s+/g, ' ').trim();
  const normalized = normalizeGridText(original);

  if (normalized.includes('nha tho domaine de marie')) return 'Nhà thờ Domain';
  if (normalized.includes('kdl the florest') || normalized.includes('the florest')) return 'The Florest';
  if (normalized.includes('truong dai hoc da lat')) return 'ĐH Đà Lạt';
  if (normalized.includes('doc han thuyen')) return 'Dốc Hàn Thuyên';

  const cleaned = original
    .replace(/^\s*(Ăn\s+(sáng|trưa|tối)|Cafe|Cà phê|Check-?in|Điểm ghé|Bắt đầu|Chốt chuyến|Dịch vụ|Cần lưu|Cần nhớ|Nên ghé|Buổi sáng|Sáng sớm)\s*:\s*/i, '')
    .replace(/^\s*KDL\s+/i, '')
    .replace(/\s*-\s*(Hoa Trong Rung|Hoa Trong Rừng|Da Lat|Đa Lat|Đà Lạt).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

export function gridDisplayName(item) {
  return compactGridItemName(item?.rawName || item?.name);
}
