import { resolveBackendDataDir, resolveBackendRoot } from '../../../config';
import { getDestinationConfig } from './destination-config';
import { buildSheetDriveManifest, readSheetDriveManifest, writeSheetDriveManifest } from './sheet-drive-manifest';
import { fetchWorkbookFromSheet } from './workbook-source';

async function main(): Promise<void> {
  const toolRoot = resolveBackendRoot(__dirname);
  const dataRoot = resolveBackendDataDir(toolRoot);

  const source = await fetchWorkbookFromSheet(getDestinationConfig('dalat'));
  const previousManifest = readSheetDriveManifest(dataRoot, source.destinationId);
  const manifest = await buildSheetDriveManifest(source, previousManifest);
  const manifestPath = writeSheetDriveManifest(dataRoot, manifest, source.destinationId);

  console.log(`Da tai du lieu tu Google Sheet: ${source.workbookName}`);
  console.log(`Dung luong: ${source.bytes} bytes`);
  console.log(`Da cap nhat manifest anh sheet: ${manifestPath}`);
  console.log(`So dia diem co anh Drive: ${Object.keys(manifest.items).length}`);
}

main().catch((error: unknown) => {
  console.error('Dong bo Google Sheet that bai.', error);
  process.exitCode = 1;
});
