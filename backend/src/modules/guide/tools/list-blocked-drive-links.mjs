/**
 * Liệt kê folder/file Drive Green Land không tải được (cần mở quyền public).
 * Usage: node src/modules/guide/tools/list-blocked-drive-links.mjs [destination]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.resolve(__dirname, '../../../../data');
const destination = process.argv[2] || 'greenland';

const manifest = JSON.parse(fs.readFileSync(path.join(dataRoot, `sheet-drive-images.${destination}.json`), 'utf8'));
const cachePath = path.join(dataRoot, `drive-access-cache.${destination}.json`);
const cache = fs.existsSync(cachePath)
  ? (JSON.parse(fs.readFileSync(cachePath, 'utf8')).entries || {})
  : {};

const DRIVE_HEADERS = {
  Referer: 'https://drive.google.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

async function probeFileId(fileId) {
  if (cache[fileId] === true) return true;
  if (cache[fileId] === false) return false;

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
      // try next
    }
  }
  return false;
}

const blockedItems = [];
const blockedFolders = new Map();
const items = Object.values(manifest.items || {});
let processed = 0;

for (const entry of items) {
  processed += 1;
  if (processed % 50 === 0) console.error(`  Dang kiem tra ${processed}/${items.length}...`);

  const fileIds = [...new Set([
    entry.fileId,
    ...(entry.candidateImages || []).map((candidate) => candidate.fileId),
  ].filter(Boolean))];

  if (fileIds.length === 0) continue;

  let anyAccessible = false;
  for (const fileId of fileIds) {
    if (await probeFileId(fileId)) {
      anyAccessible = true;
      break;
    }
  }

  if (anyAccessible) continue;

  const folderLink = String(entry.sourceLink || '').trim() || '(không có link folder trong sheet)';
  blockedItems.push({
    name: entry.name,
    address: entry.address || '',
    sectionKey: entry.sectionKey,
    folderLink,
    primaryFileView: entry.fileId ? `https://drive.google.com/file/d/${entry.fileId}/view` : '',
  });

  if (!blockedFolders.has(folderLink)) {
    blockedFolders.set(folderLink, { folderLink, items: [] });
  }
  blockedFolders.get(folderLink).items.push(entry.name);
}

const outPath = path.join(dataRoot, `blocked-drive-links.${destination}.json`);
fs.writeFileSync(outPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  destination,
  blockedItemCount: blockedItems.length,
  blockedFolderCount: blockedFolders.size,
  folders: [...blockedFolders.values()].sort((a, b) => b.items.length - a.items.length),
  items: blockedItems,
}, null, 2));

console.log(`\n=== GREEN LAND — DRIVE CHUA TRUY CAP DUOC ===`);
console.log(`Dia diem bi chan: ${blockedItems.length}`);
console.log(`Folder Drive can mo quyen: ${blockedFolders.size}`);
console.log(`Da luu chi tiet: ${outPath}\n`);

console.log('=== DANH SACH FOLDER (uu tien mo quyen) ===\n');
for (const folder of [...blockedFolders.values()].sort((a, b) => b.items.length - a.items.length)) {
  console.log(`Folder (${folder.items.length} dia diem):`);
  console.log(folder.folderLink);
  console.log(`  -> ${folder.items.slice(0, 8).join(', ')}${folder.items.length > 8 ? ` ... (+${folder.items.length - 8})` : ''}`);
  console.log('');
}
