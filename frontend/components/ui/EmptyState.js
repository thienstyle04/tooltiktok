// Màn trống dùng chung: biểu tượng, lời nhắn ngắn và (tùy chọn) một hành động để đi tiếp.
const ICONS = {
  list: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  export: <><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></>,
  trash: <><path d="M5 7h14M10 11v6M14 11v6M9 7l1-3h4l1 3M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" /></>,
};

export default function EmptyState({ icon = 'list', title, children, action = null, compact = false, className = '' }) {
  return (
    <div className={`ui-empty ${compact ? 'compact' : ''} ${className}`.trim()}>
      <span className="ui-empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICONS[icon] || ICONS.list}</svg>
      </span>
      <div className="ui-empty-copy">
        {title ? <strong>{title}</strong> : null}
        {children ? <p>{children}</p> : null}
      </div>
      {action ? <div className="ui-empty-action">{action}</div> : null}
    </div>
  );
}
