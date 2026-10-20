'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Icon from '../ui/Icon';
import { apiFetch, formatApiError } from '../../lib/apiClient';
import { timeAgo } from './usePersisted';

const ACTIVE_RUN = new Set(['queued', 'refreshing', 'warming', 'generating', 'awaiting-export', 'exporting']);
const RUN_STATUS = { completed: 'Hoàn tất', partial: 'Xong một phần', failed: 'Lỗi', cancelled: 'Đã hủy', missed: 'Bị lỡ', interrupted: 'Bị gián đoạn' };
export const looksLikeError = text => /^(Không|Chưa|Lỗi|Cần)|thất bại|lỗi HTTP|Gọi .* thất bại/i.test(String(text || '').trim());

// Theo dõi chuyển trạng thái của controller để ghi lịch sử tác vụ (xuất, tạo/xóa list, cập nhật nguồn).
export function useTaskRecorder(studio, record) {
  const { progress, busy, status, manualSyncProgress } = studio;
  const exportPhase = useRef('idle');
  const busyRun = useRef(null);
  const syncPhase = useRef(null);
  useEffect(() => {
    const phase = progress.failed ? 'failed' : progress.visible && progress.value >= 100 ? 'done' : progress.visible ? 'running' : 'idle';
    if (phase === exportPhase.current) return;
    if (phase === 'done' || phase === 'failed') record({ kind: 'export', status: phase, title: 'Xuất file', detail: progress.label });
    if (busyRun.current && phase !== 'idle') busyRun.current.export = true;
    exportPhase.current = phase;
  }, [progress, record]);
  useEffect(() => {
    if (busy && !busyRun.current) busyRun.current = { title: status, export: false };
    else if (busy && busyRun.current && /^Đang/.test(status)) busyRun.current.title = status;
    else if (!busy && busyRun.current) {
      const run = busyRun.current; busyRun.current = null;
      if (!run.export) record({ kind: /xóa/i.test(run.title) ? 'delete' : 'create', status: looksLikeError(status) ? 'failed' : 'done', title: run.title.replace(/\.\.\.$|…$/, ''), detail: status });
    }
  }, [busy, status, record]);
  useEffect(() => {
    const phase = manualSyncProgress?.phase;
    if (!phase || phase === syncPhase.current) return;
    if (phase === 'complete' || phase === 'error') record({ kind: 'sync', status: phase === 'error' ? 'failed' : 'done', title: 'Cập nhật nguồn dữ liệu', detail: manualSyncProgress.message });
    syncPhase.current = phase;
  }, [manualSyncProgress, record]);
}

function Card({ icon, status, title, detail, value, children }) {
  return (
    <article className="v2-task" data-status={status}>
      <span className="v2-task-icon"><Icon name={status === 'failed' ? 'alert' : status === 'done' ? 'check' : icon} size={17} /></span>
      <div>
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
        {value !== undefined ? <div className="v2-task-bar" data-indeterminate={value === null || undefined}><motion.span animate={{ width: `${value ?? 35}%` }} transition={{ ease: 'linear', duration: 0.2 }} /></div> : null}
      </div>
      {children}
    </article>
  );
}

export default function TaskCenter({ studio, open, onClose, history, onClearHistory }) {
  const { manualJob, busy, status, progress, automationState, loadAutomationState, manualSyncProgress, manualSyncTerminal, setManualSyncVisible, driveCacheStatus, setStatus } = studio;
  const runs = automationState.runs || [];
  const activeRuns = runs.filter(run => ACTIVE_RUN.has(run.status));
  const finishedRuns = runs.filter(run => !ACTIVE_RUN.has(run.status)).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 5);
  const exporting = progress.visible && progress.value < 100;
  // Hủy yêu cầu tạo list đang xếp hàng: đang hủy → đã gửi hủy; lỗi thì cho thử lại (như thanh trạng thái cũ).
  const [cancel, setCancel] = useState({ id: null, state: 'idle' });
  const jobKey = manualJob ? `${manualJob.id}:${manualJob.status}` : '';
  useEffect(() => { setCancel({ id: null, state: 'idle' }); }, [jobKey]);
  const cancelState = cancel.id === manualJob?.id ? cancel.state : 'idle';
  const cancelJob = async () => {
    if (!manualJob || manualJob.status !== 'queued' || cancelState === 'pending' || cancelState === 'sent') return;
    const id = manualJob.id;
    setCancel({ id, state: 'pending' });
    try {
      const response = await apiFetch(`/api/automation/manual-generation/${encodeURIComponent(id)}/cancel`, { method: 'POST', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(await formatApiError(response, 'Yêu cầu đã bắt đầu hoặc không thể hủy.'));
      setCancel(previous => (previous.id === id ? { id, state: 'sent' } : previous));
    } catch (error) {
      setCancel(previous => (previous.id === id ? { id, state: 'error' } : previous));
      setStatus(error?.message || 'Không thể hủy yêu cầu. Hãy kiểm tra trạng thái rồi thử lại.');
    }
  };
  const runAction = async (path, fallback) => {
    try {
      const response = await apiFetch(path, { method: 'POST', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(await formatApiError(response, fallback));
      await loadAutomationState();
    } catch (error) { setStatus(error.message || fallback); }
  };
  const recent = [
    ...history.map(entry => ({ ...entry, sort: Date.parse(entry.at) })),
    ...finishedRuns.map(run => ({ id: `run-${run.id}`, kind: 'schedule', run, status: run.status === 'completed' ? 'done' : ['failed', 'interrupted', 'partial'].includes(run.status) ? 'failed' : 'cancelled', title: `Lịch “${run.scheduleName}” · ${RUN_STATUS[run.status] || run.status}`, detail: run.phase, at: run.updatedAt, sort: Date.parse(run.updatedAt) })),
  ].sort((a, b) => b.sort - a.sort).slice(0, 12);
  const activeCount = (manualJob ? 1 : 0) + (busy && !manualJob && !exporting ? 1 : 0) + (exporting ? 1 : 0) + activeRuns.length + (manualSyncProgress && !manualSyncTerminal ? 1 : 0) + (!driveCacheStatus.ready ? 1 : 0);

  return (
    <AnimatePresence>
      {open ? (
        <motion.section className="v2-task-center" role="dialog" aria-label="Trung tâm tác vụ"
          initial={{ opacity: 0, y: -10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ type: 'spring', duration: 0.4, bounce: 0.25 }}
          onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
          <header><h3>Tác vụ</h3><button type="button" className="v2-icon-button" aria-label="Đóng trung tâm tác vụ" onClick={onClose}><Icon name="close" /></button></header>
          <p className="v2-task-heading">Đang chạy & chờ lượt · {activeCount}</p>
          {manualJob ? <Card icon="create" status={manualJob.status} title="Tạo list" detail={manualJob.status === 'queued' ? (cancelState === 'sent' ? 'Đã gửi yêu cầu hủy; đang chờ xác nhận.' : 'Đang chờ lượt hiện tại hoàn tất — chạy lần lượt để máy không quá tải.') : 'Đang tạo list từ yêu cầu đã xếp hàng…'} value={null}>
            {manualJob.status === 'queued' ? <button type="button" className="toolbar-button" disabled={cancelState === 'pending' || cancelState === 'sent'} onClick={cancelJob}>
              {cancelState === 'pending' ? 'Đang hủy...' : cancelState === 'sent' ? 'Đã gửi hủy' : 'Hủy yêu cầu'}
            </button> : null}
          </Card> : null}
          {busy && !manualJob && !exporting ? <Card icon="sparkle" status="running" title="Đang xử lý" detail={status} value={null} /> : null}
          {exporting ? <Card icon="export" status="running" title="Xuất file" detail={progress.label} value={progress.value} /> : null}
          {activeRuns.map(run => <Card key={run.id} icon="auto" status="running" title={`Lịch “${run.scheduleName}”`} detail={run.phase} value={run.progress || 0}>
            <button type="button" className="toolbar-button" disabled={run.cancelRequested} onClick={() => runAction(`/api/automation/runs/${encodeURIComponent(run.id)}/cancel`, 'Chưa hủy được lượt chạy.')}>{run.cancelRequested ? 'Đang hủy…' : 'Hủy lượt'}</button>
          </Card>)}
          {manualSyncProgress && !manualSyncTerminal ? <Card icon="sync" status="running" title="Cập nhật nguồn dữ liệu" detail={manualSyncProgress.message} value={manualSyncProgress.total ? Math.min(100, manualSyncProgress.completed / manualSyncProgress.total * 100) : null}>
            <button type="button" className="toolbar-button" onClick={() => setManualSyncVisible(true)}>Xem</button>
          </Card> : null}
          {!driveCacheStatus.ready ? <Card icon="sync" status="running" title="Chuẩn bị ảnh Google Drive" detail={driveCacheStatus.message} value={driveCacheStatus.percent || 0} /> : null}
          {!activeCount ? <p className="v2-muted">Không có tác vụ nào đang chạy.</p> : null}
          <p className="v2-task-heading">Gần đây</p>
          {recent.map(entry => <Card key={entry.id} icon={entry.kind === 'export' ? 'export' : entry.kind === 'sync' ? 'sync' : entry.kind === 'schedule' ? 'auto' : entry.kind === 'delete' ? 'trash' : 'create'}
            status={entry.status} title={entry.title} detail={[timeAgo(entry.at), entry.detail].filter(Boolean).join(' · ')}>
            {entry.run && ['failed', 'partial', 'cancelled', 'interrupted'].includes(entry.run.status) ? <button type="button" className="toolbar-button" disabled={automationState.locked} onClick={() => runAction(`/api/automation/runs/${encodeURIComponent(entry.run.id)}/retry`, 'Chưa thử lại được lượt chạy.')}>Thử lại</button> : null}
          </Card>)}
          {!recent.length ? <p className="v2-muted">Chưa có lịch sử.</p> : null}
          {history.length ? <button type="button" className="v2-link" onClick={onClearHistory}>Xóa lịch sử trên máy này</button> : null}
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}

export function taskBadge(studio) {
  const { manualJob, busy, progress, automationState, manualSyncProgress, manualSyncTerminal } = studio;
  return (manualJob ? 1 : 0) + (busy && !manualJob ? 1 : 0) + (progress.visible && progress.value < 100 && !busy ? 1 : 0)
    + (automationState.runs || []).filter(run => ACTIVE_RUN.has(run.status)).length + (manualSyncProgress && !manualSyncTerminal ? 1 : 0);
}
