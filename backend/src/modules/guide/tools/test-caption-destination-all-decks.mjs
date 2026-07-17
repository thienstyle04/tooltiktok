/**
 * Regression caption Phan Thiết trên TẤT CẢ mẫu:
 * - Title không bị THIẾT → THÌẾT
 * - Hashtag không còn #riviudalat #dalat khi destination = phanthiet
 *
 * cd backend && node src/modules/guide/tools/test-caption-destination-all-decks.mjs [dalat|phanthiet]
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const guideDir = join(dirname(fileURLToPath(import.meta.url)), '..');
require('ts-node/register/transpile-only');

const { sanitizeDeckHeadline } = require(join(guideDir, 'logic/deck-builder.ts'));
const {
  buildCaptionHashtags,
  getDeckHashtagExtras,
  getMarketingCopy,
  isDalatHashtag,
  localizeText,
  setActiveDestinationLocalize,
} = require(join(guideDir, 'sync/destination-localize.ts'));

const API = process.env.GUIDE_API_BASE || 'http://127.0.0.1:3000';
const DESTINATION = process.argv[2] || 'dalat';
const TONES = ['gen_z', 'tinh_te', 'review_chan_that', 'ban_hang_nhe', 'lich_trinh_huu_ich'];
const AI_DALAT_HASHTAGS = ['#riviudalat', '#dalat', '#dalatreview', '#lichtrinhdalat', '#traveldalat'];
const DEFAULT_LIST_HASHTAGS = ['#riviudalat', '#dalat', '#dalatreview', '#72hdalat', '#dulichdalat'];

const BUDGET_TONE_TITLES = {
  gen_z: ['72H ĐÀ LẠT GỌN VÍ', '3 NGÀY ĐI ĐÀ LẠT CỰC GỌN', 'ĐÀ LẠT 3TR ĐI SAO CHO ĐÃ'],
  tinh_te: ['72H ĐÀ LẠT THẬT CHẬM', 'MỘT CHUYẾN ĐÀ LẠT GỌN GHẼ', '3 NGÀY Ở ĐÀ LẠT THẬT ÊM'],
  review_chan_that: ['72H ĐÀ LẠT DỄ ĐI', '3 NGÀY ĐÀ LẠT KHỎI RỐI', 'LỊCH ĐÀ LẠT GỌN CHO NGƯỜI MỚI'],
  ban_hang_nhe: ['LỊCH ĐÀ LẠT 3TR NÊN LƯU', '72H ĐÀ LẠT ĐI GỌN HƠN', 'ĐÀ LẠT 3 NGÀY CÓ SẴN LIST'],
  lich_trinh_huu_ich: ['72H ĐÀ LẠT TỐI ƯU', '3N2Đ ĐÀ LẠT GỌN LỊCH', 'LỊCH 72H ĐÀ LẠT DỄ THEO'],
};

const HEADLINE_CORRUPT = [/THÌẾT/, /Thìết/, /thìết/];
const DALAT_HASHTAG_RE = /#(?:riviu)?dalat|#dalatreview|#72hdalat|#lichtrinhdalat|#traveldalat/i;

function sanitizeCaptionTitle(raw) {
  return sanitizeDeckHeadline(localizeText(String(raw || ''), DESTINATION));
}

function checkHeadline(label, raw) {
  const result = sanitizeCaptionTitle(raw);
  const bad = HEADLINE_CORRUPT.some((re) => re.test(result));
  return bad ? { label, raw: String(raw).slice(0, 60), result } : null;
}

const PHANTHIET_HASHTAG_RE = /#(?:riviu)?phanthiet|#phanthietreview|#72hphanthiet|#lichtrinhphanthiet|#travelphanthiet/i;

function isPhanThietHashtag(tag) {
  return PHANTHIET_HASHTAG_RE.test(String(tag || ''));
}

function checkHashtags(label, rawTags, deckId, tone = 'lich_trinh_huu_ich') {
  const result = buildCaptionHashtags(
    (rawTags || []).map((t) => String(t || '').trim()).filter(Boolean),
    tone,
    DESTINATION,
    deckId,
  );
  if (DESTINATION === 'phanthiet') {
    const bad = result.filter((tag) => isDalatHashtag(tag));
    if (bad.length) return { label, bad, result };
  } else {
    const bad = result.filter((tag) => isPhanThietHashtag(tag));
    if (bad.length) return { label, bad, result };
  }
  const copy = getMarketingCopy(DESTINATION);
  const expectedCore = copy.hashtags.slice(0, 3);
  for (const tag of expectedCore) {
    if (!result.includes(tag)) return { label, bad: [`thiếu ${tag}`], result };
  }
  const expectedExtras = getDeckHashtagExtras(deckId, DESTINATION);
  for (const tag of expectedExtras) {
    if (!result.includes(tag)) return { label, bad: [`thiếu hashtag mẫu ${tag}`], result };
  }
  return null;
}

function collectTextsFromDeck(deck) {
  const texts = [];
  const push = (field, value) => {
    const v = String(value || '').trim();
    if (v) texts.push({ field, value: v });
  };

  push('deck.title', deck.title);
  push('deck.description', deck.description);

  for (const list of deck.lists || []) {
    push(`${list.id}.title`, list.title);
    push(`${list.id}.coverTitle`, list.coverTitle);
    push(`${list.id}.postCaption`, list.postCaption);
    push(`${list.id}.description`, list.description);
    for (const page of list.pages || []) {
      push(`${list.id}.page.title`, page.title);
      push(`${list.id}.page.subtitle`, page.subtitle);
    }
  }
  return texts;
}

function collectHashtagSources(deck) {
  const sources = [];
  for (const list of deck.lists || []) {
    if (Array.isArray(list.captionHashtags) && list.captionHashtags.length) {
      sources.push({
        label: `${deck.id}/${list.id} (stored)`,
        tags: list.captionHashtags,
      });
    }
  }
  sources.push({
    label: `${deck.id} (default AI input)`,
    tags: AI_DALAT_HASHTAGS,
  });
  if ((deck.lists || []).some((l) => /spotlight.*partner|partner/i.test(String(l.id)))) {
    sources.push({
      label: `${deck.id} (spotlight partner default)`,
      tags: DEFAULT_LIST_HASHTAGS,
    });
  }
  return sources;
}

async function main() {
  setActiveDestinationLocalize(DESTINATION);

  await fetch(`${API}/api/destination`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: DESTINATION }),
  });

  const dataset = await fetch(`${API}/api/guide-data?refresh=1`).then((r) => {
    if (!r.ok) throw new Error(`guide-data HTTP ${r.status}`);
    return r.json();
  });

  if (dataset?.source?.destinationId !== DESTINATION) {
    throw new Error(`Expected ${DESTINATION}, got ${dataset?.source?.destinationId}`);
  }

  const decks = dataset.decks || [];
  console.log(`\n=== TEST CAPTION ${DESTINATION.toUpperCase()} | ${decks.length} mẫu ===\n`);

  const headlineFails = [];
  const hashtagFails = [];
  let headlineChecks = 0;
  let hashtagChecks = 0;

  console.log('Mẫu'.padEnd(28), 'Headline', 'Hashtag', 'Ghi chú');
  console.log('-'.repeat(72));

  for (const deck of decks) {
    const label = String(deck.navTitle || deck.id).slice(0, 27);
    const deckHeadlineFails = [];
    const deckHashtagFails = [];

    for (const { field, value } of collectTextsFromDeck(deck)) {
      headlineChecks += 1;
      const fail = checkHeadline(`${deck.id} ${field}`, value);
      if (fail) deckHeadlineFails.push(fail);
    }

    if (deck.id.startsWith('budget-')) {
      for (const tone of TONES) {
        for (const title of BUDGET_TONE_TITLES[tone] || []) {
          headlineChecks += 1;
          const fail = checkHeadline(`${deck.id} budget/${tone}`, title);
          if (fail) deckHeadlineFails.push(fail);
        }
      }
    }

    for (const { label: srcLabel, tags } of collectHashtagSources(deck)) {
      hashtagChecks += 1;
      const fail = checkHashtags(srcLabel, tags, deck.id);
      if (fail) deckHashtagFails.push(fail);
    }

    for (const tone of TONES) {
      hashtagChecks += 1;
      const fail = checkHashtags(`${deck.id} tone/${tone}`, AI_DALAT_HASHTAGS, deck.id, tone);
      if (fail) deckHashtagFails.push(fail);
    }

    headlineFails.push(...deckHeadlineFails);
    hashtagFails.push(...deckHashtagFails);

    const hOk = deckHeadlineFails.length === 0;
    const tOk = deckHashtagFails.length === 0;
    const notes = [];
    if (!hOk) notes.push(`${deckHeadlineFails.length} title`);
    if (!tOk) notes.push(`${deckHashtagFails.length} hashtag`);

    console.log(
      `${hOk && tOk ? '✅' : '❌'} ${label.padEnd(26)}`,
      (hOk ? 'OK' : 'SAI').padStart(8),
      (tOk ? 'OK' : 'SAI').padStart(7),
      notes.join('; ') || 'OK',
    );
  }

  console.log('\n--- TỔNG KẾT ---');
  console.log(`Headline checks: ${headlineChecks} | Lỗi THÌẾT: ${headlineFails.length}`);
  console.log(`Hashtag checks: ${hashtagChecks} | Lỗi còn Đà Lạt: ${hashtagFails.length}`);

  if (headlineFails.length) {
    console.log('\n❌ Headline corrupt:');
    headlineFails.slice(0, 15).forEach(({ label, raw, result }) => {
      console.log(`  - ${label}`);
      console.log(`      in:  "${raw}"`);
      console.log(`      out: "${result}"`);
    });
    if (headlineFails.length > 15) console.log(`  ... và ${headlineFails.length - 15} lỗi khác`);
  }

  if (hashtagFails.length) {
    console.log('\n❌ Hashtag còn Đà Lạt:');
    hashtagFails.slice(0, 15).forEach(({ label, bad, result }) => {
      console.log(`  - ${label}: ${bad.join(' ')}`);
      console.log(`      full: ${result.join(' ')}`);
    });
    if (hashtagFails.length > 15) console.log(`  ... và ${hashtagFails.length - 15} lỗi khác`);
  }

  const pass = headlineFails.length === 0 && hashtagFails.length === 0;
  console.log(`\n${pass ? `✅ PASS — caption ${DESTINATION} OK trên tất cả mẫu` : '❌ CÓ LỖI CAPTION CẦN SỬA'}`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
