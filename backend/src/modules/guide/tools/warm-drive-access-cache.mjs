/**
 * Probe Drive fileIds from destination manifest and warm accessibility cache.
 * Usage: node src/modules/guide/tools/warm-drive-access-cache.mjs [destination]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.resolve(__dirname, '../../../../data');
const destination = process.argv[2] || 'greenland';
const cachePath = path.join(dataRoot, `drive-access-cache.${destination}.json`);

const manifestPath = path.join(dataRoot, `sheet-drive-images.${destination}.json`);
if (!fs.existsSync(manifestPath)) {
  console.error('Manifest not found:', manifestPath);
  process.exit(1);
}

const DRIVE_HEADERS = {
  Referer: 'https://drive.google.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
};

async function probeDriveFileAccessible(fileId) {
  const urls = [
    `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`,
    `https://drive.google.com/thumbnail?authuser=0&sz=w1600&id=${encodeURIComponent(fileId)}`,
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
  ];
  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: DRIVE_HEADERS, redirect: 'follow' });
      if (!response.ok) continue;
      const body = Buffer.from(await response.arrayBuffer());
      if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return true;
      if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
      if (body.length >= 12 && body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP') return true;
    } catch {
      // try next url
    }
  }
  return false;
}

let existingEntries = {};
if (fs.existsSync(cachePath)) {
  try {
    existingEntries = JSON.parse(fs.readFileSync(cachePath, 'utf8')).entries || {};
  } catch {
    existingEntries = {};
  }
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const fileIds = new Set();
for (const entry of Object.values(manifest.items || {})) {
  if (entry.fileId) fileIds.add(entry.fileId);
  for (const candidate of entry.candidateImages || []) {
    if (candidate.fileId) fileIds.add(candidate.fileId);
  }
}

const ids = [...fileIds].filter((id) => existingEntries[id] === undefined);
console.log(`Probing ${ids.length}/${fileIds.size} Drive fileIds for ${destination}...`);
let ok = 0;
let bad = 0;
const cacheEntries = { ...existingEntries };
let index = 0;
const concurrency = 8;

async function worker() {
  while (index < ids.length) {
    const current = ids[index];
    index += 1;
    const accessible = await probeDriveFileAccessible(current);
    cacheEntries[current] = accessible;
    if (accessible) ok += 1;
    else bad += 1;
    if ((ok + bad) % 25 === 0) {
      console.log(`  ${ok + bad}/${ids.length} (${ok} ok, ${bad} blocked)`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

fs.writeFileSync(cachePath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  destination,
  entries: cacheEntries,
}, null, 2));

console.log(`Done: ${ok} newly accessible, ${bad} newly blocked, ${Object.keys(cacheEntries).length} total cached -> ${cachePath}`);
