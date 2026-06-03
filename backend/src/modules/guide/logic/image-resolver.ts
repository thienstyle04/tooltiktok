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
} from '../../../common/interfaces/guide.types';

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

function imageFileNamesForDirectory(directory: string): string[] {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) return [];
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
    if (!normalizedPath) return;
    let resolvedPath = path.isAbsolute(normalizedPath)
      ? path.resolve(normalizedPath)
      : path.resolve(workspaceRoot, normalizedPath);

    if (!fs.existsSync(resolvedPath)) {
      const fallbackPath = path.resolve(workspaceRoot, 'data/images/library', path.basename(normalizedPath));
      if (fs.existsSync(fallbackPath) && fs.statSync(fallbackPath).isDirectory()) {
        resolvedPath = fallbackPath;
      }
    }

    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) return;
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
  if (
    normalized.includes('nha_xe') ||
    normalized.includes('xe_khach') ||
    normalized.includes('limousine') ||
    normalized.includes('phuong_trang') ||
    normalized.includes('futa')
  ) return 'bus';
  if (normalized.includes('spa') || normalized.includes('goi_dau') || normalized.includes('massage')) return 'spa';
  if (
    normalized.includes('thue_do') ||
    normalized.includes('trang_phuc') ||
    normalized.includes('ao_dai') ||
    normalized.includes('hanbok')
  ) return 'outfit';
  if (
    normalized.includes('choi_dem') ||
    normalized.includes('bar') ||
    normalized.includes('lounge') ||
    normalized.includes('pub') ||
    normalized.includes('club')
  ) return 'nightlife';
  if (normalized.includes('check_in')) return 'checkin';
  return 'other';
}

function serviceImageKindFromText(value: string): string | null {
  const normalized = normalizeText(value);
  if (
    normalized.includes('nha_xe') ||
    normalized.includes('xe_khach') ||
    normalized.includes('limousine') ||
    normalized.includes('phuong_trang') ||
    normalized.includes('futa')
  ) return 'bus';
  if (normalized.includes('spa') || normalized.includes('goi_dau') || normalized.includes('massage')) return 'spa';
  if (
    normalized.includes('thue_do') ||
    normalized.includes('trang_phuc') ||
    normalized.includes('ao_dai') ||
    normalized.includes('hanbok')
  ) return 'outfit';
  if (normalized.includes('thue_xe') || normalized.includes('xe_may') || normalized.includes('dat_xe')) return 'rental';
  if (normalized.includes('dac_san') || normalized.includes('qua')) return 'specialty';
  if (
    normalized.includes('choi_dem') ||
    normalized.includes('bar') ||
    normalized.includes('lounge') ||
    normalized.includes('pub') ||
    normalized.includes('club')
  ) return 'nightlife';
  return null;
}

function decodedAssetPath(url: string): string {
  try {
    const parsed = new URL(url, 'http://local');
    return decodeURIComponent(parsed.searchParams.get('path') || url).toLowerCase();
  } catch {
    try {
      return decodeURIComponent(url).toLowerCase();
    } catch {
      return String(url || '').toLowerCase();
    }
  }
}

function shouldAvoidImageForItem(name: string, url: string): boolean {
  const normalizedName = normalizeText(name);
  const assetPath = decodedAssetPath(url);
  if (normalizedName.includes('the_florest') && assetPath.includes('img_8544.jpg')) return true;
  return false;
}

function preferredImageCandidates(name: string, urls: string[]): string[] {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  const preferred = unique.filter((url) => !shouldAvoidImageForItem(name, url));
  return preferred.length > 0 ? preferred : unique;
}

type ImageDimensions = { width: number; height: number };

type ListImageResolverOptions = {
  orientation?: 'any' | 'landscape' | 'portrait';
  workspaceRoot?: string;
  dalatImageDir?: string;
};

const imageDimensionsCache = new Map<string, ImageDimensions | null>();

function readImageDimensions(filePath: string): ImageDimensions | null {
  const cached = imageDimensionsCache.get(filePath);
  if (cached !== undefined) return cached;

  let result: ImageDimensions | null = null;
  try {
    const stats = fs.statSync(filePath);
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(Math.min(stats.size, 512 * 1024));
    try {
      fs.readSync(fd, buffer, 0, buffer.length, 0);
    } finally {
      fs.closeSync(fd);
    }
    if (buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
      result = { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    } else if (buffer.length >= 10 && buffer.toString('ascii', 0, 3) === 'GIF') {
      result = { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    } else if (buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
      const chunkType = buffer.toString('ascii', 12, 16);
      if (chunkType === 'VP8X') {
        result = {
          width: 1 + buffer.readUIntLE(24, 3),
          height: 1 + buffer.readUIntLE(27, 3),
        };
      } else if (chunkType === 'VP8 ') {
        result = { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
      } else if (chunkType === 'VP8L') {
        const bits = buffer.readUInt32LE(21);
        result = { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
    } else if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = buffer[offset + 1];
        if (marker === 0xd9 || marker === 0xda) break;
        const length = buffer.readUInt16BE(offset + 2);
        const isStartOfFrame = (
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf)
        );
        if (isStartOfFrame && offset + 8 < buffer.length) {
          result = { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
          break;
        }
        offset += 2 + Math.max(length, 2);
      }
    }
  } catch {
    result = null;
  }

  imageDimensionsCache.set(filePath, result);
  return result;
}

function localPathForAssetUrl(
  url: string,
  libraryEntries: ImageLibraryFolderEntry[],
  options: ListImageResolverOptions,
): string | null {
  try {
    const parsed = new URL(url, 'http://local');
    if (parsed.pathname === '/assets/library') {
      const rootKey = parsed.searchParams.get('root') || 'main';
      const relativePath = parsed.searchParams.get('path') || '';
      const libraryRoot = libraryEntries.find((entry) => entry.rootKey === rootKey)?.rootPath || '';
      if (!libraryRoot || !relativePath) return null;
      const target = path.resolve(libraryRoot, relativePath);
      return safeRelative(libraryRoot, target) && fs.existsSync(target) && fs.statSync(target).isFile() ? target : null;
    }
    if (parsed.pathname === '/assets/workspace') {
      const relativePath = parsed.searchParams.get('path') || '';
      if (!options.workspaceRoot || !relativePath) return null;
      const target = path.resolve(options.workspaceRoot, relativePath);
      return safeRelative(options.workspaceRoot, target) && fs.existsSync(target) && fs.statSync(target).isFile() ? target : null;
    }
    if (parsed.pathname.startsWith('/assets/dalat/')) {
      if (!options.dalatImageDir) return null;
      const fileName = decodeURIComponent(parsed.pathname.replace('/assets/dalat/', ''));
      const target = path.resolve(options.dalatImageDir, fileName);
      return safeRelative(options.dalatImageDir, target) && fs.existsSync(target) && fs.statSync(target).isFile() ? target : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function isLandscapeImageUrl(
  url: string,
  libraryEntries: ImageLibraryFolderEntry[],
  options: ListImageResolverOptions = {},
): boolean {
  const localPath = localPathForAssetUrl(url, libraryEntries, options);
  if (!localPath) return false;
  const dimensions = readImageDimensions(localPath);
  return !!dimensions && dimensions.width > dimensions.height;
}

export function isPortraitImageUrl(
  url: string,
  libraryEntries: ImageLibraryFolderEntry[],
  options: ListImageResolverOptions = {},
): boolean {
  const localPath = localPathForAssetUrl(url, libraryEntries, options);
  if (!localPath) return false;
  const dimensions = readImageDimensions(localPath);
  return !!dimensions && dimensions.height > dimensions.width;
}

function filterImageUrlsForResolverOptions(
  urls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  options: ListImageResolverOptions,
): string[] {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  if (options.orientation === 'landscape') {
    return unique.filter((url) => /^https?:\/\//i.test(url) || isLandscapeImageUrl(url, libraryEntries, options));
  }
  if (options.orientation === 'portrait') {
    return unique.filter((url) => /^https?:\/\//i.test(url) || isPortraitImageUrl(url, libraryEntries, options));
  }
  return unique;
}

function preferImageUrlsForResolverOptions(
  urls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  options: ListImageResolverOptions,
): string[] {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  const filtered = filterImageUrlsForResolverOptions(unique, libraryEntries, options);
  return filtered.length > 0 ? filtered : unique;
}

export function allowedImageKindsForItem(item: { sectionKey: SectionKey; type: string; name: string }): Set<string> {
  const allowed = new Set<string>();
  const normalizedType = normalizeText(item.type);
  const normalizedName = normalizeText(item.name);
  if (item.sectionKey === 'cafe') {
    allowed.add('cafe');
  } else if (item.sectionKey === 'check_in') {
    allowed.add('checkin');
  } else if (item.sectionKey === 'khu_du_lich' || item.sectionKey === 'dia_diem_lich_su' || item.sectionKey === 'hoat_dong') {
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
    const serviceKind = serviceImageKindFromText(`${normalizedType} ${normalizedName}`);
    if (serviceKind) allowed.add(serviceKind);
    if (normalizedType.includes('thue_xe') || normalizedName.includes('thue_xe')) allowed.add('rental');
    if (
      normalizedType.includes('dac_san') ||
      normalizedName.includes('dac_san') ||
      normalizedName.includes('qua')
    ) allowed.add('specialty');
  } else if (item.sectionKey === 'choi_dem') {
    allowed.add('nightlife');
    allowed.add('cafe');
    allowed.add('food_dinner');
    allowed.add('checkin');
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
  const kind = topDirKind(entry.topDir);
  if (sectionKey === 'cafe' && topDir.includes('ca_phe')) score += 25;
  if ((sectionKey === 'check_in' || sectionKey === 'khu_du_lich' || sectionKey === 'dia_diem_lich_su' || sectionKey === 'hoat_dong') && topDir.includes('check_in')) score += 25;
  if (sectionKey === 'dich_vu' && ['rental', 'specialty', 'bus', 'spa', 'outfit', 'nightlife'].includes(kind)) score += 25;
  if (sectionKey === 'choi_dem' && (['nightlife', 'cafe', 'food_dinner', 'checkin'].includes(kind))) score += 15;
  if (sectionKey === 'quan_an' && (topDir.includes('quan_an') || topDir.includes('dac_san'))) score += 20;

  const serviceKind = serviceImageKindFromText(`${normalizedName} ${normalizedAddress}`);
  if (sectionKey === 'dich_vu' && serviceKind && serviceKind === kind) score += 20;

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
    if (allowedKinds.size > 0 && !allowedKinds.has(topDirKind(entry.topDir))) return false;
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

export function createListImageResolver(
  imageUrls: string[],
  libraryEntries: ImageLibraryFolderEntry[],
  seed = '',
  initialUsedUrls: Iterable<string> = [],
  blockedUrls: Iterable<string> = [],
  resolverOptions: ListImageResolverOptions = {},
) {
  const softUsedUrls = new Set<string>([...initialUsedUrls, ...blockedUrls].filter(Boolean));
  const sharedUsedUrlSets = [initialUsedUrls, blockedUrls].filter((urls): urls is Set<string> => urls instanceof Set);
  const localUsedUrls = new Set<string>();

  const rememberPicked = (picked: string): string => {
    if (picked) {
      localUsedUrls.add(picked);
      softUsedUrls.add(picked);
      sharedUsedUrlSets.forEach((urls) => urls.add(picked));
    }
    return picked;
  };

  const pickUnused = (candidates: string[]): string => {
    if (candidates.length === 0) return '';
    const fresh = candidates.find((e) => e && !localUsedUrls.has(e) && !softUsedUrls.has(e));
    const previouslyUsed = candidates.find((e) => e && !localUsedUrls.has(e));
    const picked = fresh || previouslyUsed || '';
    return rememberPicked(picked);
  };

  return (
    item: GuideItem,
    options?: { forceFallback?: boolean },
  ): Pick<PageItem, 'imageUrl' | 'imageMapped' | 'imageSource' | 'imageNote' | 'candidateImageUrls'> => {
    const common = { candidateImageUrls: item.candidateImageUrls };

    if (!options?.forceFallback && item.imageSource === 'manual') {
      const manualCandidates = preferImageUrlsForResolverOptions(
        preferredImageCandidates(
          item.name,
          item.candidateImageUrls && item.candidateImageUrls.length > 0
            ? item.candidateImageUrls
            : (item.imageUrl ? [item.imageUrl] : []),
        ),
        libraryEntries,
        resolverOptions,
      ).sort(
        (a, b) => stableHash(`${seed}:${item.id}:manual:${a}`) - stableHash(`${seed}:${item.id}:manual:${b}`),
      );
      const pickedManual = pickUnused(manualCandidates.filter((url) => url && !shouldAvoidImageForItem(item.name, url)));
      if (pickedManual) {
        return { ...common, imageUrl: pickedManual, imageMapped: true, imageSource: 'manual', imageNote: 'Ảnh đã map đúng địa điểm từ sheet' };
      }
      if (item.candidateImageUrls && item.candidateImageUrls.length > 0) {
        const sorted = preferImageUrlsForResolverOptions(
          preferredImageCandidates(item.name, item.candidateImageUrls),
          libraryEntries,
          resolverOptions,
        ).sort(
          (a, b) => stableHash(`${seed}:${item.id}:${a}`) - stableHash(`${seed}:${item.id}:${b}`),
        );
        const picked = pickUnused(sorted);
        if (picked) return { ...common, imageUrl: picked, imageMapped: true, imageSource: 'manual', imageNote: 'Ảnh đã map đúng địa điểm (từ thư mục)' };
      }
      if (
        item.imageUrl &&
        !shouldAvoidImageForItem(item.name, item.imageUrl) &&
        !localUsedUrls.has(item.imageUrl)
      ) {
        rememberPicked(item.imageUrl);
        return { ...common, imageUrl: item.imageUrl, imageMapped: true, imageSource: 'manual', imageNote: 'Ảnh đã map đúng địa điểm' };
      }
    }

    if (!options?.forceFallback && item.imageSource === 'auto') {
      const candidates = item.candidateImageUrls && item.candidateImageUrls.length > 0
        ? item.candidateImageUrls
        : libraryEntries.find((e) => e.assetUrls.includes(item.imageUrl))?.assetUrls || [];

      if (candidates.length > 0) {
        const sortedUrls = preferImageUrlsForResolverOptions(
          preferredImageCandidates(item.name, candidates),
          libraryEntries,
          resolverOptions,
        ).sort(
          (a, b) => stableHash(`${seed}:${item.id}:${a}`) - stableHash(`${seed}:${item.id}:${b}`),
        );
        const picked = pickUnused(sortedUrls);
        if (picked) return { ...common, imageUrl: picked, imageMapped: true, imageSource: 'auto', imageNote: 'Ảnh tự map đúng theo thư viện' };
      }
      if (
        item.imageUrl &&
        !shouldAvoidImageForItem(item.name, item.imageUrl) &&
        !localUsedUrls.has(item.imageUrl)
      ) {
        rememberPicked(item.imageUrl);
        return { ...common, imageUrl: item.imageUrl, imageMapped: true, imageSource: 'auto', imageNote: 'Ảnh tự map đúng theo thư viện' };
      }
    }

    const allowedKinds = allowedImageKindsForItem(item);
    const primaryGroupedLibraryUrls = libraryEntries
      .filter((e) => allowedKinds.size === 0 || allowedKinds.has(topDirKind(e.topDir)))
      .flatMap((e) => e.assetUrls);
    const primaryCandidates = filterImageUrlsForResolverOptions(primaryGroupedLibraryUrls, libraryEntries, resolverOptions);
    primaryCandidates.sort((a, b) => stableHash(`${seed}:${item.id}:${a}`) - stableHash(`${seed}:${item.id}:${b}`));

    const expandedKinds = new Set<string>(allowedKinds);
    if (item.sectionKey === 'quan_an') {
      if (allowedKinds.has('food_breakfast')) expandedKinds.add('food_lunch');
      if (!allowedKinds.has('food_dinner')) expandedKinds.delete('food_dinner');
      expandedKinds.add('specialty');
    }

    const backupGroupedLibraryUrls = libraryEntries
      .filter((e) => expandedKinds.size === 0 || expandedKinds.has(topDirKind(e.topDir)))
      .flatMap((e) => e.assetUrls)
      .filter((e) => !primaryCandidates.includes(e));
    const backupCandidates = filterImageUrlsForResolverOptions(backupGroupedLibraryUrls, libraryEntries, resolverOptions);
    backupCandidates.sort((a, b) =>
      stableHash(`${seed}:${item.id}:backup:${a}`) - stableHash(`${seed}:${item.id}:backup:${b}`),
    );

    const groupedLibraryUrls = preferredImageCandidates(item.name, [...primaryCandidates, ...backupCandidates]);
    const libraryUrl = pickUnused(groupedLibraryUrls);
    if (libraryUrl) return { imageUrl: libraryUrl, imageMapped: false, imageSource: 'fallback', imageNote: 'Ảnh minh họa cùng nhóm nội dung' };

    const fallbackKinds = expandedKinds.size > 0 ? expandedKinds : allowedKinds;
    const allLibraryUrls = libraryEntries
      .filter((e) => fallbackKinds.size === 0 || fallbackKinds.has(topDirKind(e.topDir)))
      .flatMap((e) => e.assetUrls)
      .filter((url) => !groupedLibraryUrls.includes(url));
    const preferredAllLibraryUrls = filterImageUrlsForResolverOptions(
      preferredImageCandidates(item.name, allLibraryUrls),
      libraryEntries,
      resolverOptions,
    );
    preferredAllLibraryUrls.sort((a, b) => stableHash(`${seed}:${item.id}:all:${a}`) - stableHash(`${seed}:${item.id}:all:${b}`));
    const allLibraryUrl = pickUnused(preferredAllLibraryUrls);
    if (allLibraryUrl) return { imageUrl: allLibraryUrl, imageMapped: false, imageSource: 'fallback', imageNote: 'Ảnh minh họa' };

    const fallbackCandidates = filterImageUrlsForResolverOptions([...imageUrls], libraryEntries, resolverOptions);
    fallbackCandidates.sort((a, b) => stableHash(`${seed}:${item.id}:${a}`) - stableHash(`${seed}:${item.id}:${b}`));
    const fallbackUrl = pickUnused(fallbackCandidates);
    return { imageUrl: fallbackUrl, imageMapped: false, imageSource: 'fallback', imageNote: 'Ảnh minh họa, chưa map đúng địa điểm' };
  };
}
