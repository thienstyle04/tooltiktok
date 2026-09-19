import useStudioDialog from './useStudioDialog';

export default function ExportImageErrorsModal({ inspection, onAnswer }) {
  const close = () => onAnswer(false);
  const ref = useStudioDialog(Boolean(inspection), close);
  if (!inspection) return null;
  return <div className="modal-overlay">
    <div className="modal-card export-image-errors" ref={ref} role="dialog" aria-modal="true" aria-label="Kiểm tra ảnh trước xuất">
      <div className="modal-head"><h3 className="modal-title">Kiểm tra ảnh trước xuất</h3><button className="modal-close-btn" type="button" onClick={close} aria-label="Đóng">×</button></div>
      <div className="modal-body">
        <p>{inspection.validEntries.length} list · {inspection.validPages} trang đủ ảnh. {inspection.skippedLists.length} list bị chặn.</p>
        <p>List lỗi được giữ nguyên. Cập nhật dữ liệu thủ công để thử tải lại ảnh thiếu.</p>
        {inspection.skippedLists.map(list => <section key={`${list.deckId}/${list.listId}`}>
          <strong>{list.label}</strong>
          {list.errors.map((error, index) => <p key={index} style={{ overflowWrap: 'anywhere' }}>Trang {error.page} · {error.place || ''} · {error.id || ''}: {error.reason}</p>)}
        </section>)}
      </div>
      <div className="modal-foot">
        <button type="button" className="toolbar-button" onClick={close}>Hủy</button>
        {inspection.validEntries.length > 0 && <button type="button" className="toolbar-button primary" onClick={() => onAnswer(true)}>Xuất các list đủ ảnh</button>}
      </div>
    </div>
  </div>;
}
