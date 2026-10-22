'use client';
// Dựng trang thành ảnh (html-to-image/html2canvas), canvas, font và khung DOM ẩn.
import * as htmlToImage from 'html-to-image';
import { renderCoverPage, renderListPage } from '../pageMarkup';
import { photoDisplayUrl } from '../photoPresets.mjs';
import html2canvas from 'html2canvas';
import { balancedPixelRatio, blobLooksLikeDriveFallback, canvasToBlob, coverImageUrlsForExport, fetchImageBlob, inlineImagesAsBlobs, isSpotlightV5PageNode, isSpotlightV6MapsPageNode, isSpotlightV6PageNode, isThreadsPortraitPageNode, restoreImagesFromBlobs } from './images';
import { BATCH_PAGE_RETRY_RENDER_TIMEOUT_MS, DEFAULT_EXPORT_CORNER_RADIUS, EXPORT_PIXEL_RATIO, IMAGE_READY_TIMEOUT_MS, PAGE_RENDER_TIMEOUT_MS, exportQualityProfile, rejectAfter, settleWithin } from './shared';

const HTML_TO_IMAGE_RENDER_OPTIONS = Object.freeze({
  cacheBust: false,
  // Drive proxy images are differentiated by ?id=..., so every template export must keep query params.
  includeQueryParams: true,
});

let fontEmbedCSS = null;
let batchExportRoot = null;

export function prepareQualityLayout(nodes, profile) {
  for (const node of nodes) {
    node.dataset.exportStrict = 'true';
    if (!profile.losslessSource) { delete node.dataset.exportLossless; continue; }
    node.dataset.exportLossless = 'true';
    // Use the design frame for normalized layouts.
    if (!isSpotlightV6PageNode(node) && !isSpotlightV5PageNode(node) && !isSpotlightV6MapsPageNode(node)) continue;
    // Use the design frame rather than responsive preview dimensions.
    const threadsPortrait = isThreadsPortraitPageNode(node);
    node.style.setProperty('width', threadsPortrait ? '810px' : '397px', 'important');
    node.style.setProperty('height', threadsPortrait ? '1080px' : `${397 * (isSpotlightV5PageNode(node) ? 1.25 : isSpotlightV6MapsPageNode(node) ? 4 / 3 : 16 / 9)}px`, 'important');
    node.style.setProperty('min-height', '0', 'important');
    node.style.setProperty('max-width', 'none', 'important');
    node.style.setProperty('flex-shrink', '0', 'important');
  }
}

function isV6ExportPage(pageNode) {
  if (pageNode?.classList?.contains('threads-note-dark') || pageNode?.classList?.contains('threads-grid6') || pageNode?.classList?.contains('threads-recap')) return true;
  if (pageNode?.classList?.contains('cherry-blossom-page')) return true;
  return ['spotlight-v6-diary-page', 'spotlight-v6-cover', 'spotlight-v6-image', 'spotlight-v6-page', 'spotlight-v6-map-page', 'spotlight-v6-map-place']
    .some((name) => pageNode?.classList?.contains(name));
}

// Full-bleed photo templates: the preview card's rounded corners are UI only and
// must never be cut into the exported image (Spotlight V5 4:5 and the V6 family).
function isFullBleedExportPage(pageNode) {
  if (pageNode?.classList?.contains('threads-note-dark') || pageNode?.classList?.contains('threads-grid6') || pageNode?.classList?.contains('threads-recap')) return true;
  return isV6ExportPage(pageNode)
    || ['spotlight-v5-cover', 'spotlight-v5-playlist', 'spotlight-v5-place'].some((name) => pageNode?.classList?.contains(name));
}

function usesFullResolutionV6(pageNode, options) {
  return options.pixelRatio === exportQualityProfile('optimized', 'spotlight-v6').pixelRatio
    && isV6ExportPage(pageNode);
}

function parsePixelValue(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value || ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function exportCornerRadiusFor(pageNode, outputWidth) {
  if (isFullBleedExportPage(pageNode)) return 0;
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

function ensureBatchExportRoot() {
  if (!batchExportRoot || !document.body.contains(batchExportRoot)) {
    batchExportRoot = document.createElement('div');
    batchExportRoot.className = 'batch-export-root';
    batchExportRoot.setAttribute('aria-hidden', 'true');
    document.body.appendChild(batchExportRoot);
  }
  return batchExportRoot;
}

export function clearBatchExportRoot() {
  if (batchExportRoot) {
    batchExportRoot.textContent = '';
  }
}

export function renderPageMarkupForExport(list, page, index) {
  if (page.type === 'cover') {
    return renderCoverPage(page, index, list.pages.length, list.id, list.captionHashtags || [], list, coverImageUrlsForExport());
  }
  return renderListPage(page, index, list.pages.length, list.id, list.captionHashtags || [], list);
}

function prepareExportStoryPages(pageNodes) {
  pageNodes.forEach((pageNode) => {
    if (isFullBleedExportPage(pageNode)) pageNode.style.setProperty('border-radius', '0', 'important');
    pageNode.querySelectorAll('img').forEach((img) => {
      img.loading = 'eager';
      img.decoding = 'sync';
      img.fetchPriority = 'high';
    });
  });
  return pageNodes;
}

export function renderPagesForExport(list, options = {}) {
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

export function findVisibleSelectedPageNode(list, selectedPageIndex) {
  if (!list?.id || !Number.isInteger(selectedPageIndex) || typeof CSS === 'undefined') return null;
  const selector = `.story-page[data-list-id="${CSS.escape(list.id)}"][data-page-index="${selectedPageIndex}"]`;
  return Array.from(document.querySelectorAll(selector)).find((node) =>
    !node.closest('.batch-export-root') && Boolean(node.closest('.slide-card-frame.is-selected')),
  ) || null;
}

export function cloneVisiblePageForExport(sourceNode) {
  const root = ensureBatchExportRoot();
  const clone = sourceNode.cloneNode(true);
  clone.classList.remove('is-selected');
  clone.querySelectorAll('.is-selected').forEach((node) => node.classList.remove('is-selected'));
  // Dấu "bấm chữ để sửa" của preview V2 không được đi vào markup xuất ảnh.
  clone.querySelectorAll('[data-edit-field]').forEach((node) => node.removeAttribute('data-edit-field'));
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

export async function waitForExportLayout() {
  forceLayoutSync();
  // Use setTimeout only — never requestAnimationFrame — so exports
  // keep running when the browser tab is in the background.
  await new Promise((resolve) => setTimeout(resolve, 50));
}

function normalizeSpotlightV6MapsCanvas(canvas, pageNode) {
  if (!isSpotlightV6MapsPageNode(pageNode) || !canvas) return canvas;
  const target = document.createElement('canvas');
  target.width = 1080;
  target.height = 1440;
  const ctx = target.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(canvas, 0, 0, target.width, target.height);
  return target;
}

function normalizeSpotlightV6Canvas(canvas, pageNode) {
  if (!isSpotlightV6PageNode(pageNode) || isThreadsPortraitPageNode(pageNode) || !canvas) return canvas;
  const target = document.createElement('canvas');
  target.width = 1080;
  target.height = 1920;
  const ctx = target.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(canvas, 0, 0, target.width, target.height);
  return target;
}
function normalizeThreadsCanvas(canvas, pageNode) {
  if (!isThreadsPortraitPageNode(pageNode) || !canvas) return canvas;
  if (canvas.width === 1080 && canvas.height === 1440) return canvas;
  const target = document.createElement('canvas');
  target.width = 1080;
  target.height = 1440;
  const ctx = target.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(canvas, 0, 0, target.width, target.height);
  return target;
}
function normalizeSpotlightV5Canvas(canvas, pageNode) {
  if (!isSpotlightV5PageNode(pageNode) || !canvas) return canvas;
  const target = document.createElement('canvas');
  target.width = 1080;
  target.height = 1350;
  const ctx = target.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(canvas, 0, 0, target.width, target.height);
  return target;
}

export async function loadThreadsFoodPhoto(item, preset) {
  const result = await fetchImageBlob(photoDisplayUrl(item.imageUrl, preset));
  const blob = result?.blob;
  if (!blob || await blobLooksLikeDriveFallback(blob)) {
    throw new Error('Ảnh riêng của "' + item.name + '" không tải được: ' + (result?.reason || 'ảnh placeholder') + '. Hãy đồng bộ ảnh rồi xuất lại.');
  }
  const mime = String(blob.type || '').toLowerCase().split(';')[0];
  const extension = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : '';
  if (!extension) throw new Error('Ảnh của "' + item.name + '" không phải JPEG/PNG/WebP hợp lệ.');
  try {
    const bitmap = await createImageBitmap(blob);
    bitmap.close();
  } catch {
    throw new Error('Ảnh của "' + item.name + '" không giải mã được. Hãy đồng bộ ảnh rồi xuất lại.');
  }
  return { blob, extension };
}

export function renderBatchTaskPages(tasks) {
  const root = ensureBatchExportRoot();
  root.innerHTML = `<div class="list-preview-grid batch-export-grid">${tasks.map((task) =>
    renderPageMarkupForExport(task.list, task.page, task.pageIndex)).join('')}</div>`;
  prepareExportStoryPages(Array.from(root.querySelectorAll('.story-page')));
  // Match each task to its rendered node by list-id + page-index to avoid
  // index mismatch when multiple lists share the same chunk.
  return tasks.map((task) => {
    const selector = `.story-page[data-list-id="${CSS.escape(task.list.id)}"][data-page-index="${task.pageIndex}"]`;
    const pageNode = root.querySelector(selector) || null;
    return { ...task, pageNode };
  });
}

export async function renderPageBlob(pageNode, options = {}) {
  // V5/V6 output is full-bleed: preview rounding must never enter the PNG.
  if (isFullBleedExportPage(pageNode)) pageNode.style.setProperty('border-radius', '0', 'important');
  const imagesReady = options.imagesReady === true;
  const diaryPage = pageNode.classList.contains('spotlight-v6-diary-page');
  const diaryRect = diaryPage ? pageNode.getBoundingClientRect() : null;
  // Fractional 3:4 CSS height otherwise rounds up in legacy html2canvas, leaving
  // transparent rows at the bottom. Allocate and fill the exact diary canvas.
  const pixelRatio = diaryPage
    ? Math.max(1080 / diaryRect.width, 1440 / diaryRect.height) + 1e-9
    : balancedPixelRatio(pageNode, Number(options.pixelRatio || EXPORT_PIXEL_RATIO));
  const fullResolutionV6 = usesFullResolutionV6(pageNode, options);
  const lossless = pageNode.dataset.exportLossless === 'true' || fullResolutionV6;
  const targetCanvas = () => {
    if (!lossless && !diaryPage) return undefined;
    const canvas = document.createElement('canvas');
    const rect = pageNode.getBoundingClientRect();
    const normalized = isSpotlightV6PageNode(pageNode) || isSpotlightV5PageNode(pageNode) || isSpotlightV6MapsPageNode(pageNode) || isThreadsPortraitPageNode(pageNode);
    canvas.width = normalized ? 1080 : Math.floor(rect.width * pixelRatio);
    canvas.height = normalized ? (isSpotlightV5PageNode(pageNode) ? 1350 : isSpotlightV6MapsPageNode(pageNode) || isThreadsPortraitPageNode(pageNode) ? 1440 : 1920) : Math.floor(rect.height * pixelRatio);
    return canvas;
  };
  const renderTimeoutMs = Number(options.renderTimeoutMs || PAGE_RENDER_TIMEOUT_MS);
  const imageFormat = options.imageFormat || 'image/png';

  // Workaround: html2canvas cannot parse oklch() color function (Next.js 16 injects it).
  // Patch window.getComputedStyle to strip oklch() from any returned CSSStyleDeclaration.
  const _originalGetComputedStyle = window.getComputedStyle;
  const _oklchPattern = /oklch\([^)]*\)/gi;
  const _oklchFallback = 'transparent';
  window.getComputedStyle = function patchedGetComputedStyle(element, pseudoElt) {
    const style = _originalGetComputedStyle.call(this, element, pseudoElt);
    return new Proxy(style, {
      get(target, prop) {
        const value = target[prop];
        if (typeof value === 'string' && _oklchPattern.test(value)) {
          _oklchPattern.lastIndex = 0;
          return value.replace(_oklchPattern, _oklchFallback);
        }
        _oklchPattern.lastIndex = 0;
        if (typeof value === 'function') return value.bind(target);
        return value;
      },
    });
  };
  const imageQuality = Number(options.imageQuality || 1);
  const backgroundColor = options.backgroundColor ?? (imageFormat === 'image/jpeg' ? '#ffffff' : null);
  const preferHtml2Canvas = options.preferHtml2Canvas === true;
  const shouldEmbedFonts = options.embedFonts !== false;
  const allowFallback = options.allowFallback !== false && pageNode.dataset.exportStrict !== 'true';
  const allowEngineFallbacks = options.allowEngineFallbacks !== false;
  let cornersAlreadyClipped = false;
  const finalizeCanvasBlob = async (canvas) => {
    const clipped = clipCanvasToPageCorners(canvas, pageNode, imageFormat, backgroundColor);
    const normalized = normalizeThreadsCanvas(normalizeSpotlightV6MapsCanvas(normalizeSpotlightV6Canvas(normalizeSpotlightV5Canvas(clipped, pageNode), pageNode), pageNode), pageNode);
    try { return await canvasToBlob(normalized, imageFormat, imageQuality); }
    finally {
      if (lossless) for (const bitmap of new Set([canvas, clipped, normalized])) {
        bitmap.width = 0; bitmap.height = 0;
      }
    }
  };
  const finalizeBlob = async (blob) => {
    if (diaryPage || isThreadsPortraitPageNode(pageNode)) {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = 1080; canvas.height = 1440;
      try {
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Không tạo được canvas xuất ảnh 3:4.');
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        return await canvasToBlob(canvas, imageFormat, imageQuality);
      } finally { bitmap.close(); canvas.width = 0; canvas.height = 0; }
    }
    return cornersAlreadyClipped ? blob : clipBlobToPageCorners(blob, pageNode, imageFormat, imageQuality, backgroundColor);
  };
  let blobUrls = [];
  try {
    await ensureExportFontsReady(pageNode, { decodeImages: !imagesReady, embedFonts: shouldEmbedFonts });
    blobUrls = imagesReady ? [] : await inlineImagesAsBlobs(pageNode, { waitForReady: options.waitForImageReady });
    // html2canvas is the preferred engine for batch exports because:
    // 1. It works reliably in background tabs (no rAF / foreignObject dependency)
    // 2. It renders CSS layout more faithfully than html-to-image's SVG pipeline
    // 3. It's faster: single-pass canvas draw vs SVG serialization + Image decode
    if (preferHtml2Canvas || document.visibilityState === 'hidden') {
      try {
        const canvas = await rejectAfter(html2canvas(pageNode, {
          canvas: targetCanvas(),
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
        if (!allowEngineFallbacks) throw error;
        console.warn(`html2canvas export failed, trying fallback: ${error?.message || error}`);
      }
    }
    // html-to-image SVG path: only used for single-page PNG exports in foreground.
    // Avoid in background tabs — foreignObject → Image pipeline freezes.
    if (allowEngineFallbacks && document.visibilityState !== 'hidden') {
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
    if (allowEngineFallbacks && !preferHtml2Canvas && document.visibilityState !== 'hidden') {
      try {
        const canvas = await rejectAfter(html2canvas(pageNode, {
          canvas: targetCanvas(),
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
      throw new Error('Canvas render quá thời gian, chưa tạo được ảnh hợp lệ.');
    }
    const fallbackBlob = await createFallbackPageBlob(pageNode, pixelRatio, imageFormat, imageQuality);
    return await finalizeBlob(fallbackBlob);
  } finally {
    restoreImagesFromBlobs(blobUrls);
    window.getComputedStyle = _originalGetComputedStyle;
  }
}

export async function renderPageBlobWithRetry(pageNode, options = {}) {
  if (usesFullResolutionV6(pageNode, options) || pageNode.dataset.exportLossless === 'true') {
    options = { ...options, allowFallbackOnRetry: false };
  }
  const isBatchRender = options.batchRender === true;
  try {
    return await renderPageBlob(pageNode, {
      ...options,
      allowFallback: false,
      allowEngineFallbacks: !isBatchRender,
    });
  } catch (error) {
    const message = error?.message || error;
    if (isBatchRender) {
      console.debug?.(`Batch page render retry with a longer timeout: ${message}`);
    } else {
      console.warn(`Page render failed, retrying with a longer timeout: ${message}`);
    }
    // Use synchronous layout flush + short delay instead of rAF-based wait.
    forceLayoutSync();
    await new Promise((resolve) => setTimeout(resolve, 80));
    return renderPageBlob(pageNode, {
      ...options,
      allowFallback: options.allowFallbackOnRetry !== false,
      waitForImageReady: true,
      allowEngineFallbacks: !isBatchRender,
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
