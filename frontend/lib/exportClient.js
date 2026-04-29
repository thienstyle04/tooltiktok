'use client';

import { saveAs } from 'file-saver';
import * as htmlToImage from 'html-to-image';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { renderCoverPage, renderListPage } from './pageMarkup';
import { sanitizeFilePart } from './utils';

const EXPORT_PIXEL_RATIO = 3;

let fontEmbedCSS = null;
let batchImageCache = new Map();
let batchExportRoot = null;

function noop() {}

function exportCallbacks(callbacks = {}) {
  return {
    setStatus: callbacks.setStatus || noop,
    setBusy: callbacks.setBusy || noop,
    showProgress: callbacks.showProgress || noop,
    updateProgress: callbacks.updateProgress || noop,
    completeProgress: callbacks.completeProgress || noop,
    failProgress: callbacks.failProgress || noop,
  };
}

export async function ensureExportFontsReady(node, options = {}) {
  const shouldDecodeImages = options.decodeImages !== false;
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  if (shouldDecodeImages) {
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
  }

  if (!fontEmbedCSS && htmlToImage && typeof htmlToImage.getFontEmbedCSS === 'function') {
    fontEmbedCSS = await htmlToImage.getFontEmbedCSS(document.documentElement);
  }
}

function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(Math.max(limit, 1), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  return Promise.all(workers).then(() => results);
}

function resetBatchImageCache() {
  for (const entry of batchImageCache.values()) {
    if (entry?.objectUrl) {
      URL.revokeObjectURL(entry.objectUrl);
    }
  }
  batchImageCache.clear();
}

async function getCachedImageBlobUrl(src) {
  if (!src || src.startsWith('blob:') || src.startsWith('data:')) return null;

  if (batchImageCache.has(src)) {
    const entry = batchImageCache.get(src);
    const blob = await entry.blobPromise;
    if (!blob) return null;
    if (!entry.objectUrl) entry.objectUrl = URL.createObjectURL(blob);
    return entry.objectUrl;
  }

  const blobPromise = (async () => {
    const response = await fetch(src, { cache: 'force-cache' });
    if (!response.ok) return null;
    return response.blob();
  })().catch(() => null);

  const entry = { blobPromise, objectUrl: null };
  batchImageCache.set(src, entry);
  const blob = await blobPromise;
  if (!blob) {
    batchImageCache.delete(src);
    return null;
  }
  entry.objectUrl = URL.createObjectURL(blob);
  return entry.objectUrl;
}

async function waitForImageReady(img) {
  if (img.complete && img.naturalWidth > 0) {
    if (typeof img.decode === 'function') {
      try {
        await img.decode();
      } catch {
        // The browser can still paint some images whose decode promise rejects.
      }
    }
    return;
  }

  await new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      img.removeEventListener('load', done);
      img.removeEventListener('error', done);
      resolve();
    };
    const timer = setTimeout(done, 1000);
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  });
}

function extractCssUrl(value) {
  const match = String(value || '').match(/url\((['"]?)(.*?)\1\)/i);
  return match ? match[2] : '';
}

async function waitForBackgroundReady(url) {
  if (!url) return;
  const image = new Image();
  const loaded = new Promise((resolve) => {
    image.onload = resolve;
    image.onerror = resolve;
  });
  image.src = url;
  if (typeof image.decode === 'function') {
    try {
      await image.decode();
      return;
    } catch {
      // Fall through to load/error.
    }
  }
  await loaded;
}

async function inlineImagesAsBlobs(node) {
  const imgs = Array.from(node.querySelectorAll('img'));
  const imageBlobUrls = await mapWithConcurrency(imgs, 10, async (img) => {
    const originalSrc = img.getAttribute('src');
    const blobUrl = await getCachedImageBlobUrl(originalSrc);
    if (!blobUrl) return null;

    img.dataset.originalSrc = originalSrc;
    img.src = blobUrl;
    await waitForImageReady(img);
    return { img, originalSrc };
  });

  const backgroundNodes = Array.from(node.querySelectorAll('[style*="background-image"]'));
  const backgroundBlobUrls = await mapWithConcurrency(backgroundNodes, 10, async (element) => {
    const originalBackgroundImage = element.style.backgroundImage;
    const originalSrc = extractCssUrl(originalBackgroundImage);
    const blobUrl = await getCachedImageBlobUrl(originalSrc);
    if (!blobUrl) return null;

    element.dataset.originalBackgroundImage = originalBackgroundImage;
    element.style.backgroundImage = originalBackgroundImage.replace(/url\((['"]?)(.*?)\1\)/i, `url("${blobUrl}")`);
    await waitForBackgroundReady(blobUrl);
    return { element, originalBackgroundImage };
  });

  return imageBlobUrls.concat(backgroundBlobUrls).filter(Boolean);
}

function restoreImagesFromBlobs(handles) {
  for (const handle of handles) {
    if (handle.img) {
      handle.img.src = handle.originalSrc;
      handle.img.removeAttribute('data-original-src');
    } else if (handle.element) {
      handle.element.style.backgroundImage = handle.originalBackgroundImage;
      handle.element.removeAttribute('data-original-background-image');
    }
  }
}

function ensureBatchExportRoot() {
  if (!batchExportRoot || !document.body.contains(batchExportRoot)) {
    batchExportRoot = document.createElement('div');
    batchExportRoot.className = 'batch-export-root';
    batchExportRoot.setAttribute('aria-hidden', 'true');
    document.body.appendChild(batchExportRoot);
  }
  return batchExportRoot;
}

function clearBatchExportRoot() {
  if (batchExportRoot) {
    batchExportRoot.textContent = '';
  }
}

function renderPageMarkupForExport(list, page, index) {
  if (page.type === 'cover') {
    return renderCoverPage(page, index, list.pages.length, list.id, list.captionHashtags || []);
  }
  return renderListPage(page, index, list.pages.length, list.id, list.captionHashtags || []);
}

function renderPagesForExport(list, options = {}) {
  const root = ensureBatchExportRoot();
  const pageEntries = Number.isInteger(options.pageIndex)
    ? [[list.pages[options.pageIndex], options.pageIndex]]
    : list.pages.map((page, index) => [page, index]);
  const pagesHtml = pageEntries
    .filter(([page]) => Boolean(page))
    .map(([page, index]) => renderPageMarkupForExport(list, page, index))
    .join('');

  root.innerHTML = `<div class="list-preview-grid batch-export-grid">${pagesHtml}</div>`;

  return Array.from(root.querySelectorAll(`.story-page[data-list-id="${CSS.escape(list.id)}"]`))
    .sort((a, b) => Number(a.dataset.pageIndex) - Number(b.dataset.pageIndex));
}

async function waitForExportLayout() {
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function columnName(index) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

async function createHorizontalXlsx(values, sheetName = 'Doi tac') {
  const workbookZip = new JSZip();
  const normalizedValues = values.length > 0 ? values : ['No locations'];
  const valueCells = normalizedValues.map((value, index) =>
    `<c r="${columnName(index)}1" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`,
  ).join('');
  const cols = normalizedValues.map((_, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="24" customWidth="1"/>`,
  ).join('');

  workbookZip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);
  workbookZip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  workbookZip.folder('xl').file('workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`);
  workbookZip.folder('xl').folder('_rels').file('workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  workbookZip.folder('xl').file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`);
  workbookZip.folder('xl').folder('worksheets').file('sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>${cols}</cols>
  <sheetData>
    <row r="1">${valueCells}</row>
  </sheetData>
</worksheet>`);

  return workbookZip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    compression: 'STORE',
  });
}

function renderConcurrencyLimit() {
  const cores = Number(navigator.hardwareConcurrency || 4);
  return cores >= 8 ? 4 : 3;
}

export async function renderPageBlob(pageNode, options = {}) {
  const imagesReady = options.imagesReady === true;
  await ensureExportFontsReady(pageNode, { decodeImages: !imagesReady });
  const blobUrls = imagesReady ? [] : await inlineImagesAsBlobs(pageNode);

  try {
    if (htmlToImage && typeof htmlToImage.toBlob === 'function') {
      const blob = await htmlToImage.toBlob(pageNode, {
        pixelRatio: EXPORT_PIXEL_RATIO,
        cacheBust: false,
        backgroundColor: null,
        skipAutoScale: true,
        fontEmbedCSS: fontEmbedCSS || undefined,
      });
      if (!blob) throw new Error('Render failed');
      return blob;
    }
    const canvas = await html2canvas(pageNode, { scale: EXPORT_PIXEL_RATIO, useCORS: true });
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    restoreImagesFromBlobs(blobUrls);
  }
}

export async function exportSelectedPagePng(context, callbacks = {}) {
  const cb = exportCallbacks(callbacks);
  const { deck, list, selectedPageIndex } = context;
  if (!deck || !list) return;

  cb.setBusy(true);
  cb.setStatus(`Đang xuất PNG cho trang ${selectedPageIndex + 1}/${list.pages.length}...`);
  cb.showProgress(`Chuẩn bị xuất trang ${selectedPageIndex + 1}/${list.pages.length}...`, 5);
  resetBatchImageCache();

  try {
    const pageNodes = renderPagesForExport(list, { pageIndex: selectedPageIndex });
    await waitForExportLayout();
    cb.updateProgress(18, `Đang dựng layout trang ${selectedPageIndex + 1}/${list.pages.length}...`);
    const pageNode = pageNodes.find((node) => Number(node.dataset.pageIndex) === selectedPageIndex);
    if (!pageNode) throw new Error(`Không tìm thấy trang ${selectedPageIndex + 1}/${list.pages.length} để xuất.`);
    cb.updateProgress(36, 'Đang chuẩn bị ảnh cho trang...');
    const preparedImages = await inlineImagesAsBlobs(pageNode);
    let blob;
    try {
      cb.updateProgress(66, 'Đang render PNG...');
      blob = await renderPageBlob(pageNode, { imagesReady: true });
    } finally {
      restoreImagesFromBlobs(preparedImages);
    }
    cb.updateProgress(92, 'Đang lưu file PNG...');
    saveAs(blob, `${sanitizeFilePart(deck.id)}-${sanitizeFilePart(list.id)}-${pageNode.dataset.exportName}`);
    cb.completeProgress('Đã xuất xong PNG.');
    cb.setStatus('Đã xuất PNG.');
  } catch (error) {
    cb.failProgress('Xuất PNG thất bại.');
    cb.setStatus(`Lỗi: ${error.message}`);
  } finally {
    clearBatchExportRoot();
    resetBatchImageCache();
    cb.setBusy(false);
  }
}

async function generateZipForList(list, zipInstance = null, options = {}, callbacks = {}) {
  const cb = exportCallbacks(callbacks);
  const currentZip = zipInstance || new JSZip();
  const deckId = options.deckId || 'unknown';
  const folder = currentZip.folder(zipInstance ? sanitizeFilePart(list.id) : `${deckId}-${sanitizeFilePart(list.id)}`);
  const pageNodes = (options.pageNodes || renderPagesForExport(list))
    .sort((a, b) => Number(a.dataset.pageIndex) - Number(b.dataset.pageIndex));

  if (pageNodes.length === 0) throw new Error(`List "${list.id}" not found in grid.`);

  const baseDate = Date.now();
  const preparedImages = await inlineImagesAsBlobs(options.imageRoot || pageNodes[0].parentElement || pageNodes[0]);
  try {
    const concurrencyLimit = renderConcurrencyLimit();
    for (let i = 0; i < pageNodes.length; i += concurrencyLimit) {
      const chunk = pageNodes.slice(i, i + concurrencyLimit);
      await Promise.all(chunk.map(async (pageNode, chunkIdx) => {
        const globalIdx = i + chunkIdx;
        cb.setStatus(`Đang render "${list.title}": ${globalIdx + 1}/${pageNodes.length}...`);

        const blob = await renderPageBlob(pageNode, { imagesReady: true });
        const exportName = pageNode.dataset.exportName || `page-${globalIdx + 1}.png`;
        folder.file(exportName, blob, {
          date: new Date(baseDate + (pageNodes.length - globalIdx) * 4000),
          compression: 'STORE',
        });
        options.onPageRendered?.({ list, pageNode, pageIndex: globalIdx, pageCount: pageNodes.length });
      }));
    }
  } finally {
    restoreImagesFromBlobs(preparedImages);
  }

  const hashtags = Array.isArray(list.captionHashtags) ? list.captionHashtags.join(' ') : '';
  folder.file('caption.txt', `${list.description || list.title}\n\n${hashtags}`.trim());

  const locationNames = new Set();
  list.pages.forEach((page) => page.items?.forEach((item) => item.rawName && locationNames.add(item.rawName)));
  folder.file('partners.xlsx', await createHorizontalXlsx(Array.from(locationNames).sort()));

  return zipInstance ? null : await currentZip.generateAsync({
    type: 'blob',
    compression: 'STORE',
    streamFiles: true,
  }, options.onZipProgress);
}

export async function exportActiveList(context, callbacks = {}) {
  const cb = exportCallbacks(callbacks);
  const { deck, list } = context;
  if (!deck || !list) return;

  cb.setBusy(true);
  cb.setStatus(`Đang chuẩn bị ZIP cho list "${list.title}"...`);
  cb.showProgress(`Chuẩn bị xuất ZIP "${list.title}"...`, 3);
  resetBatchImageCache();

  try {
    const pageNodes = renderPagesForExport(list);
    await waitForExportLayout();
    cb.updateProgress(8, `Đang dựng layout ${pageNodes.length} trang...`);
    let renderedPages = 0;
    const totalPages = Math.max(pageNodes.length, 1);
    const blob = await generateZipForList(list, null, {
      pageNodes,
      deckId: deck.id,
      onPageRendered: () => {
        renderedPages += 1;
        cb.updateProgress(10 + (renderedPages / totalPages) * 75, `Đang render "${list.title}": ${renderedPages}/${pageNodes.length} trang...`);
      },
      onZipProgress: (metadata) => {
        cb.updateProgress(85 + (Number(metadata?.percent || 0) * 0.14), 'Đang đóng file ZIP...');
      },
    }, cb);
    cb.updateProgress(99, 'Đang lưu file ZIP...');
    saveAs(blob, `${deck.id}-${sanitizeFilePart(list.id)}.zip`);
    cb.completeProgress(`Đã xuất xong ZIP cho "${list.title}".`);
    cb.setStatus(`Đã xong ZIP cho list "${list.title}".`);
  } catch (error) {
    cb.failProgress('Xuất ZIP thất bại.');
    cb.setStatus(`Lỗi: ${error.message}`);
  } finally {
    clearBatchExportRoot();
    resetBatchImageCache();
    cb.setBusy(false);
  }
}

export async function exportBatch(context, callbacks = {}) {
  const cb = exportCallbacks(callbacks);
  const { dataset, selectedListIds } = context;
  if (!dataset || selectedListIds.size === 0) return;

  const listIds = Array.from(selectedListIds);
  const allLists = [];
  dataset.decks.forEach((deck) => {
    deck.lists.forEach((list) => {
      if (listIds.includes(list.id)) allLists.push({ deck, list });
    });
  });

  cb.setBusy(true);
  cb.setStatus(`Đang chuẩn bị xuất ${allLists.length} list...`);
  cb.showProgress(`Chuẩn bị xuất ${allLists.length} list...`, 2);
  resetBatchImageCache();

  try {
    const mainZip = new JSZip();
    const totalPages = Math.max(allLists.reduce((total, item) => total + (item.list.pages?.length || 0), 0), 1);
    let renderedPages = 0;
    for (let index = 0; index < allLists.length; index += 1) {
      const item = allLists[index];
      cb.setStatus(`Chuẩn bị xuất ${index + 1}/${allLists.length}: "${item.list.title}"...`);
      cb.updateProgress(3 + (renderedPages / totalPages) * 86, `Chuẩn bị list ${index + 1}/${allLists.length}: "${item.list.title}"...`);
      const pageNodes = renderPagesForExport(item.list);
      await waitForExportLayout();
      await generateZipForList(item.list, mainZip, {
        pageNodes,
        deckId: item.deck.id,
        onPageRendered: () => {
          renderedPages += 1;
          cb.updateProgress(3 + (renderedPages / totalPages) * 86, `Đang render ${renderedPages}/${totalPages} trang...`);
        },
      }, cb);
      clearBatchExportRoot();
    }

    cb.updateProgress(90, 'Đang đóng file ZIP hàng loạt...');
    const archive = await mainZip.generateAsync({
      type: 'blob',
      compression: 'STORE',
      streamFiles: true,
    }, (metadata) => {
      cb.updateProgress(90 + (Number(metadata?.percent || 0) * 0.09), 'Đang đóng file ZIP hàng loạt...');
    });
    cb.updateProgress(99, 'Đang lưu file ZIP hàng loạt...');
    saveAs(archive, `batch-export-${Date.now()}.zip`);
    cb.completeProgress(`Đã xuất xong ${allLists.length} list.`);
    cb.setStatus(`Đã xuất xong ${allLists.length} list.`);
  } catch (error) {
    cb.failProgress('Xuất hàng loạt thất bại.');
    cb.setStatus(`Lỗi: ${error.message}`);
  } finally {
    cb.setBusy(false);
    clearBatchExportRoot();
    resetBatchImageCache();
  }
}
