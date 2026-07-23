/**
 * Test spotlight-v3 trên 3 destination: cấu trúc, hook cover, ảnh thiếu/trùng, font cơ bản.
 *   node backend/src/modules/guide/tools/test-spotlight-v3-destinations.mjs
 */
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'export-quality-test-output', 'spotlight-v3');
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const DESTINATIONS = (process.env.DESTINATIONS || 'dalat,phanthiet,greenland')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const LISTS_PER_DEST = Math.max(1, Number(process.env.LISTS_PER_DEST || 2));
const KEEP_LISTS = process.env.KEEP_LISTS === '1';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitApi() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(4000) });
      if (response.ok) return;
    } catch {
      // retry
    }
    await sleep(1500);
  }
  throw new Error('Backend chưa sẵn sàng');
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

async function generateBatch(count) {
  const response = await fetch(`${API}/api/decks/generate-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deckId: 'spotlight-v3', count }),
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`generate-batch HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

async function deleteList(listId) {
  await fetch(`${API}/api/decks/spotlight-v3/lists/${encodeURIComponent(listId)}`, { method: 'DELETE' }).catch(() => null);
}

function analyzeList(list, destinationId) {
  const pages = list?.pages || [];
  const errors = [];
  const warnings = [];

  if (pages.length < 9) errors.push(`too few pages: ${pages.length}`);
  if (pages.length > 13) warnings.push(`page count ${pages.length} > 13`);

  const cover = pages[0];
  if (!cover || cover.type !== 'cover') errors.push('missing cover');
  if (cover?.layoutVariant !== 'spotlight-v3') errors.push(`cover layout=${cover?.layoutVariant}`);
  if (!String(cover?.title || '').trim()) errors.push('empty cover title');
  if (destinationId === 'phanthiet' && /đà lạt|dalat/i.test(String(cover?.title || ''))) {
    warnings.push(`phanthiet cover still mentions Dalat: ${cover.title}`);
  }

  const listPages = pages.filter((page) => page.type === 'list');
  const listLayouts = listPages.map((page) => page.layoutVariant);
  if (listLayouts.some((layout) => String(layout || '').includes('list') && layout !== 'spotlight-v3')) {
    errors.push(`found list-style layout: ${listLayouts.join(',')}`);
  }

  const expectedChips = [
    'Check-in', 'Check-in',
    'Cafe', 'Cafe',
    'Quán ăn', 'Quán ăn',
    'Chơi đêm', 'Chơi đêm',
    'Homestay', 'Homestay',
    'Dịch vụ', 'Dịch vụ',
  ];
  for (let i = 0; i < Math.min(listPages.length, expectedChips.length); i += 1) {
    const chip = String(listPages[i].chipText || '');
    if (chip !== expectedChips[i]) warnings.push(`page ${i + 2} chip="${chip}" expected="${expectedChips[i]}"`);
  }

  const imageUrls = [];
  const itemIds = [];
  let missingImage = 0;
  let missingName = 0;
  let missingAddress = 0;
  let pricedPages = 0;
  let pricedMissing = 0;

  for (const page of listPages) {
    const item = page.items?.[0];
    if (!item) {
      errors.push(`empty items on ${page.chipText}`);
      continue;
    }
    if (!String(item.rawName || item.name || page.title || '').trim()) missingName += 1;
    if (!String(item.metaPrimary || '').trim()) missingAddress += 1;
    const img = String(item.imageUrl || page.backgroundImage || '').trim();
    if (!img) missingImage += 1;
    else imageUrls.push(img);
    if (item.id) itemIds.push(item.id);
    const chip = String(page.chipText || '');
    if (chip === 'Homestay' || chip === 'Dịch vụ') {
      pricedPages += 1;
      if (!/Giá:/i.test(String(item.metaSecondary || ''))) pricedMissing += 1;
    }
  }

  if (missingImage) errors.push(`missing images: ${missingImage}`);
  if (missingName) errors.push(`missing names: ${missingName}`);
  if (missingAddress) warnings.push(`missing address: ${missingAddress}`);
  if (pricedMissing) warnings.push(`homestay/service missing price: ${pricedMissing}/${pricedPages}`);

  const dupImages = imageUrls.length - new Set(imageUrls).size;
  const dupItems = itemIds.length - new Set(itemIds).size;
  if (dupImages > 0) errors.push(`duplicate images: ${dupImages}`);
  if (dupItems > 0) errors.push(`duplicate items: ${dupItems}`);

  // Font / text overflow heuristic: very long unbroken cover titles are risky.
  const coverTitle = String(cover?.title || '');
  if (coverTitle.length > 90) warnings.push(`cover title very long (${coverTitle.length})`);
  if (/\uFFFD/.test(coverTitle)) errors.push('cover title has replacement char (font/encoding)');

  return {
    listId: list.id,
    pageCount: pages.length,
    coverTitle,
    coverPlacement: cover?.titlePlacement || null,
    missingImage,
    dupImages,
    dupItems,
    pricedPages,
    pricedMissing,
    errors,
    warnings,
    fail: errors.length > 0,
  };
}

async function testDestination(destId) {
  console.log(`\n=== ${destId.toUpperCase()} ===`);
  const result = { destinationId: destId, created: [], analyses: [], fail: false, errors: [] };
  await setDestination(destId);
  const data = await getGuideData();
  const deck = (data.decks || []).find((entry) => entry.id === 'spotlight-v3');
  if (!deck) {
    result.fail = true;
    result.errors.push('spotlight-v3 deck missing');
    console.log('  FAIL: no spotlight-v3 deck');
    return result;
  }
  const main = (deck.lists || []).find((list) => String(list.id || '').includes('main')) || deck.lists?.[0];
  if (main) {
    const mainAnalysis = analyzeList(main, destId);
    result.analyses.push({ ...mainAnalysis, kind: 'main' });
    console.log('  main:', JSON.stringify({
      pages: mainAnalysis.pageCount,
      cover: mainAnalysis.coverTitle?.slice(0, 60),
      dupImages: mainAnalysis.dupImages,
      errors: mainAnalysis.errors,
      warnings: mainAnalysis.warnings,
    }));
    if (mainAnalysis.fail) result.fail = true;
  }

  console.log(`  Tạo ${LISTS_PER_DEST} list AI...`);
  try {
    const generated = await generateBatch(LISTS_PER_DEST);
    const lists = generated.lists || [];
    for (const entry of lists) result.created.push(entry.listId || entry.id);
    console.log(`  created ${lists.length}/${LISTS_PER_DEST}`);
  } catch (error) {
    result.fail = true;
    result.errors.push(String(error.message || error));
    console.log(`  generate FAIL: ${error.message || error}`);
    return result;
  }

  const refreshed = await getGuideData();
  const refreshedDeck = (refreshed.decks || []).find((entry) => entry.id === 'spotlight-v3');
  const captionLists = (refreshedDeck?.lists || []).filter((list) => result.created.includes(list.id));
  for (const list of captionLists) {
    const analysis = analyzeList(list, destId);
    result.analyses.push({ ...analysis, kind: 'caption' });
    console.log('  list', list.id, JSON.stringify({
      pages: analysis.pageCount,
      cover: analysis.coverTitle?.slice(0, 60),
      placement: analysis.coverPlacement,
      dupImages: analysis.dupImages,
      dupItems: analysis.dupItems,
      errors: analysis.errors,
      warnings: analysis.warnings,
    }));
    if (analysis.fail) result.fail = true;
  }

  if (!KEEP_LISTS) {
    for (const listId of result.created) await deleteList(listId);
  }
  return result;
}

async function main() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  await waitApi();
  console.log('=== SPOTLIGHT V3 MULTI-DESTINATION TEST ===');

  const results = [];
  for (const destId of DESTINATIONS) {
    results.push(await testDestination(destId));
  }

  try {
    await setDestination('dalat');
    console.log('\nĐã chuyển lại dalat');
  } catch (error) {
    console.log('Không chuyển lại dalat:', error.message || error);
  }

  const ok = results.every((entry) => !entry.fail);
  const report = { testedAt: new Date().toISOString(), ok, results };
  writeFileSync(join(OUT_DIR, 'spotlight-v3-report.json'), JSON.stringify(report, null, 2));
  console.log('\n=== TỔNG KẾT ===');
  console.log(JSON.stringify({
    ok,
    summary: results.map((entry) => ({
      id: entry.destinationId,
      fail: entry.fail,
      created: entry.created.length,
      errorLists: entry.analyses.filter((a) => a.fail).length,
      errors: entry.errors,
    })),
    outDir: OUT_DIR,
  }, null, 2));
  process.exit(ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
