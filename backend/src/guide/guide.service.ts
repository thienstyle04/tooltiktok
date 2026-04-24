// ─── GuideService: orchestration, caching, AI captions ───────────────────────
import 'dotenv/config';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';

import {
  CaptionBlocks,
  DatasetBuildContext,
  DeepSeekCaptionRequest,
  DeepSeekCaptionResponse,
  GenerateCaptionDeckRequest,
  GenerateCaptionDeckResponse,
  GeneratedListsStore,
  GuideDeck,
  GuideDeckList,
  GuideDataset,
  GuideItem,
  ImageLibraryFolderEntry,
  ImageMappingFile,
  ReferenceSet,
  SectionKey,
  WorkbookItemsBySection,
} from '../core/types';

import { SECTION_CONFIG } from '../core/constants';

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
} from '../logic/image-resolver';

import { applyCaptionToPages, buildDecks, buildDeckList, buildPagesForDeck } from '../logic/deck-builder';
import { fetchDriveFileAsset, getDriveImageProxyUrl } from '../sync/drive-images';
import { buildSheetDriveManifest, readSheetDriveManifest, SheetDriveImageManifest, writeSheetDriveManifest } from '../sync/sheet-drive-manifest';
import { findWorkbookPath, syncWorkbookFromSheet } from '../sync/workbook-source';

function resolveToolRoot(): string {
  const currentDir = path.resolve(__dirname);
  if (fs.existsSync(path.join(currentDir, 'image-mapping.json'))) return currentDir;
  return path.resolve(currentDir, '../../');
}

@Injectable()
export class GuideService {
  // toolRoot points to the backend folder root
  readonly toolRoot = resolveToolRoot();
  readonly frontendRoot = path.resolve(this.toolRoot, '../frontend');
  readonly workspaceRoot = path.resolve(this.toolRoot, '../../');
  private readonly dalatImageDir = 'C:\\Data\\tn\\Hình cảnh ĐL-20260417T122322Z-3-001\\Hình cảnh ĐL';
  private readonly tiktokReferenceDir = 'C:\\Data\\data\\ẢNH TIKTOK';
  private readonly imageMappingPath = path.join(this.toolRoot, 'image-mapping.json');
  private readonly generatedListsPath = path.join(this.toolRoot, 'generated-caption-lists.json');
  private readonly generatedListsByDeckId = new Map<string, GuideDeckList[]>();
  private generatedListsLoaded = false;

  // ─── In-memory caches ──────────────────────────────────────────────────────
  private datasetContextCache: DatasetBuildContext | null = null;
  private datasetContextCacheTime = 0;
  private readonly DATASET_CACHE_TTL_MS = 0; // Tắt cache tạm thời để debug

  private imageLibraryEntriesCache: ImageLibraryFolderEntry[] | null = null;
  private imageLibraryEntriesCacheTime = 0;
  private readonly IMAGE_LIBRARY_CACHE_TTL_MS = 60_000; // 60 giây

  private imageMappingCache: ImageMappingFile | null = null;
  private imageMappingCacheTime = 0;
  private readonly IMAGE_MAPPING_CACHE_TTL_MS = 30_000; // 30 giây

  private lastSyncTime = 0;
  private isSyncing = false;
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

  async getDriveFileAsset(fileId: string): Promise<{ body: Buffer; contentType: string; contentLength: number }> {
    const normalizedFileId = String(fileId ?? '').trim();
    if (!normalizedFileId) {
      throw new NotFoundException('Drive file id is required.');
    }
    return fetchDriveFileAsset(normalizedFileId);
  }

  // ─── Dataset ──────────────────────────────────────────────────────────────

  getDataset(): GuideDataset {
    this.triggerBackgroundSync();
    const context = this.buildDatasetContext();
    return {
      generatedAt: new Date().toISOString(),
      canvas: { width: 1588, height: 2248, previewWidth: 397, previewHeight: 562 },
      source: {
        workbook: path.basename(this.getWorkbookPath()),
        imageCount: context.imageUrls.length,
        manualMappedItemCount: context.manualMappedItemCount,
        mappedItemCount: context.mappedItemCount,
        autoMappedItemCount: context.autoMappedItemCount,
        fallbackItemCount: context.totalItems - context.mappedItemCount,
        referenceSetCount: context.referenceSets.length,
        totalItems: context.totalItems,
      },
      hero: {
        eyebrow: 'NestJS refactored tool',
        title: 'Từ file Excel thành bộ ảnh TikTok cho nội dung Đà Lạt',
        description:
          'Tool này chuyển workbook địa điểm thành các bộ ảnh carousel bám theo tinh thần ảnh mẫu, có preview trực tiếp và export PNG ngay trên trình duyệt.',
        note:
          'Ảnh hiện vẫn lấy từ pool "Hình cảnh ĐL". Khi có mapping ảnh theo từng địa điểm, backend có thể thay sang gán ảnh đúng theo item mà không phải đổi template.',
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

    const dataset = this.getDataset();
    const deck = dataset.decks.find((d) => d.id === deckId);
    if (!deck) throw new NotFoundException(`Không tìm thấy deck: ${deckId}`);

    const listId = String(request.listId ?? '').trim() || deck.lists[0]?.id || '';
    const deckList = deck.lists.find((l) => l.id === listId);
    if (!deckList) throw new NotFoundException(`Không tìm thấy list: ${listId}`);

    const tone = (request.tone ?? 'lich_trinh_huu_ich') as DeepSeekCaptionResponse['tone'];
    const target = (request.target ?? 'full') as DeepSeekCaptionResponse['target'];
    const current = {
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

    const prompt = this.buildDeepSeekPrompt(deck, deckList, tone, target, current);
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'Bạn là content creator du lịch TikTok. Chỉ trả về đúng JSON object hợp lệ, không thêm markdown, không giải thích.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.9,
        max_tokens: 900,
        stream: false,
      }),
    });

    const responseText = await response.text();
    if (!response.ok) throw new BadRequestException(`DeepSeek API lỗi HTTP ${response.status}: ${responseText}`);

    let payload: any;
    try { payload = JSON.parse(responseText); } catch { throw new BadRequestException('Không đọc được phản hồi JSON từ DeepSeek.'); }

    const content = String(payload?.choices?.[0]?.message?.content ?? '').trim();
    if (!content) throw new BadRequestException('DeepSeek không trả về nội dung caption.');

    const parsed = this.parseDeepSeekJson(content);
    const normalizedCaption = this.normalizeCaptionPayload(parsed, current, target, tone);
    return { deckId, listId, target, tone, headline: normalizedCaption.headline, body: normalizedCaption.body, hashtags: normalizedCaption.hashtags, raw: content };
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
  }

  generateDeckFromCaption(request: GenerateCaptionDeckRequest): GenerateCaptionDeckResponse {
    this.ensureGeneratedListsLoaded();
    const deckId = String(request.deckId ?? '').trim();
    if (!deckId) throw new BadRequestException('Thiếu deckId để tạo list mới từ caption.');

    const caption = this.normalizeCaptionPayload(
      {
        headline: String(request.caption?.headline ?? '').trim(),
        body: String(request.caption?.body ?? '').trim(),
        hashtags: Array.isArray(request.caption?.hashtags)
          ? request.caption!.hashtags.map((h) => String(h).trim()).filter(Boolean)
          : [],
      },
      { headline: '', body: '', hashtags: [] },
      'full',
      'lich_trinh_huu_ich',
    );

    if (!caption.headline || !caption.body) throw new BadRequestException('Cần có headline và body trước khi tạo list mới.');

    const context = this.buildDatasetContext();
    if (!context.decks.find((d) => d.id === deckId)) throw new NotFoundException(`Không tìm thấy deck: ${deckId}`);

    const existing = this.generatedListsByDeckId.get(deckId) ?? [];
    // Sử dụng timestamp + index để đảm bảo ID không bao giờ trùng kể cả khi xóa bớt
    const timestamp = Date.now().toString(36).slice(-4);
    const generatedNumber = existing.length + 1;
    const generatedSuffix = `${String(generatedNumber).padStart(2, '0')}-${timestamp}`;

    const seed = [deckId, generatedSuffix, caption.headline, caption.body, caption.hashtags.join(' ')].join('|');

    const generatedPages = applyCaptionToPages(
      buildPagesForDeck(deckId, context.itemsBySection, context.imageUrls, context.imageLibraryEntries, seed),
      caption,
    );

    const generatedList = buildDeckList(deckId, `caption-${generatedSuffix}`, `AI ${String(generatedNumber).padStart(2, '0')}`, caption.headline, caption.body, generatedPages);
    generatedList.captionHashtags = caption.hashtags;

    this.generatedListsByDeckId.set(deckId, [...existing, generatedList]);
    this.persistGeneratedLists();

    return { deckId, listId: generatedList.id, navTitle: generatedList.navTitle, title: generatedList.title };
  }

  // ─── Private: dataset context ─────────────────────────────────────────────

  private invalidateDatasetCache(): void {
    this.datasetContextCache = null;
    this.datasetContextCacheTime = 0;
  }

  private buildDatasetContext(): DatasetBuildContext {
    this.ensureGeneratedListsLoaded();

    const now = Date.now();
    if (this.datasetContextCache && (now - this.datasetContextCacheTime) < this.DATASET_CACHE_TTL_MS) {
      console.log('[cache] dataset context HIT');
      return this.datasetContextCache;
    }

    const t0 = Date.now();
    const workbookPath = this.getWorkbookPath();
    const imageUrls = imageUrlsForDirectory(this.dalatImageDir, '/assets/dalat');
    const imageMapping = this.loadImageMapping();
    const imageLibraryEntries = this.loadImageLibraryEntries(imageMapping);
    const sheetDriveManifest = this.loadSheetDriveManifest(workbookPath);
    const itemsBySection = this.loadWorkbookItems(workbookPath, imageUrls, imageMapping, imageLibraryEntries, sheetDriveManifest);
    this.refreshGeneratedLists(itemsBySection, imageUrls, imageLibraryEntries);
    const referenceSets = this.buildReferenceSets();
    const decks = this.mergeGeneratedLists(buildDecks(itemsBySection, imageUrls, imageLibraryEntries));
    const totalItems = Object.values(itemsBySection).reduce((s, items) => s + items.length, 0);
    const mappedItemCount = Object.values(itemsBySection).reduce((s, items) => s + items.filter((i) => i.imageMapped).length, 0);
    const manualMappedItemCount = Object.values(itemsBySection).reduce((s, items) => s + items.filter((i) => i.imageSource === 'manual').length, 0);
    const autoMappedItemCount = Object.values(itemsBySection).reduce((s, items) => s + items.filter((i) => i.imageSource === 'auto').length, 0);

    const context: DatasetBuildContext = { imageUrls, imageLibraryEntries, itemsBySection, referenceSets, totalItems, mappedItemCount, manualMappedItemCount, autoMappedItemCount, decks };
    this.datasetContextCache = context;
    this.datasetContextCacheTime = Date.now();
    console.log(`[cache] dataset context MISS — built in ${Date.now() - t0}ms`);
    return context;
  }

  private mergeGeneratedLists(decks: GuideDeck[]): GuideDeck[] {
    return decks.map((deck) => {
      const generatedLists = this.generatedListsByDeckId.get(deck.id) ?? [];
      if (generatedLists.length === 0) return deck;
      return { ...deck, lists: [...deck.lists, ...this.cloneJson(generatedLists)] };
    });
  }

  private refreshGeneratedLists(
    itemsBySection: WorkbookItemsBySection,
    imageUrls: string[],
    libraryEntries: ImageLibraryFolderEntry[],
  ): void {
    if (this.generatedListsByDeckId.size === 0) return;
    let changed = false;

    for (const [deckId, lists] of this.generatedListsByDeckId.entries()) {
      const refreshedLists = lists.map((list) => {
        const caption: CaptionBlocks = {
          headline: list.title,
          body: list.description,
          hashtags: Array.isArray(list.captionHashtags) ? list.captionHashtags : [],
        };
        const regeneratedPages = applyCaptionToPages(
          buildPagesForDeck(deckId, itemsBySection, imageUrls, libraryEntries, `refresh:${deckId}:${list.id}:${caption.headline}:${caption.body}:${caption.hashtags.join(' ')}`),
          caption,
        );
        if (JSON.stringify(list.pages) !== JSON.stringify(regeneratedPages)) changed = true;
        return { ...list, pages: regeneratedPages };
      });
      this.generatedListsByDeckId.set(deckId, refreshedLists);
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
    fs.writeFileSync(this.generatedListsPath, JSON.stringify(payload, null, 2), 'utf-8');
    this.invalidateDatasetCache();
  }

  // ─── Private: workbook loading ────────────────────────────────────────────

  private getWorkbookPath(): string {
    const workbookPath = findWorkbookPath(this.workspaceRoot);
    if (!workbookPath) throw new NotFoundException('Không tìm thấy file Excel nguồn trong thư mục gốc.');
    return workbookPath;
  }

  private loadSheetDriveManifest(workbookPath: string): SheetDriveImageManifest {
    return readSheetDriveManifest(this.toolRoot, workbookPath);
  }

  private loadWorkbookItems(
    workbookPath: string,
    imageUrls: string[],
    imageMapping: ImageMappingFile,
    libraryEntries: ImageLibraryFolderEntry[],
    sheetDriveManifest: SheetDriveImageManifest,
  ): WorkbookItemsBySection {
    const workbook = XLSX.readFile(workbookPath, { cellDates: false });
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
        // Lọc: Chỉ lấy những địa điểm đã khớp ảnh thực tế (imageMapped: true)
        if (item && item.imageMapped) {
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
    const name = firstValue(row, 'ten_quan', 'ten_dia_diem', 'ten');
    if (!name) return null;

    const placeType = firstValue(row, 'mo_hinh', 'loai_dich_vu', 'phong_cach');
    const address = firstValue(row, 'dia_chi');
    const openHours = firstValue(row, 'gio_mo_cua', 'gio_mo_cua_', 'gio_mo_cua_1');
    const style = firstValue(row, 'phong_cach');
    const highlight = firstValue(row, 'mon_an_noi_bat', 'mon_noi_bat', 'noi_bat');
    const partner = firstValue(row, 'doi_tac', 'doi_tac_cong_ty');
    const phone = firstValue(row, 'sdt');
    const price = firstValue(row, 'gia');
    const mappingKey = itemMappingKey(sectionKey, name, address);
    const sheetDriveEntry = sheetDriveManifest.items[mappingKey];
    const resolvedImage = sheetDriveEntry
      ? {
          imageUrl: getDriveImageProxyUrl(sheetDriveEntry.fileId),
          imageMapped: true,
          imageMappingKey: mappingKey,
          imageSource: 'manual' as const,
        }
      : resolveMappedImage(
          sectionKey, placeType || SECTION_CONFIG[sectionKey].title, name, address,
          imageUrls, sequence, imageMapping, libraryEntries, this.workspaceRoot,
        );

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

  private buildDeepSeekPrompt(
    deck: GuideDeck,
    deckList: GuideDeckList,
    tone: DeepSeekCaptionResponse['tone'],
    target: DeepSeekCaptionResponse['target'],
    current: { headline: string; body: string; hashtags: string[] },
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

    return [
      'Tạo caption TikTok cho bộ ảnh du lịch Đà Lạt sau.',
      `Tên chủ đề: ${deck.title}`,
      `Mô tả chung: ${deck.description}`,
      `Danh sách địa điểm: ${deckList.title}`,
      `Mô tả danh sách: ${deckList.description}`,
      `Tone yêu cầu: ${tone}`,
      `Hướng dẫn giọng văn: ${toneInstructions[tone]}`,
      `Phần cần sinh: ${target}`,
      current.headline ? `Headline hiện tại: ${current.headline}` : '',
      current.body ? `Body hiện tại: ${current.body}` : '',
      current.hashtags.length ? `Hashtags hiện tại: ${current.hashtags.join(' ')}` : '',
      '',
      'DỮ LIỆU ĐỊA ĐIỂM CHI TIẾT:',
      ...pageLines,
      '',
      'YÊU CẦU QUAN TRỌNG VỀ HEADLINE (TIÊU ĐỀ CHÍNH):',
      '- Headline phải CỰC KỲ ĐA DẠNG, không được lặp lại các mẫu tiêu đề cũ như "POV 3 ngày...", "Lịch trình...".',
      '- Headline phải bám sát "Tone yêu cầu". Nếu là Gen Z, hãy dùng ngôn ngữ bắt trend. Nếu là Tinh tế, hãy dùng câu chữ giàu chất thơ.',
      '- Phải sáng tạo ra các góc nhìn mới (ví dụ: "Phá đảo Đà Lạt", "Góc nhỏ chill cực", "Đà Lạt 0đ", "Mùa này đi đâu?").',
      '- Headline: viết hoa hoặc rất nổi bật, tuyệt đối không vượt quá 35 ký tự. Phải thật thu hút ngay từ 3 giây đầu.',
      '',
      'CÁC YÊU CẦU KHÁC:',
      '- TUYỆT ĐỐI không dùng từ "deck" trong nội dung. Thay vào đó hãy dùng: "hình", "ảnh", "bộ ảnh", "cẩm nang", "lịch trình", "list này"...',
      '- Body: Phải đa dạng cấu trúc câu, không lặp lại các motif cũ. Tối đa 250 ký tự. Phải nhắc được tên 1-2 địa điểm nổi bật trong list.',
      '- Hashtags: đúng 5 hashtag, trong đó bắt buộc có #riviudalat #dalat #dalatreview. 2 hashtag còn lại phải liên quan chặt chẽ đến nội dung và tone.',
      '- Trả về JSON object đúng schema:',
      '{"headline":"...","body":"...","hashtags":["#...","#...","#...","#...","#..."]}',
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

  private tryParseJson(value: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(value.trim());
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
      return null;
    } catch { return null; }
  }

  private normalizeCaptionPayload(
    parsed: Record<string, unknown>,
    current: { headline: string; body: string; hashtags: string[] },
    target: DeepSeekCaptionResponse['target'],
    tone: DeepSeekCaptionResponse['tone'],
  ): { headline: string; body: string; hashtags: string[] } {
    const nextHeadline = String(parsed.headline ?? parsed.hook ?? '').trim();
    const nextBody = String(parsed.body ?? parsed.caption ?? '').trim();
    const nextHashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags.map((h) => String(h).trim()).filter(Boolean) : [];

    const toneSuggestions: Record<DeepSeekCaptionResponse['tone'], string[]> = {
      gen_z: ['#checkindalat', '#anchoidalat'],
      tinh_te: ['#dalatchill', '#dalatnhenhang'],
      review_chan_that: ['#reviewdalat', '#kinhnghiemdalat'],
      ban_hang_nhe: ['#goiydalat', '#dichvudalot'],
      lich_trinh_huu_ich: ['#lichtrinhdalat', '#traveldalat'],
    };

    const normalizeHeadline = (v: string) => (v || current.headline || 'ĐI ĐÀ LẠT THÌ LƯU NGAY LIST NÀY').replace(/\s+/g, ' ').trim().slice(0, 35);
    const normalizeBody = (v: string) => (v || current.body || 'Một bộ caption gợi ý nhanh cho list đang chọn, bám đúng dữ liệu địa điểm trong tool.').replace(/\s+/g, ' ').trim().slice(0, 250);
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

    if (target === 'headline') return { headline: normalizeHeadline(nextHeadline), body: normalizeBody(current.body), hashtags: normalizeHashtags(current.hashtags) };
    if (target === 'body') return { headline: normalizeHeadline(current.headline), body: normalizeBody(nextBody), hashtags: normalizeHashtags(current.hashtags) };
    if (target === 'hashtags') return { headline: normalizeHeadline(current.headline), body: normalizeBody(current.body), hashtags: normalizeHashtags(nextHashtags) };
    return { headline: normalizeHeadline(nextHeadline), body: normalizeBody(nextBody), hashtags: normalizeHashtags(nextHashtags) };
  }

  private async triggerBackgroundSync(): Promise<void> {
    const now = Date.now();
    if (this.isSyncing || (now - this.lastSyncTime) < this.AUTO_SYNC_INTERVAL_MS) {
      return;
    }

    this.isSyncing = true;
    console.log('[sync] Bắt đầu tự động đồng bộ từ Google Sheet...');

    try {
      const result = await syncWorkbookFromSheet(this.workspaceRoot);
      const manifest = await buildSheetDriveManifest(result.workbookPath);
      writeSheetDriveManifest(this.toolRoot, manifest);

      this.lastSyncTime = Date.now();
      this.invalidateDatasetCache();
      console.log(`[sync] Tự động đồng bộ hoàn tất: ${result.workbookPath} (${result.bytes} bytes), ${Object.keys(manifest.items).length} ảnh Drive.`);
    } catch (error) {
      console.error('[sync] Tự động đồng bộ thất bại:', error);
      // Vẫn cập nhật lastSyncTime để tránh thử lại liên tục nếu lỗi
      this.lastSyncTime = Date.now();
    } finally {
      this.isSyncing = false;
    }
  }

  // ─── Utility ──────────────────────────────────────────────────────────────

  private cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
