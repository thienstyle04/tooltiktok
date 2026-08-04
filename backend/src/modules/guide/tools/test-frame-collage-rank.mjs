/**
 * Verify frame_dl collages are ranked after real photos for full-bleed slides.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDrive = path.resolve(__dirname, '../../../../dist/modules/guide/sync/drive-images.js');
const srcTsNode = path.resolve(__dirname, '../sync/drive-images.ts');

let mod;
try {
  mod = require(distDrive);
} catch {
  // Fallback: register ts-node/tsx if dist missing — load via dynamic import of compiled nest
  const { register } = require('node:module');
  try {
    require('ts-node/register/transpile-only');
    mod = require(srcTsNode);
  } catch (error) {
    console.error('Cannot load drive-images module. Build backend first or use ts-node.', error.message);
    process.exit(1);
  }
}

const {
  isFrameCollageFileName,
  rankFullBleedDriveProxyUrls,
  getDriveImageProxyUrl,
  preferDiskCachedDriveProxyUrls,
} = mod;

const entries = [
  { fileId: 'frameA', fileName: 'frame_dl_002.png' },
  { fileId: 'mainJpg', fileName: 'nha-khach-da-lat.jpg' },
  { fileId: 'frameB', fileName: 'frame_dl_001 (1).png' },
  { fileId: 'other', fileName: 'khung-canh-nhuom-mau-phap-co-dien.jpg' },
];

const urls = entries.map((e) => getDriveImageProxyUrl(e.fileId));
const ranked = rankFullBleedDriveProxyUrls(preferDiskCachedDriveProxyUrls(urls), entries);

const rankedIds = ranked.map((url) => String(url).match(/id=([^&]+)/)?.[1] || url);
const first = rankedIds[0];
const frameNames = entries.filter((e) => isFrameCollageFileName(e.fileName)).map((e) => e.fileId);
const ok =
  !frameNames.includes(first)
  && rankedIds.indexOf('mainJpg') < rankedIds.indexOf('frameA')
  && rankedIds.indexOf('other') < rankedIds.indexOf('frameB')
  && isFrameCollageFileName('frame_dl_001.png')
  && !isFrameCollageFileName('nha-khach-da-lat.jpg');

console.log(JSON.stringify({ ok, rankedIds, first }, null, 2));
if (!ok) process.exit(1);
