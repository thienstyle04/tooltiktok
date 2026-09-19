import { DeckPage, GuideDeck, PageTextOverrideStore } from '../../../common/interfaces/guide.types';

// Snapshot design only at creation time. Never copy source text or images.
export function inheritPageTypography(deck: GuideDeck, pages: DeckPage[], store: PageTextOverrideStore): DeckPage[] {
  const main = deck.lists.find(list => /-main$/i.test(list.id) || list.id.toLowerCase() === 'main' || list.navTitle?.trim().toLowerCase() === 'list chính');
  if (!main) return pages;
  const overrides = store.decks[deck.id]?.[main.id];
  return pages.map((page, index) => {
    const sameRole = (candidate: DeckPage) => candidate.type === page.type && candidate.layoutVariant === page.layoutVariant;
    const sourceIndex = main.pages[index] && sameRole(main.pages[index]) ? index : main.pages.findIndex(sameRole);
    if (sourceIndex < 0) return page;
    const source = { ...main.pages[sourceIndex], ...overrides?.[String(sourceIndex)] };
    return {
      ...page,
      ...(source.textFontSize !== undefined ? { textFontSize: source.textFontSize } : {}),
      ...(source.textScale !== undefined ? { textScale: source.textScale } : {}),
      ...(source.diaryFontSize !== undefined ? { diaryFontSize: source.diaryFontSize } : {}),
    };
  });
}
