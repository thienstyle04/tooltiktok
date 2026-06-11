/**
 * Kiểm tra nhanh 4 mẫu V2 sau round feedback 2.
 * Chạy: node backend/src/modules/guide/tools/test-v2-feedback-round2.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../../../../../');
const frontendLib = join(rootDir, 'frontend/lib/pageMarkup.js');
const cssPath = join(rootDir, 'frontend/app/styles/template-variants-v2.css');

const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000/api/guide-data?refresh=1';
const V2_DECKS = ['grid-8-feed', 'grid-8-quaytung', 'spotlight-v2', 'pov-3-v2'];
const EXPECTED_VERSIONS = {
  'grid-8-feed': 12,
  'grid-8-quaytung': 3,
  'spotlight-v2': 16,
  'pov-3-v2': 8,
};
const POV_TAGLINE_MAX = 78;
const POV_TAGLINE_ELLIPSIS = /…|\.\.\./;

const results = [];
let pass = 0;
let fail = 0;

function ok(name, detail = '') {
  pass += 1;
  results.push({ status: 'PASS', name, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function bad(name, detail = '') {
  fail += 1;
  results.push({ status: 'FAIL', name, detail });
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

function extractPrice(item) {
  const secondary = String(item?.metaSecondary || '').replace(/\s+/g, ' ').trim();
  const priceMatch = secondary.match(/Giá:\s*([^·]+)/i);
  if (priceMatch) {
    const raw = priceMatch[1].trim();
    if (/free|miễn\s*phí|^0\s*đ$/i.test(raw)) return 'FREE';
    return raw;
  }
  if (/free|miễn\s*phí/i.test(secondary)) return 'FREE';
  return '';
}

function hasVnSuffix(text) {
  return /\bĐà\s*Lạt\s+VN\b/i.test(text) || /\s\/\s*VN\b/i.test(text) || /\sVN\s*$/i.test(text);
}

async function fetchDataset() {
  const res = await fetch(API, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API ${res.status}: ${API}`);
  return res.json();
}

function getMainList(deck) {
  return (deck?.lists || []).find((list) => /-main$/i.test(String(list?.id || ''))) || deck?.lists?.[0];
}

function testDeckVersions(dataset) {
  console.log('\n[1] Template versions');
  for (const deckId of V2_DECKS) {
    const deck = (dataset.decks || []).find((d) => d.id === deckId);
    if (!deck) {
      bad(`${deckId}: deck tồn tại`, 'không thấy trong API');
      continue;
    }
    const list = getMainList(deck);
    const version = list?.templateVersion;
    const expected = EXPECTED_VERSIONS[deckId];
    if (version === expected) ok(`${deckId} templateVersion`, `v${version}`);
    else bad(`${deckId} templateVersion`, `expected v${expected}, got v${version ?? 'n/a'}`);
  }
}

function testGrid8Feed(list) {
  console.log('\n[2] grid-8-feed');
  const cover = (list?.pages || []).find((p) => p.type === 'cover');
  if (!cover) {
    bad('grid-8-feed cover', 'thiếu trang cover');
    return;
  }
  const coverImages = Array.isArray(cover.coverImages) ? cover.coverImages.filter(Boolean) : [];
  if (coverImages.length >= 4) ok('cover có coverImages 2×2', `${coverImages.length} ảnh`);
  else bad('cover có coverImages 2×2', `chỉ có ${coverImages.length} ảnh`);

  if (cover.layoutVariant === 'grid-8-feed') ok('cover layoutVariant', cover.layoutVariant);
  else bad('cover layoutVariant', String(cover.layoutVariant));

  const listPages = (list.pages || []).filter((p) => p.layoutVariant === 'grid-8-feed');
  if (listPages.length > 0) ok('trang list grid-8-feed', `${listPages.length} trang`);
  else bad('trang list grid-8-feed', '0 trang');
}

function testGrid8Quaytung(list) {
  console.log('\n[3] grid-8-quaytung');
  const cover = (list?.pages || []).find((p) => p.type === 'cover');
  if (cover) {
    const title = String(cover.title || '');
    if (!hasVnSuffix(title)) ok('cover title không còn VN', title.slice(0, 48));
    else bad('cover title không còn VN', title);
  }

  const gridPages = (list.pages || []).filter((p) => p.layoutVariant === 'grid-8-quaytung');
  let unifiedOk = 0;
  let unifiedFail = 0;
  for (const page of gridPages) {
    const items = (page.items || []).slice(0, 8);
    const prices = items.map(extractPrice);
    const anyPrice = prices.some(Boolean);
    if (!anyPrice) continue;
    const allHave = items.every((item, i) => prices[i] || item?.sourceSectionKey?.includes('check') || item?.sourceSectionKey?.includes('khu_du'));
    if (allHave) unifiedOk += 1;
    else unifiedFail += 1;
  }
  if (gridPages.length > 0) ok('trang lưới quaytung', `${gridPages.length} trang`);
  if (unifiedFail === 0 && unifiedOk > 0) ok('giá thống nhất (trang có giá)', `${unifiedOk} trang kiểm tra`);
  else if (unifiedOk === 0) ok('giá thống nhất', 'chưa có trang nào có giá trong sample (bỏ qua)');
  else bad('giá thống nhất', `${unifiedFail} trang thiếu giá khi trang đã có giá`);
}

function testPov3V2(list) {
  console.log('\n[4] pov-3-v2');
  const stackPages = (list.pages || []).filter((p) => p.layoutVariant === 'pov-3-v2-stack');
  if (stackPages.length === 0) {
    bad('stack pages', '0 trang');
    return;
  }
  ok('stack pages', `${stackPages.length} trang`);

  const counts = stackPages.map((p) => (p.items || []).length);
  const allThree = counts.every((n) => n === 3);
  if (allThree) ok('mỗi stack có 3 ảnh', counts.join(', '));
  else bad('mỗi stack có 3 ảnh', counts.join(', '));

  const taglines = stackPages.flatMap((p) => (p.items || []).map((item) => String(item.label || '')));
  const clipped = taglines.filter((text) => POV_TAGLINE_ELLIPSIS.test(text));
  const maxLen = taglines.reduce((max, text) => Math.max(max, text.length), 0);
  if (clipped.length === 0) ok('tagline stack không có dấu …', `${taglines.length} dòng`);
  else bad('tagline stack không có dấu …', `${clipped.length} dòng còn dấu …`);
  if (maxLen <= POV_TAGLINE_MAX) ok(`tagline stack ≤${POV_TAGLINE_MAX} ký tự`, `max ${maxLen}`);
  else bad(`tagline stack ≤${POV_TAGLINE_MAX} ký tự`, `max ${maxLen}`);
}

function testSpotlightV2(list) {
  console.log('\n[5] spotlight-v2');
  const cover = (list?.pages || []).find((p) => p.type === 'cover' && p.layoutVariant === 'spotlight-v2');
  if (!cover) {
    bad('spotlight cover', 'thiếu');
    return;
  }
  const coverImages = Array.isArray(cover.coverImages) ? cover.coverImages.filter(Boolean) : [];
  if (coverImages.length >= 4) ok('cover 2×2 images', `${coverImages.length} ảnh`);
  else bad('cover 2×2 images', `${coverImages.length} ảnh`);

  if (!hasVnSuffix(String(cover.title || ''))) ok('cover title không VN', String(cover.title || '').slice(0, 40));
  else bad('cover title VN', cover.title);

  const spotPages = (list.pages || []).filter((p) => p.layoutVariant === 'spotlight-v2');
  let mapped = 0;
  let fallback = 0;
  for (const page of spotPages) {
    const item = page.items?.[0];
    if (!item) continue;
    if (item.imageMapped || item.imageSource === 'manual' || item.imageSource === 'auto') mapped += 1;
    else fallback += 1;
  }
  ok('trang spotlight địa điểm', `${spotPages.length} trang (${mapped} mapped, ${fallback} fallback)`);
  if (mapped >= fallback) ok('ưu tiên ảnh mapped', `${mapped}/${spotPages.length}`);
  else bad('ưu tiên ảnh mapped', `${mapped}/${spotPages.length} mapped`);
}

function testCssMarkers() {
  console.log('\n[6] CSS markers');
  const css = readFileSync(cssPath, 'utf8');
  const checks = [
    ['grid8-feed-cover-grid', 'grid8feed cover 2×2'],
    ['grid8-feed-cover-dim', 'grid8feed overlay'],
    ['Quicksand', 'font Quicksand'],
    ['rgba(0, 0, 0, 0.5)', 'overlay 50%'],
    ['pov-3-v2-stack-name', 'pov stack title'],
    ['-webkit-text-stroke', 'pov title stroke'],
    ['spotlight-v2-cover-title', 'spotlight cover title'],
  ];
  for (const [needle, label] of checks) {
    if (css.includes(needle)) ok(`CSS: ${label}`, needle);
    else bad(`CSS: ${label}`, `thiếu ${needle}`);
  }
  if (!css.includes('"Caveat"')) ok('CSS: bỏ Caveat', 'không còn Caveat trong v2 css vars');
  else bad('CSS: bỏ Caveat', 'vẫn còn Caveat');
}

function testMarkupSource() {
  console.log('\n[7] pageMarkup source markers');
  const markup = readFileSync(frontendLib, 'utf8');
  const checks = [
    ['grid8-feed-cover-grid', 'grid-8-feed cover grid'],
    ['grid8-quaytung-cover-title', 'grid-8-quaytung cover title'],
    ['spotlight-v2-cover-grid', 'spotlight-v2 cover grid'],
    ['pov-3-v2-stack-row', 'pov-3-v2 stack row'],
    ['formatGrid8QuaytungCoverTitle', 'quaytung cover title formatter'],
    ['truncatePov3V2StackTagline', 'pov tagline truncation helper'],
  ];
  for (const [needle, label] of checks) {
    if (markup.includes(needle)) ok(`markup: ${label}`, needle);
    else bad(`markup: ${label}`, `thiếu ${needle}`);
  }
}

async function main() {
  console.log('=== Test V2 feedback round 2 ===');
  console.log(`API: ${API}`);

  let dataset;
  try {
    dataset = await fetchDataset();
    ok('API guide-data', `${(dataset.decks || []).length} decks`);
  } catch (error) {
    bad('API guide-data', error.message);
    printSummary();
    process.exit(1);
  }

  testDeckVersions(dataset);
  for (const deckId of V2_DECKS) {
    const deck = (dataset.decks || []).find((d) => d.id === deckId);
    const list = getMainList(deck);
    if (!list) {
      bad(`${deckId} main list`, 'thiếu');
      continue;
    }
    if (deckId === 'grid-8-feed') testGrid8Feed(list);
    if (deckId === 'grid-8-quaytung') testGrid8Quaytung(list);
    if (deckId === 'pov-3-v2') testPov3V2(list);
    if (deckId === 'spotlight-v2') testSpotlightV2(list);
  }

  testCssMarkers();
  testMarkupSource();

  printSummary();
  process.exit(fail > 0 ? 1 : 0);
}

function printSummary() {
  console.log('\n=== Kết quả ===');
  console.log(`PASS: ${pass}`);
  console.log(`FAIL: ${fail}`);
  if (fail > 0) {
    console.log('\nCác mục FAIL:');
    results.filter((r) => r.status === 'FAIL').forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
  } else {
    console.log('\nTất cả kiểm tra đã PASS.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
