import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { configureDriveFileDiskCache, fetchDriveFileAsset } from '../sync/drive-images';

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-placeholder-retry-'));
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let available = false;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  try {
    configureDriveFileDiskCache(root);
    globalThis.fetch = async () => {
      calls++;
      return available
        ? new Response(png, { headers: { 'content-type': 'image/png' } })
        : new Response('unavailable', { status: 404 });
    };
    const first = await fetchDriveFileAsset('test-recovered-file');
    assert.equal(first.isFallback, true);
    assert.equal(calls, 3);
    assert.equal(fs.existsSync(path.join(root, 'test-recovered-file.bin')), false);
    available = true;
    const recovered = await Promise.all([
      fetchDriveFileAsset('test-recovered-file'), fetchDriveFileAsset('test-recovered-file'),
    ]);
    assert.ok(recovered.every((asset) => !asset.isFallback));
    assert.equal(calls, 4, 'Immediate retry recovers; concurrent downloads deduplicated');
    await fetchDriveFileAsset('test-recovered-file');
    assert.equal(calls, 4, 'Successful image remains cached');
    console.log('PASS: new-machine empty cache, placeholder recovery, deduplication and success cache');
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
