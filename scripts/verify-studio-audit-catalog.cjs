const fs = require('node:fs');
const assert = require('node:assert/strict');
const root = 'outputs/studio-audit-runtime';
const results = JSON.parse(fs.readFileSync(root + '/catalog-results.json'));
const evidence = [];
for (const source of ['dalat', 'greenland']) {
  const store = JSON.parse(fs.readFileSync(`${root}/backend/data/generated-caption-lists.${source}.json`));
  for (const result of results.filter(r => r.source === source && r.status === 'PASS')) {
    const list = store.decks[result.deckId].find(l => l.id === result.listId);
    assert.ok(list?.pages.length, result.deckId);
    if (result.deckId === 'spotlight-v6-maps') {
      assert.equal(list.pages.length, 14);
      const places = list.pages.filter((_, i) => i % 2).map(p => p.items[0]);
      assert.equal(places.filter(p => p.isPartner).length, 4);
      assert.equal(places.filter(p => !p.isPartner && p.sourceSectionKey === 'check_in').length, 3);
      assert.equal(new Set(places.map(p => p.sourceKey)).size, 7);
      for (let i = 0; i < 14; i += 2) {
        assert.equal(list.pages[i].items[0].sourceKey, list.pages[i + 1].items[0].sourceKey);
        assert.notEqual(list.pages[i].backgroundImage, list.pages[i + 1].backgroundImage);
      }
    }
    if (result.deckId === 'spotlight-v6-diary') {
      assert.equal(list.pages.length, 12);
      assert.ok(list.pages.slice(0, 3).every(p => p.items.length === 0));
      const places = list.pages.slice(3).map(p => p.items[0]);
      assert.equal(places.filter(p => p.sourceSectionKey === 'quan_an').length, 5);
      assert.equal(places.filter(p => p.sourceSectionKey === 'cafe').length, 4);
      assert.ok(places.every(p => p.isPartner && p.id));
    }
    evidence.push({ source, deckId: result.deckId, listId: list.id, pages: list.pages.length });
  }
}
fs.writeFileSync(`${root}/catalog-structure-verification.json`, JSON.stringify(evidence, null, 2));
console.log(`PASS ${evidence.length} saved generated snapshots; Maps 14 pages/4 partners/3 Check-in/paired owners; Diary 12 pages/5 food/4 cafes`);
