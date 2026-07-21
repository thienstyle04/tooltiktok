/**
 * Tải ảnh Drive từ sheet-drive-images.*.json và ghi vào
 * backend/data/drive-file-cache để gói portable dùng được offline-ish.
 *
 * Chạy (không bắt buộc backend):
 *   node backend/src/modules/guide/tools/warm-drive-file-cache.mjs
 *
 * Env:
 *   DESTINATION=dalat|phanthiet|greenland|all
 *   LIMIT=0
 *   CONCURRENCY=3
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataRoot = join(__dirname, '../../../../data');
const cacheDir = join(dataRoot, 'drive-file-cache');
const DESTINATION = String(process.env.DESTINATION || 'dalat').trim().toLowerCase();
const LIMIT = Math.max(0, Number(process.env.LIMIT || 0));
const CONCURRENCY = Math.min(Math.max(Number(process.env.CONCURRENCY || 3), 1), 6);
const FETCH_TIMEOUT_MS = 45000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeId(fileId) {
  return String(fileId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function sniffImageContentType(body) {
  if (!body || body.length < 12) return '';
  if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return 'image/jpeg';
  if (body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47) return 'image/png';
  if (body[0] === 0x47 && body[1] === 0x49 && body[2] === 0x46) return 'image/gif';
  if (body[0] === 0x52 && body[1] === 0x49 && body[2] === 0x46 && body[3] === 0x46) return 'image/webp';
  return '';
}

function collectFileIds(destinationId) {
  const path = join(dataRoot, `sheet-drive-images.${destinationId}.json`);
  if (!existsSync(path)) return [];
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  const ids = new Set();
  // Chỉ file chính của mỗi địa điểm — đủ cho portable, tránh phình zip vì mọi candidate.
  for (const entry of Object.values(manifest.items || {})) {
    if (entry?.fileId) ids.add(entry.fileId);
  }
  const coverLimit = Math.max(0, Number(process.env.COVER_LIMIT || 120));
  for (const cover of (manifest.coverImages || []).slice(0, coverLimit)) {
    if (cover?.fileId) ids.add(cover.fileId);
  }
  return [...ids];
}

function alreadyCached(fileId) {
  const key = safeId(fileId);
  return existsSync(join(cacheDir, `${key}.bin`)) && existsSync(join(cacheDir, `${key}.json`));
}

async function fetchDriveBytes(fileId) {
  const urls = [
    `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`,
    `https://drive.google.com/thumbnail?authuser=0&sz=w1600&id=${encodeURIComponent(fileId)}`,
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
  ];
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'follow',
      });
      if (!response.ok) continue;
      const body = Buffer.from(await response.arrayBuffer());
      const headerType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const sniffed = sniffImageContentType(body);
      const contentType = headerType.startsWith('image/') ? headerType : sniffed;
      if (!contentType || contentType.includes('svg') || !body.length) continue;
      return { body, contentType };
    } catch {
      // try next
    }
  }
  return null;
}

function writeCache(fileId, asset) {
  mkdirSync(cacheDir, { recursive: true });
  const key = safeId(fileId);
  writeFileSync(join(cacheDir, `${key}.bin`), asset.body);
  writeFileSync(join(cacheDir, `${key}.json`), JSON.stringify({
    fileId,
    contentType: asset.contentType,
    contentLength: asset.body.byteLength,
    savedAt: Date.now(),
  }), 'utf8');
}

async function mapLimit(items, limit, worker) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      await worker(items[current], current);
    }
  }));
}

async function main() {
  const destFiles = readdirSync(dataRoot)
    .filter((name) => /^sheet-drive-images\.[a-z]+\.json$/i.test(name))
    .map((name) => name.replace(/^sheet-drive-images\./i, '').replace(/\.json$/i, ''));
  const destinations = DESTINATION === 'all'
    ? destFiles
    : destFiles.filter((id) => id === DESTINATION);
  if (!destinations.length) throw new Error(`Không tìm thấy destination: ${DESTINATION}`);

  const allIds = new Set();
  for (const id of destinations) {
    for (const fileId of collectFileIds(id)) allIds.add(fileId);
  }
  let ids = [...allIds];
  if (LIMIT > 0) ids = ids.slice(0, LIMIT);

  console.log('=== WARM DRIVE FILE DISK CACHE ===');
  console.log(`destinations=${destinations.join(',')} ids=${ids.length} concurrency=${CONCURRENCY}`);
  console.log(`cacheDir=${cacheDir}`);

  let ok = 0;
  let skip = 0;
  let fail = 0;
  let done = 0;

  await mapLimit(ids, CONCURRENCY, async (fileId) => {
    if (alreadyCached(fileId)) {
      skip += 1;
      done += 1;
      return;
    }
    const asset = await fetchDriveBytes(fileId);
    if (asset) {
      writeCache(fileId, asset);
      ok += 1;
    } else {
      fail += 1;
    }
    done += 1;
    if (done % 20 === 0 || done === ids.length) {
      console.log(`  progress ${done}/${ids.length} ok=${ok} skip=${skip} fail=${fail}`);
    }
    await sleep(150);
  });

  console.log('\n=== DONE ===');
  console.log(JSON.stringify({ total: ids.length, ok, skip, fail, cacheDir }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
