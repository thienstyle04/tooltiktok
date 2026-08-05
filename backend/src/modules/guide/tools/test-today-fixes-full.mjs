/**
 * Regression full cho các sửa hôm nay (dalat):
 * 1) Manual refresh=force (không auto-sync khi tạo list)
 * 2) Partner freshness list2 ưu tiên partner mới
 * 3) Partner image freshness: tái dùng partner thì ưu tiên ảnh mới
 * 4) Ảnh nền/item không trống (trừ trang thiết kế bỏ ảnh) + probe không SVG chết
 *
 *   node backend/src/modules/guide/tools/test-today-fixes-full.mjs dalat
 */
const API = process.env.TEST_API_URL || 'http://127.0.0.1';
const PORT = process.env.TEST_API_PORT || '3000';
const BASE = `${API}:${PORT}`.replace('::', ':');
const DESTINATION = (process.argv[2] || 'dalat').toLowerCase();
const KEEP_LISTS = process.env.KEEP_LISTS === '1';

const DECKS = (process.env.DECKS || [
  'grid-4', 'grid-6', 'grid-8', 'grid-5', 'grid-6-zigzag', 'grid-4-mutant',
  'pov-3-v2', 'budget-3n2d', 'itinerary-3n2d', 'itinerary-timeline', 'spotlight-guide',
].join(',')).split(',').map((s) => s.trim()).filter(Boolean);

const failures = [];
const created = [];
const summary = {
  refreshForce: null,
  noAutoSyncOnCreate: null,
  partnerFreshness: [],
  partnerImageFreshness: [],
  emptyImages: [],
  probeImages: [],
};

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

function partnerKey(item) {
  const display = String(item.rawName || item.name || '').trim();
  const colon = display.indexOf(':');
  return normalizeName(colon >= 0 ? display.slice(colon + 1).trim() : display);
}

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
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(options.timeoutMs || 300000),
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 300) }; }
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} → ${response.status}: ${String(body.message || body.raw || text).slice(0, 240)}`);
  }
  return body;
}

async function deleteList(deckId, listId) {
  await fetch(`${BASE}/api/decks/${encodeURIComponent(deckId)}/lists/${encodeURIComponent(listId)}`, {
    method: 'DELETE',
  }).catch(() => null);
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

function collectPartnerImages(list) {
  const map = new Map();
  for (const page of list?.pages || []) {
    if (page.type === 'cover') continue;
    for (const item of page.items || []) {
      if (!item.isPartner) continue;
      const key = partnerKey(item);
      if (!key) continue;
      const entry = {
        imageUrl: String(item.imageUrl || '').trim(),
        candidates: Array.from(new Set([
          ...(item.candidateImageUrls || []).map((u) => String(u || '').trim()).filter(Boolean),
          String(item.imageUrl || '').trim(),
        ].filter(Boolean))),
        name: item.rawName || item.name || key,
      };
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    }
  }
  return map;
}

function isDesignedNoItemImage(page, item) {
  const layout = String(page.layoutVariant || '');
  if (/budget-3n2d-table|budget.*table|cost-table/i.test(layout)) return true;
  if (/bill|wallet-fixed|wallet-bill/i.test(layout) && !item.imageUrl && !(item.candidateImageUrls || []).length) return true;
  return false;
}

function isDesignedNoBackground(page) {
  const layout = String(page.layoutVariant || '');
  if (page.type === 'cover') return false;
  if (/grid-5|grid-6|grid-8|grid-4|grid-6-zigzag|grid-4-mutant|grid-8-quaytung-menu|budget-3n2d-table/i.test(layout)) {
    // grid content pages intentionally empty bg; cover still required
    if (layout.includes('grid-') && page.type === 'list') return true;
    if (layout === 'budget-3n2d-table') return true;
  }
  return false;
}

function analyzeEmptyImages(list) {
  let bgSlots = 0;
  let bgEmpty = 0;
  let itemSlots = 0;
  let itemEmpty = 0;
  const samples = [];
  for (const page of list?.pages || []) {
    if (!isDesignedNoBackground(page)) {
      bgSlots += 1;
      if (!String(page.backgroundImage || '').trim()) {
        bgEmpty += 1;
        if (samples.length < 8) samples.push({ kind: 'bg', page: page.chipText || page.title || page.type, layout: page.layoutVariant });
      }
    }
    if (page.type !== 'list') continue;
    for (const item of page.items || []) {
      if (isDesignedNoItemImage(page, item)) continue;
      itemSlots += 1;
      if (!String(item.imageUrl || '').trim()) {
        itemEmpty += 1;
        if (samples.length < 10) {
          samples.push({
            kind: 'item',
            name: item.rawName || item.name,
            page: page.chipText || page.title,
            layout: page.layoutVariant,
            candidates: (item.candidateImageUrls || []).length,
          });
        }
      }
    }
  }
  return { bgSlots, bgEmpty, itemSlots, itemEmpty, samples };
}

async function probeUrl(url) {
  const absolute = /^https?:\/\//i.test(url) ? url : `${BASE}${url}`;
  try {
    const response = await fetch(absolute, { signal: AbortSignal.timeout(25000) });
    const buf = Buffer.from(await response.arrayBuffer());
    const ct = String(response.headers.get('content-type') || '');
    const head = buf.toString('utf8', 0, 80);
    const soft = ct.includes('svg') || head.includes('<svg');
    if (!response.ok || buf.length < 500) {
      return { ok: false, soft: false, hard: true, status: response.status, bytes: buf.length };
    }
    if (soft) return { ok: false, soft: true, hard: false, status: response.status, bytes: buf.length };
    return { ok: true, soft: false, hard: false, status: response.status, bytes: buf.length };
  } catch (error) {
    return { ok: false, soft: false, hard: true, error: String(error.message || error) };
  }
}

async function probeListImages(list, limit = 45) {
  const urls = new Set();
  for (const page of list?.pages || []) {
    if (!isDesignedNoBackground(page) && page.backgroundImage) urls.add(page.backgroundImage);
    if (page.type !== 'list') continue;
    for (const item of page.items || []) {
      if (isDesignedNoItemImage(page, item)) continue;
      if (item.imageUrl) urls.add(item.imageUrl);
    }
  }
  const sample = [...urls].slice(0, limit);
  let ok = 0;
  let soft = 0;
  let hard = 0;
  const bad = [];
  for (const url of sample) {
    const result = await probeUrl(url);
    if (result.ok) ok += 1;
    else if (result.soft) {
      soft += 1;
      if (bad.length < 5) bad.push({ url: url.slice(0, 100), kind: 'svg-fallback' });
    } else {
      hard += 1;
      if (bad.length < 5) bad.push({ url: url.slice(0, 100), kind: 'hard', ...result });
    }
  }
  return { pool: urls.size, sampled: sample.length, ok, soft, hard, bad };
}

async function waitReady() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const health = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
      const body = await health.json();
      if (body?.status === 'ok') return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Backend chưa sẵn sàng /api/health');
}

async function testRefreshForce() {
  console.log('\n=== 1) MANUAL REFRESH=force ===');
  const t0 = Date.now();
  const first = await api('/api/guide-data?refresh=force');
  const elapsed1 = Date.now() - t0;
  const t1 = Date.now();
  const second = await api('/api/guide-data?refresh=force');
  const elapsed2 = Date.now() - t1;
  const items = first?.source?.totalItems || 0;
  const ok = items > 0 && elapsed1 >= 2000 && elapsed2 >= 2000;
  summary.refreshForce = { ok, items, elapsed1, elapsed2, dest: first?.source?.destinationLabel };
  if (!ok) {
    failures.push(`refresh=force yếu/ nghi throttle (items=${items}, t1=${elapsed1}ms, t2=${elapsed2}ms)`);
    console.log('  FAIL', summary.refreshForce);
  } else {
    console.log(`  OK items=${items} t1=${elapsed1}ms t2=${elapsed2}ms (${first?.source?.destinationLabel})`);
  }
}

async function testNoForceSyncOnCreate() {
  console.log('\n=== 2) TẠO LIST KHÔNG ÉP SYNC SHEET ===');
  // Tạo 1 list; nếu vẫn ép sync full sheet thì thường >8-10s chỉ riêng sync.
  // Ở đây chỉ xác nhận create thành công và dataset vẫn phục vụ (không assert thời gian cứng quá).
  const t0 = Date.now();
  const gen = await api('/api/decks/generate-batch', {
    method: 'POST',
    body: JSON.stringify({ deckId: 'grid-4', count: 1 }),
  });
  const elapsed = Date.now() - t0;
  const listId = gen?.lists?.[0]?.listId || gen?.lists?.[0]?.id;
  if (listId) created.push({ deckId: 'grid-4', listId });
  const ok = Boolean(listId);
  summary.noAutoSyncOnCreate = { ok, elapsed, listId };
  if (!ok) {
    failures.push('Không tạo được list để kiểm tra không ép sync');
    console.log('  FAIL', summary.noAutoSyncOnCreate);
  } else {
    console.log(`  OK tạo list ${listId} trong ${elapsed}ms (không yêu cầu sync Sheet riêng)`);
  }
}

async function testDeckPair(deckId) {
  console.log(`\n=== DECK ${deckId} ===`);
  const gen = await api('/api/decks/generate-batch', {
    method: 'POST',
    body: JSON.stringify({ deckId, count: 2 }),
  });
  const ids = (gen.lists || []).map((l) => l.listId || l.id).filter(Boolean);
  created.push(...ids.map((listId) => ({ deckId, listId })));
  if (ids.length < 2) {
    failures.push(`${deckId}: chỉ tạo được ${ids.length}/2 list`);
    console.log(`  FAIL chỉ tạo ${ids.length}/2`);
    return;
  }

  const data = await api('/api/guide-data');
  const deck = (data.decks || []).find((d) => d.id === deckId);
  const list1 = (deck?.lists || []).find((l) => l.id === ids[0]);
  const list2 = (deck?.lists || []).find((l) => l.id === ids[1]);
  if (!list1 || !list2) {
    failures.push(`${deckId}: không thấy list sau tạo`);
    console.log('  FAIL missing lists in guide-data');
    return;
  }

  // Partner freshness
  const catalog = await api('/api/partners');
  const catalogBySection = new Map();
  for (const p of catalog || []) {
    const section = p.section || p.sectionKey || 'unknown';
    if (!catalogBySection.has(section)) catalogBySection.set(section, new Set());
    catalogBySection.get(section).add(normalizeName(p.name));
  }
  const p1 = collectPartners(list1);
  const p2 = collectPartners(list2);
  const overlap = [...p2.all].filter((k) => p1.all.has(k));
  const badReuse = [];
  for (const [section, keys2] of p2.bySection) {
    const keys1 = p1.bySection.get(section) || new Set();
    const catalogKeys = catalogBySection.get(section) || new Set();
    const freshLeft = [...catalogKeys].filter((k) => !keys1.has(k));
    for (const key of keys2) {
      if (keys1.has(key) && freshLeft.length > 0) {
        // reused while fresh remains in same section
        badReuse.push({ section, key, freshLeft: freshLeft.length });
      }
    }
  }
  const partnerRow = {
    deckId,
    list1: p1.all.size,
    list2: p2.all.size,
    overlap: overlap.length,
    badReuse: badReuse.length,
  };
  summary.partnerFreshness.push(partnerRow);
  if (badReuse.length) {
    failures.push(`${deckId}: tái dùng partner khi còn fresh (${badReuse.length})`);
    console.log(`  FAIL partner freshness badReuse=${badReuse.length}`, badReuse.slice(0, 3));
  } else {
    console.log(`  OK partner L1=${p1.all.size} L2=${p2.all.size} overlap=${overlap.length} badReuse=0`);
  }

  // Partner image freshness
  const imgs1 = collectPartnerImages(list1);
  const imgs2 = collectPartnerImages(list2);
  let overlapPartners = 0;
  let okFreshImage = 0;
  let forcedReuseSinglePhoto = 0;
  const badImageReuse = [];
  for (const [key, entries2] of imgs2) {
    const entries1 = imgs1.get(key);
    if (!entries1?.length) continue;
    overlapPartners += 1;
    const usedInList1 = new Set(entries1.map((e) => e.imageUrl).filter(Boolean));
    for (const e2 of entries2) {
      if (!e2.imageUrl || !usedInList1.has(e2.imageUrl)) {
        okFreshImage += 1;
        continue;
      }
      const unusedCandidates = e2.candidates.filter((url) => url && !usedInList1.has(url));
      if (unusedCandidates.length > 0) {
        badImageReuse.push({ name: e2.name, unusedLeft: unusedCandidates.length });
      } else {
        forcedReuseSinglePhoto += 1;
      }
    }
  }
  const imageRow = {
    deckId,
    overlapPartners,
    okFreshImage,
    forcedReuseSinglePhoto,
    badImageReuse: badImageReuse.length,
  };
  summary.partnerImageFreshness.push(imageRow);
  if (badImageReuse.length) {
    failures.push(`${deckId}: tái dùng ảnh partner dù còn candidate mới (${badImageReuse.length})`);
    console.log(`  FAIL image freshness`, badImageReuse.slice(0, 3));
  } else {
    console.log(`  OK image freshness overlap=${overlapPartners} fresh=${okFreshImage} singleReuse=${forcedReuseSinglePhoto}`);
  }

  // Empty images on both lists
  for (const [idx, list] of [[1, list1], [2, list2]]) {
    const empty = analyzeEmptyImages(list);
    summary.emptyImages.push({ deckId, list: idx, ...empty });
    if (empty.bgEmpty > 0 || empty.itemEmpty > 0) {
      failures.push(`${deckId} L${idx}: bgEmpty=${empty.bgEmpty}/${empty.bgSlots} itemEmpty=${empty.itemEmpty}/${empty.itemSlots}`);
      console.log(`  FAIL empty L${idx}`, empty.samples.slice(0, 4));
    } else {
      console.log(`  OK empty L${idx} bg=0/${empty.bgSlots} item=0/${empty.itemSlots}`);
    }

    const probe = await probeListImages(list);
    summary.probeImages.push({ deckId, list: idx, ...probe });
    if (probe.soft > 0 || probe.hard > 0) {
      failures.push(`${deckId} L${idx}: probe soft=${probe.soft} hard=${probe.hard}`);
      console.log(`  FAIL probe L${idx}`, probe.bad);
    } else {
      console.log(`  OK probe L${idx} ok=${probe.ok}/${probe.sampled} pool=${probe.pool}`);
    }
  }
}

async function main() {
  console.log(`\n======== FULL REGRESSION TODAY FIXES | ${DESTINATION} ========`);
  await waitReady();
  await api('/api/destination', { method: 'POST', body: JSON.stringify({ id: DESTINATION }) });

  await testRefreshForce();
  await testNoForceSyncOnCreate();

  for (const deckId of DECKS) {
    try {
      await testDeckPair(deckId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${deckId}: ${message}`);
      console.log(`  FAIL ${message}`);
    }
  }

  if (!KEEP_LISTS) {
    console.log('\n=== CLEANUP LIST TEST ===');
    for (const entry of created) {
      await deleteList(entry.deckId, entry.listId);
    }
    console.log(`  deleted ${created.length} lists`);
  }

  const report = {
    ok: failures.length === 0,
    destination: DESTINATION,
    decks: DECKS,
    failureCount: failures.length,
    failures,
    summary,
  };
  console.log('\n======== TỔNG KẾT ========');
  console.log(JSON.stringify({
    ok: report.ok,
    failureCount: report.failureCount,
    failures: report.failures,
    refreshForce: summary.refreshForce,
    partnerFreshnessFail: summary.partnerFreshness.filter((r) => r.badReuse > 0).map((r) => r.deckId),
    partnerImageFail: summary.partnerImageFreshness.filter((r) => r.badImageReuse > 0).map((r) => r.deckId),
    emptyFail: summary.emptyImages.filter((r) => r.bgEmpty > 0 || r.itemEmpty > 0).map((r) => `${r.deckId}:L${r.list}`),
    probeFail: summary.probeImages.filter((r) => r.soft > 0 || r.hard > 0).map((r) => `${r.deckId}:L${r.list}`),
  }, null, 2));

  const fs = await import('node:fs');
  const path = await import('node:path');
  const outDir = path.resolve('backend/reports');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'today-fixes-full.json'), JSON.stringify(report, null, 2));

  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
