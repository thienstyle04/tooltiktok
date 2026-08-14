import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GuideService } from '../guide.service';
import { configureDriveFileDiskCache } from '../sync/drive-images';

const tempCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'generated-list-rehydration-'));
fs.writeFileSync(path.join(tempCacheDir, 'image-ready.bin'), Buffer.from('ffd8ff', 'hex'));
fs.writeFileSync(path.join(tempCacheDir, 'image-ready.json'), JSON.stringify({
  contentType: 'image/jpeg',
  savedAt: Date.now(),
}));

const service = new GuideService() as any;
configureDriveFileDiskCache(tempCacheDir);
const sourceItem = {
  id: 'khu_du_lich-1',
  sectionKey: 'khu_du_lich',
  name: 'KDL Thung Lũng Vàng',
  address: 'Xã Lát, LangBiang',
  imageUrl: '/assets/drive-file?id=image-ready',
  imageMapped: true,
  imageSource: 'manual',
  imageMappingKey: 'khu_du_lich|kdl_thung_lung_vang|xa_lat_langbiang',
  candidateImageUrls: ['/assets/drive-file?id=image-ready'],
};
const fallbackItem = {
  id: 'khu_du_lich-1',
  sourceKey: 'khu_du_lich|kdl_thung_lung_vang|xa_lat_langbiang',
  sourceSectionKey: 'khu_du_lich',
  name: 'HOẠT ĐỘNG: KDL Thung Lũng Vàng',
  rawName: 'KDL Thung Lũng Vàng',
  metaPrimary: 'Xã Lát, LangBiang',
  imageUrl: '',
  imageMapped: false,
  imageSource: 'fallback',
  candidateImageUrls: [],
};

service.ensureGeneratedListsLoaded = () => {
  if (service.generatedListsLoaded) return;
  service.generatedListsLoaded = true;
  service.generatedListsByDeckId.set('budget-3n2d', [{
    id: 'budget-3n2d-caption-01-test',
    navTitle: 'AI 01',
    title: 'Test',
    description: '',
    pages: [{
      type: 'list',
      title: 'Test',
      subtitle: '',
      chipText: 'Ngày 1',
      chipTone: 'gold',
      items: [fallbackItem],
    }],
  }]);
};
service.ensureWorkbookDerivedContext = () => ({
  imageUrls: [],
  coverImageUrls: [],
  imageLibraryEntries: [],
  itemsBySection: {
    check_in: [],
    khu_du_lich: [sourceItem],
    quan_an: [],
    cafe: [],
    choi_dem: [],
    homestay: [],
    dich_vu: [],
  },
  baseDecks: [],
  totalItems: 1,
  mappedItemCount: 1,
  manualMappedItemCount: 1,
  autoMappedItemCount: 0,
});
service.buildReferenceSets = () => [];
service.mergeGeneratedLists = () => [];
service.persistGeneratedLists = () => undefined;

service.buildDatasetContext();

const refreshed = service.generatedListsByDeckId.get('budget-3n2d')[0].pages[0].items[0];
assert.equal(refreshed.imageSource, 'manual');
assert.equal(refreshed.imageMapped, true);
assert.equal(refreshed.imageUrl, sourceItem.imageUrl);
assert.deepEqual(refreshed.candidateImageUrls, sourceItem.candidateImageUrls);

console.log('PASS: list đã lưu được phục hồi ảnh thật khi cache nguồn đã sẵn sàng.');
configureDriveFileDiskCache('');
fs.rmSync(tempCacheDir, { recursive: true, force: true });
