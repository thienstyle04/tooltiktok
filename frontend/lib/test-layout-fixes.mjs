/**
 * Kiểm tra layout fixes: grid8 bỏ khung giờ, portrait focus, grid4 truncate.
 * Chạy: node frontend/lib/test-layout-fixes.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');
const markupPath = join(root, 'frontend/lib/pageMarkup.js');
const cssPaths = [
  join(root, 'frontend/app/styles/story-photo.css'),
  join(root, 'frontend/app/styles/template-variants-v2.css'),
  join(root, 'frontend/app/styles/grid-templates.css'),
  join(root, 'frontend/app/styles/layout-guards.css'),
];

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const { pathToFileURL } = await import('node:url');

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

console.log('=== [1] CSS static checks ===');
for (const cssPath of cssPaths) {
  const css = readFileSync(cssPath, 'utf8');
  const label = cssPath.split(/[/\\]/).pop();
  if (css.includes('.photomode-item.is-portrait-focus')) ok(`${label}: photomode portrait focus`, 'có');
  else if (label === 'story-photo.css') bad(`${label}: photomode portrait focus`, 'thiếu');
  if (css.includes('#ffe566')) ok(`${label}: màu vàng title`, 'có');
  if (label === 'grid-templates.css') {
    if (css.includes('gap: 3px') && css.includes('.grid8-cell-copy')) ok('grid8-cell-copy gap', '3px');
    else bad('grid8-cell-copy gap', 'thiếu');
    if (css.includes('.grid4-mutant-address-text') && css.includes('-webkit-line-clamp: 2')) {
      ok('grid4-mutant address clamp', '2 dòng');
    } else bad('grid4-mutant address clamp', 'thiếu');
  }
  if (label === 'template-variants-v2.css') {
    if (css.includes('flex: 0 0 58px')) ok('grid8-feed labels height', '58px');
    else bad('grid8-feed labels height', 'thiếu');
  }
}

console.log('\n=== [2] pageMarkup helpers ===');
const tmp = join(__dirname, '__test-layout-markup.mjs');
await esbuild.build({
  entryPoints: [markupPath],
  outfile: tmp,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});

const markupSrc = readFileSync(markupPath, 'utf8');
if (markupSrc.includes('function gridPriceMetaFromSecondary')) ok('gridPriceMetaFromSecondary', 'có');
else bad('gridPriceMetaFromSecondary', 'thiếu');

if (markupSrc.includes('function portraitFocusClass')) ok('portraitFocusClass', 'có');
else bad('portraitFocusClass', 'thiếu');

if (markupSrc.includes('is-portrait-focus')) ok('portrait class trong photomode', 'có');
else bad('portrait class trong photomode', 'thiếu');

if (markupSrc.includes('includeOpenHours: options.includeOpenHours')) ok('grid8 secondary mode', 'có');
else bad('grid8 secondary mode', 'thiếu');

console.log('\n=== Kết quả ===');
console.log(`PASS: ${pass}`);
console.log(`FAIL: ${fail}`);
if (fail > 0) process.exit(1);
