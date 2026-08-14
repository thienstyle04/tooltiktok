import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as XLSX from 'xlsx';

import { buildSheetDriveManifest, emptySheetDriveManifest } from '../sync/sheet-drive-manifest';
import { SheetWorkbookSource } from '../sync/workbook-source';
import { itemMappingKey } from '../logic/image-resolver';
import { resolveSectionKeyFromSheetName } from '../sync/sheet-section';
import {
  clearDriveAccessibilityCache,
  configureDriveFileDiskCache,
  setCachedDriveFileAccessibility,
} from '../sync/drive-images';

const SHEET_NAME = 'quan_an';
const PLACE_NAME = 'Quan A';
const ADDRESS = '123 Duong X';
const IMAGE_LINK = 'https://drive.google.com/file/d/abc123/view';

function buildWorkbookSource(rows: Array<[string, string, string]>): SheetWorkbookSource {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['ten_quan', 'dia_chi', 'link_drive'],
    ...rows,
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, SHEET_NAME);
  return {
    workbook,
    workbookName: 'Test Sheet',
    destinationId: 'dalat',
    bytes: 0,
    fetchedAt: Date.now(),
    sourceUrl: 'https://example.com',
  };
}

function fakeImageResponse(): Response {
  const pngBytes = Buffer.from('89504e470d0a1a0a', 'hex');
  return new Response(pngBytes, {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });
}

async function run() {
  const source = buildWorkbookSource([
    [PLACE_NAME, ADDRESS, IMAGE_LINK],
  ]);

  const sectionKey = resolveSectionKeyFromSheetName(SHEET_NAME);
  assert.ok(sectionKey, `Sheet name "${SHEET_NAME}" phai map sang mot SectionKey hop le`);
  const key = itemMappingKey(sectionKey!, PLACE_NAME, ADDRESS);

  const previousManifest = emptySheetDriveManifest();
  previousManifest.items[key] = {
    key,
    sectionKey: sectionKey!,
    name: PLACE_NAME,
    address: ADDRESS,
    sourceLink: IMAGE_LINK,
    fileId: 'abc123',
    fileName: 'anh.jpg',
    candidateImages: [{ fileId: 'abc123', fileName: 'anh.jpg', viewUrl: IMAGE_LINK }],
  };

  const originalFetch = global.fetch;
  let networkCallCount = 0;
  global.fetch = (async () => {
    networkCallCount += 1;
    return fakeImageResponse();
  }) as typeof fetch;

  const tempCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-cache-test-'));
  configureDriveFileDiskCache(tempCacheDir);

  try {
    // Simulate access=true metadata copied from the packaging machine while the
    // portable bundle intentionally contains no real image cache bytes.
    setCachedDriveFileAccessibility('abc123', true);
    // Máy mới không có disk cache: manifest cũ chỉ là metadata, bắt buộc xác minh
    // và tải ảnh thật; nếu tái sử dụng ngay thì list sẽ render placeholder xám.
    const manifest = await buildSheetDriveManifest(source, previousManifest);
    assert.ok(networkCallCount > 0, 'May moi thieu disk cache phai goi Drive de xac minh anh that');
    assert.equal(manifest.items[key]?.fileId, 'abc123');
    console.log('PASS manifest-reuse-unchanged: may moi xac minh manifest cu qua mang');

    // Ảnh đã tải thành công trên chính máy này: lần sync tiếp theo mới được tái sử dụng.
    networkCallCount = 0;
    await buildSheetDriveManifest(source, manifest);
    assert.equal(networkCallCount, 0, 'Co disk cache that thi link khong doi duoc phep tai su dung');
    console.log('PASS manifest-reuse-unchanged: chi tai su dung khi co disk cache that');

    // forceRevalidate=true vẫn phải trả lại entry đã xác minh. Cache bộ nhớ của
    // cùng phiên có thể hợp lệ nên không dùng số lần gọi mạng làm tiêu chí.
    networkCallCount = 0;
    const revalidated = await buildSheetDriveManifest(source, previousManifest, { forceRevalidate: true });
    assert.equal(revalidated.items[key]?.fileId, 'abc123');
    console.log('PASS manifest-reuse-unchanged: forceRevalidate giu ket qua anh hop le');
  } finally {
    global.fetch = originalFetch;
    clearDriveAccessibilityCache();
    configureDriveFileDiskCache('');
    fs.rmSync(tempCacheDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error('FAIL manifest-reuse-unchanged:', error);
  process.exitCode = 1;
});
