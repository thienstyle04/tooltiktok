import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';

import {
  DriveFolderEntry,
  filterAccessibleDriveEntries,
  hasDriveFileDiskCache,
  resolveDriveLinkToEntries,
} from './drive-images';
import { composeAddress, firstValue, itemMappingKey, normalizeText, normalizeWorkbookHeaders } from '../logic/image-resolver';
import { DestinationId } from './destination-config';
import { PREFERRED_WORKBOOK_NAME, SheetWorkbookSource } from './workbook-source';
import { resolveSectionKeyFromSheetName } from './sheet-section';
import { SectionKey } from '../../../common/interfaces/guide.types';

export const SHEET_DRIVE_MANIFEST_FILE = 'sheet-drive-images.json';
/** Giữ thấp để tránh Google trả HTTP 401 hàng loạt khi list embeddedfolderview. */
const DRIVE_MANIFEST_CONCURRENCY = 2;

export type HinhNenImageGroup = 'default' | 'green' | 'dark' | 'random';
export const HINH_NEN_IMAGE_GROUPS: readonly HinhNenImageGroup[] = ['default', 'green', 'dark', 'random'];

export type HinhNenDriveImageGroups = Record<HinhNenImageGroup, DriveFolderEntry[]>;
export type HinhNenSourceLinkGroups = Record<HinhNenImageGroup, string[]>;
export type HinhNenHookSourceGroups = Partial<Record<HinhNenImageGroup, string>>;

function emptyHinhNenDriveImageGroups(): HinhNenDriveImageGroups {
  return { default: [], green: [], dark: [], random: [] };
}

function emptyHinhNenSourceLinkGroups(): HinhNenSourceLinkGroups {
  return { default: [], green: [], dark: [], random: [] };
}

export function classifyHinhNenImageGroup(label: string): HinhNenImageGroup {
  const normalized = normalizeText(label).replace(/_/g, ' ');
  if (normalized.includes('mang xanh')) return 'green';
  if (normalized.includes('tone den')) return 'dark';
  if (normalized.includes('random') || normalized.includes('ramdom')) return 'random';
  return 'default';
}

export interface SheetDriveImageManifestEntry {
  key: string;
  sectionKey: SectionKey;
  name: string;
  address: string;
  sourceLink: string;
  fileId: string;
  fileName: string;
  candidateImages?: DriveFolderEntry[];
  mapSourceLink?: string;
  mapFileId?: string;
  mapFileName?: string;
  mapCandidateImages?: DriveFolderEntry[];
}

export interface SheetDriveImageManifest {
  version: number;
  generatedAt: string;
  workbookName: string;
  workbookMtimeMs: number;
  items: Record<string, SheetDriveImageManifestEntry>;
  /** Pool Hinh_nen thông thường, giữ tương thích cho các mẫu hiện có. */
  coverImages: DriveFolderEntry[];
  coverSourceLinks?: string[];
  /** Các pool đặc biệt được tách theo nhãn hiển thị trong sheet Hinh_nen. */
  coverImageGroups?: HinhNenDriveImageGroups;
  coverSourceLinkGroups?: HinhNenSourceLinkGroups;
  /** Google Docs hook đặt cùng dòng với folder ảnh đặc biệt trong Hinh_nen. */
  hookSourceGroups?: HinhNenHookSourceGroups;
}

function isLikelyLinkHeader(header: string): boolean {
  return header.includes('link') || header.includes('anh') || header.includes('hinh');
}

function workbookRowsWithLinks(sheet: XLSX.WorkSheet): Array<Record<string, string>> {
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false, defval: '' });
  if (rows.length === 0) return [];

  const headers = normalizeWorkbookHeaders(rows[0] ?? []);
  const results: Array<Record<string, string>> = [];

  for (const [rowOffset, rawRow] of rows.slice(1).entries()) {
    const rowMap: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      const rawValue = String(rawRow[columnIndex] ?? '').trim();
      const cellRef = XLSX.utils.encode_cell({ r: rowOffset + 1, c: columnIndex });
      const cell = sheet[cellRef];
      const hyperlink = typeof cell?.l?.Target === 'string' ? cell.l.Target.trim() : '';

      rowMap[header] = hyperlink && isLikelyLinkHeader(header) ? hyperlink : rawValue;
      if (hyperlink) {
        rowMap[`${header}__hyperlink`] = hyperlink;
        rowMap[`${header}__display`] = rawValue;
        // Giữ hyperlink theo vị trí cột, kể cả cột Sheet không có header.
        rowMap[`__column_${columnIndex + 1}__hyperlink`] = hyperlink;
      }
    });
    results.push(rowMap);
  }

  return results;
}

function firstLinkDisplayValue(row: Record<string, string>): string {
  const preferred = firstValue(
    row,
    'link_drive__display',
    'link_anh__display',
    'link_hinh__display',
    'link_hinh_anh__display',
    'hinh_anh__display',
    'anh__display',
    'image_link__display',
  );
  if (preferred) return preferred;

  const displayEntry = Object.entries(row).find(([header, value]) => (
    header.endsWith('__display') && isLikelyLinkHeader(header) && String(value ?? '').trim()
  ));
  return String(displayEntry?.[1] ?? '').trim();
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

/** Cột Maps là nguồn độc lập; tuyệt đối không cho phép fallback sang Link_drive. */
export function preferredGoogleMapsImageLink(row: Record<string, string>): string {
  return firstValue(row, 'anh_gg_maps__hyperlink', 'anh_gg_maps');
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
    version: 4,
    generatedAt: new Date(0).toISOString(),
    workbookName: PREFERRED_WORKBOOK_NAME,
    workbookMtimeMs: 0,
    items: {},
    coverImages: [],
    coverSourceLinks: [],
    coverImageGroups: emptyHinhNenDriveImageGroups(),
    coverSourceLinkGroups: emptyHinhNenSourceLinkGroups(),
    hookSourceGroups: {},
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
    const parsedImageGroups = parsed.coverImageGroups && typeof parsed.coverImageGroups === 'object'
      ? parsed.coverImageGroups as Partial<HinhNenDriveImageGroups>
      : {};
    const parsedSourceGroups = parsed.coverSourceLinkGroups && typeof parsed.coverSourceLinkGroups === 'object'
      ? parsed.coverSourceLinkGroups as Partial<HinhNenSourceLinkGroups>
      : {};
    const manifest: SheetDriveImageManifest = {
      version: Number(parsed.version ?? 1),
      generatedAt: String(parsed.generatedAt ?? new Date(0).toISOString()),
      workbookName: String(parsed.workbookName ?? PREFERRED_WORKBOOK_NAME),
      workbookMtimeMs: Number(parsed.workbookMtimeMs ?? 0),
      items: parsed.items && typeof parsed.items === 'object' ? parsed.items as Record<string, SheetDriveImageManifestEntry> : {},
      coverImages: Array.isArray(parsed.coverImages) ? parsed.coverImages as DriveFolderEntry[] : [],
      coverSourceLinks: Array.isArray(parsed.coverSourceLinks)
        ? parsed.coverSourceLinks.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [],
      coverImageGroups: {
        default: Array.isArray(parsedImageGroups.default) ? parsedImageGroups.default : [],
        green: Array.isArray(parsedImageGroups.green) ? parsedImageGroups.green : [],
        dark: Array.isArray(parsedImageGroups.dark) ? parsedImageGroups.dark : [],
        random: Array.isArray(parsedImageGroups.random) ? parsedImageGroups.random : [],
      },
      coverSourceLinkGroups: {
        default: Array.isArray(parsedSourceGroups.default) ? parsedSourceGroups.default.map((entry) => String(entry || '').trim()).filter(Boolean) : [],
        green: Array.isArray(parsedSourceGroups.green) ? parsedSourceGroups.green.map((entry) => String(entry || '').trim()).filter(Boolean) : [],
        dark: Array.isArray(parsedSourceGroups.dark) ? parsedSourceGroups.dark.map((entry) => String(entry || '').trim()).filter(Boolean) : [],
        random: Array.isArray(parsedSourceGroups.random) ? parsedSourceGroups.random.map((entry) => String(entry || '').trim()).filter(Boolean) : [],
      },
      hookSourceGroups: parsed.hookSourceGroups && typeof parsed.hookSourceGroups === 'object'
        ? Object.fromEntries(Object.entries(parsed.hookSourceGroups)
          .map(([group, url]) => [group, String(url || '').trim()])
          .filter(([, url]) => Boolean(url))) as HinhNenHookSourceGroups
        : {},
    };

    return manifest;
  } catch {
    return emptySheetDriveManifest();
  }
}

export async function buildSheetDriveManifest(
  source: SheetWorkbookSource,
  previousManifest = emptySheetDriveManifest(),
  options: {
    forceRevalidate?: boolean;
    revalidateUncached?: boolean;
    onProgress?: (completed: number, total: number) => void;
  } = {},
): Promise<SheetDriveImageManifest> {
  const forceRevalidate = Boolean(options.forceRevalidate);
  const revalidateUncached = Boolean(options.revalidateUncached);
  const workbook = source.workbook;
  const items: Record<string, SheetDriveImageManifestEntry> = {};
  const coverImagesByGroup = Object.fromEntries(
    HINH_NEN_IMAGE_GROUPS.map((group) => [group, new Map<string, DriveFolderEntry>()]),
  ) as Record<HinhNenImageGroup, Map<string, DriveFolderEntry>>;
  const coverSourceLinkGroups = emptyHinhNenSourceLinkGroups();
  const hookSourceGroups: HinhNenHookSourceGroups = {};
  const itemTasks: Array<() => Promise<void>> = [];
  const mapTasks: Array<() => Promise<void>> = [];
  const coverTasks: Array<() => Promise<void>> = [];
  const coverResolveErrors = Object.fromEntries(
    HINH_NEN_IMAGE_GROUPS.map((group) => [group, 0]),
  ) as Record<HinhNenImageGroup, number>;
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
        const group = classifyHinhNenImageGroup(firstLinkDisplayValue(row));
        coverSourceLinkGroups[group].push(imageLink);
        const hookDocUrl = Object.entries(row).find(([key, value]) => (
          key.endsWith('__hyperlink')
          && /^https:\/\/docs\.google\.com\/document\/d\//i.test(String(value || '').trim())
        ))?.[1];
        if (hookDocUrl) hookSourceGroups[group] = String(hookDocUrl).trim();
      }
      continue;
    }

    if (!sectionKey) continue;

    for (const row of workbookRowsWithLinks(sheet)) {
      const name = firstValue(row, 'ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten');
      if (!name) continue;

      const rawAddress = firstValue(row, 'dia_chi');
      const address = composeAddress(rawAddress, firstValue(row, 'ten_phuong'));
      const imageLink = preferredImageLink(row);
      const mapImageLink = preferredGoogleMapsImageLink(row);
      if (!imageLink && !mapImageLink) continue;
      const key = itemMappingKey(sectionKey, name, address);
      const legacyKey = rawAddress === address ? '' : itemMappingKey(sectionKey, name, rawAddress);

      if (imageLink) itemTasks.push(async () => {
        const previousEntry = previousManifest.items[key] ?? (legacyKey ? previousManifest.items[legacyKey] : undefined);
        // Sheet lớn (VD: Đà Lạt ~680 mục) mà re-resolve toàn bộ qua mạng mỗi lần đổi
        // điểm đến/đồng bộ sẽ rất chậm (concurrency thấp để tránh 401 hàng loạt) và có
        // thể bị Google rate-limit dồn dập, khiến màn hình chờ trông như bị treo. Nếu
        // link ảnh không đổi so với lần trước, dùng lại kết quả đã xác minh thay vì
        // quét lại folder Drive + probe quyền truy cập từ đầu.
        const allPreviousCandidates = previousEntry
          ? (previousEntry.candidateImages?.length
              ? previousEntry.candidateImages
              : [{ fileId: previousEntry.fileId, fileName: previousEntry.fileName, viewUrl: '' }])
            .filter((entry) => entry.fileId)
          : [];
        const cachedPreviousCandidates = allPreviousCandidates
          .filter((entry) => hasDriveFileDiskCache(entry.fileId));
        // Manifest portable là chỉ mục tải ảnh, không phải bằng chứng ảnh đã sẵn sàng.
        // Tái sử dụng metadata khi link XLSX không đổi giúp máy mới không phải resolve
        // lại hàng trăm folder Drive trước khi bắt đầu warm cache. Guard tạo list vẫn
        // khóa đến khi warm + rebuild dataset hoàn tất. Khi warm phát hiện ID hỏng,
        // revalidateUncached=true chỉ resolve lại đúng các entry chưa có file thật.
        const reusableCandidates = revalidateUncached ? cachedPreviousCandidates : allPreviousCandidates;
        if (!forceRevalidate && previousEntry?.fileId && previousEntry.sourceLink === imageLink && reusableCandidates.length > 0) {
          const primary = reusableCandidates.find((entry) => entry.fileId === previousEntry.fileId)
            || reusableCandidates[0];
          items[key] = {
            ...previousEntry,
            key,
            name,
            address,
            sectionKey,
            fileId: primary.fileId,
            fileName: primary.fileName,
            candidateImages: reusableCandidates,
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
            items[key] = {
              ...previousEntry,
              key,
              sourceLink: imageLink,
              name,
              address,
              sectionKey,
            };
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
              items[key] = { ...previousEntry, key, name, address, sectionKey };
              syncStats.keptPrevious += 1;
            } else {
              syncStats.blockedPublic += 1;
            }
          } else if (previousEntry?.fileId) {
            items[key] = { ...previousEntry, key, name, address, sectionKey };
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

      // Chạy sau phase ảnh thật để việc cập nhật hai nguồn không ghi đè lẫn nhau.
      mapTasks.push(async () => {
        const previousEntry = previousManifest.items[key] ?? (legacyKey ? previousManifest.items[legacyKey] : undefined);
        const currentEntry = items[key];
        if (!mapImageLink) {
          if (currentEntry) {
            const { mapSourceLink: _source, mapFileId: _id, mapFileName: _name, mapCandidateImages: _candidates, ...withoutMap } = currentEntry;
            items[key] = withoutMap as SheetDriveImageManifestEntry;
          }
          return;
        }

        const previousCandidates = previousEntry
          ? (previousEntry.mapCandidateImages?.length
              ? previousEntry.mapCandidateImages
              : previousEntry.mapFileId
                ? [{ fileId: previousEntry.mapFileId, fileName: previousEntry.mapFileName || '', viewUrl: '' }]
                : [])
            .filter((entry) => entry.fileId)
          : [];
        const reusableCandidates = revalidateUncached
          ? previousCandidates.filter((entry) => hasDriveFileDiskCache(entry.fileId))
          : previousCandidates;
        let resolvedMaps: DriveFolderEntry[] | null = null;
        if (!forceRevalidate && previousEntry?.mapSourceLink === mapImageLink && reusableCandidates.length > 0) {
          resolvedMaps = reusableCandidates;
        } else {
          const candidates = await resolveDriveLinkToEntries(mapImageLink, `${name} Google Maps`, address).catch(() => null);
          resolvedMaps = candidates === null
            ? null
            : (candidates.length > 0 ? await filterAccessibleDriveEntries(candidates) : []);
        }

        // Lỗi mạng/quyền tạm thời không được phá cache Maps đã xác minh trước đó.
        const resolvedSuccessfully = Boolean(resolvedMaps && resolvedMaps.length > 0);
        const usableMaps = resolvedSuccessfully ? resolvedMaps! : previousCandidates;
        if (usableMaps.length === 0) {
          if (currentEntry) {
            items[key] = {
              ...currentEntry,
              mapSourceLink: mapImageLink,
              mapFileId: '',
              mapFileName: '',
              mapCandidateImages: [],
            };
          }
          return;
        }
        const primary = usableMaps.find((entry) => entry.fileId === previousEntry?.mapFileId) || usableMaps[0];
        const baseEntry: SheetDriveImageManifestEntry = currentEntry || previousEntry || {
          key,
          sectionKey,
          name,
          address,
          sourceLink: imageLink,
          fileId: '',
          fileName: '',
          candidateImages: [],
        };
        items[key] = {
          ...baseEntry,
          key,
          sectionKey,
          name,
          address,
          mapSourceLink: resolvedSuccessfully ? mapImageLink : (previousEntry?.mapSourceLink || mapImageLink),
          mapFileId: primary.fileId,
          mapFileName: primary.fileName,
          mapCandidateImages: usableMaps,
        };
      });
    }
  }

  const normalizedCoverLinkGroups = Object.fromEntries(
    HINH_NEN_IMAGE_GROUPS.map((group) => [group, [...new Set(coverSourceLinkGroups[group])].sort()]),
  ) as HinhNenSourceLinkGroups;
  const previousImageGroups = previousManifest.version >= 2
    ? {
        default: previousManifest.coverImageGroups?.default || previousManifest.coverImages || [],
        green: previousManifest.coverImageGroups?.green || [],
        dark: previousManifest.coverImageGroups?.dark || [],
        random: previousManifest.coverImageGroups?.random || [],
      }
    : emptyHinhNenDriveImageGroups();
  const previousSourceGroups = previousManifest.version >= 2
    ? {
        default: previousManifest.coverSourceLinkGroups?.default || previousManifest.coverSourceLinks || [],
        green: previousManifest.coverSourceLinkGroups?.green || [],
        dark: previousManifest.coverSourceLinkGroups?.dark || [],
        random: previousManifest.coverSourceLinkGroups?.random || [],
      }
    : emptyHinhNenSourceLinkGroups();

  for (const group of HINH_NEN_IMAGE_GROUPS) {
    const normalizedLinks = normalizedCoverLinkGroups[group];
    const normalizedPreviousLinks = [...new Set(previousSourceGroups[group])].sort();
    const linksUnchanged = normalizedPreviousLinks.length === normalizedLinks.length
      && normalizedPreviousLinks.every((entry, index) => entry === normalizedLinks[index]);
    const reusePreviousGroup = !forceRevalidate
      && previousManifest.version >= 2
      && previousImageGroups[group].length > 0
      && linksUnchanged;

    if (reusePreviousGroup) {
      for (const entry of previousImageGroups[group]) {
        if (entry.fileId) coverImagesByGroup[group].set(entry.fileId, entry);
      }
      continue;
    }

    for (const imageLink of normalizedLinks) {
      coverTasks.push(async () => {
        const maxEntries = group === 'default' ? 50 : 200;
        const candidateImages = await resolveDriveLinkToEntries(imageLink, 'hinh nen', '', maxEntries).catch((error) => {
          console.warn('[sync] Bo qua anh nen Drive loi (' + group + '): ' + (error instanceof Error ? error.message : String(error)));
          return null as DriveFolderEntry[] | null;
        });

        if (candidateImages === null) {
          coverResolveErrors[group] += 1;
          return;
        }

        for (const entry of candidateImages) {
          if (entry.fileId) coverImagesByGroup[group].set(entry.fileId, entry);
        }
      });
    }
  }

  await runLimited([...coverTasks, ...itemTasks], DRIVE_MANIFEST_CONCURRENCY, options.onProgress);
  await runLimited(mapTasks, DRIVE_MANIFEST_CONCURRENCY);

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

  const nextCoverImageGroups = emptyHinhNenDriveImageGroups();
  const nextCoverSourceLinkGroups = { ...normalizedCoverLinkGroups };
  for (const group of HINH_NEN_IMAGE_GROUPS) {
    const current = [...coverImagesByGroup[group].values()];
    const previous = previousImageGroups[group];
    const canReusePrevious = previousManifest.version >= 2
      && normalizedCoverLinkGroups[group].length > 0
      && coverResolveErrors[group] > 0
      && previous.length > 0;
    if (!canReusePrevious) {
      nextCoverImageGroups[group] = current;
      continue;
    }

    const merged = new Map(current.map((entry) => [entry.fileId, entry]));
    for (const entry of previous) {
      if (entry.fileId && !merged.has(entry.fileId)) merged.set(entry.fileId, entry);
    }
    nextCoverImageGroups[group] = [...merged.values()];
    nextCoverSourceLinkGroups[group] = previousSourceGroups[group];
    console.warn(
      '[sync] Anh nen loi ' + coverResolveErrors[group] + ' link (' + group
      + '): giu cache cu -> ' + nextCoverImageGroups[group].length + ' anh.',
    );
  }

  return {
    version: 4,
    generatedAt: new Date().toISOString(),
    workbookName: source.workbookName,
    workbookMtimeMs: source.fetchedAt,
    items,
    coverImages: nextCoverImageGroups.default,
    coverSourceLinks: nextCoverSourceLinkGroups.default,
    coverImageGroups: nextCoverImageGroups,
    coverSourceLinkGroups: nextCoverSourceLinkGroups,
    hookSourceGroups,
  };
}

export function writeSheetDriveManifest(
  dataRoot: string,
  manifest: SheetDriveImageManifest,
  destinationId: DestinationId = 'dalat',
): string {
  fs.mkdirSync(dataRoot, { recursive: true });
  const manifestPath = getSheetDriveManifestPath(dataRoot, destinationId);
  const tempPath = `${manifestPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(manifest, null, 2), 'utf-8');
    fs.renameSync(tempPath, manifestPath);
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
  return manifestPath;
}
