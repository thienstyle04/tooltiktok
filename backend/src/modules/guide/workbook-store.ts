// ─── Workbook nguồn và thống kê nguồn dữ liệu trên đĩa ───────────────────────
// Kiểm tra link Google Sheet / file XLSX tải lên, đọc-ghi bản chụp workbook,
// metadata và thống kê từng nguồn. Đường dẫn dữ liệu được truyền vào mỗi lần gọi.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';
import type { DestinationId } from './sync/destination-config';
import { ensureDataRoot } from './guide-file-io';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { DestinationSummary } from '../../common/interfaces/guide.types';
import { normalizeText, safeRelative } from './logic/image-resolver';
import { DestinationConfig, getDestinationConfig, isIsolatedSheetSource } from './sync/destination-config';
import { publishedSourcePaths } from './sync/published-source';
import { resolveSectionKeyFromSheetName } from './sync/sheet-section';
import { MAX_WORKBOOK_FILE_BYTES, SheetWorkbookSource, parseWorkbookBuffer } from './sync/workbook-source';

export interface LocalWorkbookUpload {
  buffer: Buffer;
  originalname: string;
  size: number;
  mimetype?: string;
}

export function extractSheetId(value: string): string {
  const match = String(value || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] || '';
}

export function parseGoogleSheetUrl(value: unknown): { sheetId: string; sheetUrl: string; exportUrl: string } {
  const raw = String(value || '').trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new BadRequestException('Link Google Sheet không hợp lệ.');
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'docs.google.com') {
    throw new BadRequestException('Chỉ hỗ trợ link Google Sheet từ docs.google.com.');
  }
  const sheetId = extractSheetId(parsed.pathname);
  if (!sheetId) {
    throw new BadRequestException('Không tìm thấy mã Google Sheet trong link.');
  }
  const gid = parsed.searchParams.get('gid') || new URLSearchParams(parsed.hash.replace(/^#/, '')).get('gid');
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit${gid ? `?gid=${encodeURIComponent(gid)}#gid=${encodeURIComponent(gid)}` : ''}`;
  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
  return { sheetId, sheetUrl, exportUrl };
}

export function createDestinationShortLabel(label: string): string {
  const words = label.split(/\s+/).filter(Boolean);
  const initials = words.map((word) => [...word][0] || '').join('');
  const value = (initials.length >= 2 ? initials : label.slice(0, 2)).toLocaleUpperCase('vi-VN');
  return value.slice(0, 3);
}

export function normalizeDestinationLabel(value: unknown): string {
  const label = String(value || '').replace(/\s+/g, ' ').trim();
  if (label.length < 2 || label.length > 60) {
    throw new BadRequestException('Tên nguồn dữ liệu phải có từ 2 đến 60 ký tự.');
  }
  return label;
}

export function validateWorkbookUpload(file: LocalWorkbookUpload | undefined): LocalWorkbookUpload {
  if (!file?.buffer?.length) {
    throw new BadRequestException('Vui lòng chọn file XLSX.');
  }
  const originalname = path.basename(String(file.originalname || 'du-lieu.xlsx')).trim();
  if (!/\.xlsx$/i.test(originalname)) {
    throw new BadRequestException('Chỉ chấp nhận file có định dạng .xlsx.');
  }
  if (file.buffer.byteLength > MAX_WORKBOOK_FILE_BYTES || Number(file.size || 0) > MAX_WORKBOOK_FILE_BYTES) {
    throw new BadRequestException('File XLSX vượt quá giới hạn 20 MB.');
  }
  return { ...file, originalname, size: file.buffer.byteLength };
}

export function createUploadedWorkbookSource(dataRoot: string,
  config: DestinationConfig,
  file: LocalWorkbookUpload,
): SheetWorkbookSource {
  try {
    return parseWorkbookBuffer(file.buffer, {
      workbookName: file.originalname,
      destinationId: config.id,
      sourceUrl: workbookSnapshotPath(dataRoot, config.id),
      sourceType: 'runtime-xlsx',
    });
  } catch (error) {
    throw new BadRequestException(error instanceof Error ? error.message : String(error));
  }
}

export function validateWorkbookData(source: SheetWorkbookSource): void {
  let recognizedSheetCount = 0;
  let dataRowCount = 0;
  const nameFields = ['ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten'];
  for (const sheetName of source.workbook.SheetNames) {
    if (!resolveSectionKeyFromSheetName(sheetName)) continue;
    recognizedSheetCount += 1;
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(source.workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: '',
    });
    const headers = (rows[0] || []).map((header) => normalizeText(header));
    const nameIndexes = nameFields
      .map((field) => headers.indexOf(field))
      .filter((index) => index >= 0);
    if (!nameIndexes.length) continue;
    dataRowCount += rows.slice(1).filter((row) => nameIndexes.some((index) => String(row[index] || '').trim())).length;
  }
  if (!recognizedSheetCount || !dataRowCount) {
    throw new BadRequestException(
      'Workbook không có dữ liệu địa điểm hợp lệ. Cần có sheet đúng nhóm và cột tên địa điểm.',
    );
  }
}

export function destinationStatsPath(dataRoot: string, id: DestinationId): string {
  return path.join(dataRoot, `destination-stats.${id}.json`);
}

export function readDestinationStats(dataRoot: string, id: DestinationId): Pick<DestinationSummary, 'totalItems' | 'syncedAt'> {
  const filePath = destinationStatsPath(dataRoot, id);
  if (!fs.existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { totalItems?: number; syncedAt?: string };
    const totalItems = Number(parsed.totalItems);
    return {
      totalItems: Number.isFinite(totalItems) && totalItems >= 0 ? totalItems : undefined,
      syncedAt: parsed.syncedAt ? String(parsed.syncedAt) : undefined,
    };
  } catch {
    return {};
  }
}

export function writeDestinationStats(dataRoot: string, id: DestinationId, totalItems: number): void {
  ensureDataRoot(dataRoot);
  fs.writeFileSync(
    destinationStatsPath(dataRoot, id),
    JSON.stringify({ totalItems, syncedAt: new Date().toISOString() }, null, 2),
    'utf-8',
  );
}

export function workbookSnapshotPath(dataRoot: string, id: DestinationId): string {
  if (isIsolatedSheetSource(id)) {
    const published = publishedSourcePaths(dataRoot, id);
    if (published) return published.workbook;
  }
  return path.join(dataRoot, `workbook-cache.${id}.xlsx`);
}

export function workbookMetadataPath(dataRoot: string, id: DestinationId): string {
  return path.join(dataRoot, `workbook-source-meta.${id}.json`);
}

export function applyStoredWorkbookMetadata(dataRoot: string, config: DestinationConfig): void {
  const metadataPath = workbookMetadataPath(dataRoot, config.id);
  if (!fs.existsSync(metadataPath)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as { workbookFileName?: string };
    const fileName = path.basename(String(parsed.workbookFileName || '')).trim();
    if (/\.xlsx$/i.test(fileName)) {
      config.workbookName = fileName;
      config.workbookFileName = fileName;
    }
  } catch {
    // Metadata chỉ dùng để hiển thị tên file; workbook vẫn đọc bình thường nếu file này hỏng.
  }
}

export function writeWorkbookMetadata(dataRoot: string, id: DestinationId, workbookFileName: string): void {
  ensureDataRoot(dataRoot);
  fs.writeFileSync(
    workbookMetadataPath(dataRoot, id),
    JSON.stringify({ workbookFileName, updatedAt: new Date().toISOString() }, null, 2),
    'utf-8',
  );
}

export function bundledWorkbookPath(toolRoot: string, id: DestinationId): string | null {
  const fileName = getDestinationConfig(id).bundledWorkbookFile;
  if (!fileName) return null;
  const target = path.join(toolRoot, 'resources', 'workbooks', fileName);
  return safeRelative(path.join(toolRoot, 'resources', 'workbooks'), target) && fs.existsSync(target)
    ? target
    : null;
}

export function loadPreferredWorkbookSource(dataRoot: string, toolRoot: string, id: DestinationId): SheetWorkbookSource | null {
  return loadWorkbookSnapshot(dataRoot, id) || loadBundledWorkbook(toolRoot, id);
}

export function loadWorkbookSnapshot(dataRoot: string, id: DestinationId): SheetWorkbookSource | null {
  const snapshotPath = workbookSnapshotPath(dataRoot, id);
  if (!fs.existsSync(snapshotPath)) return null;
  try {
    const workbookBuffer = fs.readFileSync(snapshotPath);
    if (!workbookBuffer.length) return null;
    const config = getDestinationConfig(id);
    applyStoredWorkbookMetadata(dataRoot, config);
    const stat = fs.statSync(snapshotPath);
    const source = parseWorkbookBuffer(workbookBuffer, {
      workbookName: config.workbookName,
      destinationId: id,
      fetchedAt: stat.mtimeMs,
      sourceUrl: snapshotPath,
      sourceType: 'runtime-xlsx',
    });
    validateWorkbookData(source);
    console.log(`[xlsx] Dùng workbook cục bộ (${config.label}): ${snapshotPath}`);
    return source;
  } catch (error) {
    console.warn(
      `[xlsx] Không đọc được workbook cục bộ (${getDestinationConfig(id).label}), thử bản đóng kèm:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export function loadBundledWorkbook(toolRoot: string, id: DestinationId): SheetWorkbookSource | null {
  const bundledPath = bundledWorkbookPath(toolRoot, id);
  if (!bundledPath) return null;
  try {
    const config = getDestinationConfig(id);
    const body = fs.readFileSync(bundledPath);
    const stat = fs.statSync(bundledPath);
    const source = parseWorkbookBuffer(body, {
      workbookName: config.workbookName,
      destinationId: id,
      fetchedAt: stat.mtimeMs,
      sourceUrl: bundledPath,
      sourceType: 'bundled-xlsx',
    });
    validateWorkbookData(source);
    console.log(`[xlsx] Dùng workbook đóng kèm (${config.label}): ${bundledPath}`);
    return source;
  } catch (error) {
    console.warn(
      `[xlsx] Không đọc được workbook đóng kèm (${getDestinationConfig(id).label}):`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export function saveWorkbookSnapshot(dataRoot: string, source: SheetWorkbookSource, throwOnError = false): void {
  const target = workbookSnapshotPath(dataRoot, source.destinationId);
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  const backup = `${target}.bak`;
  let movedOldFile = false;
  try {
    ensureDataRoot(dataRoot);
    const body = source.workbookBuffer?.length
      ? source.workbookBuffer
      : XLSX.write(source.workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    fs.writeFileSync(temporary, body);
    if (fs.existsSync(backup)) fs.rmSync(backup, { force: true });
    if (fs.existsSync(target)) {
      fs.renameSync(target, backup);
      movedOldFile = true;
    }
    fs.renameSync(temporary, target);
    if (movedOldFile && fs.existsSync(backup)) fs.rmSync(backup, { force: true });
  } catch (error) {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
    if (movedOldFile && !fs.existsSync(target) && fs.existsSync(backup)) {
      fs.renameSync(backup, target);
    }
    console.warn(
      `[xlsx] Không lưu được workbook cục bộ (${getDestinationConfig(source.destinationId).label}):`,
      error instanceof Error ? error.message : error,
    );
    if (throwOnError) {
      throw new ServiceUnavailableException('Không thể lưu file XLSX; dữ liệu cũ vẫn được giữ nguyên.');
    }
  }
}
