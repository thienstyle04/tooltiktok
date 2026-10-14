// ─── Phục vụ file tĩnh, ảnh và cache Drive cho GuideService ───────────────────
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ImageMappingFile } from '../../common/interfaces/guide.types';
import { getColorEditAsset, COLOR_EDIT_PRESET } from './color-edit';
import { getConfiguredLibraryRoots, readAssetFromBase, safeRelative } from './logic/image-resolver';
import { DriveFileAsset, fetchDriveFileAsset, listUncachedDriveFileIds, verifyDriveFileCache, warmDriveFileDiskCache } from './sync/drive-images';
import { withLocalDataOnly } from './sync/night-sync-policy';

/**
 * Những gì GuideAssetService cần từ GuideService. Mỗi giá trị được đọc lại ở
 * mỗi lần gọi: test và quá trình chạy có thể đổi đường dẫn hoặc thay
 * getDriveFileAsset trên instance GuideService.
 */
export interface GuideAssetHost {
  toolRoot(): string;
  frontendRoot(): string;
  workspaceRoot(): string;
  dataRoot(): string;
  dalatImageDir(): string;
  tiktokReferenceDir(): string;
  loadImageMapping(allowLegacyAssets: boolean): ImageMappingFile;
  getDriveFileAsset(fileId: string): Promise<DriveFileAsset>;
  driveCacheConcurrency(configured: number, max: number): number;
  runDriveTask<T>(concurrency: number, task: () => Promise<T>): Promise<T>;
}

const MIME_BY_EXTENSION: Record<string, string> = {
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

export class GuideAssetService {
  constructor(private readonly host: GuideAssetHost) {}

  // ─── Static file serving ──────────────────────────────────────────────────

  getToolTextFile(fileName: string): string {
    return this.readFileInside(this.host.toolRoot(), fileName, 'Tool').toString('utf-8');
  }

  getToolBinaryFile(fileName: string): Buffer {
    return this.readFileInside(this.host.toolRoot(), fileName, 'Tool');
  }

  getFrontendTextFile(fileName: string): string {
    return this.readFileInside(this.host.frontendRoot(), fileName, 'Frontend').toString('utf-8');
  }

  getFrontendBinaryFile(fileName: string): Buffer {
    return this.readFileInside(this.host.frontendRoot(), fileName, 'Frontend');
  }

  guessMime(fileName: string): string {
    return MIME_BY_EXTENSION[path.extname(fileName).toLowerCase()] ?? 'application/octet-stream';
  }

  // ─── Asset serving ────────────────────────────────────────────────────────

  getDalatAsset(fileName: string): Buffer {
    return readAssetFromBase(this.host.dalatImageDir(), fileName);
  }

  getTiktokAsset(folderName: string, fileName: string): Buffer {
    const referenceDir = this.host.tiktokReferenceDir();
    const folder = path.join(referenceDir, folderName);
    // Tên thư mục cũng phải nằm trong thư mục ảnh TikTok (chặn "..").
    if (!safeRelative(referenceDir, folder)) throw new NotFoundException('Asset not found.');
    return readAssetFromBase(folder, fileName);
  }

  getWorkspaceAsset(relativePath: string): Buffer {
    if (!relativePath) throw new NotFoundException('Asset path is required.');
    return readAssetFromBase(this.host.workspaceRoot(), relativePath);
  }

  getLibraryAsset(relativePath: string, rootKey = 'main'): Buffer {
    // Preserve immutable library assets referenced by saved custom-source lists;
    // the Test generation pool still excludes this library.
    const imageMapping = this.host.loadImageMapping(true);
    const libraryRoot = getConfiguredLibraryRoots(imageMapping, this.host.workspaceRoot()).find((e) => e.key === rootKey)?.path ?? '';
    if (!libraryRoot) throw new NotFoundException('Image library root not found.');
    if (!relativePath) throw new NotFoundException('Asset path is required.');
    return readAssetFromBase(libraryRoot, relativePath);
  }

  async getDriveFileAsset(fileId: string): Promise<DriveFileAsset> {
    const normalizedFileId = String(fileId ?? '').trim();
    if (!normalizedFileId) {
      throw new NotFoundException('Drive file id is required.');
    }
    return withLocalDataOnly(() => fetchDriveFileAsset(normalizedFileId));
  }

  async getColorEditedAsset(source: string, preset: string): Promise<Buffer> {
    if (preset !== COLOR_EDIT_PRESET) throw new BadRequestException('Bộ màu không được hỗ trợ.');
    if (!source?.startsWith('/assets/') || source.startsWith('//')) throw new BadRequestException('Ảnh phải nằm trong cache cục bộ.');
    const url = new URL(source, 'http://localhost');
    let body: Buffer;
    if (url.pathname === '/assets/drive-file') {
      const asset = await this.host.getDriveFileAsset(url.searchParams.get('id') || '');
      if (asset.isFallback) throw new BadRequestException('Không thể chỉnh màu: ảnh gốc chưa có cache hợp lệ.');
      body = asset.body;
    } else if (url.pathname === '/assets/library') body = this.getLibraryAsset(url.searchParams.get('path') || '', url.searchParams.get('root') || 'main');
    else if (url.pathname === '/assets/workspace') body = this.getWorkspaceAsset(url.searchParams.get('path') || '');
    else if (/^\/assets\/dalat\/[^/]+$/.test(url.pathname)) body = this.getDalatAsset(decodeURIComponent(url.pathname.split('/')[3]));
    else if (/^\/assets\/tiktok\/[^/]+\/[^/]+$/.test(url.pathname)) body = this.getTiktokAsset(decodeURIComponent(url.pathname.split('/')[3]), decodeURIComponent(url.pathname.split('/')[4]));
    else throw new BadRequestException('Nguồn ảnh không được hỗ trợ cho bộ màu.');
    try { return await getColorEditAsset(body, this.host.dataRoot(), preset); }
    catch { throw new BadRequestException('Không thể xử lý ảnh Color Edit. Hãy kiểm tra ảnh và thử lại; ảnh gốc vẫn được giữ nguyên.'); }
  }

  /**
   * Kiểm tra nhanh disk cache (không tải mạng) — FE dùng để bỏ prefetch khi đã đủ ảnh.
   */
  async getDriveFilesCacheStatus(fileIds: string[]) {
    const ids = [...new Set((fileIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
    const images = await verifyDriveFileCache(ids);
    const missing = images.filter(image => image.status !== 'valid').map(image => image.id);
    return {
      total: ids.length,
      cached: ids.length - missing.length,
      missing,
      images,
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
    await verifyDriveFileCache(ids);
    const missing = listUncachedDriveFileIds(ids);
    if (!missing.length) {
      console.log(`[drive-cache] Prefetch bỏ qua — đủ cache disk (${ids.length}/${ids.length}).`);
      return { total: ids.length, skipped: ids.length, ok: 0, fail: 0, cancelled: false };
    }
    const concurrency = this.host.driveCacheConcurrency(Number(process.env.DALAT_DRIVE_CACHE_CONCURRENCY || 3), 5);
    console.log(`[drive-cache] Prefetch ${missing.length}/${ids.length} ảnh còn thiếu (concurrency=${concurrency})...`);
    const warmed = await warmDriveFileDiskCache(missing, {
      concurrency,
      runTask: (task) => this.host.runDriveTask(concurrency, task),
    });
    return {
      total: ids.length,
      skipped: ids.length - missing.length + warmed.skipped,
      ok: warmed.ok,
      fail: warmed.fail,
      cancelled: warmed.cancelled,
    };
  }

  private readFileInside(baseDir: string, fileName: string, label: string): Buffer {
    const target = path.join(baseDir, fileName);
    if (!safeRelative(baseDir, target) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      throw new NotFoundException(`${label} file not found: ${fileName}`);
    }
    return fs.readFileSync(target);
  }
}
