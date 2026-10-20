'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import s from './prototype.module.css';
import { timeAgo } from './data';
import Icon from '../../components/ui/Icon';

export { Icon };

export function Toasts({ toasts, onDismiss }) {
  return (
    <div className={s.toasts} aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map(toast => (
          <motion.div key={toast.id} layout className={s.toast} data-tone={toast.tone || 'info'}
            initial={{ opacity: 0, y: 16, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 60 }} transition={{ type: 'spring', duration: .45, bounce: .2 }}>
            <Icon name={toast.tone === 'error' ? 'alert' : 'check'} />
            <span>{toast.text}</span>
            {toast.action ? <button type="button" onClick={() => { toast.action.run(); onDismiss(toast.id); }}>{toast.action.label}</button> : null}
            <button type="button" className={s.iconButton} aria-label="Đóng thông báo" onClick={() => onDismiss(toast.id)}><Icon name="close" size={14} /></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// Hộp xác nhận nhiều lựa chọn: trả về id của hành động được bấm, hoặc null khi hủy.
export function ConfirmDialog({ request, onAnswer }) {
  const first = useRef(null);
  useEffect(() => { if (request) first.current?.focus(); }, [request]);
  return (
    <AnimatePresence>
      {request ? (
        <motion.div className={s.backdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={event => event.target === event.currentTarget && onAnswer(null)}
          onKeyDown={event => { if (event.key === 'Escape') onAnswer(null); }}>
          <motion.div role="alertdialog" aria-modal="true" aria-labelledby="proto-confirm-title" className={s.confirm}
            initial={{ scale: .88, rotate: 2, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: .94, opacity: 0 }} transition={{ type: 'spring', duration: .5, bounce: .3 }}>
            <span className={s.confirmIcon} data-tone={request.tone}>{request.tone === 'danger' ? '!' : '?'}</span>
            <h3 id="proto-confirm-title">{request.title}</h3>
            <p>{request.message}</p>
            <div className={s.confirmActions}>
              <button ref={first} type="button" onClick={() => onAnswer(null)}>{request.cancelLabel || 'Hủy'}</button>
              {request.actions.map(action => <button key={action.id} type="button" className={action.tone === 'danger' ? s.danger : s.primary} onClick={() => onAnswer(action.id)}>{action.label}</button>)}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

const JOB_ICON = { create: 'create', export: 'export', sync: 'sync', schedule: 'auto' };
const JOB_STATUS = { queued: 'Đang chờ lượt', running: 'Đang chạy', done: 'Hoàn tất', failed: 'Lỗi', cancelled: 'Đã hủy' };

export function TaskCenter({ open, jobs, onClose, onCancel, onRetry, onClear }) {
  const active = jobs.filter(job => ['queued', 'running'].includes(job.status));
  const recent = jobs.filter(job => !['queued', 'running'].includes(job.status));
  return (
    <AnimatePresence>
      {open ? (
        <motion.section className={s.taskCenter} role="dialog" aria-label="Trung tâm tác vụ"
          initial={{ opacity: 0, y: -10, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: .98 }} transition={{ type: 'spring', duration: .4, bounce: .25 }}
          onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
          <header><h3>Tác vụ</h3><button type="button" className={s.iconButton} aria-label="Đóng trung tâm tác vụ" onClick={onClose}><Icon name="close" /></button></header>
          <p className={s.taskHeading}>Đang chạy & chờ lượt · {active.length}</p>
          {active.length ? active.map(job => (
            <article key={job.id} className={s.taskCard} data-status={job.status}>
              <span className={s.taskIcon}><Icon name={JOB_ICON[job.kind]} /></span>
              <div><strong>{job.title}</strong><small>{JOB_STATUS[job.status]}{job.status === 'running' ? ` · ${Math.round(job.progress)}%` : ' · chạy lần lượt để máy không quá tải'}</small>
                <div className={s.taskBar}><motion.span animate={{ width: `${job.progress}%` }} transition={{ ease: 'linear', duration: .2 }} /></div></div>
              <button type="button" onClick={() => onCancel(job.id)}>Hủy</button>
            </article>
          )) : <p className={s.taskEmpty}>Không có tác vụ nào đang chạy.</p>}
          <p className={s.taskHeading}>Gần đây</p>
          {recent.length ? recent.slice(0, 8).map(job => (
            <article key={job.id} className={s.taskCard} data-status={job.status}>
              <span className={s.taskIcon}><Icon name={job.status === 'failed' ? 'alert' : job.status === 'done' ? 'check' : JOB_ICON[job.kind]} /></span>
              <div><strong>{job.title}</strong><small>{JOB_STATUS[job.status]} · {timeAgo(job.finishedAt || Date.now())}{job.detail ? ` · ${job.detail}` : ''}</small></div>
              {job.status === 'failed' || job.status === 'cancelled' ? <button type="button" onClick={() => onRetry(job.id)}>Thử lại</button> : null}
            </article>
          )) : <p className={s.taskEmpty}>Chưa có lịch sử.</p>}
          {recent.length ? <button type="button" className={s.linkButton} onClick={onClear}>Xóa lịch sử tác vụ</button> : null}
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}

const fold = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'D').toLowerCase();

export function CommandPalette({ open, entries, onClose }) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const input = useRef(null);
  useEffect(() => { if (open) { setQuery(''); setCursor(0); requestAnimationFrame(() => input.current?.focus()); } }, [open]);
  const results = useMemo(() => entries.filter(entry => fold(`${entry.label} ${entry.hint || ''}`).includes(fold(query))).slice(0, 12), [entries, query]);
  const run = entry => { onClose(); entry.run(); };
  return (
    <AnimatePresence>
      {open ? (
        <motion.div className={s.backdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={event => event.target === event.currentTarget && onClose()}>
          <motion.div className={s.palette} role="dialog" aria-modal="true" aria-label="Tìm nhanh" initial={{ y: -16, opacity: 0, scale: .97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ type: 'spring', duration: .4, bounce: .2 }}>
            <label className={s.paletteInput}><Icon name="search" /><input ref={input} value={query} placeholder="Tìm mẫu, list hoặc lệnh…" aria-label="Tìm nhanh"
              onChange={event => { setQuery(event.target.value); setCursor(0); }}
              onKeyDown={event => {
                if (event.key === 'Escape') onClose();
                if (event.key === 'ArrowDown') { event.preventDefault(); setCursor(c => Math.min(results.length - 1, c + 1)); }
                if (event.key === 'ArrowUp') { event.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
                if (event.key === 'Enter' && results[cursor]) run(results[cursor]);
              }} /><kbd>Esc</kbd></label>
            <ul role="listbox" aria-label="Kết quả">
              {results.map((entry, index) => <li key={entry.id} role="option" aria-selected={index === cursor}>
                <button type="button" onMouseEnter={() => setCursor(index)} onClick={() => run(entry)}><span className={s.paletteGroup}>{entry.group}</span><strong>{entry.label}</strong>{entry.hint ? <small>{entry.hint}</small> : null}</button>
              </li>)}
              {!results.length ? <li className={s.taskEmpty}>Không có kết quả cho “{query}”.</li> : null}
            </ul>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
