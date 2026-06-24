/**
 * Kiểm tra mẫu grid-5 (lưới 2×3 — 5 địa điểm + ô title).
 * Chạy: node backend/src/modules/guide/tools/test-grid-5.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../../../../../');
const markupPath = join(rootDir, 'frontend/lib/pageMarkup.js');
const grid5CssPath = join(rootDir, 'frontend/app/styles/grid5-templates.css');
const foundationCssPath = join(rootDir, 'frontend/app/styles/foundation.css');

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const { pathToFileURL } = await import('node:url');

const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000/api/guide-data?refresh=1';
const DECK_ID = 'grid-5';
const EXPECTED_VERSION = 4;
const EXPECTED_PAGES = 8;
const ITEMS_PER_PAGE = 5;

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

async function buildMarkupRenderer() {
  const tmp = join(__dirname, '__test-grid5-markup.mjs');
  await esbuild.build({
    entryPoints: [markupPath],
    outfile: tmp,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });
  return import(pathToFileURL(tmp).href);
}

function testStaticAssets() {
  console.log('\n=== CSS & font tĩnh ===');
  const grid5Css = readFileSync(grid5CssPath, 'utf8');
  const foundationCss = readFileSync(foundationCssPath, 'utf8');
  const markup = readFileSync(markupPath, 'utf8');

  const fontChecks = [
    [grid5Css, '--grid5-display: "Quicksand", "Be Vietnam Pro", Arial, sans-serif', 'display font hỗ trợ tiếng Việt'],
    [grid5Css, 'font-family: var(--grid5-display) !important', 'title/name dùng display font'],
    [grid5Css, 'font-family: var(--grid5-script) !important', 'script font chỉ cho nhãn trang trí'],
    [grid5Css, '.grid5-cover-script', 'cover script label'],
    [foundationCss, 'Quicksand-700.ttf', 'Quicksand local @font-face'],
    [foundationCss, 'BeVietnamPro-600.ttf', 'Be Vietnam Pro local @font-face'],
  ];

  for (const [source, needle, label] of fontChecks) {
    if (source.includes(needle)) ok(label, needle);
    else bad(label, 'thiếu');
  }

  const vietnameseMustUseDisplay = [
    '.grid5-title-text',
    '.grid5-photo-name',
    '.grid5-cover-dalat',
  ];
  for (const selector of vietnameseMustUseDisplay) {
    const block = grid5Css.slice(grid5Css.indexOf(selector));
    const ruleEnd = block.indexOf('}');
    const rule = block.slice(0, ruleEnd);
    if (rule.includes('--grid5-display')) ok(`${selector} → display font`, 'đúng');
    else if (rule.includes('--grid5-script')) bad(`${selector} → display font`, 'vẫn dùng Caveat (lỗi tiếng Việt)');
    else bad(`${selector} → display font`, 'không xác định được font');
  }

  const markupChecks = [
    [markup, 'renderGrid5Cover', 'markup cover'],
    [markup, 'renderGrid5Page', 'markup list page'],
    [markup, 'grid5-photo-name', 'class tên địa điểm'],
    [markup, 'grid5-title-text', 'class ô title'],
  ];
  for (const [source, needle, label] of markupChecks) {
    if (source.includes(needle)) ok(label, needle);
    else bad(label, 'thiếu');
  }
}

function testDeckApi(deck) {
  console.log(`\n=== grid-5 — API ===`);
  if (!deck) {
    bad('deck trong catalog', 'không thấy');
    return null;
  }
  ok('deck trong catalog', deck.navTitle || DECK_ID);

  const list = getMainList(deck);
  if (!list) {
    bad('main list', 'thiếu');
    return null;
  }

  const version = list.templateVersion;
  if (version === EXPECTED_VERSION) ok('templateVersion', `v${version}`);
  else bad('templateVersion', `expected v${EXPECTED_VERSION}, got v${version ?? 'n/a'}`);

  const pages = list.pages || [];
  if (pages.length === EXPECTED_PAGES) ok('số trang', `${pages.length}`);
  else bad('số trang', `expected ${EXPECTED_PAGES}, got ${pages.length}`);

  const cover = pages.find((p) => p.type === 'cover');
  if (cover?.layoutVariant === 'grid-5') ok('cover layoutVariant', cover.layoutVariant);
  else bad('cover layoutVariant', String(cover?.layoutVariant));

  const listPages = pages.filter((p) => p.layoutVariant === 'grid-5' && p.type === 'list');
  if (listPages.length === EXPECTED_PAGES - 1) ok('trang lưới', `${listPages.length}`);
  else bad('trang lưới', `expected ${EXPECTED_PAGES - 1}, got ${listPages.length}`);

  for (const page of listPages) {
    const chip = page.chipText || page.title || '?';
    const items = Array.isArray(page.items) ? page.items : [];
    if (items.length === ITEMS_PER_PAGE) ok(`${chip}: ${ITEMS_PER_PAGE} item`, 'đủ');
    else bad(`${chip}: ${ITEMS_PER_PAGE} item`, `có ${items.length}`);

    const vietnameseNames = items.filter((item) => /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(String(item.name || '')));
    if (vietnameseNames.length > 0) ok(`${chip}: tên có dấu`, `${vietnameseNames.length}/${items.length}`);
  }

  return { list, pages, listPages };
}

async function testDeckRender(list, markup) {
  console.log('\n=== grid-5 — Render HTML ===');
  const { renderCoverPage, renderListPage } = markup;
  const pages = list?.pages || [];
  const cover = pages.find((p) => p.type === 'cover');
  const listPages = pages.filter((p) => p.layoutVariant === 'grid-5' && p.type === 'list');

  if (!cover) {
    bad('render cover', 'không có trang cover');
    return;
  }

  const coverHtml = renderCoverPage(cover, 0, pages.length, `${DECK_ID}-main`, [], list, []);
  if (coverHtml?.includes('grid5-cover')) ok('render cover class', 'grid5-cover');
  else bad('render cover class', 'thiếu grid5-cover');
  if (coverHtml?.includes('grid5-cover-script')) ok('cover script label', 'Thong dong');
  else bad('cover script label', 'thiếu');

  if (listPages.length > 0) {
    const sample = listPages.find((p) => /cà phê|check-in|quán ăn/i.test(`${p.chipText} ${p.title}`)) || listPages[0];
    const idx = pages.indexOf(sample);
    const pageHtml = renderListPage(sample, idx, `${DECK_ID}-main`, list, sample.subtitle);

    if (pageHtml.includes('grid5-matrix')) ok('render lưới 2×3', 'grid5-matrix');
    else bad('render lưới', 'thiếu matrix');

    const cellCount = (pageHtml.match(/grid5-cell/g) || []).length;
    if (cellCount === 6) ok('số ô (title + 5 ảnh)', `${cellCount}`);
    else bad('số ô', `expected 6, got ${cellCount}`);

    if (pageHtml.includes('grid5-title-text')) ok('ô title card', 'có');
    else bad('ô title card', 'thiếu');

    const nameCount = (pageHtml.match(/grid5-photo-name/g) || []).length;
    if (nameCount === ITEMS_PER_PAGE) ok('tên địa điểm trên ảnh', `${nameCount}`);
    else bad('tên địa điểm trên ảnh', `expected ${ITEMS_PER_PAGE}, got ${nameCount}`);

    const items = Array.isArray(sample.items) ? sample.items : [];
    const vnItem = items.find((item) => /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(String(item.name || '')));
    if (vnItem && pageHtml.includes(String(vnItem.name).slice(0, 8))) {
      ok('HTML có tên tiếng Việt', vnItem.name.slice(0, 24));
    } else if (vnItem) {
      bad('HTML có tên tiếng Việt', `thiếu "${vnItem.name}"`);
    } else {
      ok('HTML có tên tiếng Việt', 'bỏ qua — trang mẫu không có dấu');
    }
  }
}

async function main() {
  console.log('=== Test grid-5 (lưới 5 ô) ===');
  console.log(`API: ${API}`);

  testStaticAssets();

  let dataset;
  try {
    dataset = await fetchDataset();
    ok('API guide-data', `${(dataset.decks || []).length} decks`);
  } catch (error) {
    bad('API guide-data', error.message);
    console.log('\nGợi ý: chạy npm run dev và đợi backend sẵn sàng.');
    console.log('\n=== Kết quả (chỉ CSS tĩnh) ===');
    console.log(`PASS: ${pass}`);
    console.log(`FAIL: ${fail}`);
    process.exit(fail > 0 ? 1 : 0);
  }

  let markup;
  try {
    markup = await buildMarkupRenderer();
    ok('bundle pageMarkup', 'esbuild OK');
  } catch (error) {
    bad('bundle pageMarkup', error.message);
    process.exit(1);
  }

  const deck = (dataset.decks || []).find((d) => d.id === DECK_ID);
  const result = testDeckApi(deck);
  if (result?.list) await testDeckRender(result.list, markup);

  console.log('\n=== Kết quả ===');
  console.log(`PASS: ${pass}`);
  console.log(`FAIL: ${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
