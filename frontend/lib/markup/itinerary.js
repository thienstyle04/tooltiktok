// Mẫu lịch trình: 4N3Đ stack, timeline và item lịch trình/journey.
import { escapeHtml, sanitizeFilePart } from '../utils.js';
import { cleanGridAddress, gridDisplayName, imageSourceClass, pickUniqueCoverGridImages, polishShortVietnameseCopy, pov3V2BracketSubtitle, renderPreviewImage, spotlightV2CoverImagePool, storyPageClass } from './shared.js';

export function isJourneyGrid8Layout(page) {
  return page.layoutVariant === 'journey-4n2d-grid8';
}

function itinerary4N3DStackCoverGridImages(page, backgroundImage, listId = '', coverImageUrls = []) {
  const fromPage = Array.isArray(page?.coverImages) ? page.coverImages.filter(Boolean) : [];
  const uniqueFromPage = [...new Set(fromPage)];
  if (uniqueFromPage.length >= 4) return uniqueFromPage.slice(0, 4);

  const pool = (coverImageUrls.length > 0 ? coverImageUrls : spotlightV2CoverImagePool).filter(Boolean);
  const seed = `${listId || page?.title || 'itinerary-4n3d-stack-cover'}|cover-grid`;
  const fromPool = pickUniqueCoverGridImages(pool, seed, 4);
  const merged = [...new Set([...uniqueFromPage, backgroundImage, ...fromPool].filter(Boolean))];
  if (merged.length >= 4) return merged.slice(0, 4);
  if (merged.length > 0) {
    const padded = [...merged];
    while (padded.length < 4) padded.push(padded[padded.length % merged.length]);
    return padded.slice(0, 4);
  }
  return backgroundImage ? [backgroundImage] : [];
}

function formatItinerary4N3DStackCoverHero(title) {
  const raw = String(title || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  const words = upper.split(' ');
  if (words.length <= 4) return escapeHtml(upper);
  const splitAt = Math.ceil(words.length / 2);
  return `${escapeHtml(words.slice(0, splitAt).join(' '))}<br>${escapeHtml(words.slice(splitAt).join(' '))}`;
}

export function renderItinerary4N3DStackCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage, coverImageUrls = []) {
  const hero = formatItinerary4N3DStackCoverHero(coverTitle);
  const tagline = escapeHtml(String(coverSubtitle || '').replace(/\s+/g, ' ').trim());
  let tiles = itinerary4N3DStackCoverGridImages(page, backgroundImage, listId, coverImageUrls);
  while (tiles.length < 4) tiles.push('');
  tiles = tiles.slice(0, 4);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'itinerary-4n3d-stack-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="itinerary-4n3d-stack-cover-grid">
        ${tiles.map((url, tileIndex) => `
          <div class="itinerary-4n3d-stack-cover-cell">
            ${url ? renderPreviewImage(url, `${coverTitle || 'cover'} ${tileIndex + 1}`) : ''}
          </div>
        `).join('')}
      </div>
      <div class="itinerary-4n3d-stack-cover-dim" aria-hidden="true"></div>
      <div class="itinerary-4n3d-stack-cover-center">
        ${hero ? `<h1 class="itinerary-4n3d-stack-cover-hero">${hero}</h1>` : ''}
        <p class="itinerary-4n3d-stack-cover-tagline">${tagline}</p>
      </div>
    </article>
  `;
}

function itinerary4N3DStackRowFocusClass(item) {
  const name = String(item?.name || item?.rawName || '').toLowerCase();
  if (/phong\s*m|stell|studio|nhà xe|nha xe/.test(name)) return ' is-people-focus';
  if (item?.sourceSectionKey === 'dich_vu' || item?.sourceSectionKey === 'homestay') return ' is-people-focus';
  return '';
}

function itinerary4N3DStackHeadlineLines(heading) {
  const raw = String(heading || '').replace(/\s+/g, ' ').trim();
  if (!raw) return ['', ''];
  const cleaned = raw.replace(/\s*[·\-–—|]\s*4\s*NGÀY\s*$/i, '').trim() || raw;
  const dotParts = cleaned.split('·').map((part) => part.trim()).filter(Boolean);
  if (dotParts.length >= 2) {
    return [dotParts[0], dotParts.slice(1).join(' · ')];
  }
  return [cleaned, ''];
}

function itinerary4N3DStackBracketLead(lead) {
  const bracketText = pov3V2BracketSubtitle(lead);
  const highlightMatch = bracketText.match(/^(.*?)(\bĐà Lạt\b|\bDa Lat\b)(.*)$/i);
  if (highlightMatch) {
    return `${escapeHtml(highlightMatch[1])}<span class="itinerary-4n3d-stack-page-accent">${escapeHtml(highlightMatch[2])}</span>${escapeHtml(highlightMatch[3])}`;
  }
  return escapeHtml(bracketText);
}

function renderItinerary4N3DStackCell(item) {
  const name = gridDisplayName(item);
  const address = cleanGridAddress(item?.metaPrimary);
  const focusClass = itinerary4N3DStackRowFocusClass(item);
  return `
    <div class="itinerary-4n3d-stack-page-cell${focusClass} ${escapeHtml(imageSourceClass(item))}">
      ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
      <div class="itinerary-4n3d-stack-page-cell-shade"></div>
      <div class="itinerary-4n3d-stack-row-copy">
        <h3 class="itinerary-4n3d-stack-name">${escapeHtml(name)}</h3>
        ${address ? `<p class="itinerary-4n3d-stack-address">${escapeHtml(address)}</p>` : ''}
      </div>
    </div>
  `;
}

export function renderItinerary4N3DStackPage(page, index, listId, pageSubtitle = '') {
  const items = (page.items || []).slice(0, 4);
  const heading = String(page.title || '').trim();
  const lead = String(pageSubtitle || page.subtitle || '').trim();
  const [lineOne, lineTwo] = itinerary4N3DStackHeadlineLines(heading);
  const leadHtml = lead ? itinerary4N3DStackBracketLead(lead) : '';
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'itinerary-4n3d-stack-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
      <div class="itinerary-4n3d-stack-page-grid">
        ${items.map((item) => renderItinerary4N3DStackCell(item)).join('')}
      </div>
      <div class="itinerary-4n3d-stack-page-head">
        ${heading ? `<h2 class="itinerary-4n3d-stack-page-headline">
          <span>${escapeHtml(lineOne)}</span>
          ${lineTwo ? `<span>${escapeHtml(lineTwo)}</span>` : ''}
        </h2>` : ''}
        ${leadHtml ? `<p class="itinerary-4n3d-stack-page-bracket">${leadHtml}</p>` : ''}
      </div>
    </article>
  `;
}

function formatItineraryTimelineCoverHero(coverTitle) {
  const raw = String(coverTitle || '').replace(/\s+/g, ' ').trim();
  const match = raw.match(/^(.+?\s+-\s+)(.+)$/);
  if (match && raw.length > 22) {
    return `${escapeHtml(match[1].trim())}<br>${escapeHtml(match[2].trim())}`;
  }
  return escapeHtml(raw);
}

export function renderItineraryTimelineCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
  const hero = formatItineraryTimelineCoverHero(coverTitle);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'itinerary-timeline-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="itl-cover-photo">
        ${renderPreviewImage(backgroundImage, coverTitle)}
      </div>
      <div class="itl-cover-shade" aria-hidden="true"></div>
      <div class="itl-cover-copy">
        ${hero ? `<p class="itl-cover-script" lang="vi">${hero}</p>` : ''}
        ${hero ? '<div class="itl-cover-spark">— ✦ —</div>' : ''}
      </div>
    </article>
  `;
}

function renderItineraryTimelineRow(item) {
  // Cấu trúc người dùng chốt: giờ / tên địa điểm / địa chỉ.
  const time = String(item?.label || '').trim();
  const place = gridDisplayName(item);
  const address = cleanGridAddress(item?.metaPrimary) || String(item?.metaPrimary || '').trim();
  const placeHtml = place ? `<strong class="itl-day-place">${escapeHtml(place)}</strong>` : '';
  return `
    <div class="itl-day-row ${escapeHtml(imageSourceClass(item))}">
      <div class="itl-day-thumb">
        ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
      </div>
      <div class="itl-day-track"><span class="itl-day-dot" aria-hidden="true"></span></div>
      <div class="itl-day-copy">
        ${time ? `<p class="itl-day-time">${escapeHtml(time)}</p>` : ''}
        ${placeHtml}
        ${address ? `<p class="itl-day-address"><span class="itl-day-pin">📍</span>${escapeHtml(address)}</p>` : ''}
      </div>
    </div>
  `;
}

function computeItineraryTimelineMetrics(itemCount) {
  const rows = Math.max(1, itemCount || 8);
  // 8 mốc ref — hàng cao hơn, dễ đọc và chọn địa điểm.
  return {
    rows,
    rowH: 54,
    thumb: 48,
    lineSize: 10.5,
    addrSize: 9,
    feedW: 318,
  };
}

export function renderItineraryTimelineDay(page, index, listId) {
  const dayTitle = String(page.chipText || page.title || 'Ngày 01').trim();
  const backgroundImage = page.backgroundImage || page.items?.[0]?.imageUrl || '';
  const items = page.items || [];
  const metrics = computeItineraryTimelineMetrics(items.length);
  const feedStyle = [
    `--itl-row-count:${metrics.rows}`,
    `--itl-row-h:${metrics.rowH}px`,
    `--itl-thumb:${metrics.thumb}px`,
    `--itl-line-size:${metrics.lineSize}px`,
    `--itl-addr-size:${metrics.addrSize}px`,
    `--itl-feed-w:${metrics.feedW}px`,
  ].join(';');
  const rows = items.map((item) => renderItineraryTimelineRow(item)).join('');
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'itinerary-timeline-day'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
      <div class="itl-day-bg">${backgroundImage ? renderPreviewImage(backgroundImage, dayTitle) : ''}</div>
      <div class="itl-day-card">
        <header class="itl-day-head">
          <span class="itl-day-head-spark">— ✦ —</span>
          <h2 class="itl-day-head-title" lang="vi">${escapeHtml(dayTitle)}</h2>
        </header>
        <div class="itl-day-feed" style="${feedStyle}">${rows}</div>
      </div>
    </article>
  `;
}

export function journeyGrid8Intro(page) {
  return polishShortVietnameseCopy(page?.subtitle || '');
}

/** @param {import('../types').PageItem[]} items @returns {string} */
export function renderItineraryItems(items) {
  return items.map((item) => {
    const displayName = gridDisplayName(item);
    const secondary = String(item?.metaSecondary || '').replace(/\s+/g, ' ').trim();
    const hoursMatch = secondary.match(/(?:Khung giờ|Open|Hoạt động):\s*([^·]+)/i);
    const hours = hoursMatch?.[1]?.trim() || '';
    return `
      <div class="item-row itinerary-row">
        <div class="thumb-block itinerary-thumb ${item.imageSource || (item.imageMapped ? 'manual' : 'fallback')}">
          ${renderPreviewImage(item.imageUrl, displayName, '', item.candidateImageUrls)}
        </div>
        <div class="item-copy itinerary-copy">
          ${hours ? `<div class="itinerary-hours">Khung giờ hoạt động: ${escapeHtml(hours)}</div>` : ''}
          <div class="itinerary-name story-image-title">${escapeHtml(displayName)}</div>
          <p class="item-meta story-image-meta itinerary-detail">${escapeHtml(item.metaPrimary)}</p>
        </div>
      </div>
    `;
  }).join('');
}

/** @param {import('../types').PageItem[]} items @returns {string} */
export function renderJourney4N3DItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '';
  }

  return `
    <div class="journey-timeline">
      ${items.map((item) => `
        <article class="journey-time-row ${escapeHtml(item.imageSource || (item.imageMapped ? 'manual' : 'fallback'))}">
          <div class="journey-stop-thumb">
            ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
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
