import assert from 'node:assert/strict';
import { AutomationSchedulerService } from '../automation-scheduler.service';

function makeSchedule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'schedule-test', name: 'Lịch kiểm thử', destinationId: 'dalat', frequency: 'once',
    onceAt: new Date(Date.now() - 10 * 60_000).toISOString(), outputDir: 'C:\\temp', enabled: true,
    templates: [{ deckId: 'summary-note', count: 3 }], hook: { mode: 'normal' },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    nextRunAt: new Date(Date.now() - 10 * 60_000).toISOString(), ...overrides,
  };
}

function main(): void {
  const scheduler = Object.create(AutomationSchedulerService.prototype) as any;
  scheduler.state = { version: 1, schedules: [makeSchedule()], runs: [] };
  scheduler.runQueue = Promise.resolve();
  scheduler.activeRunId = '';
  scheduler.persist = () => undefined;
  scheduler.tick();
  assert.equal(scheduler.state.runs.length, 1);
  assert.equal(scheduler.state.runs[0].status, 'missed');
  assert.match(scheduler.state.runs[0].phase, /bỏ qua/);
  assert.equal(scheduler.state.schedules[0].enabled, false);

  const daily = makeSchedule({
    id: 'daily-test', frequency: 'daily', onceAt: undefined, dailyTime: '08:30',
    nextRunAt: undefined, enabled: true,
  });
  scheduler.state = { version: 1, schedules: [daily], runs: [] };
  scheduler.recalculateSchedules();
  assert.ok(Number.isFinite(Date.parse(daily.nextRunAt)), 'Lịch hằng ngày phải có lần chạy tiếp theo');
  const vietnam = new Date(Date.parse(daily.nextRunAt) + 7 * 60 * 60 * 1000);
  assert.equal(`${String(vietnam.getUTCHours()).padStart(2, '0')}:${String(vietnam.getUTCMinutes()).padStart(2, '0')}`, '08:30');

  assert.equal(scheduler.validateOutputFileName('lich-sang'), 'lich-sang.zip');
  assert.equal(scheduler.validateOutputFileName('lich-sang.ZIP'), 'lich-sang.ZIP');
  assert.throws(() => scheduler.validateOutputFileName('..\\ngoai-thu-muc.zip'), /không hợp lệ/);
  assert.deepEqual(scheduler.validateTemplates([
    { deckId: 'spotlight-v4', count: 3 },
    { deckId: 'spotlight-v5', count: 5 },
  ]), [
    { deckId: 'spotlight-v4', count: 3 },
    { deckId: 'spotlight-v5', count: 5 },
  ]);
  assert.throws(() => scheduler.validateTemplates([{ deckId: 'spotlight-v4', count: 2 }]), /3 đến 5/);
  assert.throws(() => scheduler.validateTemplates([{ deckId: 'spotlight-v4', count: 6 }]), /3 đến 5/);
  assert.throws(() => scheduler.validateTemplates([
    { deckId: 'spotlight-v4', count: 3 },
    { deckId: 'spotlight-v4', count: 3 },
  ]), /chọn lặp/);

  console.log('PASS automation-scheduler: missed run, Asia/Saigon, safe ZIP names và 3–5 list riêng cho mỗi mẫu');
}

main();
