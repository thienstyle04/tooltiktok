/**
 * Test multi-destination: đổi Sheet, load data, tạo list, quét trùng ảnh, xuất, quét xám.
 *   node backend/src/modules/guide/tools/test-multi-destination.mjs
 *
 * Env:
 *   DESTINATIONS=dalat,phanthiet,greenland
 *   LISTS_PER_DEST=4
 *   KEEP_LISTS=0
 *   SKIP_EXPORT=1   (chỉ kiểm tra data + trùng ảnh, bỏ Playwright)
 */
import { chromium } from '../../../../../frontend/node_modules/playwright/index.mjs';
import sharp from '../../../../../frontend/node_modules/sharp/lib/index.js';
import JSZip from '../../../../../frontend/node_modules/jszip/dist/jszip.min.js';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'export-quality-test-output', 'multi-destination');
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const FRONTEND = process.env.FRONTEND_URL || 'http://127.0.0.1:3001';
const KEEP_LISTS = process.env.KEEP_LISTS === '1';
const SKIP_EXPORT = process.env.SKIP_EXPORT === '1';
const DESTINATIONS = (process.env.DESTINATIONS || 'phanthiet,greenland')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const DECKS = (process.env.DECKS || 'grid-4,grid-6,grid-8,spotlight-guide,pov-3-day,grid-6-zigzag,itinerary-3n2d,budget-3n2d')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const LISTS_PER_DEST = Math.max(2, Number(process.env.LISTS_PER_DEST || 4));
/** Layout bắt buộc không được trùng ảnh trong cùng trang. */
const STRICT_NO_DUP_LAYOUTS = new Set([
  'budget-3n2d-gallery',
  'grid-4',
  'grid-6',
  'grid-8',
  'grid-5',
  'grid-6-zigzag',
  'grid-6-quaytung',
  'grid-8-feed',
  'grid-8-quaytung',
  'grid-4-mutant',
]);
const SKIP_IMAGE_LAYOUTS = new Set([
  'budget-3n2d-table',
  'budget-3n2d-day',
  'budget-3n2d-total',
  'grid-8-quaytung-menu',
]);

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

async function setDestination(id) {
  const response = await fetch(`${API}/api/destination`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`setDestination ${id} HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

async function getGuideData() {
  const response = await fetch(`${API}/api/guide-data`, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`guide-data HTTP ${response.status}`);
  return response.json();
}

async function probeDrive(fileId) {
  const t0 = Date.now();
  try {
    const response = await fetch(`${API}/assets/drive-file?id=${encodeURIComponent(fileId)}`, {
      signal: AbortSignal.timeout(60000),
    });
    const buf = Buffer.from(await response.arrayBuffer());
    return {
      fileId,
      status: response.status,
      bytes: buf.length,
      ms: Date.now() - t0,
      ok: response.ok && buf.length > 2000,
    };
  } catch (error) {
    return { fileId, status: 0, bytes: 0, ms: Date.now() - t0, ok: false, error: String(error.message || error) };
  }
}

function extractDriveIds(dataset, limit = 6) {
  const ids = new Set();
  const re = /[?&]id=([a-zA-Z0-9_-]+)/;
  const push = (url) => {
    const m = String(url || '').match(re);
    if (m?.[1]) ids.add(m[1]);
  };
  for (const url of dataset?.source?.coverImageUrls || []) push(url);
  for (const deck of dataset?.decks || []) {
    for (const list of deck.lists || []) {
      for (const page of list.pages || []) {
        push(page.backgroundImage);
        for (const cell of page.gridImages || []) push(cell);
        for (const cell of page.coverImages || []) push(cell);
      }
      if (ids.size >= limit * 3) break;
    }
  }
  return [...ids].slice(0, limit);
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
    throw new Error(`generate-batch ${deckId} HTTP ${response.status}: ${text.slice(0, 180)}`);
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
    process.stdout.write(`    Tạo ${count} list: ${deckId} ... `);
    try {
      const result = await generateBatch(deckId, count);
      const lists = result.lists || [];
      for (const entry of lists) created.push({ deckId, listId: entry.listId || entry.id });
      console.log(`${lists.length}/${count}`);
      remaining -= lists.length;
    } catch (error) {
      console.log(`FAIL ${error.message || error}`);
    }
    await sleep(1200);
  }
  return created;
}

function shortUrl(url) {
  const raw = String(url || '');
  const idMatch = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return `drive:${idMatch[1].slice(0, 12)}…`;
  return raw.slice(-36);
}

/** Quét trùng ảnh trong list: cùng trang (fail) + giữa các trang (warn/fail nếu nhiều). */
function findDuplicateImages(list) {
  const samePage = [];
  const crossPage = [];
  const urlUsages = new Map();

  for (const page of list?.pages || []) {
    const layout = String(page.layoutVariant || '');
    if (SKIP_IMAGE_LAYOUTS.has(layout)) continue;
    const chip = page.chipText || page.title || page.type || 'page';
    const pageEntries = [];

    const bg = String(page.backgroundImage || '').trim();
    if (bg) pageEntries.push({ url: bg, name: '(background)', kind: 'background' });

    for (const item of page.items || []) {
      const url = String(item.imageUrl || '').trim();
      if (!url) continue;
      const name = String(item.name || item.label || item.id || '(item)').trim();
      pageEntries.push({ url, name, kind: 'item' });
    }
    for (const url of page.gridImages || []) {
      const cleaned = String(url || '').trim();
      if (cleaned) pageEntries.push({ url: cleaned, name: '(grid)', kind: 'grid' });
    }
    for (const url of page.coverImages || []) {
      const cleaned = String(url || '').trim();
      if (cleaned) pageEntries.push({ url: cleaned, name: '(cover)', kind: 'cover' });
    }

    const byUrl = new Map();
    for (const entry of pageEntries) {
      if (!byUrl.has(entry.url)) byUrl.set(entry.url, []);
      byUrl.get(entry.url).push(entry);
      // Chỉ theo dõi item/grid cho trùng giữa trang — background cover hay lặp có chủ đích.
      if (entry.kind === 'item' || entry.kind === 'grid') {
        if (!urlUsages.has(entry.url)) urlUsages.set(entry.url, []);
        urlUsages.get(entry.url).push({ page: chip, name: entry.name, kind: entry.kind });
      }
    }
    for (const [url, entries] of byUrl.entries()) {
      const itemEntries = entries.filter((e) => e.kind === 'item' || e.kind === 'grid');
      if (itemEntries.length < 2) continue;
      const names = [...new Set(itemEntries.map((e) => e.name))];
      // Cùng URL gắn cho ≥2 địa điểm/ô khác nhau trên 1 trang = lặp hình người dùng thấy.
      if (names.length < 2 && itemEntries.length < 2) continue;
      samePage.push({
        page: chip,
        layout,
        count: itemEntries.length,
        names,
        url: shortUrl(url),
        strict: STRICT_NO_DUP_LAYOUTS.has(layout) || !layout || names.length >= 2,
      });
    }
  }

  for (const [url, usages] of urlUsages.entries()) {
    const pages = [...new Set(usages.map((u) => u.page))];
    if (pages.length < 2) continue;
    crossPage.push({
      url: shortUrl(url),
      pageCount: pages.length,
      pages: pages.slice(0, 6),
      names: [...new Set(usages.map((u) => u.name))].slice(0, 8),
      count: usages.length,
    });
  }

  return { samePage, crossPage };
}

async function auditCreatedLists(created) {
  const data = await getGuideData();
  const byDeck = new Map((data.decks || []).map((d) => [d.id, d]));
  const report = {
    listsChecked: 0,
    samePageDupes: 0,
    crossPageDupes: 0,
    hardFails: [],
    softWarns: [],
    details: [],
  };

  for (const entry of created) {
    const deck = byDeck.get(entry.deckId);
    const list = (deck?.lists || []).find((l) => l.id === entry.listId);
    if (!list) {
      report.hardFails.push(`${entry.deckId}/${entry.listId}: không tìm thấy sau generate`);
      continue;
    }
    report.listsChecked += 1;
    const dups = findDuplicateImages(list);
    const strictSame = dups.samePage.filter((d) => d.strict);
    const softSame = dups.samePage.filter((d) => !d.strict);
    report.samePageDupes += dups.samePage.length;
    report.crossPageDupes += dups.crossPage.length;

    if (strictSame.length) {
      for (const d of strictSame) {
        report.hardFails.push(
          `${entry.deckId}/${entry.listId} @${d.page}: trùng ảnh x${d.count} (${d.names.join(' | ')}) ${d.url}`,
        );
      }
    }
    if (softSame.length) {
      for (const d of softSame) {
        report.softWarns.push(
          `${entry.deckId}/${entry.listId} @${d.page}: trùng ảnh (soft) x${d.count} ${d.url}`,
        );
      }
    }
    // Ảnh item lặp giữa nhiều trang trong cùng list = lỗi rõ với người dùng
    if (dups.crossPage.length) {
      for (const d of dups.crossPage) {
        report.hardFails.push(
          `${entry.deckId}/${entry.listId}: ảnh lặp ${d.pageCount} trang (${d.names.join(' | ')}) ${d.url}`,
        );
      }
    }

    report.details.push({
      deckId: entry.deckId,
      listId: entry.listId,
      samePage: dups.samePage,
      crossPage: dups.crossPage,
    });
  }

  return report;
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
    if ((await scorePngGrey(buf)).suspect) suspectCount += 1;
  }
  return { pageCount, suspectCount };
}

async function exportCaptionLists(listCount, label) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1100 });
  const zipPath = join(OUT_DIR, `${label}.zip`);
  const downloadPromise = page.waitForEvent('download', { timeout: 45 * 60 * 1000 }).then(async (download) => {
    await download.saveAs(zipPath);
    return zipPath;
  }).catch(() => null);

  const url = `${FRONTEND}/export-benchmark?autostart=1&mode=caption&lists=${listCount}`;
  console.log(`    [export] ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__EXPORT_BENCHMARK__?.done === true, null, { timeout: 45 * 60 * 1000 });
  const bench = await page.evaluate(() => window.__EXPORT_BENCHMARK__);
  const saved = await downloadPromise;
  await browser.close();
  const analysis = saved ? await analyzeZip(saved) : null;
  return {
    success: Boolean(bench?.success),
    error: bench?.error || null,
    durationSec: bench?.durationSec || null,
    listCount: bench?.listCount || listCount,
    totalPages: bench?.totalPages || analysis?.pageCount || null,
    greySuspects: analysis?.suspectCount ?? null,
    zipPath: saved,
  };
}

async function testDestination(destId) {
  console.log(`\n=== ${destId.toUpperCase()} ===`);
  const result = {
    destinationId: destId,
    switchOk: false,
    guide: null,
    probes: [],
    created: [],
    imageDupes: null,
    export: null,
    fail: false,
    errors: [],
  };

  try {
    const switched = await setDestination(destId);
    result.switchOk = switched?.active?.id === destId || switched?.dataset?.source?.destinationId === destId;
    console.log(`  switch: ${result.switchOk ? 'OK' : 'WARN'} active=${switched?.active?.id || switched?.dataset?.source?.destinationId}`);
  } catch (error) {
    result.errors.push(String(error.message || error));
    result.fail = true;
    console.log(`  switch FAIL: ${error.message || error}`);
    return result;
  }

  try {
    const data = await getGuideData();
    result.guide = {
      destinationId: data?.source?.destinationId,
      decks: (data?.decks || []).length,
      imageCount: data?.source?.imageCount || 0,
      coverImageCount: data?.source?.coverImageCount || 0,
      totalItems: data?.source?.totalItems || 0,
      label: data?.source?.destinationLabel || null,
    };
    console.log('  guide-data:', JSON.stringify(result.guide));
    if (result.guide.destinationId !== destId) {
      result.errors.push(`guide-data destination mismatch: ${result.guide.destinationId}`);
      result.fail = true;
    }
    if (!result.guide.decks) {
      result.errors.push('no decks');
      result.fail = true;
    }

    const ids = extractDriveIds(data, 5);
    for (const fileId of ids) {
      const probe = await probeDrive(fileId);
      result.probes.push(probe);
    }
    const probeOk = result.probes.filter((p) => p.ok).length;
    console.log(`  probe drive-file: ${probeOk}/${result.probes.length}`);
    if (result.probes.length && probeOk < Math.ceil(result.probes.length * 0.5)) {
      result.errors.push('too many drive probe fails');
      result.fail = true;
    }
  } catch (error) {
    result.errors.push(String(error.message || error));
    result.fail = true;
    console.log(`  guide/probe FAIL: ${error.message || error}`);
    return result;
  }

  try {
    console.log(`  Tạo ${LISTS_PER_DEST} list AI...`);
    result.created = await createLists(LISTS_PER_DEST);
    if (!result.created.length) {
      result.errors.push('no lists created');
      result.fail = true;
      return result;
    }

    console.log('  Quét trùng ảnh...');
    result.imageDupes = await auditCreatedLists(result.created);
    console.log('  image-dupes:', JSON.stringify({
      lists: result.imageDupes.listsChecked,
      samePage: result.imageDupes.samePageDupes,
      crossPage: result.imageDupes.crossPageDupes,
      hardFails: result.imageDupes.hardFails.length,
      softWarns: result.imageDupes.softWarns.length,
    }));
    if (result.imageDupes.hardFails.length) {
      for (const msg of result.imageDupes.hardFails.slice(0, 12)) {
        console.log(`    DUP ${msg}`);
        result.errors.push(msg);
      }
      if (result.imageDupes.hardFails.length > 12) {
        result.errors.push(`... +${result.imageDupes.hardFails.length - 12} dup lỗi nữa`);
      }
      result.fail = true;
    }
    if (result.imageDupes.softWarns.length) {
      console.log(`    soft warns: ${result.imageDupes.softWarns.length}`);
    }

    if (SKIP_EXPORT) {
      console.log('  SKIP_EXPORT=1 — bỏ bước xuất');
      return result;
    }

    const exportCount = Math.min(result.created.length, LISTS_PER_DEST);
    result.export = await exportCaptionLists(exportCount, `${destId}-${exportCount}lists`);
    console.log('  export:', JSON.stringify({
      success: result.export.success,
      durationSec: result.export.durationSec,
      pages: result.export.totalPages,
      grey: result.export.greySuspects,
    }));
    if (!result.export.success) {
      result.errors.push(result.export.error || 'export failed');
      result.fail = true;
    }
    const pages = result.export.totalPages || 0;
    const grey = result.export.greySuspects || 0;
    if (grey > Math.max(1, Math.floor(pages * 0.15))) {
      result.errors.push(`too many grey pages: ${grey}/${pages}`);
      result.fail = true;
    }
  } catch (error) {
    result.errors.push(String(error.message || error));
    result.fail = true;
    console.log(`  create/export FAIL: ${error.message || error}`);
  } finally {
    if (!KEEP_LISTS && result.created.length) {
      console.log('  Xóa list test...');
      for (const entry of result.created) await deleteList(entry.deckId, entry.listId);
    }
  }

  return result;
}

async function main() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  await waitForServers();

  console.log('=== MULTI-DESTINATION TEST ===');
  console.log(`destinations=${DESTINATIONS.join(',')} listsPerDest=${LISTS_PER_DEST} skipExport=${SKIP_EXPORT}`);

  const results = [];
  for (const destId of DESTINATIONS) {
    results.push(await testDestination(destId));
  }

  try {
    await setDestination('dalat');
    console.log('\nĐã chuyển lại destination=dalat');
  } catch (error) {
    console.log(`\nKhông chuyển lại dalat: ${error.message || error}`);
  }

  const ok = results.every((r) => !r.fail);
  const report = { testedAt: new Date().toISOString(), ok, results };
  writeFileSync(join(OUT_DIR, 'multi-destination-report.json'), JSON.stringify(report, null, 2));

  console.log('\n=== TỔNG KẾT ===');
  console.log(JSON.stringify({
    ok,
    summary: results.map((r) => ({
      id: r.destinationId,
      fail: r.fail,
      decks: r.guide?.decks,
      images: r.guide?.imageCount,
      items: r.guide?.totalItems,
      lists: r.created.length,
      imageDupes: r.imageDupes ? {
        samePage: r.imageDupes.samePageDupes,
        crossPage: r.imageDupes.crossPageDupes,
        hardFails: r.imageDupes.hardFails.length,
      } : null,
      exportSec: r.export?.durationSec,
      pages: r.export?.totalPages,
      grey: r.export?.greySuspects,
      errors: r.errors.slice(0, 8),
    })),
    outDir: OUT_DIR,
  }, null, 2));

  process.exit(ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
