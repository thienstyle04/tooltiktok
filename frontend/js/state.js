export const state = {
  dataset: null,
  activeDeckId: null,
  activeListId: null,
  selectedPageIndex: 0,
  exporting: false,
  fontEmbedCSS: null,
  selectedListsForExport: new Set(),
  selectedListsForDelete: new Set(),
  exportProgressHideTimer: null,
};

const SELECTION_STORAGE_KEY = 'dalat-carousel-active-selection-v1';

export const elements = {
  deckTitle: document.getElementById('deckTitle'),
  deckSubtitle: document.getElementById('deckSubtitle'),
  deckSwitcher: document.getElementById('deckSwitcher'),
  listSwitcher: document.getElementById('listSwitcher'),
  deckStats: document.getElementById('deckStats'),
  listStats: document.getElementById('listStats'),
  pageInspector: document.getElementById('pageInspector'),
  pageGrid: document.getElementById('pageGrid'),
  batchExportBtn: document.getElementById('batchExportBtn'),
  exportSelectedPageBtn: document.getElementById('exportSelectedPageBtn'),
  exportActiveListBtn: document.getElementById('exportActiveListBtn'),
  deleteListsBtn: document.getElementById('deleteListsBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  statusText: document.getElementById('statusText'),
  exportProgress: document.getElementById('exportProgress'),
  exportProgressBar: document.getElementById('exportProgressBar'),
  exportProgressLabel: document.getElementById('exportProgressLabel'),
  exportProgressPercent: document.getElementById('exportProgressPercent'),
  generateCaptionBtn: document.getElementById('generateCaptionBtn'),
  createDeckFromCaptionBtn: document.getElementById('createDeckFromCaptionBtn'),
  copyFullCaptionBtn: document.getElementById('copyFullCaptionBtn'),
  captionTone: document.getElementById('captionTone'),
  captionHeadline: document.getElementById('captionHeadline'),
  captionBody: document.getElementById('captionBody'),
  captionHashtags: document.getElementById('captionHashtags'),
  regenHeadlineBtn: document.getElementById('regenHeadlineBtn'),
  regenBodyBtn: document.getElementById('regenBodyBtn'),
  regenHashtagsBtn: document.getElementById('regenHashtagsBtn'),
  copyHeadlineBtn: document.getElementById('copyHeadlineBtn'),
  copyBodyBtn: document.getElementById('copyBodyBtn'),
  copyHashtagsBtn: document.getElementById('copyHashtagsBtn'),
  // Modal
  exportModal: document.getElementById('exportModal'),
  closeExportModalBtn: document.getElementById('closeExportModalBtn'),
  exportDeckList: document.getElementById('exportDeckList'),
  executeBatchExportBtn: document.getElementById('executeBatchExportBtn'),
  deleteListsModal: document.getElementById('deleteListsModal'),
  closeDeleteListsModalBtn: document.getElementById('closeDeleteListsModalBtn'),
  deleteDeckList: document.getElementById('deleteDeckList'),
  executeDeleteSelectedListsBtn: document.getElementById('executeDeleteSelectedListsBtn'),
};

export function setStatus(message) {
  if (elements.statusText) elements.statusText.textContent = message || '';
}

export function setExportBusy(isBusy) {
  state.exporting = isBusy;
  if(elements.batchExportBtn) elements.batchExportBtn.disabled = isBusy;
  if(elements.exportSelectedPageBtn) elements.exportSelectedPageBtn.disabled = isBusy;
  if(elements.exportActiveListBtn) elements.exportActiveListBtn.disabled = isBusy;
  if(elements.deleteListsBtn) elements.deleteListsBtn.disabled = isBusy;
  if(elements.executeBatchExportBtn) elements.executeBatchExportBtn.disabled = isBusy;
  if(elements.executeDeleteSelectedListsBtn) elements.executeDeleteSelectedListsBtn.disabled = isBusy;
  if(elements.generateCaptionBtn) elements.generateCaptionBtn.disabled = isBusy;
  if(elements.createDeckFromCaptionBtn) elements.createDeckFromCaptionBtn.disabled = isBusy;
  if(elements.regenHeadlineBtn) elements.regenHeadlineBtn.disabled = isBusy;
  if(elements.regenBodyBtn) elements.regenBodyBtn.disabled = isBusy;
  if(elements.regenHashtagsBtn) elements.regenHashtagsBtn.disabled = isBusy;
}

function normalizedProgressValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
}

export function showExportProgress(label = 'Đang chuẩn bị xuất file...', value = 0) {
  if (state.exportProgressHideTimer) {
    clearTimeout(state.exportProgressHideTimer);
    state.exportProgressHideTimer = null;
  }
  if (elements.exportProgress) {
    elements.exportProgress.classList.remove('hidden');
    elements.exportProgress.classList.remove('failed');
  }
  updateExportProgress(value, label);
}

export function updateExportProgress(value, label) {
  const percent = Math.round(normalizedProgressValue(value));
  if (elements.exportProgress) {
    elements.exportProgress.setAttribute('aria-valuenow', String(percent));
  }
  if (elements.exportProgressBar) {
    elements.exportProgressBar.style.width = `${percent}%`;
  }
  if (elements.exportProgressPercent) {
    elements.exportProgressPercent.textContent = `${percent}%`;
  }
  if (label && elements.exportProgressLabel) {
    elements.exportProgressLabel.textContent = label;
  }
}

export function completeExportProgress(label = 'Đã xuất xong file.') {
  updateExportProgress(100, label);
  if (state.exportProgressHideTimer) {
    clearTimeout(state.exportProgressHideTimer);
  }
  state.exportProgressHideTimer = setTimeout(() => {
    if (elements.exportProgress) {
      elements.exportProgress.classList.add('hidden');
    }
    state.exportProgressHideTimer = null;
  }, 1600);
}

export function failExportProgress(label = 'Xuất file thất bại.') {
  updateExportProgress(100, label);
  if (elements.exportProgress) {
    elements.exportProgress.classList.add('failed');
  }
}

export function persistSelection() {
  try {
    window.localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify({
      activeDeckId: state.activeDeckId,
      activeListId: state.activeListId,
      selectedPageIndex: state.selectedPageIndex,
    }));
  } catch {
    // Ignore storage failures; the app still works without persistence.
  }
}

export function restoreSelection() {
  try {
    const raw = window.localStorage.getItem(SELECTION_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.activeDeckId = typeof parsed.activeDeckId === 'string' ? parsed.activeDeckId : null;
    state.activeListId = typeof parsed.activeListId === 'string' ? parsed.activeListId : null;
    state.selectedPageIndex = Number.isInteger(parsed.selectedPageIndex) && parsed.selectedPageIndex >= 0
      ? parsed.selectedPageIndex
      : 0;
  } catch {
    state.activeDeckId = null;
    state.activeListId = null;
    state.selectedPageIndex = 0;
  }
}

restoreSelection();

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function sanitizeFilePart(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
