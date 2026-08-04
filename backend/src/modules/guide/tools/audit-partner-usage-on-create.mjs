/**
 * Kiểm tra khi tạo list, các mẫu có lấy dữ liệu đối tác (isPartner) không.
 *   node backend/src/modules/guide/tools/audit-partner-usage-on-create.mjs [destination]
 *
 * Env:
 *   LISTS_PER_DECK=2
 *   KEEP_LISTS=0
 *   DECKS=grid-4,grid-6,...
 */
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const DESTINATION = (process.argv[2] || process.env.DESTINATION || 'dalat').toLowerCase();
const LISTS_PER_DECK = Math.max(1, Number(process.env.LISTS_PER_DECK || 2));
const KEEP_LISTS = process.env.KEEP_LISTS === '1';
const DECKS = (process.env.DECKS || [
  'grid-4',
  'grid-6',
  'grid-8',
  'grid-5',
  'grid-6-zigzag',
  'grid-4-mutant',
  'grid-6-quaytung',
  'grid-8-quaytung',
  'grid-8-feed',
  'spotlight-guide',
  'pov-3-day',
  'pov-3-v2',
  'itinerary-3n2d',
  'budget-3n2d',
  'itinerary-timeline',
].join(','))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} → ${response.status}: ${String(body.message || body.raw || text).slice(0, 180)}`);
  return body;
}

function collectPoolPartners(dataset) {
  const bySection = new Map();
  let total = 0;
  let partners = 0;
  for (const section of Object.keys(dataset?.itemsBySection || dataset?.source?.itemsBySection || {})) {
    // guide-data may nest differently — also scan decks' main lists / source stats
  }
  // Prefer scanning from source if available; else rebuild from deck main pages is incomplete.
  // guide-data typically exposes source.totalItems and decks; items live in workbook context.
  // Fallback: scan all main-list items + any generated later.
  const sectionCounts = {};
  const walkItems = (items, sectionHint = '') => {
    for (const item of items || []) {
      total += 1;
      const section = item.sectionKey || sectionHint || 'unknown';
      if (!sectionCounts[section]) sectionCounts[section] = { total: 0, partners: 0, names: [] };
      sectionCounts[section].total += 1;
      if (item.isPartner) {
        partners += 1;
        sectionCounts[section].partners += 1;
        if (sectionCounts[section].names.length < 8) {
          sectionCounts[section].names.push(item.name);
        }
      }
    }
  };

  // Some payloads include pools on source
  if (dataset?.source?.partnerCount != null) {
    // keep going for section detail from decks
  }
  for (const deck of dataset?.decks || []) {
    const main = (deck.lists || []).find((l) => /-main$/i.test(String(l.id || ''))) || deck.lists?.[0];
    for (const page of main?.pages || []) {
      walkItems(page.items || [], page.sectionKey || '');
    }
  }

  return { total, partners, sectionCounts };
}

function analyzeGeneratedList(list) {
  let itemCount = 0;
  let partnerCount = 0;
  const partnerNames = [];
  const pageStats = [];
  for (const page of list?.pages || []) {
    if (page.type === 'cover') continue;
    const items = page.items || [];
    const pagePartners = items.filter((it) => it.isPartner);
    itemCount += items.length;
    partnerCount += pagePartners.length;
    for (const it of pagePartners) {
      if (partnerNames.length < 12) partnerNames.push(it.name);
    }
    if (items.length > 0) {
      pageStats.push({
        page: page.chipText || page.title || page.layoutVariant || page.type,
        items: items.length,
        partners: pagePartners.length,
      });
    }
  }
  return {
    listId: list.id,
    itemCount,
    partnerCount,
    partnerRatio: itemCount ? +(partnerCount / itemCount).toFixed(3) : 0,
    partnerNames,
    pagesWithoutPartner: pageStats.filter((p) => p.items >= 2 && p.partners === 0).length,
    pageStats: pageStats.slice(0, 8),
  };
}

async function main() {
  console.log(`\n=== AUDIT PARTNER USAGE ON CREATE | ${DESTINATION} ===\n`);

  await api('/api/destination', { method: 'POST', body: JSON.stringify({ id: DESTINATION }) });
  // Force refresh sheet data so new partner rows are loaded
  const dataset = await api('/api/guide-data?refresh=1');
  if (dataset?.source?.destinationId && dataset.source.destinationId !== DESTINATION) {
    throw new Error(`Expected destination ${DESTINATION}, got ${dataset.source.destinationId}`);
  }

  // Count partners from a dedicated endpoint if available; otherwise from workbook via generate context.
  // Pull raw partner inventory through a lightweight generate of one list isn't enough.
  // Use /api/guide-data plus optional sync: also hit destination switch response.
  const destInfo = await api('/api/destination', { method: 'POST', body: JSON.stringify({ id: DESTINATION }) });
  const refreshed = destInfo?.dataset || dataset;

  // Try to get full item inventory from guide-data fields
  let poolPartners = 0;
  let poolTotal = 0;
  const sectionPartner = {};
  const source = refreshed?.source || dataset?.source || {};
  console.log('Source:', JSON.stringify({
    destinationId: source.destinationId,
    label: source.destinationLabel,
    totalItems: source.totalItems,
    imageCount: source.imageCount,
    workbookName: source.workbookName,
  }));

  // Scan main lists as a weak signal; better: inspect via generate + also fetch partners from spotlight API if exists
  let partnerCatalog = [];
  try {
    partnerCatalog = await api('/api/partners').catch(() => null)
      || await api('/api/guide/partners').catch(() => null)
      || [];
  } catch {
    partnerCatalog = [];
  }
  if (!Array.isArray(partnerCatalog)) partnerCatalog = partnerCatalog?.partners || partnerCatalog?.items || [];

  // Build inventory by generating from batch then reading isPartner on pages is the ground truth for "when user creates".
  // Also count pool from source if backend exposes it.
  if (typeof source.partnerCount === 'number') {
    poolPartners = source.partnerCount;
    poolTotal = source.totalItems || 0;
  }

  const created = [];
  const deckReports = [];

  for (const deckId of DECKS) {
    process.stdout.write(`Tạo ${LISTS_PER_DECK} list: ${deckId} ... `);
    try {
      const gen = await api('/api/decks/generate-batch', {
        method: 'POST',
        body: JSON.stringify({ deckId, count: LISTS_PER_DECK }),
      });
      const listRefs = (gen.lists || []).map((l) => ({ deckId, listId: l.listId || l.id })).filter((x) => x.listId);
      created.push(...listRefs);
      console.log(`${listRefs.length}/${LISTS_PER_DECK}`);

      // Reload dataset to inspect generated lists
      const after = await api('/api/guide-data');
      const deck = (after.decks || []).find((d) => d.id === deckId);
      const lists = (deck?.lists || []).filter((l) => listRefs.some((r) => r.listId === l.id));
      const analyses = lists.map(analyzeGeneratedList);
      const totalItems = analyses.reduce((s, a) => s + a.itemCount, 0);
      const totalPartners = analyses.reduce((s, a) => s + a.partnerCount, 0);
      const listsWithPartner = analyses.filter((a) => a.partnerCount > 0).length;
      const pagesWithoutPartner = analyses.reduce((s, a) => s + a.pagesWithoutPartner, 0);

      deckReports.push({
        deckId,
        lists: analyses.length,
        totalItems,
        totalPartners,
        partnerRatio: totalItems ? +(totalPartners / totalItems).toFixed(3) : 0,
        listsWithPartner,
        listsWithoutPartner: analyses.length - listsWithPartner,
        pagesWithoutPartner,
        samplePartners: [...new Set(analyses.flatMap((a) => a.partnerNames))].slice(0, 8),
        analyses,
      });
    } catch (error) {
      console.log(`FAIL ${error.message || error}`);
      deckReports.push({ deckId, fail: true, error: String(error.message || error) });
    }
    await sleep(800);
  }

  // After generation, also try to read partner catalog from spotlight-partner helpers via guide-data scan of all items in generated + main
  const full = await api('/api/guide-data');
  for (const deck of full.decks || []) {
    for (const list of deck.lists || []) {
      for (const page of list.pages || []) {
        for (const item of page.items || []) {
          poolTotal += 1;
          if (item.isPartner) {
            poolPartners += 1;
            const sec = item.sectionKey || 'unknown';
            if (!sectionPartner[sec]) sectionPartner[sec] = { count: 0, names: [] };
            sectionPartner[sec].count += 1;
            if (sectionPartner[sec].names.length < 6 && !sectionPartner[sec].names.includes(item.name)) {
              sectionPartner[sec].names.push(item.name);
            }
          }
        }
      }
    }
  }

  if (!KEEP_LISTS) {
    console.log('\nXóa list test...');
    for (const entry of created) {
      await fetch(`${API}/api/decks/${encodeURIComponent(entry.deckId)}/lists/${encodeURIComponent(entry.listId)}`, {
        method: 'DELETE',
      }).catch(() => null);
    }
  }

  const okDecks = deckReports.filter((d) => !d.fail);
  const decksWithZeroPartner = okDecks.filter((d) => (d.totalPartners || 0) === 0);
  const decksWithPartner = okDecks.filter((d) => (d.totalPartners || 0) > 0);

  console.log('\n=== TỔNG KẾT ===');
  console.log(JSON.stringify({
    destination: DESTINATION,
    partnerFirst: DESTINATION === 'greenland',
    note: DESTINATION === 'dalat'
      ? 'Đà Lạt: ưu tiên đối tác có cap (~3/trang), KHÔNG partnerFirst như Green Land'
      : null,
    catalogPartners: Array.isArray(partnerCatalog) ? partnerCatalog.length : 0,
    scannedPartnerMentions: poolPartners,
    decksTested: okDecks.length,
    decksWithPartner: decksWithPartner.length,
    decksWithZeroPartner: decksWithZeroPartner.map((d) => d.deckId),
    sectionPartnerSamples: sectionPartner,
    summary: okDecks.map((d) => ({
      deck: d.deckId,
      lists: d.lists,
      items: d.totalItems,
      partners: d.totalPartners,
      ratio: d.partnerRatio,
      listsWithPartner: d.listsWithPartner,
      pagesWithoutPartner: d.pagesWithoutPartner,
      samplePartners: d.samplePartners,
    })),
  }, null, 2));

  // Fail if destination has partners in catalog/scan but NO deck used any partner
  const hasPartnerSignal = (Array.isArray(partnerCatalog) && partnerCatalog.length > 0) || poolPartners > 0;
  if (hasPartnerSignal && decksWithPartner.length === 0) {
    console.error('\nFAIL: Sheet/pool có đối tác nhưng không mẫu nào lấy khi tạo list.');
    process.exit(2);
  }
  if (!hasPartnerSignal) {
    console.warn('\nWARN: Không thấy isPartner=true trong dữ liệu sau refresh. Kiểm tra cột doi_tac = x trên Sheet.');
    process.exit(3);
  }
  console.log('\nPASS: Có mẫu lấy dữ liệu đối tác khi tạo list.');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
