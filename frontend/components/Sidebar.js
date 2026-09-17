import { APP_VERSION } from '../lib/appVersion';

export default function Sidebar({
  dataset,
  activeView,
  onOpenTemplates,
  onOpenPreview,
  onOpenCaption,
  onOpenExport,
  onOpenData,
  onOpenSettings,
  onOpenScheduler,
  onOpenDelete,
  onOpenLists,
}) {
  const menuItems = [
    { id: 'templates', label: 'Tạo bài đăng', icon: 'templates', onClick: onOpenTemplates || onOpenPreview },
    { id: 'lists', label: 'List đã tạo', icon: 'preview', onClick: onOpenLists },
    { id: 'scheduler', label: 'Hẹn giờ', icon: 'scheduler', onClick: onOpenScheduler },
    { id: 'settings', label: 'Dữ liệu & Cài đặt', icon: 'settings', onClick: onOpenSettings },
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
          const active = activeView === item.id || (item.id === 'templates' && ['preview','caption'].includes(activeView)) || (item.id === 'lists' && ['export','delete'].includes(activeView)) || (item.id === 'settings' && activeView === 'data');
          return (
            <button
              key={item.id}
              id={item.buttonId}
              className={`sidebar-menu-item ${active ? 'active' : ''}`}
              type="button"
              aria-current={active ? 'page' : undefined}
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
