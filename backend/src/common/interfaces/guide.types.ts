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
  type: string;
  openHours: string;
  style: string;
  highlight: string;
  partnerFlag: string;
  isPartner: boolean;
  price: string;
  phone: string;
  imageUrl: string;
  imageMapped: boolean;
  imageMappingKey: string;
  imageSource: 'manual' | 'auto' | 'fallback';
  candidateImageUrls?: string[];
}

export interface PageItem {
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
  rawName?: string;
}

export type TitlePlacement =
  | 'top-left' | 'top-center' | 'top-right'
  | 'mid-left' | 'mid-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'
  | 'center';

export type MutantContentStyle = 'strip' | 'center-card';

export interface CoverPage {
  type: 'cover';
  title: string;
  subtitle: string;
  backgroundImage: string;
  /** Spotlight V2 cover: lưới 2×2 — chỉ ảnh nền (pool Hinh_nen). */
  coverImages?: string[];
  layoutVariant?: 'standard' | 'photomode' | 'grid-6' | 'grid-6-zigzag' | 'grid-8' | 'grid-8-feed' | 'grid-8-quaytung-cover' | 'grid-4' | 'grid-4-mutant' | 'grid-5' | 'journey-4n3d' | 'journey-4n2d-grid8' | 'spotlight' | 'spotlight-v2' | 'spotlight-partner' | 'spotlight-partner-v2' | 'pov-maikem' | 'pov-3-v2-cover' | 'budget-3n2d' | 'budget-3n2d-story' | 'budget-wallet-cover';
  titlePlacement?: TitlePlacement;
}

export interface ListPage {
  type: 'list';
  chipText: string;
  chipTone: AccentTone;
  title: string;
  subtitle: string;
  items: PageItem[];
  backgroundImage: string;
  layoutVariant?: 'standard' | 'dense' | 'itinerary' | 'compact' | 'photomode' | 'pov-maikem' | 'pov-3-v2-stack' | 'pov-3-v2-grid' | 'pov-3-v2-grid-food' | 'grid-6' | 'grid-6-zigzag' | 'grid-8' | 'grid-8-feed' | 'grid-8-quaytung' | 'grid-8-quaytung-menu' | 'grid-4' | 'grid-4-mutant' | 'grid-5' | 'journey-4n3d' | 'journey-4n2d-grid8' | 'spotlight' | 'spotlight-v2' | 'spotlight-list' | 'spotlight-v2-list' | 'spotlight-partner' | 'spotlight-partner-v2' | 'spotlight-partner-info' | 'spotlight-partner-v2-info' | 'budget-3n2d-table' | 'budget-3n2d-gallery' | 'budget-3n2d-day' | 'budget-3n2d-total' | 'budget-wallet-day' | 'budget-wallet-fixed' | 'budget-wallet-bill';
  titlePlacement?: TitlePlacement;
  contentStyle?: MutantContentStyle;
}

export type DeckPage = CoverPage | ListPage;

export interface GuideDeckList {
  id: string;
  navTitle: string;
  title: string;
  description: string;
  coverTitle?: string;
  postCaption?: string;
  captionHashtags?: string[];
  templateVersion?: number;
  pages: DeckPage[];
}

export interface GuideDeck {
  id: string;
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
  deckId?: string;
  listId?: string;
  tone?: DeepSeekCaptionResponse['tone'];
  caption?: Partial<CaptionBlocks>;
}

export interface GenerateCaptionDeckResponse {
  deckId: string;
  listId: string;
  navTitle: string;
  title: string;
}

export interface GenerateBatchListsRequest {
  deckId?: string;
  count?: number;
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
  lists: Array<{ listId: string; navTitle: string; tone: string }>;
  successCount: number;
  failCount: number;
}

export interface GeneratePartnerSpotlightRequest {
  partnerId?: string;
  partnerName?: string;
}

export interface GeneratePartnerSpotlightResponse {
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

export interface DatasetBuildContext {
  imageUrls: string[];
  coverImageUrls: string[];
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
  version: number;
  savedAt: string;
  decks: Record<string, GuideDeckList[]>;
}
