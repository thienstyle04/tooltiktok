import { useEffect, useMemo, useState } from 'react';

function formatCount(count) {
  return typeof count === 'number' && Number.isFinite(count)
    ? `${count} địa điểm`
    : 'Chưa đồng bộ';
}

function getSourceTypeLabel(entry) {
  const sourceType = String(entry?.sourceType || '').trim().toLowerCase();
  if (sourceType === 'xlsx') return 'XLSX cục bộ';
  if (sourceType === 'google-sheet' || sourceType === 'sheet') return 'Google Sheet';
  if (entry?.workbookFileName) return 'XLSX cục bộ';
  if (entry?.sheetUrl) return 'Google Sheet';
  return 'Chưa rõ nguồn';
}

export default function SettingsPanel({
  activeDestinationId,
  destinations,
  cacheStatus,
  busy,
  refreshing,
  onDestinationChange,
  onAddDestination,
  onReplaceDestinationWorkbook,
  onRefreshFromSheet,
}) {
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourceFile, setNewSourceFile] = useState(null);
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const [replaceFile, setReplaceFile] = useState(null);
  const [replaceError, setReplaceError] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [sheetRefreshing, setSheetRefreshing] = useState(false);

  const activeDestination = useMemo(
    () => destinations.find((entry) => entry.id === activeDestinationId) || null,
    [activeDestinationId, destinations],
  );
  const cacheReady = Boolean(cacheStatus?.ready);
  const cacheTotal = Number(cacheStatus?.total || 0);
  const cacheCompleted = Number(cacheStatus?.completed || 0);
  const cacheFailed = Number(cacheStatus?.failed || 0);
  const activeHasSheetFallback = Boolean(activeDestination?.hasSheetFallback ?? activeDestination?.sheetUrl);

  useEffect(() => {
    setReplaceFile(null);
    setReplaceError('');
    setRefreshError('');
  }, [activeDestinationId]);

  const submitNewSource = async (event) => {
    event.preventDefault();
    setAddError('');
    setAdding(true);
    try {
      await onAddDestination({
        label: newSourceName.trim(),
        sheetUrl: newSourceUrl.trim(),
        file: newSourceFile,
      });
      setNewSourceName('');
      setNewSourceUrl('');
      setNewSourceFile(null);
    } catch (error) {
      setAddError(error?.message || 'Không thể thêm nguồn XLSX.');
    } finally {
      setAdding(false);
    }
  };

  const submitReplaceWorkbook = async (event) => {
    event.preventDefault();
    if (!activeDestination?.id || !replaceFile) return;
    setReplaceError('');
    setReplacing(true);
    try {
      await onReplaceDestinationWorkbook(activeDestination.id, replaceFile);
      setReplaceFile(null);
    } catch (error) {
      setReplaceError(error?.message || 'Không thể thay file XLSX.');
    } finally {
      setReplacing(false);
    }
  };

  const refreshFromSheet = async () => {
    if (!activeDestination?.id || !activeHasSheetFallback) return;
    setRefreshError('');
    setSheetRefreshing(true);
    try {
      await onRefreshFromSheet(activeDestination.id);
    } catch (error) {
      setRefreshError(error?.message || 'Không thể tải mới từ Google Sheet.');
    } finally {
      setSheetRefreshing(false);
    }
  };

  return (
    <section className="settings-panel" aria-labelledby="settingsTitle">
      <header className="settings-panel-head">
        <div>
          <p className="panel-kicker">Quản trị hệ thống</p>
          <h2 id="settingsTitle" className="section-title">Cài đặt dữ liệu</h2>
          <p className="settings-description">
            XLSX cục bộ là nguồn chính. Google Sheet chỉ dùng làm link dự phòng để tải mới khi bạn chủ động yêu cầu.
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
            <h3>Nhập workbook XLSX</h3>
            <p className="settings-help">
              Mỗi nguồn mới cần tên hiển thị và file workbook. Link Google Sheet là tùy chọn để dùng làm dự phòng khi cần tải mới.
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
              <span>File XLSX</span>
              <input
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                disabled={busy || adding}
                required
                onChange={(event) => setNewSourceFile(event.target.files?.[0] || null)}
              />
            </label>
            <label>
              <span>Link Google Sheet dự phòng</span>
              <input
                type="url"
                value={newSourceUrl}
                onChange={(event) => setNewSourceUrl(event.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                disabled={busy || adding}
              />
            </label>
            <button
              type="submit"
              className="toolbar-button primary settings-add-button"
              disabled={busy || adding || !newSourceName.trim() || !newSourceFile}
            >
              {adding ? 'Đang kiểm tra workbook...' : 'Thêm và sử dụng'}
            </button>
          </form>
          {addError ? <p className="settings-form-error" role="alert">{addError}</p> : null}
          <p className="settings-form-note">
            Chỉ nhận workbook hợp lệ tối đa 20 MB. Link dự phòng có thể để trống nếu bạn chỉ muốn dùng file cục bộ.
          </p>
        </article>

        <article className="settings-card settings-source-card">
          <div className="settings-card-head">
            <div>
              <p className="panel-kicker">Nguồn dữ liệu</p>
              <h3>Danh sách nguồn đã cấu hình</h3>
            </div>
            <span className="settings-active-source">
              {activeDestination?.shortLabel || 'DL'}
            </span>
          </div>

          <div className="settings-destination-list" role="listbox" aria-label="Chọn nguồn dữ liệu">
            {destinations.map((entry) => {
              const active = entry.id === activeDestinationId;
              const hasFallback = Boolean(entry.hasSheetFallback ?? entry.sheetUrl);
              return (
                <article
                  key={entry.id}
                  className={`settings-destination${active ? ' is-active' : ''}`}
                  data-active={active ? 'true' : 'false'}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className="settings-destination-main"
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

                  <div className="settings-destination-meta">
                    <span className="settings-destination-pill">{getSourceTypeLabel(entry)}</span>
                    <span className="settings-destination-meta-copy">
                      {entry.workbookFileName || 'Chưa có tên workbook'}
                    </span>
                    <span className={`settings-destination-pill ${hasFallback ? 'is-positive' : 'is-muted'}`}>
                      {hasFallback ? 'Có Sheet dự phòng' : 'Không có Sheet dự phòng'}
                    </span>
                  </div>
                </article>
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
            <p className="panel-kicker">Nguồn đang dùng</p>
            <h3>{activeDestination?.label || 'Chưa có nguồn'}</h3>
            <p className="settings-help">
              Thay file XLSX để cập nhật workbook cục bộ. Tải mới từ Google Sheet chỉ khả dụng khi nguồn này có link dự phòng.
            </p>
          </div>

          <div className="settings-sync-actions">
            <form className="settings-replace-form" onSubmit={submitReplaceWorkbook}>
              <label className="settings-file-picker">
                <span>File XLSX mới</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  disabled={busy || replacing || !activeDestination}
                  onChange={(event) => setReplaceFile(event.target.files?.[0] || null)}
                />
              </label>
              <button
                type="submit"
                className="toolbar-button secondary settings-replace-button"
                disabled={busy || replacing || !activeDestination || !replaceFile}
              >
                {replacing ? 'Đang thay file...' : 'Thay file XLSX'}
              </button>
            </form>

            <button
              type="button"
              className="toolbar-button primary settings-refresh-button"
              disabled={busy || sheetRefreshing || !activeDestination || !activeHasSheetFallback}
              onClick={refreshFromSheet}
            >
              {sheetRefreshing || refreshing ? 'Đang tải từ Sheet...' : 'Tải mới từ Google Sheet'}
            </button>

            {!activeHasSheetFallback && activeDestination ? (
              <p className="settings-form-note">
                Nguồn này chưa có link Google Sheet dự phòng nên chỉ có thể cập nhật bằng file XLSX.
              </p>
            ) : null}

            {replaceError ? <p className="settings-form-error" role="alert">{replaceError}</p> : null}
            {refreshError ? <p className="settings-form-error" role="alert">{refreshError}</p> : null}
          </div>
        </article>
      </div>
    </section>
  );
}
