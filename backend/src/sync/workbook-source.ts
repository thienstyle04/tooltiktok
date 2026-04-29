import * as fs from 'node:fs';
import * as path from 'node:path';

export const DALAT_FNB_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1-ECVLtuySSlCO5AShcJle1uP9j8XCA4l/edit?gid=1236724598#gid=1236724598';
export const DALAT_FNB_EXPORT_URL =
  'https://docs.google.com/spreadsheets/d/1-ECVLtuySSlCO5AShcJle1uP9j8XCA4l/export?format=xlsx';
export const PREFERRED_WORKBOOK_NAME = 'F&B ĐÀ LẠT.xlsx';
const SHEET_FETCH_TIMEOUT_MS = 30_000;

function createTimeoutSignal(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  timeout.unref?.();
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timeout),
  };
}

function listWorkbookPaths(workspaceRoot: string): string[] {
  return fs
    .readdirSync(workspaceRoot)
    .filter((entry) => entry.toLowerCase().endsWith('.xlsx'))
    .map((entry) => path.join(workspaceRoot, entry));
}

export function findWorkbookPath(workspaceRoot: string): string | null {
  const workbookPaths = listWorkbookPaths(workspaceRoot);
  if (workbookPaths.length === 0) return null;

  const preferredPath = path.join(workspaceRoot, PREFERRED_WORKBOOK_NAME);
  if (fs.existsSync(preferredPath)) return preferredPath;
  if (workbookPaths.length === 1) return workbookPaths[0];

  return workbookPaths
    .map((filePath) => ({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs || left.filePath.localeCompare(right.filePath, 'vi'))[0]?.filePath ?? null;
}

export async function syncWorkbookFromSheet(workspaceRoot: string): Promise<{ workbookPath: string; bytes: number }> {
  const timeout = createTimeoutSignal(SHEET_FETCH_TIMEOUT_MS);
  const response = await fetch(DALAT_FNB_EXPORT_URL, {
    headers: {
      Referer: DALAT_FNB_SHEET_URL,
      'User-Agent': 'Codex Workbook Sync',
    },
    signal: timeout.signal,
  }).finally(timeout.cancel);
  if (!response.ok) {
    throw new Error(`Không tải được workbook từ Google Sheet. HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const workbookBuffer = Buffer.from(arrayBuffer);
  const workbookPath = path.join(workspaceRoot, PREFERRED_WORKBOOK_NAME);
  const tempPath = `${workbookPath}.download`;
  fs.writeFileSync(tempPath, workbookBuffer);
  fs.copyFileSync(tempPath, workbookPath);
  // Windows/Node 24 can crash natively when deleting the freshly downloaded
  // xlsx temp file while another file handle is settling. Keep one stable temp
  // file and overwrite it on the next sync instead of deleting it here.
  return { workbookPath, bytes: workbookBuffer.byteLength };
}
