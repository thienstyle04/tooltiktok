// ─── Ảnh thu nhỏ cho thumbnail slide trên giao diện ──────────────────────────
// Thư viện mẫu, hàng chờ và dải trang chỉ hiển thị slide rộng ~40–120 px, nhưng
// ảnh Drive gốc có thể tới 3000 px / vài MB: tải và giải mã chúng làm khựng khi cuộn.
// Bản thu nhỏ chỉ dùng cho giao diện; preview lớn và ảnh xuất vẫn dùng ảnh gốc.
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';
import type { DriveFileAsset } from './sync/drive-images';

export const DRIVE_THUMB_WIDTH = 360;
const VERSION = 'thumb-1';
const MAX_PARALLEL = 2;
const pending = new Map<string, Promise<DriveFileAsset>>();
let running = 0;
const waiting: Array<() => void> = [];

async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>(resolve => waiting.push(resolve));
  running++;
  try { return await task(); } finally { running--; waiting.shift()?.(); }
}

const asAsset = (body: Buffer): DriveFileAsset => ({ body, contentLength: body.length, contentType: 'image/webp' });

/** Trả bản WebP rộng tối đa DRIVE_THUMB_WIDTH px, cache trên đĩa theo nội dung ảnh gốc. */
export async function driveThumbnail(source: DriveFileAsset, dataRoot: string): Promise<DriveFileAsset> {
  // Ảnh thay thế (chưa có cache hợp lệ) giữ nguyên để giao diện vẫn báo đúng trạng thái.
  if (source.isFallback || !/^image\/(jpeg|png|webp)/i.test(source.contentType)) return source;
  const key = createHash('sha256').update(VERSION).update(String(DRIVE_THUMB_WIDTH)).update(source.body).digest('hex');
  const folder = path.join(dataRoot, 'drive-file-cache-thumbs');
  const target = path.join(folder, key + '.webp');
  if (pending.has(target)) return pending.get(target)!;
  const job = limited(async () => {
    try {
      const cached = await fs.readFile(target);
      await sharp(cached, { failOn: 'warning' }).stats(); // Giải mã hết: file cache bị cắt dở cũng bị phát hiện.
      return asAsset(cached);
    } catch { /* Chưa có hoặc hỏng: dựng lại. */ }
    let body: Buffer;
    try {
      body = await sharp(source.body, { limitInputPixels: 8192 * 8192 })
        .rotate()
        .resize({ width: DRIVE_THUMB_WIDTH, withoutEnlargement: true })
        .webp({ quality: 74 })
        .toBuffer();
    } catch {
      return source; // Ảnh lạ sharp không đọc được: trả ảnh gốc, không làm hỏng giao diện.
    }
    await fs.mkdir(folder, { recursive: true });
    const temporary = target + '.' + randomUUID() + '.tmp';
    try { await fs.writeFile(temporary, body); await fs.rename(temporary, target); }
    catch { /* Không ghi được cache vẫn trả ảnh đã thu nhỏ. */ }
    finally { await fs.unlink(temporary).catch(() => undefined); }
    return asAsset(body);
  });
  pending.set(target, job);
  try { return await job; } finally { pending.delete(target); }
}
