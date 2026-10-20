import { motion } from 'motion/react';

// Ghép chip-tabs (viên nền trượt theo layoutId) và morph-stepped-progress (số bước → dấu tích, thanh tiến độ).
// Tên truy cập của nút giữ đúng `label` vì test và trình đọc màn hình dựa vào nó.
function CheckIcon() {
  return <svg className="ui-step-check" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z" /></svg>;
}

export default function StepTabs({ items, activeId, ariaLabel, pillId, currentValue = 'page', stepper = false, className = '' }) {
  const activeIndex = items.findIndex(item => item.id === activeId);
  return (
    <nav className={`studio-workflow-steps ui-step-tabs ${stepper ? 'ui-stepper' : ''} ${className}`.trim()} aria-label={ariaLabel}>
      {items.map((item, index) => {
        const current = item.id === activeId;
        const done = stepper && activeIndex > index;
        return (
          <button key={item.id} type="button" aria-label={item.label} aria-current={current ? currentValue : undefined} data-done={done || undefined} disabled={item.disabled} onClick={item.onClick}>
            {current ? <motion.span layoutId={pillId} className="ui-step-pill" transition={{ type: 'spring', duration: 0.5, bounce: 0.2 }} aria-hidden="true" /> : null}
            {stepper ? <span className="ui-step-index" aria-hidden="true"><span className="ui-step-number">{index + 1}</span>{done ? <CheckIcon /> : null}</span> : null}
            <span className="ui-step-label">{stepper ? item.label.replace(/^\d+\s*·\s*/, '') : item.label}</span>
          </button>
        );
      })}
      {stepper ? <span className="ui-step-progress" aria-hidden="true">
        <motion.span initial={false} animate={{ width: `${Math.max(0, activeIndex) / Math.max(1, items.length - 1) * 100}%` }} transition={{ ease: 'easeOut', duration: 0.35 }} />
      </span> : null}
    </nav>
  );
}
