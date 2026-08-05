/**
 * Kiểm tra list 2 ưu tiên đối tác chưa dùng ở list 1; hết mới tái dùng.
 *   node backend/src/modules/guide/tools/test-partner-freshness-across-lists.mjs
 */
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const DESTINATION = (process.argv[2] || 'dalat').toLowerCase();
const DECKS = (process.env.DECKS || 'grid-4,grid-6,grid-8,grid-5,budget-3n2d,itinerary-3n2d')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const KEEP_LISTS = process.env.KEEP_LISTS === '1';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

/** "Ăn sáng: D'Lart" → cả full lẫn phần sau ':' */
function partnerKeysFromItem(item) {
  const keys = new Set();
  const push = (v) => {
    const n = normalizeName(v);
    if (n) keys.add(n);
  };
  push(item.name);
  push(item.rawName);
  const display = String(item.rawName || item.name || '').trim();
  const colon = display.indexOf(':');
  if (colon >= 0) push(display.slice(colon + 1).trim());
  return keys;
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(300000),
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 200) }; }
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} → ${response.status}: ${String(body.message || body.raw || text).slice(0, 200)}`);
  }
  return body;
}

function collectPartners(list) {
  const bySection = new Map();
  const all = new Set();
  for (const page of list?.pages || []) {
    if (page.type === 'cover') continue;
    for (const item of page.items || []) {
      if (!item.isPartner) continue;
      const section = item.sectionKey || page.layoutVariant || 'unknown';
      if (!bySection.has(section)) bySection.set(section, new Set());
      for (const key of partnerKeysFromItem(item)) {
        bySection.get(section).add(key);
        all.add(key);
      }
    }
  }
  return { all, bySection };
}

function catalogBySection(partners) {
  const map = new Map();
  for (const p of partners || []) {
    const section = p.section || p.sectionKey || 'unknown';
    if (!map.has(section)) map.set(section, new Set());
    map.get(section).add(normalizeName(p.name));
  }
  return map;
}

async function deleteList(deckId, listId) {
  await fetch(`${API}/api/decks/${encodeURIComponent(deckId)}/lists/${encodeURIComponent(listId)}`, {
    method: 'DELETE',
  }).catch(() => null);
}

async function testDeck(deckId, catalog) {
  console.log(`\n=== ${deckId} ===`);
  const created = [];
  const result = {
    deckId,
    fail: false,
    reusedWhileFreshLeft: [],
    list1Partners: 0,
    list2Partners: 0,
    overlap: 0,
    freshAvailableAfterList1: 0,
  };

  try {
    const gen = await api('/api/decks/generate-batch', {
      method: 'POST',
      body: JSON.stringify({ deckId, count: 2 }),
    });
    const ids = (gen.lists || []).map((l) => l.listId || l.id).filter(Boolean);
    created.push(...ids.map((listId) => ({ deckId, listId })));
    if (ids.length < 2) {
      result.fail = true;
      result.error = `chỉ tạo được ${ids.length}/2 list`;
      console.log(`  FAIL ${result.error}`);
      return { result, created };
    }

    const data = await api('/api/guide-data');
    const deck = (data.decks || []).find((d) => d.id === deckId);
    const list1 = (deck?.lists || []).find((l) => l.id === ids[0]);
    const list2 = (deck?.lists || []).find((l) => l.id === ids[1]);
    if (!list1 || !list2) {
      result.fail = true;
      result.error = 'không tìm thấy list sau generate';
      console.log(`  FAIL ${result.error}`);
      return { result, created };
    }

    const p1 = collectPartners(list1);
    const p2 = collectPartners(list2);
    result.list1Partners = p1.all.size;
    result.list2Partners = p2.all.size;
    const overlap = [...p2.all].filter((k) => p1.all.has(k));
    result.overlap = overlap.length;

    // Theo section: nếu list2 tái dùng partner section X trong khi catalog còn partner section X chưa dùng ở list1 → lỗi
    for (const [section, keys2] of p2.bySection.entries()) {
      const used1 = p1.bySection.get(section) || new Set();
      const catalogSection = catalog.get(section) || new Set();
      const freshLeft = [...catalogSection].filter((k) => !used1.has(k));
      result.freshAvailableAfterList1 += freshLeft.length;
      for (const key of keys2) {
        if (used1.has(key) && freshLeft.length > 0) {
          // Chỉ fail nếu còn fresh trong cùng section — đúng yêu cầu "hết mới lấy lại"
          result.reusedWhileFreshLeft.push({ section, key, freshLeft: freshLeft.length });
        }
      }
    }

    // Deduplicate reused reports by section+key
    const seen = new Set();
    result.reusedWhileFreshLeft = result.reusedWhileFreshLeft.filter((row) => {
      const id = `${row.section}|${row.key}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    if (result.reusedWhileFreshLeft.length) {
      result.fail = true;
      console.log(`  FAIL tái dùng đối tác khi còn fresh: ${result.reusedWhileFreshLeft.length}`);
      for (const row of result.reusedWhileFreshLeft.slice(0, 8)) {
        console.log(`    ${row.section}: ${row.key} (freshLeft=${row.freshLeft})`);
      }
    } else {
      console.log(`  OK list1=${result.list1Partners} list2=${result.list2Partners} overlap=${result.overlap} (overlap chỉ khi hết fresh/section)`);
    }
  } catch (error) {
    result.fail = true;
    result.error = String(error.message || error);
    console.log(`  FAIL ${result.error}`);
  }

  return { result, created };
}

async function main() {
  console.log(`\n=== TEST PARTNER FRESHNESS ACROSS LISTS | ${DESTINATION} ===\n`);
  await api('/api/destination', { method: 'POST', body: JSON.stringify({ id: DESTINATION }) });
  await api('/api/guide-data?refresh=1');
  const partners = await api('/api/partners');
  const catalog = catalogBySection(Array.isArray(partners) ? partners : []);
  console.log(`Catalog partners: ${[...catalog.values()].reduce((n, s) => n + s.size, 0)} across ${catalog.size} sections`);

  const allCreated = [];
  const results = [];
  for (const deckId of DECKS) {
    const { result, created } = await testDeck(deckId, catalog);
    results.push(result);
    allCreated.push(...created);
    await sleep(800);
  }

  if (!KEEP_LISTS) {
    console.log('\nXóa list test...');
    for (const entry of allCreated) await deleteList(entry.deckId, entry.listId);
  }

  const failed = results.filter((r) => r.fail);
  console.log('\n=== TỔNG KẾT ===');
  console.log(JSON.stringify({
    ok: failed.length === 0,
    failed: failed.map((r) => ({ deck: r.deckId, error: r.error, reused: r.reusedWhileFreshLeft?.length || 0 })),
    summary: results.map((r) => ({
      deck: r.deckId,
      fail: r.fail,
      list1: r.list1Partners,
      list2: r.list2Partners,
      overlap: r.overlap,
      badReuse: r.reusedWhileFreshLeft?.length || 0,
    })),
  }, null, 2));

  process.exit(failed.length ? 2 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
