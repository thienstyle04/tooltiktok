'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { listIsMain } from '../lib/utils';

const DALAT_ONLY_DECKS = new Set([
  'spotlight-v6-diary', 'spotlight-v5', 'spotlight-v6-green', 'spotlight-v6-dark', 'spotlight-v6-persimmon', 'spotlight-v6-maps',
  'itinerary-note-2days', 'itinerary-note-timed', 'carousel-mau-1', 'one-way-story',
]);
const DALAT_EXTRA_DECKS = [
  { id: 'spotlight-v5', navTitle: 'Spotlight V5' },
  { id: 'spotlight-v6-green', navTitle: 'Spotlight V6 Mảng xanh' },
  { id: 'spotlight-v6-dark', navTitle: 'Spotlight V6 Tone đen' },
  { id: 'spotlight-v6-persimmon', navTitle: 'Spotlight Mùa hồng' },
  { id: 'spotlight-v6-maps', navTitle: 'Spotlight V6 Google Maps' },
  { id: 'spotlight-v6-diary', navTitle: 'Spotlight Nhật ký Đà Lạt' },
  { id: 'summary-note', navTitle: 'Tổng hợp địa điểm' },
  { id: 'itinerary-note-2days', navTitle: 'Lịch trình Note 2 ngày' },
  { id: 'itinerary-note-timed', navTitle: 'Lịch trình Note theo giờ' },
  { id: 'carousel-mau-1', navTitle: 'Carousel mẫu 1' },
  { id: 'one-way-story', navTitle: 'Đường một chiều' },
];

const STATUS_LABELS = {
  queued: 'Đang chờ', refreshing: 'Đang cập nhật Sheet', warming: 'Đang tải ảnh', generating: 'Đang tạo list',
  'awaiting-export': 'Chờ render', exporting: 'Đang xuất', completed: 'Hoàn tất', partial: 'Hoàn tất một phần',
  failed: 'Thất bại', cancelled: 'Đã hủy', missed: 'Đã lỡ lịch', interrupted: 'Bị gián đoạn',
};
const SCHEDULE_DRAFT_STORAGE_KEY = 'dalat-carousel:automation-schedule-draft:v2';

function localDateTimeValue(date = new Date(Date.now() + 10 * 60 * 1000)) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((entry) => [entry.type, entry.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

function blankForm(destinationId = 'dalat') {
  return { name: '', destinationId, frequency: 'once', onceAt: localDateTimeValue(), dailyTime: '09:00', outputDir: '', outputFileName: '', outputPath: '', hookMode: 'normal', sourceId: '', templates: [] };
}

function loadDraftForm(destinationId) {
  const empty = blankForm(destinationId);
  if (typeof window === 'undefined') return empty;
  try {
    const saved = JSON.parse(window.localStorage.getItem(SCHEDULE_DRAFT_STORAGE_KEY) || '{}');
    const outputDir = String(saved.outputDir || '').trim();
    const outputFileName = String(saved.outputFileName || '').trim();
    return {
      ...empty,
      name: String(saved.name || '').slice(0, 80),
      destinationId: String(saved.destinationId || destinationId),
      frequency: saved.frequency === 'daily' ? 'daily' : 'once',
      onceAt: String(saved.onceAt || empty.onceAt),
      dailyTime: String(saved.dailyTime || empty.dailyTime),
      outputDir,
      outputFileName,
      outputPath: outputDir ? String(saved.outputPath || (outputFileName ? `${outputDir}\\${outputFileName}` : outputDir)) : '',
      hookMode: saved.hookMode === 'festival' ? 'festival' : 'normal',
      sourceId: String(saved.sourceId || ''),
      templates: Array.isArray(saved.templates) ? saved.templates
        .map((entry) => ({ deckId: String(entry?.deckId || ''), count: Math.min(5, Math.max(3, Number(entry?.count) || 3)) }))
        .filter((entry) => entry.deckId) : [],
    };
  } catch {
    return empty;
  }
}

function nextCreateForm(previous) {
  return {
    ...previous,
    name: '',
    onceAt: localDateTimeValue(),
    templates: [],
  };
}

async function payloadOrError(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.message || payload?.error || `HTTP ${response.status}`));
  return payload;
}

export default function AutomationSchedulerPanel({ dataset, destinations, hookSourcesInfo, automationState, onStateChange }) {
  const currentDestinationId = dataset?.source?.destinationId || 'dalat';
  const state = automationState || { schedules: [], runs: [], minListsPerTemplate: 3, maxListsPerTemplate: 5 };
  const minListsPerTemplate = Number(state.minListsPerTemplate) || 3;
  const maxListsPerTemplate = Number(state.maxListsPerTemplate) || 5;
  const [form, setForm] = useState(() => loadDraftForm(currentDestinationId));
  const [editingId, setEditingId] = useState('');
  const [section, setSection] = useState('create');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const outputPickerReady = state.outputPicker === 'save-file-v1';

  const decks = useMemo(() => {
    const entries = new Map((dataset?.decks || [])
      .filter((deck) => deck.id !== 'spotlight-partner' && (deck.lists || []).some((list) => listIsMain(list)))
      .map((deck) => [deck.id, deck]));
    if (form.destinationId === 'dalat') {
      for (const deck of DALAT_EXTRA_DECKS) if (!entries.has(deck.id)) entries.set(deck.id, deck);
    }
    return [...entries.values()].filter((deck) => form.destinationId === 'dalat' || !DALAT_ONLY_DECKS.has(deck.id));
  }, [dataset, form.destinationId]);
  const total = form.templates.reduce((sum, entry) => sum + Number(entry.count || 0), 0);
  const templateLabel = (id) => dataset?.decks?.find(deck => deck.id === id)?.navTitle
    || DALAT_EXTRA_DECKS.find(deck => deck.id === id)?.navTitle || id;
  const festivalSources = (hookSourcesInfo?.sources || []).filter((entry) => entry.cacheStatus === 'ready');
  const saveDisabledReason = busy
    ? 'Đang lưu lịch...'
    : !form.outputDir
    ? 'Hãy chọn file ZIP.'
    : form.templates.length < 1
    ? 'Hãy chọn ít nhất một mẫu.'
    : form.templates.some((entry) => Number(entry.count) < minListsPerTemplate || Number(entry.count) > maxListsPerTemplate)
    ? `Mỗi mẫu phải có từ ${minListsPerTemplate} đến ${maxListsPerTemplate} list.`
    : '';

  useEffect(() => {
    try {
      window.localStorage.setItem(SCHEDULE_DRAFT_STORAGE_KEY, JSON.stringify(form));
    } catch {
      // Trình duyệt chặn localStorage không được làm hỏng chức năng Hẹn giờ.
    }
  }, [form]);

  useEffect(() => {
    if (form.outputDir) return;
    const latest = [...(state.schedules || []), ...(state.runs || [])]
      .find((entry) => String(entry?.outputDir || '').trim());
    if (!latest) return;
    const outputDir = String(latest.outputDir || '').trim();
    const outputFileName = String(latest.outputFileName || '').trim();
    setForm((current) => current.outputDir ? current : {
      ...current,
      outputDir,
      outputFileName,
      outputPath: outputFileName ? `${outputDir}\\${outputFileName}` : outputDir,
    });
    setMessage('Đã khôi phục nơi lưu từ lịch gần nhất.');
  }, [form.outputDir, state.runs, state.schedules]);

  const mutate = async (path, options = {}) => {
    setBusy(true); setMessage('Đang xử lý...');
    try {
      const next = await payloadOrError(await apiFetch(path, options));
      onStateChange?.(next); setMessage('Đã lưu thay đổi.');
      return next;
    } catch (error) { setMessage(`Lỗi: ${error.message}`); throw error; }
    finally { setBusy(false); }
  };

  const toggleTemplate = (deckId, checked) => setForm((current) => {
    setMessage('');
    return {
      ...current,
      templates: checked
        ? [...current.templates, { deckId, count: minListsPerTemplate }]
        : current.templates.filter((entry) => entry.deckId !== deckId),
    };
  });

  const setTemplateCount = (deckId, requestedCount) => setForm((current) => {
    const count = Math.min(maxListsPerTemplate, Math.max(minListsPerTemplate, Number(requestedCount) || minListsPerTemplate));
    if (Number(requestedCount) > maxListsPerTemplate || Number(requestedCount) < minListsPerTemplate) {
      setMessage(`Mỗi mẫu được đặt từ ${minListsPerTemplate} đến ${maxListsPerTemplate} list.`);
    } else {
      setMessage('');
    }
    return {
      ...current,
      templates: current.templates.map((entry) => entry.deckId === deckId ? { ...entry, count } : entry),
    };
  });

  const save = async (event) => {
    event.preventDefault();
    if (!form.templates.length || form.templates.some((entry) => Number(entry.count) < minListsPerTemplate || Number(entry.count) > maxListsPerTemplate)) {
      setMessage(`Lỗi: Mỗi mẫu phải có từ ${minListsPerTemplate} đến ${maxListsPerTemplate} list.`);
      return;
    }
    const body = {
      name: form.name, destinationId: form.destinationId, frequency: form.frequency,
      ...(form.frequency === 'once' ? { onceAt: new Date(`${form.onceAt}:00+07:00`).toISOString() } : { dailyTime: form.dailyTime }),
      outputDir: form.outputDir, outputFileName: form.outputFileName, templates: form.templates,
      hook: { mode: form.hookMode, ...(form.hookMode === 'festival' ? { sourceId: form.sourceId } : {}) },
      enabled: true,
    };
    const wasEditing = Boolean(editingId);
    try {
      await mutate(editingId ? `/api/automation/schedules/${encodeURIComponent(editingId)}` : '/api/automation/schedules', {
        method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      setEditingId('');
      setForm(wasEditing ? blankForm(form.destinationId) : nextCreateForm(form));
      setMessage(wasEditing
        ? 'Đã lưu chỉnh sửa.'
        : 'Đã tạo lịch. Nơi lưu và hook được giữ lại; hãy chọn mẫu cho lịch tiếp theo.');
    } catch { /* message set above */ }
  };

  const edit = (schedule) => {
    setSection('create');
    setEditingId(schedule.id);
    setForm({
      name: schedule.name, destinationId: schedule.destinationId, frequency: schedule.frequency,
      onceAt: schedule.onceAt ? localDateTimeValue(new Date(schedule.onceAt)) : localDateTimeValue(),
      dailyTime: schedule.dailyTime || '09:00', outputDir: schedule.outputDir,
      outputFileName: schedule.outputFileName || '',
      outputPath: schedule.outputFileName ? `${schedule.outputDir}\\${schedule.outputFileName}` : schedule.outputDir,
      hookMode: schedule.hook?.mode || 'normal', sourceId: schedule.hook?.sourceId || '',
      templates: (schedule.templates || []).map((entry) => ({ ...entry })),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const chooseDirectory = async () => {
    setBusy(true); setMessage('Đang mở hộp thoại chọn file ZIP của Windows...');
    try {
      const payload = await payloadOrError(await apiFetch('/api/automation/choose-output-directory', { method: 'POST' }));
      if (!payload?.directory || !payload?.fileName || !payload?.path) {
        throw new Error('Backend đang chạy là bản cũ. Hãy đóng tool và chạy lại start.bat để dùng hộp thoại chọn file ZIP mới.');
      }
      setForm((current) => ({ ...current, outputDir: payload.directory, outputFileName: payload.fileName, outputPath: payload.path })); setMessage('Đã chọn nơi lưu và tên file ZIP.');
    } catch (error) { setMessage(`Lỗi: ${error.message}`); }
    finally { setBusy(false); }
  };

  return (
    <section className="automation-panel">
      <header className="automation-head">
        <div><p className="panel-kicker">Bản thử nghiệm</p><h2>Hẹn giờ tạo list và xuất ZIP</h2><p>Tool phải đang chạy. Mỗi mẫu đã chọn sẽ tạo từ {minListsPerTemplate} đến {maxListsPerTemplate} list, theo giờ Việt Nam.</p></div>
        <span className={`automation-browser ${state.browserAvailable ? 'ready' : ''}`}>{state.browserAvailable ? `${state.browserName} sẵn sàng` : 'Thiếu Chrome/Edge'}</span>
      </header>

      <nav className="studio-workflow-steps" aria-label="Quản lý hẹn giờ">{[['create','Tạo / sửa lịch'],['saved','Lịch đã lưu'],['history','Hàng đợi & lịch sử']].map(([id,label])=><button key={id} type="button" aria-current={section===id?'page':undefined} onClick={()=>setSection(id)}>{label}</button>)}</nav>
      {message && <p role="status">{message}</p>}
      <form className="automation-form" style={section==='create'?undefined:{display:'none'}} onSubmit={save}>
        <label><span>Tên lịch</span><input required minLength="2" maxLength="80" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ví dụ: Bài sáng Đà Lạt" /></label>
        <label><span>Destination</span><select value={form.destinationId} onChange={(e) => setForm({ ...form, destinationId: e.target.value, hookMode: 'normal', sourceId: '', templates: [] })}>{(destinations || []).map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
        <label><span>Kiểu lịch</span><select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}><option value="once">Chạy một lần</option><option value="daily">Lặp hằng ngày</option></select></label>
        {form.frequency === 'once' ? <label><span>Ngày giờ bắt đầu</span><input required type="datetime-local" value={form.onceAt} onChange={(e) => setForm({ ...form, onceAt: e.target.value })} /></label> : <label><span>Giờ bắt đầu mỗi ngày</span><input required type="time" value={form.dailyTime} onChange={(e) => setForm({ ...form, dailyTime: e.target.value })} /></label>}
        <label className="automation-output"><span>File ZIP sẽ lưu</span><div><output title={form.outputPath}>{form.outputPath || 'Chưa chọn file ZIP'}</output><button type="button" onClick={chooseDirectory} disabled={busy || !outputPickerReady}>{outputPickerReady ? 'Chọn file ZIP' : 'Cần chạy lại start.bat'}</button></div><small>{outputPickerReady ? 'Windows sẽ mở hộp thoại để chọn thư mục và tên file. Mỗi lượt được đặt trong thư mục riêng nên không ghi đè lượt cũ.' : 'Frontend đang nối với backend cũ. Hãy đóng tool và chạy lại start.bat; tải lại trang không đủ để cập nhật backend.'}</small></label>
        <label><span>Hook của lịch</span><select value={form.hookMode} onChange={(e) => setForm({ ...form, hookMode: e.target.value, sourceId: '' })}><option value="normal">Hook thường</option>{form.destinationId === 'dalat' ? <option value="festival">Hook lễ đã lưu</option> : null}</select></label>
        {form.hookMode === 'festival' ? <label><span>Nguồn Hook lễ</span><select required value={form.sourceId} onChange={(e) => setForm({ ...form, sourceId: e.target.value })}><option value="">Chọn nguồn</option>{festivalSources.map((source) => <option key={source.id} value={source.id}>{source.name} ({source.hookCount})</option>)}</select></label> : null}

        <div className="automation-template-picker">
          <div className="automation-template-title"><strong>Mẫu và số list</strong><span>{form.templates.length} mẫu · {total} list tổng{form.templates.length ? <button className="automation-clear-templates" type="button" onClick={() => { setForm((current) => ({ ...current, templates: [] })); setMessage('Đã bỏ toàn bộ mẫu đang chọn.'); }}>Bỏ chọn tất cả</button> : null}</span></div>
          <p>Mỗi mẫu tạo riêng {minListsPerTemplate}–{maxListsPerTemplate} list; không giới hạn tổng ở 5. Mẫu dùng hook cố định/chủ đề vẫn giữ hook riêng.</p>
          <div className="automation-template-grid">{decks.map((deck) => {
            const selected = form.templates.find((entry) => entry.deckId === deck.id);
            return <label key={deck.id} className={selected ? 'selected' : ''}><input type="checkbox" checked={Boolean(selected)} onChange={(e) => toggleTemplate(deck.id, e.target.checked)} /><span>{deck.navTitle || deck.title}</span>{selected ? <input aria-label={`Số list ${deck.navTitle}`} type="number" min={minListsPerTemplate} max={maxListsPerTemplate} value={selected.count} onChange={(e) => setTemplateCount(deck.id, e.target.value)} /> : null}</label>;
          })}</div>
        </div>
        <div className="automation-form-actions"><button className="toolbar-button primary" disabled={Boolean(saveDisabledReason)} title={saveDisabledReason} aria-busy={busy} type="submit">{busy ? 'Đang lưu...' : editingId ? 'Lưu chỉnh sửa' : 'Tạo lịch'}</button>{!form.outputDir ? <button type="button" onClick={chooseDirectory} disabled={busy || !outputPickerReady}>Chọn file ZIP</button> : null}{editingId ? <button type="button" onClick={() => { setEditingId(''); setForm(blankForm(currentDestinationId)); }}>Hủy sửa</button> : null}<span>{message || saveDisabledReason}</span></div>
      </form>

      <div className="automation-list" hidden={section!=='saved'}>
        <h3>Lịch đã lưu</h3>
        {state.schedules.length ? state.schedules.map((schedule) => <article key={schedule.id}>
          <div><strong>{schedule.name}</strong><small>{schedule.destinationId === 'dalat' ? 'Đà Lạt' : 'Green Land'} · {schedule.templates.map((entry) => `${templateLabel(entry.deckId)} ×${entry.count}`).join(', ')}</small><small>Lần tới: {schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Đang tắt'} · {schedule.outputDir}{schedule.outputFileName ? `\\${schedule.outputFileName}` : ''}</small></div>
          <div className="automation-row-actions"><button onClick={() => mutate(`/api/automation/schedules/${schedule.id}/run-now`, { method: 'POST' })} disabled={busy || state.locked}>Chạy ngay</button><button onClick={() => edit(schedule)} disabled={busy || state.activeRunId && state.runs.find((run) => run.id === state.activeRunId)?.scheduleId === schedule.id}>Sửa</button><button onClick={() => mutate(`/api/automation/schedules/${schedule.id}/enabled`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !schedule.enabled }) })} disabled={busy}>{schedule.enabled ? 'Tắt' : 'Bật'}</button><button onClick={() => mutate(`/api/automation/schedules/${schedule.id}`, { method: 'DELETE' })} disabled={busy}>Xóa</button></div>
        </article>) : <p className="automation-empty">Chưa có lịch tự động.</p>}
      </div>

      <div className="automation-list automation-history" hidden={section!=='history'}>
        <h3>Lịch sử chạy</h3>
        {state.runs.length ? state.runs.map((run) => <article key={run.id}>
          <div><strong>{run.scheduleName} — {STATUS_LABELS[run.status] || run.status}</strong><small>{new Date(run.scheduledFor).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} · {run.listIds.length} list</small><small>{run.phase}</small>{run.outputPath ? <small className="automation-path">{run.outputPath}</small> : null}
            {run.skippedLists?.length > 0 && <details><summary>{run.skippedLists.length} list bị bỏ qua do lỗi ảnh</summary>
              {run.skippedLists.map(list => <div key={`${list.deckId}/${list.listId}`}><strong>{list.label || list.listId}</strong>
                {list.errors.map((error, index) => <small key={index} style={{ overflowWrap: 'anywhere' }}>Trang {error.page} · {error.id || ''}: {error.reason}</small>)}
              </div>)}
            </details>}
          </div>
          <div className="automation-run-progress"><span style={{ width: `${run.progress || 0}%` }} /></div>
          {!['queued','refreshing','warming','generating','awaiting-export','exporting'].includes(run.status) ? (
            <div className="automation-row-actions"><button type="button" disabled={busy || state.activeRunId === run.id} onClick={() => {
              if (window.confirm(`Xóa lịch sử lượt "${run.scheduleName}"? Chỉ xóa bản ghi này, không xóa list đã tạo, file ZIP hoặc lịch hẹn.`)) {
                mutate(`/api/automation/runs/${encodeURIComponent(run.id)}`, { method: 'DELETE' });
              }
            }}>Xóa lịch sử</button></div>
          ) : null}
          <div className="automation-row-actions">{['queued','refreshing','warming','generating','awaiting-export','exporting'].includes(run.status) ? <button onClick={() => mutate(`/api/automation/runs/${run.id}/cancel`, { method: 'POST' })}>Hủy lượt</button> : null}{['partial','failed','cancelled','interrupted'].includes(run.status) ? <button onClick={() => mutate(`/api/automation/runs/${run.id}/retry`, { method: 'POST' })} disabled={busy || state.locked}>Thử lại lỗi</button> : null}</div>
        </article>) : <p className="automation-empty">Chưa có lượt chạy.</p>}
      </div>
    </section>
  );
}
