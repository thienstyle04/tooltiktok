export type DestinationId = string;

export interface DestinationSummary {
  id: DestinationId;
  label: string;
  shortLabel: string;
  sheetUrl: string;
  sourceType: 'xlsx' | 'google-sheet';
  workbookFileName: string;
  contentDestinationId?: DestinationId;
  kind?: 'standard' | 'threads';
  allowedDeckIds: string[];
  hasLocalWorkbook: boolean;
  hasSheetFallback: boolean;
  totalItems?: number;
  syncedAt?: string;
}

export interface DestinationListResponse {
  /** null khi máy chưa có nguồn dữ liệu nào. */
  active: DestinationSummary | null;
  destinations: DestinationSummary[];
}

export interface SetDestinationRequest {
  id: DestinationId;
}

export interface SetDestinationResponse {
  active: DestinationSummary;
  dataset: GuideDataset;
}

export interface AddDestinationRequest {
  label: string;
  sheetUrl: string;
  /** Thường hoặc Threads. Bỏ trống = nguồn kiểu cũ dùng chung dữ liệu gốc. */
  kind?: 'standard' | 'threads';
  /** Nội dung Đà Lạt: mở chữ/hook Đà Lạt và mẫu riêng Đà Lạt. */
  dalatContent?: boolean | string;
}

export interface AddXlsxDestinationRequest {
  label: string;
  sheetUrl?: string;
  kind?: 'standard' | 'threads';
  dalatContent?: boolean | string;
}

export interface AddDestinationResponse extends SetDestinationResponse {
  destinations: DestinationSummary[];
  /** Nguồn tách biệt vừa thêm: chưa có dữ liệu, giao diện chạy cập nhật đầu tiên rồi mới chuyển sang. */
  created?: DestinationSummary;
  needsFirstSync?: boolean;
}

export type HookMode = 'normal' | 'festival';
export type HookSourceType = 'google-doc' | 'docx' | 'txt';

export interface HookSourceSummary {
  id: string;
  name: string;
  type: HookSourceType;
  docUrl?: string;
  originalFileName?: string;
  hookCount: number;
  usedCount: number;
  remainingCount: number;
  updatedAt: string;
  lastLoadedAt: string;
  cacheStatus: 'ready' | 'error';
  lastError?: string;
  active: boolean;
}

export interface HookSourcesResponse {
  destinationId: DestinationId;
  available: boolean;
  mode: HookMode;
  activeSourceId: string;
  eligibleDeckIds: string[];
  sources: HookSourceSummary[];
}

export interface SetHookModeRequest {
  mode: HookMode;
  sourceId?: string;
}

export type SectionKey =
  | 'quan_an'
  | 'cafe'
  | 'homestay'
  | 'check_in'
  | 'dich_vu'
  | 'choi_dem'
  | 'hoat_dong'
  | 'dia_diem_lich_su'
  | 'khu_du_lich';

export interface HinhNenImageUrlPools {
  default: string[];
  green: string[];
  dark: string[];
  random: string[];
  persimmon?: string[];
  'cherry-blossom'?: string[];
  'cherry-blossom-random'?: string[];
}

export type AccentTone = 'terracotta' | 'gold' | 'pine' | 'berry' | 'slate';

export interface SectionConfigEntry {
  title: string;
  accent: AccentTone;
}

export interface GuideItem {
  id: string;
  sectionKey: SectionKey;
  sectionTitle: string;
  name: string;
  address: string;
  streetAddress?: string;
  type: string;
  openHours: string;
  style: string;
  highlight: string;
  /** Original Mo_ta line boundaries for the diary template only. */
  diaryDescriptionRaw?: string;
  /** Own Link_drive candidates only, excluding name-matched library fallbacks. */
  diaryImageUrls?: string[];
  themedImageUrls?: { 'cherry-blossom'?: string[] };
  /** Full direct-parent pool for cherry; never changes old templates' candidates. */
  cherryRegularImageUrls?: string[];
  /** Chủ đề nguyên bản từ cột Sheet `Chu_de` (ví dụ: Mảng xanh). */
  theme?: string;
  partnerFlag: string;
  isPartner: boolean;
  /** Original Sheet phan_loai, needed for Local-only Threads lists. */
  classification?: string;
  /** Giá đầu người — cột sheet `gia_dau_nguoi`, dùng cho bảng chi phí 72H. */
  headPrice: string;
  /** Cột Món ăn nổi bật (quán ăn/cà phê), dùng cho ghi chú ngắn của bảng chi tiêu Threads. */
  signatureDish?: string;
  /** Sheet có cột giá đầu người (kể cả khi ô trống). */
  hasHeadPriceColumn: boolean;
  price: string;
  phone: string;
  imageUrl: string;
  imageMapped: boolean;
  imageMappingKey: string;
  imageSource: 'manual' | 'auto' | 'fallback';
  candidateImageUrls?: string[];
  /** Ảnh Google Maps đã thiết kế sẵn, tách biệt hoàn toàn với ảnh thật Link_drive. */
  mapImageUrl?: string;
  mapCandidateImageUrls?: string[];
  mapSourceLink?: string;
}

export interface PageItem {
  rotationGroup?: string;
  label: string;
  id?: string;
  sourceKey?: string;
  sourceSectionKey?: SectionKey;
  name: string;
  metaPrimary: string;
  metaSecondary: string;
  imageUrl: string;
  imageMapped: boolean;
  imageNote: string;
  imageSource: 'manual' | 'auto' | 'fallback';
  candidateImageUrls?: string[];
  isPartner?: boolean;
  isLocal?: boolean;
  rawName?: string;
  scheduleTime?: string;
  scheduleIcon?: string;
  fixedRow?: boolean;
}

export type TitlePlacement =
  | 'top-left' | 'top-center' | 'top-right'
  | 'mid-left' | 'mid-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'
  | 'center';

export type MutantContentStyle = 'strip' | 'center-card';

export interface CoverPage {
  imageRole?: 'cherry-blossom' | 'cherry-blossom-random' | 'venue-cherry-blossom' | 'venue-regular';
  localRender?: LocalRenderModel;
  coverApproval?: string;
  spotlightDesignRevision?: 1;
  photoPreset?: 'iphone-color-edit-v1';
  textFontSize?: number | null;
  textScale?: number;
  diaryFontSize?: number;
  type: 'cover';
  title: string;
  subtitle: string;
  backgroundImage: string;
  /** Spotlight V2 cover: lưới 2×2 — chỉ ảnh nền (pool Hinh_nen). */
  coverImages?: string[];
  layoutVariant?: 'threads-toplist-cover' | 'standard' | 'photomode' | 'grid-6' | 'grid-6-zigzag' | 'grid-6-quaytung-cover' | 'grid-8' | 'grid-8-feed' | 'grid-8-quaytung-cover' | 'grid-4' | 'grid-4-mutant' | 'grid-5' | 'journey-4n3d' | 'itinerary-4n3d-stack-cover' | 'itinerary-timeline-cover' | 'journey-4n2d-grid8' | 'spotlight' | 'spotlight-v2' | 'spotlight-v3' | 'spotlight-v4-cover' | 'spotlight-v5-cover' | 'spotlight-v6-cover' | 'carousel-mau-1-cover' | 'one-way-story-cover' | 'spotlight-partner' | 'spotlight-partner-v2' | 'pov-maikem' | 'pov-3-v2-cover' | 'budget-3n2d' | 'budget-3n2d-story' | 'budget-wallet-cover';
  titlePlacement?: TitlePlacement;
  canvasPreset?: 'default' | 'tiktok-3x4' | 'tiktok-4x5' | 'tiktok-9x16' | 'landscape-4x3';
}

export interface ListPage {
  imageRole?: CoverPage['imageRole'];
  localRender?: LocalRenderModel;
  threadsPartnerPolicy?: 'balanced-local-v1';
  spotlightDesignRevision?: 1;
  photoPreset?: 'iphone-color-edit-v1';
  textFontSize?: number | null;
  textScale?: number;
  diaryFontSize?: number;
  type: 'list';
  chipText: string;
  chipTone: AccentTone;
  title: string;
  subtitle: string;
  items: PageItem[];
  backgroundImage: string;
  layoutVariant?: 'threads-toplist-page' | 'itinerary-note-threads-budget' | 'threads-expense-sheet' | 'itinerary-note-threads-day' | 'spotlight-v6-diary-page' | 'standard' | 'dense' | 'itinerary' | 'compact' | 'photomode' | 'pov-maikem' | 'pov-3-v2-stack' | 'pov-3-v2-grid' | 'pov-3-v2-grid-food' | 'grid-6' | 'grid-6-zigzag' | 'grid-6-quaytung' | 'grid-8' | 'grid-8-feed' | 'grid-8-quaytung' | 'grid-8-quaytung-menu' | 'grid-4' | 'grid-4-mutant' | 'grid-5' | 'journey-4n3d' | 'itinerary-4n3d-stack-page' | 'itinerary-timeline-day' | 'journey-4n2d-grid8' | 'spotlight' | 'spotlight-v2' | 'spotlight-v3' | 'spotlight-v4-image' | 'spotlight-v4-page' | 'spotlight-v5-playlist' | 'spotlight-v5-place' | 'spotlight-v6-image' | 'spotlight-v6-page' | 'spotlight-v6-map-page' | 'spotlight-v6-map-place' | 'summary-note-page' | 'itinerary-note-day' | 'itinerary-note-dark-day' | 'itinerary-note-timed-day' | 'carousel-mau-1-page' | 'one-way-story-road' | 'one-way-story-slope' | 'one-way-story-photo' | 'spotlight-list' | 'spotlight-v2-list' | 'spotlight-partner' | 'spotlight-partner-v2' | 'spotlight-partner-info' | 'spotlight-partner-v2-info' | 'budget-3n2d-table' | 'budget-3n2d-gallery' | 'budget-3n2d-day' | 'budget-3n2d-total' | 'budget-wallet-day' | 'budget-wallet-fixed' | 'budget-wallet-bill';
  titlePlacement?: TitlePlacement;
  contentStyle?: MutantContentStyle;
  playlistLines?: string[];
  canvasPreset?: 'default' | 'tiktok-3x4' | 'tiktok-4x5' | 'tiktok-9x16' | 'landscape-4x3';
  noteStatusTime?: string;
}

export type DeckPage = CoverPage | ListPage;

export interface GuideDeckList {
  localTemplate?: { id: string; version: number; recipeId: string; contentSnapshot: unknown; replacementTopics: string[] };
  partnerRotationVersion?: 1;
  warnings?: string[];
  spotlightDesignRevision?: 1;
  coverReview?: { topic: string | null; warnings: string[]; approvedSourceIds: string[] };
  photoPreset?: 'iphone-color-edit-v1';
  id: string;
  navTitle: string;
  title: string;
  description: string;
  coverTitle?: string;
  postCaption?: string;
  /** Phần mô tả của caption đăng bài; tách khỏi description của list/trang. */
  captionBody?: string;
  captionHashtags?: string[];
  templateVersion?: number;
  automationRunId?: string;
  automationPosition?: string;
  canvasPreset?: 'default' | 'tiktok-3x4' | 'tiktok-4x5' | 'tiktok-9x16' | 'landscape-4x3';
  hookSnapshot?: {
    mode: 'festival' | 'green' | 'dark' | 'persimmon' | 'cherry-blossom';
    sourceId: string;
    sourceRevision: string;
  };
  pages: DeckPage[];
}

export interface GuideDeck {
  localTemplate?: { version: number; automaticContent: boolean; pageCount?: number; previewImageUrl?: string; status: Record<string, unknown> };
  id: string;
  /** Saved lists remain accessible, but this template cannot create new lists. */
  creationDisabled?: boolean;
  navTitle: string;
  title: string;
  description: string;
  lists: GuideDeckList[];
}

export interface ReferenceSet {
  title: string;
  count: number;
  coverUrl: string;
}

export interface GuideDataset {
  generatedAt: string;
  canvas: {
    width: number;
    height: number;
    previewWidth: number;
    previewHeight: number;
  };
  source: {
    workbook: string;
    destinationId: DestinationId;
    destinationLabel: string;
    contentDestinationId?: DestinationId;
    allowedDeckIds: string[];
    imageCount: number;
    coverImageCount: number;
    coverImageUrls: string[];
    manualMappedItemCount: number;
    mappedItemCount: number;
    autoMappedItemCount: number;
    fallbackItemCount: number;
    referenceSetCount: number;
    totalItems: number;
  };
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    note: string;
    stats: Array<{ label: string; value: number }>;
    images: string[];
  };
  referenceSets: ReferenceSet[];
  decks: GuideDeck[];
}

export type WorkbookItemsBySection = Record<SectionKey, GuideItem[]>;

export interface ImageMappingEntry {
  sectionKey?: string;
  name?: string;
  address?: string;
  imagePath?: string;
}

export interface ImageMappingFile {
  version: number;
  libraryRoot?: string;
  extraLibraryRoots?: string[];
  instructions: string[];
  mappings: ImageMappingEntry[];
}

export interface ImageLibraryFolderEntry {
  rootKey: string;
  rootPath: string;
  topDir: string;
  subDir: string;
  relativeDir: string;
  normalizedSubDir: string;
  assetUrls: string[];
}

export interface ImageLibraryRootEntry {
  key: string;
  path: string;
}

export interface DeepSeekCaptionRequest {
  deckId?: string;
  listId?: string;
  tone?: 'gen_z' | 'tinh_te' | 'review_chan_that' | 'ban_hang_nhe' | 'lich_trinh_huu_ich';
  target?: 'full' | 'headline' | 'body' | 'hashtags' | 'cover_title';
  current?: {
    coverTitle?: string;
    headline?: string;
    body?: string;
    hashtags?: string[];
  };
}

export interface DeepSeekCaptionResponse {
  deckId: string;
  listId: string;
  target: 'full' | 'headline' | 'body' | 'hashtags' | 'cover_title';
  tone: 'gen_z' | 'tinh_te' | 'review_chan_that' | 'ban_hang_nhe' | 'lich_trinh_huu_ich';
  coverTitle: string;
  headline: string;
  body: string;
  hashtags: string[];
  raw: string;
}

export interface CaptionBlocks {
  coverTitle: string;
  headline: string;
  body: string;
  hashtags: string[];
}

export interface GenerateCaptionDeckRequest {
  photoPreset?: 'iphone-color-edit-v1' | null;
  deckId?: string;
  listId?: string;
  tone?: DeepSeekCaptionResponse['tone'];
  caption?: Partial<CaptionBlocks>;
  hookSelection?: { mode: 'normal' | 'festival'; sourceId?: string };
  automationRunId?: string;
  automationPosition?: string;
  /** Tên đối tác phải có mặt trong mọi list tạo ra (không áp dụng mẫu riêng local-*). */
  requiredPartners?: string[];
}

export interface GenerateCaptionDeckResponse {
  warnings?: string[];
  deckId: string;
  listId: string;
  navTitle: string;
  title: string;
}

export interface GenerateBatchListsRequest {
  photoPreset?: 'iphone-color-edit-v1' | null;
  deckId?: string;
  count?: number;
  requestId?: string;
  hookSelection?: { mode: 'normal' | 'festival'; sourceId?: string };
  automationRunId?: string;
  /** Tên đối tác phải có mặt trong mọi list của batch (không áp dụng mẫu riêng local-*). */
  requiredPartners?: string[];
}

export interface DeleteGeneratedListsRequest {
  groups?: Array<{ deckId?: string; listIds?: string[] }>;
}

export interface DeleteGeneratedListsResponse {
  requestedCount: number;
  deletedCount: number;
  remainingIds: string[];
}

export interface GenerateBatchListsProgress {
  index: number;
  total: number;
  listId: string;
  navTitle: string;
  tone: string;
}

export interface GenerateBatchListsResponse {
  deckId: string;
  lists: Array<{ listId: string; navTitle: string; tone: string; warnings?: string[] }>;
  successCount: number;
  failCount: number;
  errors?: Array<{ index: number; tone: string; message: string }>;
}

export interface GeneratePartnerSpotlightRequest {
  photoPreset?: 'iphone-color-edit-v1' | null;
  partnerId?: string;
  partnerName?: string;
}

export interface GeneratePartnerSpotlightResponse {
  warnings?: string[];
  deckId: string;
  listId: string;
  navTitle: string;
  title: string;
  partnerName: string;
  pageCount: number;
}

export interface UpdateGeneratedListCoverRequest {
  coverTitle?: string;
  coverSubtitle?: string;
}

export interface UpdateGeneratedListCoverResponse {
  deckId: string;
  listId: string;
  coverTitle: string;
  coverSubtitle: string;
}

export interface UpdatePageTextRequest {
  coverImages?: string[];
  coverApproval?: string;
  textFontSize?: number | null;
  textScale?: number;
  diaryFontSize?: number;
  titlePlacement?: TitlePlacement;
  items?: Array<{ name: string; metaPrimary: string; metaSecondary?: string; scheduleTime?: string }>;
  chipText?: string;
  title?: string;
  subtitle?: string;
}

export interface UpdatePageTextResponse {
  coverImages?: string[];
  coverApproval?: string;
  textFontSize?: number | null;
  textScale?: number;
  diaryFontSize?: number;
  titlePlacement?: TitlePlacement;
  items?: Array<{ name: string; metaPrimary: string; metaSecondary?: string; scheduleTime?: string }>;
  chipText?: string;
  deckId: string;
  listId: string;
  pageIndex: number;
  title: string;
  subtitle: string;
}

export interface PageTextOverrideStore {
  version: 1;
  savedAt: string;
  decks: Record<string, Record<string, Record<string, { title: string; subtitle: string; coverImages?: string[]; coverApproval?: string; textFontSize?: number | null; textScale?: number; diaryFontSize?: number; titlePlacement?: TitlePlacement; chipText?: string; items?: Array<{ name: string; metaPrimary: string; metaSecondary?: string; scheduleTime?: string }> }>>>;
}

export interface DatasetBuildContext {
  imageUrls: string[];
  coverImageUrls: string[];
  hinhNenImagePools: HinhNenImageUrlPools;
  imageLibraryEntries: ImageLibraryFolderEntry[];
  itemsBySection: WorkbookItemsBySection;
  referenceSets: ReferenceSet[];
  totalItems: number;
  mappedItemCount: number;
  manualMappedItemCount: number;
  autoMappedItemCount: number;
  decks: GuideDeck[];
}

export interface DeckBuildPools {
  foodItems: GuideItem[];
  cafeItems: GuideItem[];
  stayItems: GuideItem[];
  checkinItems: GuideItem[];
  serviceItems: GuideItem[];
  nightlifeItems: GuideItem[];
  nightlifeImageItems: GuideItem[];
  activityItems: GuideItem[];
  historyItems: GuideItem[];
  tourismItems: GuideItem[];
  breakfastItems: GuideItem[];
  lunchItems: GuideItem[];
  dinnerItems: GuideItem[];
  daytimeFoodItems: GuideItem[];
  morningFoodItems: GuideItem[];
  lightMealItems: GuideItem[];
  grillHotpotItems: GuideItem[];
  dayCafeItems: GuideItem[];
  dayCheckinItems: GuideItem[];
  dayTourismItems: GuideItem[];
  dayFamousItems: GuideItem[];
  morningScheduleItems: GuideItem[];
  lunchScheduleItems: GuideItem[];
  eveningScheduleItems: GuideItem[];
  freeCheckinItems: GuideItem[];
  paidCheckinItems: GuideItem[];
  famousItems: GuideItem[];
}

export interface GeneratedListsStore {
  localTemplateState?: Record<string, Record<string, unknown>>;
  partnerRotation?: Record<string, PartnerRotationHistory>;
  diaryUsedLines?: Record<string, string[]>;
  version: number;
  savedAt: string;
  decks: Record<string, GuideDeckList[]>;
}

export type PartnerRotationHistory = Record<string, {
  position: number;
  lastPhotos: string[];
  usedPhotos: string[];
  cycle: number;
  photoPools?: Record<string, { usedPhotos: string[]; cycle: number }>;
}>;

// A data-only drawing model. Remote copy is plain text, never executable HTML.
export interface LocalRenderModel {
  templateId: string; version: number; width: number; height: number;
  fonts: Array<{ family: string; weight: number; url: string }>;
  nodes: Array<{
    kind: 'text' | 'image' | 'shape';
    x: number; y: number; width: number; height: number;
    text?: string; field?: string; src?: string; label?: string;
    itemIndices?: number[]; fields?: string[]; separator?: string;
    /** Optional plain-text field colors; no executable markup from local data. */
    fieldColors?: Record<string, string>;
    style?: Record<string, string | number>;
    required?: boolean;
  }>;
}
