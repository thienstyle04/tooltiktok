// Chuyển từ loaders/bar-loader (hover.dev) sang CSS thuần để dùng cả trước khi studio tải xong.
export default function BarLoader({ label = '', className = '' }) {
  return (
    <span className={`ui-bar-loader ${className}`.trim()} role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : 'true'}>
      {[0, 1, 2, 3, 4].map(index => <span key={index} style={{ '--bar-index': index }} />)}
    </span>
  );
}
