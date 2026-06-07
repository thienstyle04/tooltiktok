// Kiểm tra backgroundImage của deck grid-6-zigzag trong API
async function main() {
  const res = await fetch('http://127.0.0.1:3000/api/guide-data');
  const data = await res.json();
  const deck = data.decks.find((d) => d.id === 'grid-6-zigzag');
  if (!deck) {
    console.log('KHÔNG tìm thấy deck grid-6-zigzag trong API!');
    console.log('Các deck hiện có:', data.decks.map((d) => d.id).join(', '));
    return;
  }
  console.log('Deck:', deck.id, '| số list:', deck.lists.length);
  for (const list of deck.lists) {
    console.log(`\nList: ${list.id} (${list.navTitle}) — ${list.pages.length} trang`);
    list.pages.forEach((page, i) => {
      const bg = page.backgroundImage || '(rỗng)';
      const bgShort = bg.length > 60 ? bg.slice(0, 60) + '...' : bg;
      console.log(`  [${i}] type=${page.type} variant=${page.layoutVariant} bg=${bgShort}`);
    });
  }
}

main().catch((e) => console.error('Lỗi:', e.message));
