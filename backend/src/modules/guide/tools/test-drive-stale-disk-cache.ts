import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  configureDriveFileDiskCache,
  fetchDriveFileAsset,
  hasDriveFileDiskCache,
  listUncachedDriveFileIds,
} from '../sync/drive-images';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-drive-stale-cache-'));
const fileId = 'stale-but-valid-image';
const imageBody = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function main(): Promise<void> {
  try {
    fs.writeFileSync(path.join(tempRoot, `${fileId}.bin`), imageBody);
    fs.writeFileSync(path.join(tempRoot, `${fileId}.json`), JSON.stringify({
      fileId,
      contentType: 'image/png',
      contentLength: imageBody.byteLength,
      savedAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
    }));
    configureDriveFileDiskCache(tempRoot);
  
    assert.equal(
      hasDriveFileDiskCache(fileId),
      true,
      'Valid image bytes on disk must remain reusable after 30 days',
    );
    assert.deepEqual(
      listUncachedDriveFileIds([fileId, 'missing-image']),
      ['missing-image'],
      'Warm-up must download only files that are genuinely missing',
    );
  
    const asset = await fetchDriveFileAsset(fileId);
    assert.equal(asset.isFallback, false);
    assert.equal(asset.contentType, 'image/png');
    assert.deepEqual(asset.body, imageBody);
  
    console.log('PASS: valid disk cache stays durable and avoids unnecessary Drive downloads.');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
