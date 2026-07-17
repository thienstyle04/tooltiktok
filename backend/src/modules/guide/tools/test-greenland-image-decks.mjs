/**
 * Kiểm tra 7 mẫu Green Land hay bị lỗi ảnh trắng/xám.
 * Chạy: node backend/src/modules/guide/tools/test-greenland-image-decks.mjs
 */
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000/api/guide-data?refresh=1';
const ASSET = process.env.TEST_ASSET_URL || 'http://127.0.0.1:3000';

const DECK_IDS = [
  'pov-3-day',
  'itinerary-4n3d',
  'itinerary-4n2d-grid8',
  'grid-8',
  'grid-4',
  'budget-3n2d',
  'itinerary-3n2d',
];

async function probeDriveProxy(url) {
  if (!url || !url.includes('/assets/drive-file')) return { ok: true, skipped: true };
  const response = await fetch(`${ASSET}${url}`, { redirect: 'follow' });
  const fallback = response.headers.get('x-drive-image-fallback') === '1';
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  return {
    ok: response.ok && !fallback && !type.includes('svg'),
    status: response.status,
    fallback,
    type,
  };
}

function listPages(deck) {
  const list = (deck.lists || []).find((entry) => /-main$/.test(entry.id)) || deck.lists?.[0];
  return list?.pages || [];
}

function imagePages(pages) {
  return pages.filter((page) => {
    if (page.layoutVariant === 'budget-3n2d-table') return false;
    return true;
  });
}

const dataset = await fetch(API).then((response) => {
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
});

let failures = 0;
let warnings = 0;

for (const deckId of DECK_IDS) {
  const deck = dataset.decks.find((entry) => entry.id === deckId);
  if (!deck) {
    console.log(`FAIL ${deckId}: deck not found`);
    failures += 1;
    continue;
  }

  const pages = imagePages(listPages(deck));
  let missingUrl = 0;
  let driveFallback = 0;
  let checked = 0;

  for (const page of pages) {
    for (const item of page.items || []) {
      if (!String(item.imageUrl || '').trim()) {
        missingUrl += 1;
        continue;
      }
      checked += 1;
      const probe = await probeDriveProxy(item.imageUrl);
      if (!probe.skipped && !probe.ok) driveFallback += 1;
    }
  }

  const status = missingUrl === 0 && driveFallback === 0 ? 'PASS' : 'WARN';
  if (status === 'WARN') warnings += 1;
  console.log(`${status} ${deckId}: checked=${checked} missingUrl=${missingUrl} driveFallback=${driveFallback}`);
}

if (warnings > 0) {
  console.log(`\n${warnings}/${DECK_IDS.length} decks still have image issues.`);
  process.exit(1);
}

console.log(`\nAll ${DECK_IDS.length} decks passed image checks.`);
