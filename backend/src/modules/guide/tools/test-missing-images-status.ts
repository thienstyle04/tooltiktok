// Máy mới chưa có cache ảnh: trạng thái vẫn cho dùng mẫu chữ nhưng phải nói rõ
// "chưa có ảnh" và cách tải, không được báo "Đã tải xong ảnh". Không I/O thật.
import assert from 'node:assert/strict';
import { GuideService } from '../guide.service';

function service(inventory: { total: number; cached: number; missing: number } | undefined, destination = 'dalat-test') {
  const s: any = Object.create(GuideService.prototype);
  Object.assign(s, {
    activeDestinationId: destination,
    workbookSource: { destinationId: destination },
    destinationDataLoading: false,
    destinationDataError: '',
    driveCacheWarmStatus: { phase: 'ready', ready: true, destinationId: destination, total: 0, completed: 0, cached: 0, downloaded: 0, failed: 0, percent: 100, message: 'Đang dùng cache cục bộ.' },
    getNightSyncStatus: () => ({ running: null, queued: [], sources: [{ id: destination, initialized: true, lastPublishedAt: '2026-10-15T00:00:00Z', phase: 'complete', result: {} }] }),
    getLocalImageInventory: () => inventory && { ...inventory, checkedAt: '2026-10-16T00:00:00Z' },
  });
  return s.getDriveCacheWarmStatus();
}

// This machine: all photos present → the usual message, no warning flag.
let status = service({ total: 2517, cached: 2517, missing: 0 });
assert.equal(status.ready, true); assert.equal(status.imagesMissing, undefined);
assert.match(status.message, /Đã tải xong ảnh/);
// A handful of permanently broken Drive files is not "missing photos".
status = service({ total: 2517, cached: 2450, missing: 67 });
assert.equal(status.imagesMissing, undefined);
// New machine without the cache: still usable for text templates, but honest.
status = service({ total: 2517, cached: 0, missing: 2517 });
assert.equal(status.ready, true, 'Text templates (Threads/Note) stay usable');
assert.equal(status.imagesMissing, true);
assert.doesNotMatch(status.message, /Đã tải xong/);
assert.match(status.message, /chưa có ảnh \(0\/2517\)/);
assert.match(status.message, /Cập nhật dữ liệu ngay/, 'Sheet source: points to the manual update button');
// Partially downloaded.
status = service({ total: 2517, cached: 1000, missing: 1517 });
assert.match(status.message, /mới có 1000\/2517 ảnh/);
// No inventory (manifest unreadable) → behave as before.
status = service(undefined);
assert.equal(status.imagesMissing, undefined); assert.match(status.message, /Đã tải xong ảnh/);
console.log('PASS missing-images status: complete/broken-few/new-machine/partial/unknown; text templates stay usable; honest message with the right action.');
