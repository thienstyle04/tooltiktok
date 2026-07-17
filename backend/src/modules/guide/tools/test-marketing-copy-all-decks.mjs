/**
 * Kiểm tra caption + title trang + hashtag trên TẤT CẢ mẫu và list (main + AI).
 * cd backend && node src/modules/guide/tools/test-marketing-copy-all-decks.mjs [dalat|phanthiet]
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
  isDalatHashtag,
  localizeText,
  setActiveDestinationLocalize,
  getMarketingCopy,
} = require(join(guideDir, 'sync/destination-localize.ts'));

const API = process.env.GUIDE_API_BASE || 'http://127.0.0.1:3000';
const DESTINATION = process.argv[2] || 'dalat';

const WRONG_DEST_RE = {
  dalat: [/phan\s*thiết/i, /\bPHAN\s*THIET\b/, /#(?:riviu)?phanthiet/i],
  phanthiet: [/đà\s*lạt/i, /\bĐÀ\s*LẠT\b/, /\bdalat\b/i, /#(?:riviu)?dalat\b/i, /#dalatreview/i],
};

const HEADLINE_CORRUPT = [/THÌẾT/, /Thìết/, /thìết/];
const PLACEHOLDER_CAPTION = [/^Test bảng\b/i, /^72H TEST\b/i, /^#test$/i];
const BAD_TOKENS = [/\[object Object\]/, /\bundefined\b/, /\bNaN\b/];

function sanitizeTitle(raw) {
  return sanitizeDeckHeadline(localizeText(String(raw || ''), DESTINATION));
}

function hasWrongDestination(text) {
  const s = String(text || '');
  if (!s) return false;
  return (WRONG_DEST_RE[DESTINATION] || []).some((re) => re.test(s));
}

function checkTitleField(deckId, listId, field, raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const issues = [];
  const sanitized = sanitizeTitle(text);
  if (HEADLINE_CORRUPT.some((re) => re.test(sanitized))) {
    issues.push(`corrupt THÌẾT → "${sanitized.slice(0, 50)}"`);
  }
  if (hasWrongDestination(text) || hasWrongDestination(sanitized)) {
    issues.push('lẫn destination');
  }
  if (PLACEHOLDER_CAPTION.some((re) => re.test(text))) {
    issues.push('placeholder test');
  }
  if (BAD_TOKENS.some((re) => re.test(text))) {
    issues.push('token hỏng');
  }
  return issues.length ? { deckId, listId, field, text: text.slice(0, 70), issues } : null;
}

function checkCaptionField(deckId, listId, field, raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const issues = [];
  if (PLACEHOLDER_CAPTION.some((re) => re.test(text))) issues.push('placeholder test');
  if (hasWrongDestination(text)) issues.push('lẫn destination');
  if (BAD_TOKENS.some((re) => re.test(text))) issues.push('token hỏng');
  if (field === 'postCaption' && HEADLINE_CORRUPT.some((re) => re.test(text))) {
    issues.push('THÌẾT trong caption');
  }
  return issues.length ? { deckId, listId, field, text: text.slice(0, 70), issues } : null;
}

function checkStoredHashtags(deckId, listId, tags) {
  const arr = Array.isArray(tags) ? tags.map((t) => String(t || '').trim()).filter(Boolean) : [];
  if (!arr.length) return null;
  const issues = [];
  if (arr.some((t) => /^#test$/i.test(t))) issues.push('#test');
  if (DESTINATION === 'phanthiet' && arr.some((t) => isDalatHashtag(t))) {
    issues.push('còn hashtag ĐL: ' + arr.filter((t) => isDalatHashtag(t)).join(' '));
  }
  if (DESTINATION === 'dalat') {
    const badPt = arr.filter((t) => /#(?:riviu)?phanthiet|#phanthietreview/i.test(t));
    if (badPt.length) issues.push('còn hashtag PT: ' + badPt.join(' '));
    const core = ['#riviudalat', '#dalat', '#dalatreview'];
    for (const tag of core) {
      if (!arr.some((t) => t.toLowerCase() === tag)) issues.push(`thiếu ${tag}`);
    }
  }
  const normalized = buildCaptionHashtags(arr, 'lich_trinh_huu_ich', DESTINATION, deckId);
  const expected = buildCaptionHashtags([], 'lich_trinh_huu_ich', DESTINATION, deckId);
  if (JSON.stringify(normalized) !== JSON.stringify(expected)) {
    issues.push(`hashtag chưa đúng mẫu: có ${normalized.join(' ')} | cần ${expected.join(' ')}`);
  }
  if (DESTINATION === 'phanthiet' && normalized.some((t) => isDalatHashtag(t))) {
    issues.push('sanitize vẫn còn ĐL');
  }
  return issues.length ? { deckId, listId, field: 'captionHashtags', text: arr.join(' '), issues } : null;
}

function auditList(deckId, list) {
  const listId = list.id || 'unknown';
  const fails = [];

  for (const field of ['title', 'coverTitle', 'navTitle']) {
    const f = checkTitleField(deckId, listId, field, list[field]);
    if (f) fails.push(f);
  }
  for (const field of ['postCaption', 'description']) {
    const f = checkCaptionField(deckId, listId, field, list[field]);
    if (f) fails.push(f);
  }
  const hf = checkStoredHashtags(deckId, listId, list.captionHashtags);
  if (hf) fails.push(hf);

  for (const page of list.pages || []) {
    const chip = page.chipText || page.type || 'page';
    for (const field of ['title', 'subtitle', 'chipText']) {
      const f = checkTitleField(deckId, listId, `page[${chip}].${field}`, page[field]);
      if (f) fails.push(f);
    }
  }

  return fails;
}

async function main() {
  setActiveDestinationLocalize(DESTINATION);
  const copy = getMarketingCopy(DESTINATION);

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

  console.log(`\n=== KIỂM TRA CAPTION / TITLE / HASHTAG | ${copy.label.toUpperCase()} ===`);
  console.log(`Pool: ${dataset.source?.totalItems} item | ${(dataset.decks || []).length} mẫu\n`);
  console.log('Mẫu'.padEnd(26), 'List', 'Title', 'Caption', 'Hashtag', 'Ghi chú');
  console.log('-'.repeat(82));

  const allFails = [];
  let totalLists = 0;

  for (const deck of dataset.decks || []) {
    const label = String(deck.navTitle || deck.id).slice(0, 24);
    const lists = deck.lists || [];
    let deckTitleFail = 0;
    let deckCaptionFail = 0;
    let deckHashtagFail = 0;

    const deckFails = lists.flatMap((list) => auditList(deck.id, list));
    allFails.push(...deckFails);
    for (const f of deckFails) {
      if (f.field.includes('page') || ['title', 'coverTitle', 'navTitle'].includes(f.field)) deckTitleFail += 1;
      else if (f.field === 'captionHashtags') deckHashtagFail += 1;
      else deckCaptionFail += 1;
    }

    for (const list of lists) {
      totalLists += 1;
    }

    const ok = deckTitleFail + deckCaptionFail + deckHashtagFail === 0;
    const notes = [];
    if (deckTitleFail) notes.push(`${deckTitleFail} title`);
    if (deckCaptionFail) notes.push(`${deckCaptionFail} caption`);
    if (deckHashtagFail) notes.push(`${deckHashtagFail} hashtag`);

    console.log(
      `${ok ? '✅' : '❌'} ${label.padEnd(24)}`,
      String(lists.length).padStart(4),
      (deckTitleFail ? 'SAI' : 'OK').padStart(5),
      (deckCaptionFail ? 'SAI' : 'OK').padStart(7),
      (deckHashtagFail ? 'SAI' : 'OK').padStart(7),
      notes.join('; ') || 'OK',
    );
  }

  console.log('\n--- TỔNG KẾT ---');
  console.log(`List kiểm tra: ${totalLists} | Lỗi: ${allFails.length}`);

  if (allFails.length) {
    console.log('\n❌ Chi tiết (tối đa 25):');
    allFails.slice(0, 25).forEach(({ deckId, listId, field, text, issues }) => {
      console.log(`  - ${deckId}/${listId} · ${field}`);
      console.log(`      "${text}"`);
      console.log(`      → ${issues.join('; ')}`);
    });
    if (allFails.length > 25) console.log(`  ... +${allFails.length - 25} lỗi`);
  }

  const pass = allFails.length === 0;
  console.log(`\n${pass ? `✅ PASS — caption/title/hashtag ${DESTINATION} OK` : '❌ CÓ LỖI MARKETING COPY'}`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
