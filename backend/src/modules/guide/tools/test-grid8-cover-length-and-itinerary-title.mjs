/**
 * Kiểm tra:
 * 1) lưới 8 ô: chữ cover (subtitle) ngắn, không có "..."
 * 2) lịch trình 4n3d lưới 8: title không kiểu "LƯU LIỀN 4 NGÀY..."
 *
 *   node backend/src/modules/guide/tools/test-grid8-cover-length-and-itinerary-title.mjs
 */
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const KEEP = process.env.KEEP_LISTS === '1';

function hasEllipsis(text) {
  return String(text || '').includes('...');
}

function isRoboticItineraryTitle(text) {
  const n = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /^luu\s*(lien|ngay)\s*\d+\s*ngay/.test(n) || /^luu\s*(lien|ngay)\s*(lich trinh|board|list)/.test(n);
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(300000),
  });
  const text = await res.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 300) }; }
  return { ok: res.ok, status: res.status, body };
}

async function waitReady() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const h = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(4000) });
      if (!h.ok) throw new Error('health');
      const g = await fetch(`${API}/api/guide-data`, { signal: AbortSignal.timeout(120000) });
      if (g.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Backend chưa sẵn sàng');
}

async function createAndInspect(deckId, caption) {
  const created = await api('/api/decks/generate-from-caption', {
    method: 'POST',
    body: JSON.stringify({ deckId, tone: 'tinh_te', caption }),
  });
  if (!created.ok) {
    return { ok: false, error: created.body?.message || `HTTP ${created.status}` };
  }
  const guide = await api('/api/guide-data');
  const deck = (guide.body.decks || []).find((d) => d.id === deckId);
  const list = (deck?.lists || []).find((l) => l.id === created.body.listId);
  const cover = (list?.pages || []).find((p) => p.type === 'cover');
  const info = {
    listId: created.body.listId,
    coverTitle: list?.coverTitle || list?.title || '',
    pageTitle: cover?.title || '',
    subtitle: cover?.subtitle || '',
    subtitleLen: String(cover?.subtitle || '').length,
  };
  if (!KEEP && created.body.listId) {
    await api(`/api/decks/${encodeURIComponent(deckId)}/lists/${encodeURIComponent(created.body.listId)}`, { method: 'DELETE' });
  }
  return { ok: true, info };
}

async function main() {
  await waitReady();
  const report = { ok: true, failures: [], checks: [] };

  // 1) grid-8 với body dài cố ý — subtitle phải ngắn, không "..."
  const longBody = 'Vừa đi về, mê lắm nhưng cũng thật lòng khen chê. List tổng hợp giúp bạn khỏi mất công mò từng chỗ, chọn nhanh theo sở thích mà vẫn có những góc nhìn khác nhau giữa cafe, check-in, ăn uống và chỗ nghỉ để chuyến đi đỡ bị rối.';
  const grid8 = await createAndInspect('grid-8', {
    coverTitle: 'CẨM NANG ĐÀ LẠT GỌN NHẸ',
    headline: 'Lưu list này rồi đi cho đỡ mò nhé.',
    body: longBody,
    hashtags: ['#dalat', '#test', '#grid8', '#cover', '#ok'],
  });
  report.checks.push({ name: 'grid-8 create', ok: grid8.ok, error: grid8.error, info: grid8.info });
  if (!grid8.ok) {
    report.ok = false;
    report.failures.push(`grid-8 create fail: ${grid8.error}`);
  } else {
    const noDots = !hasEllipsis(grid8.info.subtitle);
    const shortEnough = grid8.info.subtitleLen <= 118;
    report.checks.push({ name: 'grid-8 subtitle no ...', ok: noDots, subtitle: grid8.info.subtitle });
    report.checks.push({ name: 'grid-8 subtitle ≤118', ok: shortEnough, len: grid8.info.subtitleLen });
    if (!noDots || !shortEnough) {
      report.ok = false;
      report.failures.push(`grid-8 subtitle bad: len=${grid8.info.subtitleLen} text=${grid8.info.subtitle}`);
    }
  }

  // 2) itinerary với title máy móc — phải bị thay
  const itinerary = await createAndInspect('itinerary-4n2d-grid8', {
    coverTitle: 'LƯU LIỀN 4 NGÀY ĐÀ LẠT',
    headline: 'Lưu board 4N3Đ này để đi cho nhẹ.',
    body: 'Phù hợp cho ai mê đi chơi mà sợ tốn sức lên lịch. Cứ lưu board này về, từ sáng đến tối có sẵn khung giờ, khỏi lo lạc hay đói.',
    hashtags: ['#dalat', '#test', '#4n3d', '#cover', '#ok'],
  });
  report.checks.push({ name: 'itinerary create', ok: itinerary.ok, error: itinerary.error, info: itinerary.info });
  if (!itinerary.ok) {
    report.ok = false;
    report.failures.push(`itinerary create fail: ${itinerary.error}`);
  } else {
    const title = `${itinerary.info.coverTitle} ${itinerary.info.pageTitle}`;
    const notRobotic = !isRoboticItineraryTitle(itinerary.info.coverTitle)
      && !isRoboticItineraryTitle(itinerary.info.pageTitle);
    report.checks.push({ name: 'itinerary title not robotic', ok: notRobotic, title: title.trim() });
    if (!notRobotic) {
      report.ok = false;
      report.failures.push(`itinerary still robotic: ${title}`);
    }
  }

  // 3) main samples
  const guide = await api('/api/guide-data');
  for (const deckId of ['grid-8', 'itinerary-4n2d-grid8']) {
    const deck = (guide.body.decks || []).find((d) => d.id === deckId);
    const main = (deck?.lists || []).find((l) => /-main$/i.test(l.id || ''));
    const cover = (main?.pages || []).find((p) => p.type === 'cover');
    const subtitle = cover?.subtitle || '';
    const title = cover?.title || '';
    report.checks.push({
      name: `${deckId}/main`,
      ok: !hasEllipsis(subtitle) && !isRoboticItineraryTitle(title),
      title,
      subtitle,
      subtitleLen: subtitle.length,
    });
    if (hasEllipsis(subtitle) || isRoboticItineraryTitle(title)) {
      report.ok = false;
      report.failures.push(`${deckId} main still bad`);
    }
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
