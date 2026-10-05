import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const COLOR_EDIT_PRESET = 'iphone-color-edit-v1';
export const COLOR_EDIT_SETTINGS = Object.freeze({ exposure: -20, brilliance: -15, highlights: 15,
  contrast: -4, brightness: -10, blackPoint: 8, sharpness: 15, definition: 18 });

// Deterministic approximation, not Apple's proprietary slider conversion.
export async function renderColorEdit(source: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(source, { limitInputPixels: 40_000_000 }).rotate()
    .resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const s = COLOR_EDIT_SETTINGS;
  for (let i = 0; i < data.length; i += 3) {
    const y = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    let tone = y * Math.pow(2, s.exposure / 100);
    tone += s.brilliance / 100 * 0.25 * Math.sin(Math.PI * y);
    tone += s.highlights / 100 * 0.35 * Math.pow(y, 3);
    tone = (tone - 0.5) * (1 + s.contrast / 100) + 0.5 + s.brightness / 100 * 0.3;
    tone -= s.blackPoint / 100 * 0.25 * Math.pow(1 - y, 2);
    // A soft shadow toe retains detail in already dark photographs.
    tone = Math.max(y * 0.35, Math.min(1, tone));
    const gain = y > 0 ? tone / y : 0;
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(Math.min(255, data[i + c] * gain));
  }
  const raw = { width: info.width, height: info.height, channels: 3 as const };
  const fine = await sharp(data, { raw }).blur(0.6).raw().toBuffer();
  const broad = await sharp(data, { raw }).blur(2).raw().toBuffer();
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    const delta = Math.max(-8, Math.min(8,
      (data[i] - fine[i]) * s.sharpness / 100 + (data[i] - broad[i]) * s.definition / 100));
    out[i] = Math.round(Math.max(data[i] * 0.5, Math.min(255, data[i] + delta)));
  }
  return sharp(out, { raw }).png().toBuffer();
}

const pending = new Map<string, Promise<Buffer>>();
const pngCrcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function assertCompletePng(body: Buffer): void {
  if (body.length < 45 || !body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('Invalid derived PNG signature');
  }
  let offset = 8, hasImageData = false;
  while (offset + 12 <= body.length) {
    const length = body.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > body.length) throw new Error('Truncated derived PNG chunk');
    const type = body.toString('ascii', offset + 4, offset + 8);
    let crc = 0xffffffff;
    for (let i = offset + 4; i < end - 4; i++) crc = pngCrcTable[(crc ^ body[i]) & 255] ^ (crc >>> 8);
    if (((crc ^ 0xffffffff) >>> 0) !== body.readUInt32BE(end - 4)) throw new Error('Derived PNG checksum mismatch');
    if (offset === 8) {
      if (type !== 'IHDR' || length !== 13) throw new Error('Invalid derived PNG header');
      const width = body.readUInt32BE(offset + 8), height = body.readUInt32BE(offset + 12);
      if (!width || !height || width > 4096 || height > 4096) throw new Error('Invalid derived PNG dimensions');
    }
    if (type === 'IDAT') hasImageData = true;
    if (type === 'IEND') {
      if (length !== 0 || end !== body.length || !hasImageData) throw new Error('Invalid derived PNG end');
      return;
    }
    offset = end;
  }
  throw new Error('Missing derived PNG end');
}

let running = 0;
const waiters: Array<() => void> = [];
async function limited<T>(work: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>(resolve => waiters.push(resolve));
  else running++;
  try { return await work(); }
  finally { const next = waiters.shift(); if (next) next(); else running--; }
}

export async function getColorEditAsset(source: Buffer, dataRoot: string, preset: string): Promise<Buffer> {
  if (preset !== COLOR_EDIT_PRESET) throw new Error('Bộ màu không được hỗ trợ.');
  const key = createHash('sha256').update(preset).update('pipeline-1').update(source).digest('hex');
  const folder = path.join(dataRoot, 'photo-preset-cache', preset);
  const target = path.join(folder, key + '.png');
  if (pending.has(target)) return pending.get(target)!;
  const job = limited(async () => {
    try {
      const cached = await fs.readFile(target);
      // Some decoders tolerate a missing IEND or ignore ancillary CRC errors.
      // Verify complete framing and checksums as well as decoding every pixel.
      assertCompletePng(cached);
      // metadata() only reads the header: a truncated IDAT can still pass it.
      // stats() decodes every pixel without allocating a JS raw-image buffer.
      // Treat decoder warnings as corruption, including incomplete PNG streams.
      await sharp(cached, { limitInputPixels: 4096 * 4096, failOn: 'warning' }).stats();
      return cached;
    }
    catch { /* Missing or corrupt derived cache is regenerated. */ }
    const body = await renderColorEdit(source);
    await fs.mkdir(folder, { recursive: true });
    const temporary = target + '.' + randomUUID() + '.tmp';
    try { await fs.writeFile(temporary, body); await fs.rename(temporary, target); }
    finally { await fs.unlink(temporary).catch(() => undefined); }
    return body;
  });
  pending.set(target, job);
  try { return await job; } finally { pending.delete(target); }
}
