import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { COLOR_EDIT_PRESET, getColorEditAsset, renderColorEdit } from '../color-edit';

async function main() {
  // No user workbook, list or image cache is used by this regression test.
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dalat-color-cache-recovery-'));
  const pixels = Buffer.alloc(96 * 64 * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 17 + Math.floor(i / 101)) % 256;
  const source = await sharp(pixels, { raw: { width: 96, height: 64, channels: 3 } }).png().toBuffer();
  const sourceBefore = Buffer.from(source);
  const expected = await renderColorEdit(source);
  assert.deepEqual(await getColorEditAsset(source, root, COLOR_EDIT_PRESET), expected);
  const folder = path.join(root, 'photo-preset-cache', COLOR_EDIT_PRESET);
  const target = path.join(folder, (await fs.readdir(folder)).find(name => name.endsWith('.png'))!);

  const truncated = expected.subarray(0, Math.floor(expected.length / 2));
  // Prove this is the exact old failure: header valid, complete decode fails.
  assert.equal((await sharp(truncated).metadata()).format, 'png');
  await assert.rejects(() => sharp(truncated, { failOn: 'warning' }).stats());
  await fs.writeFile(target, truncated);
  const recovered = await Promise.all(Array.from({ length: 24 }, () => getColorEditAsset(source, root, COLOR_EDIT_PRESET)));
  recovered.forEach(body => assert.deepEqual(body, expected));
  assert.deepEqual(await fs.readFile(target), expected, 'Repaired cache must replace the broken file');
  await sharp(await fs.readFile(target), { failOn: 'warning' }).stats();
  assert.deepEqual(await getColorEditAsset(source, root, COLOR_EDIT_PRESET), expected, 'Next request must use healthy cache');

  const badChecksum = Buffer.from(expected);
  badChecksum[badChecksum.length - 1] ^= 1;
  for (const broken of [Buffer.from('not a PNG'), Buffer.alloc(0), expected.subarray(0, 33),
    expected.subarray(0, expected.length - 12), badChecksum]) {
    await fs.writeFile(target, broken);
    assert.deepEqual(await getColorEditAsset(source, root, COLOR_EDIT_PRESET), expected);
  }
  // A valid cache is reused, not written again on every image request.
  const before = (await fs.stat(target)).mtimeMs;
  assert.deepEqual(await getColorEditAsset(source, root, COLOR_EDIT_PRESET), expected);
  assert.equal((await fs.stat(target)).mtimeMs, before);
  assert.deepEqual(source, sourceBefore, 'Original photo must remain untouched');
  assert.equal((await fs.readdir(folder)).filter(name => name.endsWith('.tmp')).length, 0);
  console.log('PASS Color Edit cache recovery: truncated PNG, missing IEND, bad CRC, 24 concurrent retries, persisted repair, empty/garbage/header-only files, healthy-cache reuse; original unchanged.');
  console.log('TEST_CACHE=' + root);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
