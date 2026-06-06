import { APP_VERSION } from '../lib/appVersion';

export default function Sidebar({
  dataset,
  activeView,
  onOpenTemplates,
  onOpenPreview,
  onOpenCaption,
  onOpenExport,
  onOpenData,
  onOpenDelete,
}) {
  const menuItems = [
    { id: 'templates', label: 'Mẫu deck', icon: 'templates', onClick: onOpenTemplates || onOpenPreview },
    { id: 'preview', label: 'Preview', icon: 'preview', onClick: onOpenPreview },
    { id: 'caption', label: 'Caption AI', icon: 'caption', onClick: onOpenCaption },
    { id: 'export', label: 'Xuất file', icon: 'export', onClick: onOpenExport, buttonId: 'batchExportBtn' },
    { id: 'data', label: 'Dữ liệu trang', icon: 'data', onClick: onOpenData },
    { id: 'delete', label: 'Xóa list', icon: 'delete', onClick: onOpenDelete, buttonId: 'deleteListsBtn' },
  ];

  return (
    <aside className="app-sidebar">
      <div className="window-dots" aria-hidden="true">
        <span className="dot red" />
        <span className="dot amber" />
        <span className="dot green" />
      </div>

      <div className="brand-block">
        <span className="brand-mark" aria-hidden="true">DL</span>
        <div>
          <h1 className="brand-title">Dalat Studio</h1>
          <p className="brand-version">v{APP_VERSION}</p>
        </div>
      </div>

      <nav className="sidebar-menu" aria-label="Khu vực làm việc">
        {menuItems.map((item) => {
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              id={item.buttonId}
              className={`sidebar-menu-item ${active ? 'active' : ''}`}
              type="button"
              onClick={item.onClick}
            >
              <span className={`side-icon ${item.icon}`} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <span className="footer-status-dot" />
        <span>{dataset ? 'Sẵn sàng' : 'Đang nạp dữ liệu'}</span>
      </div>
    </aside>
  );
}
