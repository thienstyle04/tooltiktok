// Mẫu Spotlight (guide, v2–v6, diary, maps, đối tác), Carousel Mẫu 1 và Summary note.
import { escapeHtml, sanitizeFilePart } from '../utils.js';
import { photoDisplayUrl } from '../photoPresets.mjs';
import { coverBackgroundImage, firstPortablePageImage, gridPriceMetaFromSecondary, imageSourceClass, isServiceListPage, isStayListPage, pickUniqueCoverGridImages, renderPhotomodePin, renderPreviewImage, spotlightV2CoverImagePool, storyPageClass } from './shared.js';

export function isSpotlightLayout(page) {
  return page.layoutVariant === 'spotlight';
}

export function isSpotlightPartnerCover(page) {
  return page.layoutVariant === 'spotlight-partner' && page.type === 'cover';
}

function spotlightPositionClass(page, index, item) {
  const variants = [
    'spotlight-pos-lower-left',
    'spotlight-pos-upper-right',
    'spotlight-pos-center-left',
    'spotlight-pos-lower-right',
    'spotlight-pos-upper-left',
    'spotlight-pos-center-right',
  ];
  const raw = `${page?.title || ''}|${item?.rawName || item?.name || ''}|${item?.metaPrimary || ''}|${index}`;
  let hash = 0;
  for (let charIndex = 0; charIndex < raw.length; charIndex += 1) {
    hash = (hash * 33 + raw.charCodeAt(charIndex)) >>> 0;
  }
  return variants[hash % variants.length];
}

function spotlightV2ListHeading(page) {
  if (isStayListPage(page)) return 'Homestay cần lưu';
  if (isServiceListPage(page)) return 'Dịch vụ cần lưu';
  return String(page?.title || page?.chipText || '').trim();
}

function spotlightV2CoverGridImages(page, backgroundImage, listId = '', coverImageUrls = []) {
  const fromPage = Array.isArray(page?.coverImages) ? page.coverImages.filter(Boolean) : [];
  const uniqueFromPage = [...new Set(fromPage)];
  if (uniqueFromPage.length >= 4) return uniqueFromPage.slice(0, 4);

  const pool = (coverImageUrls.length > 0 ? coverImageUrls : spotlightV2CoverImagePool).filter(Boolean);
  const seed = `${listId || page?.title || 'spotlight-v2-cover'}|cover-grid`;
  const fromPool = pickUniqueCoverGridImages(pool, seed, 4);
  const merged = [...new Set([...uniqueFromPage, ...fromPool])];
  if (merged.length >= 4) return merged.slice(0, 4);
  if (merged.length > 0) return merged;

  return backgroundImage ? [backgroundImage] : [];
}

function formatSpotlightV2CoverSubtitle(subtitle) {
  const clean = String(subtitle || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.startsWith('/') && clean.endsWith('/')) return clean;
  return `/${clean.replace(/^\/+|\/+$/g, '')}/`;
}

export function renderSpotlightV2Cover(page, index, listId, coverTitle, coverSubtitle, backgroundImage, options = {}) {
  if (page?.layoutVariant === 'spotlight-v3') {
    return renderSpotlightV3Cover(page, index, listId, coverTitle, backgroundImage, options);
  }
  const partnerClass = options.partner ? ' spotlight-partner-v2-cover' : '';
  const coverImageUrls = options.coverImageUrls || [];
  let tiles = spotlightV2CoverGridImages(page, backgroundImage, listId, coverImageUrls);
  while (tiles.length < 4) tiles.push('');
  tiles = tiles.slice(0, 4);
  const subtitle = options.partner ? formatSpotlightV2CoverSubtitle(coverSubtitle) : '';
  const placement = String(page?.titlePlacement || 'center').trim() || 'center';
  const placementClass = `spotlight-v2-place-${placement}`;
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-v2-cover', `${partnerClass} ${placementClass}`.trim()))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="spotlight-v2-cover-grid">
        ${tiles.map((url, tileIndex) => `
          <div class="spotlight-v2-cover-cell">
            ${url ? renderPreviewImage(url, `${coverTitle || 'cover'} ${tileIndex + 1}`) : ''}
          </div>
        `).join('')}
      </div>
      <div class="spotlight-v2-cover-dim" aria-hidden="true"></div>
      <div class="spotlight-v2-cover-center">
        ${options.partner ? '<div class="spotlight-v2-cover-partner-script">dalat.</div>' : ''}
        ${!options.partner ? '<div class="spotlight-v2-cover-ornament" aria-hidden="true">✦ · 📷 · ✦</div>' : ''}
        ${coverTitle ? `<h1 class="spotlight-v2-cover-title">${escapeHtml(coverTitle)}</h1>` : ''}
        ${subtitle ? `<p class="spotlight-v2-cover-caption">${escapeHtml(subtitle)}</p>` : ''}
      </div>
    </article>
  `;
}

function spotlightV3CoverImage(page, backgroundImage) {
  const fromPage = Array.isArray(page?.coverImages) ? page.coverImages.filter(Boolean) : [];
  return fromPage[0] || backgroundImage || page?.backgroundImage || '';
}

function spotlightV3CoverPlacement(page, listId = '') {
  const allowed = [
    'top-left', 'top-center', 'top-right',
    'mid-left', 'mid-right',
    'bottom-left', 'bottom-center', 'bottom-right',
  ];
  const raw = String(page?.titlePlacement || '').trim();
  if (page?.spotlightDesignRevision === 1 && raw === 'center') return 'center';
  if (allowed.includes(raw)) return raw;
  // Fallback random theo seed list — không mặc định giữa.
  const seed = `${listId || page?.title || 'v3'}|place`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 33 + seed.charCodeAt(i)) >>> 0;
  return allowed[hash % allowed.length];
}

function renderSpotlightV3Cover(page, index, listId, coverTitle, backgroundImage, options = {}) {
  const imageUrl = spotlightV3CoverImage(page, backgroundImage);
  const placement = spotlightV3CoverPlacement(page, listId);
  const placementClass = `spotlight-v2-place-${placement}`;
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-v2-cover spotlight-v3-cover', placementClass))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="spotlight-v3-cover-bg">
        ${imageUrl ? renderPreviewImage(imageUrl, coverTitle || 'cover') : ''}
      </div>
      <div class="spotlight-v2-cover-center">
        ${coverTitle ? `<h1 class="spotlight-v2-cover-title">${escapeHtml(coverTitle)}</h1>` : ''}
      </div>
    </article>
  `;
}

export function renderCarouselMau1Cover(page, index, listId, coverTitle, backgroundImage) {
  const imageUrl = spotlightV3CoverImage(page, backgroundImage);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'carousel-mau-1-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="carousel-mau-1-bg">
        ${imageUrl ? renderPreviewImage(imageUrl, coverTitle || 'cover') : ''}
      </div>
      <div class="carousel-mau-1-cover-gradient" aria-hidden="true"></div>
      <div class="carousel-mau-1-cover-copy">
        <h1>${escapeHtml(coverTitle || '')}</h1>
      </div>
    </article>
  `;
}

export function renderCarouselMau1Page(page, index, listId, list) {
  const item = page.items?.[0] || {};
  const imageUrl = item.imageUrl || page.backgroundImage || coverBackgroundImage(page, list);
  const name = item.rawName || item.name || page.title || '';
  const address = String(item.metaPrimary || '').trim();
  const line = address ? `${name} – ${address}` : name;
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'carousel-mau-1-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(name || page.chipText || 'dia-diem')}.png">
      <div class="carousel-mau-1-bg">
        ${renderPreviewImage(imageUrl, name || page.title)}
      </div>
      <div class="carousel-mau-1-page-gradient" aria-hidden="true"></div>
      <div class="carousel-mau-1-place-line"><span aria-hidden="true">📍</span>${escapeHtml(line)}</div>
    </article>
  `;
}

export function renderSpotlightV2Page(page, index, listId, list, options = {}) {
  const item = page.items?.[0] || {};
  const backgroundImage = item.imageUrl || page.backgroundImage || coverBackgroundImage(page, list);
  const titleText = item.rawName || item.name || page.title || '';
  const address = spotlightV2AddressLine(item);
  const hours = spotlightV2HoursLine(item);
  const price = page.spotlightDesignRevision === 1 ? spotlightV2PriceLine(item).replace(/^Giá:\s*/i, '') : spotlightV2PriceLine(item);
  const positionClass = spotlightPositionClass(page, index, item);
  const partnerClass = options.partner ? ' spotlight-partner-v2-page' : '';
  const v3Class = page?.layoutVariant === 'spotlight-v3' ? ' spotlight-v3-page' : '';
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-v2-page', `${positionClass} ${partnerClass}${v3Class}`.trim()))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText || item.name || 'spotlight')}.png">
      <div class="spotlight-v2-bg">
        ${renderPreviewImage(backgroundImage, item.name || page.title)}
      </div>
      <div class="spotlight-v2-shade"></div>
      <div class="spotlight-v2-copy">
        <h2 class="spotlight-v2-name">
          <span class="spotlight-pin">${renderPhotomodePin()}</span>
          <span class="spotlight-v2-name-text">${escapeHtml(titleText)}</span>
        </h2>
        ${address ? `<p class="spotlight-v2-address">${escapeHtml(address)}</p>` : ''}
        ${hours ? `<p class="spotlight-v2-hours">${escapeHtml(hours)}</p>` : ''}
        ${price ? `<p class="spotlight-v2-price">${escapeHtml(price)}</p>` : ''}
      </div>
    </article>
  `;
}

export function renderSpotlightPartnerV2Page(page, index, listId, list) {
  return renderSpotlightV2Page(page, index, listId, list, { partner: true });
}

export function renderSpotlightV4Cover(page, index, listId, coverTitle, backgroundImage) {
  const imageUrl = spotlightV3CoverImage(page, backgroundImage);
  const placement = spotlightV3CoverPlacement(page, listId);
  const placementClass = `spotlight-v2-place-${placement}`;
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-v4-cover', placementClass))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="spotlight-v4-cover-bg">
        ${imageUrl ? renderPreviewImage(imageUrl, coverTitle || 'cover') : ''}
      </div>
      <div class="spotlight-v4-cover-shade" aria-hidden="true"></div>
      <div class="spotlight-v4-cover-copy">
        ${coverTitle ? `<h1 class="spotlight-v4-cover-title">${escapeHtml(coverTitle)}</h1>` : ''}
      </div>
    </article>
  `;
}

export function renderSpotlightV4ImagePage(page, index, listId) {
  const imageUrl = page.backgroundImage || '';
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-v4-image'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-image.png">
      <div class="spotlight-v4-image-bg">
        ${imageUrl ? renderPreviewImage(imageUrl, 'Hình nền') : ''}
      </div>
    </article>
  `;
}

export function renderSpotlightV4VenuePage(page, index, listId, list) {
  const item = page.items?.[0] || {};
  const imageUrl = item.imageUrl || page.backgroundImage || coverBackgroundImage(page, list);
  // page.title is the persisted manual override for V4 venue pages. Keep an
  // explicit empty title empty instead of falling back to the sheet name.
  const name = page.title !== undefined ? String(page.title || '').trim() : (item.rawName || item.name || '');
  const address = String(item.metaPrimary || '').trim();
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-v4-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(name || 'dia-diem')}.png">
      <div class="spotlight-v4-page-bg">
        ${imageUrl ? renderPreviewImage(imageUrl, name || 'Địa điểm') : ''}
      </div>
      <div class="spotlight-v4-page-shade" aria-hidden="true"></div>
      <div class="spotlight-v4-page-copy">
        ${name ? `<h2 class="spotlight-v4-page-name">${escapeHtml(name)}</h2>` : ''}
        ${address ? `<p class="spotlight-v4-page-address">${escapeHtml(address)}</p>` : ''}
      </div>
    </article>
  `;
}
export function renderSummaryNotePage(page, index, listId) {
  const title = page.title !== undefined ? String(page.title || '').trim() : '';
  const rows = (page.items || []).slice(0, 8).map((item) => {
    const name = String(item?.rawName || item?.name || '').trim();
    const address = String(item?.metaPrimary || '').trim();
    const text = address ? `${name} - ${address}` : name;
    return `<div class="summary-note-row"><span class="summary-note-pin" aria-hidden="true">📍</span><span class="summary-note-row-text">${escapeHtml(text)}</span></div>`;
  }).join('');
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'summary-note-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="01-summary-note.png">
      <div class="summary-note-toolbar" aria-hidden="true">
        <div class="summary-note-back"><span class="summary-note-back-icon">‹</span><span>Tất cả iCloud</span></div>
        <div class="summary-note-actions"><span class="summary-note-share">⇧</span><span class="summary-note-more">•••</span></div>
      </div>
      <div class="summary-note-date">10:23 ngày 3 tháng 9, 2026</div>
      <div class="summary-note-content">
        ${title ? `<h1 class="summary-note-title">${escapeHtml(title)}</h1>` : ''}
        <div class="summary-note-list">${rows}</div>
      </div>
    </article>
  `;
}
function spotlightColorAttrs(page) {
  return page.photoPreset === 'iphone-color-edit-v1'
    ? ' data-export-strict="true" data-photo-preset="iphone-color-edit-v1"' : '';
}

function renderSpotlightPhoto(page, source, alt) {
  if (!source) return '';
  if (!page.photoPreset) return renderPreviewImage(source, alt);
  const url = photoDisplayUrl(source, page.photoPreset);
  return renderPreviewImage(url, alt, 'color-edit-photo')
    .replace('<img', `<img data-photo-source="${escapeHtml(source)}"`);
}

export function renderSpotlightV6Cover(page, index, listId, coverTitle, backgroundImage) {
  const imageUrl = page.backgroundImage || backgroundImage || '';
  const hookTitle = page.title !== undefined ? String(page.title) : String(coverTitle || '');
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-v6-cover'))}"${spotlightColorAttrs(page)} data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="spotlight-v6-bg">${renderSpotlightPhoto(page, imageUrl, hookTitle || 'cover')}</div>
      ${hookTitle ? `<h1 class="spotlight-v6-cover-title">${escapeHtml(hookTitle)}</h1>` : ''}
    </article>
  `;
}

export function renderSpotlightV6ImagePage(page, index, listId) {
  const imageUrl = page.backgroundImage || '';
  const title = String(page.title || '').trim();
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-v6-image'))}"${spotlightColorAttrs(page)} data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-image.png">
      <div class="spotlight-v6-bg">${renderSpotlightPhoto(page, imageUrl, 'Hình nền')}</div>
      ${title ? `<h2 class="spotlight-v6-image-title">${escapeHtml(title)}</h2>` : ''}
    </article>
  `;
}

export function renderSpotlightV6VenuePage(page, index, listId, list) {
  const item = page.items?.[0] || {};
  const imageUrl = item.imageUrl || page.backgroundImage || coverBackgroundImage(page, list);
  const name = page.title !== undefined ? String(page.title || '').trim() : (item.rawName || item.name || '');
  const address = String(item.metaPrimary || '').trim();
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-v6-page'))}"${spotlightColorAttrs(page)} data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(name || 'dia-diem')}.png">
      <div class="spotlight-v6-bg">${renderSpotlightPhoto(page, imageUrl, name || 'Địa điểm')}</div>
      <div class="spotlight-v6-page-copy">
        ${name ? `<h2 class="spotlight-v6-page-name">${escapeHtml(name)}</h2>` : ''}
        ${address ? `<p class="spotlight-v6-page-address">${escapeHtml(address)}</p>` : ''}
      </div>
    </article>
  `;
}

export function renderSpotlightV6MapPage(page, index, listId) {
  const item = page.items?.[0] || {};
  // backgroundImage là snapshot ảnh Maps riêng của trang. Không ưu tiên
  // item.imageUrl vì các bản cũ từng refresh trường này về ảnh Link_drive.
  const imageUrl = page.backgroundImage || item.imageUrl || '';
  const name = String(item.rawName || item.name || 'dia-diem').trim();
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-v6-map-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-map-${sanitizeFilePart(name)}.png">
      <div class="spotlight-v6-map-bg">${imageUrl ? renderPreviewImage(imageUrl, `Google Maps ${name}`) : ''}</div>
    </article>
  `;
}

export function renderSpotlightDiaryPage(page, index, listId) {
  const item = page.items?.[0];
  const image = page.backgroundImage || item?.imageUrl || '';
  const placement = ['top-center', 'center', 'bottom-center'].includes(page.titlePlacement) ? page.titlePlacement : 'center';
  const text = [page.title, item?.name, item?.metaPrimary].filter(value => String(value ?? '').trim());
  const fontSize = Math.min(13, Math.max(9, Number(page.diaryFontSize) || 13));
  return `<article class="${escapeHtml(storyPageClass(listId, 'spotlight-v6-diary-page diary-' + placement))}" data-diary-font-size="${fontSize}" style="--diary-font:${fontSize}px" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(item?.name || (index === 0 ? 'cover' : 'image'))}.png">
    <div class="diary-bg">${image ? renderPreviewImage(image, item?.name || 'Đà Lạt') : ''}</div>
    <div class="diary-safe"><div class="diary-copy">${text.map(line => `<p>${escapeHtml(line)}</p>`).join('')}</div></div>
  </article>`;
}

export function renderSpotlightV6MapPlace(page, index, listId) {
  const item = page.items?.[0] || {};
  // Giữ cùng nguyên tắc snapshot cho ảnh thật của nửa sau mỗi cặp.
  const imageUrl = page.backgroundImage || item.imageUrl || '';
  const name = page.title !== undefined ? String(page.title || '').trim() : String(item.rawName || item.name || '').trim();
  const address = String(item.metaPrimary || '').trim();
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-v6-map-place'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(name || 'dia-diem')}.png">
      <div class="spotlight-v6-map-bg">${imageUrl ? renderPreviewImage(imageUrl, name || 'Địa điểm') : ''}</div>
      <div class="spotlight-v6-map-copy">
        ${name ? `<h2 class="spotlight-v6-map-name">${escapeHtml(name)}</h2>` : ''}
        ${address ? `<p class="spotlight-v6-map-address">${escapeHtml(address)}</p>` : ''}
      </div>
    </article>
  `;
}
export function renderSpotlightV5Cover(page, index, listId, coverTitle, backgroundImage) {
  const imageUrl = page.backgroundImage || backgroundImage || '';
  const placement = page.titlePlacement || 'bottom-right';
  const hookTitle = page.title !== undefined ? String(page.title) : String(coverTitle || '');
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-v5-cover spotlight-v5-position-' + placement))}"${spotlightColorAttrs(page)} data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="spotlight-v5-bg">${renderSpotlightPhoto(page, imageUrl, hookTitle || 'cover')}</div>
      <div class="spotlight-v5-shade" aria-hidden="true"></div>
      <h1 class="spotlight-v5-cover-hook">${escapeHtml(hookTitle)}</h1>
    </article>
  `;
}

export function renderSpotlightV5PlaylistPage(page, index, listId) {
  const lines = Array.isArray(page.playlistLines) ? page.playlistLines.filter(Boolean) : [];
  const placement = page.titlePlacement || 'center';
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-v5-playlist spotlight-v5-position-' + placement))}"${spotlightColorAttrs(page)} data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-playlist.png">
      <div class="spotlight-v5-bg">${renderSpotlightPhoto(page, page.backgroundImage, 'Playlist Đà Lạt')}</div>
      <div class="spotlight-v5-shade" aria-hidden="true"></div>
      <div class="spotlight-v5-playlist-copy">
        ${lines.map((line) => `<div class="spotlight-v5-playlist-line">• ${escapeHtml(line)}</div>`).join('')}
      </div>
    </article>
  `;
}

export function renderSpotlightV5PlacePage(page, index, listId) {
  const item = page.items?.[0] || {};
  const imageUrl = page.backgroundImage || item.imageUrl || '';
  const name = page.title !== undefined ? String(page.title || '').trim() : String(item.rawName || item.name || '').trim();
  const address = String(item.metaPrimary || '').trim();
  const placement = page.titlePlacement || 'bottom-right';

  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-v5-place spotlight-v5-position-' + placement))}"${spotlightColorAttrs(page)} data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(name || 'dia-diem')}.png">
      <div class="spotlight-v5-bg">${renderSpotlightPhoto(page, imageUrl, name || 'Địa điểm')}</div>
      <div class="spotlight-v5-shade" aria-hidden="true"></div>
      <div class="spotlight-v5-place-copy">
        ${name ? `<div class="spotlight-v5-place-name">${escapeHtml(name)}</div>` : ''}
        ${address ? `<div class="spotlight-v5-place-address">${escapeHtml(address)}</div>` : ''}
      </div>
    </article>
  `;
}

function renderSpotlightMetaLine(value, className = '') {
  const cleanValue = String(value || '').replace(/\s+/g, ' ').trim();
  if (!cleanValue) return '';

  return `
    <div class="spotlight-meta ${escapeHtml(className)}">
      <span class="spotlight-pin">${renderPhotomodePin()}</span>
      <span>${escapeHtml(cleanValue)}</span>
    </div>
  `;
}

function spotlightV2AddressLine(item) {
  return String(item?.metaPrimary || '').replace(/\s+/g, ' ').trim();
}

function spotlightV2PriceLine(item) {
  const secondary = String(item?.metaSecondary || '').replace(/\s+/g, ' ').trim();
  if (!secondary) return '';
  const match = secondary.match(/Giá:\s*([^·]+)/i);
  if (!match) return '';
  const price = String(match[1] || '').trim();
  return price ? `Giá: ${price}` : '';
}

function spotlightV2HoursLine(item) {
  const secondary = String(item?.metaSecondary || '').replace(/\s+/g, ' ').trim();
  if (!secondary) return '';

  const labeledHours = secondary.match(/^(Khung giờ|Open|Hoạt động):\s*(.+)$/i);
  if (labeledHours) {
    const label = labeledHours[1].toLowerCase() === 'khung giờ' ? 'Open' : labeledHours[1];
    const hours = labeledHours[2].split('·')[0].trim();
    return hours ? `${label}: ${hours}` : '';
  }

  const embeddedHours = secondary.match(/(?:Khung giờ|Open|Hoạt động):\s*([^·]+)/i);
  if (embeddedHours) {
    const token = embeddedHours[0].trim();
    if (/^open:/i.test(token) || /^hoạt động:/i.test(token)) return token;
    const hours = embeddedHours[1].trim();
    return hours ? `Open: ${hours}` : '';
  }

  if (/(giá|sđt|liên hệ):/i.test(secondary)) return '';
  const fallback = secondary.split('·')[0].trim();
  return fallback ? `Open: ${fallback}` : '';
}

function spotlightTitleFitClass(value) {
  const length = String(value || '').trim().length;
  if (length >= 28) return 'spotlight-title-fit-xs';
  if (length >= 23) return 'spotlight-title-fit-sm';
  if (length >= 18) return 'spotlight-title-fit-md';
  return '';
}

export function renderSpotlightPage(page, index, listId, list, pageSubtitle) {
  const item = page.items?.[0] || {};
  const backgroundImage = item.imageUrl || page.backgroundImage || coverBackgroundImage(page, list);
  const positionClass = spotlightPositionClass(page, index, item);
  const titleText = item.rawName || item.name || page.title || '';
  const titleFitClass = spotlightTitleFitClass(titleText);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-page', positionClass))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText || item.name || 'spotlight')}.png">
      <div class="spotlight-bg">
        ${renderPreviewImage(backgroundImage, item.name || page.title)}
      </div>
      <div class="spotlight-shade"></div>
      <div class="spotlight-copy">
        <h2 class="spotlight-title story-image-title ${escapeHtml(titleFitClass)}">${escapeHtml(titleText)}</h2>
        <div class="spotlight-info">
          ${renderSpotlightMetaLine(item.metaPrimary)}
        </div>
      </div>
    </article>
  `;
}

export function renderSpotlightPartnerPage(page, index, listId, list) {
  const item = page.items?.[0] || {};
  const backgroundImage = page.backgroundImage || item.imageUrl || coverBackgroundImage(page, list);
  const exportLabel = item.rawName || item.name || page.title || 'partner';
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-page spotlight-partner-page spotlight-partner-photo-only'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(exportLabel)}.png">
      <div class="spotlight-bg">
        ${renderPreviewImage(backgroundImage, item.rawName || page.title)}
      </div>
      <div class="spotlight-shade"></div>
    </article>
  `;
}

function renderSpotlightListItems(items, options = {}) {
  const showLabels = options.showLabels !== false;
  const showSecondary = options.showSecondary !== false;
  return (items || []).map((item) => {
    const isHomestay = item.sourceSectionKey === 'homestay';
    // Lọc "Khung giờ" ra khỏi dòng phụ giống zigzag/grid, chỉ giữ Giá/Liên hệ.
    const metaSecondary = showSecondary
      ? (gridPriceMetaFromSecondary(item.metaSecondary) || (isHomestay && item.price ? `Giá: ${item.price}` : ''))
      : '';
    return `
    <article class="spotlight-list-row ${escapeHtml(imageSourceClass(item))}">
      <div class="spotlight-list-thumb">
        ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
      </div>
      <div class="spotlight-list-copy">
        ${showLabels && item.label ? `<span class="spotlight-list-label">${escapeHtml(item.label)}</span>` : ''}
        <strong class="story-image-title">${escapeHtml(item.rawName || item.name || '')}</strong>
        ${renderSpotlightMetaLine(item.metaPrimary)}
        ${renderSpotlightMetaLine(metaSecondary, 'secondary')}
      </div>
    </article>
  `;
  }).join('');
}

export function renderSpotlightV2ListPage(page, index, listId, list, pageSubtitle) {
  const backgroundImage = page.backgroundImage || firstPortablePageImage(page) || coverBackgroundImage(page, list);
  const showItemLabels = !isStayListPage(page);
  const heading = spotlightV2ListHeading(page);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-v2-list-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText || page.title || 'list')}.png">
      <div class="spotlight-v2-bg">
        ${renderPreviewImage(backgroundImage, heading)}
      </div>
      <div class="spotlight-v2-list-shade"></div>
      <div class="spotlight-v2-list-panel">
        <div class="spotlight-v2-list-heading">
          <h2>${escapeHtml(heading)}</h2>
        </div>
        <div class="spotlight-v2-list-stack">
          ${renderSpotlightListItems(page.items, { showLabels: showItemLabels, showSecondary: false })}
        </div>
      </div>
    </article>
  `;
}

export function renderSpotlightListPage(page, index, listId, list, pageSubtitle) {
  const backgroundImage = page.backgroundImage || firstPortablePageImage(page) || coverBackgroundImage(page, list);
  const showItemLabels = !isStayListPage(page);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-list-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText || page.title || 'list')}.png">
      <div class="spotlight-bg">
        ${renderPreviewImage(backgroundImage, page.title)}
      </div>
      <div class="spotlight-list-shade"></div>
      <div class="spotlight-list-panel">
        <div class="spotlight-list-heading">
          ${page.spotlightDesignRevision === 1 && /dịch vụ/i.test(page.chipText || page.title || '') ? '<h2>Dịch vụ cần lưu</h2>' : `<span>${escapeHtml(page.chipText || '')}</span><h2>${escapeHtml(page.title || '')}</h2>`}
        </div>
        <div class="spotlight-list-stack">
          ${renderSpotlightListItems(page.items, { showLabels: showItemLabels })}
        </div>
      </div>
    </article>
  `;
}

export function renderSpotlightPartnerInfoPage(page, index, listId, list) {
  const backgroundImage = page.backgroundImage || firstPortablePageImage(page) || coverBackgroundImage(page, list);
  const itemRows = (page.items || []).map((item) => `
    <article class="spotlight-partner-info-row">
      <span>${escapeHtml(item.label || '')}</span>
      <strong>${escapeHtml(item.metaPrimary || item.name || '')}</strong>
    </article>
  `).join('');

  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-list-page spotlight-partner-info-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-thong-tin.png">
      <div class="spotlight-bg">
        ${renderPreviewImage(backgroundImage, page.title)}
      </div>
      <div class="spotlight-list-shade"></div>
      <div class="spotlight-partner-info-panel">
        <div class="spotlight-partner-info-stack">
          ${itemRows}
        </div>
        <div class="spotlight-partner-info-cta">Lưu lại khi cần cho chuyến Đà Lạt tới.</div>
      </div>
    </article>
  `;
}

export function renderSpotlightPartnerV2InfoPage(page, index, listId, list) {
  const backgroundImage = page.backgroundImage || firstPortablePageImage(page) || coverBackgroundImage(page, list);
  const itemRows = (page.items || []).map((item) => `
    <article class="spotlight-partner-v2-info-row">
      <span>${escapeHtml(item.label || '')}</span>
      <strong>${escapeHtml(item.metaPrimary || item.name || '')}</strong>
    </article>
  `).join('');

  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-partner-v2-info-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-thong-tin.png">
      <div class="spotlight-v2-bg">
        ${renderPreviewImage(backgroundImage, page.title)}
      </div>
      <div class="spotlight-v2-shade"></div>
      <div class="spotlight-v2-info-band">
        ${page.title ? `<h2 class="spotlight-v2-info-title">${escapeHtml(page.title)}</h2>` : ''}
        <div class="spotlight-partner-v2-info-stack">
          ${itemRows}
        </div>
        <p class="spotlight-v2-cta">Lưu để đặt / inbox khi cần</p>
      </div>
    </article>
  `;
}
