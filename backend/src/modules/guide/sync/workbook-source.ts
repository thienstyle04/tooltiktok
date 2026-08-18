import * as XLSX from 'xlsx';

import { DestinationConfig, getDestinationConfig, DEFAULT_DESTINATION_ID, DestinationId } from './destination-config';

export const DALAT_FNB_SHEET_URL = getDestinationConfig('dalat').sheetUrl;
export const DALAT_FNB_EXPORT_URL = getDestinationConfig('dalat').exportUrl;
export const PREFERRED_WORKBOOK_NAME = getDestinationConfig(DEFAULT_DESTINATION_ID).workbookName;
export const MAX_WORKBOOK_FILE_BYTES = 20 * 1024 * 1024;

const SHEET_FETCH_TIMEOUT_MS = 30_000;
const SHEET_FETCH_MAX_ATTEMPTS = 3;
const SHEET_FETCH_RETRY_DELAY_MS = 2_000;

export interface SheetWorkbookSource {
  workbook: XLSX.WorkBook;
  workbookName: string;
  destinationId: DestinationId;
  bytes: number;
  fetchedAt: number;
  sourceUrl: string;
  workbookBuffer?: Buffer;
  sourceType?: 'runtime-xlsx' | 'bundled-xlsx' | 'google-sheet';
}

export function parseWorkbookBuffer(
  workbookBuffer: Buffer,
  options: {
    workbookName: string;
    destinationId: DestinationId;
    sourceUrl: string;
    sourceType: NonNullable<SheetWorkbookSource['sourceType']>;
    fetchedAt?: number;
  },
): SheetWorkbookSource {
  if (!workbookBuffer.length) {
    throw new Error('File XLSX đang trống.');
  }
  if (workbookBuffer.byteLength > MAX_WORKBOOK_FILE_BYTES) {
    throw new Error('File XLSX vượt quá giới hạn 20 MB.');
  }
  if (workbookBuffer[0] !== 0x50 || workbookBuffer[1] !== 0x4b) {
    throw new Error('File không đúng định dạng XLSX.');
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(workbookBuffer, { cellDates: false, type: 'buffer' });
  } catch (error) {
    throw new Error(`Không thể đọc file XLSX: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!workbook.SheetNames.length) {
    throw new Error('File XLSX không có sheet dữ liệu.');
  }

  return {
    workbook,
    workbookName: options.workbookName,
    destinationId: options.destinationId,
    bytes: workbookBuffer.byteLength,
    fetchedAt: options.fetchedAt ?? Date.now(),
    sourceUrl: options.sourceUrl,
    workbookBuffer,
    sourceType: options.sourceType,
  };
}

function createTimeoutSignal(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  timeout.unref?.();
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timeout),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientSheetFetchError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error);
  const cause = error && typeof error === 'object' && 'cause' in error
    ? (error as { cause?: unknown }).cause
    : null;
  const causeCode = cause && typeof cause === 'object' && 'code' in cause
    ? String((cause as { code?: unknown }).code || '')
    : '';
  const causeMessage = cause instanceof Error ? cause.message : String(cause || '');
  return /fetch failed|aborted|timeout|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|UND_ERR/i.test(
    `${message} ${causeMessage} ${causeCode}`,
  );
}

async function fetchWorkbookOnce(destination: DestinationConfig): Promise<SheetWorkbookSource> {
  if (!destination.exportUrl) {
    throw new Error(`Nguồn ${destination.label} chưa có link Google Sheet dự phòng.`);
  }
  const timeout = createTimeoutSignal(SHEET_FETCH_TIMEOUT_MS);
  const response = await fetch(destination.exportUrl, {
    headers: {
      Referer: destination.sheetUrl,
      'User-Agent': 'Dalat Carousel Google Sheet Reader',
    },
    signal: timeout.signal,
  }).finally(timeout.cancel);

  if (!response.ok) {
    throw new Error(`Khong tai duoc du lieu tu Google Sheet (${destination.label}). HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const workbookBuffer = Buffer.from(arrayBuffer);

  return parseWorkbookBuffer(workbookBuffer, {
    workbookName: destination.workbookName,
    destinationId: destination.id,
    sourceUrl: destination.exportUrl,
    sourceType: 'google-sheet',
  });
}

export async function fetchWorkbookFromSheet(destination: DestinationConfig): Promise<SheetWorkbookSource> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= SHEET_FETCH_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fetchWorkbookOnce(destination);
    } catch (error) {
      lastError = error;
      if (attempt >= SHEET_FETCH_MAX_ATTEMPTS || !isTransientSheetFetchError(error)) {
        break;
      }
      console.warn(
        `[sync] Tai Google Sheet (${destination.label}) lan ${attempt}/${SHEET_FETCH_MAX_ATTEMPTS} that bai, thu lai...`,
        error instanceof Error ? error.message : error,
      );
      await sleep(SHEET_FETCH_RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Khong tai duoc du lieu tu Google Sheet (${destination.label}).`);
}
