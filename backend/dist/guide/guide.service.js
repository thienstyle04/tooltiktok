"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuideService = void 0;
// ─── GuideService: orchestration, caching, AI captions ───────────────────────
require("dotenv/config");
const common_1 = require("@nestjs/common");
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const XLSX = __importStar(require("xlsx"));
const constants_1 = require("../core/constants");
const image_resolver_1 = require("../logic/image-resolver");
const data_allocator_1 = require("../logic/data-allocator");
const deck_builder_1 = require("../logic/deck-builder");
const drive_images_1 = require("../sync/drive-images");
const sheet_drive_manifest_1 = require("../sync/sheet-drive-manifest");
const workbook_source_1 = require("../sync/workbook-source");
function resolveToolRoot() {
    const currentDir = path.resolve(__dirname);
    if (fs.existsSync(path.join(currentDir, 'image-mapping.json')))
        return currentDir;
    return path.resolve(currentDir, '../../');
}
let GuideService = class GuideService {
    constructor() {
        // toolRoot points to the backend folder root
        this.toolRoot = resolveToolRoot();
        this.frontendRoot = path.resolve(this.toolRoot, '../frontend');
        this.workspaceRoot = path.resolve(this.toolRoot, '../../');
        this.dalatImageDir = 'C:\\Data\\tn\\Hình cảnh ĐL-20260417T122322Z-3-001\\Hình cảnh ĐL';
        this.tiktokReferenceDir = 'C:\\Data\\data\\ẢNH TIKTOK';
        this.imageMappingPath = path.join(this.toolRoot, 'image-mapping.json');
        this.generatedListsPath = path.join(this.toolRoot, 'generated-caption-lists.json');
        this.usedInventoryPath = path.join(this.toolRoot, 'used-inventory.json');
        this.generatedListsByDeckId = new Map();
        this.generatedListsLoaded = false;
        this.usedAllocator = new data_allocator_1.DataAllocator();
        this.inventoryLoaded = false;
        // ─── In-memory caches ──────────────────────────────────────────────────────
        this.datasetContextCache = null;
        this.datasetContextCacheTime = 0;
        this.DATASET_CACHE_TTL_MS = 0; // Tắt cache tạm thời để debug
        this.imageLibraryEntriesCache = null;
        this.imageLibraryEntriesCacheTime = 0;
        this.IMAGE_LIBRARY_CACHE_TTL_MS = 60_000; // 60 giây
        this.imageMappingCache = null;
        this.imageMappingCacheTime = 0;
        this.IMAGE_MAPPING_CACHE_TTL_MS = 30_000; // 30 giây
        this.lastSyncTime = this.getWorkbookLastModifiedTime();
        this.isSyncing = false;
        this.AUTO_SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 phút
    }
    // ──────────────────────────────────────────────────────────────────────────
    // ─── Static file serving ──────────────────────────────────────────────────
    getToolTextFile(fileName) {
        const target = path.join(this.toolRoot, fileName);
        if (!(0, image_resolver_1.safeRelative)(this.toolRoot, target) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
            throw new common_1.NotFoundException(`Tool file not found: ${fileName}`);
        }
        return fs.readFileSync(target, 'utf-8');
    }
    getToolBinaryFile(fileName) {
        const target = path.join(this.toolRoot, fileName);
        if (!(0, image_resolver_1.safeRelative)(this.toolRoot, target) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
            throw new common_1.NotFoundException(`Tool file not found: ${fileName}`);
        }
        return fs.readFileSync(target);
    }
    getFrontendTextFile(fileName) {
        const target = path.join(this.frontendRoot, fileName);
        if (!(0, image_resolver_1.safeRelative)(this.frontendRoot, target) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
            throw new common_1.NotFoundException(`Frontend file not found: ${fileName}`);
        }
        return fs.readFileSync(target, 'utf-8');
    }
    getFrontendBinaryFile(fileName) {
        const target = path.join(this.frontendRoot, fileName);
        if (!(0, image_resolver_1.safeRelative)(this.frontendRoot, target) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
            throw new common_1.NotFoundException(`Frontend file not found: ${fileName}`);
        }
        return fs.readFileSync(target);
    }
    guessMime(fileName) {
        const mimeByExtension = {
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
    getDalatAsset(fileName) {
        return (0, image_resolver_1.readAssetFromBase)(this.dalatImageDir, fileName);
    }
    getTiktokAsset(folderName, fileName) {
        return (0, image_resolver_1.readAssetFromBase)(path.join(this.tiktokReferenceDir, folderName), fileName);
    }
    getWorkspaceAsset(relativePath) {
        if (!relativePath)
            throw new common_1.NotFoundException('Asset path is required.');
        return (0, image_resolver_1.readAssetFromBase)(this.workspaceRoot, relativePath);
    }
    getLibraryAsset(relativePath, rootKey = 'main') {
        const imageMapping = this.loadImageMapping();
        const libraryRoot = (0, image_resolver_1.getConfiguredLibraryRoots)(imageMapping, this.workspaceRoot).find((e) => e.key === rootKey)?.path ?? '';
        if (!libraryRoot)
            throw new common_1.NotFoundException('Image library root not found.');
        if (!relativePath)
            throw new common_1.NotFoundException('Asset path is required.');
        return (0, image_resolver_1.readAssetFromBase)(libraryRoot, relativePath);
    }
    async getDriveFileAsset(fileId) {
        const normalizedFileId = String(fileId ?? '').trim();
        if (!normalizedFileId) {
            throw new common_1.NotFoundException('Drive file id is required.');
        }
        return (0, drive_images_1.fetchDriveFileAsset)(normalizedFileId);
    }
    // ─── Dataset ──────────────────────────────────────────────────────────────
    getDataset() {
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
                description: 'Tool này chuyển workbook địa điểm thành các bộ ảnh carousel bám theo tinh thần ảnh mẫu, có preview trực tiếp và export PNG ngay trên trình duyệt.',
                note: 'Ảnh hiện vẫn lấy từ pool "Hình cảnh ĐL". Khi có mapping ảnh theo từng địa điểm, backend có thể thay sang gán ảnh đúng theo item mà không phải đổi template.',
                stats: [
                    { label: 'Tổng địa điểm', value: context.totalItems },
                    { label: 'Ảnh Đà Lạt', value: context.imageUrls.length },
                    { label: 'Bộ mẫu TikTok', value: context.referenceSets.length },
                ],
                images: Array.from({ length: 4 }, (_, index) => context.imageUrls.length > 0
                    ? context.imageUrls[(0, image_resolver_1.stableHash)(`hero-${index}`) % context.imageUrls.length]
                    : ''),
            },
            referenceSets: context.referenceSets,
            decks: context.decks,
        };
    }
    // ─── AI caption ───────────────────────────────────────────────────────────
    async generateDeepSeekCaption(request) {
        const deckId = String(request.deckId ?? '').trim();
        if (!deckId)
            throw new common_1.BadRequestException('Thiếu deckId để gửi sang DeepSeek.');
        const dataset = this.getDataset();
        const deck = dataset.decks.find((d) => d.id === deckId);
        if (!deck)
            throw new common_1.NotFoundException(`Không tìm thấy deck: ${deckId}`);
        const listId = String(request.listId ?? '').trim() || deck.lists[0]?.id || '';
        const deckList = deck.lists.find((l) => l.id === listId);
        if (!deckList)
            throw new common_1.NotFoundException(`Không tìm thấy list: ${listId}`);
        const tone = (request.tone ?? 'lich_trinh_huu_ich');
        const target = (request.target ?? 'full');
        const current = {
            headline: String(request.current?.headline ?? '').trim(),
            body: String(request.current?.body ?? '').trim(),
            hashtags: Array.isArray(request.current?.hashtags)
                ? request.current.hashtags.map((h) => String(h).trim()).filter(Boolean)
                : [],
        };
        const apiKey = String(process.env.DEEPSEEK_API_KEY ?? '').trim();
        if (!apiKey) {
            throw new common_1.BadRequestException('Thiếu DEEPSEEK_API_KEY trên server. Hãy chạy: $env:DEEPSEEK_API_KEY="sk-..." rồi npm run start:dev');
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
        if (!response.ok)
            throw new common_1.BadRequestException(`DeepSeek API lỗi HTTP ${response.status}: ${responseText}`);
        let payload;
        try {
            payload = JSON.parse(responseText);
        }
        catch {
            throw new common_1.BadRequestException('Không đọc được phản hồi JSON từ DeepSeek.');
        }
        const content = String(payload?.choices?.[0]?.message?.content ?? '').trim();
        if (!content)
            throw new common_1.BadRequestException('DeepSeek không trả về nội dung caption.');
        const parsed = this.parseDeepSeekJson(content);
        const normalizedCaption = this.normalizeCaptionPayload(parsed, current, target, tone);
        return { deckId, listId, target, tone, headline: normalizedCaption.headline, body: normalizedCaption.body, hashtags: normalizedCaption.hashtags, raw: content };
    }
    deleteGeneratedList(deckId, listId) {
        this.ensureGeneratedListsLoaded();
        const existing = this.generatedListsByDeckId.get(deckId);
        if (!existing)
            throw new common_1.NotFoundException(`Không tìm thấy deck: ${deckId}`);
        const filtered = existing.filter((l) => l.id !== listId);
        if (filtered.length === existing.length)
            throw new common_1.NotFoundException(`Không tìm thấy list: ${listId}`);
        if (filtered.length === 0) {
            this.generatedListsByDeckId.delete(deckId);
        }
        else {
            this.generatedListsByDeckId.set(deckId, filtered);
        }
        this.persistGeneratedLists();
    }
    generateDeckFromCaption(request) {
        this.ensureGeneratedListsLoaded();
        const deckId = String(request.deckId ?? '').trim();
        if (!deckId)
            throw new common_1.BadRequestException('Thiếu deckId để tạo list mới từ caption.');
        const caption = this.normalizeCaptionPayload({
            headline: String(request.caption?.headline ?? '').trim(),
            body: String(request.caption?.body ?? '').trim(),
            hashtags: Array.isArray(request.caption?.hashtags)
                ? request.caption.hashtags.map((h) => String(h).trim()).filter(Boolean)
                : [],
        }, { headline: '', body: '', hashtags: [] }, 'full', 'lich_trinh_huu_ich');
        if (!caption.headline || !caption.body)
            throw new common_1.BadRequestException('Cần có headline và body trước khi tạo list mới.');
        const context = this.buildDatasetContext();
        const currentDeck = context.decks.find((d) => d.id === deckId);
        if (!currentDeck)
            throw new common_1.NotFoundException(`Không tìm thấy deck: ${deckId}`);
        const existing = this.generatedListsByDeckId.get(deckId) ?? [];
        // Sử dụng timestamp + index để đảm bảo ID không bao giờ trùng kể cả khi xóa bớt
        const timestamp = Date.now().toString(36).slice(-4);
        const generatedNumber = existing.length + 1;
        const generatedSuffix = `${String(generatedNumber).padStart(2, '0')}-${timestamp}`;
        const seed = [deckId, generatedSuffix, caption.headline, caption.body, caption.hashtags.join(' ')].join('|');
        this.ensureInventoryLoaded();
        const deckUsage = this.usedAllocator.clone();
        const baseList = currentDeck.lists.find((list) => /-main$/i.test(list.id)) ?? currentDeck.lists[0];
        if (baseList)
            this.markUsedInDeck(baseList.pages, deckUsage);
        const lastGeneratedList = existing.length > 0 ? existing[existing.length - 1] : null;
        if (lastGeneratedList)
            this.markUsedInDeck(lastGeneratedList.pages, deckUsage);
        const generatedPages = (0, deck_builder_1.applyCaptionToPages)((0, deck_builder_1.buildPagesForDeck)(deckId, context.itemsBySection, context.imageUrls, context.imageLibraryEntries, seed, deckUsage.itemIds, deckUsage.imageUrls), caption);
        const generatedList = (0, deck_builder_1.buildDeckList)(deckId, `caption-${generatedSuffix}`, `AI ${String(generatedNumber).padStart(2, '0')}`, caption.headline, caption.body, generatedPages);
        generatedList.captionHashtags = caption.hashtags;
        this.markUsedInDeck(generatedPages);
        this.persistInventory();
        this.generatedListsByDeckId.set(deckId, [...existing, generatedList]);
        this.persistGeneratedLists();
        return { deckId, listId: generatedList.id, navTitle: generatedList.navTitle, title: generatedList.title };
    }
    // ─── Private: dataset context ─────────────────────────────────────────────
    invalidateDatasetCache() {
        this.datasetContextCache = null;
        this.datasetContextCacheTime = 0;
    }
    buildDatasetContext() {
        this.ensureGeneratedListsLoaded();
        const now = Date.now();
        if (this.datasetContextCache && (now - this.datasetContextCacheTime) < this.DATASET_CACHE_TTL_MS) {
            console.log('[cache] dataset context HIT');
            return this.datasetContextCache;
        }
        const t0 = Date.now();
        const workbookPath = this.getWorkbookPath();
        const imageUrls = (0, image_resolver_1.imageUrlsForDirectory)(this.dalatImageDir, '/assets/dalat');
        const imageMapping = this.loadImageMapping();
        const imageLibraryEntries = this.loadImageLibraryEntries(imageMapping);
        const sheetDriveManifest = this.loadSheetDriveManifest(workbookPath);
        const itemsBySection = this.loadWorkbookItems(workbookPath, imageUrls, imageMapping, imageLibraryEntries, sheetDriveManifest);
        this.ensureInventoryLoaded();
        const renderUsage = this.createUsageScope();
        const baseDecks = (0, deck_builder_1.buildDecks)(itemsBySection, imageUrls, imageLibraryEntries, renderUsage.itemIds, renderUsage.imageUrls);
        baseDecks.forEach((deck) => this.markUsedInDeck(deck.lists.flatMap((list) => list.pages), renderUsage));
        this.refreshGeneratedLists(itemsBySection, imageUrls, imageLibraryEntries, renderUsage);
        const referenceSets = this.buildReferenceSets();
        const decks = this.mergeGeneratedLists(baseDecks);
        const totalItems = Object.values(itemsBySection).reduce((s, items) => s + items.length, 0);
        const mappedItemCount = Object.values(itemsBySection).reduce((s, items) => s + items.filter((i) => i.imageMapped).length, 0);
        const manualMappedItemCount = Object.values(itemsBySection).reduce((s, items) => s + items.filter((i) => i.imageSource === 'manual').length, 0);
        const autoMappedItemCount = Object.values(itemsBySection).reduce((s, items) => s + items.filter((i) => i.imageSource === 'auto').length, 0);
        const context = { imageUrls, imageLibraryEntries, itemsBySection, referenceSets, totalItems, mappedItemCount, manualMappedItemCount, autoMappedItemCount, decks };
        this.datasetContextCache = context;
        this.datasetContextCacheTime = Date.now();
        console.log(`[cache] dataset context MISS — built in ${Date.now() - t0}ms`);
        return context;
    }
    mergeGeneratedLists(decks) {
        return decks.map((deck) => {
            const generatedLists = this.generatedListsByDeckId.get(deck.id) ?? [];
            if (generatedLists.length === 0)
                return deck;
            return { ...deck, lists: [...deck.lists, ...this.cloneJson(generatedLists)] };
        });
    }
    refreshGeneratedLists(itemsBySection, imageUrls, libraryEntries, renderUsage) {
        if (this.generatedListsByDeckId.size === 0)
            return;
        let changed = false;
        for (const [deckId, lists] of this.generatedListsByDeckId.entries()) {
            const refreshedLists = lists.map((list) => {
                const listUsage = renderUsage.clone();
                const caption = {
                    headline: (0, deck_builder_1.sanitizeDeckHeadline)(list.title),
                    body: list.description,
                    hashtags: Array.isArray(list.captionHashtags) ? list.captionHashtags : [],
                };
                const regeneratedPages = (0, deck_builder_1.applyCaptionToPages)((0, deck_builder_1.buildPagesForDeck)(deckId, itemsBySection, imageUrls, libraryEntries, `refresh:${deckId}:${list.id}:${caption.headline}:${caption.body}:${caption.hashtags.join(' ')}`, listUsage.itemIds, listUsage.imageUrls), caption);
                const generatedUsage = this.createUsageScope();
                this.markUsedInDeck(regeneratedPages, generatedUsage);
                renderUsage.merge(generatedUsage);
                if (list.title !== caption.headline || JSON.stringify(list.pages) !== JSON.stringify(regeneratedPages))
                    changed = true;
                return { ...list, title: caption.headline, pages: regeneratedPages };
            });
            this.generatedListsByDeckId.set(deckId, refreshedLists);
        }
        if (changed)
            this.persistGeneratedLists();
    }
    ensureGeneratedListsLoaded() {
        if (this.generatedListsLoaded)
            return;
        this.generatedListsLoaded = true;
        this.generatedListsByDeckId.clear();
        if (!fs.existsSync(this.generatedListsPath))
            return;
        try {
            const raw = fs.readFileSync(this.generatedListsPath, 'utf-8');
            const parsed = JSON.parse(raw);
            const deckEntries = parsed.decks && typeof parsed.decks === 'object' ? parsed.decks : {};
            Object.entries(deckEntries).forEach(([deckId, lists]) => {
                if (!Array.isArray(lists))
                    return;
                const normalizedLists = lists
                    .filter((item) => item && typeof item === 'object')
                    .map((item) => this.cloneJson(item))
                    .filter((item) => item.id && Array.isArray(item.pages));
                if (normalizedLists.length > 0)
                    this.generatedListsByDeckId.set(deckId, normalizedLists);
            });
        }
        catch {
            this.generatedListsByDeckId.clear();
        }
    }
    persistGeneratedLists() {
        const decks = Array.from(this.generatedListsByDeckId.entries()).reduce((carry, [deckId, lists]) => { carry[deckId] = this.cloneJson(lists); return carry; }, {});
        const payload = { version: 1, savedAt: new Date().toISOString(), decks };
        fs.writeFileSync(this.generatedListsPath, JSON.stringify(payload, null, 2), 'utf-8');
        this.invalidateDatasetCache();
    }
    // ─── Private: workbook loading ────────────────────────────────────────────
    getWorkbookPath() {
        const workbookPath = (0, workbook_source_1.findWorkbookPath)(this.workspaceRoot);
        if (!workbookPath)
            throw new common_1.NotFoundException('Không tìm thấy file Excel nguồn trong thư mục gốc.');
        return workbookPath;
    }
    loadSheetDriveManifest(workbookPath) {
        return (0, sheet_drive_manifest_1.readSheetDriveManifest)(this.toolRoot, workbookPath);
    }
    loadWorkbookItems(workbookPath, imageUrls, imageMapping, libraryEntries, sheetDriveManifest) {
        const workbook = XLSX.readFile(workbookPath, { cellDates: false });
        const results = Object.keys(constants_1.SECTION_CONFIG).reduce((carry, sectionKey) => {
            carry[sectionKey] = [];
            return carry;
        }, {});
        let sequence = 0;
        for (const sheetName of workbook.SheetNames) {
            const sectionKey = (0, image_resolver_1.normalizeText)(sheetName);
            if (!(sectionKey in constants_1.SECTION_CONFIG))
                continue;
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
            if (rows.length === 0)
                continue;
            const headers = (rows[0] ?? []).map((h) => (0, image_resolver_1.normalizeText)(h));
            for (const rawRow of rows.slice(1)) {
                const rowMap = {};
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
    buildItem(sectionKey, row, sequence, imageUrls, imageMapping, libraryEntries, sheetDriveManifest) {
        const name = (0, image_resolver_1.firstValue)(row, 'ten_quan', 'ten_dia_diem', 'ten');
        if (!name)
            return null;
        const placeType = (0, image_resolver_1.firstValue)(row, 'mo_hinh', 'loai_dich_vu', 'phong_cach');
        const address = (0, image_resolver_1.firstValue)(row, 'dia_chi');
        const openHours = (0, image_resolver_1.firstValue)(row, 'gio_mo_cua', 'gio_mo_cua_', 'gio_mo_cua_1');
        const style = (0, image_resolver_1.firstValue)(row, 'phong_cach');
        const highlight = (0, image_resolver_1.firstValue)(row, 'mon_an_noi_bat', 'mon_noi_bat', 'noi_bat');
        const partner = (0, image_resolver_1.firstValue)(row, 'doi_tac', 'doi_tac_cong_ty');
        const phone = (0, image_resolver_1.firstValue)(row, 'sdt');
        const price = (0, image_resolver_1.firstValue)(row, 'gia');
        const mappingKey = (0, image_resolver_1.itemMappingKey)(sectionKey, name, address);
        const sheetDriveEntry = sheetDriveManifest.items[mappingKey];
        const resolvedImage = sheetDriveEntry
            ? {
                imageUrl: (0, drive_images_1.getDriveImageProxyUrl)(sheetDriveEntry.fileId),
                imageMapped: true,
                imageMappingKey: mappingKey,
                imageSource: 'manual',
            }
            : (0, image_resolver_1.resolveMappedImage)(sectionKey, placeType || constants_1.SECTION_CONFIG[sectionKey].title, name, address, imageUrls, sequence, imageMapping, libraryEntries, this.workspaceRoot);
        return {
            id: `${sectionKey}-${sequence}`,
            sectionKey,
            sectionTitle: constants_1.SECTION_CONFIG[sectionKey].title,
            name, address,
            type: placeType || constants_1.SECTION_CONFIG[sectionKey].title,
            openHours, style, highlight,
            partnerFlag: partner,
            isPartner: (0, image_resolver_1.normalizeText)(partner) === 'x',
            price, phone,
            imageUrl: resolvedImage.imageUrl,
            imageMapped: resolvedImage.imageMapped,
            imageMappingKey: resolvedImage.imageMappingKey,
            imageSource: resolvedImage.imageSource,
            candidateImageUrls: resolvedImage.candidateImageUrls,
        };
    }
    // ─── Private: image library loading (with cache) ──────────────────────────
    ensureInventoryLoaded() {
        if (this.inventoryLoaded)
            return;
        this.inventoryLoaded = true;
        if (!fs.existsSync(this.usedInventoryPath))
            return;
        try {
            const raw = fs.readFileSync(this.usedInventoryPath, 'utf-8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed.usedItemIds))
                parsed.usedItemIds.forEach((id) => this.usedAllocator.itemIds.add(id));
            if (Array.isArray(parsed.usedImageUrls))
                parsed.usedImageUrls.forEach((url) => this.usedAllocator.markImageUrl(url));
        }
        catch {
            // Ignore errors
        }
    }
    persistInventory() {
        fs.writeFileSync(this.usedInventoryPath, JSON.stringify(this.usedAllocator.snapshot(), null, 2), 'utf-8');
    }
    createUsageScope() {
        return new data_allocator_1.DataAllocator();
    }
    markUsedInDeck(pages, scope = this.usedAllocator) {
        scope.markPages(pages);
    }
    loadImageMapping() {
        const now = Date.now();
        if (this.imageMappingCache && (now - this.imageMappingCacheTime) < this.IMAGE_MAPPING_CACHE_TTL_MS) {
            return this.imageMappingCache;
        }
        let result;
        if (!fs.existsSync(this.imageMappingPath)) {
            result = {
                version: 1,
                libraryRoot: (0, image_resolver_1.getImageLibraryRoot)(this.workspaceRoot) ?? '',
                extraLibraryRoots: [],
                instructions: [
                    'Điền imagePath bằng đường dẫn tương đối bên trong libraryRoot hoặc đường dẫn tương đối từ workspace.',
                    'Match ưu tiên theo sectionKey + name + address, vì vậy nên giữ nguyên name/address đúng như trong Excel.',
                ],
                mappings: [],
            };
        }
        else {
            try {
                const raw = fs.readFileSync(this.imageMappingPath, 'utf-8');
                const parsed = JSON.parse(raw);
                result = {
                    version: Number(parsed.version ?? 1),
                    libraryRoot: String(parsed.libraryRoot ?? (0, image_resolver_1.getImageLibraryRoot)(this.workspaceRoot) ?? ''),
                    extraLibraryRoots: Array.isArray(parsed.extraLibraryRoots)
                        ? parsed.extraLibraryRoots.map((e) => String(e ?? '').trim()).filter(Boolean)
                        : [],
                    instructions: Array.isArray(parsed.instructions) ? parsed.instructions.map((e) => String(e)) : [],
                    mappings: Array.isArray(parsed.mappings) ? parsed.mappings : [],
                };
            }
            catch {
                result = { version: 1, libraryRoot: (0, image_resolver_1.getImageLibraryRoot)(this.workspaceRoot) ?? '', extraLibraryRoots: [], instructions: [], mappings: [] };
            }
        }
        this.imageMappingCache = result;
        this.imageMappingCacheTime = now;
        return result;
    }
    loadImageLibraryEntries(imageMapping) {
        const now = Date.now();
        if (this.imageLibraryEntriesCache && (now - this.imageLibraryEntriesCacheTime) < this.IMAGE_LIBRARY_CACHE_TTL_MS) {
            return this.imageLibraryEntriesCache;
        }
        const results = (0, image_resolver_1.buildImageLibraryEntries)(imageMapping, this.workspaceRoot);
        this.imageLibraryEntriesCache = results;
        this.imageLibraryEntriesCacheTime = now;
        return results;
    }
    // ─── Private: reference sets ──────────────────────────────────────────────
    buildReferenceSets() {
        if (!fs.existsSync(this.tiktokReferenceDir))
            return [];
        return fs
            .readdirSync(this.tiktokReferenceDir, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .sort((a, b) => (0, image_resolver_1.normalizeText)(a.name).localeCompare((0, image_resolver_1.normalizeText)(b.name), 'vi'))
            .flatMap((folder) => {
            const folderPath = path.join(this.tiktokReferenceDir, folder.name);
            const files = fs
                .readdirSync(folderPath)
                .filter((e) => ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(e).toLowerCase()))
                .sort((a, b) => a.localeCompare(b, 'vi'));
            if (files.length === 0)
                return [];
            return [{ title: folder.name, count: files.length, coverUrl: `/assets/tiktok/${encodeURIComponent(folder.name)}/${encodeURIComponent(files[0])}` }];
        });
    }
    // ─── Private: DeepSeek prompt helpers ────────────────────────────────────
    buildDeepSeekPrompt(deck, deckList, tone, target, current) {
        const pageLines = deckList.pages.map((page, index) => {
            if (page.type === 'cover')
                return `Trang ${index + 1}: cover | tiêu đề: ${page.title} | mô tả: ${page.subtitle}`;
            const itemLines = page.items.map((item, i) => `- ${i + 1}. ${item.name} | ${item.metaPrimary} | ${item.metaSecondary}`).join('\n');
            return [`Trang ${index + 1}: list`, `Chủ đề: ${page.chipText}`, `Tiêu đề: ${page.title}`, `Mô tả: ${page.subtitle}`, 'Địa điểm:', itemLines].join('\n');
        });
        const toneInstructions = {
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
            '2 cau ngan: cau 1 tao ly do luu lai, cau 2 nhac 1-2 dia diem noi bat',
            '3 menh de lien tiep, nhip nhanh, khong liet ke may moc',
            'mot cau mo dau co cam giac, mot cau sau noi ro list nay giup gi',
            'viet nhu loi ru ban di choi, cuoi bang loi nhac luu lai nhe',
            'review that gon: noi diem hop voi ai, roi goi ten 1-2 dia diem',
            'caption nhe nha: co canh, co mon hoac quan, co ly do nen luu',
        ];
        const variationSeed = (0, image_resolver_1.stableHash)([
            deck.id,
            deckList.id,
            tone,
            target,
            current.headline,
            current.body,
            current.hashtags.join(','),
            Date.now().toString(),
            Math.random().toString(36).slice(2),
        ].join('|'));
        const diversityAngle = diversityAngles[variationSeed % diversityAngles.length];
        const bodyShape = bodyShapes[Math.floor(variationSeed / diversityAngles.length) % bodyShapes.length];
        return [
            'Tạo caption TikTok cho bộ ảnh du lịch Đà Lạt sau.',
            `Tên chủ đề: ${deck.title}`,
            `Mô tả chung: ${deck.description}`,
            `Danh sách địa điểm: ${deckList.title}`,
            `Mô tả danh sách: ${deckList.description}`,
            `Tone yêu cầu: ${tone}`,
            `Hướng dẫn giọng văn: ${toneInstructions[tone]}`,
            `Phần cần sinh: ${target}`,
            `Goc trien khai bat buoc cho lan sinh nay: ${diversityAngle}.`,
            `Kieu body bat buoc cho lan sinh nay: ${bodyShape}.`,
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
            '- Không dùng chữ "free" trong headline. Nếu cần nói về chi phí, hãy dùng cách mềm hơn như "0đ", "dễ đi", "gọn ví" hoặc bỏ hẳn khỏi headline.',
            '',
            'CÁC YÊU CẦU KHÁC:',
            '- TUYỆT ĐỐI không dùng từ "deck" trong nội dung. Thay vào đó hãy dùng: "hình", "ảnh", "bộ ảnh", "cẩm nang", "lịch trình", "list này"...',
            '- Body: Phải đa dạng cấu trúc câu, không lặp lại các motif cũ. Tối đa 250 ký tự. Phải nhắc được tên 1-2 địa điểm nổi bật trong list.',
            '- Khong mo ta bo cuc thiet ke hoac kich thuoc layout trong caption. Tranh cac cum: "2x3", "3x3", "2x4", "luoi", "layout", "grid", "o anh", "o hinh".',
            '- Moi lan bam sinh lai phai doi goc viet, doi nhip cau, doi dong tu mo dau; khong chi thay vai tu dong nghia.',
            '- Hashtags: đúng 5 hashtag, trong đó bắt buộc có #riviudalat #dalat #dalatreview. 2 hashtag còn lại phải liên quan chặt chẽ đến nội dung và tone.',
            '- Trả về JSON object đúng schema:',
            '{"headline":"...","body":"...","hashtags":["#...","#...","#...","#...","#..."]}',
        ].filter(Boolean).join('\n');
    }
    parseDeepSeekJson(content) {
        const direct = this.tryParseJson(content);
        if (direct)
            return direct;
        const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fenced) {
            const p = this.tryParseJson(fenced[1]);
            if (p)
                return p;
        }
        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const p = this.tryParseJson(content.slice(firstBrace, lastBrace + 1));
            if (p)
                return p;
        }
        throw new common_1.BadRequestException('Không parse được JSON caption từ DeepSeek.');
    }
    tryParseJson(value) {
        try {
            const parsed = JSON.parse(value.trim());
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
                return parsed;
            return null;
        }
        catch {
            return null;
        }
    }
    normalizeCaptionPayload(parsed, current, target, tone) {
        const nextHeadline = String(parsed.headline ?? parsed.hook ?? '').trim();
        const nextBody = String(parsed.body ?? parsed.caption ?? '').trim();
        const nextHashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags.map((h) => String(h).trim()).filter(Boolean) : [];
        const toneSuggestions = {
            gen_z: ['#checkindalat', '#anchoidalat'],
            tinh_te: ['#dalatchill', '#dalatnhenhang'],
            review_chan_that: ['#reviewdalat', '#kinhnghiemdalat'],
            ban_hang_nhe: ['#goiydalat', '#dichvudalot'],
            lich_trinh_huu_ich: ['#lichtrinhdalat', '#traveldalat'],
        };
        const removeLayoutTerms = (value) => String(value || '')
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
        const normalizeHeadline = (v) => {
            const fallback = 'ĐI ĐÀ LẠT THÌ LƯU NGAY LIST NÀY';
            const clean = removeLayoutTerms((0, deck_builder_1.sanitizeDeckHeadline)(v || current.headline || fallback)).replace(/\s+/g, ' ').trim();
            return (clean || fallback).slice(0, 35);
        };
        const normalizeBody = (v) => {
            const fallback = 'Một bộ caption gợi ý nhanh cho list đang chọn, bám đúng dữ liệu địa điểm trong tool.';
            const clean = removeLayoutTerms(v || current.body || fallback).replace(/\s+/g, ' ').trim();
            return (clean || fallback).slice(0, 250);
        };
        const normalizeHashtags = (values) => {
            const fixed = ['#riviudalat', '#dalat', '#dalatreview'];
            const normalized = values
                .map((h) => h.trim()).filter(Boolean)
                .map((h) => (h.startsWith('#') ? h : `#${h}`))
                .map((h) => h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^#a-z0-9]+/g, ''))
                .filter((h) => h.length > 1);
            const merged = [...fixed, ...normalized, ...toneSuggestions[tone]];
            const unique = [];
            for (const h of merged)
                if (!unique.includes(h))
                    unique.push(h);
            return unique.slice(0, 5);
        };
        if (target === 'headline')
            return { headline: normalizeHeadline(nextHeadline), body: normalizeBody(current.body), hashtags: normalizeHashtags(current.hashtags) };
        if (target === 'body')
            return { headline: normalizeHeadline(current.headline), body: normalizeBody(nextBody), hashtags: normalizeHashtags(current.hashtags) };
        if (target === 'hashtags')
            return { headline: normalizeHeadline(current.headline), body: normalizeBody(current.body), hashtags: normalizeHashtags(nextHashtags) };
        return { headline: normalizeHeadline(nextHeadline), body: normalizeBody(nextBody), hashtags: normalizeHashtags(nextHashtags) };
    }
    async triggerBackgroundSync() {
        const now = Date.now();
        if (this.isSyncing || (now - this.lastSyncTime) < this.AUTO_SYNC_INTERVAL_MS) {
            return;
        }
        this.isSyncing = true;
        console.log('[sync] Bắt đầu tự động đồng bộ từ Google Sheet...');
        try {
            const result = await (0, workbook_source_1.syncWorkbookFromSheet)(this.workspaceRoot);
            const manifest = await (0, sheet_drive_manifest_1.buildSheetDriveManifest)(result.workbookPath);
            (0, sheet_drive_manifest_1.writeSheetDriveManifest)(this.toolRoot, manifest);
            this.lastSyncTime = Date.now();
            this.invalidateDatasetCache();
            console.log(`[sync] Tự động đồng bộ hoàn tất: ${result.workbookPath} (${result.bytes} bytes), ${Object.keys(manifest.items).length} ảnh Drive.`);
        }
        catch (error) {
            console.error('[sync] Tự động đồng bộ thất bại:', error);
            // Vẫn cập nhật lastSyncTime để tránh thử lại liên tục nếu lỗi
            this.lastSyncTime = Date.now();
        }
        finally {
            this.isSyncing = false;
        }
    }
    // ─── Utility ──────────────────────────────────────────────────────────────
    getWorkbookLastModifiedTime() {
        const workbookPath = (0, workbook_source_1.findWorkbookPath)(this.workspaceRoot);
        if (!workbookPath || !fs.existsSync(workbookPath))
            return 0;
        try {
            return fs.statSync(workbookPath).mtimeMs;
        }
        catch {
            return 0;
        }
    }
    cloneJson(value) {
        return JSON.parse(JSON.stringify(value));
    }
};
exports.GuideService = GuideService;
exports.GuideService = GuideService = __decorate([
    (0, common_1.Injectable)()
], GuideService);
