/**
 * Kiểm tra nhiều mẫu: create OK nhưng export có thể chung ảnh (candidate fallback).
 *   node backend/src/modules/guide/tools/test-export-multi-deck-image-dup.mjs
 *
 * Env:
 *   DECKS=grid-4,grid-6,grid-8,grid-5,grid-6-zigzag,grid-4-mutant,grid-6-quaytung,grid-8-quaytung,grid-8-feed,spotlight-guide,pov-3-day
 *   LISTS_PER_DECK=2
 *   SKIP_EXPORT=1
 *   KEEP_LISTS=0
 */
import { chromium } from '../../../../../frontend/node_modules/playwright/index.mjs';
import sharp from '../../../../../frontend/node_modules/sharp/lib/index.js';
import JSZip from '../../../../../frontend/node_modules/jszip/dist/jszip.min.js';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'export-quality-test-output', 'multi-deck-image-dup');
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const FRONTEND = process.env.FRONTEND_URL || 'http://127.0.0.1:3001';
const KEEP_LISTS = process.env.KEEP_LISTS === '1';
const SKIP_EXPORT = process.env.SKIP_EXPORT === '1';
const LISTS_PER_DECK = Math.max(1, Number(process.env.LISTS_PER_DECK || 2));
const DECKS = (process.env.DECKS || [
  'grid-4',
  'grid-6',
  'grid-8',
  'grid-5',
  'grid-6-zigzag',
  'grid-4-mutant',
  'grid-6-quaytung',
  'grid-8-quaytung',
  'grid-8-feed',
  'spotlight-guide',
  'pov-3-day',
  'itinerary-3n2d',
  'budget-3n2d',
].join(','))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Layout dùng crop lưới để soi PNG xuất. */
const GRID_CROPS = {
  'grid-4': { cols: 2, rows: 2 },
  'grid-6': { cols: 2, rows: 3 },
  'grid-8': { cols: 2, rows: 4 },
  'grid-5': { cols: 2, rows: 3 },
  'grid-6-zigzag': { cols: 2, rows: 3 },
  'grid-4-mutant': { cols: 2, rows: 2 },
  'grid-6-quaytung': { cols: 2, rows: 3 },
  'grid-8-quaytung': { cols: 2, rows: 4 },
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

async function getGuideData() {
  const response = await fetch(`${API}/api/guide-data`, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`guide-data HTTP ${response.status}`);
  return response.json();
}

function pageItemImages(page) {
  return (page?.items || [])
    .map((it) => ({
      name: String(it.name || it.label || it.id || '(item)').trim(),
      imageUrl: String(it.imageUrl || '').trim(),
      candidates: (it.candidateImageUrls || []).map((u) => String(u || '').trim()).filter(Boolean),
    }))
    .filter((it) => it.imageUrl);
}

/** Giả lập: primary fail → lấy candidate. Có/không claim URL đã dùng. */
function simulateCandidateFallback(page, { claim = true } = {}) {
  const items = pageItemImages(page);
  if (items.length < 2) return { applicable: false, dups: [] };
  const used = new Set();
  const assigned = [];
  for (const item of items) {
    const pool = [...new Set([item.imageUrl, ...item.candidates].filter(Boolean))];
    // Bỏ primary để mô phỏng lỗi Drive lúc xuất
    const fallbacks = pool.filter((u) => u !== item.imageUrl);
    let picked = '';
    for (const url of fallbacks) {
      if (claim && used.has(url)) continue;
      picked = url;
      break;
    }
    // Không có candidate khác → giữ primary (như DOM/primary còn sống)
    if (!picked) picked = item.imageUrl;
    if (claim) used.add(picked);
    assigned.push({ name: item.name, url: picked });
  }
  const byUrl = new Map();
  for (const entry of assigned) {
    if (!byUrl.has(entry.url)) byUrl.set(entry.url, []);
    byUrl.get(entry.url).push(entry.name);
  }
  const dups = [...byUrl.entries()]
    .filter(([, names]) => names.length >= 2)
    .map(([url, names]) => ({ url: url.slice(-28), names }));
  return { applicable: true, itemCount: items.length, dups };
}

function auditLists(deckId, lists) {
  const createDups = [];
  const candidateOverlaps = [];
  const simWithoutClaim = [];
  const simWithClaim = [];
  let multiImagePages = 0;

  for (const list of lists) {
    for (const page of list.pages || []) {
      if (page.type === 'cover') continue;
      const items = pageItemImages(page);
      if (items.length < 2) continue;
      multiImagePages += 1;
      const urls = items.map((it) => it.imageUrl);
      if (new Set(urls).size < urls.length) {
        createDups.push({
          listId: list.id,
          page: page.chipText || page.title || page.layoutVariant,
          count: urls.length,
          unique: new Set(urls).size,
        });
      }

      const primarySet = new Set(urls);
      for (let i = 0; i < items.length; i += 1) {
        for (let j = i + 1; j < items.length; j += 1) {
          const a = new Set(items[i].candidates);
          const b = new Set(items[j].candidates);
          const overlap = [...a].filter((u) => b.has(u) && !primarySet.has(u));
          if (overlap.length) {
            candidateOverlaps.push({
              listId: list.id,
              page: page.chipText || page.title || page.layoutVariant,
              a: items[i].name,
              b: items[j].name,
              overlap: overlap.length,
            });
          }
        }
      }

      const noClaim = simulateCandidateFallback(page, { claim: false });
      const withClaim = simulateCandidateFallback(page, { claim: true });
      if (noClaim.dups.length) {
        simWithoutClaim.push({
          listId: list.id,
          page: page.chipText || page.title || page.layoutVariant,
          dups: noClaim.dups,
        });
      }
      if (withClaim.dups.length) {
        simWithClaim.push({
          listId: list.id,
          page: page.chipText || page.title || page.layoutVariant,
          dups: withClaim.dups,
        });
      }
    }
  }

  return {
    deckId,
    lists: lists.length,
    multiImagePages,
    createDups,
    candidateOverlapPairs: candidateOverlaps.length,
    candidateOverlapSamples: candidateOverlaps.slice(0, 4),
    riskWithoutClaimPages: simWithoutClaim.length,
    riskWithoutClaimSamples: simWithoutClaim.slice(0, 4),
    riskWithClaimPages: simWithClaim.length,
    riskWithClaimSamples: simWithClaim.slice(0, 4),
  };
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

async function analyzeGridPagePng(buffer, name, cols, rows) {
  const meta = await sharp(buffer).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (w < 100 || h < 100) return { name, skipped: true };

  const top = Math.round(h * 0.16);
  const bottom = Math.round(h * 0.90);
  const left = Math.round(w * 0.05);
  const right = Math.round(w * 0.95);
  const boxW = right - left;
  const boxH = bottom - top;
  const cellW = Math.floor(boxW / cols);
  const cellH = Math.floor(boxH / rows);
  const inset = Math.max(4, Math.floor(Math.min(cellW, cellH) * 0.1));

  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const leftCell = left + col * cellW + inset;
      const topCell = top + row * cellH + inset;
      const width = Math.max(16, cellW - inset * 2);
      const height = Math.max(16, cellH - inset * 2);
      const cellBuf = await sharp(buffer)
        .extract({ left: leftCell, top: topCell, width, height })
        .jpeg({ quality: 70 })
        .toBuffer();
      cells.push({
        row,
        col,
        hash: await dhashBuffer(cellBuf),
        md5: createHash('md5').update(cellBuf).digest('hex').slice(0, 12),
      });
    }
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
  return { name, skipped: false, dupPairs };
}

async function exportDeck(deckId, listCount) {
  const crop = GRID_CROPS[deckId] || null;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1100 });
  const zipPath = join(OUT_DIR, `${deckId}-${listCount}.zip`);
  const downloadPromise = page.waitForEvent('download', { timeout: 45 * 60 * 1000 }).then(async (download) => {
    await download.saveAs(zipPath);
    return zipPath;
  }).catch(() => null);

  const url = `${FRONTEND}/export-benchmark?autostart=1&mode=caption&lists=${listCount}&deck=${encodeURIComponent(deckId)}`;
  console.log(`    [export] ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__EXPORT_BENCHMARK__?.done === true, null, { timeout: 45 * 60 * 1000 });
  const bench = await page.evaluate(() => window.__EXPORT_BENCHMARK__);
  const saved = await downloadPromise;
  await browser.close();

  const visualDupPages = [];
  if (saved && crop) {
    const zip = await JSZip.loadAsync(readFileSync(saved));
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir || !/\.png$/i.test(name) || /cover/i.test(name)) continue;
      const report = await analyzeGridPagePng(await entry.async('nodebuffer'), name, crop.cols, crop.rows);
      if (!report.skipped && report.dupPairs?.length) visualDupPages.push(report);
    }
  }

  return {
    success: Boolean(bench?.success),
    error: bench?.error || null,
    visualDupPages,
    analyzedWithCrop: Boolean(crop),
  };
}

async function testDeck(deckId) {
  console.log(`\n=== ${deckId} ===`);
  const result = {
    deckId,
    created: [],
    audit: null,
    export: null,
    fail: false,
    errors: [],
  };

  try {
    process.stdout.write(`  Tạo ${LISTS_PER_DECK} list... `);
    const generated = await generateBatch(deckId, LISTS_PER_DECK);
    result.created = (generated.lists || []).map((l) => l.listId || l.id).filter(Boolean);
    console.log(`${result.created.length}/${LISTS_PER_DECK}`);
    if (!result.created.length) {
      result.fail = true;
      result.errors.push('no lists');
      return result;
    }

    const data = await getGuideData();
    const deck = (data.decks || []).find((d) => d.id === deckId);
    const lists = (deck?.lists || []).filter((l) => result.created.includes(l.id));
    result.audit = auditLists(deckId, lists);
    console.log(`  audit: multiPages=${result.audit.multiImagePages} createDup=${result.audit.createDups.length} candOverlap=${result.audit.candidateOverlapPairs} riskNoClaim=${result.audit.riskWithoutClaimPages} riskClaim=${result.audit.riskWithClaimPages}`);

    if (result.audit.createDups.length) {
      result.fail = true;
      result.errors.push(`create-time dup pages: ${result.audit.createDups.length}`);
    }
    if (result.audit.riskWithClaimPages > 0) {
      result.fail = true;
      result.errors.push(`vẫn trùng sau claim: ${result.audit.riskWithClaimPages}`);
    }

    if (!SKIP_EXPORT) {
      result.export = await exportDeck(deckId, result.created.length);
      console.log(`  export: ok=${result.export.success} visualDups=${result.export.visualDupPages.length} crop=${result.export.analyzedWithCrop}`);
      if (!result.export.success) {
        result.fail = true;
        result.errors.push(result.export.error || 'export failed');
      }
      if (result.export.visualDupPages.length) {
        result.fail = true;
        result.errors.push(`export visual dups: ${result.export.visualDupPages.length}`);
        for (const page of result.export.visualDupPages.slice(0, 3)) {
          console.log(`    DUP ${page.name}: ${JSON.stringify(page.dupPairs)}`);
        }
      }
    }
  } catch (error) {
    result.fail = true;
    result.errors.push(String(error.message || error));
    console.log(`  FAIL: ${error.message || error}`);
  } finally {
    if (!KEEP_LISTS && result.created.length) {
      console.log('  Xóa list test...');
      for (const id of result.created) await deleteList(deckId, id);
    }
  }

  return result;
}

async function main() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  await waitForServers();

  console.log('=== MULTI-DECK CREATE vs EXPORT IMAGE DUP ===');
  console.log(`decks=${DECKS.join(',')} listsPerDeck=${LISTS_PER_DECK} skipExport=${SKIP_EXPORT}`);

  const results = [];
  for (const deckId of DECKS) {
    results.push(await testDeck(deckId));
  }

  const ok = results.every((r) => !r.fail);
  const report = { testedAt: new Date().toISOString(), ok, results };
  writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

  console.log('\n=== TỔNG KẾT ===');
  console.log(JSON.stringify({
    ok,
    summary: results.map((r) => ({
      deck: r.deckId,
      fail: r.fail,
      lists: r.created.length,
      multiPages: r.audit?.multiImagePages ?? 0,
      createDup: r.audit?.createDups.length ?? 0,
      candOverlap: r.audit?.candidateOverlapPairs ?? 0,
      riskIfPrimaryFails: r.audit?.riskWithoutClaimPages ?? 0,
      riskAfterFix: r.audit?.riskWithClaimPages ?? 0,
      exportOk: r.export?.success ?? null,
      exportVisualDups: r.export?.visualDupPages.length ?? null,
      errors: r.errors,
    })),
  }, null, 2));

  process.exit(ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
