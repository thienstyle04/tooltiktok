import * as path from 'node:path';

import { buildSheetDriveManifest, writeSheetDriveManifest } from './sheet-drive-manifest';
import { syncWorkbookFromSheet } from './workbook-source';

async function main(): Promise<void> {
  // Since this file is in src/sync/, toolRoot is ../../ (backend root)
  const toolRoot = path.resolve(__dirname, '../../');
  const workspaceRoot = path.resolve(toolRoot, '../../'); // The data root

  const result = await syncWorkbookFromSheet(workspaceRoot);
  const manifest = await buildSheetDriveManifest(result.workbookPath);
  const manifestPath = writeSheetDriveManifest(toolRoot, manifest);
  console.log(`Đã đồng bộ workbook: ${result.workbookPath}`);
  console.log(`Dung lượng: ${result.bytes} bytes`);
  console.log(`Đã cập nhật manifest ảnh sheet: ${manifestPath}`);
  console.log(`Số địa điểm có ảnh Drive: ${Object.keys(manifest.items).length}`);
}

main().catch((error: unknown) => {
  console.error('Đồng bộ Google Sheet thất bại.', error);
  process.exitCode = 1;
});
