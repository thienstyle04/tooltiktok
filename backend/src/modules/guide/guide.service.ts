// ─── GuideService: orchestration, caching, AI captions ───────────────────────
import 'dotenv/config';
import { BadRequestException, Injectable, NotFoundException, OnApplicationBootstrap, ServiceUnavailableException } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';

import {
  CaptionBlocks,
  AddDestinationRequest,
  AddDestinationResponse,
  CoverPage,
  DatasetBuildContext,
  DeckPage,
  DeepSeekCaptionRequest,
  DeepSeekCaptionResponse,
  GenerateBatchListsRequest,
  GenerateBatchListsResponse,
  GenerateCaptionDeckRequest,
  GenerateCaptionDeckResponse,
  GeneratePartnerSpotlightRequest,
  GeneratePartnerSpotlightResponse,
  GeneratedListsStore,
  GuideDeck,
  GuideDeckList,
  GuideDataset,
  GuideItem,
  ImageLibraryFolderEntry,
  ImageMappingFile,
  ListPage,
  PageItem,
  ReferenceSet,
  SectionKey,
  UpdateGeneratedListCoverRequest,
  UpdateGeneratedListCoverResponse,
  WorkbookItemsBySection,
  DestinationId,
  DestinationListResponse,
  DestinationSummary,
  SetDestinationRequest,
  SetDestinationResponse,
} from '../../common/interfaces/guide.types';

import { SECTION_CONFIG } from '../../common/constants/guide.constants';

import {
  buildImageLibraryEntries,
  createListImageResolver,
  getConfiguredLibraryRoots,
  getImageLibraryRoot,
  imageUrlsForDirectory,
  normalizeText,
  readAssetFromBase,
  resolveMappedImage,
  safeRelative,
  stableHash,
  firstValue,
  itemMappingKey,
} from './logic/image-resolver';

import { DataAllocator, itemUsageKey } from './logic/data-allocator';
import { applyCaptionToPages, BUDGET_3N2D_STORY_TEMPLATE_VERSION, BUDGET_3N2D_TEMPLATE_VERSION, BUDGET_72H_SUMMARY_TEMPLATE_VERSION, buildDecks, buildDeckList, buildPagesForDeck, buildSpotlightPartnerPages, createDeckBuildPools, displayPrice, finalizePov3V2Tagline, GRID_4_MUTANT_TEMPLATE_VERSION, GRID_4_TEMPLATE_VERSION, GRID_5_TEMPLATE_VERSION, GRID_6_TEMPLATE_VERSION, GRID_6_ZIGZAG_TEMPLATE_VERSION, GRID_8_TEMPLATE_VERSION, ITINERARY_3N2D_TEMPLATE_VERSION, ITINERARY_4N2D_GRID8_TEMPLATE_VERSION, ITINERARY_4N3D_TEMPLATE_VERSION, metaText, POV_3_DAY_TEMPLATE_VERSION, sanitizeCaptionBodyForPages, sanitizeDeckHeadline, SPOTLIGHT_GUIDE_TEMPLATE_VERSION, SPOTLIGHT_PARTNER_TEMPLATE_VERSION, truncateGrid8CoverSubtitle, truncateGrid8FeedCoverSubtitle, truncatePov3V2StackTagline, truncateSpotlightV2CoverSubtitle } from './logic/deck-builder';
import { BUDGET_4N3D_WALLET_TEMPLATE_VERSION, GRID_6_QUAYTUNG_TEMPLATE_VERSION, GRID_8_FEED_TEMPLATE_VERSION, GRID_8_QUAYTUNG_TEMPLATE_VERSION, ITINERARY_4N3D_STACK_TEMPLATE_VERSION, ITINERARY_TIMELINE_TEMPLATE_VERSION, normalizeGrid8FeedPostCaption, POV_3_V2_TEMPLATE_VERSION, SPOTLIGHT_V2_TEMPLATE_VERSION, SPOTLIGHT_V3_TEMPLATE_VERSION, setSpotlightV3BuildContext, clearSpotlightV3BuildContext, tuneSpotlightV2Cover } from './logic/deck-builder-v2';
import { loadSpotlightV3Hooks } from './sync/spotlight-hook-source';
import { DriveFileAsset, clearDriveAccessibilityCache, clearKnownFailedDriveFileIds, configureDriveFileDiskCache, fetchDriveFileAsset, filterKnownAccessibleDriveProxyUrls, filterVerifiedAccessibleDriveProxyUrls, getDriveImageProxyUrl, isKnownFailedDriveFileId, isKnownInaccessibleDriveProxyUrl, listUncachedDriveFileIds, setCachedDriveFileAccessibility, warmDriveFileDiskCache } from './sync/drive-images';
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
} from './sync/destination-config';
import { resolveSectionKeyFromSheetName } from './sync/sheet-section';
import { localizeDecks, localizeText, setActiveDestinationLocalize, getMarketingCopy, buildCaptionHashtags, getDeckHashtagExtras, resolveDeckIdFromListId, cityLabel } from './sync/destination-localize';
import { fetchWorkbookFromSheet, SheetWorkbookSource } from './sync/workbook-source';
import { resolveBackendDataDir, resolveBackendRoot, resolveWorkspaceRoot } from '../../config';

const GENERATED_CAPTION_BODY_FALLBACK = 'Lưu list này để có lịch đi Đà Lạt gọn hơn, dễ chọn điểm theo buổi và đỡ mất thời gian mò từng nơi.';
const RECENT_LIST_IMAGE_WINDOW = 1;
const SPOTLIGHT_PARTNER_POST_CAPTION = 'Bỏ túi ngay, kẻo đi Đà Lạt lại loay hoay 😉';
const SPOTLIGHT_PARTNER_CAPTION_BODY = 'Nếu chỉ có 3 ngày ở Đà Lạt, cứ lưu list này trước. Các điểm được chia theo khung giờ để đi đỡ vòng và đỡ phát sinh.';
type CaptionTone = DeepSeekCaptionResponse['tone'];

// Phần dữ liệu "nặng" (đọc Google Sheet, dò ảnh, build 22 mẫu deck) — chỉ cần build lại khi
// Sheet/ảnh thật sự đổi. Tách riêng khỏi list AI để CRUD list không bao giờ phải chờ rebuild.
interface WorkbookDerivedContext {
  imageUrls: string[];
  coverImageUrls: string[];
  imageLibraryEntries: ImageLibraryFolderEntry[];
  itemsBySection: WorkbookItemsBySection;
  baseDecks: GuideDeck[];
  totalItems: number;
  mappedItemCount: number;
  manualMappedItemCount: number;
  autoMappedItemCount: number;
}

export interface DriveCacheWarmStatus {
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
}

/** Sleep đồng bộ ngắn (không await) dùng cho retry ghi file — an toàn vì chỉ chờ tối đa vài trăm ms. */
function sleepSyncMs(ms: number): void {
  const view = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(view, 0, 0, ms);
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
  private generatedListsLoaded = false;
  private usedAllocator = new DataAllocator();
  private inventoryLoaded = false;

  // ─── In-memory caches ──────────────────────────────────────────────────────
  private workbookDerivedCache: WorkbookDerivedContext | null = null;
  private workbookDerivedCacheTime = 0;
  private workbookDerivedCacheFresh = false;
  private readonly DATASET_CACHE_TTL_MS = 20 * 60 * 1000; // chỉ dùng khi tắt session-sticky
  private datasetRebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly DATASET_REBUILD_DEBOUNCE_MS = 800; // gộp nhiều lần invalidate liên tiếp thành 1 lần build nền.
  private readonly FORCE_SYNC_MIN_INTERVAL_MS = 60 * 1000; // không ép đồng bộ lại Google Sheet quá 1 lần/phút dù FE gọi refresh=1 liên tục.

  private imageLibraryEntriesCache: ImageLibraryFolderEntry[] | null = null;
  private imageLibraryEntriesCacheTime = 0;
  private readonly IMAGE_LIBRARY_CACHE_TTL_MS = 60_000; // 60 giây

  private imageMappingCache: ImageMappingFile | null = null;
  private imageMappingCacheTime = 0;
  private readonly IMAGE_MAPPING_CACHE_TTL_MS = 30_000; // 30 giây

  private lastSyncTime = 0;
  private isSyncing = false;
  private syncPromise: Promise<void> | null = null;
  private manifestSyncPromise: Promise<void> | null = null;
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

  constructor() {
    this.loadCustomDestinations();
    this.activeDestinationId = this.loadActiveDestinationId();
    this.driveCacheWarmStatus.destinationId = this.activeDestinationId;
    setActiveDestinationLocalize(this.activeDestinationId);
    const cacheDir = String(process.env.DALAT_DRIVE_FILE_CACHE_DIR || '').trim()
      || path.join(this.dataRoot, 'drive-file-cache');
    configureDriveFileDiskCache(cacheDir);
    console.log(`[drive-cache] Disk cache dir: ${cacheDir}`);
  }

  // Chạy ngay khi backend khởi động (trước khi bất kỳ request nào tới) để "làm nóng" dữ liệu:
  // tải Google Sheet + build dataset lần đầu ở đây, thay vì để request đầu tiên của người dùng
  // phải gánh 12-25s đó (và dễ gặp lỗi 500/503 nếu trùng lúc backend chưa sẵn sàng).
  onApplicationBootstrap(): void {
    // Warm ảnh từ manifest cục bộ ngay lập tức. Không chờ Google Sheet vì lần sync đầu
    // có thể chậm hoặc mất kết nối, khiến giao diện khóa ở trạng thái "đang kiểm tra" 0%.
    this.scheduleWarmDriveFileDiskCache();
    void this.warmUpDatasetCache();
  }

  private async warmUpDatasetCache(): Promise<void> {
    this.destinationDataLoading = true;
    this.destinationDataError = '';
    try {
      console.log('[warmup] Đang tải Google Sheet và build dataset trước khi nhận request...');
      const t0 = Date.now();
      // Hook Doc phải sẵn trước khi build deck spotlight-v3 (cover title).
      await this.warmSpotlightV3Hooks();
      await this.prepareWorkbookForDataset(false);
      // Chờ manifest Drive xong rồi mới build 1 lần — tránh sync xong lại invalidate/rebuild lần 2.
      if (this.manifestSyncPromise) {
        await this.manifestSyncPromise.catch(() => undefined);
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
      if (this.activeDestinationId !== DEFAULT_DESTINATION_ID) {
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

  /** Máy mới: tự tải ảnh Drive còn thiếu vào backend/data/drive-file-cache (chạy nền). */
  private scheduleWarmDriveFileDiskCache(options: { retryKnownFailures?: boolean } = {}): void {
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
      }
      const coverLimit = Math.max(0, Number(process.env.DALAT_DRIVE_CACHE_COVER_LIMIT || 120));
      for (const cover of (manifest.coverImages || []).slice(0, coverLimit)) {
        const fileId = String(cover?.fileId || '').trim();
        if (fileId) ids.add(fileId);
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
      concurrency: Math.min(Math.max(Number(process.env.DALAT_DRIVE_CACHE_CONCURRENCY || 4), 1), 4),
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
    const completed = warmed.skipped + warmed.ok + warmed.fail;
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
        ? `Đã hoàn tất cache ảnh; ${warmed.fail} ảnh Drive không tải được và sẽ dùng ảnh dự phòng.`
        : 'Đã tải xong ảnh Drive vào cache. Bạn có thể tạo list.',
    };
  }

  getDriveCacheWarmStatus(): DriveCacheWarmStatus {
    const datasetIsReady = Boolean(this.workbookSource && this.workbookDerivedCache);
    if (this.destinationDataLoading && !datasetIsReady) {
      return {
        ...this.driveCacheWarmStatus,
        phase: this.driveCacheWarmStatus.phase === 'error' ? 'error' : this.driveCacheWarmStatus.phase,
        ready: false,
        destinationId: this.activeDestinationId,
        message: this.driveCacheWarmStatus.phase === 'warming'
          ? `Đang tải dữ liệu ${getDestinationConfig(this.activeDestinationId).label} và ${this.driveCacheWarmStatus.message.toLowerCase()}`
          : `Đang tải dữ liệu Google Sheet (${getDestinationConfig(this.activeDestinationId).label})...`,
      };
    }
    if (this.destinationDataError) {
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
    return { ...this.driveCacheWarmStatus, destinationId: this.activeDestinationId };
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

  // ─── Static file serving ──────────────────────────────────────────────────

  getToolTextFile(fileName: string): string {
    const target = path.join(this.toolRoot, fileName);
    if (!safeRelative(this.toolRoot, target) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      throw new NotFoundException(`Tool file not found: ${fileName}`);
    }
    return fs.readFileSync(target, 'utf-8');
  }

  getToolBinaryFile(fileName: string): Buffer {
    const target = path.join(this.toolRoot, fileName);
    if (!safeRelative(this.toolRoot, target) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      throw new NotFoundException(`Tool file not found: ${fileName}`);
    }
    return fs.readFileSync(target);
  }

  private ensureDataRoot(): void {
    fs.mkdirSync(this.dataRoot, { recursive: true });
  }

  /**
   * Ghi file JSON qua file tạm rồi rename (atomic hơn) + retry ngắn khi gặp lỗi
   * khoá file thoáng qua trên Windows (Defender/OneDrive quét file lúc đang ghi
   * ra "UNKNOWN: unknown error, open ..." hoặc EBUSY). Tránh việc create/delete
   * list bị 500 giữa chừng do va lỗi ghi đè cùng lúc.
   */
  private writeJsonFileSafe(targetPath: string, data: unknown): void {
    const json = JSON.stringify(data, null, 2);
    const tmpPath = `${targetPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const maxAttempts = 5;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        fs.writeFileSync(tmpPath, json, 'utf-8');
        fs.renameSync(tmpPath, targetPath);
        return;
      } catch (error) {
        lastError = error;
        try { fs.unlinkSync(tmpPath); } catch { /* file tạm có thể chưa được tạo, bỏ qua */ }
        if (attempt < maxAttempts) sleepSyncMs(50 * attempt);
      }
    }
    throw lastError;
  }

  getFrontendTextFile(fileName: string): string {
    const target = path.join(this.frontendRoot, fileName);
    if (!safeRelative(this.frontendRoot, target) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      throw new NotFoundException(`Frontend file not found: ${fileName}`);
    }
    return fs.readFileSync(target, 'utf-8');
  }

  getFrontendBinaryFile(fileName: string): Buffer {
    const target = path.join(this.frontendRoot, fileName);
    if (!safeRelative(this.frontendRoot, target) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      throw new NotFoundException(`Frontend file not found: ${fileName}`);
    }
    return fs.readFileSync(target);
  }

  guessMime(fileName: string): string {
    const mimeByExtension: Record<string, string> = {
      '.css': 'text/css; charset=utf-8',
      '.gif': 'image/gif',
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.jfif': 'image/jpeg',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.ttf': 'font/ttf',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.webp': 'image/webp',
    };
    return mimeByExtension[path.extname(fileName).toLowerCase()] ?? 'application/octet-stream';
  }

  // ─── Asset serving ────────────────────────────────────────────────────────

  getDalatAsset(fileName: string): Buffer {
    return readAssetFromBase(this.dalatImageDir, fileName);
  }

  getTiktokAsset(folderName: string, fileName: string): Buffer {
    return readAssetFromBase(path.join(this.tiktokReferenceDir, folderName), fileName);
  }

  getWorkspaceAsset(relativePath: string): Buffer {
    if (!relativePath) throw new NotFoundException('Asset path is required.');
    return readAssetFromBase(this.workspaceRoot, relativePath);
  }

  getLibraryAsset(relativePath: string, rootKey = 'main'): Buffer {
    const imageMapping = this.loadImageMapping();
    const libraryRoot = getConfiguredLibraryRoots(imageMapping, this.workspaceRoot).find((e) => e.key === rootKey)?.path ?? '';
    if (!libraryRoot) throw new NotFoundException('Image library root not found.');
    if (!relativePath) throw new NotFoundException('Asset path is required.');
    return readAssetFromBase(libraryRoot, relativePath);
  }

  async getDriveFileAsset(fileId: string): Promise<DriveFileAsset> {
    const normalizedFileId = String(fileId ?? '').trim();
    if (!normalizedFileId) {
      throw new NotFoundException('Drive file id is required.');
    }
    return fetchDriveFileAsset(normalizedFileId);
  }

  /**
   * Kiểm tra nhanh disk cache (không tải mạng) — FE dùng để bỏ prefetch khi đã đủ ảnh.
   */
  getDriveFilesCacheStatus(fileIds: string[]): {
    total: number;
    cached: number;
    missing: string[];
  } {
    const ids = [...new Set((fileIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
    const missing = listUncachedDriveFileIds(ids);
    return {
      total: ids.length,
      cached: ids.length - missing.length,
      missing,
    };
  }

  /**
   * Máy mới / trước khi xuất: tải trước các fileId cần dùng vào disk cache
   * với concurrency thấp (tránh storm Drive lúc render hàng loạt).
   */
  async prefetchDriveFiles(fileIds: string[]): Promise<{
    total: number;
    skipped: number;
    ok: number;
    fail: number;
    cancelled: boolean;
  }> {
    const ids = [...new Set((fileIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
    if (!ids.length) {
      return { total: 0, skipped: 0, ok: 0, fail: 0, cancelled: false };
    }
    const missing = listUncachedDriveFileIds(ids);
    if (!missing.length) {
      console.log(`[drive-cache] Prefetch bỏ qua — đủ cache disk (${ids.length}/${ids.length}).`);
      return { total: ids.length, skipped: ids.length, ok: 0, fail: 0, cancelled: false };
    }
    const concurrency = Math.min(Math.max(Number(process.env.DALAT_DRIVE_CACHE_CONCURRENCY || 3), 1), 5);
    console.log(`[drive-cache] Prefetch ${missing.length}/${ids.length} ảnh còn thiếu (concurrency=${concurrency})...`);
    const warmed = await warmDriveFileDiskCache(missing, { concurrency });
    return {
      total: ids.length,
      skipped: ids.length - missing.length + warmed.skipped,
      ok: warmed.ok,
      fail: warmed.fail,
      cancelled: warmed.cancelled,
    };
  }

  // ─── Dataset ──────────────────────────────────────────────────────────────

  getDestinations(): DestinationListResponse {
    return {
      active: this.getActiveDestinationSummary(),
      destinations: getDestinationList().map((entry) => this.getDestinationSummary(entry.id)),
    };
  }

  async addDestination(request: AddDestinationRequest): Promise<AddDestinationResponse> {
    const label = String(request?.label || '').replace(/\s+/g, ' ').trim();
    if (label.length < 2 || label.length > 60) {
      throw new BadRequestException('Tên nguồn dữ liệu phải có từ 2 đến 60 ký tự.');
    }

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
    };
    const previousDestinationId = this.activeDestinationId;

    let source: SheetWorkbookSource;
    try {
      source = await fetchWorkbookFromSheet(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(
        `${message}. Hãy kiểm tra link và cấp quyền "Bất kỳ ai có đường liên kết đều có thể xem".`,
      );
    }

    registerDestination(config);
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
        this.workbookSource = this.loadWorkbookSnapshot(nextId);
        if (this.workbookSource) {
          this.workbookSourceByDestination.set(nextId, this.workbookSource);
        }
      }
      this.workbookDerivedCache = this.workbookDerivedCacheByDestination.get(nextId) || null;
      this.workbookDerivedCacheFresh = Boolean(this.workbookDerivedCache);
      this.workbookDerivedCacheTime = this.workbookDerivedCache ? Date.now() : 0;
      this.invalidateDatasetCache({ immediate: !this.workbookDerivedCache });
      this.scheduleWarmDriveFileDiskCache();
    }

    const needsFirstLoad = !this.workbookSource;
    this.destinationDataLoading = needsFirstLoad;
    this.destinationDataError = '';
    try {
      if (needsFirstLoad) {
        await this.syncWorkbookNow(switchingDestination ? 'tai diem den lan dau' : 'tai du lieu lan dau');
      }
      const dataset = await this.getDataset();
      if (this.workbookSource) {
        this.workbookSourceByDestination.set(this.activeDestinationId, this.workbookSource);
      }
      if (this.workbookDerivedCache) {
        this.workbookDerivedCacheByDestination.set(this.activeDestinationId, this.workbookDerivedCache);
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
          || this.loadWorkbookSnapshot(previousDestinationId);
        if (this.workbookSource) {
          this.workbookSourceByDestination.set(previousDestinationId, this.workbookSource);
        }
        this.workbookDerivedCache = this.workbookDerivedCacheByDestination.get(previousDestinationId) || null;
        this.workbookDerivedCacheFresh = Boolean(this.workbookDerivedCache);
        this.workbookDerivedCacheTime = this.workbookDerivedCache ? Date.now() : 0;
        this.invalidateDatasetCache({ immediate: !this.workbookDerivedCache });
        this.destinationDataError = '';
        this.scheduleWarmDriveFileDiskCache();
      } else {
        this.destinationDataError = error instanceof Error ? error.message : String(error);
      }
      throw error;
    } finally {
      this.destinationDataLoading = false;
    }
  }

  async getDataset(options: { refresh?: boolean } = {}): Promise<GuideDataset> {
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
            `Hệ thống tự động chuyển đổi dữ liệu ${destination.label} từ Google Sheet thành các bộ ảnh TikTok Carousel chuyên nghiệp.`,
          note:
            `Dữ liệu và hình ảnh đang được đồng bộ trực tiếp từ Google Sheet ${destination.label}. Bạn có thể cập nhật nội dung và Drive link trong Sheet để thay đổi kết quả.`,
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
    const deckId = String(request.deckId ?? '').trim();
    if (!deckId) throw new BadRequestException('Thiếu deckId để gửi sang DeepSeek.');

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

    const apiKey = String(process.env.DEEPSEEK_API_KEY ?? '').trim();
    if (!apiKey) {
      throw new BadRequestException(
        'Thiếu DEEPSEEK_API_KEY trên server. Hãy chạy: $env:DEEPSEEK_API_KEY="sk-..." rồi npm run start:dev',
      );
    }

    const prompt = this.buildDeepSeekPrompt(deck, deckList, tone, target, current, this.getUsedCaptionTitles(deck.id));
    const deepseekController = new AbortController();
    const deepseekTimeout = setTimeout(() => deepseekController.abort(), 30_000);
    let response: Response;
    try {
      response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'Bạn là content creator du lịch TikTok. Chỉ trả về đúng JSON object hợp lệ, không thêm markdown, không giải thích.' },
            { role: 'user', content: prompt },
          ],
          temperature: 1.1,
          max_tokens: 900,
          stream: false,
        }),
        signal: deepseekController.signal,
      });
    } catch (fetchError: any) {
      clearTimeout(deepseekTimeout);
      if (fetchError?.name === 'AbortError') {
        throw new BadRequestException('DeepSeek API không phản hồi sau 30 giây. Vui lòng thử lại.');
      }
      throw new BadRequestException(`Không kết nối được DeepSeek: ${fetchError?.message || fetchError}`);
    } finally {
      clearTimeout(deepseekTimeout);
    }

    const responseText = await response.text();
    if (!response.ok) throw new BadRequestException(`DeepSeek API lỗi HTTP ${response.status}: ${responseText}`);

    let payload: any;
    try { payload = JSON.parse(responseText); } catch { throw new BadRequestException('Không đọc được phản hồi JSON từ DeepSeek.'); }

    const content = String(payload?.choices?.[0]?.message?.content ?? '').trim();
    if (!content) throw new BadRequestException('DeepSeek không trả về nội dung caption.');

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

  updateGeneratedListCover(
    deckId: string,
    listId: string,
    request: UpdateGeneratedListCoverRequest,
  ): UpdateGeneratedListCoverResponse {
    this.ensureGeneratedListsLoaded();
    const existing = this.generatedListsByDeckId.get(deckId);
    if (!existing) throw new NotFoundException(`Khong tim thay deck: ${deckId}`);

    const listIndex = existing.findIndex((list) => list.id === listId);
    if (listIndex < 0) throw new NotFoundException(`Khong tim thay list: ${listId}`);

    const coverTitle = this.sanitizeContentText(sanitizeDeckHeadline(String(request.coverTitle ?? '').trim())).slice(0, 60);
    const coverSubtitle = this.sanitizeContentText(String(request.coverSubtitle ?? '').replace(/\s+/g, ' ').trim()).slice(0, 220);
    const list = this.cloneJson(existing[listIndex]);
    const pages = (list.pages || []).map((page, index) => {
      if (index !== 0 || page.type !== 'cover') return page;
      return {
        ...page,
        title: coverTitle || page.title,
        subtitle: coverSubtitle,
      };
    });

    const nextList: GuideDeckList = {
      ...list,
      title: coverTitle || list.title,
      coverTitle: coverTitle || list.coverTitle || list.title,
      pages,
    };
    const sanitizedNextList = this.sanitizeGeneratedListText(nextList, deckId);

    const nextLists = [...existing];
    nextLists[listIndex] = sanitizedNextList;
    this.generatedListsByDeckId.set(deckId, nextLists);
    this.persistGeneratedLists();

    const coverPage = sanitizedNextList.pages[0]?.type === 'cover' ? sanitizedNextList.pages[0] : null;
    return {
      deckId,
      listId,
      coverTitle: sanitizedNextList.coverTitle || sanitizedNextList.title,
      coverSubtitle: coverPage?.subtitle || '',
    };
  }

  async generateDeckFromCaption(request: GenerateCaptionDeckRequest): Promise<GenerateCaptionDeckResponse> {
    this.assertDriveCacheReady();
    this.ensureGeneratedListsLoaded();
    const deckId = String(request.deckId ?? '').trim();
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

    if (!caption.body) throw new BadRequestException('Cần có body caption trước khi tạo list mới.');
    if (deckId !== 'spotlight-v3' && !caption.coverTitle) {
      throw new BadRequestException('Cần có tiêu đề cover (≤ 35 ký tự) trước khi tạo list mới.');
    }

    await this.prepareWorkbookForDataset(false);
    const context = this.buildDatasetContext();
    const currentDeck = context.decks.find((d) => d.id === deckId);
    if (!currentDeck) throw new NotFoundException(`Không tìm thấy deck: ${deckId}`);

    const existing = this.generatedListsByDeckId.get(deckId) ?? [];
    // Sử dụng timestamp + index để đảm bảo ID không bao giờ trùng kể cả khi xóa bớt
    const timestamp = Date.now().toString(36).slice(-4);
    const generatedNumber = existing.length + 1;
    const generatedSuffix = `${String(generatedNumber).padStart(2, '0')}-${timestamp}`;

    const requestedTone = this.normalizeCaptionTone(request.tone);
    const seed = [deckId, generatedSuffix, String(existing.length), requestedTone, caption.coverTitle, caption.headline, caption.body, caption.hashtags.join(' '), timestamp].join('|');

    this.ensureInventoryLoaded();
    const deckUsage = this.createUsageScope();
    currentDeck.lists.forEach((list) => this.markUsedInDeck(list.pages, deckUsage));
    // Cùng mẫu: list mới ưu tiên DL chưa dùng ở list trước; nếu pool ít thì tái dùng DL + đổi ảnh (seed + imageUrls đã dùng).
    for (const prevList of existing) {
      for (const page of prevList.pages) {
        if (page.backgroundImage) deckUsage.imageUrls.add(page.backgroundImage);
        if (page.type !== 'list') continue;
        for (const item of page.items) {
          if (item.imageUrl) deckUsage.imageUrls.add(item.imageUrl);
        }
      }
    }
    if (deckId === 'spotlight-v3') {
      await this.warmSpotlightV3Hooks();
      setSpotlightV3BuildContext({
        destinationId: this.activeDestinationId,
        usedHookTitles: this.getUsedCaptionTitles(deckId),
      });
    }
    let basePages: DeckPage[];
    try {
      basePages = buildPagesForDeck(
        deckId,
        context.itemsBySection,
        context.imageUrls,
        context.imageLibraryEntries,
        seed,
        deckUsage.itemIds,
        deckUsage.imageUrls,
        context.coverImageUrls,
      );
    } finally {
      clearSpotlightV3BuildContext();
    }
    const hookCoverTitle = deckId === 'spotlight-v3'
      ? String((basePages.find((page) => page.type === 'cover') as CoverPage | undefined)?.title || '').trim()
      : '';
    const safeCaption = {
      ...caption,
      coverTitle: this.sanitizeContentText(sanitizeDeckHeadline(hookCoverTitle || caption.coverTitle)),
      headline: this.sanitizeContentText(caption.headline),
      body: this.sanitizeContentText(sanitizeCaptionBodyForPages(caption.body, basePages)),
    };
    const finalCaption = deckId === 'budget-3n2d' || deckId === 'budget-3n2d-story' || deckId === 'budget-72h-summary'
      ? this.budget3N2DCoverCaption(safeCaption, requestedTone, seed, generatedNumber)
      : safeCaption;
    let generatedPages = applyCaptionToPages(basePages, finalCaption);
    if (deckId === 'pov-3-v2') {
      generatedPages = await this.enrichPov3V2StackTaglines(generatedPages);
    }

    const generatedList = buildDeckList(deckId, `caption-${generatedSuffix}`, `AI ${String(generatedNumber).padStart(2, '0')}`, finalCaption.coverTitle, finalCaption.body, generatedPages);
    generatedList.coverTitle = finalCaption.coverTitle;
    generatedList.postCaption = finalCaption.headline;
    generatedList.captionHashtags = finalCaption.hashtags;
    generatedList.templateVersion = this.templateVersionForDeck(deckId);
    const sanitizedGeneratedList = this.sanitizeGeneratedListText(generatedList, deckId);

    this.markUsedInDeck(sanitizedGeneratedList.pages);
    this.persistInventory();

    this.generatedListsByDeckId.set(deckId, [...existing, sanitizedGeneratedList]);
    this.persistGeneratedLists();

    return { deckId, listId: sanitizedGeneratedList.id, navTitle: sanitizedGeneratedList.navTitle, title: sanitizedGeneratedList.title };
  }

  // ─── Batch list generation ────────────────────────────────────────────────

  async generateBatchLists(request: GenerateBatchListsRequest): Promise<GenerateBatchListsResponse> {
    this.assertDriveCacheReady();
    const deckId = String(request.deckId ?? '').trim();
    if (deckId === 'spotlight-partner') {
      throw new BadRequestException('Mau Spotlight Doi tac tao list bang cach chon doi tac, khong tao batch tu caption chung.');
    }
    if (!deckId) throw new BadRequestException('Thiếu deckId để tạo batch list.');

    const count = Math.min(Math.max(Number(request.count ?? 5), 1), 10);

    const apiKey = String(process.env.DEEPSEEK_API_KEY ?? '').trim();
    if (!apiKey) {
      throw new BadRequestException(
        'Thiếu DEEPSEEK_API_KEY. Hãy thêm vào backend/.env rồi khởi động lại.',
      );
    }

    const toneRotation: DeepSeekCaptionResponse['tone'][] = [
      'gen_z',
      'tinh_te',
      'review_chan_that',
      'ban_hang_nhe',
      'lich_trinh_huu_ich',
    ];

    const results: Array<{ listId: string; navTitle: string; tone: string }> = [];
    let failCount = 0;

    // Get existing generated lists to know which tones have been used
    this.ensureGeneratedListsLoaded();
    const existingLists = this.generatedListsByDeckId.get(deckId) ?? [];
    const startToneIndex = existingLists.length % toneRotation.length;

    for (let i = 0; i < count; i++) {
      const tone = toneRotation[(startToneIndex + i) % toneRotation.length];
      try {
        const dataset = await this.getDataset();
        const deck = dataset.decks.find((d) => d.id === deckId);
        if (!deck) throw new NotFoundException(`Không tìm thấy deck: ${deckId}`);

        const deckList = deck.lists[0];
        if (!deckList) throw new NotFoundException('Deck không có list nào.');

        const usedTitles = this.getUsedCaptionTitles(deckId);
        const current = { coverTitle: '', headline: '', body: '', hashtags: [] as string[] };
        const prompt = this.buildDeepSeekPrompt(deck, deckList, tone, 'full', current, usedTitles);

        const deepseekController = new AbortController();
        const deepseekTimeout = setTimeout(() => deepseekController.abort(), 30_000);
        let response: Response;
        try {
          response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: 'deepseek-chat',
              messages: [
                { role: 'system', content: 'Bạn là content creator du lịch TikTok. Chỉ trả về đúng JSON object hợp lệ, không thêm markdown, không giải thích.' },
                { role: 'user', content: prompt },
              ],
              temperature: 1.1,
              max_tokens: 900,
              stream: false,
            }),
            signal: deepseekController.signal,
          });
        } finally {
          clearTimeout(deepseekTimeout);
        }

        if (!response.ok) {
          console.warn(`[batch] DeepSeek lỗi HTTP ${response.status} cho tone ${tone}`);
          failCount++;
          continue;
        }

        const responseText = await response.text();
        let payload: any;
        try { payload = JSON.parse(responseText); } catch { failCount++; continue; }

        const content = String(payload?.choices?.[0]?.message?.content ?? '').trim();
        if (!content) { failCount++; continue; }

        const parsed = this.parseDeepSeekJson(content);
        const caption = this.normalizeCaptionPayload(
          parsed,
          { coverTitle: '', headline: '', body: '', hashtags: [] },
          'full',
          tone,
          deckId,
          this.collectCaptionForbiddenNames(deckList),
        );

        if (deckId !== 'spotlight-v3' && (!caption.coverTitle || !caption.body)) { failCount++; continue; }
        if (deckId === 'spotlight-v3' && !caption.body) { failCount++; continue; }

        const generated = await this.generateDeckFromCaption({
          deckId,
          tone,
          caption: {
            coverTitle: caption.coverTitle,
            headline: caption.headline,
            body: caption.body,
            hashtags: caption.hashtags,
          },
        });

        results.push({ listId: generated.listId, navTitle: generated.navTitle, tone });
      } catch (error) {
        console.warn(`[batch] Lỗi tạo list ${i + 1}/${count} (tone=${tone}):`, error instanceof Error ? error.message : error);
        failCount++;
      }
    }

    return {
      deckId,
      lists: results,
      successCount: results.length,
      failCount,
    };
  }

  // ─── Partner Spotlight ────────────────────────────────────────────────────

  async getPartnerList(): Promise<Array<{ id: string; name: string; section: string; address: string; imageCount: number }>> {
    await this.prepareWorkbookForDataset(false);
    const context = this.buildDatasetContext();
    const allItems = Object.values(context.itemsBySection).flat();
    return allItems
      .filter((item) => item.isPartner)
      .map((item) => ({
        id: item.id,
        name: item.name,
        section: item.sectionKey,
        address: item.address,
        imageCount: (item.candidateImageUrls || []).length + (item.imageUrl && !(item.candidateImageUrls || []).includes(item.imageUrl) ? 1 : 0),
      }));
  }

  async generatePartnerSpotlight(request: GeneratePartnerSpotlightRequest): Promise<GeneratePartnerSpotlightResponse> {
    this.assertDriveCacheReady();
    const partnerId = String(request.partnerId ?? '').trim();
    const partnerName = String(request.partnerName ?? '').trim();
    if (!partnerId && !partnerName) {
      throw new BadRequestException('Cần có partnerId hoặc partnerName để sinh mẫu spotlight đối tác.');
    }

    await this.prepareWorkbookForDataset(false);
    const context = this.buildDatasetContext();

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

    const generatedList = buildDeckList(
      deckId,
      listSuffix,
      partnerItem.name,
      partnerItem.name.toUpperCase(),
      partnerItem.address || partnerItem.type || '',
      pages,
    );
    generatedList.coverTitle = partnerItem.name.toUpperCase().slice(0, 35);
    generatedList.postCaption = SPOTLIGHT_PARTNER_POST_CAPTION;
    generatedList.description = SPOTLIGHT_PARTNER_CAPTION_BODY;
    generatedList.captionHashtags = buildCaptionHashtags([], 'lich_trinh_huu_ich', this.activeDestinationId, 'spotlight-partner');
    generatedList.templateVersion = SPOTLIGHT_PARTNER_TEMPLATE_VERSION;

    this.generatedListsByDeckId.set(deckId, [...existing, generatedList]);
    this.persistGeneratedLists();
    this.markUsedInDeck(pages);
    this.persistInventory();

    return {
      deckId,
      listId: generatedList.id,
      navTitle: generatedList.navTitle,
      title: generatedList.title,
      partnerName: partnerItem.name,
      pageCount: pages.length,
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
    const t0 = Date.now();
    const workbookSource = this.getWorkbookSource();
    const imageUrls = imageUrlsForDirectory(this.dalatImageDir, '/assets/dalat');
    const imageMapping = this.loadImageMapping();
    const imageLibraryEntries = this.loadImageLibraryEntries(imageMapping);
    const sheetDriveManifest = this.loadSheetDriveManifest();
    const coverImageUrls = this.loadCoverImageUrls(sheetDriveManifest);
    const itemsBySection = this.loadWorkbookItems(workbookSource.workbook, imageUrls, imageMapping, imageLibraryEntries, sheetDriveManifest);
    this.refreshGeneratedListImages(itemsBySection);
    this.ensureInventoryLoaded();
    const renderUsage = this.createUsageScope();
    setActiveDestinationLocalize(this.activeDestinationId);
    setSpotlightV3BuildContext({ destinationId: this.activeDestinationId });
    let baseDecks: GuideDeck[];
    try {
      baseDecks = localizeDecks(
        buildDecks(itemsBySection, imageUrls, imageLibraryEntries, coverImageUrls, renderUsage.itemIds, renderUsage.imageUrls),
        this.activeDestinationId,
      );
    } finally {
      clearSpotlightV3BuildContext();
    }
    baseDecks.forEach((deck) => this.markUsedInDeck(deck.lists.flatMap((list) => list.pages), renderUsage));
    if (this.hasGeneratedListsNeedingTemplateRefresh()) {
      this.refreshGeneratedLists(itemsBySection, imageUrls, imageLibraryEntries, coverImageUrls, renderUsage, baseDecks);
    }
    const totalItems = Object.values(itemsBySection).reduce((s, items) => s + items.length, 0);
    const mappedItemCount = Object.values(itemsBySection).reduce((s, items) => s + items.filter((i) => i.imageMapped).length, 0);
    const manualMappedItemCount = Object.values(itemsBySection).reduce((s, items) => s + items.filter((i) => i.imageSource === 'manual').length, 0);
    const autoMappedItemCount = Object.values(itemsBySection).reduce((s, items) => s + items.filter((i) => i.imageSource === 'auto').length, 0);

    const context: WorkbookDerivedContext = { imageUrls, coverImageUrls, imageLibraryEntries, itemsBySection, baseDecks, totalItems, mappedItemCount, manualMappedItemCount, autoMappedItemCount };
    this.workbookDerivedCache = context;
    this.workbookDerivedCacheTime = Date.now();
    this.workbookDerivedCacheFresh = true;
    this.writeDestinationStats(this.activeDestinationId, totalItems);
    console.log(`[cache] Dữ liệu Sheet được build lại trong ${Date.now() - t0}ms`);
    return context;
  }

  private buildDatasetContext(): DatasetBuildContext {
    this.ensureGeneratedListsLoaded();
    const derived = this.ensureWorkbookDerivedContext();
    // Danh sách AI (tạo/xoá/sửa cover) luôn đọc trực tiếp từ generatedListsByDeckId (bộ nhớ, luôn mới
    // nhất) nên bước merge này luôn nhanh (không đụng tới Sheet/ảnh) và không cần cache riêng.
    const referenceSets = this.buildReferenceSets();
    const decks = this.mergeGeneratedLists(derived.baseDecks, derived.coverImageUrls);

    return {
      imageUrls: derived.imageUrls,
      coverImageUrls: derived.coverImageUrls,
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
    return decks.map((deck) => {
      const templateVersion = this.templateVersionForDeck(deck.id);
      const baseLists = deck.lists.map((list) => {
        const sanitized = this.sanitizeBaseListForDisplay(list, coverImageUrls);
        return templateVersion ? { ...sanitized, templateVersion } : sanitized;
      });
      const generatedLists = (this.generatedListsByDeckId.get(deck.id) ?? []).map((list) => this.sanitizeGeneratedListText(list, deck.id));
      const displayLists = generatedLists.length === 0
        ? baseLists
        : [
          ...baseLists,
          ...this.cloneJson(generatedLists).map((list) => (
            this.sanitizeGeneratedListForDisplay(list, coverImageUrls, usedCoverUrls, deck.id)
          )),
        ];
      return { ...deck, lists: this.applyRecentImageReuseGuard(displayLists) };
    });
  }

  private applyRecentImageReuseGuard(lists: GuideDeckList[]): GuideDeckList[] {
    const recentListImageSets: Array<Set<string>> = [];

    return lists.map((list) => {
      const recentImageUrls = this.mergeRecentImageSets(recentListImageSets);
      const currentListVisualImageUrls = new Set<string>();
      const currentListItemImageUrls = new Set<string>();
      const guardedList: GuideDeckList = {
        ...list,
        pages: list.pages.map((page) => {
          if (page.backgroundImage) currentListVisualImageUrls.add(page.backgroundImage);
          if (page.type !== 'list') return page;

          const currentPageImageUrls = new Set<string>();
          return {
            ...page,
            items: page.items.map((item) => {
              const nextImageUrl = this.pickFreshCandidateImage(
                item.imageUrl,
                item.candidateImageUrls,
                recentImageUrls,
                currentListItemImageUrls,
                currentPageImageUrls,
              );
              if (nextImageUrl) currentListVisualImageUrls.add(nextImageUrl);
              return nextImageUrl && nextImageUrl !== item.imageUrl
                ? { ...item, imageUrl: nextImageUrl }
                : item;
            }),
          };
        }),
      };

      recentListImageSets.push(currentListVisualImageUrls);
      while (recentListImageSets.length > RECENT_LIST_IMAGE_WINDOW) recentListImageSets.shift();
      return guardedList;
    });
  }

  private mergeRecentImageSets(imageSets: Array<Set<string>>): Set<string> {
    const merged = new Set<string>();
    for (const imageSet of imageSets) {
      imageSet.forEach((url) => merged.add(url));
    }
    return merged;
  }

  private pickFreshCandidateImage(
    currentUrl: string | undefined,
    candidateUrls: string[] | undefined,
    recentImageUrls: Set<string>,
    currentListImageUrls: Set<string>,
    currentPageImageUrls: Set<string>,
  ): string {
    const current = String(currentUrl ?? '').trim();
    const candidates = [...new Set([...(candidateUrls ?? []), current].map((url) => String(url ?? '').trim()).filter(Boolean))];
    if (current && !recentImageUrls.has(current) && !currentListImageUrls.has(current) && !currentPageImageUrls.has(current)) {
      currentListImageUrls.add(current);
      currentPageImageUrls.add(current);
      return current;
    }

    const freshCandidate = candidates.find((url) => !recentImageUrls.has(url) && !currentListImageUrls.has(url) && !currentPageImageUrls.has(url));
    const pageFreshCandidate = candidates.find((url) => !recentImageUrls.has(url) && !currentPageImageUrls.has(url));
    const pageUniqueCandidate = candidates.find((url) => !currentPageImageUrls.has(url));
    const currentPageUnique = current && !currentPageImageUrls.has(current) ? current : '';
    const picked = freshCandidate || pageFreshCandidate || pageUniqueCandidate || currentPageUnique || current;
    if (picked) {
      currentListImageUrls.add(picked);
      currentPageImageUrls.add(picked);
    }
    return picked;
  }

  private templateVersionForDeck(deckId: string): number | undefined {
    if (deckId === 'itinerary-3n2d') return ITINERARY_3N2D_TEMPLATE_VERSION;
    if (deckId === 'budget-3n2d') return BUDGET_3N2D_TEMPLATE_VERSION;
    if (deckId === 'budget-72h-summary') return BUDGET_72H_SUMMARY_TEMPLATE_VERSION;
    if (deckId === 'budget-3n2d-story') return BUDGET_3N2D_STORY_TEMPLATE_VERSION;
    if (deckId === 'itinerary-4n3d') return ITINERARY_4N3D_TEMPLATE_VERSION;
    if (deckId === 'itinerary-4n2d-grid8') return ITINERARY_4N2D_GRID8_TEMPLATE_VERSION;
    if (deckId === 'pov-3-day') return POV_3_DAY_TEMPLATE_VERSION;
    if (deckId === 'grid-4') return GRID_4_TEMPLATE_VERSION;
    if (deckId === 'grid-4-mutant') return GRID_4_MUTANT_TEMPLATE_VERSION;
    if (deckId === 'grid-5') return GRID_5_TEMPLATE_VERSION;
    if (deckId === 'grid-6-zigzag') return GRID_6_ZIGZAG_TEMPLATE_VERSION;
    if (deckId === 'grid-6') return GRID_6_TEMPLATE_VERSION;
    if (deckId === 'grid-8') return GRID_8_TEMPLATE_VERSION;
    if (deckId === 'spotlight-guide') return SPOTLIGHT_GUIDE_TEMPLATE_VERSION;
    if (deckId === 'spotlight-partner') return SPOTLIGHT_PARTNER_TEMPLATE_VERSION;
    if (deckId === 'grid-8-feed') return GRID_8_FEED_TEMPLATE_VERSION;
    if (deckId === 'grid-6-quaytung') return GRID_6_QUAYTUNG_TEMPLATE_VERSION;
    if (deckId === 'grid-8-quaytung') return GRID_8_QUAYTUNG_TEMPLATE_VERSION;
    if (deckId === 'spotlight-v2') return SPOTLIGHT_V2_TEMPLATE_VERSION;
    if (deckId === 'spotlight-v3') return SPOTLIGHT_V3_TEMPLATE_VERSION;
    if (deckId === 'pov-3-v2') return POV_3_V2_TEMPLATE_VERSION;
    if (deckId === 'itinerary-4n3d-stack') return ITINERARY_4N3D_STACK_TEMPLATE_VERSION;
    if (deckId === 'itinerary-timeline') return ITINERARY_TIMELINE_TEMPLATE_VERSION;
    if (deckId === 'budget-4n3d-wallet') return BUDGET_4N3D_WALLET_TEMPLATE_VERSION;
    return undefined;
  }

  private normalizeCaptionTone(value?: string): CaptionTone {
    const allowed: CaptionTone[] = ['gen_z', 'tinh_te', 'review_chan_that', 'ban_hang_nhe', 'lich_trinh_huu_ich'];
    return allowed.includes(value as CaptionTone) ? value as CaptionTone : 'lich_trinh_huu_ich';
  }

  private budget3N2DCoverCaption(
    caption: CaptionBlocks,
    tone: CaptionTone,
    seed: string,
    ordinal: number,
  ): CaptionBlocks {
    const toneTitles: Record<CaptionTone, string[]> = {
      gen_z: ['72H ĐÀ LẠT GỌN VÍ', '3 NGÀY ĐI ĐÀ LẠT CỰC GỌN', 'ĐÀ LẠT 3TR ĐI SAO CHO ĐÃ'],
      tinh_te: ['72H ĐÀ LẠT THẬT CHẬM', 'MỘT CHUYẾN ĐÀ LẠT GỌN GHẼ', '3 NGÀY Ở ĐÀ LẠT THẬT ÊM'],
      review_chan_that: ['72H ĐÀ LẠT DỄ ĐI', '3 NGÀY ĐÀ LẠT KHỎI RỐI', 'LỊCH ĐÀ LẠT GỌN CHO NGƯỜI MỚI'],
      ban_hang_nhe: ['LỊCH ĐÀ LẠT 3TR NÊN LƯU', '72H ĐÀ LẠT ĐI GỌN HƠN', 'ĐÀ LẠT 3 NGÀY CÓ SẴN LIST'],
      lich_trinh_huu_ich: ['72H ĐÀ LẠT TỐI ƯU', '3N2Đ ĐÀ LẠT GỌN LỊCH', 'LỊCH 72H ĐÀ LẠT DỄ THEO'],
    };

    const toneBodies: Record<CaptionTone, string[]> = {
      gen_z: [
        'Một list gọn để lên Đà Lạt mà không phải loay hoay chọn chỗ. Có giờ đi, điểm ghé và chi phí dự kiến để lưu liền tay.',
        'Đi Đà Lạt 3 ngày mà muốn gọn ví thì lưu lại ngay. Lịch đã chia sẵn theo buổi, dễ nhìn và dễ đi theo.',
        'Dành cho ai muốn xách balo lên Đà Lạt mà vẫn kiểm soát chi phí. Mở list ra là biết nên ghé đâu trước.',
      ],
      tinh_te: [
        'Một lịch trình vừa đủ chậm để tận hưởng Đà Lạt, vừa đủ rõ để không mất thời gian tìm từng điểm. Lưu lại cho chuyến đi nhẹ nhàng hơn.',
        'Ba ngày ở Đà Lạt sẽ dễ thở hơn khi có sẵn điểm ghé, giờ đi và khoản chi. Hợp cho một chuyến đi nhẹ, gọn và có nhịp.',
        'Gợi ý này gom lại những điểm cần thiết cho 72 giờ ở Đà Lạt. Không quá dày, không quá rối, chỉ đủ để đi thật thoải mái.',
      ],
      review_chan_that: [
        'List này hợp cho người muốn đi Đà Lạt tự túc nhưng không muốn ngồi dò từng quán. Có lịch, có địa chỉ và chi phí để kiểm nhanh.',
        'Nếu chỉ có 3 ngày ở Đà Lạt, cứ lưu list này trước. Các điểm được chia theo khung giờ để đi đỡ vòng và đỡ phát sinh.',
        'Một bản gợi ý thực tế cho chuyến 3N2Đ: ăn gì, ghé đâu, chi khoảng bao nhiêu đều có sẵn để dễ so lại.',
      ],
      ban_hang_nhe: [
        'Lưu lại trước khi lên Đà Lạt để chọn điểm nhanh hơn. List có sẵn lịch trình, quán nên ghé và chi phí dự kiến cho cả chuyến.',
        'Một gợi ý 72H giúp chuyến đi gọn hơn từ lúc lên lịch đến lúc chọn quán. Phù hợp cho nhóm nhỏ muốn đi vui mà vẫn canh ngân sách.',
        'Để chuyến Đà Lạt đỡ mất công chuẩn bị, list này gom sẵn điểm ghé và mức chi tham khảo. Lưu ngay để mở ra dùng khi cần.',
      ],
      lich_trinh_huu_ich: [
        'Lịch trình 3N2Đ được chia theo từng buổi, kèm địa chỉ và chi phí dự kiến. Phù hợp để lưu lại rồi điều chỉnh theo nhóm đi.',
        'Một bản gợi ý gọn cho 72 giờ ở Đà Lạt: đi đâu, ăn gì, dự trù bao nhiêu đều được xếp sẵn để dễ theo dõi.',
        'List này giúp bạn có khung lịch rõ trước khi đi Đà Lạt. Chỉ cần lưu lại, xem từng mốc giờ và thay đổi nhẹ theo nhu cầu.',
      ],
    };

    const titlePool = toneTitles[tone] || toneTitles.lich_trinh_huu_ich;
    const bodyPool = toneBodies[tone] || toneBodies.lich_trinh_huu_ich;
    const title = titlePool[(stableHash(`${seed}:title:${ordinal}`) + ordinal) % titlePool.length];
    const body = bodyPool[(stableHash(`${seed}:body:${ordinal}`) + Math.floor(ordinal / titlePool.length)) % bodyPool.length];

    return {
      ...caption,
      coverTitle: this.sanitizeContentText(sanitizeDeckHeadline(localizeText(title, this.activeDestinationId))),
      body: this.sanitizeContentText(localizeText(body, this.activeDestinationId)),
    };
  }

  private generatedListOrdinal(list: GuideDeckList, fallbackIndex: number): number {
    const match = String(list.id || '').match(/caption-(\d+)/i);
    const parsed = match ? Number(match[1]) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackIndex + 1;
  }

  private toneForGeneratedList(list: GuideDeckList, fallbackIndex: number): CaptionTone {
    const toneRotation: CaptionTone[] = ['gen_z', 'tinh_te', 'review_chan_that', 'ban_hang_nhe', 'lich_trinh_huu_ich'];
    const titleAndBody = normalizeText(`${list.coverTitle || list.title || ''} ${list.description || ''} ${list.postCaption || ''}`);
    if (titleAndBody.includes('gon_vi') || titleAndBody.includes('cuc_gon') || titleAndBody.includes('di_sao_cho_da')) return 'gen_z';
    if (titleAndBody.includes('that_cham') || titleAndBody.includes('gon_ghe') || titleAndBody.includes('that_em')) return 'tinh_te';
    if (titleAndBody.includes('de_di') || titleAndBody.includes('khoi_roi') || titleAndBody.includes('nguoi_moi')) return 'review_chan_that';
    if (titleAndBody.includes('nen_luu') || titleAndBody.includes('di_gon_hon') || titleAndBody.includes('co_san_list')) return 'ban_hang_nhe';
    return toneRotation[(this.generatedListOrdinal(list, fallbackIndex) - 1) % toneRotation.length];
  }

  private hasGeneratedListsNeedingTemplateRefresh(): boolean {
    for (const [deckId, lists] of this.generatedListsByDeckId.entries()) {
      const templateVersion = this.templateVersionForDeck(deckId);
      if (!templateVersion) continue;
      if (lists.some((list) => list.templateVersion !== templateVersion)) return true;
    }
    return false;
  }

  private sanitizeGeneratedListForDisplay(
    list: GuideDeckList,
    coverImageUrls: string[] = [],
    usedCoverUrls?: Set<string>,
    deckId?: string,
  ): GuideDeckList {
    const cleanList = this.sanitizeGeneratedListText(list, deckId);
    if (!/caption-/i.test(cleanList.id)) return cleanList;

    const safeDescription = this.sanitizeContentText(sanitizeCaptionBodyForPages(cleanList.description, cleanList.pages));
    const pages = cleanList.pages.map((page) => this.sanitizeGeneratedPageForDisplay(page, cleanList, safeDescription));
    const enrichedPages = tuneSpotlightV2Cover(pages, coverImageUrls, `${cleanList.id}|cover-grid`);
    const portableCoverImage = this.coverImageForList(cleanList, coverImageUrls, usedCoverUrls);
    return {
      ...cleanList,
      description: safeDescription,
      pages: enrichedPages.map((page, pageIndex) => {
        const pageBackgroundImage = this.backgroundImageForPage(cleanList, page, pageIndex, coverImageUrls);
        if (page.type === 'cover') {
          const grid = Array.isArray(page.coverImages) ? page.coverImages.filter(Boolean) : [];
          if (grid.length > 0) return { ...page, backgroundImage: grid[0] };
          return { ...page, backgroundImage: portableCoverImage };
        }
        return { ...page, backgroundImage: pageBackgroundImage };
      }),
    };
  }

  private sanitizeBaseListForDisplay(list: GuideDeckList, coverImageUrls: string[] = []): GuideDeckList {
    const pages = list.pages.map((page) => this.sanitizeBasePageForDisplay(page, list));
    const enrichedPages = tuneSpotlightV2Cover(pages, coverImageUrls, `${list.id}|cover-grid`);
    return {
      ...list,
      pages: enrichedPages.map((page, pageIndex) => {
        if (page.type === 'cover') {
          const coverImages = Array.isArray(page.coverImages) ? page.coverImages.filter(Boolean) : [];
          return { ...page, backgroundImage: coverImages[0] || this.backgroundImageForPage(list, page, pageIndex, coverImageUrls) };
        }
        return { ...page, backgroundImage: this.backgroundImageForPage(list, page, pageIndex, coverImageUrls) };
      }),
    };
  }

  private sanitizeBasePageForDisplay(page: DeckPage, list: GuideDeckList): DeckPage {
    const cleanPage = this.sanitizeDeckPageText(page);
    if (cleanPage.type === 'cover' && (cleanPage.layoutVariant === 'spotlight-v2' || cleanPage.layoutVariant === 'spotlight-v3')) {
      if (cleanPage.layoutVariant === 'spotlight-v3') {
        return { ...cleanPage, subtitle: '' };
      }
      return {
        ...cleanPage,
        subtitle: this.sanitizeContentText(truncateSpotlightV2CoverSubtitle(cleanPage.subtitle || list.description)),
      };
    }
    if (cleanPage.type !== 'list' || cleanPage.layoutVariant !== 'journey-4n3d') {
      if (cleanPage.type === 'list' && cleanPage.layoutVariant === 'grid-8-quaytung-menu') {
        return this.enforceGrid8QuaytungMenuPage({
          ...cleanPage,
          items: cleanPage.items.map((item) => this.sanitizePageItemText(item, cleanPage)),
        });
      }
      return cleanPage;
    }

    const rawSubtitle = String(cleanPage.subtitle ?? '').trim();
    const pageSubtitle = rawSubtitle ? this.sanitizeContentText(sanitizeCaptionBodyForPages(cleanPage.subtitle, [cleanPage])) : '';
    const shouldUseContextualSubtitle =
      !rawSubtitle ||
      this.samePlainText(pageSubtitle, this.captionBodyFallback());

    return {
      ...cleanPage,
      subtitle: shouldUseContextualSubtitle
        ? this.sanitizeContentText(this.contextualGeneratedPageSubtitle(cleanPage, list))
        : localizeText(pageSubtitle, this.activeDestinationId),
    };
  }

  private coverImageForList(list: GuideDeckList, coverImageUrls: string[], usedCoverUrls?: Set<string>): string {
    const pool = coverImageUrls.filter((url) => this.isPortableImageUrl(url));
    if (pool.length === 0) return '';
    const seed = `${list.id}|${list.title}|${list.description}|cover`;
    const ordered = [...pool].sort((left, right) => stableHash(`${seed}:${left}`) - stableHash(`${seed}:${right}`));
    const picked = ordered.find((url) => !usedCoverUrls?.has(url)) || ordered[0] || '';
    if (picked) usedCoverUrls?.add(picked);
    return picked;
  }

  private backgroundImageForPage(
    list: GuideDeckList,
    page: DeckPage,
    pageIndex: number,
    coverImageUrls: string[],
  ): string {
    const pool = coverImageUrls.filter((url) => this.isPortableImageUrl(url));
    if (pool.length === 0) return '';
    const seed = `${list.id}|${pageIndex}|${page.type}|${page.layoutVariant || ''}|background`;
    return [...pool].sort(
      (left, right) => stableHash(`${seed}:${left}`) - stableHash(`${seed}:${right}`),
    )[0] || '';
  }

  private isPortableImageUrl(value?: string): boolean {
    const url = String(value ?? '').trim();
    return /^https?:\/\//i.test(url) || url.startsWith('/assets/drive-file');
  }

  private firstPortableImageForPages(pages: DeckPage[]): string {
    for (const page of pages) {
      if (this.isPortableImageUrl(page.backgroundImage)) return page.backgroundImage;
      if (page.type !== 'list') continue;
      for (const item of page.items) {
        if (this.isPortableImageUrl(item.imageUrl)) return item.imageUrl;
        const candidate = item.candidateImageUrls?.find((url) => this.isPortableImageUrl(url));
        if (candidate) return candidate;
      }
    }
    return '';
  }

  private sanitizeGeneratedPageForDisplay(page: DeckPage, list: GuideDeckList, safeDescription: string): DeckPage {
    if (page.type === 'cover') {
      const layout = String(page.layoutVariant || '');
      if (layout === 'spotlight-v3') {
        return { ...page, subtitle: '' };
      }
      if (layout === 'spotlight-v2') {
        const rawSubtitle = String(page.subtitle ?? '').trim() || safeDescription;
        return {
          ...page,
          title: this.sanitizeContentText(sanitizeDeckHeadline(list.coverTitle || list.title || page.title)),
          subtitle: this.sanitizeContentText(truncateSpotlightV2CoverSubtitle(rawSubtitle)),
        };
      }
      if (layout === 'grid-8-feed') {
        const rawSubtitle = String(page.subtitle ?? '').trim() || safeDescription;
        return {
          ...page,
          title: this.sanitizeContentText(sanitizeDeckHeadline(list.coverTitle || list.title || page.title)),
          subtitle: this.sanitizeContentText(truncateGrid8FeedCoverSubtitle(rawSubtitle)),
        };
      }
      if (layout === 'grid-8' || layout === 'journey-4n2d-grid8') {
        const rawSubtitle = String(page.subtitle ?? '').trim() || safeDescription;
        return {
          ...page,
          title: this.sanitizeContentText(sanitizeDeckHeadline(list.coverTitle || list.title || page.title)),
          subtitle: this.sanitizeContentText(truncateGrid8CoverSubtitle(rawSubtitle)),
        };
      }
      // Use page's own subtitle if available, otherwise use the list description (body).
      // Truncate to ~150 chars, cutting at sentence boundary for natural reading — không thêm "...".
      const rawSubtitle = String(page.subtitle ?? '').trim() || safeDescription;
      let coverSubtitle = rawSubtitle;
      if (rawSubtitle.length > 150) {
        // Try to cut at sentence end (. ! ?) within first 150 chars
        const truncated = rawSubtitle.slice(0, 150);
        const lastSentenceEnd = Math.max(
          truncated.lastIndexOf('. '),
          truncated.lastIndexOf('! '),
          truncated.lastIndexOf('? '),
          truncated.lastIndexOf('.\n'),
        );
        if (lastSentenceEnd > 60) {
          coverSubtitle = rawSubtitle.slice(0, lastSentenceEnd + 1).trim();
        } else {
          const lastSpace = truncated.lastIndexOf(' ');
          coverSubtitle = (lastSpace > 60 ? truncated.slice(0, lastSpace) : truncated).trim();
        }
      }
      return {
        ...page,
        title: this.sanitizeContentText(sanitizeDeckHeadline(list.coverTitle || list.title || page.title)),
        subtitle: this.sanitizeContentText(coverSubtitle),
      };
    }

    const rawSubtitle = String(page.subtitle ?? '').trim();
    const pageSubtitle = this.sanitizeContentText(sanitizeCaptionBodyForPages(page.subtitle, [page]));
    const shouldUseContextualSubtitle =
      !rawSubtitle ||
      page.layoutVariant === 'grid-8' ||
      this.samePlainText(pageSubtitle, safeDescription) ||
      this.samePlainText(pageSubtitle, this.captionBodyFallback());
    const sanitizedPage = {
      ...page,
      title: this.sanitizeContentText(sanitizeDeckHeadline(page.title)),
      chipText: this.sanitizeContentText(page.chipText),
      items: page.items.map((item) => this.sanitizePageItemText(item, page)),
      subtitle: shouldUseContextualSubtitle
        ? this.sanitizeContentText(this.contextualGeneratedPageSubtitle(page, list))
        : localizeText(pageSubtitle, this.activeDestinationId),
    };
    if (page.layoutVariant === 'grid-8-quaytung-menu') {
      return this.enforceGrid8QuaytungMenuPage(sanitizedPage);
    }
    return sanitizedPage;
  }

  private samePlainText(left: string, right: string): boolean {
    return normalizeText(left) === normalizeText(right);
  }

  private contextualGeneratedPageSubtitle(page: DeckPage, list: GuideDeckList): string {
    if (page.type !== 'list') return '';

    const kind = this.generatedPageKind(page);
    const variants = this.generatedSubtitleVariants(kind);
    return localizeText(variants[this.generatedListVariantIndex(list, variants.length, kind)] || variants[0] || '', this.activeDestinationId);
  }

  private generatedPageKind(page: DeckPage): string {
    if (page.type !== 'list') return 'generic';

    const key = normalizeText(`${page.chipText} ${page.title}`);
    if (page.layoutVariant === 'journey-4n3d') {
      if (key.includes('day_01') || key.includes('ngay_1') || key.includes('vao_pho')) return 'journey_day1';
      if (key.includes('day_02') || key.includes('ngay_2') || key.includes('san_anh')) return 'journey_day2';
      if (key.includes('day_03') || key.includes('ngay_3') || key.includes('di_sau')) return 'journey_day3';
      if (key.includes('day_04') || key.includes('ngay_4') || key.includes('cham_roi')) return 'journey_day4';
    }
    if (key.includes('quan_an') || key.includes('mon_ngon')) return 'food';
    if (key.includes('cafe') || key.includes('ca_phe')) return 'cafe';
    if (key.includes('check_in')) return 'checkin';
    if (key.includes('choi_dem')) return 'nightlife';
    if (key.includes('dich_vu') || key.includes('luu_y')) return 'service';
    if (key.includes('homestay') || key.includes('luu_tru')) return 'stay';
    if (key.includes('hoat_dong')) return 'activity';
    if (key.includes('khu_du_lich')) return 'tourism';
    return 'generic';
  }

  private generatedListVariantIndex(list: GuideDeckList, variantCount: number, salt: string): number {
    if (variantCount <= 1) return 0;

    const captionMatch = list.id.match(/caption-(\d+)/i);
    if (captionMatch) return Math.max(0, Number(captionMatch[1]) - 1) % variantCount;

    return stableHash(`${list.id}|${list.title}|${salt}`) % variantCount;
  }

  private generatedSubtitleVariants(kind: string): string[] {
    const variants: Record<string, string[]> = {
      journey_day1: [
        'Ngày đầu đi nhẹ trong phố: ăn sáng, cafe, check-in và một điểm ghé vừa đủ nhịp.',
        'Khởi động lịch bằng các điểm dễ đi, ít vòng xa, hợp để quen nhịp Đà Lạt.',
        'Một ngày mở màn gọn gàng: có bữa sáng, có cafe, có góc chụp và thời gian nghỉ.',
        'Day 01 ưu tiên các điểm gần nhau để đi chậm, dễ chọn và không bị cuốn lịch quá dày.',
      ],
      journey_day2: [
        'Ngày thứ hai ưu tiên ảnh đẹp, quán dễ nghỉ chân và các điểm đi trong cùng cung.',
        'Một ngày dành cho check-in nhiều hơn, xen kẽ cafe và bữa ăn để lịch không bị đuối.',
        'Day 02 gom các điểm lên hình ổn, phù hợp khi đã bắt nhịp và muốn đi sâu hơn.',
        'Lịch ngày hai rõ cung hơn: chọn điểm chính trước, rồi thêm quán nghỉ chân vừa đủ.',
      ],
      journey_day3: [
        'Ngày giữa chuyến đi sâu hơn một chút, thêm điểm trải nghiệm và bữa tối rõ ràng.',
        'Day 03 dành cho các điểm cần nhiều thời gian hơn, có chỗ ăn và chỗ dừng hợp nhịp.',
        'Một ngày để đổi mood: bớt vội, thêm trải nghiệm, vẫn giữ các điểm ăn nghỉ dễ theo.',
        'Lịch ngày ba cân bằng giữa điểm chơi, bữa ăn và vài nơi đáng ghé trước khi tối xuống.',
      ],
      journey_day4: [
        'Ngày cuối đi chậm, chốt vài điểm dễ ghé rồi dành thời gian nghỉ và mua quà.',
        'Day 04 giữ lịch nhẹ để còn trả phòng, mua quà và không bị gấp trước lúc về.',
        'Một ngày kết chuyến vừa đủ: ít điểm hơn, dễ xoay giờ và có khoảng trống nghỉ chân.',
        'Lịch ngày cuối ưu tiên những điểm thuận đường, không nhồi quá nhiều để về nhẹ nhàng.',
      ],
      food: [
        'Nhóm quán ăn được gom riêng để người xem chọn bữa nhanh, dễ scan trước khi đi.',
        'Một trang chỉ dành cho đồ ăn, ưu tiên chỗ dễ gọi món và tiện ghé theo lịch.',
        'Ghim sẵn các quán ăn để lúc đói chỉ cần mở list, chọn nhanh, khỏi lướt lại.',
        'Các quán được lọc riêng để dễ đổi bữa mà không làm rối lịch di chuyển.',
        'Trang này gom các quán đáng thử, hợp để chốt bữa chính hoặc bữa phụ trong ngày.',
        'Một cụm địa chỉ ăn ngon, gọn mắt, dành cho lúc cần quyết nhanh trong chuyến đi.',
      ],
      cafe: [
        'Các quán cafe nên lưu riêng để chọn điểm ngồi chill, nghỉ chân hoặc chụp ảnh.',
        'Trang cafe này ưu tiên chỗ có không khí dễ chịu, hợp để dừng lại giữa lịch đi.',
        'Ghim trước vài quán cafe để có điểm nghỉ, lên ảnh đẹp và không phải tìm phút cuối.',
        'Một cụm cafe để đổi nhịp chuyến đi: ngồi lâu được, chụp ổn, di chuyển vừa phải.',
        'Các điểm cafe được gom riêng cho lúc muốn chậm lại mà vẫn có ảnh đẹp mang về.',
        'Trang này dành cho mood cafe: chọn nhanh một chỗ ngồi, rồi để Đà Lạt tự dịu lại.',
      ],
      checkin: [
        'Một trang scan nhanh các điểm check-in, ưu tiên tên ngắn và hình ảnh rõ.',
        'Các góc lên hình được tách riêng để dễ chọn điểm chụp theo cung đường trong ngày.',
        'Ghim sẵn các điểm check-in để lúc trời đẹp chỉ cần mở list và đi thẳng.',
        'Trang này gom các điểm nhìn phát hiểu ngay, hợp cho lịch cần ảnh đẹp mà không vòng vèo.',
        'Một cụm điểm chụp dễ scan, giúp bạn chọn nhanh nơi đáng ghé nhất trong buổi đó.',
        'Các địa điểm lên ảnh ổn được xếp riêng để chuyến đi có vài khung hình chắc tay.',
      ],
      nightlife: [
        'Các điểm đi buổi tối, ăn đêm và nghe nhạc được tách riêng để dễ lưu sau 20h.',
        'Trang này dành cho buổi tối: chọn chỗ ăn, nghe nhạc hoặc đổi không khí sau lịch ngày.',
        'Ghim riêng các điểm chơi đêm để tối đến không phải lục lại cả list dài.',
        'Một cụm lựa chọn sau hoàng hôn, hợp để kéo dài lịch mà vẫn dễ quyết.',
        'Các điểm buổi tối được gom riêng để lịch đêm có nhịp, có món, có chỗ ngồi.',
        'Trang này giúp chốt nhanh phần sau 20h: ăn nhẹ, đi nghe nhạc hoặc ghé một nơi có vibe.',
      ],
      service: [
        'Các dịch vụ hỗ trợ chuyến đi được gom riêng để người xem dễ liên hệ nhanh.',
        'Trang dịch vụ này để lưu những thứ cần chốt trước: xe, đồ, quà hoặc hỗ trợ tại chỗ.',
        'Ghim riêng nhóm dịch vụ để lúc cần liên hệ không phải trộn với quán ăn và điểm chơi.',
        'Một trang thực dụng cho chuyến đi: các mục cần chuẩn bị, đặt trước hoặc lưu số.',
        'Các dịch vụ quan trọng được tách riêng để lịch đi trơn hơn và ít phải xử lý gấp.',
        'Trang này gom những thứ hậu cần nên có sẵn trước khi bắt đầu chạy lịch.',
      ],
      stay: [
        'Các chỗ nghỉ nên xem riêng để dễ chốt phòng, không trộn với dịch vụ khác.',
        'Trang lưu trú này giúp so nhanh vài lựa chọn trước khi quyết chỗ ở cho chuyến đi.',
        'Ghim riêng homestay để lúc chốt phòng có ngay nhóm lựa chọn sạch và dễ xem.',
        'Một cụm chỗ nghỉ để cân vị trí, vibe và lịch di chuyển trước khi đặt.',
        'Các lựa chọn lưu trú được tách riêng để không lẫn với điểm chơi trong ngày.',
        'Trang này dành cho bước chốt nơi ở: xem nhanh, so nhanh, rồi quay lại lịch đi.',
      ],
      activity: [
        'Các hoạt động và điểm ghé được gom riêng để đổi nhịp cho lịch đi.',
        'Trang hoạt động này thêm lựa chọn trải nghiệm, hợp khi muốn chuyến đi bớt chỉ check-in.',
        'Ghim các hoạt động riêng để dễ chen vào lịch khi còn dư thời gian hoặc muốn đổi mood.',
        'Một cụm trải nghiệm để ngày đi có thêm việc đáng làm, không chỉ chụp ảnh rồi đi tiếp.',
        'Các hoạt động được tách riêng để bạn chọn nhịp vui hơn cho từng buổi.',
        'Trang này dành cho những lúc muốn làm gì đó khác hơn: ghé, thử, chơi, rồi đi tiếp.',
      ],
      tourism: [
        'Các khu du lịch được tách riêng khỏi trang check-in để người xem cân lịch dễ hơn.',
        'Trang khu du lịch này hợp để chọn điểm đi dài hơi, cần cân thời gian hơn điểm ghé nhanh.',
        'Ghim riêng các khu du lịch để dễ quyết nơi nào đáng dành hẳn một buổi.',
        'Một cụm điểm lớn hơn, phù hợp khi muốn có lịch rõ thay vì chỉ ghé chụp nhanh.',
        'Các khu du lịch được gom riêng để bạn xem trước độ xa, độ rộng và thời gian cần dành.',
        'Trang này giúp chọn các điểm đi chính trong ngày, trước khi thêm cafe hay điểm ăn.',
      ],
      generic: [
        'Trang này gom riêng các mục cùng nhóm để scan nhanh và lưu trước khi đi.',
        'Một trang phụ được tách riêng để list dễ đọc hơn và không phải quyết từ một đống hỗn hợp.',
        'Các mục cùng nhóm được đặt chung để người xem chọn nhanh theo đúng nhu cầu lúc đó.',
        'Trang này giúp list gọn hơn: mở ra là hiểu nhóm nào, dùng lúc nào, lưu vì sao.',
        'Một cụm lựa chọn riêng để chuyến đi dễ xoay nhịp mà không bị loãng thông tin.',
        'Các gợi ý được gom thành một trang rõ ý, hợp để scan nhanh trước khi chốt lịch.',
      ],
    };
    return variants[kind] || variants.generic;
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

    for (const [deckId, lists] of this.generatedListsByDeckId.entries()) {
      const templateVersion = this.templateVersionForDeck(deckId);
      const deckUsage = this.createUsageScope();
      const baseDeck = baseDecks.find((deck) => deck.id === deckId);
      baseDeck?.lists.forEach((list) => this.markUsedInDeck(list.pages, deckUsage));
      const refreshedLists = lists.map((list, listIndex) => {
        if (deckId === 'spotlight-partner') {
          const partnerItem = this.findPartnerItemForGeneratedList(list, itemsBySection);
          if (!partnerItem) return list;
          const pools = this.createDeckBuildPoolsFromSection(itemsBySection);
          const regeneratedPages = buildSpotlightPartnerPages(
            partnerItem,
            pools,
            imageUrls,
            libraryEntries,
            `refresh:${deckId}:${list.id}:${listIndex}:${partnerItem.id}`,
            deckUsage.itemIds,
            deckUsage.imageUrls,
            coverImageUrls,
          );
          this.markUsedInDeck(regeneratedPages, deckUsage);
          this.markUsedInDeck(regeneratedPages, renderUsage);
          const partnerCaptionHashtags = buildCaptionHashtags([], 'lich_trinh_huu_ich', this.activeDestinationId, 'spotlight-partner');
          if (
            list.navTitle !== partnerItem.name ||
            list.title !== partnerItem.name.toUpperCase() ||
            list.coverTitle !== partnerItem.name.toUpperCase().slice(0, 35) ||
            list.postCaption !== SPOTLIGHT_PARTNER_POST_CAPTION ||
            list.description !== SPOTLIGHT_PARTNER_CAPTION_BODY ||
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
            description: SPOTLIGHT_PARTNER_CAPTION_BODY,
            captionHashtags: partnerCaptionHashtags,
            templateVersion,
            pages: regeneratedPages,
          };
          return this.sanitizeGeneratedListText(nextList, deckId);
        }

        const caption: CaptionBlocks = {
          coverTitle: this.sanitizeContentText(sanitizeDeckHeadline(list.coverTitle || list.title)),
          headline: this.sanitizeContentText(String(list.postCaption ?? '').trim()),
          body: this.sanitizeContentText(list.description),
          hashtags: Array.isArray(list.captionHashtags) ? list.captionHashtags : [],
        };
        const refreshSeed = `refresh:${deckId}:${list.id}:${listIndex}:${caption.coverTitle}:${caption.headline}:${caption.body}:${caption.hashtags.join(' ')}`;
        if (deckId === 'spotlight-v3') {
          setSpotlightV3BuildContext({
            destinationId: this.activeDestinationId,
            usedHookTitles: this.getUsedCaptionTitles(deckId),
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
          if (deckId === 'spotlight-v3') clearSpotlightV3BuildContext();
        }
        const hookCoverTitle = deckId === 'spotlight-v3'
          ? String((basePages.find((page) => page.type === 'cover') as CoverPage | undefined)?.title || '').trim()
          : '';
        const safeCaption = {
          ...caption,
          coverTitle: this.sanitizeContentText(sanitizeDeckHeadline(hookCoverTitle || caption.coverTitle)),
          headline: this.sanitizeContentText(caption.headline),
          body: this.sanitizeContentText(sanitizeCaptionBodyForPages(caption.body, basePages)),
        };
        const finalCaption = deckId === 'budget-3n2d' || deckId === 'budget-3n2d-story' || deckId === 'budget-72h-summary'
          ? this.budget3N2DCoverCaption(safeCaption, this.toneForGeneratedList(list, listIndex), refreshSeed, this.generatedListOrdinal(list, listIndex))
          : safeCaption;
        let regeneratedPages = applyCaptionToPages(basePages, finalCaption);
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
          description: finalCaption.body,
          templateVersion,
          pages: regeneratedPages,
        };
        return this.sanitizeGeneratedListText(nextList, deckId);
      });
      const sanitizedLists = refreshedLists.map((list) => {
        const sanitizedList = this.sanitizeGeneratedListText(list, deckId);
        if (JSON.stringify(list) !== JSON.stringify(sanitizedList)) changed = true;
        return sanitizedList;
      });
      this.generatedListsByDeckId.set(deckId, sanitizedLists);
    }

    if (changed) this.persistGeneratedLists();
  }

  private findPartnerItemForGeneratedList(list: GuideDeckList, itemsBySection: WorkbookItemsBySection): GuideItem | undefined {
    const allItems = Object.values(itemsBySection).flat().filter((item) => item.isPartner);
    const sourceKeys = new Set<string>();
    const names = new Set<string>();
    for (const page of list.pages) {
      if (page.type !== 'list') continue;
      for (const item of page.items) {
        if (item.sourceKey) sourceKeys.add(item.sourceKey);
        if (item.rawName) names.add(normalizeText(item.rawName));
        if (item.metaPrimary) names.add(normalizeText(item.metaPrimary));
      }
    }
    const listName = normalizeText(list.navTitle || list.title || list.coverTitle || '');
    return allItems.find((item) =>
      sourceKeys.has(itemUsageKey(item)) ||
      names.has(normalizeText(item.name)) ||
      normalizeText(item.name) === listName,
    );
  }

  private normalizeDisplayName(value: string): string {
    const clean = String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
    if (normalizeText(clean).startsWith('quoa_dac_san')) {
      return clean.replace(/^[^-]+/, 'Quà');
    }
    return clean;
  }

  private pageItemSectionKey(pageItem: PageItem): SectionKey | '' {
    if (pageItem.sourceSectionKey && SECTION_CONFIG[pageItem.sourceSectionKey]) {
      return pageItem.sourceSectionKey;
    }
    const id = String(pageItem.id ?? '');
    const matchedKey = Object.keys(SECTION_CONFIG).find((key) => id.startsWith(`${key}-`));
    return (matchedKey as SectionKey | undefined) ?? '';
  }

  private pageItemSourceName(pageItem: PageItem): string {
    const rawName = String(pageItem.rawName ?? '').trim();
    if (rawName) return rawName;
    const name = String(pageItem.name ?? '').replace(/^[^:]{1,30}:\s*/, '').trim();
    return name || String(pageItem.name ?? '').trim();
  }

  private refreshedPageItemName(pageItem: PageItem, sourceName: string): string {
    const normalizedSourceName = this.normalizeDisplayName(sourceName);
    const currentName = String(pageItem.name ?? '').trim();
    const rawName = String(pageItem.rawName ?? '').trim();
    if (rawName && currentName.includes(rawName)) {
      return currentName.replace(rawName, normalizedSourceName);
    }
    const prefixMatch = currentName.match(/^([^:]{1,30}:\s*)/);
    return prefixMatch ? `${prefixMatch[1]}${normalizedSourceName}` : normalizedSourceName;
  }

  private mergeTimelineDayMetaSecondary(existing: string, freshMeta: string): string {
    const activity = String(existing || '').trim();
    const detail = String(freshMeta || '').trim();
    if (!detail) return activity;
    if (!activity || /Khung giờ:|Giá:/i.test(activity)) return detail;
    return `${activity}${activity.endsWith(' ') ? '' : ' '}${detail}`;
  }

  private pageItemMetaFromSource(item: GuideItem): [string, string] {
    if (item.sectionKey === 'homestay') {
      const primary = item.address || 'Đang cập nhật địa chỉ';
      const secondaryParts: string[] = [];
      const price = displayPrice(item);
      if (price) secondaryParts.push(`Giá: ${price}`);
      if (item.phone) secondaryParts.push(`SĐT: ${item.phone}`);
      return [primary, secondaryParts.join(' · ')];
    }
    if (item.sectionKey === 'dich_vu') {
      const primary = item.address || 'Đang cập nhật địa chỉ';
      return [primary, item.phone ? `SĐT: ${item.phone}` : ''];
    }
    return metaText(item);
  }

  /** Spotlight V3: Homestay/Dịch vụ chỉ hiện giá đầu người (không SĐT). */
  private spotlightV3ItemMetaFromSource(item: GuideItem, chipText = ''): [string, string] {
    const primary = item.address || 'Đang cập nhật địa chỉ';
    const chip = String(chipText || '').trim();
    const withPrice = chip === 'Homestay' || chip === 'Dịch vụ'
      || item.sectionKey === 'homestay'
      || item.sectionKey === 'dich_vu';
    if (!withPrice) return [primary, ''];
    const price = displayPrice(item);
    const cleaned = String(price || '').trim();
    const displayable = cleaned
      && !/mien\s*phi|free/i.test(cleaned)
      && !/^0+\s*(đ|d|vnd|vnđ)?$/i.test(cleaned);
    return [primary, displayable ? `Giá: ${cleaned}` : ''];
  }

  private budgetGalleryItemMetaFromSource(item: GuideItem): [string, string] {
    const openHours = String(item.openHours || '').replace(/\s+/g, ' ').trim();
    return ['', openHours ? `Khung giờ: ${openHours}` : ''];
  }

  private refreshGeneratedListImages(itemsBySection: WorkbookItemsBySection): void {
    if (this.generatedListsByDeckId.size === 0) return;

    const itemsByKey = new Map<string, GuideItem>();
    const addItemKey = (key: string | undefined, item: GuideItem): void => {
      const cleanKey = String(key ?? '').trim();
      if (cleanKey && !itemsByKey.has(cleanKey)) itemsByKey.set(cleanKey, item);
    };
    Object.values(itemsBySection).forEach((items) => {
      items.forEach((item) => {
        addItemKey(item.id, item);
        addItemKey(itemUsageKey(item), item);
        addItemKey(item.imageMappingKey, item);
        addItemKey(itemMappingKey(item.sectionKey, item.name, item.address), item);
      });
    });

    const findSourceItem = (pageItem: PageItem): GuideItem | undefined => {
      const sourceKey = String(pageItem.sourceKey ?? '').trim();
      if (sourceKey && itemsByKey.has(sourceKey)) return itemsByKey.get(sourceKey);

      const sectionKey = this.pageItemSectionKey(pageItem);
      const sourceName = this.pageItemSourceName(pageItem);
      const address = String(pageItem.metaPrimary ?? '').trim();
      if (sectionKey && sourceName) {
        const mappingKey = itemMappingKey(sectionKey, sourceName, address);
        const normalizedMappingKey = itemMappingKey(sectionKey, this.normalizeDisplayName(sourceName), address);
        if (itemsByKey.has(mappingKey)) return itemsByKey.get(mappingKey);
        if (itemsByKey.has(normalizedMappingKey)) return itemsByKey.get(normalizedMappingKey);
      }

      const legacyId = String(pageItem.id ?? '').trim();
      return legacyId ? itemsByKey.get(legacyId) : undefined;
    };

    let changed = false;
    for (const [deckId, lists] of this.generatedListsByDeckId.entries()) {
      if (deckId === 'spotlight-partner') continue;
      const refreshedLists = lists.map((list) => ({
        ...list,
        pages: list.pages.map((page) => {
          if (page.type !== 'list') return page;
          const mappedPage = {
            ...page,
            items: page.items.map((pageItem) => {
              const sourceItem = findSourceItem(pageItem);
              if (!sourceItem) return pageItem;
              if (page.layoutVariant === 'budget-3n2d-table') {
                return {
                  ...pageItem,
                  id: sourceItem.id,
                  sourceKey: itemUsageKey(sourceItem),
                  sourceSectionKey: sourceItem.sectionKey,
                  name: this.refreshedPageItemName(pageItem, sourceItem.name),
                  rawName: this.normalizeDisplayName(sourceItem.name),
                  metaPrimary: pageItem.metaPrimary || sourceItem.address || 'Đang cập nhật',
                  isPartner: sourceItem.isPartner,
                };
              }

              const [metaPrimary, metaSecondaryRaw] = page.layoutVariant === 'budget-3n2d-gallery'
                ? this.budgetGalleryItemMetaFromSource(sourceItem)
                : page.layoutVariant === 'spotlight-v3'
                  ? this.spotlightV3ItemMetaFromSource(sourceItem, page.chipText)
                  : this.pageItemMetaFromSource(sourceItem);
              const metaSecondary = page.layoutVariant === 'itinerary-timeline-day'
                ? this.mergeTimelineDayMetaSecondary(String(pageItem.metaSecondary || ''), metaSecondaryRaw)
                : metaSecondaryRaw;
              const isPov3V2Stack = page.layoutVariant === 'pov-3-v2-stack';
              const isMenuTextOnly = page.layoutVariant === 'grid-8-quaytung-menu'
                && !String(pageItem.imageUrl || '').trim();
              const highlight = String(sourceItem.highlight || sourceItem.style || '')
                .replace(/\s+/g, ' ')
                .trim();
              const mappingNote = sourceItem.imageSource === 'manual'
                ? 'Ảnh đã map đúng địa điểm từ sheet'
                : pageItem.imageNote;
              const nextPageItem = {
                ...pageItem,
                id: sourceItem.id,
                sourceKey: itemUsageKey(sourceItem),
                sourceSectionKey: sourceItem.sectionKey,
                name: this.refreshedPageItemName(pageItem, sourceItem.name),
                rawName: this.normalizeDisplayName(sourceItem.name),
                metaPrimary,
                metaSecondary,
                isPartner: sourceItem.isPartner,
                label: isPov3V2Stack && highlight
                  ? truncatePov3V2StackTagline(highlight)
                  : pageItem.label,
                imageNote: isPov3V2Stack && highlight
                  ? truncatePov3V2StackTagline(highlight)
                  : mappingNote,
                candidateImageUrls: sourceItem.imageSource === 'manual' && !isMenuTextOnly
                  ? sourceItem.candidateImageUrls
                  : pageItem.candidateImageUrls,
                ...(sourceItem.imageSource === 'manual' && !isMenuTextOnly
                  ? {
                      imageUrl: sourceItem.imageUrl,
                      imageMapped: true,
                      imageSource: 'manual' as const,
                    }
                  : {}),
              };

              if (JSON.stringify(pageItem) !== JSON.stringify(nextPageItem)) changed = true;
              return nextPageItem;
            }),
          };
          if (page.layoutVariant === 'grid-8-quaytung-menu') {
            return this.enforceGrid8QuaytungMenuPage(mappedPage as ListPage);
          }
          return mappedPage;
        }),
      }));
      const sanitizedLists = refreshedLists.map((list) => {
        const sanitizedList = this.sanitizeGeneratedListText(list, deckId);
        if (JSON.stringify(list) !== JSON.stringify(sanitizedList)) changed = true;
        return sanitizedList;
      });
      this.generatedListsByDeckId.set(deckId, sanitizedLists);
    }

    if (changed) this.persistGeneratedLists();
  }

  private ensureGeneratedListsLoaded(): void {
    if (this.generatedListsLoaded) return;
    this.generatedListsLoaded = true;
    this.generatedListsByDeckId.clear();
    if (!fs.existsSync(this.resolveDestinationDataPath('generated-caption-lists'))) return;

    try {
      const raw = fs.readFileSync(this.resolveDestinationDataPath('generated-caption-lists'), 'utf-8');
      const parsed = JSON.parse(raw) as Partial<GeneratedListsStore>;
      const deckEntries = parsed.decks && typeof parsed.decks === 'object' ? parsed.decks : {};
      Object.entries(deckEntries).forEach(([deckId, lists]) => {
        if (!Array.isArray(lists)) return;
        const normalizedLists = lists
          .filter((item) => item && typeof item === 'object')
          .map((item) => this.cloneJson(item as GuideDeckList))
          .filter((item) => item.id && Array.isArray(item.pages));
        if (normalizedLists.length > 0) this.generatedListsByDeckId.set(deckId, normalizedLists);
      });
      this.migrateGeneratedListTextStore();
    } catch {
      this.generatedListsByDeckId.clear();
    }
  }

  private persistGeneratedLists(): void {
    const decks = Array.from(this.generatedListsByDeckId.entries()).reduce(
      (carry, [deckId, lists]) => { carry[deckId] = this.cloneJson(lists); return carry; },
      {} as Record<string, GuideDeckList[]>,
    );
    const payload: GeneratedListsStore = { version: 1, savedAt: new Date().toISOString(), decks };
    this.ensureDataRoot();
    this.writeJsonFileSafe(this.getDestinationDataPath('generated-caption-lists'), payload);
    // Không đụng tới cache Sheet ở đây: list AI được merge trực tiếp từ generatedListsByDeckId
    // (bộ nhớ, luôn mới nhất) ngay trong buildDatasetContext(), nên CRUD list không cần rebuild Sheet.
  }

  private migrateGeneratedListTextStore(): void {
    if (this.generatedListsByDeckId.size === 0) return;

    let changed = false;
    for (const [deckId, lists] of this.generatedListsByDeckId.entries()) {
      const sanitizedLists = lists.map((list) => {
        const sanitizedList = this.sanitizeGeneratedListText(list, deckId);
        if (JSON.stringify(list) !== JSON.stringify(sanitizedList)) changed = true;
        return sanitizedList;
      });
      this.generatedListsByDeckId.set(deckId, sanitizedLists);
    }

    if (changed) this.persistGeneratedLists();
  }

  // ─── Private: workbook loading ────────────────────────────────────────────

  private getWorkbookSource(): SheetWorkbookSource {
    if (!this.workbookSource) {
      throw new NotFoundException('Chua tai duoc du lieu tu Google Sheet.');
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
        setCachedDriveFileAccessibility(fileId, Boolean(accessible));
      }
    } catch {
      // Ignore invalid cache files.
    }
  }

  private hasDriveAccessCache(): boolean {
    return fs.existsSync(path.join(this.dataRoot, `drive-access-cache.${this.activeDestinationId}.json`));
  }

  private loadCoverImageUrls(sheetDriveManifest: SheetDriveImageManifest): string[] {
    const seen = new Set<string>();
    // Chỉ chọn trong cùng nhóm cover đã được warm cache. Trước đây Green Land
    // warm 120 ảnh nhưng builder lại chọn trên toàn bộ hơn 2.000 ảnh, khiến
    // preview/export phải tải Drive đột xuất và dễ mất nền trên máy khác.
    const coverLimit = Math.max(0, Number(process.env.DALAT_DRIVE_CACHE_COVER_LIMIT || 120));
    return (sheetDriveManifest.coverImages ?? [])
      .slice(0, coverLimit)
      .map((entry) => {
        const fileId = String(entry?.fileId || '').trim();
        if (!fileId || isKnownFailedDriveFileId(fileId)) return '';
        return getDriveImageProxyUrl(fileId);
      })
      .filter((url) => {
        if (!url || seen.has(url)) return false;
        seen.add(url);
        return true;
      });
  }

  private loadWorkbookItems(
    workbook: XLSX.WorkBook,
    imageUrls: string[],
    imageMapping: ImageMappingFile,
    libraryEntries: ImageLibraryFolderEntry[],
    sheetDriveManifest: SheetDriveImageManifest,
  ): WorkbookItemsBySection {
    const results = Object.keys(SECTION_CONFIG).reduce((carry, sectionKey) => {
      carry[sectionKey as SectionKey] = [];
      return carry;
    }, {} as WorkbookItemsBySection);

    let sequence = 0;
    for (const sheetName of workbook.SheetNames) {
      const sectionKey = resolveSectionKeyFromSheetName(sheetName);
      if (!sectionKey) continue;

      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false, defval: '' });
      if (rows.length === 0) continue;

      const headers = (rows[0] ?? []).map((h) => normalizeText(h));
      for (const rawRow of rows.slice(1)) {
        const rowMap: Record<string, string> = {};
        headers.forEach((header, index) => { rowMap[header] = String(rawRow[index] ?? '').trim(); });
        sequence += 1;
        const item = this.buildItem(sectionKey, rowMap, sequence, imageUrls, imageMapping, libraryEntries, sheetDriveManifest);
        // Giữ cả dòng chưa map ảnh để title và địa chỉ vẫn đúng dữ liệu sheet.
        if (item) {
          results[sectionKey].push(item);
        }
      }
    }

    return results;
  }

  private buildItem(
    sectionKey: SectionKey,
    row: Record<string, string>,
    sequence: number,
    imageUrls: string[],
    imageMapping: ImageMappingFile,
    libraryEntries: ImageLibraryFolderEntry[],
    sheetDriveManifest: SheetDriveImageManifest,
  ): GuideItem | null {
    const rawName = firstValue(row, 'ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten');
    if (!rawName) return null;
    const name = this.normalizeDisplayName(rawName);

    const placeType = firstValue(row, 'mo_hinh', 'loai_dich_vu', 'phong_cach');
    const address = firstValue(row, 'dia_chi');
    const openHours = firstValue(row, 'gio_mo_cua', 'gio_mo_cua_', 'gio_mo_cua_1');
    const style = firstValue(row, 'phong_cach');
    const highlight = firstValue(row, 'mo_ta', 'mota', 'mo_ta_dia_diem', 'mon_an_noi_bat', 'mon_noi_bat', 'noi_bat');
    const partner = firstValue(row, 'doi_tac', 'doi_tac_cong_ty');
    const phone = firstValue(row, 'sdt');
    const headPrice = firstValue(row, 'gia_dau_nguoi', 'head_price', 'per_person_price');
    const hasHeadPriceColumn = 'gia_dau_nguoi' in row
      || 'head_price' in row
      || 'per_person_price' in row;
    const price = firstValue(row, 'gia');
    const imageHint = firstValue(row, 'anh', 'hinh_anh', 'hinh', 'ten_anh', 'thu_muc_anh', 'folder_anh', 'link_anh', 'url', 'link');
    const mappingKey = itemMappingKey(sectionKey, rawName, address);
    const displayMappingKey = itemMappingKey(sectionKey, name, address);
    const sheetDriveEntry = sheetDriveManifest.items[mappingKey] ?? sheetDriveManifest.items[displayMappingKey];
    const rawSheetDriveCandidateUrls = sheetDriveEntry
      ? (sheetDriveEntry.candidateImages && sheetDriveEntry.candidateImages.length > 0
          ? sheetDriveEntry.candidateImages
          : [{ fileId: sheetDriveEntry.fileId, fileName: sheetDriveEntry.fileName, viewUrl: '' }]
        )
          .filter((entry) => entry.fileId)
          .map((entry) => getDriveImageProxyUrl(entry.fileId))
      : [];
    const sheetDriveCandidateUrls = filterKnownAccessibleDriveProxyUrls(rawSheetDriveCandidateUrls);
    const sheetDriveUrlsBlocked = rawSheetDriveCandidateUrls.length > 0
      && (sheetDriveCandidateUrls.length === 0
        || rawSheetDriveCandidateUrls.every((url) => isKnownInaccessibleDriveProxyUrl(url)));
    const resolvedByName = () => resolveMappedImage(
      sectionKey, placeType || SECTION_CONFIG[sectionKey].title, rawName, address,
      imageUrls, sequence, imageMapping, libraryEntries, this.workspaceRoot,
    );
    const resolvedByHint = () => resolveMappedImage(
      sectionKey, placeType || SECTION_CONFIG[sectionKey].title, imageHint, address,
      imageUrls, sequence, imageMapping, libraryEntries, this.workspaceRoot,
    );
    const fallbackResolvedImage = (): ReturnType<typeof resolveMappedImage> => {
      const direct = resolvedByName();
      if (!imageHint || normalizeText(imageHint) === normalizeText(rawName)) return direct;
      const hinted = resolvedByHint();
      return hinted.imageMapped || hinted.imageSource !== 'fallback'
        ? { ...hinted, imageMappingKey: mappingKey }
        : direct;
    };
    
    const directImageUrls = imageHint ? imageHint.split(/[\n,;]+/).map(s => s.trim()).filter(s => /^https?:\/\//i.test(s)) : [];

    // Item đã có ảnh Drive/link trực tiếp riêng của chính nó -> KHÔNG trộn thêm ảnh thư viện nền chung
    // (resolveMappedImage so khớp mờ theo tên, dễ khớp nhầm sang địa điểm khác) vào candidateImageUrls.
    // Chỉ dùng thư viện nền làm nguồn ảnh khi item không có ảnh thật nào.
    const resolvedImage = sheetDriveEntry && sheetDriveCandidateUrls.length > 0 && !sheetDriveUrlsBlocked
      ? {
          imageUrl: sheetDriveCandidateUrls[0] || getDriveImageProxyUrl(sheetDriveEntry.fileId),
          imageMapped: true,
          imageMappingKey: mappingKey,
          imageSource: 'manual' as const,
          candidateImageUrls: Array.from(new Set(sheetDriveCandidateUrls)),
        }
      : (directImageUrls.length > 0
          ? {
              imageUrl: directImageUrls[0],
              imageMapped: true,
              imageMappingKey: mappingKey,
              imageSource: 'manual' as const,
              candidateImageUrls: directImageUrls,
            }
          : fallbackResolvedImage());

    return {
      id: `${sectionKey}-${sequence}`,
      sectionKey,
      sectionTitle: SECTION_CONFIG[sectionKey].title,
      name, address,
      type: placeType || SECTION_CONFIG[sectionKey].title,
      openHours, style, highlight,
      partnerFlag: partner,
      isPartner: normalizeText(partner) === 'x',
      headPrice,
      hasHeadPriceColumn,
      price, phone,
      imageUrl: resolvedImage.imageUrl,
      imageMapped: resolvedImage.imageMapped,
      imageMappingKey: resolvedImage.imageMappingKey,
      imageSource: resolvedImage.imageSource,
      candidateImageUrls: resolvedImage.candidateImageUrls,
    };
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

  private createUsageScope(): DataAllocator {
    return new DataAllocator();
  }

  private markUsedInDeck(pages: DeckPage[], scope = this.usedAllocator): void {
    scope.markPages(pages);
  }

  private loadImageMapping(): ImageMappingFile {
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

  private getUsedCaptionTitles(deckId: string): string[] {
    this.ensureGeneratedListsLoaded();
    const titles: string[] = [];
    const pushTitle = (value: string) => {
      const clean = String(value || '').replace(/\s+/g, ' ').trim();
      if (clean) titles.push(clean);
    };

    // Tiêu đề/mô tả list mẫu (main) — list AI không được copy y hệt.
    try {
      const mainList = this.buildDatasetContext().decks
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

  /** Cụm cover/caption mẫu — list mới không được dùng lại nguyên văn. */
  private bannedSampleCaptionPhrases(): string[] {
    return [
      'ĐÀ LẠT 8 ĐIỂM / 1 TRANG',
      'ĐÀ LẠT 8 ĐIỂM/1 TRANG',
      '8 ĐIỂM / 1 TRANG',
      '8 ĐIỂM/1 TRANG',
      '4N3Đ ĐÀ LẠT 8 ĐIỂM MỖI TRANG',
      '8 ĐIỂM MỖI TRANG',
      'LƯU LIỀN 4 NGÀY ĐÀ LẠT',
      'LƯU LIỀN 4 NGÀY',
      'ĐÀ LẠT GỌN TRONG TỪNG LIST',
      'ĐÀ LẠT GỌN TRONG 10 TRANG',
      'GỌN TRONG TỪNG LIST',
      'CẨM NANG ĐÀ LẠT GỌN NHẸ',
      'ĐÀ LẠT NHẸ NHÀNG ĐÁNG GHÉ',
      'NHẸ NHÀNG ĐÁNG GHÉ',
      'ĐÀ LẠT NHỮNG ĐIỂM KHÔNG THỂ BỎ LỠ',
      'NHỮNG ĐIỂM KHÔNG THỂ BỎ LỠ',
      'CHECK-IN ĐÀ LẠT ĐỪNG BỎ LỠ',
      'ĐÀ LẠT CÓ GÌ MÀ ĐI HOÀI',
      'ĐÀ LẠT – GÓC NHỎ ĐÁNG LƯU',
      'ĐÀ LẠT – CHILL TỪNG GÓC PHỐ',
      '4 NGÀY ĐÀ LẠT NHẸ NHÀNG',
      'Mẫu lưới dày để xem nhiều lựa chọn hơn trong một lần lướt.',
      'Mẫu lưới dày để xem nhiều lựa chọn hơn trong một lần lướt',
      'BỎ TÚI NGAY LIST NÀY RỦ BÉ BẠN XÁCH BA LÔ LÊN ĐÀ LẠT CHƠI LIỀN NÈ. CHIA THEO TỪNG LIST ĐỂ CHỌN NHANH, ĐỠ PHẢI LĂN TĂN.',
      'BỎ TÚI NGAY LIST NÀY RỦ BÉ BẠN XÁCH BA LÔ LÊN ĐÀ LẠT CHƠI LIỀN NÈ',
      'CHIA THEO TỪNG LIST ĐỂ CHỌN NHANH, ĐỠ PHẢI LĂN TĂN',
    ];
  }

  private isBannedSampleCaptionText(value: string): boolean {
    const normalized = normalizeText(value);
    if (!normalized) return false;
    if (/8\s*diem\s*\/?\s*1\s*trang/i.test(normalized)) return true;
    if (/8\s*diem\s*moi\s*trang/i.test(normalized)) return true;
    if (/mau\s*luoi\s*day/i.test(normalized)) return true;
    if (/bo\s*tui\s*ngay\s*list\s*nay\s*ru\s*be\s*ban\s*xach\s*ba\s*lo/i.test(normalized)) return true;
    // Title máy móc kiểu "LƯU LIỀN 4 NGÀY ĐÀ LẠT"
    if (/^luu\s*(lien|ngay)\s*\d+\s*ngay(\s*da\s*lat)?$/i.test(normalized)) return true;
    if (/^luu\s*(lien|ngay)\s*(lich\s*trinh|board|list)/i.test(normalized)) return true;
    // Title meta về “list/trang” — kiểu "ĐÀ LẠT GỌN TRONG TỪNG LIST"
    if (/gon\s*trong\s*(tung\s*)?(list|trang|\d+\s*trang)/i.test(normalized)) return true;
    if (/trong\s*tung\s*list/i.test(normalized)) return true;
    if (/cam\s*nang\s*.*\bgon\b/i.test(normalized)) return true;
    if (/^da\s*lat\s+gon(\s|$)/i.test(normalized)) return true;
    if (/nhe\s*nhang\s*dang\s*ghe/i.test(normalized)) return true;
    return this.bannedSampleCaptionPhrases().some((phrase) => {
      const banned = normalizeText(phrase);
      return banned && (normalized === banned || normalized.includes(banned) || banned.includes(normalized));
    });
  }

  private coverTitleMaxLen(deckId = ''): number {
    if (deckId === 'grid-8' || deckId === 'grid-8-feed' || deckId === 'itinerary-4n2d-grid8') return 48;
    return 35;
  }

  private itineraryGrid8CoverTitleFallback(seed = ''): string {
    const pool = [
      'ĐÀ LẠT 4N3Đ – CHUYẾN ĐI KHÔNG MUỐN KẾT THÚC',
      'BỐN NGÀY NHƯ MỘT BỨC TRANH',
      'ĐÀ LẠT 4N3Đ – Ở LẠI THÊM MỘT CHÚT',
      'ĐÀ LẠT – BỐN NGÀY GIỮ LẠI BẦU TRỜI',
      'ĐÀ LẠT 4N3Đ – ĐI CHẬM ĐỂ NHỚ LÂU',
    ].map((title) => localizeText(title, this.activeDestinationId));
    const index = Math.abs(stableHash(`itinerary-grid8-title:${seed || Date.now()}`)) % pool.length;
    return pool[index].slice(0, this.coverTitleMaxLen('itinerary-4n2d-grid8'));
  }

  /** Title cover lưới 8 / feed — thơ / cảm xúc, kiểu “Đà Lạt – …”. */
  private grid8CoverTitleFallback(seed = ''): string {
    const pool = [
      'ĐÀ LẠT – MỖI GÓC PHỐ LÀ MỘT BỨC TRANH',
      'ĐÀ LẠT – CHUYẾN ĐI MÀ MÌNH KHÔNG MUỐN KẾT THÚC',
      'ĐÀ LẠT – NƠI LÒNG MUỐN Ở LẠI',
      'ĐÀ LẠT – GÓC NHỎ LÀM MÌNH THƯƠNG',
      'ĐÀ LẠT – ĐI MỘT LẦN NHỚ MÃI',
      'ĐÀ LẠT – CHẬM LẠI MỘT NHỊP THỞ',
    ].map((title) => localizeText(title, this.activeDestinationId));
    const index = Math.abs(stableHash(`grid8-title:${seed || Date.now()}`)) % pool.length;
    return pool[index].slice(0, this.coverTitleMaxLen('grid-8'));
  }

  private coverTitleFallbackForDeck(deckId: string, seed = ''): string {
    if (deckId === 'itinerary-4n2d-grid8') return this.itineraryGrid8CoverTitleFallback(seed);
    if (deckId === 'grid-8' || deckId === 'grid-8-feed') return this.grid8CoverTitleFallback(seed);
    return localizeText('ĐI ĐÀ LẠT THÌ LƯU NGAY LIST NÀY', this.activeDestinationId).slice(0, 35);
  }

  private buildDeepSeekPrompt(
    deck: GuideDeck,
    deckList: GuideDeckList,
    tone: DeepSeekCaptionResponse['tone'],
    target: DeepSeekCaptionResponse['target'],
    current: { coverTitle: string; headline: string; body: string; hashtags: string[] },
    usedTitles: string[] = [],
  ): string {
    const pageLines = deckList.pages.map((page, index) => {
      if (page.type === 'cover') {
        // Không đưa tiêu đề/mô tả mẫu vào prompt — AI hay copy y hệt (vd. "ĐÀ LẠT 8 ĐIỂM / 1 TRANG").
        return `Trang ${index + 1}: cover | tự viết coverTitle + body mới (KHÔNG copy tiêu đề/mô tả mẫu)`;
      }
      const itemLines = page.items.map((item, i) => `- ${i + 1}. ${item.name} | ${item.metaPrimary} | ${item.metaSecondary}`).join('\n');
      return [`Trang ${index + 1}: list`, `Chủ đề: ${page.chipText}`, `Tiêu đề: ${page.title}`, `Mô tả: ${page.subtitle}`, 'Địa điểm:', itemLines].join('\n');
    });

    const toneInstructions: Record<DeepSeekCaptionResponse['tone'], string> = {
      gen_z: 'Sử dụng ngôn ngữ trẻ trung, năng động, dùng nhiều từ lóng Gen Z (chill, đỉnh nóc, chốt đơn, mlem, cháy...), cấu trúc câu ngắn gọn, có thể dùng icon linh hoạt. Headline ví dụ: "ĐÀ LẠT PHÁ ĐẢO CÙNG BESTIE", "CHÁY PHỐ ĐÀ LẠT 0Đ", "TOP SPOT CHILL CỰC ĐỈNH".',
      tinh_te: 'Giọng văn nhẹ nhàng, bay bổng, giàu cảm xúc và hình ảnh. Tập trung vào không gian, cảm giác yên bình và vẻ đẹp thơ mộng của Đà Lạt. Headline ví dụ: "ĐÀ LẠT VÀ NHỮNG BẢN TÌNH CA", "NƠI TÌM VỀ MIỀN KÝ ỨC", "CHÚT TÌNH GỬI GIÓ ĐÀ LẠT".',
      review_chan_that: 'Giọng văn thực tế, đi thẳng vào vấn đề, chia sẻ trải nghiệm thật (khen chê rõ ràng nhưng vẫn giữ thái độ tích cực). Nhấn mạnh vào tính hữu ích. Headline ví dụ: "SỰ THẬT VỀ ĐÀ LẠT MÙA NÀY", "LIST QUÁN ĂN NGON BẤT BẠI", "ĐI ĐÀ LẠT ĐỪNG BỎ QUA NƠI NÀY".',
      ban_hang_nhe: 'Giọng văn mời gọi nhưng không quá lộ liễu, khéo léo lồng ghép lợi ích khi sử dụng dịch vụ/địa điểm. Tập trung vào sự tiện lợi và chất lượng. Headline ví dụ: "TRẢI NGHIỆM ĐÀ LẠT KHÁC BIỆT", "DỊCH VỤ TOUR ĐÀ LẠT CHẤT LƯỢNG", "ƯU ĐÃI ĐỘC QUYỀN TẠI ĐÀ LẠT".',
      lich_trinh_huu_ich: 'Cung cấp thông tin rõ ràng, logic, theo trình tự thời gian hoặc chủ đề. Giọng văn hướng dẫn, tận tâm như một hướng dẫn viên bản địa. Headline ví dụ: "LỊCH TRÌNH 3N2Đ TỐI ƯU NHẤT", "CẨM NANG DU LỊCH ĐÀ LẠT TỰ TÚC", "TỔNG HỢP ĐIỂM ĐẾN HOT NHẤT".',
    };

    const diversityAngles = [
      'chon mot trai nghiem mo dau that cu the, gan voi cam giac di Da Lat trong ngay do',
      'viet nhu mot loi nhac rieng cho ban than sap len lich di Da Lat',
      'bat dau tu mot loi ich thuc te: de chon quan, de chon diem, de sap xep thoi gian',
      'ke nhu mot review ngan sau khi vua di ve, co chi tiet that va khong qua quang cao',
      'dung goc nhin tiet kiem cong suc: nguoi xem chi can luu lai va di theo',
      'tao cam giac phat hien duoc vai diem dang thu trong list',
      'viet gon nhu caption de dang copy dang TikTok, nhung van co chat rieng',
      'uu tien nhac den nhom ban, cap doi hoac nguoi moi di Da Lat lan dau',
    ];
    const bodyShapes = [
      '2 cau ngan: cau 1 tao ly do luu lai, cau 2 noi loi ich cua list, khong goi ten hay liet ke dia diem',
      '3 menh de lien tiep, nhip nhanh, khong liet ke may moc',
      'mot cau mo dau co cam giac, mot cau sau noi ro list nay giup gi',
      'viet nhu loi ru ban di choi, cuoi bang loi nhac luu lai nhe',
      'review that gon: noi list hop voi ai, khong goi ten dia diem cu the',
      'caption nhe nha: co canh, co mon hoac quan, co ly do nen luu',
    ];
    const variationSeed = stableHash([
      deck.id,
      deckList.id,
      tone,
      target,
      current.coverTitle,
      current.headline,
      current.body,
      current.hashtags.join(','),
      Date.now().toString(),
      Math.random().toString(36).slice(2),
    ].join('|'));
    const diversityAngle = diversityAngles[variationSeed % diversityAngles.length];
    const bodyShape = bodyShapes[Math.floor(variationSeed / diversityAngles.length) % bodyShapes.length];

    const deckNotes = deck.id === 'itinerary-4n2d-grid8'
      ? [
        'Lưu ý đặc biệt: đây là lịch trình 4N3Đ (4 đêm 3 ngày), mỗi ngày một trang lưới 8 ô. Không gọi là 3N2Đ hay 4N2Đ trong caption.',
        'coverTitle phải thơ / cảm xúc, kiểu “Đà Lạt – …” hoặc “Đà Lạt 4N3Đ – …”.',
        'VD tốt: "ĐÀ LẠT 4N3Đ – CHUYẾN ĐI KHÔNG MUỐN KẾT THÚC", "BỐN NGÀY NHƯ MỘT BỨC TRANH", "ĐÀ LẠT 4N3Đ – Ở LẠI THÊM MỘT CHÚT".',
        'TRÁNH title máy móc: "LƯU LIỀN 4 NGÀY ĐÀ LẠT", "LƯU NGAY LỊCH TRÌNH", "4 NGÀY ĐÀ LẠT GỌN", "NHỮNG ĐIỂM KHÔNG THỂ BỎ LỠ".',
      ].join(' ')
      : deck.id === 'grid-8' || deck.id === 'grid-8-feed'
        ? [
          'Body cho cover nên 1–2 câu ngắn (≤118 ký tự), dễ đọc trong 3 dòng.',
          'coverTitle phải thơ / cảm xúc, cấu trúc "ĐÀ LẠT – …".',
          'VD tốt: "ĐÀ LẠT – MỖI GÓC PHỐ LÀ MỘT BỨC TRANH", "ĐÀ LẠT – CHUYẾN ĐI MÀ MÌNH KHÔNG MUỐN KẾT THÚC", "ĐÀ LẠT – NƠI LÒNG MUỐN Ở LẠI".',
          'TRÁNH title máy móc/meta/listicle: "GỌN TRONG TỪNG LIST", "8 ĐIỂM / 1 TRANG", "NHỮNG ĐIỂM KHÔNG THỂ BỎ LỠ", "CHECK-IN ĐỪNG BỎ LỠ", "CÓ GÌ MÀ ĐI HOÀI".',
        ].join(' ')
        : '';

    const destinationLabel = cityLabel(this.activeDestinationId);
    const coreHashtags = getMarketingCopy(this.activeDestinationId).hashtags.slice(0, 3).join(' ');
    const deckHashtagExtras = getDeckHashtagExtras(deck.id, this.activeDestinationId).join(' ');

    return [
      `Tạo nội dung TikTok cho bộ ảnh du lịch ${destinationLabel} sau.`,
      `Tên chủ đề: ${deck.title}`,
      `Mô tả chung: ${deck.description}`,
      deckNotes,
      `Danh sách địa điểm: ${deckList.title}`,
      `Mô tả danh sách: ${deckList.description}`,
      `Tone yêu cầu: ${tone}`,
      `Hướng dẫn giọng văn: ${toneInstructions[tone]}`,
      `Phần cần sinh: ${target}`,
      `Goc trien khai bat buoc cho lan sinh nay: ${diversityAngle}.`,
      `Kieu body bat buoc cho lan sinh nay: ${bodyShape}.`,
      current.coverTitle ? `Tiêu đề cover hiện tại: ${current.coverTitle}` : '',
      current.headline ? `Caption đăng bài hiện tại: ${current.headline}` : '',
      current.body ? `Body hiện tại: ${current.body}` : '',
      current.hashtags.length ? `Hashtags hiện tại: ${current.hashtags.join(' ')}` : '',
      '',
      (current.coverTitle || current.headline || current.body)
        ? 'QUAN TRỌNG: Nội dung bạn sinh ra lần này PHẢI HOÀN TOÀN KHÁC với nội dung hiện tại ở trên. Không được dùng lại cùng ý, cùng cấu trúc câu, cùng từ mở đầu, hay cùng góc nhìn. Hãy đổi hoàn toàn cách tiếp cận, dùng từ vựng khác, mở đầu khác, và truyền tải thông điệp theo hướng mới.'
        : '',
      usedTitles.length > 0
        ? `CÁC TIÊU ĐỀ ĐÃ DÙNG (TUYỆT ĐỐI KHÔNG ĐƯỢC LẶP LẠI BẤT KỲ CÁI NÀO DƯỚI ĐÂY):\n${usedTitles.map((t, i) => `${i + 1}. "${t}"`).join('\n')}\nHãy nghĩ ra tiêu đề và caption hoàn toàn mới, khác 100% so với danh sách trên.`
        : '',
      '',
      'DỮ LIỆU ĐỊA ĐIỂM CHI TIẾT:',
      ...pageLines,
      '',
      'YÊU CẦU QUAN TRỌNG VỀ COVER TITLE (TIÊU ĐỀ TRANG COVER):',
      '- `coverTitle` là chữ in đậm ở trang bìa của bộ ảnh. Phải dễ scan, có hồn.',
      deck.id === 'grid-8' || deck.id === 'grid-8-feed' || deck.id === 'itinerary-4n2d-grid8'
        ? '- Với lưới 8 / lịch trình lưới 8: tối đa 48 ký tự. Ưu tiên cấu trúc "ĐÀ LẠT – …" (thơ, cảm xúc).'
        : '- Tuyệt đối KHÔNG vượt quá 35 ký tự (tính cả khoảng trắng).',
      '- Viết hoa hoặc rất nổi bật, bám sát "Tone yêu cầu". Không được trùng với "Caption đăng bài".',
      '- Không dùng chữ "free" trong cover title. Thay bằng "0đ", "dễ đi", "gọn ví" hoặc bỏ luôn.',
      '- Không nhắc tên quán/địa điểm cụ thể trong cover title.',
      '- KHÔNG copy tiêu đề mẫu kiểu "… 8 ĐIỂM / 1 TRANG", "8 điểm một trang", hay bất kỳ tiêu đề nào trong danh sách đã dùng.',
      deck.id === 'grid-8' || deck.id === 'grid-8-feed'
        ? '- Với mẫu lưới 8: coverTitle kiểu "ĐÀ LẠT – MỖI GÓC PHỐ LÀ MỘT BỨC TRANH". CẤM meta layout / listicle cứng. Body ≤118 ký tự, 1–2 câu.'
        : '',
      deck.id === 'itinerary-4n2d-grid8'
        ? '- Với lịch trình 4N3Đ lưới 8: coverTitle kiểu "ĐÀ LẠT 4N3Đ – CHUYẾN ĐI KHÔNG MUỐN KẾT THÚC", tránh "LƯU LIỀN … NGÀY". Body 1–2 câu ngắn.'
        : '',
      '',
      'YÊU CẦU QUAN TRỌNG VỀ HEADLINE (CAPTION ĐĂNG BÀI):',
      '- `headline` là caption người dùng copy để dán vào TikTok khi đăng bài.',
      '- Chỉ viết DUY NHẤT 1 câu ngắn gọn (tối đa 80 ký tự), giọng văn bám sát "Tone yêu cầu".',
      '- Câu phải có hook thu hút ngay, có thể thêm 1 emoji cuối câu (không quá 1 emoji).',
      '- Không lặp lại nguyên văn cover title. Không dùng chữ "free" / "deck".',
      '- Có thể mời người xem lưu lại bộ ảnh, nhưng tuyệt đối không gọi tên địa điểm/quán cụ thể.',
      '- KHÔNG dùng lại caption mẫu kiểu "BỎ TÚI NGAY LIST NÀY RỦ BÉ BẠN XÁCH BA LÔ...".',
      '',
      'CÁC YÊU CẦU KHÁC:',
      '- TUYỆT ĐỐI không dùng từ "deck" trong nội dung. Thay vào đó hãy dùng: "hình", "ảnh", "bộ ảnh", "cẩm nang", "lịch trình", "list này"...',
      '- Không dùng từ "ảnh" để chỉ bộ nội dung — dùng "list" hoặc "bộ" thay thế.',
      '- Không dùng các cụm diễn đạt nội bộ như "ảnh đã chọn", "bộ ảnh này", "ghim ảnh".',
      '- Tránh lỗi chính tả: "đông đúc" (không phải "đông đúng"), "nơi đẹp mê ly" (không phải "nơi đẹp thẳng thừng").',
      '- Không để câu bị cụt hoặc dư ký tự lạ ở cuối (như "ng", "c", "ghim").',
      '- Body: Phải đa dạng cấu trúc câu, không lặp lại các motif cũ. Tối đa 250 ký tự. Tuyệt đối không liệt kê hoặc gọi tên địa điểm/quán cụ thể trong list.',
      '- Body không được viết kiểu lịch trình theo từng chặng/ngày như "ngày đầu ghé...", "ngày hai...", "tối lượn..."; chỉ nói lợi ích tổng quát của list.',
      '- Dữ liệu địa điểm chỉ dùng để hiểu tinh thần list; không chép tên địa điểm/quán vào cover title, headline, hay body caption.',
      '- Khong mo ta bo cuc thiet ke hoac kich thuoc layout trong caption. Tranh cac cum: "2x3", "3x3", "2x4", "luoi", "layout", "grid", "o anh", "o hinh", "8 diem / 1 trang".',
      '- Moi lan bam sinh lai phai doi goc viet, doi nhip cau, doi dong tu mo dau; khong chi thay vai tu dong nghia.',
      `- Hashtags: đúng 5 hashtag. 3 hashtag đầu BẮT BUỘC cố định: ${coreHashtags}. 2 hashtag cuối cố định theo mẫu "${deck.navTitle || deck.id}": ${deckHashtagExtras}. Không đổi thứ tự, không thay 3 hashtag đầu.`,
      '- Trả về JSON object đúng schema:',
      '{"coverTitle":"...","headline":"...","body":"...","hashtags":["#...","#...","#...","#...","#..."]}',
    ].filter(Boolean).join('\n');
  }

  private isPov3ImageMappingNote(value: string): boolean {
    return /^(?:Ảnh (?:đã map|tự map|minh họa|đối tác)|Thông tin đối tác)/i.test(String(value || '').trim());
  }

  private async enrichPov3V2StackTaglines(pages: DeckPage[]): Promise<DeckPage[]> {
    const apiKey = String(process.env.DEEPSEEK_API_KEY ?? '').trim();
    if (!apiKey) return pages;

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
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'Chỉ trả về JSON object hợp lệ, không markdown, không giải thích.' },
            { role: 'user', content: prompt },
          ],
          temperature: 1.05,
          max_tokens: 1200,
          stream: false,
        }),
        signal: controller.signal,
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
    } catch {
      return pages;
    } finally {
      clearTimeout(timer);
    }
  }

  private parseDeepSeekJson(content: string): Record<string, unknown> {
    const direct = this.tryParseJson(content);
    if (direct) return direct;
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) { const p = this.tryParseJson(fenced[1]); if (p) return p; }
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const p = this.tryParseJson(content.slice(firstBrace, lastBrace + 1));
      if (p) return p;
    }
    throw new BadRequestException('Không parse được JSON caption từ DeepSeek.');
  }

  private collectCaptionForbiddenNames(deckList: GuideDeckList): string[] {
    const names = new Map<string, string>();
    const addName = (value?: string) => {
      const name = String(value ?? '').replace(/\s+/g, ' ').trim();
      if (name.length < 3) return;
      names.set(this.normalizeCaptionNameKey(name), name);
    };

    for (const page of deckList.pages) {
      if (page.type !== 'list') continue;
      for (const item of page.items) {
        addName(item.rawName);
        addName(item.name);
        addName(item.name.split(/:\s*/).slice(1).join(': '));
      }
    }

    return [...names.values()].sort((a, b) => b.length - a.length);
  }

  private removeForbiddenPlaceNames(value: string, forbiddenPlaceNames: string[]): string {
    let clean = value;
    for (const name of forbiddenPlaceNames) {
      for (const candidate of this.getPlaceNameCandidates(name)) {
        const escaped = this.escapeRegExp(candidate).replace(/\s+/g, '\\s+');
        const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'giu');
        clean = clean.replace(pattern, '$1một điểm trong list');
      }
    }

    return clean
      .replace(/một điểm trong list\s+(?:hay|hoặc|và)\s+một điểm trong list/giu, 'vài điểm trong list')
      .replace(/một điểm trong list(?:\s*,\s*một điểm trong list)+/giu, 'vài điểm trong list')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.!?])/g, '$1')
      .trim();
  }

  private hasForbiddenPlaceName(value: string, forbiddenPlaceNames: string[]): boolean {
    return forbiddenPlaceNames.some((name) => this.getPlaceNameCandidates(name).some((candidate) => {
      const escaped = this.escapeRegExp(candidate).replace(/\s+/g, '\\s+');
      return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(value);
    }));
  }

  private getPlaceNameCandidates(name: string): string[] {
    const normalized = name.replace(/\s+/g, ' ').trim();
    const unaccented = this.stripVietnameseMarks(normalized);
    return [...new Set([normalized, unaccented].filter((value) => value.length >= 3))];
  }

  private normalizeCaptionNameKey(value: string): string {
    return this.stripVietnameseMarks(value).toLowerCase();
  }

  private stripVietnameseMarks(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D');
  }

  /**
   * Post-processing sanitizer applied to ALL text content (both new AI output and old data).
   * Fixes: wrong words, dangling chars, internal jargon, typos.
   */
  private sanitizeContentText(value: string): string {
    return String(value || '').normalize('NFC')
      // Fix typos from feedback
      .replace(/(^|[^\p{L}\p{N}])đông\s*đúng(?=$|[^\p{L}\p{N}])/giu, '$1đông đúc')
      .replace(/(^|[^\p{L}\p{N}])nơi\s*đẹp\s*thẳng\s*thừng(?=$|[^\p{L}\p{N}])/giu, '$1nơi đẹp mê ly')
      .replace(/(^|[^\p{L}\p{N}])mở\s*to\s*mắt(?=$|[^\p{L}\p{N}])/giu, '$1mở mang tầm mắt')
      .replace(/(^|[^\p{L}\p{N}])Săn\s*ảnh\s*và\s*bắt\s*sáng(?=$|[^\p{L}\p{N}])/giu, '$1Săn ảnh và ăn sáng')
      .replace(/(^|[^\p{L}\p{N}])3\s*ngày\s*chẳng\s*cần\s*chỉnh\s*sửa\s*gì(?=$|[^\p{L}\p{N}])/giu, '$13 ngày chẳng cần nghĩ ngợi gì')
      .replace(/(^|[^\p{L}\p{N}])đủ\s*ăn\s*uống(?=$|[^\p{L}\p{N}])/giu, '$1đủ bữa ăn')
      .replace(/(^|[^\p{L}\p{N}])điểm\s*ăn\s*uống(?=$|[^\p{L}\p{N}])/giu, '$1điểm ăn')
      .replace(/(^|[^\p{L}\p{N}])địa\s*chỉ\s*ăn\s*uống(?=$|[^\p{L}\p{N}])/giu, '$1địa chỉ ăn ngon')
      .replace(/(^|[^\p{L}\p{N}])không\s*chỉ\s*ăn\s*uống\s*và\s*chụp\s*ảnh(?=$|[^\p{L}\p{N}])/giu, '$1không chỉ chụp ảnh rồi đi tiếp')
      .replace(/(^|[^\p{L}\p{N}])trước\s*khi\s*thêm\s*cafe\s*hay\s*ăn\s*uống(?=$|[^\p{L}\p{N}])/giu, '$1trước khi thêm cafe hay điểm ăn')
      .replace(/(^|[^\p{L}\p{N}])mấy\s*chỗ\s*ăn\s*uống(?=$|[^\p{L}\p{N}])/giu, '$1mấy chỗ ăn ngon')
      .replace(/(^|[^\p{L}\p{N}])chọn\s*điểm\s*đi,\s*ăn\s*uống\s*và\s*chụp\s*hình(?=$|[^\p{L}\p{N}])/giu, '$1chọn điểm đi, quán ăn và góc chụp')
      .replace(/(^|[^\p{L}\p{N}])từ\s*ăn\s*uống,\s*check-?in(?=$|[^\p{L}\p{N}])/giu, '$1từ quán ăn, check-in')
      .replace(/(^|[^\p{L}\p{N}])nhóm\s*ăn\s*uống(?=$|[^\p{L}\p{N}])/giu, '$1nhóm quán ăn')
      .replace(/(^|[^\p{L}\p{N}])Ăn\s*uống(?=$|[^\p{L}\p{N}])/gu, '$1Quán ăn')
      .replace(/(^|[^\p{L}\p{N}])ăn\s*uống(?=$|[^\p{L}\p{N}])/giu, '$1quán ăn')
      .replace(/(^|[^\p{L}\p{N}])Nhấn\s*lưu\s*liền\s*kẻo(?=$|[^\p{L}\p{N}])/giu, '$1Nhấn lưu liền kẻo quên nhé')
      .replace(/(^|[^\p{L}\p{N}])lưu\s*lại(?=\s*$)/giu, '$1lưu lại ngay nhé')
      .replace(/(^|[^\p{L}\p{N}])Đà\s*Lạt\s*ẩn\s*mình\s*sau\s*vách\s*núi(?=$|[^\p{L}\p{N}])/giu, '$1Đầy đủ kinh nghiệm cho chuyến đi Đà Lạt')
      .replace(/(^|[^\p{L}\p{N}])Đà\s*Lạt\s*đủ\s*để\s*đi\s*ngay(?=$|[^\p{L}\p{N}])/giu, '$1Đầy đủ kinh nghiệm cho chuyến đi Đà Lạt')
      // Remove dangling chars at end of sentence (ng, c, ghim, g alone)
      .replace(/\s+\b(ng|ghim|c|g)\b\s*([.!?…]*)$/gi, '$2')
      // Remove internal jargon
      .replace(/(^|[^\p{L}\p{N}])bộ\s*ảnh\s*này(?=$|[^\p{L}\p{N}])/giu, '$1list này')
      .replace(/(^|[^\p{L}\p{N}])bộ\s*ảnh(?=$|[^\p{L}\p{N}])/giu, '$1list')
      .replace(/(^|[^\p{L}\p{N}])ảnh\s*đã\s*chọn(?=$|[^\p{L}\p{N}])/giu, '$1các điểm đã chọn')
      .replace(/(^|[^\p{L}\p{N}])ghim\s*ảnh(?=$|[^\p{L}\p{N}])/giu, '$1lưu lại')
      .replace(/(^|[^\p{L}\p{N}])lưu\s*ảnh(?=$|[^\p{L}\p{N}])/giu, '$1lưu list')
      .replace(/(^|[^\p{L}\p{N}])các\s*ảnh\s*đã\s*chọn(?=$|[^\p{L}\p{N}])/giu, '$1các điểm đã chọn')
      // Clean up extra spaces
      .replace(/\.{4,}/g, '...')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.!?])/g, '$1')
      .trim();
  }

  private sanitizeGeneratedListText(list: GuideDeckList, deckId?: string): GuideDeckList {
    const resolvedDeckId = deckId || resolveDeckIdFromListId(list.id);
    const pages = Array.isArray(list.pages)
      ? list.pages.map((page) => this.sanitizeDeckPageText(page))
      : [];
    const isGrid8Feed = String(list.id || '').startsWith('grid-8-feed');
    const postCaptionRaw = isGrid8Feed
      ? normalizeGrid8FeedPostCaption(String(list.postCaption || ''))
      : (list.postCaption ? this.sanitizeContentText(localizeText(list.postCaption, this.activeDestinationId)) : list.postCaption);
    const postCaption = this.isBannedSampleCaptionText(String(postCaptionRaw || ''))
      ? localizeText('Lưu list này rồi đi Đà Lạt cho đỡ mò từng nơi nhé.', this.activeDestinationId)
      : postCaptionRaw;
    const safeCoverFallback = this.coverTitleFallbackForDeck(resolvedDeckId || '', String(list.id || ''));
    const safeBodyFallback = getMarketingCopy(this.activeDestinationId).captionBodyFallback;
    let coverTitle = list.coverTitle
      ? this.sanitizeContentText(sanitizeDeckHeadline(localizeText(list.coverTitle, this.activeDestinationId)))
      : list.coverTitle;
    if (this.isBannedSampleCaptionText(String(coverTitle || ''))) coverTitle = safeCoverFallback;
    let title = this.sanitizeContentText(sanitizeDeckHeadline(localizeText(list.title || '', this.activeDestinationId)));
    if (this.isBannedSampleCaptionText(title)) title = safeCoverFallback;
    let description = this.sanitizeContentText(localizeText(list.description || '', this.activeDestinationId));
    if (this.isBannedSampleCaptionText(description)) description = safeBodyFallback;
    const localized = {
      ...list,
      navTitle: this.sanitizeContentText(localizeText(list.navTitle || '', this.activeDestinationId)),
      title,
      description,
      coverTitle,
      postCaption,
      captionHashtags: Array.isArray(list.captionHashtags)
        ? buildCaptionHashtags(
          list.captionHashtags.map((tag) => String(tag || '').trim()).filter(Boolean),
          'lich_trinh_huu_ich',
          this.activeDestinationId,
          resolvedDeckId,
        )
        : list.captionHashtags,
      pages: pages.map((page) => {
        if (page.type !== 'cover') return page;
        let pageTitle = page.title;
        let pageSubtitle = page.subtitle;
        if (this.isBannedSampleCaptionText(pageTitle)) pageTitle = String(coverTitle || safeCoverFallback);
        if (this.isBannedSampleCaptionText(pageSubtitle)) pageSubtitle = description || safeBodyFallback;
        return { ...page, title: pageTitle, subtitle: pageSubtitle };
      }),
    };
    return localized;
  }

  private sanitizeDeckPageText(page: DeckPage): DeckPage {
    if (page.type === 'cover') {
      let subtitle = this.sanitizeContentText(localizeText(page.subtitle || '', this.activeDestinationId));
      if (page.layoutVariant === 'grid-8-feed') {
        subtitle = this.sanitizeContentText(truncateGrid8FeedCoverSubtitle(subtitle));
      } else if (page.layoutVariant === 'spotlight-v2') {
        subtitle = this.sanitizeContentText(truncateSpotlightV2CoverSubtitle(subtitle));
      }
      return {
        ...page,
        title: this.sanitizeContentText(sanitizeDeckHeadline(localizeText(page.title || '', this.activeDestinationId))),
        subtitle,
      };
    }

    const cleanPage: DeckPage = {
      ...page,
      chipText: this.sanitizeContentText(localizeText(page.chipText || '', this.activeDestinationId)),
      title: this.sanitizeContentText(sanitizeDeckHeadline(localizeText(page.title || '', this.activeDestinationId))),
      subtitle: this.sanitizeContentText(localizeText(page.subtitle || '', this.activeDestinationId)),
      items: Array.isArray(page.items)
        ? page.items.map((item) => this.sanitizePageItemText(item, page))
        : [],
    };

    return this.ensureBudgetTableTotalItem(cleanPage);
  }

  private ensureBudgetTableTotalItem(page: DeckPage): DeckPage {
    if (page.type !== 'list' || page.layoutVariant !== 'budget-3n2d-table') return page;

    const items = Array.isArray(page.items) ? page.items : [];
    const totalIndex = items.findIndex((item) => {
      const key = normalizeText(`${item.id || ''} ${item.label || ''} ${item.name || ''}`);
      return key.includes('summary_total') || key.includes('tong_cong') || key.includes('tong_thanh_toan');
    });

    const categoryItems = items.filter((item) => {
      const label = String(item.label || '');
      if (!label.startsWith('Tổng|')) return false;
      const key = normalizeText(`${item.id || ''} ${item.label || ''} ${item.name || ''}`);
      return !key.includes('summary_total') && !key.includes('tong_cong') && !key.includes('tong_thanh_toan');
    });

    const computedTotal = categoryItems.length >= 4
      ? this.sumBudgetSummaryCategories(categoryItems.map((item) => item.metaSecondary || ''))
      : '';

    if (totalIndex >= 0) {
      const currentTotal = items[totalIndex];
      const nextSecondary = computedTotal || currentTotal.metaSecondary;
      if (nextSecondary === currentTotal.metaSecondary) return page;
      const nextItems = [...items];
      nextItems[totalIndex] = {
        ...currentTotal,
        label: currentTotal.label || 'Tổng|Tổng cộng',
        name: currentTotal.name || 'Tổng cộng',
        metaPrimary: currentTotal.metaPrimary || 'Tổng các khoản trên',
        metaSecondary: nextSecondary,
      };
      return { ...page, items: nextItems };
    }

    const totalItem: PageItem = {
      id: 'budget-3n2d-summary-total',
      label: 'Tổng|Tổng cộng',
      name: 'Tổng cộng',
      metaPrimary: 'Tổng các khoản trên',
      metaSecondary: computedTotal || '~0k',
      imageUrl: '',
      imageMapped: false,
      imageNote: '',
      imageSource: 'fallback',
      candidateImageUrls: [],
    };

    return { ...page, items: [...items, totalItem] };
  }

  private sumBudgetSummaryCategories(amounts: string[]): string {
    let min = 0;
    let max = 0;
    for (const amount of amounts) {
      const range = this.parseBudgetCostRange(amount);
      min += range.min;
      max += range.max;
    }
    if (min <= 0 && max <= 0) return '';
    if (min === max) return this.formatBudgetCostAmount(min);
    if (Math.abs(max - min) <= Math.max(min, max) * 0.08) {
      return this.formatBudgetCostAmount(Math.round((min + max) / 2));
    }
    return `${this.formatBudgetCostAmount(min)} - ${this.formatBudgetCostAmount(max)}`;
  }

  private parseBudgetCostRange(raw: string): { min: number; max: number } {
    const cleaned = String(raw || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!cleaned || /đã tính|miễn phí|free|^0\s*đ?$/.test(cleaned)) {
      return { min: 0, max: 0 };
    }
    const parseNum = (value: string) => {
      const normalized = value.trim().replace(',', '.');
      if (normalized.includes('.') && normalized.split('.')[1]?.length === 3) {
        return Number(normalized.replace('.', '')) || 0;
      }
      return Number(normalized) || 0;
    };
    const trRange = cleaned.match(/([\d.,]+)\s*tr\s*-\s*([\d.,]+)\s*tr/);
    if (trRange) {
      return { min: parseNum(trRange[1]) * 1_000_000, max: parseNum(trRange[2]) * 1_000_000 };
    }
    const singleTr = cleaned.match(/~?\s*([\d.,]+)\s*tr/);
    if (singleTr) {
      const value = parseNum(singleTr[1]) * 1_000_000;
      return { min: value, max: value };
    }
    const kRange = cleaned.match(/([\d.,]+)\s*k\s*-\s*([\d.,]+)\s*k/);
    if (kRange) {
      return { min: parseNum(kRange[1]) * 1_000, max: parseNum(kRange[2]) * 1_000 };
    }
    const singleK = cleaned.match(/~?\s*([\d.,]+)\s*k/);
    if (singleK) {
      const value = parseNum(singleK[1]) * 1_000;
      return { min: value, max: value };
    }
    const plainVnd = cleaned.match(/([\d.,]+)\s*(?:đ|vnd|vnđ)/);
    if (plainVnd) {
      const value = parseNum(plainVnd[1]);
      return { min: value, max: value };
    }
    return { min: 0, max: 0 };
  }

  private formatBudgetCostAmount(vnd: number): string {
    if (vnd <= 0) return '';
    if (vnd >= 1_000_000) {
      const tr = vnd / 1_000_000;
      const rounded = Math.round(tr * 10) / 10;
      return `~${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}tr`;
    }
    return `~${Math.round(vnd / 1000)}k`;
  }

  private sanitizePageItemText(item: PageItem, page?: DeckPage): PageItem {
    const isBudgetTableItem = page?.type === 'list' && page.layoutVariant === 'budget-3n2d-table';
    const isPov3V2Stack = page?.type === 'list' && page.layoutVariant === 'pov-3-v2-stack';
    const stackTagline = isPov3V2Stack
      ? finalizePov3V2Tagline({ name: item.name, highlight: item.label || item.imageNote || '', sectionKey: item.sourceSectionKey } as GuideItem)
      : '';
    return {
      ...item,
      label: this.sanitizeContentText(isPov3V2Stack ? (stackTagline || item.label || '') : (item.label || '')),
      name: this.sanitizeContentText(item.name || ''),
      rawName: item.rawName ? this.sanitizeContentText(item.rawName) : item.rawName,
      metaPrimary: this.sanitizeContentText(item.metaPrimary || ''),
      metaSecondary: this.sanitizeContentText(item.metaSecondary || ''),
      imageNote: this.sanitizeContentText(isPov3V2Stack ? (stackTagline || item.imageNote || '') : (item.imageNote || '')),
      ...(isBudgetTableItem ? {
        imageUrl: '',
        imageMapped: false,
        imageSource: 'fallback' as const,
        imageNote: '',
        candidateImageUrls: [],
      } : {}),
    };
  }

  private stripPageItemImage(item: PageItem): PageItem {
    return {
      ...item,
      imageUrl: '',
      imageMapped: false,
      imageSource: 'fallback',
      imageNote: '',
      candidateImageUrls: undefined,
    };
  }

  private enforceGrid8QuaytungMenuPage(page: ListPage): ListPage {
    const photoKeptBySection = new Set<string>();
    return {
      ...page,
      backgroundImage: '',
      items: page.items.map((item) => {
        const sectionKey = String(item.label || '').trim();
        if (!String(item.imageUrl || '').trim()) return this.stripPageItemImage(item);
        if (photoKeptBySection.has(sectionKey)) return this.stripPageItemImage(item);
        photoKeptBySection.add(sectionKey);
        return item;
      }),
    };
  }

  private bodyListsStops(value: string, forbiddenPlaceNames: string[]): boolean {
    if (this.hasForbiddenPlaceName(value, forbiddenPlaceNames)) return true;

    const dayMarkers = value.match(/\b(?:ngày\s*(?:đầu|một|hai|ba|bốn|1|2|3|4)|sáng|trưa|chiều|tối)\b/giu) ?? [];
    const stopVerbs = value.match(/\b(?:ghé|qua|đi|lượn|chạy|săn|ăn|uống|check-?in|chụp)\b/giu) ?? [];
    return dayMarkers.length >= 2 && stopVerbs.length >= 2;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private tryParseJson(value: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(value.trim());
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
      return null;
    } catch { return null; }
  }

  private normalizeCaptionPayload(
    parsed: Record<string, unknown>,
    current: { coverTitle: string; headline: string; body: string; hashtags: string[] },
    target: DeepSeekCaptionResponse['target'],
    tone: DeepSeekCaptionResponse['tone'],
    deckId = '',
    forbiddenPlaceNames: string[] = [],
  ): { coverTitle: string; headline: string; body: string; hashtags: string[] } {
    const nextCoverTitle = String(
      parsed.coverTitle ?? (parsed as Record<string, unknown>).cover_title ?? parsed.cover ?? '',
    ).trim();
    const nextHeadline = String(
      parsed.headline ?? parsed.hook ?? (parsed as Record<string, unknown>).caption_text ?? '',
    ).trim();
    const nextBody = String(parsed.body ?? parsed.caption ?? '').trim();
    const nextHashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags.map((h) => String(h).trim()).filter(Boolean) : [];

    const removeLayoutTerms = (value: string): string => String(value || '')
      .replace(/\b[234]\s*(?:x|×|by)\s*[234]\b/gi, '')
      .replace(/\b(?:grid|layout)\b/gi, '')
      .replace(/\b\d+\s*điểm\s*\/\s*\d+\s*trang\b/giu, '')
      .replace(/\b\d+\s*diem\s*\/\s*\d+\s*trang\b/gi, '')
      .replace(/(^|[\s([{])(?:lưới|luoi)(?=$|[\s,.;:!?)}\]])/gi, '$1')
      .replace(/(^|[\s([{])(?:bố\s*cục|bo\s*cuc)(?=$|[\s,.;:!?)}\]])/gi, '$1')
      .replace(/(^|[\s([{])(?:\d+\s*)?(?:ô|o)\s*(?:ảnh|anh|hình|hinh)(?=$|[\s,.;:!?)}\]])/gi, '$1')
      .replace(/(^|[\s([{])(?:\d+\s*)?(?:khung|khuôn|khuon)\s*(?:ảnh|anh|hình|hinh)(?=$|[\s,.;:!?)}\]])/gi, '$1')
      .replace(/\bcó\s+(đẹp|xinh|chill|ngon|hay|ổn|on)\b/gi, '$1')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.!?])/g, '$1')
      .trim();
    const copy = getMarketingCopy(this.activeDestinationId);
    const normalizeCoverTitle = (v: string) => {
      const maxLen = this.coverTitleMaxLen(deckId);
      const fallback = this.coverTitleFallbackForDeck(deckId, `${deckId}:${v}:${tone}`);
      const withoutLayout = removeLayoutTerms(this.sanitizeContentText(sanitizeDeckHeadline(v || fallback)));
      const clean = withoutLayout.replace(/\s+/g, ' ').trim();
      if (this.isBannedSampleCaptionText(clean)) return fallback.slice(0, maxLen);
      return (this.hasForbiddenPlaceName(clean, forbiddenPlaceNames) ? fallback : clean || fallback).slice(0, maxLen);
    };
    const normalizeHeadline = (v: string) => {
      const fallback = localizeText('Lưu list này rồi đi Đà Lạt cho đỡ mò từng nơi nhé.', this.activeDestinationId);
      const withoutLayout = removeLayoutTerms(this.sanitizeContentText(v || fallback));
      const withoutPlaces = this.removeForbiddenPlaceNames(withoutLayout, forbiddenPlaceNames);
      const clean = this.sanitizeContentText(withoutPlaces).replace(/\s+/g, ' ').trim();
      if (this.isBannedSampleCaptionText(clean)) return fallback.slice(0, 80);
      return (this.hasForbiddenPlaceName(clean, forbiddenPlaceNames) ? fallback : clean || fallback).slice(0, 80);
    };
    const normalizeBody = (v: string) => {
      const fallback = copy.captionBodyFallback;
      const withoutLayout = removeLayoutTerms(this.sanitizeContentText(v || fallback));
      if (this.isBannedSampleCaptionText(withoutLayout)) return fallback;
      if (this.bodyListsStops(withoutLayout, forbiddenPlaceNames)) return fallback;
      const withoutPlaces = this.removeForbiddenPlaceNames(withoutLayout, forbiddenPlaceNames);
      const clean = this.sanitizeContentText(withoutPlaces).replace(/\s+/g, ' ').trim();
      if (this.isBannedSampleCaptionText(clean)) return fallback;
      return (this.hasForbiddenPlaceName(clean, forbiddenPlaceNames) ? fallback : clean || fallback).slice(0, 250);
    };
    const normalizeHashtags = (values: string[]): string[] => buildCaptionHashtags(values, tone, this.activeDestinationId, deckId || undefined);

    if (target === 'cover_title') {
      return {
        coverTitle: normalizeCoverTitle(nextCoverTitle || current.coverTitle),
        headline: normalizeHeadline(current.headline),
        body: normalizeBody(current.body),
        hashtags: normalizeHashtags(current.hashtags),
      };
    }
    if (target === 'headline') {
      return {
        coverTitle: normalizeCoverTitle(current.coverTitle),
        headline: normalizeHeadline(nextHeadline),
        body: normalizeBody(current.body),
        hashtags: normalizeHashtags(current.hashtags),
      };
    }
    if (target === 'body') {
      return {
        coverTitle: normalizeCoverTitle(current.coverTitle),
        headline: normalizeHeadline(current.headline),
        body: normalizeBody(nextBody),
        hashtags: normalizeHashtags(current.hashtags),
      };
    }
    if (target === 'hashtags') {
      return {
        coverTitle: normalizeCoverTitle(current.coverTitle),
        headline: normalizeHeadline(current.headline),
        body: normalizeBody(current.body),
        hashtags: normalizeHashtags(nextHashtags),
      };
    }
    return {
      coverTitle: normalizeCoverTitle(nextCoverTitle),
      headline: normalizeHeadline(nextHeadline),
      body: normalizeBody(nextBody),
      hashtags: normalizeHashtags(nextHashtags),
    };
  }

  private async prepareWorkbookForDataset(forceRefresh: boolean): Promise<void> {
    if (!this.workbookSource) {
      if (!forceRefresh) {
        const snapshot = this.loadWorkbookSnapshot(this.activeDestinationId);
        if (snapshot) {
          this.workbookSource = snapshot;
          this.workbookSourceByDestination.set(this.activeDestinationId, snapshot);
          return;
        }
      }
      await this.syncWorkbookNow('tai du lieu lan dau');
      return;
    }

    if (forceRefresh) {
      const now = Date.now();
      // Nhiều hành động của FE (tạo/xoá list AI, bấm "Làm mới"...) đều gọi refresh=1 liên tiếp.
      // Chỉ thực sự kéo lại Google Sheet tối đa 1 lần/phút, tránh mỗi hành động lại tốn 10-25s tải mạng.
      if (this.syncPromise || (now - this.lastSyncTime) >= this.FORCE_SYNC_MIN_INTERVAL_MS) {
        await this.syncWorkbookNow('lam moi theo yeu cau');
      } else {
        console.log('[sync] Bo qua lam moi Google Sheet (da dong bo gan day) — dung ban hien co.');
      }
      return;
    }

    if (this.AUTO_SYNC_ENABLED) void this.triggerBackgroundSync();
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
    console.log(`[sync] Bat dau tai du lieu Google Sheet (${reason})...`);

    this.syncPromise = (async () => {
      try {
        const result = await fetchWorkbookFromSheet(getDestinationConfig(this.activeDestinationId));
        this.workbookSource = result;
        this.workbookSourceByDestination.set(result.destinationId, result);
        this.saveWorkbookSnapshot(result);
        // Chờ manifest Drive xong trong cùng lượt sync để warmup build đúng 1 lần (không fire-and-forget rồi rebuild nền).
        await this.refreshSheetDriveManifest(result, reason === 'lam moi theo yeu cau');
        this.lastSyncTime = Date.now();
        console.log(`[sync] Da tai du lieu Google Sheet (${getDestinationConfig(this.activeDestinationId).label}): ${result.workbookName} (${result.bytes} bytes).`);
      } catch (error) {
        console.error('[sync] Tai du lieu Google Sheet that bai:', error);
        this.lastSyncTime = Date.now();
        if (this.workbookSource) {
          console.warn('[sync] Dung ban snapshot Google Sheet cu.');
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

  private async refreshSheetDriveManifest(source: SheetWorkbookSource, retryKnownFailures = false): Promise<void> {
    if (this.manifestSyncPromise) return this.manifestSyncPromise;

    this.manifestSyncPromise = (async () => {
      try {
        const manifest = await buildSheetDriveManifest(source, this.loadSheetDriveManifest());
        writeSheetDriveManifest(this.dataRoot, manifest, source.destinationId);
        this.invalidateDatasetCache();
        if (source.destinationId === this.activeDestinationId) {
          this.scheduleWarmDriveFileDiskCache({ retryKnownFailures });
        }
        console.log(`[sync] Dong bo anh Drive hoan tat: ${Object.keys(manifest.items).length} anh.`);
      } catch (error) {
        console.error('[sync] Dong bo anh Drive that bai:', error);
        // Sheet vừa sync xong đã đổi this.workbookSource — vẫn phải invalidate để dataset không bị
        // "kẹt" với dữ liệu Sheet cũ mãi, dù ảnh Drive đợt này lỗi.
        this.invalidateDatasetCache();
      } finally {
        this.manifestSyncPromise = null;
      }
    })();

    return this.manifestSyncPromise;
  }

  // ─── Utility ──────────────────────────────────────────────────────────────

  private captionBodyFallback(): string {
    return getMarketingCopy(this.activeDestinationId).captionBodyFallback;
  }

  private extractSheetId(value: string): string {
    const match = String(value || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return match?.[1] || '';
  }

  private parseGoogleSheetUrl(value: unknown): { sheetId: string; sheetUrl: string; exportUrl: string } {
    const raw = String(value || '').trim();
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new BadRequestException('Link Google Sheet không hợp lệ.');
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'docs.google.com') {
      throw new BadRequestException('Chỉ hỗ trợ link Google Sheet từ docs.google.com.');
    }
    const sheetId = this.extractSheetId(parsed.pathname);
    if (!sheetId) {
      throw new BadRequestException('Không tìm thấy mã Google Sheet trong link.');
    }
    const gid = parsed.searchParams.get('gid') || new URLSearchParams(parsed.hash.replace(/^#/, '')).get('gid');
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit${gid ? `?gid=${encodeURIComponent(gid)}#gid=${encodeURIComponent(gid)}` : ''}`;
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
    return { sheetId, sheetUrl, exportUrl };
  }

  private createDestinationShortLabel(label: string): string {
    const words = label.split(/\s+/).filter(Boolean);
    const initials = words.map((word) => [...word][0] || '').join('');
    const value = (initials.length >= 2 ? initials : label.slice(0, 2)).toLocaleUpperCase('vi-VN');
    return value.slice(0, 3);
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
        if (!/^sheet-[a-z0-9]+$/.test(id) || !label || !sheetUrl || !exportUrl) continue;
        registerDestination({
          id,
          label,
          shortLabel: String(entry.shortLabel || this.createDestinationShortLabel(label)).slice(0, 3),
          sheetUrl,
          exportUrl,
          workbookName: String(entry.workbookName || `Google Sheet - ${label}`),
          partnerFirst: Boolean(entry.partnerFirst),
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
    const destinations = getDestinationList().filter(
      (entry) => entry.id !== 'dalat' && entry.id !== 'greenland',
    );
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
    return {
      ...toDestinationInfo(getDestinationConfig(id)),
      ...stats,
    };
  }

  private destinationStatsPath(id: DestinationId): string {
    return path.join(this.dataRoot, `destination-stats.${id}.json`);
  }

  private readDestinationStats(id: DestinationId): Pick<DestinationSummary, 'totalItems' | 'syncedAt'> {
    const filePath = this.destinationStatsPath(id);
    if (!fs.existsSync(filePath)) return {};
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { totalItems?: number; syncedAt?: string };
      const totalItems = Number(parsed.totalItems);
      return {
        totalItems: Number.isFinite(totalItems) && totalItems >= 0 ? totalItems : undefined,
        syncedAt: parsed.syncedAt ? String(parsed.syncedAt) : undefined,
      };
    } catch {
      return {};
    }
  }

  private writeDestinationStats(id: DestinationId, totalItems: number): void {
    this.ensureDataRoot();
    fs.writeFileSync(
      this.destinationStatsPath(id),
      JSON.stringify({ totalItems, syncedAt: new Date().toISOString() }, null, 2),
      'utf-8',
    );
  }

  private workbookSnapshotPath(id: DestinationId): string {
    return path.join(this.dataRoot, `workbook-cache.${id}.xlsx`);
  }

  private loadWorkbookSnapshot(id: DestinationId): SheetWorkbookSource | null {
    const snapshotPath = this.workbookSnapshotPath(id);
    if (!fs.existsSync(snapshotPath)) return null;
    try {
      const workbookBuffer = fs.readFileSync(snapshotPath);
      if (!workbookBuffer.length) return null;
      const config = getDestinationConfig(id);
      const stat = fs.statSync(snapshotPath);
      console.log(`[sync] Dung snapshot Sheet da tai truoc (${config.label}): ${snapshotPath}`);
      return {
        workbook: XLSX.read(workbookBuffer, { cellDates: false, type: 'buffer' }),
        workbookName: config.workbookName,
        destinationId: id,
        bytes: workbookBuffer.byteLength,
        fetchedAt: stat.mtimeMs,
        sourceUrl: config.exportUrl,
      };
    } catch (error) {
      console.warn(
        `[sync] Khong doc duoc snapshot Sheet (${getDestinationConfig(id).label}), se tai lai khi can:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }

  private saveWorkbookSnapshot(source: SheetWorkbookSource): void {
    try {
      this.ensureDataRoot();
      const body = XLSX.write(source.workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
      fs.writeFileSync(this.workbookSnapshotPath(source.destinationId), body);
    } catch (error) {
      console.warn(
        `[sync] Khong luu duoc snapshot Sheet (${getDestinationConfig(source.destinationId).label}):`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  private loadActiveDestinationId(): DestinationId {
    if (!fs.existsSync(this.activeDestinationPath)) return DEFAULT_DESTINATION_ID;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.activeDestinationPath, 'utf-8')) as { id?: string };
      const id = String(parsed.id ?? '').trim();
      return isDestinationId(id) ? id : DEFAULT_DESTINATION_ID;
    } catch {
      return DEFAULT_DESTINATION_ID;
    }
  }

  private saveActiveDestinationId(id: DestinationId): void {
    this.ensureDataRoot();
    fs.writeFileSync(this.activeDestinationPath, JSON.stringify({ id, savedAt: new Date().toISOString() }, null, 2), 'utf-8');
  }

  private getDestinationDataPath(baseName: string): string {
    return path.join(this.dataRoot, `${baseName}.${this.activeDestinationId}.json`);
  }

  private resolveDestinationDataPath(baseName: string): string {
    const scopedPath = this.getDestinationDataPath(baseName);
    if (fs.existsSync(scopedPath)) return scopedPath;
    const legacyPath = path.join(this.dataRoot, `${baseName}.json`);
    if (this.activeDestinationId === DEFAULT_DESTINATION_ID && fs.existsSync(legacyPath)) return legacyPath;
    return scopedPath;
  }

  private resetDestinationScopedState(): void {
    this.generatedListsLoaded = false;
    this.generatedListsByDeckId.clear();
    this.inventoryLoaded = false;
    this.usedAllocator = new DataAllocator();
    this.driveAccessCacheLoadedFor = null;
  }

  private cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
