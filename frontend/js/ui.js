import { state, elements, escapeHtml, sanitizeFilePart, setStatus } from './state.js';
import { exportBatch } from './export.js';

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

export function pageCounter(index, total) {
  return `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
}

function isGridLayout(page) {
  return page.layoutVariant === 'grid-6' || page.layoutVariant === 'grid-4';
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
  if (isGridLayout(page)) {
    const grid4Class = page.layoutVariant === 'grid-4' ? ' grid4-cover' : '';
    return `
      <article class="story-page grid6-cover${grid4Class}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
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

export function renderGrid6Items(items, { numbered = false } = {}) {
  return items.map((item, index) => {
    const itemName = numbered ? `${index + 1}. ${item.name}` : item.name;
    return `
    <div class="grid6-item ${escapeHtml(item.imageSource || (item.imageMapped ? 'manual' : 'fallback'))}">
      <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}">
      <div class="grid6-overlay">
        <div class="grid6-name">${escapeHtml(itemName)}</div>
        <div class="grid6-address">${escapeHtml(item.metaPrimary)}</div>
      </div>
    </div>
  `;
  }).join('');
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

  if (isGridLayout(page)) {
    const grid4Class = page.layoutVariant === 'grid-4' ? ' grid4' : '';
    const grid4BodyClass = page.layoutVariant === 'grid-4' ? ' grid4-body' : '';
    return `
      <article class="story-page grid6${grid4Class}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        <div class="grid6-header">
           <div class="grid6-header-top">${escapeHtml(page.title)}</div>
        </div>
        <div class="grid6-body${grid4BodyClass}">
          ${renderGrid6Items(page.items, { numbered: page.layoutVariant === 'grid-4' })}
        </div>
      </article>
    `;
  }

  if (page.layoutVariant === 'journey-4n3d') {
    const hashtagsHtml = renderInlineHashtags(hashtags);
    const hashtagClass = Array.isArray(hashtags) && hashtags.length > 0 ? ' has-inline-hashtags' : '';
    const dayNumber = String(Math.max(index, 1)).padStart(2, '0');
    return `
      <article class="story-page journey4 journey-page-${dayNumber}${hashtagClass}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        <div class="journey-bg" style="background-image: url('${escapeHtml(page.backgroundImage)}');"></div>
        <div class="journey-day-badge">${escapeHtml(page.chipText)}</div>
        <div class="journey-card">
          <div class="journey-header">
            <h3>${escapeHtml(page.title)}</h3>
            <p>${escapeHtml(page.subtitle)}</p>
            ${hashtagsHtml}
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
}

export function bindPageSelection() {
  elements.pageGrid.querySelectorAll('.story-page').forEach((node) => {
    node.addEventListener('click', () => {
      state.activeListId = node.dataset.listId;
      state.selectedPageIndex = Number(node.dataset.pageIndex);
      updateSelectedPageUi();
      const list = currentList();
      if (list) {
        // Cập nhật trạng thái trang chọn
      }
      setStatus(`Đã chọn trang ${currentPageLabel()} để xuất PNG.`);
    });
  });
}

export function renderListSection(list, isActive, deckId) {
  const isMainList = /-main$/i.test(String(list.id || ''));
  const badgeText = isMainList ? 'Gốc' : `AI ${list.navTitle}`;
  const sectionDescription = list.description || (isMainList
    ? 'Bản gốc đang dùng làm layout chuẩn.'
    : 'Bản AI được sinh mới từ caption và đặt bên dưới bản gốc.');
  const pagesHtml = list.pages.map((page, index) => {
    if (page.type === 'cover') {
      return renderCoverPage(page, index, list.pages.length, list.id, list.captionHashtags || []);
    }
    return renderListPage(page, index, list.pages.length, list.id, list.captionHashtags || []);
  }).join('');

  const sectionTone = list.navTitle.toLowerCase().includes('ai') ? 'ai' : 'main';
  const deleteButtonHtml = !isMainList ? `
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
    return;
  }

  elements.deckSwitcher.innerHTML = state.dataset.decks.map((deck) => `
    <button
      class="deck-chip ${deck.id === state.activeDeckId ? 'active' : ''}"
      type="button"
      data-deck-id="${escapeHtml(deck.id)}"
    >
      ${escapeHtml(deck.navTitle)}
    </button>
  `).join('');

  elements.deckSwitcher.querySelectorAll('[data-deck-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeDeckId = button.dataset.deckId;
      const deck = currentDeck();
      state.activeListId = deck && deck.lists.length > 0 ? deck.lists[0].id : null;
      state.selectedPageIndex = 0;
      renderDeckSwitcher();
      renderListSwitcher();
      renderDeck();
      setStatus(`Đang xem deck: ${button.textContent.trim()}.`);
    });
  });
}

export function renderListSwitcher() {
  elements.listSwitcher.innerHTML = '';
}

export function renderDeck() {
  const deck = currentDeck();
  if (!deck || !deck.lists.length) {
    elements.deckTitle.textContent = 'Không có dữ liệu';
    elements.deckSubtitle.textContent = '';
    elements.pageGrid.innerHTML = '<div class="empty-state">Không có deck nào để hiển thị.</div>';
    return;
  }

  const list = currentList();
  if (!list) {
    elements.pageGrid.innerHTML = '<div class="empty-state">Không có list nào để hiển thị.</div>';
    return;
  }

  if (state.selectedPageIndex >= list.pages.length) {
    state.selectedPageIndex = 0;
  }

  elements.deckTitle.textContent = deck.title;
  elements.deckSubtitle.textContent = deck.description;
  elements.pageGrid.innerHTML = deck.lists.map((item) => renderListSection(item, item.id === state.activeListId, deck.id)).join('');

  bindPageSelection();
  updateSelectedPageUi();
}

export function render() {
  renderDeckSwitcher();
  renderListSwitcher();
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
