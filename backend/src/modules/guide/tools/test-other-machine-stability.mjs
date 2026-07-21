/**
 * Giả lập máy khác đầy đủ hơn cold export:
 * - Disk cache TRỐNG (thư mục riêng, không đụng cache máy hiện tại)
 * - Browser cache tắt
 * - Kiểm tra API ổn định + auto-warm tạo cache
 * - Tạo list AI → xuất 2 list → xuất 14 list, quét ảnh xám
 *
 * Chạy (backend/frontend đã start với DALAT_DRIVE_FILE_CACHE_DIR trỏ thư mục trống):
 *   node backend/src/modules/guide/tools/test-other-machine-stability.mjs
 */
import { chromium } from '../../../../../frontend/node_modules/playwright/index.mjs';
import sharp from '../../../../../frontend/node_modules/sharp/lib/index.js';
import JSZip from '../../../../../frontend/node_modules/jszip/dist/jszip.min.js';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../../../..');
const OUT_DIR = join(__dirname, 'export-quality-test-output', 'other-machine-stability');
const CACHE_DIR = process.env.DALAT_DRIVE_FILE_CACHE_DIR
  || join(ROOT, 'backend', 'data', 'drive-file-cache-sim-othermachine');
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const FRONTEND = process.env.FRONTEND_URL || 'http://127.0.0.1:3001';
const KEEP_LISTS = process.env.KEEP_LISTS === '1';
const PHASE1_LISTS = Math.max(1, Number(process.env.PHASE1_LISTS || 2));
const PHASE2_LISTS = Math.max(PHASE1_LISTS, Number(process.env.PHASE2_LISTS || 14));
const DECKS = ['grid-4', 'itinerary-4n2d-grid8', 'spotlight-guide', 'grid-8-quaytung', 'grid-6', 'grid-8', 'pov-3-day'];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function countCacheBins(dir) {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((name) => name.endsWith('.bin')).length;
}

async function waitForServers() {
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
  throw new Error('Frontend/backend chưa sẵn sàng.');
}

async function waitForGuideData() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch(`${API}/api/guide-data`, { signal: AbortSignal.timeout(60000) });
      if (response.ok) {
        const data = await response.json();
        return {
          ok: true,
          destinationId: data?.source?.destinationId || null,
          decks: (data?.decks || []).length,
          imageCount: data?.source?.imageCount || 0,
        };
      }
    } catch {
      // retry
    }
    await sleep(3000);
  }
  return { ok: false };
}

async function probeDriveProxy(fileId) {
  const url = `${API}/assets/drive-file?id=${encodeURIComponent(fileId)}`;
  const t0 = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
    const buf = Buffer.from(await response.arrayBuffer());
    return {
      fileId,
      status: response.status,
      bytes: buf.length,
      ms: Date.now() - t0,
      contentType: response.headers.get('content-type') || '',
      ok: response.ok && buf.length > 2000,
    };
  } catch (error) {
    return { fileId, status: 0, bytes: 0, ms: Date.now() - t0, ok: false, error: String(error.message || error) };
  }
}

async function sampleDriveIdsFromGuide() {
  const response = await fetch(`${API}/api/guide-data`, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) return [];
  const data = await response.json();
  const ids = new Set();
  const re = /[?&]id=([a-zA-Z0-9_-]+)/;
  const pushUrl = (url) => {
    const m = String(url || '').match(re);
    if (m?.[1]) ids.add(m[1]);
  };
  for (const url of data?.source?.coverImageUrls || []) pushUrl(url);
  for (const deck of data?.decks || []) {
    for (const list of deck.lists || []) {
      for (const page of list.pages || []) {
        pushUrl(page.backgroundImage);
        for (const cell of page.gridImages || []) pushUrl(cell);
        for (const cell of page.coverImages || []) pushUrl(cell);
      }
    }
  }
  return [...ids].slice(0, 8);
}

async function generateBatch(deckId, count) {
  const response = await fetch(`${API}/api/decks/generate-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deckId, count }),
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`generate-batch ${deckId} HTTP ${response.status}: ${text.slice(0, 160)}`);
  }
  return response.json();
}

async function deleteList(deckId, listId) {
  await fetch(`${API}/api/decks/${encodeURIComponent(deckId)}/lists/${encodeURIComponent(listId)}`, {
    method: 'DELETE',
  }).catch(() => null);
}

async function createLists(total) {
  const created = [];
  let remaining = total;
  for (const deckId of DECKS) {
    if (remaining <= 0) break;
    const count = Math.min(2, remaining);
    process.stdout.write(`  Tạo ${count} list: ${deckId} ... `);
    try {
      const result = await generateBatch(deckId, count);
      const lists = result.lists || [];
      for (const entry of lists) {
        created.push({ deckId, listId: entry.listId || entry.id });
      }
      console.log(`${lists.length}/${count}`);
      remaining -= lists.length;
    } catch (error) {
      console.log(`FAIL ${error.message || error}`);
    }
    await sleep(1500);
  }
  return created;
}

async function scorePngGrey(buffer) {
  const { data, info } = await sharp(buffer)
    .resize(80, 120, { fit: 'fill' })
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
  const variance = sumSq / n - meanY * meanY;
  const stdev = Math.sqrt(Math.max(0, variance));
  const nearGreyGreen = meanR > 160 && meanG > 170 && meanB > 160
    && Math.abs(meanG - meanR) < 25
    && stdev < 18;
  const nearFlatDark = meanY < 55 && stdev < 12;
  return {
    meanY: +meanY.toFixed(1),
    stdev: +stdev.toFixed(1),
    suspect: nearGreyGreen || nearFlatDark,
    reason: nearGreyGreen ? 'grey-green-flat' : (nearFlatDark ? 'dark-flat' : 'ok'),
  };
}

async function analyzeZip(zipPath) {
  const zip = await JSZip.loadAsync(readFileSync(zipPath));
  const pages = [];
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || !/\.png$/i.test(name)) continue;
    const buf = await entry.async('nodebuffer');
    const score = await scorePngGrey(buf);
    pages.push({ name, sizeKB: +(buf.length / 1024).toFixed(1), ...score });
  }
  const suspects = pages.filter((p) => p.suspect);
  return {
    pageCount: pages.length,
    suspectCount: suspects.length,
    suspectRatio: pages.length ? +(suspects.length / pages.length).toFixed(3) : 0,
    suspects: suspects.slice(0, 24),
  };
}

async function exportCaptionListsCold(listCount, label) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.setViewportSize({ width: 1440, height: 1100 });

  const zipPath = join(OUT_DIR, `stability-${label}.zip`);
  const downloadPromise = page.waitForEvent('download', { timeout: 45 * 60 * 1000 }).then(async (download) => {
    await download.saveAs(zipPath);
    return zipPath;
  }).catch(() => null);

  const url = `${FRONTEND}/export-benchmark?autostart=1&mode=caption&lists=${listCount}`;
  console.log(`\n[export ${label}] ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__EXPORT_BENCHMARK__?.done === true, null, { timeout: 45 * 60 * 1000 });
  const bench = await page.evaluate(() => window.__EXPORT_BENCHMARK__);
  const saved = await downloadPromise;
  await browser.close();
  return {
    success: Boolean(bench?.success),
    error: bench?.error || null,
    durationSec: bench?.durationSec || null,
    listCount: bench?.listCount || listCount,
    totalPages: bench?.totalPages || null,
    zipPath: saved,
  };
}

async function waitForAutoWarmProgress(minBins, timeoutMs = 180000) {
  const t0 = Date.now();
  let last = countCacheBins(CACHE_DIR);
  while (Date.now() - t0 < timeoutMs) {
    last = countCacheBins(CACHE_DIR);
    if (last >= minBins) return { ok: true, bins: last, waitedMs: Date.now() - t0 };
    await sleep(3000);
  }
  return { ok: last > 0, bins: last, waitedMs: Date.now() - t0 };
}

async function main() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(CACHE_DIR, { recursive: true });

  console.log('=== OTHER-MACHINE STABILITY TEST ===');
  console.log(`cacheDir=${CACHE_DIR}`);
  console.log(`cacheBins(start)=${countCacheBins(CACHE_DIR)}`);
  console.log('Giả lập: disk cache riêng + browser cache OFF\n');

  await waitForServers();
  const guide = await waitForGuideData();
  console.log('[guide-data]', JSON.stringify(guide));
  if (!guide.ok) throw new Error('guide-data không sẵn sàng');

  console.log('[auto-warm] Chờ cache disk tăng (tối thiểu 5 file)...');
  const warm = await waitForAutoWarmProgress(5, 120000);
  console.log('[auto-warm]', JSON.stringify(warm));

  const sampleIds = await sampleDriveIdsFromGuide();
  const probes = [];
  for (const fileId of sampleIds.slice(0, 5)) {
    probes.push(await probeDriveProxy(fileId));
  }
  const probeOk = probes.filter((p) => p.ok).length;
  console.log(`[probe] ${probeOk}/${probes.length} drive-file OK`);
  console.log(`cacheBins(after-probe)=${countCacheBins(CACHE_DIR)}`);

  const created = [];
  try {
    console.log(`\n[phase1] Tạo ${PHASE1_LISTS} list AI...`);
    const phase1Lists = await createLists(PHASE1_LISTS);
    created.push(...phase1Lists);
    if (!phase1Lists.length) throw new Error('Không tạo được list phase1');

    const export1 = await exportCaptionListsCold(phase1Lists.length, `${PHASE1_LISTS}lists`);
    const analysis1 = export1.zipPath ? await analyzeZip(export1.zipPath) : null;
    console.log('[phase1]', JSON.stringify({
      success: export1.success,
      durationSec: export1.durationSec,
      pages: analysis1?.pageCount,
      greySuspects: analysis1?.suspectCount,
      ratio: analysis1?.suspectRatio,
    }));

    const needMore = Math.max(0, PHASE2_LISTS - created.length);
    console.log(`\n[phase2] Tạo thêm tới ${PHASE2_LISTS} list (thêm ${needMore})...`);
    if (needMore > 0) {
      const more = await createLists(needMore);
      created.push(...more);
    }
    const target = Math.min(PHASE2_LISTS, created.length);
    console.log(`Xuất ${target} list caption mới nhất`);

    const export2 = await exportCaptionListsCold(target, `${target}lists`);
    const analysis2 = export2.zipPath ? await analyzeZip(export2.zipPath) : null;
    console.log('[phase2]', JSON.stringify({
      success: export2.success,
      durationSec: export2.durationSec,
      pages: analysis2?.pageCount,
      greySuspects: analysis2?.suspectCount,
      ratio: analysis2?.suspectRatio,
    }));

    const cacheEnd = countCacheBins(CACHE_DIR);
    const phase1Fail = !export1.success
      || (analysis1?.suspectCount || 0) > Math.max(1, Math.floor((analysis1?.pageCount || 0) * 0.15));
    const phase2Fail = !export2.success
      || (analysis2?.suspectCount || 0) > Math.max(2, Math.floor((analysis2?.pageCount || 0) * 0.15));
    const probeFail = probes.length > 0 && probeOk < Math.ceil(probes.length * 0.6);
    const warmFail = !warm.ok;

    const report = {
      testedAt: new Date().toISOString(),
      simulation: {
        emptyDiskCacheDir: CACHE_DIR,
        browserCacheDisabled: true,
        autoWarm: warm,
        cacheBinsEnd: cacheEnd,
      },
      guide,
      probes,
      created,
      phase1: { lists: phase1Lists, export: export1, analysis: analysis1, fail: phase1Fail },
      phase2: { listCount: target, export: export2, analysis: analysis2, fail: phase2Fail },
      ok: !phase1Fail && !phase2Fail && !probeFail && !warmFail,
      flags: { phase1Fail, phase2Fail, probeFail, warmFail },
    };
    writeFileSync(join(OUT_DIR, 'stability-report.json'), JSON.stringify(report, null, 2));

    console.log('\n=== TỔNG KẾT ===');
    console.log(JSON.stringify({
      ok: report.ok,
      flags: report.flags,
      autoWarmBins: warm.bins,
      cacheBinsEnd: cacheEnd,
      phase1: { greySuspects: analysis1?.suspectCount, pages: analysis1?.pageCount },
      phase2: { greySuspects: analysis2?.suspectCount, pages: analysis2?.pageCount },
      outDir: OUT_DIR,
    }, null, 2));

    process.exit(report.ok ? 0 : 2);
  } finally {
    if (!KEEP_LISTS) {
      console.log('\nXoá list AI test...');
      for (const entry of created) await deleteList(entry.deckId, entry.listId);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
