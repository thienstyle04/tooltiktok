import { apiFetch } from './apiClient';

// Read-only diagnostics. A healthy server/cache does NOT prove the sync succeeded.
export async function diagnoseUnconfirmedSheetSync() {
  try {
    const health = await apiFetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!health.ok) throw new Error('health unavailable');
    const cache = await apiFetch('/api/drive-cache/status', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const state = cache.ok ? await cache.json() : null;
    return `Backend vẫn phản hồi. ${state?.ready === false ? 'Cache ảnh đang chuẩn bị.' : state?.ready === true ? 'Cache ảnh báo sẵn sàng.' : 'Chưa kiểm tra được cache ảnh.'} Chưa xác nhận đồng bộ hoàn tất; dữ liệu đang hiển thị được giữ nguyên. Không bấm đồng bộ lại khi lượt cũ có thể còn chạy.`;
  } catch {
    return 'Chưa kiểm tra được backend; không thể xác nhận đồng bộ thành công hay thất bại. Dữ liệu đang hiển thị được giữ nguyên. Hãy kiểm tra log start.bat trước khi thử lại.';
  }
}
