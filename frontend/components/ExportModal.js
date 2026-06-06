import { useState } from 'react';
import { listIsMain } from '../lib/utils';

const EXPORT_QUALITY_OPTIONS = [
  {
    id: 'optimized',
    title: 'Chất lượng cân bằng',
    description: 'Mặc định, khuyên dùng cho 30-50 list. Nét cao hơn (~2.5–3 MB/ảnh) — JPEG 97%, ảnh nguồn tối đa 3000px, render 2.5x.',
  },
  {
    id: 'original',
    title: 'Chất lượng gốc',
    description: 'Xuất final khi đã chốt list. PNG gốc, nét nhất nhưng chậm hơn và ZIP lớn hơn nhiều.',
  },
];

export default function ExportModal({
  open,
  dataset,
  selectedIds,
  setSelectedIds,
  quality,
  setQuality,
  busy,
  onClose,
  onExport,
}) {
  const [deleteAfterExport, setDeleteAfterExport] = useState(true);

  if (!open) return null;
  const decksWithLists = (dataset?.decks || [])
    .map((deck) => ({
      ...deck,
      exportLists: (deck.lists || []).filter((list) => !listIsMain(list)),
    }))
    .filter((deck) => deck.exportLists.length > 0);
  const exportableListIds = new Set(decksWithLists.flatMap((deck) => deck.exportLists.map((list) => list.id)));
  const count = Array.from(selectedIds).filter((id) => exportableListIds.has(id)).length;

  return (
    <div id="exportModal" className="modal-overlay" onClick={(event) => event.target.id === 'exportModal' && onClose()}>
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <p className="panel-kicker">Xuất hàng loạt</p>
            <h3 className="modal-title">Chọn bộ ảnh để xuất ZIP</h3>
          </div>
          <button id="closeExportModalBtn" className="modal-close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p className="modal-description">Chọn các list cần xuất. Mỗi list sẽ là một folder bên trong file ZIP.</p>

          <section className="export-quality-panel">
            <div>
              <p className="panel-kicker">Chất lượng render</p>
              <p className="modal-description compact">Chọn mức xuất phù hợp số lượng list và mục đích dùng ảnh.</p>
            </div>
            <div className="export-quality-options">
              {EXPORT_QUALITY_OPTIONS.map((option) => (
                <label key={option.id} className={`export-quality-option ${quality === option.id ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="exportQuality"
                    value={option.id}
                    checked={quality === option.id}
                    onChange={() => setQuality(option.id)}
                    disabled={busy}
                  />
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <div id="exportDeckList" className="export-deck-list">
            {decksWithLists.map((deck) => {
              const allSelected = deck.exportLists.every((list) => selectedIds.has(list.id));
              return (
                <div key={deck.id} className="export-deck-group" data-deck-id={deck.id}>
                  <div className="export-group-head">
                    <h4 className="export-group-title">{deck.navTitle}</h4>
                    <label className="export-select-all-label">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(event) => setSelectedIds((prev) => {
                          const next = new Set(prev);
                          deck.exportLists.forEach((list) => event.target.checked ? next.add(list.id) : next.delete(list.id));
                          return next;
                        })}
                      />
                      <span>Chọn tất cả</span>
                    </label>
                  </div>
                  <div className="export-group-lists">
                    {deck.exportLists.map((list) => (
                      <label key={list.id} className="export-list-item" data-list-id={list.id}>
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
                          <p className="export-list-title">{list.title}</p>
                          <p className="export-list-meta">AI · {list.pages.length} trang</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
            {decksWithLists.length === 0 ? (
              <p className="modal-description">Chưa có list AI để xuất. Hãy sinh caption/list mới trước khi xuất hàng loạt.</p>
            ) : null}
          </div>
        </div>
        <div className="modal-foot">
          <label className="export-delete-toggle">
            <input
              type="checkbox"
              checked={deleteAfterExport}
              onChange={(event) => setDeleteAfterExport(event.target.checked)}
              disabled={busy}
            />
            <span>Xóa list AI sau khi xuất thành công (giữ workspace gọn)</span>
          </label>
          <button
            id="executeBatchExportBtn"
            className="toolbar-button primary"
            type="button"
            disabled={count === 0 || busy}
            onClick={() => onExport({ deleteAfterExport })}
          >
            {count > 0 ? `Bắt đầu xuất ${count} list đã chọn` : 'Hãy chọn ít nhất 1 list để xuất'}
          </button>
        </div>
      </div>
    </div>
  );
}
