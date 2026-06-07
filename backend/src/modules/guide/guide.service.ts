// ─── GuideService: orchestration, caching, AI captions ───────────────────────
import 'dotenv/config';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';

import {
  CaptionBlocks,
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
  PageItem,
  ReferenceSet,
  SectionKey,
  UpdateGeneratedListCoverRequest,
  UpdateGeneratedListCoverResponse,
  WorkbookItemsBySection,
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
import { applyCaptionToPages, BUDGET_3N2D_STORY_TEMPLATE_VERSION, BUDGET_3N2D_TEMPLATE_VERSION, buildDecks, buildDeckList, buildPagesForDeck, buildSpotlightPartnerPages, createDeckBuildPools, GRID_4_MUTANT_TEMPLATE_VERSION, GRID_4_TEMPLATE_VERSION, GRID_5_TEMPLATE_VERSION, GRID_6_TEMPLATE_VERSION, GRID_6_ZIGZAG_TEMPLATE_VERSION, GRID_8_TEMPLATE_VERSION, ITINERARY_3N2D_TEMPLATE_VERSION, ITINERARY_4N2D_GRID8_TEMPLATE_VERSION, ITINERARY_4N3D_TEMPLATE_VERSION, metaText, POV_3_DAY_TEMPLATE_VERSION, sanitizeCaptionBodyForPages, sanitizeDeckHeadline, SPOTLIGHT_GUIDE_TEMPLATE_VERSION, SPOTLIGHT_PARTNER_TEMPLATE_VERSION } from './logic/deck-builder';
import { BUDGET_4N3D_WALLET_TEMPLATE_VERSION, GRID_8_FEED_TEMPLATE_VERSION, POV_3_V2_TEMPLATE_VERSION, SPOTLIGHT_V2_TEMPLATE_VERSION, tuneSpotlightV2Cover } from './logic/deck-builder-v2';
import { DriveFileAsset, fetchDriveFileAsset, getDriveImageProxyUrl } from './sync/drive-images';
import { buildSheetDriveManifest, readSheetDriveManifest, SheetDriveImageManifest, writeSheetDriveManifest } from './sync/sheet-drive-manifest';
import { fetchWorkbookFromSheet, SheetWorkbookSource } from './sync/workbook-source';
import { resolveBackendDataDir, resolveBackendRoot, resolveWorkspaceRoot } from '../../config';

const GENERATED_CAPTION_BODY_FALLBACK = 'Lưu list này để có lịch đi Đà Lạt gọn hơn, dễ chọn điểm theo buổi và đỡ mất thời gian mò từng nơi.';
const RECENT_LIST_IMAGE_WINDOW = 1;
const SPOTLIGHT_PARTNER_POST_CAPTION = 'Bỏ túi ngay, kẻo đi Đà Lạt lại loay hoay 😉';
const SPOTLIGHT_PARTNER_CAPTION_BODY = 'Nếu chỉ có 3 ngày ở Đà Lạt, cứ lưu list này trước. Các điểm được chia theo khung giờ để đi đỡ vòng và đỡ phát sinh.';
const SPOTLIGHT_PARTNER_CAPTION_HASHTAGS = ['#riviudalat', '#dalat', '#dalatreview', '#72hdalat', '#dulich31'];
type CaptionTone = DeepSeekCaptionResponse['tone'];

@Injectable()
export class GuideService {
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
  private readonly generatedListsPath = path.join(this.dataRoot, 'generated-caption-lists.json');
  private readonly usedInventoryPath = path.join(this.dataRoot, 'used-inventory.json');
  private readonly generatedListsByDeckId = new Map<string, GuideDeckList[]>();
  private generatedListsLoaded = false;
  private readonly usedAllocator = new DataAllocator();
  private inventoryLoaded = false;

  // ─── In-memory caches ──────────────────────────────────────────────────────
  private datasetContextCache: DatasetBuildContext | null = null;
  private datasetContextCacheTime = 0;
  private readonly DATASET_CACHE_TTL_MS = 5 * 60 * 1000; // 5 phút

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
  private readonly AUTO_SYNC_ENABLED = !['0', 'false', 'no'].includes(String(process.env.DALAT_AUTO_SYNC_SHEET ?? 'true').trim().toLowerCase());
  private readonly AUTO_SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 phút
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

  // ─── Dataset ──────────────────────────────────────────────────────────────

  async getDataset(options: { refresh?: boolean } = {}): Promise<GuideDataset> {
    await this.prepareWorkbookForDataset(Boolean(options.refresh));
    if (options.refresh) {
      this.invalidateDatasetCache();
    }
    const context = this.buildDatasetContext();
    return {
      generatedAt: new Date().toISOString(),
      canvas: { width: 1588, height: 2248, previewWidth: 397, previewHeight: 562 },
      source: {
        workbook: this.getWorkbookSource().workbookName,
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
        title: 'Đà Lạt TikTok Carousel Tool',
        description:
          'Hệ thống tự động chuyển đổi dữ liệu từ Google Sheet thành các bộ ảnh TikTok Carousel chuyên nghiệp.',
        note:
          'Dữ liệu và hình ảnh đang được đồng bộ trực tiếp từ Google Sheet. Bạn có thể cập nhật nội dung và Drive link trong Sheet để thay đổi kết quả.',
        stats: [
          { label: 'Tổng địa điểm', value: context.totalItems },
          { label: 'Ảnh Đà Lạt', value: context.imageUrls.length },
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
    const normalizedCaption = this.normalizeCaptionPayload(parsed, current, target, tone, this.collectCaptionForbiddenNames(deckList));
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
    if (!existing) throw new NotFoundException(`Không tìm thấy deck: ${deckId}`);
    const filtered = existing.filter((l) => l.id !== listId);
    if (filtered.length === existing.length) throw new NotFoundException(`Không tìm thấy list: ${listId}`);
    if (filtered.length === 0) {
      this.generatedListsByDeckId.delete(deckId);
    } else {
      this.generatedListsByDeckId.set(deckId, filtered);
    }
    this.persistGeneratedLists();
    this.invalidateDatasetCache();
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
    const sanitizedNextList = this.sanitizeGeneratedListText(nextList);

    const nextLists = [...existing];
    nextLists[listIndex] = sanitizedNextList;
    this.generatedListsByDeckId.set(deckId, nextLists);
    this.persistGeneratedLists();
    this.invalidateDatasetCache();

    const coverPage = sanitizedNextList.pages[0]?.type === 'cover' ? sanitizedNextList.pages[0] : null;
    return {
      deckId,
      listId,
      coverTitle: sanitizedNextList.coverTitle || sanitizedNextList.title,
      coverSubtitle: coverPage?.subtitle || '',
    };
  }

  async generateDeckFromCaption(request: GenerateCaptionDeckRequest): Promise<GenerateCaptionDeckResponse> {
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
    );

    if (!caption.coverTitle) throw new BadRequestException('Cần có tiêu đề cover (≤ 35 ký tự) trước khi tạo list mới.');
    if (!caption.body) throw new BadRequestException('Cần có body caption trước khi tạo list mới.');

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
    // Mark images from ALL previously generated lists. The image resolver uses
    // the seed (which includes generatedNumber + timestamp) to sort candidates
    // differently each time, so even when all 6 images are "used", the resolver
    // picks them in a different order → different image per list.
    for (const prevList of existing) {
      for (const page of prevList.pages) {
        if (page.backgroundImage) deckUsage.imageUrls.add(page.backgroundImage);
        if (page.type !== 'list') continue;
        for (const item of page.items) {
          if (item.imageUrl) deckUsage.imageUrls.add(item.imageUrl);
        }
      }
    }
    const basePages = buildPagesForDeck(
      deckId,
      context.itemsBySection,
      context.imageUrls,
      context.imageLibraryEntries,
      seed,
      deckUsage.itemIds,
      deckUsage.imageUrls,
      context.coverImageUrls,
    );
    const safeCaption = {
      ...caption,
      coverTitle: this.sanitizeContentText(sanitizeDeckHeadline(caption.coverTitle)),
      headline: this.sanitizeContentText(caption.headline),
      body: this.sanitizeContentText(sanitizeCaptionBodyForPages(caption.body, basePages)),
    };
    const finalCaption = deckId === 'budget-3n2d' || deckId === 'budget-3n2d-story'
      ? this.budget3N2DCoverCaption(safeCaption, requestedTone, seed, generatedNumber)
      : safeCaption;
    const generatedPages = applyCaptionToPages(basePages, finalCaption);

    const generatedList = buildDeckList(deckId, `caption-${generatedSuffix}`, `AI ${String(generatedNumber).padStart(2, '0')}`, finalCaption.coverTitle, finalCaption.body, generatedPages);
    generatedList.coverTitle = finalCaption.coverTitle;
    generatedList.postCaption = finalCaption.headline;
    generatedList.captionHashtags = finalCaption.hashtags;
    generatedList.templateVersion = this.templateVersionForDeck(deckId);
    const sanitizedGeneratedList = this.sanitizeGeneratedListText(generatedList);

    this.markUsedInDeck(sanitizedGeneratedList.pages);
    this.persistInventory();

    this.generatedListsByDeckId.set(deckId, [...existing, sanitizedGeneratedList]);
    this.persistGeneratedLists();
    this.invalidateDatasetCache();

    return { deckId, listId: sanitizedGeneratedList.id, navTitle: sanitizedGeneratedList.navTitle, title: sanitizedGeneratedList.title };
  }

  // ─── Batch list generation ────────────────────────────────────────────────

  async generateBatchLists(request: GenerateBatchListsRequest): Promise<GenerateBatchListsResponse> {
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
          this.collectCaptionForbiddenNames(deckList),
        );

        if (!caption.coverTitle || !caption.body) { failCount++; continue; }

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

    this.invalidateDatasetCache();

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
    generatedList.captionHashtags = [...SPOTLIGHT_PARTNER_CAPTION_HASHTAGS];
    generatedList.templateVersion = SPOTLIGHT_PARTNER_TEMPLATE_VERSION;

    this.generatedListsByDeckId.set(deckId, [...existing, generatedList]);
    this.persistGeneratedLists();
    this.markUsedInDeck(pages);
    this.persistInventory();
    this.invalidateDatasetCache();

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

  private invalidateDatasetCache(): void {
    this.datasetContextCache = null;
    this.datasetContextCacheTime = 0;
  }

  private buildDatasetContext(options: { refreshGeneratedLists?: boolean } = {}): DatasetBuildContext {
    this.ensureGeneratedListsLoaded();

    const now = Date.now();
    if (this.datasetContextCache && (now - this.datasetContextCacheTime) < this.DATASET_CACHE_TTL_MS) {
      console.log('[cache] dataset context HIT');
      return this.datasetContextCache;
    }

    const t0 = Date.now();
    const workbookSource = this.getWorkbookSource();
    const imageUrls = imageUrlsForDirectory(this.dalatImageDir, '/assets/dalat');
    const imageMapping = this.loadImageMapping();
    const imageLibraryEntries = this.loadImageLibraryEntries(imageMapping);
    const sheetDriveManifest = this.loadSheetDriveManifest(workbookSource.workbookName);
    const coverImageUrls = this.loadCoverImageUrls(sheetDriveManifest);
    const itemsBySection = this.loadWorkbookItems(workbookSource.workbook, imageUrls, imageMapping, imageLibraryEntries, sheetDriveManifest);
    this.refreshGeneratedListImages(itemsBySection);
    this.ensureInventoryLoaded();
    const renderUsage = this.createUsageScope();
    const baseDecks = buildDecks(itemsBySection, imageUrls, imageLibraryEntries, coverImageUrls, renderUsage.itemIds, renderUsage.imageUrls);
    baseDecks.forEach((deck) => this.markUsedInDeck(deck.lists.flatMap((list) => list.pages), renderUsage));
    if (options.refreshGeneratedLists || this.hasGeneratedListsNeedingTemplateRefresh()) {
      this.refreshGeneratedLists(itemsBySection, imageUrls, imageLibraryEntries, coverImageUrls, renderUsage, baseDecks);
    }
    const referenceSets = this.buildReferenceSets();
    const decks = this.mergeGeneratedLists(baseDecks, coverImageUrls);
    const totalItems = Object.values(itemsBySection).reduce((s, items) => s + items.length, 0);
    const mappedItemCount = Object.values(itemsBySection).reduce((s, items) => s + items.filter((i) => i.imageMapped).length, 0);
    const manualMappedItemCount = Object.values(itemsBySection).reduce((s, items) => s + items.filter((i) => i.imageSource === 'manual').length, 0);
    const autoMappedItemCount = Object.values(itemsBySection).reduce((s, items) => s + items.filter((i) => i.imageSource === 'auto').length, 0);

    const context: DatasetBuildContext = { imageUrls, coverImageUrls, imageLibraryEntries, itemsBySection, referenceSets, totalItems, mappedItemCount, manualMappedItemCount, autoMappedItemCount, decks };
    this.datasetContextCache = context;
    this.datasetContextCacheTime = Date.now();
    console.log(`[cache] dataset context MISS — built in ${Date.now() - t0}ms`);
    return context;
  }

  private mergeGeneratedLists(decks: GuideDeck[], coverImageUrls: string[] = []): GuideDeck[] {
    const usedCoverUrls = new Set<string>();
    return decks.map((deck) => {
      const baseLists = deck.lists.map((list) => this.sanitizeBaseListForDisplay(list, coverImageUrls));
      const generatedLists = (this.generatedListsByDeckId.get(deck.id) ?? []).map((list) => this.sanitizeGeneratedListText(list));
      const displayLists = generatedLists.length === 0
        ? baseLists
        : [...baseLists, ...this.cloneJson(generatedLists).map((list) => this.sanitizeGeneratedListForDisplay(list, coverImageUrls, usedCoverUrls))];
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
    if (deckId === 'spotlight-v2') return SPOTLIGHT_V2_TEMPLATE_VERSION;
    if (deckId === 'pov-3-v2') return POV_3_V2_TEMPLATE_VERSION;
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
      coverTitle: this.sanitizeContentText(sanitizeDeckHeadline(title)),
      body: this.sanitizeContentText(body),
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
  ): GuideDeckList {
    const cleanList = this.sanitizeGeneratedListText(list);
    if (!/caption-/i.test(cleanList.id)) return cleanList;

    const safeDescription = this.sanitizeContentText(sanitizeCaptionBodyForPages(cleanList.description, cleanList.pages));
    const pages = cleanList.pages.map((page) => this.sanitizeGeneratedPageForDisplay(page, cleanList, safeDescription));
    const enrichedPages = tuneSpotlightV2Cover(pages, coverImageUrls, `${cleanList.id}|cover-grid`);
    const portableCoverImage = this.coverImageForList(cleanList, coverImageUrls, usedCoverUrls) || this.firstPortableImageForPages(enrichedPages);
    return {
      ...cleanList,
      description: safeDescription,
      pages: enrichedPages.map((page) => {
        if (page.type !== 'cover') return page;
        const grid = Array.isArray(page.coverImages) ? page.coverImages.filter(Boolean) : [];
        if (grid.length > 0) return { ...page, backgroundImage: grid[0] };
        return portableCoverImage ? { ...page, backgroundImage: portableCoverImage } : page;
      }),
    };
  }

  private sanitizeBaseListForDisplay(list: GuideDeckList, coverImageUrls: string[] = []): GuideDeckList {
    const pages = list.pages.map((page) => this.sanitizeBasePageForDisplay(page, list));
    const enrichedPages = tuneSpotlightV2Cover(pages, coverImageUrls, `${list.id}|cover-grid`);
    return { ...list, pages: enrichedPages };
  }

  private sanitizeBasePageForDisplay(page: DeckPage, list: GuideDeckList): DeckPage {
    const cleanPage = this.sanitizeDeckPageText(page);
    if (cleanPage.type !== 'list' || cleanPage.layoutVariant !== 'journey-4n3d') return cleanPage;

    const rawSubtitle = String(cleanPage.subtitle ?? '').trim();
    const pageSubtitle = rawSubtitle ? this.sanitizeContentText(sanitizeCaptionBodyForPages(cleanPage.subtitle, [cleanPage])) : '';
    const shouldUseContextualSubtitle =
      !rawSubtitle ||
      this.samePlainText(pageSubtitle, GENERATED_CAPTION_BODY_FALLBACK);

    return {
      ...cleanPage,
      subtitle: shouldUseContextualSubtitle
        ? this.sanitizeContentText(this.contextualGeneratedPageSubtitle(cleanPage, list))
        : pageSubtitle,
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
      if (layout === 'spotlight-v2') {
        return {
          ...page,
          title: this.sanitizeContentText(page.title || 'Đà Lạt mà cứ ngỡ ở nước ngoài'),
          subtitle: this.sanitizeContentText(page.subtitle || '/Tổng hợp những địa điểm mà dạo này mình thích/'),
        };
      }
      // Use page's own subtitle if available, otherwise use the list description (body).
      // Truncate to ~150 chars, cutting at sentence boundary for natural reading.
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
          // Fall back to word boundary
          coverSubtitle = truncated.replace(/\s+\S*$/, '') + '...';
        }
      }
      return {
        ...page,
        title: this.sanitizeContentText(sanitizeDeckHeadline(list.title || page.title)),
        subtitle: this.sanitizeContentText(coverSubtitle),
      };
    }

    const rawSubtitle = String(page.subtitle ?? '').trim();
    const pageSubtitle = this.sanitizeContentText(sanitizeCaptionBodyForPages(page.subtitle, [page]));
    const shouldUseContextualSubtitle =
      !rawSubtitle ||
      page.layoutVariant === 'grid-8' ||
      this.samePlainText(pageSubtitle, safeDescription) ||
      this.samePlainText(pageSubtitle, GENERATED_CAPTION_BODY_FALLBACK);
    return {
      ...page,
      title: this.sanitizeContentText(sanitizeDeckHeadline(page.title)),
      chipText: this.sanitizeContentText(page.chipText),
      items: page.items.map((item) => this.sanitizePageItemText(item, page)),
      subtitle: shouldUseContextualSubtitle
        ? this.sanitizeContentText(this.contextualGeneratedPageSubtitle(page, list))
        : pageSubtitle,
    };
  }

  private samePlainText(left: string, right: string): boolean {
    return normalizeText(left) === normalizeText(right);
  }

  private contextualGeneratedPageSubtitle(page: DeckPage, list: GuideDeckList): string {
    if (page.type !== 'list') return '';

    const kind = this.generatedPageKind(page);
    const variants = this.generatedSubtitleVariants(kind);
    return variants[this.generatedListVariantIndex(list, variants.length, kind)] || variants[0] || '';
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
          const partnerCaptionHashtags = [...SPOTLIGHT_PARTNER_CAPTION_HASHTAGS];
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
          return this.sanitizeGeneratedListText(nextList);
        }

        const caption: CaptionBlocks = {
          coverTitle: this.sanitizeContentText(sanitizeDeckHeadline(list.coverTitle || list.title)),
          headline: this.sanitizeContentText(String(list.postCaption ?? '').trim()),
          body: this.sanitizeContentText(list.description),
          hashtags: Array.isArray(list.captionHashtags) ? list.captionHashtags : [],
        };
        const refreshSeed = `refresh:${deckId}:${list.id}:${listIndex}:${caption.coverTitle}:${caption.headline}:${caption.body}:${caption.hashtags.join(' ')}`;
        const basePages = buildPagesForDeck(
          deckId,
          itemsBySection,
          imageUrls,
          libraryEntries,
          refreshSeed,
          deckUsage.itemIds,
          deckUsage.imageUrls,
          coverImageUrls,
        );
        const safeCaption = {
          ...caption,
          coverTitle: this.sanitizeContentText(sanitizeDeckHeadline(caption.coverTitle)),
          headline: this.sanitizeContentText(caption.headline),
          body: this.sanitizeContentText(sanitizeCaptionBodyForPages(caption.body, basePages)),
        };
        const finalCaption = deckId === 'budget-3n2d' || deckId === 'budget-3n2d-story'
          ? this.budget3N2DCoverCaption(safeCaption, this.toneForGeneratedList(list, listIndex), refreshSeed, this.generatedListOrdinal(list, listIndex))
          : safeCaption;
        const regeneratedPages = applyCaptionToPages(basePages, finalCaption);
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
        return this.sanitizeGeneratedListText(nextList);
      });
      const sanitizedLists = refreshedLists.map((list) => {
        const sanitizedList = this.sanitizeGeneratedListText(list);
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

  private pageItemMetaFromSource(item: GuideItem): [string, string] {
    if (item.sectionKey === 'homestay') {
      const primary = item.address || 'Đang cập nhật địa chỉ';
      const secondaryParts: string[] = [];
      if (item.price) secondaryParts.push(`Giá: ${item.price}`);
      if (item.phone) secondaryParts.push(`SĐT: ${item.phone}`);
      return [primary, secondaryParts.join(' · ')];
    }
    if (item.sectionKey === 'dich_vu') {
      const primary = item.address || 'Đang cập nhật địa chỉ';
      return [primary, item.phone ? `SĐT: ${item.phone}` : ''];
    }
    return metaText(item);
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
          return {
            ...page,
            items: page.items.map((pageItem) => {
              const sourceItem = findSourceItem(pageItem);
              if (!sourceItem) return pageItem;

              const [metaPrimary, metaSecondary] = page.layoutVariant === 'budget-3n2d-gallery'
                ? this.budgetGalleryItemMetaFromSource(sourceItem)
                : this.pageItemMetaFromSource(sourceItem);
              const isPov3V2Stack = page.layoutVariant === 'pov-3-v2-stack';
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
                label: isPov3V2Stack && highlight ? highlight : pageItem.label,
                imageNote: isPov3V2Stack && highlight ? highlight : mappingNote,
                candidateImageUrls: sourceItem.imageSource === 'manual'
                  ? sourceItem.candidateImageUrls
                  : pageItem.candidateImageUrls,
                ...(sourceItem.imageSource === 'manual'
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
        }),
      }));
      const sanitizedLists = refreshedLists.map((list) => {
        const sanitizedList = this.sanitizeGeneratedListText(list);
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
    if (!fs.existsSync(this.generatedListsPath)) return;

    try {
      const raw = fs.readFileSync(this.generatedListsPath, 'utf-8');
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
    fs.writeFileSync(this.generatedListsPath, JSON.stringify(payload, null, 2), 'utf-8');
    this.invalidateDatasetCache();
  }

  private migrateGeneratedListTextStore(): void {
    if (this.generatedListsByDeckId.size === 0) return;

    let changed = false;
    for (const [deckId, lists] of this.generatedListsByDeckId.entries()) {
      const sanitizedLists = lists.map((list) => {
        const sanitizedList = this.sanitizeGeneratedListText(list);
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

  private loadSheetDriveManifest(workbookName: string): SheetDriveImageManifest {
    return readSheetDriveManifest(this.dataRoot, workbookName);
  }

  private loadCoverImageUrls(sheetDriveManifest: SheetDriveImageManifest): string[] {
    const seen = new Set<string>();
    return (sheetDriveManifest.coverImages ?? [])
      .map((entry) => entry.fileId ? getDriveImageProxyUrl(entry.fileId) : '')
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
      const sectionKey = normalizeText(sheetName) as SectionKey;
      if (!(sectionKey in SECTION_CONFIG)) continue;

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
    const price = firstValue(row, 'gia');
    const imageHint = firstValue(row, 'anh', 'hinh_anh', 'hinh', 'ten_anh', 'thu_muc_anh', 'folder_anh', 'link_anh', 'url', 'link');
    const mappingKey = itemMappingKey(sectionKey, rawName, address);
    const displayMappingKey = itemMappingKey(sectionKey, name, address);
    const sheetDriveEntry = sheetDriveManifest.items[mappingKey] ?? sheetDriveManifest.items[displayMappingKey];
    const sheetDriveCandidateUrls = sheetDriveEntry
      ? (sheetDriveEntry.candidateImages && sheetDriveEntry.candidateImages.length > 0
          ? sheetDriveEntry.candidateImages
          : [{ fileId: sheetDriveEntry.fileId, fileName: sheetDriveEntry.fileName, viewUrl: '' }]
        )
          .filter((entry) => entry.fileId)
          .map((entry) => getDriveImageProxyUrl(entry.fileId))
      : [];
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
    const mappedFallbackImage = fallbackResolvedImage();
    const mappedCandidateImageUrls = Array.from(new Set([
      mappedFallbackImage.imageUrl,
      ...(mappedFallbackImage.candidateImageUrls ?? []),
    ].filter(Boolean)));

    const resolvedImage = sheetDriveEntry
      ? {
          imageUrl: sheetDriveCandidateUrls[0] || mappedFallbackImage.imageUrl || getDriveImageProxyUrl(sheetDriveEntry.fileId),
          imageMapped: true,
          imageMappingKey: mappingKey,
          imageSource: 'manual' as const,
          candidateImageUrls: Array.from(new Set([...sheetDriveCandidateUrls, ...mappedCandidateImageUrls])),
        }
      : (directImageUrls.length > 0
          ? {
              imageUrl: directImageUrls[0],
              imageMapped: true,
              imageMappingKey: mappingKey,
              imageSource: 'manual' as const,
              candidateImageUrls: directImageUrls,
            }
          : mappedFallbackImage);

    return {
      id: `${sectionKey}-${sequence}`,
      sectionKey,
      sectionTitle: SECTION_CONFIG[sectionKey].title,
      name, address,
      type: placeType || SECTION_CONFIG[sectionKey].title,
      openHours, style, highlight,
      partnerFlag: partner,
      isPartner: normalizeText(partner) === 'x',
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
    if (!fs.existsSync(this.usedInventoryPath)) return;
    try {
      const raw = fs.readFileSync(this.usedInventoryPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.usedItemIds)) parsed.usedItemIds.forEach((id: string) => this.usedAllocator.itemIds.add(id));
      if (Array.isArray(parsed.usedImageUrls)) parsed.usedImageUrls.forEach((url: string) => this.usedAllocator.markImageUrl(url));
    } catch {
      // Ignore errors
    }
  }

  private persistInventory(): void {
    this.ensureDataRoot();
    fs.writeFileSync(this.usedInventoryPath, JSON.stringify(this.usedAllocator.snapshot(), null, 2), 'utf-8');
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
    const lists = this.generatedListsByDeckId.get(deckId) ?? [];
    const titles: string[] = [];
    for (const list of lists) {
      const coverTitle = String(list.coverTitle || list.title || '').trim();
      const postCaption = String(list.postCaption || '').trim();
      if (coverTitle) titles.push(coverTitle);
      if (postCaption) titles.push(postCaption);
    }
    return [...new Set(titles)];
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
      if (page.type === 'cover') return `Trang ${index + 1}: cover | tiêu đề: ${page.title} | mô tả: ${page.subtitle}`;
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

    return [
      'Tạo nội dung TikTok cho bộ ảnh du lịch Đà Lạt sau.',
      `Tên chủ đề: ${deck.title}`,
      `Mô tả chung: ${deck.description}`,
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
      '- `coverTitle` là chữ in đậm ở trang bìa của bộ ảnh. Phải thật ngắn, dễ scan.',
      '- Tuyệt đối KHÔNG vượt quá 35 ký tự (tính cả khoảng trắng).',
      '- Viết hoa hoặc rất nổi bật, bám sát "Tone yêu cầu". Không được trùng với "Caption đăng bài".',
      '- Không dùng chữ "free" trong cover title. Thay bằng "0đ", "dễ đi", "gọn ví" hoặc bỏ luôn.',
      '- Không nhắc tên quán/địa điểm cụ thể trong cover title.',
      '',
      'YÊU CẦU QUAN TRỌNG VỀ HEADLINE (CAPTION ĐĂNG BÀI):',
      '- `headline` là caption người dùng copy để dán vào TikTok khi đăng bài.',
      '- Chỉ viết DUY NHẤT 1 câu ngắn gọn (tối đa 80 ký tự), giọng văn bám sát "Tone yêu cầu".',
      '- Câu phải có hook thu hút ngay, có thể thêm 1 emoji cuối câu (không quá 1 emoji).',
      '- Không lặp lại nguyên văn cover title. Không dùng chữ "free" / "deck".',
      '- Có thể mời người xem lưu lại bộ ảnh, nhưng tuyệt đối không gọi tên địa điểm/quán cụ thể.',
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
      '- Khong mo ta bo cuc thiet ke hoac kich thuoc layout trong caption. Tranh cac cum: "2x3", "3x3", "2x4", "luoi", "layout", "grid", "o anh", "o hinh".',
      '- Moi lan bam sinh lai phai doi goc viet, doi nhip cau, doi dong tu mo dau; khong chi thay vai tu dong nghia.',
      '- Hashtags: đúng 5 hashtag, trong đó bắt buộc có #riviudalat #dalat #dalatreview. 2 hashtag còn lại phải liên quan chặt chẽ đến nội dung và tone.',
      '- Trả về JSON object đúng schema:',
      '{"coverTitle":"...","headline":"...","body":"...","hashtags":["#...","#...","#...","#...","#..."]}',
    ].filter(Boolean).join('\n');
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

  private sanitizeGeneratedListText(list: GuideDeckList): GuideDeckList {
    const pages = Array.isArray(list.pages)
      ? list.pages.map((page) => this.sanitizeDeckPageText(page))
      : [];
    return {
      ...list,
      navTitle: this.sanitizeContentText(list.navTitle || ''),
      title: this.sanitizeContentText(sanitizeDeckHeadline(list.title || '')),
      description: this.sanitizeContentText(list.description || ''),
      coverTitle: list.coverTitle ? this.sanitizeContentText(sanitizeDeckHeadline(list.coverTitle)) : list.coverTitle,
      postCaption: list.postCaption ? this.sanitizeContentText(list.postCaption) : list.postCaption,
      captionHashtags: Array.isArray(list.captionHashtags)
        ? list.captionHashtags.map((tag) => String(tag || '').trim()).filter(Boolean)
        : list.captionHashtags,
      pages,
    };
  }

  private sanitizeDeckPageText(page: DeckPage): DeckPage {
    if (page.type === 'cover') {
      return {
        ...page,
        title: this.sanitizeContentText(sanitizeDeckHeadline(page.title || '')),
        subtitle: this.sanitizeContentText(page.subtitle || ''),
      };
    }

    const cleanPage: DeckPage = {
      ...page,
      chipText: this.sanitizeContentText(page.chipText || ''),
      title: this.sanitizeContentText(sanitizeDeckHeadline(page.title || '')),
      subtitle: this.sanitizeContentText(page.subtitle || ''),
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

    if (totalIndex >= 0) {
      const currentTotal = items[totalIndex];
      if (currentTotal.metaSecondary) return page;
      const nextItems = [...items];
      nextItems[totalIndex] = {
        ...currentTotal,
        label: currentTotal.label || 'Tổng|Tổng cộng',
        name: currentTotal.name || 'Tổng cộng',
        metaPrimary: currentTotal.metaPrimary || 'Tùy nhóm và mức chi tại từng điểm',
        metaSecondary: '~2.5tr - 3tr',
      };
      return { ...page, items: nextItems };
    }

    const totalItem: PageItem = {
      id: 'budget-3n2d-summary-total',
      label: 'Tổng|Tổng cộng',
      name: 'Tổng cộng',
      metaPrimary: 'Tùy nhóm và mức chi tại từng điểm',
      metaSecondary: '~2.5tr - 3tr',
      imageUrl: '',
      imageMapped: false,
      imageNote: '',
      imageSource: 'fallback',
      candidateImageUrls: [],
    };

    return { ...page, items: [...items, totalItem] };
  }

  private sanitizePageItemText(item: PageItem, page?: DeckPage): PageItem {
    const isBudgetTableItem = page?.type === 'list' && page.layoutVariant === 'budget-3n2d-table';
    return {
      ...item,
      label: this.sanitizeContentText(item.label || ''),
      name: this.sanitizeContentText(item.name || ''),
      rawName: item.rawName ? this.sanitizeContentText(item.rawName) : item.rawName,
      metaPrimary: this.sanitizeContentText(item.metaPrimary || ''),
      metaSecondary: this.sanitizeContentText(item.metaSecondary || ''),
      imageNote: this.sanitizeContentText(item.imageNote || ''),
      ...(isBudgetTableItem ? {
        imageUrl: '',
        imageMapped: false,
        imageSource: 'fallback' as const,
        imageNote: '',
        candidateImageUrls: [],
      } : {}),
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

    const toneSuggestions: Record<DeepSeekCaptionResponse['tone'], string[]> = {
      gen_z: ['#checkindalat', '#anchoidalat'],
      tinh_te: ['#dalatchill', '#dalatnhenhang'],
      review_chan_that: ['#reviewdalat', '#kinhnghiemdalat'],
      ban_hang_nhe: ['#goiydalat', '#dichvudalot'],
      lich_trinh_huu_ich: ['#lichtrinhdalat', '#traveldalat'],
    };

    const removeLayoutTerms = (value: string): string => String(value || '')
      .replace(/\b[234]\s*(?:x|×|by)\s*[234]\b/gi, '')
      .replace(/\b(?:grid|layout)\b/gi, '')
      .replace(/(^|[\s([{])(?:lưới|luoi)(?=$|[\s,.;:!?)}\]])/gi, '$1')
      .replace(/(^|[\s([{])(?:bố\s*cục|bo\s*cuc)(?=$|[\s,.;:!?)}\]])/gi, '$1')
      .replace(/(^|[\s([{])(?:\d+\s*)?(?:ô|o)\s*(?:ảnh|anh|hình|hinh)(?=$|[\s,.;:!?)}\]])/gi, '$1')
      .replace(/(^|[\s([{])(?:\d+\s*)?(?:khung|khuôn|khuon)\s*(?:ảnh|anh|hình|hinh)(?=$|[\s,.;:!?)}\]])/gi, '$1')
      .replace(/\bcó\s+(đẹp|xinh|chill|ngon|hay|ổn|on)\b/gi, '$1')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.!?])/g, '$1')
      .trim();
    const normalizeCoverTitle = (v: string) => {
      const fallback = 'ĐI ĐÀ LẠT THÌ LƯU NGAY LIST NÀY';
      const withoutLayout = removeLayoutTerms(this.sanitizeContentText(sanitizeDeckHeadline(v || fallback)));
      const clean = withoutLayout.replace(/\s+/g, ' ').trim();
      return (this.hasForbiddenPlaceName(clean, forbiddenPlaceNames) ? fallback : clean || fallback).slice(0, 35);
    };
    const normalizeHeadline = (v: string) => {
      const fallback = 'Lưu list này rồi đi Đà Lạt cho đỡ mò từng nơi nhé.';
      const withoutLayout = removeLayoutTerms(this.sanitizeContentText(v || fallback));
      const withoutPlaces = this.removeForbiddenPlaceNames(withoutLayout, forbiddenPlaceNames);
      const clean = this.sanitizeContentText(withoutPlaces).replace(/\s+/g, ' ').trim();
      return (this.hasForbiddenPlaceName(clean, forbiddenPlaceNames) ? fallback : clean || fallback).slice(0, 80);
    };
    const normalizeBody = (v: string) => {
      const fallback = 'Lưu list này để có lịch đi Đà Lạt gọn hơn, dễ chọn điểm theo buổi và đỡ mất thời gian mò từng nơi.';
      const withoutLayout = removeLayoutTerms(this.sanitizeContentText(v || fallback));
      if (this.bodyListsStops(withoutLayout, forbiddenPlaceNames)) return fallback;
      const withoutPlaces = this.removeForbiddenPlaceNames(withoutLayout, forbiddenPlaceNames);
      const clean = this.sanitizeContentText(withoutPlaces).replace(/\s+/g, ' ').trim();
      return (this.hasForbiddenPlaceName(clean, forbiddenPlaceNames) ? fallback : clean || fallback).slice(0, 250);
    };
    const normalizeHashtags = (values: string[]): string[] => {
      const fixed = ['#riviudalat', '#dalat', '#dalatreview'];
      const normalized = values
        .map((h) => h.trim()).filter(Boolean)
        .map((h) => (h.startsWith('#') ? h : `#${h}`))
        .map((h) => h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^#a-z0-9]+/g, ''))
        .filter((h) => h.length > 1);
      const merged = [...fixed, ...normalized, ...toneSuggestions[tone]];
      const unique: string[] = [];
      for (const h of merged) if (!unique.includes(h)) unique.push(h);
      return unique.slice(0, 5);
    };

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
    if (forceRefresh || !this.workbookSource) {
      await this.syncWorkbookNow(forceRefresh ? 'lam moi theo yeu cau' : 'tai du lieu lan dau');
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
        const result = await fetchWorkbookFromSheet();
        this.workbookSource = result;
        void this.refreshSheetDriveManifest(result);
        this.lastSyncTime = Date.now();
        this.invalidateDatasetCache();
        console.log(`[sync] Da tai du lieu Google Sheet: ${result.workbookName} (${result.bytes} bytes).`);
      } catch (error) {
        console.error('[sync] Tai du lieu Google Sheet that bai:', error);
        this.lastSyncTime = Date.now();
        throw error;
      } finally {
        this.isSyncing = false;
        this.syncPromise = null;
      }
    })();

    return this.syncPromise;
  }

  private async refreshSheetDriveManifest(source: SheetWorkbookSource): Promise<void> {
    if (this.manifestSyncPromise) return this.manifestSyncPromise;

    this.manifestSyncPromise = (async () => {
      try {
        const manifest = await buildSheetDriveManifest(source, this.loadSheetDriveManifest(source.workbookName));
        writeSheetDriveManifest(this.dataRoot, manifest);
        this.invalidateDatasetCache();
        console.log(`[sync] Dong bo anh Drive hoan tat: ${Object.keys(manifest.items).length} anh.`);
      } catch (error) {
        console.error('[sync] Dong bo anh Drive that bai:', error);
      } finally {
        this.manifestSyncPromise = null;
      }
    })();

    return this.manifestSyncPromise;
  }

  // ─── Utility ──────────────────────────────────────────────────────────────

  private cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
