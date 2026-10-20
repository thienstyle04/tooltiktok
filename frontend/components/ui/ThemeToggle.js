import { motion } from 'motion/react';

// Chuyển từ toggles/slider-toggle (hover.dev): một nút duy nhất để giữ hành vi bấm-là-đổi.
function SunIcon() {
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
}

function MoonIcon() {
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>;
}

export default function ThemeToggle({ theme, onToggle }) {
  const dark = theme === 'dark';
  return (
    <button type="button" className="toolbar-button studio-theme-toggle ui-theme-toggle" data-theme-value={theme} onClick={onToggle} aria-label="Đổi giao diện sáng tối" aria-pressed={dark}>
      <span className={`ui-theme-option ${dark ? '' : 'current'}`}><SunIcon /><span className="ui-theme-text">Sáng</span></span>
      <span className={`ui-theme-option ${dark ? 'current' : ''}`}><MoonIcon /><span className="ui-theme-text">Tối</span></span>
      <span className={`ui-theme-track ${dark ? 'dark' : 'light'}`} aria-hidden="true">
        <motion.span layout className="ui-theme-knob" transition={{ type: 'spring', damping: 15, stiffness: 250 }} />
      </span>
    </button>
  );
}
