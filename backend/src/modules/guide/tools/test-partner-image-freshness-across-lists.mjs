/**
 * Khi list 2 tái dùng đối tác của list 1: nếu chỗ đó còn ảnh candidate chưa dùng
 * thì không được lấy lại đúng imageUrl của list 1.
 *
 *   node backend/src/modules/guide/tools/test-partner-image-freshness-across-lists.mjs dalat
 */
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const DESTINATION = (process.argv[2] || 'dalat').toLowerCase();
const DECKS = (process.env.DECKS || 'grid-4,grid-6,grid-8,grid-5,budget-3n2d,itinerary-3n2d')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const KEEP_LISTS = process.env.KEEP_LISTS === '1';

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

function collectPartnerImages(list) {
  /** @type {Map<string, { imageUrl: string, candidates: string[], name: string }[]>} */
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

async function deleteList(deckId, listId) {
  await fetch(`${API}/api/decks/${encodeURIComponent(deckId)}/lists/${encodeURIComponent(listId)}`, {
    method: 'DELETE',
  }).catch(() => null);
}

async function testDeck(deckId) {
  console.log(`\n=== ${deckId} ===`);
  const created = [];
  const result = {
    deckId,
    fail: false,
    overlapPartners: 0,
    badImageReuse: [],
    okFreshImage: 0,
    forcedReuseSinglePhoto: 0,
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
      result.error = 'không tìm thấy list sau khi tạo';
      console.log(`  FAIL ${result.error}`);
      return { result, created };
    }

    const imgs1 = collectPartnerImages(list1);
    const imgs2 = collectPartnerImages(list2);

    for (const [key, entries2] of imgs2) {
      const entries1 = imgs1.get(key);
      if (!entries1?.length) continue;
      result.overlapPartners += 1;
      const usedInList1 = new Set(entries1.map((e) => e.imageUrl).filter(Boolean));
      for (const e2 of entries2) {
        if (!e2.imageUrl || !usedInList1.has(e2.imageUrl)) {
          result.okFreshImage += 1;
          continue;
        }
        const unusedCandidates = e2.candidates.filter((url) => url && !usedInList1.has(url));
        if (unusedCandidates.length > 0) {
          result.badImageReuse.push({
            name: e2.name,
            reused: e2.imageUrl,
            unusedLeft: unusedCandidates.length,
          });
        } else {
          result.forcedReuseSinglePhoto += 1;
        }
      }
    }

    result.fail = result.badImageReuse.length > 0;
    if (result.fail) {
      console.log(`  FAIL overlap=${result.overlapPartners} badReuse=${result.badImageReuse.length}`);
      for (const bad of result.badImageReuse.slice(0, 5)) {
        console.log(`    - ${bad.name}: tái dùng ảnh dù còn ${bad.unusedLeft} candidate mới`);
      }
    } else {
      console.log(
        `  OK overlap=${result.overlapPartners} freshImage=${result.okFreshImage}`
        + ` singlePhotoReuse=${result.forcedReuseSinglePhoto}`,
      );
    }
  } catch (error) {
    result.fail = true;
    result.error = error instanceof Error ? error.message : String(error);
    console.log(`  FAIL ${result.error}`);
  }

  return { result, created };
}

async function main() {
  console.log(`\n=== TEST PARTNER IMAGE FRESHNESS | ${DESTINATION} ===\n`);
  await api('/api/destination', {
    method: 'POST',
    body: JSON.stringify({ id: DESTINATION }),
  });

  const allCreated = [];
  const summary = [];
  for (const deckId of DECKS) {
    const { result, created } = await testDeck(deckId);
    summary.push(result);
    allCreated.push(...created);
  }

  if (!KEEP_LISTS) {
    console.log('\nXóa list test...');
    for (const entry of allCreated) {
      await deleteList(entry.deckId, entry.listId);
    }
  }

  const failed = summary.filter((s) => s.fail);
  console.log('\n=== TỔNG KẾT ===');
  console.log(JSON.stringify({
    ok: failed.length === 0,
    failed: failed.map((f) => f.deckId),
    summary: summary.map((s) => ({
      deck: s.deckId,
      fail: s.fail,
      overlapPartners: s.overlapPartners,
      okFreshImage: s.okFreshImage,
      forcedReuseSinglePhoto: s.forcedReuseSinglePhoto,
      badImageReuse: s.badImageReuse?.length || 0,
      error: s.error,
    })),
  }, null, 2));

  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
