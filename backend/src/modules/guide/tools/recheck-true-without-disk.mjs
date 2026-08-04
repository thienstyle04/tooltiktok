/**
 * Recheck Drive IDs marked accessible=true nhưng chưa có disk cache.
 *   node backend/src/modules/guide/tools/recheck-true-without-disk.mjs greenland
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.resolve(__dirname, '../../../../data');
const destination = process.argv[2] || 'greenland';
const cachePath = path.join(dataRoot, `drive-access-cache.${destination}.json`);
const diskDir = path.join(dataRoot, 'drive-file-cache');
const concurrency = Math.min(Math.max(Number(process.env.RECHECK_CONCURRENCY || 6), 1), 10);

const DRIVE_HEADERS = {
  Referer: 'https://drive.google.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
};

function looksLikeImage(body) {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return true;
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
  if (body.length >= 12 && body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP') return true;
  return false;
}

async function probe(fileId) {
  const urls = [
    `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`,
    `https://drive.google.com/thumbnail?authuser=0&sz=w1600&id=${encodeURIComponent(fileId)}`,
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
  ];
  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: DRIVE_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(25000) });
      if (!response.ok) continue;
      const body = Buffer.from(await response.arrayBuffer());
      if (looksLikeImage(body) && body.length > 1500) return true;
    } catch {
      // next
    }
  }
  return false;
}

const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
const diskSet = new Set(
  fs.readdirSync(diskDir)
    .filter((name) => name.endsWith('.bin') || name.endsWith('.json'))
    .map((name) => name.replace(/\.(bin|json)$/i, '')),
);
const ids = Object.entries(cache.entries || {})
  .filter(([, accessible]) => accessible === true)
  .map(([id]) => id)
  .filter((id) => !diskSet.has(id));

console.log(`Recheck ${ids.length} True-without-disk IDs for ${destination} (concurrency=${concurrency})...`);
let ok = 0;
let bad = 0;
let index = 0;

async function worker() {
  while (index < ids.length) {
    const current = index;
    index += 1;
    const fileId = ids[current];
    const accessible = await probe(fileId);
    cache.entries[fileId] = accessible;
    if (accessible) ok += 1;
    else bad += 1;
    if ((ok + bad) % 20 === 0 || ok + bad === ids.length) {
      console.log(`  ${ok + bad}/${ids.length} (stillOk=${ok} nowBad=${bad})`);
      const tmp = `${cachePath}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({
        generatedAt: new Date().toISOString(),
        destination,
        entries: cache.entries,
      }, null, 2));
      fs.renameSync(tmp, cachePath);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
console.log(`Done: stillOk=${ok} nowBad=${bad} -> ${cachePath}`);
