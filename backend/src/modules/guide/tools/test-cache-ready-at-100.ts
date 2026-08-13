import assert from 'node:assert/strict';
import { GuideService } from '../guide.service';

const service = new GuideService() as any;
service.destinationDataLoading = true;
service.destinationDataError = '';
service.workbookSource = { workbook: {}, destinationId: 'dalat' };
service.workbookDerivedCache = null;
service.driveCacheWarmStatus = {
  phase: 'warming',
  ready: false,
  destinationId: 'dalat',
  total: 680,
  completed: 680,
  cached: 600,
  downloaded: 70,
  failed: 10,
  percent: 100,
  message: 'Đang tải ảnh Drive vào cache (680/680)...',
};

const completed = service.getDriveCacheWarmStatus();
assert.equal(completed.ready, true, 'Đủ ảnh và đã có nguồn Sheet phải thoát trạng thái chờ');
assert.equal(completed.phase, 'ready');
assert.equal(completed.percent, 100);

service.workbookSource = null;
const missingSheet = service.getDriveCacheWarmStatus();
assert.equal(missingSheet.ready, false, 'Chưa có nguồn Sheet thì vẫn phải khóa tạo list');

console.log('PASS cache-ready-at-100: không treo overlay khi ảnh đã hoàn tất');
