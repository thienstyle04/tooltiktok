// ─── GuideService: orchestration, caching, AI captions ───────────────────────
import 'dotenv/config';
import { applyListPhotoPreset, validatePhotoPreset } from './photo-presets';
import { migrateColorEditStores, LEGACY_COLOR_DECKS } from './color-edit-migration';
import { prepareSpotlightDesign, SPOTLIGHT_DESIGN_DECKS } from './logic/spotlight-design';
import { aiProvider, AiError } from './ai-provider';
import { verifyDriveFileCache } from './sync/drive-images';
import { inheritPageTypography } from './logic/inherit-page-typography';
import { BadRequestException, Injectable, NotFoundException, OnApplicationBootstrap, ServiceUnavailableException } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';
import { enableNightSyncPolicy, hasSyncPermit, withLocalDataOnly } from './sync/night-sync-policy';
import { NightSyncCoordinator } from './sync/night-sync-coordinator';
import { syncNightSource } from './sync/night-sync-source';
import { publishSourceSnapshot } from './sync/published-source';

import { CaptionBlocks, AddDestinationRequest, AddDestinationResponse, AddXlsxDestinationRequest, CoverPage, DatasetBuildContext, DeckPage, DeepSeekCaptionRequest, DeepSeekCaptionResponse, DeleteGeneratedListsResponse, MarkListsExportedResponse, GenerateBatchListsRequest, GenerateBatchListsResponse, GenerateCaptionDeckRequest, GenerateCaptionDeckResponse, GeneratePartnerSpotlightRequest, GeneratePartnerSpotlightResponse, PartnerRotationHistory, GuideDeck, GuideDeckList, GuideDataset, GuideItem, HinhNenImageUrlPools, ImageLibraryFolderEntry, ImageMappingFile, ListPage, PageItem, ReferenceSet, SectionKey, UpdateGeneratedListCoverRequest, UpdateGeneratedListCoverResponse, UpdatePageTextRequest, UpdatePageTextResponse, PageTextOverrideStore, WorkbookItemsBySection, DestinationId, DestinationListResponse, DestinationSummary, HookSourcesResponse, SetHookModeRequest, SetDestinationRequest, SetDestinationResponse } from '../../common/interfaces/guide.types';


import { buildImageLibraryEntries, getImageLibraryRoot, imageUrlsForDirectory, normalizeText, stableHash } from './logic/image-resolver';

import { DataAllocator, itemNameUsageKey, itemUsageKey } from './logic/data-allocator';
import { clearRequiredPartnerContext, missingRequiredPartners, normalizeRequiredPartners, partnerItemsByName, PartnerEligibilityResponse, requiredPartnerKey, RequiredPartnersError, setRequiredPartnerContext, withRequiredPartners } from './logic/required-partners';
import { bootstrapPartnerHistory, restrictRotationPhotos, rotatePartnerList, rotationPhotoShortage, requiredPartnerCount, partnerSlotCount, sourcePhotoId } from './logic/partner-rotation';
import { applyCaptionToPages, buildDecks, buildDeckList, buildPagesForDeck, buildSpotlightPartnerPages, createDeckBuildPools, isGrillOrHotpotItem, sanitizeCaptionBodyForPages, sanitizeDeckHeadline, SPOTLIGHT_PARTNER_TEMPLATE_VERSION, truncatePov3V2StackTagline } from './logic/deck-builder';
import { spotlightV4VenueAvailability, summaryNoteDefaultCaption, setSpotlightV3BuildContext, clearSpotlightV3BuildContext } from './logic/deck-builder-v2';
import { getSpotlightV3BuildContext, loadSpotlightV3Hooks, pickSpotlightV3Hook } from './sync/spotlight-hook-source';
import { getDeckIdsForPremadeHookPool, getPremadeHookPoolKey, loadPremadeHookPool, PremadeHookPoolKey } from './sync/premade-hook-source';
import { DriveFileAsset, clearDriveAccessibilityCache, clearKnownFailedDriveFileIds, configureDriveFileDiskCache, extractDriveFileIdFromProxyUrl, hasDriveFileDiskCache, listUncachedDriveFileIds, setCachedDriveFileAccessibility, uniqueCachedDriveFileIdsByVisualContent, warmDriveFileDiskCache } from './sync/drive-images';
import { buildSheetDriveManifest, readSheetDriveManifest, SheetDriveImageManifest, writeSheetDriveManifest } from './sync/sheet-drive-manifest';
import {
  DEFAULT_DESTINATION_ID,
  DestinationConfig,
  getDestinationList,
  getDestinationConfig,
  isDestinationId,
  registerDestination,
  unregisterDestination,
  toDestinationInfo,
  BUILTIN_SOURCES,
  firstDestinationId,
  SourceKind,
  contentDestinationId,
  isDalatContentSource,
  isIsolatedSheetSource,
  isDalatThreadsSource,
  isDeckAllowedForSource,
  getAllowedDeckIds,
  sourceTemplateError,
  THREADS_NOTE_DECK_IDS,
} from './sync/destination-config';
import { migrateThreadsSourceStores } from './threads-source-migration';

import { FestivalHookSourceStore, HookReservation, HookSourceUpload } from './sync/festival-hook-source';
import { GreenHookReservation, GreenHookSourceStore } from './sync/green-hook-source';
import { DarkHookReservation, DarkHookSourceStore } from './sync/dark-hook-source';
import { PersimmonHookReservation, PersimmonHookSourceStore } from './sync/persimmon-hook-source';
import { CherryBlossomHookSourceStore } from './sync/cherry-blossom-hook-source';
import { CHERRY_ID, CHERRY_NAME, cherryDeck, cherryHistory, buildCherryBlossom, assertCherryList } from './logic/spotlight-cherry-blossom';
import { localizeDecks, setActiveDestinationLocalize, buildCaptionHashtags } from './sync/destination-localize';
import { fetchWorkbookFromSheet, SheetWorkbookSource } from './sync/workbook-source';
import { resolveBackendDataDir, resolveBackendRoot, resolveWorkspaceRoot } from '../../config';
import { RuntimePerformanceService } from './runtime-performance.service';
import * as fileIo from './guide-file-io';
import { GuideAssetService } from './guide-asset.service';
import * as pageText from './page-text-overrides';
import * as captionText from './caption-text';
import { GenerationGate } from './generation-gate';
import * as listDisplay from './list-display';
import * as workbookStore from './workbook-store';
import * as workbookItems from './workbook-items';
import * as listStore from './generated-list-store';
import { findLocalTemplate, listLocalTemplates, templateAllowsSource, localTemplateAssetUrl, localTemplateBuilder, localTemplateDecks, validateLocalTemplateResources } from './local-templates';
import { syncFetch, withSyncPermit } from './sync/night-sync-policy';
import * as crypto from 'node:crypto';
import type { LocalWorkbookUpload } from './workbook-store';
export type { LocalWorkbookUpload } from './workbook-store';

const HOOK_SECTION_BY_DECK: Record<string, { key: string; headingIncludes: string[] }> = {
  'itinerary-3n2d': { key: 'hook-1', headingIncludes: ['Hook 1', '3N2Đ'] },
  'itinerary-timeline': { key: 'hook-1', headingIncludes: ['Hook 1', '3N2Đ'] },
  'itinerary-4n3d': { key: 'hook-2', headingIncludes: ['Hook 2', '4N3Đ'] },
  'itinerary-4n2d-grid8': { key: 'hook-2', headingIncludes: ['Hook 2', '4N3Đ'] },
  'itinerary-4n3d-stack': { key: 'hook-2', headingIncludes: ['Hook 2', '4N3Đ'] },
  'budget-3n2d': { key: 'hook-3', headingIncludes: ['Hook 3', '3 triệu'] },
  'budget-72h-summary': { key: 'hook-3', headingIncludes: ['Hook 3', '3 triệu'] },
  'budget-3n2d-story': { key: 'hook-3', headingIncludes: ['Hook 3', '3 triệu'] },
  ...Object.fromEntries([
    'grid-6', 'grid-8', 'grid-4', 'grid-5', 'grid-6-zigzag', 'grid-6-quaytung',
    'grid-8-feed',
  ].map((deckId) => [deckId, { key: 'hook-4', headingIncludes: ['Hook 4', 'Feed 8'] }])),
};
const isLegacyGoogleDocHookDeck = (deckId: string): boolean =>
  deckId === 'spotlight-v3' || deckId === 'spotlight-v4' || (deckId === 'spotlight-v6' || deckId === 'spotlight-v6-color-edit') || deckId === 'carousel-mau-1' || deckId === 'spotlight-guide';
const isSectionedGoogleDocHookDeck = (deckId: string): boolean => Boolean(HOOK_SECTION_BY_DECK[deckId]);
const isGoogleDocHookDeck = (deckId: string): boolean =>
  deckId === 'spotlight-v6-diary' || isLegacyGoogleDocHookDeck(deckId) || isSectionedGoogleDocHookDeck(deckId);
const isPremadeHookDeck = (deckId: string): boolean => getPremadeHookPoolKey(deckId) !== null;
import { ITINERARY_NOTE_CAPTION, ITINERARY_NOTE_DARK_ID, ITINERARY_NOTE_DARK_CAPTION } from './logic/itinerary-note';
import { DIARY_PAGE_COUNT, DIARY_CAPTION, diaryIdentity, diaryItemLines } from './logic/spotlight-diary';
import { ITINERARY_NOTE_TIMED_CAPTION } from './logic/itinerary-note-timed';
import { threadsNoteCaption } from './logic/itinerary-note-threads';
import { THREADS_BUDGET_ID, threadsBudgetCaption } from './logic/itinerary-note-threads-budget';
import { isThreadsExpense, threadsExpenseCaption } from './logic/threads-expense-sheet';
import { THREADS_TOPLIST_ID, THREADS_TOPLIST_CAPTION } from './logic/threads-toplist';
import { isThreadsLocalDeck, THREADS_CAFE_ID, THREADS_MIX_ID, THREADS_MIX_TEXT_ID, threadsCafeCaption, threadsFoodCaption, threadsMixCaption, threadsMixTextCaption } from './logic/threads-food-local';
import { CaptionTone, isSpotlightV5Deck, isTextNoteDeck } from './deck-kinds';
import { isUpdateLocked } from '../../runtime-update-lock';
import { applySourceLinks, hookDocId, updateBuiltinSourceLinks } from './sync/source-links';
import { driveThumbnail } from './drive-thumbnails';
const isNonAiDeck = (deckId: string): boolean => deckId === CHERRY_ID || Boolean(findLocalTemplate(deckId)) || isThreadsLocalDeck(deckId) || deckId === 'spotlight-v6-diary' || deckId === 'carousel-mau-1' || deckId === 'one-way-story' || isSpotlightV5Deck(deckId) || deckId === 'spotlight-v6-green' || deckId === 'spotlight-v6-dark' || deckId === 'spotlight-v6-persimmon' || deckId === 'spotlight-v6-maps' || isTextNoteDeck(deckId);

const SPOTLIGHT_PARTNER_POST_CAPTION = 'Bỏ túi ngay, kẻo đi Đà Lạt lại loay hoay 😉';
const SPOTLIGHT_PARTNER_CAPTION_BODY = 'Nếu chỉ có 3 ngày ở Đà Lạt, cứ lưu list này trước. Các điểm được chia theo khung giờ để đi đỡ vòng và đỡ phát sinh.';

// Phần dữ liệu "nặng" (đọc Google Sheet, dò ảnh, build 22 mẫu deck) — chỉ cần build lại khi
// Sheet/ảnh thật sự đổi. Tách riêng khỏi list AI để CRUD list không bao giờ phải chờ rebuild.
interface WorkbookDerivedContext {
  imageUrls: string[];
  coverImageUrls: string[];
  hinhNenImagePools: HinhNenImageUrlPools;
  imageLibraryEntries: ImageLibraryFolderEntry[];
  itemsBySection: WorkbookItemsBySection;
  baseDecks: GuideDeck[];
  totalItems: number;
  mappedItemCount: number;
  manualMappedItemCount: number;
  autoMappedItemCount: number;
}

export interface DriveCacheWarmStatus {
  localInventory?: { total: number; cached: number; missing: number; checkedAt: string };
  phase: 'checking' | 'warming' | 'ready' | 'error';
  ready: boolean;
  destinationId: string;
  total: number;
  completed: number;
  cached: number;
  downloaded: number;
  failed: number;
  percent: number;
  message: string;
  /** Lượt cập nhật gần nhất lỗi/bị ngắt nhưng vẫn dùng được dữ liệu đã công bố trước đó. */
  syncWarning?: string;
  /**
   * Data is usable (text templates work) but most photos are not on this machine
   * yet, e.g. a new PC without the image cache: photo templates will fail until a
   * manual update downloads them. The message explains this instead of "ready".
   */
  imagesMissing?: boolean;
}

export interface TemplateCapacityResult {
  deckId: string;
  navTitle?: string;
  requested: number;
  /** Số list liên tiếp dựng được trong lần chạy thử. */
  possible: number;
  /** false: mẫu có luồng tạo riêng nên không ước lượng. */
  checked: boolean;
  reason?: string;
}

@Injectable()
export class GuideService implements OnApplicationBootstrap {
  // toolRoot points to the backend folder root
  readonly toolRoot = resolveBackendRoot(__dirname);
  readonly dataRoot = resolveBackendDataDir(this.toolRoot);
  readonly frontendRoot = path.resolve(this.toolRoot, '../frontend');
  readonly workspaceRoot = resolveWorkspaceRoot(this.toolRoot);
  private readonly dalatImageDir = process.env.DALAT_IMAGE_DIR
    ? path.resolve(this.workspaceRoot, process.env.DALAT_IMAGE_DIR)
    : (fs.existsSync('C:\\Data\\tn\\Hình cảnh ĐL-20260417T122322Z-3-001\\Hình cảnh ĐL')
      ? 'C:\\Data\\tn\\Hình cảnh ĐL-20260417T122322Z-3-001\\Hình cảnh ĐL'
      : path.resolve(this.workspaceRoot, 'data/images/dalat'));
  private readonly tiktokReferenceDir = process.env.TIKTOK_REFERENCE_DIR
    ? path.resolve(this.workspaceRoot, process.env.TIKTOK_REFERENCE_DIR)
    : (fs.existsSync('C:\\Data\\data\\ẢNH TIKTOK')
      ? 'C:\\Data\\data\\ẢNH TIKTOK'
      : path.resolve(this.workspaceRoot, 'data/images/tiktok'));
  private readonly imageMappingPath = path.join(this.dataRoot, 'image-mapping.json');
  private readonly activeDestinationPath = path.join(this.dataRoot, 'active-destination.json');
  private readonly customDestinationsPath = path.join(this.dataRoot, 'custom-destinations.json');
  private activeDestinationId: DestinationId = DEFAULT_DESTINATION_ID;
  private readonly generatedListsByDeckId = new Map<string, GuideDeckList[]>();
  // Written atomically with diary snapshots; deleting a list does not reset its cycle.
  private diaryUsedLines: Record<string, string[]> = {};
  private readonly sourceHookStores = new Map<string, {
    festival: FestivalHookSourceStore; green: GreenHookSourceStore;
    dark: DarkHookSourceStore; persimmon: PersimmonHookSourceStore; cherry: CherryBlossomHookSourceStore;
  }>();
  private hooksForSource(id: DestinationId) {
    const key = isIsolatedSheetSource(id) ? id : 'dalat';
    let stores = this.sourceHookStores.get(key);
    if (!stores) {
      const root = key === 'dalat' ? this.dataRoot : path.join(this.dataRoot, 'source-hooks', key);
      stores = { festival: new FestivalHookSourceStore(root), green: new GreenHookSourceStore(root),
        dark: new DarkHookSourceStore(root), persimmon: new PersimmonHookSourceStore(root), cherry: new CherryBlossomHookSourceStore(root) };
      this.sourceHookStores.set(key, stores);
    }
    return stores;
  }
  private get festivalHookSources() { return this.hooksForSource(this.activeDestinationId).festival; }
  private get greenHookSource() { return this.hooksForSource(this.activeDestinationId).green; }
  private get darkHookSource() { return this.hooksForSource(this.activeDestinationId).dark; }
  private get persimmonHookSource() { return this.hooksForSource(this.activeDestinationId).persimmon; }
  private readonly batchGenerationRequests = new Map<string, Promise<GenerateBatchListsResponse>>();
  private generatedListsLoaded = false;
  private partnerRotation: Record<string, PartnerRotationHistory> = {};
  /** Kết quả chạy thử đối tác theo mẫu; khóa gồm nguồn, mẫu và chữ ký dữ liệu. */
  private partnerEligibilityCache = new Map<string, Promise<PartnerEligibilityResponse>>();
  private localTemplateState: Record<string, Record<string, unknown>> = {};
  private usedAllocator = new DataAllocator();
  private inventoryLoaded = false;

  // ─── In-memory caches ──────────────────────────────────────────────────────
  private workbookDerivedCache: WorkbookDerivedContext | null = null;
  private workbookDerivedCacheBuilding = false;
  private workbookDerivedCacheTime = 0;
  private workbookDerivedCacheFresh = false;
  private readonly DATASET_CACHE_TTL_MS = 20 * 60 * 1000; // chỉ dùng khi tắt session-sticky
  private datasetRebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly DATASET_REBUILD_DEBOUNCE_MS = 800; // gộp nhiều lần invalidate liên tiếp thành 1 lần build nền.

  private imageLibraryEntriesCache: ImageLibraryFolderEntry[] | null = null;
  private imageLibraryEntriesCacheTime = 0;
  private readonly IMAGE_LIBRARY_CACHE_TTL_MS = 60_000; // 60 giây

  private imageMappingCache: ImageMappingFile | null = null;
  private imageMappingCacheTime = 0;
  private readonly IMAGE_MAPPING_CACHE_TTL_MS = 30_000; // 30 giây

  private lastSyncTime = 0;
  private isSyncing = false;
  private syncPromise: Promise<void> | null = null;
  private readonly manifestSyncByDestination = new Map<DestinationId, {
    sourceKey: string;
    promise: Promise<void>;
  }>();
  private workbookSource: SheetWorkbookSource | null = null;
  private readonly workbookSourceByDestination = new Map<DestinationId, SheetWorkbookSource>();
  private readonly workbookDerivedCacheByDestination = new Map<DestinationId, WorkbookDerivedContext>();
  private destinationDataLoading = true;
  private destinationDataError = '';
  private driveAccessCacheLoadedFor: DestinationId | null = null;
  /** Mặc định TẮT: không tự kéo lại Google Sheet mỗi 10 phút khi đang tạo/xuất list. Bật lại bằng DALAT_AUTO_SYNC_SHEET=true. */
  private readonly AUTO_SYNC_ENABLED = ['1', 'true', 'yes'].includes(String(process.env.DALAT_AUTO_SYNC_SHEET ?? 'false').trim().toLowerCase());
  private readonly AUTO_SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 phút (khi bật AUTO_SYNC)
  /** Giữ dataset đã build lúc mở tool cho cả session — không rebuild nền khi tạo/xuất. Chỉ build lại khi bấm "Làm mới" / đổi điểm đến. */
  private readonly SESSION_STICKY_DATASET = !['0', 'false', 'no'].includes(String(process.env.DALAT_SESSION_STICKY_DATASET ?? 'true').trim().toLowerCase());
  private readonly AUTO_WARM_DRIVE_CACHE = !['0', 'false', 'no'].includes(String(process.env.DALAT_AUTO_WARM_DRIVE_CACHE ?? 'true').trim().toLowerCase());
  private driveCacheWarmToken = 0;
  private driveCacheWarmStatus: DriveCacheWarmStatus = {
    phase: this.AUTO_WARM_DRIVE_CACHE ? 'checking' : 'ready',
    ready: !this.AUTO_WARM_DRIVE_CACHE,
    destinationId: this.activeDestinationId,
    total: 0,
    completed: 0,
    cached: 0,
    downloaded: 0,
    failed: 0,
    percent: this.AUTO_WARM_DRIVE_CACHE ? 0 : 100,
    message: this.AUTO_WARM_DRIVE_CACHE
      ? 'Đang kiểm tra ảnh Google Drive cần tải về máy...'
      : 'Tự động tải cache Drive đang tắt.',
  };

  constructor(private readonly runtimePerformance: RuntimePerformanceService = new RuntimePerformanceService()) {
    migrateColorEditStores(this.dataRoot);
    applySourceLinks(this.dataRoot, this.toolRoot);
    this.loadCustomDestinations();
    migrateThreadsSourceStores(this.dataRoot);
    this.activeDestinationId = this.loadActiveDestinationId();
    this.driveCacheWarmStatus.destinationId = this.activeDestinationId;
    setActiveDestinationLocalize(this.activeDestinationId);
    const cacheDir = String(process.env.DALAT_DRIVE_FILE_CACHE_DIR || '').trim()
      || path.join(this.dataRoot, 'drive-file-cache');
    configureDriveFileDiskCache(cacheDir);
    console.log(`[drive-cache] Disk cache dir: ${cacheDir}`);
  }

  // ─── Hàng đợi tạo list & cờ bận: generation-gate.ts ──────────────────────
  private generationGateInstance?: GenerationGate;
  // Tạo lười: nhiều test dựng service bằng Object.create (không chạy constructor).
  private get generationGate(): GenerationGate {
    return this.generationGateInstance ??= new GenerationGate({
      runTask: (task) => aiProvider.run(() => this.runtimePerformance.runGenerationTask(() => withLocalDataOnly(task))),
      isDataLoading: () => this.destinationDataLoading,
    });
  }

  enqueueGeneration<T>(task: () => Promise<T>): Promise<T> {
    return this.generationGate.enqueue(task);
  }

  isGenerationBusy(): boolean {
    return this.generationGate.isGenerationBusy();
  }

  isUserOperationBusy(): boolean {
    return this.generationGate.isUserOperationBusy();
  }

  private driveCacheConcurrency(configured: number, max: number): number {
    const normal = Math.min(Math.max(configured, 1), max);
    return this.runtimePerformance.getStatus().mode === 'modern' ? normal : 1;
  }

  // Chạy ngay khi backend khởi động (trước khi bất kỳ request nào tới) để "làm nóng" dữ liệu:
  // tải Google Sheet + build dataset lần đầu ở đây, thay vì để request đầu tiên của người dùng
  // phải gánh 12-25s đó (và dễ gặp lỗi 500/503 nếu trùng lúc backend chưa sẵn sàng).
  onApplicationBootstrap(): void {
    enableNightSyncPolicy();
    // prepareWorkbookForDataset sẽ đồng bộ manifest trước, rồi refreshSheetDriveManifest
    // mới khởi động lượt warm ảnh. Không đánh dấu cache sẵn sàng từ manifest rỗng ở đây:
    // nếu không, màn hình chặn tải sẽ biến mất trước khi Hinh_nen được đọc xong.
    void this.warmUpDatasetCache().finally(() => this.getNightSync().start());
  }

  private nightSync?: NightSyncCoordinator;
  setSyncBusyProbe(probe: () => boolean): void { this.generationGate.setSyncBusyProbe(probe); }
  updateExportLease(id: string, active: boolean): void { this.generationGate.updateExportLease(id, active); }
  private syncMustWait(): boolean { return this.generationGate.syncMustWait(); }
  private getNightSync(): NightSyncCoordinator {
    return this.nightSync ||= new NightSyncCoordinator({
      file: path.join(this.dataRoot, 'night-sync.json'),
      sources: () => getDestinationList().filter(s => s.sheetUrl && s.exportUrl),
      initialized: id => Object.keys(readSheetDriveManifest(this.dataRoot, id).items).length > 0,
      automaticEligible: id => !isIsolatedSheetSource(id) || Boolean(this.loadPreferredWorkbookSource(id)),
      busy: () => this.syncMustWait(),
      // Sau khi trình cập nhật đóng băng tool, không mở lượt đêm mới để nó không bị cắt ngang.
      holdAutomatic: () => isUpdateLocked(),
      run: (id, done, mark, progress) => syncNightSource(getDestinationConfig(id), done, mark, {
        progress,
        dataRoot: this.dataRoot,
        load: () => this.loadPreferredWorkbookSource(id),
        validate: source => this.validateWorkbookData(source),
        save: source => this.saveWorkbookSnapshot(source, true),
        syncHooks: async manifest => {
          const errors: string[] = [];
          for (const m of listLocalTemplates().filter(m => templateAllowsSource(m, id))) {
            try { await this.syncLocalTemplate(m.id, false); }
            catch (error) { errors.push(`${m.name}: ${error instanceof Error ? error.message : error}`); }
          }
          if (!isDalatContentSource(id) || isDalatThreadsSource(id)) return errors;
          const stores = this.hooksForSource(id);
          for (const [key, label, store] of [
            ['green', 'Hook Mảng xanh', stores.green],
            ['dark', 'Hook Tone đen', stores.dark],
            ['persimmon', 'Hook Mùa hồng', stores.persimmon],
            ['cherry-blossom', 'Hook hoa đào', stores.cherry],
          ] as const) {
            if (key === 'cherry-blossom' && !getAllowedDeckIds(id).includes(CHERRY_ID)) continue;
            try {
              const url = manifest.hookSourceGroups?.[key];
              if (!url) throw new Error('Thiếu link Google Docs trong Sheet Hinh_nen.');
              await store.ensureReady(url, true);
              if (store.getLastError()) errors.push(`${label}: ${store.getLastError()} (giữ cache hợp lệ trước đó).`);
            } catch (error) { errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`); }
          }
          return errors;
        },
        publish: async (source, manifest) => {
          while (this.syncMustWait()) await new Promise(resolve => setTimeout(resolve, 250));
          if (!hasSyncPermit()) throw new Error('Đã hết khung giờ cập nhật.');
          if (isIsolatedSheetSource(id)) publishSourceSnapshot(this.dataRoot, source, manifest, hasSyncPermit);
          else writeSheetDriveManifest(this.dataRoot, manifest, id);
          this.workbookSourceByDestination.set(id, source);
          this.workbookDerivedCacheByDestination.delete(id);
          if (id === this.activeDestinationId) {
            this.workbookSource = source;
            this.workbookDerivedCache = null;
            this.invalidateDatasetCache({ immediate: true });
            // A cold machine can fail its startup warmup before the user starts
            // a manual sync. Publication supersedes that old startup error.
            this.destinationDataError = '';
            this.destinationDataLoading = false;
          }
        },
      }),
    });
  }
  getNightSyncStatus() { return this.getNightSync().status(); }
  acknowledgeNightSync(): void { this.getNightSync().acknowledge(); }
  onModuleDestroy(): void { this.nightSync?.stop(); }

  private async warmUpDatasetCache(): Promise<void> {
    if (!isDestinationId(this.activeDestinationId)) {
      this.destinationDataLoading = false;
      this.destinationDataError = '';
      this.driveCacheWarmStatus = { ...this.driveCacheWarmStatus, phase: 'ready', ready: true, destinationId: '', total: 0, completed: 0, percent: 100,
        message: 'Máy này chưa có nguồn dữ liệu. Hãy thêm link Google Sheet để bắt đầu.' };
      console.log('[warmup] Chưa có nguồn dữ liệu trên máy này; chờ người dùng thêm nguồn.');
      return;
    }
    this.destinationDataLoading = true;
    this.destinationDataError = '';
    try {
      console.log('[warmup] Đang đọc XLSX cục bộ và build dataset trước khi nhận request...');
      const t0 = Date.now();
      // Hook Doc phải sẵn trước khi build deck spotlight-v3 (cover title).
      if (!isDalatThreadsSource(this.activeDestinationId)) await this.warmSpotlightV3Hooks();
      await this.prepareWorkbookForDataset(false);
      // Chờ manifest Drive xong rồi mới build 1 lần — tránh sync xong lại invalidate/rebuild lần 2.
      const manifestSync = this.manifestSyncByDestination.get(this.activeDestinationId)?.promise;
      if (manifestSync) {
        await manifestSync.catch(() => undefined);
      }
      this.buildDatasetContext();
      if (this.workbookSource) {
        this.workbookSourceByDestination.set(this.activeDestinationId, this.workbookSource);
      }
      if (this.workbookDerivedCache) {
        this.workbookDerivedCacheByDestination.set(this.activeDestinationId, this.workbookDerivedCache);
      }
      console.log(`[warmup] Sẵn sàng phục vụ /api/guide-data (mất ${Date.now() - t0}ms). Session sticky=${this.SESSION_STICKY_DATASET}, autoSyncSheet=${this.AUTO_SYNC_ENABLED}.`);
    } catch (error) {
      console.error('[warmup] Làm nóng dữ liệu trước thất bại:', error);
      if (this.activeDestinationId !== DEFAULT_DESTINATION_ID && isDestinationId(DEFAULT_DESTINATION_ID) && !isIsolatedSheetSource(this.activeDestinationId)) {
        const failedDestinationId = this.activeDestinationId;
        try {
          console.warn(`[warmup] Nguồn ${failedDestinationId} không sẵn sàng; tự quay về ${DEFAULT_DESTINATION_ID}.`);
          await this.setActiveDestination({ id: DEFAULT_DESTINATION_ID });
          this.destinationDataError = '';
          return;
        } catch (fallbackError) {
          console.error('[warmup] Không thể quay về nguồn mặc định:', fallbackError);
        }
      }
      this.destinationDataError = error instanceof Error ? error.message : String(error);
    } finally {
      this.destinationDataLoading = false;
    }
  }

  private async warmSpotlightV3Hooks(): Promise<void> {
    try {
      await loadSpotlightV3Hooks({ dataRoot: this.dataRoot });
    } catch (error) {
      console.warn('[warmup] Không tải được hook Spotlight V3:', error instanceof Error ? error.message : error);
    }
  }

  private async loadDeckHookSection(deckId: string): Promise<string[]> {
    const section = HOOK_SECTION_BY_DECK[deckId];
    if (!section) return [];
    return loadSpotlightV3Hooks({
      dataRoot: this.dataRoot,
      docId: hookDocId('sections'),
      cacheFileName: `${section.key}-hooks.json`,
      sectionHeadingIncludes: section.headingIncludes,
      fallbackKey: section.key,
    });
  }

  private async resolveDeckHookCoverTitle(deckId: string, seed: string): Promise<string> {
    const hooks = await this.loadDeckHookSection(deckId);
    if (!hooks.length) {
      throw new BadRequestException(`Không tải được nhóm hook Google Docs dành cho mẫu ${deckId}. Vui lòng kiểm tra mạng rồi thử lại.`);
    }
    const sectionKey = HOOK_SECTION_BY_DECK[deckId].key;
    const used = Object.entries(HOOK_SECTION_BY_DECK)
      .filter(([, section]) => section.key === sectionKey)
      .flatMap(([id]) => this.getUsedCaptionTitles(id));
    return pickSpotlightV3Hook(hooks, used, seed);
  }

  /** Máy mới: tự tải ảnh Drive còn thiếu vào backend/data/drive-file-cache (chạy nền). */
  private scheduleWarmDriveFileDiskCache(options: { retryKnownFailures?: boolean } = {}): void {
    if (!hasSyncPermit()) {
      this.driveCacheWarmStatus = { ...this.driveCacheWarmStatus, phase: 'ready', ready: true,
        message: 'Đang dùng cache cục bộ. Cập nhật thủ công hoặc chờ 23:00–06:00.' };
      return;
    }
    if (!this.AUTO_WARM_DRIVE_CACHE) {
      this.driveCacheWarmStatus = {
        ...this.driveCacheWarmStatus,
        phase: 'ready',
        ready: true,
        destinationId: this.activeDestinationId,
        percent: 100,
        message: 'Tự động tải cache Drive đang tắt.',
      };
      return;
    }
    const token = ++this.driveCacheWarmToken;
    this.driveCacheWarmStatus = {
      phase: 'checking',
      ready: false,
      destinationId: this.activeDestinationId,
      total: 0,
      completed: 0,
      cached: 0,
      downloaded: 0,
      failed: 0,
      percent: 0,
      message: 'Đang kiểm tra ảnh Google Drive cần tải về máy...',
    };
    void this.runWarmDriveFileDiskCache(token, Boolean(options.retryKnownFailures)).catch((error) => {
      if (token !== this.driveCacheWarmToken) return;
      this.driveCacheWarmStatus = {
        ...this.driveCacheWarmStatus,
        phase: 'error',
        ready: false,
        message: `Không thể hoàn tất cache ảnh Drive: ${error instanceof Error ? error.message : error}`,
      };
    });
  }

  private collectDriveFileIdsForCacheWarm(): string[] {
    try {
      const manifest = this.loadSheetDriveManifest();
      const ids = new Set<string>();
      for (const entry of Object.values(manifest.items || {})) {
        const fileId = String(entry?.fileId || '').trim();
        if (fileId) ids.add(fileId);
        for (const image of entry.themedImages?.['cherry-blossom']?.images || []) if (image.fileId) ids.add(image.fileId);
        for (const image of entry.cherryRegularImages || []) if (image.fileId) ids.add(image.fileId);
      }
      const coverLimit = Math.max(0, Number(process.env.DALAT_DRIVE_CACHE_COVER_LIMIT || 120));
      for (const cover of (manifest.coverImages || []).slice(0, coverLimit)) {
        const fileId = String(cover?.fileId || '').trim();
        if (fileId) ids.add(fileId);
      }
      // Spotlight V6 Đà Lạt dùng riêng Tone đen cho cover và Random cho các
      // trang ảnh xen kẽ. Warm hai pool này trước khi mở giao diện tạo list;
      // pool Mảng xanh chỉ lưu metadata và chưa được tải khi chưa có mẫu dùng.
      if (isDalatContentSource(this.activeDestinationId)) {
        const specialLimit = Math.max(
          0,
          Number(process.env.DALAT_DRIVE_CACHE_SPECIAL_COVER_LIMIT || 120),
        );
        for (const group of ['dark', 'random', 'cherry-blossom', 'cherry-blossom-random'] as const) {
          for (const entry of (manifest.coverImageGroups?.[group] || []).slice(0, specialLimit)) {
            const fileId = String(entry?.fileId || '').trim();
            if (fileId) ids.add(fileId);
          }
        }
      }
      return [...ids];
    } catch (error) {
      console.warn('[drive-cache] Không đọc được manifest để warm:', error instanceof Error ? error.message : error);
      return [];
    }
  }

  private async runWarmDriveFileDiskCache(token: number, retryKnownFailures = false): Promise<void> {
    const fileIds = this.collectDriveFileIdsForCacheWarm();
    if (!fileIds.length) {
      if (token === this.driveCacheWarmToken) {
        this.driveCacheWarmStatus = {
          ...this.driveCacheWarmStatus,
          phase: 'ready',
          ready: true,
          percent: 100,
          message: 'Không có ảnh Drive nào cần tải cache.',
        };
      }
      return;
    }
    if (retryKnownFailures) {
      clearKnownFailedDriveFileIds(fileIds);
    }
    const warmed = await warmDriveFileDiskCache(fileIds, {
      runTask: (task) => this.runtimePerformance.runDriveTask(4, task),
      concurrency: this.driveCacheConcurrency(Number(process.env.DALAT_DRIVE_CACHE_CONCURRENCY || 4), 4),
      shouldCancel: () => token !== this.driveCacheWarmToken,
      onProgress: (result) => {
        if (token !== this.driveCacheWarmToken) return;
        const completed = result.skipped + result.ok + result.fail;
        this.driveCacheWarmStatus = {
          phase: 'warming',
          ready: false,
          destinationId: this.activeDestinationId,
          total: result.total,
          completed,
          cached: result.skipped,
          downloaded: result.ok,
          failed: result.fail,
          percent: result.total ? Math.min(99, Math.round((completed / result.total) * 100)) : 0,
          message: `Đang tải ảnh Drive vào cache (${completed}/${result.total})...`,
        };
      },
    });
    if (token !== this.driveCacheWarmToken || warmed.cancelled) return;
    let completed = warmed.skipped + warmed.ok + warmed.fail;

    // Không giữ người dùng ở 99% để resolve lại các folder Drive lỗi. ID tải lỗi đã
    // được lưu vào failed-file-ids và sẽ bị loại khi rebuild dataset ngay bên dưới.
    // Người dùng vẫn có thể chủ động "Tải lại dữ liệu" để xác minh toàn bộ link sau.
    if (warmed.fail > 0 && this.workbookSource) {
      this.driveCacheWarmStatus = {
        ...this.driveCacheWarmStatus,
        phase: 'warming',
        ready: false,
        percent: 99,
        message: `Đang loại ${warmed.fail} ảnh lỗi và hoàn tất dữ liệu...`,
      };
      completed = warmed.total;
    }

    // Dataset có thể đã được dựng song song từ manifest portable trước khi warm
    // phát hiện file Drive hỏng. Session-sticky sẽ giữ bản đó mãi, nên dựng lại
    // ngay để các file không có ảnh thật bị loại khỏi pool tạo list.
    if (this.workbookSource) {
      this.invalidateDatasetCache({ immediate: true });
      try {
        const rebuilt = this.rebuildWorkbookDerivedCacheNow();
        this.workbookDerivedCacheByDestination.set(this.activeDestinationId, rebuilt);
      } catch (error) {
        console.warn(
          '[drive-cache] Khong build lai duoc dataset sau warm:',
          error instanceof Error ? error.message : error,
        );
      }
    }
    this.driveCacheWarmStatus = {
      phase: 'ready',
      ready: true,
      destinationId: this.activeDestinationId,
      total: warmed.total,
      completed,
      cached: warmed.skipped,
      downloaded: warmed.ok,
      failed: warmed.fail,
      percent: 100,
      message: warmed.fail > 0
        ? `Đã hoàn tất cache ảnh; ${warmed.fail} ảnh Drive không tải được đã bị loại khỏi pool tạo list.`
        : 'Đã tải xong ảnh Drive vào cache. Bạn có thể tạo list.',
    };
  }

  private localInventoryMemo?: { destinationId: string; time: number; value: NonNullable<DriveCacheWarmStatus['localInventory']> };

  private getLocalImageInventory(): DriveCacheWarmStatus['localInventory'] {
    if (this.localInventoryMemo?.destinationId === this.activeDestinationId && Date.now() - this.localInventoryMemo.time < 30000) return this.localInventoryMemo.value;
    try {
      const ids = new Set<string>();
      const visit = (value: any) => {
        if (!value || typeof value !== 'object') return;
        if (typeof value.fileId === 'string' && value.fileId.trim()) ids.add(value.fileId.trim());
        if (typeof value.mapFileId === 'string' && value.mapFileId.trim()) ids.add(value.mapFileId.trim());
        Object.values(value).forEach(visit);
      };
      visit(this.loadSheetDriveManifest());
      const cached = [...ids].filter(id => hasDriveFileDiskCache(id)).length;
      const value = { total: ids.size, cached, missing: ids.size - cached, checkedAt: new Date().toISOString() };
      this.localInventoryMemo = { destinationId: this.activeDestinationId, time: Date.now(), value };
      return value;
    } catch { return undefined; }
  }

  getDriveCacheWarmStatus(): DriveCacheWarmStatus {
    if (!isDestinationId(this.activeDestinationId)) {
      // Máy chưa có nguồn: không có ảnh nào cần chờ; giao diện hiện màn thêm nguồn.
      return { ...this.driveCacheWarmStatus, phase: 'ready', ready: true, destinationId: '', total: 0, completed: 0, percent: 100,
        message: 'Máy này chưa có nguồn dữ liệu. Hãy thêm link Google Sheet để bắt đầu.' };
    }
    const sync = this.getNightSyncStatus();
    const sourceSync = sync.sources.find(source => source.id === this.activeDestinationId);
    const syncPending = sync.running === this.activeDestinationId || sync.queued.includes(this.activeDestinationId);
    const syncIncomplete = sourceSync?.phase === 'error' || (sourceSync?.phase === 'partial' && !sourceSync.result);
    // Dữ liệu đã công bố trước đó vẫn hợp lệ cho tới khi lượt mới công bố thay thế
    // (publish là thao tác nguyên tử). Lượt sau đang chạy, bị ngắt (tắt tool/cập nhật
    // phiên bản) hoặc lỗi mạng không được khóa tạo list; chỉ nguồn chưa từng có dữ
    // liệu mới phải chờ cập nhật.
    const publishedBefore = Boolean(sourceSync?.initialized && sourceSync.lastPublishedAt);
    if ((syncPending || syncIncomplete) && !publishedBefore) {
      return { ...this.driveCacheWarmStatus, ready: false, destinationId: this.activeDestinationId,
        phase: sourceSync?.phase === 'error' || sourceSync?.phase === 'partial' ? 'error' : 'warming',
        message: sourceSync?.error || (sourceSync?.phase === 'partial'
          ? 'Cập nhật chưa hoàn tất: còn ảnh lỗi. Vui lòng cập nhật lại trước khi tạo list.'
          : sourceSync?.progress?.stage || 'Đang chờ cập nhật dữ liệu.'),
      };
    }
    const localInventory = this.getLocalImageInventory();
    // Trên máy mới có thể xảy ra race: cache ảnh đã đủ 100% nhưng bước build dataset
    // nền chưa kịp hạ cờ loading. Khi nguồn Sheet đã có, request guide-data có thể tự
    // build context; vì vậy không được tiếp tục khóa overlay chỉ vì cờ loading này.
    const sourceIsReady = Boolean(this.workbookSource);
    // A completed sync publishes a validated dataset even when some images failed.
    // Generation independently filters every candidate against valid local cache.
    const syncPublished = Boolean(sourceSync?.initialized && sourceSync.result
      && (sourceSync.phase === 'complete' || sourceSync.phase === 'partial')) || publishedBefore;
    const cacheIsReady = syncPublished || (this.driveCacheWarmStatus.ready
      && this.driveCacheWarmStatus.phase === 'ready');
    const syncWarning = syncIncomplete
      ? `${sourceSync?.error ? `Lượt cập nhật gần nhất lỗi: ${sourceSync.error}` : 'Lượt cập nhật gần nhất bị ngắt giữa chừng.'} Đang dùng dữ liệu đã cập nhật lúc ${new Date(sourceSync!.lastPublishedAt!).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}; tool tự thử lại trong 23:00–06:00, hoặc cập nhật thủ công trong Dữ liệu & Cài đặt.`
      : undefined;
    if (this.destinationDataLoading && !(sourceIsReady && cacheIsReady)) {
      return {
        ...this.driveCacheWarmStatus,
        phase: this.driveCacheWarmStatus.phase === 'error' ? 'error' : this.driveCacheWarmStatus.phase,
        ready: false,
        destinationId: this.activeDestinationId,
        message: this.driveCacheWarmStatus.phase === 'warming'
          ? `Đang tải dữ liệu ${getDestinationConfig(this.activeDestinationId).label} và ${this.driveCacheWarmStatus.message.toLowerCase()}`
          : `Đang đọc dữ liệu XLSX (${getDestinationConfig(this.activeDestinationId).label})...`,
      };
    }
    if (this.destinationDataError && !(sourceIsReady && syncPublished)) {
      return {
        ...this.driveCacheWarmStatus,
        phase: 'error',
        ready: false,
        destinationId: this.activeDestinationId,
        total: 0,
        completed: 0,
        percent: 0,
        message: this.destinationDataError,
      };
    }
    if (sourceIsReady && cacheIsReady) {
      // A few permanently broken Drive files are normal; more than 10% missing
      // means this machine simply has not downloaded the photos yet.
      const imagesMissing = Boolean(localInventory && localInventory.total > 0 && localInventory.missing > localInventory.total * 0.1);
      const label = getDestinationConfig(this.activeDestinationId).label;
      return {
        ...this.driveCacheWarmStatus,
        phase: 'ready',
        ready: true,
        destinationId: this.activeDestinationId,
        percent: 100,
        localInventory,
        syncWarning,
        ...(imagesMissing ? { imagesMissing } : {}),
        message: imagesMissing
          ? `${localInventory!.cached ? `Máy này mới có ${localInventory!.cached}/${localInventory!.total} ảnh` : `Máy này chưa có ảnh (0/${localInventory!.total})`} của nguồn ${label}. Mẫu có ảnh sẽ báo thiếu ảnh cho tới khi tải xong; mẫu chữ (Threads/Note) vẫn dùng được. ${getDestinationConfig(this.activeDestinationId).exportUrl ? 'Vào Dữ liệu & Cài đặt → “Cập nhật dữ liệu ngay” để tải ảnh (không cần chờ 23:00–06:00).' : 'Vào Dữ liệu & Cài đặt → thay lại file XLSX để tải ảnh.'}`
          : this.driveCacheWarmStatus.failed > 0
          ? `Đã hoàn tất cache ảnh; ${this.driveCacheWarmStatus.failed} ảnh Drive không tải được đã bị loại khỏi pool tạo list.`
          : 'Đã tải xong ảnh Drive vào cache. Bạn có thể tạo list.',
      };
    }
    return { ...this.driveCacheWarmStatus, ready: false, destinationId: this.activeDestinationId };
  }

  private assertDriveCacheReady(): void {
    const cacheStatus = this.getDriveCacheWarmStatus();
    if (cacheStatus.ready) return;
    throw new ServiceUnavailableException({
      message: cacheStatus.phase === 'error'
        ? `Dữ liệu điểm đến chưa sẵn sàng: ${cacheStatus.message}`
        : 'Đang đồng bộ dữ liệu và ảnh Google Drive vào cache, tạm thời chưa thể tạo list. Vui lòng chờ thông báo hoàn tất.',
      code: 'DRIVE_CACHE_WARMING',
      cache: cacheStatus,
    });
  }
  // ──────────────────────────────────────────────────────────────────────────

  // ─── Static file & asset serving (GuideAssetService) ──────────────────────

  private assetService?: GuideAssetService;
  // Tạo lười: nhiều test dựng service bằng Object.create (không chạy constructor).
  private get assets(): GuideAssetService {
    return this.assetService ??= new GuideAssetService({
      toolRoot: () => this.toolRoot,
      frontendRoot: () => this.frontendRoot,
      workspaceRoot: () => this.workspaceRoot,
      dataRoot: () => this.dataRoot,
      dalatImageDir: () => this.dalatImageDir,
      tiktokReferenceDir: () => this.tiktokReferenceDir,
      loadImageMapping: (allowLegacyAssets) => this.loadImageMapping(allowLegacyAssets),
      getDriveFileAsset: (fileId) => this.getDriveFileAsset(fileId),
      driveCacheConcurrency: (configured, max) => this.driveCacheConcurrency(configured, max),
      runDriveTask: (concurrency, task) => this.runtimePerformance.runDriveTask(concurrency, task),
    });
  }

  getToolTextFile(fileName: string): string { return this.assets.getToolTextFile(fileName); }
  getToolBinaryFile(fileName: string): Buffer { return this.assets.getToolBinaryFile(fileName); }
  getFrontendTextFile(fileName: string): string { return this.assets.getFrontendTextFile(fileName); }
  getFrontendBinaryFile(fileName: string): Buffer { return this.assets.getFrontendBinaryFile(fileName); }
  guessMime(fileName: string): string { return this.assets.guessMime(fileName); }
  getDalatAsset(fileName: string): Buffer { return this.assets.getDalatAsset(fileName); }
  getTiktokAsset(folderName: string, fileName: string): Buffer { return this.assets.getTiktokAsset(folderName, fileName); }
  getWorkspaceAsset(relativePath: string): Buffer { return this.assets.getWorkspaceAsset(relativePath); }
  getLibraryAsset(relativePath: string, rootKey = 'main'): Buffer { return this.assets.getLibraryAsset(relativePath, rootKey); }
  getDriveFileAsset(fileId: string): Promise<DriveFileAsset> { return this.assets.getDriveFileAsset(fileId); }
  /** Bản thu nhỏ cho thumbnail giao diện; xuất ảnh luôn dùng getDriveFileAsset. */
  async getDriveFileThumbnail(fileId: string): Promise<DriveFileAsset> { return driveThumbnail(await this.getDriveFileAsset(fileId), this.dataRoot); }
  getColorEditedAsset(source: string, preset: string): Promise<Buffer> { return this.assets.getColorEditedAsset(source, preset); }
  getDriveFilesCacheStatus(fileIds: string[]) { return this.assets.getDriveFilesCacheStatus(fileIds); }
  prefetchDriveFiles(fileIds: string[]) { return this.assets.prefetchDriveFiles(fileIds); }

  private ensureDataRoot(): void {
    fs.mkdirSync(this.dataRoot, { recursive: true });
  }

  private writeJsonFileSafe(targetPath: string, data: unknown): void {
    fileIo.writeJsonFileSafe(targetPath, data);
  }

  // ─── Dataset ──────────────────────────────────────────────────────────────

  getDestinations(): DestinationListResponse {
    return {
      active: isDestinationId(this.activeDestinationId) ? this.getActiveDestinationSummary() : null,
      destinations: getDestinationList().map((entry) => this.getDestinationSummary(entry.id)),
    };
  }

  assertTemplateAllowed(deckIdValue: unknown, sourceId: DestinationId = this.activeDestinationId): void {
    const deckId = String(deckIdValue || '').trim();
    if (!isDestinationId(sourceId)) throw new BadRequestException('Nguồn dữ liệu không tồn tại.');
    if (!deckId) throw new BadRequestException('Thiếu mẫu để tạo list.');
    if (!isDeckAllowedForSource(sourceId, deckId)) throw new BadRequestException(sourceTemplateError(sourceId, deckId));
  }

  getHookSources(destinationId: DestinationId = this.activeDestinationId): HookSourcesResponse {
    if (!isDestinationId(destinationId)) throw new BadRequestException('Nguồn dữ liệu không tồn tại.');
    return this.hooksForSource(destinationId).festival.getStatus(destinationId);
  }

  async addHookSource(input: { name?: unknown; docUrl?: unknown }, file?: HookSourceUpload): Promise<HookSourcesResponse> {
    try {
      await this.festivalHookSources.create(input, file);
      return this.getHookSources();
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
  }

  async updateHookSource(id: string, input: { name?: unknown; docUrl?: unknown }, file?: HookSourceUpload): Promise<HookSourcesResponse> {
    try {
      await this.festivalHookSources.update(id, input, file);
      return this.getHookSources();
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
  }

  async refreshHookSource(id: string): Promise<HookSourcesResponse> {
    try {
      await this.festivalHookSources.refresh(id);
      return this.getHookSources();
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
  }

  deleteHookSource(id: string): HookSourcesResponse {
    try {
      this.festivalHookSources.delete(id);
      return this.getHookSources();
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
  }

  setHookMode(request: SetHookModeRequest): HookSourcesResponse {
    try {
      this.festivalHookSources.setMode(request?.mode, String(request?.sourceId || ''), this.activeDestinationId);
      return this.getHookSources();
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
  }

  private parseSourceKind(request: { kind?: unknown; dalatContent?: unknown } | undefined): { kind?: SourceKind; dalatContent: boolean } {
    const raw = String(request?.kind ?? '').trim();
    if (raw && raw !== 'standard' && raw !== 'threads') throw new BadRequestException('Loại nguồn chỉ có thể là Thường hoặc Threads.');
    const dalatContent = request?.dalatContent === true || ['1', 'true', 'yes'].includes(String(request?.dalatContent ?? '').trim().toLowerCase());
    return { ...(raw ? { kind: raw as SourceKind } : {}), dalatContent };
  }

  async addDestination(request: AddDestinationRequest): Promise<AddDestinationResponse> {
    const label = String(request?.label || '').replace(/\s+/g, ' ').trim();
    if (label.length < 2 || label.length > 60) {
      throw new BadRequestException('Tên nguồn dữ liệu phải có từ 2 đến 60 ký tự.');
    }
    const sourceKind = this.parseSourceKind(request);

    const sheet = this.parseGoogleSheetUrl(request?.sheetUrl);
    const duplicate = getDestinationList().find((entry) => this.extractSheetId(entry.sheetUrl) === sheet.sheetId);
    if (duplicate) {
      throw new BadRequestException(`Google Sheet này đã được thêm với tên "${duplicate.label}".`);
    }

    const id = `sheet-${stableHash(sheet.sheetId).toString(36)}`;
    const shortLabel = this.createDestinationShortLabel(label);
    const config: DestinationConfig = {
      id,
      label,
      shortLabel,
      sheetUrl: sheet.sheetUrl,
      exportUrl: sheet.exportUrl,
      workbookName: `Google Sheet - ${label}`,
      workbookFileName: `${label}.xlsx`,
      sourceType: 'google-sheet',
      ...(sourceKind.kind ? { kind: sourceKind.kind } : {}),
      ...(sourceKind.dalatContent ? { contentDestinationId: 'dalat' } : {}),
    };
    const previousDestinationId = this.activeDestinationId;

    let source: SheetWorkbookSource;
    try {
      // Thêm nguồn là yêu cầu thủ công: được tải Sheet ngay, không chờ khung 23:00–06:00.
      const permit = { manual: true, signal: AbortSignal.timeout(5 * 60 * 1000),
        waitForIdle: async () => { while (this.syncMustWait()) await new Promise(resolve => setTimeout(resolve, 250)); } };
      source = await withSyncPermit(permit, () => fetchWorkbookFromSheet(config));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(
        `${message}. Hãy kiểm tra link và cấp quyền "Bất kỳ ai có đường liên kết đều có thể xem".`,
      );
    }
    try {
      this.validateWorkbookData(source);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }

    registerDestination(config);
    if (config.kind) {
      // Nguồn tách biệt chỉ có dữ liệu sau một lượt cập nhật đầy đủ (Sheet + ảnh + công bố).
      // Giao diện chạy “Tải dữ liệu & chuyển” ngay sau khi thêm.
      this.persistCustomDestinations();
      return {
        active: isDestinationId(this.activeDestinationId) ? this.getActiveDestinationSummary() : null,
        created: this.getDestinationSummary(id),
        needsFirstSync: true,
        destinations: getDestinationList().map((entry) => this.getDestinationSummary(entry.id)),
      } as AddDestinationResponse;
    }
    try {
      this.persistCustomDestinations();
      this.workbookSourceByDestination.set(id, source);
      this.saveWorkbookSnapshot(source);
      const switched = await this.setActiveDestination({ id });
      return {
        ...switched,
        destinations: getDestinationList().map((entry) => this.getDestinationSummary(entry.id)),
      };
    } catch (error) {
      if (this.activeDestinationId === id && isDestinationId(previousDestinationId)) {
        await this.setActiveDestination({ id: previousDestinationId }).catch(() => undefined);
      }
      unregisterDestination(id);
      this.workbookSourceByDestination.delete(id);
      this.workbookDerivedCacheByDestination.delete(id);
      this.persistCustomDestinations();
      throw error;
    }
  }

  async addXlsxDestination(
    request: AddXlsxDestinationRequest,
    file: LocalWorkbookUpload | undefined,
  ): Promise<AddDestinationResponse> {
    const label = this.normalizeDestinationLabel(request?.label);
    const sourceKind = this.parseSourceKind(request);
    const sheet = String(request?.sheetUrl || '').trim()
      ? this.parseGoogleSheetUrl(request.sheetUrl)
      : null;
    const upload = this.validateWorkbookUpload(file);
    const id = `xlsx-${stableHash(`${label}:${Date.now()}:${upload.originalname}`).toString(36)}`;
    const config: DestinationConfig = {
      id,
      label,
      shortLabel: this.createDestinationShortLabel(label),
      sheetUrl: sheet?.sheetUrl || '',
      exportUrl: sheet?.exportUrl || '',
      workbookName: upload.originalname,
      workbookFileName: upload.originalname,
      sourceType: 'xlsx',
      ...(sourceKind.kind ? { kind: sourceKind.kind } : {}),
      ...(sourceKind.dalatContent ? { contentDestinationId: 'dalat' } : {}),
    };
    const source = this.createUploadedWorkbookSource(config, upload);
    this.validateWorkbookData(source);
    const previousDestinationId = this.activeDestinationId;

    registerDestination(config);
    try {
      this.saveWorkbookSnapshot(source, true);
      this.persistCustomDestinations();
      this.workbookSourceByDestination.set(id, source);
      const switched = await this.setActiveDestination({ id });
      this.startUploadedWorkbookImageSync(source);
      return {
        ...switched,
        destinations: getDestinationList().map((entry) => this.getDestinationSummary(entry.id)),
      };
    } catch (error) {
      if (this.activeDestinationId === id && isDestinationId(previousDestinationId)) {
        await this.setActiveDestination({ id: previousDestinationId }).catch(() => undefined);
      }
      unregisterDestination(id);
      this.workbookSourceByDestination.delete(id);
      this.workbookDerivedCacheByDestination.delete(id);
      this.persistCustomDestinations();
      const createdPath = this.workbookSnapshotPath(id);
      if (fs.existsSync(createdPath)) fs.rmSync(createdPath, { force: true });
      throw error;
    }
  }

  async replaceDestinationWorkbook(
    idValue: string,
    file: LocalWorkbookUpload | undefined,
  ): Promise<SetDestinationResponse> {
    const id = String(idValue || '').trim();
    if (!isDestinationId(id)) {
      throw new NotFoundException('Nguồn dữ liệu không tồn tại.');
    }
    const config = getDestinationConfig(id);
    const upload = this.validateWorkbookUpload(file);
    const source = this.createUploadedWorkbookSource(config, upload);
    this.validateWorkbookData(source);

    // Chỉ thay file sau khi đã đọc và kiểm tra cấu trúc thành công.
    this.saveWorkbookSnapshot(source, true);
    config.sourceType = 'xlsx';
    config.workbookName = upload.originalname;
    config.workbookFileName = upload.originalname;
    if (id === 'dalat' || id === 'greenland') {
      this.writeWorkbookMetadata(id, upload.originalname);
    } else {
      this.persistCustomDestinations();
    }
    this.workbookSourceByDestination.set(id, source);
    this.workbookDerivedCacheByDestination.delete(id);

    if (this.activeDestinationId !== id) {
      const switched = await this.setActiveDestination({ id });
      this.startUploadedWorkbookImageSync(source);
      return switched;
    }
    await this.activateWorkbookSource(source, { retryKnownFailures: false });
    this.startUploadedWorkbookImageSync(source);
    // Build first: the summary's item count is written by the rebuild.
    const dataset = await this.getDataset();
    return { active: this.getActiveDestinationSummary(), dataset };
  }

  /**
   * Adding/replacing an XLSX is an explicit user request to use that workbook now.
   * Read its Drive photo links and warm the image cache in the background (the
   * night window only governs automatic updates). Without this, an XLSX source
   * with no Google Sheet link never got photos and could not create any list.
   */
  private startUploadedWorkbookImageSync(source: SheetWorkbookSource): void {
    const permit = { manual: true, signal: AbortSignal.timeout(60 * 60 * 1000),
      waitForIdle: async () => { while (this.syncMustWait()) await new Promise(resolve => setTimeout(resolve, 250)); } };
    void withSyncPermit(permit, () => this.refreshSheetDriveManifest(source, false, true))
      .then(() => {
        // The session-sticky dataset ignores background invalidation; this source
        // had no photos to keep, so rebuild it now with the new manifest.
        if (source.destinationId === this.activeDestinationId && this.workbookSource === source) this.invalidateDatasetCache({ immediate: true });
        else this.workbookDerivedCacheByDestination.delete(source.destinationId);
      })
      .catch(error => console.error('[xlsx-source] Không đọc được ảnh Drive của workbook vừa nhập:', error));
  }

  async refreshDestinationFromSheet(idValue: string): Promise<SetDestinationResponse & { sync: ReturnType<NightSyncCoordinator['status']> }> {
    try {
      await this.getNightSync().manual(String(idValue || '').trim());
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
    return { active: this.getActiveDestinationSummary(), dataset: await this.getDataset(), sync: this.getNightSyncStatus() };
  }

  startDestinationSync(id: string) {
    if (!getDestinationList().some(source => source.id === id && source.sheetUrl && source.exportUrl)) {
      throw new BadRequestException('Nguồn không có Google Sheet hợp lệ.');
    }
    void this.getNightSync().manual(id).catch(error => console.error('[manual-sync]', id, error));
    return { accepted: true, destinationId: id, sync: this.getNightSyncStatus() };
  }

  async setActiveDestination(request: SetDestinationRequest): Promise<SetDestinationResponse> {
    const nextId = String(request?.id ?? '').trim();
    if (!isDestinationId(nextId)) {
      throw new BadRequestException('Nguồn dữ liệu không tồn tại hoặc đã bị xóa.');
    }

    const previousDestinationId = this.activeDestinationId;
    const switchingDestination = nextId !== previousDestinationId;
    if (switchingDestination) {
      if (this.generatedListsLoaded) this.persistGeneratedLists();
      if (this.inventoryLoaded) this.persistInventory();
      if (this.workbookSource) {
        this.workbookSourceByDestination.set(this.activeDestinationId, this.workbookSource);
      }
      if (this.workbookDerivedCache) {
        this.workbookDerivedCacheByDestination.set(this.activeDestinationId, this.workbookDerivedCache);
      }

      this.activeDestinationId = nextId;
      this.saveActiveDestinationId(nextId);
      setActiveDestinationLocalize(nextId);
      this.resetDestinationScopedState();
      this.lastSyncTime = 0;

      this.workbookSource = this.workbookSourceByDestination.get(nextId) || null;
      if (!this.workbookSource) {
        this.workbookSource = this.loadPreferredWorkbookSource(nextId);
        if (this.workbookSource) {
          this.workbookSourceByDestination.set(nextId, this.workbookSource);
        }
      }
      this.workbookDerivedCache = this.workbookDerivedCacheByDestination.get(nextId) || null;
      this.workbookDerivedCacheFresh = Boolean(this.workbookDerivedCache);
      this.workbookDerivedCacheTime = this.workbookDerivedCache ? Date.now() : 0;
      this.invalidateDatasetCache({ immediate: !this.workbookDerivedCache });
    }

    const needsFirstLoad = !this.workbookSource;
    const needsLocalManifestRefresh = switchingDestination
      && Boolean(this.workbookSource)
      && !this.workbookDerivedCache;
    this.destinationDataLoading = needsFirstLoad;
    this.destinationDataError = '';
    try {
      if (needsFirstLoad) {
        // Selecting a source is not consent to fetch its Sheet. The manual
        // update action can initialize an inactive source, then switch here.
        throw new BadRequestException(`Nguồn ${getDestinationConfig(nextId).label} chưa có workbook cục bộ. Hãy chọn “Tải dữ liệu & chuyển” để cập nhật thủ công trước.`);
      } else if (needsLocalManifestRefresh && this.workbookSource) {
        await this.refreshSheetDriveManifest(this.workbookSource, false);
      } else if (switchingDestination) {
        // Context/manifest đã có sẵn: chỉ khởi động một lượt warm cho nguồn mới.
        this.scheduleWarmDriveFileDiskCache();
      }
      const dataset = await this.getDataset();
      if (this.workbookSource) {
        this.workbookSourceByDestination.set(this.activeDestinationId, this.workbookSource);
      }
      if (this.workbookDerivedCache) {
        this.workbookDerivedCacheByDestination.set(this.activeDestinationId, this.workbookDerivedCache);
      }
      if (switchingDestination && !isDalatContentSource(nextId)) {
        this.festivalHookSources.deactivate();
      }
      return {
        active: this.getActiveDestinationSummary(),
        dataset,
      };
    } catch (error) {
      if (switchingDestination) {
        ++this.driveCacheWarmToken;
        this.activeDestinationId = previousDestinationId;
        this.saveActiveDestinationId(previousDestinationId);
        setActiveDestinationLocalize(previousDestinationId);
        this.resetDestinationScopedState();
        this.workbookSource = this.workbookSourceByDestination.get(previousDestinationId)
          || (isDestinationId(previousDestinationId) ? this.loadPreferredWorkbookSource(previousDestinationId) : null);
        if (this.workbookSource) {
          this.workbookSourceByDestination.set(previousDestinationId, this.workbookSource);
        }
        this.workbookDerivedCache = this.workbookDerivedCacheByDestination.get(previousDestinationId) || null;
        this.workbookDerivedCacheFresh = Boolean(this.workbookDerivedCache);
        this.workbookDerivedCacheTime = this.workbookDerivedCache ? Date.now() : 0;
        this.invalidateDatasetCache({ immediate: !this.workbookDerivedCache });
        this.destinationDataError = '';
        if (isDestinationId(previousDestinationId)) this.scheduleWarmDriveFileDiskCache();
      } else {
        this.destinationDataError = error instanceof Error ? error.message : String(error);
      }
      throw error;
    } finally {
      this.destinationDataLoading = false;
    }
  }

  async getDataset(options: { refresh?: boolean } = {}): Promise<GuideDataset> {
    if (!isDestinationId(this.activeDestinationId)) {
      throw new ServiceUnavailableException({ code: 'NO_SOURCE', message: 'Máy này chưa có nguồn dữ liệu. Hãy thêm link Google Sheet để bắt đầu.' });
    }
    const explicitRefresh = Boolean(options.refresh);
    if (explicitRefresh) {
      this.destinationDataLoading = true;
      this.destinationDataError = '';
    }
    try {
      await this.prepareWorkbookForDataset(explicitRefresh);
      if (explicitRefresh) {
        this.invalidateDatasetCache({ immediate: true });
      }
      const context = this.buildDatasetContext();
      if (this.workbookSource) {
        this.workbookSourceByDestination.set(this.activeDestinationId, this.workbookSource);
      }
      if (this.workbookDerivedCache) {
        this.workbookDerivedCacheByDestination.set(this.activeDestinationId, this.workbookDerivedCache);
      }
      const destination = getDestinationConfig(this.activeDestinationId);
      return {
        generatedAt: new Date().toISOString(),
        canvas: { width: 1588, height: 2248, previewWidth: 397, previewHeight: 562 },
        source: {
          workbook: this.getWorkbookSource().workbookName,
          destinationId: destination.id,
          destinationLabel: destination.label,
          contentDestinationId: contentDestinationId(destination.id),
          allowedDeckIds: getAllowedDeckIds(destination.id),
          imageCount: context.imageUrls.length,
          coverImageCount: context.coverImageUrls.length,
          coverImageUrls: context.coverImageUrls,
          manualMappedItemCount: context.manualMappedItemCount,
          mappedItemCount: context.mappedItemCount,
          autoMappedItemCount: context.autoMappedItemCount,
          fallbackItemCount: context.totalItems - context.mappedItemCount,
          referenceSetCount: context.referenceSets.length,
          totalItems: context.totalItems,
        },
        hero: {
          eyebrow: 'NestJS refactored tool',
          title: `${destination.label} TikTok Carousel Tool`,
          description:
            `Hệ thống tự động chuyển đổi dữ liệu ${destination.label} từ workbook XLSX thành các bộ ảnh TikTok Carousel chuyên nghiệp.`,
          note:
            `XLSX cục bộ là nguồn chính của ${destination.label}; Google Sheet chỉ được dùng khi bạn chủ động cập nhật hoặc cần dự phòng.`,
          stats: [
            { label: 'Tổng địa điểm', value: context.totalItems },
            { label: `Ảnh ${destination.shortLabel}`, value: context.imageUrls.length },
            { label: 'Bộ mẫu TikTok', value: context.referenceSets.length },
          ],
          images: Array.from({ length: 4 }, (_, index) =>
            context.imageUrls.length > 0
              ? context.imageUrls[stableHash(`hero-${index}`) % context.imageUrls.length]
              : '',
          ),
        },
        referenceSets: context.referenceSets,
        decks: context.decks,
      };
    } catch (error) {
      if (explicitRefresh) {
        this.destinationDataError = error instanceof Error ? error.message : String(error);
      }
      if (error instanceof BadRequestException || error instanceof NotFoundException || error instanceof ServiceUnavailableException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error('[dataset] Khong tai duoc guide-data:', error);
      throw new ServiceUnavailableException(
        message.includes('Google Sheet')
          ? message
          : `Không tải được dữ liệu mẫu: ${message}`,
      );
    } finally {
      if (explicitRefresh) {
        this.destinationDataLoading = false;
      }
    }
  }

  // ─── AI caption ───────────────────────────────────────────────────────────

  async generateDeepSeekCaption(request: DeepSeekCaptionRequest): Promise<DeepSeekCaptionResponse> {
    this.assertTemplateAllowed(request.deckId);
    return aiProvider.run(() => this.generateDeepSeekCaptionWithAi(request));
  }

  private async generateDeepSeekCaptionWithAi(request: DeepSeekCaptionRequest): Promise<DeepSeekCaptionResponse> {
    this.assertTemplateAllowed(request.deckId);
    const deckId = String(request.deckId ?? '').trim();
    if (!deckId) throw new BadRequestException('Thiếu deckId để gửi sang AI.');

    const dataset = await this.getDataset();
    const deck = dataset.decks.find((d) => d.id === deckId);
    if (!deck) throw new NotFoundException(`Không tìm thấy deck: ${deckId}`);

    const listId = String(request.listId ?? '').trim() || deck.lists[0]?.id || '';
    const deckList = deck.lists.find((l) => l.id === listId);
    if (!deckList) throw new NotFoundException(`Không tìm thấy list: ${listId}`);

    const tone = (request.tone ?? 'lich_trinh_huu_ich') as DeepSeekCaptionResponse['tone'];
    const target = (request.target ?? 'full') as DeepSeekCaptionResponse['target'];
    const current = {
      coverTitle: String(request.current?.coverTitle ?? '').trim(),
      headline: String(request.current?.headline ?? '').trim(),
      body: String(request.current?.body ?? '').trim(),
      hashtags: Array.isArray(request.current?.hashtags)
        ? request.current!.hashtags.map((h) => String(h).trim()).filter(Boolean)
        : [],
    };

    const apiKey = ''; // Credentials are resolved only by the AI adapter.

    const prompt = this.buildDeepSeekPrompt(deck, deckList, tone, target, current, this.getUsedCaptionTitles(deck.id));
    let response: Response;
    try {
      response = await this.fetchDeepSeekChat(apiKey, {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'Bạn là content creator du lịch TikTok. Chỉ trả về đúng JSON object hợp lệ, không thêm markdown, không giải thích.' },
          { role: 'user', content: prompt },
        ],
        temperature: 1.1,
        max_tokens: 900,
        stream: false,
      });
    } catch (fetchError: any) {
      if (fetchError instanceof AiError) throw fetchError;
      if (fetchError?.name === 'AbortError') {
        throw new BadRequestException('AI API không phản hồi sau 30 giây. Vui lòng thử lại.');
      }
      const cause = fetchError?.cause ? (fetchError.cause.code || fetchError.cause.message || String(fetchError.cause)) : '';
      throw new BadRequestException(`Không kết nối được AI: ${fetchError?.message || fetchError}${cause ? ` (${cause})` : ''}`);
    }

    const responseText = await response.text();
    if (!response.ok) throw new BadRequestException(`AI API lỗi HTTP ${response.status}: ${responseText}`);

    let payload: any;
    try { payload = JSON.parse(responseText); } catch { throw new BadRequestException('Không đọc được phản hồi JSON từ AI.'); }

    const content = String(payload?.choices?.[0]?.message?.content ?? '').trim();
    if (!content) throw new BadRequestException('AI không trả về nội dung caption.');

    const parsed = this.parseDeepSeekJson(content);
    const normalizedCaption = this.normalizeCaptionPayload(parsed, current, target, tone, deckId, this.collectCaptionForbiddenNames(deckList));
    return {
      deckId,
      listId,
      target,
      tone,
      coverTitle: normalizedCaption.coverTitle,
      headline: normalizedCaption.headline,
      body: normalizedCaption.body,
      hashtags: normalizedCaption.hashtags,
      raw: content,
    };
  }

  deleteGeneratedList(deckId: string, listId: string): void {
    this.ensureGeneratedListsLoaded();
    this.deletePageTextOverrides(deckId, listId);
    const existing = this.generatedListsByDeckId.get(deckId);
    // Idempotent: list/deck đã mất (cache UI lệch, đã xóa trước đó) → coi như xóa thành công.
    if (!existing) return;
    const filtered = existing.filter((l) => l.id !== listId);
    if (filtered.length === existing.length) return;
    if (filtered.length === 0) {
      this.generatedListsByDeckId.delete(deckId);
    } else {
      this.generatedListsByDeckId.set(deckId, filtered);
    }
    this.persistGeneratedLists();
  }

  deleteGeneratedLists(groups: Array<{ deckId?: string; listIds?: string[] }> = []): DeleteGeneratedListsResponse {
    this.ensureGeneratedListsLoaded();
    const requested = new Map<string, Set<string>>();
    for (const group of groups) {
      const deckId = String(group?.deckId || '').trim();
      if (!deckId) continue;
      const ids = requested.get(deckId) || new Set<string>();
      for (const rawId of group?.listIds || []) {
        const id = String(rawId || '').trim();
        if (id) ids.add(id);
      }
      if (ids.size) requested.set(deckId, ids);
    }

    let deletedCount = 0;
    for (const [deckId, ids] of requested) {
      const existing = this.generatedListsByDeckId.get(deckId) || [];
      const filtered = existing.filter((list) => {
        if (!ids.has(list.id)) return true;
        deletedCount += 1;
        this.deletePageTextOverrides(deckId, list.id);
        return false;
      });
      if (filtered.length) this.generatedListsByDeckId.set(deckId, filtered);
      else this.generatedListsByDeckId.delete(deckId);
    }
    if (deletedCount) this.persistGeneratedLists();

    const remainingIds = [...requested.entries()].flatMap(([deckId, ids]) => {
      const existingIds = new Set((this.generatedListsByDeckId.get(deckId) || []).map((list) => list.id));
      return [...ids].filter((id) => existingIds.has(id));
    });
    return {
      requestedCount: [...requested.values()].reduce((sum, ids) => sum + ids.size, 0),
      deletedCount,
      remainingIds,
    };
  }

  /** Ghi mốc xuất file thành công cho list đã tạo; list chính và id không còn tồn tại được bỏ qua. */
  markListsExported(groups: Array<{ deckId?: string; listIds?: string[] }> = []): MarkListsExportedResponse {
    this.ensureGeneratedListsLoaded();
    const exportedAt = new Date().toISOString();
    let markedCount = 0;
    for (const group of groups) {
      const deckId = String(group?.deckId || '').trim();
      const ids = new Set((group?.listIds || []).map(id => String(id || '').trim()).filter(Boolean));
      const existing = deckId ? this.generatedListsByDeckId.get(deckId) : undefined;
      if (!existing || !ids.size) continue;
      this.generatedListsByDeckId.set(deckId, existing.map(list => {
        if (!ids.has(list.id)) return list;
        markedCount += 1;
        return { ...list, exportedAt };
      }));
    }
    if (markedCount) this.persistGeneratedLists();
    return { exportedAt, markedCount };
  }

  updateGeneratedListCover(
    deckId: string,
    listId: string,
    request: UpdateGeneratedListCoverRequest,
  ): UpdateGeneratedListCoverResponse {
    const updated = this.updatePageText(deckId, listId, 0, {
      title: request.coverTitle,
      subtitle: request.coverSubtitle,
    });
    return {
      deckId,
      listId,
      coverTitle: updated.title,
      coverSubtitle: updated.subtitle,
    };
  }

  updatePageText(
    deckId: string,
    listId: string,
    pageIndex: number,
    request: UpdatePageTextRequest,
  ): UpdatePageTextResponse {
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      throw new BadRequestException('So trang khong hop le.');
    }
    this.ensureGeneratedListsLoaded();
    const derived = this.ensureWorkbookDerivedContext();
    // Local main lists belong to the machine-local catalog, not the workbook's
    // derived baseDecks. Resolve them through the same source-scoped catalog
    // used for display, then persist edits in the existing override store.
    const baseDeck = derived.baseDecks.find((deck) => deck.id === deckId)
      || localTemplateDecks(this.activeDestinationId).find((deck) => deck.id === deckId);
    const baseList = baseDeck?.lists.find((list) => list.id === listId);
    const generatedList = (this.generatedListsByDeckId.get(deckId) ?? []).find((list) => list.id === listId);
    const list = generatedList || baseList;
    if (!list) throw new NotFoundException(`Khong tim thay list: ${listId}`);
    const page = list.pages?.[pageIndex];
    if (!page) throw new NotFoundException(`Khong tim thay trang: ${pageIndex + 1}`);

    const store = this.loadPageTextOverrides();
    store.decks[deckId] ||= {};
    store.decks[deckId][listId] ||= {};
    const override = { ...pageText.buildPageTextOverride(deckId, page, request, store.decks[deckId][listId][String(pageIndex)], derived.coverImageUrls), editedAt: new Date().toISOString() };
    store.decks[deckId][listId][String(pageIndex)] = override;
    store.savedAt = new Date().toISOString();
    this.savePageTextOverrides(store);

    return { deckId, listId, pageIndex, ...override };
  }

  async generateDeckFromCaption(request: GenerateCaptionDeckRequest): Promise<GenerateCaptionDeckResponse> {
    this.assertTemplateAllowed(request.deckId);
    validatePhotoPreset(request.photoPreset, request.deckId);
    if (LEGACY_COLOR_DECKS[String(request.deckId)]) throw new BadRequestException('Mẫu Color Edit riêng đã chuyển thành lựa chọn Bảng màu. Chọn V5 hoặc V6.');
    const requiredPartners = this.validateRequiredPartners(request.deckId, request.requiredPartners);
    return aiProvider.run(() => this.generateDeckFromCaptionWithAi({ ...request, requiredPartners }));
  }

  async syncLocalTemplate(id: string, manual = true): Promise<unknown> {
    const manifest = findLocalTemplate(id);
    if (!manifest) throw new NotFoundException('Chưa cài mẫu local này.');
    if (manual) {
      this.assertTemplateAllowed(id);
      if (this.syncMustWait()) throw new BadRequestException('Tool đang tạo/xuất list; hãy đồng bộ nội dung sau khi hoàn tất.');
    }
    const sync = localTemplateBuilder(manifest).sync;
    if (!sync) throw new BadRequestException('Mẫu local không hỗ trợ đồng bộ nội dung.');
    const run = () => sync({ fetch: syncFetch, readWorkbook: body => {
      const book = XLSX.read(body, { type: 'buffer' });
      return Object.fromEntries(book.SheetNames.map(name => [name, XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, raw: false, defval: '' })]));
    } });
    try {
      return manual ? await withSyncPermit({ manual: true, signal: AbortSignal.timeout(90000),
        waitForIdle: async () => { if (this.syncMustWait()) throw new Error('Tool đang bận; dữ liệu nội dung cũ được giữ nguyên.'); } }, run) : await run();
    } catch (error) {
      throw new BadRequestException(`${manifest.name}: ${error instanceof Error ? error.message : error}. Giữ nội dung hợp lệ trước đó; hãy thử đồng bộ lại.`);
    } finally { this.invalidateDatasetCache({ immediate: true }); }
  }

  private async generateCherryBlossom(request: GenerateCaptionDeckRequest): Promise<GenerateCaptionDeckResponse> {
    await this.prepareWorkbookForDataset(false);
    const context = await this.buildLocallyVerifiedGenerationContext(false, true);
    const hookStore = this.hooksForSource(this.activeDestinationId).cherry;
    await withLocalDataOnly(() => hookStore.ensureReady(''));
    const existing = this.generatedListsByDeckId.get(CHERRY_ID) || [];
    const history = cherryHistory(existing, context.itemsBySection, this.partnerRotation[CHERRY_ID]);
    const requiredPartnerNames = request.requiredPartners || [];
    this.assertRequiredPartnersAvailable(CHERRY_NAME, context.itemsBySection, requiredPartnerNames);
    let built: ReturnType<typeof buildCherryBlossom>;
    setRequiredPartnerContext(requiredPartnerNames);
    try {
      built = buildCherryBlossom({ items: context.itemsBySection, pools: context.hinhNenImagePools,
        hooks: hookStore.getCachedHooks(), history, seed: crypto.randomUUID() });
    } catch (error) {
      if (requiredPartnerNames.length) throw new RequiredPartnersError(`${CHERRY_NAME}: không tìm được phương án có đủ đối tác bắt buộc (${requiredPartnerNames.join(', ')}). Mẫu này luôn có 1/2 Circle Coffee, D’Lart Garden, 1 cà phê đối tác có Mo_ta và 4 quán ăn đối tác; đối tác chọn thêm phải thuộc các ô đó và còn ảnh khác lần trước. ${error instanceof Error ? error.message : String(error)}`);
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    } finally { clearRequiredPartnerContext(); }
    const list = built.list;
    const missingRequired = missingRequiredPartners(this.renderedPartnerNames(list), requiredPartnerNames);
    if (missingRequired.length) throw new RequiredPartnersError(`${CHERRY_NAME}: không xếp được đối tác bắt buộc: ${missingRequired.join(', ')}. Chưa lưu list.`);
    const parent = context.decks.find(deck => deck.id === CHERRY_ID);
    if (parent) list.pages = inheritPageTypography(parent, list.pages, this.loadPageTextOverrides());
    list.id = `${CHERRY_ID}-caption-${crypto.randomUUID()}`;
    list.navTitle = `Mẫu ${String(existing.length + 1).padStart(2, '0')}`;
    const hookIdentity = hookStore.getSourceIdentity();
    if (!hookIdentity) throw new BadRequestException(`${CHERRY_NAME}: chưa xác định được phiên bản Hook hoa đào; hãy đồng bộ lại.`);
    list.hookSnapshot = { mode: 'cherry-blossom', ...hookIdentity };
    if (request.automationRunId) list.automationRunId = String(request.automationRunId).slice(0, 100);
    if (request.automationPosition) list.automationPosition = String(request.automationPosition).slice(0, 100);
    applyListPhotoPreset(list, request.photoPreset);
    assertCherryList(list);
    if (this.renderedPartnerNames(list).length !== 7) throw new BadRequestException(`${CHERRY_NAME}: cần đúng 7 đối tác thực sự hiển thị để xuất XLSX.`);
    await this.assertGeneratedImageCache(list.pages, CHERRY_ID);
    const oldHistory = this.partnerRotation[CHERRY_ID];
    this.generatedListsByDeckId.set(CHERRY_ID, [...existing, list]);
    this.partnerRotation[CHERRY_ID] = built.history;
    try { this.persistGeneratedLists(); }
    catch (error) {
      this.generatedListsByDeckId.set(CHERRY_ID, existing);
      if (oldHistory) this.partnerRotation[CHERRY_ID] = oldHistory; else delete this.partnerRotation[CHERRY_ID];
      throw new BadRequestException(`${CHERRY_NAME}: không lưu được list; vòng hook/ảnh/vị trí chưa bị tiêu hao. ${error instanceof Error ? error.message : error}`);
    }
    return { deckId: CHERRY_ID, listId: list.id, navTitle: list.navTitle, title: list.title, warnings: list.warnings };
  }

  private async generateLocalTemplate(request: GenerateCaptionDeckRequest): Promise<GenerateCaptionDeckResponse> {
    const m = findLocalTemplate(String(request.deckId))!;
    await this.prepareWorkbookForDataset(false);
    const context = await this.buildLocallyVerifiedGenerationContext(false);
    const existing = this.generatedListsByDeckId.get(m.id) || [];
    const sources = this.cloneJson(context.itemsBySection);
    const priorHistory = bootstrapPartnerHistory(existing, m.id, Object.values(sources).flat(), this.partnerRotation[m.id]);
    const eligible = restrictRotationPhotos(sources, priorHistory, true);
    const state = this.cloneJson(this.localTemplateState[m.id] || {});
    const coverUrls = [...new Set([...context.coverImageUrls, ...Object.values(context.hinhNenImagePools).flat()].filter(Boolean))];
    const distinctCoverIds = new Set(uniqueCachedDriveFileIdsByVisualContent(coverUrls.map(extractDriveFileIdFromProxyUrl).filter(Boolean)));
    const coverImages = [...new Map(coverUrls.filter(url => {
      const id = extractDriveFileIdFromProxyUrl(url);
      return id && distinctCoverIds.has(id);
    }).map(url => [sourcePhotoId(url), { id: sourcePhotoId(url), url }])).values()];
    const savedCoverImageIds = existing.map(list => sourcePhotoId(list.pages.find(page => page.type === 'cover')?.backgroundImage || '')).filter(Boolean);
    const savedLists = this.cloneJson(existing);
    const parentDeck = localTemplateDecks(this.activeDestinationId).find(deck => deck.id === m.id);
    const mainList = parentDeck && pageText.applyPageTextOverrides(m.id, parentDeck.lists, this.loadPageTextOverrides())
      .find(list => list.id === `${m.id}-main`);
    const builder = localTemplateBuilder(m);
    let prepared: ReturnType<typeof builder.build> | undefined;
    let rotated: ReturnType<typeof rotatePartnerList> | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        const seed = `${m.id}:${existing.length}:${crypto.randomUUID()}:${attempt}`;
        prepared = builder.build({ sourceId: this.activeDestinationId, itemsBySection: eligible, seed,
          state: this.cloneJson(state), history: priorHistory, coverImages, savedCoverImageIds, savedLists,
          mainList: mainList ? this.cloneJson(mainList) : undefined, assetUrl: name => localTemplateAssetUrl(m, name) });
        rotated = rotatePartnerList(prepared.list, m.id, sources, priorHistory, seed, 1);
        if (!this.renderedPartnerNames(rotated.list).length) throw new Error(`${m.name}: thiếu đối tác thực sự hiển thị để ghi XLSX.`);
        break;
      } catch (error) { lastError = error; prepared = undefined; rotated = undefined; }
    }
    if (!prepared || !rotated) throw new BadRequestException(`${m.name}: ${lastError instanceof Error ? lastError.message : lastError}`);
    const list = rotated.list;
    // Local builders bypass the workbook generation branch. Snapshot the
    // mother's saved typography here as well, without copying its copy/photos
    // or re-applying future template edits to already-approved children.
    if (parentDeck) list.pages = inheritPageTypography(parentDeck, list.pages, this.loadPageTextOverrides());
    list.id = `${m.id}-caption-${crypto.randomUUID()}`;
    list.navTitle = `Mẫu ${String(existing.length + 1).padStart(2, '0')} · ${list.localTemplate?.recipeId || ''}`;
    list.canvasPreset = 'tiktok-3x4';
    if (request.automationRunId) list.automationRunId = String(request.automationRunId).slice(0, 100);
    if (request.automationPosition) list.automationPosition = String(request.automationPosition).slice(0, 100);
    applyListPhotoPreset(list, request.photoPreset);
    try {
      await validateLocalTemplateResources(list);
      await this.assertGeneratedImageCache(list.pages, m.id);
    } catch (error) { throw new BadRequestException(`${m.name}: ${error instanceof Error ? error.message : error}`); }
    const oldHistory = this.partnerRotation[m.id], oldState = this.localTemplateState[m.id];
    this.generatedListsByDeckId.set(m.id, [...existing, list]);
    this.partnerRotation[m.id] = rotated.history;
    this.localTemplateState[m.id] = prepared.state;
    try { this.persistGeneratedLists(); }
    catch (error) {
      this.generatedListsByDeckId.set(m.id, existing);
      if (oldHistory) this.partnerRotation[m.id] = oldHistory; else delete this.partnerRotation[m.id];
      if (oldState) this.localTemplateState[m.id] = oldState; else delete this.localTemplateState[m.id];
      throw new BadRequestException(`${m.name}: không lưu được list; đã giữ nguyên vòng nội dung/ảnh. ${error instanceof Error ? error.message : error}`);
    }
    return { deckId: m.id, listId: list.id, navTitle: list.navTitle, title: list.title, warnings: list.warnings };
  }

  private async generateDeckFromCaptionWithAi(request: GenerateCaptionDeckRequest): Promise<GenerateCaptionDeckResponse> {
    this.assertTemplateAllowed(request.deckId);
    this.ensureGeneratedListsLoaded();
    const deckId = String(request.deckId ?? '').trim();
    if (findLocalTemplate(deckId)) return this.generateLocalTemplate(request);
    if (deckId === CHERRY_ID) return this.generateCherryBlossom(request);
    if (deckId !== THREADS_TOPLIST_ID && deckId !== 'itinerary-note-timed' && !deckId.startsWith('itinerary-note-threads-')) {
      this.assertDriveCacheReady();
    }
    if (deckId === 'spotlight-partner') {
      throw new BadRequestException('Mau Spotlight Doi tac tao list bang cach chon doi tac, khong tao tu caption chung.');
    }
    if (!deckId) throw new BadRequestException('Thiếu deckId để tạo list mới từ caption.');

    const caption = this.normalizeCaptionPayload(
      {
        coverTitle: String(request.caption?.coverTitle ?? '').trim(),
        headline: String(request.caption?.headline ?? '').trim(),
        body: String(request.caption?.body ?? '').trim(),
        hashtags: Array.isArray(request.caption?.hashtags)
          ? request.caption!.hashtags.map((h) => String(h).trim()).filter(Boolean)
          : [],
      },
      { coverTitle: '', headline: '', body: '', hashtags: [] },
      'full',
      'lich_trinh_huu_ich',
      deckId,
    );

    if (!isThreadsLocalDeck(deckId) && !isGoogleDocHookDeck(deckId) && !isPremadeHookDeck(deckId) && !isSpotlightV5Deck(deckId) && deckId !== 'spotlight-v6-green' && deckId !== 'spotlight-v6-dark' && deckId !== 'spotlight-v6-persimmon' && deckId !== 'spotlight-v6-maps' && !isTextNoteDeck(deckId) && !caption.coverTitle) {
      throw new BadRequestException('Cần có tiêu đề cover trước khi tạo list mới.');
    }

    await this.prepareWorkbookForDataset(false);
    const greenReadyImageIds = deckId === 'spotlight-v6-green'
      ? await this.prepareSpotlightV6GreenResources()
      : null;
    const darkReadyImageIds = deckId === 'spotlight-v6-dark'
      ? await this.prepareSpotlightV6DarkResources()
      : null;
    const persimmonReadyImageIds = deckId === 'spotlight-v6-persimmon'
      ? await this.prepareSpotlightV6PersimmonResources()
      : null;
    const mapsReadyImageIds = deckId === 'spotlight-v6-maps'
      ? await this.prepareSpotlightV6MapsResources()
      : null;
    const context = await this.buildLocallyVerifiedGenerationContext(!isTextNoteDeck(deckId) && !isThreadsLocalDeck(deckId));
    if (greenReadyImageIds) {
      context.hinhNenImagePools = {
        ...context.hinhNenImagePools,
        green: context.hinhNenImagePools.green.filter((url) => {
          const fileId = extractDriveFileIdFromProxyUrl(url);
          return Boolean(fileId && greenReadyImageIds.has(fileId));
        }),
      };
    }
    if (darkReadyImageIds) {
      context.hinhNenImagePools = {
        ...context.hinhNenImagePools,
        dark: context.hinhNenImagePools.dark.filter((url) => {
          const fileId = extractDriveFileIdFromProxyUrl(url);
          return Boolean(fileId && darkReadyImageIds.has(fileId));
        }),
      };
    }
    if (persimmonReadyImageIds) {
      context.hinhNenImagePools = {
        ...context.hinhNenImagePools,
        persimmon: (context.hinhNenImagePools.persimmon || []).filter((url) => {
          const fileId = extractDriveFileIdFromProxyUrl(url);
          return Boolean(fileId && persimmonReadyImageIds.has(fileId));
        }),
      };
    }
    if (mapsReadyImageIds) {
      for (const items of Object.values(context.itemsBySection)) {
        for (const item of items || []) {
          const mapUrls = [item.mapImageUrl || '', ...(item.mapCandidateImageUrls || [])].filter((url) => {
            const id = extractDriveFileIdFromProxyUrl(url);
            return Boolean(id && mapsReadyImageIds.map.has(id));
          });
          const realUrls = [item.imageUrl, ...(item.candidateImageUrls || [])].filter((url) => {
            const id = extractDriveFileIdFromProxyUrl(url);
            return Boolean(id && mapsReadyImageIds.real.has(id));
          });
          item.mapImageUrl = mapUrls[0] || '';
          item.mapCandidateImageUrls = [...new Set(mapUrls)];
          if (item.mapImageUrl) {
            item.imageUrl = realUrls[0] || '';
            item.candidateImageUrls = [...new Set(realUrls)];
            item.imageMapped = Boolean(item.imageUrl);
            item.imageSource = item.imageUrl ? 'manual' : 'fallback';
          }
        }
      }
    }
    if (deckId === 'spotlight-v4' || (deckId === 'spotlight-v6' || deckId === 'spotlight-v6-color-edit')) {
      const availability = spotlightV4VenueAvailability(context.itemsBySection);
      if (availability.partnerCount < 4 || availability.regularCount < 4) {
        throw new BadRequestException(`Mẫu Spotlight V4/V6 cần 4 đối tác và 4 địa điểm thường có ảnh; hiện có ${availability.partnerCount}/4 đối tác, ${availability.regularCount}/4 địa điểm thường.`);
      }
    }
    const currentDeck = context.decks.find((d) => d.id === deckId);
    if (!currentDeck) throw new NotFoundException(`Không tìm thấy deck: ${deckId}`);

    const existing = this.generatedListsByDeckId.get(deckId) ?? [];
    // Sử dụng timestamp + index để đảm bảo ID không bao giờ trùng kể cả khi xóa bớt
    const timestamp = Date.now().toString(36).slice(-4);
    const generatedNumber = existing.length + 1;
    const generatedSuffix = `${String(generatedNumber).padStart(2, '0')}-${timestamp}`;

    const requestedTone = this.normalizeCaptionTone(request.tone);
    const seed = [deckId, generatedSuffix, String(existing.length), requestedTone, caption.coverTitle, caption.headline, caption.body, caption.hashtags.join(' '), timestamp].join('|');
    const sourceItems = this.cloneJson(context.itemsBySection);
    const requiredPartnerNames = request.requiredPartners || [];
    this.assertRequiredPartnersAvailable(currentDeck.navTitle, context.itemsBySection, requiredPartnerNames);
    const historicalLists = this.applyPageTextOverrides(deckId, this.cloneJson(existing), this.loadPageTextOverrides());
    const rotationHistory = bootstrapPartnerHistory(historicalLists, deckId, Object.values(sourceItems).flat(), this.partnerRotation[deckId]);
    let nextRotationHistory = rotationHistory;
    let rotationWarnings: string[] = [];
    let rotationDesign: Pick<GuideDeckList, 'spotlightDesignRevision' | 'coverReview'> = {};
    let requiredPartners = 1;
    let requiredPartnerSlots = 1;

    let festivalReservation: HookReservation | null = null;
    let greenHookReservation: GreenHookReservation | null = null;
    let darkHookReservation: DarkHookReservation | null = null;
    let persimmonHookReservation: PersimmonHookReservation | null = null;
    try {
      festivalReservation = this.festivalHookSources.reserve(deckId, this.activeDestinationId, request.hookSelection);
      if (deckId === 'spotlight-v6-green') greenHookReservation = this.greenHookSource.reserve();
      if (deckId === 'spotlight-v6-dark') darkHookReservation = this.darkHookSource.reserve();
      if (deckId === 'spotlight-v6-persimmon') persimmonHookReservation = this.persimmonHookSource.reserve();
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }

    try {
    this.ensureInventoryLoaded();
    const deckUsage = this.deckUsageScope(deckId, currentDeck.lists, existing);
    if (deckId === 'spotlight-v6-green') {
      setSpotlightV3BuildContext({
        hooks: greenHookReservation ? [greenHookReservation.hook] : [],
        destinationId: contentDestinationId(this.activeDestinationId),
        usedHookTitles: this.getUsedCaptionTitles(deckId),
      });
    } else if (deckId === 'spotlight-v6-dark') {
      setSpotlightV3BuildContext({
        hooks: darkHookReservation ? [darkHookReservation.hook] : [],
        destinationId: contentDestinationId(this.activeDestinationId),
        usedHookTitles: this.getUsedCaptionTitles(deckId),
      });
    } else if (deckId === 'spotlight-v6-persimmon') {
      setSpotlightV3BuildContext({
        hooks: persimmonHookReservation ? [persimmonHookReservation.hook] : [],
        destinationId: contentDestinationId(this.activeDestinationId),
        usedHookTitles: this.getUsedCaptionTitles(deckId),
      });
    } else if (isGoogleDocHookDeck(deckId)) {
      const hooks = festivalReservation
        ? [festivalReservation.hook]
        : isSectionedGoogleDocHookDeck(deckId)
        ? await this.loadDeckHookSection(deckId)
        : (await this.warmSpotlightV3Hooks(), undefined);
      setSpotlightV3BuildContext({
        ...(hooks ? { hooks } : {}),
        ...(deckId === 'spotlight-v6-diary' ? { diaryUsedLines: this.diaryUsedLines } : {}),
        destinationId: contentDestinationId(this.activeDestinationId),
        usedHookTitles: this.getUsedCaptionTitles(deckId),
      });
    }
    let basePages: DeckPage[];
    const startingItemUsage = new Set(deckUsage.itemIds);
    const startingImageUsage = new Set(deckUsage.imageUrls);
    // A required partner appears in every list, so it is always "used" by the
    // previous one; never let that history push it behind other venues.
    for (const items of partnerItemsByName(context.itemsBySection, requiredPartnerNames).values()) {
      for (const item of items) [item.id, itemUsageKey(item), itemNameUsageKey(item)].forEach(key => startingItemUsage.delete(key));
    }
    const requiredSections = new Set<string>();
    let requiredMissing: string[] | null = null;
    setRequiredPartnerContext(requiredPartnerNames);
    try {
      basePages = buildPagesForDeck(
        deckId,
        context.itemsBySection,
        context.imageUrls,
        context.imageLibraryEntries,
        seed,
        new Set(startingItemUsage),
        new Set(startingImageUsage),
        context.coverImageUrls,
        context.hinhNenImagePools,
      );
      requiredPartners = requiredPartnerCount(deckId, sourceItems, basePages);
      requiredPartnerSlots = Math.max(1, partnerSlotCount(basePages));
      // Select alternatives through the original builders: their category/quota rules
      // remain authoritative. Never replace formatted items with generic copy.
      if (!isTextNoteDeck(deckId)) {
        const restricted = restrictRotationPhotos(sourceItems, rotationHistory, isThreadsLocalDeck(deckId));
        context.itemsBySection = restricted;
        try {
          basePages = buildPagesForDeck(deckId, restricted, context.imageUrls, context.imageLibraryEntries,
            seed, new Set(startingItemUsage), new Set(startingImageUsage), context.coverImageUrls, context.hinhNenImagePools);
        } catch (error) {
          throw new BadRequestException(`${currentDeck.navTitle}: ${error instanceof Error ? error.message : String(error)}${rotationPhotoShortage(sourceItems, rotationHistory)}`);
        }
        const exhausted = [...partnerItemsByName(restricted, requiredPartnerNames)]
          .filter(([, items]) => !items.some(item => item.imageUrl || isThreadsLocalDeck(deckId))).map(([name]) => name);
        if (exhausted.length) {
          throw new RequiredPartnersError(`${currentDeck.navTitle}: đối tác bắt buộc chưa có ảnh khác lần trước nên không thể xuất hiện ở list liền sau: ${exhausted.join(', ')}.${rotationPhotoShortage(sourceItems, rotationHistory)} Chưa lưu list.`);
        }
      }
      if (deckId === 'spotlight-v6-diary') {
        // Only warm selected images; never stall other templates on this pool.
        context.itemsBySection = this.cloneJson(context.itemsBySection);
        context.hinhNenImagePools = this.cloneJson(context.hinhNenImagePools);
        for (;;) {
          const ids = [...new Set(basePages.map(page => extractDriveFileIdFromProxyUrl(page.backgroundImage || '')).filter(Boolean))];
          const missing = listUncachedDriveFileIds(ids);
          if (missing.length && hasSyncPermit()) await warmDriveFileDiskCache(missing, {
            runTask: task => this.runtimePerformance.runDriveTask(4, task), concurrency: 3,
          });
          const failed = new Set(ids.filter(id => !hasDriveFileDiskCache(id)));
          if (!failed.size) break;
          const allowed = (url: string) => !failed.has(extractDriveFileIdFromProxyUrl(url));
          context.hinhNenImagePools.random = context.hinhNenImagePools.random.filter(allowed);
          for (const key of ['quan_an', 'cafe', 'check_in'] as const) {
            for (const item of context.itemsBySection[key] || []) {
              const urls = [item.imageUrl, ...(item.candidateImageUrls || [])].filter(allowed);
              item.imageUrl = urls[0] || '';
              item.candidateImageUrls = urls;
              if (item.diaryImageUrls) item.diaryImageUrls = item.diaryImageUrls.filter(allowed);
            }
          }
          // Each retry removes at least one failing ID. Strict builder reports the shortage.
          basePages = buildPagesForDeck(deckId, context.itemsBySection, context.imageUrls,
            context.imageLibraryEntries, seed, new Set(startingItemUsage), new Set(startingImageUsage),
            context.coverImageUrls, context.hinhNenImagePools);
        }
      }
      let rotationError: unknown;
      for (let attempt = 0; attempt < 32; attempt++) {
        try {
          let draft = buildDeckList(deckId, `caption-${generatedSuffix}`, '', '', '', basePages);
          if (SPOTLIGHT_DESIGN_DECKS.includes(deckId)) {
            const coverHook = festivalReservation?.hook || (isLegacyGoogleDocHookDeck(deckId)
              ? String(basePages.find(page => page.type === 'cover')?.title || '')
              : isPremadeHookDeck(deckId) ? this.resolvePremadeHookCoverTitle(deckId, seed) : '');
            draft.pages = applyCaptionToPages(draft.pages, { ...caption,
              coverTitle: this.sanitizeContentText(sanitizeDeckHeadline(coverHook || caption.coverTitle)) });
            // Cover selection must finish BEFORE photo history is staged. A
            // cover can itself contain a partner's source photo and belongs to
            // that partner's cycle; never reselect it after rotation.
            draft = prepareSpotlightDesign(draft, deckId, context.coverImageUrls);
          }
          const rotated = rotatePartnerList(draft,
            deckId, sourceItems, rotationHistory, `${seed}:rotation`, requiredPartners, requiredPartnerSlots);
          if (this.renderedPartnerNames(rotated.list).length < requiredPartners) throw new Error(`${currentDeck.navTitle}: chưa đủ ${requiredPartners} đối tác thực sự hiển thị để ghi XLSX. Đang thử bộ địa điểm khác.`);
          if (requiredPartnerNames.length) {
            for (const page of draft.pages) if (page.type === 'list') for (const item of page.items) if (item.sourceSectionKey) requiredSections.add(item.sourceSectionKey);
            const missing = missingRequiredPartners(this.renderedPartnerNames(rotated.list), requiredPartnerNames);
            if (missing.length) {
              if (!requiredMissing || missing.length < requiredMissing.length) requiredMissing = missing;
              throw new Error(`${currentDeck.navTitle}: chưa xếp được đối tác bắt buộc ${missing.join(', ')}. Đang thử bộ địa điểm khác.`);
            }
          }
          basePages = rotated.list.pages;
          nextRotationHistory = rotated.history;
          rotationWarnings = rotated.list.warnings || [];
          rotationDesign = { spotlightDesignRevision: rotated.list.spotlightDesignRevision, coverReview: rotated.list.coverReview };
          rotationError = undefined;
          break;
        } catch (error) {
          rotationError = error;
          // A different set of eligible venues may make the legal matching possible.
          // No history/hook/list is committed during these attempts.
          if (attempt < 31 && deckId !== 'spotlight-v6-diary') basePages = buildPagesForDeck(deckId,
            context.itemsBySection, context.imageUrls, context.imageLibraryEntries, `${seed}:alternative:${attempt + 1}`,
            new Set(startingItemUsage), new Set(startingImageUsage), context.coverImageUrls, context.hinhNenImagePools);
          else break;
        }
      }
      if (rotationError && requiredMissing) throw this.requiredPartnersFailure(currentDeck.navTitle, requiredMissing, context.itemsBySection, requiredSections);
      // Như bước chạy thử: nêu đối tác hết ảnh mới, thay vì chỉ báo thiếu ô đối tác.
      if (rotationError) throw new BadRequestException(`${currentDeck.navTitle}: ${rotationError instanceof Error ? rotationError.message : String(rotationError)}${rotationPhotoShortage(sourceItems, rotationHistory)}`);
    } finally {
      clearSpotlightV3BuildContext();
      clearRequiredPartnerContext();
    }
    const hookCoverTitle = festivalReservation
      ? festivalReservation.hook
      : greenHookReservation
      ? greenHookReservation.hook
      : darkHookReservation
      ? darkHookReservation.hook
      : persimmonHookReservation
      ? persimmonHookReservation.hook
      : deckId === 'spotlight-v6-diary' ? basePages[0].title
      : isSectionedGoogleDocHookDeck(deckId)
      ? await this.resolveDeckHookCoverTitle(deckId, seed)
      : isLegacyGoogleDocHookDeck(deckId)
        ? String((basePages.find((page) => page.type === 'cover') as CoverPage | undefined)?.title || '').trim()
      : isPremadeHookDeck(deckId)
        ? this.resolvePremadeHookCoverTitle(deckId, seed)
        : '';
    const safeCaption = {
      ...caption,
      coverTitle: this.sanitizeContentText(sanitizeDeckHeadline(hookCoverTitle || caption.coverTitle)),
      headline: this.sanitizeContentText(caption.headline),
      body: this.sanitizeContentText(sanitizeCaptionBodyForPages(caption.body, basePages)),
    };
    const finalCaption = deckId === 'budget-3n2d' || deckId === 'budget-3n2d-story' || deckId === 'budget-72h-summary'
      ? this.budget3N2DCoverCaption(safeCaption)
      : safeCaption;
    let generatedPages = isThreadsLocalDeck(deckId) || deckId === 'spotlight-v6-diary' || deckId === THREADS_TOPLIST_ID ? basePages : applyCaptionToPages(basePages, finalCaption);
    if (deckId === 'pov-3-v2') {
      generatedPages = await this.enrichPov3V2StackTaglines(generatedPages);
    }
    if (!isThreadsLocalDeck(deckId) && deckId !== 'spotlight-v6-diary') generatedPages = this.applyMainTemplateFieldStructure(currentDeck, generatedPages);
    generatedPages = inheritPageTypography(currentDeck, generatedPages, this.loadPageTextOverrides());
    const effectiveCoverTitle = isThreadsLocalDeck(deckId) || deckId === 'spotlight-v6-diary' || deckId === THREADS_TOPLIST_ID ? basePages[0].title : deckId === 'itinerary-note-timed'
      ? currentDeck.navTitle
      : deckId === ITINERARY_NOTE_DARK_ID ? currentDeck.navTitle
      : (deckId === 'summary-note' || (deckId === 'itinerary-note-2days' || deckId.startsWith('itinerary-note-threads-')))
      ? String((generatedPages.find((page) => page.type === 'list') as ListPage | undefined)?.title || '').trim()
      : deckId === 'spotlight-v6-maps'
      ? currentDeck.navTitle
      : isSpotlightV5Deck(deckId) || (deckId === 'spotlight-v6' || deckId === 'spotlight-v6-color-edit') || deckId === 'spotlight-v6-green' || deckId === 'spotlight-v6-dark' || deckId === 'spotlight-v6-persimmon'
      ? String((generatedPages.find((page) => page.type === 'cover') as CoverPage | undefined)?.title || '').trim()
      : finalCaption.coverTitle;

    const expectedNonAiPageCount = deckId === 'carousel-mau-1' ? 14 : deckId === 'one-way-story' ? 12 : deckId === 'spotlight-v4' ? 14 : isSpotlightV5Deck(deckId) ? 15 : (deckId === 'spotlight-v6' || deckId === 'spotlight-v6-color-edit') || deckId === 'spotlight-v6-maps' ? 14 : deckId === 'spotlight-v6-green' || deckId === 'spotlight-v6-dark' ? 11 : isTextNoteDeck(deckId) ? (deckId === THREADS_TOPLIST_ID ? 4 : deckId === 'summary-note' ? 1 : deckId.startsWith('itinerary-note-threads-') ? 1 : 2) : 0;
    const threadsLocalCount = deckId === THREADS_MIX_TEXT_ID ? 12 : 10;
    if (isThreadsLocalDeck(deckId) && (generatedPages.length !== 1 || generatedPages[0].type !== 'list' || generatedPages[0].items.length !== threadsLocalCount)) {
      throw new BadRequestException(`Threads ${deckId === THREADS_CAFE_ID ? 'Cà phê' : deckId === THREADS_MIX_TEXT_ID ? 'Tổng hợp chữ' : deckId === THREADS_MIX_ID ? 'Tổng hợp' : 'Quán ăn'} cần đúng 1 list gồm ${threadsLocalCount} địa điểm.`);
    }
    if (expectedNonAiPageCount && generatedPages.length !== expectedNonAiPageCount) {
      throw new BadRequestException(`Mẫu ${currentDeck.navTitle} phải có đúng ${expectedNonAiPageCount} trang, hiện có ${generatedPages.length}.`);
    }
    if (deckId === 'spotlight-v6-persimmon' && (generatedPages.length < 9 || generatedPages.length > 11)) {
      throw new BadRequestException(`Mẫu ${currentDeck.navTitle} phải có từ 9 đến 11 trang, hiện có ${generatedPages.length}.`);
    }
    const generatedList = buildDeckList(
      deckId,
      `caption-${generatedSuffix}`,
      isNonAiDeck(deckId) ? `Mẫu ${String(generatedNumber).padStart(2, '0')}` : `AI ${String(generatedNumber).padStart(2, '0')}`,
      effectiveCoverTitle,
      isNonAiDeck(deckId) ? '' : finalCaption.body,
      generatedPages,
    );
    generatedList.partnerRotationVersion = 1;
    generatedList.warnings = rotationWarnings;
    Object.assign(generatedList, rotationDesign);
    generatedList.coverTitle = effectiveCoverTitle;
    applyListPhotoPreset(generatedList, request.photoPreset);
    if (isThreadsLocalDeck(deckId)) generatedList.canvasPreset = 'tiktok-3x4';
    if (deckId === 'spotlight-v6-diary') generatedList.canvasPreset = 'tiktok-3x4';
    if (isSpotlightV5Deck(deckId)) generatedList.canvasPreset = 'tiktok-4x5';
    if ((deckId === 'spotlight-v6' || deckId === 'spotlight-v6-color-edit') || deckId === 'spotlight-v6-green' || deckId === 'spotlight-v6-dark' || deckId === 'spotlight-v6-persimmon') generatedList.canvasPreset = 'tiktok-9x16';
    if (deckId === 'spotlight-v6-maps') generatedList.canvasPreset = 'tiktok-3x4';
    if (isTextNoteDeck(deckId)) generatedList.canvasPreset = deckId === THREADS_TOPLIST_ID ? 'tiktok-4x5' : deckId.startsWith('itinerary-note-threads-') ? 'tiktok-3x4' : 'tiktok-9x16';
    generatedList.postCaption = deckId === 'spotlight-v6-persimmon'
      ? 'Đà Lạt mùa hồng 🍂\nLưu lại những địa điểm trong list để tham khảo cho chuyến đi nhé.'
      : deckId === 'spotlight-v6-maps'
      ? 'tới Đà Lạt vì'
      : isTextNoteDeck(deckId)
      ? (deckId === 'itinerary-note-timed' ? ITINERARY_NOTE_TIMED_CAPTION : deckId === ITINERARY_NOTE_DARK_ID ? ITINERARY_NOTE_DARK_CAPTION : (deckId === 'itinerary-note-2days' || deckId.startsWith('itinerary-note-threads-')) ? ITINERARY_NOTE_CAPTION : summaryNoteDefaultCaption())
      : finalCaption.headline;
    if (deckId === 'itinerary-note-threads-3n2d' || deckId === 'itinerary-note-threads-2n1d') {
      generatedList.postCaption = threadsNoteCaption(deckId, generatedNumber - 1);
    }
    if (deckId === THREADS_BUDGET_ID) {
      generatedList.postCaption = threadsBudgetCaption(generatedNumber - 1);
    }
    if (isThreadsExpense(deckId)) {
      generatedList.postCaption = threadsExpenseCaption(deckId, generatedNumber - 1);
    }
    if (deckId === THREADS_TOPLIST_ID) {
      generatedList.postCaption = THREADS_TOPLIST_CAPTION;
    }
    if (isThreadsLocalDeck(deckId)) generatedList.postCaption = deckId === THREADS_CAFE_ID ? threadsCafeCaption(generatedNumber - 1)
      : deckId === THREADS_MIX_TEXT_ID ? threadsMixTextCaption(generatedNumber - 1)
        : deckId === THREADS_MIX_ID ? threadsMixCaption(generatedNumber - 1) : threadsFoodCaption(generatedNumber - 1);
    // Không dùng chung `description`: trường đó có thể bị làm rỗng để list con
    // bám đúng cấu trúc chữ của mẫu mẹ, còn caption xuất file vẫn phải giữ mô tả.
    generatedList.captionBody = deckId === 'spotlight-v6-persimmon'
      ? ''
      : deckId === 'spotlight-v6-maps'
      ? ''
      : isThreadsLocalDeck(deckId) || isTextNoteDeck(deckId)
      ? ''
      : (this.sanitizeContentText(caption.body) || this.captionBodyFallback());
    generatedList.captionHashtags = deckId === 'spotlight-v6-persimmon'
      ? []
      : deckId === 'spotlight-v6-maps'
      ? ['#dalat', '#reviewdalat', '#dalatreview', '#dalatdidau', '#dalattrip']
      : isThreadsLocalDeck(deckId) || isTextNoteDeck(deckId) ? [] : finalCaption.hashtags;
    generatedList.templateVersion = this.templateVersionForDeck(deckId);
    if (deckId === 'spotlight-v6-diary') {
      if (generatedPages.length !== DIARY_PAGE_COUNT) throw new BadRequestException(`Spotlight Nhật ký phải có đúng ${DIARY_PAGE_COUNT} trang.`);
      generatedList.postCaption = DIARY_CAPTION;
      generatedList.captionBody = '';
      generatedList.captionHashtags = ['#dalat', '#reviewdalat', '#dalatreview', '#dalatdidau', '#dalattrip'];
    }
    if (request.automationRunId) generatedList.automationRunId = String(request.automationRunId).slice(0, 100);
    if (request.automationPosition) generatedList.automationPosition = String(request.automationPosition).slice(0, 100);
    if (festivalReservation) {
      generatedList.hookSnapshot = {
        mode: 'festival',
        sourceId: festivalReservation.sourceId,
        sourceRevision: festivalReservation.sourceRevision,
      };
    }
    if (greenHookReservation) {
      generatedList.hookSnapshot = {
        mode: 'green',
        sourceId: greenHookReservation.sourceId,
        sourceRevision: greenHookReservation.sourceRevision,
      };
    }
    if (darkHookReservation) {
      generatedList.hookSnapshot = {
        mode: 'dark',
        sourceId: darkHookReservation.sourceId,
        sourceRevision: darkHookReservation.sourceRevision,
      };
    }
    if (persimmonHookReservation) {
      generatedList.hookSnapshot = {
        mode: 'persimmon',
        sourceId: persimmonHookReservation.sourceId,
        sourceRevision: persimmonHookReservation.sourceRevision,
      };
    }
    const sanitizedGeneratedList = this.cloneJson(this.sanitizeGeneratedListText(generatedList, deckId));
    if (this.renderedPartnerNames(sanitizedGeneratedList).length < requiredPartners || partnerSlotCount(sanitizedGeneratedList.pages) < requiredPartnerSlots) throw new BadRequestException(`${currentDeck.navTitle}: đối tác bị thiếu sau khi chuẩn bị trang; chưa lưu list.`);
    const finalMissing = missingRequiredPartners(this.renderedPartnerNames(sanitizedGeneratedList), requiredPartnerNames);
    if (finalMissing.length) throw new RequiredPartnersError(`${currentDeck.navTitle}: đối tác bắt buộc bị mất sau khi chuẩn bị trang: ${finalMissing.join(', ')}. Chưa lưu list.`);
    await this.assertGeneratedImageCache(sanitizedGeneratedList.pages, deckId);
    const previousRotation = this.partnerRotation[deckId];
    this.partnerRotation[deckId] = nextRotationHistory;

    if (deckId === 'spotlight-v6-diary') {
      const previousLines = this.diaryUsedLines;
      const nextLines = this.cloneJson(previousLines);
      for (const page of generatedPages) {
        if (page.type !== 'list' || !page.items.length) continue;
        const key = diaryIdentity(page.items[0].rawName || page.items[0].name);
        const source = Object.values(context.itemsBySection).flat().find(item => item.id === page.items[0].id);
        const choices = source ? diaryItemLines(source) : [];
        const used = (nextLines[key] || []).filter(line => choices.includes(line));
        nextLines[key] = [...(choices.every(line => used.includes(line)) ? [] : used), page.title];
      }
      this.diaryUsedLines = nextLines;
      this.generatedListsByDeckId.set(deckId, [...existing, sanitizedGeneratedList]);
      try { this.persistGeneratedLists(); } catch (error) {
        if (previousRotation) this.partnerRotation[deckId] = previousRotation; else delete this.partnerRotation[deckId];
        this.diaryUsedLines = previousLines;
        this.generatedListsByDeckId.set(deckId, existing);
        throw error;
      }
    } else {
      this.generatedListsByDeckId.set(deckId, [...existing, sanitizedGeneratedList]);
      try { this.persistGeneratedLists(); } catch (error) {
        if (previousRotation) this.partnerRotation[deckId] = previousRotation; else delete this.partnerRotation[deckId];
        this.generatedListsByDeckId.set(deckId, existing);
        throw error;
      }
      this.markUsedInDeck(sanitizedGeneratedList.pages);
      // Rotation is authoritative and already committed atomically with the list.
      // A failure in the legacy, advisory inventory must not turn a saved list into
      // a failed request (which would invite an unsafe retry and duplicate list).
      try { this.persistInventory(); } catch (error) { console.warn('[inventory] List đã lưu; chưa ghi được thống kê cũ:', error); }
    }
    // The list and photo history have committed. A secondary hook-store failure
    // must not report this saved list as failed and invite duplicate retries.
    const hookWarnings: string[] = [];
    for (const commit of [
      () => this.festivalHookSources.commit(festivalReservation),
      () => this.greenHookSource.commit(greenHookReservation),
      () => this.darkHookSource.commit(darkHookReservation),
      () => this.persimmonHookSource.commit(persimmonHookReservation),
    ]) {
      try { commit(); } catch (error) {
        console.warn('[hooks] List đã lưu; chưa ghi được vòng hook:', error);
        hookWarnings.push('List đã lưu thành công nhưng chưa ghi được vòng hook. Kiểm tra quyền ghi dữ liệu trước lượt tạo tiếp theo.');
      }
    }
    if (hookWarnings.length) {
      sanitizedGeneratedList.warnings = [...new Set([...(sanitizedGeneratedList.warnings || []), ...hookWarnings])];
      try { this.persistGeneratedLists(); } catch (error) { console.warn('[hooks] Chưa lưu được cảnh báo của list:', error); }
    }

    return { deckId, listId: sanitizedGeneratedList.id, navTitle: sanitizedGeneratedList.navTitle, title: sanitizedGeneratedList.title, warnings: sanitizedGeneratedList.warnings };
    } catch (error) {
      this.festivalHookSources.rollback(festivalReservation);
      this.greenHookSource.rollback(greenHookReservation);
      this.darkHookSource.rollback(darkHookReservation);
      this.persimmonHookSource.rollback(persimmonHookReservation);
      if (deckId === 'spotlight-v6-diary' && error instanceof Error && error.message.startsWith('Spotlight Nhật ký')) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  // ─── Batch list generation ────────────────────────────────────────────────

  /** Gọi DeepSeek chat completions với 1 lần retry nếu fetch lỗi mạng (không retry khi timeout/abort). */
  private async fetchDeepSeekChat(_apiKey: string, body: Record<string, unknown>, _timeoutMs = 30_000): Promise<Response> {
    return aiProvider.chat(body);
  }

  private async prepareV4CaptionDeck(): Promise<GuideDeck> {
    await this.prepareWorkbookForDataset(false);
    const context = await this.buildLocallyVerifiedGenerationContext();
    const deck = context.decks.find(entry => entry.id === 'spotlight-v4');
    try {
      // Rebuild from verified local candidates, never from a stale/empty preview.
      // Fresh sets keep this preflight from consuming the user's rotation.
      const pages = await withLocalDataOnly(async () => buildPagesForDeck(
        'spotlight-v4', context.itemsBySection, context.imageUrls, context.imageLibraryEntries,
        'spotlight-v4-preflight', new Set(), new Set(), context.coverImageUrls, context.hinhNenImagePools,
      ));
      const list = buildDeckList('spotlight-v4', 'preflight', 'Kiểm tra V4', 'Spotlight V4', '', pages);
      return { ...(deck || { id: 'spotlight-v4', navTitle: 'Spotlight V4', title: 'Spotlight V4', description: '' }), lists: [list] };
    } catch (error) {
      throw new BadRequestException(`Không thể tạo Spotlight V4: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async generateBatchLists(request: GenerateBatchListsRequest): Promise<GenerateBatchListsResponse> {
    this.assertTemplateAllowed(request.deckId);
    validatePhotoPreset(request.photoPreset, request.deckId);
    if (LEGACY_COLOR_DECKS[String(request.deckId)]) throw new BadRequestException('Chọn mẫu V5/V6 và bảng màu thay cho mẫu Color Edit riêng.');
    const requiredPartners = this.validateRequiredPartners(request.deckId, request.requiredPartners);
    return aiProvider.run(() => this.generateBatchListsWithAi({ ...request, requiredPartners }));
  }

  private async generateBatchListsWithAi(request: GenerateBatchListsRequest): Promise<GenerateBatchListsResponse> {
    const requestId = String(request.requestId || '').trim().slice(0, 100);
    if (requestId) {
      const existingRequest = this.batchGenerationRequests.get(requestId);
      if (existingRequest) return existingRequest;
      const task = this.generateBatchListsOnce(request);
      this.batchGenerationRequests.set(requestId, task);
      try {
        return await task;
      } finally {
        setTimeout(() => this.batchGenerationRequests.delete(requestId), 10 * 60 * 1000).unref?.();
      }
    }
    return this.generateBatchListsOnce(request);
  }

  private async generateBatchListsOnce(request: GenerateBatchListsRequest): Promise<GenerateBatchListsResponse> {
    this.assertTemplateAllowed(request.deckId);
    const deckId = String(request.deckId ?? '').trim();
    if (deckId !== THREADS_TOPLIST_ID && deckId !== 'itinerary-note-timed' && !deckId.startsWith('itinerary-note-threads-')) {
      this.assertDriveCacheReady();
    }
    if (deckId === 'spotlight-partner') {
      throw new BadRequestException('Mau Spotlight Doi tac tao list bang cach chon doi tac, khong tao batch tu caption chung.');
    }
    if (!deckId) throw new BadRequestException('Thiếu deckId để tạo batch list.');

    const requestedCount = Number(request.count ?? 5);
    const count = Number.isFinite(requestedCount)
      ? Math.min(Math.max(Math.trunc(requestedCount), 1), 10)
      : 5;

    if (isNonAiDeck(deckId)) {
      // Check themed hook availability once before attempting the entire batch.
      const themedHook = deckId === 'spotlight-v6-green' ? this.greenHookSource
        : deckId === 'spotlight-v6-dark' ? this.darkHookSource
        : deckId === 'spotlight-v6-persimmon' ? this.persimmonHookSource : null;
      if (themedHook) await withLocalDataOnly(() => themedHook.ensureReady(''));
      const results: GenerateBatchListsResponse['lists'] = [];
      let failCount = 0;
      const errors: Array<{ index: number; tone: string; message: string }> = [];
      for (let i = 0; i < count; i += 1) {
        try {
          const generated = await this.generateDeckFromCaption({
            deckId,
            tone: 'lich_trinh_huu_ich',
            caption: { coverTitle: '', headline: '', body: '', hashtags: [] },
            photoPreset: request.photoPreset,
            hookSelection: request.hookSelection,
            automationRunId: request.automationRunId,
            requiredPartners: request.requiredPartners,
            automationPosition: `${deckId}:${i + 1}`,
          });
          results.push({ listId: generated.listId, navTitle: generated.navTitle, tone: 'không AI', warnings: generated.warnings });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[batch] Lỗi tạo ${deckId} ${i + 1}/${count}:`, message);
          errors.push({ index: i + 1, tone: 'lich_trinh_huu_ich', message });
          failCount += 1;
          if (error instanceof RequiredPartnersError) {
            const remaining = count - i - 1;
            failCount += remaining;
            if (remaining) errors.push({ index: i + 2, tone: 'lich_trinh_huu_ich', message: `Dừng ${remaining} list còn lại vì không xếp được đối tác bắt buộc. Hãy bỏ bớt hoặc chọn đối tác khác.` });
            break;
          }
        }
      }
      return { deckId, lists: results, successCount: results.length, failCount, errors };
    }

    const apiKey = ''; // Credentials are resolved only by the AI adapter.

    const v4CaptionDeck = deckId === 'spotlight-v4' ? await this.prepareV4CaptionDeck() : null;
    const toneRotation: DeepSeekCaptionResponse['tone'][] = [
      'gen_z',
      'tinh_te',
      'review_chan_that',
      'ban_hang_nhe',
      'lich_trinh_huu_ich',
    ];

    const results: GenerateBatchListsResponse['lists'] = [];
    let failCount = 0;
    const errors: Array<{ index: number; tone: string; message: string }> = [];

    // Get existing generated lists to know which tones have been used
    this.ensureGeneratedListsLoaded();
    const existingLists = this.generatedListsByDeckId.get(deckId) ?? [];
    const startToneIndex = existingLists.length % toneRotation.length;

    for (let i = 0; i < count; i++) {
      const tone = toneRotation[(startToneIndex + i) % toneRotation.length];
      try {
        const deck = v4CaptionDeck || (await this.getDataset()).decks.find((d) => d.id === deckId);
        if (!deck) throw new NotFoundException(`Không tìm thấy deck: ${deckId}`);

        const deckList = deck.lists[0];
        if (!deckList) throw new NotFoundException('Deck không có list nào.');

        const usedTitles = this.getUsedCaptionTitles(deckId);
        const current = { coverTitle: '', headline: '', body: '', hashtags: [] as string[] };
        const prompt = this.buildDeepSeekPrompt(deck, deckList, tone, 'full', current, usedTitles);

        const response = await this.fetchDeepSeekChat(apiKey, {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'Bạn là content creator du lịch TikTok. Chỉ trả về đúng JSON object hợp lệ, không thêm markdown, không giải thích.' },
            { role: 'user', content: prompt },
          ],
          temperature: 1.1,
          max_tokens: 900,
          stream: false,
        });

        if (!response.ok) {
          const responseBody = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 300);
          const message = `AI HTTP ${response.status}${responseBody ? `: ${responseBody}` : ''}`;
          console.warn(`[batch] ${message} cho tone ${tone}`);
          errors.push({ index: i + 1, tone, message });
          failCount++;
          continue;
        }

        const responseText = await response.text();
        let payload: any;
        try { payload = JSON.parse(responseText); } catch {
          errors.push({ index: i + 1, tone, message: 'AI trả dữ liệu không phải JSON hợp lệ.' });
          failCount++;
          continue;
        }

        const content = String(payload?.choices?.[0]?.message?.content ?? '').trim();
        if (!content) {
          errors.push({ index: i + 1, tone, message: 'AI không trả nội dung.' });
          failCount++;
          continue;
        }

        const parsed = this.parseDeepSeekJson(content);
        const caption = this.normalizeCaptionPayload(
          parsed,
          { coverTitle: '', headline: '', body: '', hashtags: [] },
          'full',
          tone,
          deckId,
          this.collectCaptionForbiddenNames(deckList),
        );

        if (!isThreadsLocalDeck(deckId) && !isGoogleDocHookDeck(deckId) && !isPremadeHookDeck(deckId) && !isSpotlightV5Deck(deckId) && !isTextNoteDeck(deckId) && !caption.coverTitle) {
          errors.push({ index: i + 1, tone, message: 'Phản hồi AI thiếu tiêu đề cover.' });
          failCount++;
          continue;
        }

        const generated = await this.generateDeckFromCaption({
          deckId,
          tone,
          caption: {
            coverTitle: caption.coverTitle,
            headline: caption.headline,
            body: caption.body,
            hashtags: caption.hashtags,
          },
          photoPreset: request.photoPreset,
          hookSelection: request.hookSelection,
          automationRunId: request.automationRunId,
          requiredPartners: request.requiredPartners,
          automationPosition: `${deckId}:${i + 1}`,
        });

        results.push({ listId: generated.listId, navTitle: generated.navTitle, tone, warnings: generated.warnings });
      } catch (error: any) {
        const cause = error?.cause ? (error.cause.code || error.cause.message || String(error.cause)) : '';
        const message = (error instanceof Error ? error.message : String(error)) + (cause ? ` (${cause})` : '');
        console.warn(`[batch] Lỗi tạo list ${i + 1}/${count} (tone=${tone}):`, message);
        errors.push({ index: i + 1, tone, message });
        failCount++;
        if (error instanceof AiError && error.fatal) {
          const remaining = count - i - 1;
          failCount += remaining;
          if (remaining) errors.push({ index: i + 2, tone, message: `Dừng ${remaining} list còn lại do cấu hình/quota AI. Không tự đổi nhà cung cấp.` });
          break;
        }
        if (error instanceof RequiredPartnersError) {
          const remaining = count - i - 1;
          failCount += remaining;
          if (remaining) errors.push({ index: i + 2, tone, message: `Dừng ${remaining} list còn lại vì không xếp được đối tác bắt buộc. Hãy bỏ bớt hoặc chọn đối tác khác.` });
          break;
        }
      }
    }

    return {
      deckId,
      lists: results,
      successCount: results.length,
      failCount,
      errors,
    };
  }

  // ─── Partner Spotlight ────────────────────────────────────────────────────

  async getPartnerList(): Promise<Array<{ id: string; name: string; section: string; address: string; imageCount: number }>> {
    await this.prepareWorkbookForDataset(false);
    const context = this.buildDatasetContext();
    const allItems = Object.values(context.itemsBySection).flat();
    return allItems
      // Đối tác chưa lấy được ảnh Drive riêng (chưa 'manual') tạm ẩn khỏi danh sách chọn, tránh
      // tạo spotlight với ảnh sai/chưa có; đối tác sẽ tự xuất hiện lại khi ảnh lấy được ở lần sync sau.
      .filter((item) => item.isPartner && item.imageSource === 'manual')
      .map((item) => ({
        id: item.id,
        name: item.name,
        section: item.sectionKey,
        address: item.address,
        imageCount: (item.candidateImageUrls || []).length + (item.imageUrl && !(item.candidateImageUrls || []).includes(item.imageUrl) ? 1 : 0),
      }));
  }

  /**
   * Đối tác nào hiển thị được trong mẫu: chạy thử chính builder của mẫu với từng
   * đối tác là bắt buộc (vài seed, lịch sử trống). Không lưu list, không tiêu hao
   * vòng ảnh/hook; kiểm tra lúc tạo list vẫn là chốt cuối (ảnh liền trước, số ô).
   */
  async getPartnerEligibility(deckIdRaw: unknown): Promise<PartnerEligibilityResponse> {
    const deckId = String(deckIdRaw ?? '').trim();
    this.assertTemplateAllowed(deckId);
    if (findLocalTemplate(deckId) || deckId === 'spotlight-partner') throw new BadRequestException('Mẫu này không hỗ trợ chọn đối tác bắt buộc.');
    await this.prepareWorkbookForDataset(false);
    const textOnly = isTextNoteDeck(deckId) || isThreadsLocalDeck(deckId);
    const context = await this.buildLocallyVerifiedGenerationContext(!textOnly, deckId === CHERRY_ID);
    const partners = await this.getPartnerList();
    const signature = crypto.createHash('sha1').update(JSON.stringify([
      partners.map(p => [p.name, p.section, p.imageCount]),
      Object.values(context.itemsBySection).flat().map(item => [item.id, item.name, item.isPartner, item.imageUrl, (item.candidateImageUrls || []).length,
        item.theme, item.mapImageUrl, Boolean(item.diaryDescriptionRaw), item.address, item.type]),
    ])).digest('hex');
    const key = `${this.activeDestinationId}:${deckId}:${signature}`;
    const cached = this.partnerEligibilityCache.get(key);
    if (cached) return cached;
    for (const old of [...this.partnerEligibilityCache.keys()]) if (old.startsWith(`${this.activeDestinationId}:${deckId}:`)) this.partnerEligibilityCache.delete(old);
    const task = this.computePartnerEligibility(deckId, context, partners.map(p => p.name));
    this.partnerEligibilityCache.set(key, task);
    task.catch(() => this.partnerEligibilityCache.delete(key));
    return task;
  }

  /**
   * Chạy thử khô (không lưu list, vòng ảnh hay hook): mẫu tạo liên tiếp được bao nhiêu list với dữ liệu,
   * đối tác và vòng xoay ảnh đối tác hiện tại của nguồn đang mở. Dùng để cảnh báo trước khi lưu lịch tự động;
   * kết quả là ước lượng (lượt thật còn thử thêm bộ địa điểm khác) nên chỉ cảnh báo, không chặn.
   */
  async checkTemplatesCapacity(entries: Array<{ deckId: string; count: number; requiredPartners?: string[] }>): Promise<TemplateCapacityResult[]> {
    // Dựng dữ liệu nguồn một lần cho cả lịch (trước đây mỗi mẫu dựng lại, 29 mẫu mất hơn 1 phút).
    await this.prepareWorkbookForDataset(false);
    const contexts = new Map<boolean, Promise<DatasetBuildContext>>();
    const contextFor = (verifyImages: boolean) => {
      if (!contexts.has(verifyImages)) contexts.set(verifyImages, this.buildLocallyVerifiedGenerationContext(verifyImages));
      return contexts.get(verifyImages)!;
    };
    const results: TemplateCapacityResult[] = [];
    for (const entry of entries) {
      try { results.push(await this.checkTemplateCapacity(entry.deckId, entry.count, entry.requiredPartners || [], contextFor)); }
      catch (error) { results.push({ deckId: entry.deckId, requested: entry.count, possible: 0, checked: true, reason: error instanceof Error ? error.message : String(error) }); }
    }
    return results;
  }

  async checkTemplateCapacity(deckIdRaw: unknown, countRaw: unknown, requiredPartnerNamesRaw: unknown = [],
    contextFor?: (verifyImages: boolean) => Promise<DatasetBuildContext>): Promise<TemplateCapacityResult> {
    const deckId = String(deckIdRaw ?? '').trim();
    const requested = Math.max(1, Math.min(10, Math.trunc(Number(countRaw)) || 1));
    this.assertTemplateAllowed(deckId);
    this.ensureGeneratedListsLoaded();
    // Mẫu riêng, Hoa anh đào và Spotlight Đối tác có luồng tạo riêng: không ước lượng.
    if (findLocalTemplate(deckId) || deckId === CHERRY_ID || deckId === 'spotlight-partner') return { deckId, requested, possible: requested, checked: false };
    const requiredPartnerNames = normalizeRequiredPartners(requiredPartnerNamesRaw);
    const verifyImages = !isTextNoteDeck(deckId) && !isThreadsLocalDeck(deckId);
    if (!contextFor) await this.prepareWorkbookForDataset(false);
    const shared = contextFor ? await contextFor(verifyImages) : await this.buildLocallyVerifiedGenerationContext(verifyImages);
    // Ngữ cảnh có thể dùng chung giữa các mẫu: chép phần builder có thể đọc/ghi.
    const context = { ...shared, hinhNenImagePools: this.cloneJson(shared.hinhNenImagePools) };
    const currentDeck = context.decks.find((deck) => deck.id === deckId);
    const navTitle = currentDeck?.navTitle || deckId;
    const sourceItems = this.cloneJson(context.itemsBySection);
    const existing = this.generatedListsByDeckId.get(deckId) ?? [];
    const historicalLists = this.applyPageTextOverrides(deckId, this.cloneJson(existing), this.loadPageTextOverrides());
    let history = bootstrapPartnerHistory(historicalLists, deckId, Object.values(sourceItems).flat(), this.partnerRotation[deckId]);
    const destinationId = contentDestinationId(this.activeDestinationId);
    // Như computePartnerEligibility: đặt rồi trả lại ngữ cảnh dựng một cách đồng bộ để không ảnh hưởng lượt tạo đang chạy.
    // Như lượt thật: list mới tránh địa điểm/ảnh đã dùng ở các list trước của mẫu (kể cả list vừa chạy thử).
    const simulated: GuideDeckList[] = [];
    let usedItems = new Set<string>(), usedImages = new Set<string>();
    const refreshUsage = () => {
      const usage = this.deckUsageScope(deckId, [...(currentDeck?.lists || []), ...simulated], [...existing, ...simulated]);
      usedItems = new Set(usage.itemIds);
      usedImages = new Set(usage.imageUrls);
      for (const items of partnerItemsByName(context.itemsBySection, requiredPartnerNames).values()) {
        for (const item of items) [item.id, itemUsageKey(item), itemNameUsageKey(item)].forEach(key => usedItems.delete(key));
      }
    };
    const build = (items: WorkbookItemsBySection, seed: string): DeckPage[] => {
      const previousHooks = { ...getSpotlightV3BuildContext() };
      setSpotlightV3BuildContext({ hooks: ['Kiểm tra mẫu'], destinationId, usedHookTitles: [], diaryUsedLines: this.diaryUsedLines });
      try {
        return withRequiredPartners(requiredPartnerNames, () => buildPagesForDeck(deckId, items, context.imageUrls, context.imageLibraryEntries, seed,
          new Set(usedItems), new Set(usedImages), context.coverImageUrls, context.hinhNenImagePools), { dryRun: true });
      } finally { setSpotlightV3BuildContext(previousHooks); }
    };
    let lastError = '';
    for (let index = 0; index < requested; index++) {
      refreshUsage();
      let built = false;
      for (let attempt = 0; attempt < 6 && !built; attempt++) {
        const seed = `capacity:${deckId}:${index}:${attempt}`;
        try {
          const unrestricted = build(sourceItems, seed);
          const requiredPartners = requiredPartnerCount(deckId, sourceItems, unrestricted);
          const requiredSlots = Math.max(1, partnerSlotCount(unrestricted));
          const items = isTextNoteDeck(deckId) ? sourceItems : restrictRotationPhotos(sourceItems, history, isThreadsLocalDeck(deckId));
          const pages = isTextNoteDeck(deckId) ? unrestricted : build(items, seed);
          const rotated = rotatePartnerList(buildDeckList(deckId, `caption-capacity-${index + 1}`, '', '', '', pages),
            deckId, sourceItems, history, `${seed}:rotation`, requiredPartners, requiredSlots);
          history = rotated.history;
          simulated.push(rotated.list);
          built = true;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }
        // Giữ server phản hồi (health, giao diện) trong lúc kiểm tra nhiều mẫu.
        await new Promise((resolve) => setImmediate(resolve));
      }
      if (!built) {
        return { deckId, navTitle, requested, possible: index, checked: true,
          reason: `${lastError}${rotationPhotoShortage(sourceItems, history)}`.replace(/\s+/g, ' ').trim().slice(0, 600) };
      }
    }
    return { deckId, navTitle, requested, possible: requested, checked: true };
  }

  private async computePartnerEligibility(deckId: string, context: DatasetBuildContext, partnerNames: string[]): Promise<PartnerEligibilityResponse> {
    const items = this.cloneJson(context.itemsBySection);
    const names = [...new Map(partnerNames.map(name => [requiredPartnerKey(name), name] as const)).values()];
    const destinationId = contentDestinationId(this.activeDestinationId);
    const seenSections = new Set<string>();
    let buildError = '';
    let anyBuilt = false;
    // A dry run sets both build contexts synchronously and restores them, so a
    // generation awaiting I/O between its own builds keeps its selection/hooks.
    const dryRun = (name: string, seed: string): DeckPage[] => {
      const previousHooks = { ...getSpotlightV3BuildContext() };
      setSpotlightV3BuildContext({ hooks: ['Kiểm tra mẫu'], destinationId, usedHookTitles: [], diaryUsedLines: this.diaryUsedLines });
      try {
        return withRequiredPartners([name], () => deckId === CHERRY_ID
          ? buildCherryBlossom({ items, pools: context.hinhNenImagePools, hooks: ['Kiểm tra mẫu'], history: {}, seed }).list.pages
          : buildPagesForDeck(deckId, items, context.imageUrls, context.imageLibraryEntries, seed, new Set(), new Set(), context.coverImageUrls, context.hinhNenImagePools), { dryRun: true });
      } finally { setSpotlightV3BuildContext(previousHooks); }
    };
    // A template that cannot be built even without a selection (missing shared
    // data) is reported once instead of retrying every partner.
    let baseline = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      try { dryRun('', `eligibility:${deckId}:baseline:${attempt}`); baseline = ''; break; }
      catch (error) { baseline = error instanceof Error ? error.message : String(error); }
    }
    if (baseline) {
      return { deckId, error: baseline, partners: names.map(name => ({ name, sections: [...new Set((partnerItemsByName(items, [name]).get(name) || []).map(item => item.sectionKey))],
        eligible: false, reason: 'Mẫu chưa tạo được với dữ liệu hiện tại' })) };
    }
    const results: PartnerEligibilityResponse['partners'] = [];
    for (const name of names) {
      const sources = partnerItemsByName(items, [name]).get(name) || [];
      const sections = [...new Set(sources.map(item => item.sectionKey))];
      if (!sources.length) {
        results.push({ name, sections, eligible: false, reason: 'Chưa có ảnh hợp lệ trên máy hoặc thiếu dữ liệu mẫu này cần' });
        continue;
      }
      let eligible = false;
      for (let attempt = 0; attempt < 4 && !eligible; attempt++) {
        try {
          const pages = dryRun(name, `eligibility:${deckId}:${attempt}`);
          anyBuilt = true;
          for (const page of pages) for (const item of page.type === 'list' ? page.items : []) {
            if (item.sourceSectionKey) seenSections.add(item.sourceSectionKey);
            if (item.isPartner && requiredPartnerKey(item.rawName || item.name) === requiredPartnerKey(name)) eligible = true;
          }
        } catch (error) { buildError = error instanceof Error ? error.message : String(error); }
      }
      results.push({ name, sections, eligible });
      // Keep the server responsive (health checks, UI) during a long first check.
      await new Promise(resolve => setImmediate(resolve));
    }
    if (!anyBuilt) return { deckId, error: buildError || 'Mẫu chưa dựng được với dữ liệu hiện tại.', partners: results.map(entry => ({ ...entry, eligible: false, reason: entry.reason || 'Mẫu chưa dựng được với dữ liệu hiện tại' })) };
    for (const entry of results) {
      if (entry.eligible || entry.reason) continue;
      const sources = partnerItemsByName(items, [entry.name]).get(entry.name) || [];
      const theme = normalizeText(sources.map(item => item.theme).join(' '));
      const labels = [...new Set(sources.map(item => item.sectionTitle || item.sectionKey))].join('/');
      entry.reason = !entry.sections.some(section => seenSections.has(section)) ? `Mẫu này không có ô nhóm ${labels}`
        : deckId === 'spotlight-v6-green' && !theme.includes('mang_xanh') ? 'Không thuộc chủ đề Mảng xanh'
        : deckId === 'spotlight-v6-dark' && !theme.includes('tone_den') ? 'Không thuộc chủ đề Tone đen'
        : deckId === 'spotlight-v6-maps' && !sources.some(item => item.mapImageUrl) ? 'Chưa có ảnh Google Maps'
        : deckId === 'spotlight-v6-diary' && !sources.some(item => String(item.diaryDescriptionRaw || '').trim()) ? 'Chưa có dòng mô tả cho Nhật ký'
        : !sources.some(item => String(item.address || '').trim()) ? 'Thiếu địa chỉ'
        : sources.every(item => item.sectionKey === 'quan_an' && isGrillOrHotpotItem(item)) ? 'Quán nướng/lẩu không hợp ô quán ăn của mẫu này'
        : 'Không đạt điều kiện hiển thị riêng của mẫu này';
    }
    return { deckId, partners: results };
  }

  async generatePartnerSpotlight(request: GeneratePartnerSpotlightRequest): Promise<GeneratePartnerSpotlightResponse> {
    this.assertTemplateAllowed('spotlight-partner');
    validatePhotoPreset(request.photoPreset, 'spotlight-partner');
    this.assertDriveCacheReady();
    const partnerId = String(request.partnerId ?? '').trim();
    const partnerName = String(request.partnerName ?? '').trim();
    if (!partnerId && !partnerName) {
      throw new BadRequestException('Cần có partnerId hoặc partnerName để sinh mẫu spotlight đối tác.');
    }

    await this.prepareWorkbookForDataset(false);
    const context = await this.buildLocallyVerifiedGenerationContext();

    // Find the partner item
    const allItems = Object.values(context.itemsBySection).flat();
    const partnerItem = allItems.find((item) =>
      item.isPartner && (
        item.id === partnerId ||
        normalizeText(item.name) === normalizeText(partnerName) ||
        item.name === partnerName
      ),
    );
    if (!partnerItem) {
      throw new NotFoundException(`Không tìm thấy đối tác: ${partnerName || partnerId}`);
    }
    if (partnerItem.imageSource !== 'manual') {
      throw new BadRequestException(`Đối tác "${partnerItem.name}" chưa lấy được ảnh Drive riêng, chưa thể tạo spotlight. Sẽ dùng được sau khi ảnh cập nhật lại.`);
    }

    const deckId = 'spotlight-partner';
    const timestamp = Date.now().toString(36).slice(-4);
    const listSuffix = `partner-${normalizeText(partnerItem.name).slice(0, 20)}-${timestamp}`;

    this.ensureGeneratedListsLoaded();
    this.ensureInventoryLoaded();
    const deckUsage = this.createUsageScope();
    const existing = this.generatedListsByDeckId.get(deckId) ?? [];
    const normalizedPartnerName = normalizeText(partnerItem.name);
    const partnerVariantIndex = existing.filter((list) => {
      const coverPage = list.pages?.[0];
      const coverDescription = coverPage && 'description' in coverPage ? coverPage.description : '';
      return normalizeText(list.navTitle) === normalizedPartnerName
        || normalizeText(list.title).includes(normalizedPartnerName)
        || normalizeText(list.coverTitle).includes(normalizedPartnerName)
        || normalizeText(coverPage?.subtitle).includes(normalizedPartnerName)
        || normalizeText(coverDescription).includes(normalizedPartnerName);
    }).length;

    const pools = this.createDeckBuildPoolsFromSection(context.itemsBySection);
    const pages = buildSpotlightPartnerPages(
      partnerItem,
      pools,
      context.imageUrls,
      context.imageLibraryEntries,
      `spotlight-partner:${partnerItem.id}:${timestamp}:variant:${partnerVariantIndex}`,
      deckUsage.itemIds,
      deckUsage.imageUrls,
      context.coverImageUrls,
    );

    let generatedList = buildDeckList(
      deckId,
      listSuffix,
      partnerItem.name,
      partnerItem.name.toUpperCase(),
      partnerItem.address || partnerItem.type || '',
      pages,
    );
    const historicalLists = this.applyPageTextOverrides(deckId, this.cloneJson(existing), this.loadPageTextOverrides());
    const rotationHistory = bootstrapPartnerHistory(historicalLists, deckId, allItems, this.partnerRotation[deckId]);
    const rotated = rotatePartnerList(generatedList, deckId, context.itemsBySection, rotationHistory, listSuffix);
    generatedList = rotated.list;
    applyListPhotoPreset(generatedList, request.photoPreset);
    generatedList.coverTitle = partnerItem.name.toUpperCase().slice(0, 35);
    generatedList.postCaption = SPOTLIGHT_PARTNER_POST_CAPTION;
    generatedList.captionBody = SPOTLIGHT_PARTNER_CAPTION_BODY;
    generatedList.description = '';
    generatedList.captionHashtags = buildCaptionHashtags([], 'lich_trinh_huu_ich', this.activeDestinationId, 'spotlight-partner');
    generatedList.templateVersion = SPOTLIGHT_PARTNER_TEMPLATE_VERSION;
    const parentDeck = this.ensureWorkbookDerivedContext().baseDecks.find(deck => deck.id === deckId);
    if (parentDeck) generatedList.pages = inheritPageTypography(parentDeck, generatedList.pages, this.loadPageTextOverrides());
    if (!this.renderedPartnerNames(generatedList).length) throw new BadRequestException(`Spotlight Đối tác: không có đối tác hiển thị hợp lệ; chưa lưu list.`);
    await this.assertGeneratedImageCache(generatedList.pages, deckId);

    this.generatedListsByDeckId.set(deckId, [...existing, generatedList]);
    const previousRotation = this.partnerRotation[deckId];
    this.partnerRotation[deckId] = rotated.history;
    try { this.persistGeneratedLists(); } catch (error) {
      if (previousRotation) this.partnerRotation[deckId] = previousRotation; else delete this.partnerRotation[deckId];
      this.generatedListsByDeckId.set(deckId, existing);
      throw error;
    }
    this.markUsedInDeck(pages);
    try { this.persistInventory(); } catch (error) { console.warn('[inventory] List đã lưu; chưa ghi được thống kê cũ:', error); }

    return {
      deckId,
      listId: generatedList.id,
      navTitle: generatedList.navTitle,
      title: generatedList.title,
      partnerName: partnerItem.name,
      pageCount: pages.length,
      warnings: generatedList.warnings,
    };
  }

  private createDeckBuildPoolsFromSection(itemsBySection: WorkbookItemsBySection): any {
    return createDeckBuildPools(itemsBySection);
  }

  // ─── Private: dataset context ─────────────────────────────────────────────

  /**
   * options.immediate = true: xoá cache ngay (buộc lần đọc kế tiếp phải build lại đồng bộ trước khi
   * trả kết quả). Chỉ dùng cho hành động người dùng chủ động chờ dữ liệu mới (bấm "Làm mới", đổi điểm đến).
   *
   * options.immediate = false (mặc định):
   * - Session sticky (mặc định): bỏ qua — giữ dataset đã build lúc mở tool, không rebuild khi đang tạo/xuất.
   * - Không sticky: stale-while-revalidate (phục vụ bản cũ + build nền).
   */
  private invalidateDatasetCache(options: { immediate?: boolean } = {}): void {
    if (options.immediate) {
      this.workbookDerivedCacheFresh = false;
      this.workbookDerivedCache = null;
      this.workbookDerivedCacheTime = 0;
      this.driveAccessCacheLoadedFor = null;
      if (this.datasetRebuildTimer) {
        clearTimeout(this.datasetRebuildTimer);
        this.datasetRebuildTimer = null;
      }
      return;
    }
    if (this.SESSION_STICKY_DATASET) {
      // Sync nền / cập nhật Drive manifest không được làm gián đoạn tạo list + xuất file.
      return;
    }
    this.workbookDerivedCacheFresh = false;
    this.scheduleBackgroundDerivedRebuild();
  }

  private scheduleBackgroundDerivedRebuild(): void {
    if (this.datasetRebuildTimer || !this.workbookDerivedCache) return;
    this.datasetRebuildTimer = setTimeout(() => {
      this.datasetRebuildTimer = null;
      try {
        this.rebuildWorkbookDerivedCacheNow();
        console.log('[cache] Đã build lại dữ liệu Sheet ở nền (không chặn request người dùng).');
      } catch (error) {
        console.error('[cache] Build dữ liệu Sheet ở nền thất bại, sẽ thử lại ở request tiếp theo:', error);
      }
    }, this.DATASET_REBUILD_DEBOUNCE_MS);
    this.datasetRebuildTimer.unref?.();
  }

  private ensureWorkbookDerivedContext(): WorkbookDerivedContext {
    const now = Date.now();
    if (this.workbookDerivedCache) {
      // Session sticky: giữ nguyên bản đã build lúc mở tool cho mọi create/export trong phiên.
      if (this.SESSION_STICKY_DATASET) {
        console.log('[cache] dataset context HIT');
        return this.workbookDerivedCache;
      }
      const isFresh = this.workbookDerivedCacheFresh
        && (now - this.workbookDerivedCacheTime) < this.DATASET_CACHE_TTL_MS;
      if (isFresh) {
        console.log('[cache] dataset context HIT');
        return this.workbookDerivedCache;
      }
      // Còn bản cũ (hết TTL hoặc soft-invalidate) -> trả ngay, build lại ở nền.
      console.log('[cache] dataset context STALE — dùng bản cũ, đang build lại ở nền');
      this.scheduleBackgroundDerivedRebuild();
      return this.workbookDerivedCache;
    }

    return this.rebuildWorkbookDerivedCacheNow();
  }

  private rebuildWorkbookDerivedCacheNow(): WorkbookDerivedContext {
    if (this.workbookDerivedCacheBuilding) {
      throw new Error('Không thể dựng dataset lồng nhau khi đang làm mới list.');
    }
    this.workbookDerivedCacheBuilding = true;
    try {
      return this.buildWorkbookDerivedCacheNow();
    } finally {
      this.workbookDerivedCacheBuilding = false;
    }
  }

  private buildWorkbookDerivedCacheNow(): WorkbookDerivedContext {
    const t0 = Date.now();
    const workbookSource = this.getWorkbookSource();
    const imageUrls = isIsolatedSheetSource(this.activeDestinationId) ? [] : imageUrlsForDirectory(this.dalatImageDir, '/assets/dalat');
    const imageMapping = this.loadImageMapping();
    const imageLibraryEntries = isIsolatedSheetSource(this.activeDestinationId) ? [] : this.loadImageLibraryEntries(imageMapping);
    const sheetDriveManifest = this.loadSheetDriveManifest();
    const hinhNenImagePools = this.loadHinhNenImagePools(sheetDriveManifest);
    const coverImageUrls = hinhNenImagePools.default;
    const itemsBySection = this.loadWorkbookItems(workbookSource.workbook, imageUrls, imageMapping, imageLibraryEntries, sheetDriveManifest);
    // Saved lists are snapshots; refreshing source data must not rewrite them.
    this.ensureInventoryLoaded();
    const renderUsage = this.createUsageScope();
    setActiveDestinationLocalize(this.activeDestinationId);
    setSpotlightV3BuildContext({ destinationId: contentDestinationId(this.activeDestinationId) });
    let baseDecks: GuideDeck[];
    try {
      baseDecks = localizeDecks(
        buildDecks(
          itemsBySection,
          imageUrls,
          imageLibraryEntries,
          coverImageUrls,
          renderUsage.itemIds,
          renderUsage.imageUrls,
          hinhNenImagePools,
        ),
        this.activeDestinationId,
      );
    } finally {
      clearSpotlightV3BuildContext();
    }
    if (getAllowedDeckIds(this.activeDestinationId).includes(CHERRY_ID)) baseDecks.push(cherryDeck(itemsBySection, hinhNenImagePools, this.hooksForSource(this.activeDestinationId).cherry.getCachedHooks()));
    baseDecks.forEach((deck) => this.markUsedInDeck(deck.lists.flatMap((list) => list.pages), renderUsage));
    if (this.hasGeneratedListsNeedingTemplateRefresh()) {
      this.refreshGeneratedLists(itemsBySection, imageUrls, imageLibraryEntries, coverImageUrls, renderUsage, baseDecks);
    }
    const totalItems = Object.values(itemsBySection).reduce((s, items) => s + items.length, 0);
    const mappedItemCount = Object.values(itemsBySection).reduce((s, items) => s + items.filter((i) => i.imageMapped).length, 0);
    const manualMappedItemCount = Object.values(itemsBySection).reduce((s, items) => s + items.filter((i) => i.imageSource === 'manual').length, 0);
    const autoMappedItemCount = Object.values(itemsBySection).reduce((s, items) => s + items.filter((i) => i.imageSource === 'auto').length, 0);

    const context: WorkbookDerivedContext = {
      imageUrls,
      coverImageUrls,
      hinhNenImagePools,
      imageLibraryEntries,
      itemsBySection,
      baseDecks,
      totalItems,
      mappedItemCount,
      manualMappedItemCount,
      autoMappedItemCount,
    };
    this.workbookDerivedCache = context;
    this.workbookDerivedCacheTime = Date.now();
    this.workbookDerivedCacheFresh = true;
    this.writeDestinationStats(this.activeDestinationId, totalItems);
    console.log(`[cache] Dữ liệu Sheet được build lại trong ${Date.now() - t0}ms`);
    return context;
  }

  private async assertGeneratedImageCache(pages: DeckPage[], deckId: string): Promise<void> {
    const refs = pages.flatMap((page, index) => [
      { url: page.backgroundImage, page: index + 1, place: page.title },
      ...(page.type === 'cover' ? (page.coverImages || []).map(url => ({ url, page: index + 1, place: page.title })) : []),
      ...(page.type === 'list' ? page.items.map(item => ({ url: item.imageUrl, page: index + 1, place: item.name })) : []),
    ]).map(ref => ({ ...ref, id: extractDriveFileIdFromProxyUrl(ref.url || '') })).filter(ref => ref.id);
    const invalid = new Set((await verifyDriveFileCache(refs.map(ref => ref.id))).filter(image => image.status !== 'valid').map(image => image.id));
    const errors = refs.filter(ref => invalid.has(ref.id));
    if (errors.length) throw new BadRequestException(`Chưa lưu list ${deckId}: ảnh cache thiếu/hỏng: ${errors.map(ref => `trang ${ref.page}, ${ref.place}, ${ref.id}`).join('; ')}. Hãy cập nhật dữ liệu.`);
  }

  /** Chuẩn hóa tên đối tác bắt buộc; mẫu riêng (local-*) không nhận lựa chọn này. */
  private validateRequiredPartners(deckId: unknown, raw: unknown): string[] {
    const names = normalizeRequiredPartners(raw);
    if (names.length && findLocalTemplate(String(deckId ?? '').trim())) {
      throw new BadRequestException('Mẫu riêng không hỗ trợ chọn đối tác bắt buộc; hãy bỏ chọn đối tác.');
    }
    return names;
  }

  private assertRequiredPartnersAvailable(deckName: string, itemsBySection: WorkbookItemsBySection, names: string[]): void {
    const missing = [...partnerItemsByName(itemsBySection, names)].filter(([, items]) => !items.length).map(([name]) => name);
    if (missing.length) {
      throw new RequiredPartnersError(`${deckName}: đối tác bắt buộc không có trong dữ liệu nguồn hiện tại, không còn đánh dấu đối tác hoặc chưa có ảnh hợp lệ trên máy: ${missing.join(', ')}. Hãy đồng bộ dữ liệu hoặc bỏ chọn. Chưa tạo list.`);
    }
  }

  private requiredPartnersFailure(deckName: string, missing: string[], itemsBySection: WorkbookItemsBySection, seenSections: Set<string>): RequiredPartnersError {
    const byName = partnerItemsByName(itemsBySection, missing);
    const reasons = missing.map(name => {
      const items = byName.get(name) || [];
      const sections = [...new Set(items.map(item => item.sectionKey))];
      if (!sections.length || sections.some(section => seenSections.has(section))) return name;
      const labels = [...new Set(items.map(item => item.sectionTitle || item.sectionKey))].join('/');
      return `${name} (mẫu này không có ô nhóm ${labels})`;
    });
    return new RequiredPartnersError(`${deckName}: không xếp được đối tác bắt buộc vào list: ${reasons.join(', ')}. Đã thử nhiều phương án; mẫu có thể không đủ ô đối tác cho số đối tác đã chọn, hoặc đối tác chưa đạt điều kiện riêng của mẫu (nhóm, chủ đề, ảnh Maps, mô tả, địa chỉ). Hãy bỏ bớt hoặc chọn đối tác khác. Chưa lưu list.`);
  }

  private renderedPartnerNames(list: GuideDeckList): string[] {
    // The release ships frontend/lib alongside the backend. Node >=22.12 can
    // load this pure ESM contract synchronously; no browser, AI or I/O is invoked
    // by the renderer. The exporter imports this exact same implementation.
    const policy = require(path.join(this.frontendRoot, 'lib', 'partnerNames.mjs')) as { collectPartnerNames(list: GuideDeckList): string[] };
    return policy.collectPartnerNames(list);
  }

  private async buildLocallyVerifiedGenerationContext(requirePlaceImages = true, includeCherryImages = false): Promise<DatasetBuildContext> {
    // Clone before filtering: saved snapshots and the currently visible dataset must not change.
    const context = this.cloneJson(this.buildDatasetContext());
    // Dedicated seasonal pools must neither enter an older/local template's
    // cover candidates nor make it verify hundreds of unused new photographs.
    if (!includeCherryImages) {
      delete context.hinhNenImagePools['cherry-blossom'];
      delete context.hinhNenImagePools['cherry-blossom-random'];
      for (const items of Object.values(context.itemsBySection)) for (const item of items) {
        delete item.themedImageUrls;
        delete item.cherryRegularImageUrls;
      }
    }
    const pool = { items: context.itemsBySection, images: context.imageUrls, covers: context.coverImageUrls, backgrounds: context.hinhNenImagePools, library: context.imageLibraryEntries };
    const proxyId = (value: string): string => {
      let parsed: URL;
      try { parsed = new URL(value, 'http://localhost'); } catch { return ''; }
      return parsed.pathname === '/assets/drive-file' ? extractDriveFileIdFromProxyUrl(value) : '';
    };
    const collected = new Set<string>();
    const collect = (value: any): void => {
      if (typeof value === 'string') { const id = proxyId(value); if (id) collected.add(id); }
      else if (value && typeof value === 'object') Object.values(value).forEach(collect);
    };
    collect(pool);
    const ids = [...collected];
    const valid = new Set((await verifyDriveFileCache(ids)).filter(image => image.status === 'valid').map(image => image.id));
    const filter = (value: any): any => {
      if (typeof value === 'string') {
        // This traversal includes IDs and copy, not only image fields. The generic
        // Drive extractor also accepts bare identifiers such as "quan_an-123".
        // Only local proxy URLs belong to the cache-filtering contract here.
        const id = proxyId(value);
        return id && !valid.has(id) ? '' : value;
      }
      if (Array.isArray(value)) return value.map(filter).filter(item => item !== '');
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, filter(item)]));
      return value;
    };
    const filtered = filter(pool);
    context.itemsBySection = filtered.items;
    context.imageUrls = filtered.images;
    context.coverImageUrls = filtered.covers;
    context.hinhNenImagePools = filtered.backgrounds;
    context.imageLibraryEntries = filtered.library;
    for (const items of Object.values(context.itemsBySection)) for (const item of items) {
      if (!item.imageUrl) item.imageUrl = item.candidateImageUrls?.[0] || '';
      if (!item.mapImageUrl) item.mapImageUrl = item.mapCandidateImageUrls?.[0] || '';
    }
    if (requirePlaceImages) {
      for (const key of Object.keys(context.itemsBySection) as Array<keyof WorkbookItemsBySection>) {
        context.itemsBySection[key] = context.itemsBySection[key].filter(item => Boolean(item.imageUrl) && item.imageSource !== 'fallback');
      }
    }
    return context;
  }

  private buildDatasetContext(): DatasetBuildContext {
    this.ensureGeneratedListsLoaded();
    const derived = this.ensureWorkbookDerivedContext();
    // Generated lists are destination-scoped and may be loaded after a warm workbook
    // context is restored from memory. Re-attach current Sheet/Drive images here as
    // well, otherwise old fallback items stay blank until the workbook is rebuilt.
    // Keep saved-list images and text unchanged when the source is refreshed.
    // Danh sách AI (tạo/xoá/sửa cover) luôn đọc trực tiếp từ generatedListsByDeckId (bộ nhớ, luôn mới
    // nhất) nên bước merge này luôn nhanh (không đụng tới Sheet/ảnh) và không cần cache riêng.
    const referenceSets = this.buildReferenceSets();
    const decks = this.mergeGeneratedLists([...derived.baseDecks, ...localTemplateDecks(this.activeDestinationId)], derived.coverImageUrls);

    return {
      imageUrls: derived.imageUrls,
      coverImageUrls: derived.coverImageUrls,
      hinhNenImagePools: derived.hinhNenImagePools,
      imageLibraryEntries: derived.imageLibraryEntries,
      itemsBySection: derived.itemsBySection,
      referenceSets,
      totalItems: derived.totalItems,
      mappedItemCount: derived.mappedItemCount,
      manualMappedItemCount: derived.manualMappedItemCount,
      autoMappedItemCount: derived.autoMappedItemCount,
      decks,
    };
  }

  private mergeGeneratedLists(decks: GuideDeck[], coverImageUrls: string[] = []): GuideDeck[] {
    const usedCoverUrls = new Set<string>();
    const pageTextOverrides = this.loadPageTextOverrides();
    const archivedPartnerLists = this.generatedListsByDeckId.get('spotlight-partner') ?? [];
    // Retire creation without deleting or regenerating approved user snapshots.
    const archivedDecks: GuideDeck[] = archivedPartnerLists.length ? [{
      id: 'spotlight-partner', creationDisabled: true, navTitle: 'Spotlight Đối tác (đã ngừng)',
      title: 'List Spotlight Đối tác đã lưu', description: 'Chỉ xem, chỉnh sửa và xuất list đã lưu; không tạo mới.',
      lists: this.applyPageTextOverrides('spotlight-partner', this.cloneJson(archivedPartnerLists), pageTextOverrides),
    }] : [];
    return [...decks.filter(deck => deck.id !== 'spotlight-partner').map((deck) => {
      const templateVersion = this.templateVersionForDeck(deck.id);
      const baseLists = deck.lists.map((list) => {
        const sanitized = this.sanitizeBaseListForDisplay(list, coverImageUrls);
        return templateVersion ? { ...sanitized, templateVersion } : sanitized;
      });
      const generatedLists = (this.generatedListsByDeckId.get(deck.id) ?? []).map((list) => list.partnerRotationVersion || list.photoPreset || SPOTLIGHT_DESIGN_DECKS.includes(deck.id) ? this.cloneJson(list) : this.sanitizeGeneratedListText(list, deck.id));
      const displayLists = generatedLists.length === 0
        ? baseLists
        : [
          ...baseLists,
          ...this.cloneJson(generatedLists).map((list) => (
            this.sanitizeGeneratedListForDisplay(list, coverImageUrls, usedCoverUrls, deck.id)
          )),
        ];
      // Một số bước làm sạch giao diện có fallback chữ để cứu dữ liệu cũ. Áp lại
      // cấu trúc mẫu mẹ sau cùng để fallback không tái tạo trường đã bị xóa.
      const structuredDisplayLists = displayLists.map((list) => (
        list.partnerRotationVersion || list.photoPreset || SPOTLIGHT_DESIGN_DECKS.includes(deck.id) || /-main$/i.test(String(list.id || ''))
          || String(list.id || '').toLowerCase() === 'main'
          || String(list.navTitle || '').trim().toLowerCase() === 'list chính'
          ? list
          : { ...list, pages: this.applyMainTemplateFieldStructure(deck, list.pages) }
      ));
      const guardedLists = SPOTLIGHT_DESIGN_DECKS.includes(deck.id) || THREADS_NOTE_DECK_IDS.includes(deck.id)
        ? structuredDisplayLists : this.applyRecentImageReuseGuard(structuredDisplayLists);
      return { ...deck, lists: this.applyPageTextOverrides(deck.id, guardedLists, pageTextOverrides) };
    }), ...archivedDecks];
  }

  private normalizeEditablePageText(value: unknown): string {
    return pageText.normalizeEditablePageText(value);
  }

  private normalizeEditablePageMultilineText(value: unknown): string {
    return pageText.normalizeEditablePageMultilineText(value);
  }

  private loadPageTextOverrides(): PageTextOverrideStore {
    return pageText.readPageTextOverrides(this.resolveDestinationDataPath('page-text-overrides'));
  }

  private savePageTextOverrides(store: PageTextOverrideStore): void {
    this.ensureDataRoot();
    this.writeJsonFileSafe(this.getDestinationDataPath('page-text-overrides'), store);
  }

  private applyPageTextOverrides(
    deckId: string,
    lists: GuideDeckList[],
    store: PageTextOverrideStore,
  ): GuideDeckList[] {
    return pageText.applyPageTextOverrides(deckId, lists, store);
  }

  private applyMainTemplateFieldStructure(deck: GuideDeck, pages: DeckPage[]): DeckPage[] {
    // Maps titles identify the newly selected place, not reusable template copy.
    // Typography is inherited separately when the child snapshot is created.
    if (deck.id === 'spotlight-v6-maps') return pages;
    if (deck.id === 'spotlight-v6-diary') return pages;
    if (isSpotlightV5Deck(deck.id) || isTextNoteDeck(deck.id)) return pages;
    return pageText.applyMainTemplateFieldStructure(deck, pages, () => this.loadPageTextOverrides());
  }

  private deletePageTextOverrides(deckId: string, listId: string): void {
    const store = this.loadPageTextOverrides();
    if (pageText.removeListOverrides(store, deckId, listId)) this.savePageTextOverrides(store);
  }

  // ─── list-display.ts ─────────────────────────────────────────────
  private applyRecentImageReuseGuard(lists: GuideDeckList[]): GuideDeckList[] {
    return listDisplay.applyRecentImageReuseGuard(lists);
  }

  private templateVersionForDeck(deckId: string): number | undefined {
    return listDisplay.templateVersionForDeck(deckId);
  }

  private normalizeCaptionTone(value?: string): CaptionTone {
    return listDisplay.normalizeCaptionTone(value);
  }

  private budget3N2DCoverCaption(caption: CaptionBlocks): CaptionBlocks {
    return listDisplay.budget3N2DCoverCaption(caption);
  }

  private canRefreshGeneratedTemplate(deckId: string): boolean {
    return listDisplay.canRefreshGeneratedTemplate(deckId);
  }

  private sanitizeGeneratedListForDisplay(
    list: GuideDeckList,
    coverImageUrls: string[] = [],
    usedCoverUrls?: Set<string>,
    deckId?: string,
  ): GuideDeckList {
    return listDisplay.sanitizeGeneratedListForDisplay(this.activeDestinationId, list, coverImageUrls, usedCoverUrls, deckId);
  }

  private sanitizeBaseListForDisplay(list: GuideDeckList, coverImageUrls: string[] = []): GuideDeckList {
    return listDisplay.sanitizeBaseListForDisplay(this.activeDestinationId, list, coverImageUrls);
  }

  private findPartnerItemForGeneratedList(list: GuideDeckList, itemsBySection: WorkbookItemsBySection): GuideItem | undefined {
    return listDisplay.findPartnerItemForGeneratedList(list, itemsBySection);
  }

  private normalizeDisplayName(value: string): string {
    return listDisplay.normalizeDisplayName(value);
  }

  private pageItemSectionKey(pageItem: PageItem): SectionKey | '' {
    return listDisplay.pageItemSectionKey(pageItem);
  }

  private pageItemSourceName(pageItem: PageItem): string {
    return listDisplay.pageItemSourceName(pageItem);
  }

  private refreshedPageItemName(pageItem: PageItem, sourceName: string): string {
    return listDisplay.refreshedPageItemName(pageItem, sourceName);
  }

  private mergeTimelineDayMetaSecondary(existing: string, freshMeta: string): string {
    return listDisplay.mergeTimelineDayMetaSecondary(existing, freshMeta);
  }

  private pageItemMetaFromSource(item: GuideItem): [string, string] {
    return listDisplay.pageItemMetaFromSource(item);
  }

  private spotlightV3ItemMetaFromSource(item: GuideItem, chipText = ''): [string, string] {
    return listDisplay.spotlightV3ItemMetaFromSource(item, chipText);
  }

  private budgetGalleryItemMetaFromSource(item: GuideItem): [string, string] {
    return listDisplay.budgetGalleryItemMetaFromSource(item);
  }

  private captionBodyFallback(): string {
    return listDisplay.captionBodyFallback(this.activeDestinationId);
  }

  private hasGeneratedListsNeedingTemplateRefresh(): boolean {
    for (const [deckId, lists] of this.generatedListsByDeckId.entries()) {
      if (!this.canRefreshGeneratedTemplate(deckId)) continue;
      const templateVersion = this.templateVersionForDeck(deckId);
      if (!templateVersion) continue;
      if (lists.some((list) => list.templateVersion !== templateVersion)) return true;
    }
    return false;
  }

  private refreshGeneratedLists(
    itemsBySection: WorkbookItemsBySection,
    imageUrls: string[],
    libraryEntries: ImageLibraryFolderEntry[],
    coverImageUrls: string[],
    renderUsage: DataAllocator,
    baseDecks: GuideDeck[] = [],
  ): void {
    if (this.generatedListsByDeckId.size === 0) return;
    let changed = false;
    const pageTextOverrides = this.loadPageTextOverrides();

    for (const [deckId, lists] of this.generatedListsByDeckId.entries()) {
      const templateVersion = this.templateVersionForDeck(deckId);
      if (!this.canRefreshGeneratedTemplate(deckId) || !templateVersion
        || lists.every(list => list.templateVersion === templateVersion)) continue;
      const deckUsage = this.createUsageScope();
      const baseDeck = baseDecks.find((deck) => deck.id === deckId);
      baseDeck?.lists.forEach((list) => this.markUsedInDeck(list.pages, deckUsage));
      lists.filter(list => list.templateVersion === templateVersion).forEach(list => {
        this.markUsedInDeck(list.pages, deckUsage);
        this.markUsedInDeck(list.pages, renderUsage);
      });
      const refreshedLists = lists.map((list, listIndex) => {
        if (list.partnerRotationVersion || list.photoPreset) return list;
        if (list.templateVersion === templateVersion) return list;
        if (deckId === 'spotlight-partner') {
          const partnerItem = this.findPartnerItemForGeneratedList(list, itemsBySection);
          if (!partnerItem) return list;
          const pools = this.createDeckBuildPoolsFromSection(itemsBySection);
          let regeneratedPages = buildSpotlightPartnerPages(
            partnerItem,
            pools,
            imageUrls,
            libraryEntries,
            `refresh:${deckId}:${list.id}:${listIndex}:${partnerItem.id}`,
            deckUsage.itemIds,
            deckUsage.imageUrls,
            coverImageUrls,
          );
          if (baseDeck) regeneratedPages = this.applyMainTemplateFieldStructure(baseDeck, regeneratedPages);
          this.markUsedInDeck(regeneratedPages, deckUsage);
          this.markUsedInDeck(regeneratedPages, renderUsage);
          const partnerCaptionHashtags = buildCaptionHashtags([], 'lich_trinh_huu_ich', this.activeDestinationId, 'spotlight-partner');
          if (
            list.navTitle !== partnerItem.name ||
            list.title !== partnerItem.name.toUpperCase() ||
            list.coverTitle !== partnerItem.name.toUpperCase().slice(0, 35) ||
            list.postCaption !== SPOTLIGHT_PARTNER_POST_CAPTION ||
            list.captionBody !== SPOTLIGHT_PARTNER_CAPTION_BODY ||
            list.description !== '' ||
            JSON.stringify(list.captionHashtags || []) !== JSON.stringify(partnerCaptionHashtags) ||
            list.templateVersion !== templateVersion ||
            JSON.stringify(list.pages) !== JSON.stringify(regeneratedPages)
          ) changed = true;
          const nextList = {
            ...list,
            navTitle: partnerItem.name,
            title: partnerItem.name.toUpperCase(),
            coverTitle: partnerItem.name.toUpperCase().slice(0, 35),
            postCaption: SPOTLIGHT_PARTNER_POST_CAPTION,
            captionBody: SPOTLIGHT_PARTNER_CAPTION_BODY,
            description: '',
            captionHashtags: partnerCaptionHashtags,
            templateVersion,
            pages: regeneratedPages,
          };
          return this.sanitizeGeneratedListText(nextList, deckId);
        }

        // Nếu người dùng đã tự sửa/xóa tiêu đề cover (page-text-overrides), giữ đúng giá trị đó khi
        // refresh — không random lại hook mới rồi ghi đè lên bản người dùng đã chỉnh.
        const coverOverride = pageTextOverrides.decks[deckId]?.[list.id]?.['0'];
        const hasCoverOverride = coverOverride !== undefined;

        const caption: CaptionBlocks = {
          coverTitle: this.sanitizeContentText(sanitizeDeckHeadline(
            hasCoverOverride ? coverOverride.title : (list.coverTitle || list.title),
          )),
          headline: this.sanitizeContentText(String(list.postCaption ?? '').trim()),
          // Người dùng đã quyết định bỏ hẳn mô tả — ép rỗng ở đây để list AI cũ (còn description lưu từ trước) cũng được dọn sạch khi refresh.
          body: '',
          hashtags: Array.isArray(list.captionHashtags) ? list.captionHashtags : [],
        };
        const refreshSeed = `refresh:${deckId}:${list.id}:${listIndex}:${caption.coverTitle}:${caption.headline}:${caption.body}:${caption.hashtags.join(' ')}`;
        const hasFestivalHookSnapshot = list.hookSnapshot?.mode === 'festival';
        if (isLegacyGoogleDocHookDeck(deckId) && !hasFestivalHookSnapshot) {
          setSpotlightV3BuildContext({
            destinationId: contentDestinationId(this.activeDestinationId),
            usedHookTitles: this.getUsedCaptionTitles(deckId, baseDecks),
          });
        }
        let basePages: DeckPage[];
        try {
          basePages = buildPagesForDeck(
            deckId,
            itemsBySection,
            imageUrls,
            libraryEntries,
            refreshSeed,
            deckUsage.itemIds,
            deckUsage.imageUrls,
            coverImageUrls,
          );
        } finally {
          clearSpotlightV3BuildContext();
        }
        const hookCoverTitle = hasCoverOverride
          ? ''
          : hasFestivalHookSnapshot
            ? ''
          : isLegacyGoogleDocHookDeck(deckId)
            ? String((basePages.find((page) => page.type === 'cover') as CoverPage | undefined)?.title || '').trim()
            : isSectionedGoogleDocHookDeck(deckId)
              ? ''
            : isPremadeHookDeck(deckId) && deckId !== 'one-way-story'
              ? this.resolvePremadeHookCoverTitle(deckId, refreshSeed)
              : '';
        const safeCaption = {
          ...caption,
          coverTitle: this.sanitizeContentText(sanitizeDeckHeadline(hookCoverTitle || caption.coverTitle)),
          headline: this.sanitizeContentText(caption.headline),
          body: this.sanitizeContentText(sanitizeCaptionBodyForPages(caption.body, basePages)),
        };
        const finalCaption = deckId === 'budget-3n2d' || deckId === 'budget-3n2d-story' || deckId === 'budget-72h-summary'
          ? this.budget3N2DCoverCaption(safeCaption)
          : safeCaption;
        let regeneratedPages = applyCaptionToPages(basePages, finalCaption);
        if (baseDeck) regeneratedPages = this.applyMainTemplateFieldStructure(baseDeck, regeneratedPages);
        this.markUsedInDeck(regeneratedPages, deckUsage);
        this.markUsedInDeck(regeneratedPages, renderUsage);
        if (
          list.title !== finalCaption.coverTitle ||
          list.coverTitle !== finalCaption.coverTitle ||
          list.postCaption !== finalCaption.headline ||
          list.description !== finalCaption.body ||
          list.templateVersion !== templateVersion ||
          JSON.stringify(list.pages) !== JSON.stringify(regeneratedPages)
        ) changed = true;
        const nextList = {
          ...list,
          title: finalCaption.coverTitle,
          coverTitle: finalCaption.coverTitle,
          postCaption: finalCaption.headline,
          // Di chuyển dữ liệu cũ sang trường caption riêng trước khi description
          // được đồng bộ theo cấu trúc mẫu mẹ.
          captionBody: list.captionBody || list.description || this.captionBodyFallback(),
          description: finalCaption.body,
          templateVersion,
          pages: regeneratedPages,
        };
        return this.sanitizeGeneratedListText(nextList, deckId);
      });
      const sanitizedLists = refreshedLists.map((list) => {
        if (lists.includes(list)) return list;
        const sanitizedList = this.sanitizeGeneratedListText(list, deckId);
        if (JSON.stringify(list) !== JSON.stringify(sanitizedList)) changed = true;
        return sanitizedList;
      });
      this.generatedListsByDeckId.set(deckId, sanitizedLists);
    }

    if (changed) this.persistGeneratedLists();
  }

  private refreshGeneratedListImages(itemsBySection: WorkbookItemsBySection): void {
    if (listStore.refreshListImagesFromSource(this.activeDestinationId, this.generatedListsByDeckId, itemsBySection)) this.persistGeneratedLists();
  }

  // ─── Kho list đã tạo: generated-list-store.ts ───────────────────────────────
  private ensureGeneratedListsLoaded(): void {
    if (this.generatedListsLoaded) return;
    this.generatedListsLoaded = true;
    this.generatedListsByDeckId.clear();
    this.diaryUsedLines = {};
    this.partnerRotation = {};
    this.localTemplateState = {};
    if (!fs.existsSync(this.resolveDestinationDataPath('generated-caption-lists'))) return;

    try {
      const raw = fs.readFileSync(this.resolveDestinationDataPath('generated-caption-lists'), 'utf-8');
      const content = listStore.parseGeneratedListStore(raw);
      this.partnerRotation = content.partnerRotation;
      this.diaryUsedLines = content.diaryUsedLines;
      this.localTemplateState = content.localTemplateState || {};
      // Giữ nguyên đối tượng Map: nơi khác có thể đang giữ tham chiếu tới nó.
      content.lists.forEach((lists, deckId) => this.generatedListsByDeckId.set(deckId, lists));
      this.repairSpotlightV6MapsSnapshots();
      this.migrateGeneratedListTextStore();
    } catch (error) {
      this.generatedListsByDeckId.clear();
      this.partnerRotation = {};
      this.generatedListsLoaded = false;
      throw new BadRequestException(`Không đọc được kho list/lịch sử luân phiên; chưa ghi đè dữ liệu. ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private persistGeneratedLists(): void {
    const payload = listStore.buildGeneratedListStorePayload({
      lists: this.generatedListsByDeckId, partnerRotation: this.partnerRotation, diaryUsedLines: this.diaryUsedLines, localTemplateState: this.localTemplateState,
    }, new Date().toISOString());
    this.ensureDataRoot();
    this.writeJsonFileSafe(this.getDestinationDataPath('generated-caption-lists'), payload);
    // Không đụng tới cache Sheet ở đây: list AI được merge trực tiếp từ generatedListsByDeckId
    // (bộ nhớ, luôn mới nhất) ngay trong buildDatasetContext(), nên CRUD list không cần rebuild Sheet.
  }

  /** Sửa một lần các list Maps tạo bởi bản cũ bị refresh item về ảnh Link_drive. */
  private repairSpotlightV6MapsSnapshots(): void {
    const repaired = listStore.repairSpotlightV6MapsLists(this.generatedListsByDeckId.get('spotlight-v6-maps'));
    if (!repaired) return;
    this.generatedListsByDeckId.set('spotlight-v6-maps', repaired);
    this.persistGeneratedLists();
  }

  private migrateGeneratedListTextStore(): void {
    if (listStore.migrateGeneratedListText(this.activeDestinationId, this.generatedListsByDeckId)) this.persistGeneratedLists();
  }

  // ─── Private: workbook loading ────────────────────────────────────────────

  private getWorkbookSource(): SheetWorkbookSource {
    if (!this.workbookSource) {
      throw new NotFoundException('Chưa tải được dữ liệu từ workbook XLSX.');
    }
    return this.workbookSource;
  }

  private loadSheetDriveManifest(): SheetDriveImageManifest {
    this.ensureDriveAccessibilityCacheLoaded();
    return readSheetDriveManifest(this.dataRoot, this.activeDestinationId);
  }

  private ensureDriveAccessibilityCacheLoaded(): void {
    if (this.driveAccessCacheLoadedFor === this.activeDestinationId) return;
    this.driveAccessCacheLoadedFor = this.activeDestinationId;
    clearDriveAccessibilityCache();
    const cachePath = path.join(this.dataRoot, `drive-access-cache.${this.activeDestinationId}.json`);
    if (!fs.existsSync(cachePath)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as { entries?: Record<string, boolean> };
      for (const [fileId, accessible] of Object.entries(parsed.entries || {})) {
        // Portable packages keep metadata but intentionally exclude image bytes.
        // Trust a positive result only when this machine owns the real disk cache.
        // Negative results can be transient rate limits, so retry them per process.
        if (Boolean(accessible) && hasDriveFileDiskCache(fileId)) {
          setCachedDriveFileAccessibility(fileId, true);
        }
      }
    } catch {
      // Ignore invalid cache files.
    }
  }

  private hasDriveAccessCache(): boolean {
    return fs.existsSync(path.join(this.dataRoot, `drive-access-cache.${this.activeDestinationId}.json`));
  }

  // ─── workbook-items.ts ─────────────────────────────────────────────
  private loadHinhNenImagePools(sheetDriveManifest: SheetDriveImageManifest): HinhNenImageUrlPools {
    return workbookItems.loadHinhNenImagePools(sheetDriveManifest);
  }

  private loadWorkbookItems(
    workbook: XLSX.WorkBook,
    imageUrls: string[],
    imageMapping: ImageMappingFile,
    libraryEntries: ImageLibraryFolderEntry[],
    sheetDriveManifest: SheetDriveImageManifest,
  ): WorkbookItemsBySection {
    return workbookItems.loadWorkbookItems(this.activeDestinationId, this.workspaceRoot, workbook, imageUrls, imageMapping, libraryEntries, sheetDriveManifest);
  }

  private async prepareSpotlightV6GreenResources(): Promise<Set<string>> {
    if (!isDalatContentSource(this.activeDestinationId)) {
      throw new BadRequestException('Mẫu Spotlight V6 Mảng xanh hiện chỉ áp dụng cho Đà Lạt.');
    }
    const manifest = this.loadSheetDriveManifest();
    const docUrl = String(manifest.hookSourceGroups?.green || '').trim();
    if (!docUrl) {
      if (!this.greenHookSource.getCachedHooks().length) {
        throw new BadRequestException('Không tìm thấy hyperlink “Hook mảng xanh” cùng dòng “Ảnh mảng xanh” trong Sheet Hinh_nen và chưa có cache Hook cũ.');
      }
      console.warn('[spotlight-v6-green] Sheet tạm thiếu hyperlink Hook mảng xanh; giữ cache Hook đã tải thành công trước đó.');
    } else {
      await this.greenHookSource.ensureReady(docUrl);
    }

    const entries = (manifest.coverImageGroups?.green || [])
      .filter((entry, index, all) => Boolean(entry?.fileId) && all.findIndex((candidate) => candidate.fileId === entry.fileId) === index);
    if (entries.length < 6) {
      throw new BadRequestException(`Mẫu Spotlight V6 Mảng xanh cần ít nhất 6 ảnh trong folder Ảnh mảng xanh (${entries.length}/6).`);
    }
    const fileIds = entries.map((entry) => String(entry.fileId || '').trim()).filter(Boolean);
    const missing = listUncachedDriveFileIds(fileIds);
    if (missing.length) {
      const warmed = await warmDriveFileDiskCache(missing, {
        runTask: (task) => this.runtimePerformance.runDriveTask(4, task),
        concurrency: this.driveCacheConcurrency(Number(process.env.DALAT_DRIVE_CACHE_CONCURRENCY || 4), 4),
      });
      if (warmed.fail > 0) {
        console.warn(`[spotlight-v6-green] Có ${warmed.fail} ảnh Mảng xanh chưa tải được; builder chỉ dùng ảnh cache thật.`);
      }
    }
    const readyIds = new Set(fileIds.filter((fileId) => hasDriveFileDiskCache(fileId)));
    if (readyIds.size < 6) {
      throw new BadRequestException(`Mẫu Spotlight V6 Mảng xanh chỉ tải được ${readyIds.size}/6 ảnh Mảng xanh; còn thiếu ${6 - readyIds.size}.`);
    }
    return readyIds;
  }

  private async prepareSpotlightV6DarkResources(): Promise<Set<string>> {
    if (!isDalatContentSource(this.activeDestinationId)) {
      throw new BadRequestException('Mẫu Spotlight V6 Tone đen hiện chỉ áp dụng cho Đà Lạt.');
    }
    const manifest = this.loadSheetDriveManifest();
    const docUrl = String(manifest.hookSourceGroups?.dark || '').trim();
    if (!docUrl) {
      if (!this.darkHookSource.getCachedHooks().length) {
        throw new BadRequestException('Không tìm thấy hyperlink “Hook tone tối” cùng dòng “Ảnh tone đen” trong Sheet Hinh_nen và chưa có cache Hook cũ.');
      }
      console.warn('[spotlight-v6-dark] Sheet tạm thiếu hyperlink Hook tone tối; giữ cache Hook đã tải thành công trước đó.');
    } else {
      await this.darkHookSource.ensureReady(docUrl);
    }

    const entries = (manifest.coverImageGroups?.dark || [])
      .filter((entry, index, all) => Boolean(entry?.fileId) && all.findIndex((candidate) => candidate.fileId === entry.fileId) === index);
    if (entries.length < 6) {
      throw new BadRequestException(`Mẫu Spotlight V6 Tone đen cần ít nhất 6 ảnh trong folder Ảnh tone đen (${entries.length}/6).`);
    }
    const fileIds = entries.map((entry) => String(entry.fileId || '').trim()).filter(Boolean);
    const missing = listUncachedDriveFileIds(fileIds);
    if (missing.length) {
      const warmed = await warmDriveFileDiskCache(missing, {
        runTask: (task) => this.runtimePerformance.runDriveTask(4, task),
        concurrency: this.driveCacheConcurrency(Number(process.env.DALAT_DRIVE_CACHE_CONCURRENCY || 4), 4),
      });
      if (warmed.fail > 0) {
        console.warn(`[spotlight-v6-dark] Có ${warmed.fail} ảnh Tone đen chưa tải được; builder chỉ dùng ảnh cache thật.`);
      }
    }
    const cachedIds = fileIds.filter((fileId) => hasDriveFileDiskCache(fileId));
    const visuallyUniqueIds = uniqueCachedDriveFileIdsByVisualContent(cachedIds);
    const readyIds = new Set(visuallyUniqueIds);
    if (visuallyUniqueIds.length < cachedIds.length) {
      console.warn(`[spotlight-v6-dark] Đã loại ${cachedIds.length - visuallyUniqueIds.length} ảnh trùng nội dung trong pool Tone đen.`);
    }
    if (readyIds.size < 6) {
      throw new BadRequestException(`Mẫu Spotlight V6 Tone đen chỉ có ${readyIds.size}/6 ảnh Tone đen khác nội dung; còn thiếu ${6 - readyIds.size}.`);
    }
    return readyIds;
  }

  private async prepareSpotlightV6PersimmonResources(): Promise<Set<string>> {
    if (!isDalatContentSource(this.activeDestinationId)) {
      throw new BadRequestException('Mẫu Spotlight Mùa hồng hiện chỉ áp dụng cho Đà Lạt.');
    }
    const manifest = this.loadSheetDriveManifest();
    const docUrl = String(manifest.hookSourceGroups?.persimmon || '').trim();
    if (!docUrl) {
      if (!this.persimmonHookSource.getCachedHooks().length) {
        throw new BadRequestException('Không tìm thấy hyperlink “Hook mùa hồng” cùng dòng “Ảnh mùa hồng” trong Sheet Hinh_nen và chưa có cache Hook cũ.');
      }
      console.warn('[spotlight-v6-persimmon] Sheet tạm thiếu hyperlink Hook mùa hồng; giữ cache Hook đã tải thành công trước đó.');
    } else {
      await this.persimmonHookSource.ensureReady(docUrl);
    }

    const entries = (manifest.coverImageGroups?.persimmon || [])
      .filter((entry, index, all) => Boolean(entry?.fileId) && all.findIndex((candidate) => candidate.fileId === entry.fileId) === index);
    if (entries.length < 4) {
      throw new BadRequestException(`Mẫu Spotlight Mùa hồng cần ít nhất 4 ảnh trong folder Ảnh mùa hồng (${entries.length}/4).`);
    }
    const fileIds = entries.map((entry) => String(entry.fileId || '').trim()).filter(Boolean);
    const missing = listUncachedDriveFileIds(fileIds);
    if (missing.length) {
      const warmed = await warmDriveFileDiskCache(missing, {
        runTask: (task) => this.runtimePerformance.runDriveTask(4, task),
        concurrency: this.driveCacheConcurrency(Number(process.env.DALAT_DRIVE_CACHE_CONCURRENCY || 4), 4),
      });
      if (warmed.fail > 0) {
        console.warn(`[spotlight-v6-persimmon] Có ${warmed.fail} ảnh Mùa hồng chưa tải được; builder chỉ dùng ảnh cache thật.`);
      }
    }
    const cachedIds = fileIds.filter((fileId) => hasDriveFileDiskCache(fileId));
    const visuallyUniqueIds = uniqueCachedDriveFileIdsByVisualContent(cachedIds);
    const readyIds = new Set(visuallyUniqueIds);
    if (visuallyUniqueIds.length < cachedIds.length) {
      console.warn(`[spotlight-v6-persimmon] Đã loại ${cachedIds.length - visuallyUniqueIds.length} ảnh trùng nội dung trong pool Mùa hồng.`);
    }
    if (readyIds.size < 4) {
      throw new BadRequestException(`Mẫu Spotlight Mùa hồng chỉ có ${readyIds.size}/4 ảnh khác nội dung; còn thiếu ${4 - readyIds.size}.`);
    }
    return readyIds;
  }

  private async prepareSpotlightV6MapsResources(): Promise<{ map: Set<string>; real: Set<string> }> {
    if (!isDalatContentSource(this.activeDestinationId)) {
      throw new BadRequestException('Mẫu Spotlight V6 Google Maps hiện chỉ áp dụng cho Đà Lạt.');
    }
    const manifest = this.loadSheetDriveManifest();
    const entries = Object.values(manifest.items).filter((entry) => Boolean(entry.mapSourceLink || entry.mapFileId || entry.mapCandidateImages?.length));
    const mapIds = [...new Set(entries.flatMap((entry) => (
      entry.mapCandidateImages?.length ? entry.mapCandidateImages.map((candidate) => candidate.fileId) : [entry.mapFileId || '']
    )).filter(Boolean))];
    const realIds = [...new Set(entries.flatMap((entry) => (
      entry.candidateImages?.length ? entry.candidateImages.map((candidate) => candidate.fileId) : [entry.fileId || '']
    )).filter(Boolean))];
    const allIds = [...new Set([...mapIds, ...realIds])];
    await verifyDriveFileCache(allIds);
    if (allIds.length) {
      const missing = listUncachedDriveFileIds(allIds);
      if (missing.length && hasSyncPermit()) {
        const concurrency = this.driveCacheConcurrency(Number(process.env.DALAT_DRIVE_CACHE_CONCURRENCY || 3), 5);
        await warmDriveFileDiskCache(missing, {
          concurrency,
          runTask: (task) => this.runtimePerformance.runDriveTask(concurrency, task),
        });
      }
    }
    const readyMap = new Set(mapIds.filter((id) => hasDriveFileDiskCache(id)));
    const readyReal = new Set(realIds.filter((id) => hasDriveFileDiskCache(id)));
    const eligible = entries.filter((entry) => {
      const maps = entry.mapCandidateImages?.length ? entry.mapCandidateImages : entry.mapFileId ? [{ fileId: entry.mapFileId }] : [];
      const reals = entry.candidateImages?.length ? entry.candidateImages : entry.fileId ? [{ fileId: entry.fileId }] : [];
      return maps.some((candidate) => readyMap.has(candidate.fileId))
        && reals.some((candidate) => readyReal.has(candidate.fileId));
    });
    if (eligible.length < 7) {
      const broken = entries.filter((entry) => !eligible.includes(entry)).map((entry) => entry.name).slice(0, 10);
      throw new BadRequestException(
        `Mẫu Spotlight V6 Google Maps chỉ có ${eligible.length}/7 địa điểm tải được cả ảnh Maps và ảnh thật.`
        + (broken.length ? ` Dòng lỗi: ${broken.join(', ')}.` : ''),
      );
    }
    return { map: readyMap, real: readyReal };
  }

  // ─── Private: image library loading (with cache) ──────────────────────────

  private ensureInventoryLoaded(): void {
    if (this.inventoryLoaded) return;
    this.inventoryLoaded = true;
    if (!fs.existsSync(this.resolveDestinationDataPath('used-inventory'))) return;
    try {
      const raw = fs.readFileSync(this.resolveDestinationDataPath('used-inventory'), 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.usedItemIds)) parsed.usedItemIds.forEach((id: string) => this.usedAllocator.itemIds.add(id));
      if (Array.isArray(parsed.usedImageUrls)) parsed.usedImageUrls.forEach((url: string) => this.usedAllocator.markImageUrl(url));
    } catch {
      // Ignore errors
    }
  }

  private persistInventory(): void {
    this.ensureDataRoot();
    this.writeJsonFileSafe(this.getDestinationDataPath('used-inventory'), this.usedAllocator.snapshot());
  }

  /** Địa điểm/ảnh đã dùng ở các list của mẫu (list mới ưu tiên cái chưa dùng). Dùng chung cho tạo thật và chạy thử khô. */
  private deckUsageScope(deckId: string, deckLists: GuideDeckList[], existing: GuideDeckList[]): DataAllocator {
    const deckUsage = this.createUsageScope();
    deckLists.forEach((list) => {
      const isPreviewList = /-main$/i.test(String(list.id || '')) || String(list.id || '').toLowerCase() === 'main';
      if ((isThreadsLocalDeck(deckId) || deckId === 'spotlight-v6-persimmon' || deckId === 'spotlight-v6-diary' || deckId === THREADS_BUDGET_ID || isThreadsExpense(deckId)) && isPreviewList) return;
      this.markUsedInDeck(list.pages, deckUsage);
    });
    // Cùng mẫu: list mới ưu tiên DL chưa dùng ở list trước; nếu pool ít thì tái dùng DL + đổi ảnh (seed + imageUrls đã dùng).
    for (const prevList of existing) {
      if (isThreadsLocalDeck(deckId) || deckId === 'spotlight-v6-diary' || deckId === THREADS_BUDGET_ID || isThreadsExpense(deckId)) this.markUsedInDeck(prevList.pages, deckUsage);
      for (const page of prevList.pages) {
        if (page.backgroundImage) deckUsage.imageUrls.add(page.backgroundImage);
        if (page.type !== 'list') continue;
        for (const item of page.items) {
          if (item.imageUrl) deckUsage.imageUrls.add(item.imageUrl);
        }
      }
    }
    return deckUsage;
  }

  private createUsageScope(): DataAllocator {
    return new DataAllocator();
  }

  private markUsedInDeck(pages: DeckPage[], scope = this.usedAllocator): void {
    scope.markPages(pages);
  }

  private loadImageMapping(allowLegacyAssets = false): ImageMappingFile {
    if (!allowLegacyAssets && isIsolatedSheetSource(this.activeDestinationId)) {
      return { version: 1, libraryRoot: '', extraLibraryRoots: [], instructions: [], mappings: [] };
    }
    const now = Date.now();
    if (this.imageMappingCache && (now - this.imageMappingCacheTime) < this.IMAGE_MAPPING_CACHE_TTL_MS) {
      return this.imageMappingCache;
    }

    let result: ImageMappingFile;
    if (!fs.existsSync(this.imageMappingPath)) {
      result = {
        version: 1,
        libraryRoot: getImageLibraryRoot(this.workspaceRoot) ?? '',
        extraLibraryRoots: [],
        instructions: [
          'Điền imagePath bằng đường dẫn tương đối bên trong libraryRoot hoặc đường dẫn tương đối từ workspace.',
          'Match ưu tiên theo sectionKey + name + address, vì vậy nên giữ nguyên name/address đúng như trong Excel.',
        ],
        mappings: [],
      };
    } else {
      try {
        const raw = fs.readFileSync(this.imageMappingPath, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<ImageMappingFile>;
        result = {
          version: Number(parsed.version ?? 1),
          libraryRoot: String(parsed.libraryRoot ?? getImageLibraryRoot(this.workspaceRoot) ?? ''),
          extraLibraryRoots: Array.isArray(parsed.extraLibraryRoots)
            ? parsed.extraLibraryRoots.map((e) => String(e ?? '').trim()).filter(Boolean)
            : [],
          instructions: Array.isArray(parsed.instructions) ? parsed.instructions.map((e) => String(e)) : [],
          mappings: Array.isArray(parsed.mappings) ? parsed.mappings : [],
        };
      } catch {
        result = { version: 1, libraryRoot: getImageLibraryRoot(this.workspaceRoot) ?? '', extraLibraryRoots: [], instructions: [], mappings: [] };
      }
    }

    this.imageMappingCache = result;
    this.imageMappingCacheTime = now;
    return result;
  }

  private loadImageLibraryEntries(imageMapping: ImageMappingFile): ImageLibraryFolderEntry[] {
    const now = Date.now();
    if (this.imageLibraryEntriesCache && (now - this.imageLibraryEntriesCacheTime) < this.IMAGE_LIBRARY_CACHE_TTL_MS) {
      return this.imageLibraryEntriesCache;
    }
    const results = buildImageLibraryEntries(imageMapping, this.workspaceRoot);
    this.imageLibraryEntriesCache = results;
    this.imageLibraryEntriesCacheTime = now;
    return results;
  }

  // ─── Private: reference sets ──────────────────────────────────────────────

  private buildReferenceSets(): ReferenceSet[] {
    if (!fs.existsSync(this.tiktokReferenceDir)) return [];
    return fs
      .readdirSync(this.tiktokReferenceDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .sort((a, b) => normalizeText(a.name).localeCompare(normalizeText(b.name), 'vi'))
      .flatMap((folder) => {
        const folderPath = path.join(this.tiktokReferenceDir, folder.name);
        const files = fs
          .readdirSync(folderPath)
          .filter((e) => ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(e).toLowerCase()))
          .sort((a, b) => a.localeCompare(b, 'vi'));
        if (files.length === 0) return [];
        return [{ title: folder.name, count: files.length, coverUrl: `/assets/tiktok/${encodeURIComponent(folder.name)}/${encodeURIComponent(files[0])}` }];
      });
  }

  // ─── Private: DeepSeek prompt helpers ────────────────────────────────────

  private getUsedCaptionTitles(deckId: string, baseDecks: GuideDeck[] = this.workbookDerivedCache?.baseDecks || []): string[] {
    this.ensureGeneratedListsLoaded();
    const titles: string[] = [];
    const pushTitle = (value: string) => {
      const clean = String(value || '').replace(/\s+/g, ' ').trim();
      if (clean) titles.push(clean);
    };

    // Tiêu đề/mô tả list mẫu (main) — list AI không được copy y hệt.
    try {
      // Never build a dataset just to read titles: refresh calls this before
      // the first derived cache is published. A rebuild here recursively refreshes lists.
      const mainList = baseDecks
        .find((deck) => deck.id === deckId)
        ?.lists
        ?.find((list) => /-main$/i.test(String(list.id || '')));
      if (mainList) {
        pushTitle(mainList.coverTitle || mainList.title || '');
        pushTitle(mainList.description || '');
        pushTitle(mainList.postCaption || '');
        const cover = (mainList.pages || []).find((page) => page.type === 'cover');
        pushTitle(cover?.title || '');
        pushTitle(cover?.subtitle || '');
      }
    } catch {
      // Dataset chưa sẵn — vẫn chặn bằng cụm mẫu cứng bên dưới.
    }

    // Cụm mẫu cũ từng bị AI copy y hệt trên lưới 8 / lưới 8 feed.
    for (const banned of this.bannedSampleCaptionPhrases()) {
      pushTitle(banned);
    }

    const lists = this.generatedListsByDeckId.get(deckId) ?? [];
    for (const list of lists) {
      pushTitle(list.coverTitle || list.title || '');
      pushTitle(list.postCaption || '');
      const cover = (list.pages || []).find((page) => page.type === 'cover');
      pushTitle(cover?.title || '');
      pushTitle(cover?.subtitle || '');
    }
    return [...new Set(titles)];
  }

  /** Gộp used titles của mọi deck dùng chung 1 pool hook tĩnh — tránh lặp hook giữa các mẫu cùng nhóm. */
  private getUsedCaptionTitlesForPool(poolKey: PremadeHookPoolKey): string[] {
    return getDeckIdsForPremadeHookPool(poolKey).flatMap((id) => this.getUsedCaptionTitles(id));
  }

  /** Chọn hook trang bìa từ pool tĩnh (không AI) cho các mẫu ngoài spotlight-v3/carousel-mau-1/spotlight-guide. */
  private resolvePremadeHookCoverTitle(deckId: string, seed: string): string {
    const poolKey = getPremadeHookPoolKey(deckId);
    if (!poolKey) return '';
    const hooks = loadPremadeHookPool(poolKey, this.dataRoot);
    if (!hooks.length) return '';
    return pickSpotlightV3Hook(hooks, this.getUsedCaptionTitlesForPool(poolKey), seed);
  }

  // ─── Caption AI & làm sạch chữ: caption-text.ts ──────────────────────────────
  // Hàm cần nguồn dữ liệu nhận nguồn đang chọn tại thời điểm gọi.

  private bannedSampleCaptionPhrases(): string[] {
    return captionText.bannedSampleCaptionPhrases();
  }

  private buildDeepSeekPrompt(
    deck: GuideDeck,
    deckList: GuideDeckList,
    tone: DeepSeekCaptionResponse['tone'],
    target: DeepSeekCaptionResponse['target'],
    current: { coverTitle: string; headline: string; body: string; hashtags: string[] },
    usedTitles: string[] = [],
  ): string {
    return captionText.buildDeepSeekPrompt(this.activeDestinationId, deck, deckList, tone, target, current, usedTitles);
  }

  private isPov3ImageMappingNote(value: string): boolean {
    return captionText.isPov3ImageMappingNote(value);
  }

  private async enrichPov3V2StackTaglines(pages: DeckPage[]): Promise<DeckPage[]> {
    if (!aiProvider.hasKey()) return pages;

    type Entry = { key: string; name: string; moTa: string };
    const entries: Entry[] = [];
    const seen = new Set<string>();

    for (const page of pages) {
      if (page.type !== 'list' || page.layoutVariant !== 'pov-3-v2-stack') continue;
      for (const item of page.items || []) {
        const moTa = String(item.label || item.imageNote || '').replace(/\s+/g, ' ').trim();
        if (!moTa || moTa.length < 24 || this.isPov3ImageMappingNote(moTa) || seen.has(moTa)) continue;
        seen.add(moTa);
        entries.push({ key: String(entries.length), name: item.name, moTa });
      }
    }
    if (entries.length === 0) return pages;

    const prompt = [
      'Bạn là copywriter TikTok Gen Z Việt Nam.',
      'Biến mô tả địa điểm từ Google Sheet thành 1 câu tagline ngắn, vui, gen Z.',
      'Mỗi tagline tối đa 90 ký tự, không emoji, không hashtag, không ngoặc vuông.',
      'Bắt buộc là câu hoàn chỉnh có nghĩa, kết thúc bằng dấu chấm. Không được cắt giữa chừng hay để cụt từ như "khi", "và", "của".',
      'Giữ đúng tinh thần địa điểm nhưng mỗi item phải diễn đạt khác nhau, tránh lặp cấu trúc.',
      'Trả về đúng JSON: {"items":[{"key":"0","tagline":"..."}]}',
      '',
      JSON.stringify(entries),
    ].join('\n');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await aiProvider.chat({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'Chỉ trả về JSON object hợp lệ, không markdown, không giải thích.' },
            { role: 'user', content: prompt },
          ],
          temperature: 1.05,
          max_tokens: 1200,
          stream: false,
        });
      if (!response.ok) return pages;

      const responseText = await response.text();
      let payload: any;
      try { payload = JSON.parse(responseText); } catch { return pages; }
      const content = String(payload?.choices?.[0]?.message?.content ?? '').trim();
      if (!content) return pages;

      const parsed = this.parseDeepSeekJson(content);
      const rows = Array.isArray(parsed.items) ? parsed.items : [];
      const taglineByMoTa = new Map<string, string>();
      for (const entry of entries) {
        const row = rows.find((item) => String((item as Record<string, unknown>).key ?? '').trim() === entry.key);
        const tagline = String((row as Record<string, unknown> | undefined)?.tagline ?? '')
          .replace(/\s+/g, ' ')
          .trim();
        const normalized = tagline ? truncatePov3V2StackTagline(tagline, 90) : '';
        if (normalized) taglineByMoTa.set(entry.moTa, normalized);
      }
      if (taglineByMoTa.size === 0) return pages;

      return pages.map((page) => {
        if (page.type !== 'list' || page.layoutVariant !== 'pov-3-v2-stack') return page;
        return {
          ...page,
          items: (page.items || []).map((item) => {
            const moTa = String(item.label || item.imageNote || '').replace(/\s+/g, ' ').trim();
            const tagline = taglineByMoTa.get(moTa);
            if (!tagline) return item;
            return { ...item, label: tagline, imageNote: tagline };
          }),
        };
      });
    } catch (error) {
      console.warn('[ai] Bỏ qua tagline bổ sung:', error instanceof AiError ? error.message : 'Không nhận được nội dung hợp lệ.');
      return pages;
    } finally {
      clearTimeout(timer);
    }
  }

  private parseDeepSeekJson(content: string): Record<string, unknown> {
    return captionText.parseDeepSeekJson(content);
  }

  private collectCaptionForbiddenNames(deckList: GuideDeckList): string[] {
    return captionText.collectCaptionForbiddenNames(deckList);
  }

  private sanitizeContentText(value: string): string {
    return captionText.sanitizeContentText(value);
  }

  private sanitizeGeneratedListText(list: GuideDeckList, deckId?: string): GuideDeckList {
    return captionText.sanitizeGeneratedListText(this.activeDestinationId, list, deckId);
  }

  private sanitizeDeckPageText(page: DeckPage): DeckPage {
    return captionText.sanitizeDeckPageText(this.activeDestinationId, page);
  }

  private sanitizePageItemText(item: PageItem, page?: DeckPage): PageItem {
    return captionText.sanitizePageItemText(item, page);
  }

  private enforceGrid8QuaytungMenuPage(page: ListPage): ListPage {
    return captionText.enforceGrid8QuaytungMenuPage(page);
  }

  private normalizeCaptionPayload(
    parsed: Record<string, unknown>,
    current: { coverTitle: string; headline: string; body: string; hashtags: string[] },
    target: DeepSeekCaptionResponse['target'],
    tone: DeepSeekCaptionResponse['tone'],
    deckId = '',
    forbiddenPlaceNames: string[] = [],
  ): { coverTitle: string; headline: string; body: string; hashtags: string[] } {
    return captionText.normalizeCaptionPayload(this.activeDestinationId, parsed, current, target, tone, deckId, forbiddenPlaceNames);
  }

  private async prepareWorkbookForDataset(forceRefresh: boolean): Promise<void> {
    if (!this.workbookSource) {
      const localSource = this.loadPreferredWorkbookSource(this.activeDestinationId);
      if (localSource) {
        this.workbookSource = localSource;
        this.workbookSourceByDestination.set(this.activeDestinationId, localSource);
        await this.refreshSheetDriveManifest(localSource, false);
        return;
      }
      if (isIsolatedSheetSource(this.activeDestinationId)) {
        throw new ServiceUnavailableException(`${getDestinationConfig(this.activeDestinationId).label} chưa được khởi tạo. Chọn Tải dữ liệu & chuyển để đồng bộ thủ công.`);
      }
      await this.syncWorkbookNow('tai du lieu lan dau');
      return;
    }

    // Một request /api/guide-data có thể đến trong lúc warmup vừa gán workbookSource
    // nhưng vẫn đang đồng bộ các link ảnh Hinh_nen vào manifest Drive. Nếu dựng dataset
    // ngay ở khoảng trống này, mẫu Đường một chiều sẽ thấy pool cover rỗng (0/2) và làm
    // hỏng toàn bộ lần tải dữ liệu. Mọi request dùng cùng lượt đồng bộ đang chạy và chỉ
    // tiếp tục sau khi manifest đã được ghi hoàn chỉnh.
    const pendingManifestSync = this.manifestSyncByDestination.get(this.activeDestinationId)?.promise;
    if (pendingManifestSync) {
      await pendingManifestSync;
    }

    if (forceRefresh) {
      const localSource = this.loadPreferredWorkbookSource(this.activeDestinationId);
      if (localSource) {
        await this.activateWorkbookSource(localSource, { retryKnownFailures: false });
      } else {
        // Nếu file trên đĩa bị mất/hỏng nhưng bộ nhớ còn tốt, không làm mất phiên đang dùng.
        console.warn('[xlsx] Không tìm thấy file cục bộ hợp lệ; giữ workbook đang có trong bộ nhớ.');
      }
      return;
    }

    if (this.AUTO_SYNC_ENABLED && !isIsolatedSheetSource(this.activeDestinationId) && getDestinationConfig(this.activeDestinationId).sourceType === 'google-sheet') {
      void this.triggerBackgroundSync();
    }
  }

  private async triggerBackgroundSync(): Promise<void> {
    const now = Date.now();
    if (this.syncPromise || (now - this.lastSyncTime) < this.AUTO_SYNC_INTERVAL_MS) {
      return;
    }

    try {
      await this.syncWorkbookNow('dong bo nen');
    } catch {
      // syncWorkbookNow already logs the error; keep serving the current Google Sheet snapshot.
    }
  }

  private async syncWorkbookNow(reason: string): Promise<void> {
    if (this.syncPromise) return this.syncPromise;

    this.isSyncing = true;
    console.log(`[sync] Không có XLSX cục bộ; tải Google Sheet dự phòng (${reason})...`);

    this.syncPromise = (async () => {
      try {
        const result = await fetchWorkbookFromSheet(getDestinationConfig(this.activeDestinationId));
        this.validateWorkbookData(result);
        this.workbookSource = result;
        this.workbookSourceByDestination.set(result.destinationId, result);
        this.saveWorkbookSnapshot(result, true);
        // Chờ manifest Drive xong trong cùng lượt sync để warmup build đúng 1 lần (không fire-and-forget rồi rebuild nền).
        await this.refreshSheetDriveManifest(result, reason === 'lam moi theo yeu cau');
        this.lastSyncTime = Date.now();
        console.log(`[sync] Đã lưu Google Sheet dự phòng thành XLSX cục bộ (${getDestinationConfig(this.activeDestinationId).label}): ${result.bytes} bytes.`);
      } catch (error) {
        console.error('[sync] Tai du lieu Google Sheet that bai:', error);
        this.lastSyncTime = Date.now();
        if (this.workbookSource) {
          console.warn('[sync] Dùng workbook đang có trong bộ nhớ.');
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new ServiceUnavailableException(
          message.includes('Google Sheet')
            ? message
            : `Không tải được Google Sheet (${getDestinationConfig(this.activeDestinationId).label}). ${message}`,
        );
      } finally {
        this.isSyncing = false;
        this.syncPromise = null;
      }
    })();

    return this.syncPromise;
  }

  private async refreshSheetDriveManifest(
    source: SheetWorkbookSource,
    retryKnownFailures = false,
    scheduleWarmAfterSync = true,
    revalidateUncached = false,
  ): Promise<void> {
    if (!hasSyncPermit()) { this.scheduleWarmDriveFileDiskCache(); return; }
    const sourceKey = `${source.fetchedAt}:${source.bytes}:${source.workbookName}:${retryKnownFailures ? 1 : 0}:${revalidateUncached ? 1 : 0}`;
    const existing = this.manifestSyncByDestination.get(source.destinationId);
    if (existing) {
      if (existing.sourceKey === sourceKey) return existing.promise;
      await existing.promise.catch(() => undefined);
      return this.refreshSheetDriveManifest(source, retryKnownFailures, scheduleWarmAfterSync, revalidateUncached);
    }

    const token = this.driveCacheWarmToken;
    // Luôn công bố trạng thái đồng bộ manifest, kể cả lượt khởi động đầu tiên. Frontend
    // dùng trạng thái này để giữ màn hình chặn cho tới khi workbook và Hinh_nen sẵn sàng.
    if (source.destinationId === this.activeDestinationId) {
      this.driveCacheWarmStatus = {
        ...this.driveCacheWarmStatus,
        phase: 'warming',
        ready: false,
        destinationId: this.activeDestinationId,
        total: 0,
        completed: 0,
        percent: 0,
        message: retryKnownFailures
          ? 'Đang xác thực ảnh Drive...'
          : 'Đang đọc workbook và tải danh sách ảnh Hinh_nen...',
      };
    }
    let promise!: Promise<void>;
    promise = (async () => {
      try {
        const previousManifest = readSheetDriveManifest(this.dataRoot, source.destinationId);
        const manifest = await buildSheetDriveManifest(source, previousManifest, {
          forceRevalidate: retryKnownFailures,
          revalidateUncached,
          onProgress: (completed, total) => {
            if (token !== this.driveCacheWarmToken || source.destinationId !== this.activeDestinationId) return;
            this.driveCacheWarmStatus = {
              ...this.driveCacheWarmStatus,
              phase: 'warming',
              ready: false,
              destinationId: this.activeDestinationId,
              total,
              completed,
              percent: total ? Math.min(99, Math.round((completed / total) * 100)) : 0,
              message: retryKnownFailures
                ? `Đang xác thực ảnh Drive (${completed}/${total})...`
                : `Đang tải dữ liệu ảnh từ workbook (${completed}/${total})...`,
            };
          },
        });
        writeSheetDriveManifest(this.dataRoot, manifest, source.destinationId);
        this.invalidateDatasetCache();
        if (scheduleWarmAfterSync && source.destinationId === this.activeDestinationId) {
          this.scheduleWarmDriveFileDiskCache({ retryKnownFailures });
        }
        console.log(`[sync] Dong bo anh Drive hoan tat: ${Object.keys(manifest.items).length} anh.`);
      } catch (error) {
        console.error('[sync] Dong bo anh Drive that bai:', error);
        // Sheet vừa sync xong đã đổi this.workbookSource — vẫn phải invalidate để dataset không bị
        // "kẹt" với dữ liệu Sheet cũ mãi, dù ảnh Drive đợt này lỗi.
        this.invalidateDatasetCache();
        // Nếu đã báo "Đang xác thực ảnh Drive..." ở trên mà bước này lỗi giữa đường, phải gỡ trạng thái
        // "chưa sẵn sàng" đó ra, không thì nút cập nhật dữ liệu sẽ trông như treo mãi ở % cũ.
        if (token === this.driveCacheWarmToken && source.destinationId === this.activeDestinationId) {
          this.driveCacheWarmStatus = {
            ...this.driveCacheWarmStatus,
            phase: 'error',
            ready: false,
            destinationId: this.activeDestinationId,
            message: `Tải dữ liệu ảnh Drive thất bại: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      } finally {
        const current = this.manifestSyncByDestination.get(source.destinationId);
        if (current?.promise === promise) {
          this.manifestSyncByDestination.delete(source.destinationId);
        }
      }
    })();

    this.manifestSyncByDestination.set(source.destinationId, { sourceKey, promise });
    return promise;
  }

  // ─── Utility ──────────────────────────────────────────────────────────────

  // ─── workbook-store.ts ─────────────────────────────────────────────
  private extractSheetId(value: string): string {
    return workbookStore.extractSheetId(value);
  }

  private parseGoogleSheetUrl(value: unknown): { sheetId: string; sheetUrl: string; exportUrl: string } {
    return workbookStore.parseGoogleSheetUrl(value);
  }

  private createDestinationShortLabel(label: string): string {
    return workbookStore.createDestinationShortLabel(label);
  }

  private normalizeDestinationLabel(value: unknown): string {
    return workbookStore.normalizeDestinationLabel(value);
  }

  private validateWorkbookUpload(file: LocalWorkbookUpload | undefined): LocalWorkbookUpload {
    return workbookStore.validateWorkbookUpload(file);
  }

  private createUploadedWorkbookSource(
    config: DestinationConfig,
    file: LocalWorkbookUpload,
  ): SheetWorkbookSource {
    return workbookStore.createUploadedWorkbookSource(this.dataRoot, config, file);
  }

  private validateWorkbookData(source: SheetWorkbookSource): void {
    return workbookStore.validateWorkbookData(source);
  }

  private readDestinationStats(id: DestinationId): Pick<DestinationSummary, 'totalItems' | 'syncedAt'> {
    return workbookStore.readDestinationStats(this.dataRoot, id);
  }

  private writeDestinationStats(id: DestinationId, totalItems: number): void {
    return workbookStore.writeDestinationStats(this.dataRoot, id, totalItems);
  }

  private workbookSnapshotPath(id: DestinationId): string {
    return workbookStore.workbookSnapshotPath(this.dataRoot, id);
  }

  private applyStoredWorkbookMetadata(config: DestinationConfig): void {
    return workbookStore.applyStoredWorkbookMetadata(this.dataRoot, config);
  }

  private writeWorkbookMetadata(id: DestinationId, workbookFileName: string): void {
    return workbookStore.writeWorkbookMetadata(this.dataRoot, id, workbookFileName);
  }

  private bundledWorkbookPath(id: DestinationId): string | null {
    return workbookStore.bundledWorkbookPath(this.toolRoot, id);
  }

  private loadPreferredWorkbookSource(id: DestinationId): SheetWorkbookSource | null {
    return workbookStore.loadPreferredWorkbookSource(this.dataRoot, this.toolRoot, id);
  }

  private saveWorkbookSnapshot(source: SheetWorkbookSource, throwOnError = false): void {
    return workbookStore.saveWorkbookSnapshot(this.dataRoot, source, throwOnError);
  }

  private async activateWorkbookSource(
    source: SheetWorkbookSource,
    options: { retryKnownFailures: boolean },
  ): Promise<void> {
    this.workbookSource = source;
    this.workbookSourceByDestination.set(source.destinationId, source);
    this.workbookDerivedCacheByDestination.delete(source.destinationId);
    this.workbookDerivedCache = null;
    this.workbookDerivedCacheFresh = false;
    this.workbookDerivedCacheTime = 0;
    this.invalidateDatasetCache({ immediate: true });
    await this.refreshSheetDriveManifest(source, options.retryKnownFailures);
  }

  private loadCustomDestinations(): void {
    if (!fs.existsSync(this.customDestinationsPath)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.customDestinationsPath, 'utf-8')) as {
        destinations?: Array<Partial<DestinationConfig>>;
      };
      for (const entry of parsed.destinations || []) {
        const id = String(entry.id || '').trim();
        const label = String(entry.label || '').trim();
        const sheetUrl = String(entry.sheetUrl || '').trim();
        const exportUrl = String(entry.exportUrl || '').trim();
        const sourceType = entry.sourceType === 'xlsx' ? 'xlsx' : 'google-sheet';
        if (!/^(sheet|xlsx)-[a-z0-9]+$/.test(id) || !label) continue;
        if (sourceType === 'google-sheet' && (!sheetUrl || !exportUrl)) continue;
        const sheetId = this.extractSheetId(sheetUrl);
        const sameSheetAs = (builtinId: string) => Boolean(sheetId) && isDestinationId(builtinId) && this.extractSheetId(getDestinationConfig(builtinId).sheetUrl) === sheetId;
        const kind = entry.kind === 'standard' || entry.kind === 'threads' ? entry.kind : undefined;
        // Sheet trùng nguồn dựng sẵn của máy (Test/Threads): nhận nguồn đó, giữ id và list cũ.
        const isThreads = sameSheetAs('dalat-threads');
        const isTest = !isThreads && sameSheetAs('dalat-test');
        if (isTest) unregisterDestination('dalat-test');
        if (isThreads) unregisterDestination('dalat-threads');
        registerDestination({
          id,
          label: isThreads ? 'Đà Lạt Threads' : isTest ? 'Đà Lạt Test' : label,
          shortLabel: isThreads ? 'ĐLH' : isTest ? 'ĐLT' : String(entry.shortLabel || this.createDestinationShortLabel(label)).slice(0, 3),
          sheetUrl,
          exportUrl,
          workbookName: String(entry.workbookName || `Google Sheet - ${label}`),
          workbookFileName: String(entry.workbookFileName || entry.workbookName || `${label}.xlsx`),
          sourceType,
          partnerFirst: Boolean(entry.partnerFirst),
          ...(kind ? { kind } : {}),
          ...(entry.contentDestinationId === 'dalat' ? { contentDestinationId: 'dalat' } : {}),
          ...(isTest || isThreads ? { contentDestinationId: 'dalat', partnerFirst: false, kind: isThreads ? 'threads' as const : 'standard' as const } : {}),
        });
      }
    } catch (error) {
      console.warn(
        '[destination] Không đọc được danh sách Google Sheet tùy chỉnh:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  private persistCustomDestinations(): void {
    this.ensureDataRoot();
    // Nguồn dựng sẵn giữ link trong source-links.json; ở đây chỉ nguồn người dùng tự thêm.
    const destinations = getDestinationList().filter((entry) => !BUILTIN_SOURCES[entry.id]);
    fs.writeFileSync(
      this.customDestinationsPath,
      JSON.stringify({ version: 1, destinations }, null, 2),
      'utf-8',
    );
  }

  private getActiveDestinationSummary(): DestinationSummary {
    return this.getDestinationSummary(this.activeDestinationId);
  }

  private getDestinationSummary(id: DestinationId): DestinationSummary {
    const stats = this.readDestinationStats(id);
    const config = getDestinationConfig(id);
    this.applyStoredWorkbookMetadata(config);
    return {
      ...toDestinationInfo(config),
      hasLocalWorkbook: Boolean(
        this.workbookSourceByDestination.get(id)
        || fs.existsSync(this.workbookSnapshotPath(id))
        || this.bundledWorkbookPath(id),
      ),
      hasSheetFallback: Boolean(config.sheetUrl && config.exportUrl),
      ...stats,
    };
  }

  /** Nguồn mở mặc định: chỉ nguồn đã có dữ liệu trên máy (nguồn vừa thêm chưa tải xong chờ ở màn thêm nguồn). */
  private defaultActiveDestinationId(): DestinationId {
    const ready = getDestinationList().map(entry => entry.id)
      .filter(id => fs.existsSync(this.workbookSnapshotPath(id)) || Boolean(this.bundledWorkbookPath(id)));
    const preferred = firstDestinationId();
    return ready.includes(preferred) ? preferred : ready[0] || '';
  }

  private loadActiveDestinationId(): DestinationId {
    if (!fs.existsSync(this.activeDestinationPath)) return this.defaultActiveDestinationId();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.activeDestinationPath, 'utf-8')) as { id?: string };
      const id = String(parsed.id ?? '').trim();
      return isDestinationId(id) ? id : this.defaultActiveDestinationId();
    } catch {
      return this.defaultActiveDestinationId();
    }
  }

  /** Đổi link Google Sheet của một nguồn trên máy này (link không nằm trong code). */
  updateDestinationSheetLink(idValue: string, request: { sheetUrl?: unknown }): DestinationListResponse {
    const id = String(idValue || '').trim();
    if (!isDestinationId(id)) throw new NotFoundException('Nguồn dữ liệu không tồn tại.');
    const sheet = this.parseGoogleSheetUrl(request?.sheetUrl);
    const duplicate = getDestinationList().find((entry) => entry.id !== id && this.extractSheetId(entry.sheetUrl) === sheet.sheetId);
    if (duplicate) throw new BadRequestException(`Google Sheet này đang dùng cho nguồn "${duplicate.label}".`);
    const config = getDestinationConfig(id);
    config.sheetUrl = sheet.sheetUrl;
    config.exportUrl = sheet.exportUrl;
    if (BUILTIN_SOURCES[id]) updateBuiltinSourceLinks(this.dataRoot, this.toolRoot, id, { sheetUrl: sheet.sheetUrl, exportUrl: sheet.exportUrl });
    else this.persistCustomDestinations();
    return this.getDestinations();
  }

  private saveActiveDestinationId(id: DestinationId): void {
    this.ensureDataRoot();
    fs.writeFileSync(this.activeDestinationPath, JSON.stringify({ id, savedAt: new Date().toISOString() }, null, 2), 'utf-8');
  }

  private getDestinationDataPath(baseName: string): string {
    return fileIo.getDestinationDataPath(this.dataRoot, baseName, this.activeDestinationId);
  }

  private resolveDestinationDataPath(baseName: string): string {
    return fileIo.resolveDestinationDataPath(this.dataRoot, baseName, this.activeDestinationId);
  }

  private resetDestinationScopedState(): void {
    this.generatedListsLoaded = false;
    this.generatedListsByDeckId.clear();
    this.partnerRotation = {};
    this.localTemplateState = {};
    this.inventoryLoaded = false;
    this.usedAllocator = new DataAllocator();
    this.driveAccessCacheLoadedFor = null;
  }

  private cloneJson<T>(value: T): T {
    return fileIo.cloneJson(value);
  }
}
