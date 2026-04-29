import { countDeckPages } from '../lib/utils';

export default function Sidebar({ dataset, activeDeckId, activeListId, onDeckSelect, onListSelect }) {
  const activeDeck = dataset?.decks?.find((deck) => deck.id === activeDeckId) || null;
  const listCount = dataset?.decks?.reduce((total, deck) => total + deck.lists.length, 0) || 0;

  return (
    <aside className="app-sidebar">
      <div className="brand-block">
        <p className="eyebrow">Dalat carousel</p>
        <h1 className="brand-title">Deck Studio</h1>
        <p className="brand-copy">Chọn mẫu, kiểm tra dữ liệu từng trang và xuất bộ ảnh TikTok từ cùng một màn hình.</p>
      </div>

      <section className="sidebar-section template-nav-section">
        <div className="sidebar-head">
          <span className="sidebar-label">Mẫu</span>
          <span id="deckStats" className="sidebar-count">
            {dataset ? `${dataset.decks.length} mẫu · ${listCount} list` : 'Đang tải'}
          </span>
        </div>
        <div id="deckSwitcher" className="deck-switcher">
          {(dataset?.decks || []).map((deck) => (
            <button
              key={deck.id}
              className={`deck-chip ${deck.id === activeDeckId ? 'active' : ''}`}
              type="button"
              onClick={() => onDeckSelect(deck)}
            >
              <span className="deck-chip-name">{deck.navTitle}</span>
              <span className="deck-chip-meta">{deck.lists.length} list · {countDeckPages(deck)} trang</span>
            </button>
          ))}
        </div>
      </section>

      <section className="sidebar-section list-nav-section">
        <div className="sidebar-head">
          <span className="sidebar-label">List trong mẫu</span>
          <span id="listStats" className="sidebar-count">{activeDeck ? `${activeDeck.lists.length} list` : '0 list'}</span>
        </div>
        <div id="listSwitcher" className="list-switcher">
          {activeDeck?.lists?.length ? activeDeck.lists.map((list) => (
            <button
              key={list.id}
              className={`list-chip ${list.id === activeListId ? 'active' : ''}`}
              type="button"
              onClick={() => onListSelect(list)}
            >
              <span>{list.navTitle || list.title}</span>
              <small>{String(list.pages.length).padStart(2, '0')} trang</small>
            </button>
          )) : <div className="sidebar-empty">Chưa có list.</div>}
        </div>
      </section>
    </aside>
  );
}
