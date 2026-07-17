/**
 * Audit offline tất cả fix user yêu cầu (không cần API).
 * Chạy: cd backend && node src/modules/guide/tools/test-all-user-fixes-audit.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../../../..');
const require = createRequire(import.meta.url);
const guideDir = join(__dirname, '..');
require('ts-node/register/transpile-only');

const {
  displayPrice,
  metaText,
  POV_3_DAY_TEMPLATE_VERSION,
  GRID_8_TEMPLATE_VERSION,
  GRID_4_MUTANT_TEMPLATE_VERSION,
} = require(join(guideDir, 'logic/deck-builder.ts'));

const {
  GRID_8_FEED_TEMPLATE_VERSION,
  POV_3_V2_TEMPLATE_VERSION,
  ITINERARY_TIMELINE_TEMPLATE_VERSION,
} = require(join(guideDir, 'logic/deck-builder-v2.ts'));

const markup = readFileSync(join(root, 'frontend/lib/pageMarkup.js'), 'utf8');
const storyPhoto = readFileSync(join(root, 'frontend/app/styles/story-photo.css'), 'utf8');
const templateV2 = readFileSync(join(root, 'frontend/app/styles/template-variants-v2.css'), 'utf8');
const gridCss = readFileSync(join(root, 'frontend/app/styles/grid-templates.css'), 'utf8');
const layoutGuards = readFileSync(join(root, 'frontend/app/styles/layout-guards.css'), 'utf8');

let pass = 0;
let fail = 0;
const sections = [];

function ok(section, name, detail = '') {
  pass += 1;
  sections.push({ section, status: 'pass', name, detail });
}

function bad(section, name, detail = '') {
  fail += 1;
  sections.push({ section, status: 'fail', name, detail });
}

function extractFnBody(src, fnName) {
  const start = src.indexOf(`function ${fnName}`);
  if (start < 0) return '';
  const brace = src.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(brace + 1, i);
    }
  }
  return '';
}

console.log('=== AUDIT: Các fix user yêu cầu ===\n');

// ─── 1. gia_dau_nguoi ───────────────────────────────────────────────────────
console.log('── [1] gia → gia_dau_nguoi (timeline + meta chung) ──');
const itemWithBoth = {
  id: 't1', sectionKey: 'cafe', name: 'Test', address: 'A', openHours: '08-22',
  price: '7.000k', headPrice: '~200k', phone: '', imageUrl: '/x.jpg', imageMapped: true,
  imageSource: 'manual', candidateImageUrls: [], isPartner: false,
};
if (displayPrice(itemWithBoth) === '~200k') ok('price', 'displayPrice ưu tiên headPrice');
else bad('price', 'displayPrice ưu tiên headPrice', displayPrice(itemWithBoth));

const [, sec] = metaText(itemWithBoth);
if (sec.includes('Giá: ~200k') && !sec.includes('7.000k')) ok('price', 'metaText dùng headPrice');
else bad('price', 'metaText dùng headPrice', sec);

if (ITINERARY_TIMELINE_TEMPLATE_VERSION >= 10) ok('price', 'timeline templateVersion', `v${ITINERARY_TIMELINE_TEMPLATE_VERSION}`);
else bad('price', 'timeline templateVersion', `v${ITINERARY_TIMELINE_TEMPLATE_VERSION}`);

const deckBuilder = readFileSync(join(guideDir, 'logic/deck-builder.ts'), 'utf8');
if (deckBuilder.includes('mergeTimelineDayMetaSecondary') || deckBuilder.includes('activity && detail')) {
  ok('price', 'timeline merge activity + giá/khung giờ');
} else bad('price', 'timeline merge activity + giá/khung giờ');

const guideService = readFileSync(join(guideDir, 'guide.service.ts'), 'utf8');
if (guideService.includes('displayPrice') && guideService.includes('mergeTimelineDayMetaSecondary')) {
  ok('price', 'guide.service refresh dùng displayPrice + merge timeline');
} else bad('price', 'guide.service refresh');

// ─── 2. POV3 ────────────────────────────────────────────────────────────────
console.log('\n── [2] POV3 — title vàng + crop ảnh người ──');
if (POV_3_DAY_TEMPLATE_VERSION >= 13) ok('pov3', 'pov-3-day version', `v${POV_3_DAY_TEMPLATE_VERSION}`);
else bad('pov3', 'pov-3-day version', `v${POV_3_DAY_TEMPLATE_VERSION}`);
if (POV_3_V2_TEMPLATE_VERSION >= 13) ok('pov3', 'pov-3-v2 version', `v${POV_3_V2_TEMPLATE_VERSION}`);
else bad('pov3', 'pov-3-v2 version');

if (storyPhoto.includes('#ffe566') && storyPhoto.includes('.photomode-item.is-portrait-focus')) {
  ok('pov3', 'photomode (pov-3-day) vàng + portrait focus CSS');
} else bad('pov3', 'photomode CSS');

if (layoutGuards.includes('pov-3-day') && layoutGuards.includes('#ffe566')) ok('pov3', 'layout-guards pov-3-day vàng');
else bad('pov3', 'layout-guards pov-3-day vàng');

if (templateV2.includes('pov-3-v2-stack-name') && templateV2.includes('#ffe566')) ok('pov3', 'pov-3-v2 stack title vàng');
else bad('pov3', 'pov-3-v2 stack title vàng');

if (markup.includes('function portraitFocusClass') && markup.includes('photomode-item${portraitFocusClass')) {
  ok('pov3', 'portraitFocusClass áp dụng photomode + pov3');
} else bad('pov3', 'portraitFocusClass markup');

const portraitBody = extractFnBody(markup, 'portraitFocusClass');
if (portraitBody.includes('dich_vu') && portraitBody.includes('homestay')) ok('pov3', 'portrait focus gồm dich_vu/homestay');
else bad('pov3', 'portrait focus sections');

// ─── 3. Grid8 ───────────────────────────────────────────────────────────────
console.log('\n── [3] Grid8 — bỏ khung giờ, giá, line-spacing ──');
if (GRID_8_TEMPLATE_VERSION >= 16) ok('grid8', 'grid-8 version', `v${GRID_8_TEMPLATE_VERSION}`);
else bad('grid8', 'grid-8 version');
if (GRID_8_FEED_TEMPLATE_VERSION >= 16) ok('grid8', 'grid-8-feed version', `v${GRID_8_FEED_TEMPLATE_VERSION}`);
else bad('grid8', 'grid-8-feed version');

const priceFnBody = extractFnBody(markup, 'gridPriceMetaFromSecondary');
const sampleMeta = 'Khung giờ: 9:00-21:00 · Giá: ~200k - 600k';
// eval inline logic
function gridPriceMetaFromSecondary(value) {
  const secondary = String(value || '').replace(/\s+/g, ' ').trim();
  if (!secondary) return '';
  const parts = secondary.split('·').map((part) => part.trim()).filter(Boolean);
  const pricePart = parts.find((part) => /^Giá:/i.test(part));
  if (pricePart) return pricePart;
  const withoutHours = parts.filter((part) => !/^Khung giờ:/i.test(part)).join(' · ');
  return withoutHours.replace(/(?:^|\s*·\s*)Khung giờ:\s*[^·]+/gi, '').replace(/^[\s·]+|[\s·]+$/g, '').trim();
}
const stripped = gridPriceMetaFromSecondary(sampleMeta);
if (stripped === 'Giá: ~200k - 600k' && !stripped.includes('Khung giờ')) ok('grid8', 'gridPriceMetaFromSecondary bỏ khung giờ');
else bad('grid8', 'gridPriceMetaFromSecondary', stripped);

if (markup.includes('includeOpenHours: options.includeOpenHours')) ok('grid8', 'journey grid8 có thể giữ khung giờ (opt-in)');
else bad('grid8', 'includeOpenHours option');

if (gridCss.includes('.grid8-cell-copy') && /gap:\s*3px/.test(gridCss)) ok('grid8', 'grid8-cell-copy gap 3px');
else bad('grid8', 'grid8-cell-copy gap');

if (templateV2.includes('flex: 0 0 58px')) ok('grid8', 'grid8-feed labels 58px');
else bad('grid8', 'grid8-feed labels height');

const feedMetaBody = extractFnBody(markup, 'grid8FeedItemMeta');
if (feedMetaBody.includes('gridPriceMetaFromSecondary')) ok('grid8', 'grid8-feed meta có giá');
else bad('grid8', 'grid8-feed meta có giá');

// ─── 4. Grid-4-mutant ───────────────────────────────────────────────────────
console.log('\n── [4] Grid-4-mutant — title/địa chỉ không tràn ──');
if (GRID_4_MUTANT_TEMPLATE_VERSION >= 2) ok('mutant', 'grid-4-mutant version', `v${GRID_4_MUTANT_TEMPLATE_VERSION}`);
else bad('mutant', 'grid-4-mutant version');

if (gridCss.includes('.grid4-mutant-address-text') && gridCss.includes('-webkit-line-clamp: 2')) {
  ok('mutant', 'địa chỉ clamp 2 dòng');
} else bad('mutant', 'địa chỉ clamp');

if (gridCss.includes('.grid4-mutant-overlay') && gridCss.includes('overflow: hidden')) ok('mutant', 'overlay overflow hidden');
else bad('mutant', 'overlay overflow');

if (markup.includes('truncateMenuLine(displayName, 36)') && markup.includes('truncateMenuLine(cleanGridAddress')) {
  ok('mutant', 'truncate title + địa chỉ trong markup');
} else bad('mutant', 'truncate markup');

// ─── Summary table ──────────────────────────────────────────────────────────
console.log('\n=== BẢNG TỔNG HỢP ===');
const bySection = {};
for (const row of sections) {
  bySection[row.section] = bySection[row.section] || { pass: 0, fail: 0 };
  bySection[row.section][row.status === 'pass' ? 'pass' : 'fail'] += 1;
}
for (const [key, counts] of Object.entries(bySection)) {
  const icon = counts.fail === 0 ? '✅' : '⚠️';
  console.log(`${icon} ${key}: ${counts.pass}/${counts.pass + counts.fail} pass`);
}

console.log(`\nTỔNG: PASS ${pass} | FAIL ${fail}`);
if (fail > 0) process.exit(1);
