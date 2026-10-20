// Nhóm mẫu cho bộ lọc chip (thư viện mẫu Classic và màn Tạo V2).
export const DECK_GROUPS = ['Spotlight', 'Note', 'Lịch trình', 'Lưới'];

export function deckInGroup(deck, group) {
  if (!group) return true;
  if (group === 'Spotlight') return deck.id.includes('spotlight');
  if (group === 'Note') return deck.id.includes('note') || deck.id === 'threads-toplist-dalat';
  if (group === 'Lưới') return deck.id.includes('grid');
  return deck.id.includes('itinerary') || deck.id.includes('budget');
}

// Mẫu tạo được list mới trên nguồn đang mở.
export function creatableDecks(dataset) {
  return (dataset?.decks || []).filter(deck => !deck.creationDisabled && deck.id !== 'spotlight-partner');
}
