import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { DarkHookSourceStore } from '../sync/dark-hook-source';

async function main(): Promise<void> {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-dark-hook-'));
  const docUrl = 'https://docs.google.com/document/d/dark-doc-test/edit';
  try {
    let shouldFail = false;
    const fetchDoc = async () => {
      if (shouldFail) throw new Error('mất mạng thử nghiệm');
      return 'Hook tối A\nHook tối B\nHook tối A\n';
    };
    const store = new DarkHookSourceStore(dataRoot, fetchDoc, () => 0);
    await store.ensureReady(docUrl);
    assert.deepEqual(store.getCachedHooks(), ['Hook tối A', 'Hook tối B']);
    const first = store.reserve();
    const concurrent = store.reserve();
    assert.notEqual(first.hook, concurrent.hook);
    store.commit(first);
    store.rollback(concurrent);

    const second = store.reserve();
    assert.equal(second.hook, 'Hook tối B');
    store.commit(second);
    const restarted = new DarkHookSourceStore(dataRoot, fetchDoc, () => 0);
    const newRound = restarted.reserve();
    assert.equal(newRound.hook, 'Hook tối A');
    restarted.rollback(newRound);

    shouldFail = true;
    await restarted.ensureReady(docUrl, true);
    assert.deepEqual(restarted.getCachedHooks(), ['Hook tối A', 'Hook tối B']);

    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-dark-hook-empty-'));
    try {
      const empty = new DarkHookSourceStore(emptyRoot, async () => { throw new Error('offline'); });
      await assert.rejects(() => empty.ensureReady(docUrl), /Không tải được Hook tone tối/);
    } finally {
      fs.rmSync(emptyRoot, { recursive: true, force: true });
    }
    console.log('PASS Hook tone tối: parse/loại trùng, reserve đồng thời, commit/rollback, restart và cache cũ khi lỗi.');
  } finally {
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
}

void main();
