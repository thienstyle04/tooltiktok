/**
 * Regression budget-3n2d: check-in Free, gallery ảnh không trùng.
 * cd backend && node src/modules/guide/tools/test-budget-3n2d-regression.mjs
 */
const API = process.env.GUIDE_API_BASE || 'http://127.0.0.1:3000';

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(180_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${path} → ${res.status}`);
  return body;
}

function tablePage(list) {
  return (list?.pages || []).find((p) => p.layoutVariant === 'budget-3n2d-table');
}

function galleryPages(list) {
  return (list?.pages || []).filter((p) => p.layoutVariant === 'budget-3n2d-gallery');
}

function checkinCostIssues(list) {
  const table = tablePage(list);
  if (!table) return ['không có bảng chi phí'];
  const issues = [];
  for (const item of table.items || []) {
    const name = String(item.name || '');
    if (!/^check-in:/i.test(name)) continue;
    const cost = String(item.metaSecondary || '').trim();
    if (/~?\s*20\s*k/i.test(cost) || /^-/.test(cost)) {
      issues.push(`${name} → "${cost}" (cần Free)`);
    }
  }
  return issues;
}

function duplicateImageIssues(list) {
  const issues = [];
  for (const page of galleryPages(list)) {
    const urls = (page.items || []).map((i) => String(i.imageUrl || '').trim()).filter(Boolean);
    const seen = new Set();
    for (const url of urls) {
      if (seen.has(url)) issues.push(`${page.chipText || page.title}: ảnh trùng ${url.slice(-24)}`);
      seen.add(url);
    }
  }
  return issues;
}

async function generateList(deckId, n) {
  return api('/api/decks/generate-from-caption', {
    method: 'POST',
    body: JSON.stringify({
      deckId,
      tone: 'lich_trinh_huu_ich',
      caption: {
        coverTitle: `72H LIST ${String(n).padStart(2, '0')}`.slice(0, 35),
        headline: 'Lưu list này trước khi lên Đà Lạt nhé',
        body: 'Lưu list này để có lịch đi gọn hơn, dễ chọn điểm theo buổi và đỡ mất thời gian mò từng nơi.',
        hashtags: ['#lichtrinhdalat', '#traveldalat'],
      },
    }),
  });
}

async function deleteList(deckId, listId) {
  await fetch(`${API}/api/decks/${encodeURIComponent(deckId)}/lists/${encodeURIComponent(listId)}`, {
    method: 'DELETE',
  });
}

async function main() {
  console.log('=== Regression budget-3n2d ===\n');
  const dataset = await api('/api/guide-data?refresh=1');
  const deck = (dataset.decks || []).find((d) => d.id === 'budget-3n2d');
  if (!deck) throw new Error('Không thấy budget-3n2d');

  const main = (deck.lists || []).find((l) => /-main$/i.test(l.id)) || deck.lists?.[0];
  let failed = 0;

  const mainCheckin = checkinCostIssues(main);
  const mainDupes = duplicateImageIssues(main);
  console.log('Main list:');
  console.log(`  Check-in cost: ${mainCheckin.length ? '❌' : '✅'} ${mainCheckin.join('; ') || 'OK'}`);
  console.log(`  Gallery ảnh:  ${mainDupes.length ? '❌' : '✅'} ${mainDupes.join('; ') || 'OK'}`);
  if (mainCheckin.length || mainDupes.length) failed += 1;

  const created = [];
  const genCount = 5;
  console.log(`\nTạo ${genCount} list AI để kiểm tra...`);
  for (let i = 1; i <= genCount; i++) {
    const gen = await generateList('budget-3n2d', i);
    created.push(gen.listId);
  }

  const after = await api('/api/guide-data?refresh=1');
  const deckAfter = (after.decks || []).find((d) => d.id === 'budget-3n2d');
  for (const listId of created) {
    const list = (deckAfter.lists || []).find((l) => l.id === listId);
    const checkin = checkinCostIssues(list);
    const dupes = duplicateImageIssues(list);
    const ok = !checkin.length && !dupes.length;
    console.log(`${ok ? '✅' : '❌'} ${listId}`);
    if (checkin.length) console.log(`     check-in: ${checkin.join('; ')}`);
    if (dupes.length) console.log(`     ảnh trùng: ${dupes.join('; ')}`);
    if (!ok) failed += 1;
  }

  console.log('\nDọn list test...');
  for (const listId of created) {
    await deleteList('budget-3n2d', listId);
  }

  console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'} (${failed} lỗi)`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
