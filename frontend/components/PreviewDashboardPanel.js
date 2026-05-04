import PreviewPanel from './PreviewPanel';

export default function PreviewDashboardPanel({
  dataset,
  activeDeck,
  activeList,
  activeDeckId,
  activeListId,
  selectedPageIndex,
  onDeckSelect,
  onListSelect,
  onPageSelect,
  onDeleteList,
  loading,
}) {
  const decks = dataset?.decks || [];
  const lists = activeDeck?.lists || [];

  return (
    <div className="preview-dashboard">
      <section className="preview-selector-panel">
        <div className="panel-head compact">
          <div>
            <p className="panel-kicker">Preview</p>
            <h3 className="panel-title">Chọn mẫu để xem deck</h3>
          </div>
          <p className="panel-note">{activeDeck?.navTitle || 'Đang tải'} · {activeList?.pages?.length || 0} trang</p>
        </div>

        <div className="preview-selector-body">
          <div className="preview-deck-strip">
            {decks.map((deck) => (
              <button
                key={deck.id}
                className={`preview-deck-card ${deck.id === activeDeckId ? 'active' : ''}`}
                type="button"
                onClick={() => onDeckSelect(deck)}
              >
                <span>{deck.navTitle}</span>
                <small>{deck.lists.length} list</small>
              </button>
            ))}
          </div>

          <div className="preview-list-strip">
            {lists.map((list) => (
              <button
                key={list.id}
                className={`preview-list-tab ${list.id === activeListId ? 'active' : ''}`}
                type="button"
                onClick={() => onListSelect(list)}
              >
                <span>{list.navTitle || list.title}</span>
                <small>{list.pages.length} trang</small>
              </button>
            ))}
          </div>
        </div>
      </section>

      <PreviewPanel
        deck={activeDeck}
        list={activeList}
        selectedPageIndex={selectedPageIndex}
        onPageSelect={onPageSelect}
        onDeleteList={onDeleteList}
        loading={loading}
      />
    </div>
  );
}
