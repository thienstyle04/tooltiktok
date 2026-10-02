const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const DEFAULT_BASE_URL = 'https://113.161.254.76/dalat-studio/updates/';
const RELEASE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAAyD3MvB4waUtw84aOVaPV6ApmWW9qVjAJuGDTGR9SjA=\n-----END PUBLIC KEY-----`;
const MAX_RELEASE_BYTES = 2 * 1024 * 1024 * 1024;

function parseJsonUtf8(value) {
  // Windows PowerShell 5.1 may write UTF-8 with BOM. Some older files also
  // contain the three BOM bytes decoded as Latin-1; neither is JSON syntax.
  return JSON.parse(String(value).replace(/^(?:\uFEFF|\u00EF\u00BB\u00BF)+/, ''));
}

function baseUrl() {
  const url = new URL(process.env.DALAT_UPDATE_BASE_URL || DEFAULT_BASE_URL);
  if (url.protocol !== 'https:' && process.env.DALAT_UPDATE_ALLOW_HTTP_FOR_TEST !== '1') throw Error('Kênh cập nhật phải dùng HTTPS.');
  if (url.username || url.password || url.search || url.hash) throw Error('URL cập nhật không hợp lệ.');
  return url.href.endsWith('/') ? url.href : `${url.href}/`;
}

function compareVersions(left, right) {
  const parse = value => {
    if (!/^\d+\.\d+\.\d+$/.test(String(value))) throw Error('Phiên bản không hợp lệ.');
    return String(value).split('.').map(Number);
  };
  const a = parse(left), b = parse(right);
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return Math.sign(a[i] - b[i]);
  return 0;
}

function verifyManifest(envelope, key = RELEASE_PUBLIC_KEY) {
  if (!envelope || typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string') throw Error('Manifest cập nhật thiếu chữ ký.');
  const payload = Buffer.from(envelope.payload, 'base64');
  const signature = Buffer.from(envelope.signature, 'base64');
  if (!payload.length || payload.length > 32_768 || signature.length !== 64 || !crypto.verify(null, payload, key, signature)) throw Error('Chữ ký bản cập nhật không hợp lệ.');
  const info = parseJsonUtf8(payload.toString('utf8'));
  if (info.schema !== 1 || info.channel !== 'stable' || info.platform !== 'win32-x64') throw Error('Manifest cập nhật không tương thích.');
  compareVersions(info.version, '0.0.0');
  if (!/^[a-f0-9]{40}$/.test(info.commit) || !/^[a-f0-9]{64}$/.test(info.artifact?.sha256 || '') || !Number.isSafeInteger(info.artifact?.size) || info.artifact.size < 1 || info.artifact.size > MAX_RELEASE_BYTES) throw Error('Manifest cập nhật thiếu thông tin gói hợp lệ.');
  if (!/^releases\/[a-zA-Z0-9._-]+\.zip$/.test(info.artifact.path)) throw Error('Đường dẫn gói cập nhật không hợp lệ.');
  if (!Array.isArray(info.notes) || info.notes.length > 20 || info.notes.some(note => typeof note !== 'string' || note.length > 500)) throw Error('Ghi chú phát hành không hợp lệ.');
  return Object.freeze(info);
}

async function fetchLatest() {
  const response = await fetch(new URL('stable/latest.json', baseUrl()), { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw Error(`Không tải được thông tin phiên bản (HTTP ${response.status}).`);
  const text = await response.text();
  if (text.length > 64_000) throw Error('Manifest cập nhật quá lớn.');
  return verifyManifest(parseJsonUtf8(text));
}

async function downloadRelease(info, targetPath, onProgress = () => undefined) {
  const url = new URL(info.artifact.path, baseUrl());
  if (!url.href.startsWith(baseUrl())) throw Error('Gói cập nhật nằm ngoài kênh phát hành.');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15 * 60_000) });
  if (!response.ok || !response.body) throw Error(`Không tải được gói cập nhật (HTTP ${response.status}).`);
  const declaredSize = Number(response.headers.get('content-length'));
  if (declaredSize && declaredSize !== info.artifact.size) throw Error('Kích thước gói trên server không khớp manifest.');
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const partial = `${targetPath}.part-${process.pid}`;
  const digest = crypto.createHash('sha256');
  let size = 0;
  let lastProgressAt = 0;
  try {
    await pipeline(Readable.fromWeb(response.body), new Transform({ transform(chunk, _encoding, next) {
      size += chunk.length;
      if (size > info.artifact.size || size > MAX_RELEASE_BYTES) return next(Error('Gói cập nhật vượt quá kích thước công bố.'));
      digest.update(chunk);
      if (Date.now() - lastProgressAt > 500) {
        lastProgressAt = Date.now();
        onProgress(size, info.artifact.size);
      }
      next(null, chunk);
    } }), fs.createWriteStream(partial, { flags: 'wx' }));
    if (size !== info.artifact.size || digest.digest('hex') !== info.artifact.sha256) throw Error('Gói cập nhật sai kích thước hoặc SHA-256.');
    onProgress(size, info.artifact.size);
    fs.renameSync(partial, targetPath);
    return targetPath;
  } catch (error) {
    try { fs.unlinkSync(partial); } catch {}
    throw error;
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temp, file);
}

module.exports = { DEFAULT_BASE_URL, RELEASE_PUBLIC_KEY, baseUrl, compareVersions, parseJsonUtf8, verifyManifest, fetchLatest, downloadRelease, writeJsonAtomic };
