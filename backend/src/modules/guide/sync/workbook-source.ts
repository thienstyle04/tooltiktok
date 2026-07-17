import * as XLSX from 'xlsx';

import { DestinationConfig, getDestinationConfig, DEFAULT_DESTINATION_ID, DestinationId } from './destination-config';

export const DALAT_FNB_SHEET_URL = getDestinationConfig('dalat').sheetUrl;
export const DALAT_FNB_EXPORT_URL = getDestinationConfig('dalat').exportUrl;
export const PREFERRED_WORKBOOK_NAME = getDestinationConfig(DEFAULT_DESTINATION_ID).workbookName;

const SHEET_FETCH_TIMEOUT_MS = 30_000;

export interface SheetWorkbookSource {
  workbook: XLSX.WorkBook;
  workbookName: string;
  destinationId: DestinationId;
  bytes: number;
  fetchedAt: number;
  sourceUrl: string;
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

export async function fetchWorkbookFromSheet(destination: DestinationConfig): Promise<SheetWorkbookSource> {
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

  return {
    workbook: XLSX.read(workbookBuffer, { cellDates: false, type: 'buffer' }),
    workbookName: destination.workbookName,
    destinationId: destination.id,
    bytes: workbookBuffer.byteLength,
    fetchedAt: Date.now(),
    sourceUrl: destination.exportUrl,
  };
}
