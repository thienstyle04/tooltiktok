import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { GuideService } from '../guide.service';
import { configureDriveFileDiskCache } from '../sync/drive-images';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'generated-list-uncached-'));
configureDriveFileDiskCache(temp);

try {
  const service = new GuideService() as any;
  service.generatedListsByDeckId.set('grid-4', [{
    id: 'grid-4-caption-test', navTitle: 'AI 01', title: '', description: '', pages: [{
      type: 'list', title: '', subtitle: '', chipText: '', chipTone: 'green', items: [{
        id: 'quan_an-1', sourceKey: 'quan_an|quan_loi|da_lat', sourceSectionKey: 'quan_an',
        name: 'Quán lỗi', rawName: 'Quán lỗi', metaPrimary: 'Đà Lạt', imageUrl: '',
        imageMapped: false, imageSource: 'fallback', candidateImageUrls: [],
      }],
    }],
  }]);
  service.persistGeneratedLists = () => undefined;

  service.refreshGeneratedListImages({
    check_in: [], khu_du_lich: [], cafe: [], choi_dem: [], homestay: [], dich_vu: [],
    hoat_dong: [], dia_diem_lich_su: [], quan_an: [{
      id: 'quan_an-1', sectionKey: 'quan_an', sectionTitle: 'Quán ăn', name: 'Quán lỗi',
      address: 'Đà Lạt', type: 'Quán ăn', openHours: '', style: '', highlight: '',
      partnerFlag: '', isPartner: false, headPrice: '', hasHeadPriceColumn: false,
      price: '', phone: '', imageUrl: '/assets/drive-file?id=uncached-file',
      imageMapped: true, imageMappingKey: 'quan_an|quan_loi|da_lat', imageSource: 'manual',
      candidateImageUrls: ['/assets/drive-file?id=uncached-file'],
    }],
  });

  const refreshed = service.generatedListsByDeckId.get('grid-4')[0].pages[0].items[0];
  assert.equal(refreshed.imageUrl, '', 'Khong duoc khoi phuc proxy Drive chua co file cache that');
  assert.equal(refreshed.imageSource, 'fallback');
  console.log('PASS generated-list: khong khoi phuc anh Drive chua co disk cache.');
} finally {
  configureDriveFileDiskCache('');
  fs.rmSync(temp, { recursive: true, force: true });
}
