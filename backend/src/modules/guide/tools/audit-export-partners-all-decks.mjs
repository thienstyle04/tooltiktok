/**
 * Kiểm tra mọi mẫu deck: so sánh đối tác trong dữ liệu list vs partners-*.xlsx (logic collectPartnerNames).
 *
 *   node backend/src/modules/guide/tools/audit-export-partners-all-decks.mjs
 *
 * Env:
 *   TEST_API_URL=http://127.0.0.1:3000
 *   LISTS_PER_DECK=1
 *   KEEP_LISTS=0
 *   DECKS=... (mặc định: tất cả deck trong guide-data)
 */
import { renderCoverPage, renderListPage } from '../../../../../frontend/lib/pageMarkup.js';

const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const LISTS_PER_DECK = Math.max(1, Number(process.env.LISTS_PER_DECK || 1));
const KEEP_LISTS = process.env.KEEP_LISTS === '1';
const SKIP_DECKS = new Set((process.env.SKIP_DECKS || 'spotlight-partner').split(',').map((s) => s.trim()).filter(Boolean));

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
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${String(body.message || body.raw || text).slice(0, 180)}`);
  }
  return body;
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderedMarkupIncludesImage(markup, imageUrl) {
  const source = String(imageUrl || '').trim();
  if (!source) return false;
  const driveId = source.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] || '';
  if (driveId) return markup.includes(driveId);
  return markup.includes(source) || markup.includes(escapeXml(source));
}

function renderPageMarkupForExport(list, page, index) {
  if (page.type === 'cover') {
    return renderCoverPage(page, index, list.pages.length, list.id, list.captionHashtags || [], list, []);
  }
  return renderListPage(page, index, list.pages.length, list.id, list.captionHashtags || [], list);
}

function collectPartnerNames(list) {
  const partnerNames = new Set();
  list.pages?.forEach((page, pageIndex) => {
    if (page?.type !== 'list') return;
    const hasImageItems = page.items?.some((item) => String(item?.imageUrl || '').trim());
    const renderedMarkup = hasImageItems ? renderPageMarkupForExport(list, page, pageIndex) : '';
    page.items?.forEach((item) => {
      if (!item?.isPartner) return;
      const partnerName = String(item?.rawName || item?.name || '')
        .replace(/^[^:]{1,30}:\s*/, '')
        .trim();
      if (!partnerName) return;
      const imageUrl = String(item?.imageUrl || '').trim();
      if (imageUrl && !renderedMarkupIncludesImage(renderedMarkup, imageUrl)) return;
      partnerNames.add(partnerName);
    });
  });
  return Array.from(partnerNames).sort((a, b) => a.localeCompare(b, 'vi'));
}

function countDataPartners(list) {
  const names = new Set();
  let rawCount = 0;
  for (const page of list?.pages || []) {
    if (page?.type !== 'list') continue;
    for (const item of page.items || []) {
      if (!item?.isPartner) continue;
      rawCount += 1;
      const partnerName = String(item?.rawName || item?.name || '')
        .replace(/^[^:]{1,30}:\s*/, '')
        .trim();
      if (partnerName) names.add(partnerName);
    }
  }
  return { rawCount, uniqueCount: names.size, names: [...names].sort((a, b) => a.localeCompare(b, 'vi')) };
}

function analyzeList(list) {
  const data = countDataPartners(list);
  const exported = collectPartnerNames(list);
  const missing = data.names.filter((name) => !exported.includes(name));
  return {
    listId: list.id,
    dataPartners: data.uniqueCount,
    dataPartnerRows: data.rawCount,
    exportPartners: exported.length,
    missingPartners: missing,
    exportSample: exported.slice(0, 6),
  };
}

async function main() {
  const dataset = await api('/api/guide-data');
  const destinationId = dataset?.source?.destinationId || 'unknown';
  const deckIds = (process.env.DECKS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const decks = (dataset.decks || []).filter((deck) => {
    if (deckIds.length && !deckIds.includes(deck.id)) return false;
    return !SKIP_DECKS.has(deck.id);
  });

  console.log(`\n=== AUDIT EXPORT PARTNERS | nguồn: ${destinationId} | ${decks.length} mẫu ===\n`);

  const created = [];
  const reports = [];

  for (const deck of decks) {
    process.stdout.write(`${deck.id} ... `);
    try {
      const gen = await api('/api/decks/generate-batch', {
        method: 'POST',
        body: JSON.stringify({ deckId: deck.id, count: LISTS_PER_DECK }),
      });
      const listRefs = (gen.lists || []).map((l) => l.listId || l.id).filter(Boolean);
      created.push(...listRefs.map((listId) => ({ deckId: deck.id, listId })));

      const after = await api('/api/guide-data');
      const deckAfter = (after.decks || []).find((d) => d.id === deck.id);
      const lists = (deckAfter?.lists || []).filter((l) => listRefs.includes(l.id));
      const analyses = lists.map(analyzeList);

      const mainList = (deckAfter?.lists || []).find((l) => /-main$/i.test(String(l.id || '')));
      const mainAnalysis = mainList ? analyzeList(mainList) : null;

      const totalData = analyses.reduce((s, a) => s + a.dataPartners, 0);
      const totalExport = analyses.reduce((s, a) => s + a.exportPartners, 0);
      const listsMissingAll = analyses.filter((a) => a.dataPartners > 0 && a.exportPartners === 0);
      const listsPartial = analyses.filter((a) => a.dataPartners > 0 && a.exportPartners > 0 && a.exportPartners < a.dataPartners);

      reports.push({
        deckId: deck.id,
        generated: analyses.length,
        dataPartners: totalData,
        exportPartners: totalExport,
        main: mainAnalysis,
        listsMissingAll,
        listsPartial,
        analyses,
      });

      if (listsMissingAll.length) {
        console.log(`FAIL 0/${totalData} xuất (data có ${totalData})`);
      } else if (listsPartial.length) {
        console.log(`WARN thiếu một phần (${totalExport}/${totalData})`);
      } else if (totalData === 0) {
        console.log('OK không có đối tác trong list');
      } else {
        console.log(`OK ${totalExport}/${totalData}`);
      }
    } catch (error) {
      console.log(`ERROR ${String(error.message || error).slice(0, 120)}`);
      reports.push({ deckId: deck.id, fail: true, error: String(error.message || error) });
    }
    await sleep(500);
  }

  if (!KEEP_LISTS && created.length) {
    console.log('\nXóa list test...');
    for (const entry of created) {
      await fetch(`${API}/api/decks/${encodeURIComponent(entry.deckId)}/lists/${encodeURIComponent(entry.listId)}`, {
        method: 'DELETE',
      }).catch(() => null);
    }
  }

  const ok = reports.filter((r) => !r.fail);
  const missingAll = ok.filter((r) => (r.listsMissingAll || []).length > 0);
  const partial = ok.filter((r) => (r.listsPartial || []).length > 0);
  const noPartners = ok.filter((r) => (r.dataPartners || 0) === 0);
  const healthy = ok.filter((r) => (r.dataPartners || 0) > 0 && !(r.listsMissingAll || []).length && !(r.listsPartial || []).length);

  console.log('\n=== TỔNG KẾT ===');
  console.log(`Nguồn: ${destinationId}`);
  console.log(`Mẫu kiểm tra: ${ok.length}/${reports.length}`);
  console.log(`Có đối tác + xuất đủ: ${healthy.length}`);
  console.log(`Không có đối tác trong list (bình thường): ${noPartners.length}`);
  console.log(`Có đối tác nhưng xuất 0: ${missingAll.length}`);
  console.log(`Có đối tác nhưng thiếu một phần: ${partial.length}`);

  if (missingAll.length) {
    console.log('\n--- MẪU XUẤT 0 ĐỐI TÁC (BUG) ---');
    for (const row of missingAll) {
      console.log(`\n${row.deckId}:`);
      for (const item of row.listsMissingAll) {
        console.log(`  ${item.listId}: data=${item.dataPartners}, export=0`);
        console.log(`    thiếu: ${item.missingPartners.slice(0, 8).join(' | ')}`);
      }
      if (row.main?.dataPartners > 0 && row.main.exportPartners === 0) {
        console.log(`  [main] data=${row.main.dataPartners}, export=0`);
      }
    }
  }

  if (partial.length) {
    console.log('\n--- MẪU THIẾU MỘT PHẦN ĐỐI TÁC ---');
    for (const row of partial) {
      console.log(`\n${row.deckId}:`);
      for (const item of row.listsPartial) {
        console.log(`  ${item.listId}: data=${item.dataPartners}, export=${item.exportPartners}`);
        console.log(`    thiếu: ${item.missingPartners.slice(0, 8).join(' | ')}`);
      }
    }
  }

  if (missingAll.length || partial.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
