import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';

import {
  DriveFolderEntry,
  filterAccessibleDriveEntries,
  hasDriveFileDiskCache,
  resolveDriveLinkToEntries,
} from './drive-images';
import { firstValue, itemMappingKey, normalizeText } from '../logic/image-resolver';
import { DestinationId } from './destination-config';
import { PREFERRED_WORKBOOK_NAME, SheetWorkbookSource } from './workbook-source';
import { resolveSectionKeyFromSheetName } from './sheet-section';
import { SectionKey } from '../../../common/interfaces/guide.types';

export const SHEET_DRIVE_MANIFEST_FILE = 'sheet-drive-images.json';
/** Giữ thấp để tránh Google trả HTTP 401 hàng loạt khi list embeddedfolderview. */
const DRIVE_MANIFEST_CONCURRENCY = 2;

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

async function runLimited<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
  onProgress?: (completed: number, total: number) => void,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;
  let completedCount = 0;

  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await tasks[currentIndex]();
      completedCount += 1;
      onProgress?.(completedCount, tasks.length);
    }
  });

  await Promise.all(workers);
  return results;
}

export function getSheetDriveManifestPath(dataRoot: string, destinationId: DestinationId = 'dalat'): string {
  return path.join(dataRoot, `sheet-drive-images.${destinationId}.json`);
}

function legacySheetDriveManifestPath(dataRoot: string): string {
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

export function readSheetDriveManifest(dataRoot: string, destinationId: DestinationId = 'dalat'): SheetDriveImageManifest {
  const manifestPath = getSheetDriveManifestPath(dataRoot, destinationId);
  const resolvedPath = fs.existsSync(manifestPath)
    ? manifestPath
    : (destinationId === 'dalat' && fs.existsSync(legacySheetDriveManifestPath(dataRoot))
      ? legacySheetDriveManifestPath(dataRoot)
      : manifestPath);
  if (!fs.existsSync(resolvedPath)) return emptySheetDriveManifest();

  try {
    const raw = fs.readFileSync(resolvedPath, 'utf-8');
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

export async function buildSheetDriveManifest(
  source: SheetWorkbookSource,
  previousManifest = emptySheetDriveManifest(),
  options: { forceRevalidate?: boolean; onProgress?: (completed: number, total: number) => void } = {},
): Promise<SheetDriveImageManifest> {
  const forceRevalidate = Boolean(options.forceRevalidate);
  const workbook = source.workbook;
  const items: Record<string, SheetDriveImageManifestEntry> = {};
  const coverImages = new Map<string, DriveFolderEntry>();
  const itemTasks: Array<() => Promise<void>> = [];
  const coverTasks: Array<() => Promise<void>> = [];
  let coverResolveErrors = 0;
  const syncStats = {
    resolved: 0,
    keptPrevious: 0,
    reusedUnchanged: 0,
    skippedNoPrevious: 0,
    rateLimited: 0,
    blockedPublic: 0,
    otherErrors: 0,
    otherErrorSamples: [] as string[],
  };

  for (const sheetName of workbook.SheetNames) {
    const sectionKey = resolveSectionKeyFromSheetName(sheetName);
    const sheet = workbook.Sheets[sheetName];

    if (normalizeText(sheetName) === 'hinh_nen') {
      for (const row of workbookRowsWithLinks(sheet)) {
        const imageLink = firstLinkValue(row);
        if (!imageLink) continue;

        coverTasks.push(async () => {
          const candidateImages = await resolveDriveLinkToEntries(imageLink, 'hinh nen', '', 50).catch((error) => {
            console.warn(`[sync] Bo qua anh nen Drive loi: ${error instanceof Error ? error.message : String(error)}`);
            return null as DriveFolderEntry[] | null;
          });

          if (candidateImages === null) {
            coverResolveErrors += 1;
            return;
          }

          for (const entry of candidateImages) {
            if (entry.fileId && !coverImages.has(entry.fileId)) coverImages.set(entry.fileId, entry);
          }
        });
      }
      continue;
    }

    if (!sectionKey) continue;

    for (const row of workbookRowsWithLinks(sheet)) {
      const name = firstValue(row, 'ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten');
      if (!name) continue;

      const address = firstValue(row, 'dia_chi');
      const imageLink = preferredImageLink(row);
      if (!imageLink) continue;
      const key = itemMappingKey(sectionKey, name, address);

      itemTasks.push(async () => {
        const previousEntry = previousManifest.items[key];
        // Sheet lớn (VD: Đà Lạt ~680 mục) mà re-resolve toàn bộ qua mạng mỗi lần đổi
        // điểm đến/đồng bộ sẽ rất chậm (concurrency thấp để tránh 401 hàng loạt) và có
        // thể bị Google rate-limit dồn dập, khiến màn hình chờ trông như bị treo. Nếu
        // link ảnh không đổi so với lần trước, dùng lại kết quả đã xác minh thay vì
        // quét lại folder Drive + probe quyền truy cập từ đầu.
        const previousCandidates = previousEntry
          ? (previousEntry.candidateImages?.length
              ? previousEntry.candidateImages
              : [{ fileId: previousEntry.fileId, fileName: previousEntry.fileName, viewUrl: '' }])
            .filter((entry) => entry.fileId && hasDriveFileDiskCache(entry.fileId))
          : [];
        // Chỉ tái sử dụng manifest khi máy HIỆN TẠI đã có file ảnh thật trên disk.
        // Manifest mang từ máy khác chỉ là metadata; tin ngay sẽ làm list nhận URL
        // Drive chưa tải được và render placeholder xám.
        if (!forceRevalidate && previousEntry?.fileId && previousEntry.sourceLink === imageLink && previousCandidates.length > 0) {
          const primary = previousCandidates.find((entry) => entry.fileId === previousEntry.fileId)
            || previousCandidates[0];
          items[key] = {
            ...previousEntry,
            fileId: primary.fileId,
            fileName: primary.fileName,
            candidateImages: previousCandidates,
          };
          syncStats.reusedUnchanged += 1;
          return;
        }
        let resolveError: unknown = null;
        const candidateImages = await resolveDriveLinkToEntries(imageLink, name, address).catch((error) => {
          resolveError = error;
          return null as DriveFolderEntry[] | null;
        });

        // Lỗi tạm (401/429/timeout): giữ entry cũ, không xóa ảnh đã map.
        if (candidateImages === null) {
          const message = resolveError instanceof Error ? resolveError.message : String(resolveError);
          if (previousEntry?.fileId) {
            items[key] = previousEntry.sourceLink === imageLink
              ? previousEntry
              : { ...previousEntry, sourceLink: imageLink, name, address, sectionKey, key };
            syncStats.keptPrevious += 1;
          } else {
            syncStats.skippedNoPrevious += 1;
          }
          if (/HTTP 401|HTTP 429|aborted|timeout|fetch failed/i.test(message)) {
            syncStats.rateLimited += 1;
          } else {
            syncStats.otherErrors += 1;
            if (syncStats.otherErrorSamples.length < 5) {
              syncStats.otherErrorSamples.push(`${name}: ${message}`);
            }
          }
          return;
        }

        const accessibleImages = candidateImages.length > 0
          ? await filterAccessibleDriveEntries(candidateImages)
          : [];
        if (accessibleImages.length === 0) {
          if (candidateImages.length > 0) {
            // Probe ảnh fail — ưu tiên giữ previous thay vì mất ảnh vì rate-limit.
            if (previousEntry?.fileId) {
              items[key] = previousEntry;
              syncStats.keptPrevious += 1;
            } else {
              syncStats.blockedPublic += 1;
            }
          } else if (previousEntry?.fileId) {
            items[key] = previousEntry;
            syncStats.keptPrevious += 1;
          }
          return;
        }

        const resolvedEntry = accessibleImages[0];
        syncStats.resolved += 1;

        items[key] = {
          key,
          sectionKey,
          name,
          address,
          sourceLink: imageLink,
          fileId: resolvedEntry.fileId,
          fileName: resolvedEntry.fileName,
          candidateImages: accessibleImages,
        };
      });
    }
  }

  await runLimited([...coverTasks, ...itemTasks], DRIVE_MANIFEST_CONCURRENCY, options.onProgress);

  console.log(
    `[sync] Drive manifest: resolved=${syncStats.resolved}`
    + ` reusedUnchanged=${syncStats.reusedUnchanged}`
    + ` keptPrevious=${syncStats.keptPrevious}`
    + ` rateLimited=${syncStats.rateLimited}`
    + ` blockedPublic=${syncStats.blockedPublic}`
    + ` skippedNoPrevious=${syncStats.skippedNoPrevious}`
    + ` otherErrors=${syncStats.otherErrors}`,
  );
  for (const sample of syncStats.otherErrorSamples) {
    console.warn(`[sync] ${sample}`);
  }

  let nextCoverImages = [...coverImages.values()];
  if ((nextCoverImages.length === 0 || coverResolveErrors > 0) && (previousManifest.coverImages || []).length > 0) {
    const merged = new Map(nextCoverImages.map((entry) => [entry.fileId, entry]));
    for (const entry of previousManifest.coverImages) {
      if (entry.fileId && !merged.has(entry.fileId)) merged.set(entry.fileId, entry);
    }
    nextCoverImages = [...merged.values()];
    if (coverImages.size === 0) {
      console.warn(`[sync] Pool anh nen trong: dung lai ${nextCoverImages.length} anh nen tu ban truoc.`);
    } else if (coverResolveErrors > 0) {
      console.warn(`[sync] Anh nen loi ${coverResolveErrors} link: gop them ban truoc -> ${nextCoverImages.length} anh.`);
    }
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    workbookName: source.workbookName,
    workbookMtimeMs: source.fetchedAt,
    items,
    coverImages: nextCoverImages,
  };
}

export function writeSheetDriveManifest(
  dataRoot: string,
  manifest: SheetDriveImageManifest,
  destinationId: DestinationId = 'dalat',
): string {
  fs.mkdirSync(dataRoot, { recursive: true });
  const manifestPath = getSheetDriveManifestPath(dataRoot, destinationId);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  return manifestPath;
}
