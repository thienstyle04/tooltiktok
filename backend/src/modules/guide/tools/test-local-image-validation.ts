import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { validateLocalImages } from '../sync/local-image-validation';

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-image-validation-'));
  const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#ff7700' } }).png().toBuffer();
  const put = (id: string, body: Buffer, contentType = 'image/png') => {
    fs.writeFileSync(path.join(dir, `${id}.bin`), body);
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ contentType, contentLength: body.length }));
  };
  put('valid', image);
  put('html', Buffer.from('<html>quota exceeded</html>'));
  put('broken', image.subarray(0, 40));
  put('placeholder', Buffer.from('<svg></svg>'), 'image/svg+xml');
  fs.writeFileSync(path.join(dir, 'partial.bin.partial'), image);
  const results = await validateLocalImages(dir, ['valid', 'html', 'broken', 'placeholder', 'partial', 'missing']);
  assert.deepEqual(results.map(item => item.status), ['valid', 'corrupt', 'corrupt', 'corrupt', 'missing', 'missing']);
  assert.equal((await validateLocalImages(dir, ['valid']))[0].checkedAt, results[0].checkedAt);
  put('broken', image);
  assert.equal((await validateLocalImages(dir, ['broken']))[0].status, 'valid');
  assert.ok(fs.existsSync(path.join(dir, 'validation-state.json')));
  // Only the exact test-owned temporary directory is removed.
  fs.rmSync(dir, { recursive: true });
  console.log('PASS: real decode, HTML, corrupt, placeholder, partial, missing, memoization, recovered image');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
