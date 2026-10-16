'use client';
// Nạp, cache, thu nhỏ và thay ảnh trong trang trước khi chụp; ảnh dự phòng khi lỗi.
import { readCachedDataset } from '../datasetCache';
import { applyPageTextScale, resetPageTextScale } from '../pageTextScale';
import { fitItineraryNote, fitItineraryNoteTimed } from '../itineraryNote';
import { fitSpotlightDiary } from '../spotlightDiary';
import { fitThreadsToplist } from '../threadsToplist';
import { checkLocalTemplateLayout, ensureLocalTemplateFonts } from '../localTemplates';
import { checkCherryBlossomLayout } from '../cherryBlossom';
import { ExportImageError } from '../exportImageValidation';
import { EXPORT_FALLBACK_SOURCE_LIMIT, IMAGE_FETCH_TIMEOUT_MS, IMAGE_READY_TIMEOUT_MS, settleWithin } from './shared';

export function coverImageUrlsForExport() {
  const cached = readCachedDataset();
  return cached?.dataset?.source?.coverImageUrls || [];
}
let batchImageCache = new Map();

export function balancedPixelRatio(node, fallback) {
  if (node?.dataset?.exportLossless !== 'true') return fallback;
  const rect = node.getBoundingClientRect();
  if (isThreadsPortraitPageNode(node)) return Math.max(1080 / rect.width, 1440 / rect.height) + 1e-9;
  if (isSpotlightV5PageNode(node) || isSpotlightV6PageNode(node) || isSpotlightV6MapsPageNode(node)) {
    const targetHeight = isSpotlightV5PageNode(node) ? 1350 : isSpotlightV6MapsPageNode(node) ? 1440 : 1920;
    return Math.max(1080 / rect.width, targetHeight / rect.height) + 1e-9;
  }
  return fallback;
}

export function resetBatchImageCache() {
  for (const entry of batchImageCache.values()) {
    if (entry?.objectUrl) {
      URL.revokeObjectURL(entry.objectUrl);
    }
  }
  batchImageCache.clear();
}

function localDriveImageUrl(src) {
  try {
    const url = new URL(src, window.location.href);
    return url.origin === window.location.origin && ['/assets/drive-file', '/assets/color-edit'].includes(url.pathname) ? url : null;
  } catch { return null; }
}

// A separate browser transport can recover when fetch fails although the local
// image endpoint is healthy. Read the same file, never capture an unverified DOM image.
function recoverLocalDriveImage(src) {
  const url = localDriveImageUrl(src);
  if (!url || typeof XMLHttpRequest === 'undefined') return Promise.resolve({ blob: null });
  url.searchParams.set('_exportRetry', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const finish = (result) => {
      xhr.onload = xhr.onerror = xhr.ontimeout = xhr.onabort = null;
      resolve(result);
    };
    xhr.open('GET', url.href);
    xhr.responseType = 'blob';
    xhr.timeout = IMAGE_FETCH_TIMEOUT_MS;
    xhr.setRequestHeader('Cache-Control', 'no-cache');
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return finish({ blob: null, reason: `HTTP ${xhr.status}` });
      if (xhr.getResponseHeader('x-drive-image-fallback') === '1') return finish({ blob: null, reason: 'Backend trả ảnh placeholder', fallback: true });
      finish({ blob: xhr.response });
    };
    xhr.onerror = () => finish({ blob: null, reason: 'Trình duyệt không nhận được ảnh từ backend (fetch và XHR đều lỗi)' });
    xhr.ontimeout = () => finish({ blob: null, reason: 'Quá thời gian nhận ảnh từ backend', timedOut: true });
    xhr.onabort = () => finish({ blob: null, reason: 'Request ảnh bị hủy' });
    xhr.send();
  });
}

export async function fetchImageBlob(src) {
  const maxAttempts = 2;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timedOut = false;
    const timeoutMs = IMAGE_FETCH_TIMEOUT_MS + (attempt * 8000);
    const timer = controller
      ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs)
      : null;

    try {
      const response = await fetch(src, {
        cache: localDriveImageUrl(src) ? 'no-store' : (attempt === 0 ? 'force-cache' : 'reload'),
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!response.ok) {
        if (timer) clearTimeout(timer);
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
        return { blob: null, timedOut, reason: `HTTP ${response.status}` };
      }
      if (response.headers?.get?.('x-drive-image-fallback') === '1') {
        if (timer) clearTimeout(timer);
        await response.body?.cancel?.();
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        return { blob: null, timedOut: false, fallback: true, reason: 'Backend trả ảnh placeholder' };
      }
      const blob = await response.blob();
      if (timer) clearTimeout(timer);
      return { blob, timedOut: false };
    } catch (error) {
      if (timer) clearTimeout(timer);
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, timedOut ? 600 * (attempt + 1) : 350 * (attempt + 1)));
        continue;
      }
      const recovered = await recoverLocalDriveImage(src);
      return { timedOut, reason: timedOut ? 'Quá thời gian tải ảnh' : String(error?.message || 'Lỗi tải ảnh'), ...recovered };
    }
  }
  return { blob: null, timedOut: false };
}

export async function blobLooksLikeDriveFallback(blob) {
  if (!blob) return false;
  if (!String(blob.type || '').toLowerCase().includes('svg')) return false;
  try {
    const text = await blob.text();
    return text.includes('Drive image unavailable') || text.includes('File needs public access or sign-in');
  } catch {
    return false;
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
  let cssWidth = Number(rect?.width || img.clientWidth || 0);
  let cssHeight = Number(rect?.height || img.clientHeight || 0);
  if (cssWidth >= 1 && cssHeight < 1) {
    const aspectRatio = String(styles?.aspectRatio || '').trim();
    const ratioMatch = aspectRatio.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (ratioMatch) {
      cssHeight = cssWidth * (Number(ratioMatch[2]) / Number(ratioMatch[1]));
    } else {
      const parentRect = img.parentElement?.getBoundingClientRect?.();
      if (parentRect && parentRect.width >= 1 && parentRect.height >= 1) {
        cssWidth = parentRect.width;
        cssHeight = parentRect.height;
      }
    }
  }
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
    if (!blob) return { ...result, blob: null, blobUrl: null, timedOut: Boolean(result?.timedOut) };
    if (!entry.objectUrl) entry.objectUrl = URL.createObjectURL(blob);
    return { blob, blobUrl: entry.objectUrl, timedOut: false };
  }

  const blobPromise = fetchImageBlob(src).then(async (result) => {
    if (!result?.blob) return result;
    if (await blobLooksLikeDriveFallback(result.blob)) {
      return { ...result, blob: null, fallback: true, reason: 'Nội dung ảnh là placeholder' };
    }
    if (localDriveImageUrl(src) && (!result.blob.size || !/^image\//i.test(result.blob.type))) {
      return { blob: null, reason: `Nội dung không phải ảnh (${result.blob.type || 'thiếu Content-Type'})` };
    }
    if (localDriveImageUrl(src)) {
      try {
        const decoded = await createImageBitmap(result.blob);
        decoded.close();
      } catch (error) {
        if (error?.name !== 'InvalidStateError') throw error;
        return { blob: null, reason: 'Ảnh nguồn không giải mã được' };
      }
    }
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
    // Không cache thất bại — lần chuẩn bị sau vẫn thử lại được.
    batchImageCache.delete(cacheKey);
    return { ...result, blob: null, blobUrl: null, timedOut: Boolean(result?.timedOut) };
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

/** Cho batch export: đợi ảnh trong trang load xong trước khi inline/fetch. */
export async function waitForPageImagesSettled(node, timeoutMs = 20000) {
  if (node.matches?.('.local-template-page[data-photo-preset]')) timeoutMs = Math.max(timeoutMs, 60000);
  await ensureLocalTemplateFonts(node);
  await document.fonts.ready;
  resetPageTextScale(node);
  fitItineraryNote(node);
  fitItineraryNoteTimed(node);
  fitSpotlightDiary(node);
  applyPageTextScale(node);
  fitItineraryNote(node, true);
  fitItineraryNoteTimed(node, true);
  fitSpotlightDiary(node, true);
  fitThreadsToplist(node, true);
  checkLocalTemplateLayout(node, true);
  checkCherryBlossomLayout(node, true);
  const images = Array.from(node?.querySelectorAll?.('img') || []);
  if (!images.length) return;
  await Promise.all(images.map(async (img) => {
    if (img.complete && img.naturalWidth > 0) return;
    await new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        img.removeEventListener('load', done);
        img.removeEventListener('error', done);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
      // Một số trình duyệt đã complete nhưng naturalWidth=0 (lỗi) — không treo.
      if (img.complete) done();
    });
  }));
  if (node.matches?.('.local-template-page')) {
    const missing = images.find(img => img.dataset.localRequired === 'true' && (!img.complete || !img.naturalWidth));
    if (missing) throw new ExportImageError(`Mẫu local: ảnh thiếu/hỏng ở trang ${Number(node.dataset.pageIndex)+1}: ${missing.alt || missing.getAttribute('src')}. Không xuất bằng ảnh thay thế.`);
  }
}

function extractCssUrl(value) {
  const match = String(value || '').match(/url\((['"]?)(.*?)\1\)/i);
  return match ? match[2] : '';
}

function neutralImageDataUrl(target, variant = 'default') {
  const element = target?.img || target?.element;
  const rect = element?.getBoundingClientRect?.();
  const width = Math.max(80, Math.round(rect?.width || element?.clientWidth || 320));
  const height = Math.max(80, Math.round(rect?.height || element?.clientHeight || 320));
  const id = `g${Math.abs(Math.round(width * 31 + height * 17 + (variant === 'background' ? 7 : 3)))}`;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#eef4ee"/>
          <stop offset="1" stop-color="#d6e0d7"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#${id})"/>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
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
      root: node,
    }))
    .filter((target) => shouldInlineImageSource(target.originalSrc, options));
  const backgroundTargets = Array.from(node.querySelectorAll('[style*="background-image"]')).map((element) => {
    const originalBackgroundImage = element.style.backgroundImage;
    return {
      kind: 'background',
      element,
      originalBackgroundImage,
      originalSrc: extractCssUrl(originalBackgroundImage),
      root: node,
    };
  }).filter((target) => shouldInlineImageSource(target.originalSrc, options));
  // Hai loại mục tiêu (thẻ img / ảnh nền CSS) có dạng khác nhau, xử lý theo `kind`.
  return /** @type {any[]} */ (imageTargets).concat(backgroundTargets);
}

function candidateSourcesForTarget(target) {
  const sources = [target.originalSrc];
  if (target.kind === 'img') {
    const rawCandidates = target.img?.dataset?.candidateSrcs;
    if (rawCandidates) {
      try {
        const parsed = JSON.parse(rawCandidates);
        if (Array.isArray(parsed)) sources.push(...parsed);
      } catch {
        rawCandidates.split('|').forEach((url) => sources.push(url));
      }
    }
  }
  const uniqueSources = [...new Set(sources.map((url) => String(url || '').trim()).filter(Boolean))];
  if (uniqueSources.length <= 2) return uniqueSources;
  return [uniqueSources[0], ...sortFallbackSources(uniqueSources.slice(1))];
}

function imageSourceRank(source) {
  const value = String(source || '').trim();
  if (!value) return 5;
  if (value.startsWith('/assets/library') || value.startsWith('/assets/dalat')) return 0;
  if (value.startsWith('/assets/') && !value.startsWith('/assets/drive-file')) return 1;
  if (/^https?:\/\//i.test(value) && !/drive\.google\.com|googleusercontent\.com/i.test(value)) return 2;
  if (value.startsWith('/assets/drive-file') || /drive\.google\.com|googleusercontent\.com/i.test(value)) return 3;
  return 4;
}

function sortFallbackSources(sources) {
  return [...sources].sort((a, b) => imageSourceRank(a) - imageSourceRank(b));
}

function buildImageFallbackContext(targets) {
  const globalSources = [];
  const sourcesByRoot = new Map();

  targets.forEach((target) => {
    const root = target.root || null;
    const rootSources = root
      ? (sourcesByRoot.get(root) || [])
      : null;
    candidateSourcesForTarget(target).forEach((source) => {
      if (!source) return;
      globalSources.push(source);
      if (rootSources) rootSources.push(source);
    });
    if (root && rootSources && !sourcesByRoot.has(root)) {
      sourcesByRoot.set(root, rootSources);
    }
  });

  return {
    globalSources: sortFallbackSources([...new Set(globalSources)]),
    sourcesByRoot,
    fallbackSourceLimit: EXPORT_FALLBACK_SOURCE_LIMIT,
  };
}

function isSharedBackgroundTarget(target) {
  if (target?.kind === 'background') return true;
  const img = target?.img;
  if (!img) return false;
  if (img.classList?.contains('grid8-center-bg')) return true;
  return Boolean(img.closest?.(
    '.page-shell-bg, .journey-bg, .grid8-cover-photo, .grid6-cover-bg, .grid4-feature-bg, .grid8-quaytung-cover-photo, .budget72-cover-bg, .budget72-story-bg, .grid5-cover-bg, .spotlight-cover, .grid4-feature-cover',
  ));
}

function fallbackSourcesForTarget(target, context, ownSources) {
  if (!context) return [];
  const ownSourceSet = new Set(ownSources);
  const limit = Math.max(0, Number(context.fallbackSourceLimit || EXPORT_FALLBACK_SOURCE_LIMIT));
  const sources = [];
  const addSources = (items) => {
    for (const source of items || []) {
      if (!source || ownSourceSet.has(source) || sources.includes(source)) continue;
      sources.push(source);
      if (sources.length >= limit) return;
    }
  };
  addSources(sortFallbackSources(context.sourcesByRoot?.get?.(target.root || null) || []));
  if (sources.length < limit) {
    addSources(context.globalSources);
  }
  return sources;
}

async function firstAvailableImageBlobUrl(sources, options = {}) {
  const avoidSources = options.avoidSources instanceof Set ? options.avoidSources : null;
  const claimedSources = options.claimedSources instanceof Set ? options.claimedSources : null;
  const reserveOnTry = options.reserveOnTry === true && claimedSources;
  let fallback = { blob: null, blobUrl: null, timedOut: false, source: sources[0] || '' };
  for (const source of sources) {
    if (!source) continue;
    if (avoidSources?.has(source)) continue;
    if (claimedSources?.has(source)) continue;
    // Reserve trước khi fetch — tránh 2 ô song song cùng chiếm 1 candidate.
    if (reserveOnTry) claimedSources.add(source);
    const result = await getCachedImageBlobUrl(source, options);
    fallback = { ...result, source };
    if (result.blob && result.blobUrl) return fallback;
    if (reserveOnTry) claimedSources.delete(source);
  }
  return fallback;
}

/**
 * Lấy ảnh đã render trong preview (DOM) — tránh fetch lại Drive lúc xuất
 * (máy khác preview OK nhưng export bị xám vì fetch timeout/rate-limit).
 */
async function captureDomImageBlob(img) {
  if (!img || img.tagName !== 'IMG') return null;
  if (!img.complete || !(img.naturalWidth > 0) || !(img.naturalHeight > 0)) return null;
  // Placeholder SVG / empty — bỏ
  const currentSrc = String(img.currentSrc || img.src || '');
  if (!currentSrc || currentSrc.startsWith('data:image/svg')) return null;
  // Drive proxy có thể trả placeholder SVG với HTTP 200. Không chụp DOM trực tiếp
  // vì trình duyệt vẫn xem placeholder là một ảnh hợp lệ; luồng fetch bên dưới sẽ
  // kiểm tra header/nội dung và chuyển sang candidate dự phòng.
  try {
    const parsed = new URL(currentSrc, window.location.href);
    if (parsed.pathname === '/assets/drive-file') return null;
  } catch {
    if (currentSrc.includes('/assets/drive-file')) return null;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return await canvasToBlob(canvas, 'image/png', 1);
  } catch {
    return null;
  }
}

function normalizeClaimSource(url) {
  return String(url || '').trim();
}

function claimExportSource(claimedSources, source) {
  const key = normalizeClaimSource(source);
  if (!key || !claimedSources) return key;
  claimedSources.add(key);
  return key;
}

function isSourceClaimed(claimedSources, source) {
  const key = normalizeClaimSource(source);
  return Boolean(key && claimedSources?.has(key));
}

async function prepareImageTarget(target, options = {}) {
  const strict = (target.root || target.img?.closest('.story-page') || target.element?.closest('.story-page'))?.dataset?.exportStrict === 'true';
  const shouldWaitForReady = options.waitForReady !== false;
  const shouldUseUniqueObjectUrl = options.uniqueObjectUrl === true;
  const claimedSources = options.claimedSources || null;
  const blobOptions = {
    maxDimension: options.maxImageDimension,
    imageFormat: options.sourceImageFormat,
    imageQuality: options.sourceImageQuality,
  };
  // Cover / ô giữa: được lấy ảnh khác cùng trang khi Drive lỗi.
  // Ô địa điểm: không fallback chéo (tránh sai ảnh quán).
  const allowCrossImageFallback = !strict && (options.allowCrossImageFallback === true
    || (options.allowCrossImageFallback !== false && isSharedBackgroundTarget(target)));

  if (target.kind === 'img') {
    const { img, originalSrc } = target;
    const sources = strict ? [originalSrc] : candidateSourcesForTarget(target);
    // Ảnh địa điểm: không dùng lại URL đã gán cho ô khác trên cùng trang
    // (lúc tạo list URL chính khác nhau, nhưng candidate fallback lúc xuất dễ trùng).
    const fallbackSources = allowCrossImageFallback
      ? fallbackSourcesForTarget(target, options.fallbackContext, sources)
          .filter((source) => !isSourceClaimed(claimedSources, source))
      : [];

    // 1) Ưu tiên ảnh đã hiện trên preview — nhưng bỏ nếu URL đó đã claim bởi ô khác
    const domCurrentSrc = normalizeClaimSource(img.currentSrc || img.src || originalSrc);
    let selectedBlob = null;
    let selectedBlobUrl = null;
    let selectedSource = '';
    let ownedObjectUrl = null;
    let sourceFailure = '';
    const reservePlaceImage = !strict && !allowCrossImageFallback && Boolean(claimedSources);
    if (!strict && !isSourceClaimed(claimedSources, domCurrentSrc)) {
      selectedBlob = await captureDomImageBlob(img);
      selectedBlobUrl = selectedBlob ? URL.createObjectURL(selectedBlob) : null;
      selectedSource = selectedBlob ? (domCurrentSrc || originalSrc || 'dom-capture') : '';
      ownedObjectUrl = selectedBlobUrl;
    }

    // 2) Nếu chưa có (trang mới render khi batch): fetch như cũ, bỏ URL đã dùng
    if (!selectedBlob || !selectedBlobUrl) {
      const fetched = await firstAvailableImageBlobUrl(sources, {
        ...blobOptions,
        avoidSources: reservePlaceImage ? claimedSources : null,
        claimedSources: reservePlaceImage ? claimedSources : null,
        reserveOnTry: reservePlaceImage,
      });
      selectedBlob = fetched.blob;
      sourceFailure = fetched.reason || '';
      selectedBlobUrl = fetched.blobUrl;
      selectedSource = fetched.source;
      ownedObjectUrl = null;
    }
    if (!selectedBlob || !selectedBlobUrl) {
      const fallbackResult = await firstAvailableImageBlobUrl(fallbackSources, {
        ...blobOptions,
        avoidSources: claimedSources,
        claimedSources,
        reserveOnTry: Boolean(claimedSources),
      });
      selectedBlob = fallbackResult.blob;
      selectedBlobUrl = fallbackResult.blobUrl;
      selectedSource = fallbackResult.source;
      ownedObjectUrl = null;
    }

    // 3) Fetch fail nhưng DOM vẫn còn ảnh đã paint — thử chụp lại trước khi ra xám
    if (!selectedBlob || !selectedBlobUrl) {
      if (!strict && !isSourceClaimed(claimedSources, domCurrentSrc)) {
        selectedBlob = await captureDomImageBlob(img);
        if (selectedBlob) {
          selectedBlobUrl = URL.createObjectURL(selectedBlob);
          selectedSource = domCurrentSrc || originalSrc || 'dom-capture-retry';
          ownedObjectUrl = selectedBlobUrl;
        }
      }
    }

    if (selectedBlob && selectedSource) {
      claimExportSource(claimedSources, selectedSource);
    }

    const displayBlob = await fitImageBlobToElement(selectedBlob, img, {
      ...blobOptions,
      fitImagesToElement: options.fitImagesToElement,
      fitPixelRatio: balancedPixelRatio(target.root || img.closest('.story-page'), options.fitPixelRatio),
    });
    const shouldUseTargetObjectUrl = Boolean(displayBlob && (shouldUseUniqueObjectUrl || displayBlob !== selectedBlob || ownedObjectUrl));
    const preparedBlobUrl = shouldUseTargetObjectUrl && displayBlob
      ? (displayBlob === selectedBlob && ownedObjectUrl ? ownedObjectUrl : URL.createObjectURL(displayBlob))
      : selectedBlobUrl;
    if (ownedObjectUrl && preparedBlobUrl !== ownedObjectUrl) {
      URL.revokeObjectURL(ownedObjectUrl);
      ownedObjectUrl = null;
    }
    if (!preparedBlobUrl) {
      if (strict) throw new ExportImageError(`Không tải được ảnh nguồn ở trang ${Number(target.root?.dataset?.pageIndex || 0) + 1}: ${originalSrc}. ${sourceFailure || 'Không còn nguồn ảnh hợp lệ cho trang này'}`);
      img.dataset.originalSrc = originalSrc;
      img.dataset.exportFallbackSrc = 'neutral-placeholder';
      img.src = neutralImageDataUrl(target);
      if (shouldWaitForReady) {
        await waitForImageReady(img);
      }
      return { img, originalSrc, objectUrl: null };
    }

    img.dataset.originalSrc = originalSrc;
    img.src = preparedBlobUrl;
    if (selectedSource && selectedSource !== originalSrc) {
      img.dataset.exportFallbackSrc = selectedSource;
    }
    if (shouldWaitForReady) {
      await waitForImageReady(img);
    }
    return {
      img,
      originalSrc,
      selectedSource,
      objectUrl: (shouldUseTargetObjectUrl || ownedObjectUrl) ? preparedBlobUrl : null,
    };
  }

  const { element, originalBackgroundImage, originalSrc } = target;
  const sources = strict ? [originalSrc] : candidateSourcesForTarget(target);
  const fallbackSources = allowCrossImageFallback
    ? fallbackSourcesForTarget(target, options.fallbackContext, sources)
    : [];
  let { blob, blobUrl, source } = await firstAvailableImageBlobUrl(sources, blobOptions);
  if (!blob || !blobUrl) {
    const fallbackResult = await firstAvailableImageBlobUrl(fallbackSources, blobOptions);
    blob = fallbackResult.blob;
    blobUrl = fallbackResult.blobUrl;
    source = fallbackResult.source;
  }
  if (blob && source) claimExportSource(claimedSources, source);
  const preparedBlobUrl = shouldUseUniqueObjectUrl && blob ? URL.createObjectURL(blob) : blobUrl;
  if (!preparedBlobUrl) {
    if (strict) throw new ExportImageError(`Không tải được ảnh nền ${originalSrc}; hãy cập nhật dữ liệu rồi xuất lại.`);
    const neutralUrl = neutralImageDataUrl(target, 'background');
    element.dataset.originalBackgroundImage = originalBackgroundImage;
    element.style.backgroundImage = originalBackgroundImage.replace(/url\((['"]?)(.*?)\1\)/i, `url("${neutralUrl}")`);
    if (shouldWaitForReady) {
      await waitForBackgroundReady(neutralUrl);
    }
    return { element, originalBackgroundImage, objectUrl: null };
  }

  element.dataset.originalBackgroundImage = originalBackgroundImage;
  element.style.backgroundImage = originalBackgroundImage.replace(/url\((['"]?)(.*?)\1\)/i, `url("${preparedBlobUrl}")`);
  if (shouldWaitForReady) {
    await waitForBackgroundReady(preparedBlobUrl);
  }
  return { element, originalBackgroundImage, objectUrl: shouldUseUniqueObjectUrl ? preparedBlobUrl : null };
}

async function prepareImageTargets(targets, options = {}) {
  const fallbackContext = options.fallbackContext || buildImageFallbackContext(targets);
  // Claim theo từng trang (root) — tránh 4 ô grid dùng chung 1 ảnh candidate khi xuất.
  const claimedByRoot = new WeakMap();
  const getClaimedSet = (root) => {
    if (!root) return options.claimedSources || null;
    if (!claimedByRoot.has(root)) claimedByRoot.set(root, new Set());
    return claimedByRoot.get(root);
  };

  // Ưu tiên xử lý tuần tự theo từng page root để claim URL ổn định (tránh race concurrency).
  const byRoot = new Map();
  for (const target of targets) {
    const root = target.root || null;
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root).push(target);
  }

  const handles = [];
  for (const [root, rootTargets] of byRoot.entries()) {
    const claimedSources = getClaimedSet(root);
    // Trong cùng một trang phải claim candidate tuần tự. Chạy song song khiến
    // hai ô cùng thấy một candidate "chưa dùng" rồi lấy trùng ảnh khi primary fail.
    try {
      for (const target of rootTargets) {
        const handle = await prepareImageTarget(target, { ...options, fallbackContext, claimedSources });
        if (handle) handles.push(handle);
      }
    } catch (error) {
      restoreImagesFromBlobs(handles);
      throw error;
    }
  }
  return handles;
}

export async function inlineImagesAsBlobs(node, options = {}) {
  return prepareImageTargets(collectImageTargets(node, options), options);
}

export async function inlineImagesForNodes(nodes, options = {}) {
  const targets = nodes.flatMap((node) => collectImageTargets(node, options));
  return prepareImageTargets(targets, options);
}

export function restoreImagesFromBlobs(handles) {
  for (const handle of handles) {
    if (handle.img) {
      handle.img.src = handle.originalSrc;
      handle.img.removeAttribute('data-original-src');
      handle.img.removeAttribute('data-export-fallback-src');
    } else if (handle.element) {
      handle.element.style.backgroundImage = handle.originalBackgroundImage;
      handle.element.removeAttribute('data-original-background-image');
    }
    if (handle.objectUrl) URL.revokeObjectURL(handle.objectUrl);
  }
}

export function isSpotlightV5PageNode(pageNode) {
  return Boolean(pageNode?.classList?.contains('spotlight-v5-cover') || pageNode?.classList?.contains('spotlight-v5-playlist') || pageNode?.classList?.contains('spotlight-v5-place') || pageNode?.classList?.contains('threads-toplist-cover') || pageNode?.classList?.contains('threads-toplist-page'));
}

export function isThreadsPortraitPageNode(pageNode) {
  return Boolean(pageNode?.classList?.contains('local-template-page') || pageNode?.classList?.contains('threads-portrait') || pageNode?.classList?.contains('itinerary-note-threads-budget') || pageNode?.classList?.contains('threads-expense-sheet'));
}

export function isSpotlightV6PageNode(pageNode) {
  if (pageNode?.classList?.contains('cherry-blossom-page')) return true;
  return Boolean(pageNode?.classList?.contains('spotlight-v6-cover') || pageNode?.classList?.contains('spotlight-v6-image') || pageNode?.classList?.contains('spotlight-v6-page') || pageNode?.classList?.contains('summary-note-page') || pageNode?.classList?.contains('itinerary-note-day') || pageNode?.classList?.contains('itinerary-note-timed-day'));
}

export function isSpotlightV6MapsPageNode(pageNode) {
  return Boolean(pageNode?.classList?.contains('spotlight-v6-diary-page') || pageNode?.classList?.contains('spotlight-v6-map-page') || pageNode?.classList?.contains('spotlight-v6-map-place'));
}
export function canvasToBlob(canvas, imageFormat = 'image/png', imageQuality = 1) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, imageFormat, imageQuality);
  });
}
