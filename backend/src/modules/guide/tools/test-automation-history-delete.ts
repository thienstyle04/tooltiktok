import assert from 'node:assert/strict';
import { AutomationSchedulerService } from '../automation-scheduler.service';
const s = Object.create(AutomationSchedulerService.prototype) as any;
const schedule = { id: 'keep-schedule' };
const done = { id: 'done', status: 'completed', listIds: ['keep-list'], outputPath: 'keep.zip' };
const active = { id: 'active', status: 'exporting' };
s.state = { schedules: [schedule], runs: [done, active] };
s.activeRunId = 'active';
let saved: any;
s.persist = () => { saved = structuredClone(s.state); };
s.getState = () => structuredClone(s.state);
assert.throws(() => s.deleteRunHistory('active'), /Không thể xóa/);
const result = s.deleteRunHistory('done');
assert.deepEqual(result.runs, [active]);
assert.deepEqual(saved.schedules, [schedule]);
assert.deepEqual(done.listIds, ['keep-list']);
assert.equal(done.outputPath, 'keep.zip');
s.state = structuredClone(saved);
assert.ok(!s.state.runs.some((r: any) => r.id === 'done'), 'Persisted history stays deleted after reload');
for (const status of ['queued','refreshing','warming','generating','awaiting-export','exporting']) {
  s.state.runs = [{ id:'blocked', status }];
  assert.throws(() => s.deleteRunHistory('blocked'), /Không thể xóa/);
}
for (const status of ['completed','partial','failed','cancelled','interrupted','missed']) {
  s.state.runs = [{id:'terminal',status}];
  s.deleteRunHistory('terminal'); assert.equal(s.state.runs.length,0);
}
s.state.runs = [done];
s.persist = () => { throw new Error('DISK_FAILURE'); };
assert.throws(() => s.deleteRunHistory('done'), /DISK_FAILURE/);
assert.deepEqual(s.state.runs,[done]);
console.log('PASS history deletion: terminal states, active guards, persistence, rollback, keeps schedules/list IDs/ZIP references untouched');
