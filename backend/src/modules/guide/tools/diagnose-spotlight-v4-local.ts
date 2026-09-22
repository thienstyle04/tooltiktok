import fs from 'node:fs';
import path from 'node:path';
import { buildSpotlightV4Pages } from '../logic/deck-builder-v2';
import { configureDriveFileDiskCache, hasDriveFileDiskCache } from '../sync/drive-images';
import { withLocalDataOnly } from '../sync/night-sync-policy';
import { setActiveDestinationLocalize } from '../sync/destination-localize';

// Read-only probe: no service construction, network requests or list persistence.
const root = path.resolve('data');
configureDriveFileDiskCache(path.join(root, 'drive-file-cache'));
setActiveDestinationLocalize('dalat');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'sheet-drive-images.dalat.json'), 'utf8'));
const groups: any = Object.fromEntries(['quan_an','cafe','homestay','check_in','dich_vu','choi_dem','hoat_dong','dia_diem_lich_su','khu_du_lich'].map(k => [k, []]));
const url = (id: string) => '/assets/drive-file?id=' + id;
for (const [i, entry] of (Object.values(manifest.items) as any[]).entries()) {
  const images = [...new Set([entry.fileId, ...(entry.candidateImages || []).map((v: any) => v.fileId)].filter(id => id && hasDriveFileDiskCache(id)))].map(id => url(String(id)));
  if (!images.length || !groups[entry.sectionKey]) continue;
  groups[entry.sectionKey].push({ id: 'probe-' + i, sectionKey: entry.sectionKey, name: entry.name, address: entry.address,
    imageMappingKey: entry.key, imageUrl: images[0], candidateImageUrls: images, imageSource: 'manual', imageMapped: true,
    isPartner: false, type: '', openHours: '', style: '', highlight: '', price: '' });
}
const backgrounds = (manifest.coverImages || []).filter((v: any) => hasDriveFileDiskCache(v.fileId)).map((v: any) => url(v.fileId));
console.log('LOCAL POOL', JSON.stringify({ backgrounds: backgrounds.length, groups: Object.fromEntries(Object.entries(groups).map(([k,v]: any) => [k,v.length])) }));
let failures = 0;
withLocalDataOnly(async () => {
  const globalUsedItemIds = new Set<string>(), globalUsedImageUrls = new Set<string>();
  for (let i = 0; i < 20; i++) {
    try {
      const pages = buildSpotlightV4Pages({ itemsBySection: groups, coverImageUrls: backgrounds, imageUrls: [], libraryEntries: [], globalUsedItemIds, globalUsedImageUrls }, 'diagnose-v4-' + i, { hooks: ['Hook kiểm thử'], destinationId: 'dalat' });
      if (pages.length !== 14) throw Error('Wrong page count: ' + pages.length);
    } catch (error) { failures++; console.log('FAILED', i, (error as Error).message); }
  }
});
console.log('RESULT', { attempted: 20, failures });
