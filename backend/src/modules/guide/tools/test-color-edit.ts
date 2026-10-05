import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { COLOR_EDIT_PRESET, getColorEditAsset, renderColorEdit } from '../color-edit';
import { GuideService } from '../guide.service';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../app.module';

async function main() {
  const root = path.resolve(process.env.AUDIT_ROOT!);
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'generation.json'), 'utf8'));
  const deck = fixture.decks[0];
  const v5 = deck.id === 'spotlight-v5-color-edit';
  assert.ok(v5 || deck.id === 'spotlight-v6-color-edit');
  assert.equal(deck.lists.length, 4);
  for (const list of deck.lists) {
    assert.equal(list.photoPreset, COLOR_EDIT_PRESET);
    assert.equal(list.canvasPreset, v5 ? 'tiktok-4x5' : 'tiktok-9x16');
    assert.equal(list.pages.length, v5 ? 15 : 14);
    assert(list.pages.every((p: any) => p.photoPreset === COLOR_EDIT_PRESET));
    const items = list.pages.flatMap((p: any) => p.items || []);
    assert.equal(items.length, v5 ? 13 : 8);
    assert.equal(items.filter((p: any) => p.isPartner).length, v5 ? 7 : 4);
    assert.equal(new Set(items.map((p: any) => p.name)).size, v5 ? 13 : 8);
    assert.equal(new Set(list.pages.map((p: any) => p.backgroundImage)).size, v5 ? 15 : 14);
  }
  const original = Buffer.from([20, 20, 20, 130, 130, 130, 245, 245, 245]);
  const input = await sharp(original, { raw: { width: 3, height: 1, channels: 3 } }).png().toBuffer();
  const output = await renderColorEdit(input);
  const raw = await sharp(output).raw().toBuffer();
  assert(raw[0] > 0 && raw[0] < raw[3] && raw[3] < raw[6] && raw[6] < 245);
  const copies = await Promise.all(Array.from({ length: 8 }, () => getColorEditAsset(input, root, COLOR_EDIT_PRESET)));
  copies.forEach(body => assert.deepEqual(body, output));
  assert.deepEqual(await getColorEditAsset(input, root, COLOR_EDIT_PRESET), output);
  await assert.rejects(() => getColorEditAsset(input, root, 'bad-preset'));
  await assert.rejects(() => renderColorEdit(Buffer.from('broken image')));
  const service: any = Object.create(GuideService.prototype);
  service.dataRoot = path.join(root, 'data');
  service.getDriveFileAsset = async (id: string) => ({ body: fs.readFileSync(path.join(root, 'data/drive-file-cache', id + '.bin')), isFallback: false });
  await assert.rejects(() => service.getColorEditedAsset('https://example.com/photo.jpg', COLOR_EDIT_PRESET));
  await assert.rejects(() => service.getColorEditedAsset('/assets/drive-file?id=x', 'unknown'));
  for (const list of deck.lists) for (const page of list.pages) {
    const source = page.items?.[0]?.imageUrl || page.backgroundImage;
    const edited = await service.getColorEditedAsset(source, COLOR_EDIT_PRESET);
    assert.equal((await sharp(edited).metadata()).format, 'png');
  }
  service.getDriveFileAsset = async () => ({ body: input, isFallback: true });
  await assert.rejects(() => service.getColorEditedAsset('/assets/drive-file?id=missing', COLOR_EDIT_PRESET));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'original-integrity.json'), 'utf8')).changed, []);
  Object.assign(process.env, { DALAT_DATA_DIR: path.join(root, 'data'), DALAT_DRIVE_FILE_CACHE_DIR: path.join(root, 'data/drive-file-cache'),
    DALAT_AUTO_SYNC_SHEET: 'false', DALAT_AUTO_WARM_DRIVE_CACHE: 'false' });
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    const url = String(args[0]);
    if (!url.startsWith('http://127.0.0.1:')) throw Error('Test: external network disabled');
    return nativeFetch(...args);
  }) as typeof fetch;
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    await app.listen(0, '127.0.0.1');
    const reloaded: any = app.get(GuideService);
    while (reloaded.destinationDataLoading) await new Promise(r => setTimeout(r, 50));
    const dataset = await reloaded.getDataset();
    const saved = dataset.decks.find((d: any) => d.id === deck.id).lists.filter((l: any) => deck.lists.some((s: any) => s.id === l.id));
    assert.equal(saved.length, 4);
    saved.forEach((l: any) => { assert.equal(l.photoPreset, COLOR_EDIT_PRESET); assert(l.pages.every((p: any) => p.photoPreset === COLOR_EDIT_PRESET)); });
    const source = deck.lists[0].pages[0].backgroundImage;
    const url = (await app.getUrl()) + '/assets/color-edit?preset=' + COLOR_EDIT_PRESET + '&source=' + encodeURIComponent(source);
    const response = await fetch(url);
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.equal((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).format, 'png');
    assert.equal((await fetch(url.replace(COLOR_EDIT_PRESET, 'bad-preset'))).status, 400);
  } finally { await app.close(); globalThis.fetch = nativeFetch; }
  console.log(`PASS ${deck.id}: four saved lists ${v5?15:14} pages / ${v5?7:4} partners; reload/preset/cache and processing failure checks passed.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
