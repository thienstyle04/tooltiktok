import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { NightSyncCoordinator } from '../sync/night-sync-coordinator';
import { enableNightSyncPolicy, syncFetch, vietnamSyncWindow, withSyncPermit } from '../sync/night-sync-policy';

async function main() {
  for (const [date, allowed, night] of [
    ['2026-09-18T15:59:00Z', false, '2026-09-18'],
    ['2026-09-18T16:00:00Z', true, '2026-09-18'],
    ['2026-09-18T22:59:00Z', true, '2026-09-18'],
    ['2026-09-18T23:00:00Z', false, '2026-09-19'],
  ] as const) {
    assert.equal(vietnamSyncWindow(Date.parse(date)).allowed, allowed);
    assert.equal(vietnamSyncWindow(Date.parse(date)).night, night);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'night-sync-test-'));
  const originalFetch = global.fetch;
  try {
    const requests: string[] = [];
    global.fetch = (async (url: string) => { requests.push(url); return new Response('ok'); }) as typeof fetch;
    enableNightSyncPolicy();
    await assert.rejects(syncFetch('https://drive.google.com/test'), /23:00/);
    assert.equal(requests.length, 0);
    await withSyncPermit({ initial: true, signal: new AbortController().signal, waitForIdle: async () => {} }, async () => {
      assert.equal(await (await syncFetch('https://drive.google.com/test')).text(), 'ok');
    });
    const controller = new AbortController(); controller.abort();
    await assert.rejects(withSyncPermit({ initial: true, signal: controller.signal, waitForIdle: async () => {} }, () => syncFetch('https://drive.google.com/test')));
    assert.equal(requests.length, 1);

    let now = Date.parse('2026-09-18T16:00:00Z');
    let active = 0, maxActive = 0;
    const order: string[] = [];
    const options = {
      file: path.join(dir, 'state.json'), now: () => now,
      sources: () => [{ id: 'dalat', label: 'Đà Lạt' }, { id: 'greenland', label: 'Green Land' }],
      initialized: () => true, busy: () => false,
      run: async (id: string, sheetDone: boolean, mark: () => void) => {
        active++; maxActive = Math.max(maxActive, active); order.push(`${id}:${sheetDone}`);
        try {
          await new Promise(resolve => setTimeout(resolve, 5));
          if (id === 'dalat') throw new Error('Network unavailable');
          mark(); return { downloaded: 2, failed: 0, added: 1, changed: 0 };
        } finally { active--; }
      },
    };
    const coordinator = new NightSyncCoordinator(options);
    await Promise.all([coordinator.tick(), coordinator.tick()]);
    assert.equal(maxActive, 1);
    assert.deepEqual(order, ['dalat:false', 'greenland:false']);
    await coordinator.tick(); assert.equal(order.length, 2);
    now += 31 * 60000; await coordinator.tick();
    assert.deepEqual(order, ['dalat:false', 'greenland:false', 'dalat:false']);
    await assert.rejects(coordinator.initial('dalat'), /đã khởi tạo/);
    now = Date.parse('2026-09-18T23:00:00Z'); await coordinator.tick();
    assert.equal(coordinator.status().report?.read, false);
    coordinator.acknowledge();
    const restarted = new NightSyncCoordinator(options);
    assert.equal(restarted.status().report?.read, true);
    await restarted.tick(); assert.equal(order.length, 3);
    const manualOrder: boolean[] = [];
    const manual = new NightSyncCoordinator({ ...options, file: path.join(dir, 'manual.json'),
      run: async (_id, done, mark) => {
        manualOrder.push(done); mark();
        await new Promise(resolve => setTimeout(resolve, 10));
        assert.equal(await (await syncFetch('https://drive.google.com/manual')).text(), 'ok');
        return { downloaded: 1, failed: 0, added: 0, changed: 0 };
      },
    });
    await Promise.all([manual.manual('dalat'), manual.manual('dalat'), manual.manual('greenland')]);
    assert.deepEqual(manualOrder, [false, false], 'Same-source double click must be deduplicated');
    await manual.manual('dalat');
    assert.deepEqual(manualOrder, [false, false, false], 'Every explicit update must download a fresh Sheet');
    await manual.tick();
    assert.equal(manualOrder.length, 3, 'Automatic sync remains disabled in daytime');
    let busy = true, started = false;
    const queued = new NightSyncCoordinator({ ...options, file: path.join(dir, 'queued.json'), busy: () => busy,
      run: async () => { started = true; return { downloaded: 0, failed: 0, added: 0, changed: 0 }; },
    });
    const queuedJob = queued.manual('dalat');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(started, false);
    assert.equal(queued.status().sources[0].phase, 'paused');
    busy = false; await queuedJob; assert.equal(started, true);
    console.log('PASS: Vietnam boundaries, no network without permit, explicit initial permit, cancellation, sequential sources, retry, no repeated successful sheet, report persistence');
  } finally { global.fetch = originalFetch; fs.rmSync(dir, { recursive: true, force: true }); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
