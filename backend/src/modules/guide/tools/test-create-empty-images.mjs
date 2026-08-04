/** Quick check: created lists have no empty/placeholder item images. */
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const DECKS = (process.env.DECKS || 'grid-4,grid-8,grid-6,itinerary-4n2d-grid8').split(',').map((s) => s.trim()).filter(Boolean);

async function gen(deckId) {
  const res = await fetch(`${API}/api/decks/generate-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deckId, count: 1 }),
    signal: AbortSignal.timeout(300000),
  });
  if (!res.ok) throw new Error(`${deckId} HTTP ${res.status}`);
  return res.json();
}

async function guide() {
  const res = await fetch(`${API}/api/guide-data`, { signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`guide-data HTTP ${res.status}`);
  return res.json();
}

async function del(deckId, listId) {
  await fetch(`${API}/api/decks/${encodeURIComponent(deckId)}/lists/${encodeURIComponent(listId)}`, {
    method: 'DELETE',
  }).catch(() => null);
}

function isBadUrl(url) {
  if (!url) return 'empty';
  if (/placeholder|fallback|data:image\/svg/i.test(url)) return 'placeholder';
  return null;
}

async function main() {
  const report = { ok: true, decks: [] };
  for (const deckId of DECKS) {
    const created = await gen(deckId);
    const listId = created?.listIds?.[0] || created?.lists?.[0]?.id || null;
    const data = await guide();
    const deck = (data.decks || []).find((d) => d.id === deckId);
    const list = (deck?.lists || []).find((l) => l.id === listId) || (deck?.lists || []).slice(-1)[0];
    let empty = 0;
    let placeholder = 0;
    let total = 0;
    const samples = [];
    for (const page of list?.pages || []) {
      if (page.type === 'cover') continue;
      for (const it of page.items || []) {
        const url = String(it.imageUrl || '').trim();
        if (!url && !it.name) continue;
        total += 1;
        const reason = isBadUrl(url);
        if (reason === 'empty') {
          empty += 1;
          if (samples.length < 6) samples.push({ page: page.chipText || page.title, name: it.name, reason });
        } else if (reason === 'placeholder') {
          placeholder += 1;
          if (samples.length < 6) samples.push({ page: page.chipText || page.title, name: it.name, reason, url: url.slice(0, 90) });
        }
      }
    }
    const row = { deckId, listId: list?.id || null, totalItems: total, empty, placeholder, samples };
    if (empty || placeholder || !list) report.ok = false;
    report.decks.push(row);
    if (list?.id) await del(deckId, list.id);
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
