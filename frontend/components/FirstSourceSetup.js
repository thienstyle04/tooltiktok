'use client';
// Máy mới chưa có nguồn dữ liệu: tool không kèm link Sheet nào, người dùng tự thêm.
import AddSourceForm from './AddSourceForm';

export default function FirstSourceSetup({ destinations = [], busy = false, onAddDestination, onSyncDestination }) {
  return (
    <div className="cache-warm-overlay first-source-overlay" role="dialog" aria-modal="true" aria-labelledby="firstSourceTitle">
      <section className="cache-warm-dialog first-source-dialog">
        <p className="panel-kicker">Bắt đầu</p>
        <h2 id="firstSourceTitle">Thêm nguồn dữ liệu đầu tiên</h2>
        <p className="cache-warm-message">
          Máy này chưa có nguồn dữ liệu. Dán link Google Sheet của bạn, chọn loại nguồn và cho biết nội dung có phải về Đà Lạt không.
        </p>
        {destinations.length ? (
          <div className="first-source-pending">
            <p className="settings-help">Nguồn đã thêm nhưng chưa tải dữ liệu:</p>
            {destinations.map((entry) => (
              <div key={entry.id} className="first-source-pending-row">
                <strong>{entry.label}</strong>
                <button
                  type="button"
                  className="toolbar-button"
                  disabled={busy || !(entry.hasSheetFallback ?? entry.sheetUrl)}
                  onClick={() => onSyncDestination(entry.id)}
                >
                  Tải dữ liệu &amp; dùng
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <AddSourceForm busy={busy} onSubmit={onAddDestination} submitLabel="Thêm và tải dữ liệu" />
      </section>
    </div>
  );
}
