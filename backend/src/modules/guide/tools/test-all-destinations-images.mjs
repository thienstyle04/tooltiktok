/**
 * Quét ảnh thiếu / Drive lỗi / export xám — toàn bộ mẫu × 3 destination.
 *   node backend/src/modules/guide/tools/test-all-destinations-images.mjs
 *
 * Env:
 *   DESTINATIONS=dalat,phanthiet,greenland
 *   SKIP_EXPORT=1
 *   PROBE_LIMIT=50
 *   DECKS= (trống = mọi deck có list main)
 */
import { chromium } from '../../../../../frontend/node_modules/playwright/index.mjs';
import sharp from '../../../../../frontend/node_modules/sharp/lib/index.js';
import JSZip from '../../../../../frontend/node_modules/jszip/dist/jszip.min.js';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'export-quality-test-output', 'all-dest-images');
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const FRONTEND = process.env.FRONTEND_URL || 'http://127.0.0.1:3001';
const SKIP_EXPORT = process.env.SKIP_EXPORT === '1';
const PROBE_LIMIT = Math.max(10, Number(process.env.PROBE_LIMIT || 50));
const DESTINATIONS = (process.env.DESTINATIONS || 'dalat,phanthiet,greenland')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const DECK_FILTER = (process.env.DECKS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const SKIP_IMAGE_LAYOUTS = new Set([
  'budget-3n2d-table',
  'budget-3n2d-day',
  'budget-3n2d-total',
  'budget-wallet-bill',
  'budget-wallet-fixed',
  'grid-8-quaytung-menu',
]);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitServers() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const [fe, be] = await Promise.all([
        fetch(FRONTEND, { signal: AbortSignal.timeout(5000) }),
        fetch(`${API}/api/health`, { signal: AbortSignal.timeout(5000) }),
      ]);
      if (fe.ok && be.ok) return;
    } catch {
      // retry
    }
    await sleep(2000);
  }
  throw new Error('Frontend/backend chưa sẵn sàng');
}

async function setDestination(id) {
  const response = await fetch(`${API}/api/destination`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok) throw new Error(`setDestination ${id} HTTP ${response.status}`);
  return response.json();
}

async function getGuideData() {
  const response = await fetch(`${API}/api/guide-data`, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`guide-data HTTP ${response.status}`);
  return response.json();
}

function driveIdFromUrl(url) {
  const match = String(url || '').match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return match?.[1] || '';
}

function collectPageImageUrls(page) {
  const urls = [];
  const layout = String(page?.layoutVariant || '');
  if (SKIP_IMAGE_LAYOUTS.has(layout)) return urls;
  const push = (url) => {
    const clean = String(url || '').trim();
    if (clean) urls.push(clean);
  };
  push(page?.backgroundImage);
  for (const url of page?.gridImages || []) push(url);
  for (const url of page?.coverImages || []) push(url);
  for (const item of page?.items || []) push(item?.imageUrl);
  return urls;
}

function analyzeList(deckId, list) {
  const pages = list?.pages || [];
  let slots = 0;
  let missing = 0;
  const missingPages = [];
  const urls = [];
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i];
    const layout = String(page.layoutVariant || '');
    const pageUrls = collectPageImageUrls(page);
    if (!SKIP_IMAGE_LAYOUTS.has(layout) && (page.type === 'cover' || page.type === 'list')) {
      slots += 1;
      if (pageUrls.length === 0) {
        missing += 1;
        missingPages.push({
          index: i,
          type: page.type,
          chip: page.chipText || page.title || '',
          layout,
        });
      }
    }
    urls.push(...pageUrls);
  }
  const unique = new Set(urls);
  return {
    deckId,
    listId: list.id,
    pageCount: pages.length,
    imageSlots: slots,
    missingSlots: missing,
    missingPages,
    imageCount: urls.length,
    uniqueImages: unique.size,
    urls: [...unique],
    fail: missing > 0,
  };
}

async function probeUrl(url) {
  const fileId = driveIdFromUrl(url);
  const target = fileId
    ? `${API}/assets/drive-file?id=${encodeURIComponent(fileId)}`
    : (url.startsWith('http') ? url : `${API}${url.startsWith('/') ? '' : '/'}${url}`);
  const t0 = Date.now();
  try {
    const response = await fetch(target, { signal: AbortSignal.timeout(45000) });
    const buf = Buffer.from(await response.arrayBuffer());
    return {
      url: fileId ? `drive:${fileId.slice(0, 14)}` : String(url).slice(-40),
      status: response.status,
      bytes: buf.length,
      ms: Date.now() - t0,
      ok: response.ok && buf.length > 1500,
    };
  } catch (error) {
    return {
      url: fileId ? `drive:${fileId.slice(0, 14)}` : String(url).slice(-40),
      status: 0,
      bytes: 0,
      ms: Date.now() - t0,
      ok: false,
      error: String(error.message || error),
    };
  }
}

async function scorePngGrey(buffer) {
  const { data, info } = await sharp(buffer)
    .resize(64, 96, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumSq = 0;
  const n = info.width * info.height;
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    sumR += r;
    sumG += g;
    sumB += b;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    sumSq += y * y;
  }
  const meanR = sumR / n;
  const meanG = sumG / n;
  const meanB = sumB / n;
  const meanY = 0.299 * meanR + 0.587 * meanG + 0.114 * meanB;
  const stdev = Math.sqrt(Math.max(0, sumSq / n - meanY * meanY));
  const nearGreyGreen = meanR > 160 && meanG > 170 && meanB > 160
    && Math.abs(meanG - meanR) < 25
    && stdev < 18;
  return { suspect: nearGreyGreen || (meanY < 55 && stdev < 12) || buffer.length < 2000 };
}

async function analyzeZip(zipPath) {
  const zip = await JSZip.loadAsync(readFileSync(zipPath));
  let pageCount = 0;
  let suspectCount = 0;
  const suspects = [];
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || !/\.png$/i.test(name)) continue;
    pageCount += 1;
    const buf = await entry.async('nodebuffer');
    if ((await scorePngGrey(buf)).suspect) {
      suspectCount += 1;
      suspects.push(name);
    }
  }
  return { pageCount, suspectCount, suspects: suspects.slice(0, 12) };
}

async function exportDeckMain(deckId, destId) {
  const zipPath = join(OUT_DIR, `${destId}-${deckId}.zip`);
  const result = {
    deckId,
    destId,
    ok: false,
    pages: 0,
    grey: 0,
    suspects: [],
    error: '',
    ms: 0,
  };
  const t0 = Date.now();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 1100 });
    const downloadPromise = page.waitForEvent('download', { timeout: 20 * 60 * 1000 }).then(async (download) => {
      await download.saveAs(zipPath);
      return zipPath;
    });
    const url = `${FRONTEND}/export-benchmark?autostart=1&mode=clone&lists=1&deck=${encodeURIComponent(deckId)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const saved = await downloadPromise;
    const analysis = await analyzeZip(saved);
    result.pages = analysis.pageCount;
    result.grey = analysis.suspectCount;
    result.suspects = analysis.suspects;
    result.ok = analysis.pageCount > 0 && analysis.suspectCount === 0;
    if (!result.ok && analysis.pageCount === 0) result.error = 'zip không có png';
  } catch (error) {
    result.error = String(error.message || error).split('\n')[0];
    result.ok = false;
  } finally {
    result.ms = Date.now() - t0;
    if (browser) await browser.close().catch(() => null);
  }
  return result;
}

async function testDestination(destId) {
  console.log(`\n========== ${destId.toUpperCase()} ==========`);
  await setDestination(destId);
  await sleep(2000);
  const data = await getGuideData();
  const decks = (data.decks || []).filter((deck) => {
    if (DECK_FILTER.length && !DECK_FILTER.includes(deck.id)) return false;
    return (deck.lists || []).some((list) => (list.pages || []).length > 0);
  });
  console.log(`  decks=${decks.length} coverPool=${data?.source?.coverImageCount || 0}`);

  const listReports = [];
  const urlPool = new Set();
  for (const deck of decks) {
    for (const list of deck.lists || []) {
      const report = analyzeList(deck.id, list);
      listReports.push(report);
      report.urls.forEach((url) => urlPool.add(url));
      if (report.fail) {
        console.log(
          `  MISS ${deck.id}/${list.id}: ${report.missingSlots}/${report.imageSlots}`,
          JSON.stringify(report.missingPages.slice(0, 4)),
        );
      }
    }
  }

  const missLists = listReports.filter((r) => r.fail);
  const probeUrls = [...urlPool].sort(() => Math.random() - 0.5).slice(0, PROBE_LIMIT);
  console.log(`  Probe ${probeUrls.length}/${urlPool.size} ảnh...`);
  const probes = [];
  for (const url of probeUrls) probes.push(await probeUrl(url));
  const probeFail = probes.filter((p) => !p.ok);
  console.log(`  Probe fail: ${probeFail.length}/${probes.length}`);
  if (probeFail.length) console.log('   ', JSON.stringify(probeFail.slice(0, 10)));

  const exports = [];
  if (!SKIP_EXPORT) {
    for (const deck of decks) {
      process.stdout.write(`  Export ${deck.id} ... `);
      const exported = await exportDeckMain(deck.id, destId);
      exports.push(exported);
      console.log(
        exported.ok
          ? `OK pages=${exported.pages} (${Math.round(exported.ms / 1000)}s)`
          : `FAIL pages=${exported.pages} grey=${exported.grey} ${exported.error || exported.suspects.join(',')}`,
      );
    }
  }

  const exportFail = exports.filter((e) => !e.ok);
  return {
    destinationId: destId,
    deckCount: decks.length,
    deckIds: decks.map((d) => d.id),
    listCount: listReports.length,
    missListCount: missLists.length,
    missLists: missLists.map((r) => ({
      deckId: r.deckId,
      listId: r.listId,
      missingSlots: r.missingSlots,
      imageSlots: r.imageSlots,
      missingPages: r.missingPages,
    })),
    probeTotal: probes.length,
    probeFail: probeFail.length,
    probeFailures: probeFail,
    exports,
    exportFail: exportFail.length,
    fail: missLists.length > 0 || probeFail.length > 0 || exportFail.length > 0,
  };
}

async function main() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  await waitServers();
  console.log('=== ALL DESTINATIONS IMAGE / EXPORT CHECK ===');
  console.log({ DESTINATIONS, SKIP_EXPORT, PROBE_LIMIT, DECK_FILTER, FRONTEND, API });

  const results = [];
  for (const dest of DESTINATIONS) {
    results.push(await testDestination(dest));
  }
  try { await setDestination('dalat'); } catch { /* ignore */ }

  const ok = results.every((r) => !r.fail);
  const summary = {
    testedAt: new Date().toISOString(),
    ok,
    results: results.map((r) => ({
      id: r.destinationId,
      fail: r.fail,
      decks: r.deckCount,
      missLists: r.missListCount,
      probeFail: `${r.probeFail}/${r.probeTotal}`,
      exportFail: `${r.exportFail}/${r.exports.length}`,
      miss: r.missLists.slice(0, 8),
      exportErrors: r.exports.filter((e) => !e.ok).map((e) => ({
        deckId: e.deckId,
        pages: e.pages,
        grey: e.grey,
        error: e.error,
        suspects: e.suspects,
      })),
    })),
  };
  writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify({ summary, results }, null, 2));
  console.log('\n=== TỔNG KẾT ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log('Report:', join(OUT_DIR, 'report.json'));
  process.exit(ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
