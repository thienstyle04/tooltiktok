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

export function pageCounter(index, total) {
  return `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
}

function isGridLayout(page) {
  return page.layoutVariant === 'grid-6' || page.layoutVariant === 'grid-8' || page.layoutVariant === 'grid-4';
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

export function renderCoverPage(page, index, total, listId, hashtags = []) {
  if (page.layoutVariant === 'grid-8') {
    return `
      <article class="story-page grid8-cover-page" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
        <div class="grid8-cover-photo">
          <img src="${escapeHtml(page.backgroundImage)}" alt="${escapeHtml(page.title)}">
        </div>
        <div class="grid8-cover-shade"></div>
        <div class="grid8-cover-copy">
          <div class="grid8-cover-kicker">8 lựa chọn / 1 trang</div>
          <h1 class="grid8-cover-title">${escapeHtml(page.title)}</h1>
          <p class="grid8-cover-subtitle">${escapeHtml(page.subtitle)}</p>
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
      <article class="story-page grid6-cover${gridVariantClass}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
        <div class="grid6-cover-bg">
          <img src="${escapeHtml(page.backgroundImage)}" alt="${escapeHtml(page.title)}">
        </div>
        <div class="grid6-cover-overlay">
           <div class="grid6-cover-header">ĐÀ LẠT</div>
           <h1 class="grid6-cover-title">${escapeHtml(page.title)}</h1>
           <div class="grid6-cover-subtitle">${escapeHtml(page.subtitle)}</div>
        </div>
      </article>
    `;
  }

  if (page.layoutVariant === 'journey-4n3d') {
    return `
      <article class="story-page journey-cover" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
        <div class="journey-cover-photo">
          <img src="${escapeHtml(page.backgroundImage)}" alt="${escapeHtml(page.title)}">
        </div>
        <div class="journey-cover-panel">
          <div class="journey-cover-kicker">LỊCH TRÌNH 4N3Đ</div>
          <h1 class="journey-cover-title">${escapeHtml(page.title)}</h1>
          <p class="journey-cover-subtitle">${escapeHtml(page.subtitle)}</p>
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
      <article class="story-page photomode photomode-cover" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
        <div class="photomode-cover-bg">
          <img src="${escapeHtml(page.backgroundImage)}" alt="${escapeHtml(page.title)}">
        </div>
        <div class="photomode-cover-copy">
          <h3 class="photomode-cover-title">${escapeHtml(page.title)}</h3>
          <p class="photomode-cover-subtitle">${escapeHtml(page.subtitle)}</p>
        </div>
      </article>
    `;
  }

  const hashtagsHtml = renderInlineHashtags(hashtags);
  const hashtagClass = Array.isArray(hashtags) && hashtags.length > 0 ? ' has-inline-hashtags' : '';
  return `
    <article class="story-page${hashtagClass}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="page-cover">
        <img src="${escapeHtml(page.backgroundImage)}" alt="${escapeHtml(page.title)}">
      </div>
      <div class="cover-copy">
        <div class="cover-script">Da Lat</div>
        <h3 class="cover-title">${escapeHtml(page.title)}</h3>
        <p class="cover-subtitle">${escapeHtml(page.subtitle)}</p>
      </div>
    </article>
  `;
}

export function renderListItems(items) {
  return items.map((item) => `
    <div class="item-row">
      <div class="thumb-block ${escapeHtml(item.imageSource || (item.imageMapped ? 'manual' : 'fallback'))}">
        <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}">
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
      <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}">
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
      <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}">
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

export function renderGrid8Items(items, title, chipText, backgroundImage) {
  if (!Array.isArray(items) || items.length === 0) {
    return '';
  }
  const centerStyle = backgroundImage
    ? ` style="--grid8-center-image: url(&quot;${escapeHtml(backgroundImage)}&quot;)"`
    : '';

  return `
    ${items.slice(0, 4).map((item) => {
      const displayName = compactGridItemName(item.name);
      return `
        <article class="grid8-cell ${escapeHtml(imageSourceClass(item))}">
          <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}">
          <div class="grid8-cell-copy">
            <strong class="story-image-title">${escapeHtml(displayName)}</strong>
            ${renderGrid8Meta(item.metaPrimary)}
          </div>
        </article>
      `;
    }).join('')}
    <article class="grid8-center"${centerStyle}>
      <span class="grid8-center-chip">${escapeHtml(chipText || 'List')}</span>
      <h3>${escapeHtml(title || '')}</h3>
    </article>
    ${items.slice(4, 8).map((item) => {
        const displayName = compactGridItemName(item.name);
        return `
          <article class="grid8-cell ${escapeHtml(imageSourceClass(item))}">
            <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}">
            <div class="grid8-cell-copy">
              <strong class="story-image-title">${escapeHtml(displayName)}</strong>
              ${renderGrid8Meta(item.metaPrimary)}
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
        <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}">
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
            <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}">
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

export function renderListPage(page, index, total, listId, hashtags = []) {
  if (page.layoutVariant === 'photomode') {
    return `
      <article class="story-page photomode" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        <div class="photomode-stack">
          ${renderPhotomodeItems(page.items)}
        </div>
      </article>
    `;
  }

  if (page.layoutVariant === 'grid-8') {
    return `
      <article class="story-page grid8-page" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        <div class="grid8-matrix">
          ${renderGrid8Items(page.items, page.title, page.chipText, page.backgroundImage)}
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
      <article class="story-page grid6${gridVariantClass}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
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
      <article class="story-page journey4 journey-page-${dayNumber}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        <div class="journey-bg" style="background-image: url('${escapeHtml(page.backgroundImage)}');"></div>
        <div class="journey-day-badge">${escapeHtml(page.chipText)}</div>
        <div class="journey-card">
          <div class="journey-title-block">
            <h3 class="page-title">${escapeHtml(journey4N3DTitle(page.chipText, page.title))}</h3>
            ${page.subtitle ? `<p class="page-lead">${escapeHtml(page.subtitle)}</p>` : ''}
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
    <article class="story-page${variantClass}${crowdedClass}${hashtagClass}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
      <div class="page-shell-bg" style="background-image: url('${escapeHtml(page.backgroundImage)}');"></div>
      <div class="page-card">
        <div class="page-chip chip-${escapeHtml(page.chipTone)}">${escapeHtml(page.chipText)}</div>
        <h3 class="page-title">${escapeHtml(page.title)}</h3>
        <p class="page-lead">${escapeHtml(page.subtitle)}</p>
        <div class="item-stack">
          ${itemsHtml}
        </div>
      </div>
    </article>
  `;
}

