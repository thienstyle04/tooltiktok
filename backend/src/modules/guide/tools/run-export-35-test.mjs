/**
 * Real browser export test: 35 lists, optimized (balanced) profile.
 */
import { chromium } from '../../../../../frontend/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'export-quality-test-output', 'export-35-real');
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://127.0.0.1:3001/export-benchmark?autostart=1';
const TIMEOUT_MS = 45 * 60 * 1000;

async function waitForServers() {
  for (let i = 0; i < 30; i++) {
    try {
      const [fe, be] = await Promise.all([
        fetch('http://127.0.0.1:3001', { signal: AbortSignal.timeout(5000) }),
        fetch('http://127.0.0.1:3000/api/guide-data', { signal: AbortSignal.timeout(5000) }),
      ]);
      if (fe.ok && be.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Frontend/backend chưa sẵn sàng.');
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  await waitForServers();

  const totalStarted = Date.now();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1200 });

  let downloadInfo = null;
  const downloadPromise = page.waitForEvent('download', { timeout: TIMEOUT_MS }).then(async (download) => {
    const path = join(OUT_DIR, download.suggestedFilename() || 'export-35.zip');
    await download.saveAs(path);
    return { path, filename: download.suggestedFilename() };
  }).catch(() => null);

  console.log(`Opening ${FRONTEND_URL}`);
  await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });

  await page.waitForFunction(() => window.__EXPORT_BENCHMARK__?.done === true, null, { timeout: TIMEOUT_MS });
  downloadInfo = await downloadPromise;

  const result = await page.evaluate(() => window.__EXPORT_BENCHMARK__);
  const totalMs = Date.now() - totalStarted;

  let zipSizeMB = null;
  if (downloadInfo?.path) {
    const { statSync } = await import('node:fs');
    zipSizeMB = +(statSync(downloadInfo.path).size / (1024 * 1024)).toFixed(2);
  }

  const report = {
    ...result,
    totalWallClockMs: totalMs,
    totalWallClockSec: +(totalMs / 1000).toFixed(1),
    totalWallClockMin: +(totalMs / 60000).toFixed(2),
    zipFile: downloadInfo?.path || null,
    zipSizeMB,
    testedAt: new Date().toISOString(),
  };

  writeFileSync(join(OUT_DIR, 'export-35-result.json'), JSON.stringify(report, null, 2));
  console.log('\n=== KẾT QUẢ XUẤT 35 LIST (OPTIMIZED MỚI) ===');
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
  return report;
}

main().catch((err) => {
  console.error('Export 35 test failed:', err.message || err);
  process.exit(1);
});
