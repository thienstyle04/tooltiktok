/**
 * Đo ảnh nền / ảnh item trống khi tạo list (đặc biệt mẫu nhiều DL).
 *   node backend/src/modules/guide/tools/diagnose-empty-images-on-create.mjs dalat
 */
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const DESTINATION = (process.argv[2] || 'dalat').toLowerCase();
const DECKS = (process.env.DECKS || 'grid-4,grid-6,grid-8,budget-3n2d,itinerary-3n2d,pov-3-v2,itinerary-timeline,spotlight-guide')
  .split(',').map((s) => s.trim()).filter(Boolean);
const LISTS = Math.min(Math.max(Number(process.env.LISTS || 2), 1), 3);
const KEEP_LISTS = process.env.KEEP_LISTS === '1';

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(300000),
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 200) }; }
  if (!response.ok) throw new Error(`${path} → ${response.status}: ${String(body.message || text).slice(0, 200)}`);
  return body;
}

function analyzeList(list) {
  let bgSlots = 0;
  let bgEmpty = 0;
  let bgEmptyCover = 0;
  let bgEmptyList = 0;
  let itemSlots = 0;
  let itemEmpty = 0;
  let partnerEmpty = 0;
  const emptySamples = [];

  for (const page of list?.pages || []) {
    const needsBg = page.type === 'cover'
      || (page.type === 'list' && !String(page.layoutVariant || '').startsWith('grid-'));
    // Grid thường để background='' theo thiết kế — vẫn đếm cover + non-grid.
    if (page.type === 'cover' || (page.type === 'list' && page.backgroundImage !== undefined)) {
      const isGrid = String(page.layoutVariant || '').includes('grid-');
      if (page.type === 'cover' || !isGrid) {
        bgSlots += 1;
        if (!String(page.backgroundImage || '').trim()) {
          bgEmpty += 1;
          if (page.type === 'cover') bgEmptyCover += 1;
          else bgEmptyList += 1;
          if (emptySamples.length < 6) {
            emptySamples.push({ kind: 'bg', page: page.chipText || page.title || page.type, layout: page.layoutVariant });
          }
        }
      }
    }
    if (page.type !== 'list') continue;
    for (const item of page.items || []) {
      // Bảng chi phí cố ý không ảnh
      if (page.layoutVariant && /budget.*table|cost-table/i.test(String(page.layoutVariant))) continue;
      if (String(item.label || '').includes('Chi phí') && !item.imageUrl && !(item.candidateImageUrls || []).length) continue;
      itemSlots += 1;
      if (!String(item.imageUrl || '').trim()) {
        itemEmpty += 1;
        if (item.isPartner) partnerEmpty += 1;
        if (emptySamples.length < 8) {
          emptySamples.push({
            kind: 'item',
            name: item.rawName || item.name,
            partner: !!item.isPartner,
            candidates: (item.candidateImageUrls || []).length,
            page: page.chipText || page.title,
          });
        }
      }
    }
  }
  return {
    listId: list.id,
    pages: (list.pages || []).length,
    bgSlots, bgEmpty, bgEmptyCover, bgEmptyList,
    itemSlots, itemEmpty, partnerEmpty,
    bgEmptyRatio: bgSlots ? bgEmpty / bgSlots : 0,
    itemEmptyRatio: itemSlots ? itemEmpty / itemSlots : 0,
    emptySamples,
  };
}

async function deleteList(deckId, listId) {
  await fetch(`${API}/api/decks/${encodeURIComponent(deckId)}/lists/${encodeURIComponent(listId)}`, { method: 'DELETE' }).catch(() => null);
}

async function main() {
  console.log(`\n=== DIAGNOSE EMPTY IMAGES | ${DESTINATION} | lists=${LISTS} ===\n`);
  await api('/api/destination', { method: 'POST', body: JSON.stringify({ id: DESTINATION }) });
  const created = [];
  const rows = [];

  for (const deckId of DECKS) {
    console.log(`=== ${deckId} ===`);
    try {
      const gen = await api('/api/decks/generate-batch', {
        method: 'POST',
        body: JSON.stringify({ deckId, count: LISTS }),
      });
      const ids = (gen.lists || []).map((l) => l.listId || l.id).filter(Boolean);
      created.push(...ids.map((listId) => ({ deckId, listId })));
      const data = await api('/api/guide-data');
      const deck = (data.decks || []).find((d) => d.id === deckId);
      const main = (deck?.lists || []).find((l) => !/caption-/i.test(l.id));
      if (main) {
        const a = analyzeList(main);
        console.log(`  main  bgEmpty=${a.bgEmpty}/${a.bgSlots} itemEmpty=${a.itemEmpty}/${a.itemSlots}`);
      }
      ids.forEach((id, idx) => {
        const list = (deck?.lists || []).find((l) => l.id === id);
        const a = analyzeList(list);
        rows.push({ deckId, index: idx + 1, ...a });
        console.log(
          `  L${idx + 1} bgEmpty=${a.bgEmpty}/${a.bgSlots} (${(a.bgEmptyRatio * 100).toFixed(0)}%)`
          + ` itemEmpty=${a.itemEmpty}/${a.itemSlots} (${(a.itemEmptyRatio * 100).toFixed(0)}%)`
          + ` partnerEmpty=${a.partnerEmpty}`,
        );
        if (a.emptySamples.length) {
          for (const s of a.emptySamples.slice(0, 3)) {
            console.log(`    miss ${s.kind}: ${s.name || s.page || ''} cand=${s.candidates ?? '-'} layout=${s.layout || ''}`);
          }
        }
      });
    } catch (error) {
      console.log(`  FAIL ${error instanceof Error ? error.message : error}`);
      rows.push({ deckId, error: String(error.message || error) });
    }
  }

  if (!KEEP_LISTS) {
    console.log('\nXóa list test...');
    for (const e of created) await deleteList(e.deckId, e.listId);
  }

  const summary = {
    decks: rows.length,
    totalBgEmpty: rows.reduce((n, r) => n + (r.bgEmpty || 0), 0),
    totalBgSlots: rows.reduce((n, r) => n + (r.bgSlots || 0), 0),
    totalItemEmpty: rows.reduce((n, r) => n + (r.itemEmpty || 0), 0),
    totalItemSlots: rows.reduce((n, r) => n + (r.itemSlots || 0), 0),
    worst: [...rows]
      .filter((r) => !r.error)
      .sort((a, b) => (b.bgEmptyRatio + b.itemEmptyRatio) - (a.bgEmptyRatio + a.itemEmptyRatio))
      .slice(0, 6)
      .map((r) => ({
        deck: r.deckId,
        list: r.index,
        bg: `${r.bgEmpty}/${r.bgSlots}`,
        item: `${r.itemEmpty}/${r.itemSlots}`,
      })),
  };
  console.log('\n=== TỔNG ===');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
