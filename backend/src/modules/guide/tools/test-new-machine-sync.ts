import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { NightSyncCoordinator } from '../sync/night-sync-coordinator';
import { GuideService } from '../guide.service';
import { configureDriveFileDiskCache, verifyDriveFileCache } from '../sync/drive-images';

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-new-machine-'));
  configureDriveFileDiskCache(dir);
  const id = 'new_machine_image';
  assert.equal((await verifyDriveFileCache([id]))[0].status, 'missing');
  let fail = true, release: () => void = () => {};
  const hold = new Promise<void>(resolve => { release = resolve; });
  const options = {
    file: path.join(dir, 'sync.json'),
    now: () => Date.parse('2026-09-19T05:00:00Z'),
    sources: () => [{ id: 'dalat', label: 'Đà Lạt' }, { id: 'greenland', label: 'Green Land' }],
    initialized: () => false, busy: () => false,
    run: async (source: string) => {
      if (source === 'greenland' && fail) throw new Error('TEST: Google Sheet unavailable');
      await hold;
      const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#abc' } }).png().toBuffer();
      fs.writeFileSync(path.join(dir, id + '.bin'), bytes);
      fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify({ contentType: 'image/png', contentLength: bytes.length }));
      assert.equal((await verifyDriveFileCache([id]))[0].status, 'valid');
      return { downloaded: 1, failed: 0, added: 1, changed: 0 };
    },
  };
  const sync = new NightSyncCoordinator(options);
  const service: any = Object.create(GuideService.prototype);
  Object.assign(service, { activeDestinationId: 'dalat', workbookSource: null,
    destinationDataLoading: false, destinationDataError: '',
    driveCacheWarmStatus: { ready: false, phase: 'idle' },
    getNightSyncStatus: () => sync.status(), getLocalImageInventory: () => ({ total: 1, cached: 0, missing: 1 }) });
  assert.throws(() => service.assertDriveCacheReady());
  await sync.tick();
  assert.equal(sync.status().running, null, 'no automatic midday download');
  const job = sync.manual('dalat');
  assert.ok(sync.status().queued.includes('dalat'));
  assert.throws(() => service.assertDriveCacheReady());
  release(); await job;
  service.workbookSource = {};
  // Startup may have failed before the first manual sync. A published source
  // must supersede that stale error without requiring a restart.
  service.destinationDataError = 'Không có XLSX cục bộ khi khởi động';
  service.driveCacheWarmStatus = { ready: false, phase: 'error' };
  service.assertDriveCacheReady();
  assert.equal(service.getDriveCacheWarmStatus().localInventory.total, 1);
  service.activeDestinationId = 'greenland';
  await assert.rejects(sync.manual('greenland'), /TEST: Google Sheet unavailable/);
  assert.throws(() => service.assertDriveCacheReady(), 'old cache must not unlock failed source');
  const restarted = new NightSyncCoordinator(options);
  assert.equal(restarted.status().sources.find(s => s.id === 'greenland')?.phase, 'error');
  fail = false; await sync.manual('greenland');
  service.assertDriveCacheReady();
  let implicitDownloads = 0;
  const switcher: any = Object.create(GuideService.prototype);
  Object.assign(switcher, {
    activeDestinationId: 'dalat',
    workbookSource: { destinationId: 'dalat' },
    workbookSourceByDestination: new Map(),
    workbookDerivedCacheByDestination: new Map(),
    generatedListsLoaded: false, inventoryLoaded: false,
    saveActiveDestinationId: () => undefined,
    resetDestinationScopedState: () => undefined,
    invalidateDatasetCache: () => undefined,
    scheduleWarmDriveFileDiskCache: () => undefined,
    loadPreferredWorkbookSource: () => null,
    syncWorkbookNow: () => { implicitDownloads += 1; throw new Error('network'); },
  });
  await assert.rejects(() => switcher.setActiveDestination({ id: 'greenland' }), /Tải dữ liệu & chuyển/);
  assert.equal(implicitDownloads, 0, 'Selecting an uninitialized source must not fetch Google Sheet');
  assert.equal(switcher.activeDestinationId, 'dalat', 'Failed switch must keep the previous source');
  console.log('PASS simulated fresh cache: missing blocks, midday auto waits, manual queues, decoded image unlocks, Green Land failure blocks, restart retains error, retry succeeds.');
  console.log('Isolated test artifacts: ' + dir);
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
