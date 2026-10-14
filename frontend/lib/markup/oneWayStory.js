// Mẫu One-way story: bìa, trang đường/dốc và ảnh.
import { escapeHtml, sanitizeFilePart } from '../utils.js';
import { renderPreviewImage, storyPageClass } from './shared.js';

function renderOneWayStoryImage(src, alt, candidates = []) {
  return `<div class="one-way-story-bg">${renderPreviewImage(src, alt, '', candidates)}</div><div class="one-way-story-shade" aria-hidden="true"></div>`;
}

export function renderOneWayStoryCover(page, index, listId, coverTitle, backgroundImage) {
  const length = String(coverTitle || '').length;
  const fitClass = length > 80 ? 'is-long' : length > 60 ? 'is-medium' : '';
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'one-way-story-page one-way-story-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      ${renderOneWayStoryImage(backgroundImage, coverTitle, page.coverImages || [])}
      ${coverTitle ? `<div class="one-way-story-cover-copy ${fitClass}"><h1>${escapeHtml(coverTitle || '')}</h1></div>` : ''}
    </article>
  `;
}

function oneWayRoadSubtitleMarkup(subtitle) {
  const blocks = String(subtitle || '').split(/\n{2,}/).map((value) => value.trim()).filter(Boolean);
  const intro = blocks[0] || '';
  const roads = blocks.slice(1).join('\n').split(/\n+/).map((value) => value.trim()).filter(Boolean);
  return `
    ${intro ? `<p class="one-way-story-road-intro">${escapeHtml(intro)}</p>` : ''}
    ${roads.length ? `<div class="one-way-story-road-list">${roads.map((road) => `<span>${escapeHtml(road)}</span>`).join('')}</div>` : ''}
  `;
}

export function renderOneWayStoryRoad(page, index, listId) {
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'one-way-story-page one-way-story-road'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-duong-mot-chieu.png">
      ${renderOneWayStoryImage(page.backgroundImage, page.title)}
      <section class="one-way-story-road-copy">
        ${page.title ? `<p class="one-way-story-road-lead">${escapeHtml(page.title)}</p>` : ''}
        ${oneWayRoadSubtitleMarkup(page.subtitle)}
      </section>
    </article>
  `;
}

export function renderOneWayStorySlope(page, index, listId) {
  const item = page.items?.[0] || {};
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'one-way-story-page one-way-story-slope'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-duong-doc.png">
      ${renderOneWayStoryImage(page.backgroundImage || item.imageUrl, page.title, item.candidateImageUrls)}
      <section class="one-way-story-slope-copy">
        ${page.title ? `<p>${escapeHtml(page.title)}</p>` : ''}
        ${page.subtitle ? `<p>${escapeHtml(page.subtitle)}</p>` : ''}
      </section>
    </article>
  `;
}

export function renderOneWayStoryPhoto(page, index, listId) {
  const item = page.items?.[0] || {};
  const locationName = String(item.name || '').trim();
  const isFreeCheckin = String(item.sourceSectionKey || '').trim() === 'check_in';
  const locationAddress = isFreeCheckin ? '' : String(item.metaPrimary || '').trim();
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'one-way-story-page one-way-story-photo'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
      ${renderOneWayStoryImage(page.backgroundImage || item.imageUrl, item.name || page.chipText, item.candidateImageUrls)}
      ${locationName ? `
        <div class="one-way-story-location">
          <strong>${escapeHtml(locationName)}</strong>
          ${locationAddress ? `<span>${escapeHtml(locationAddress)}</span>` : ''}
        </div>
      ` : ''}
    </article>
  `;
}
