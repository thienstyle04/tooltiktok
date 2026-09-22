import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSpotlightV3Hooks } from '../sync/spotlight-hook-source';
import { enableNightSyncPolicy, withSyncPermit, withLocalDataOnly } from '../sync/night-sync-policy';

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-hook-policy-'));
  const original = global.fetch;
  let requests = 0;
  global.fetch = (async () => { requests++; return new Response('Một chuyến đi Đà Lạt\nĐi chậm một chút'); }) as typeof fetch;
  enableNightSyncPolicy();
  try {
    await loadSpotlightV3Hooks({ dataRoot: root, forceRefresh: true });
    assert.equal(requests, 0, 'Startup without a sync permit must stay local');
    await withSyncPermit({ manual: true, signal: new AbortController().signal, waitForIdle: async () => {} },
      () => loadSpotlightV3Hooks({ dataRoot: root, forceRefresh: true }));
    assert.equal(requests, 1, 'Confirmed manual sync can fetch');
    const cached = await withLocalDataOnly(() => loadSpotlightV3Hooks({ dataRoot: root, forceRefresh: true }));
    assert.equal(requests, 1, 'Generation cannot fetch even with forceRefresh');
    assert.ok(cached.length);
    console.log('PASS hook network policy: startup local, manual sync permitted, generation uses cache');
  } finally { global.fetch = original; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
