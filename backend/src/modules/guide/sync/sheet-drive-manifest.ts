import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';

import { DriveFolderEntry, resolveDriveLinkToEntries } from './drive-images';
import { firstValue, itemMappingKey, normalizeText } from '../logic/image-resolver';
import { PREFERRED_WORKBOOK_NAME, SheetWorkbookSource } from './workbook-source';
import { SECTION_CONFIG } from '../../../common/constants/guide.constants';
import { SectionKey } from '../../../common/interfaces/guide.types';

export const SHEET_DRIVE_MANIFEST_FILE = 'sheet-drive-images.json';

export interface SheetDriveImageManifestEntry {
  key: string;
  sectionKey: SectionKey;
  name: string;
  address: string;
  sourceLink: string;
  fileId: string;
  fileName: string;
  candidateImages?: DriveFolderEntry[];
}

export interface SheetDriveImageManifest {
  version: number;
  generatedAt: string;
  workbookName: string;
  workbookMtimeMs: number;
  items: Record<string, SheetDriveImageManifestEntry>;
  coverImages: DriveFolderEntry[];
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
    'anh__hyperlink',
    'anh',
    'image_link__hyperlink',
    'image_link',
  );
}

function firstLinkValue(row: Record<string, string>): string {
  const preferred = preferredImageLink(row);
  if (preferred) return preferred;

  const linkEntry = Object.entries(row).find(([header, value]) =>
    isLikelyLinkHeader(header) && /^https?:\/\//i.test(String(value ?? '').trim()),
  );
  return String(linkEntry?.[1] ?? '').trim();
}

export function getSheetDriveManifestPath(dataRoot: string): string {
  return path.join(dataRoot, SHEET_DRIVE_MANIFEST_FILE);
}

export function emptySheetDriveManifest(): SheetDriveImageManifest {
  return {
    version: 1,
    generatedAt: new Date(0).toISOString(),
    workbookName: PREFERRED_WORKBOOK_NAME,
    workbookMtimeMs: 0,
    items: {},
    coverImages: [],
  };
}

export function readSheetDriveManifest(dataRoot: string, workbookName?: string): SheetDriveImageManifest {
  const manifestPath = getSheetDriveManifestPath(dataRoot);
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
      coverImages: Array.isArray(parsed.coverImages) ? parsed.coverImages as DriveFolderEntry[] : [],
    };

    return manifest;
  } catch {
    return emptySheetDriveManifest();
  }
}

export async function buildSheetDriveManifest(source: SheetWorkbookSource): Promise<SheetDriveImageManifest> {
  const workbook = source.workbook;
  const items: Record<string, SheetDriveImageManifestEntry> = {};
  const coverImages = new Map<string, DriveFolderEntry>();

  for (const sheetName of workbook.SheetNames) {
    const sectionKey = normalizeText(sheetName) as SectionKey;
    const sheet = workbook.Sheets[sheetName];

    if (normalizeText(sheetName) === 'hinh_nen') {
      for (const row of workbookRowsWithLinks(sheet)) {
        const imageLink = firstLinkValue(row);
        if (!imageLink) continue;

        const candidateImages = await resolveDriveLinkToEntries(imageLink, 'hinh nen', '', 50).catch((error) => {
          console.warn(`[sync] Bo qua anh nen Drive loi: ${error instanceof Error ? error.message : String(error)}`);
          return [];
        });

        for (const entry of candidateImages) {
          if (entry.fileId && !coverImages.has(entry.fileId)) coverImages.set(entry.fileId, entry);
        }
      }
      continue;
    }

    if (!(sectionKey in SECTION_CONFIG)) continue;

    for (const row of workbookRowsWithLinks(sheet)) {
      const name = firstValue(row, 'ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten');
      if (!name) continue;

      const address = firstValue(row, 'dia_chi');
      const imageLink = preferredImageLink(row);
      if (!imageLink) continue;

      const candidateImages = await resolveDriveLinkToEntries(imageLink, name, address).catch((error) => {
        console.warn(`[sync] Bỏ qua ảnh Drive lỗi cho "${name}": ${error instanceof Error ? error.message : String(error)}`);
        return [];
      });
      if (candidateImages.length === 0) continue;

      const resolvedEntry = candidateImages[0];

      const key = itemMappingKey(sectionKey, name, address);
      items[key] = {
        key,
        sectionKey,
        name,
        address,
        sourceLink: imageLink,
        fileId: resolvedEntry.fileId,
        fileName: resolvedEntry.fileName,
        candidateImages,
      };
    }
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    workbookName: source.workbookName,
    workbookMtimeMs: source.fetchedAt,
    items,
    coverImages: [...coverImages.values()],
  };
}

export function writeSheetDriveManifest(dataRoot: string, manifest: SheetDriveImageManifest): string {
  fs.mkdirSync(dataRoot, { recursive: true });
  const manifestPath = getSheetDriveManifestPath(dataRoot);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  return manifestPath;
}
