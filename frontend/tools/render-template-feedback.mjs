import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(root, '..');
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const { chromium } = require('playwright');
const runtimeDir = path.join(repoRoot, '.test-runtime');
const bundledMarkup = path.join(runtimeDir, 'template-feedback-visual-markup.mjs');
const outputPath = path.join(runtimeDir, 'template-feedback-visual.png');

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
const cssFiles = [
  'app/styles/story-base.css',
  'app/styles/grid-templates.css',
  'app/styles/layout-guards.css',
  'app/styles/template-variants-v2.css',
  'app/styles/tiktok-classic-font.css',
];
const css = cssFiles.map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');

function imageData(label, hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 58% 48%)"/><stop offset="1" stop-color="hsl(${(hue + 80) % 360} 52% 24%)"/></linearGradient></defs><rect width="600" height="900" fill="url(#g)"/><circle cx="300" cy="300" r="150" fill="rgba(255,255,255,.22)"/><text x="300" y="470" text-anchor="middle" font-family="Arial" font-size="54" font-weight="700" fill="white">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const items = Array.from({ length: 8 }, (_, index) => ({
  id: `visual-${index}`,
  name: index % 2 ? `Địa điểm có tên dài ${index + 1}` : `Quán số ${index + 1}`,
  rawName: index % 2 ? `Địa điểm có tên dài ${index + 1}` : `Quán số ${index + 1}`,
  imageUrl: imageData(`ẢNH ${index + 1}`, 28 + index * 39),
  candidateImageUrls: [],
  metaPrimary: `${index + 1} Đường Hoa, Đà Lạt`,
  metaSecondary: '',
  sourceSectionKey: 'check_in',
}));

function cover(layoutVariant, title) {
  const page = { type: 'cover', layoutVariant, title, subtitle: '', backgroundImage: imageData('COVER', 155), items: [] };
  return renderCoverPage(page, 0, 1, `visual-${layoutVariant}`, [], { pages: [page] }, []);
}

function content(layoutVariant, title, count) {
  const pageItems = items.slice(0, count);
  const page = { type: 'content', layoutVariant, chipText: 'Check-in', title, subtitle: '', backgroundImage: imageData('BG', 190), items: pageItems };
  return renderListPage(page, 1, 2, `visual-${layoutVariant}`, [], { id: 'visual-main', pages: [page] });
}

const budgetItems = items.map((item, index) => ({
  ...item,
  label: `Ngày 1|${String(7 + index).padStart(2, '0')}:30`,
  name: `Ăn sáng: Địa điểm tiếng Việt số ${index + 1}`,
}));
const budgetPage = { type: 'content', layoutVariant: 'budget-3n2d-day', chipText: 'Ngày 1', title: 'Ngày đầu vào phố', subtitle: 'Một lịch trình dễ đọc và không cắt dấu tiếng Việt.', backgroundImage: imageData('STORY', 205), items: budgetItems };
const budgetStory = renderListPage(budgetPage, 1, 2, 'visual-budget-story', [], { id: 'visual-main', pages: [budgetPage] });
const totalItems = Array.from({ length: 4 }, (_, index) => ({
  id: `cost-${index}`,
  name: `Khoản chi phí số ${index + 1}`,
  metaPrimary: 'Mô tả tiếng Việt phải còn nguyên dấu và không bị cắt.',
  metaSecondary: `${index + 1}00.000 đ`,
}));
totalItems.push({ id: 'total', name: 'Tổng', metaPrimary: '', metaSecondary: '2.800.000 đ' });
const totalPage = { type: 'content', layoutVariant: 'budget-3n2d-total', chipText: 'Chi phí', title: 'Tổng chi phí dự kiến', subtitle: 'Các khoản chính cho chuyến đi.', backgroundImage: imageData('TOTAL', 70), items: totalItems };
const budgetTotal = renderListPage(totalPage, 4, 5, 'visual-budget-total', [], { id: 'visual-main', pages: [totalPage] });

const panels = [
  ['72H 3N2Đ · cover', cover('budget-3n2d', 'Đà Lạt ba ngày hai đêm đi đâu ăn gì để chuyến đi thật trọn vẹn')],
  ['72H Story · trang ngày', budgetStory],
  ['Lưới 6 Ô · Check-in', content('grid-6', 'ĐỊA ĐIỂM CHECK-IN', 6)],
  ['Lưới 4 Ô · Check-in', content('grid-4', 'ĐỊA ĐIỂM CHECK-IN', 4)],
  ['72H Story · tổng chi phí', budgetTotal],
];

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}\nbody{margin:0;background:#171a18;color:#fff;font-family:Arial,sans-serif}.qa{display:grid;grid-template-columns:repeat(2,397px);gap:38px;padding:32px}.qa-panel{display:grid;gap:10px}.qa-label{font-size:16px;font-weight:700}.story-page{transform:none!important}</style></head><body><main class="qa">${panels.map(([label, markup]) => `<section class="qa-panel"><div class="qa-label">${label}</div>${markup}</section>`).join('')}</main></body></html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 1260 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: outputPath, fullPage: true });
await browser.close();
console.log(outputPath);
