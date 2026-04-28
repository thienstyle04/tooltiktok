import { state, elements, escapeHtml, persistSelection, sanitizeFilePart, setStatus } from './state.js';

export function currentDeck() {
  if (!state.dataset) {
    return null;
  }
  return state.dataset.decks.find((deck) => deck.id === state.activeDeckId) || null;
}

export function currentList() {
  const deck = currentDeck();
  if (!deck) {
    return null;
  }
  return deck.lists.find((list) => list.id === state.activeListId) || deck.lists[0] || null;
}

export function currentPageLabel() {
  const list = currentList();
  if (!list) {
    return '';
  }
  return `${state.selectedPageIndex + 1}/${list.pages.length}`;
}

function countDeckPages(deck) {
  return (deck?.lists || []).reduce((total, list) => total + (list.pages?.length || 0), 0);
}

function listIsMain(list) {
  return /-main$/i.test(String(list?.id || ''));
}

function generatedDeckGroups() {
  if (!state.dataset) return [];
  return state.dataset.decks
    .map((deck) => ({
      deck,
      lists: deck.lists.filter((list) => !listIsMain(list)),
    }))
    .filter((group) => group.lists.length > 0);
}

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
        <div class="item-name">${escapeHtml(item.name)}</div>
        <p class="item-meta">${escapeHtml(item.metaPrimary)}</p>
        ${item.metaSecondary ? `<p class="item-meta secondary">${escapeHtml(item.metaSecondary)}</p>` : ''}
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
    <div class="grid6-address">
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
          <h4 class="photomode-name">${escapeHtml(item.name)}</h4>
        </div>
        <p class="photomode-meta">
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
        <div class="grid6-name">${escapeHtml(itemName)}</div>
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
    <div class="grid8-meta">
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
            <strong>${escapeHtml(displayName)}</strong>
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
              <strong>${escapeHtml(displayName)}</strong>
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
          <div class="itinerary-name">${escapeHtml(item.name)}</div>
        </div>
        <p class="item-meta itinerary-detail">
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
            <strong>${escapeHtml(item.name)}</strong>
            <p>${escapeHtml(item.metaPrimary)}</p>
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

export function updateSelectedPageUi() {
  elements.pageGrid.querySelectorAll('.story-page').forEach((node) => {
    const index = Number(node.dataset.pageIndex);
    const listId = node.dataset.listId;
    node.classList.toggle('is-selected', listId === state.activeListId && index === state.selectedPageIndex);
  });

  elements.pageGrid.querySelectorAll('.list-preview-section').forEach((section) => {
    section.classList.toggle('active', section.dataset.listSectionId === state.activeListId);
  });
}

export function bindPageSelection() {
  elements.pageGrid.querySelectorAll('.story-page').forEach((node) => {
    node.addEventListener('click', () => {
      state.activeListId = node.dataset.listId;
      state.selectedPageIndex = Number(node.dataset.pageIndex);
      persistSelection();
      updateSelectedPageUi();
      renderListSwitcher();
      renderPageInspector();
      scrollActivePageIntoView();
      setStatus(`Đã chọn trang ${currentPageLabel()} để xuất PNG.`);
    });
  });
}

function resetPreviewScroll() {
  const scrollToPreviewStart = () => {
    const previewContainers = [
      elements.pageGrid,
      elements.pageGrid?.closest('.preview-panel'),
      elements.pageGrid?.closest('.workspace-grid'),
      elements.pageGrid?.closest('.studio-shell'),
      document.scrollingElement,
    ];

    previewContainers.forEach((container) => {
      if (!container) return;
      if (typeof container.scrollTo === 'function') {
        container.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }
      container.scrollTop = 0;
      container.scrollLeft = 0;
    });

    elements.pageGrid?.querySelectorAll('.list-preview-grid').forEach((grid) => {
      grid.scrollTop = 0;
      grid.scrollLeft = 0;
    });
  };

  scrollToPreviewStart();
  requestAnimationFrame(scrollToPreviewStart);
  setTimeout(scrollToPreviewStart, 80);
}

function scrollActivePageIntoView() {
  const selectedPage = elements.pageGrid?.querySelector('.story-page.is-selected')
    || elements.pageGrid?.querySelector('.story-page');

  selectedPage?.scrollIntoView({
    behavior: 'auto',
    block: 'nearest',
    inline: 'start',
  });
}

export function renderListSection(list, isActive, deckId) {
  const isMain = listIsMain(list);
  const badgeText = isMain ? 'Gốc' : `AI ${list.navTitle}`;
  const sectionDescription = list.description || (isMain
    ? 'Bản gốc đang dùng làm layout chuẩn.'
    : 'Bản AI được sinh mới từ caption và đặt bên dưới bản gốc.');
  const pagesHtml = list.pages.map((page, index) => {
    if (page.type === 'cover') {
      return renderCoverPage(page, index, list.pages.length, list.id, list.captionHashtags || []);
    }
    return renderListPage(page, index, list.pages.length, list.id, list.captionHashtags || []);
  }).join('');

  const sectionTone = list.navTitle.toLowerCase().includes('ai') ? 'ai' : 'main';
  const deleteButtonHtml = !isMain ? `
    <button
      class="list-delete-btn"
      type="button"
      title="Xóa bộ ảnh AI này"
      data-deck-id="${escapeHtml(deckId)}"
      data-list-id="${escapeHtml(list.id)}"
      aria-label="Xóa ${escapeHtml(list.navTitle)}"
    >×</button>
  ` : '';

  return `
    <section class="list-preview-section ${isActive ? 'active' : ''}" data-list-section-id="${escapeHtml(list.id)}">
      <div class="list-preview-head">
        <div>
          <div class="list-preview-badge ${sectionTone}">${escapeHtml(badgeText)}</div>
          <h3 class="list-preview-title">${escapeHtml(list.title)}</h3>
          <p class="list-preview-description">${escapeHtml(sectionDescription)}</p>
          <div class="list-preview-hashtags">
            ${(list.captionHashtags || []).map(tag => `<span class="preview-hashtag">${escapeHtml(tag.startsWith('#') ? tag : '#' + tag)}</span>`).join('')}
          </div>
        </div>
        <div class="list-preview-meta-group">
          <div class="list-preview-meta">${String(list.pages.length).padStart(2, '0')} trang</div>
          ${deleteButtonHtml}
        </div>
      </div>
      <div class="list-preview-stage">
        <div class="list-preview-grid">
          ${pagesHtml}
        </div>
      </div>
    </section>
  `;
}

export function renderDeckSwitcher() {
  if (!state.dataset || !state.dataset.decks.length) {
    elements.deckSwitcher.innerHTML = '';
    if (elements.deckStats) {
      elements.deckStats.textContent = '0 mẫu';
    }
    return;
  }

  if (elements.deckStats) {
    const listCount = state.dataset.decks.reduce((total, deck) => total + deck.lists.length, 0);
    elements.deckStats.textContent = `${state.dataset.decks.length} mẫu · ${listCount} list`;
  }

  elements.deckSwitcher.innerHTML = state.dataset.decks.map((deck) => `
    <button
      class="deck-chip ${deck.id === state.activeDeckId ? 'active' : ''}"
      type="button"
      data-deck-id="${escapeHtml(deck.id)}"
    >
      <span class="deck-chip-name">${escapeHtml(deck.navTitle)}</span>
      <span class="deck-chip-meta">${deck.lists.length} list · ${countDeckPages(deck)} trang</span>
    </button>
  `).join('');

  elements.deckSwitcher.querySelectorAll('[data-deck-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeDeckId = button.dataset.deckId;
      const deck = currentDeck();
      state.activeListId = deck && deck.lists.length > 0 ? deck.lists[0].id : null;
      state.selectedPageIndex = 0;
      persistSelection();
      renderDeckSwitcher();
      renderDeck();
      setStatus(`Đang xem deck: ${button.textContent.trim()}.`);
    });
  });
}

export function renderListSwitcher() {
  if (!elements.listSwitcher) return;
  const deck = currentDeck();
  if (!deck || !deck.lists.length) {
    if (elements.listStats) {
      elements.listStats.textContent = '0 list';
    }
    elements.listSwitcher.innerHTML = '<div class="sidebar-empty">Chưa có list.</div>';
    return;
  }

  if (elements.listStats) {
    elements.listStats.textContent = `${deck.lists.length} list`;
  }

  elements.listSwitcher.innerHTML = deck.lists.map((list) => `
    <button
      class="list-chip ${list.id === state.activeListId ? 'active' : ''}"
      type="button"
      data-list-id="${escapeHtml(list.id)}"
    >
      <span>${escapeHtml(list.navTitle || list.title)}</span>
      <small>${String(list.pages.length).padStart(2, '0')} trang</small>
    </button>
  `).join('');

  elements.listSwitcher.querySelectorAll('[data-list-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeListId = button.dataset.listId;
      state.selectedPageIndex = 0;
      persistSelection();
      renderDeck();
      setStatus(`Đang xem list: ${button.textContent.trim()}.`);
    });
  });
}

export function renderPageInspector() {
  if (!elements.pageInspector) return;
  const deck = currentDeck();
  const list = currentList();
  const page = list?.pages?.[state.selectedPageIndex];

  if (!deck || !list || !page) {
    elements.pageInspector.innerHTML = '<p class="empty-inspector">Chọn một trang trong preview để xem dữ liệu và ảnh đang dùng.</p>';
    return;
  }

  const items = Array.isArray(page.items) ? page.items : [];
  const hasItems = items.length > 0;
  const mappedCount = items.filter((item) => item.imageSource === 'manual' || item.imageSource === 'auto' || item.imageMapped).length;
  const fallbackCount = items.filter((item) => imageSourceClass(item) === 'fallback').length;
  const coverImage = hasItems ? (items[0]?.imageUrl || page.backgroundImage || '') : (page.backgroundImage || '');
  const itemRows = hasItems
    ? items.map((item) => `
      <li class="inspector-item rich">
        <img class="inspector-item-thumb" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}">
        <span class="inspector-item-copy">
          <span class="inspector-item-label">${escapeHtml(item.label || '')}</span>
          <span class="inspector-item-name">${escapeHtml(item.name)}</span>
          <span class="inspector-item-meta">${escapeHtml(item.metaPrimary || '')}</span>
        </span>
        <span class="inspector-item-source ${escapeHtml(imageSourceClass(item))}">${escapeHtml(sourceLabel(item))}</span>
      </li>
    `).join('')
    : '';
  const inspectorBody = hasItems
    ? `
      <div class="inspector-stats">
        <div><strong>${items.length}</strong><span>dữ liệu</span></div>
        <div><strong>${mappedCount}</strong><span>có ảnh</span></div>
        <div><strong>${fallbackCount}</strong><span>minh họa</span></div>
      </div>
      <ul class="inspector-list">
        ${itemRows}
      </ul>
    `
    : `
      <div class="inspector-cover-note">
        <strong>Trang này là cover</strong>
        <span>Cover chỉ dùng ảnh nền và tiêu đề. Dữ liệu địa điểm/dịch vụ sẽ hiện khi chọn các trang nội dung phía sau.</span>
      </div>
    `;

  elements.pageInspector.innerHTML = `
    <div class="inspector-summary">
      ${coverImage ? `<img class="inspector-thumb" src="${escapeHtml(coverImage)}" alt="${escapeHtml(page.title || list.title)}">` : ''}
      <div class="inspector-copy">
        <p class="inspector-eyebrow">${escapeHtml(deck.navTitle)} · ${escapeHtml(list.navTitle || list.title)}</p>
        <h4>${escapeHtml(page.title || list.title)}</h4>
        <p>${hasItems ? 'Trang dữ liệu' : 'Trang bìa'} · ${escapeHtml(page.chipText || 'Cover')} · Trang ${currentPageLabel()}</p>
      </div>
    </div>
    ${inspectorBody}
  `;
}

export function renderDeck() {
  const deck = currentDeck();
  if (!deck || !deck.lists.length) {
    elements.deckTitle.textContent = 'Không có dữ liệu';
    elements.deckSubtitle.textContent = '';
    elements.pageGrid.innerHTML = '<div class="empty-state">Không có deck nào để hiển thị.</div>';
    renderListSwitcher();
    renderPageInspector();
    return;
  }

  const list = currentList();
  if (!list) {
    elements.pageGrid.innerHTML = '<div class="empty-state">Không có list nào để hiển thị.</div>';
    renderListSwitcher();
    renderPageInspector();
    return;
  }

  if (state.selectedPageIndex >= list.pages.length) {
    state.selectedPageIndex = 0;
    persistSelection();
  }

  elements.deckTitle.textContent = deck.title;
  elements.deckSubtitle.textContent = deck.description;
  elements.pageGrid.innerHTML = renderListSection(list, true, deck.id);
  resetPreviewScroll();

  bindPageSelection();
  updateSelectedPageUi();
  renderListSwitcher();
  renderPageInspector();
}

export function render() {
  renderDeckSwitcher();
  renderDeck();
}

export function showExportModal() {
  if (!state.dataset) return;
  elements.exportModal.classList.remove('hidden');
  renderExportModalContent();
}

export function hideExportModal() {
  elements.exportModal.classList.add('hidden');
}

export function showDeleteListsModal() {
  const deck = currentDeck();
  if (!deck) return;
  state.selectedListsForDelete.clear();
  const list = currentList();
  if (list && !listIsMain(list)) {
    state.selectedListsForDelete.add(list.id);
  }
  elements.deleteListsModal.classList.remove('hidden');
  renderDeleteListsModalContent();
}

export function hideDeleteListsModal() {
  elements.deleteListsModal.classList.add('hidden');
}

export function renderDeleteListsModalContent() {
  const groups = generatedDeckGroups();

  if (groups.length === 0) {
    elements.deleteDeckList.innerHTML = `
      <div class="delete-empty-state">
        <strong>Không có list AI để xóa</strong>
        <span>Hiện chưa có mẫu nào có list AI. List chính của các mẫu sẽ luôn được giữ lại.</span>
      </div>
    `;
    updateDeleteSelectedListsButton();
    return;
  }

  elements.deleteDeckList.innerHTML = groups.map(({ deck, lists }) => {
    const allSelected = lists.every((list) => state.selectedListsForDelete.has(list.id));
    return `
      <div class="export-deck-group delete-deck-group" data-deck-id="${escapeHtml(deck.id)}">
        <div class="export-group-head">
          <h4 class="export-group-title">${escapeHtml(deck.navTitle)}</h4>
          <label class="export-select-all-label">
            <input type="checkbox" class="delete-select-all-checkbox" ${allSelected ? 'checked' : ''}>
            <span>Chọn tất cả</span>
          </label>
        </div>
        <div class="export-group-lists">
          ${lists.map((list) => {
            const isChecked = state.selectedListsForDelete.has(list.id);
            return `
              <label class="export-list-item delete-list-item" data-deck-id="${escapeHtml(deck.id)}" data-list-id="${escapeHtml(list.id)}">
                <input type="checkbox" class="delete-list-checkbox" ${isChecked ? 'checked' : ''}>
                <div class="export-list-info">
                  <p class="export-list-title">${escapeHtml(list.navTitle || list.title)}</p>
                  <p class="export-list-meta">${escapeHtml(list.title)} · ${list.pages.length} trang</p>
                </div>
              </label>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  elements.deleteDeckList.querySelectorAll('.delete-list-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', (event) => {
      const item = event.target.closest('.delete-list-item');
      const group = event.target.closest('.delete-deck-group');
      const deckId = group?.dataset?.deckId;
      const listId = item?.dataset?.listId;
      if (!listId) return;
      if (event.target.checked) {
        state.selectedListsForDelete.add(listId);
      } else {
        state.selectedListsForDelete.delete(listId);
      }
      const selectAll = group?.querySelector('.delete-select-all-checkbox');
      const groupLists = groups.find((candidate) => candidate.deck.id === deckId)?.lists || [];
      if (selectAll && groupLists.length > 0) {
        selectAll.checked = groupLists.every((list) => state.selectedListsForDelete.has(list.id));
      }
      updateDeleteSelectedListsButton();
    });
  });

  elements.deleteDeckList.querySelectorAll('.delete-select-all-checkbox').forEach((selectAll) => {
    selectAll.addEventListener('change', (event) => {
      const group = event.target.closest('.delete-deck-group');
      const deckId = group?.dataset?.deckId;
      const groupLists = groups.find((candidate) => candidate.deck.id === deckId)?.lists || [];
      groupLists.forEach((list) => {
        if (event.target.checked) {
          state.selectedListsForDelete.add(list.id);
        } else {
          state.selectedListsForDelete.delete(list.id);
        }
      });
      group?.querySelectorAll('.delete-list-checkbox').forEach((checkbox) => {
        checkbox.checked = event.target.checked;
      });
      updateDeleteSelectedListsButton();
    });
  });

  updateDeleteSelectedListsButton();
}

export function selectedDeleteGroups() {
  if (!state.dataset) return [];
  return state.dataset.decks
    .map((deck) => ({
      deckId: deck.id,
      deckTitle: deck.navTitle || deck.title,
      listIds: deck.lists
        .filter((list) => !listIsMain(list) && state.selectedListsForDelete.has(list.id))
        .map((list) => list.id),
    }))
    .filter((group) => group.listIds.length > 0);
}

export function updateDeleteSelectedListsButton() {
  const count = state.selectedListsForDelete.size;
  if (!elements.executeDeleteSelectedListsBtn) return;
  elements.executeDeleteSelectedListsBtn.textContent = count > 0
    ? `Xóa ${count} list đã chọn`
    : 'Chọn list AI để xóa';
  elements.executeDeleteSelectedListsBtn.disabled = count === 0 || state.exporting;
}

export function renderExportModalContent() {
  if (!state.dataset) return;

  const decksWithLists = state.dataset.decks.filter(deck => deck.lists.length > 0);

  elements.exportDeckList.innerHTML = decksWithLists.map(deck => {
    const listsHtml = deck.lists.map(list => {
      const isChecked = state.selectedListsForExport.has(list.id);
      const isMain = /-main$/i.test(list.id);
      const typeLabel = isMain ? 'Gốc' : 'AI';
      return `
        <label class="export-list-item" data-list-id="${escapeHtml(list.id)}">
          <input type="checkbox" class="list-checkbox" ${isChecked ? 'checked' : ''}>
          <div class="export-list-info">
            <p class="export-list-title">${escapeHtml(list.title)}</p>
            <p class="export-list-meta">${escapeHtml(typeLabel)} · ${list.pages.length} trang</p>
          </div>
        </label>
      `;
    }).join('');

    // Check if all lists in this deck are already selected
    const allSelected = deck.lists.every(l => state.selectedListsForExport.has(l.id));

    return `
      <div class="export-deck-group" data-deck-id="${escapeHtml(deck.id)}">
        <div class="export-group-head">
          <h4 class="export-group-title">${escapeHtml(deck.navTitle)}</h4>
          <label class="export-select-all-label">
            <input type="checkbox" class="select-all-checkbox" ${allSelected ? 'checked' : ''}>
            <span>Chọn tất cả</span>
          </label>
        </div>
        <div class="export-group-lists">
          ${listsHtml}
        </div>
      </div>
    `;
  }).join('');

  // Bind individual checkbox events
  elements.exportDeckList.querySelectorAll('.list-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const item = e.target.closest('.export-list-item');
      const listId = item.dataset.listId;
      if (e.target.checked) {
        state.selectedListsForExport.add(listId);
      } else {
        state.selectedListsForExport.delete(listId);
      }
      
      // Update the "Select All" checkbox for this group
      const group = e.target.closest('.export-deck-group');
      const groupCbs = Array.from(group.querySelectorAll('.list-checkbox'));
      const selectAllCb = group.querySelector('.select-all-checkbox');
      selectAllCb.checked = groupCbs.every(c => c.checked);

      updateBatchExportButton();
    });
  });

  // Bind "Select All" events
  elements.exportDeckList.querySelectorAll('.select-all-checkbox').forEach(selectAllCb => {
    selectAllCb.addEventListener('change', (e) => {
      const group = e.target.closest('.export-deck-group');
      const groupCbs = group.querySelectorAll('.list-checkbox');
      const isChecked = e.target.checked;

      groupCbs.forEach(cb => {
        const item = cb.closest('.export-list-item');
        const listId = item.dataset.listId;
        cb.checked = isChecked;
        if (isChecked) {
          state.selectedListsForExport.add(listId);
        } else {
          state.selectedListsForExport.delete(listId);
        }
      });

      updateBatchExportButton();
    });
  });

  updateBatchExportButton();
}

function updateBatchExportButton() {
  const count = state.selectedListsForExport.size;
  elements.executeBatchExportBtn.textContent = count > 0 
    ? `Bắt đầu xuất ${count} list đã chọn`
    : 'Hãy chọn ít nhất 1 list để xuất';
  elements.executeBatchExportBtn.disabled = count === 0 || state.exporting;
}
