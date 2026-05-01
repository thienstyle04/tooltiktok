import { escapeHtml, sanitizeFilePart } from './utils';

function sourceLabel(item) {
  const source = item?.imageSource || (item?.imageMapped ? 'manual' : 'fallback');
  if (source === 'manual') return 'Đúng ảnh';
  if (source === 'auto') return 'Tự map';
  return 'Minh họa';
}

function imageSourceClass(item) {
  return item?.imageSource || (item?.imageMapped ? 'manual' : 'fallback');
}

function previewImageAttrs() {
  return 'loading="lazy" decoding="async" fetchpriority="low" draggable="false"';
}

const TITLE_FONT_VARIANT_COUNT = 8;
const GENERIC_CAPTION_BODY = 'Lưu list này để có lịch đi Đà Lạt gọn hơn, dễ chọn điểm theo buổi và đỡ mất thời gian mò từng nơi.';

function titleFontClass(listId) {
  const raw = String(listId || '');
  const captionNumber = raw.match(/caption-(\d+)/i);
  if (captionNumber) {
    return `title-font-${((Number(captionNumber[1]) - 1) % TITLE_FONT_VARIANT_COUNT) + 1}`;
  }

  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return `title-font-${(hash % TITLE_FONT_VARIANT_COUNT) + 1}`;
}

function storyPageClass(listId, ...classNames) {
  return ['story-page', titleFontClass(listId), ...classNames.filter(Boolean)].join(' ');
}

function renderPreviewImage(src, alt, className = '') {
  if (!src) return '';
  const classAttr = className ? ` class="${escapeHtml(className)}"` : '';
  return `<img${classAttr} src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" ${previewImageAttrs()}>`;
}

export function pageCounter(index, total) {
  return `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
}

function isGridLayout(page) {
  return page.layoutVariant === 'grid-6' || page.layoutVariant === 'grid-8' || page.layoutVariant === 'grid-4';
}

function isJourneyGrid8Layout(page) {
  return page.layoutVariant === 'journey-4n2d-grid8';
}

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

function hasPagePlaceName(value, placeNames) {
  return placeNames.some((name) => getPlaceNameCandidates(name).some((candidate) => {
    const escaped = escapeRegExp(candidate).replace(/\s+/g, '\\s+');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(value);
  }));
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

function sanitizeSubtitleForDisplay(value, pages) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  const placeNames = collectPagePlaceNames(pages);
  if (hasPagePlaceName(clean, placeNames) || looksLikeStopList(clean) || looksLocationSpecific(clean)) {
    return GENERIC_CAPTION_BODY;
  }

  return clean;
}

export function renderCoverPage(page, index, total, listId, hashtags = [], list = null) {
  const coverSubtitle = sanitizeSubtitleForDisplay(page.subtitle, list?.pages || []);
  if (isJourneyGrid8Layout(page)) {
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'grid8-cover-page', 'journey-grid8-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
        <div class="grid8-cover-photo">
          ${renderPreviewImage(page.backgroundImage, page.title)}
        </div>
        <div class="grid8-cover-shade"></div>
        <div class="grid8-cover-copy">
          <div class="grid8-cover-kicker">LỊCH TRÌNH 4N2Đ</div>
          <h1 class="grid8-cover-title">${escapeHtml(page.title)}</h1>
          <p class="grid8-cover-subtitle">${escapeHtml(coverSubtitle)}</p>
        </div>
      </article>
    `;
  }

  if (page.layoutVariant === 'grid-8') {
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'grid8-cover-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
        <div class="grid8-cover-photo">
          ${renderPreviewImage(page.backgroundImage, page.title)}
        </div>
        <div class="grid8-cover-shade"></div>
        <div class="grid8-cover-copy">
          <div class="grid8-cover-kicker">8 lựa chọn / 1 trang</div>
          <h1 class="grid8-cover-title">${escapeHtml(page.title)}</h1>
          <p class="grid8-cover-subtitle">${escapeHtml(coverSubtitle)}</p>
        </div>
      </article>
    `;
  }

  if (isGridLayout(page)) {
    const gridVariantClass = page.layoutVariant === 'grid-4'
      ? ' grid4-cover'
      : page.layoutVariant === 'grid-8'
        ? ' grid8-cover'
        : '';
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'grid6-cover', gridVariantClass.trim()))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
        <div class="grid6-cover-bg">
          ${renderPreviewImage(page.backgroundImage, page.title)}
        </div>
        <div class="grid6-cover-overlay">
           <div class="grid6-cover-header">ĐÀ LẠT</div>
           <h1 class="grid6-cover-title">${escapeHtml(page.title)}</h1>
            <div class="grid6-cover-subtitle">${escapeHtml(coverSubtitle)}</div>
        </div>
      </article>
    `;
  }

  if (page.layoutVariant === 'journey-4n3d') {
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'journey-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
        <div class="journey-cover-photo">
          ${renderPreviewImage(page.backgroundImage, page.title)}
        </div>
        <div class="journey-cover-panel">
          <div class="journey-cover-kicker">LỊCH TRÌNH 4N3Đ</div>
          <h1 class="journey-cover-title">${escapeHtml(page.title)}</h1>
          <p class="journey-cover-subtitle">${escapeHtml(coverSubtitle)}</p>
          <div class="journey-route-pills">
            <span>Day 01</span>
            <span>Day 02</span>
            <span>Day 03</span>
            <span>Day 04</span>
          </div>
        </div>
      </article>
    `;
  }

  if (page.layoutVariant === 'photomode') {
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'photomode', 'photomode-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
        <div class="photomode-cover-bg">
          ${renderPreviewImage(page.backgroundImage, page.title)}
        </div>
        <div class="photomode-cover-copy">
          <h3 class="photomode-cover-title">${escapeHtml(page.title)}</h3>
          <p class="photomode-cover-subtitle">${escapeHtml(coverSubtitle)}</p>
        </div>
      </article>
    `;
  }

  const hashtagsHtml = renderInlineHashtags(hashtags);
  const hashtagClass = Array.isArray(hashtags) && hashtags.length > 0 ? ' has-inline-hashtags' : '';
  return `
    <article class="${escapeHtml(storyPageClass(listId, hashtagClass.trim()))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="page-cover">
        ${renderPreviewImage(page.backgroundImage, page.title)}
      </div>
      <div class="cover-copy">
        <div class="cover-script">Da Lat</div>
        <h3 class="cover-title">${escapeHtml(page.title)}</h3>
        <p class="cover-subtitle">${escapeHtml(coverSubtitle)}</p>
      </div>
    </article>
  `;
}

export function renderListItems(items) {
  return items.map((item) => `
    <div class="item-row">
      <div class="thumb-block ${escapeHtml(item.imageSource || (item.imageMapped ? 'manual' : 'fallback'))}">
        ${renderPreviewImage(item.imageUrl, item.name)}
      </div>
      <div class="item-copy">
        <div class="item-label">${escapeHtml(item.label)}</div>
        <div class="item-name story-image-title">${escapeHtml(item.name)}</div>
        <p class="item-meta story-image-meta">${escapeHtml(item.metaPrimary)}</p>
        ${item.metaSecondary ? `<p class="item-meta story-image-meta secondary">${escapeHtml(item.metaSecondary)}</p>` : ''}
        <div class="mapping-chip compact ${escapeHtml(item.imageSource || (item.imageMapped ? 'manual' : 'fallback'))}">
          ${item.imageSource === 'manual' ? 'Đúng ảnh' : item.imageSource === 'auto' ? 'Tự map' : 'Minh họa'}
        </div>
      </div>
    </div>
  `).join('');
}

function renderPhotomodePin() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" class="photomode-pin-icon">
      <path fill="currentColor" d="M12 2.25a7.25 7.25 0 0 0-7.25 7.25c0 5.29 5.42 10.74 6.57 11.84a.98.98 0 0 0 1.36 0c1.15-1.1 6.57-6.55 6.57-11.84A7.25 7.25 0 0 0 12 2.25Zm0 9.5a2.25 2.25 0 1 1 0-4.5a2.25 2.25 0 0 1 0 4.5Z"/>
    </svg>
  `;
}

function cleanGridAddress(value) {
  return String(value || '')
    .replace(/^\s*(đường|duong|đ\.|hẻm|hem|dốc|doc)\s+/i, '')
    .replace(/(^|\s)(đường|duong|đ\.)\s+/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderGridAddress(value) {
  const cleanAddress = cleanGridAddress(value);
  if (!cleanAddress) {
    return '';
  }

  return `
    <div class="grid6-address story-image-meta">
      <span class="grid6-address-pin">${renderPhotomodePin()}</span>
      <span class="grid6-address-text">${escapeHtml(cleanAddress)}</span>
    </div>
  `;
}

function normalizeGridText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function compactGridItemName(value) {
  const original = String(value || '').replace(/\s+/g, ' ').trim();
  const normalized = normalizeGridText(original);

  if (normalized.includes('nha tho domaine de marie')) return 'Nhà thờ Domain';
  if (normalized.includes('kdl the florest') || normalized.includes('the florest')) return 'The Florest';

  const cleaned = original
    .replace(/^\s*KDL\s+/i, '')
    .replace(/\s*-\s*(Hoa Trong Rung|Hoa Trong Rừng|Da Lat|Đa Lat|Đà Lạt).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length <= 24) return cleaned;
  const words = cleaned.split(' ');
  const kept = [];
  for (const word of words) {
    const next = [...kept, word].join(' ');
    if (next.length > 24) break;
    kept.push(word);
  }
  return kept.length > 0 ? kept.join(' ') : cleaned.slice(0, 24).trim();
}

export function renderPhotomodeItems(items) {
  return items.map((item) => `
    <section class="photomode-item ${escapeHtml(item.imageSource || (item.imageMapped ? 'manual' : 'fallback'))}">
      ${renderPreviewImage(item.imageUrl, item.name)}
      <div class="photomode-copy">
        <div class="photomode-name-row">
          <span class="photomode-pin">${renderPhotomodePin()}</span>
          <h4 class="photomode-name story-image-title">${escapeHtml(item.name)}</h4>
        </div>
        <p class="photomode-meta story-image-meta">
          <span class="photomode-label">${escapeHtml(item.label)}</span>
          <span class="photomode-divider"> - </span>
          <span class="photomode-address">${escapeHtml(item.metaPrimary)}</span>
        </p>
      </div>
    </section>
  `).join('');
}

export function renderGrid6Items(items, { numbered = false, twoDigitNumber = false } = {}) {
  return items.map((item, index) => {
    const displayName = compactGridItemName(item.name);
    const itemNumber = twoDigitNumber ? String(index + 1).padStart(2, '0') : String(index + 1);
    const itemName = numbered ? `${itemNumber}. ${displayName}` : displayName;
    return `
    <div class="grid6-item ${escapeHtml(item.imageSource || (item.imageMapped ? 'manual' : 'fallback'))}">
      ${renderPreviewImage(item.imageUrl, item.name)}
      <div class="grid6-overlay">
        <div class="grid6-name story-image-title">${escapeHtml(itemName)}</div>
        ${renderGridAddress(item.metaPrimary)}
      </div>
    </div>
  `;
  }).join('');
}

function renderGrid8Meta(value) {
  const cleanAddress = cleanGridAddress(value);
  if (!cleanAddress) {
    return '';
  }

  return `
    <div class="grid8-meta story-image-meta">
      <span class="grid8-pin">${renderPhotomodePin()}</span>
      <span>${escapeHtml(cleanAddress)}</span>
    </div>
  `;
}

export function renderGrid8Items(items, title, chipText, backgroundImage, introText = '', options = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return '';
  }
  const showTime = Boolean(options.showTime);
  const showMeta = options.showMeta !== false;
  const showCenterChip = options.showCenterChip !== false;
  const centerImageHtml = backgroundImage
    ? renderPreviewImage(backgroundImage, title || '', 'grid8-center-bg')
    : '';

  return `
    ${items.slice(0, 4).map((item) => {
      const displayName = compactGridItemName(item.name);
      return `
        <article class="grid8-cell ${escapeHtml(imageSourceClass(item))}">
          ${renderPreviewImage(item.imageUrl, item.name)}
          <div class="grid8-cell-copy">
            ${showTime && item.label ? `<span class="grid8-cell-time">${escapeHtml(item.label)}</span>` : ''}
            <strong class="story-image-title">${escapeHtml(displayName)}</strong>
            ${showMeta ? renderGrid8Meta(item.metaPrimary) : ''}
          </div>
        </article>
      `;
    }).join('')}
    <article class="grid8-center">
      ${centerImageHtml}
      ${showCenterChip ? `<span class="grid8-center-chip">${escapeHtml(chipText || 'List')}</span>` : ''}
      <h3 class="grid8-center-title">${escapeHtml(title || '')}</h3>
      ${introText ? `<p class="grid8-center-intro">${escapeHtml(introText)}</p>` : ''}
    </article>
    ${items.slice(4, 8).map((item) => {
        const displayName = compactGridItemName(item.name);
        return `
          <article class="grid8-cell ${escapeHtml(imageSourceClass(item))}">
            ${renderPreviewImage(item.imageUrl, item.name)}
            <div class="grid8-cell-copy">
              ${showTime && item.label ? `<span class="grid8-cell-time">${escapeHtml(item.label)}</span>` : ''}
              <strong class="story-image-title">${escapeHtml(displayName)}</strong>
              ${showMeta ? renderGrid8Meta(item.metaPrimary) : ''}
            </div>
          </article>
        `;
      }).join('')}
  `;
}

export function renderItineraryItems(items) {
  return items.map((item) => `
    <div class="item-row itinerary-row">
      <div class="thumb-block itinerary-thumb ${item.imageSource || (item.imageMapped ? 'manual' : 'fallback')}">
        ${renderPreviewImage(item.imageUrl, item.name)}
      </div>
      <div class="item-copy itinerary-copy">
        <div class="itinerary-topline">
          <div class="item-label itinerary-time">${escapeHtml(item.label)}</div>
          <div class="itinerary-name story-image-title">${escapeHtml(item.name)}</div>
        </div>
        <p class="item-meta story-image-meta itinerary-detail">
          ${escapeHtml(item.metaPrimary)}${item.metaSecondary ? ` · ${escapeHtml(item.metaSecondary)}` : ''}
        </p>
      </div>
    </div>
  `).join('');
}

export function renderJourney4N3DItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '';
  }

  return `
    <div class="journey-timeline">
      ${items.map((item) => `
        <article class="journey-time-row ${escapeHtml(item.imageSource || (item.imageMapped ? 'manual' : 'fallback'))}">
          <div class="journey-stop-thumb">
            ${renderPreviewImage(item.imageUrl, item.name)}
          </div>
          <div class="journey-time-copy">
            <strong class="story-image-title">${escapeHtml(item.name)}</strong>
            <p class="story-image-meta">${escapeHtml(item.metaPrimary)}</p>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function journey4N3DTitle(chipText, title) {
  const chip = String(chipText || '').trim();
  const cleanTitle = String(title || '').trim();
  if (!chip || !cleanTitle) {
    return cleanTitle || chip;
  }
  if (cleanTitle.toLowerCase().startsWith(`${chip.toLowerCase()} - `)) {
    return cleanTitle;
  }
  return `${chip} - ${cleanTitle}`;
}

export function renderListPage(page, index, total, listId, hashtags = [], list = null) {
  const pageSubtitle = sanitizeSubtitleForDisplay(page.subtitle, list?.pages || [page]);
  if (page.layoutVariant === 'photomode') {
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'photomode'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        <div class="photomode-stack">
          ${renderPhotomodeItems(page.items)}
        </div>
      </article>
    `;
  }

  if (page.layoutVariant === 'grid-8') {
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'grid8-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        <div class="grid8-matrix">
          ${renderGrid8Items(page.items, page.title, page.chipText, page.backgroundImage, pageSubtitle)}
        </div>
      </article>
    `;
  }

  if (isJourneyGrid8Layout(page)) {
    const hideCenterChip = page.chipText === 'Lưu trú' || page.chipText === 'Dịch vụ';
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'grid8-page', 'journey-grid8-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        <div class="grid8-matrix">
          ${renderGrid8Items(page.items, page.title, page.chipText, page.backgroundImage, pageSubtitle, { showTime: true, showMeta: false, showCenterChip: !hideCenterChip })}
        </div>
      </article>
    `;
  }

  if (isGridLayout(page)) {
    const gridVariantClass = page.layoutVariant === 'grid-4'
      ? ' grid4'
      : page.layoutVariant === 'grid-8'
        ? ' grid8'
        : '';
    const gridBodyClass = page.layoutVariant === 'grid-4'
      ? ' grid4-body'
      : page.layoutVariant === 'grid-8'
        ? ' grid8-body'
        : '';
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'grid6', gridVariantClass.trim()))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        <div class="grid6-header">
           <div class="grid6-header-top">${escapeHtml(page.title)}</div>
        </div>
        <div class="grid6-body${gridBodyClass}">
          ${renderGrid6Items(page.items)}
        </div>
      </article>
    `;
  }

  if (page.layoutVariant === 'journey-4n3d') {
    const dayNumber = String(Math.max(index, 1)).padStart(2, '0');
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'journey4', `journey-page-${dayNumber}`))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        <div class="journey-bg">${renderPreviewImage(page.backgroundImage, page.title)}</div>
        <div class="journey-day-badge">${escapeHtml(page.chipText)}</div>
        <div class="journey-card">
          <div class="journey-title-block">
            <h3 class="page-title">${escapeHtml(journey4N3DTitle(page.chipText, page.title))}</h3>
            ${pageSubtitle ? `<p class="page-lead">${escapeHtml(pageSubtitle)}</p>` : ''}
          </div>
          ${renderJourney4N3DItems(page.items)}
        </div>
      </article>
    `;
  }

  const variantClass = page.layoutVariant === 'dense'
    ? ' dense'
    : page.layoutVariant === 'itinerary'
      ? ' itinerary'
      : page.layoutVariant === 'compact'
        ? ' compact'
      : '';
  const crowdedClass = Array.isArray(page.items) && page.items.length >= 6 ? ' crowded' : '';
  const hashtagsHtml = renderInlineHashtags(hashtags);
  const hashtagClass = Array.isArray(hashtags) && hashtags.length > 0 ? ' has-inline-hashtags' : '';
  const itemsHtml = page.layoutVariant === 'itinerary'
    ? renderItineraryItems(page.items)
    : renderListItems(page.items);
  return `
    <article class="${escapeHtml(storyPageClass(listId, variantClass.trim(), crowdedClass.trim(), hashtagClass.trim()))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
      <div class="page-shell-bg">${renderPreviewImage(page.backgroundImage, page.title)}</div>
      <div class="page-card">
        <div class="page-chip chip-${escapeHtml(page.chipTone)}">${escapeHtml(page.chipText)}</div>
        <h3 class="page-title">${escapeHtml(page.title)}</h3>
        <p class="page-lead">${escapeHtml(pageSubtitle)}</p>
        <div class="item-stack">
          ${itemsHtml}
        </div>
      </div>
    </article>
  `;
}

