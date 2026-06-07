/**
 * Benchmark updated optimized profile (~30 lists) — quality + timing.
 */
import sharp from '../../../../../frontend/node_modules/sharp/lib/index.js';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from '../../../../../frontend/node_modules/playwright/index.mjs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'export-quality-test-output', 'benchmark-30');
const API_URL = process.env.GUIDE_API_URL || 'http://127.0.0.1:3000/api/guide-data';
const ASSET_BASE = process.env.ASSET_BASE || 'http://127.0.0.1:3000';
const TARGET_LISTS = 30;

const OLD_OPTIMIZED = { maxDimension: 1800, quality: 0.86, format: 'jpeg' };
const NEW_OPTIMIZED = { maxDimension: 2400, quality: 0.94, format: 'jpeg' };

const EXPORT_PROFILE = {
  pixelRatio: 2,
  sourceImageMaxDimension: 2400,
  sourceImageQuality: 0.94,
  imagePrepareConcurrency: 24,
  captureConcurrency: 3,
  renderChunkSize: 12,
};

const PAGE_CSS = { width: 397, height: 562 };
const SLOTS = [
  { id: 'cover', cssW: 397, cssH: 562 },
  { id: 'grid4', cssW: 198, cssH: 281 },
  { id: 'grid6', cssW: 198, cssH: 187 },
  { id: 'zigzag', cssW: 86, cssH: 72 },
];

function listIsMain(list) {
  return /-main$/i.test(String(list?.id || ''));
}

function laplacianVariance(buffer, width, height) {
  const gray = new Float64Array(width * height);
  for (let i = 0; i < buffer.length; i += 4) gray[i / 4] = buffer[i] * 0.299 + buffer[i + 1] * 0.587 + buffer[i + 2] * 0.114;
  let sum = 0, sumSq = 0, count = 0;
  const kernel = [0, 1, 0, 1, -4, 1, 0, 1, 0];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let v = 0, ki = 0;
      for (let ky = -1; ky <= 1; ky++) for (let kx = -1; kx <= 1; kx++) v += gray[(y + ky) * width + (x + kx)] * kernel[ki++];
      sum += v; sumSq += v * v; count++;
    }
  }
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

async function resizeSource(buffer, profile) {
  const meta = await sharp(buffer).metadata();
  const maxDim = profile.maxDimension;
  const q = Math.round(profile.quality * 100);
  if (!maxDim) return sharp(buffer).png().toBuffer();
  const largest = Math.max(meta.width || 0, meta.height || 0);
  let pipeline = sharp(buffer);
  if (largest > maxDim) {
    const scale = maxDim / largest;
    pipeline = pipeline.resize(Math.max(1, Math.round((meta.width || 0) * scale)), Math.max(1, Math.round((meta.height || 0) * scale)), { fit: 'inside' });
  }
  return profile.format === 'jpeg'
    ? pipeline.jpeg({ quality: q, mozjpeg: true }).toBuffer()
    : pipeline.png().toBuffer();
}

async function fitCover(buffer, cssW, cssH, pixelRatio, format, quality) {
  const tw = Math.round(cssW * pixelRatio);
  const th = Math.round(cssH * pixelRatio);
  let p = sharp(buffer).resize(tw, th, { fit: 'cover', position: 'centre' });
  const { data, info } = await (format === 'jpeg' ? p.jpeg({ quality: Math.round(quality * 100), mozjpeg: true }) : p.png()).toBuffer({ resolveWithObject: true });
  const raw = await sharp(data).ensureAlpha().raw().toBuffer();
  return { data, info, sharpness: laplacianVariance(raw, info.width, info.height), bytes: data.length };
}

function resolveUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${ASSET_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

function collectImageTargets(pages) {
  const seen = new Set();
  const targets = [];
  for (const page of pages) {
    const urls = [];
    if (page.backgroundImage) urls.push(page.backgroundImage);
    for (const item of page.items || []) if (item.imageUrl) urls.push(item.imageUrl);
    for (const url of urls) {
      if (!seen.has(url)) {
        seen.add(url);
        targets.push(url);
      }
    }
  }
  return targets;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

function buildThirtyLists(dataset) {
  const mains = [];
  for (const deck of dataset.decks || []) {
    const main = (deck.lists || []).find((l) => listIsMain(l));
    if (main?.pages?.length) mains.push({ deckId: deck.id, navTitle: deck.navTitle, list: main });
  }
  if (!mains.length) throw new Error('Không có list main để mô phỏng benchmark.');

  const virtual = [];
  for (let i = 0; i < TARGET_LISTS; i++) {
    const src = mains[i % mains.length];
    virtual.push({
      id: `${src.deckId}-bench-${String(i + 1).padStart(2, '0')}`,
      deckId: src.deckId,
      navTitle: src.navTitle,
      title: `${src.list.title} (bench ${i + 1})`,
      pages: src.list.pages,
    });
  }
  return virtual;
}

async function fetchWithRetry(url, attempts = 3) {
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)));
  }
  throw lastError || new Error('fetch failed');
}

async function benchmarkImagePrep(imageUrls) {
  const cache = new Map();
  const started = performance.now();
  let ok = 0;
  let fail = 0;
  await mapWithConcurrency(imageUrls, 12, async (rawUrl) => {
    try {
      const url = resolveUrl(rawUrl);
      const res = await fetchWithRetry(url);
      const src = Buffer.from(await res.arrayBuffer());
      const resized = await resizeSource(src, {
        maxDimension: EXPORT_PROFILE.sourceImageMaxDimension,
        quality: EXPORT_PROFILE.sourceImageQuality,
        format: 'jpeg',
      });
      cache.set(rawUrl, resized);
      ok += 1;
      return resized.length;
    } catch {
      fail += 1;
      return null;
    }
  });
  return { ms: performance.now() - started, cache, uniqueImages: imageUrls.length, ok, fail };
}

async function benchmarkRenderSample() {
  const html2canvasPath = require.resolve('html2canvas/dist/html2canvas.min.js');
  const html2canvasJs = readFileSync(html2canvasPath, 'utf8');
  const browser = await chromium.launch({ headless: true });
  const times = [];
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto('http://127.0.0.1:3001', { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForSelector('.story-page', { timeout: 120000 });
    const nodes = await page.$$('.story-page');
    const sampleCount = Math.min(5, nodes.length);
    for (let i = 0; i < sampleCount; i++) {
      const t0 = performance.now();
      await page.evaluate(async ({ lib, index }) => {
        eval(lib);
        const node = document.querySelectorAll('.story-page')[index];
        if (!node) throw new Error('missing story-page');
        await html2canvas(node, { scale: 2, useCORS: true, logging: false, backgroundColor: null, imageTimeout: 30000 });
      }, { lib: html2canvasJs, index: i });
      times.push(performance.now() - t0);
    }
  } finally {
    await browser.close();
  }
  return times;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const totalStarted = performance.now();

  console.log('=== BENCHMARK OPTIMIZED MỚI (~30 LIST) ===\n');
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const dataset = await res.json();
  const virtualLists = buildThirtyLists(dataset);
  const allPages = virtualLists.flatMap((l) => l.pages);
  const imageUrls = collectImageTargets(allPages);

  console.log(`List mô phỏng : ${virtualLists.length}`);
  console.log(`Tổng trang     : ${allPages.length}`);
  console.log(`Ảnh unique     : ${imageUrls.length}`);
  console.log(`Profile mới    : JPEG ${EXPORT_PROFILE.sourceImageQuality * 100}%, max ${EXPORT_PROFILE.sourceImageMaxDimension}px\n`);

  // 1) Quality comparison old vs new
  console.log('--- So sánh chất lượng (old vs new optimized) ---');
  const sampleUrls = imageUrls.slice(0, 6);
  const qualityRows = [];
  for (const rawUrl of sampleUrls) {
    const url = resolveUrl(rawUrl);
    const imgRes = await fetch(url);
    if (!imgRes.ok) continue;
    const src = Buffer.from(await imgRes.arrayBuffer());
    for (const slot of SLOTS) {
      const oldR = await fitCover(await resizeSource(src, OLD_OPTIMIZED), slot.cssW, slot.cssH, 2, 'jpeg', 0.86);
      const newR = await fitCover(await resizeSource(src, NEW_OPTIMIZED), slot.cssW, slot.cssH, 2, 'jpeg', 0.94);
      const gain = ((newR.sharpness - oldR.sharpness) / oldR.sharpness * 100);
      qualityRows.push({ slot: slot.id, gainPct: +gain.toFixed(1), oldSharp: +oldR.sharpness.toFixed(0), newSharp: +newR.sharpness.toFixed(0) });
    }
  }
  const bySlot = SLOTS.map((slot) => {
    const rows = qualityRows.filter((r) => r.slot === slot.id);
    const avgGain = rows.reduce((s, r) => s + r.gainPct, 0) / (rows.length || 1);
    const avgNew = rows.reduce((s, r) => s + r.newSharp, 0) / (rows.length || 1);
    return { slot: slot.id, avgGainPct: +avgGain.toFixed(1), avgNewSharp: +avgNew.toFixed(0) };
  });
  for (const row of bySlot) {
    console.log(`  ${row.slot.padEnd(8)} nét hơn old optimized ~${row.avgGainPct}% (sharp=${row.avgNewSharp})`);
  }

  // 2) Image prep timing (new profile)
  console.log('\n--- Thời gian chuẩn bị ảnh (new optimized) ---');
  const prep = await benchmarkImagePrep(imageUrls);
  console.log(`  ${prep.uniqueImages} ảnh, ok ${prep.ok}, fail ${prep.fail}, concurrency 12: ${(prep.ms / 1000).toFixed(1)}s`);

  // 3) html2canvas sample render timing on live frontend
  console.log('\n--- Thời gian render html2canvas (mẫu từ UI) ---');
  const renderTimes = await benchmarkRenderSample();
  const avgRenderMs = renderTimes.reduce((s, v) => s + v, 0) / renderTimes.length;
  console.log(`  ${renderTimes.length} trang mẫu: ${renderTimes.map((t) => t.toFixed(0) + 'ms').join(', ')}`);
  console.log(`  Trung bình/trang: ${(avgRenderMs / 1000).toFixed(2)}s`);

  // 4) Extrapolate total export time for 30 lists
  const totalPages = allPages.length;
  const renderBatches = Math.ceil(totalPages / EXPORT_PROFILE.renderChunkSize);
  const renderParallelMs = Math.ceil(totalPages / EXPORT_PROFILE.captureConcurrency) * avgRenderMs;
  const layoutOverheadMs = renderBatches * 1200;
  const zipOverheadMs = 8000;
  const estimatedTotalMs = prep.ms + renderParallelMs + layoutOverheadMs + zipOverheadMs;
  const totalElapsedMs = performance.now() - totalStarted;

  const report = {
    profile: 'optimized (updated)',
    settings: {
      sourceImageMaxDimension: EXPORT_PROFILE.sourceImageMaxDimension,
      sourceImageQuality: EXPORT_PROFILE.sourceImageQuality,
      pixelRatio: EXPORT_PROFILE.pixelRatio,
      captureConcurrency: EXPORT_PROFILE.captureConcurrency,
      imagePrepareConcurrency: EXPORT_PROFILE.imagePrepareConcurrency,
    },
    simulatedLists: virtualLists.length,
    totalPages,
    uniqueImages: imageUrls.length,
    qualityComparison: bySlot,
    timing: {
      imagePrepSec: +(prep.ms / 1000).toFixed(1),
      avgRenderSecPerPage: +(avgRenderMs / 1000).toFixed(2),
      renderSamplePages: renderTimes.length,
      estimatedExportSec: +(estimatedTotalMs / 1000).toFixed(0),
      estimatedExportMin: +(estimatedTotalMs / 60000).toFixed(1),
      benchmarkScriptSec: +(totalElapsedMs / 1000).toFixed(1),
    },
    virtualListBreakdown: virtualLists.map((l) => ({ id: l.id, deckId: l.deckId, pages: l.pages.length })),
  };

  writeFileSync(join(OUT_DIR, 'benchmark-30-report.json'), JSON.stringify(report, null, 2));

  console.log('\n=== ƯỚC TÍNH XUẤT 30 LIST (OPTIMIZED MỚI) ===');
  console.log(`  Chuẩn bị ảnh  : ${report.timing.imagePrepSec}s`);
  console.log(`  Render pages  : ~${(renderParallelMs / 1000).toFixed(0)}s (${totalPages} trang, concurrency ${EXPORT_PROFILE.captureConcurrency})`);
  console.log(`  ZIP + overhead: ~${((layoutOverheadMs + zipOverheadMs) / 1000).toFixed(0)}s`);
  console.log(`  TỔNG ƯỚC TÍNH : ~${report.timing.estimatedExportMin} phút (${report.timing.estimatedExportSec}s)`);
  console.log(`\nBáo cáo: ${join(OUT_DIR, 'benchmark-30-report.json')}`);
}

main().catch((err) => {
  console.error('Benchmark failed:', err.message || err);
  process.exit(1);
});
