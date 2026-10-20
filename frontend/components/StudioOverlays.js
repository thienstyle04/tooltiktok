'use client';

// Lớp phủ dùng chung cho Classic và V2: tiến độ cập nhật nguồn, thêm nguồn lần đầu,
// chuẩn bị cache ảnh và thông báo dữ liệu sẵn sàng/cảnh báo đồng bộ.
import FirstSourceSetup from './FirstSourceSetup';

export default function StudioOverlays({ studio }) {
  const {
    manualSyncVisible,
    manualSyncProgress,
    manualSyncTerminal,
    setManualSyncVisible,
    needsFirstSource,
    destinationInfo,
    switchingDestination,
    refreshing,
    addSource,
    refreshDestinationFromSheet,
    setStatus,
    showCacheWarmOverlay,
    cacheDestinationShortLabel,
    driveCacheStatus,
    setDismissedCacheDestinationId,
    loadDataset,
    cacheStatusDestinationId,
    setActiveView,
    setCaptionToolsVisible,
    driveCacheReadyNotice,
    dismissedSyncWarning,
    setDismissedSyncWarning,
  } = studio;
  return <>
      {manualSyncVisible && manualSyncProgress ? (
        <div className="cache-warm-overlay" role="dialog" aria-modal="true" aria-labelledby="manualSyncTitle">
          <section className="cache-warm-dialog">
            <div className="cache-warm-icon" aria-hidden="true">↻</div>
            <p className="panel-kicker">Cập nhật dữ liệu</p>
            <h2 id="manualSyncTitle">{manualSyncProgress.phase === 'error' ? 'Cập nhật chưa hoàn tất' : manualSyncProgress.phase === 'complete' ? 'Đã cập nhật' : 'Đang cập nhật dữ liệu'}</h2>
            <p className="cache-warm-message" role="status">{manualSyncProgress.message}</p>
            {manualSyncProgress.total > 0 && <>
              <div className="cache-warm-progress" role="progressbar" aria-label="Tiến độ bước hiện tại" aria-valuemin={0} aria-valuemax={manualSyncProgress.total} aria-valuenow={manualSyncProgress.completed}>
                <span style={{ width: `${Math.min(100, manualSyncProgress.completed / manualSyncProgress.total * 100)}%` }} />
              </div>
              <p className="cache-warm-stats">{manualSyncProgress.completed}/{manualSyncProgress.total} mục trong bước hiện tại</p>
            </>}
            <p className="cache-warm-note">{manualSyncTerminal ? 'List đã lưu không bị thay đổi.' : 'Giữ tool mở đến khi cập nhật hoàn tất. Đóng bảng này không hủy tác vụ.'}</p>
            <button type="button" className="toolbar-button primary" onClick={() => setManualSyncVisible(false)}>Đóng bảng tiến độ</button>
          </section>
        </div>
      ) : null}
      {needsFirstSource && !manualSyncVisible ? (
        <FirstSourceSetup
          destinations={destinationInfo?.destinations || []}
          busy={switchingDestination || refreshing}
          onAddDestination={addSource}
          onSyncDestination={(destinationId) => {
            refreshDestinationFromSheet(destinationId).catch((error) => setStatus(error.message));
          }}
        />
      ) : null}
      {showCacheWarmOverlay && !manualSyncVisible && !needsFirstSource ? (
        <div className="cache-warm-overlay" role="dialog" aria-modal="true" aria-labelledby="cacheWarmTitle">
          <section className="cache-warm-dialog">
            <div className="cache-warm-icon" aria-hidden="true">{cacheDestinationShortLabel}</div>
            <p className="panel-kicker">Chuẩn bị dữ liệu lần đầu</p>
            <h2 id="cacheWarmTitle">
              {driveCacheStatus.phase === 'error' ? 'Chưa thể tải dữ liệu' : 'Đang chuẩn bị dữ liệu'}
            </h2>
            <p className="cache-warm-message">{driveCacheStatus.message}</p>
            <div
              className="cache-warm-progress"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={driveCacheStatus.percent || 0}
            >
              <span style={{ width: `${Math.max(0, Math.min(100, driveCacheStatus.percent || 0))}%` }} />
            </div>
            <div className="cache-warm-stats">
              <strong>{driveCacheStatus.percent || 0}%</strong>
              <span>
                {driveCacheStatus.total
                  ? `${driveCacheStatus.completed || 0}/${driveCacheStatus.total} ảnh`
                  : 'Đang kiểm tra danh sách ảnh'}
              </span>
            </div>
            {driveCacheStatus.failed > 0 ? (
              <p className="cache-warm-warning">{driveCacheStatus.failed} ảnh hiện chưa tải được.</p>
            ) : null}
            <p className="cache-warm-note">
              Tạm thời chưa thể sinh list. Vui lòng giữ ứng dụng mở cho đến khi quá trình hoàn tất.
            </p>
            {driveCacheStatus.phase === 'error' ? (
              <div className="cache-warm-actions">
                <button
                  type="button"
                  className="toolbar-button primary cache-retry-button"
                  disabled={refreshing}
                  onClick={() => {
                    setDismissedCacheDestinationId(null);
                    loadDataset('Đang thử tải lại dữ liệu...', {}, true).catch((error) => setStatus(error.message));
                  }}
                >
                  {refreshing ? 'Đang thử lại...' : 'Thử lại'}
                </button>
                <button
                  type="button"
                  className="toolbar-button cache-exit-button"
                  onClick={() => {
                    setDismissedCacheDestinationId(cacheStatusDestinationId);
                    setActiveView('settings');
                    setCaptionToolsVisible(false);
                    setStatus('Đồng bộ dữ liệu chưa hoàn tất. Bạn có thể kiểm tra nguồn trong Cài đặt; chức năng tạo list vẫn tạm khóa.');
                  }}
                >
                  Vào giao diện
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {driveCacheReadyNotice ? (
        <div className="cache-ready-notice" role="status">
          <strong>Dữ liệu đã sẵn sàng</strong>
          <span>Bạn có thể tạo và xuất list.</span>
        </div>
      ) : null}
      {driveCacheStatus.ready && driveCacheStatus.syncWarning && dismissedSyncWarning !== driveCacheStatus.syncWarning ? (
        <div className="sync-warning-notice" role="status">
          <span>{driveCacheStatus.syncWarning}</span>
          <button type="button" className="toolbar-button" onClick={() => setDismissedSyncWarning(driveCacheStatus.syncWarning)}>Đã hiểu</button>
        </div>
      ) : null}
  </>;
}
