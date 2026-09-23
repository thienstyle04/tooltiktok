import { useEffect, useMemo, useState } from 'react';
import { syncStatusLabel } from '../lib/syncStatusLabel.mjs';

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

function getHookSourceTypeLabel(type) {
  if (type === 'google-doc') return 'Google Docs';
  if (type === 'docx') return 'File DOCX';
  if (type === 'txt') return 'File TXT';
  return 'Nguồn Hook';
}

function formatHookDate(value) {
  if (!value) return 'Chưa tải';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Chưa tải' : date.toLocaleString('vi-VN');
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
  hookSourcesInfo,
  hookSourcesBusy,
  onCreateHookSource,
  onUpdateHookSource,
  onRefreshHookSource,
  onDeleteHookSource,
  onChangeHookMode,
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
  const [nightSync, setNightSync] = useState(null);
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        const response = await fetch('/api/night-sync/status', { cache: 'no-store' });
        if (response.ok) { const data = await response.json(); if (!disposed) setNightSync(data); }
      } catch { /* keep last known status */ }
    };
    void refresh(); const timer = setInterval(refresh, 5000);
    return () => { disposed = true; clearInterval(timer); };
  }, []);
  const [newHookName, setNewHookName] = useState('');
  const [newHookUrl, setNewHookUrl] = useState('');
  const [newHookFile, setNewHookFile] = useState(null);
  const [hookError, setHookError] = useState('');
  const [replacementFiles, setReplacementFiles] = useState({});

  const activeDestination = useMemo(
    () => destinations.find((entry) => entry.id === activeDestinationId) || null,
    [activeDestinationId, destinations],
  );
  const cacheReady = Boolean(cacheStatus?.ready);
  const cacheTotal = Number(cacheStatus?.total || 0);
  const cacheCompleted = Number(cacheStatus?.completed || 0);
  const cacheFailed = Number(cacheStatus?.failed || 0);
  const inventory = cacheStatus?.localInventory;
  const inventoryPercent = inventory?.total > 0 ? Math.round(inventory.cached / inventory.total * 100) : null;
  const activeHasSheetFallback = Boolean(activeDestination?.hasSheetFallback ?? activeDestination?.sheetUrl);
  const activeSheetUrl = String(activeDestination?.sheetUrl || '').trim();
  const hookAvailable = activeDestinationId === 'dalat';
  const hookSources = Array.isArray(hookSourcesInfo?.sources) ? hookSourcesInfo.sources : [];
  const hookMode = hookAvailable ? (hookSourcesInfo?.mode || 'normal') : 'normal';
  const hasExactlyOneNewHookInput = Boolean(newHookUrl.trim()) !== Boolean(newHookFile);

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

  const submitNewHookSource = async (event) => {
    event.preventDefault();
    setHookError('');
    try {
      await onCreateHookSource({
        name: newHookName.trim(),
        docUrl: newHookUrl.trim(),
        file: newHookFile,
      });
      setNewHookName('');
      setNewHookUrl('');
      setNewHookFile(null);
    } catch (error) {
      setHookError(error?.message || 'Không thể thêm nguồn Hook lễ.');
    }
  };

  const runHookAction = async (action) => {
    setHookError('');
    try {
      await action();
    } catch (error) {
      setHookError(error?.message || 'Không thể cập nhật nguồn Hook.');
    }
  };

  const replaceHookFile = async (source) => {
    const file = replacementFiles[source.id];
    if (!file) return;
    await runHookAction(async () => {
      await onUpdateHookSource(source.id, { file });
      setReplacementFiles((previous) => ({ ...previous, [source.id]: null }));
    });
  };

  return (
    <section className="settings-panel" aria-labelledby="settingsTitle">
      <header className="settings-panel-head">
        <div>
          <p className="panel-kicker">Quản trị hệ thống</p>
          <h2 id="settingsTitle" className="section-title">Cài đặt dữ liệu</h2>
          <p className="settings-description">
            Ưu tiên Google Sheet mới cập nhật thành công. Tự động cập nhật 23:00–06:00 giờ Việt Nam; bạn có thể cập nhật thủ công bất kỳ lúc nào.
          </p>
        </div>
        <span className={`settings-health ${cacheReady ? 'is-ready' : 'is-busy'}`}>
          <span aria-hidden="true" />
          {cacheReady ? 'Hệ thống sẵn sàng' : 'Đang đồng bộ'}
        </span>
      </header>

      <div className="settings-grid">
        <article className="settings-card settings-night-sync-card">
          <h3>Đồng bộ dữ liệu</h3>
          <p>Các nguồn được cập nhật lần lượt. Tạo và xuất list sử dụng cache cục bộ; đồng bộ chờ khi có tác vụ đang chạy.</p>
          {nightSync ? <>
            <p>{nightSync.running ? `Đang xử lý: ${nightSync.sources?.find(s => s.id === nightSync.running)?.label || nightSync.running}` : nightSync.allowed ? 'Trong khung cập nhật tự động' : 'Tự động chờ 23:00 giờ Việt Nam'}</p>
            {nightSync.queued?.length > 0 && <p>Yêu cầu thủ công đang chờ/xử lý: {nightSync.queued.join(', ')}</p>}
            <div className="settings-night-sources">{nightSync.sources?.map(source => <p key={source.id}>
              <strong>{source.label}</strong>: {syncStatusLabel(source)}
              {source.result && ` · ${source.result.downloaded} ảnh tải mới · ${source.result.failed} ảnh lỗi · ${source.result.added} địa điểm mới · ${source.result.changed} mục thay đổi`}
              {source.error && ` · ${source.error}`}
              {source.lastPublishedAt && <span> · Dữ liệu hợp lệ được công bố: {new Date(source.lastPublishedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} (giờ Việt Nam)</span>}
              {source.result?.hookErrors?.length > 0 && <span role="status"> · Hook cần cập nhật: {source.result.hookErrors.join(' · ')}</span>}
            </p>)}</div>
            {nightSync.report && !nightSync.report.read && <div className="settings-night-report" role="status">
              <p>{nightSync.report.message}</p>
              {Object.entries(nightSync.report.sources || {}).map(([id, source]) => <p key={id}>
                <strong>{nightSync.sources?.find(entry => entry.id === id)?.label || id}</strong>: {syncStatusLabel(source)}
                {source.result && ` · ${source.result.downloaded} ảnh tải mới · ${source.result.failed} ảnh lỗi`}
                {source.error && ` · ${source.error}`}
              </p>)}
              <button type="button" className="toolbar-button" onClick={async () => {
                const response = await fetch('/api/night-sync/read', { method: 'POST' });
                if (response.ok) setNightSync(previous => ({ ...previous, report: { ...previous.report, read: true } }));
              }}>Đã đọc báo cáo</button>
            </div>}
          </> : <p>Đang lấy trạng thái đồng bộ…</p>}
        </article>
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

        <article className={`settings-card settings-hook-card${hookAvailable ? '' : ' is-disabled'}`}>
          <div className="settings-card-head">
            <div>
              <p className="panel-kicker">Nguồn Hook</p>
              <h3>Hook thường và Hook lễ</h3>
              <p className="settings-help">
                Hook lễ áp dụng cho cover của các mẫu hỗ trợ tại Đà Lạt. Mẫu dùng hook chủ đề hoặc không dùng hook giữ quy tắc riêng. List đã tạo luôn giữ nguyên.
              </p>
            </div>
            <span className={`settings-destination-pill ${hookMode === 'festival' ? 'is-positive' : ''}`}>
              {hookMode === 'festival' ? 'Đang dùng Hook lễ' : 'Đang dùng Hook thường'}
            </span>
          </div>

          {!hookAvailable ? (
            <p className="settings-hook-lock">
              Green Land luôn dùng Hook thường. Chuyển sang nguồn Đà Lạt để quản lý và bật Hook lễ.
            </p>
          ) : null}

          <div className="settings-hook-mode" aria-label="Chế độ Hook">
            <button
              type="button"
              className={`toolbar-button ${hookMode === 'normal' ? 'primary' : 'secondary'}`}
              disabled={!hookAvailable || hookSourcesBusy}
              onClick={() => runHookAction(() => onChangeHookMode('normal'))}
            >
              Dùng Hook thường
            </button>
            <span>{hookSourcesBusy ? 'Đang tải Hook…' : 'Chọn “Dùng bộ này” ở danh sách bên dưới để bật Hook lễ.'}</span>
          </div>

          <form className="settings-hook-form" onSubmit={submitNewHookSource}>
            <label>
              <span>Tên bộ Hook lễ</span>
              <input
                type="text"
                value={newHookName}
                minLength={2}
                maxLength={60}
                required
                placeholder="Ví dụ: 30/4, Quốc khánh, Noel"
                disabled={!hookAvailable || hookSourcesBusy}
                onChange={(event) => setNewHookName(event.target.value)}
              />
            </label>
            <label>
              <span>Link Google Docs công khai</span>
              <input
                type="url"
                value={newHookUrl}
                placeholder="https://docs.google.com/document/d/..."
                disabled={!hookAvailable || hookSourcesBusy || Boolean(newHookFile)}
                onChange={(event) => setNewHookUrl(event.target.value)}
              />
            </label>
            <label>
              <span>Hoặc file DOCX/TXT</span>
              <input
                type="file"
                accept=".docx,.txt,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                disabled={!hookAvailable || hookSourcesBusy || Boolean(newHookUrl.trim())}
                onChange={(event) => setNewHookFile(event.target.files?.[0] || null)}
              />
            </label>
            <button
              type="submit"
              className="toolbar-button primary"
              disabled={!hookAvailable || hookSourcesBusy || !newHookName.trim() || !hasExactlyOneNewHookInput}
            >
              {hookSourcesBusy ? 'Đang kiểm tra…' : 'Thêm bộ Hook lễ'}
            </button>
          </form>
          <p className="settings-form-note">Mỗi dòng không trống là một hook. File tối đa 5 MB; chỉ đọc văn bản trong DOCX/TXT.</p>

          <div className="settings-hook-list">
            {hookSources.length ? hookSources.map((source) => (
              <article key={source.id} className={`settings-hook-source${source.active ? ' is-active' : ''}`}>
                <div className="settings-hook-source-head">
                  <div>
                    <strong>{source.name}</strong>
                    <span>{getHookSourceTypeLabel(source.type)} · {source.hookCount} hook</span>
                  </div>
                  <span className={`settings-destination-pill ${source.active ? 'is-positive' : ''}`}>
                    {source.active ? 'Đang dùng' : `${source.usedCount || 0} đã dùng · ${source.remainingCount ?? source.hookCount} còn lại`}
                  </span>
                </div>
                <p className="settings-hook-meta">
                  Tải thành công: {formatHookDate(source.lastLoadedAt)}
                  {source.originalFileName ? ` · ${source.originalFileName}` : ''}
                </p>
                {source.lastError ? <p className="settings-form-error" role="alert">{source.lastError}. Cache cũ vẫn được giữ.</p> : null}
                <div className="settings-hook-actions">
                  <button
                    type="button"
                    className="toolbar-button primary"
                    disabled={!hookAvailable || hookSourcesBusy || source.active}
                    onClick={() => runHookAction(() => onChangeHookMode('festival', source.id))}
                  >
                    {source.active ? 'Đang sử dụng' : 'Dùng bộ này'}
                  </button>
                  {source.type === 'google-doc' ? (
                    <button
                      type="button"
                      className="toolbar-button secondary"
                      disabled={!hookAvailable || hookSourcesBusy}
                      onClick={() => runHookAction(() => onRefreshHookSource(source.id))}
                    >
                      Tải lại từ Google Docs
                    </button>
                  ) : (
                    <>
                      <label className="settings-hook-replace">
                        <span>File mới</span>
                        <input
                          type="file"
                          accept=".docx,.txt"
                          disabled={!hookAvailable || hookSourcesBusy}
                          onChange={(event) => setReplacementFiles((previous) => ({
                            ...previous,
                            [source.id]: event.target.files?.[0] || null,
                          }))}
                        />
                      </label>
                      <button
                        type="button"
                        className="toolbar-button secondary"
                        disabled={!hookAvailable || hookSourcesBusy || !replacementFiles[source.id]}
                        onClick={() => replaceHookFile(source)}
                      >
                        Thay file DOCX/TXT
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="toolbar-button secondary settings-hook-delete"
                    disabled={!hookAvailable || hookSourcesBusy || source.active}
                    onClick={() => {
                      if (window.confirm(`Xóa bộ Hook “${source.name}”? List cũ sẽ vẫn được giữ nguyên.`)) {
                        runHookAction(() => onDeleteHookSource(source.id));
                      }
                    }}
                  >
                    Xóa
                  </button>
                </div>
              </article>
            )) : (
              <p className="settings-hook-empty">Chưa có bộ Hook lễ. Hãy thêm bằng Link Google Docs hoặc file DOCX/TXT.</p>
            )}
          </div>
          {hookError ? <p className="settings-form-error" role="alert">{hookError}</p> : null}
        </article>

        <article className="settings-card">
          <div className="settings-card-head">
            <div>
              <p className="panel-kicker">Bộ nhớ ảnh</p>
              <h3>Cache Google Drive</h3>
            </div>
            <strong className="settings-cache-percent">{inventoryPercent === null ? '—' : `${inventoryPercent}%`}</strong>
          </div>

          <div
            className="settings-cache-progress"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={inventoryPercent ?? undefined}
            aria-label="Tỷ lệ ảnh nguồn hiện có trong cache"
          >
            <span style={{ width: `${inventoryPercent ?? 0}%` }} />
          </div>

          <dl className="settings-cache-stats">
            <div>
              <dt>Ảnh đã có trên máy / ảnh trong nguồn</dt>
              <dd>{inventory ? `${inventory.cached}/${inventory.total}` : 'Chưa có thống kê'}</dd>
            </div>
            <div>
              <dt>Ảnh chưa có cache hợp lệ</dt>
              <dd className={inventory?.missing ? 'has-warning' : ''}>{inventory?.missing ?? '—'}</dd>
            </div>
          </dl>

          <p className="settings-help">
            Thống kê ảnh của nguồn đang chọn từ chỉ mục và cache trên máy, không phải tiến độ cập nhật. Ảnh thiếu cần được tải qua đồng bộ; không tự thay ảnh của list đã lưu.
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
            <div className="settings-active-sheet" key={activeDestinationId}>
              <span>Google Sheet của {activeDestination?.label || 'nguồn đang chọn'}</span>
              {activeSheetUrl ? (
                <>
                  <input
                    type="url"
                    value={activeSheetUrl}
                    readOnly
                    aria-label={`Google Sheet của ${activeDestination?.label || 'nguồn đang chọn'}`}
                  />
                  <a href={activeSheetUrl} target="_blank" rel="noreferrer">
                    Mở đúng Google Sheet {activeDestination?.label}
                  </a>
                </>
              ) : (
                <p>Chưa cấu hình Google Sheet dự phòng.</p>
              )}
            </div>

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
              disabled={sheetRefreshing || !activeDestination || !activeHasSheetFallback}
              onClick={refreshFromSheet}
            >
              {sheetRefreshing || refreshing
                ? `Đang chờ/cập nhật ${activeDestination?.label || ''}...`
                : `Cập nhật dữ liệu ngay — ${activeDestination?.label || ''}`}
            </button>
            <p className="settings-form-note">Cho phép cập nhật thủ công cả ngoài 23:00–06:00. Không thay nội dung list đã lưu.</p>

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
