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
exports.normalizeText = normalizeText;
exports.stableHash = stableHash;
exports.safeRelative = safeRelative;
exports.firstValue = firstValue;
exports.itemMappingKey = itemMappingKey;
exports.extractFirstNumber = extractFirstNumber;
exports.readAssetFromBase = readAssetFromBase;
exports.imageUrlsForDirectory = imageUrlsForDirectory;
exports.getImageLibraryRoot = getImageLibraryRoot;
exports.getConfiguredLibraryRoots = getConfiguredLibraryRoots;
exports.buildImageLibraryEntries = buildImageLibraryEntries;
exports.topDirKind = topDirKind;
exports.allowedImageKindsForItem = allowedImageKindsForItem;
exports.scoreImageLibraryMatch = scoreImageLibraryMatch;
exports.resolveMappedImage = resolveMappedImage;
exports.createListImageResolver = createListImageResolver;
// ─── Image resolving & library scanning helpers ───────────────────────────────
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const common_1 = require("@nestjs/common");
// ─── Pure utility helpers ─────────────────────────────────────────────────────
function normalizeText(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}
function stableHash(seed) {
    let result = 0;
    Array.from(seed).forEach((char, index) => {
        result = (result * 131 + char.charCodeAt(0) + index) % 2_147_483_647;
    });
    return result;
}
function safeRelative(baseDir, targetPath) {
    const relative = path.relative(path.resolve(baseDir), path.resolve(targetPath));
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
function firstValue(row, ...keys) {
    for (const key of keys) {
        const value = (row[key] ?? '').trim();
        if (value)
            return value;
    }
    return '';
}
function itemMappingKey(sectionKey, name, address) {
    return [sectionKey, normalizeText(name), normalizeText(address)].join('|');
}
function extractFirstNumber(fileName) {
    const match = fileName.match(/\d+/);
    return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}
function readAssetFromBase(baseDir, fileName) {
    const target = path.join(baseDir, fileName);
    if (!safeRelative(baseDir, target) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
        throw new common_1.NotFoundException('Asset not found.');
    }
    return fs.readFileSync(target);
}
function imageUrlsForDirectory(directory, routePrefix) {
    if (!fs.existsSync(directory))
        return [];
    return fs
        .readdirSync(directory)
        .filter((entry) => ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(path.extname(entry).toLowerCase()))
        .sort((left, right) => {
        const ln = extractFirstNumber(left);
        const rn = extractFirstNumber(right);
        return ln !== rn ? ln - rn : left.localeCompare(right, 'vi');
    })
        .map((fileName) => `${routePrefix}/${encodeURIComponent(fileName)}`);
}
function imageFileNamesForDirectory(directory) {
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory())
        return [];
    const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.jfif']);
    return fs
        .readdirSync(directory)
        .filter((entry) => imageExtensions.has(path.extname(entry).toLowerCase()))
        .sort((left, right) => {
        const ln = extractFirstNumber(left);
        const rn = extractFirstNumber(right);
        return ln !== rn ? ln - rn : left.localeCompare(right, 'vi');
    });
}
// ─── Image library ────────────────────────────────────────────────────────────
function getImageLibraryRoot(workspaceRoot) {
    const parentRoot = path.dirname(workspaceRoot);
    if (!fs.existsSync(parentRoot))
        return null;
    const archiveRoot = fs
        .readdirSync(parentRoot, { withFileTypes: true })
        .find((e) => e.isDirectory() && normalizeText(e.name).startsWith('hinh nen dep'));
    if (!archiveRoot)
        return null;
    const archivePath = path.join(parentRoot, archiveRoot.name);
    const innerRoot = fs
        .readdirSync(archivePath, { withFileTypes: true })
        .find((e) => e.isDirectory() && normalizeText(e.name).includes('hinh nen dep'));
    return innerRoot ? path.join(archivePath, innerRoot.name) : null;
}
function getConfiguredLibraryRoots(imageMapping, workspaceRoot) {
    const results = [];
    const seenPaths = new Set();
    const addRoot = (key, targetPath) => {
        const normalizedPath = String(targetPath ?? '').trim();
        if (!normalizedPath || !fs.existsSync(normalizedPath) || !fs.statSync(normalizedPath).isDirectory())
            return;
        const resolvedPath = path.resolve(normalizedPath);
        if (seenPaths.has(resolvedPath))
            return;
        seenPaths.add(resolvedPath);
        results.push({ key, path: resolvedPath });
    };
    addRoot('main', imageMapping.libraryRoot || getImageLibraryRoot(workspaceRoot) || '');
    for (const extraRoot of imageMapping.extraLibraryRoots ?? []) {
        const rawPath = String(extraRoot ?? '').trim();
        if (!rawPath)
            continue;
        const keyBase = normalizeText(path.basename(rawPath)) || 'extra_library';
        let key = keyBase;
        let suffix = 2;
        while (results.some((e) => e.key === key)) {
            key = `${keyBase}_${suffix}`;
            suffix += 1;
        }
        addRoot(key, rawPath);
    }
    return results;
}
function buildImageLibraryEntries(imageMapping, workspaceRoot) {
    const libraryRoots = getConfiguredLibraryRoots(imageMapping, workspaceRoot);
    if (libraryRoots.length === 0)
        return [];
    const results = [];
    const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.jfif']);
    const pushEntry = (root, topDirName, subDirName, subPath) => {
        const images = fs
            .readdirSync(subPath)
            .filter((e) => imageExtensions.has(path.extname(e).toLowerCase()))
            .sort((a, b) => a.localeCompare(b, 'vi'));
        if (images.length === 0)
            return;
        const relativeDir = path.relative(root.path, subPath).replaceAll('\\', '/');
        results.push({
            rootKey: root.key,
            rootPath: root.path,
            topDir: topDirName,
            subDir: subDirName,
            relativeDir,
            normalizedSubDir: normalizeText(subDirName),
            assetUrls: images.map((img) => `/assets/library?root=${encodeURIComponent(root.key)}&path=${encodeURIComponent(path.join(relativeDir, img).replaceAll('\\', '/'))}`),
        });
    };
    for (const root of libraryRoots) {
        for (const firstLevelDir of fs.readdirSync(root.path, { withFileTypes: true })) {
            if (!firstLevelDir.isDirectory())
                continue;
            const firstLevelPath = path.join(root.path, firstLevelDir.name);
            pushEntry(root, path.basename(root.path), firstLevelDir.name, firstLevelPath);
            for (const secondLevelDir of fs.readdirSync(firstLevelPath, { withFileTypes: true })) {
                if (!secondLevelDir.isDirectory())
                    continue;
                pushEntry(root, firstLevelDir.name, secondLevelDir.name, path.join(firstLevelPath, secondLevelDir.name));
            }
        }
    }
    return results;
}
// ─── Image matching / scoring ─────────────────────────────────────────────────
function isGenericToken(token) {
    return new Set([
        'banh', 'bun', 'pho', 'mi', 'lau', 'com', 'nem', 'quan', 'tiem', 'cafe', 'coffee',
        'tra', 'ga', 'bo', 'nuong', 'an', 'uong', 'home', 'hotel', 'homestay', 'check', 'in',
        'duong', 'doc', 'ho', 'kdl', 'xe', 'thue', 'tour', 'spa', 'land', 'dalat', 'da', 'lat',
    ]).has(token);
}
function topDirKind(topDir) {
    const normalized = normalizeText(topDir);
    if (normalized.includes('ca_phe') ||
        normalized.includes('quan_cafe') ||
        normalized.includes('cafe_check_in') ||
        normalized.includes('cafe_local') ||
        normalized.includes('nhom_cafe'))
        return 'cafe';
    if (normalized.includes('quan_an_sang'))
        return 'food_breakfast';
    if (normalized.includes('quan_an_trua'))
        return 'food_lunch';
    if (normalized.includes('quan_an_toi'))
        return 'food_dinner';
    if (normalized.includes('dac_san'))
        return 'specialty';
    if (normalized.includes('thue_xe'))
        return 'rental';
    if (normalized.includes('check_in'))
        return 'checkin';
    return 'other';
}
function decodedAssetPath(url) {
    try {
        const parsed = new URL(url, 'http://local');
        return decodeURIComponent(parsed.searchParams.get('path') || url).toLowerCase();
    }
    catch {
        try {
            return decodeURIComponent(url).toLowerCase();
        }
        catch {
            return String(url || '').toLowerCase();
        }
    }
}
function shouldAvoidImageForItem(name, url) {
    const normalizedName = normalizeText(name);
    const assetPath = decodedAssetPath(url);
    if (normalizedName.includes('the_florest') && assetPath.includes('img_8544.jpg'))
        return true;
    return false;
}
function preferredImageCandidates(name, urls) {
    const unique = Array.from(new Set(urls.filter(Boolean)));
    const preferred = unique.filter((url) => !shouldAvoidImageForItem(name, url));
    return preferred.length > 0 ? preferred : unique;
}
function allowedImageKindsForItem(item) {
    const allowed = new Set();
    const normalizedType = normalizeText(item.type);
    const normalizedName = normalizeText(item.name);
    if (item.sectionKey === 'cafe') {
        allowed.add('cafe');
    }
    else if (item.sectionKey === 'check_in') {
        allowed.add('checkin');
    }
    else if (item.sectionKey === 'quan_an') {
        if (normalizedType.includes('sang')) {
            allowed.add('food_breakfast');
            allowed.add('food_lunch');
        }
        else if (normalizedType.includes('trua')) {
            allowed.add('food_lunch');
        }
        else if (normalizedType.includes('toi')) {
            allowed.add('food_dinner');
        }
        else {
            allowed.add('food_breakfast');
            allowed.add('food_lunch');
            allowed.add('specialty');
        }
    }
    else if (item.sectionKey === 'dich_vu') {
        if (normalizedType.includes('thue_xe') || normalizedName.includes('thue_xe'))
            allowed.add('rental');
        if (normalizedType.includes('dac_san') ||
            normalizedName.includes('dac_san') ||
            normalizedName.includes('qua'))
            allowed.add('specialty');
    }
    return allowed;
}
function scoreImageLibraryMatch(sectionKey, name, address, entry) {
    const normalizedName = normalizeText(name);
    const normalizedAddress = normalizeText(address);
    const nameTokens = new Set(normalizedName.split('_').filter(Boolean));
    const addressTokens = new Set(normalizedAddress.split('_').filter(Boolean));
    const entryTokens = new Set(entry.normalizedSubDir.split('_').filter(Boolean));
    let score = 0;
    if (entry.normalizedSubDir === normalizedName)
        score += 100;
    else if (entry.normalizedSubDir.includes(normalizedName) || normalizedName.includes(entry.normalizedSubDir))
        score += 70;
    for (const token of nameTokens)
        if (token.length >= 3 && entryTokens.has(token))
            score += 18;
    for (const token of addressTokens)
        if (token.length >= 3 && entryTokens.has(token))
            score += 6;
    const topDir = normalizeText(entry.topDir);
    if (sectionKey === 'cafe' && topDir.includes('ca_phe'))
        score += 25;
    if (sectionKey === 'check_in' && topDir.includes('check_in'))
        score += 25;
    if (sectionKey === 'dich_vu' && topDir.includes('thue_xe'))
        score += 25;
    if (sectionKey === 'quan_an' && (topDir.includes('quan_an') || topDir.includes('dac_san')))
        score += 20;
    return score;
}
// ─── Image resolver factory ───────────────────────────────────────────────────
function resolveMappedImage(sectionKey, itemType, name, address, imageUrls, sequence, imageMapping, libraryEntries, workspaceRoot) {
    const mappingKey = itemMappingKey(sectionKey, name, address);
    const normalizedName = normalizeText(name);
    const normalizedAddress = normalizeText(address);
    const configuredLibraryRoots = getConfiguredLibraryRoots(imageMapping, workspaceRoot);
    const candidates = imageMapping.mappings.filter((entry) => {
        const entrySectionKey = normalizeText(entry.sectionKey ?? '');
        const entryName = normalizeText(entry.name ?? '');
        const entryAddress = normalizeText(entry.address ?? '');
        if (!entry.imagePath)
            return false;
        return ((!entrySectionKey || entrySectionKey === sectionKey) &&
            entryName === normalizedName &&
            (!entryAddress || entryAddress === normalizedAddress));
    });
    const selected = candidates[0];
    if (selected?.imagePath) {
        const rawImagePath = selected.imagePath.replaceAll('\\', '/').replace(/^\/+/, '');
        const [mappingRootKey, relativePath] = rawImagePath.includes('::')
            ? [rawImagePath.split('::')[0], rawImagePath.split('::').slice(1).join('::')]
            : ['main', rawImagePath];
        const libraryRoot = configuredLibraryRoots.find((e) => e.key === mappingRootKey)?.path ?? '';
        const libraryAbsolutePath = libraryRoot ? path.resolve(libraryRoot, relativePath) : '';
        const workspaceAbsolutePath = path.resolve(workspaceRoot, relativePath);
        const isFile = (p) => fs.existsSync(p) && fs.statSync(p).isFile();
        const isDir = (p) => fs.existsSync(p) && fs.statSync(p).isDirectory();
        // Check if it's a file
        if (libraryRoot && safeRelative(libraryRoot, libraryAbsolutePath) && isFile(libraryAbsolutePath)) {
            return {
                imageUrl: `/assets/library?root=${encodeURIComponent(mappingRootKey)}&path=${encodeURIComponent(relativePath)}`,
                imageMapped: true,
                imageMappingKey: mappingKey,
                imageSource: 'manual',
            };
        }
        if (libraryRoot && safeRelative(libraryRoot, libraryAbsolutePath) && isDir(libraryAbsolutePath)) {
            const files = imageFileNamesForDirectory(libraryAbsolutePath);
            if (files.length > 0) {
                const candidates = files.map(f => `/assets/library?root=${encodeURIComponent(mappingRootKey)}&path=${encodeURIComponent(path.join(relativePath, f).replaceAll('\\', '/'))}`);
                return {
                    imageUrl: candidates[sequence % candidates.length],
                    imageMapped: true,
                    imageMappingKey: mappingKey,
                    imageSource: 'manual',
                    candidateImageUrls: candidates,
                };
            }
        }
        if (safeRelative(workspaceRoot, workspaceAbsolutePath) && isFile(workspaceAbsolutePath)) {
            return {
                imageUrl: `/assets/workspace?path=${encodeURIComponent(relativePath)}`,
                imageMapped: true,
                imageMappingKey: mappingKey,
                imageSource: 'manual',
            };
        }
        if (safeRelative(workspaceRoot, workspaceAbsolutePath) && isDir(workspaceAbsolutePath)) {
            const files = imageFileNamesForDirectory(workspaceAbsolutePath);
            if (files.length > 0) {
                const candidates = files.map(f => `/assets/workspace?path=${encodeURIComponent(path.join(relativePath, f).replaceAll('\\', '/'))}`);
                return {
                    imageUrl: candidates[sequence % candidates.length],
                    imageMapped: true,
                    imageMappingKey: mappingKey,
                    imageSource: 'manual',
                    candidateImageUrls: candidates,
                };
            }
        }
    }
    const allowedKinds = allowedImageKindsForItem({ sectionKey, type: itemType, name });
    const exactAutoMatch = libraryEntries.find((entry) => {
        if (allowedKinds.size > 0 && !allowedKinds.has(topDirKind(entry.topDir)))
            return false;
        return entry.normalizedSubDir === normalizedName;
    });
    if (exactAutoMatch) {
        const assetUrls = preferredImageCandidates(name, exactAutoMatch.assetUrls);
        return {
            imageUrl: assetUrls[stableHash(`${sectionKey}:${name}:${sequence}`) % assetUrls.length],
            imageMapped: true,
            imageMappingKey: mappingKey,
            imageSource: 'auto',
            candidateImageUrls: assetUrls,
        };
    }
    const bestAutoMatch = libraryEntries
        .filter((entry) => allowedKinds.size === 0 || allowedKinds.has(topDirKind(entry.topDir)))
        .map((entry) => ({ entry, score: scoreImageLibraryMatch(sectionKey, name, address, entry) }))
        .sort((a, b) => b.score - a.score)[0];
    if (bestAutoMatch && bestAutoMatch.score >= 55) {
        const assetUrls = preferredImageCandidates(name, bestAutoMatch.entry.assetUrls);
        return {
            imageUrl: assetUrls[stableHash(`${sectionKey}:${name}:${sequence}`) % assetUrls.length],
            imageMapped: true,
            imageMappingKey: mappingKey,
            imageSource: 'auto',
            candidateImageUrls: assetUrls,
        };
    }
    const fallbackImage = imageUrls.length > 0
        ? imageUrls[stableHash(`${sectionKey}:${name}:${sequence}`) % imageUrls.length]
        : '';
    return { imageUrl: fallbackImage, imageMapped: false, imageMappingKey: mappingKey, imageSource: 'fallback' };
}
function createListImageResolver(imageUrls, libraryEntries, seed = '', initialUsedUrls = [], blockedUrls = []) {
    const softUsedUrls = new Set([...initialUsedUrls, ...blockedUrls].filter(Boolean));
    const sharedUsedUrlSets = [initialUsedUrls, blockedUrls].filter((urls) => urls instanceof Set);
    const localUsedUrls = new Set();
    const pickUnused = (candidates) => {
        if (candidates.length === 0)
            return '';
        const fresh = candidates.find((e) => e && !localUsedUrls.has(e) && !softUsedUrls.has(e));
        const previouslyUsed = candidates.find((e) => e && !localUsedUrls.has(e));
        const picked = fresh || previouslyUsed || '';
        if (picked) {
            localUsedUrls.add(picked);
            softUsedUrls.add(picked);
            sharedUsedUrlSets.forEach((urls) => urls.add(picked));
        }
        return picked;
    };
    return (item, options) => {
        const common = { candidateImageUrls: item.candidateImageUrls };
        if (!options?.forceFallback && item.imageSource === 'manual') {
            if (item.candidateImageUrls && item.candidateImageUrls.length > 0) {
                const sorted = preferredImageCandidates(item.name, item.candidateImageUrls).sort((a, b) => stableHash(`${seed}:${item.id}:${a}`) - stableHash(`${seed}:${item.id}:${b}`));
                const picked = pickUnused(sorted);
                if (picked)
                    return { ...common, imageUrl: picked, imageMapped: true, imageSource: 'manual', imageNote: 'Ảnh đã map đúng địa điểm (từ thư mục)' };
            }
            if (item.imageUrl && !shouldAvoidImageForItem(item.name, item.imageUrl) && !localUsedUrls.has(item.imageUrl)) {
                localUsedUrls.add(item.imageUrl);
                softUsedUrls.add(item.imageUrl);
                return { ...common, imageUrl: item.imageUrl, imageMapped: true, imageSource: 'manual', imageNote: 'Ảnh đã map đúng địa điểm' };
            }
        }
        if (!options?.forceFallback && item.imageSource === 'auto') {
            const candidates = item.candidateImageUrls && item.candidateImageUrls.length > 0
                ? item.candidateImageUrls
                : libraryEntries.find((e) => e.assetUrls.includes(item.imageUrl))?.assetUrls || [];
            if (candidates.length > 0) {
                const sortedUrls = preferredImageCandidates(item.name, candidates).sort((a, b) => stableHash(`${seed}:${item.id}:${a}`) - stableHash(`${seed}:${item.id}:${b}`));
                const picked = pickUnused(sortedUrls);
                if (picked)
                    return { ...common, imageUrl: picked, imageMapped: true, imageSource: 'auto', imageNote: 'Ảnh tự map đúng theo thư viện' };
            }
            if (item.imageUrl && !shouldAvoidImageForItem(item.name, item.imageUrl) && !localUsedUrls.has(item.imageUrl)) {
                localUsedUrls.add(item.imageUrl);
                softUsedUrls.add(item.imageUrl);
                return { ...common, imageUrl: item.imageUrl, imageMapped: true, imageSource: 'auto', imageNote: 'Ảnh tự map đúng theo thư viện' };
            }
        }
        const allowedKinds = allowedImageKindsForItem(item);
        const primaryGroupedLibraryUrls = libraryEntries
            .filter((e) => allowedKinds.size === 0 || allowedKinds.has(topDirKind(e.topDir)))
            .flatMap((e) => e.assetUrls);
        primaryGroupedLibraryUrls.sort((a, b) => stableHash(`${seed}:${item.id}:${a}`) - stableHash(`${seed}:${item.id}:${b}`));
        const expandedKinds = new Set(allowedKinds);
        if (item.sectionKey === 'quan_an') {
            if (allowedKinds.has('food_breakfast'))
                expandedKinds.add('food_lunch');
            if (!allowedKinds.has('food_dinner'))
                expandedKinds.delete('food_dinner');
            expandedKinds.add('specialty');
        }
        const backupGroupedLibraryUrls = libraryEntries
            .filter((e) => expandedKinds.size === 0 || expandedKinds.has(topDirKind(e.topDir)))
            .flatMap((e) => e.assetUrls)
            .filter((e) => !primaryGroupedLibraryUrls.includes(e));
        backupGroupedLibraryUrls.sort((a, b) => stableHash(`${seed}:${item.id}:backup:${a}`) - stableHash(`${seed}:${item.id}:backup:${b}`));
        const groupedLibraryUrls = preferredImageCandidates(item.name, [...primaryGroupedLibraryUrls, ...backupGroupedLibraryUrls]);
        const libraryUrl = pickUnused(groupedLibraryUrls);
        if (libraryUrl)
            return { imageUrl: libraryUrl, imageMapped: false, imageSource: 'fallback', imageNote: 'Ảnh minh họa cùng nhóm nội dung' };
        const allLibraryUrls = libraryEntries
            .flatMap((e) => e.assetUrls)
            .filter((url) => !groupedLibraryUrls.includes(url));
        const preferredAllLibraryUrls = preferredImageCandidates(item.name, allLibraryUrls);
        preferredAllLibraryUrls.sort((a, b) => stableHash(`${seed}:${item.id}:all:${a}`) - stableHash(`${seed}:${item.id}:all:${b}`));
        const allLibraryUrl = pickUnused(preferredAllLibraryUrls);
        if (allLibraryUrl)
            return { imageUrl: allLibraryUrl, imageMapped: false, imageSource: 'fallback', imageNote: 'Ảnh minh họa' };
        const fallbackCandidates = [...imageUrls];
        fallbackCandidates.sort((a, b) => stableHash(`${seed}:${item.id}:${a}`) - stableHash(`${seed}:${item.id}:${b}`));
        const fallbackUrl = pickUnused(fallbackCandidates);
        return { imageUrl: fallbackUrl, imageMapped: false, imageSource: 'fallback', imageNote: 'Ảnh minh họa, chưa map đúng địa điểm' };
    };
}
