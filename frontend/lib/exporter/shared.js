'use client';
// Cấu hình xuất ảnh dùng chung: hằng số, hồ sơ chất lượng, giới hạn chạy song song, wake lock.
import { ensureRuntimePerformanceForBalancedExport } from '../runtimePerformance';
import { resolveBudget72HExportList } from '../utils';

export const EXPORT_PIXEL_RATIO = 2;
const BATCH_EXPORT_PIXEL_RATIO = EXPORT_PIXEL_RATIO;
const BATCH_IMAGE_FORMAT = 'image/png';
const BATCH_IMAGE_EXTENSION = 'png';
const BATCH_IMAGE_QUALITY = 1;
const BATCH_SOURCE_IMAGE_MAX_DIMENSION = 0;
const BATCH_SOURCE_IMAGE_QUALITY = 1;
const BATCH_IMAGE_PREPARE_CONCURRENCY = 8;
export const IMAGE_FETCH_TIMEOUT_MS = 22000;
export const IMAGE_READY_TIMEOUT_MS = 6000;
export const PAGE_RENDER_TIMEOUT_MS = 45000;
const BATCH_PAGE_RENDER_TIMEOUT_MS = 70000;
export const BATCH_PAGE_RETRY_RENDER_TIMEOUT_MS = 120000;
export const EXPORT_FALLBACK_SOURCE_LIMIT = 48;
export const DEFAULT_EXPORT_CORNER_RADIUS = 0;
export const BATCH_IMAGE_SETTLE_TIMEOUT_MS = 12000;
export const BATCH_CACHE_TRIM_INTERVAL = 4;
const EXPORT_QUALITY_PROFILES = Object.freeze({
  optimized: {
    id: 'optimized',
    label: 'chất lượng cân bằng',
    pixelRatio: 2.5,
    imageFormat: 'image/png',
    imageExtension: 'png',
    imageQuality: 1,
    backgroundColor: null,
    sourceImageMaxDimension: 3000,
    sourceImageFormat: 'image/jpeg',
    sourceImageQuality: 0.97,
    imagePrepareConcurrency: 3,
    renderChunkSize: 4,
    captureConcurrency: 2,
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
    preferHtml2Canvas: true,
    renderTimeoutMs: BATCH_PAGE_RENDER_TIMEOUT_MS,
  },
});
let activeWakeLock = null;

function noop() {}

export function settleWithin(promise, timeoutMs) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).catch(() => null),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

export function rejectAfter(promise, timeoutMs, message) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

export function exportCallbacks(callbacks = {}) {
  return {
    setStatus: callbacks.setStatus || noop,
    setBusy: callbacks.setBusy || noop,
    showProgress: callbacks.showProgress || noop,
    updateProgress: callbacks.updateProgress || noop,
    completeProgress: callbacks.completeProgress || noop,
    failProgress: callbacks.failProgress || noop,
  };
}

export function exportQualityProfile(quality, deckId, runtimeMode = 'modern', format = 'png') {
  if (format === 'jpg') return { ...exportQualityProfile(quality, deckId, runtimeMode), imageFormat: 'image/jpeg', imageExtension: 'jpg', imageQuality: 0.95, backgroundColor: '#ffffff' };
  const profile = EXPORT_QUALITY_PROFILES[quality] || EXPORT_QUALITY_PROFILES.optimized;
  if (profile.id !== 'optimized' || runtimeMode === 'legacy') {
    return runtimeMode === 'legacy' && profile.id === 'optimized'
      ? { ...profile, label: 'Cân bằng tương thích', compatibility: true, imagePrepareConcurrency: 1, renderChunkSize: 1, captureConcurrency: 1 }
      : profile;
  }
  const isV6Family = deckId === 'spotlight-v6-diary' || (deckId === 'spotlight-v6' || deckId === 'spotlight-v6-color-edit') || deckId === 'spotlight-v6-green' || deckId === 'spotlight-v6-dark' || deckId === 'spotlight-v6-persimmon' || deckId === 'spotlight-v6-maps';
  return { ...profile, label: 'Cân bằng mới', losslessSource: true, fullResolutionV6: isV6Family,
    pixelRatio: isV6Family ? 1080 / 397 + 1e-9 : profile.pixelRatio,
    sourceImageMaxDimension: 0, sourceImageFormat: 'image/png', sourceImageQuality: 1 };
}

export async function exportRuntimeProfile(quality, cb) {
  if (quality !== 'optimized') return { mode: 'original', reason: '' };
  cb.setStatus('Đang kiểm tra sức máy trước khi xuất...');
  const runtime = await ensureRuntimePerformanceForBalancedExport();
  if (runtime.mode === 'legacy') cb.setStatus(`Dùng Cân bằng tương thích: ${runtime.reason}`);
  return runtime;
}

export async function mapExportWithSequentialRetry(items, limit, mapper, canRetry) {
  // Settle every in-flight capture before retrying, to release competing canvases.
  const failures = [];
  await mapWithConcurrency(items, limit, async (item, index) => {
    try { await mapper(item, index); }
    catch (error) { failures.push({ item, index, error }); }
  });
  for (const failure of failures) {
    if (!canRetry(failure.item)) throw failure.error;
    await mapper(failure.item, failure.index);
  }
}


export async function requestExportWakeLock() {
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

export async function releaseExportWakeLock() {
  const wakeLock = activeWakeLock;
  activeWakeLock = null;
  if (wakeLock && typeof wakeLock.release === 'function') {
    try {
      await settleWithin(wakeLock.release(), 3000);
    } catch {
      // Ignore wake-lock release races; export cleanup must continue.
    }
  }
}

export function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  let failure;
  const workerCount = Math.min(Math.max(limit, 1), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (!failure && cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try { results[index] = await mapper(items[index], index); }
      catch (error) { failure ||= error; }
    }
  });
  return Promise.all(workers).then(() => { if (failure) throw failure; return results; });
}

export function renderConcurrencyLimit() {
  const cores = Number(navigator.hardwareConcurrency || 4);
  return cores >= 8 ? 3 : 2;
}

function batchRenderConcurrencyLimit() {
  const cores = Number(navigator.hardwareConcurrency || 4);
  if (cores >= 12) return 14;
  if (cores >= 8) return 10;
  return 8;
}

function batchCaptureConcurrencyLimit() {
  const cores = Number(navigator.hardwareConcurrency || 4);
  if (cores >= 12) return 5;
  if (cores >= 8) return 4;
  return 3;
}

export function batchRenderChunkSize(profile) {
  return Number(profile?.renderChunkSize || batchRenderConcurrencyLimit());
}

export function batchCaptureConcurrencyForProfile(profile) {
  return Number(profile?.captureConcurrency || batchCaptureConcurrencyLimit());
}

export function resolveExportList(deck, list, dataset = null) {
  return resolveBudget72HExportList(deck, list, dataset);
}
