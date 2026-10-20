'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Icon from '../ui/Icon';
import { looksLikeError } from './TaskCenter';

// Thông báo nhanh thay cho thanh trạng thái cố định: chỉ kết quả và lỗi, bỏ tin điều hướng.
const QUIET = /^(Đang xem|Đã chọn trang|Đã mở preview|Đang |Đã hoàn tác|Chưa có thao tác)/;

// decorate(status) → thuộc tính thêm cho toast (vd. nút hành động) hoặc undefined.
export function useStatusToasts(status, decorate) {
  const [toasts, setToasts] = useState([]);
  const last = useRef(status);
  const dismiss = useCallback(id => setToasts(previous => previous.filter(toast => toast.id !== id)), []);
  const push = useCallback((text, extra = {}) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts(previous => [...previous.filter(toast => toast.text !== text).slice(-3), { id, text, ...extra }]);
    setTimeout(() => dismiss(id), extra.action ? 8000 : looksLikeError(text) ? 9000 : 5000);
  }, [dismiss]);
  useEffect(() => {
    if (!status || status === last.current) return;
    last.current = status;
    if (QUIET.test(status)) return;
    push(status, { tone: looksLikeError(status) ? 'error' : 'info', ...(decorate?.(status) || {}) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, push]);
  return { toasts, push, dismiss };
}

export function Toasts({ toasts, onDismiss }) {
  return (
    <div className="v2-toasts" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map(toast => (
          <motion.div key={toast.id} layout className="v2-toast" data-tone={toast.tone || 'info'} role={toast.tone === 'error' ? 'alert' : 'status'}
            initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 60 }} transition={{ type: 'spring', duration: 0.45, bounce: 0.2 }}>
            <Icon name={toast.tone === 'error' ? 'alert' : 'check'} />
            <span>{toast.text}</span>
            {toast.action ? <button type="button" className="toolbar-button" onClick={() => { toast.action.run(); onDismiss(toast.id); }}>{toast.action.label}</button> : null}
            <button type="button" className="v2-icon-button" aria-label="Đóng thông báo" onClick={() => onDismiss(toast.id)}><Icon name="close" size={14} /></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

const fold = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'D').toLowerCase();

export function CommandPalette({ open, entries, onClose }) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const input = useRef(null);
  const restore = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    restore.current = document.activeElement;
    setQuery(''); setCursor(0);
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => { cancelAnimationFrame(frame); if (restore.current?.isConnected) restore.current.focus({ preventScroll: true }); };
  }, [open]);
  const results = useMemo(() => entries.filter(entry => fold(`${entry.label} ${entry.hint || ''} ${entry.group}`).includes(fold(query))).slice(0, 14), [entries, query]);
  const run = entry => { onClose(); entry.run(); };
  return (
    <AnimatePresence>
      {open ? (
        <motion.div className="v2-palette-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={event => event.target === event.currentTarget && onClose()}>
          <motion.div className="v2-palette" role="dialog" aria-modal="true" aria-label="Tìm nhanh" initial={{ y: -16, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ type: 'spring', duration: 0.4, bounce: 0.2 }}>
            <label className="v2-palette-input"><Icon name="search" /><input ref={input} value={query} placeholder="Tìm mẫu, list hoặc lệnh…" aria-label="Tìm nhanh" role="combobox" aria-expanded="true" aria-controls="v2-palette-results"
              aria-activedescendant={results[cursor] ? `v2-palette-${results[cursor].id}` : undefined}
              onChange={event => { setQuery(event.target.value); setCursor(0); }}
              onKeyDown={event => {
                if (event.key === 'Escape') { event.preventDefault(); onClose(); }
                if (event.key === 'ArrowDown') { event.preventDefault(); setCursor(c => Math.min(results.length - 1, c + 1)); }
                if (event.key === 'ArrowUp') { event.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
                if (event.key === 'Enter' && results[cursor]) { event.preventDefault(); run(results[cursor]); }
              }} /><kbd>Esc</kbd></label>
            <ul id="v2-palette-results" role="listbox" aria-label="Kết quả">
              {results.map((entry, index) => <li key={entry.id} id={`v2-palette-${entry.id}`} role="option" aria-selected={index === cursor}>
                <button type="button" tabIndex={-1} onMouseEnter={() => setCursor(index)} onClick={() => run(entry)}><span className="v2-palette-group">{entry.group}</span><strong>{entry.label}</strong>{entry.hint ? <small>{entry.hint}</small> : null}</button>
              </li>)}
              {!results.length ? <li className="v2-muted">Không có kết quả cho “{query}”.</li> : null}
            </ul>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
