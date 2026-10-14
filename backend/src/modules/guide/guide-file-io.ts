// ─── Đọc/ghi file dữ liệu của GuideService (không giữ trạng thái) ─────────────
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_DESTINATION_ID, DestinationId } from './sync/destination-config';

/** Sleep đồng bộ ngắn (không await) dùng cho retry ghi file — an toàn vì chỉ chờ tối đa vài trăm ms. */
function sleepSyncMs(ms: number): void {
  const view = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(view, 0, 0, ms);
}

/**
 * Ghi file JSON qua file tạm rồi rename (atomic hơn) + retry ngắn khi gặp lỗi
 * khoá file thoáng qua trên Windows (Defender/OneDrive quét file lúc đang ghi
 * ra "UNKNOWN: unknown error, open ..." hoặc EBUSY). Tránh việc create/delete
 * list bị 500 giữa chừng do va lỗi ghi đè cùng lúc.
 */
export function writeJsonFileSafe(targetPath: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  const tmpPath = `${targetPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const maxAttempts = 5;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      fs.writeFileSync(tmpPath, json, 'utf-8');
      fs.renameSync(tmpPath, targetPath);
      return;
    } catch (error) {
      lastError = error;
      try { fs.unlinkSync(tmpPath); } catch { /* file tạm có thể chưa được tạo, bỏ qua */ }
      if (attempt < maxAttempts) sleepSyncMs(50 * attempt);
    }
  }
  throw lastError;
}

export function ensureDataRoot(dataRoot: string): void {
  fs.mkdirSync(dataRoot, { recursive: true });
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** `<dataRoot>/<baseName>.<nguồn>.json` — file riêng của từng nguồn dữ liệu. */
export function getDestinationDataPath(dataRoot: string, baseName: string, destinationId: DestinationId): string {
  return path.join(dataRoot, `${baseName}.${destinationId}.json`);
}

/** Như trên, nhưng nguồn mặc định vẫn đọc được file cũ `<baseName>.json` nếu chưa có file riêng. */
export function resolveDestinationDataPath(dataRoot: string, baseName: string, destinationId: DestinationId): string {
  const scopedPath = getDestinationDataPath(dataRoot, baseName, destinationId);
  if (fs.existsSync(scopedPath)) return scopedPath;
  const legacyPath = path.join(dataRoot, `${baseName}.json`);
  if (destinationId === DEFAULT_DESTINATION_ID && fs.existsSync(legacyPath)) return legacyPath;
  return scopedPath;
}
