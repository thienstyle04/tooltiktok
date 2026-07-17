/**
 * Unit test budget-3n2d offline (không cần API): check-in Free + gallery ảnh không trùng/trang.
 * cd backend && node src/modules/guide/tools/test-budget-3n2d-unit.mjs
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const guideDir = join(dirname(fileURLToPath(import.meta.url)), '..');
require('ts-node/register/transpile-only');

const { buildPagesForDeck } = require(join(guideDir, 'logic/deck-builder.ts'));

function mockItem(id, sectionKey, name, price = '', imageUrl = '') {
  return {
    id,
    sectionKey,
    name,
    rawName: name,
    address: `${name} address`,
    price,
    headPrice: '',
    hasHeadPriceColumn: false,
    openHours: '08:00 - 22:00',
    type: sectionKey === 'cafe' ? 'Cafe' : 'Quán',
    imageUrl: imageUrl || `/img/${id}.jpg`,
    imageSource: 'manual',
    candidateImageUrls: imageUrl ? [imageUrl] : [`/img/${id}.jpg`, `/img/${id}-b.jpg`],
    isPartner: false,
  };
}

function buildMockContext() {
  const items = [];
  const push = (sectionKey, prefix, count, priceFn) => {
    for (let i = 1; i <= count; i++) {
      items.push(mockItem(`${sectionKey}-${i}`, sectionKey, `${prefix} ${i}`, priceFn(i), `/assets/${sectionKey}-${i}.jpg`));
    }
  };
  push('quan_an', 'Quán', 12, () => '50,000 đ');
  push('cafe', 'Cafe', 12, () => '40,000 đ');
  for (let i = 1; i <= 8; i++) {
    items.push(mockItem(`check_in-${i}`, 'check_in', `Check ${i}`, i <= 4 ? 'free' : '20,000 đ', `/assets/check-${i}.jpg`));
  }
  push('choi_dem', 'Night', 6, () => '40,000 đ');
  push('hoat_dong', 'Activity', 6, () => '50,000 đ');
  push('dich_vu', 'Service', 6, () => '80,000 đ');
  push('homestay', 'Stay', 4, () => '500,000 đ');

  const itemsBySection = {
    quan_an: [],
    cafe: [],
    homestay: [],
    check_in: [],
    dich_vu: [],
    choi_dem: [],
    hoat_dong: [],
    dia_diem_lich_su: [],
    khu_du_lich: [],
  };
  for (const item of items) {
    itemsBySection[item.sectionKey].push(item);
  }

  return {
    itemsBySection,
    imageUrls: items.map((i) => i.imageUrl),
    imageLibraryEntries: [],
    coverImageUrls: ['/assets/cover.jpg'],
  };
}

function tablePage(pages) {
  return pages.find((p) => p.layoutVariant === 'budget-3n2d-table');
}

function galleryPages(pages) {
  return pages.filter((p) => p.layoutVariant === 'budget-3n2d-gallery');
}

async function main() {
  const ctx = buildMockContext();
  const seeds = ['unit-a', 'unit-b', 'unit-c', 'unit-d', 'unit-e'];
  let failed = 0;

  console.log('=== Unit test budget-3n2d (offline) ===\n');

  for (const seed of seeds) {
    const pages = buildPagesForDeck(
      'budget-3n2d',
      ctx.itemsBySection,
      ctx.imageUrls,
      ctx.imageLibraryEntries,
      seed,
      new Set(),
      new Set(),
      ctx.coverImageUrls,
    );

    const table = tablePage(pages);
    const checkinRows = (table?.items || []).filter((it) => /^check-in:/i.test(String(it.name || '')));
    const badCosts = checkinRows.filter((it) => {
      const cost = String(it.metaSecondary || '').trim();
      return /~?\s*20\s*k/i.test(cost) || /^-/.test(cost);
    });

    const dupes = [];
    for (const page of galleryPages(pages)) {
      const urls = (page.items || []).map((i) => i.imageUrl).filter(Boolean);
      const seen = new Set();
      for (const url of urls) {
        if (seen.has(url)) dupes.push(`${page.chipText}:${url}`);
        seen.add(url);
      }
    }

    const ok = badCosts.length === 0 && dupes.length === 0;
    console.log(`${ok ? '✅' : '❌'} seed=${seed} | check-in sai: ${badCosts.length} | ảnh trùng/trang: ${dupes.length}`);
    if (badCosts.length) {
      badCosts.forEach((it) => console.log(`     ${it.name} → ${it.metaSecondary}`));
      failed += 1;
    }
    if (dupes.length) {
      dupes.forEach((d) => console.log(`     ${d}`));
      failed += 1;
    }
  }

  console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
