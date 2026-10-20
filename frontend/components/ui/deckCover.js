// Ảnh đại diện của một mẫu: ảnh preview mẫu riêng, rồi ảnh nền/ảnh địa điểm đầu tiên dùng được.
export function isPortableImageUrl(value) {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) || url.startsWith('/assets/drive-file');
}

export function deckCover(deck) {
  if (deck?.localTemplate?.previewImageUrl) return deck.localTemplate.previewImageUrl;
  const lists = deck?.lists || [];
  let fallback = '';
  for (const list of lists) {
    for (const page of list.pages || []) {
      if (isPortableImageUrl(page.backgroundImage)) return page.backgroundImage;
      if (!fallback && page.backgroundImage) fallback = page.backgroundImage;
      const itemImage = page.items?.find((item) => item.imageUrl)?.imageUrl;
      if (isPortableImageUrl(itemImage)) return itemImage;
      if (!fallback && itemImage) fallback = itemImage;
    }
  }
  return fallback;
}
