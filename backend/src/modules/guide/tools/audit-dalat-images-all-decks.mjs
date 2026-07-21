/**
 * Audit ảnh toàn bộ mẫu deck Đà Lạt: URL rỗng, Drive fallback, lỗi tải thật (502/404/timeout).
 * Chạy:
 *   node backend/src/modules/guide/tools/audit-dalat-images-all-decks.mjs
 *   TEST_ASSET_URL=http://127.0.0.1:3001 node backend/src/modules/guide/tools/audit-dalat-images-all-decks.mjs
 */
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000/api/guide-data';
const ASSET = process.env.TEST_ASSET_URL || 'http://127.0.0.1:3000';
const PROBE_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS || 20000);
const CONCURRENCY = Number(process.env.PROBE_CONCURRENCY || 6);

const ALL_DECK_IDS = [
  'itinerary-3n2d',
  'budget-3n2d',
  'budget-72h-summary',
  'budget-3n2d-story',
  'itinerary-4n3d',
  'itinerary-4n2d-grid8',
  'pov-3-day',
  'grid-6',
  'grid-6-zigzag',
  'grid-8',
  'grid-4',
  'grid-4-mutant',
  'grid-5',
  'spotlight-guide',
  'spotlight-partner',
];

function listPages(deck) {
  const list = (deck.lists || []).find((entry) => /-main$/.test(entry.id)) || deck.lists?.[0];
  return list?.pages || [];
}

function collectImageRefs(pages) {
  const refs = [];
  for (const page of pages) {
    if (page.layoutVariant === 'budget-3n2d-table') continue;

    if (String(page.backgroundImage || '').trim()) {
      refs.push({
        kind: 'background',
        page: page.chipText || page.title || page.type,
        name: '(background)',
        url: String(page.backgroundImage).trim(),
      });
    }

    for (const item of page.items || []) {
      const url = String(item.imageUrl || '').trim();
      refs.push({
        kind: 'item',
        page: page.chipText || page.title || page.type,
        name: item.name || item.label || item.id || '(item)',
        url,
      });
    }
  }
  return refs;
}

async function probeUrl(url) {
  if (!url) return { state: 'empty' };

  try {
    const response = await fetch(`${ASSET}${url.startsWith('http') ? url.replace(/^https?:\/\/[^/]+/, '') : url}`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const fallback = response.headers.get('x-drive-image-fallback') === '1';
    const type = String(response.headers.get('content-type') || '').toLowerCase();

    if (!response.ok) {
      return { state: 'hardFail', status: response.status, type };
    }
    if (fallback || type.includes('svg')) {
      return { state: 'driveFallback', status: response.status, type };
    }
    if (type.includes('image')) {
      return { state: 'ok', status: response.status, type };
    }
    return { state: 'hardFail', status: response.status, type };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      state: message.includes('timeout') || message.includes('aborted') ? 'timeout' : 'hardFail',
      error: message,
    };
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  });
  await Promise.all(runners);
  return results;
}

await fetch('http://127.0.0.1:3000/api/destination', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: 'dalat' }),
}).catch(() => {});

const dataset = await fetch(API).then((response) => {
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
});

console.log(`=== AUDIT ẢNH ĐÀ LẠT | asset=${ASSET} ===\n`);

const summaryRows = [];
let totalRefs = 0;
let totalEmpty = 0;
let totalOk = 0;
let totalFallback = 0;
let totalHard = 0;
let totalTimeout = 0;

for (const deckId of ALL_DECK_IDS) {
  const deck = dataset.decks.find((entry) => entry.id === deckId);
  if (!deck) {
    summaryRows.push({ deckId, status: 'MISSING', empty: 0, ok: 0, fallback: 0, hard: 0, timeout: 0, refs: 0 });
    continue;
  }

  const refs = collectImageRefs(listPages(deck));
  const uniqueUrls = [...new Set(refs.map((ref) => ref.url).filter(Boolean))];
  const probeByUrl = new Map();

  await mapLimit(uniqueUrls, CONCURRENCY, async (url) => {
    probeByUrl.set(url, await probeUrl(url));
  });

  let empty = 0;
  let ok = 0;
  let fallback = 0;
  let hard = 0;
  let timeout = 0;
  const samples = [];

  for (const ref of refs) {
    if (!ref.url) {
      empty += 1;
      if (samples.length < 3) samples.push(`${ref.page} / ${ref.name}: EMPTY`);
      continue;
    }
    const probe = probeByUrl.get(ref.url) || { state: 'hardFail' };
    if (probe.state === 'ok') ok += 1;
    else if (probe.state === 'driveFallback') {
      fallback += 1;
      if (samples.length < 3) samples.push(`${ref.page} / ${ref.name}: DRIVE_FALLBACK`);
    } else if (probe.state === 'timeout') {
      timeout += 1;
      if (samples.length < 3) samples.push(`${ref.page} / ${ref.name}: TIMEOUT`);
    } else if (probe.state === 'hardFail') {
      hard += 1;
      if (samples.length < 3) samples.push(`${ref.page} / ${ref.name}: HARD_FAIL ${probe.status || probe.error || ''}`.trim());
    }
  }

  const withUrl = refs.length - empty;
  const status = empty === 0 && fallback === 0 && hard === 0 && timeout === 0
    ? 'PASS'
    : (hard > 0 || timeout > 0 || empty > 0 ? 'FAIL' : 'WARN');

  summaryRows.push({ deckId, status, empty, ok, fallback, hard, timeout, refs: refs.length, withUrl, samples });
  totalRefs += refs.length;
  totalEmpty += empty;
  totalOk += ok;
  totalFallback += fallback;
  totalHard += hard;
  totalTimeout += timeout;
}

for (const row of summaryRows) {
  const pct = row.withUrl ? Math.round((row.ok / row.withUrl) * 100) : 0;
  console.log(
    `${row.status.padEnd(4)} ${row.deckId.padEnd(22)} refs=${String(row.refs).padStart(3)} empty=${String(row.empty).padStart(2)} ok=${String(row.ok).padStart(3)} fallback=${String(row.fallback).padStart(2)} hard=${String(row.hard).padStart(2)} timeout=${String(row.timeout).padStart(2)} real=${String(pct).padStart(3)}%`,
  );
  for (const sample of row.samples || []) console.log(`      - ${sample}`);
}

console.log('\n=== TỔNG ===');
console.log(`refs=${totalRefs} empty=${totalEmpty} ok=${totalOk} driveFallback=${totalFallback} hardFail=${totalHard} timeout=${totalTimeout}`);
console.log(`asset base: ${ASSET}`);

const failDecks = summaryRows.filter((row) => row.status === 'FAIL');
const warnDecks = summaryRows.filter((row) => row.status === 'WARN');
console.log(`\nFAIL decks: ${failDecks.length} | WARN decks: ${warnDecks.length} | PASS decks: ${summaryRows.filter((row) => row.status === 'PASS').length}`);

if (failDecks.length > 0 || warnDecks.length > 0) process.exit(1);
