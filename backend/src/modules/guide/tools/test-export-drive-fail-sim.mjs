/**
 * Mô phỏng "tạo thì đẹp, xuất mới hỏng": chặn N% request /assets/drive-file
 * NGAY LÚC XUẤT (Playwright route abort) rồi soi PNG xuất ra:
 *   - ô xám placeholder (không lấy được ảnh)
 *   - ô trùng ảnh nhau (fallback lấy chung 1 candidate)
 *
 *   node backend/src/modules/guide/tools/test-export-drive-fail-sim.mjs
 *   FAIL_PCT=50 DECK=grid-4 LIST_COUNT=2 node ...
 */
import { chromium } from '../../../../../frontend/node_modules/playwright/index.mjs';
import sharp from '../../../../../frontend/node_modules/sharp/lib/index.js';
import JSZip from '../../../../../frontend/node_modules/jszip/dist/jszip.min.js';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'export-quality-test-output', 'drive-fail-sim');
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const FRONTEND = process.env.FRONTEND_URL || 'http://127.0.0.1:3001';
const DECK = process.env.DECK || 'grid-4';
const LIST_COUNT = Math.max(1, Number(process.env.LIST_COUNT || 2));
const FAIL_PCT = Math.min(95, Math.max(0, Number(process.env.FAIL_PCT || 50)));
const KEEP_LISTS = process.env.KEEP_LISTS === '1';

const GRID_CROPS = {
  'grid-4': { cols: 2, rows: 2 },
  'grid-6': { cols: 2, rows: 3 },
  'grid-8': { cols: 2, rows: 4 },
  'grid-8-feed': { cols: 2, rows: 4 },
};

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
  throw new Error('Servers chưa sẵn sàng');
}

/** Fail ổn định theo id — giống Drive chết hẳn với 1 file (retry cũng fail). */
function shouldFailId(id) {
  let h = 5381;
  for (const ch of String(id)) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return (h % 100) < FAIL_PCT;
}

async function generateBatch(deckId, count) {
  const response = await fetch(`${API}/api/decks/generate-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deckId, count }),
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok) throw new Error(`generate-batch HTTP ${response.status}`);
  return response.json();
}

async function deleteList(deckId, listId) {
  await fetch(`${API}/api/decks/${encodeURIComponent(deckId)}/lists/${encodeURIComponent(listId)}`, {
    method: 'DELETE',
  }).catch(() => null);
}

async function dhashBuffer(buffer) {
  const { data } = await sharp(buffer)
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let hash = 0n;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      hash = (hash << 1n) | BigInt(data[y * 9 + x] > data[y * 9 + x + 1] ? 1 : 0);
    }
  }
  return hash;
}

function hamming(a, b) {
  let x = a ^ b;
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

async function analyzePagePng(buffer, name, cols, rows) {
  const meta = await sharp(buffer).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (w < 100 || h < 100) return { name, skipped: true };

  const top = Math.round(h * 0.16);
  const bottom = Math.round(h * 0.90);
  const left = Math.round(w * 0.05);
  const right = Math.round(w * 0.95);
  const cellW = Math.floor((right - left) / cols);
  const cellH = Math.floor((bottom - top) / rows);
  const inset = Math.max(4, Math.floor(Math.min(cellW, cellH) * 0.1));

  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const region = {
        left: left + col * cellW + inset,
        top: top + row * cellH + inset,
        width: Math.max(16, cellW - inset * 2),
        height: Math.max(16, cellH - inset * 2),
      };
      const cellBuf = await sharp(buffer).extract(region).jpeg({ quality: 70 }).toBuffer();
      const stats = await sharp(cellBuf).stats();
      const mean = stats.channels.reduce((s, c) => s + c.mean, 0) / stats.channels.length;
      const stdev = stats.channels.reduce((s, c) => s + c.stdev, 0) / stats.channels.length;
      cells.push({
        pos: `${row},${col}`,
        hash: await dhashBuffer(cellBuf),
        md5: createHash('md5').update(cellBuf).digest('hex').slice(0, 12),
        // Placeholder xuất: gradient #eef4ee→#d6e0d7 — sáng, gần phẳng
        placeholder: mean > 210 && stdev < 14,
        mean: Math.round(mean),
        stdev: Math.round(stdev * 10) / 10,
      });
    }
  }

  const dupPairs = [];
  for (let i = 0; i < cells.length; i += 1) {
    for (let j = i + 1; j < cells.length; j += 1) {
      if (cells[i].placeholder || cells[j].placeholder) continue;
      const dist = hamming(cells[i].hash, cells[j].hash);
      if (dist <= 6 || cells[i].md5 === cells[j].md5) {
        dupPairs.push({ a: cells[i].pos, b: cells[j].pos, dist, sameMd5: cells[i].md5 === cells[j].md5 });
      }
    }
  }
  return {
    name,
    skipped: false,
    dupPairs,
    placeholderCells: cells.filter((c) => c.placeholder).map((c) => ({ pos: c.pos, mean: c.mean, stdev: c.stdev })),
  };
}

async function main() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  await waitForServers();

  console.log(`=== DRIVE FAIL SIM: deck=${DECK} failPct=${FAIL_PCT}% lists=${LIST_COUNT} ===`);
  const generated = await generateBatch(DECK, LIST_COUNT);
  const createdIds = (generated.lists || []).map((l) => l.listId || l.id).filter(Boolean);
  console.log(`Tạo ${createdIds.length} list ${DECK}`);
  if (!createdIds.length) throw new Error('Không tạo được list');

  let blocked = 0;
  let passed = 0;
  const blockedIds = new Set();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1100 });

  await page.route('**/assets/drive-file*', (route) => {
    const url = new URL(route.request().url());
    const id = url.searchParams.get('id') || url.pathname;
    if (shouldFailId(id)) {
      blocked += 1;
      blockedIds.add(id);
      route.abort('failed');
    } else {
      passed += 1;
      route.continue();
    }
  });

  const zipPath = join(OUT_DIR, `${DECK}-fail${FAIL_PCT}.zip`);
  const downloadPromise = page.waitForEvent('download', { timeout: 30 * 60 * 1000 }).then(async (download) => {
    await download.saveAs(zipPath);
    return zipPath;
  }).catch(() => null);

  const url = `${FRONTEND}/export-benchmark?autostart=1&mode=caption&lists=${createdIds.length}&deck=${encodeURIComponent(DECK)}`;
  console.log(`[export] ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__EXPORT_BENCHMARK__?.done === true, null, { timeout: 30 * 60 * 1000 });
  const bench = await page.evaluate(() => window.__EXPORT_BENCHMARK__);
  const saved = await downloadPromise;
  await browser.close();

  console.log(`Drive requests: blocked=${blocked} (unique files ${blockedIds.size}) passed=${passed}`);
  console.log(`Export success=${bench?.success} error=${bench?.error || 'none'}`);

  const crop = GRID_CROPS[DECK] || { cols: 2, rows: 2 };
  const pageReports = [];
  if (saved) {
    const zip = await JSZip.loadAsync(readFileSync(saved));
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir || !/\.png$/i.test(name) || /cover/i.test(name)) continue;
      pageReports.push(await analyzePagePng(await entry.async('nodebuffer'), name, crop.cols, crop.rows));
    }
  }

  const dupPages = pageReports.filter((p) => !p.skipped && p.dupPairs?.length);
  const placeholderPages = pageReports.filter((p) => !p.skipped && p.placeholderCells?.length);

  try {
    if (!KEEP_LISTS) {
      console.log('Xóa list test...');
      for (const id of createdIds) await deleteList(DECK, id);
    }
  } catch {
    // ignore
  }

  const report = {
    testedAt: new Date().toISOString(),
    deck: DECK,
    failPct: FAIL_PCT,
    driveRequests: { blocked, passed, uniqueBlockedFiles: blockedIds.size },
    exportSuccess: Boolean(bench?.success),
    exportError: bench?.error || null,
    pagesAnalyzed: pageReports.length,
    dupPages,
    placeholderPages,
  };
  writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

  console.log('\n=== TỔNG KẾT ===');
  console.log(JSON.stringify({
    exportOk: report.exportSuccess,
    pagesAnalyzed: report.pagesAnalyzed,
    dupPages: dupPages.map((p) => ({ name: p.name, pairs: p.dupPairs })),
    placeholderPages: placeholderPages.map((p) => ({ name: p.name, cells: p.placeholderCells.length })),
  }, null, 2));

  // Trùng ảnh = lỗi thật. Placeholder khi Drive chết 50% là hành vi chấp nhận được (còn hơn sai ảnh).
  process.exit(dupPages.length > 0 || !report.exportSuccess ? 2 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
