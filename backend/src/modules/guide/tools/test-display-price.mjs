/**
 * Kiểm tra displayPrice / metaText ưu tiên gia_dau_nguoi.
 * Chạy: cd backend && node src/modules/guide/tools/test-display-price.mjs
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const guideDir = join(dirname(fileURLToPath(import.meta.url)), '..');
require('ts-node/register/transpile-only');

const { displayPrice, metaText } = require(join(guideDir, 'logic/deck-builder.ts'));

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

const baseItem = {
  id: 'test-1',
  sectionKey: 'cafe',
  name: 'Test Cafe',
  address: '123 Test',
  openHours: '07:00 - 21:00',
  price: '7.000k - 9.000k',
  headPrice: '~200k - 600k',
  phone: '',
  imageUrl: 'https://example.com/a.jpg',
  imageMapped: true,
  imageSource: 'manual',
  candidateImageUrls: [],
  isPartner: false,
};

console.log('=== test displayPrice ===');

if (displayPrice(baseItem) === '~200k - 600k') ok('ưu tiên headPrice', displayPrice(baseItem));
else bad('ưu tiên headPrice', `got ${displayPrice(baseItem)}`);

const priceOnly = { ...baseItem, headPrice: '' };
if (displayPrice(priceOnly) === '7.000k - 9.000k') ok('fallback price khi thiếu headPrice', displayPrice(priceOnly));
else bad('fallback price khi thiếu headPrice', `got ${displayPrice(priceOnly)}`);

const [, secondary] = metaText(baseItem);
if (secondary.includes('Giá: ~200k - 600k') && !secondary.includes('7.000k')) {
  ok('metaText dùng headPrice', secondary);
} else {
  bad('metaText dùng headPrice', secondary);
}

if (secondary.includes('Khung giờ: 07:00 - 21:00')) ok('metaText giữ khung giờ', 'có');
else bad('metaText giữ khung giờ', secondary);

console.log('\n=== Kết quả ===');
console.log(`PASS: ${pass}`);
console.log(`FAIL: ${fail}`);
if (fail > 0) process.exit(1);
