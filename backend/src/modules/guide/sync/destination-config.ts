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
  /** Geographic copy/template capabilities; storage is always scoped by id. */
  contentDestinationId?: DestinationId;
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
  contentDestinationId?: DestinationId;
  allowedDeckIds: string[];
}

export const DEFAULT_DESTINATION_ID: DestinationId = 'dalat';
export const DALAT_TEST_SHEET_ID = '1QlMXQ1XH-uHS6bBEC7Pps5f1p9rYJ780';
export const DALAT_THREADS_SHEET_ID = '1eTupjLJX-C4V06Erwe8rGzgB9JyzfzjG';
export const THREADS_NOTE_DECK_LABELS: Record<string, string> = {
  'threads-food-local': 'Quán ăn Threads Local', 'threads-cafe-local': 'Cà phê Threads Local',
  'threads-mix-local': 'Tổng hợp Threads', 'threads-mix-text': 'Tổng hợp Threads chữ',
  'threads-toplist-dalat': 'Top list Đà Lạt',
  'itinerary-note-threads-3n2d': 'Note Threads 3N2Đ', 'itinerary-note-threads-2n1d': 'Note Threads 2N1Đ',
  'itinerary-note-threads-budget-3n2d': 'Chi phí Threads 3N2Đ',
  'summary-note': 'Tổng hợp địa điểm', 'itinerary-note-2days': 'Lịch trình Note 2 ngày',
  'itinerary-note-dark': 'Lịch trình Note nền đen', 'itinerary-note-timed': 'Lịch trình Note theo giờ',
};
export const THREADS_NOTE_DECK_IDS = Object.keys(THREADS_NOTE_DECK_LABELS);
// Permission catalog, independent of whether a source currently has enough data.
const OTHER_DECK_IDS = [
  'itinerary-3n2d', 'budget-3n2d', 'budget-72h-summary', 'budget-3n2d-story',
  'itinerary-4n3d', 'itinerary-4n2d-grid8', 'grid-6', 'grid-6-zigzag', 'grid-8',
  'grid-4', 'grid-4-mutant', 'grid-5', 'spotlight-guide',
  'grid-6-quaytung', 'grid-8-feed', 'grid-8-quaytung', 'spotlight-v2', 'spotlight-v3',
  'spotlight-v4', 'spotlight-v5', 'spotlight-v6', 'spotlight-v6-green', 'spotlight-v6-dark',
  'spotlight-v6-persimmon', 'spotlight-v6-maps', 'spotlight-v6-diary',
  'itinerary-4n3d-stack', 'itinerary-timeline', 'one-way-story',
];

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
  'dalat-test': {
    id: 'dalat-test', label: 'Đà Lạt Test', shortLabel: 'ĐLT',
    sheetUrl: `https://docs.google.com/spreadsheets/d/${DALAT_TEST_SHEET_ID}/edit`,
    exportUrl: `https://docs.google.com/spreadsheets/d/${DALAT_TEST_SHEET_ID}/export?format=xlsx`,
    workbookName: 'Đà Lạt Test.xlsx', workbookFileName: 'Đà Lạt Test.xlsx',
    sourceType: 'google-sheet', contentDestinationId: 'dalat',
  },
  'dalat-threads': {
    id: 'dalat-threads', label: 'Đà Lạt Threads', shortLabel: 'ĐLH',
    sheetUrl: `https://docs.google.com/spreadsheets/d/${DALAT_THREADS_SHEET_ID}/edit`,
    exportUrl: `https://docs.google.com/spreadsheets/d/${DALAT_THREADS_SHEET_ID}/export?format=xlsx`,
    workbookName: 'Đà Lạt Threads.xlsx', workbookFileName: 'Đà Lạt Threads.xlsx',
    sourceType: 'google-sheet', contentDestinationId: 'dalat',
  },
};

export function isDalatTestSource(id: DestinationId): boolean {
  return DESTINATIONS[id]?.sheetUrl.includes(`/d/${DALAT_TEST_SHEET_ID}/`) === true;
}

export function isDalatThreadsSource(id: DestinationId): boolean {
  return DESTINATIONS[id]?.sheetUrl.includes(`/d/${DALAT_THREADS_SHEET_ID}/`) === true;
}

export function isIsolatedSheetSource(id: DestinationId): boolean {
  return isDalatTestSource(id) || isDalatThreadsSource(id);
}

export function getAllowedDeckIds(id: DestinationId): string[] {
  if (!DESTINATIONS[id]) return [];
  return [...(isDalatThreadsSource(id) ? THREADS_NOTE_DECK_IDS : OTHER_DECK_IDS)];
}

export function isDeckAllowedForSource(id: DestinationId, deckId: string): boolean {
  return getAllowedDeckIds(id).includes(deckId);
}

export function sourceTemplateError(id: DestinationId, deckId: string): string {
  if (deckId === 'spotlight-partner') return 'Mẫu Spotlight Đối tác đã ngừng sử dụng. Hãy chọn mẫu khác; list đã lưu vẫn được giữ nguyên.';
  const name = THREADS_NOTE_DECK_LABELS[deckId] || deckId;
  return THREADS_NOTE_DECK_IDS.includes(deckId)
    ? `Mẫu ${name} chỉ được tạo trên nguồn Đà Lạt Threads. Hãy chọn Đà Lạt Threads và tải dữ liệu trước.`
    : `Mẫu ${name} không được tạo trên nguồn ${DESTINATIONS[id]?.label || id}. Nguồn Đà Lạt Threads chỉ dành cho Threads và Note; hãy chọn nguồn khác.`;
}

export function contentDestinationId(id: DestinationId): DestinationId {
  return DESTINATIONS[id]?.contentDestinationId || id;
}

export function isDalatContentSource(id: DestinationId): boolean {
  return contentDestinationId(id) === 'dalat';
}

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
    contentDestinationId: contentDestinationId(config.id),
    allowedDeckIds: getAllowedDeckIds(config.id),
  };
}
