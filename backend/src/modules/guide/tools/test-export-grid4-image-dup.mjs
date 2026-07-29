/**
 * Kiểm tra grid-4: lúc tạo 4 ảnh khác URL, lúc xuất không bị chung 1 ảnh.
 *   node backend/src/modules/guide/tools/test-export-grid4-image-dup.mjs
 */
import { chromium } from '../../../../../frontend/node_modules/playwright/index.mjs';
import sharp from '../../../../../frontend/node_modules/sharp/lib/index.js';
import JSZip from '../../../../../frontend/node_modules/jszip/dist/jszip.min.js';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'export-quality-test-output', 'grid4-image-dup');
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const FRONTEND = process.env.FRONTEND_URL || 'http://127.0.0.1:3001';
const KEEP_LISTS = process.env.KEEP_LISTS === '1';
const LIST_COUNT = Math.max(2, Number(process.env.LIST_COUNT || 3));

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

async function generateBatch(count) {
  const response = await fetch(`${API}/api/decks/generate-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deckId: 'grid-4', count }),
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok) throw new Error(`generate-batch HTTP ${response.status}`);
  return response.json();
}

async function deleteList(listId) {
  await fetch(`${API}/api/decks/grid-4/lists/${encodeURIComponent(listId)}`, { method: 'DELETE' }).catch(() => null);
}

async function getGuideData() {
  const response = await fetch(`${API}/api/guide-data`, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`guide-data HTTP ${response.status}`);
  return response.json();
}

function auditCreateTimeUniqueness(lists) {
  const issues = [];
  for (const list of lists) {
    for (const page of list.pages || []) {
      if (page.type !== 'list') continue;
      const items = (page.items || []).filter((it) => String(it.imageUrl || '').trim());
      if (items.length < 2) continue;
      const urls = items.map((it) => String(it.imageUrl).trim());
      const unique = new Set(urls);
      if (unique.size < urls.length) {
        issues.push({
          listId: list.id,
          page: page.chipText || page.title,
          type: 'create-time-dup',
          count: urls.length,
          unique: unique.size,
        });
      }
      // Candidate overlap: primary unique nhưng pool candidate chung → rủi ro lúc xuất
      const primarySet = new Set(urls);
      const sharedCandidates = [];
      for (let i = 0; i < items.length; i += 1) {
        for (let j = i + 1; j < items.length; j += 1) {
          const a = new Set((items[i].candidateImageUrls || []).map(String));
          const b = new Set((items[j].candidateImageUrls || []).map(String));
          const overlap = [...a].filter((u) => b.has(u) && !primarySet.has(u));
          if (overlap.length) {
            sharedCandidates.push({
              a: items[i].name,
              b: items[j].name,
              overlap: overlap.length,
            });
          }
        }
      }
      if (sharedCandidates.length) {
        issues.push({
          listId: list.id,
          page: page.chipText || page.title,
          type: 'candidate-overlap',
          pairs: sharedCandidates.slice(0, 6),
        });
      }
    }
  }
  return issues;
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
      const left = data[y * 9 + x];
      const right = data[y * 9 + x + 1];
      hash = (hash << 1n) | BigInt(left > right ? 1 : 0);
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

/** Cắt 4 ô ảnh grid-4 (layout 2x2) từ PNG trang list — bỏ cover. */
async function analyzeGrid4PagePng(buffer, name) {
  const image = sharp(buffer);
  const meta = await image.metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (w < 100 || h < 100) return { name, skipped: true, reason: 'too-small' };

  // Vùng nội dung ảnh roughly giữa trang (bỏ header/footer text). 2x2.
  const top = Math.round(h * 0.18);
  const bottom = Math.round(h * 0.88);
  const left = Math.round(w * 0.06);
  const right = Math.round(w * 0.94);
  const boxW = right - left;
  const boxH = bottom - top;
  const cellW = Math.floor(boxW / 2);
  const cellH = Math.floor(boxH / 2);
  const inset = Math.max(4, Math.floor(Math.min(cellW, cellH) * 0.08));

  const cells = [];
  for (const [row, col] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    const leftCell = left + col * cellW + inset;
    const topCell = top + row * cellH + inset;
    const width = Math.max(16, cellW - inset * 2);
    const height = Math.max(16, cellH - inset * 2);
    const cellBuf = await sharp(buffer)
      .extract({ left: leftCell, top: topCell, width, height })
      .jpeg({ quality: 70 })
      .toBuffer();
    const hash = await dhashBuffer(cellBuf);
    const md5 = createHash('md5').update(cellBuf).digest('hex').slice(0, 12);
    cells.push({ row, col, hash, md5 });
  }

  const dupPairs = [];
  for (let i = 0; i < cells.length; i += 1) {
    for (let j = i + 1; j < cells.length; j += 1) {
      const dist = hamming(cells[i].hash, cells[j].hash);
      if (dist <= 6 || cells[i].md5 === cells[j].md5) {
        dupPairs.push({
          a: `${cells[i].row},${cells[i].col}`,
          b: `${cells[j].row},${cells[j].col}`,
          dist,
          sameMd5: cells[i].md5 === cells[j].md5,
        });
      }
    }
  }
  return { name, skipped: false, dupPairs, cellCount: cells.length };
}

async function exportAndAnalyze(listCount) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1100 });
  const zipPath = join(OUT_DIR, `grid4-${listCount}.zip`);
  const downloadPromise = page.waitForEvent('download', { timeout: 45 * 60 * 1000 }).then(async (download) => {
    await download.saveAs(zipPath);
    return zipPath;
  }).catch(() => null);

  const url = `${FRONTEND}/export-benchmark?autostart=1&mode=caption&lists=${listCount}&deck=grid-4`;
  console.log(`[export] ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__EXPORT_BENCHMARK__?.done === true, null, { timeout: 45 * 60 * 1000 });
  const bench = await page.evaluate(() => window.__EXPORT_BENCHMARK__);
  const saved = await downloadPromise;
  await browser.close();

  const pageReports = [];
  if (saved) {
    const zip = await JSZip.loadAsync(readFileSync(saved));
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir || !/\.png$/i.test(name)) continue;
      if (/cover/i.test(name)) continue;
      const buf = await entry.async('nodebuffer');
      pageReports.push(await analyzeGrid4PagePng(buf, name));
    }
  }

  return {
    success: Boolean(bench?.success),
    error: bench?.error || null,
    zipPath: saved,
    pageReports,
    visualDupPages: pageReports.filter((p) => !p.skipped && p.dupPairs?.length),
  };
}

async function main() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  await waitForServers();

  console.log('=== GRID-4 CREATE vs EXPORT IMAGE DUP ===');
  const generated = await generateBatch(LIST_COUNT);
  const createdIds = (generated.lists || []).map((l) => l.listId || l.id).filter(Boolean);
  console.log(`Tạo ${createdIds.length} list grid-4`);

  const data = await getGuideData();
  const deck = (data.decks || []).find((d) => d.id === 'grid-4');
  const lists = (deck?.lists || []).filter((l) => createdIds.includes(l.id));
  const createIssues = auditCreateTimeUniqueness(lists);
  const createDupes = createIssues.filter((i) => i.type === 'create-time-dup');
  const candidateOverlaps = createIssues.filter((i) => i.type === 'candidate-overlap');
  console.log(`Create-time URL dup pages: ${createDupes.length}`);
  console.log(`Pages có candidate overlap: ${candidateOverlaps.length}`);
  if (candidateOverlaps.length) {
    console.log('  sample:', JSON.stringify(candidateOverlaps[0], null, 2));
  }

  let exportResult = null;
  try {
    exportResult = await exportAndAnalyze(createdIds.length);
    console.log(`Export success=${exportResult.success} visualDupPages=${exportResult.visualDupPages.length}`);
    for (const page of exportResult.visualDupPages.slice(0, 8)) {
      console.log(`  DUP ${page.name}: ${JSON.stringify(page.dupPairs)}`);
    }
  } finally {
    if (!KEEP_LISTS) {
      console.log('Xóa list test...');
      for (const id of createdIds) await deleteList(id);
    }
  }

  const fail = createDupes.length > 0
    || !exportResult?.success
    || (exportResult?.visualDupPages.length || 0) > 0;

  const report = {
    testedAt: new Date().toISOString(),
    ok: !fail,
    created: createdIds.length,
    createDupes,
    candidateOverlaps: candidateOverlaps.length,
    export: {
      success: exportResult?.success || false,
      error: exportResult?.error || null,
      visualDupPages: exportResult?.visualDupPages || [],
    },
  };
  writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  console.log('\n=== TỔNG KẾT ===');
  console.log(JSON.stringify({
    ok: report.ok,
    createUrlDups: createDupes.length,
    candidateOverlapPages: candidateOverlaps.length,
    exportOk: report.export.success,
    exportVisualDups: report.export.visualDupPages.length,
  }, null, 2));
  process.exit(fail ? 2 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
