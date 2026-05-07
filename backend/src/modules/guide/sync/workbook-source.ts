import * as XLSX from 'xlsx';

export const DALAT_FNB_SHEET_URL =
  process.env.DALAT_FNB_SHEET_URL || 'https://docs.google.com/spreadsheets/d/1-ECVLtuySSlCO5AShcJle1uP9j8XCA4l/edit?gid=1236724598#gid=1236724598';
export const DALAT_FNB_EXPORT_URL =
  process.env.DALAT_FNB_EXPORT_URL || 'https://docs.google.com/spreadsheets/d/1-ECVLtuySSlCO5AShcJle1uP9j8XCA4l/export?format=xlsx';
export const PREFERRED_WORKBOOK_NAME = 'Google Sheet';

const SHEET_FETCH_TIMEOUT_MS = 30_000;

export interface SheetWorkbookSource {
  workbook: XLSX.WorkBook;
  workbookName: string;
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

export async function fetchWorkbookFromSheet(): Promise<SheetWorkbookSource> {
  const timeout = createTimeoutSignal(SHEET_FETCH_TIMEOUT_MS);
  const response = await fetch(DALAT_FNB_EXPORT_URL, {
    headers: {
      Referer: DALAT_FNB_SHEET_URL,
      'User-Agent': 'Dalat Carousel Google Sheet Reader',
    },
    signal: timeout.signal,
  }).finally(timeout.cancel);

  if (!response.ok) {
    throw new Error(`Khong tai duoc du lieu tu Google Sheet. HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const workbookBuffer = Buffer.from(arrayBuffer);

  return {
    workbook: XLSX.read(workbookBuffer, { cellDates: false, type: 'buffer' }),
    workbookName: PREFERRED_WORKBOOK_NAME,
    bytes: workbookBuffer.byteLength,
    fetchedAt: Date.now(),
    sourceUrl: DALAT_FNB_EXPORT_URL,
  };
}
