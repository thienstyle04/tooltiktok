import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AutomationSchedulerService } from '../automation-scheduler.service';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-new-schedule-'));
const originalNow = Date.now;
let now = Date.parse('2026-09-21T00:00:00Z');
Date.now = () => now;
const open = () => {
  const s: any = Object.create(AutomationSchedulerService.prototype);
  s.dataRoot = root; s.statePath = path.join(root, 'automation-schedules.json');
  s.guideService = { getDestinations: () => ({ destinations: [{ id: 'dalat' }] }) };
  s.state = s.load(); s.activeRunId = ''; s.runQueue = Promise.resolve();
  // Intercept only job execution: exercise real validation, persistence and due-time logic.
  s.enqueue = (run: any) => { s.state.runs.unshift(run); };
  return s;
};
try {
  const s = open();
  assert.equal(s.state.schedules.length, 0);
  s.create({ name: 'Fresh machine test', destinationId: 'dalat', frequency: 'once',
    onceAt: '2026-09-21T00:05:00Z', outputDir: root, enabled: true,
    templates: [{ deckId: 'spotlight-v4', count: 3 }], hook: { mode: 'normal' } });
  const restarted = open();
  assert.equal(restarted.state.schedules.length, 1);
  restarted.recalculateSchedules();
  restarted.tick(); assert.equal(restarted.state.runs.length, 0);
  now += 5 * 60000;
  restarted.tick(); assert.equal(restarted.state.runs.length, 1);
  assert.equal(restarted.state.runs[0].status, 'queued');
  restarted.tick(); assert.equal(restarted.state.runs.length, 1);
  assert.equal(open().state.schedules[0].enabled, false);
  now += 60000;
  const late = open();
  late.create({ name: 'Late restart test', destinationId: 'dalat', frequency: 'once',
    onceAt: new Date(now + 60000).toISOString(), outputDir: root,
    templates: [{ deckId: 'spotlight-v4', count: 3 }], hook: { mode: 'normal' } });
  now += 10 * 60000;
  const lateRestart = open();
  lateRestart.recalculateSchedules(); lateRestart.tick();
  assert.equal(lateRestart.state.runs[0].status, 'missed');
  assert.match(lateRestart.state.runs[0].phase, /không hoạt động đúng giờ/);
  console.log('PASS fresh machine: create/save/reload, due run queued once, consumed schedule persisted, late restart recorded missed.');
  console.log('Real browser detected: ' + s.findBrowser()?.name);
  console.log('Isolated evidence: ' + root);
} finally { Date.now = originalNow; }
