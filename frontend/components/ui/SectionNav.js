// Mục lục dính đầu trang cho các trang dài: bấm để cuộn tới thẻ tương ứng.
export default function SectionNav({ sections, ariaLabel }) {
  const jump = id => {
    const target = document.getElementById(id);
    if (!target) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
  };
  return (
    <nav className="ui-section-nav" aria-label={ariaLabel}>
      {sections.filter(Boolean).map(section => <button key={section.id} type="button" onClick={() => jump(section.id)}>{section.label}</button>)}
    </nav>
  );
}
