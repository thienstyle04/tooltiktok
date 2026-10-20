import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NightSyncCoordinator } from '../sync/night-sync-coordinator';
import { GuideService } from '../guide.service';

// Tool bị tắt giữa lượt cập nhật (đóng cửa sổ, tắt máy, trình cập nhật cài bản
// mới) không được bắt người dùng cập nhật lại khi dữ liệu đã công bố vẫn hợp lệ.
async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-interrupted-sync-'));
  const published = '2026-10-06T02:50:17.460Z';
  const file = path.join(dir, 'night-sync.json');
  fs.writeFileSync(file, JSON.stringify({ sources: {
    dalat: { initialized: true, phase: 'running', lastPublishedAt: published, completedNight: '2026-10-05',
      progress: { stage: 'Đang tải ảnh', completed: 10, total: 200 } },
    greenland: { initialized: false, phase: 'running', progress: { stage: 'Đang tải ảnh' } },
  } }));
  let now = Date.parse('2026-10-14T03:00:00Z');
  let hold = false;
  const runs: string[] = [];
  const options = {
    file, now: () => now,
    sources: () => [{ id: 'dalat', label: 'Đà Lạt' }, { id: 'greenland', label: 'Green Land' }],
    initialized: () => false, busy: () => false, holdAutomatic: () => hold,
    run: async (id: string) => { runs.push(id); return { downloaded: 0, failed: 0, added: 0, changed: 0 }; },
  };
  const sync = new NightSyncCoordinator(options);
  const dalat = sync.status().sources.find(s => s.id === 'dalat')!;
  assert.equal(dalat.phase, 'partial');
  assert.equal(dalat.result, undefined);
  assert.match(dalat.progress!.stage, /bị ngắt.*dữ liệu đã công bố/);
  assert.equal(dalat.lastPublishedAt, published, 'Lượt bị ngắt phải giữ mốc dữ liệu đã công bố');

  const service: any = Object.create(GuideService.prototype);
  Object.assign(service, { activeDestinationId: 'dalat', workbookSource: { destinationId: 'dalat' },
    destinationDataLoading: false, destinationDataError: '',
    driveCacheWarmStatus: { phase: 'checking', ready: false, destinationId: 'dalat', total: 0, completed: 0, cached: 0, downloaded: 0, failed: 0, percent: 0, message: '' },
    getNightSyncStatus: () => sync.status(), getLocalImageInventory: () => undefined });

  const interrupted = service.getDriveCacheWarmStatus();
  assert.equal(interrupted.ready, true, 'Dữ liệu đã công bố vẫn dùng được sau lượt bị ngắt');
  assert.match(interrupted.syncWarning, /bị ngắt giữa chừng/);
  service.assertDriveCacheReady();

  // Đang khởi động (XLSX chưa đọc xong) thì hiện đang tải, không hiện lỗi.
  service.workbookSource = null;
  service.destinationDataLoading = true;
  const loading = service.getDriveCacheWarmStatus();
  assert.equal(loading.ready, false);
  assert.notEqual(loading.phase, 'error');
  service.workbookSource = { destinationId: 'dalat' };
  service.destinationDataLoading = false;

  // Lượt lỗi mạng sau khi đã có dữ liệu: cảnh báo, không khóa.
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  state.sources.dalat = { ...state.sources.dalat, phase: 'error', error: 'TEST: mất mạng' };
  fs.writeFileSync(file, JSON.stringify(state));
  const failedSync = new NightSyncCoordinator(options);
  service.getNightSyncStatus = () => failedSync.status();
  const failed = service.getDriveCacheWarmStatus();
  assert.equal(failed.ready, true);
  assert.match(failed.syncWarning, /TEST: mất mạng/);

  // Nguồn chưa từng có dữ liệu vẫn phải khóa cho tới khi cập nhật xong.
  service.activeDestinationId = 'greenland';
  service.workbookSource = { destinationId: 'greenland' };
  assert.equal(service.getDriveCacheWarmStatus().ready, false);
  assert.throws(() => service.assertDriveCacheReady());

  // Lượt đêm đang chạy cho nguồn đã có dữ liệu: không khóa tạo list.
  let release: () => void = () => undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  now = Date.parse('2026-10-14T16:30:00Z');
  fs.writeFileSync(path.join(dir, 'running.json'), JSON.stringify({ sources: {
    dalat: { initialized: true, phase: 'complete', lastPublishedAt: published, result: { downloaded: 0, failed: 0, added: 0, changed: 0 } } } }));
  const runningSync = new NightSyncCoordinator({ ...options, file: path.join(dir, 'running.json'), initialized: () => true,
    sources: () => [{ id: 'dalat', label: 'Đà Lạt' }],
    run: async () => { await gate; return { downloaded: 1, failed: 0, added: 0, changed: 0 }; } });
  const tick = runningSync.tick();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(runningSync.status().running, 'dalat');
  service.activeDestinationId = 'dalat';
  service.workbookSource = { destinationId: 'dalat' };
  service.getNightSyncStatus = () => runningSync.status();
  assert.equal(service.getDriveCacheWarmStatus().ready, true, 'Đồng bộ nền không được khóa nguồn đã có dữ liệu');
  release(); await tick;

  // Trình cập nhật đã đóng băng tool: không mở lượt đêm mới.
  hold = true;
  const held = new NightSyncCoordinator({ ...options, file: path.join(dir, 'held.json') });
  await held.tick();
  assert.deepEqual(runs, [], 'Không được bắt đầu lượt đêm khi tool sắp cài phiên bản mới');
  hold = false;
  await held.tick();
  assert.deepEqual(runs, ['dalat', 'greenland'], 'Hết đóng băng thì lượt đêm chạy lại bình thường');

  console.log('PASS interrupted-sync-keeps-data: lượt bị ngắt/lỗi chỉ cảnh báo khi đã có dữ liệu, nguồn mới vẫn khóa, cập nhật phiên bản không mở lượt đêm mới.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
