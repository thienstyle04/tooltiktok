import { apiFetch } from './apiClient';

export async function queuedGeneration(kind, request, destinationId, hookSelection, onJob) {
  const submitted = await apiFetch('/api/automation/manual-generation', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, destinationId, requestId: request.requestId || crypto.randomUUID(), request: { ...request, hookSelection } }),
  });
  if (!submitted.ok) return submitted;
  let job = await submitted.json();
  for (;;) {
    onJob(job);
    if (job.status === 'completed') return new Response(JSON.stringify(job.result), { status: 200 });
    if (job.status === 'cancelled') throw new Error('Đã hủy yêu cầu đang chờ.');
    if (job.status === 'failed') throw new Error(job.error || 'Không tạo được list.');
    await new Promise(resolve => setTimeout(resolve, 2000));
    const response = await apiFetch(`/api/automation/manual-generation/${encodeURIComponent(job.id)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Không đọc được trạng thái hàng đợi. Yêu cầu không được gửi lại tự động; hãy kiểm tra list trước khi tạo lại.');
    job = await response.json();
  }
}
