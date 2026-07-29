/**
 * Kiểm tra lưới 8 / lưới 8 feed V2:
 * - list mẫu không còn "ĐÀ LẠT 8 ĐIỂM / 1 TRANG"
 * - list AI mới không dùng title/caption mẫu bị cấm
 *
 *   node backend/src/modules/guide/tools/test-grid8-cover-not-sample.mjs
 */
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const KEEP_LISTS = process.env.KEEP_LISTS === '1';
const DECKS = ['grid-8', 'grid-8-feed'];

const BANNED = [
  /8\s*điểm\s*\/\s*1\s*trang/i,
  /8\s*diem\s*\/\s*1\s*trang/i,
  /mẫu lưới dày/i,
  /mau luoi day/i,
  /bỏ túi ngay list này rủ bé bạn xách ba lô/i,
  /bo tui ngay list nay ru be ban xach ba lo/i,
];

function isBanned(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  return BANNED.some((re) => re.test(value));
}

async function api(pathname, options = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(300000),
  });
  const text = await res.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 400) }; }
  return { ok: res.ok, status: res.status, body, text };
}

function coverInfo(list) {
  const cover = (list.pages || []).find((p) => p.type === 'cover') || null;
  return {
    listId: list.id,
    coverTitle: list.coverTitle || list.title || '',
    pageTitle: cover?.title || '',
    subtitle: cover?.subtitle || '',
    description: list.description || '',
    postCaption: list.postCaption || '',
  };
}

function auditTexts(label, info) {
  const fields = ['coverTitle', 'pageTitle', 'subtitle', 'description', 'postCaption'];
  const hits = [];
  for (const field of fields) {
    if (isBanned(info[field])) hits.push({ field, value: String(info[field]).slice(0, 120) });
  }
  return { label, listId: info.listId, ok: hits.length === 0, hits, info };
}

async function waitReady() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const health = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (health.ok) {
        const guide = await fetch(`${API}/api/guide-data`, { signal: AbortSignal.timeout(120000) });
        if (guide.ok) return;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Backend chưa sẵn sàng');
}

async function main() {
  await waitReady();
  const report = { ok: true, failures: [], checks: [] };

  const guide = await api('/api/guide-data');
  if (!guide.ok) throw new Error(`guide-data HTTP ${guide.status}`);

  for (const deckId of DECKS) {
    const deck = (guide.body.decks || []).find((d) => d.id === deckId);
    if (!deck) {
      report.ok = false;
      report.failures.push(`Thiếu deck ${deckId}`);
      continue;
    }

    const main = (deck.lists || []).find((l) => /-main$/i.test(String(l.id || '')));
    const mainAudit = auditTexts(`${deckId}/main`, coverInfo(main || {}));
    report.checks.push(mainAudit);
    if (!mainAudit.ok) {
      report.ok = false;
      report.failures.push(`${deckId} main còn text mẫu bị cấm: ${JSON.stringify(mainAudit.hits)}`);
    }

    const expectedFragment = /MỖI GÓC PHỐ LÀ MỘT BỨC TRANH/i;
    const mainTitle = `${mainAudit.info.pageTitle} ${mainAudit.info.coverTitle}`;
    const hasNewTitle = expectedFragment.test(mainTitle);
    report.checks.push({
      name: `${deckId}/main có title mới`,
      ok: hasNewTitle,
      title: mainTitle.trim().slice(0, 80),
    });
    if (!hasNewTitle) {
      report.ok = false;
      report.failures.push(`${deckId} main chưa đổi sang "MỖI GÓC PHỐ LÀ MỘT BỨC TRANH"`);
    }

    // Tạo 1 list AI bằng caption (không cần DeepSeek) — normalize phải chặn title mẫu.
    const poisoned = await api('/api/decks/generate-from-caption', {
      method: 'POST',
      body: JSON.stringify({
        deckId,
        tone: 'gen_z',
        caption: {
          coverTitle: 'ĐÀ LẠT 8 ĐIỂM / 1 TRANG',
          headline: 'BỎ TÚI NGAY LIST NÀY RỦ BÉ BẠN XÁCH BA LÔ LÊN ĐÀ LẠT CHƠI LIỀN NÈ',
          body: 'BỎ TÚI NGAY LIST NÀY RỦ BÉ BẠN XÁCH BA LÔ LÊN ĐÀ LẠT CHƠI LIỀN NÈ. CHIA THEO TỪNG LIST ĐỂ CHỌN NHANH, ĐỠ PHẢI LĂN TĂN. List này giúp chọn điểm nhanh khi đi Đà Lạt.',
          hashtags: ['#dalat', '#test', '#grid8', '#luu', '#di'],
        },
      }),
    });

    report.checks.push({
      name: `${deckId}/generate-from-caption HTTP`,
      ok: poisoned.ok,
      status: poisoned.status,
      listId: poisoned.body?.listId,
      error: poisoned.ok ? undefined : (poisoned.body?.message || poisoned.text?.slice(0, 200)),
    });

    if (!poisoned.ok) {
      report.ok = false;
      report.failures.push(`${deckId} tạo list thất bại: ${poisoned.body?.message || poisoned.status}`);
      continue;
    }

    const after = await api('/api/guide-data');
    const afterDeck = (after.body.decks || []).find((d) => d.id === deckId);
    const created = (afterDeck?.lists || []).find((l) => l.id === poisoned.body.listId);
    const createdAudit = auditTexts(`${deckId}/created`, coverInfo(created || {}));
    report.checks.push(createdAudit);
    if (!createdAudit.ok) {
      report.ok = false;
      report.failures.push(`${deckId} list mới vẫn còn text mẫu: ${JSON.stringify(createdAudit.hits)}`);
    }

    if (!KEEP_LISTS && poisoned.body?.listId) {
      const del = await api(`/api/decks/${encodeURIComponent(deckId)}/lists/${encodeURIComponent(poisoned.body.listId)}`, {
        method: 'DELETE',
      });
      report.checks.push({
        name: `${deckId}/cleanup`,
        ok: del.ok || del.status === 404,
        status: del.status,
      });
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
