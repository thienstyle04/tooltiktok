'use client';

import * as htmlToImage from 'html-to-image';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { renderCoverPage, renderListPage } from './pageMarkup';
import { listIsMain, sanitizeFilePart } from './utils';

/**
 * Download a blob as a file. More reliable than file-saver's saveAs because:
 * 1. file-saver silently fails in background tabs (browser blocks <a> click)
 * 2. We add retry logic and fallback to window.open for background tabs
 */
function downloadBlobFile(blob, filename) {
  let url = null;
  try {
    url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    // Give the browser time to start the download before cleanup
    setTimeout(() => {
      if (link.parentNode) link.parentNode.removeChild(link);
      if (url) URL.revokeObjectURL(url);
    }, 10000);
    return true;
  } catch (error) {
    // Fallback: open in new tab (works even in background)
    try {
      if (url) {
        window.open(url, '_blank');
        return true;
      }
    } catch (fallbackError) {
      console.warn(`Download fallback failed: ${fallbackError?.message || fallbackError}`);
    }
    console.warn(`Download failed: ${error?.message || error}${url ? ` Blob URL: ${url}` : ''}`);
    return false;
  }
}

const EXPORT_PIXEL_RATIO = 2;
const BATCH_EXPORT_PIXEL_RATIO = EXPORT_PIXEL_RATIO;
const BATCH_IMAGE_FORMAT = 'image/png';
const BATCH_IMAGE_EXTENSION = 'png';
const BATCH_IMAGE_QUALITY = 1;
const BATCH_SOURCE_IMAGE_MAX_DIMENSION = 0;
const BATCH_SOURCE_IMAGE_QUALITY = 1;
const BATCH_IMAGE_PREPARE_CONCURRENCY = 24;
const IMAGE_FETCH_TIMEOUT_MS = 25000;
const IMAGE_READY_TIMEOUT_MS = 5000;
const PAGE_RENDER_TIMEOUT_MS = 45000;
const BATCH_PAGE_RENDER_TIMEOUT_MS = 60000;
const BATCH_PAGE_RETRY_RENDER_TIMEOUT_MS = 120000;
const DEFAULT_EXPORT_CORNER_RADIUS = 28;
const HTML_TO_IMAGE_RENDER_OPTIONS = Object.freeze({
  cacheBust: false,
  // Drive proxy images are differentiated by ?id=..., so every template export must keep query params.
  includeQueryParams: true,
});
const BATCH_CACHE_TRIM_INTERVAL = 50;
const EXPORT_QUALITY_PROFILES = Object.freeze({
  optimized: {
    id: 'optimized',
    label: 'chất lượng cao tối ưu',
    pixelRatio: 2,
    imageFormat: 'image/png',
    imageExtension: 'png',
    imageQuality: 1,
    backgroundColor: null,
    sourceImageMaxDimension: 1800,
    sourceImageFormat: 'image/jpeg',
    sourceImageQuality: 0.86,
    imagePrepareConcurrency: 24,
    renderChunkSize: null,
    captureConcurrency: null,
    preferHtml2Canvas: true,
    renderTimeoutMs: BATCH_PAGE_RENDER_TIMEOUT_MS,
  },
  original: {
    id: 'original',
    label: 'chất lượng gốc',
    pixelRatio: BATCH_EXPORT_PIXEL_RATIO,
    imageFormat: BATCH_IMAGE_FORMAT,
    imageExtension: BATCH_IMAGE_EXTENSION,
    imageQuality: BATCH_IMAGE_QUALITY,
    sourceImageMaxDimension: BATCH_SOURCE_IMAGE_MAX_DIMENSION,
    sourceImageFormat: BATCH_IMAGE_FORMAT,
    sourceImageQuality: BATCH_SOURCE_IMAGE_QUALITY,
    imagePrepareConcurrency: BATCH_IMAGE_PREPARE_CONCURRENCY,
    renderChunkSize: null,
    captureConcurrency: null,
    renderTimeoutMs: BATCH_PAGE_RENDER_TIMEOUT_MS,
  },
});

let fontEmbedCSS = null;
let batchImageCache = new Map();
let batchExportRoot = null;
let activeWakeLock = null;

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

function exportQualityProfile(quality) {
  return EXPORT_QUALITY_PROFILES[quality] || EXPORT_QUALITY_PROFILES.optimized;
}

async function requestExportWakeLock() {
  if (activeWakeLock || typeof navigator === 'undefined' || !navigator.wakeLock?.request) return null;
  try {
    activeWakeLock = await navigator.wakeLock.request('screen');
    activeWakeLock.addEventListener?.('release', () => {
      activeWakeLock = null;
    });
  } catch {
    activeWakeLock = null;
  }
  return activeWakeLock;
}

async function releaseExportWakeLock() {
  const wakeLock = activeWakeLock;
  activeWakeLock = null;
  if (wakeLock && typeof wakeLock.release === 'function') {
    try {
      await wakeLock.release();
    } catch {
      // Ignore wake-lock release races; export cleanup must continue.
    }
  }
}

function parsePixelValue(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value || ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function exportCornerRadiusFor(pageNode, outputWidth) {
  const rect = pageNode.getBoundingClientRect();
  const scale = rect.width > 0 ? outputWidth / rect.width : 1;
  const styles = window.getComputedStyle?.(pageNode);
  const cssRadius = styles
    ? parsePixelValue(styles.borderTopLeftRadius, DEFAULT_EXPORT_CORNER_RADIUS)
    : DEFAULT_EXPORT_CORNER_RADIUS;
  return Math.max(0, Math.round(cssRadius * scale));
}

function roundedRectPath(ctx, width, height, radius) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(safeRadius, 0);
  ctx.lineTo(width - safeRadius, 0);
  ctx.quadraticCurveTo(width, 0, width, safeRadius);
  ctx.lineTo(width, height - safeRadius);
  ctx.quadraticCurveTo(width, height, width - safeRadius, height);
  ctx.lineTo(safeRadius, height);
  ctx.quadraticCurveTo(0, height, 0, height - safeRadius);
  ctx.lineTo(0, safeRadius);
  ctx.quadraticCurveTo(0, 0, safeRadius, 0);
  ctx.closePath();
}

function clipCanvasToPageCorners(sourceCanvas, pageNode, imageFormat, backgroundColor) {
  try {
    const width = sourceCanvas.width || 0;
    const height = sourceCanvas.height || 0;
    if (!width || !height) return sourceCanvas;
    const radius = exportCornerRadiusFor(pageNode, width);
    if (!radius) return sourceCanvas;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return sourceCanvas;

    if (imageFormat === 'image/jpeg') {
      ctx.fillStyle = backgroundColor || '#11110f';
      ctx.fillRect(0, 0, width, height);
    } else if (backgroundColor) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.save();
    roundedRectPath(ctx, width, height, radius);
    ctx.clip();
    ctx.drawImage(sourceCanvas, 0, 0, width, height);
    ctx.restore();
    return canvas;
  } catch {
    return sourceCanvas;
  }
}

async function clipBlobToPageCorners(blob, pageNode, imageFormat, imageQuality, backgroundColor) {
  if (!blob || typeof createImageBitmap !== 'function') return blob;

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return blob;
  }

  try {
    const width = bitmap.width || 0;
    const height = bitmap.height || 0;
    if (!width || !height) return blob;
    const radius = exportCornerRadiusFor(pageNode, width);
    if (!radius) return blob;

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const sourceCtx = sourceCanvas.getContext('2d');
    if (!sourceCtx) return blob;
    sourceCtx.drawImage(bitmap, 0, 0, width, height);

    const clippedCanvas = clipCanvasToPageCorners(sourceCanvas, pageNode, imageFormat, backgroundColor);
    return await canvasToBlob(clippedCanvas, imageFormat, imageQuality) || blob;
  } catch {
    return blob;
  } finally {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close();
  }
}

export async function ensureExportFontsReady(node, options = {}) {
  const shouldDecodeImages = options.decodeImages !== false;
  const shouldEmbedFonts = options.embedFonts !== false;
  if (document.fonts && document.fonts.ready) {
    await settleWithin(document.fonts.ready, 3000);
  }

  if (shouldDecodeImages) {
    const images = Array.from(node.querySelectorAll('img'));
    await Promise.all(images.map(async (image) => {
      if (typeof image.decode === 'function') {
        try {
          // Use settleWithin to avoid hanging in background tabs
          await settleWithin(image.decode(), IMAGE_READY_TIMEOUT_MS);
        } catch {
          return;
        }
      }
    }));
  }

  if (shouldEmbedFonts && !fontEmbedCSS && htmlToImage && typeof htmlToImage.getFontEmbedCSS === 'function') {
    fontEmbedCSS = await settleWithin(
      htmlToImage.getFontEmbedCSS(document.documentElement),
      5000,
    );
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
  for (let attempt = 0; attempt < 2; attempt += 1) {
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
        cache: attempt === 0 ? 'force-cache' : 'reload',
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!response.ok) {
        if (timer) clearTimeout(timer);
        if (attempt === 0) { await new Promise(r => setTimeout(r, 500)); continue; }
        return { blob: null, timedOut };
      }
      if (timer) clearTimeout(timer);
      return { blob: await response.blob(), timedOut: false };
    } catch {
      if (timer) clearTimeout(timer);
      if (attempt === 0 && !timedOut) { await new Promise(r => setTimeout(r, 500)); continue; }
      return { blob: null, timedOut };
    }
  }
  return { blob: null, timedOut: false };
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

function parseObjectPositionAxis(token, fallback = 0.5) {
  const value = String(token || '').trim().toLowerCase();
  if (!value || value === 'center') return 0.5;
  if (value === 'left' || value === 'top') return 0;
  if (value === 'right' || value === 'bottom') return 1;
  if (value.endsWith('%')) {
    const percent = Number.parseFloat(value);
    if (Number.isFinite(percent)) return Math.min(1, Math.max(0, percent / 100));
  }
  return fallback;
}

function imageObjectPosition(img) {
  const styles = window.getComputedStyle?.(img);
  const tokens = String(styles?.objectPosition || img.style.objectPosition || '50% 50%')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 1) {
    const token = tokens[0].toLowerCase();
    if (token === 'left' || token === 'right') return { x: parseObjectPositionAxis(token), y: 0.5 };
    if (token === 'top' || token === 'bottom') return { x: 0.5, y: parseObjectPositionAxis(token) };
  }
  return {
    x: parseObjectPositionAxis(tokens[0], 0.5),
    y: parseObjectPositionAxis(tokens[1], 0.5),
  };
}

async function fitImageBlobToElement(blob, img, options = {}) {
  if (!options.fitImagesToElement || !blob || typeof createImageBitmap !== 'function') return blob;
  if (String(blob.type || '').includes('svg')) return blob;

  const styles = window.getComputedStyle?.(img);
  const objectFit = String(styles?.objectFit || img.style.objectFit || '').trim();
  if (objectFit !== 'cover') return blob;

  const rect = img.getBoundingClientRect?.();
  const cssWidth = Number(rect?.width || img.clientWidth || 0);
  const cssHeight = Number(rect?.height || img.clientHeight || 0);
  if (cssWidth < 1 || cssHeight < 1) return blob;

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return blob;
  }

  try {
    const sourceWidth = bitmap.width || 0;
    const sourceHeight = bitmap.height || 0;
    if (!sourceWidth || !sourceHeight) return blob;

    const fitPixelRatio = Math.max(1, Number(options.fitPixelRatio || 1));
    const targetWidth = Math.max(1, Math.round(cssWidth * fitPixelRatio));
    const targetHeight = Math.max(1, Math.round(cssHeight * fitPixelRatio));
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = targetWidth / targetHeight;
    const position = imageObjectPosition(img);

    let sx = 0;
    let sy = 0;
    let sw = sourceWidth;
    let sh = sourceHeight;
    if (sourceRatio > targetRatio) {
      sw = Math.round(sourceHeight * targetRatio);
      sx = Math.round((sourceWidth - sw) * position.x);
    } else if (sourceRatio < targetRatio) {
      sh = Math.round(sourceWidth / targetRatio);
      sy = Math.round((sourceHeight - sh) * position.y);
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
    return await canvasToBlob(
      canvas,
      options.imageFormat || blob.type || 'image/jpeg',
      normalizeImageQuality(options.imageQuality, 0.86),
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
    if (!blob) return { blob: null, blobUrl: null, timedOut: Boolean(result?.timedOut) };
    if (!entry.objectUrl) entry.objectUrl = URL.createObjectURL(blob);
    return { blob, blobUrl: entry.objectUrl, timedOut: false };
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
    return { blob: null, blobUrl: null, timedOut: Boolean(result?.timedOut) };
  }
  entry.objectUrl = URL.createObjectURL(blob);
  return { blob, blobUrl: entry.objectUrl, timedOut: false };
}

async function waitForImageReady(img) {
  if (img.complete && img.naturalWidth > 0) {
    // Already loaded; skip decode in background tabs since it can stall.
    if (typeof img.decode === 'function' && document.visibilityState !== 'hidden') {
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
  const shouldUseUniqueObjectUrl = options.uniqueObjectUrl === true;
  const blobOptions = {
    maxDimension: options.maxImageDimension,
    imageFormat: options.sourceImageFormat,
    imageQuality: options.sourceImageQuality,
  };

  if (target.kind === 'img') {
    const { img, originalSrc } = target;
    const { blob, blobUrl } = await getCachedImageBlobUrl(originalSrc, blobOptions);
    const displayBlob = await fitImageBlobToElement(blob, img, {
      ...blobOptions,
      fitImagesToElement: options.fitImagesToElement,
      fitPixelRatio: options.fitPixelRatio,
    });
    const shouldUseTargetObjectUrl = Boolean(displayBlob && (shouldUseUniqueObjectUrl || displayBlob !== blob));
    const preparedBlobUrl = shouldUseTargetObjectUrl ? URL.createObjectURL(displayBlob) : blobUrl;
    if (!preparedBlobUrl) {
      if (shouldWaitForReady) {
        await waitForImageReady(img);
      }
      return null;
    }

    img.dataset.originalSrc = originalSrc;
    img.src = preparedBlobUrl;
    if (shouldWaitForReady) {
      await waitForImageReady(img);
    }
    return { img, originalSrc, objectUrl: shouldUseTargetObjectUrl ? preparedBlobUrl : null };
  }

  const { element, originalBackgroundImage, originalSrc } = target;
  const { blob, blobUrl } = await getCachedImageBlobUrl(originalSrc, blobOptions);
  const preparedBlobUrl = shouldUseUniqueObjectUrl && blob ? URL.createObjectURL(blob) : blobUrl;
  if (!preparedBlobUrl) {
    if (shouldWaitForReady) {
      await waitForBackgroundReady(originalSrc);
    }
    return null;
  }

  element.dataset.originalBackgroundImage = originalBackgroundImage;
  element.style.backgroundImage = originalBackgroundImage.replace(/url\((['"]?)(.*?)\1\)/i, `url("${preparedBlobUrl}")`);
  if (shouldWaitForReady) {
    await waitForBackgroundReady(preparedBlobUrl);
  }
  return { element, originalBackgroundImage, objectUrl: shouldUseUniqueObjectUrl ? preparedBlobUrl : null };
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
    if (handle.objectUrl) URL.revokeObjectURL(handle.objectUrl);
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

function findVisibleSelectedPageNode(list, selectedPageIndex) {
  if (!list?.id || !Number.isInteger(selectedPageIndex) || typeof CSS === 'undefined') return null;
  const selector = `.story-page[data-list-id="${CSS.escape(list.id)}"][data-page-index="${selectedPageIndex}"]`;
  return Array.from(document.querySelectorAll(selector)).find((node) =>
    !node.closest('.batch-export-root') && Boolean(node.closest('.slide-card-frame.is-selected')),
  ) || null;
}

function cloneVisiblePageForExport(sourceNode) {
  const root = ensureBatchExportRoot();
  const clone = sourceNode.cloneNode(true);
  clone.classList.remove('is-selected');
  clone.querySelectorAll('.is-selected').forEach((node) => node.classList.remove('is-selected'));
  clone.querySelectorAll('img').forEach((img) => {
    const currentSrc = img.currentSrc || img.src;
    if (currentSrc) img.src = currentSrc;
  });
  root.innerHTML = '<div class="list-preview-grid batch-export-grid"></div>';
  root.firstElementChild.appendChild(clone);
  return prepareExportStoryPages([clone])[0];
}

function forceLayoutSync() {
  // Force synchronous style recalculation + layout. Works in background tabs
  // unlike requestAnimationFrame which pauses when the tab is hidden.
  if (batchExportRoot) {
    batchExportRoot.getBoundingClientRect();
    // Force style flush: read a layout-dependent property.
    void batchExportRoot.offsetHeight;
  }
}

async function waitForExportLayout() {
  forceLayoutSync();
  // Use setTimeout only — never requestAnimationFrame — so exports
  // keep running when the browser tab is in the background.
  await new Promise((resolve) => setTimeout(resolve, 50));
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
  if (cores >= 12) return 12;
  if (cores >= 8) return 8;
  return 6;
}

function batchCaptureConcurrencyLimit() {
  const cores = Number(navigator.hardwareConcurrency || 4);
  if (cores >= 12) return 3;
  if (cores >= 8) return 3;
  return 2;
}

function batchRenderChunkSize(profile) {
  return Number(profile?.renderChunkSize || batchRenderConcurrencyLimit());
}

function batchCaptureConcurrencyForProfile(profile) {
  return Number(profile?.captureConcurrency || batchCaptureConcurrencyLimit());
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
  const coverTitle = String(list.coverTitle || list.title || list.navTitle || '').trim();
  const postCaption = String(list.postCaption || list.title || '').trim();
  const body = String(list.description || '').trim();
  const hashtags = Array.isArray(list.captionHashtags) ? list.captionHashtags.join(' ') : '';
  const captionParts = [postCaption, body, hashtags].filter(Boolean);
  folder.file('caption.txt', captionParts.join('\n\n').trim() || coverTitle);
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

  // Workaround: html2canvas cannot parse oklch() color function (Next.js 16 injects it).
  // Override all oklch references with transparent fallback during render.
  const oklchOverride = document.createElement('style');
  oklchOverride.textContent = `
    *, *::before, *::after {
      text-decoration-color: currentColor !important;
      accent-color: auto !important;
      caret-color: auto !important;
      outline-color: currentColor !important;
      column-rule-color: currentColor !important;
    }
  `;
  document.head.appendChild(oklchOverride);
  const imageQuality = Number(options.imageQuality || 1);
  const backgroundColor = options.backgroundColor ?? (imageFormat === 'image/jpeg' ? '#ffffff' : null);
  const preferHtml2Canvas = options.preferHtml2Canvas === true;
  const shouldEmbedFonts = options.embedFonts !== false;
  const allowFallback = options.allowFallback !== false;
  let cornersAlreadyClipped = false;
  const finalizeCanvasBlob = (canvas) => canvasToBlob(
    clipCanvasToPageCorners(canvas, pageNode, imageFormat, backgroundColor),
    imageFormat,
    imageQuality,
  );
  const finalizeBlob = (blob) => cornersAlreadyClipped ? blob : clipBlobToPageCorners(
    blob,
    pageNode,
    imageFormat,
    imageQuality,
    backgroundColor,
  );
  await ensureExportFontsReady(pageNode, { decodeImages: !imagesReady, embedFonts: shouldEmbedFonts });
  const blobUrls = imagesReady ? [] : await inlineImagesAsBlobs(pageNode, { waitForReady: options.waitForImageReady });

  try {
    // html2canvas is the preferred engine for batch exports because:
    // 1. It works reliably in background tabs (no rAF / foreignObject dependency)
    // 2. It renders CSS layout more faithfully than html-to-image's SVG pipeline
    // 3. It's faster: single-pass canvas draw vs SVG serialization + Image decode
    if (preferHtml2Canvas || document.visibilityState === 'hidden') {
      try {
        const canvas = await rejectAfter(html2canvas(pageNode, {
          scale: pixelRatio,
          useCORS: true,
          imageTimeout: 30000,
          backgroundColor,
          logging: false,
        }), renderTimeoutMs, 'Canvas render timed out');
        const blob = await finalizeCanvasBlob(canvas);
        if (blob) {
          cornersAlreadyClipped = true;
          return blob;
        }
      } catch (error) {
        console.warn(`html2canvas export failed, trying fallback: ${error?.message || error}`);
      }
    }
    // html-to-image SVG path: only used for single-page PNG exports in foreground.
    // Avoid in background tabs — foreignObject → Image pipeline freezes.
    if (document.visibilityState !== 'hidden') {
      if (imageFormat === 'image/png' && htmlToImage && typeof htmlToImage.toBlob === 'function') {
        try {
          const blob = await rejectAfter(htmlToImage.toBlob(pageNode, {
            pixelRatio,
            ...HTML_TO_IMAGE_RENDER_OPTIONS,
            backgroundColor,
            skipAutoScale: true,
            skipFonts: !shouldEmbedFonts,
            fontEmbedCSS: shouldEmbedFonts ? fontEmbedCSS || undefined : undefined,
          }), renderTimeoutMs, 'Render timed out');
          if (blob) return await finalizeBlob(blob);
        } catch (error) {
          console.warn(`html-to-image export failed, retrying with canvas: ${error?.message || error}`);
        }
      }
      if (htmlToImage && typeof htmlToImage.toCanvas === 'function') {
        try {
          const canvas = await rejectAfter(htmlToImage.toCanvas(pageNode, {
            pixelRatio,
            ...HTML_TO_IMAGE_RENDER_OPTIONS,
            backgroundColor,
            skipAutoScale: true,
            skipFonts: !shouldEmbedFonts,
            fontEmbedCSS: shouldEmbedFonts ? fontEmbedCSS || undefined : undefined,
          }), renderTimeoutMs, 'Canvas render timed out');
          const blob = await finalizeCanvasBlob(canvas);
          if (blob) {
            cornersAlreadyClipped = true;
            return blob;
          }
        } catch (error) {
          console.warn(`html-to-image canvas export failed, retrying with html2canvas: ${error?.message || error}`);
        }
      }
    }
    // Final html2canvas attempt (if we haven't tried it already)
    if (!preferHtml2Canvas && document.visibilityState !== 'hidden') {
      try {
        const canvas = await rejectAfter(html2canvas(pageNode, {
          scale: pixelRatio,
          useCORS: true,
          imageTimeout: 30000,
          backgroundColor,
          logging: false,
        }), renderTimeoutMs, 'Canvas render timed out');
        const blob = await finalizeCanvasBlob(canvas);
        if (blob) {
          cornersAlreadyClipped = true;
          return blob;
        }
      } catch (error) {
        console.warn(`Canvas export failed, writing a fallback page: ${error?.message || error}`);
      }
    }
    if (!allowFallback) {
      throw new Error('Render ảnh quá thời gian, chưa tạo được ảnh hợp lệ.');
    }
    const fallbackBlob = await createFallbackPageBlob(pageNode, pixelRatio, imageFormat, imageQuality);
    return await finalizeBlob(fallbackBlob);
  } finally {
    restoreImagesFromBlobs(blobUrls);
    if (oklchOverride.parentNode) oklchOverride.parentNode.removeChild(oklchOverride);
  }
}

async function renderPageBlobWithRetry(pageNode, options = {}) {
  try {
    return await renderPageBlob(pageNode, {
      ...options,
      allowFallback: false,
    });
  } catch (error) {
    console.warn(`Page render failed, retrying with a longer timeout: ${error?.message || error}`);
    // Use synchronous layout flush + short delay instead of rAF-based wait.
    forceLayoutSync();
    await new Promise((resolve) => setTimeout(resolve, 80));
    return renderPageBlob(pageNode, {
      ...options,
      allowFallback: options.allowFallbackOnRetry !== false,
      waitForImageReady: true,
      // In background tabs, always use html2canvas for reliable rendering.
      preferHtml2Canvas: options.preferHtml2Canvas || document.visibilityState === 'hidden',
      renderTimeoutMs: Math.max(
        Number(options.renderTimeoutMs || 0),
        BATCH_PAGE_RETRY_RENDER_TIMEOUT_MS,
      ),
    });
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
    const visiblePageNode = findVisibleSelectedPageNode(list, selectedPageIndex);
    const pageNodes = visiblePageNode
      ? [cloneVisiblePageForExport(visiblePageNode)]
      : renderPagesForExport(list, { pageIndex: selectedPageIndex });
    await waitForExportLayout();
    cb.updateProgress(18, `Đang dựng layout trang ${selectedPageIndex + 1}/${list.pages.length}...`);
    const pageNode = pageNodes.find((node) => Number(node.dataset.pageIndex) === selectedPageIndex);
    if (!pageNode) throw new Error(`Không tìm thấy trang ${selectedPageIndex + 1}/${list.pages.length} để xuất.`);
    cb.updateProgress(36, 'Đang chuẩn bị ảnh cho trang...');
    const preparedImages = await inlineImagesAsBlobs(pageNode, {
      fitImagesToElement: true,
      fitPixelRatio: EXPORT_PIXEL_RATIO,
    });
    let blob;
    try {
      cb.updateProgress(66, 'Đang render PNG...');
      blob = await renderPageBlobWithRetry(pageNode, { imagesReady: true });
    } finally {
      restoreImagesFromBlobs(preparedImages);
    }
    cb.updateProgress(92, 'Đang lưu file PNG...');
    if (!downloadBlobFile(blob, `${sanitizeFilePart(deck.id)}-${sanitizeFilePart(list.id)}-${pageNode.dataset.exportName}`)) {
      throw new Error('Trình duyệt chặn bước tải PNG. Hãy giữ tab tool đang mở rồi bấm xuất lại.');
    }
    cb.completeProgress('Đã xuất xong PNG.');
    cb.setStatus('Đã xuất PNG.');
  } catch (error) {
    const message = error?.message || 'Không rõ lỗi.';
    console.warn(`Page PNG export failed: ${message}`);
    cb.failProgress(`Xuất PNG thất bại: ${message}`);
    cb.setStatus(`Lỗi: ${message}`);
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
      fitImagesToElement: true,
      fitPixelRatio: options.pixelRatio || EXPORT_PIXEL_RATIO,
    })))).flat();
    try {
      await Promise.all(chunk.map(async (pageNode, chunkIdx) => {
        const globalIdx = i + chunkIdx;
        cb.setStatus(`Đang render "${list.title}": ${globalIdx + 1}/${pageNodes.length}...`);

        const blob = await renderPageBlobWithRetry(pageNode, {
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
    if (!downloadBlobFile(blob, `${deck.id}-${sanitizeFilePart(list.id)}.zip`)) {
      throw new Error('Trình duyệt chặn bước tải ZIP. Hãy giữ tab tool đang mở rồi bấm xuất lại.');
    }
    cb.completeProgress(`Đã xuất xong ZIP cho "${list.title}".`);
    cb.setStatus(`Đã xong ZIP cho list "${list.title}".`);
  } catch (error) {
    const message = error?.message || 'Không rõ lỗi.';
    console.warn(`List ZIP export failed: ${message}`);
    cb.failProgress(`Xuất ZIP thất bại: ${message}`);
    cb.setStatus(`Lỗi: ${message}`);
  } finally {
    clearBatchExportRoot();
    resetBatchImageCache();
    cb.setBusy(false);
  }
}

export async function exportBatch(context, callbacks = {}) {
  const cb = exportCallbacks(callbacks);
  const { dataset, selectedListIds, quality = 'optimized' } = context;
  if (!dataset || selectedListIds.size === 0) return;
  const qualityProfile = exportQualityProfile(quality);

  const listIds = Array.from(selectedListIds);
  const allLists = [];
  dataset.decks.forEach((deck) => {
    deck.lists.forEach((list) => {
      if (listIds.includes(list.id) && !listIsMain(list)) allLists.push({ deck, list });
    });
  });

  if (allLists.length === 0) {
    cb.setStatus('Chưa có list AI để xuất. List gốc/mẫu đã được bỏ qua.');
    cb.completeProgress('Không có list AI được chọn để xuất.');
    return;
  }

  cb.setBusy(true);
  cb.setStatus(`Đang chuẩn bị xuất ${allLists.length} list (${qualityProfile.label})...`);
  cb.showProgress(`Chuẩn bị xuất ${allLists.length} list (${qualityProfile.label})...`, 2);
  resetBatchImageCache();

  try {
    const mainZip = new JSZip();
    await requestExportWakeLock();
    const totalPages = Math.max(allLists.reduce((total, item) => total + (item.list.pages?.length || 0), 0), 1);
    let renderedPages = 0;
    cb.updateProgress(3, `Đang chuẩn bị ${allLists.length} folder ${qualityProfile.label}...`);
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
    const concurrencyLimit = batchRenderChunkSize(qualityProfile);
    let pagesSinceLastTrim = 0;
    for (let i = 0; i < pageTasks.length; i += concurrencyLimit) {
      const chunk = pageTasks.slice(i, i + concurrencyLimit);
      const chunkStart = i + 1;
      const chunkEnd = i + chunk.length;
      cb.setStatus(`Đang chuẩn bị ảnh ${qualityProfile.label} ${chunkStart}-${chunkEnd}/${pageTasks.length} trang...`);
      cb.updateProgress(3 + (renderedPages / totalPages) * 86, `Đang chuẩn bị ảnh ${qualityProfile.label} ${chunkStart}-${chunkEnd}/${pageTasks.length} trang...`);
      const renderedChunk = renderBatchTaskPages(chunk);
      await waitForExportLayout();
      if (renderedChunk.some((task) => !task.pageNode)) {
        throw new Error('Không dựng được một số trang để xuất.');
      }
      const preparedImages = await inlineImagesForNodes(renderedChunk.map((task) => task.pageNode), {
        waitForReady: true,
        concurrency: qualityProfile.imagePrepareConcurrency,
        maxImageDimension: qualityProfile.sourceImageMaxDimension,
        sourceImageFormat: qualityProfile.sourceImageFormat,
        sourceImageQuality: qualityProfile.sourceImageQuality,
        fitImagesToElement: true,
        fitPixelRatio: qualityProfile.pixelRatio,
        uniqueObjectUrl: true,
      });

      try {
        await mapWithConcurrency(renderedChunk, batchCaptureConcurrencyForProfile(qualityProfile), async (task, chunkIdx) => {
          const globalIdx = i + chunkIdx;
          const blob = await renderPageBlobWithRetry(task.pageNode, {
            imagesReady: true,
            pixelRatio: qualityProfile.pixelRatio,
            imageFormat: qualityProfile.imageFormat,
            imageQuality: qualityProfile.imageQuality,
            backgroundColor: qualityProfile.backgroundColor,
            preferHtml2Canvas: qualityProfile.preferHtml2Canvas,
            embedFonts: true,
            waitForImageReady: false,
            renderTimeoutMs: qualityProfile.renderTimeoutMs,
          });
          const exportName = exportNameWithExtension(task.pageNode, task.pageIndex, qualityProfile.imageExtension);
          task.folder.file(exportName, blob, {
            date: new Date(baseDate + (pageTasks.length - globalIdx) * 4000),
            compression: 'STORE',
          });
          renderedPages += 1;
          cb.updateProgress(3 + (renderedPages / totalPages) * 86, `Đang render ${qualityProfile.label} ${renderedPages}/${totalPages} trang...`);
        });
      } finally {
        restoreImagesFromBlobs(preparedImages);
        clearBatchExportRoot();
      }
      // Periodically trim image cache to prevent OOM on large batch exports (20-50 lists)
      pagesSinceLastTrim += chunk.length;
      if (pagesSinceLastTrim >= BATCH_CACHE_TRIM_INTERVAL) {
        resetBatchImageCache();
        pagesSinceLastTrim = 0;
      }
    }

    cb.updateProgress(90, 'Đang đóng file ZIP hàng loạt...');
    const archive = await mainZip.generateAsync({
      type: 'blob',
      compression: 'STORE',
      streamFiles: true,
    }, (metadata) => {
      const zipPercent = Number(metadata?.percent || 0);
      cb.updateProgress(
        Math.min(98, 90 + (zipPercent * 0.08)),
        `Đang đóng file ZIP hàng loạt... ${Math.round(zipPercent)}%`,
      );
    });
    cb.updateProgress(99, 'Đang lưu file ZIP hàng loạt...');
    // Yield to event loop before download — lets the browser settle after
    // heavy ZIP generation so the download trigger is more reliable.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const downloadStarted = downloadBlobFile(archive, `batch-export-${Date.now()}.zip`);
    if (!downloadStarted) {
      throw new Error('Trình duyệt chặn bước tải ZIP. Hãy giữ tab tool đang mở rồi bấm xuất lại.');
    }
    cb.completeProgress(`Đã xuất xong ${allLists.length} list.`);
    cb.setStatus(`Đã xuất xong ${allLists.length} list.`);
  } catch (error) {
    const message = error?.message || 'Không rõ lỗi.';
    console.warn(`Batch export failed: ${message}`);
    cb.failProgress(`Xuất hàng loạt thất bại: ${message}`);
    cb.setStatus(`Lỗi: ${message}`);
  } finally {
    await releaseExportWakeLock();
    cb.setBusy(false);
    clearBatchExportRoot();
    resetBatchImageCache();
  }
}
