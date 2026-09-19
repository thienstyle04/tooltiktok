import assert from 'node:assert/strict';
import { GuideService } from '../guide.service';

const service: any = Object.create(GuideService.prototype);
service.activeDestinationId = 'dalat';
service.driveCacheWarmStatus = { ready: true, phase: 'ready' };
service.getLocalImageInventory = () => ({ total: 3, cached: 3, missing: 0 });
service.workbookSource = {};
service.destinationDataLoading = false;
service.destinationDataError = '';
for (const phase of ['running', 'paused', 'partial', 'error']) {
  service.getNightSyncStatus = () => ({ running: phase === 'running' || phase === 'paused' ? 'dalat' : null,
    queued: [], sources: [{ id: 'dalat', phase, error: phase === 'error' ? 'Sheet unavailable' : undefined }] });
  assert.equal(service.getDriveCacheWarmStatus().ready, false, phase);
  assert.throws(() => service.assertDriveCacheReady(), phase);
}
service.getNightSyncStatus = () => ({ running: null, queued: ['dalat'], sources: [] });
assert.equal(service.getDriveCacheWarmStatus().ready, false);
service.getNightSyncStatus = () => ({ running: null, queued: [], sources: [{ id: 'dalat', phase: 'complete' }] });
assert.equal(service.getDriveCacheWarmStatus().ready, true);
console.log('PASS: queued/running/paused/partial/error block generation despite old ready cache; complete unlocks.');
