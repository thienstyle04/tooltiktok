import { listIsMain } from '../lib/utils';

export default function DeleteListsModal({ open, dataset, selectedIds, setSelectedIds, busy, onClose, onDelete }) {
  if (!open) return null;
  const groups = (dataset?.decks || [])
    .map((deck) => ({ deck, lists: deck.lists.filter((list) => !listIsMain(list)) }))
    .filter((group) => group.lists.length > 0);
  const count = selectedIds.size;

  return (
    <div id="deleteListsModal" className="modal-overlay" onClick={(event) => event.target.id === 'deleteListsModal' && onClose()}>
      <div className="modal-card delete-modal-card">
        <div className="modal-head">
          <div>
            <p className="panel-kicker">Xóa list AI</p>
            <h3 className="modal-title">Chọn list AI cần xóa</h3>
          </div>
          <button id="closeDeleteListsModalBtn" className="modal-close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p className="modal-description">Có thể chọn list AI ở nhiều mẫu. List chính của các mẫu sẽ được giữ lại.</p>
          <div id="deleteDeckList" className="export-deck-list delete-deck-list">
            {groups.length === 0 ? (
              <div className="delete-empty-state">
                <strong>Không có list AI để xóa</strong>
                <span>Hiện chưa có mẫu nào có list AI. List chính của các mẫu sẽ luôn được giữ lại.</span>
              </div>
            ) : groups.map(({ deck, lists }) => {
              const allSelected = lists.every((list) => selectedIds.has(list.id));
              return (
                <div key={deck.id} className="export-deck-group delete-deck-group" data-deck-id={deck.id}>
                  <div className="export-group-head">
                    <h4 className="export-group-title">{deck.navTitle}</h4>
                    <label className="export-select-all-label">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(event) => setSelectedIds((prev) => {
                          const next = new Set(prev);
                          lists.forEach((list) => event.target.checked ? next.add(list.id) : next.delete(list.id));
                          return next;
                        })}
                      />
                      <span>Chọn tất cả</span>
                    </label>
                  </div>
                  <div className="export-group-lists">
                    {lists.map((list) => (
                      <label key={list.id} className="export-list-item delete-list-item" data-list-id={list.id}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(list.id)}
                          onChange={(event) => setSelectedIds((prev) => {
                            const next = new Set(prev);
                            event.target.checked ? next.add(list.id) : next.delete(list.id);
                            return next;
                          })}
                        />
                        <div className="export-list-info">
                          <p className="export-list-title">{list.navTitle || list.title}</p>
                          <p className="export-list-meta">{list.title} · {list.pages.length} trang</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="modal-foot">
          <button id="executeDeleteSelectedListsBtn" className="toolbar-button danger" type="button" disabled={count === 0 || busy} onClick={onDelete}>
            {count > 0 ? `Xóa ${count} list đã chọn` : 'Chọn list AI để xóa'}
          </button>
        </div>
      </div>
    </div>
  );
}
