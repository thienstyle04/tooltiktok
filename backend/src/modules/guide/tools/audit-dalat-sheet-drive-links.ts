/**
 * Quét link ảnh Drive trên Google Sheet Đà Lạt — probe trực tiếp, bỏ qua cache.
 * Chạy: npx ts-node src/modules/guide/tools/audit-dalat-sheet-drive-links.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveBackendDataDir, resolveBackendRoot } from '../../../config';
import { getDestinationConfig } from '../sync/destination-config';
import { fetchWorkbookFromSheet } from '../sync/workbook-source';
import { resolveSectionKeyFromSheetName } from '../sync/sheet-section';
import { resolveDriveLinkToEntries } from '../sync/drive-images';
import * as XLSX from 'xlsx';
import { firstValue, normalizeText } from '../logic/image-resolver';

const DRIVE_HEADERS = {
  Referer: 'https://drive.google.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

function isImageBody(body: Buffer): boolean {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return true;
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
  if (body.length >= 12 && body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP') return true;
  return false;
}

async function probeFileId(fileId: string): Promise<boolean> {
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

function preferredImageLink(row: Record<string, string>): string {
  return firstValue(
    row,
    'link_drive__hyperlink',
    'link_drive',
    'link_anh__hyperlink',
    'link_anh',
    'link_hinh__hyperlink',
    'link_hinh',
    'link_hinh_anh__hyperlink',
    'link_hinh_anh',
    'hinh_anh__hyperlink',
    'hinh_anh',
    'anh__hyperlink',
    'anh',
    'image_link__hyperlink',
    'image_link',
  );
}

function workbookRowsWithLinks(sheet: XLSX.WorkSheet): Array<Record<string, string>> {
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false, defval: '' });
  if (rows.length === 0) return [];

  const headers = (rows[0] ?? []).map((header) => normalizeText(header));
  const results: Array<Record<string, string>> = [];

  for (const [rowOffset, rawRow] of rows.slice(1).entries()) {
    const rowMap: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      const rawValue = String(rawRow[columnIndex] ?? '').trim();
      const cellRef = XLSX.utils.encode_cell({ r: rowOffset + 1, c: columnIndex });
      const cell = sheet[cellRef];
      const hyperlink = typeof cell?.l?.Target === 'string' ? cell.l.Target.trim() : '';
      const isLinkHeader = header.includes('link') || header.includes('anh') || header.includes('hinh');
      rowMap[header] = hyperlink && isLinkHeader ? hyperlink : rawValue;
    });
    results.push(rowMap);
  }

  return results;
}

interface SheetRow {
  sectionKey: string;
  name: string;
  address: string;
  folderLink: string;
}

async function main(): Promise<void> {
  const toolRoot = resolveBackendRoot(__dirname);
  const dataRoot = resolveBackendDataDir(toolRoot);
  const config = getDestinationConfig('dalat');

  console.log('Đang tải Google Sheet Đà Lạt...');
  const source = await fetchWorkbookFromSheet(config);
  console.log(`Đã tải: ${source.workbookName} (${source.bytes} bytes)`);

  const rows: SheetRow[] = [];
  for (const sheetName of source.workbook.SheetNames) {
    const sectionKey = resolveSectionKeyFromSheetName(sheetName);
    if (!sectionKey) continue;
    const sheet = source.workbook.Sheets[sheetName];
    if (!sheet) continue;

    for (const row of workbookRowsWithLinks(sheet)) {
      const name = firstValue(row, 'ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten');
      if (!name) continue;
      const folderLink = preferredImageLink(row);
      if (!folderLink) continue;
      rows.push({
        sectionKey,
        name,
        address: firstValue(row, 'dia_chi'),
        folderLink,
      });
    }
  }

  console.log(`Tổng dòng sheet có link Drive: ${rows.length}`);

  const blockedItems: Array<{ name: string; address: string; sectionKey: string; folderLink: string }> = [];
  const folderMap = new Map<string, { folderLink: string; items: string[] }>();
  let ok = 0;
  const CONC = 6;

  for (let index = 0; index < rows.length; index += CONC) {
    const batch = rows.slice(index, index + CONC);
    await Promise.all(batch.map(async (row) => {
      let accessible = false;
      try {
        const entries = await resolveDriveLinkToEntries(row.folderLink, row.name, row.address, 6);
        for (const entry of entries) {
          if (entry.fileId && await probeFileId(entry.fileId)) {
            accessible = true;
            break;
          }
        }
      } catch {
        accessible = false;
      }
      (row as SheetRow & { accessible?: boolean }).accessible = accessible;
    }));

    for (const row of batch) {
      const accessible = (row as SheetRow & { accessible?: boolean }).accessible;
      if (accessible) {
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
      folderMap.get(row.folderLink)!.items.push(row.name);
    }

    if ((index + CONC) % 30 < CONC) {
      console.error(`  Đã quét ${Math.min(index + CONC, rows.length)}/${rows.length}...`);
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    destination: 'dalat' as const,
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

  console.log('\n=== KẾT QUẢ ===');
  console.log(`Tổng dòng có link Drive: ${rows.length}`);
  console.log(`Truy cập được: ${ok}`);
  console.log(`Chưa mở quyền (địa điểm): ${blockedItems.length}`);
  console.log(`Chưa mở quyền (folder): ${folderMap.size}`);
  console.log(`Đã lưu: ${outPath}`);

  console.log('\n=== DANH SÁCH FOLDER CẦN MỞ QUYỀN ===\n');
  for (const folder of out.folders) {
    console.log(`[${folder.items.length} địa điểm] ${folder.folderLink}`);
    console.log(`  → ${folder.items.join(', ')}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
