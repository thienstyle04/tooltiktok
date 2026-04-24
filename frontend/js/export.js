import { state, elements, setStatus, setExportBusy, sanitizeFilePart } from './state.js';
import { currentDeck, currentList, currentPageLabel } from './ui.js';

export async function ensureExportFontsReady(node) {
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const images = Array.from(node.querySelectorAll('img'));
  await Promise.all(images.map(async (image) => {
    if (typeof image.decode === 'function') {
      try {
        await image.decode();
      } catch {
        return;
      }
    }
  }));

  if (
    window.htmlToImage &&
    typeof window.htmlToImage.getFontEmbedCSS === 'function' &&
    !state.fontEmbedCSS
  ) {
    state.fontEmbedCSS = await window.htmlToImage.getFontEmbedCSS(document.documentElement);
  }
}

/**
 * Pre-convert tất cả img.src thành blob URL tuần tự (từng cái một, không song song)
 * để tránh race condition trong htmlToImage khi nó fetch nhiều ảnh cùng lúc.
 * Trả về danh sách blob/**
 * Caching image blobs during a batch session to avoid redundant fetches.
 */
let batchImageCache = new Map();

async function getCachedImageBlob(src) {
  if (!src || src.startsWith('blob:') || src.startsWith('data:')) {
    return null;
  }
  if (batchImageCache.has(src)) {
    const blob = batchImageCache.get(src);
    return URL.createObjectURL(blob);
  }
  try {
    const response = await fetch(src, { cache: 'force-cache' });
    if (!response.ok) return null;
    const blob = await response.blob();
    batchImageCache.set(src, blob);
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

async function inlineImagesAsBlobs(node) {
  const imgs = Array.from(node.querySelectorAll('img'));
  const blobUrls = [];

  for (const img of imgs) {
    const originalSrc = img.getAttribute('src');
    const blobUrl = await getCachedImageBlob(originalSrc);
    if (blobUrl) {
      img.dataset.originalSrc = originalSrc;
      img.src = blobUrl;
      blobUrls.push({ img, blobUrl, originalSrc });
      // Wait for image to load with blob
      if (!img.complete || img.naturalWidth === 0) {
        await new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
          setTimeout(resolve, 1000);
        });
      }
    }
  }

  return blobUrls;
}

function restoreImagesFromBlobs(blobUrls) {
  for (const { img, blobUrl, originalSrc } of blobUrls) {
    img.src = originalSrc;
    img.removeAttribute('data-original-src');
    URL.revokeObjectURL(blobUrl);
  }
}

export async function renderPageBlob(pageNode) {
  await ensureExportFontsReady(pageNode);
  const blobUrls = await inlineImagesAsBlobs(pageNode);

  try {
    if (window.htmlToImage && typeof window.htmlToImage.toBlob === 'function') {
      const blob = await window.htmlToImage.toBlob(pageNode, {
        pixelRatio: 3, // Reduced from 4 for performance while maintaining high quality
        cacheBust: false,
        backgroundColor: null,
        skipAutoScale: true,
        fontEmbedCSS: state.fontEmbedCSS || undefined,
      });
      if (!blob) throw new Error('Render failed');
      return blob;
    }
    // Fallback to html2canvas
    const canvas = await html2canvas(pageNode, { scale: 3, useCORS: true });
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    restoreImagesFromBlobs(blobUrls);
  }
}


function selectedPageNode() {
  return elements.pageGrid.querySelector(`.story-page[data-list-id="${CSS.escape(state.activeListId)}"][data-page-index="${state.selectedPageIndex}"]`);
}

export async function exportSelectedPagePng() {
  if (state.exporting) return;
  const deck = currentDeck();
  const list = currentList();
  const pageNode = selectedPageNode();
  if (!deck || !list || !pageNode) return;

  setExportBusy(true);
  setStatus(`Đang xuất PNG cho trang ${currentPageLabel()}...`);
  batchImageCache.clear(); // Clear cache for single export

  try {
    const blob = await renderPageBlob(pageNode);
    saveAs(blob, `${sanitizeFilePart(deck.id)}-${sanitizeFilePart(list.id)}-${pageNode.dataset.exportName}`);
    setStatus(`Đã xuất PNG.`);
  } catch (error) {
    setStatus(`Lỗi: ${error.message}`);
  } finally {
    setExportBusy(false);
  }
}

export async function exportActiveDeck() {
  if (state.exporting) return;
  const list = currentList();
  if (!list) return;

  setExportBusy(true);
  batchImageCache.clear();
  try {
    const blob = await generateZipForList(list);
    saveAs(blob, `${state.activeDeckId}-${sanitizeFilePart(list.id)}.zip`);
    setStatus(`Đã xong ZIP cho list "${list.title}".`);
  } catch (error) {
    setStatus(`Lỗi: ${error.message}`);
  } finally {
    setExportBusy(false);
  }
}

async function generateZipForList(list, zipInstance = null) {
  const currentZip = zipInstance || new JSZip();
  const deckId = state.activeDeckId || 'unknown';
  const folder = currentZip.folder(zipInstance ? sanitizeFilePart(list.id) : `${deckId}-${sanitizeFilePart(list.id)}`);
  
  const pageNodes = Array.from(elements.pageGrid.querySelectorAll(`.story-page[data-list-id="${CSS.escape(list.id)}"]`))
    .sort((a, b) => Number(a.dataset.pageIndex) - Number(b.dataset.pageIndex));
  
  if (pageNodes.length === 0) throw new Error(`List "${list.id}" not found in grid.`);

  const baseDate = Date.now();
  
  // Parallel processing with a small limit to prevent browser hang
  const concurrencyLimit = 3;
  for (let i = 0; i < pageNodes.length; i += concurrencyLimit) {
    const chunk = pageNodes.slice(i, i + concurrencyLimit);
    await Promise.all(chunk.map(async (pageNode, chunkIdx) => {
      const globalIdx = i + chunkIdx;
      setStatus(`Đang render "${list.title}": ${globalIdx + 1}/${pageNodes.length}...`);
      
      const blob = await renderPageBlob(pageNode);
      const exportName = pageNode.dataset.exportName || `page-${globalIdx + 1}.png`;
      folder.file(exportName, blob, {
        date: new Date(baseDate + (pageNodes.length - globalIdx) * 4000),
      });
    }));
  }

  // Generate metadata files
  const hashtags = Array.isArray(list.captionHashtags) ? list.captionHashtags.join(' ') : '';
  folder.file('caption.txt', `${list.description || list.title}\n\n${hashtags}`.trim());

  const locationNames = new Set();
  list.pages.forEach(p => p.items?.forEach(it => it.rawName && locationNames.add(it.rawName)));
  folder.file('partners.txt', Array.from(locationNames).sort().join('\n') || 'No locations');

  return zipInstance ? null : await currentZip.generateAsync({ type: 'blob' });
}

export async function exportBatch() {
  if (state.exporting || state.selectedListsForExport.size === 0) return;

  const listIds = Array.from(state.selectedListsForExport);
  const allListsFlattened = [];
  state.dataset.decks.forEach(deck => {
    deck.lists.forEach(list => {
      if (listIds.includes(list.id)) allListsFlattened.push({ deck, list });
    });
  });

  setExportBusy(true);
  batchImageCache.clear(); // Initialize cache for the entire batch

  try {
    const mainZip = new JSZip();
    for (const item of allListsFlattened) {
      if (state.activeDeckId !== item.deck.id) {
        state.activeDeckId = item.deck.id;
        state.activeListId = item.list.id;
        state.selectedPageIndex = 0;
        const ui = await import('./ui.js');
        ui.render();
        await new Promise(r => setTimeout(r, 400));
      }
      await generateZipForList(item.list, mainZip);
    }

    const archive = await mainZip.generateAsync({ type: 'blob' });
    saveAs(archive, `batch-export-${Date.now()}.zip`);
    setStatus(`Đã xuất xong ${allListsFlattened.length} list.`);
    
    state.selectedListsForExport.clear();
    const ui = await import('./ui.js');
    ui.hideExportModal();
    ui.render();
  } catch (error) {
    setStatus(`Lỗi: ${error.message}`);
  } finally {
    setExportBusy(false);
    batchImageCache.clear(); // Cleanup
  }
}
