import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';

import { resolveDriveLinkToEntry } from './drive-images';
import { firstValue, itemMappingKey, normalizeText } from '../logic/image-resolver';
import { PREFERRED_WORKBOOK_NAME } from './workbook-source';
import { SECTION_CONFIG } from '../core/constants';
import { SectionKey } from '../core/types';

export const SHEET_DRIVE_MANIFEST_FILE = 'sheet-drive-images.json';

export interface SheetDriveImageManifestEntry {
  key: string;
  sectionKey: SectionKey;
  name: string;
  address: string;
  sourceLink: string;
  fileId: string;
  fileName: string;
}

export interface SheetDriveImageManifest {
  version: number;
  generatedAt: string;
  workbookName: string;
  workbookMtimeMs: number;
  items: Record<string, SheetDriveImageManifestEntry>;
}

function isLikelyLinkHeader(header: string): boolean {
  return header.includes('link') || header.includes('anh') || header.includes('hinh');
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

      rowMap[header] = hyperlink && isLikelyLinkHeader(header) ? hyperlink : rawValue;
      if (hyperlink) rowMap[`${header}__hyperlink`] = hyperlink;
    });
    results.push(rowMap);
  }

  return results;
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
    'image_link__hyperlink',
    'image_link',
  );
}

export function getSheetDriveManifestPath(toolRoot: string): string {
  return path.join(toolRoot, SHEET_DRIVE_MANIFEST_FILE);
}

export function emptySheetDriveManifest(): SheetDriveImageManifest {
  return {
    version: 1,
    generatedAt: new Date(0).toISOString(),
    workbookName: PREFERRED_WORKBOOK_NAME,
    workbookMtimeMs: 0,
    items: {},
  };
}

export function readSheetDriveManifest(toolRoot: string, workbookPath?: string): SheetDriveImageManifest {
  const manifestPath = getSheetDriveManifestPath(toolRoot);
  if (!fs.existsSync(manifestPath)) return emptySheetDriveManifest();

  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SheetDriveImageManifest>;
    const manifest: SheetDriveImageManifest = {
      version: Number(parsed.version ?? 1),
      generatedAt: String(parsed.generatedAt ?? new Date(0).toISOString()),
      workbookName: String(parsed.workbookName ?? PREFERRED_WORKBOOK_NAME),
      workbookMtimeMs: Number(parsed.workbookMtimeMs ?? 0),
      items: parsed.items && typeof parsed.items === 'object' ? parsed.items as Record<string, SheetDriveImageManifestEntry> : {},
    };

    if (workbookPath && fs.existsSync(workbookPath)) {
      const workbookName = path.basename(workbookPath);
      if (manifest.workbookName !== workbookName) {
        return emptySheetDriveManifest();
      }
    }

    return manifest;
  } catch {
    return emptySheetDriveManifest();
  }
}

export async function buildSheetDriveManifest(workbookPath: string): Promise<SheetDriveImageManifest> {
  const workbook = XLSX.readFile(workbookPath, { cellDates: false });
  const items: Record<string, SheetDriveImageManifestEntry> = {};

  for (const sheetName of workbook.SheetNames) {
    const sectionKey = normalizeText(sheetName) as SectionKey;
    if (!(sectionKey in SECTION_CONFIG)) continue;

    const sheet = workbook.Sheets[sheetName];
    for (const row of workbookRowsWithLinks(sheet)) {
      const name = firstValue(row, 'ten_quan', 'ten_dia_diem', 'ten');
      if (!name) continue;

      const address = firstValue(row, 'dia_chi');
      const imageLink = preferredImageLink(row);
      if (!imageLink) continue;

      const resolvedEntry = await resolveDriveLinkToEntry(imageLink, name, address).catch((error) => {
        console.warn(`[sync] Bỏ qua ảnh Drive lỗi cho "${name}": ${error instanceof Error ? error.message : String(error)}`);
        return null;
      });
      if (!resolvedEntry) continue;

      const key = itemMappingKey(sectionKey, name, address);
      items[key] = {
        key,
        sectionKey,
        name,
        address,
        sourceLink: imageLink,
        fileId: resolvedEntry.fileId,
        fileName: resolvedEntry.fileName,
      };
    }
  }

  const workbookStats = fs.statSync(workbookPath);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    workbookName: path.basename(workbookPath),
    workbookMtimeMs: workbookStats.mtimeMs,
    items,
  };
}

export function writeSheetDriveManifest(toolRoot: string, manifest: SheetDriveImageManifest): string {
  const manifestPath = getSheetDriveManifestPath(toolRoot);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  return manifestPath;
}
