export const state = {
  dataset: null,
  activeDeckId: null,
  activeListId: null,
  selectedPageIndex: 0,
  exporting: false,
  fontEmbedCSS: null,
  selectedListsForExport: new Set(),
};

export const elements = {
  deckTitle: document.getElementById('deckTitle'),
  deckSubtitle: document.getElementById('deckSubtitle'),
  deckSwitcher: document.getElementById('deckSwitcher'),
  listSwitcher: document.getElementById('listSwitcher'),
  pageGrid: document.getElementById('pageGrid'),
  batchExportBtn: document.getElementById('batchExportBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  statusText: document.getElementById('statusText'),
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
};

export function setStatus(message) {
  if (elements.statusText) elements.statusText.textContent = message || '';
}

export function setExportBusy(isBusy) {
  state.exporting = isBusy;
  if(elements.batchExportBtn) elements.batchExportBtn.disabled = isBusy;
  if(elements.executeBatchExportBtn) elements.executeBatchExportBtn.disabled = isBusy;
  if(elements.generateCaptionBtn) elements.generateCaptionBtn.disabled = isBusy;
  if(elements.createDeckFromCaptionBtn) elements.createDeckFromCaptionBtn.disabled = isBusy;
  if(elements.regenHeadlineBtn) elements.regenHeadlineBtn.disabled = isBusy;
  if(elements.regenBodyBtn) elements.regenBodyBtn.disabled = isBusy;
  if(elements.regenHashtagsBtn) elements.regenHashtagsBtn.disabled = isBusy;
}

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
