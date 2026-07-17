const r = await fetch('http://127.0.0.1:3000/api/guide-data', { cache: 'no-store' });
const d = await r.json();
const deck = d.decks.find((x) => x.id === 'grid-8-quaytung');
const mainList = deck.lists.find((l) => !/-caption-/i.test(l.id));
for (const page of mainList.pages || []) {
  for (const item of page.items || []) {
    if (item.name === "D'Lart Garden") {
      console.log(page.hook || page.title, JSON.stringify({ id: item.id, sectionKey: item.sectionKey, type: item.type, address: item.address }));
    }
  }
}
