/**
 * Kiểm tra title/cover không còn "Đà Lạt" khi active destination = phanthiet.
 * node backend/src/modules/guide/tools/audit-destination-titles.mjs phanthiet
 */
const API = process.env.GUIDE_API_BASE || 'http://127.0.0.1:3000';
const destinationId = process.argv[2] || 'phanthiet';

const DALAT_MARKERS = [/đà lạt/i, /đÀ lẠT/, /\bdalat\b/i, /SG - ĐL/];

function collectTexts(deck) {
  const texts = [];
  texts.push(deck.title, deck.description);
  for (const list of deck.lists || []) {
    texts.push(list.title, list.description, list.coverTitle, list.postCaption);
    for (const page of list.pages || []) {
      texts.push(page.title, page.subtitle, page.chipText);
      for (const item of page.items || []) {
        texts.push(item.name, item.label);
      }
    }
  }
  return texts.filter(Boolean).map(String);
}

function hasDalatMarker(text) {
  return DALAT_MARKERS.some((re) => re.test(text));
}

async function main() {
  await fetch(`${API}/api/destination`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: destinationId }),
  });

  const dataset = await (await fetch(`${API}/api/guide-data?refresh=1`)).json();
  if (dataset?.source?.destinationId !== destinationId) {
    throw new Error(`Expected destination ${destinationId}, got ${dataset?.source?.destinationId}`);
  }

  console.log(`\n=== AUDIT TITLES: ${dataset.source.destinationLabel} ===\n`);
  let issues = 0;

  for (const deck of dataset.decks || []) {
    const hits = [];
    for (const text of collectTexts(deck)) {
      if (hasDalatMarker(text) && !/@\w*dalat\w*/i.test(text)) {
        hits.push(text.slice(0, 80));
      }
    }
    if (hits.length) {
      issues += 1;
      console.log(`❌ ${deck.navTitle || deck.id}`);
      hits.slice(0, 4).forEach((h) => console.log(`   - ${h}`));
    } else {
      console.log(`✅ ${deck.navTitle || deck.id}`);
    }
  }

  console.log(`\nTổng: ${issues} mẫu còn chữ Đà Lạt / dalat`);
  process.exit(issues ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
