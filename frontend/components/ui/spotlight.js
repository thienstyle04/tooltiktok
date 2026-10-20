// Chuyển từ buttons/spotlight-button (hover.dev): một listener chung cho mọi nút chính
// thay vì gắn listener từng nút. CSS đọc --spot-x/--spot-y.
const SPOTLIGHT_SELECTOR = '.toolbar-button.primary, .toolbar-button.secondary';

export function trackButtonSpotlight(event) {
  const button = event.target instanceof Element ? event.target.closest(SPOTLIGHT_SELECTOR) : null;
  if (!button || button.disabled) return;
  const rect = button.getBoundingClientRect();
  button.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
  button.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
}
