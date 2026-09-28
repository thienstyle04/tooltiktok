'use client';

import { useCallback, useEffect, useState } from 'react';
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

export default function UpdateNotice() {
  const [state, setState] = useState(null);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [scheduleValue, setScheduleValue] = useState('');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const refresh = useCallback(async () => {
    try { setState(await call('status')); }
    catch { /* A temporarily unavailable local backend must not block the studio. */ }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);
  const act = async (path, body) => {
    setWorking(true); setMessage('');
    try {
      const result = await call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      setState(result);
      if (path === 'install') setMessage('Đang tải và xác minh bản cập nhật. Tool sẽ tự khởi động lại khi an toàn.');
      if (path === 'defer') setEditingSchedule(false);
    } catch (error) { setMessage(error.message || String(error)); }
    finally { setWorking(false); }
  };
  if (!state?.enabled || !state.availableVersion && !state.scheduledAt && !state.applying) return null;
  return <section className="app-update-notice" role="status" aria-live="polite">
    <div>
      <strong>{state.availableVersion ? `Có bản mới ${state.availableVersion}` : 'Đã hẹn cập nhật'}</strong>
      <span> · Đang dùng {state.currentVersion}</span>
      {state.notes?.length ? <ul>{state.notes.map((note, index) => <li key={index}>{note}</li>)}</ul> : null}
      {state.scheduledAt ? <p>Hẹn cập nhật: {vnTime(state.scheduledAt)} (giờ Việt Nam). Nếu tool đang bận, sẽ đợi tác vụ hoàn tất.</p> : null}
      {state.busy ? <p>Tool đang có tác vụ; chỉ cài bản mới sau khi tác vụ kết thúc.</p> : null}
      {state.updateProgress && state.updateProgress.phase !== 'complete' ? <p>{state.updateProgress.message}{state.updateProgress.total ? ` · ${Math.round((state.updateProgress.bytes || 0) / state.updateProgress.total * 100)}%` : ''}</p> : null}
      {message ? <p>{message}</p> : null}
    </div>
    <div className="app-update-actions">
      {state.availableVersion && !state.applying ? <button type="button" disabled={working || state.busy} onClick={() => void act('install')}>Cập nhật ngay</button> : null}
      {state.availableVersion && !state.applying ? <button type="button" disabled={working} onClick={() => setEditingSchedule(value => !value)}>Hẹn ngày giờ</button> : null}
      {state.scheduledAt && !state.applying ? <button type="button" disabled={working} onClick={() => void act('cancel-schedule')}>Hủy lịch cập nhật</button> : null}
      {editingSchedule ? <form onSubmit={event => {
        event.preventDefault();
        const timestamp = Date.parse(`${scheduleValue}:00+07:00`);
        if (!Number.isFinite(timestamp)) { setMessage('Hãy chọn ngày giờ Việt Nam hợp lệ.'); return; }
        void act('defer', { scheduledAt: new Date(timestamp).toISOString() });
      }}><label>Giờ Việt Nam <input type="datetime-local" required value={scheduleValue} onChange={event => setScheduleValue(event.target.value)} /></label><button type="submit" disabled={working}>Lưu giờ hẹn</button></form> : null}
    </div>
  </section>;
}
