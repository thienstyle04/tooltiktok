import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { configureDriveFileDiskCache, isKnownFailedDriveFileId } from '../sync/drive-images';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-drive-failed-id-'));
const failedPath = path.join(tempRoot, 'failed-file-ids.json');

try {
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

  console.log('PASS: ID ảnh lỗi tạm hết hạn và được thử tải lại ở phiên sau.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
