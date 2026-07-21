/**
 * Giả lập máy khác: browser cache tắt, tạo list AI thật, xuất ít → nhiều.
 * Phase 1: 2 list | Phase 2: 14 list
 *
 *   node backend/src/modules/guide/tools/test-export-cold-machine.mjs
 */
import { chromium } from '../../../../../frontend/node_modules/playwright/index.mjs';
import sharp from '../../../../../frontend/node_modules/sharp/lib/index.js';
import JSZip from '../../../../../frontend/node_modules/jszip/dist/jszip.min.js';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'export-quality-test-output', 'cold-machine');
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const FRONTEND = process.env.FRONTEND_URL || 'http://127.0.0.1:3001';
const KEEP_LISTS = process.env.KEEP_LISTS === '1';
const DECKS = ['grid-4', 'itinerary-4n2d-grid8', 'spotlight-guide', 'grid-8-quaytung', 'grid-6', 'grid-8', 'pov-3-day'];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServers() {
  for (let i = 0; i < 40; i += 1) {
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
    await sleep(2000);
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
    smallest: [...pages].sort((a, b) => a.sizeKB - b.sizeKB).slice(0, 8),
  };
}

async function exportCaptionListsCold(listCount, label) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.setViewportSize({ width: 1440, height: 1100 });

  const zipPath = join(OUT_DIR, `cold-${label}.zip`);
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

async function main() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  await waitForServers();

  console.log('=== COLD MACHINE EXPORT TEST ===');
  console.log('Giả lập máy khác: CDP Network.setCacheDisabled=true\n');

  const created = [];
  try {
    console.log('[phase1] Tạo 2 list AI...');
    const phase1Lists = await createLists(2);
    created.push(...phase1Lists);
    if (!phase1Lists.length) throw new Error('Không tạo được list phase1');

    const export1 = await exportCaptionListsCold(phase1Lists.length, '2lists');
    const analysis1 = export1.zipPath ? await analyzeZip(export1.zipPath) : null;
    console.log('[phase1]', JSON.stringify({
      success: export1.success,
      durationSec: export1.durationSec,
      pages: analysis1?.pageCount,
      greySuspects: analysis1?.suspectCount,
      ratio: analysis1?.suspectRatio,
    }));

    console.log('\n[phase2] Tạo thêm tới 14 list...');
    const more = await createLists(Math.max(0, 14 - created.length));
    created.push(...more);
    const target = Math.min(14, created.length);
    console.log(`Xuất ${target} list caption mới nhất`);

    const export2 = await exportCaptionListsCold(target, '14lists');
    const analysis2 = export2.zipPath ? await analyzeZip(export2.zipPath) : null;
    console.log('[phase2]', JSON.stringify({
      success: export2.success,
      durationSec: export2.durationSec,
      pages: analysis2?.pageCount,
      greySuspects: analysis2?.suspectCount,
      ratio: analysis2?.suspectRatio,
    }));

    const phase1Fail = !export1.success
      || (analysis1?.suspectCount || 0) > Math.max(1, Math.floor((analysis1?.pageCount || 0) * 0.15));
    const phase2Fail = !export2.success
      || (analysis2?.suspectCount || 0) > Math.max(2, Math.floor((analysis2?.pageCount || 0) * 0.15));

    const report = {
      testedAt: new Date().toISOString(),
      coldBrowser: true,
      created,
      phase1: { lists: phase1Lists, export: export1, analysis: analysis1, fail: phase1Fail },
      phase2: { listCount: target, export: export2, analysis: analysis2, fail: phase2Fail },
      ok: !phase1Fail && !phase2Fail,
    };
    writeFileSync(join(OUT_DIR, 'cold-machine-report.json'), JSON.stringify(report, null, 2));

    console.log('\n=== TỔNG KẾT ===');
    console.log(JSON.stringify({
      ok: report.ok,
      phase1Fail,
      phase2Fail,
      phase1: { greySuspects: analysis1?.suspectCount, pages: analysis1?.pageCount },
      phase2: { greySuspects: analysis2?.suspectCount, pages: analysis2?.pageCount },
      outDir: OUT_DIR,
    }, null, 2));

    if (analysis1?.suspects?.length) {
      console.log('\nPhase1 grey samples:');
      analysis1.suspects.slice(0, 5).forEach((s) => console.log(`  ${s.name} ${s.sizeKB}KB stdev=${s.stdev} ${s.reason}`));
    }
    if (analysis2?.suspects?.length) {
      console.log('\nPhase2 grey samples:');
      analysis2.suspects.slice(0, 8).forEach((s) => console.log(`  ${s.name} ${s.sizeKB}KB stdev=${s.stdev} ${s.reason}`));
    }

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
