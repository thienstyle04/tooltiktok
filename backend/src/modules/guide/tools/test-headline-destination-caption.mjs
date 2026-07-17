/**
 * Regression: caption/title Phan Thiết không bị THIẾT → THÌẾT.
 * node backend/src/modules/guide/tools/test-headline-destination-caption.mjs
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const guideDir = join(dirname(fileURLToPath(import.meta.url)), '..');

require('ts-node/register/transpile-only');
const { sanitizeDeckHeadline } = require(join(guideDir, 'logic/deck-builder.ts'));
const { localizeText } = require(join(guideDir, 'sync/destination-localize.ts'));

const cases = [
  {
    label: 'localize + sanitize cover',
    run: () => sanitizeDeckHeadline(localizeText('LỊCH TRÌNH ĐÀ LẠT 72H SIÊU TIẾT', 'phanthiet')),
    expect: 'LỊCH TRÌNH PHAN THIẾT 72H SIÊU TIẾT',
  },
  {
    label: 'already localized Phan Thiết',
    run: () => sanitizeDeckHeadline('LỊCH TRÌNH PHAN THIẾT 72H SIÊU TIẾT'),
    expect: 'LỊCH TRÌNH PHAN THIẾT 72H SIÊU TIẾT',
  },
  {
    label: 'standalone THI → thì',
    run: () => sanitizeDeckHeadline('ĐI ĐÀ LẠT THÌ LƯU NGAY'),
    expect: 'ĐI ĐÀ LẠT THÌ LƯU NGAY',
  },
  {
    label: 'unaccented PHAN THIET',
    run: () => sanitizeDeckHeadline('LICH TRINH PHAN THIET 72H SIEU TIET'),
    expect: 'LICH TRINH PHAN THIẾT 72H SIEU TIET',
    forbid: ['THÌẾT'],
  },
];

let failed = 0;
for (const testCase of cases) {
  const result = testCase.run();
  const bad = result.includes('THÌẾT') || result.includes('Thìết') || (testCase.forbid || []).some((f) => result.includes(f));
  const ok = !bad && result === testCase.expect;
  console.log(`${ok ? '✅' : '❌'} ${testCase.label}`);
  if (!ok) {
    failed += 1;
    console.log(`   expected: ${testCase.expect}`);
    console.log(`   got:      ${result}`);
  }
}

if (failed) process.exit(1);
console.log('\nOK — headline Phan Thiết không bị corrupt.');
