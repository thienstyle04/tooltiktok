/**
 * Quét URL Drive trong guide-data, gọi proxy để đánh dấu ID chết,
 * chờ rebuild, lặp tới khi probe sạch (hoặc hết vòng).
 *
 *   node backend/src/modules/guide/tools/scrub-dead-drive-urls.mjs greenland
 */
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const destination = (process.argv[2] || 'greenland').toLowerCase();
const MAX_ROUNDS = Number(process.env.SCRUB_ROUNDS || 4);
const PROBE_LIMIT = Number(process.env.PROBE_LIMIT || 0); // 0 = all

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function setDestination(id) {
  const response = await fetch(`${API}/api/destination`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok) throw new Error(`setDestination ${id} HTTP ${response.status}`);
}

async function getGuideData() {
  const response = await fetch(`${API}/api/guide-data`, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`guide-data HTTP ${response.status}`);
  return response.json();
}

function collectDriveIds(data) {
  const ids = new Set();
  const push = (url) => {
    const match = String(url || '').match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match?.[1]) ids.add(match[1]);
  };
  for (const deck of data.decks || []) {
    for (const list of deck.lists || []) {
      for (const page of list.pages || []) {
        push(page.backgroundImage);
        for (const url of page.gridImages || []) push(url);
        for (const url of page.coverImages || []) push(url);
        for (const item of page.items || []) push(item?.imageUrl);
      }
    }
  }
  return [...ids];
}

async function probe(fileId) {
  const t0 = Date.now();
  try {
    const response = await fetch(`${API}/assets/drive-file?id=${encodeURIComponent(fileId)}`, {
      signal: AbortSignal.timeout(60000),
    });
    const buf = Buffer.from(await response.arrayBuffer());
    const ct = String(response.headers.get('content-type') || '');
    const ok = response.ok && buf.length > 1500 && !ct.includes('svg');
    return { fileId, ok, bytes: buf.length, ms: Date.now() - t0, ct };
  } catch (error) {
    return { fileId, ok: false, bytes: 0, ms: Date.now() - t0, error: String(error.message || error) };
  }
}

async function main() {
  console.log(`=== SCRUB DEAD DRIVE URLS: ${destination} ===`);
  await setDestination(destination);
  await sleep(1500);

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const data = await getGuideData();
    let ids = collectDriveIds(data);
    if (PROBE_LIMIT > 0) ids = ids.slice(0, PROBE_LIMIT);
    console.log(`\nRound ${round}/${MAX_ROUNDS}: probing ${ids.length} Drive IDs in decks...`);
    const fails = [];
    for (let i = 0; i < ids.length; i += 1) {
      const result = await probe(ids[i]);
      if (!result.ok) fails.push(result);
      if ((i + 1) % 25 === 0 || i + 1 === ids.length) {
        process.stdout.write(`  ${i + 1}/${ids.length} fail=${fails.length}\n`);
      }
    }
    console.log(`  Round ${round} fail: ${fails.length}/${ids.length}`);
    if (fails.length === 0) {
      console.log('CLEAN — không còn URL Drive chết trong deck.');
      process.exit(0);
    }
    console.log('  sample fails:', fails.slice(0, 8).map((f) => f.fileId.slice(0, 16)));
    // Chờ invalidate + rebuild sau khi getDriveFileAsset đánh dấu false.
    await sleep(4000);
  }
  console.log('Vẫn còn fail sau các vòng scrub — cần check Sheet/Drive permission.');
  process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
