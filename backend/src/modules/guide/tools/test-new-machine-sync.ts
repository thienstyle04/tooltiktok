import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { resolveBackendDataDir, resolveBackendRoot } from '../../../config';
import {
  emptySheetDriveManifest,
  mergeSheetDriveManifests,
  readSheetDriveManifest,
  readSheetDriveSeedManifest,
  resolveSheetDriveManifestWithSeedFallback,
} from '../sync/sheet-drive-manifest';
import { fetchWorkbookFromSheet } from '../sync/workbook-source';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

async function testManifestFallback(dataRoot: string): Promise<void> {
  const seed = readSheetDriveSeedManifest(dataRoot);
  assert(Object.keys(seed.items).length > 100, 'Seed manifest phai co hon 100 anh');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-new-machine-'));
  try {
    fs.copyFileSync(
      path.join(dataRoot, 'sheet-drive-images.seed.json'),
      path.join(tempDir, 'sheet-drive-images.seed.json'),
    );

    const emptyLocal = readSheetDriveManifest(tempDir);
    assert(Object.keys(emptyLocal.items).length === 0, 'May moi khong co local manifest');

    const resolved = resolveSheetDriveManifestWithSeedFallback(tempDir);
    assert(Object.keys(resolved.items).length === Object.keys(seed.items).length, 'Fallback seed phai tra du anh');

    const sampleKey = Object.keys(seed.items)[0];
    const localOverride = {
      ...emptySheetDriveManifest(),
      items: {
        [sampleKey]: { ...seed.items[sampleKey], fileName: 'override-local.jpg' },
      },
    };
    const merged = mergeSheetDriveManifests(localOverride, seed);
    assert(Object.keys(merged.items).length === Object.keys(seed.items).length, 'Merge phai giu du so anh seed');
    assert(merged.items[sampleKey]?.fileName === 'override-local.jpg', 'Local entry phai ghi de seed cung key');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function testSheetFetch(): Promise<void> {
  const source = await fetchWorkbookFromSheet();
  assert(source.bytes > 50_000, 'Google Sheet export phai > 50KB');
  assert(source.workbook.SheetNames.length > 5, 'Workbook phai co nhieu sheet');
}

async function testGuideDataApi(): Promise<void> {
  const response = await fetch('http://127.0.0.1:3000/api/guide-data');
  assert(response.ok, `GET /api/guide-data phai 200, nhan ${response.status}`);

  const payload = await response.json() as {
    source?: { totalItems?: number; mappedItemCount?: number; workbook?: string };
  };
  assert((payload.source?.totalItems ?? 0) > 50, 'Dataset phai co du dia diem');
  assert((payload.source?.mappedItemCount ?? 0) > 50, 'Dataset phai map du anh');
  assert(payload.source?.workbook === 'Google Sheet', 'Workbook phai tu Google Sheet');
}

async function testDriveImageProxy(): Promise<void> {
  const dataRoot = resolveBackendDataDir(resolveBackendRoot());
  const resolved = resolveSheetDriveManifestWithSeedFallback(dataRoot);
  const firstEntry = Object.values(resolved.items).find((entry) => entry.fileId);
  assert(firstEntry?.fileId, 'Can co it nhat 1 fileId de test proxy anh');
  const fileId = firstEntry!.fileId;

  const response = await fetch(`http://127.0.0.1:3000/assets/drive-file?id=${encodeURIComponent(fileId)}`);
  assert(response.ok, `Drive proxy phai 200, nhan ${response.status}`);

  const contentType = String(response.headers.get('content-type') ?? '');
  assert(contentType.startsWith('image/') || contentType.includes('svg'), `Content-Type phai la anh, nhan ${contentType}`);
}

async function main(): Promise<void> {
  const dataRoot = resolveBackendDataDir(resolveBackendRoot());
  const tests: Array<[string, () => Promise<void>]> = [
    ['manifest seed fallback (may moi)', () => testManifestFallback(dataRoot)],
    ['tai Google Sheet', () => testSheetFetch()],
    ['API /api/guide-data', () => testGuideDataApi()],
    ['proxy anh Drive', () => testDriveImageProxy()],
  ];

  for (const [name, run] of tests) {
    process.stdout.write(`[test] ${name}... `);
    await run();
    process.stdout.write('OK\n');
  }

  console.log('[test] Tat ca test may moi PASS.');
}

main().catch((error: unknown) => {
  console.error('[test] FAIL:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
