/**
 * Test hashtag Phan Thiết không còn #riviudalat #dalat.
 * node backend/src/modules/guide/tools/test-hashtag-destination.mjs
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const guideDir = join(dirname(fileURLToPath(import.meta.url)), '..');

require('ts-node/register/transpile-only');
const { buildCaptionHashtags, isDalatHashtag } = require(join(guideDir, 'sync/destination-localize.ts'));

const aiHashtags = ['#riviudalat', '#dalat', '#dalatreview', '#lichtrinhdalat', '#traveldalat'];
const result = buildCaptionHashtags(aiHashtags, 'lich_trinh_huu_ich', 'phanthiet');

console.log('Input AI:', aiHashtags.join(' '));
console.log('Output PT:', result.join(' '));

const bad = result.filter((tag) => isDalatHashtag(tag));
if (bad.length) {
  console.error('❌ Còn hashtag Đà Lạt:', bad.join(' '));
  process.exit(1);
}

const expectedCore = ['#riviuphanthiet', '#phanthiet', '#phanthietreview'];
for (const tag of expectedCore) {
  if (!result.includes(tag)) {
    console.error('❌ Thiếu hashtag bắt buộc:', tag);
    process.exit(1);
  }
}

console.log('✅ PASS — hashtag Phan Thiết đúng, không lẫn Đà Lạt');
