import { resolveBackendDataDir, resolveBackendRoot, resolveWorkspaceRoot } from '../../../config';
import { buildSheetDriveManifest, writeSheetDriveManifest } from './sheet-drive-manifest';
import { syncWorkbookFromSheet } from './workbook-source';

async function main(): Promise<void> {
  const toolRoot = resolveBackendRoot(__dirname);
  const dataRoot = resolveBackendDataDir(toolRoot);
  const workspaceRoot = resolveWorkspaceRoot(toolRoot);

  const result = await syncWorkbookFromSheet(workspaceRoot);
  const manifest = await buildSheetDriveManifest(result.workbookPath);
  const manifestPath = writeSheetDriveManifest(dataRoot, manifest);
  console.log(`Đã đồng bộ workbook: ${result.workbookPath}`);
  console.log(`Dung lượng: ${result.bytes} bytes`);
  console.log(`Đã cập nhật manifest ảnh sheet: ${manifestPath}`);
  console.log(`Số địa điểm có ảnh Drive: ${Object.keys(manifest.items).length}`);
}

main().catch((error: unknown) => {
  console.error('Đồng bộ Google Sheet thất bại.', error);
  process.exitCode = 1;
});
