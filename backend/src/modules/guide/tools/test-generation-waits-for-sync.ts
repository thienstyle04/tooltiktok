import assert from 'node:assert/strict';
import { AutomationSchedulerService } from '../automation-scheduler.service';

async function main() {
  const scheduler: any = Object.create(AutomationSchedulerService.prototype);
  let running: string | null = 'dalat';
  scheduler.guideService = { getNightSyncStatus: () => ({ running, queued: running ? ['dalat'] : [] }) };
  scheduler.activeRunId = ''; scheduler.manualActiveId = ''; scheduler.manualExportUntil = 0;
  let done = false;
  const waiting = scheduler.waitForExistingSync(() => false).then(() => { done = true; });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(done, false);
  assert.equal(scheduler.isDataSyncBusy(), false, 'Sync must be able to finish while generation waits');
  running = null; await waiting; assert.equal(done, true);
  running = 'dalat';
  await scheduler.waitForExistingSync(() => true);
  console.log('PASS existing sync completes without generation busy lock; waiting remains cancellable');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
