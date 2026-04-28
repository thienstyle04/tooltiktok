import { state, elements, persistSelection, setStatus, setExportBusy } from './state.js';
import { currentDeck, currentList, render } from './ui.js';

export function currentTone() {
  return elements.captionTone.value;
}

export function currentCaptionBlocks() {
  return {
    headline: elements.captionHeadline.value.trim(),
    body: elements.captionBody.value.trim(),
    hashtags: elements.captionHashtags.value
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean),
  };
}

export function setCaptionBlocks(payload) {
  elements.captionHeadline.value = payload.headline || '';
  elements.captionBody.value = payload.body || '';
  elements.captionHashtags.value = Array.isArray(payload.hashtags) ? payload.hashtags.join(' ') : '';
}

export function fullCaptionText() {
  const blocks = currentCaptionBlocks();
  return [blocks.headline, blocks.body, blocks.hashtags.join(' ')].filter(Boolean).join('\n\n');
}

export async function createDeckFromCaption() {
  const sourceDeck = currentDeck();
  const blocks = currentCaptionBlocks();

  if (!sourceDeck) {
    setStatus('Chưa có deck để tạo list AI mới.');
    return;
  }

  if (!blocks.headline || !blocks.body) {
    setStatus('Cần có headline và body trước khi tạo list AI từ caption.');
    return;
  }

  setExportBusy(true);
  setStatus(`Đang tạo list AI mới trong deck "${sourceDeck.navTitle}"...`);

  try {
    const response = await fetch('/api/decks/generate-from-caption', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deckId: sourceDeck.id,
        listId: state.activeListId,
        caption: blocks,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Tạo list AI thất bại: HTTP ${response.status}`);
    }

    const payload = await response.json();
    await loadDataset('Đang nạp lại deck sau khi tạo list AI...');
    state.activeDeckId = payload.deckId;
    state.activeListId = payload.listId;
    state.selectedPageIndex = 0;
    persistSelection();
    render();
    const section = elements.pageGrid.querySelector(`[data-list-section-id="${CSS.escape(state.activeListId)}"]`);
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    setStatus(`Đã tạo list mới "${payload.navTitle}" ngay trong deck "${sourceDeck.navTitle}".`);
  } catch (error) {
    setStatus(error?.message || 'Không tạo được list AI mới.');
  } finally {
    setExportBusy(false);
  }
}

export async function deleteGeneratedList(deckId, listId) {
  setExportBusy(true);
  setStatus('Đang xóa deck AI...');
  try {
    const deckBeforeDelete = state.dataset?.decks?.find((d) => d.id === deckId);
    const listIndex = deckBeforeDelete?.lists?.findIndex((list) => list.id === listId) ?? -1;
    const response = await fetch(`/api/decks/${encodeURIComponent(deckId)}/lists/${encodeURIComponent(listId)}`, {
      method: 'DELETE',
    });
    if (!response.ok && response.status !== 204) {
      const message = await response.text();
      throw new Error(message || `Xóa thất bại: HTTP ${response.status}`);
    }

    // Optimistic update: xóa thẳng từ state, không cần reload toàn bộ dataset
    if (state.dataset) {
      const deck = state.dataset.decks.find((d) => d.id === deckId);
      if (deck) {
        deck.lists = deck.lists.filter((l) => l.id !== listId);
      }
    }

    // Chuyển sang list kế bên vị trí vừa xóa nếu list đang xem bị xóa.
    if (state.activeListId === listId) {
      const deck = state.dataset?.decks?.find((d) => d.id === deckId);
      const nextIndex = Math.max(0, Math.min(listIndex, (deck?.lists?.length || 1) - 1));
      state.activeListId = deck?.lists?.[nextIndex]?.id ?? null;
      state.selectedPageIndex = 0;
    }

    persistSelection();
    render();
    setStatus('Đã xóa deck AI thành công.');
  } catch (error) {
    setStatus(error?.message || 'Không xóa được deck AI.');
  } finally {
    setExportBusy(false);
  }
}

export async function deleteGeneratedLists(deckId, listIds) {
  return deleteGeneratedListGroups([{ deckId, listIds }]);
}

export async function deleteGeneratedListGroups(groups) {
  const groupsToDelete = (groups || [])
    .map((group) => ({
      deckId: group?.deckId,
      listIds: Array.from(new Set(group?.listIds || [])).filter(Boolean),
    }))
    .filter((group) => group.deckId && group.listIds.length > 0);
  const totalToDelete = groupsToDelete.reduce((total, group) => total + group.listIds.length, 0);

  if (totalToDelete === 0) {
    setStatus('Chưa chọn list AI nào để xóa.');
    return false;
  }

  setExportBusy(true);
  setStatus(`Đang xóa ${totalToDelete} list AI...`);
  try {
    const focusIndexByDeck = new Map();

    for (const group of groupsToDelete) {
      const deckBeforeDelete = state.dataset?.decks?.find((deck) => deck.id === group.deckId);
      const deleteIndexes = group.listIds
        .map((id) => deckBeforeDelete?.lists?.findIndex((list) => list.id === id) ?? -1)
        .filter((index) => index >= 0);
      focusIndexByDeck.set(group.deckId, deleteIndexes.length > 0 ? Math.min(...deleteIndexes) : 0);

      for (const listId of group.listIds) {
        const response = await fetch(`/api/decks/${encodeURIComponent(group.deckId)}/lists/${encodeURIComponent(listId)}`, {
          method: 'DELETE',
        });
        if (!response.ok && response.status !== 204) {
          const message = await response.text();
          throw new Error(message || `Xóa thất bại: HTTP ${response.status}`);
        }
      }
    }

    if (state.dataset) {
      for (const group of groupsToDelete) {
        const deck = state.dataset.decks.find((d) => d.id === group.deckId);
        if (deck) {
          deck.lists = deck.lists.filter((list) => !group.listIds.includes(list.id));
        }
      }
    }

    let deck = state.dataset?.decks?.find((d) => d.id === state.activeDeckId);
    if (!deck) {
      deck = state.dataset?.decks?.[0] || null;
      state.activeDeckId = deck?.id ?? null;
    }

    if (!deck?.lists?.some((list) => list.id === state.activeListId)) {
      const focusIndex = focusIndexByDeck.get(deck?.id) ?? 0;
      const nextIndex = Math.max(0, Math.min(focusIndex, (deck?.lists?.length || 1) - 1));
      state.activeListId = deck?.lists?.[nextIndex]?.id ?? null;
      state.selectedPageIndex = 0;
    }

    const list = currentList();
    if (!list || state.selectedPageIndex >= list.pages.length) {
      state.selectedPageIndex = 0;
    }

    persistSelection();
    render();
    setStatus(`Đã xóa ${totalToDelete} list AI.`);
    return true;
  } catch (error) {
    setStatus(error?.message || 'Không xóa được các list AI đã chọn.');
    return false;
  } finally {
    setExportBusy(false);
  }
}

export async function loadDataset(statusMessage = 'Đang tải dữ liệu workbook...') {
  setStatus(statusMessage);
  const response = await fetch('/api/guide-data', {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Không tải được dữ liệu: HTTP ${response.status}`);
  }

  const dataset = await response.json();
  state.dataset = dataset;
  if (!dataset.decks.some((deck) => deck.id === state.activeDeckId)) {
    state.activeDeckId = dataset.decks.length > 0 ? dataset.decks[0].id : null;
  }
  const deck = currentDeck();
  if (!deck || !deck.lists.some((list) => list.id === state.activeListId)) {
    state.activeListId = deck && deck.lists.length > 0 ? deck.lists[0].id : null;
  }
  const list = currentList();
  if (!list || state.selectedPageIndex >= list.pages.length) {
    state.selectedPageIndex = 0;
  }
  persistSelection();
  render();
  setStatus(`Đã tải ${dataset.source.totalItems} địa điểm.`);
}

export async function requestCaption(target = 'full') {
  const deck = currentDeck();
  const list = currentList();
  if (!deck || !list) {
    setStatus('Chưa có list để gửi sang DeepSeek.');
    return;
  }

  setExportBusy(true);
  setStatus(`Đang gọi DeepSeek cho list "${list.title}"...`);

  try {
    const response = await fetch('/api/ai/deepseek/caption', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deckId: deck.id,
        listId: list.id,
        tone: currentTone(),
        target,
        current: currentCaptionBlocks(),
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || `DeepSeek trả lỗi HTTP ${response.status}`);
    }

    setCaptionBlocks(payload);
    setStatus(`Đã nhận caption DeepSeek cho list "${list.title}".`);
  } catch (error) {
    console.error(error);
    setStatus(`Gọi DeepSeek thất bại: ${error.message}`);
  } finally {
    setExportBusy(false);
  }
}
