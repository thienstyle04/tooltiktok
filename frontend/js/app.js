import { state, elements, setStatus } from './state.js';
import { loadDataset, requestCaption, createDeckFromCaption, deleteGeneratedList, fullCaptionText } from './api.js';
import { exportSelectedPagePng, exportActiveDeck } from './export.js';

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
import { showExportModal, hideExportModal } from './ui.js';
import { exportBatch } from './export.js';

elements.batchExportBtn.addEventListener('click', showExportModal);
elements.closeExportModalBtn.addEventListener('click', hideExportModal);
elements.executeBatchExportBtn.addEventListener('click', exportBatch);

// Đóng modal khi click ra ngoài
elements.exportModal.addEventListener('click', (e) => {
  if (e.target === elements.exportModal) hideExportModal();
});

loadDataset().catch((error) => {
  console.error(error);
  setStatus(error.message);
});
