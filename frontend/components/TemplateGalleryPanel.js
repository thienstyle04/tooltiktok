import { countDeckPages, listIsMain } from '../lib/utils';

function countDeckItems(deck) {
  return (deck?.lists || []).reduce((total, list) => total + (list.pages || []).reduce((pageTotal, page) => {
    return pageTotal + (Array.isArray(page.items) ? page.items.length : 0);
  }, 0), 0);
}

function countDeckPartners(deck) {
  return (deck?.lists || []).reduce((total, list) => total + (list.pages || []).reduce((pageTotal, page) => {
    return pageTotal + (Array.isArray(page.items) ? page.items.filter((item) => item.isPartner).length : 0);
  }, 0), 0);
}

function isPortableImageUrl(value) {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) || url.startsWith('/assets/drive-file');
}

function deckCover(deck) {
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

export default function TemplateGalleryPanel({
  dataset,
  activeDeckId,
  activeListId,
  onDeckSelect,
  onListSelect,
  onPreviewDeck,
  onCaptionDeck,
}) {
  const decks = dataset?.decks || [];

  return (
    <section className="template-gallery-shell">
      <div className="panel-head">
        <div>
          <p className="panel-kicker">Mẫu deck</p>
          <h3 className="panel-title">Thư viện mẫu đã tạo</h3>
        </div>
        <p className="panel-note">{decks.length} mẫu · {decks.reduce((total, deck) => total + deck.lists.length, 0)} list</p>
      </div>

      <div className="template-gallery-body">
        {decks.map((deck) => {
          const active = deck.id === activeDeckId;
          const cover = deckCover(deck);
          const pageCount = countDeckPages(deck);
          const itemCount = countDeckItems(deck);
          const partnerCount = countDeckPartners(deck);

          return (
            <article key={deck.id} className={`template-card ${active ? 'active' : ''}`}>
              <button className="template-cover-button" type="button" onClick={() => onDeckSelect(deck)}>
                {cover ? <img src={cover} alt="" /> : <span className="template-cover-fallback">{deck.navTitle}</span>}
                <span className="template-cover-label">{deck.navTitle}</span>
              </button>

              <div className="template-card-copy">
                <div>
                  <p className="template-card-kicker">{deck.lists.length} list · {pageCount} trang</p>
                  <h4>{deck.title}</h4>
                  <p>{deck.description}</p>
                </div>
                <div className="template-card-stats">
                  <span><strong>{itemCount}</strong> dữ liệu</span>
                  <span><strong>{partnerCount}</strong> đối tác</span>
                </div>
              </div>

              <div className="template-list-grid">
                {deck.lists.map((list) => (
                  <button
                    key={list.id}
                    className={`template-list-pill ${list.id === activeListId ? 'active' : ''}`}
                    type="button"
                    onClick={() => onListSelect(list)}
                  >
                    <span>{list.navTitle || list.title}</span>
                    <small>{listIsMain(list) ? 'Gốc' : 'AI'} · {list.pages.length} trang</small>
                  </button>
                ))}
              </div>

              <div className="template-card-actions">
                <button className="toolbar-button primary" type="button" onClick={() => onPreviewDeck(deck)}>Preview</button>
                <button className="toolbar-button" type="button" onClick={() => onCaptionDeck(deck)}>Caption AI</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
