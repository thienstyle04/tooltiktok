/**
 * Tao nhieu list va tai that tung URL anh. Fail neu backend tra fallback SVG,
 * HTTP loi, anh rong, hoac mot candidate anh loi van con trong payload.
 */
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const DECKS = (process.env.DECKS || 'itinerary-3n2d,grid-8-feed,spotlight-v3')
  .split(',').map((value) => value.trim()).filter(Boolean);
const COUNT = Math.max(1, Number(process.env.LISTS_PER_DECK || 2));

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}: ${(await response.text()).slice(0, 180)}`);
  return response.json();
}

function collectUrls(list) {
  const urls = [];
  for (const page of list?.pages || []) {
    if (page.backgroundImage) urls.push(page.backgroundImage);
    for (const item of page.items || []) {
      if (item.imageUrl) urls.push(item.imageUrl);
      for (const url of item.candidateImageUrls || []) if (url) urls.push(url);
    }
  }
  return [...new Set(urls)].filter((url) => url.startsWith('/assets/drive-file'));
}

async function probe(url) {
  try {
    const response = await fetch(`${API}${url}`, { signal: AbortSignal.timeout(30000) });
    const type = String(response.headers.get('content-type') || '').toLowerCase();
    const fallback = response.headers.get('x-drive-image-fallback') === '1';
    const body = await response.arrayBuffer();
    return {
      url,
      ok: response.ok && type.startsWith('image/') && !type.includes('svg') && !fallback && body.byteLength > 2000,
      status: response.status,
      type,
      fallback,
      bytes: body.byteLength,
    };
  } catch (error) {
    return { url, ok: false, error: String(error?.message || error) };
  }
}

async function deleteLists(deckId, listIds) {
  if (!listIds.length) return;
  await request('/api/decks/delete-lists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groups: [{ deckId, listIds }] }),
  }).catch(() => null);
}

const report = { ok: true, decks: [] };
for (const deckId of DECKS) {
  const createdIds = [];
  try {
    // Khong goi DeepSeek trong bai test ha tang anh: tao truc tiep tu caption de bai test
    // lap lai duoc va chi do dung loi can kiem tra (pool anh/candidate/Drive proxy).
    for (let index = 0; index < COUNT; index += 1) {
      const created = await request('/api/decks/generate-from-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId,
          tone: 'lich_trinh_huu_ich',
          caption: {
            coverTitle: `TEST ANH ${deckId} ${index + 1}`,
            headline: `Test anh list ${index + 1}`,
            body: 'Bai test kiem tra tung URL anh cua list moi tao.',
            hashtags: ['#testanh'],
          },
        }),
      });
      if (created.listId) createdIds.push(created.listId);
    }
    const dataset = await request('/api/guide-data');
    const deck = (dataset.decks || []).find((entry) => entry.id === deckId);
    const lists = (deck?.lists || []).filter((list) => createdIds.includes(list.id));
    const urls = [...new Set(lists.flatMap(collectUrls))];
    const probes = [];
    for (let index = 0; index < urls.length; index += 4) {
      probes.push(...await Promise.all(urls.slice(index, index + 4).map(probe)));
    }
    const failed = probes.filter((entry) => !entry.ok);
    const row = { deckId, requested: COUNT, created: lists.length, urls: urls.length, failed: failed.length, samples: failed.slice(0, 8) };
    if (lists.length !== COUNT || failed.length > 0 || urls.length === 0) report.ok = false;
    report.decks.push(row);
  } catch (error) {
    report.ok = false;
    report.decks.push({ deckId, error: String(error?.message || error) });
  } finally {
    await deleteLists(deckId, createdIds);
  }
}

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 2);
