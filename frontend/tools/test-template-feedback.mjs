import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const runtimeDir = path.resolve(root, '..', '.test-runtime');
const bundledMarkup = path.join(runtimeDir, 'template-feedback-page-markup.mjs');
fs.mkdirSync(runtimeDir, { recursive: true });
await esbuild.build({
  entryPoints: [path.join(root, 'lib/pageMarkup.js')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: bundledMarkup,
  logLevel: 'silent',
});
const { renderCoverPage, renderListPage } = await import(`${pathToFileURL(bundledMarkup).href}?v=${Date.now()}`);

const css = [
  fs.readFileSync(path.join(root, 'app/styles/grid-templates.css'), 'utf8'),
  fs.readFileSync(path.join(root, 'app/styles/layout-guards.css'), 'utf8'),
  fs.readFileSync(path.join(root, 'app/styles/template-variants-v2.css'), 'utf8'),
  fs.readFileSync(path.join(root, 'app/styles/tiktok-classic-font.css'), 'utf8'),
].join('\n');
const globalStyles = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8');
const timelineCss = fs.readFileSync(path.join(root, 'app/styles/itinerary-timeline-templates.css'), 'utf8');

const items = Array.from({ length: 8 }, (_, index) => ({
  id: `item-${index}`,
  name: index === 0 ? 'Hoạt động trải nghiệm rất dài cần tự co chữ để không tràn khung' : `Địa điểm ${index + 1}`,
  rawName: index === 0 ? 'Hoạt động trải nghiệm rất dài cần tự co chữ để không tràn khung' : `Địa điểm ${index + 1}`,
  imageUrl: `/image-${index + 1}.jpg`,
  candidateImageUrls: [],
  metaPrimary: `Địa chỉ ${index + 1}`,
  metaSecondary: '',
  sourceSectionKey: index < 4 ? 'check_in' : 'cafe',
}));

function cover(layoutVariant, title, subtitle = '') {
  const page = { type: 'cover', layoutVariant, title, subtitle, backgroundImage: '/cover.jpg', items: [] };
  return renderCoverPage(page, 0, 1, `feedback-${layoutVariant}`, [], { pages: [page] }, []);
}

function content(layoutVariant, title, subtitle = '', chipText = 'Ngày 1', customItems = items) {
  const page = { type: 'content', layoutVariant, chipText, title, subtitle, backgroundImage: '/bg.jpg', items: customItems };
  return renderListPage(page, 1, 2, `feedback-${layoutVariant}`, [], { id: 'feedback-main', pages: [page] });
}

function renderedText(markup) {
  return String(markup)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Spotlight cover must render its hook/title, not only the optional subtitle.
assert.match(renderedText(cover('spotlight', 'HOOK SPOTLIGHT PHẢI HIỆN')), /HOOK SPOTLIGHT PHẢI HIỆN/);

// 4N3Đ day pages keep one Vietnamese day label and omit the duplicated title/description block.
const journeyDay = content('journey-4n3d', 'Vào phố nhẹ nhàng', 'Mô tả cần bỏ', 'Day 01');
assert.match(journeyDay, />Ngày 1</);
assert.doesNotMatch(journeyDay, /journey-title-block/);
assert.doesNotMatch(renderedText(journeyDay), /Vào phố nhẹ nhàng|Mô tả cần bỏ/);
const journeyService = content('journey-4n3d', 'Dịch vụ cần chú ý', '', 'Dịch vụ');
assert.doesNotMatch(journeyService, /journey-title-block/);
assert.doesNotMatch(renderedText(journeyService), /Dịch vụ cần chú ý/);
const journeyStay = content('journey-4n3d', 'Homestay nên lưu', 'Mô tả homestay cần bỏ', 'Homestay');
assert.doesNotMatch(journeyStay, /journey-title-block/);
assert.doesNotMatch(renderedText(journeyStay), /Homestay nên lưu|Mô tả homestay cần bỏ/);

// 3N2Đ day pages show only the clean place name and address.
const itineraryItem = {
  ...items[0],
  name: 'Ăn sáng: Cafe Cô Ba',
  rawName: 'Ăn sáng: Cafe Cô Ba',
  label: '07:30',
  metaPrimary: '105 Hai Bà Trưng',
  metaSecondary: 'Khung giờ: 07:00 - 22:00 · Giá: 50.000 đ',
};
const itineraryDay = content('itinerary', 'Ngày 1', '', 'Ngày 1', [itineraryItem]);
assert.match(renderedText(itineraryDay), /Cafe Cô Ba/);
assert.match(renderedText(itineraryDay), /105 Hai Bà Trưng/);
assert.match(renderedText(itineraryDay), /Khung giờ hoạt động: 07:00 - 22:00/);
assert.ok(renderedText(itineraryDay).indexOf('Khung giờ hoạt động') < renderedText(itineraryDay).indexOf('Cafe Cô Ba'));
assert.ok(renderedText(itineraryDay).indexOf('Cafe Cô Ba') < renderedText(itineraryDay).indexOf('105 Hai Bà Trưng'));
assert.doesNotMatch(itineraryDay, /itinerary-time/);
assert.doesNotMatch(renderedText(itineraryDay), /Ăn sáng:|07:30|50\.000/);

// Long titles/hooks receive deterministic fit classes instead of overflowing.
assert.match(content('journey-4n2d-grid8', items[0].name), /grid8-title-fit-xs/);
assert.match(cover('grid-6', 'Hook rất dài cần tự thu nhỏ để không mất chữ trên ảnh bìa'), /grid6-cover-title-fit-xs/);
assert.match(cover('grid-8-quaytung-cover', 'Hook rất dài cần tự thu nhỏ và xuống dòng cân đối trên ảnh bìa'), /grid8-quaytung-cover-title-fit-xs/);

// 72H 3N2Đ cover balances long hooks into at most three lines and shrinks them deterministically.
const budget72Cover = cover('budget-3n2d', 'Đà Lạt ba ngày hai đêm đi đâu ăn gì để chuyến đi thật trọn vẹn');
assert.match(budget72Cover, /budget72-title-fit-xs/);
assert.ok((budget72Cover.match(/<br>/g) || []).length <= 2);

// Grid 6/Grid 4 check-in photos must crop exactly like cafe photos; no contain/black letterboxing.
const grid6Checkin = content('grid-6', 'ĐỊA ĐIỂM CHECK-IN', '', 'Check-in', items.slice(0, 6));
const grid4Checkin = content('grid-4', 'ĐỊA ĐIỂM CHECK-IN', '', 'Check-in', items.slice(0, 4));
assert.doesNotMatch(grid6Checkin, /is-checkin-fit/);
assert.doesNotMatch(grid4Checkin, /is-checkin-fit/);

// Zigzag check-in uses the same six-row structure as every other content page.
const zigzagCheckin = content('grid-6-zigzag', 'ĐỊA ĐIỂM CHECK-IN', '', 'Check-in');
assert.doesNotMatch(zigzagCheckin, /zigzag-checkin-grid/);
assert.equal((zigzagCheckin.match(/class="zigzag-item/g) || []).length, 6);

// 4N3Đ Stack cards show place name then address; the former day label must not return.
const stackItem = {
  ...items[0],
  name: 'Ăn sáng: Tiệm Mì Meraki',
  rawName: 'Ăn sáng: Tiệm Mì Meraki',
  label: 'Ngày 1',
  metaPrimary: '3 Bis Đống Đa, Phường 3',
};
const stackPage = content('itinerary-4n3d-stack-page', 'ĂN SÁNG', '', 'Ăn sáng', [stackItem]);
const stackText = renderedText(stackPage);
assert.match(stackText, /Tiệm Mì Meraki/);
assert.match(stackText, /3 Bis Đống Đa, Phường 3/);
assert.ok(stackText.indexOf('Tiệm Mì Meraki') < stackText.indexOf('3 Bis Đống Đa, Phường 3'));
assert.doesNotMatch(stackText, /Ngày 1/);
assert.doesNotMatch(stackPage, /itinerary-4n3d-stack-day/);
assert.match(stackPage, /itinerary-4n3d-stack-address/);

// Timeline cover contains only the selected hook; day rows are time/name/address only.
const timelineCover = cover('itinerary-timeline-cover', '3N2Đ ở Đà Lạt thì nên đi đâu?');
assert.match(renderedText(timelineCover), /^3N2Đ ở Đà Lạt thì nên đi đâu\? — ✦ —$/);
assert.doesNotMatch(timelineCover, /itl-cover-serif/);
const emptyTimelineCover = cover('itinerary-timeline-cover', '');
assert.doesNotMatch(emptyTimelineCover, /itl-cover-script|itl-cover-spark|Lịch trình|đi đâu\?/);
const timelineItem = {
  ...items[0],
  label: '08:00',
  name: 'Ăn sáng: Tiệm Mì Meraki',
  rawName: 'Ăn sáng: Tiệm Mì Meraki',
  metaPrimary: '3 Bis Đống Đa, Phường 3',
  metaSecondary: 'Khung giờ: 07:00 - 22:00 · Giá: 60.000 đ',
};
const timelineDay = content('itinerary-timeline-day', 'Ngày 01', '', 'Ngày 01', [timelineItem]);
const timelineText = renderedText(timelineDay);
assert.ok(timelineText.indexOf('08:00') < timelineText.indexOf('Tiệm Mì Meraki'));
assert.ok(timelineText.indexOf('Tiệm Mì Meraki') < timelineText.indexOf('3 Bis Đống Đa, Phường 3'));
assert.doesNotMatch(timelineText, /Ăn sáng:|60\.000|Khung giờ:/);
assert.doesNotMatch(timelineDay, /itl-day-price|itl-day-activity/);

// Decomposed Vietnamese names are normalized before 72H Story rendering.
const decomposedName = 'Cafe Co\u0302 Ba';
const budgetItem = { ...items[0], name: `Ăn sáng: ${decomposedName}`, label: 'Ngày 1|07:30' };
assert.match(content('budget-3n2d-day', 'Ngày đầu vào phố', '', 'Ngày 1', [budgetItem]), /Cafe Cô Ba/);

// Template CSS requirements from user feedback.
assert.match(css, /itinerary-3n2d[^}]*\.itinerary-detail\s*\{[^}]*margin-top:\s*4px/s);
assert.match(css, /itinerary-3n2d[^}]*\.itinerary\.crowded\s*\{[^}]*--story-image-title-size:\s*0\.74rem[^}]*--story-image-meta-size:\s*0\.48rem/s);
assert.match(css, /grid8-feed-cover-cell img\s*\{[^}]*filter:\s*brightness\([^)]*\)\s+saturate\([^)]*\);/s);
assert.doesNotMatch(css, /grid8-feed-cover-cell img\s*\{[^}]*filter:[^;}]*blur\(/s);
assert.doesNotMatch(css, /itinerary-4n3d-stack-cover-grid\s*\{[^}]*filter:[^;}]*blur\(/s);
assert.match(css, /itinerary-4n3d-stack-cover,[\s\S]*?--stack-script:\s*"Be Vietnam Pro",\s*Arial,\s*sans-serif;/);
assert.match(css, /itinerary-4n3d-stack-name[\s\S]*?-webkit-text-stroke:\s*1px\s+#000;/);
assert.match(css, /itinerary-4n3d-stack-address[\s\S]*?-webkit-text-stroke:\s*0\.62px\s+#000;/);
assert.match(css, /Viền 8 hướng[\s\S]*?-1px\s+-1px\s+0\s+#000[\s\S]*?1px\s+1px\s+0\s+#000/);
assert.doesNotMatch(css, /itinerary-4n3d-stack-name\s*\{[^}]*-1\.1px\s+-1\.1px/s);
assert.match(css, /mutant-center-card[^}]*mutant-item-top[^}]*grid4-mutant-overlay\s*\{[^}]*justify-content:\s*flex-end/s);
assert.match(css, /\.budget72-title\s*\{[^}]*font-size:\s*1\.5rem[^}]*line-height:\s*1\.12/s);
assert.match(css, /\.budget72-title\.budget72-title-fit-xs\s*\{[^}]*font-size:\s*1\.08rem/s);
assert.match(css, /\.budget72-story-panel\s*\{[^}]*gap:\s*20px/s);
assert.match(css, /\.budget72-story-timeline\s*\{[^}]*gap:\s*9px/s);
assert.match(css, /\.budget72-story-copy\s*\{[^}]*padding:\s*8px 10px/s);
assert.match(css, /\.budget72-story-copy strong\s*\{[^}]*font-size:\s*0\.58rem[^}]*line-height:\s*1\.18/s);
assert.match(css, /\.budget72-story-copy p,[^}]*\{[^}]*font-size:\s*0\.4rem[^}]*line-height:\s*1\.2/s);
assert.match(css, /\.budget72-total-list\s*\{[^}]*gap:\s*11px/s);
assert.match(css, /\.budget72-total-list strong,[^}]*\{[^}]*font-size:\s*0\.62rem[^}]*line-height:\s*1\.18/s);
assert.match(css, /\.budget72-total-list p\s*\{[^}]*font-size:\s*0\.4rem[^}]*line-height:\s*1\.2/s);
assert.doesNotMatch(css, /grid6-checkin-page[\s\S]{0,180}object-fit:\s*contain/);
assert.match(css, /\.story-page,\s*\n\.story-page \*\s*\{[^}]*font-family:\s*"Be Vietnam Pro",\s*Arial,\s*sans-serif\s*!important;/s);
assert.match(globalStyles, /studio-device-responsive\.css"\);\s*@import url\("\.\/styles\/tiktok-classic-font\.css"\);/s);
assert.doesNotMatch(timelineCss, /fonts\.googleapis\.com/i);

console.log('PASS template feedback regressions');
