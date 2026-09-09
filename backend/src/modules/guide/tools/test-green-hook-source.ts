import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { GreenHookSourceStore } from '../sync/green-hook-source';

async function main(): Promise<void> {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-green-hook-'));
  const docUrl = 'https://docs.google.com/document/d/green-doc-test/edit';
  try {
    let shouldFail = false;
    const fetchDoc = async () => {
      if (shouldFail) throw new Error('mất mạng thử nghiệm');
      return 'Hook xanh A\nHook xanh B\nHook xanh A\n';
    };
    const store = new GreenHookSourceStore(dataRoot, fetchDoc, () => 0);
    await store.ensureReady(docUrl);
    assert.deepEqual(store.getCachedHooks(), ['Hook xanh A', 'Hook xanh B']);
    const first = store.reserve();
    const concurrent = store.reserve();
    assert.notEqual(first.hook, concurrent.hook);
    store.commit(first);
    store.rollback(concurrent);

    const second = store.reserve();
    assert.equal(second.hook, 'Hook xanh B');
    store.commit(second);
    const restarted = new GreenHookSourceStore(dataRoot, fetchDoc, () => 0);
    const newRound = restarted.reserve();
    assert.equal(newRound.hook, 'Hook xanh A');
    restarted.rollback(newRound);

    shouldFail = true;
    await restarted.ensureReady(docUrl, true);
    assert.deepEqual(restarted.getCachedHooks(), ['Hook xanh A', 'Hook xanh B']);

    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-green-hook-empty-'));
    try {
      const empty = new GreenHookSourceStore(emptyRoot, async () => { throw new Error('offline'); });
      await assert.rejects(() => empty.ensureReady(docUrl), /Không tải được Hook mảng xanh/);
    } finally {
      fs.rmSync(emptyRoot, { recursive: true, force: true });
    }
    console.log('PASS Hook mảng xanh: parse/loại trùng, reserve đồng thời, commit/rollback, restart và cache cũ khi lỗi.');
  } finally {
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
}

void main();
