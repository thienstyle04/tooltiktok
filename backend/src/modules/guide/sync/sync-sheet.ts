import { resolveBackendDataDir, resolveBackendRoot } from '../../../config';
import { buildSheetDriveManifest, writeSheetDriveManifest } from './sheet-drive-manifest';
import { fetchWorkbookFromSheet } from './workbook-source';

async function main(): Promise<void> {
  const toolRoot = resolveBackendRoot(__dirname);
  const dataRoot = resolveBackendDataDir(toolRoot);

  const source = await fetchWorkbookFromSheet();
  const manifest = await buildSheetDriveManifest(source);
  const manifestPath = writeSheetDriveManifest(dataRoot, manifest);

  console.log(`Da tai du lieu tu Google Sheet: ${source.workbookName}`);
  console.log(`Dung luong: ${source.bytes} bytes`);
  console.log(`Da cap nhat manifest anh sheet: ${manifestPath}`);
  console.log(`So dia diem co anh Drive: ${Object.keys(manifest.items).length}`);
}

main().catch((error: unknown) => {
  console.error('Dong bo Google Sheet that bai.', error);
  process.exitCode = 1;
});
