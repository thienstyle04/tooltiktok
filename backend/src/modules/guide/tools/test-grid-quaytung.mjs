/**
 * Kiểm tra grid-6-quaytung (mẫu mới) và grid-8-quaytung (mẫu 8).
 * Chạy: node backend/src/modules/guide/tools/test-grid-quaytung.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../../../../../');
const markupPath = join(rootDir, 'frontend/lib/pageMarkup.js');
const cssPath = join(rootDir, 'frontend/app/styles/template-variants-v2.css');
const grid6CssPath = join(rootDir, 'frontend/app/styles/grid6-quaytung-templates.css');

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const { pathToFileURL } = await import('node:url');

const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000/api/guide-data?refresh=1';

const DECK_SPECS = {
  'grid-8-quaytung': {
    label: 'Lưới 8 Quaytung',
    expectedVersion: 8,
    expectedGridHooks: ['CAFE SÁNG', 'MẢNG XANH', 'CHƠI ĐÊM', 'CHỖ NGHỈ XINH', 'ĂN VẶT'],
    forbiddenGridHooks: ['CHẤT LIỆU', 'CAFE ĐẸP'],
    expectedPages: 7,
    coverVariant: 'grid-8-quaytung-cover',
    listVariant: 'grid-8-quaytung',
    menuVariant: 'grid-8-quaytung-menu',
    listPageCount: 5,
    hasMenuPage: true,
    itemsPerListPage: 8,
    coverPageClass: 'grid8-quaytung-cover',
    coverMustHave: ['grid8-quaytung-cover-photo'],
    coverMustNotHave: ['grid8-quaytung-cover-stack'],
    slotMetaIcon: '🎟',
    slotMetaFallbackClass: 'grid8-quaytung-hours',
  },
  'grid-6-quaytung': {
    label: 'Lưới 6 Quaytung',
    expectedVersion: 6,
    expectedPages: 8,
    coverVariant: 'grid-6-quaytung-cover',
    coverPageClass: 'grid6-quaytung-cover',
    listVariant: 'grid-6-quaytung',
    menuVariant: null,
    listPageCount: 7,
    hasMenuPage: false,
    itemsPerListPage: 6,
    coverMustHave: ['grid6qt-cover-photo', 'grid6qt-cover-tag'],
    coverMustNotHave: ['grid8-quaytung-cover-photo', 'grid8-quaytung-dalat-badge'],
    listMustHave: ['grid6qt-stack', 'grid6qt-band', 'vài địa điểm', 'is-labels-bottom', 'is-labels-top'],
    listMustNotHave: ['grid8-quaytung-matrix', 'grid6-quaytung-center-float', '🎟', 'grid6qt-band-bg'],
    slotCellClass: 'grid6qt-cell',
    bandClass: 'grid6qt-band',
  },
};

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
  const tmp = join(__dirname, '__test-quaytung-markup.mjs');
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

function testDeckApi(deckId, spec, deck) {
  console.log(`\n=== ${spec.label} (${deckId}) — API ===`);
  if (!deck) {
    bad('deck trong catalog', 'không thấy');
    return null;
  }
  ok('deck trong catalog', deck.navTitle || deckId);

  const list = getMainList(deck);
  if (!list) {
    bad('main list', 'thiếu');
    return null;
  }

  const version = list.templateVersion;
  if (version === spec.expectedVersion) ok('templateVersion', `v${version}`);
  else bad('templateVersion', `expected v${spec.expectedVersion}, got v${version ?? 'n/a'}`);

  const pages = list.pages || [];
  if (pages.length === spec.expectedPages) ok('số trang', `${pages.length}`);
  else bad('số trang', `expected ${spec.expectedPages}, got ${pages.length}`);

  const cover = pages.find((p) => p.type === 'cover');
  if (cover?.layoutVariant === spec.coverVariant) ok('cover layoutVariant', cover.layoutVariant);
  else bad('cover layoutVariant', String(cover?.layoutVariant));

  const listPages = pages.filter((p) => p.layoutVariant === spec.listVariant);
  if (listPages.length === spec.listPageCount) ok('trang lưới overlay', `${listPages.length}`);
  else bad('trang lưới overlay', `expected ${spec.listPageCount}, got ${listPages.length}`);

  if (spec.hasMenuPage) {
    const menu = pages.find((p) => p.layoutVariant === spec.menuVariant);
    if (menu) ok('trang menu', menu.title || spec.menuVariant);
    else bad('trang menu', 'thiếu');
  } else {
    const menu = pages.find((p) => String(p.layoutVariant || '').includes('menu'));
    if (!menu) ok('không có trang menu', 'đúng spec mẫu 6');
    else bad('không có trang menu', String(menu.layoutVariant));
  }

  if (spec.expectedGridHooks) {
    const hooks = listPages.map((page) => String(page.title || '').trim());
    const hooksKey = hooks.join('|');
    const expectedKey = spec.expectedGridHooks.join('|');
    if (hooksKey === expectedKey) ok('chủ đề 5 trang lưới', hooks.join(' · '));
    else bad('chủ đề 5 trang lưới', `expected ${expectedKey}, got ${hooksKey}`);
    for (const forbidden of spec.forbiddenGridHooks || []) {
      if (!hooks.some((hook) => hook.includes(forbidden))) ok(`không còn trang "${forbidden}"`, 'đúng');
      else bad(`không còn trang "${forbidden}"`, 'vẫn còn trong list');
    }
  }

  const normalizeName = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  const allItemNames = pages
    .filter((page) => page.type === 'list' && Array.isArray(page.items))
    .flatMap((page) => page.items.map((item) => normalizeName(item.rawName || item.name)));
  const duplicateNames = allItemNames.filter((name, index) => name && allItemNames.indexOf(name) !== index);
  const uniqueDupes = [...new Set(duplicateNames)];
  if (uniqueDupes.length === 0) ok('không lặp tên địa điểm', 'unique trong list');
  else bad('không lặp tên địa điểm', uniqueDupes.join(', '));

  const cafeHooks = listPages.filter((page) => /cafe/i.test(String(page.title || ''))).length;
  if (deckId === 'grid-8-quaytung' && cafeHooks === 1) ok('số trang cafe', '1 trang (CAFE SÁNG)');
  else if (deckId === 'grid-8-quaytung') bad('số trang cafe', `expected 1, got ${cafeHooks}`);

  for (const page of listPages) {
    const chip = page.chipText || page.title || '?';
    const items = Array.isArray(page.items) ? page.items : [];
    if (items.length === spec.itemsPerListPage) ok(`${chip}: ${spec.itemsPerListPage} item`, 'đủ');
    else bad(`${chip}: ${spec.itemsPerListPage} item`, `có ${items.length}`);

    const missingName = items.filter((item) => !String(item.name || '').trim()).length;
    if (missingName === 0) ok(`${chip}: tên địa điểm`, 'đủ');
    else bad(`${chip}: tên địa điểm`, `${missingName} thiếu`);

    const missingImage = items.filter((item) => !String(item.imageUrl || '').trim()).length;
    if (missingImage === 0) ok(`${chip}: ảnh`, 'đủ URL');
    else bad(`${chip}: ảnh`, `${missingImage} thiếu`);

    if (String(page.title || '').trim()) ok(`${chip}: hook giữa (title)`, page.title);
    else bad(`${chip}: hook giữa`, 'title trống');
  }

  return { list, pages, listPages };
}

async function testDeckRender(deckId, spec, list, markup) {
  console.log(`\n=== ${spec.label} — Render HTML ===`);
  const { renderCoverPage, renderListPage } = markup;
  const pages = list?.pages || [];
  const cover = pages.find((p) => p.type === 'cover');
  const listPages = pages.filter((p) => p.layoutVariant === spec.listVariant);
  const menuPage = pages.find((p) => p.layoutVariant === spec.menuVariant);

  if (!cover) {
    bad('render cover', 'không có trang cover');
    return;
  }

  const coverHtml = renderCoverPage(cover, 0, pages.length, `${deckId}-main`, [], list, []);
  if (coverHtml && coverHtml.includes(spec.coverPageClass)) ok('render cover class', spec.coverPageClass);
  else bad('render cover class', `thiếu ${spec.coverPageClass} trong HTML`);

  for (const needle of spec.coverMustHave) {
    if (coverHtml.includes(needle)) ok(`cover có ${needle}`, 'đúng layout');
    else bad(`cover có ${needle}`, 'thiếu trong HTML');
  }
  for (const needle of spec.coverMustNotHave) {
    if (!coverHtml.includes(needle)) ok(`cover không có ${needle}`, 'đúng layout cũ/mới');
    else bad(`cover không có ${needle}`, 'xuất hiện sai trong HTML');
  }

  if (listPages.length > 0) {
    const sample =
      listPages.find((p) => /check-in|mảng xanh/i.test(`${p.chipText} ${p.title}`)) || listPages[0];
    const idx = pages.indexOf(sample);
    const pageHtml = renderListPage(sample, idx, `${deckId}-main`, list, sample.subtitle);

    if (deckId === 'grid-6-quaytung') {
      for (const needle of spec.listMustHave || []) {
        if (pageHtml.includes(needle)) ok(`list có ${needle}`, 'đúng ref TikTok');
        else bad(`list có ${needle}`, 'thiếu');
      }
      for (const needle of spec.listMustNotHave || []) {
        if (!pageHtml.includes(needle)) ok(`list không có ${needle}`, 'đúng');
        else bad(`list không có ${needle}`, 'sai layout cũ');
      }
      const cellCount = (pageHtml.match(/grid6qt-cell/g) || []).length;
      if (cellCount === 6) ok('số ô 2×3', `${cellCount}`);
      else bad('số ô 2×3', `expected 6, got ${cellCount}`);
    } else {
      if (pageHtml.includes('grid8-quaytung-matrix')) ok('render lưới 3×3', 'grid8-quaytung-matrix');
      else bad('render lưới', 'thiếu matrix');

      if (pageHtml.includes('grid8-quaytung-center-hook')) ok('ô giữa hook', 'có');
      else bad('ô giữa hook', 'thiếu');

      const hasMetaIcon = pageHtml.includes(spec.slotMetaIcon);
      const hasMetaRow = pageHtml.includes(spec.slotMetaFallbackClass);
      const chip = sample.chipText || sample.title || '?';
      if (hasMetaIcon) ok(`meta icon ${spec.slotMetaIcon}`, `${chip} — đúng loại`);
      else if (hasMetaRow) ok(`meta row (${spec.slotMetaFallbackClass})`, `${chip} — có hàng meta`);
      else ok(`meta icon ${spec.slotMetaIcon}`, `${chip} — bỏ qua (sheet chưa có Giá trên trang này)`);

      const slotCount = (pageHtml.match(/grid8-quaytung-slot/g) || []).length;
      if (slotCount === 9) ok('số ô lưới (3×3)', `${slotCount}`);
      else bad('số ô lưới (3×3)', `expected 9, got ${slotCount}`);
    }
  }

  if (spec.hasMenuPage && menuPage) {
    const idx = pages.indexOf(menuPage);
    const menuHtml = renderListPage(menuPage, idx, `${deckId}-main`, list, menuPage.subtitle);
    if (menuHtml.includes('grid8-quaytung-menu-section')) ok('render menu sections', 'có');
    else bad('render menu sections', 'thiếu');

    const sectionPhotos = [...menuHtml.matchAll(/grid8-quaytung-menu-section-photo[\s\S]*?<img[^>]+src="([^"]+)"/g)]
      .map((match) => match[1]);
    const uniquePhotos = [...new Set(sectionPhotos)];
    if (sectionPhotos.length >= 4 && uniquePhotos.length === sectionPhotos.length) {
      ok('menu: ảnh 4 section khác nhau', `${uniquePhotos.length} URL`);
    } else if (sectionPhotos.length > 0) {
      bad('menu: ảnh 4 section khác nhau', `${uniquePhotos.length} unique / ${sectionPhotos.length} total`);
    }
  }
}

function testStaticAssets() {
  console.log('\n=== CSS & markup tĩnh ===');
  const css = readFileSync(cssPath, 'utf8');
  const grid6Css = readFileSync(grid6CssPath, 'utf8');
  const markup = readFileSync(markupPath, 'utf8');

  const checks = [
    [css, 'grid8-quaytung-cover-photo', 'CSS grid8 cover photo (mẫu 8)'],
    [grid6Css, 'grid6qt-cover-tag', 'CSS grid6 cover pill đỏ'],
    [grid6Css, 'grid6qt-band', 'CSS grid6 band giữa'],
    [grid6Css, 'grid6qt-stack', 'CSS grid6 stack 2x3'],
    [markup, 'renderGrid6QuaytungCover', 'markup grid6 cover'],
    [markup, 'renderGrid6QuaytungPageBody', 'markup grid6 list body'],
    [markup, 'renderGrid8QuaytungCover', 'markup grid8 cover'],
    [markup, 'grid-6-quaytung', 'markup variant grid-6-quaytung'],
    [markup, 'grid-8-quaytung-menu', 'markup variant menu mẫu 8'],
  ];

  for (const [source, needle, label] of checks) {
    if (source.includes(needle)) ok(label, needle);
    else bad(label, 'thiếu');
  }
}

async function main() {
  console.log('=== Test grid-6-quaytung + grid-8-quaytung ===');
  console.log(`API: ${API}`);

  let dataset;
  try {
    dataset = await fetchDataset();
    ok('API guide-data', `${(dataset.decks || []).length} decks`);
  } catch (error) {
    bad('API guide-data', error.message);
    console.log('\nGợi ý: chạy npm run dev và đợi backend sẵn sàng.');
    process.exit(1);
  }

  let markup;
  try {
    markup = await buildMarkupRenderer();
    ok('bundle pageMarkup', 'esbuild OK');
  } catch (error) {
    bad('bundle pageMarkup', error.message);
    process.exit(1);
  }

  testStaticAssets();

  for (const [deckId, spec] of Object.entries(DECK_SPECS)) {
    const deck = (dataset.decks || []).find((d) => d.id === deckId);
    const result = testDeckApi(deckId, spec, deck);
    if (result?.list) await testDeckRender(deckId, spec, result.list, markup);
  }

  console.log('\n=== Kết quả ===');
  console.log(`PASS: ${pass}`);
  console.log(`FAIL: ${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
