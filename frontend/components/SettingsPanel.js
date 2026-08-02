import { useState } from 'react';

export default function SettingsPanel({
  activeDestinationId,
  destinations,
  cacheStatus,
  busy,
  refreshing,
  onDestinationChange,
  onAddDestination,
  onRefresh,
}) {
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const activeDestination = destinations.find((entry) => entry.id === activeDestinationId);
  const cacheReady = Boolean(cacheStatus?.ready);
  const cacheTotal = Number(cacheStatus?.total || 0);
  const cacheCompleted = Number(cacheStatus?.completed || 0);
  const cacheFailed = Number(cacheStatus?.failed || 0);

  const formatCount = (count) => (
    typeof count === 'number' && Number.isFinite(count)
      ? `${count} địa điểm`
      : 'Chưa đồng bộ'
  );

  const submitNewSource = async (event) => {
    event.preventDefault();
    setAddError('');
    setAdding(true);
    try {
      await onAddDestination({
        label: newSourceName.trim(),
        sheetUrl: newSourceUrl.trim(),
      });
      setNewSourceName('');
      setNewSourceUrl('');
    } catch (error) {
      setAddError(error?.message || 'Không thể thêm Google Sheet.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <section className="settings-panel" aria-labelledby="settingsTitle">
      <header className="settings-panel-head">
        <div>
          <p className="panel-kicker">Quản trị hệ thống</p>
          <h2 id="settingsTitle" className="section-title">Cài đặt dữ liệu</h2>
          <p className="settings-description">
            Chọn nguồn Google Sheet, kiểm tra ảnh đã lưu và chủ động đồng bộ khi dữ liệu thay đổi.
          </p>
        </div>
        <span className={`settings-health ${cacheReady ? 'is-ready' : 'is-busy'}`}>
          <span aria-hidden="true" />
          {cacheReady ? 'Hệ thống sẵn sàng' : 'Đang đồng bộ'}
        </span>
      </header>

      <div className="settings-grid">
        <article className="settings-card settings-add-source-card">
          <div>
            <p className="panel-kicker">Thêm nguồn mới</p>
            <h3>Kết nối Google Sheet</h3>
            <p className="settings-help">
              Sheet mới sẽ được kiểm tra quyền truy cập, tải dữ liệu và lưu thành nút chuyển nhanh.
            </p>
          </div>
          <form className="settings-source-form" onSubmit={submitNewSource}>
            <label>
              <span>Tên hiển thị</span>
              <input
                type="text"
                value={newSourceName}
                onChange={(event) => setNewSourceName(event.target.value)}
                placeholder="Ví dụ: Nha Trang"
                minLength={2}
                maxLength={60}
                disabled={busy || adding}
                required
              />
            </label>
            <label>
              <span>Link Google Sheet</span>
              <input
                type="url"
                value={newSourceUrl}
                onChange={(event) => setNewSourceUrl(event.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                disabled={busy || adding}
                required
              />
            </label>
            <button
              type="submit"
              className="toolbar-button primary settings-add-button"
              disabled={busy || adding || !newSourceName.trim() || !newSourceUrl.trim()}
            >
              {adding ? 'Đang kiểm tra và tải...' : 'Thêm và sử dụng'}
            </button>
          </form>
          {addError ? <p className="settings-form-error" role="alert">{addError}</p> : null}
          <p className="settings-form-note">
            Google Sheet cần bật quyền “Bất kỳ ai có đường liên kết đều có thể xem”.
          </p>
        </article>

        <article className="settings-card settings-source-card">
          <div className="settings-card-head">
            <div>
              <p className="panel-kicker">Nguồn dữ liệu</p>
              <h3>Google Sheet đang sử dụng</h3>
            </div>
            <span className="settings-active-source">
              {activeDestination?.shortLabel || 'DL'}
            </span>
          </div>

          <div className="settings-destination-list" role="listbox" aria-label="Chọn nguồn Google Sheet">
            {destinations.map((entry) => {
              const active = entry.id === activeDestinationId;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`settings-destination${active ? ' is-active' : ''}`}
                  disabled={busy}
                  onClick={() => onDestinationChange(entry.id)}
                >
                  <span className="settings-destination-badge">{entry.shortLabel || entry.label.slice(0, 2)}</span>
                  <span className="settings-destination-copy">
                    <strong>{entry.label}</strong>
                    <small>{formatCount(entry.totalItems)}</small>
                  </span>
                  <span className="settings-destination-state">{active ? 'Đang dùng' : 'Chuyển'}</span>
                </button>
              );
            })}
          </div>
        </article>

        <article className="settings-card">
          <div className="settings-card-head">
            <div>
              <p className="panel-kicker">Bộ nhớ ảnh</p>
              <h3>Cache Google Drive</h3>
            </div>
            <strong className="settings-cache-percent">{cacheStatus?.percent || 0}%</strong>
          </div>

          <div
            className="settings-cache-progress"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={cacheStatus?.percent || 0}
          >
            <span style={{ width: `${Math.max(0, Math.min(100, cacheStatus?.percent || 0))}%` }} />
          </div>

          <dl className="settings-cache-stats">
            <div>
              <dt>Đã kiểm tra</dt>
              <dd>{cacheTotal ? `${cacheCompleted}/${cacheTotal}` : '—'}</dd>
            </div>
            <div>
              <dt>Ảnh chưa tải được</dt>
              <dd className={cacheFailed ? 'has-warning' : ''}>{cacheFailed}</dd>
            </div>
          </dl>

          <p className="settings-help">
            {cacheFailed
              ? `${cacheFailed} ảnh sẽ dùng ảnh dự phòng; hệ thống vẫn có thể tạo và xuất list.`
              : 'Ảnh đã được lưu trên máy để những lần mở sau nhanh hơn.'}
          </p>
        </article>

        <article className="settings-card settings-sync-card">
          <div>
            <p className="panel-kicker">Đồng bộ thủ công</p>
            <h3>Lấy dữ liệu mới nhất</h3>
            <p className="settings-help">
              Chỉ sử dụng khi Google Sheet hoặc danh sách ảnh vừa được cập nhật. Dữ liệu đã tải trước đó
              sẽ được dùng lại nếu bạn không bấm nút này.
            </p>
          </div>
          <button
            type="button"
            className="toolbar-button primary settings-refresh-button"
            disabled={busy}
            onClick={onRefresh}
          >
            {refreshing ? 'Đang đồng bộ...' : 'Tải lại dữ liệu'}
          </button>
        </article>
      </div>
    </section>
  );
}
