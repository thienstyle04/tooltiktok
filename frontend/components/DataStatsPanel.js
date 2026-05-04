import { countDeckPages, imageSourceClass, listIsMain } from '../lib/utils';

function deckStats(deck) {
  const lists = deck?.lists || [];
  const pages = lists.flatMap((list) => list.pages || []);
  const items = pages.flatMap((page) => Array.isArray(page.items) ? page.items : []);
  const partners = items.filter((item) => item.isPartner).length;
  const mapped = items.filter((item) => item.imageSource === 'manual' || item.imageSource === 'auto' || item.imageMapped).length;
  const fallback = items.filter((item) => imageSourceClass(item) === 'fallback').length;
  const aiLists = lists.filter((list) => !listIsMain(list)).length;

  return {
    aiLists,
    fallback,
    items: items.length,
    lists: lists.length,
    mapped,
    pages: countDeckPages(deck),
    partners,
  };
}

export default function DataStatsPanel({ dataset, activeDeckId, onDeckSelect }) {
  const decks = dataset?.decks || [];
  const total = decks.reduce((acc, deck) => {
    const stats = deckStats(deck);
    return {
      items: acc.items + stats.items,
      lists: acc.lists + stats.lists,
      mapped: acc.mapped + stats.mapped,
      pages: acc.pages + stats.pages,
      partners: acc.partners + stats.partners,
    };
  }, { items: 0, lists: 0, mapped: 0, pages: 0, partners: 0 });

  return (
    <section className="stats-shell">
      <div className="panel-head">
        <div>
          <p className="panel-kicker">Dữ liệu trang</p>
          <h3 className="panel-title">Thống kê theo từng mẫu</h3>
        </div>
        <p className="panel-note">{decks.length} mẫu · {total.lists} list · {total.pages} trang</p>
      </div>

      <div className="stats-body">
        <div className="stats-overview">
          <div><strong>{total.items}</strong><span>Tổng dữ liệu</span></div>
          <div><strong>{total.mapped}</strong><span>Có ảnh</span></div>
          <div><strong>{total.partners}</strong><span>Đối tác</span></div>
          <div><strong>{total.pages}</strong><span>Trang deck</span></div>
        </div>

        <div className="stats-grid">
          {decks.map((deck) => {
            const stats = deckStats(deck);
            const active = deck.id === activeDeckId;
            return (
              <article key={deck.id} className={`stats-card ${active ? 'active' : ''}`}>
                <div className="stats-card-head">
                  <div>
                    <span className="stats-card-kicker">{deck.navTitle}</span>
                    <h4>{deck.title}</h4>
                  </div>
                  <button className="toolbar-button" type="button" onClick={() => onDeckSelect(deck)}>Chọn mẫu</button>
                </div>
                <div className="stats-card-metrics">
                  <span><strong>{stats.lists}</strong> list</span>
                  <span><strong>{stats.aiLists}</strong> AI</span>
                  <span><strong>{stats.pages}</strong> trang</span>
                  <span><strong>{stats.items}</strong> dữ liệu</span>
                  <span><strong>{stats.partners}</strong> đối tác</span>
                  <span><strong>{stats.mapped}</strong> có ảnh</span>
                  <span><strong>{stats.fallback}</strong> minh họa</span>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
