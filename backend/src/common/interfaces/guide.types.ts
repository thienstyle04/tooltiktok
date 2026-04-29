export type SectionKey =
  | 'quan_an'
  | 'cafe'
  | 'homestay'
  | 'check_in'
  | 'dich_vu'
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

export interface CoverPage {
  type: 'cover';
  title: string;
  subtitle: string;
  backgroundImage: string;
  layoutVariant?: 'standard' | 'photomode' | 'grid-6' | 'grid-8' | 'grid-4' | 'journey-4n3d';
}

export interface ListPage {
  type: 'list';
  chipText: string;
  chipTone: AccentTone;
  title: string;
  subtitle: string;
  items: PageItem[];
  backgroundImage: string;
  layoutVariant?: 'standard' | 'dense' | 'itinerary' | 'compact' | 'photomode' | 'grid-6' | 'grid-8' | 'grid-4' | 'journey-4n3d';
}

export type DeckPage = CoverPage | ListPage;

export interface GuideDeckList {
  id: string;
  navTitle: string;
  title: string;
  description: string;
  captionHashtags?: string[];
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
  target?: 'full' | 'headline' | 'body' | 'hashtags';
  current?: {
    headline?: string;
    body?: string;
    hashtags?: string[];
  };
}

export interface DeepSeekCaptionResponse {
  deckId: string;
  listId: string;
  target: 'full' | 'headline' | 'body' | 'hashtags';
  tone: 'gen_z' | 'tinh_te' | 'review_chan_that' | 'ban_hang_nhe' | 'lich_trinh_huu_ich';
  headline: string;
  body: string;
  hashtags: string[];
  raw: string;
}

export interface CaptionBlocks {
  headline: string;
  body: string;
  hashtags: string[];
}

export interface GenerateCaptionDeckRequest {
  deckId?: string;
  listId?: string;
  caption?: Partial<CaptionBlocks>;
}

export interface GenerateCaptionDeckResponse {
  deckId: string;
  listId: string;
  navTitle: string;
  title: string;
}

export interface DatasetBuildContext {
  imageUrls: string[];
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
  historyItems: GuideItem[];
  tourismItems: GuideItem[];
  breakfastItems: GuideItem[];
  lunchItems: GuideItem[];
  dinnerItems: GuideItem[];
  freeCheckinItems: GuideItem[];
  famousItems: GuideItem[];
}

export interface GeneratedListsStore {
  version: number;
  savedAt: string;
  decks: Record<string, GuideDeckList[]>;
}
