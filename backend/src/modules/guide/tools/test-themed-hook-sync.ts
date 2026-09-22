import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GreenHookSourceStore } from '../sync/green-hook-source';
import { DarkHookSourceStore } from '../sync/dark-hook-source';
import { PersimmonHookSourceStore } from '../sync/persimmon-hook-source';
import { NightSyncCoordinator } from '../sync/night-sync-coordinator';
import { enableNightSyncPolicy, withLocalDataOnly, withSyncPermit } from '../sync/night-sync-policy';

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-themed-audit-'));
  const constructors = [GreenHookSourceStore, DarkHookSourceStore, PersimmonHookSourceStore];
  const originalFetch = global.fetch;
  let fail = false, requests = 0;
  enableNightSyncPolicy();
  try {
    global.fetch = (async () => {
      requests++;
      return new Response(fail ? 'quota' : 'Một chuyến đi Đà Lạt\nLưu lại cho chuyến đi tiếp theo',
        { status: fail ? 429 : 200, headers: { 'content-type': 'text/plain' } });
    }) as typeof fetch;
    for (const Store of constructors) {
      const store = new Store(root);
      await assert.rejects(withLocalDataOnly(() => store.ensureReady('')), /Chưa có cache Hook/);
    }
    const sync = new NightSyncCoordinator({ file: path.join(root, 'sync.json'),
      now: () => Date.parse('2026-09-22T03:00:00Z'), sources: () => [{ id: 'dalat', label: 'Đà Lạt' }],
      initialized: () => true, busy: () => false,
      run: async () => {
        const hookErrors: string[] = [];
        for (const Store of constructors) {
          const store = new Store(root);
          await store.ensureReady('https://docs.google.com/document/d/test-hook/edit', true);
          if (store.getLastError()) hookErrors.push(store.getLastError()!);
        }
        return { downloaded: 0, failed: 0, added: 0, changed: 0, hookErrors };
      },
    });
    await sync.manual('dalat');
    assert.equal(requests, 3);
    assert.equal(sync.status().sources[0].phase, 'complete');
    for (const Store of constructors) {
      const restarted = new Store(root);
      await withLocalDataOnly(() => restarted.ensureReady(''));
      const reservation = restarted.reserve(); restarted.rollback(reservation);
      assert.equal(restarted.getCachedHooks().length, 2);
    }
    assert.equal(requests, 3, 'Generation/restart must not fetch hooks');
    fail = true; await sync.manual('dalat');
    assert.equal(sync.status().sources[0].phase, 'partial');
    assert.equal(sync.status().sources[0].result?.failed, 0);
    assert.equal(sync.status().sources[0].result?.hookErrors?.length, 3);
    fail = false; await sync.manual('dalat');
    assert.equal(sync.status().sources[0].phase, 'complete');
    console.log('PASS all three hook stores: fresh cache, manual sync, restart, offline generation, retained cache, partial failure and recovery');
  } finally { global.fetch = originalFetch; }

  if (process.argv.includes('--live')) {
    const manifest = JSON.parse(fs.readFileSync(path.resolve('data/sheet-drive-images.dalat.json'), 'utf8'));
    const liveRoot = path.join(root, 'live');
    for (const [index, key] of ['green', 'dark', 'persimmon'].entries()) {
      const store = new constructors[index](liveRoot);
      const url = manifest.hookSourceGroups?.[key];
      assert.ok(url, `Missing configured ${key} document`);
      await withSyncPermit({ manual: true, signal: AbortSignal.timeout(30000), waitForIdle: async () => {} }, () => store.ensureReady(url, true));
      assert.ok(store.getCachedHooks().length > 0);
      console.log(`PASS live ${key}: ${store.getCachedHooks().length} hooks, isolated cache`);
    }
  }
  console.log('Evidence: ' + root);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
