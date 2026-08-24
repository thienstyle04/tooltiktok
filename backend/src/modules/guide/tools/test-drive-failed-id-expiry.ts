import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  clearDriveAccessibilityCache,
  configureDriveFileDiskCache,
  getCachedDriveFileAccessibility,
  isKnownFailedDriveFileId,
  setCachedDriveFileAccessibility,
} from '../sync/drive-images';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-drive-failed-id-'));
const failedPath = path.join(tempRoot, 'failed-file-ids.json');
const originalNow = Date.now;

try {
  let now = originalNow();
  Date.now = () => now;

  fs.writeFileSync(failedPath, JSON.stringify({
    savedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    fileIds: ['stale-network-failure'],
  }));
  configureDriveFileDiskCache(tempRoot);
  assert.equal(isKnownFailedDriveFileId('stale-network-failure'), false);

  fs.writeFileSync(failedPath, JSON.stringify({
    savedAt: new Date().toISOString(),
    fileIds: ['fresh-network-failure'],
  }));
  configureDriveFileDiskCache(tempRoot);
  assert.equal(isKnownFailedDriveFileId('fresh-network-failure'), true);

  now += 11 * 60 * 1000;
  assert.equal(
    isKnownFailedDriveFileId('fresh-network-failure'),
    false,
    'A failed ID must expire in the same backend process without a restart',
  );

  clearDriveAccessibilityCache();
  setCachedDriveFileAccessibility('transient-access-failure', false);
  assert.equal(getCachedDriveFileAccessibility('transient-access-failure'), false);
  now += 61 * 1000;
  assert.equal(
    getCachedDriveFileAccessibility('transient-access-failure'),
    undefined,
    'A transient negative accessibility probe must expire and become retryable',
  );

  console.log('PASS: transient Drive failures expire in the same process and become retryable.');
} finally {
  Date.now = originalNow;
  clearDriveAccessibilityCache();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
