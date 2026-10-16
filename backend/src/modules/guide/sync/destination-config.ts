import { localTemplateAllowedIds, findLocalTemplate, setLocalTemplateSourceAliases } from '../local-templates';
export type DestinationId = string;
export type DestinationSourceType = 'xlsx' | 'google-sheet';
/** standard: mẫu thường; threads: chỉ mẫu Threads/Note. Nguồn có kind có dữ liệu tách biệt (công bố theo lượt). */
export type SourceKind = 'standard' | 'threads';

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
  /** Không có ở nguồn cũ (Đà Lạt, Green Land, Sheet tự thêm trước đây): dùng chung dữ liệu gốc như trước. */
  kind?: SourceKind;
}

export interface DestinationInfo {
  id: DestinationId;
  label: string;
  shortLabel: string;
  sheetUrl: string;
  sourceType: DestinationSourceType;
  workbookFileName: string;
  contentDestinationId?: DestinationId;
  kind?: SourceKind;
  allowedDeckIds: string[];
}

export const DEFAULT_DESTINATION_ID: DestinationId = 'dalat';
export const CHERRY_BLOSSOM_DECK_ID = 'spotlight-v6-cherry-blossom';
export const THREADS_NOTE_DECK_LABELS: Record<string, string> = {
  'threads-food-local': 'Quán ăn Threads Local', 'threads-cafe-local': 'Cà phê Threads Local',
  'threads-mix-local': 'Tổng hợp Threads', 'threads-mix-text': 'Tổng hợp Threads chữ',
  'threads-toplist-dalat': 'Top list Đà Lạt',
  'itinerary-note-threads-3n2d': 'Note Threads 3N2Đ', 'itinerary-note-threads-2n1d': 'Note Threads 2N1Đ',
  'itinerary-note-threads-budget-3n2d': 'Chi phí Threads 3N2Đ',
  'itinerary-note-threads-expense-2n1d': 'Bảng chi tiêu Threads 2N1Đ', 'itinerary-note-threads-expense-3n2d': 'Bảng chi tiêu Threads 3N2Đ',
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

// Nguồn dựng sẵn chỉ mô tả cách dùng. Link Google Sheet KHÔNG nằm trong code/bản phát hành:
// mỗi máy giữ link riêng trong source-links.json (xem source-links.ts). Máy mới chưa có nguồn nào.
export const BUILTIN_SOURCES: Record<DestinationId, Omit<DestinationConfig, 'sheetUrl' | 'exportUrl'>> = {
  dalat: {
    id: 'dalat', label: 'Đà Lạt', shortLabel: 'ĐL',
    workbookName: 'F&B ĐÀ LẠT.xlsx', workbookFileName: 'F&B ĐÀ LẠT.xlsx',
    sourceType: 'xlsx', bundledWorkbookFile: 'dalat.xlsx',
  },
  greenland: {
    id: 'greenland', label: 'Green Land', shortLabel: 'GL',
    workbookName: 'Green Land - data.xlsx', workbookFileName: 'Green Land - data.xlsx',
    sourceType: 'xlsx', bundledWorkbookFile: 'greenland.xlsx', partnerFirst: true,
  },
  'dalat-test': {
    id: 'dalat-test', label: 'Đà Lạt Test', shortLabel: 'ĐLT',
    workbookName: 'Đà Lạt Test.xlsx', workbookFileName: 'Đà Lạt Test.xlsx',
    sourceType: 'google-sheet', contentDestinationId: 'dalat', kind: 'standard',
  },
  'dalat-threads': {
    id: 'dalat-threads', label: 'Đà Lạt Threads', shortLabel: 'ĐLH',
    workbookName: 'Đà Lạt Threads.xlsx', workbookFileName: 'Đà Lạt Threads.xlsx',
    sourceType: 'google-sheet', contentDestinationId: 'dalat', kind: 'threads',
  },
};
export const BUILTIN_SOURCE_IDS = Object.keys(BUILTIN_SOURCES);

export const DESTINATIONS: Record<DestinationId, DestinationConfig> = {};

// Nguồn của máy (source-links.json + nguồn tự thêm) được nạp ở lần tra cứu đầu tiên,
// để mọi nơi dùng cấu hình (kể cả công cụ/test không dựng GuideService) thấy cùng danh sách.
let registryLoaded = false;
export function markSourceRegistryLoaded(): void { registryLoaded = true; }
export function ensureSourceRegistry(): void {
  if (registryLoaded) return;
  registryLoaded = true;
  // Nạp lười tránh vòng phụ thuộc: source-links dùng các hằng của file này.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  (require('./source-links') as typeof import('./source-links')).loadMachineSources();
}
function registry(): Record<DestinationId, DestinationConfig> {
  ensureSourceRegistry();
  return DESTINATIONS;
}

export function registerBuiltinSource(id: DestinationId, links: { sheetUrl?: string; exportUrl?: string } = {}): void {
  const base = BUILTIN_SOURCES[id];
  if (!base) return;
  DESTINATIONS[id] = { ...base, sheetUrl: String(links.sheetUrl || ''), exportUrl: String(links.exportUrl || '') };
}

/** Nguồn Thường có nội dung Đà Lạt (như Đà Lạt Test): mở Hoa đào và mẫu riêng Đà Lạt. */
export function isDalatTestSource(id: DestinationId): boolean {
  return registry()[id]?.kind === 'standard' && isDalatContentSource(id);
}

/** Nguồn Threads (Đà Lạt hoặc nơi khác): chỉ mẫu Threads/Note. */
export function isDalatThreadsSource(id: DestinationId): boolean {
  return registry()[id]?.kind === 'threads';
}

export function isIsolatedSheetSource(id: DestinationId): boolean {
  return Boolean(registry()[id]?.kind);
}

/** Mẫu riêng khai báo cho Đà Lạt Test cũng dùng được trên mọi nguồn Thường có nội dung Đà Lạt. */
export function templateSourceKeys(id: DestinationId): string[] {
  return isDalatTestSource(id) && id !== 'dalat-test' ? [id, 'dalat-test'] : [id];
}
setLocalTemplateSourceAliases(templateSourceKeys);

export function getAllowedDeckIds(id: DestinationId): string[] {
  if (!registry()[id]) return [];
  const threads = THREADS_NOTE_DECK_IDS.filter(deckId => deckId !== 'threads-toplist-dalat' || isDalatContentSource(id));
  return [...(isDalatThreadsSource(id) ? threads : OTHER_DECK_IDS), ...(isDalatTestSource(id) ? [CHERRY_BLOSSOM_DECK_ID] : []), ...localTemplateAllowedIds(id)];
}

export function isDeckAllowedForSource(id: DestinationId, deckId: string): boolean {
  return getAllowedDeckIds(id).includes(deckId);
}

export function sourceTemplateError(id: DestinationId, deckId: string): string {
  if (deckId === CHERRY_BLOSSOM_DECK_ID) return 'Mẫu Spotlight Mùa hoa đào chỉ được tạo trên nguồn Thường có nội dung Đà Lạt (như Đà Lạt Test). Hãy chọn nguồn đó và đồng bộ dữ liệu.';
  const local = findLocalTemplate(deckId);
  if (local) return `Mẫu ${local.name} chỉ được tạo trên nguồn ${local.allowedSourceIds.map(id => registry()[id]?.label || id).join(', ')}${local.allowedSourceIds.includes('dalat-test') ? ' hoặc nguồn Thường có nội dung Đà Lạt' : ''} và máy đã cài gói mẫu riêng.`;
  if (deckId === 'spotlight-partner') return 'Mẫu Spotlight Đối tác đã ngừng sử dụng. Hãy chọn mẫu khác; list đã lưu vẫn được giữ nguyên.';
  const name = THREADS_NOTE_DECK_LABELS[deckId] || deckId;
  const threadsSources = Object.values(registry()).filter(config => config.kind === 'threads').map(config => config.label).join(', ');
  return THREADS_NOTE_DECK_IDS.includes(deckId)
    ? `Mẫu ${name} chỉ được tạo trên nguồn Threads${threadsSources ? ` (${threadsSources})` : ''}. Hãy chọn nguồn Threads và tải dữ liệu trước.`
    : `Mẫu ${name} không được tạo trên nguồn ${registry()[id]?.label || id}. Nguồn Threads chỉ dành cho Threads và Note; hãy chọn nguồn khác.`;
}

export function contentDestinationId(id: DestinationId): DestinationId {
  return registry()[id]?.contentDestinationId || id;
}

export function isDalatContentSource(id: DestinationId): boolean {
  return contentDestinationId(id) === 'dalat';
}

export function getDestinationList(): DestinationConfig[] {
  return Object.values(registry());
}

export function isDestinationId(value: string): value is DestinationId {
  return Boolean(value && registry()[value]);
}

export function getDestinationConfig(id: DestinationId): DestinationConfig {
  const config = registry()[id];
  if (!config) throw new Error(`Destination "${id}" is not configured.`);
  return config;
}

export function registerDestination(config: DestinationConfig): void {
  registry()[config.id] = config;
}

export function unregisterDestination(id: DestinationId): void {
  if (id === 'dalat' || id === 'greenland') return;
  delete registry()[id];
}

/** Nguồn mở mặc định trên máy; rỗng khi máy chưa thêm nguồn nào. */
export function firstDestinationId(): DestinationId {
  return registry()[DEFAULT_DESTINATION_ID] ? DEFAULT_DESTINATION_ID : Object.keys(registry())[0] || '';
}

export function isPartnerFirstDestination(id: DestinationId): boolean {
  return !!registry()[id]?.partnerFirst;
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
    ...(config.kind ? { kind: config.kind } : {}),
    allowedDeckIds: getAllowedDeckIds(config.id),
  };
}
