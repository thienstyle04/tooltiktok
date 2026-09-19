import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export interface ImageValidation {
  id: string;
  status: 'valid' | 'missing' | 'corrupt' | 'download_failed';
  reason: string;
  checkedAt: string;
  nextRetryAt?: string;
  signature?: string;
}
const stores = new Map<string, Record<string, ImageValidation>>();
const inFlight = new Map<string, Promise<ImageValidation>>();
let activeDecoders = 0;
const decoderWaiters: Array<() => void> = [];
const dirty = new Set<string>();
function persist(dir: string) {
  if (!dirty.has(dir) || !fs.existsSync(dir)) return;
  const target = path.join(dir, 'validation-state.json'), temporary = `${target}.${process.pid}.tmp`;
  try { fs.writeFileSync(temporary, JSON.stringify(store(dir))); fs.renameSync(temporary, target); dirty.delete(dir); } catch { /* verification remains usable in memory */ }
}
export function recordImageDownloadFailure(dir: string, id: string, reason: string): void {
  store(dir)[id] = { id, status: 'download_failed', reason, checkedAt: new Date().toISOString(), nextRetryAt: new Date(Date.now() + 1800000).toISOString() };
  dirty.add(dir);
  persist(dir);
}
function store(dir: string) {
  if (!stores.has(dir)) {
    try { stores.set(dir, JSON.parse(fs.readFileSync(path.join(dir, 'validation-state.json'), 'utf8'))); }
    catch { stores.set(dir, {}); }
  }
  return stores.get(dir)!;
}
function signature(bin: string, meta: string) {
  const a = fs.statSync(bin), b = fs.statSync(meta);
  return `${a.size}:${a.mtimeMs}:${b.size}:${b.mtimeMs}`;
}
export function cachedValidation(dir: string, id: string): ImageValidation | undefined {
  try {
    const record = store(dir)[id];
    return record?.signature === signature(path.join(dir, `${id}.bin`), path.join(dir, `${id}.json`)) ? record : undefined;
  } catch { return undefined; }
}
export async function decodeRealImage(body: Buffer): Promise<void> {
  if (activeDecoders >= 2) await new Promise<void>(resolve => decoderWaiters.push(resolve));
  else activeDecoders++;
  try {
  // Metadata alone does not force pixel decoding. stats() reads the full image.
  const decoder = sharp(body, { failOn: 'warning', limitInputPixels: 80000000 });
  const meta = await decoder.metadata();
  if (!['jpeg', 'png', 'webp', 'gif', 'avif', 'heif', 'tiff'].includes(meta.format || '') || !meta.width || !meta.height) throw new Error('Không phải ảnh raster hỗ trợ');
  await decoder.stats();
  } finally {
    const next = decoderWaiters.shift();
    if (next) next(); else activeDecoders--;
  }
}
export async function validateLocalImage(dir: string, id: string): Promise<ImageValidation> {
  const key = `${dir}/${id}`;
  if (inFlight.has(key)) return inFlight.get(key)!;
  const task = (async () => {
    const checkedAt = new Date().toISOString();
    const record: ImageValidation = { id, status: 'missing', reason: 'Chưa có cache hoàn chỉnh trên máy', checkedAt, nextRetryAt: new Date(Date.now() + 1800000).toISOString() };
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) return { ...record, status: 'corrupt' as const, reason: 'Drive ID không hợp lệ' };
    const bin = path.join(dir, `${id}.bin`), meta = path.join(dir, `${id}.json`);
    try {
      if (fs.existsSync(bin) && fs.existsSync(meta)) {
        const previous = cachedValidation(dir, id);
        if (previous) return previous;
        record.signature = signature(bin, meta);
        record.status = 'corrupt';
        const info = JSON.parse(await fs.promises.readFile(meta, 'utf8'));
        const body = await fs.promises.readFile(bin);
        if (info.isFallback || info.placeholder || (info.fileId && info.fileId !== id)) throw new Error('Cache là placeholder hoặc không đúng Drive ID');
        if (!String(info.contentType).startsWith('image/') || String(info.contentType).includes('svg') || (info.contentLength != null && info.contentLength !== body.length)) throw new Error('Metadata/nội dung cache không khớp');
        await decodeRealImage(body);
        if (record.signature !== signature(bin, meta)) throw new Error('Ảnh thay đổi trong khi xác minh');
        record.status = 'valid'; record.reason = ''; delete record.nextRetryAt;
      }
    } catch (error) { record.reason = error instanceof Error ? error.message : String(error); }
    const previous = store(dir)[id];
    if (record.status === 'missing' && previous?.status === 'download_failed') return previous;
    store(dir)[id] = record;
    dirty.add(dir);
    return record;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, task);
  return task;
}
export async function validateLocalImages(dir: string, ids: string[]): Promise<ImageValidation[]> {
  const unique = [...new Set(ids)];
  const results: ImageValidation[] = new Array(unique.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(2, unique.length) }, async () => {
    while (index < unique.length) { const i = index++; results[i] = await validateLocalImage(dir, unique[i]); }
  }));
  persist(dir);
  return results;
}
