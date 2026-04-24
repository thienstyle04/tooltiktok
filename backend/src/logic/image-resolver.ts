// ─── Image resolving & library scanning helpers ───────────────────────────────
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NotFoundException } from '@nestjs/common';
import {
  GuideItem,
  ImageLibraryFolderEntry,
  ImageLibraryRootEntry,
  ImageMappingFile,
  PageItem,
  SectionKey,
} from '../core/types';

// ─── Pure utility helpers ─────────────────────────────────────────────────────

export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export function stableHash(seed: string): number {
  let result = 0;
  Array.from(seed).forEach((char, index) => {
    result = (result * 131 + char.charCodeAt(0) + index) % 2_147_483_647;
  });
  return result;
}

export function safeRelative(baseDir: string, targetPath: string): boolean {
  const relative = path.relative(path.resolve(baseDir), path.resolve(targetPath));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function firstValue(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = (row[key] ?? '').trim();
    if (value) return value;
  }
  return '';
}

export function itemMappingKey(sectionKey: SectionKey, name: string, address: string): string {
  return [sectionKey, normalizeText(name), normalizeText(address)].join('|');
}

export function extractFirstNumber(fileName: string): number {
  const match = fileName.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

export function readAssetFromBase(baseDir: string, fileName: string): Buffer {
  const target = path.join(baseDir, fileName);
  if (!safeRelative(baseDir, target) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    throw new NotFoundException('Asset not found.');
  }
  return fs.readFileSync(target);
}

export function imageUrlsForDirectory(directory: string, routePrefix: string): string[] {
  if (!fs.existsSync(directory)) return [];
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

// ─── Image library ────────────────────────────────────────────────────────────

export function getImageLibraryRoot(workspaceRoot: string): string | null {
  const parentRoot = path.dirname(workspaceRoot);
  if (!fs.existsSync(parentRoot)) return null;

  const archiveRoot = fs
    .readdirSync(parentRoot, { withFileTypes: true })
    .find((e) => e.isDirectory() && normalizeText(e.name).startsWith('hinh nen dep'));
  if (!archiveRoot) return null;

  const archivePath = path.join(parentRoot, archiveRoot.name);
  const innerRoot = fs
    .readdirSync(archivePath, { withFileTypes: true })
    .find((e) => e.isDirectory() && normalizeText(e.name).includes('hinh nen dep'));

  return innerRoot ? path.join(archivePath, innerRoot.name) : null;
}

export function getConfiguredLibraryRoots(
  imageMapping: ImageMappingFile,
  workspaceRoot: string,
): ImageLibraryRootEntry[] {
  const results: ImageLibraryRootEntry[] = [];
  const seenPaths = new Set<string>();

  const addRoot = (key: string, targetPath: string): void => {
    const normalizedPath = String(targetPath ?? '').trim();
    if (!normalizedPath || !fs.existsSync(normalizedPath) || !fs.statSync(normalizedPath).isDirectory()) return;
    const resolvedPath = path.resolve(normalizedPath);
    if (seenPaths.has(resolvedPath)) return;
    seenPaths.add(resolvedPath);
    results.push({ key, path: resolvedPath });
  };

  addRoot('main', imageMapping.libraryRoot || getImageLibraryRoot(workspaceRoot) || '');

  for (const extraRoot of imageMapping.extraLibraryRoots ?? []) {
    const rawPath = String(extraRoot ?? '').trim();
    if (!rawPath) continue;
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

export function buildImageLibraryEntries(
  imageMapping: ImageMappingFile,
  workspaceRoot: string,
): ImageLibraryFolderEntry[] {
  const libraryRoots = getConfiguredLibraryRoots(imageMapping, workspaceRoot);
  if (libraryRoots.length === 0) return [];

  const results: ImageLibraryFolderEntry[] = [];
  const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.jfif']);

  const pushEntry = (root: ImageLibraryRootEntry, topDirName: string, subDirName: string, subPath: string): void => {
    const images = fs
      .readdirSync(subPath)
      .filter((e) => imageExtensions.has(path.extname(e).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, 'vi'));
    if (images.length === 0) return;
    const relativeDir = path.relative(root.path, subPath).replaceAll('\\', '/');
    results.push({
      rootKey: root.key,
      rootPath: root.path,
      topDir: topDirName,
      subDir: subDirName,
      relativeDir,
      normalizedSubDir: normalizeText(subDirName),
      assetUrls: images.map(
        (img) =>
          `/assets/library?root=${encodeURIComponent(root.key)}&path=${encodeURIComponent(
            path.join(relativeDir, img).replaceAll('\\', '/'),
          )}`,
      ),
    });
  };

  for (const root of libraryRoots) {
    for (const firstLevelDir of fs.readdirSync(root.path, { withFileTypes: true })) {
      if (!firstLevelDir.isDirectory()) continue;
      const firstLevelPath = path.join(root.path, firstLevelDir.name);
      pushEntry(root, path.basename(root.path), firstLevelDir.name, firstLevelPath);
      for (const secondLevelDir of fs.readdirSync(firstLevelPath, { withFileTypes: true })) {
        if (!secondLevelDir.isDirectory()) continue;
        pushEntry(root, firstLevelDir.name, secondLevelDir.name, path.join(firstLevelPath, secondLevelDir.name));
      }
    }
  }
  return results;
}

// ─── Image matching / scoring ─────────────────────────────────────────────────

function isGenericToken(token: string): boolean {
  return new Set([
    'banh', 'bun', 'pho', 'mi', 'lau', 'com', 'nem', 'quan', 'tiem', 'cafe', 'coffee',
    'tra', 'ga', 'bo', 'nuong', 'an', 'uong', 'home', 'hotel', 'homestay', 'check', 'in',
    'duong', 'doc', 'ho', 'kdl', 'xe', 'thue', 'tour', 'spa', 'land', 'dalat', 'da', 'lat',
  ]).has(token);
}

export function topDirKind(topDir: string): string {
  const normalized = normalizeText(topDir);
  if (
    normalized.includes('ca_phe') ||
    normalized.includes('quan_cafe') ||
    normalized.includes('cafe_check_in') ||
    normalized.includes('cafe_local') ||
    normalized.includes('nhom_cafe')
  ) return 'cafe';
  if (normalized.includes('quan_an_sang')) return 'food_breakfast';
  if (normalized.includes('quan_an_trua')) return 'food_lunch';
  if (normalized.includes('quan_an_toi')) return 'food_dinner';
  if (normalized.includes('dac_san')) return 'specialty';
  if (normalized.includes('thue_xe')) return 'rental';
  if (normalized.includes('check_in')) return 'checkin';
  return 'other';
}

export function allowedImageKindsForItem(item: { sectionKey: SectionKey; type: string; name: string }): Set<string> {
  const allowed = new Set<string>();
  const normalizedType = normalizeText(item.type);
  const normalizedName = normalizeText(item.name);
  if (item.sectionKey === 'cafe') {
    allowed.add('cafe');
  } else if (item.sectionKey === 'check_in') {
    allowed.add('checkin');
  } else if (item.sectionKey === 'quan_an') {
    if (normalizedType.includes('sang')) {
      allowed.add('food_breakfast');
      allowed.add('food_lunch');
    } else if (normalizedType.includes('trua')) {
      allowed.add('food_lunch');
    } else if (normalizedType.includes('toi')) {
      allowed.add('food_dinner');
    } else {
      allowed.add('food_breakfast');
      allowed.add('food_lunch');
      allowed.add('specialty');
    }
  } else if (item.sectionKey === 'dich_vu') {
    if (normalizedType.includes('thue_xe') || normalizedName.includes('thue_xe')) allowed.add('rental');
    if (
      normalizedType.includes('dac_san') ||
      normalizedName.includes('dac_san') ||
      normalizedName.includes('qua')
    ) allowed.add('specialty');
  }
  return allowed;
}

export function scoreImageLibraryMatch(
  sectionKey: SectionKey,
  name: string,
  address: string,
  entry: ImageLibraryFolderEntry,
): number {
  const normalizedName = normalizeText(name);
  const normalizedAddress = normalizeText(address);
  const nameTokens = new Set(normalizedName.split('_').filter(Boolean));
  const addressTokens = new Set(normalizedAddress.split('_').filter(Boolean));
  const entryTokens = new Set(entry.normalizedSubDir.split('_').filter(Boolean));

  let score = 0;
  if (entry.normalizedSubDir === normalizedName) score += 100;
  else if (entry.normalizedSubDir.includes(normalizedName) || normalizedName.includes(entry.normalizedSubDir)) score += 70;
  for (const token of nameTokens) if (token.length >= 3 && entryTokens.has(token)) score += 18;
  for (const token of addressTokens) if (token.length >= 3 && entryTokens.has(token)) score += 6;

  const topDir = normalizeText(entry.topDir);
  if (sectionKey === 'cafe' && topDir.includes('ca_phe')) score += 25;
  if (sectionKey === 'check_in' && topDir.includes('check_in')) score += 25;
  if (sectionKey === 'dich_vu' && topDir.includes('thue_xe')) score += 25;
  if (sectionKey === 'quan_an' && (topDir.includes('quan_an') || topDir.includes('dac_san'))) score += 20;

  return score;
}

// ─── Image resolver factory ───────────────────────────────────────────────────

export function resolveMappedImage(
  sectionKey: SectionKey,
  itemType: string,
  name: string,
  address: string,
  imageUrls: string[],
  sequence: number,
  imageMapping: ImageMappingFile,
  libraryEntries: ImageLibraryFolderEntry[],
  workspaceRoot: string,
): { imageUrl: string; imageMapped: boolean; imageMappingKey: string; imageSource: 'manual' | 'auto' | 'fallback'; candidateImageUrls?: string[] } {
  const mappingKey = itemMappingKey(sectionKey, name, address);
  const normalizedName = normalizeText(name);
  const normalizedAddress = normalizeText(address);
  const configuredLibraryRoots = getConfiguredLibraryRoots(imageMapping, workspaceRoot);

  const candidates = imageMapping.mappings.filter((entry) => {
    const entrySectionKey = normalizeText(entry.sectionKey ?? '');
    const entryName = normalizeText(entry.name ?? '');
    const entryAddress = normalizeText(entry.address ?? '');
    if (!entry.imagePath) return false;
    return (
      (!entrySectionKey || entrySectionKey === sectionKey) &&
      entryName === normalizedName &&
      (!entryAddress || entryAddress === normalizedAddress)
    );
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

    const isFile = (p: string) => fs.existsSync(p) && fs.statSync(p).isFile();
    const isDir = (p: string) => fs.existsSync(p) && fs.statSync(p).isDirectory();

    // Check if it's a file
    if (libraryRoot && safeRelative(libraryRoot, libraryAbsolutePath) && isFile(libraryAbsolutePath)) {
      return {
        imageUrl: `/assets/library?root=${encodeURIComponent(mappingRootKey)}&path=${encodeURIComponent(relativePath)}`,
        imageMapped: true,
        imageMappingKey: mappingKey,
        imageSource: 'manual',
      };
    }

    // Check if it's a directory
    if (libraryRoot && safeRelative(libraryRoot, libraryAbsolutePath) && isDir(libraryAbsolutePath)) {
      const ext = new Set(['.jpg', '.jpeg', '.png', '.webp']);
      const files = fs.readdirSync(libraryAbsolutePath)
        .filter(f => ext.has(path.extname(f).toLowerCase()))
        .sort();
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
  }

  const allowedKinds = allowedImageKindsForItem({ sectionKey, type: itemType, name });

  const exactAutoMatch = libraryEntries.find((entry) => {
    if (allowedKinds.size > 0 && !allowedKinds.has(topDirKind(entry.topDir))) return false;
    return entry.normalizedSubDir === normalizedName;
  });

  if (exactAutoMatch) {
    return {
      imageUrl: exactAutoMatch.assetUrls[stableHash(`${sectionKey}:${name}:${sequence}`) % exactAutoMatch.assetUrls.length],
      imageMapped: true,
      imageMappingKey: mappingKey,
      imageSource: 'auto',
      candidateImageUrls: exactAutoMatch.assetUrls,
    };
  }

  const bestAutoMatch = libraryEntries
    .filter((entry) => allowedKinds.size === 0 || allowedKinds.has(topDirKind(entry.topDir)))
    .map((entry) => ({ entry, score: scoreImageLibraryMatch(sectionKey, name, address, entry) }))
    .sort((a, b) => b.score - a.score)[0];

  if (bestAutoMatch && bestAutoMatch.score >= 55) {
    return {
      imageUrl: bestAutoMatch.entry.assetUrls[stableHash(`${sectionKey}:${name}:${sequence}`) % bestAutoMatch.entry.assetUrls.length],
      imageMapped: true,
      imageMappingKey: mappingKey,
      imageSource: 'auto',
      candidateImageUrls: bestAutoMatch.entry.assetUrls,
    };
  }

  const fallbackImage = imageUrls.length > 0
    ? imageUrls[stableHash(`${sectionKey}:${name}:${sequence}`) % imageUrls.length]
    : '';
  return { imageUrl: fallbackImage, imageMapped: false, imageMappingKey: mappingKey, imageSource: 'fallback' };
}

export function createListImageResolver(
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seed = '',
  initialUsedUrls: string[] = [],
) {
  const usedUrls = new Set<string>(initialUsedUrls.filter(Boolean));
  let exhaustCounter = 0;

  const pickUnused = (candidates: string[]): string => {
    if (candidates.length === 0) return '';
    const fresh = candidates.find((e) => !usedUrls.has(e));
    if (fresh) { usedUrls.add(fresh); return fresh; }
    exhaustCounter += 1;
    return candidates[exhaustCounter % candidates.length];
  };

  return (
    item: GuideItem,
    options?: { forceFallback?: boolean },
  ): Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'> => {
    const common = { candidateImageUrls: item.candidateImageUrls };

    if (!options?.forceFallback && item.imageSource === 'manual') {
      if (item.candidateImageUrls && item.candidateImageUrls.length > 0) {
        const sorted = [...item.candidateImageUrls].sort(
          (a, b) => stableHash(`${seed}:${item.id}:${a}`) - stableHash(`${seed}:${item.id}:${b}`),
        );
        const picked = pickUnused(sorted);
        if (picked) return { ...common, imageUrl: picked, imageMapped: true, imageSource: 'manual', imageNote: 'Ảnh đã map đúng địa điểm (từ thư mục)' };
      }
      usedUrls.add(item.imageUrl);
      return { ...common, imageUrl: item.imageUrl, imageMapped: true, imageSource: 'manual', imageNote: 'Ảnh đã map đúng địa điểm' };
    }

    if (!options?.forceFallback && item.imageSource === 'auto') {
      const candidates = item.candidateImageUrls && item.candidateImageUrls.length > 0
        ? item.candidateImageUrls
        : libraryEntries.find((e) => e.assetUrls.includes(item.imageUrl))?.assetUrls || [];

      if (candidates.length > 0) {
        const sortedUrls = [...candidates].sort(
          (a, b) => stableHash(`${seed}:${item.id}:${a}`) - stableHash(`${seed}:${item.id}:${b}`),
        );
        const picked = pickUnused(sortedUrls);
        if (picked) return { ...common, imageUrl: picked, imageMapped: true, imageSource: 'auto', imageNote: 'Ảnh tự map đúng theo thư viện' };
      }
      usedUrls.add(item.imageUrl);
      return { ...common, imageUrl: item.imageUrl, imageMapped: true, imageSource: 'auto', imageNote: 'Ảnh tự map đúng theo thư viện' };
    }

    const allowedKinds = allowedImageKindsForItem(item);
    const primaryGroupedLibraryUrls = libraryEntries
      .filter((e) => allowedKinds.size === 0 || allowedKinds.has(topDirKind(e.topDir)))
      .flatMap((e) => e.assetUrls);
    primaryGroupedLibraryUrls.sort((a, b) => stableHash(`${seed}:${item.id}:${a}`) - stableHash(`${seed}:${item.id}:${b}`));

    const expandedKinds = new Set<string>(allowedKinds);
    if (item.sectionKey === 'quan_an') {
      if (allowedKinds.has('food_breakfast')) expandedKinds.add('food_lunch');
      if (!allowedKinds.has('food_dinner')) expandedKinds.delete('food_dinner');
      expandedKinds.add('specialty');
    }

    const backupGroupedLibraryUrls = libraryEntries
      .filter((e) => expandedKinds.size === 0 || expandedKinds.has(topDirKind(e.topDir)))
      .flatMap((e) => e.assetUrls)
      .filter((e) => !primaryGroupedLibraryUrls.includes(e));
    backupGroupedLibraryUrls.sort((a, b) =>
      stableHash(`${seed}:${item.id}:backup:${a}`) - stableHash(`${seed}:${item.id}:backup:${b}`),
    );

    const groupedLibraryUrls = [...primaryGroupedLibraryUrls, ...backupGroupedLibraryUrls];
    const libraryUrl = pickUnused(groupedLibraryUrls);
    if (libraryUrl) return { imageUrl: libraryUrl, imageMapped: false, imageSource: 'fallback', imageNote: 'Ảnh minh họa cùng nhóm nội dung' };

    const allLibraryUrls = libraryEntries
      .flatMap((e) => e.assetUrls)
      .filter((url) => !groupedLibraryUrls.includes(url));
    allLibraryUrls.sort((a, b) => stableHash(`${seed}:${item.id}:all:${a}`) - stableHash(`${seed}:${item.id}:all:${b}`));
    const allLibraryUrl = pickUnused(allLibraryUrls);
    if (allLibraryUrl) return { imageUrl: allLibraryUrl, imageMapped: false, imageSource: 'fallback', imageNote: 'Ảnh minh họa' };

    const fallbackCandidates = [...imageUrls];
    fallbackCandidates.sort((a, b) => stableHash(`${seed}:${item.id}:${a}`) - stableHash(`${seed}:${item.id}:${b}`));
    return { imageUrl: pickUnused(fallbackCandidates), imageMapped: false, imageSource: 'fallback', imageNote: 'Ảnh minh họa, chưa map đúng địa điểm' };
  };
}
