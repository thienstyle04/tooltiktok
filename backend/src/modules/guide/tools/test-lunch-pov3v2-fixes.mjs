/**
 * Regression: lunch pool không lẫn ăn vặt + tagline POV 3 V2 câu đầy đủ.
 * cd backend && node src/modules/guide/tools/test-lunch-pov3v2-fixes.mjs
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const guideDir = join(dirname(fileURLToPath(import.meta.url)), '..');
require('ts-node/register/transpile-only');

const {
  truncatePov3V2StackTagline,
  finalizePov3V2Tagline,
} = require(join(guideDir, 'logic/deck-builder.ts'));

const SNACK_NAME_RE = /kem\s*bơ|kem bo|chạm kem|chè|ăn vặt|snack|waffle|trà sữa/i;

function isSnackName(name) {
  return SNACK_NAME_RE.test(String(name || ''));
}
const API = process.env.GUIDE_API_BASE || 'http://127.0.0.1:3000';

async function main() {
  const dataset = await fetch(`${API}/api/guide-data?refresh=1`).then((r) => {
    if (!r.ok) throw new Error(`guide-data HTTP ${r.status}`);
    return r.json();
  });

  const stackDeck = (dataset.decks || []).find((d) => d.id === 'itinerary-4n3d-stack');
  const povDeck = (dataset.decks || []).find((d) => d.id === 'pov-3-v2');
  if (!stackDeck || !povDeck) throw new Error('Thiếu deck itinerary-4n3d-stack hoặc pov-3-v2');

  const lunchPage = (stackDeck.lists?.[0]?.pages || []).find(
    (p) => p.type === 'list' && String(p.title || '').includes('ĂN TRƯA'),
  );
  if (!lunchPage) throw new Error('Không tìm thấy trang ĂN TRƯA');

  const snackOnLunch = (lunchPage.items || []).filter((item) => isSnackName(item.name));
  console.log('\n=== TRANG ĂN TRƯA (4N3Đ Stack) ===');
  for (const item of lunchPage.items || []) {
    const flag = isSnackName(item.name) ? ' ❌ SNACK' : '';
    console.log(`  ${item.label || ''} | ${item.name}${flag}`);
  }

  const povPages = (povDeck.lists?.[0]?.pages || []).filter((p) => p.layoutVariant === 'pov-3-v2-stack');
  console.log('\n=== POV 3 V2 TAGLINE ===');
  let badTaglines = 0;
  for (const page of povPages) {
    for (const item of page.items || []) {
      const tag = finalizePov3V2Tagline({
        name: item.name,
        sectionKey: item.sourceSectionKey,
        highlight: item.label || item.imageNote || '',
      });
      const badEnd = /\b(khi|và|va|của|cua|cho|với|mà|đà|lối|qua|chủ|duy)\s*[.…]?$/i.test(tag);
      const ok = tag.length >= 18 && !badEnd && /[.!?…]$/.test(tag);
      console.log(`  ${ok ? '✅' : '❌'} ${item.name}: ${tag.slice(0, 90)}`);
      if (!ok) badTaglines += 1;
    }
  }

  const sample = truncatePov3V2StackTagline(
    'Được mệnh danh là "tháp Eiffel của Đà Lạt" và đang "gây bão" giới trẻ khi check-in buổi tối',
  );
  console.log('\n=== TRUNCATE MẪU ===');
  console.log(`  "${sample}"`);
  const truncateOk = !/\bkhi\s*[.…]?$/i.test(sample) && /[.!?…]$/.test(sample);

  const lunchOk = snackOnLunch.length === 0;
  const pass = lunchOk && badTaglines === 0 && truncateOk;
  console.log(`\n${pass ? '✅ PASS' : '❌ FAIL'} — lunch snack:${snackOnLunch.length} badTag:${badTaglines} truncate:${truncateOk ? 'OK' : 'SAI'}`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
