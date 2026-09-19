import { AsyncLocalStorage } from 'node:async_hooks';

export function vietnamSyncWindow(now = Date.now()): { allowed: boolean; night: string; nextStart: string } {
  const local = new Date(now + 7 * 3600000);
  const hour = local.getUTCHours();
  const day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return {
    allowed: hour >= 23 || hour < 6,
    night: new Date(day - (hour < 6 ? 86400000 : 0)).toISOString().slice(0, 10),
    nextStart: new Date(day + (hour >= 23 ? 86400000 : 0) + 16 * 3600000).toISOString(),
  };
}

type Permit = { initial?: boolean; manual?: boolean; signal: AbortSignal; waitForIdle: () => Promise<void> };
const permits = new AsyncLocalStorage<Permit>();
const localOnly = new AsyncLocalStorage<boolean>();
export function isLocalDataOnly(): boolean { return Boolean(localOnly.getStore()); }
export function withLocalDataOnly<T>(task: () => Promise<T>): Promise<T> { return localOnly.run(true, task); }
let enforced = false;
export function enableNightSyncPolicy(): void { enforced = true; }
export function hasSyncPermit(): boolean {
  if (localOnly.getStore()) return false;
  const permit = permits.getStore();
  return !enforced || Boolean(permit && !permit.signal.aborted && (permit.manual || permit.initial || vietnamSyncWindow().allowed));
}
export function withSyncPermit<T>(permit: Permit, task: () => Promise<T>): Promise<T> {
  return permits.run(permit, task);
}

/** Complete the response body inside the permit lifetime, not just HTTP headers. */
export async function syncFetch(input: string, init: RequestInit = {}): Promise<Response> {
  if (localOnly.getStore()) throw new Error('Tạo list chỉ dùng dữ liệu cục bộ. Hãy cập nhật dữ liệu trước.');
  if (!enforced) return fetch(input, init);
  const permit = permits.getStore();
  if (!permit || !hasSyncPermit()) throw new Error('Chỉ cập nhật dữ liệu trong 23:00–06:00 giờ Việt Nam.');
  await permit.waitForIdle();
  if (!hasSyncPermit()) throw new Error('Đã hết khung giờ cập nhật dữ liệu.');
  const controller = new AbortController();
  const signals = [controller.signal, permit.signal, ...(init.signal ? [init.signal] : [])];
  const timer = setInterval(() => {
    if (!permit.manual && !permit.initial && !vietnamSyncWindow().allowed) controller.abort();
  }, 250);
  timer.unref();
  try {
    const response = await fetch(input, { ...init, signal: AbortSignal.any(signals) });
    const body = await response.arrayBuffer();
    return new Response([204, 205, 304].includes(response.status) ? null : body,
      { status: response.status, statusText: response.statusText, headers: response.headers });
  } finally { clearInterval(timer); }
}
