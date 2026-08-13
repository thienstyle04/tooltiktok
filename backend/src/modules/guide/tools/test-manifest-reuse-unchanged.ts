import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as XLSX from 'xlsx';

import { buildSheetDriveManifest, emptySheetDriveManifest } from '../sync/sheet-drive-manifest';
import { SheetWorkbookSource } from '../sync/workbook-source';
import { itemMappingKey } from '../logic/image-resolver';
import { resolveSectionKeyFromSheetName } from '../sync/sheet-section';
import { configureDriveFileDiskCache } from '../sync/drive-images';

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
    // Mac dinh (khong force): link khong doi so voi manifest cu -> khong duoc goi mang.
    const manifest = await buildSheetDriveManifest(source, previousManifest);
    assert.equal(networkCallCount, 0, 'Khong duoc goi Drive qua mang khi link khong doi va khong force revalidate');
    assert.equal(manifest.items[key]?.fileId, 'abc123');
    console.log('PASS manifest-reuse-unchanged: tai su dung entry cu, khong goi mang');

    // forceRevalidate=true (VD: nguoi dung bam "Lam moi"): phai thuc su xac minh lai qua mang.
    networkCallCount = 0;
    await buildSheetDriveManifest(source, previousManifest, { forceRevalidate: true });
    assert.ok(networkCallCount > 0, 'forceRevalidate=true phai thuc su goi mang de xac minh lai');
    console.log('PASS manifest-reuse-unchanged: forceRevalidate van xac minh lai qua mang');
  } finally {
    global.fetch = originalFetch;
    configureDriveFileDiskCache('');
    fs.rmSync(tempCacheDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error('FAIL manifest-reuse-unchanged:', error);
  process.exitCode = 1;
});
