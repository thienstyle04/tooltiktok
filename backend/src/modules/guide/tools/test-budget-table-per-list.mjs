/**
 * Kiểm tra list AI có bảng chi phí riêng (không copy main) — budget-3n2d vs budget-72h-summary.
 * node backend/src/modules/guide/tools/test-budget-table-per-list.mjs
 */
const API_BASE = process.env.GUIDE_API_BASE || 'http://127.0.0.1:3000';

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(180_000),
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${path} → ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  return body;
}

function getMainList(deck) {
  return (deck?.lists || []).find((l) => /-main$/i.test(String(l?.id || ''))) || deck?.lists?.[0];
}

function tablePage(list) {
  return (list?.pages || []).find((p) => p.layoutVariant === 'budget-3n2d-table') || null;
}

function tableVenueSignature(list) {
  return (tablePage(list)?.items || [])
    .filter((it) => !String(it.label || '').startsWith('Tổng|'))
    .filter((it) => !/xe phương trang|bến xe|check out/i.test(String(it.name || '')))
    .map((it) => String(it.rawName || it.name || '').replace(/^[^:]+:\s*/, '').trim())
    .join('|');
}

function tableFullSignature(list) {
  return JSON.stringify((tablePage(list)?.items || []).map((it) => ({
    label: it.label,
    name: it.name,
    metaSecondary: it.metaSecondary,
  })));
}

function isTestPlaceholderCaption(caption) {
  const headline = String(caption?.headline || '').trim();
  const tags = Array.isArray(caption?.hashtags) ? caption.hashtags : [];
  return /^Test bảng\b/i.test(headline) || tags.some((t) => String(t).toLowerCase() === '#test');
}

async function deleteList(deckId, listId) {
  try {
    await api(`/api/decks/${encodeURIComponent(deckId)}/lists/${encodeURIComponent(listId)}`, { method: 'DELETE' });
    return true;
  } catch {
    return false;
  }
}

async function createList(deckId, suffix, coverTitle) {
  const caption = {
    coverTitle,
    headline: 'Lưu list này trước khi lên Đà Lạt nhé',
    body: 'Lưu list này để có lịch đi gọn hơn, dễ chọn điểm theo buổi và đỡ mất thời gian mò từng nơi.',
    hashtags: ['#lichtrinhdalat', '#traveldalat'],
  };
  if (isTestPlaceholderCaption(caption)) {
    throw new Error('Caption test placeholder không được dùng trong script kiểm tra.');
  }
  return api('/api/decks/generate-from-caption', {
    method: 'POST',
    body: JSON.stringify({
      deckId,
      tone: 'lich_trinh_huu_ich',
      caption,
    }),
  });
}

async function testDeck(deckId) {
  console.log(`\n=== ${deckId} ===`);
  await api('/api/guide-data?refresh=1');
  const before = await api('/api/guide-data');
  const deckBefore = (before.decks || []).find((d) => d.id === deckId);
  const main = getMainList(deckBefore);
  if (!main) throw new Error(`Không thấy main list của ${deckId}`);

  const gen1 = await createList(deckId, 'A', `72H LIST A ${deckId.slice(-3)}`.slice(0, 35));
  const gen2 = await createList(deckId, 'B', `72H LIST B ${deckId.slice(-3)}`.slice(0, 35));

  const after = await api('/api/guide-data?refresh=1');
  const deckAfter = (after.decks || []).find((d) => d.id === deckId);
  const mainAfter = getMainList(deckAfter);
  const list1 = (deckAfter.lists || []).find((l) => l.id === gen1.listId);
  const list2 = (deckAfter.lists || []).find((l) => l.id === gen2.listId);

  const mainSig = tableFullSignature(mainAfter);
  const ai1Sig = tableFullSignature(list1);
  const ai2Sig = tableFullSignature(list2);
  const mainVenues = tableVenueSignature(mainAfter);
  const ai1Venues = tableVenueSignature(list1);
  const ai2Venues = tableVenueSignature(list2);

  const mainEqAi1 = mainSig === ai1Sig;
  const mainEqAi2 = mainSig === ai2Sig;
  const ai1EqAi2 = ai1Sig === ai2Sig;

  console.log('Lists:', (deckAfter.lists || []).length, `(+2 AI: ${gen1.listId}, ${gen2.listId})`);
  console.log('Main == AI1 table:', mainEqAi1 ? 'GIỐNG (có thể bug)' : 'KHÁC (OK)');
  console.log('Main == AI2 table:', mainEqAi2 ? 'GIỐNG (có thể bug)' : 'KHÁC (OK)');
  console.log('AI1 == AI2 table:', ai1EqAi2 ? 'GIỐNG (có thể bug)' : 'KHÁC (OK)');
  console.log('Main venues sample:', mainVenues.split('|').slice(0, 4).join(' | '));
  console.log('AI1 venues sample:', ai1Venues.split('|').slice(0, 4).join(' | '));
  console.log('AI2 venues sample:', ai2Venues.split('|').slice(0, 4).join(' | '));

  return {
    deckId,
    mainEqAi1,
    mainEqAi2,
    ai1EqAi2,
    bugLike72hSummary: mainEqAi1 && mainEqAi2,
    createdListIds: [gen1.listId, gen2.listId],
  };
}

async function main() {
  console.log('=== Test bảng chi phí per-list (budget decks) ===');
  console.log('API:', API_BASE);
  await api('/api/health');

  const results = [];
  for (const deckId of ['budget-72h-summary', 'budget-3n2d']) {
    results.push(await testDeck(deckId));
  }

  console.log('\n=== KẾT LUẬN ===');
  for (const r of results) {
    if (r.bugLike72hSummary) {
      console.log(`❌ ${r.deckId}: AI list bị trùng bảng main (giống bug 72H tổng hợp cũ)`);
    } else if (r.mainEqAi1 || r.mainEqAi2) {
      console.log(`⚠ ${r.deckId}: một số list AI trùng main nhưng không phải tất cả`);
    } else if (r.ai1EqAi2) {
      console.log(`⚠ ${r.deckId}: 2 list AI giống nhau (seed/pool yếu) nhưng không copy main`);
    } else {
      console.log(`✅ ${r.deckId}: mỗi list có bảng riêng — KHÔNG bị bug giống 72H tổng hợp`);
    }
  }

  const failed = results.some((r) => r.bugLike72hSummary);

  console.log('\n=== Dọn list test vừa tạo ===');
  for (const r of results) {
    for (const listId of r.createdListIds || []) {
      const ok = await deleteList(r.deckId, listId);
      console.log(`${ok ? '✅' : '⚠'} ${r.deckId}/${listId}`);
    }
  }

  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
