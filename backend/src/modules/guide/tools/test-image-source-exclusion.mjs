/**
 * Kiểm tra: item imageSource:'fallback' (chưa lấy được ảnh riêng) không còn bị chọn vào
 * list mới tạo, và deck vẫn tạo được list bình thường (không rỗng/lỗi) ở cả 2 điểm đến.
 *   node backend/src/modules/guide/tools/test-image-source-exclusion.mjs
 *
 * Env:
 *   DESTINATIONS=dalat,greenland
 *   DECKS=grid-4,grid-8,grid-6,itinerary-4n2d-grid8,spotlight-v3,itinerary-timeline,itinerary-4n3d-stack,budget-3n2d,spotlight-guide
 */
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const DESTINATIONS = (process.env.DESTINATIONS || 'dalat,greenland').split(',').map((s) => s.trim()).filter(Boolean);
const DECKS = (process.env.DECKS || 'grid-4,grid-8,grid-6,itinerary-4n2d-grid8,spotlight-v3,itinerary-timeline,itinerary-4n3d-stack,budget-3n2d,spotlight-guide')
  .split(',').map((s) => s.trim()).filter(Boolean);
// Layout dạng bảng chữ/giá, không gắn ảnh riêng theo item -> không tính vào kiểm tra fallback ảnh.
const SKIP_IMAGE_LAYOUTS = new Set(['budget-3n2d-table', 'budget-3n2d-day', 'budget-3n2d-total', 'grid-8-quaytung-menu']);

async function switchDestination(id) {
  const res = await fetch(`${API}/api/destination`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`switch ${id} HTTP ${res.status}`);
  return res.json();
}

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

async function main() {
  const report = { ok: true, destinations: [] };
  for (const destinationId of DESTINATIONS) {
    await switchDestination(destinationId);
    const destRow = { destinationId, decks: [] };
    for (const deckId of DECKS) {
      let created;
      try {
        created = await gen(deckId);
      } catch (error) {
        destRow.decks.push({ deckId, error: String(error?.message || error) });
        report.ok = false;
        continue;
      }
      const listId = created?.listIds?.[0] || created?.lists?.[0]?.id || null;
      const data = await guide();
      const deck = (data.decks || []).find((d) => d.id === deckId);
      const list = (deck?.lists || []).find((l) => l.id === listId) || (deck?.lists || []).slice(-1)[0];
      let total = 0;
      let fallback = 0;
      const samples = [];
      for (const page of list?.pages || []) {
        if (page.type === 'cover') continue;
        if (SKIP_IMAGE_LAYOUTS.has(page.layoutVariant)) continue;
        for (const it of page.items || []) {
          if (!it.name) continue;
          total += 1;
          if (it.imageSource === 'fallback') {
            fallback += 1;
            if (samples.length < 6) samples.push({ page: page.chipText || page.title, name: it.name });
          }
        }
      }
      const row = { deckId, listId: list?.id || null, totalItems: total, fallback, samples };
      if (fallback > 0 || !list || total === 0) report.ok = false;
      destRow.decks.push(row);
      if (list?.id) await del(deckId, list.id);
    }
    report.destinations.push(destRow);
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
