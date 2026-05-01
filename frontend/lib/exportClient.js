'use client';

import { saveAs } from 'file-saver';
import * as htmlToImage from 'html-to-image';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { renderCoverPage, renderListPage } from './pageMarkup';
import { sanitizeFilePart } from './utils';

const EXPORT_PIXEL_RATIO = 2;
const BATCH_EXPORT_PIXEL_RATIO = EXPORT_PIXEL_RATIO;
const BATCH_IMAGE_FORMAT = 'image/png';
const BATCH_IMAGE_EXTENSION = 'png';
const BATCH_IMAGE_QUALITY = 1;
const BATCH_SOURCE_IMAGE_MAX_DIMENSION = 0;
const BATCH_SOURCE_IMAGE_QUALITY = 1;
const BATCH_IMAGE_PREPARE_CONCURRENCY = 72;
const IMAGE_FETCH_TIMEOUT_MS = 5000;
const IMAGE_READY_TIMEOUT_MS = 1200;
const PAGE_RENDER_TIMEOUT_MS = 16000;
const BATCH_PAGE_RENDER_TIMEOUT_MS = PAGE_RENDER_TIMEOUT_MS;
const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

let fontEmbedCSS = null;
let batchImageCache = new Map();
let batchExportRoot = null;

function noop() {}

function settleWithin(promise, timeoutMs) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).catch(() => null),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function rejectAfter(promise, timeoutMs, message) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

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
  const shouldEmbedFonts = options.embedFonts !== false;
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

  if (shouldEmbedFonts && !fontEmbedCSS && htmlToImage && typeof htmlToImage.getFontEmbedCSS === 'function') {
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

async function fetchImageBlob(src) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timedOut = false;
  const timer = controller
    ? setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, IMAGE_FETCH_TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(src, {
      cache: 'force-cache',
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!response.ok) return { blob: null, timedOut };
    return { blob: await response.blob(), timedOut };
  } catch {
    return { blob: null, timedOut };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function imageCacheKey(src, options = {}) {
  const maxDimension = Number(options.maxDimension || 0);
  if (!maxDimension) return src;
  return [
    src,
    Math.round(maxDimension),
    options.imageFormat || '',
    Number(options.imageQuality || 0).toFixed(3),
  ].join('|batch-image|');
}

function normalizeImageQuality(value, fallback) {
  const quality = Number(value);
  if (!Number.isFinite(quality) || quality <= 0 || quality > 1) return fallback;
  return quality;
}

async function resizeImageBlobForExport(blob, options = {}) {
  const maxDimension = Number(options.maxDimension || 0);
  if (!blob || !maxDimension || typeof createImageBitmap !== 'function') return blob;
  if (String(blob.type || '').includes('svg')) return blob;

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return blob;
  }

  try {
    const largestSide = Math.max(bitmap.width || 0, bitmap.height || 0);
    if (!largestSide) return blob;
    const scale = Math.min(1, maxDimension / largestSide);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await canvasToBlob(
      canvas,
      options.imageFormat || blob.type || 'image/jpeg',
      normalizeImageQuality(options.imageQuality, 0.82),
    ) || blob;
  } finally {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close();
  }
}

async function getCachedImageBlobUrl(src, options = {}) {
  if (!src || src.startsWith('blob:') || src.startsWith('data:')) {
    return { blobUrl: null, timedOut: false };
  }

  const cacheKey = imageCacheKey(src, options);
  if (batchImageCache.has(cacheKey)) {
    const entry = batchImageCache.get(cacheKey);
    const result = await entry.blobPromise;
    const blob = result?.blob || null;
    if (!blob) return { blobUrl: null, timedOut: Boolean(result?.timedOut) };
    if (!entry.objectUrl) entry.objectUrl = URL.createObjectURL(blob);
    return { blobUrl: entry.objectUrl, timedOut: false };
  }

  const blobPromise = fetchImageBlob(src).then(async (result) => {
    if (!result?.blob) return result;
    return {
      ...result,
      blob: await resizeImageBlobForExport(result.blob, options),
    };
  });

  const entry = { blobPromise, objectUrl: null };
  batchImageCache.set(cacheKey, entry);
  const result = await blobPromise;
  const blob = result?.blob || null;
  if (!blob) {
    return { blobUrl: null, timedOut: Boolean(result?.timedOut) };
  }
  entry.objectUrl = URL.createObjectURL(blob);
  return { blobUrl: entry.objectUrl, timedOut: false };
}

async function waitForImageReady(img) {
  if (img.complete && img.naturalWidth > 0) {
    if (typeof img.decode === 'function') {
      try {
        await settleWithin(img.decode(), IMAGE_READY_TIMEOUT_MS);
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
    const timer = setTimeout(done, IMAGE_READY_TIMEOUT_MS);
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
  await new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve();
    };
    const timer = setTimeout(done, IMAGE_READY_TIMEOUT_MS);
    image.onload = done;
    image.onerror = done;
    image.src = url;

    if (typeof image.decode === 'function') {
      settleWithin(image.decode(), IMAGE_READY_TIMEOUT_MS).then(done, done);
    }
  });
}

function shouldInlineImageSource(src, options = {}) {
  if (!src || src.startsWith('blob:') || src.startsWith('data:')) return false;
  if (!options.onlyCrossOrigin) return true;
  try {
    return new URL(src, window.location.href).origin !== window.location.origin;
  } catch {
    return true;
  }
}

async function waitForNodeImagesReady(nodes, timeoutMs = IMAGE_READY_TIMEOUT_MS) {
  const images = nodes.flatMap((node) => Array.from(node.querySelectorAll('img')));
  await mapWithConcurrency(images, 24, (img) => settleWithin(waitForImageReady(img), timeoutMs));
}

function collectImageTargets(node, options = {}) {
  const imageTargets = Array.from(node.querySelectorAll('img'))
    .map((img) => ({
      kind: 'img',
      img,
      originalSrc: img.getAttribute('src'),
    }))
    .filter((target) => shouldInlineImageSource(target.originalSrc, options));
  const backgroundTargets = Array.from(node.querySelectorAll('[style*="background-image"]')).map((element) => {
    const originalBackgroundImage = element.style.backgroundImage;
    return {
      kind: 'background',
      element,
      originalBackgroundImage,
      originalSrc: extractCssUrl(originalBackgroundImage),
    };
  }).filter((target) => shouldInlineImageSource(target.originalSrc, options));
  return imageTargets.concat(backgroundTargets);
}

async function prepareImageTarget(target, options = {}) {
  const shouldWaitForReady = options.waitForReady !== false;
  const blobOptions = {
    maxDimension: options.maxImageDimension,
    imageFormat: options.sourceImageFormat,
    imageQuality: options.sourceImageQuality,
  };

  if (target.kind === 'img') {
    const { img, originalSrc } = target;
    const { blobUrl, timedOut } = await getCachedImageBlobUrl(originalSrc, blobOptions);
    if (!blobUrl) {
      if (timedOut && originalSrc) {
        img.dataset.originalSrc = originalSrc;
        img.src = TRANSPARENT_PIXEL;
        return { img, originalSrc };
      }
      return null;
    }

    img.dataset.originalSrc = originalSrc;
    img.src = blobUrl;
    if (shouldWaitForReady) {
      await waitForImageReady(img);
    }
    return { img, originalSrc };
  }

  const { element, originalBackgroundImage, originalSrc } = target;
  const { blobUrl, timedOut } = await getCachedImageBlobUrl(originalSrc, blobOptions);
  if (!blobUrl) {
    if (timedOut && originalBackgroundImage) {
      element.dataset.originalBackgroundImage = originalBackgroundImage;
      element.style.backgroundImage = 'none';
      return { element, originalBackgroundImage };
    }
    return null;
  }

  element.dataset.originalBackgroundImage = originalBackgroundImage;
  element.style.backgroundImage = originalBackgroundImage.replace(/url\((['"]?)(.*?)\1\)/i, `url("${blobUrl}")`);
  if (shouldWaitForReady) {
    await waitForBackgroundReady(blobUrl);
  }
  return { element, originalBackgroundImage };
}

async function prepareImageTargets(targets, options = {}) {
  const concurrency = Number(options.concurrency || 10);
  const handles = await mapWithConcurrency(targets, concurrency, (target) => prepareImageTarget(target, options));
  return handles.filter(Boolean);
}

async function inlineImagesAsBlobs(node, options = {}) {
  return prepareImageTargets(collectImageTargets(node, options), options);
}

async function inlineImagesForNodes(nodes, options = {}) {
  const targets = nodes.flatMap((node) => collectImageTargets(node, options));
  return prepareImageTargets(targets, options);
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
    return renderCoverPage(page, index, list.pages.length, list.id, list.captionHashtags || [], list);
  }
  return renderListPage(page, index, list.pages.length, list.id, list.captionHashtags || [], list);
}

function prepareExportStoryPages(pageNodes) {
  pageNodes.forEach((pageNode) => {
    pageNode.querySelectorAll('img').forEach((img) => {
      img.loading = 'eager';
      img.decoding = 'sync';
      img.fetchPriority = 'high';
    });
  });
  return pageNodes;
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

  return prepareExportStoryPages(Array.from(root.querySelectorAll(`.story-page[data-list-id="${CSS.escape(list.id)}"]`)))
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
  const normalizedValues = values
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const valueCells = normalizedValues.map((value, index) =>
    `<c r="${columnName(index)}1" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`,
  ).join('');
  const cols = normalizedValues.map((_, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="24" customWidth="1"/>`,
  ).join('');
  const colsXml = cols ? `<cols>${cols}</cols>` : '';
  const sheetDataXml = valueCells
    ? `<sheetData>
    <row r="1">${valueCells}</row>
  </sheetData>`
    : '<sheetData/>';

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
  ${colsXml}
  ${sheetDataXml}
</worksheet>`);

  return workbookZip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    compression: 'STORE',
  });
}

function renderConcurrencyLimit() {
  const cores = Number(navigator.hardwareConcurrency || 4);
  return cores >= 8 ? 3 : 2;
}

function batchRenderConcurrencyLimit() {
  const cores = Number(navigator.hardwareConcurrency || 4);
  if (cores >= 12) return 18;
  if (cores >= 8) return 14;
  return 8;
}

function collectPartnerNames(list) {
  const partnerNames = new Set();
  list.pages?.forEach((page) => {
    page.items?.forEach((item) => {
      const partnerName = String(item?.rawName || '').trim();
      if (item?.isPartner && partnerName) {
        partnerNames.add(partnerName);
      }
    });
  });

  return Array.from(partnerNames).sort((a, b) => a.localeCompare(b, 'vi'));
}

function canvasToBlob(canvas, imageFormat = 'image/png', imageQuality = 1) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, imageFormat, imageQuality);
  });
}

function exportNameWithExtension(pageNode, index, extension = 'png') {
  const fallbackName = `page-${index + 1}.${extension}`;
  const exportName = pageNode.dataset.exportName
    || pageNode.querySelector?.('.story-page')?.dataset?.exportName
    || fallbackName;
  if (extension === 'png') return exportName;
  const renamed = exportName.replace(/\.[^.]+$/, `.${extension}`);
  return renamed === exportName ? `${exportName}.${extension}` : renamed;
}

function createListFolder(zip, list, zipInstance, deckId) {
  return zip.folder(zipInstance ? sanitizeFilePart(list.id) : `${deckId}-${sanitizeFilePart(list.id)}`);
}

async function addListMetadataFiles(folder, list) {
  const hashtags = Array.isArray(list.captionHashtags) ? list.captionHashtags.join(' ') : '';
  folder.file('caption.txt', `${list.description || list.title}\n\n${hashtags}`.trim());
  folder.file('partners.xlsx', await createHorizontalXlsx(collectPartnerNames(list)));
}

function renderBatchTaskPages(tasks) {
  const root = ensureBatchExportRoot();
  root.innerHTML = `<div class="list-preview-grid batch-export-grid">${tasks.map((task) =>
    renderPageMarkupForExport(task.list, task.page, task.pageIndex)).join('')}</div>`;
  const pageNodes = prepareExportStoryPages(Array.from(root.querySelectorAll('.story-page')));
  return tasks.map((task, index) => ({ ...task, pageNode: pageNodes[index] || null }));
}

export async function renderPageBlob(pageNode, options = {}) {
  const imagesReady = options.imagesReady === true;
  const pixelRatio = Number(options.pixelRatio || EXPORT_PIXEL_RATIO);
  const renderTimeoutMs = Number(options.renderTimeoutMs || PAGE_RENDER_TIMEOUT_MS);
  const imageFormat = options.imageFormat || 'image/png';
  const imageQuality = Number(options.imageQuality || 1);
  const backgroundColor = options.backgroundColor ?? (imageFormat === 'image/jpeg' ? '#ffffff' : null);
  const preferHtml2Canvas = options.preferHtml2Canvas === true;
  const shouldEmbedFonts = options.embedFonts !== false;
  await ensureExportFontsReady(pageNode, { decodeImages: !imagesReady, embedFonts: shouldEmbedFonts });
  const blobUrls = imagesReady ? [] : await inlineImagesAsBlobs(pageNode, { waitForReady: options.waitForImageReady });

  try {
    if (preferHtml2Canvas) {
      try {
        const canvas = await rejectAfter(html2canvas(pageNode, {
          scale: pixelRatio,
          useCORS: true,
          imageTimeout: IMAGE_FETCH_TIMEOUT_MS,
          backgroundColor,
          logging: false,
        }), renderTimeoutMs, 'Canvas render timed out');
        const blob = await canvasToBlob(canvas, imageFormat, imageQuality);
        if (blob) return blob;
      } catch (error) {
        console.warn('Fast canvas export failed, retrying with html-to-image.', error);
      }
    }
    if (imageFormat === 'image/png' && htmlToImage && typeof htmlToImage.toBlob === 'function') {
      try {
        const blob = await rejectAfter(htmlToImage.toBlob(pageNode, {
          pixelRatio,
          cacheBust: false,
          backgroundColor,
          skipAutoScale: true,
          skipFonts: !shouldEmbedFonts,
          fontEmbedCSS: shouldEmbedFonts ? fontEmbedCSS || undefined : undefined,
        }), renderTimeoutMs, 'Render timed out');
        if (blob) return blob;
      } catch (error) {
        console.warn('html-to-image export failed, retrying with canvas.', error);
      }
    }
    if (htmlToImage && typeof htmlToImage.toCanvas === 'function') {
      try {
        const canvas = await rejectAfter(htmlToImage.toCanvas(pageNode, {
          pixelRatio,
          cacheBust: false,
          backgroundColor,
          skipAutoScale: true,
          skipFonts: !shouldEmbedFonts,
          fontEmbedCSS: shouldEmbedFonts ? fontEmbedCSS || undefined : undefined,
        }), renderTimeoutMs, 'Canvas render timed out');
        const blob = await canvasToBlob(canvas, imageFormat, imageQuality);
        if (blob) return blob;
      } catch (error) {
        console.warn('html-to-image canvas export failed, retrying with html2canvas.', error);
      }
    }
    try {
      const canvas = await rejectAfter(html2canvas(pageNode, {
        scale: pixelRatio,
        useCORS: true,
        imageTimeout: IMAGE_FETCH_TIMEOUT_MS,
        backgroundColor,
        logging: false,
      }), renderTimeoutMs, 'Canvas render timed out');
      const blob = await canvasToBlob(canvas, imageFormat, imageQuality);
      if (blob) return blob;
    } catch (error) {
      console.warn('Canvas export failed, writing a fallback page.', error);
    }
    return createFallbackPageBlob(pageNode, pixelRatio, imageFormat, imageQuality);
  } finally {
    restoreImagesFromBlobs(blobUrls);
  }
}

function createFallbackPageBlob(pageNode, pixelRatio = 1, imageFormat = 'image/png', imageQuality = 1) {
  const rect = pageNode.getBoundingClientRect();
  const width = Math.max(1, Math.round((rect.width || 397) * pixelRatio));
  const height = Math.max(1, Math.round((rect.height || 562) * pixelRatio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f7f5ef';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#1f3b2f';
    ctx.font = `${Math.max(14, Math.round(18 * pixelRatio))}px Arial, sans-serif`;
    ctx.fillText('Render timeout', Math.round(24 * pixelRatio), Math.round(48 * pixelRatio));
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob || new Blob([], { type: imageFormat })), imageFormat, imageQuality);
  });
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
  const folder = createListFolder(currentZip, list, zipInstance, deckId);
  const pageNodes = (options.pageNodes || renderPagesForExport(list))
    .sort((a, b) => Number(a.dataset.pageIndex) - Number(b.dataset.pageIndex));

  if (pageNodes.length === 0) throw new Error(`List "${list.id}" not found in grid.`);

  const baseDate = Date.now();
  const concurrencyLimit = Number(options.renderConcurrencyLimit || renderConcurrencyLimit());
  for (let i = 0; i < pageNodes.length; i += concurrencyLimit) {
    const chunk = pageNodes.slice(i, i + concurrencyLimit);
    const chunkStart = i + 1;
    const chunkEnd = i + chunk.length;
    cb.setStatus(`Đang chuẩn bị ảnh "${list.title}": ${chunkStart}-${chunkEnd}/${pageNodes.length}...`);
    options.onChunkPreparing?.({ list, chunkStart, chunkEnd, pageCount: pageNodes.length });
    const preparedImages = (await Promise.all(chunk.map((pageNode) => inlineImagesAsBlobs(pageNode, {
      waitForReady: options.waitForImageReady,
    })))).flat();
    try {
      await Promise.all(chunk.map(async (pageNode, chunkIdx) => {
        const globalIdx = i + chunkIdx;
        cb.setStatus(`Đang render "${list.title}": ${globalIdx + 1}/${pageNodes.length}...`);

        const blob = await renderPageBlob(pageNode, {
          imagesReady: true,
          pixelRatio: options.pixelRatio,
          renderTimeoutMs: options.renderTimeoutMs,
          imageFormat: options.imageFormat,
          imageQuality: options.imageQuality,
          backgroundColor: options.backgroundColor,
          preferHtml2Canvas: options.preferHtml2Canvas,
          embedFonts: options.embedFonts,
          waitForImageReady: options.waitForImageReady,
        });
        const exportName = exportNameWithExtension(pageNode, globalIdx, options.fileExtension || 'png');
        folder.file(exportName, blob, {
          date: new Date(baseDate + (pageNodes.length - globalIdx) * 4000),
          compression: 'STORE',
        });
        options.onPageRendered?.({ list, pageNode, pageIndex: globalIdx, pageCount: pageNodes.length });
      }));
    } finally {
      restoreImagesFromBlobs(preparedImages);
    }
  }

  await addListMetadataFiles(folder, list);

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
      onChunkPreparing: ({ chunkStart, chunkEnd, pageCount }) => {
        cb.updateProgress(10 + (renderedPages / totalPages) * 75, `Đang chuẩn bị ảnh "${list.title}": ${chunkStart}-${chunkEnd}/${pageCount} trang...`);
      },
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
    cb.updateProgress(3, `Đang chuẩn bị ${allLists.length} folder chất lượng cao...`);
    await ensureExportFontsReady(document.documentElement, { decodeImages: false, embedFonts: true });

    const folders = allLists.map((item) => createListFolder(mainZip, item.list, true, item.deck.id));
    await mapWithConcurrency(allLists, 6, (item, index) => addListMetadataFiles(folders[index], item.list));

    const pageTasks = [];
    allLists.forEach((item, listIndex) => {
      const pages = item.list.pages || [];
      if (pages.length === 0) {
        throw new Error(`List "${item.list.id}" not found in grid.`);
      }
      pages.forEach((page, pageIndex) => {
        pageTasks.push({
          list: item.list,
          listIndex,
          page,
          pageIndex,
          pageCount: pages.length,
          folder: folders[listIndex],
        });
      });
    });

    const baseDate = Date.now();
    const concurrencyLimit = batchRenderConcurrencyLimit();
    for (let i = 0; i < pageTasks.length; i += concurrencyLimit) {
      const chunk = pageTasks.slice(i, i + concurrencyLimit);
      const chunkStart = i + 1;
      const chunkEnd = i + chunk.length;
      cb.setStatus(`Đang chuẩn bị ảnh chất lượng cao ${chunkStart}-${chunkEnd}/${pageTasks.length} trang...`);
      cb.updateProgress(3 + (renderedPages / totalPages) * 86, `Đang chuẩn bị ảnh chất lượng cao ${chunkStart}-${chunkEnd}/${pageTasks.length} trang...`);
      const renderedChunk = renderBatchTaskPages(chunk);
      await waitForExportLayout();
      if (renderedChunk.some((task) => !task.pageNode)) {
        throw new Error('Không dựng được một số trang để xuất.');
      }
      await waitForNodeImagesReady(renderedChunk.map((task) => task.pageNode));

      const preparedImages = await inlineImagesForNodes(renderedChunk.map((task) => task.pageNode), {
        waitForReady: false,
        onlyCrossOrigin: true,
        concurrency: BATCH_IMAGE_PREPARE_CONCURRENCY,
        maxImageDimension: BATCH_SOURCE_IMAGE_MAX_DIMENSION,
        sourceImageFormat: BATCH_IMAGE_FORMAT,
        sourceImageQuality: BATCH_SOURCE_IMAGE_QUALITY,
      });

      try {
        await Promise.all(renderedChunk.map(async (task, chunkIdx) => {
          const globalIdx = i + chunkIdx;
          const blob = await renderPageBlob(task.pageNode, {
            imagesReady: true,
            pixelRatio: BATCH_EXPORT_PIXEL_RATIO,
            imageFormat: BATCH_IMAGE_FORMAT,
            imageQuality: BATCH_IMAGE_QUALITY,
            embedFonts: true,
            waitForImageReady: false,
            renderTimeoutMs: BATCH_PAGE_RENDER_TIMEOUT_MS,
          });
          const exportName = exportNameWithExtension(task.pageNode, task.pageIndex, BATCH_IMAGE_EXTENSION);
          task.folder.file(exportName, blob, {
            date: new Date(baseDate + (pageTasks.length - globalIdx) * 4000),
            compression: 'STORE',
          });
          renderedPages += 1;
          cb.updateProgress(3 + (renderedPages / totalPages) * 86, `Đang render PNG chất lượng cao ${renderedPages}/${totalPages} trang...`);
        }));
      } finally {
        restoreImagesFromBlobs(preparedImages);
        clearBatchExportRoot();
      }
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
