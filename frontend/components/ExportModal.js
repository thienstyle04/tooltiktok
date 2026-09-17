import { useEffect, useState } from 'react';
import useStudioDialog from './useStudioDialog';
import { formatListSetLabel, listIsMain, parseListSetIndex } from '../lib/utils';

const EXPORT_QUALITY_OPTIONS = [
  {
    id: 'optimized',
    title: 'Chất lượng cân bằng',
    description: 'Tự chọn Cân bằng mới hoặc Cân bằng tương thích theo sức máy. Thời gian và dung lượng phụ thuộc ảnh, mẫu và số list.',
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
  runtimePerformance,
  busy,
  onClose,
  onExport,
}) {
  const [deleteAfterExport, setDeleteAfterExport] = useState(true);
  const dialogRef = useStudioDialog(open, onClose);
  const [step, setStep] = useState(0);
  useEffect(() => { if (open) setStep(0); }, [open]);

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
      <div className="modal-card studio-export-wizard" data-step={step} ref={dialogRef} role="dialog" aria-modal="true" aria-label="Xuất file">
        <div className="modal-head">
          <div>
            <p className="panel-kicker">Xuất hàng loạt</p>
            <h3 className="modal-title">{['1 · Chọn list','2 · Chất lượng','3 · Xác nhận xuất'][step]}</h3>
          </div>
          <button id="closeExportModalBtn" type="button" aria-label="Đóng hộp thoại xuất file" className="modal-close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p role="status">{count} list · {decksWithLists.flatMap(deck=>deck.exportLists).filter(list=>selectedIds.has(list.id)).reduce((n,list)=>n+list.pages.length,0)} trang đã chọn</p>
          {step===2 && <p>Chất lượng: {quality==='original'?'Gốc':'Cân bằng'}. Kiểm tra tùy chọn xóa list bên dưới trước khi xuất.</p>}
          <p className="modal-description">
            Chọn các list cần xuất. Folder trong ZIP đặt tên <strong>set1 01 grid6</strong> (set trước, rồi thứ tự mẫu)
            để Windows sắp đúng: set1 mẫu A → set1 mẫu B → set2 mẫu A → set2 mẫu B.
          </p>

          <section className="export-quality-panel">
            <div>
              <p className="panel-kicker">Chất lượng render</p>
              <p className="modal-description compact">Chọn mức xuất phù hợp số lượng list và mục đích dùng ảnh.</p>
              {quality === 'optimized' ? (
                <p className="modal-description compact">
                  {runtimePerformance?.mode === 'legacy'
                    ? `Cân bằng tương thích — tự điều chỉnh theo sức máy. ${runtimePerformance.reason || ''}`
                    : runtimePerformance?.mode === 'modern'
                      ? 'Cân bằng mới — máy đang đáp ứng phép kiểm tra.'
                      : 'Cân bằng sẽ tự kiểm tra sức máy trước lần xuất đầu.'}
                </p>
              ) : null}
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
                    {[...deck.exportLists]
                      .sort((a, b) => parseListSetIndex(a) - parseListSetIndex(b))
                      .map((list) => {
                        const setLabel = formatListSetLabel(parseListSetIndex(list));
                        return (
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
                              <p className="export-list-meta">List đã tạo · {setLabel} · {list.pages.length} trang</p>
                            </div>
                          </label>
                        );
                      })}
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
          {step>0 && <button type="button" className="toolbar-button" disabled={busy} onClick={()=>setStep(step-1)}>Quay lại</button>}
          {step<2 && <button type="button" className="toolbar-button primary" disabled={!count || busy} onClick={()=>setStep(step+1)}>Tiếp tục</button>}
          <label className="export-delete-toggle">
            <input
              type="checkbox"
              checked={deleteAfterExport}
              onChange={(event) => setDeleteAfterExport(event.target.checked)}
              disabled={busy}
            />
            <span>Xóa list đã chọn sau khi xuất thành công</span>
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
