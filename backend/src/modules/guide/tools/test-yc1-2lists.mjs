/**
 * YC1 test: export 2 lists with optimized profile, measure PNG sizes.
 */
import { chromium } from '../../../../../frontend/node_modules/playwright/index.mjs';
import JSZip from '../../../../../frontend/node_modules/jszip/dist/jszip.min.js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'export-quality-test-output', 'yc1-2lists');
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://127.0.0.1:3001/export-benchmark?autostart=1&lists=2';
const TIMEOUT_MS = 20 * 60 * 1000;

async function waitForServers() {
  for (let i = 0; i < 40; i++) {
    try {
      const [fe, be] = await Promise.all([
        fetch('http://127.0.0.1:3001', { signal: AbortSignal.timeout(5000) }),
        fetch('http://127.0.0.1:3000/api/health', { signal: AbortSignal.timeout(5000) }),
      ]);
      if (fe.ok && be.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Frontend/backend chưa sẵn sàng.');
}

function summarizeSizes(files) {
  const sizes = files.map((f) => f.sizeKB).sort((a, b) => a - b);
  const sum = sizes.reduce((s, v) => s + v, 0);
  const mid = sizes[Math.floor(sizes.length / 2)] || 0;
  return {
    count: sizes.length,
    minKB: +(sizes[0] || 0).toFixed(1),
    maxKB: +(sizes[sizes.length - 1] || 0).toFixed(1),
    avgKB: sizes.length ? +(sum / sizes.length).toFixed(1) : 0,
    medianKB: +mid.toFixed(1),
    totalMB: +(sum / 1024).toFixed(2),
  };
}

async function analyzeZip(zipPath) {
  const zip = await JSZip.loadAsync(readFileSync(zipPath));
  const files = [];
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || !/\.png$/i.test(name)) continue;
    const buf = await entry.async('nodebuffer');
    files.push({ name, sizeKB: buf.length / 1024 });
  }
  files.sort((a, b) => b.sizeKB - a.sizeKB);
  return { files, stats: summarizeSizes(files) };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  await waitForServers();

  const wallStart = Date.now();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1200 });

  const downloadPromise = page.waitForEvent('download', { timeout: TIMEOUT_MS }).then(async (download) => {
    const path = join(OUT_DIR, download.suggestedFilename() || 'yc1-2lists.zip');
    await download.saveAs(path);
    return path;
  }).catch(() => null);

  console.log(`Opening ${FRONTEND_URL}`);
  await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__EXPORT_BENCHMARK__?.done === true, null, { timeout: TIMEOUT_MS });

  const bench = await page.evaluate(() => window.__EXPORT_BENCHMARK__);
  const zipPath = await downloadPromise;
  await browser.close();

  let fileAnalysis = null;
  if (zipPath) {
    fileAnalysis = await analyzeZip(zipPath);
  }

  const report = {
    yc: 'YC1 - tăng chất lượng cân bằng',
    profile: bench?.profile || { jpegQuality: 0.97, maxDimension: 3000, pixelRatio: 2.5 },
    success: Boolean(bench?.success),
    error: bench?.error || null,
    listCount: bench?.listCount || 2,
    totalPages: bench?.totalPages || null,
    durationSec: bench?.durationSec || null,
    wallClockSec: +((Date.now() - wallStart) / 1000).toFixed(1),
    zipPath,
    zipSizeMB: zipPath ? +(readFileSync(zipPath).length / (1024 * 1024)).toFixed(2) : null,
    pngStats: fileAnalysis?.stats || null,
    top5LargestKB: (fileAnalysis?.files || []).slice(0, 5).map((f) => ({ name: f.name, sizeKB: +f.sizeKB.toFixed(1) })),
    targetMBPerImage: '2.5-3',
    testedAt: new Date().toISOString(),
  };

  writeFileSync(join(OUT_DIR, 'yc1-2lists-report.json'), JSON.stringify(report, null, 2));

  console.log('\n=== YC1 TEST: 2 LIST (OPTIMIZED MỚI) ===');
  console.log(`Profile: JPEG ${Math.round((report.profile.jpegQuality || 0) * 100)}%, max ${report.profile.maxDimension}px, pixelRatio ${report.profile.pixelRatio}`);
  console.log(`Thời gian xuất: ${report.durationSec}s (wall ${report.wallClockSec}s)`);
  console.log(`ZIP: ${report.zipSizeMB} MB, ${report.totalPages} trang`);
  if (report.pngStats) {
    const s = report.pngStats;
    console.log(`PNG/trang — min: ${s.minKB} KB | median: ${s.medianKB} KB | avg: ${s.avgKB} KB | max: ${s.maxKB} KB`);
    const inRange = fileAnalysis.files.filter((f) => f.sizeKB >= 2500 && f.sizeKB <= 3000).length;
    const above25 = fileAnalysis.files.filter((f) => f.sizeKB >= 2500).length;
    console.log(`Trang đạt 2.5–3 MB: ${inRange}/${s.count} | trang >= 2.5 MB: ${above25}/${s.count}`);
  }
  if (report.top5LargestKB.length) {
    console.log('Top 5 file lớn nhất:');
    report.top5LargestKB.forEach((f) => console.log(`  ${f.sizeKB} KB — ${f.name}`));
  }

  process.exit(report.success ? 0 : 1);
}

main().catch((err) => {
  console.error('YC1 test failed:', err.message || err);
  process.exit(1);
});
