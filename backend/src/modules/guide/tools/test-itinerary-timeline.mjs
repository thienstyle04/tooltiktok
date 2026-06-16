/**
 * Kiểm tra itinerary-timeline (Lịch trình Timeline V2) — ref @rongchoidalattala.
 * Chạy: node backend/src/modules/guide/tools/test-itinerary-timeline.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../../../../../');
const markupPath = join(rootDir, 'frontend/lib/pageMarkup.js');
const cssPath = join(rootDir, 'frontend/app/styles/itinerary-timeline-templates.css');
const globalsPath = join(rootDir, 'frontend/app/globals.css');

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const { pathToFileURL } = await import('node:url');

const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000/api/guide-data?refresh=1';
const DECK_ID = 'itinerary-timeline';
const EXPECTED_VERSION = 8;
const EXPECTED_SLOTS_PER_DAY = 8;
const REF_DAY_TIMES = {
  'Ngày 01': ['05:00', '08:00', '10:00', '12:00', '15:00', '18:00', '20:00', '21:00'],
  'Ngày 02': ['05:00', '09:00', '10:00', '12:00', '15:00', '18:30', '21:00', '22:00'],
  'Ngày 03': ['05:00', '07:00', '08:30', '10:00', '11:00', '12:00', '14:00', '17:00'],
};
const MIN_GAP_MINUTES = 55;

function parseClockMinutes(label) {
  const m = String(label || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
const EXPECTED_PAGES = 4;
const DAY_CHIPS = ['Ngày 01', 'Ngày 02', 'Ngày 03'];
const CLOCK_RE = /^\d{1,2}:\d{2}$/;

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
  const tmp = join(__dirname, '__test-timeline-markup.mjs');
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
  console.log('\n=== [1] CSS & markup tĩnh (spec thiết kế) ===');
  const css = readFileSync(cssPath, 'utf8');
  const globals = readFileSync(globalsPath, 'utf8');
  const markup = readFileSync(markupPath, 'utf8');

  const cssChecks = [
    ['Cormorant Garamond', 'font serif cover'],
    ['Caveat', 'font script cover/ngày'],
    ['Be Vietnam Pro', 'font body'],
    ['itl-cover-serif', 'cover serif class'],
    ['itl-cover-script', 'cover script hero'],
    ['itl-cover-spark', 'cover sparkle divider'],
    ['itl-day-card', 'thẻ kem ngày'],
    ['itl-day-bg', 'nền blur'],
    ['itl-day-track', 'timeline dọc'],
    ['itl-day-dot', 'chấm timeline'],
    ['itl-day-thumb', 'thumb trái'],
    ['itl-day-time', 'giờ bold'],
    ['itl-day-place', 'tên địa điểm accent'],
    ['itl-day-pin', 'icon địa chỉ'],
    ['--itl-accent', 'màu accent terracotta'],
  ];
  for (const [needle, label] of cssChecks) {
    if (css.includes(needle)) ok(`CSS ${label}`, needle);
    else bad(`CSS ${label}`, 'thiếu');
  }

  if (globals.includes('itinerary-timeline-templates.css')) ok('globals import CSS timeline', 'có');
  else bad('globals import CSS timeline', 'thiếu');

  const markupChecks = [
    ['renderItineraryTimelineCover', 'render cover'],
    ['renderItineraryTimelineDay', 'render ngày'],
    ['itinerary-timeline-cover', 'variant cover'],
    ['itinerary-timeline-day', 'variant ngày'],
    ['Lịch trình', 'copy cover dòng 1'],
    ['đi đâu?', 'copy cover dòng 3'],
    ['itl-day-activity', 'activity inline'],
  ];
  for (const [needle, label] of markupChecks) {
    if (markup.includes(needle)) ok(`markup ${label}`, needle);
    else bad(`markup ${label}`, 'thiếu');
  }
}

function testDeckApi(list) {
  console.log('\n=== [2] API — cấu trúc 3 ngày ===');
  const pages = list?.pages || [];
  if (pages.length === EXPECTED_PAGES) ok('tổng 4 trang', 'cover + 3 ngày');
  else bad('tổng 4 trang', `có ${pages.length}`);

  const cover = pages.find((p) => p.type === 'cover');
  if (cover?.layoutVariant === 'itinerary-timeline-cover') ok('cover layoutVariant', cover.layoutVariant);
  else bad('cover layoutVariant', String(cover?.layoutVariant));

  if (/3N2/i.test(String(cover?.title || ''))) ok('cover title 3N2Đ', cover.title);
  else bad('cover title 3N2Đ', String(cover?.title));

  const dayPages = pages.filter((p) => p.layoutVariant === 'itinerary-timeline-day');
  if (dayPages.length === 3) ok('3 trang timeline ngày', `${dayPages.length}`);
  else bad('3 trang timeline ngày', `${dayPages.length}`);

  for (const chip of DAY_CHIPS) {
    const found = dayPages.some((p) => String(p.chipText || p.title || '').includes(chip));
    if (found) ok(`trang ${chip}`, 'có');
    else bad(`trang ${chip}`, 'thiếu');
  }

  const wrongVariants = pages.filter((p) =>
    /grid-8|grid6qt|itinerary-4n3d-stack|journey-4n2d/.test(String(p.layoutVariant || '')),
  );
  if (wrongVariants.length === 0) ok('không lẫn layout mẫu khác', 'đúng');
  else bad('không lẫn layout mẫu khác', wrongVariants.map((p) => p.layoutVariant).join(', '));

  return { pages, dayPages, cover };
}

function testDayItems(dayPages) {
  console.log('\n=== [3] Dữ liệu — giờ + activity + địa điểm ===');
  for (const page of dayPages) {
    const chip = page.chipText || page.title || '?';
    const items = Array.isArray(page.items) ? page.items : [];
    if (items.length === EXPECTED_SLOTS_PER_DAY) ok(`${chip}: số mốc`, `${items.length}`);
    else bad(`${chip}: số mốc`, `expected ${EXPECTED_SLOTS_PER_DAY}, got ${items.length}`);

    const minutes = items.map((item) => parseClockMinutes(item.label)).filter((v) => v != null);
    if (minutes.length === items.length) {
      let minGap = Infinity;
      for (let i = 1; i < minutes.length; i++) minGap = Math.min(minGap, minutes[i] - minutes[i - 1]);
      if (minGap >= MIN_GAP_MINUTES) ok(`${chip}: giãn cách giờ`, `≥${MIN_GAP_MINUTES}p`);
      else bad(`${chip}: giãn cách giờ`, `min gap ${minGap}p`);
    } else {
      bad(`${chip}: giãn cách giờ`, 'label giờ không hợp lệ');
    }

    const refTimes = REF_DAY_TIMES[chip];
    if (refTimes) {
      const labels = items.map((item) => String(item.label || '').trim());
      const matchRef = refTimes.every((t, i) => labels[i] === t);
      if (matchRef) ok(`${chip}: khung giờ ref`, refTimes.join(', '));
      else bad(`${chip}: khung giờ ref`, labels.join(', '));
    }

    const clockLabels = items.filter((item) => CLOCK_RE.test(String(item.label || '').trim()));
    if (clockLabels.length === items.length) ok(`${chip}: label giờ HH:MM`, `${clockLabels.length}/${items.length}`);
    else bad(`${chip}: label giờ HH:MM`, `${clockLabels.length}/${items.length}`);

    const withActivity = items.filter((item) => String(item.metaSecondary || '').trim().length > 0);
    if (withActivity.length === items.length) ok(`${chip}: activity prefix`, 'đủ');
    else bad(`${chip}: activity prefix`, `${withActivity.length}/${items.length}`);

    const withName = items.filter((item) => String(item.name || '').trim().length > 0);
    if (withName.length === items.length) ok(`${chip}: tên địa điểm`, 'đủ');
    else bad(`${chip}: tên địa điểm`, `${withName.length}/${items.length}`);

    const withAddress = items.filter((item) => String(item.metaPrimary || '').trim().length > 0);
    if (withAddress.length === items.length) ok(`${chip}: địa chỉ`, 'đủ');
    else bad(`${chip}: địa chỉ`, `${withAddress.length}/${items.length}`);

    const withImage = items.filter((item) => String(item.imageUrl || '').trim().length > 0);
    if (withImage.length === items.length) ok(`${chip}: ảnh thumb`, 'đủ URL');
    else bad(`${chip}: ảnh thumb`, `${withImage.length}/${items.length}`);
  }
}

function testRender(list, markup) {
  console.log('\n=== [4] Render HTML — bố cục ref ===');
  const { renderCoverPage, renderListPage } = markup;
  const pages = list?.pages || [];
  const cover = pages.find((p) => p.type === 'cover');
  const dayPages = pages.filter((p) => p.layoutVariant === 'itinerary-timeline-day');

  const coverHtml = renderCoverPage(cover, 0, pages.length, `${DECK_ID}-main`, [], list, []);
  const coverMust = [
    'itinerary-timeline-cover',
    'itl-cover-photo',
    'itl-cover-serif',
    'itl-cover-script',
    'itl-cover-spark',
    'Lịch trình',
    'đi đâu?',
    '✦',
  ];
  for (const needle of coverMust) {
    if (coverHtml.includes(needle)) ok(`cover HTML có ${needle}`, 'đúng');
    else bad(`cover HTML có ${needle}`, 'thiếu');
  }
  const coverMustNot = ['grid8-feed', 'grid6qt', 'itinerary-4n3d-stack', 'grid8-quaytung'];
  for (const needle of coverMustNot) {
    if (!coverHtml.includes(needle)) ok(`cover không có ${needle}`, 'đúng');
    else bad(`cover không có ${needle}`, 'lẫn layout');
  }

  for (const page of dayPages) {
    const chip = page.chipText || page.title || '?';
    const idx = pages.indexOf(page);
    const html = renderListPage(page, idx, `${DECK_ID}-main`, list, page.subtitle);
    const must = [
      'itinerary-timeline-day',
      'itl-day-bg',
      'itl-day-card',
      'itl-day-head-title',
      'itl-day-head-spark',
      'itl-day-row',
      'itl-day-thumb',
      'itl-day-track',
      'itl-day-dot',
      'itl-day-time',
      'itl-day-activity',
      'itl-day-place',
      'itl-day-address',
      'itl-day-pin',
      '📍',
    ];
    for (const needle of must) {
      if (html.includes(needle)) ok(`${chip} HTML có ${needle}`, 'đúng');
      else bad(`${chip} HTML có ${needle}`, 'thiếu');
    }
    if (!html.includes('itl-day-note') && !html.includes('Ảnh đã map')) ok(`${chip} không hiện ghi chú ảnh`, 'đúng');
    else bad(`${chip} không hiện ghi chú ảnh`, 'còn note');
    if (html.includes('itl-day-activity">') && html.includes('</span> <strong class="itl-day-place">')) {
      ok(`${chip} có khoảng cách activity–tên`, 'đúng');
    } else if (html.includes('itl-day-place">')) {
      bad(`${chip} có khoảng cách activity–tên`, 'thiếu space');
    }
    const rowCount = (html.match(/class="itl-day-row/g) || []).length;
    const itemCount = (page.items || []).length;
    if (rowCount === itemCount) ok(`${chip} số hàng timeline`, `${rowCount}`);
    else bad(`${chip} số hàng timeline`, `expected ${itemCount}, got ${rowCount}`);
    if (html.includes('--itl-row-h:54px') && html.includes('--itl-thumb:48px') && html.includes('--itl-feed-w:318px')) {
      ok(`${chip} metrics đồng bộ v5`, '54px/48px/318px');
    } else {
      bad(`${chip} metrics đồng bộ v5`, 'thiếu CSS vars');
    }

    const mustNot = ['grid8-feed-matrix', 'itinerary-4n3d-stack-row', 'grid6qt-stack'];
    for (const needle of mustNot) {
      if (!html.includes(needle)) ok(`${chip} không có ${needle}`, 'đúng');
      else bad(`${chip} không có ${needle}`, 'lẫn layout');
    }
  }
}

async function main() {
  console.log('=== Test itinerary-timeline (spec @rongchoidalattala) ===');
  console.log(`API: ${API}`);

  testStaticAssets();

  let dataset;
  try {
    dataset = await fetchDataset();
    ok('API guide-data', `${(dataset.decks || []).length} decks`);
  } catch (error) {
    bad('API guide-data', error.message);
    console.log('\nGợi ý: chạy npm run dev và đợi backend sẵn sàng.');
    process.exit(1);
  }

  const deck = (dataset.decks || []).find((d) => d.id === DECK_ID);
  if (!deck) {
    bad(`${DECK_ID} trong catalog`, 'không thấy');
    process.exit(1);
  }
  ok('deck catalog', deck.navTitle || DECK_ID);

  const list = getMainList(deck);
  if (!list) {
    bad('main list', 'thiếu');
    process.exit(1);
  }

  const version = list.templateVersion;
  if (version === EXPECTED_VERSION) ok('templateVersion', `v${version}`);
  else bad('templateVersion', `expected v${EXPECTED_VERSION}, got v${version ?? 'n/a'}`);

  const { dayPages } = testDeckApi(list);
  testDayItems(dayPages);

  let markup;
  try {
    markup = await buildMarkupRenderer();
    ok('bundle pageMarkup', 'esbuild OK');
  } catch (error) {
    bad('bundle pageMarkup', error.message);
    process.exit(1);
  }
  testRender(list, markup);

  console.log('\n=== Kết quả ===');
  console.log(`PASS: ${pass}`);
  console.log(`FAIL: ${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
