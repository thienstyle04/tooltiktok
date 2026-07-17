/**
 * Kiểm tra mẫu budget-72h-summary (72H Tổng hợp — cover + bảng chi phí).
 * Chạy: node backend/src/modules/guide/tools/test-budget-72h-summary.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../../../../../');
const markupPath = join(rootDir, 'frontend/lib/pageMarkup.js');
const cssPath = join(rootDir, 'frontend/app/styles/grid-templates.css');

const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000/api/guide-data?refresh=1';
const DECK_ID = 'budget-72h-summary';
const EXPECTED_VERSION = 7;

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

function parseCostRange(raw) {
  const cleaned = String(raw || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!cleaned || /đã tính|miễn phí|free|^0\s*đ?$/.test(cleaned)) {
    return { min: 0, max: 0 };
  }
  const parseNum = (value) => {
    const normalized = value.trim().replace(',', '.');
    if (normalized.includes('.') && normalized.split('.')[1]?.length === 3) {
      return Number(normalized.replace('.', '')) || 0;
    }
    return Number(normalized) || 0;
  };
  const trRange = cleaned.match(/([\d.,]+)\s*tr\s*-\s*([\d.,]+)\s*tr/);
  if (trRange) {
    return { min: parseNum(trRange[1]) * 1_000_000, max: parseNum(trRange[2]) * 1_000_000 };
  }
  const singleTr = cleaned.match(/~?\s*([\d.,]+)\s*tr/);
  if (singleTr) {
    const value = parseNum(singleTr[1]) * 1_000_000;
    return { min: value, max: value };
  }
  const kRange = cleaned.match(/([\d.,]+)\s*k\s*-\s*([\d.,]+)\s*k/);
  if (kRange) {
    return { min: parseNum(kRange[1]) * 1_000, max: parseNum(kRange[2]) * 1_000 };
  }
  const singleK = cleaned.match(/~?\s*([\d.,]+)\s*k/);
  if (singleK) {
    const value = parseNum(singleK[1]) * 1_000;
    return { min: value, max: value };
  }
  return { min: 0, max: 0 };
}

function addRanges(left, right) {
  return { min: left.min + right.min, max: left.max + right.max };
}

async function fetchDataset() {
  const res = await fetch(API, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API ${res.status}: ${API}`);
  return res.json();
}

async function buildMarkupModule() {
  const result = await esbuild.build({
    entryPoints: [markupPath],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    external: [],
  });
  const code = result.outputFiles[0].text;
  const tmp = join(__dirname, '.tmp-budget72-markup.mjs');
  const { writeFileSync, unlinkSync } = await import('node:fs');
  writeFileSync(tmp, code);
  const mod = await import(pathToFileURL(tmp).href);
  unlinkSync(tmp);
  return mod;
}

function testDeckStructure(list) {
  console.log('\n[1] Cấu trúc deck');
  const pages = list?.pages || [];
  if (pages.length === 2) ok('chỉ 2 trang', 'cover + bảng');
  else bad('chỉ 2 trang', `có ${pages.length} trang`);

  const cover = pages.find((p) => p.type === 'cover');
  if (cover?.layoutVariant === 'budget-3n2d') ok('cover layoutVariant', cover.layoutVariant);
  else bad('cover layoutVariant', String(cover?.layoutVariant));

  if (/72H/i.test(String(cover?.title || ''))) ok('cover title 72H', cover.title);
  else bad('cover title 72H', String(cover?.title));

  const table = pages.find((p) => p.layoutVariant === 'budget-3n2d-table');
  if (table) ok('trang bảng chi phí', table.title || 'ĐÀ LẠT 3 NGÀY 2 ĐÊM');
  else bad('trang bảng chi phí', 'thiếu');

  const gallery = pages.filter((p) => p.layoutVariant === 'budget-3n2d-gallery');
  if (gallery.length === 0) ok('không có trang gallery', 'đúng');
  else bad('không có trang gallery', `${gallery.length} trang`);
}

function testTableData(tablePage) {
  console.log('\n[2] Dữ liệu bảng');
  const items = tablePage?.items || [];
  const schedule = items.filter((item) => !String(item.label || '').startsWith('Tổng|'));
  const summary = items.filter((item) => String(item.label || '').startsWith('Tổng|'));

  if (schedule.length >= 18) ok('dòng lịch trình', `${schedule.length} dòng`);
  else bad('dòng lịch trình', `${schedule.length} dòng (mong >=18)`);

  if (summary.length === 5) ok('5 dòng tóm tắt', '4 mục + Tổng cộng');
  else bad('5 dòng tóm tắt', `${summary.length} dòng`);

  const withHours = schedule.filter((item) => /khung giờ|open:|hoạt động:/i.test(String(item.metaSecondary || '')));
  if (withHours.length === 0) ok('cột chi phí không có Khung giờ', 'sạch');
  else bad('cột chi phí không có Khung giờ', `${withHours.length} dòng: ${withHours[0]?.name}`);

  const syntheticFallbacks = schedule.filter((item) => /^~(?:30|35|40|50|60|70|80|120)k$/i.test(String(item.metaSecondary || '').trim()));
  if (syntheticFallbacks.length === 0) ok('cột chi phí không dùng fallback ~30k-120k', 'ưu tiên gia_dau_nguoi → Free (không fallback gia khi có cột)');
  else bad('cột chi phí không dùng fallback ~30k-120k', `${syntheticFallbacks.length} dòng: ${syntheticFallbacks[0]?.name} = ${syntheticFallbacks[0]?.metaSecondary}`);

  const giaRangeFallbacks = schedule.filter((item) => /~\s*[\d.,]+\s*k\s*-\s*~?\s*[\d.,]+\s*k/i.test(String(item.metaSecondary || '').trim()));
  if (giaRangeFallbacks.length === 0) ok('cột chi phí không dùng dải giá cột gia (~45k-65k)', 'chỉ gia_dau_nguoi hoặc Free');
  else bad('cột chi phí không dùng dải giá cột gia (~45k-65k)', `${giaRangeFallbacks.length} dòng: ${giaRangeFallbacks[0]?.name} = ${giaRangeFallbacks[0]?.metaSecondary}`);

  const freeRows = schedule.filter((item) => /^free$/i.test(String(item.metaSecondary || '').trim()));
  if (freeRows.length > 0) ok('có dòng Free khi thiếu giá', `${freeRows.length} dòng`);

  const categories = summary.filter((item) => !/tổng cộng/i.test(String(item.name || '')));
  const totalItem = summary.find((item) => /tổng cộng/i.test(String(item.name || '')));
  let catRange = { min: 0, max: 0 };
  for (const item of categories) {
    catRange = addRanges(catRange, parseCostRange(item.metaSecondary));
  }
  const totalRange = parseCostRange(totalItem?.metaSecondary || '');
  const minDiff = Math.abs(totalRange.min - catRange.min);
  const maxDiff = Math.abs(totalRange.max - catRange.max);
  const tolerance = Math.max(catRange.max, totalRange.max, 1) * 0.02 + 5000;

  if (totalItem?.metaSecondary && totalItem.metaSecondary !== '~2.5tr - 3tr') {
    ok('tổng không còn hardcode 2.5-3tr', totalItem.metaSecondary);
  } else if (totalItem?.metaSecondary === '~2.5tr - 3tr') {
    bad('tổng không còn hardcode 2.5-3tr', 'vẫn cố định — restart backend');
  } else {
    bad('tổng cộng', 'thiếu metaSecondary');
  }

  if (minDiff <= tolerance && maxDiff <= tolerance) {
    ok('Tổng cộng khớp 4 mục', totalItem?.metaSecondary);
  } else {
    bad(
      'Tổng cộng khớp 4 mục',
      `total ${totalItem?.metaSecondary} vs sum ~${Math.round(catRange.min / 1000)}k-${Math.round(catRange.max / 1000)}k`,
    );
  }

  for (const label of ['Khách sạn', 'Thuê xe', 'Quán ăn', 'Di chuyển']) {
    const row = categories.find((item) => String(item.name || '').includes(label));
    if (row?.metaSecondary) ok(`mục ${label}`, row.metaSecondary);
    else bad(`mục ${label}`, 'thiếu');
  }
}

function testStaticAssets() {
  console.log('\n[3] CSS / assets');
  const css = readFileSync(cssPath, 'utf8');
  if (css.includes('.story-page.budget72-table-page')) ok('CSS budget72-table-page', 'có');
  else bad('CSS budget72-table-page', 'thiếu');
  if (css.includes('.batch-export-root .story-page.budget72-table-page')) ok('CSS export budget72', 'có');
  else bad('CSS export budget72', 'thiếu');
}

async function testRender(list, markup) {
  console.log('\n[4] Render HTML');
  const listId = list.id || `${DECK_ID}-main`;
  const pages = list.pages || [];
  const cover = pages.find((p) => p.type === 'cover');
  const table = pages.find((p) => p.layoutVariant === 'budget-3n2d-table');

  if (cover && typeof markup.renderCoverPage === 'function') {
    const html = markup.renderCoverPage(cover, 0, pages.length, listId, [], list, cover.backgroundImage || '');
    if (html.includes('budget72-cover')) ok('cover HTML budget72-cover', 'có');
    else bad('cover HTML budget72-cover', 'thiếu');
    if (html.includes('budget72-title')) ok('cover HTML title', 'có');
    else bad('cover HTML title', 'thiếu');
  }

  if (table && typeof markup.renderListPage === 'function') {
    const html = markup.renderListPage(table, 1, pages.length, listId, [], list);
    if (html.includes('budget72-table-page')) ok('table HTML shell', 'có');
    else bad('table HTML shell', 'thiếu');
    if (html.includes('budget72-schedule-table')) ok('table HTML lịch trình', 'có');
    else bad('table HTML lịch trình', 'thiếu');
    if (html.includes('budget72-total-bar')) ok('table HTML footer tổng', 'có');
    else bad('table HTML footer tổng', 'thiếu');
    if (/khung giờ/i.test(html)) bad('HTML không lẫn Khung giờ', 'vẫn có trong output');
    else ok('HTML không lẫn Khung giờ', 'sạch');
  }
}

async function main() {
  console.log('=== Test budget-72h-summary ===');
  console.log(`API: ${API}`);

  let dataset;
  try {
    dataset = await fetchDataset();
    ok('API guide-data', `${(dataset.decks || []).length} decks`);
  } catch (error) {
    bad('API guide-data', error.message);
    console.log('\nGợi ý: chạy npm run dev và restart backend nếu vừa sửa code.');
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
  const tablePage = (list.pages || []).find((p) => p.layoutVariant === 'budget-3n2d-table');
  testTableData(tablePage);
  testStaticAssets();

  let markup;
  try {
    markup = await buildMarkupModule();
    await testRender(list, markup);
  } catch (error) {
    bad('render HTML', error.message);
  }

  console.log('\n=== Kết quả ===');
  console.log(`PASS: ${pass}  FAIL: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
