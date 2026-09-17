import assert from 'node:assert/strict';
import { AutomationSchedulerService } from '../automation-scheduler.service';

async function main() {
  const s = Object.create(AutomationSchedulerService.prototype) as any;
  s.manualJobs = new Map(); s.manualActiveId = ''; s.manualExportUntil = 0;
  let release!: () => void;
  s.runQueue = new Promise<void>(resolve => { release = resolve; }); // scheduled render/ZIP still running
  let destination = 'dalat', running = 0, peak = 0;
  const calls: any[] = [];
  s.guideService = {
    getDestinations: () => ({ active: { id: destination }, destinations: [{ id: 'dalat' }, { id: 'greenland' }] }),
    getHookSources: () => ({ mode: 'normal', activeSourceId: '' }),
    setActiveDestination: async ({ id }: any) => { destination = id; },
    enqueueGeneration: async (task: any) => { running++; peak = Math.max(peak, running); try { return await task(); } finally { running--; } },
    generateBatchLists: async (request: any) => {
      calls.push({ destination, request });
      assert.throws(() => s.assertUserMutationAllowed(), /hàng đợi/);
      assert.throws(() => s.setManualExportActive(true), /lịch tự động/);
      await new Promise(resolve => setTimeout(resolve, 5));
      if (request.deckId === 'fail') throw new Error('test failure');
      return { successCount: request.count };
    },
  };
  const submit = (requestId: string, dest = 'dalat', deckId = 'summary-note') => s.submitManualGeneration({
    kind: 'batch', destinationId: dest, requestId,
    request: { deckId, count: 3, hookSelection: { mode: 'festival', sourceId: 'saved-source' } },
  });
  const first = submit('first', 'greenland');
  assert.equal(submit('first').id, first.id, 'Same request must not generate twice');
  const cancelled = submit('cancel'); s.cancelManualGeneration(cancelled.id);
  const failed = submit('fail', 'dalat', 'fail');
  const last = submit('last');
  await Promise.resolve(); assert.equal(calls.length, 0, 'No manual work during scheduled render/ZIP');
  release(); await s.runQueue;
  assert.equal(peak, 1);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].destination, 'greenland');
  assert.equal(calls[2].destination, 'dalat');
  assert.equal(calls[0].request.hookSelection.sourceId, 'saved-source');
  assert.equal(destination, 'dalat');
  assert.equal(s.getManualGeneration(first.id).status, 'completed');
  assert.equal(s.getManualGeneration(cancelled.id).status, 'cancelled');
  assert.equal(s.getManualGeneration(failed.id).status, 'failed');
  assert.equal(s.getManualGeneration(last.id).status, 'completed');
  assert.equal(s.manualActiveId, '');
  assert.throws(() => s.getManualGeneration('old-session'), /Không tự tạo lại/);
  console.log('PASS manual queue: waits for render/ZIP, FIFO, one heavy task, cancel, dedup, failure recovery, destination and hook snapshot');
}
void main();
