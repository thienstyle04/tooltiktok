const fs = require('fs');
const raw = fs.readFileSync(
  'C:/Users/thien/Downloads/itinerary-3n2d-itinerary-3n2d-caption-18-png/itinerary-3n2d-itinerary-3n2d-caption-18/deck.json',
  'utf-8'
);
const data = JSON.parse(raw);
const pages = data.list.pages;

// Collect all page items
const allItems = [];
for (let pi = 0; pi < pages.length; pi++) {
  const page = pages[pi];
  if (page.type === 'list' && page.items) {
    for (const item of page.items) {
      allItems.push({ page: pi+1, pageTitle: page.title || page.chipText, name: item.name, imageUrl: item.imageUrl, imageSource: item.imageSource });
    }
  }
}

// Group by imageUrl to find duplicates
const byUrl = {};
for (const item of allItems) {
  if (!item.imageUrl) continue;
  if (!byUrl[item.imageUrl]) byUrl[item.imageUrl] = [];
  byUrl[item.imageUrl].push(item);
}

console.log('=== DUPLICATE IMAGE URLs ===');
let hasDups = false;
for (const [url, items] of Object.entries(byUrl)) {
  if (items.length > 1) {
    hasDups = true;
    const short = decodeURIComponent(url).replace('/assets/library?root=main&path=','[main]').replace('/assets/library?root=','[lib]');
    console.log('\nURL:', short);
    for (const it of items) {
      console.log(`  page${it.page} "${it.pageTitle}" | ${it.name} (${it.imageSource})`);
    }
  }
}
if (!hasDups) console.log('No duplicates found in deck.json!');

console.log('\n=== ALL ITEMS ===');
for (const item of allItems) {
  const short = decodeURIComponent(item.imageUrl || '').replace('/assets/library?root=main&path=','[main]').replace('/assets/library?root=','[lib]');
  console.log(`  p${item.page} [${item.imageSource}] ${item.name} -> ${short}`);
}
