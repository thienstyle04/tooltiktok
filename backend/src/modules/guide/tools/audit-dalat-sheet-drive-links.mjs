/**
 * Quét toàn bộ link ảnh Drive trên Google Sheet Đà Lạt — bỏ qua cache cũ.
 * Usage: node backend/src/modules/guide/tools/audit-dalat-sheet-drive-links.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '../../../..');
const dataRoot = path.join(backendRoot, 'data');

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
  const urls = [
    `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`,
    `https://drive.google.com/thumbnail?authuser=0&sz=w1600&id=${encodeURIComponent(fileId)}`,
  ];
  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: DRIVE_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(10000) });
      if (!response.ok) continue;
      const body = Buffer.from(await response.arrayBuffer());
      if (isImageBody(body)) return true;
    } catch {
      // try next
    }
  }
  return false;
}

async function loadSyncHelpers() {
  const { register } = await import('node:module');
  register('ts-node/esm', pathToFileURL('./'));
  const dest = await import(pathToFileURL(path.join(backendRoot, 'src/modules/guide/sync/destination-config.ts')).href);
  const wb = await import(pathToFileURL(path.join(backendRoot, 'src/modules/guide/sync/workbook-source.ts')).href);
  const manifestMod = await import(pathToFileURL(path.join(backendRoot, 'src/modules/guide/sync/sheet-drive-manifest.ts')).href);
  const sectionMod = await import(pathToFileURL(path.join(backendRoot, 'src/modules/guide/sync/sheet-section.ts')).href);
  const imageMod = await import(pathToFileURL(path.join(backendRoot, 'src/modules/guide/sync/drive-images.ts')).href);
  const resolverMod = await import(pathToFileURL(path.join(backendRoot, 'src/modules/guide/logic/image-resolver.ts')).href);
  return { dest, wb, manifestMod, sectionMod, imageMod, resolverMod };
}

const { dest, wb, manifestMod, sectionMod, imageMod, resolverMod } = await loadSyncHelpers();
const config = dest.getDestinationConfig('dalat');
console.log('Dang tai Google Sheet Đà Lạt...');
const source = await wb.fetchWorkbookFromSheet(config);
console.log(`Da tai: ${source.workbookName} (${source.bytes} bytes)`);

const rows = [];
for (const sheet of source.workbook.sheets || []) {
  const sectionKey = sectionMod.resolveSectionKeyFromSheetName(sheet.name);
  if (!sectionKey) continue;
  for (const row of manifestMod.workbookRowsWithLinks(sheet)) {
    const name = resolverMod.firstValue(row, 'ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten');
    if (!name) continue;
    const address = resolverMod.firstValue(row, 'dia_chi');
    const folderLink = manifestMod.preferredImageLink(row);
    if (!folderLink) continue;
    rows.push({ sectionKey, name, address, folderLink });
  }
}

console.log(`Tong dong co link Drive tren sheet: ${rows.length}`);

const blockedItems = [];
const folderMap = new Map();
let ok = 0;
const CONC = 8;

for (let index = 0; index < rows.length; index += CONC) {
  const batch = rows.slice(index, index + CONC);
  await Promise.all(batch.map(async (row) => {
    let accessible = false;
    try {
      const entries = await imageMod.resolveDriveLinkToEntries(row.folderLink, row.name, row.address, 6);
      for (const entry of entries) {
        if (entry.fileId && await probeFileId(entry.fileId)) {
          accessible = true;
          break;
        }
      }
    } catch {
      accessible = false;
    }
    row.accessible = accessible;
  }));

  for (const row of batch) {
    if (row.accessible) {
      ok += 1;
      continue;
    }
    blockedItems.push({
      name: row.name,
      address: row.address,
      sectionKey: row.sectionKey,
      folderLink: row.folderLink,
    });
    if (!folderMap.has(row.folderLink)) {
      folderMap.set(row.folderLink, { folderLink: row.folderLink, items: [] });
    }
    folderMap.get(row.folderLink).items.push(row.name);
  }

  if ((index + CONC) % 40 < CONC) {
    console.error(`  Da quet ${Math.min(index + CONC, rows.length)}/${rows.length}...`);
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  destination: 'dalat',
  sheetUrl: config.sheetUrl,
  workbookName: source.workbookName,
  totalSheetRowsWithDriveLink: rows.length,
  accessibleItemCount: ok,
  blockedItemCount: blockedItems.length,
  blockedFolderCount: folderMap.size,
  folders: [...folderMap.values()].sort((a, b) => b.items.length - a.items.length),
  items: blockedItems,
};

const outPath = path.join(dataRoot, 'blocked-drive-links.dalat.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

console.log('\n=== KET QUA ===');
console.log(`Tong dong sheet co link Drive: ${rows.length}`);
console.log(`Truy cap duoc: ${ok}`);
console.log(`CHUA mo quyen (dia diem): ${blockedItems.length}`);
console.log(`CHUA mo quyen (folder): ${folderMap.size}`);
console.log(`Da luu: ${outPath}`);

console.log('\n=== DANH SACH FOLDER CAN MO QUYEN ===\n');
for (const folder of out.folders) {
  console.log(`[${folder.items.length} dia diem] ${folder.folderLink}`);
  console.log(`  -> ${folder.items.join(', ')}\n`);
}
