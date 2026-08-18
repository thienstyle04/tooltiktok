export type DestinationId = string;
export type DestinationSourceType = 'xlsx' | 'google-sheet';

export interface DestinationConfig {
  id: DestinationId;
  label: string;
  shortLabel: string;
  sheetUrl: string;
  exportUrl: string;
  workbookName: string;
  sourceType: DestinationSourceType;
  /** Tên file XLSX mặc định nằm trong backend/resources/workbooks. */
  bundledWorkbookFile?: string;
  /** Tên file gốc do người dùng nhập, dùng để hiển thị trên giao diện. */
  workbookFileName?: string;
  /** Khi true: mẫu ưu tiên hiển thị hết dữ liệu đối tác (isPartner) trước, chỉ dùng dữ liệu thường để bổ sung khi thiếu. */
  partnerFirst?: boolean;
}

export interface DestinationInfo {
  id: DestinationId;
  label: string;
  shortLabel: string;
  sheetUrl: string;
  sourceType: DestinationSourceType;
  workbookFileName: string;
}

export const DEFAULT_DESTINATION_ID: DestinationId = 'dalat';

export const DESTINATIONS: Record<DestinationId, DestinationConfig> = {
  dalat: {
    id: 'dalat',
    label: 'Đà Lạt',
    shortLabel: 'ĐL',
    sheetUrl:
      process.env.DALAT_FNB_SHEET_URL
      || 'https://docs.google.com/spreadsheets/d/1-ECVLtuySSlCO5AShcJle1uP9j8XCA4l/edit?gid=1236724598#gid=1236724598',
    exportUrl:
      process.env.DALAT_FNB_EXPORT_URL
      || 'https://docs.google.com/spreadsheets/d/1-ECVLtuySSlCO5AShcJle1uP9j8XCA4l/export?format=xlsx',
    workbookName: 'F&B ĐÀ LẠT.xlsx',
    workbookFileName: 'F&B ĐÀ LẠT.xlsx',
    sourceType: 'xlsx',
    bundledWorkbookFile: 'dalat.xlsx',
  },
  greenland: {
    id: 'greenland',
    label: 'Green Land',
    shortLabel: 'GL',
    sheetUrl:
      process.env.GREEN_LAND_FNB_SHEET_URL
      || 'https://docs.google.com/spreadsheets/d/1MfoS4Rg73vF0xbBaMb2EUG48DUINlxr8aDbq1cM_MjQ/edit?gid=160176225#gid=160176225',
    exportUrl:
      process.env.GREEN_LAND_FNB_EXPORT_URL
      || 'https://docs.google.com/spreadsheets/d/1MfoS4Rg73vF0xbBaMb2EUG48DUINlxr8aDbq1cM_MjQ/export?format=xlsx',
    workbookName: 'Green Land - data.xlsx',
    workbookFileName: 'Green Land - data.xlsx',
    sourceType: 'xlsx',
    bundledWorkbookFile: 'greenland.xlsx',
    partnerFirst: true,
  },
};

export function getDestinationList(): DestinationConfig[] {
  return Object.values(DESTINATIONS);
}

/** Danh sách mặc định để tương thích các công cụ audit chạy độc lập. Runtime dùng getDestinationList(). */
export const DESTINATION_LIST: DestinationConfig[] = Object.values(DESTINATIONS);

export function isDestinationId(value: string): value is DestinationId {
  return Boolean(value && DESTINATIONS[value]);
}

export function getDestinationConfig(id: DestinationId): DestinationConfig {
  const config = DESTINATIONS[id];
  if (!config) throw new Error(`Destination "${id}" is not configured.`);
  return config;
}

export function registerDestination(config: DestinationConfig): void {
  DESTINATIONS[config.id] = config;
}

export function unregisterDestination(id: DestinationId): void {
  if (id === 'dalat' || id === 'greenland') return;
  delete DESTINATIONS[id];
}

export function isPartnerFirstDestination(id: DestinationId): boolean {
  return !!DESTINATIONS[id]?.partnerFirst;
}

export function toDestinationInfo(config: DestinationConfig): DestinationInfo {
  return {
    id: config.id,
    label: config.label,
    shortLabel: config.shortLabel,
    sheetUrl: config.sheetUrl,
    sourceType: config.sourceType,
    workbookFileName: config.workbookFileName || config.workbookName,
  };
}
