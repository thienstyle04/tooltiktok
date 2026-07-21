/**
 * Đo tốc độ xuất sau tối ưu: 6 list → 18 list (clone mains, không cần AI).
 *   node backend/src/modules/guide/tools/test-export-speed.mjs
 */
import { chromium } from '../../../../../frontend/node_modules/playwright/index.mjs';
import sharp from '../../../../../frontend/node_modules/sharp/lib/index.js';
import JSZip from '../../../../../frontend/node_modules/jszip/dist/jszip.min.js';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'export-quality-test-output', 'export-speed');
const FRONTEND = process.env.FRONTEND_URL || 'http://127.0.0.1:3001';
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServers() {
  for (let i = 0; i < 30; i += 1) {
    try {
      const [fe, be] = await Promise.all([
        fetch(FRONTEND, { signal: AbortSignal.timeout(4000) }),
        fetch(`${API}/api/health`, { signal: AbortSignal.timeout(4000) }),
      ]);
      if (fe.ok && be.ok) return;
    } catch {
      // retry
    }
    await sleep(1500);
  }
  throw new Error('Servers chưa sẵn sàng');
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
  return { suspect: nearGreyGreen || (meanY < 55 && stdev < 12) };
}

async function analyzeZip(zipPath) {
  const zip = await JSZip.loadAsync(readFileSync(zipPath));
  let pageCount = 0;
  let suspectCount = 0;
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || !/\.png$/i.test(name)) continue;
    pageCount += 1;
    const buf = await entry.async('nodebuffer');
    const score = await scorePngGrey(buf);
    if (score.suspect) suspectCount += 1;
  }
  return { pageCount, suspectCount };
}

async function exportClone(listCount, label) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1100 });

  const zipPath = join(OUT_DIR, `speed-${label}.zip`);
  const downloadPromise = page.waitForEvent('download', { timeout: 45 * 60 * 1000 }).then(async (download) => {
    await download.saveAs(zipPath);
    return zipPath;
  }).catch(() => null);

  const url = `${FRONTEND}/export-benchmark?autostart=1&mode=clone&lists=${listCount}`;
  console.log(`[export ${label}] ${url}`);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__EXPORT_BENCHMARK__?.done === true, null, { timeout: 45 * 60 * 1000 });
  const bench = await page.evaluate(() => window.__EXPORT_BENCHMARK__);
  const wallSec = +((Date.now() - t0) / 1000).toFixed(1);
  const saved = await downloadPromise;
  await browser.close();

  const analysis = saved ? await analyzeZip(saved) : null;
  const pagesPerMin = analysis?.pageCount && bench?.durationSec
    ? +((analysis.pageCount / bench.durationSec) * 60).toFixed(1)
    : null;

  return {
    success: Boolean(bench?.success),
    error: bench?.error || null,
    listCount: bench?.listCount || listCount,
    durationSec: bench?.durationSec || null,
    wallSec,
    totalPages: bench?.totalPages || analysis?.pageCount || null,
    pagesPerMin,
    greySuspects: analysis?.suspectCount ?? null,
    zipPath: saved,
  };
}

async function main() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  await waitForServers();

  console.log('=== EXPORT SPEED TEST (optimized concurrency) ===\n');

  const phase1 = await exportClone(6, '6lists');
  console.log('[6 lists]', JSON.stringify({
    success: phase1.success,
    durationSec: phase1.durationSec,
    pages: phase1.totalPages,
    pagesPerMin: phase1.pagesPerMin,
    greySuspects: phase1.greySuspects,
  }));

  const phase2 = await exportClone(18, '18lists');
  console.log('[18 lists]', JSON.stringify({
    success: phase2.success,
    durationSec: phase2.durationSec,
    pages: phase2.totalPages,
    pagesPerMin: phase2.pagesPerMin,
    greySuspects: phase2.greySuspects,
  }));

  const ok = phase1.success && phase2.success
    && (phase1.greySuspects || 0) <= 1
    && (phase2.greySuspects || 0) <= Math.max(2, Math.floor((phase2.totalPages || 0) * 0.05));

  const report = {
    testedAt: new Date().toISOString(),
    phase1,
    phase2,
    ok,
    note: 'So sánh tham chiếu trước tối ưu: 14 list ~262s (~114 trang).',
  };
  writeFileSync(join(OUT_DIR, 'speed-report.json'), JSON.stringify(report, null, 2));

  console.log('\n=== TỔNG KẾT ===');
  console.log(JSON.stringify({
    ok,
    lists6: { sec: phase1.durationSec, pages: phase1.totalPages, ppm: phase1.pagesPerMin, grey: phase1.greySuspects },
    lists18: { sec: phase2.durationSec, pages: phase2.totalPages, ppm: phase2.pagesPerMin, grey: phase2.greySuspects },
    outDir: OUT_DIR,
  }, null, 2));

  process.exit(ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
