import assert from 'node:assert/strict';
import { AutomationSchedulerService } from '../automation-scheduler.service';

const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };

async function scenario(outcome: 'completed' | 'failed' | 'cancelled') {
  const s = Object.create(AutomationSchedulerService.prototype) as any;
  Object.assign(s, { state: { runs: [], schedules: [] }, manualJobs: new Map(), manualActiveId: '', manualExportUntil: 0, activeRunId: '', runQueue: Promise.resolve() });
  // Only disk/network/browser boundaries are replaced; enqueue/execute/cancel use production code.
  for (const method of ['persist', 'trimRuns', 'touch', 'assertOutputDirectory', 'assertHookSelectionReady']) s[method] = () => {};
  s.findBrowser = () => ({ name: 'test-browser' });
  s.assertFrontendReady = async () => {};
  s.waitForDriveCache = async () => {};
  s.closeBrowser = async () => { events.push('browser-closed'); };
  const entered = deferred(), finish = deferred();
  const events: string[] = [];
  let destination = 'dalat';
  let active = 0, peak = 0;
  const heavy = async (label: string, task: () => Promise<any>) => {
    events.push(label); active++; peak = Math.max(peak, active);
    try { return await task(); } finally { active--; }
  };
  s.guideService = {
    getNightSyncStatus: () => ({ running: null, queued: [] }),
    isGenerationBusy: () => false,
    getDestinations: () => ({ active: { id: destination }, destinations: [{id:'dalat'}, {id:'greenland'}] }),
    getHookSources: () => ({mode:'normal',activeSourceId:''}),
    refreshDestinationFromSheet: async () => { throw new Error('Scheduled generation must not invoke manual network sync'); },
    setActiveDestination: async ({id}: any) => { destination=id; events.push('destination-' + id); },
    enqueueGeneration: async (task: any) => task(),
    generateBatchLists: async (request: any) => heavy(request.automationRunId ? 'scheduled-generate' : 'manual-generate', async () => {
      assert.equal(destination, request.automationRunId ? 'greenland' : 'dalat');
      if (!request.automationRunId) assert.equal(request.hookSelection.sourceId, 'chosen-before-run');
      return { successCount:3, failCount:0, lists:[{listId:'fixture-list'}] };
    }),
  };
  s.launchRenderer = async (run: any) => heavy('scheduled-render-zip', async () => {
    entered.resolve(); await finish.promise;
    if (outcome === 'failed') throw new Error('SIMULATED_RENDER_ERROR');
    if (outcome === 'completed') run.status='completed';
  });
  const run = { id:'scheduled', scheduleName:'Fixture', destinationId:'greenland', outputDir:'unused', status:'queued', templates:[{deckId:'summary-note',count:3}], hook:{mode:'normal'}, listIds:[], generated:[], errors:[] };
  s.enqueue(run);
  await entered.promise;
  const submit = (id: string) => s.submitManualGeneration({kind:'batch', destinationId:'dalat', requestId:id, request:{deckId:'summary-note',count:3,hookSelection:{mode:'festival',sourceId:'chosen-before-run'}}});
  const job = submit('manual');
  assert.equal(submit('manual').id, job.id);
  const cancelled = submit('cancel-me');
  s.cancelManualGeneration(cancelled.id);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(s.getManualGeneration(job.id).status, 'queued');
  assert.ok(!events.includes('manual-generate'));
  if (outcome === 'cancelled') s.cancel(run.id);
  finish.resolve(); await s.runQueue;
  assert.equal(s.getManualGeneration(job.id).status, 'completed');
  assert.equal(s.getManualGeneration(cancelled.id).status, 'cancelled');
  assert.equal(events.filter(e => e === 'manual-generate').length, 1);
  assert.ok(events.indexOf('manual-generate') > events.indexOf('browser-closed'));
  assert.equal(peak, 1, 'Never overlap render/ZIP with manual generation');
  assert.equal(destination,'dalat');
  assert.equal(run.status, outcome);
  assert.equal(s.activeRunId,'');
  console.log(`PASS scheduled ${outcome} -> manual queue: peak heavy tasks=${peak}, restored destination, dedup and cancel`);
}
async function main() { for (const outcome of ['completed','failed','cancelled'] as const) await scenario(outcome); }
void main();
