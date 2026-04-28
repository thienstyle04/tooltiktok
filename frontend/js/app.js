import { state, elements, setStatus } from './state.js';
import { loadDataset, requestCaption, createDeckFromCaption, deleteGeneratedList, deleteGeneratedListGroups, fullCaptionText } from './api.js';
import { exportSelectedPagePng, exportActiveDeck } from './export.js';

if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

async function copyText(text, message) {
  if (!text) {
    setStatus('Chưa có nội dung để copy.');
    return;
  }

  await navigator.clipboard.writeText(text);
  setStatus(message);
}

// Event delegation: xử lý click nút xóa deck AI
if (elements.pageGrid) {
  elements.pageGrid.addEventListener('click', (event) => {
    const btn = event.target.closest('.list-delete-btn');
    if (!btn) return;
    
    // Ngăn chặn sự kiện click lan tới .story-page (nếu có)
    event.stopPropagation();
    event.preventDefault();
    
    const { deckId, listId } = btn.dataset;
    if (!deckId || !listId) return;
    
    const confirmed = window.confirm('Bạn có chắc chắn muốn xóa bộ ảnh AI này?');
    if (confirmed) {
      deleteGeneratedList(deckId, listId);
    }
  });
}

elements.refreshBtn.addEventListener('click', async () => {
  try {
    await loadDataset('Đang tải lại dữ liệu workbook...');
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  }
});

if (elements.exportSelectedPageBtn) {
  elements.exportSelectedPageBtn.addEventListener('click', exportSelectedPagePng);
}

if (elements.exportActiveListBtn) {
  elements.exportActiveListBtn.addEventListener('click', exportActiveDeck);
}

elements.generateCaptionBtn.addEventListener('click', () => requestCaption('full'));
elements.createDeckFromCaptionBtn.addEventListener('click', createDeckFromCaption);
elements.regenHeadlineBtn.addEventListener('click', () => requestCaption('headline'));
elements.regenBodyBtn.addEventListener('click', () => requestCaption('body'));
elements.regenHashtagsBtn.addEventListener('click', () => requestCaption('hashtags'));
elements.copyHeadlineBtn.addEventListener('click', () => copyText(elements.captionHeadline.value.trim(), 'Đã copy headline.'));
elements.copyBodyBtn.addEventListener('click', () => copyText(elements.captionBody.value.trim(), 'Đã copy body.'));
elements.copyHashtagsBtn.addEventListener('click', () => copyText(elements.captionHashtags.value.trim(), 'Đã copy hashtags.'));
elements.copyFullCaptionBtn.addEventListener('click', () => copyText(fullCaptionText(), 'Đã copy full caption.'));
// Modal Batch Export
import { hideDeleteListsModal, selectedDeleteGroups, showDeleteListsModal, showExportModal, hideExportModal } from './ui.js';
import { exportBatch } from './export.js';

elements.batchExportBtn.addEventListener('click', showExportModal);
elements.closeExportModalBtn.addEventListener('click', hideExportModal);
elements.executeBatchExportBtn.addEventListener('click', () => {
  hideExportModal();
  exportBatch();
});

if (elements.deleteListsBtn) {
  elements.deleteListsBtn.addEventListener('click', showDeleteListsModal);
}
if (elements.closeDeleteListsModalBtn) {
  elements.closeDeleteListsModalBtn.addEventListener('click', hideDeleteListsModal);
}
if (elements.executeDeleteSelectedListsBtn) {
  elements.executeDeleteSelectedListsBtn.addEventListener('click', async () => {
    const groups = selectedDeleteGroups();
    const listCount = groups.reduce((total, group) => total + group.listIds.length, 0);
    if (listCount === 0) return;
    const confirmed = window.confirm(`Xóa ${listCount} list AI đã chọn trong ${groups.length} mẫu?`);
    if (!confirmed) return;
    const deleted = await deleteGeneratedListGroups(groups);
    if (deleted) {
      state.selectedListsForDelete.clear();
      hideDeleteListsModal();
    }
  });
}

// Đóng modal khi click ra ngoài
elements.exportModal.addEventListener('click', (e) => {
  if (e.target === elements.exportModal) hideExportModal();
});
if (elements.deleteListsModal) {
  elements.deleteListsModal.addEventListener('click', (e) => {
    if (e.target === elements.deleteListsModal) hideDeleteListsModal();
  });
}

loadDataset().catch((error) => {
  console.error(error);
  setStatus(error.message);
});
