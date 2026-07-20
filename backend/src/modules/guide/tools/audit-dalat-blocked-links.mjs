/**
 * Quét nhanh manifest Đà Lạt — liệt kê folder Drive không lấy được ảnh.
 * Usage: node src/modules/guide/tools/audit-dalat-blocked-links.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.resolve(__dirname, '../../../../data');
const destination = 'dalat';

const manifestPath = path.join(dataRoot, `sheet-drive-images.${destination}.json`);
const cachePath = path.join(dataRoot, `drive-access-cache.${destination}.json`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const cache = fs.existsSync(cachePath)
  ? (JSON.parse(fs.readFileSync(cachePath, 'utf8')).entries || {})
  : {};

const DRIVE_HEADERS = {
  Referer: 'https://drive.google.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

function isImageBody(body) {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return true;
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
  if (body.length >= 12 && body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP') return true;
  return false;
}

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
      if (isImageBody(body)) {
        cache[fileId] = true;
        return true;
      }
    } catch {
      // try next
    }
  }
  cache[fileId] = false;
  return false;
}

async function itemAccessible(entry) {
  const fileIds = [...new Set([
    entry.fileId,
    ...(entry.candidateImages || []).map((c) => c.fileId),
  ].filter(Boolean))];
  for (const fileId of fileIds) {
    if (await probeFileId(fileId)) return true;
  }
  return false;
}

const entries = Object.values(manifest.items || {});
const blockedItems = [];
const blockedFolders = new Map();
const noLinkItems = [];
let index = 0;
const concurrency = 10;

async function worker() {
  while (index < entries.length) {
    const currentIndex = index;
    index += 1;
    const entry = entries[currentIndex];
    const fileIds = [entry.fileId, ...(entry.candidateImages || []).map((c) => c.fileId)].filter(Boolean);
    if (fileIds.length === 0) {
      noLinkItems.push({ name: entry.name, address: entry.address || '', sectionKey: entry.sectionKey });
      continue;
    }
    if (await itemAccessible(entry)) continue;

    const folderLink = String(entry.sourceLink || '').trim() || '(không có link folder trong sheet)';
    blockedItems.push({
      name: entry.name,
      address: entry.address || '',
      sectionKey: entry.sectionKey,
      folderLink,
      primaryFileView: entry.fileId ? `https://drive.google.com/file/d/${entry.fileId}/view` : '',
    });
    if (!blockedFolders.has(folderLink)) blockedFolders.set(folderLink, []);
    blockedFolders.get(folderLink).push(entry.name);

    if ((blockedItems.length + currentIndex) % 40 === 0) {
      console.error(`  Da quet ${currentIndex + 1}/${entries.length}, blocked=${blockedItems.length}`);
    }
  }
}

console.error(`Quet ${entries.length} dia diem Dalat (${manifest.workbookName})...`);
await Promise.all(Array.from({ length: concurrency }, () => worker()));

const outPath = path.join(dataRoot, `blocked-drive-links.${destination}.json`);
const sheetUrl = 'https://docs.google.com/spreadsheets/d/1-ECVLtuySSlCO5AShcJle1uP9j8XCA4l/edit?gid=1236724598#gid=1236724598';
const output = {
  generatedAt: new Date().toISOString(),
  destination,
  sheetUrl,
  workbookName: manifest.workbookName,
  totalItems: entries.length,
  blockedItemCount: blockedItems.length,
  blockedFolderCount: blockedFolders.size,
  noDriveLinkCount: noLinkItems.length,
  folders: [...blockedFolders.entries()]
    .map(([folderLink, items]) => ({ folderLink, itemCount: items.length, items }))
    .sort((a, b) => b.itemCount - a.itemCount),
  items: blockedItems.sort((a, b) => a.name.localeCompare(b.name, 'vi')),
  noDriveLinkItems: noLinkItems,
};

fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
if (Object.keys(cache).length > 0) {
  fs.writeFileSync(cachePath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    destination,
    entries: cache,
  }, null, 2));
}

console.log(`\n=== DA LAT — DRIVE KHONG LAY DUOC ANH ===`);
console.log(`Sheet: ${sheetUrl}`);
console.log(`Tong dia diem co link anh: ${entries.length - noLinkItems.length}`);
console.log(`Khong co link Drive trong sheet: ${noLinkItems.length}`);
console.log(`Bi chan (khong tai duoc anh): ${blockedItems.length}`);
console.log(`Folder can mo quyen: ${blockedFolders.size}`);
console.log(`File chi tiet: ${outPath}\n`);

console.log('=== DANH SACH FOLDER CAN MO QUYEN ===\n');
for (const folder of output.folders) {
  console.log(`[${folder.itemCount} dia diem] ${folder.folderLink}`);
  for (const name of folder.items) console.log(`  - ${name}`);
  console.log('');
}

if (noLinkItems.length > 0) {
  console.log(`=== KHONG CO LINK DRIVE TRONG SHEET (${noLinkItems.length}) ===\n`);
  for (const item of noLinkItems.slice(0, 20)) console.log(`  - ${item.name}${item.address ? ` (${item.address})` : ''}`);
  if (noLinkItems.length > 20) console.log(`  ... +${noLinkItems.length - 20} muc nua`);
}
