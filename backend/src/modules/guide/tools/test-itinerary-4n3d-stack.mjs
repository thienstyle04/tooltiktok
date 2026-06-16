/**
 * Kiểm tra mẫu itinerary-4n3d-stack (4N3Đ Stack V2).
 * Chạy: node backend/src/modules/guide/tools/test-itinerary-4n3d-stack.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../../../../../');
const markupPath = join(rootDir, 'frontend/lib/pageMarkup.js');
const cssPath = join(rootDir, 'frontend/app/styles/template-variants-v2.css');

const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000/api/guide-data?refresh=1';
const DECK_ID = 'itinerary-4n3d-stack';
const EXPECTED_VERSION = 2;
const DAY_LABELS = ['NGÀY 1', 'NGÀY 2', 'NGÀY 3', 'NGÀY 4'];
const EXPECTED_LIST_TITLES = [
  'ĂN SÁNG · 4 NGÀY',
  'ĂN TRƯA · 4 NGÀY',
  'ĂN TỐI · 4 NGÀY',
  'CAFE · 4 NGÀY',
  'CHECK-IN · 4 NGÀY',
];

let pass = 0;
let fail = 0;

function ok(name, detail = '') {
  pass += 1;
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function bad(name, detail = '') {
  fail += 1;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

function getMainList(deck) {
  return (deck?.lists || []).find((list) => /-main$/i.test(String(list?.id || ''))) || deck?.lists?.[0];
}

async function fetchDataset() {
  const res = await fetch(API, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API ${res.status}: ${API}`);
  return res.json();
}

function testDeckStructure(list) {
  console.log('\n[1] Cấu trúc deck');
  const pages = list?.pages || [];
  if (pages.length === 8) ok('tổng 8 trang', 'cover + 7 list');
  else bad('tổng 8 trang', `có ${pages.length} trang`);

  const cover = pages.find((p) => p.type === 'cover');
  if (cover?.layoutVariant === 'itinerary-4n3d-stack-cover') ok('cover layoutVariant', cover.layoutVariant);
  else bad('cover layoutVariant', String(cover?.layoutVariant));

  const coverImages = Array.isArray(cover?.coverImages) ? cover.coverImages.filter(Boolean) : [];
  if (coverImages.length >= 4) ok('cover 2×2 ảnh nền', `${coverImages.length} ảnh`);
  else bad('cover 2×2 ảnh nền', `${coverImages.length} ảnh`);

  const listPages = pages.filter((p) => p.layoutVariant === 'itinerary-4n3d-stack-page');
  if (listPages.length === 7) ok('7 trang list stack', `${listPages.length} trang`);
  else bad('7 trang list stack', `${listPages.length} trang`);

  for (const title of EXPECTED_LIST_TITLES) {
    const found = listPages.some((p) => String(p.title || '').includes(title.split(' · ')[0]));
    if (found) ok(`trang ${title.split(' · ')[0]}`, 'có');
    else bad(`trang ${title.split(' · ')[0]}`, 'thiếu');
  }

  const servicePage = listPages.find((p) => String(p.title || '').includes('DỊCH VỤ'));
  if (servicePage) ok('trang Dịch vụ (gộp homestay/đêm)', servicePage.title);
  else bad('trang Dịch vụ', 'thiếu');

  const withIntro = listPages.filter((p) => String(p.subtitle || '').trim().length > 0);
  if (withIntro.length === listPages.length) ok('trang có title giới thiệu', `${withIntro.length}/${listPages.length}`);
  else bad('trang có title giới thiệu', `${withIntro.length}/${listPages.length}`);

  const activityPage = listPages.find((p) => /HOẠT ĐỘNG|KHU DU LỊCH/i.test(String(p.title || '')));
  if (activityPage) ok('trang Hoạt động/KDL', activityPage.title);
  else bad('trang Hoạt động/KDL', 'thiếu');
}

function testPageItems(listPages) {
  console.log('\n[2] 4 slot / trang + label NGÀY 1–4');
  let partnerPagesOk = 0;
  let partnerPagesOver = 0;

  for (const page of listPages) {
    const chip = page.chipText || page.title || '?';
    const items = Array.isArray(page.items) ? page.items : [];
    if (items.length === 4) ok(`${chip}: 4 item`, 'đủ');
    else bad(`${chip}: 4 item`, `có ${items.length}`);

    const labels = items.map((item) => String(item.label || '').trim().toUpperCase());
    const labelsOk = DAY_LABELS.every((day, i) => labels[i] === day);
    if (labelsOk) ok(`${chip}: label ngày`, labels.join(', '));
    else bad(`${chip}: label ngày`, labels.join(', '));

    const missingName = items.filter((item) => !String(item.name || '').trim()).length;
    if (missingName === 0) ok(`${chip}: tên quán`, 'đủ');
    else bad(`${chip}: tên quán`, `${missingName} thiếu`);

    const partnerCount = items.filter((item) => item.isPartner).length;
    if (partnerCount >= 1 && partnerCount <= 2) partnerPagesOk += 1;
    if (partnerCount > 2) partnerPagesOver += 1;
  }

  console.log('\n[3] Đối tác (mục tiêu 1–2/trang)');
  if (partnerPagesOver === 0) ok('không trang nào >2 partner', `${partnerPagesOk} trang có 1–2 partner`);
  else bad('quota partner', `${partnerPagesOver} trang vượt 2 partner`);

  const totalPartners = listPages.reduce(
    (sum, page) => sum + (page.items || []).filter((item) => item.isPartner).length,
    0,
  );
  ok('tổng slot partner', `${totalPartners} trên ${listPages.length * 4} slot`);
}

function testStaticAssets() {
  console.log('\n[4] CSS & markup');
  const css = readFileSync(cssPath, 'utf8');
  const markup = readFileSync(markupPath, 'utf8');
  const cssChecks = [
    ['itinerary-4n3d-stack-cover-grid', 'cover grid'],
    ['itinerary-4n3d-stack-row', 'stack row'],
    ['itinerary-4n3d-stack-day', 'day label'],
    ['itinerary-4n3d-stack-head-lead', 'page intro lead'],
    ['is-people-focus', 'people focus crop'],
    ['--stack-yellow', 'tone vàng'],
  ];
  for (const [needle, label] of cssChecks) {
    if (css.includes(needle)) ok(`CSS: ${label}`, needle);
    else bad(`CSS: ${label}`, 'thiếu');
  }
  const markupChecks = [
    ['renderItinerary4N3DStackCover', 'cover render'],
    ['renderItinerary4N3DStackPage', 'page render'],
    ['itinerary-4n3d-stack-cover', 'cover class'],
  ];
  for (const [needle, label] of markupChecks) {
    if (markup.includes(needle)) ok(`markup: ${label}`, needle);
    else bad(`markup: ${label}`, 'thiếu');
  }
}

async function main() {
  console.log('=== Test itinerary-4n3d-stack ===');
  console.log(`API: ${API}`);

  let dataset;
  try {
    dataset = await fetchDataset();
    ok('API guide-data', `${(dataset.decks || []).length} decks`);
  } catch (error) {
    bad('API guide-data', error.message);
    console.log('\nGợi ý: chạy npm run dev và restart backend nếu vừa thêm deck mới.');
    process.exit(1);
  }

  const deck = (dataset.decks || []).find((d) => d.id === DECK_ID);
  if (!deck) {
    bad(`${DECK_ID} tồn tại`, 'không thấy — restart backend + refresh=1');
    process.exit(1);
  }
  ok('deck trong catalog', deck.navTitle || DECK_ID);

  const list = getMainList(deck);
  if (!list) {
    bad('main list', 'thiếu');
    process.exit(1);
  }

  const version = list.templateVersion;
  if (version === EXPECTED_VERSION) ok('templateVersion', `v${version}`);
  else bad('templateVersion', `expected v${EXPECTED_VERSION}, got v${version ?? 'n/a'}`);

  testDeckStructure(list);
  const listPages = (list.pages || []).filter((p) => p.layoutVariant === 'itinerary-4n3d-stack-page');
  testPageItems(listPages);
  testStaticAssets();

  console.log('\n=== Kết quả ===');
  console.log(`PASS: ${pass}`);
  console.log(`FAIL: ${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
