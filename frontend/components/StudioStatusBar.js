import { useEffect, useRef, useState } from 'react';

export default function StudioStatusBar({ status, job, automationState, onCancel, onError }) {
  const [cancelPending, setCancelPending] = useState(false);
  const [cancelSent, setCancelSent] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const currentJob = useRef(job); currentJob.current = job;
  useEffect(() => { setCancelPending(false); setCancelSent(false); setCancelError(''); }, [job?.id, job?.status]);
  const queued = job?.status === 'queued';
  const running = job?.status === 'running';
  const automated = automationState?.locked && !queued && !running;
  const activeRun = automationState?.runs?.find(run => run.id === automationState.activeRunId);
  const text = queued
    ? cancelError || (cancelSent ? 'Đã gửi yêu cầu hủy; đang chờ xác nhận.' : 'Đã xếp hàng — chờ lượt hiện tại hoàn tất.')
    : running ? 'Đang tạo list từ yêu cầu đã xếp hàng...'
      : automated ? `Đang chạy lịch tự động: ${activeRun?.phase || 'Các thao tác thay đổi dữ liệu đang tạm khóa.'}` : status;
  async function cancel() {
    if (!queued || cancelPending || cancelSent) return;
    const id = job.id;
    setCancelPending(true); setCancelError('');
    try { await onCancel(id); if (currentJob.current?.id === id && currentJob.current?.status === 'queued') setCancelSent(true); }
    catch (error) {
      if (currentJob.current?.id !== id) return;
      const message = error?.message || 'Không thể hủy yêu cầu. Hãy kiểm tra trạng thái rồi thử lại.';
      setCancelError(message); onError?.(message);
    }
    finally { if (currentJob.current?.id === id) setCancelPending(false); }
  }
  return <div className="status-strip studio-status-bar" data-job-state={queued ? 'queued' : running ? 'running' : automated ? 'automated' : 'idle'}>
    <span className="status-dot" aria-hidden="true" />
    <p id="statusText" className="status-text" role="status" aria-live="polite" aria-atomic="true" title={text}>{text}</p>
    <div className="studio-status-action">
      {queued && <button type="button" className="toolbar-button studio-status-cancel" onClick={cancel} disabled={cancelPending || cancelSent}>
        {cancelPending ? 'Đang hủy...' : cancelSent ? 'Đã gửi hủy' : 'Hủy yêu cầu'}
      </button>}
    </div>
  </div>;
}
