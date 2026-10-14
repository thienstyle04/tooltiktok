'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { apiFetch } from '../lib/apiClient';

const headers = { 'x-dalat-update': '1' };
function vnTime(value) {
  try { return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
  catch { return value; }
}
async function call(path, init = {}) {
  const response = await apiFetch(`/api/app-update/${path}`, { cache: 'no-store', ...init, headers: { ...headers, ...init.headers } });
  const data = await response.json();
  if (!response.ok) throw Error(data.message || `HTTP ${response.status}`);
  return data;
}

export default function UpdateNotice({ hasUnsavedChanges = false } = {}) {
  const [state, setState] = useState(null);
  const [open, setOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [scheduleValue, setScheduleValue] = useState('');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const widget = useRef(null), bell = useRef(null), panel = useRef(null);
  const mounted = useRef(false), actionPending = useRef(false), revision = useRef(0);
  const panelId = useId();
  const refresh = useCallback(async signal => {
    if (actionPending.current) return;
    const request = ++revision.current;
    try {
      const result = await call('status', { signal });
      if (mounted.current && !signal?.aborted && request === revision.current) { setState(result); setConnectionError(''); }
    } catch (error) {
      if (mounted.current && !signal?.aborted && request === revision.current) setConnectionError(error.message || 'Không đọc được trạng thái cập nhật.');
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; revision.current++; };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = setInterval(() => void refresh(controller.signal), open ? 5_000 : 60_000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [open, refresh]);
  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) bell.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    const outside = event => { if (!widget.current?.contains(event.target)) close(false); };
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [open, close]);
  const act = async (path, body) => {
    if (actionPending.current) return;
    actionPending.current = true;
    const request = ++revision.current;
    setWorking(true); setMessage(''); setActionError('');
    try {
      const result = await call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      if (!mounted.current || request !== revision.current) return;
      setState(result);
      setConnectionError('');
      if (path === 'install') setMessage('Đang tải và xác minh bản cập nhật. Tool sẽ tự khởi động lại khi an toàn.');
      if (path === 'defer') setEditingSchedule(false);
    } catch (error) { if (mounted.current) setActionError(error.message || String(error)); }
    finally { actionPending.current = false; if (mounted.current) setWorking(false); }
  };
  const available = Boolean(state?.enabled && state.availableVersion);
  const error = actionError || connectionError || state?.error;
  return <div className="app-update-widget" data-app-update-ui ref={widget}>
    <button ref={bell} className="app-update-bell" type="button" aria-label={available ? 'Cập nhật ứng dụng: có bản mới' : 'Cập nhật ứng dụng'} aria-expanded={open} aria-controls={panelId} aria-haspopup="dialog" onClick={() => open ? close() : setOpen(true)}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
      {available ? <span className="app-update-dot" aria-hidden="true" /> : null}
    </button>
    {open ? <section id={panelId} ref={panel} className="app-update-notice" role="dialog" aria-modal="false" aria-labelledby={`${panelId}-title`} tabIndex={-1}>
    <header className="app-update-heading"><h2 id={`${panelId}-title`}>Cập nhật ứng dụng</h2><button type="button" className="app-update-close" aria-label="Đóng bảng cập nhật" onClick={() => close()}>×</button></header>
    <div className="app-update-content" aria-live="polite">
      {state ? <>
      <strong>{!state.enabled ? 'Phiên bản này chưa bật trình cập nhật.' : available ? `Có bản mới ${state.availableVersion}` : state.applying ? 'Đang cập nhật' : state.scheduledAt ? 'Đã hẹn cập nhật' : !error ? 'Chưa có bản cập nhật mới' : 'Trạng thái cập nhật chưa được xác nhận'}</strong>
      <span> · Đang dùng {state.currentVersion}</span>
      {state.notes?.length ? <ul>{state.notes.map((note, index) => <li key={index}>{note}</li>)}</ul> : null}
      {state.scheduledAt ? <p>Hẹn cập nhật: {vnTime(state.scheduledAt)} (giờ Việt Nam). Nếu tool đang bận, sẽ đợi tác vụ hoàn tất.</p> : null}
      {state.busy ? <p>Tool đang có tác vụ; chỉ cài bản mới sau khi tác vụ kết thúc.</p> : null}
      {hasUnsavedChanges ? <p>Bạn có thay đổi chưa lưu. Hãy lưu nội dung trước khi cập nhật.</p> : null}
      {state.updateProgress && state.updateProgress.phase !== 'complete' ? <p>{state.updateProgress.message}{state.updateProgress.total ? ` · ${Math.round((state.updateProgress.bytes || 0) / state.updateProgress.total * 100)}%` : ''}</p> : null}
      </> : <p>{error ? 'Chưa đọc được trạng thái cập nhật.' : 'Đang đọc trạng thái cập nhật…'}</p>}
      {error ? <p className="app-update-error" role="alert">{error}</p> : null}
      {message && !error && state?.applying ? <p role="status">{message}</p> : null}
    </div>
    <div className="app-update-actions">
      {state?.enabled !== false ? <button type="button" disabled={working || state?.checking || state?.applying} onClick={() => void act('check')}>{working ? 'Đang xử lý…' : state?.checking ? 'Đang kiểm tra…' : 'Kiểm tra lại'}</button> : null}
      {available && !state.applying ? <button type="button" disabled={working || state.busy || hasUnsavedChanges} onClick={() => void act('install')}>Cập nhật ngay</button> : null}
      {available && !state.applying ? <button type="button" disabled={working} onClick={() => setEditingSchedule(value => !value)}>Hẹn ngày giờ</button> : null}
      {state?.enabled && state.scheduledAt && !state.applying ? <button type="button" disabled={working} onClick={() => void act('cancel-schedule')}>Hủy lịch cập nhật</button> : null}
      {editingSchedule && available && !state.applying ? <form onSubmit={event => {
        event.preventDefault();
        const timestamp = Date.parse(`${scheduleValue}:00+07:00`);
        if (!Number.isFinite(timestamp) || timestamp <= Date.now()) { setActionError('Hãy chọn ngày giờ Việt Nam hợp lệ trong tương lai.'); return; }
        void act('defer', { scheduledAt: new Date(timestamp).toISOString() });
      }}><label>Giờ Việt Nam <input type="datetime-local" required value={scheduleValue} onChange={event => setScheduleValue(event.target.value)} /></label><button type="submit" disabled={working}>Lưu giờ hẹn</button></form> : null}
    </div>
  </section> : null}
  </div>;
}
