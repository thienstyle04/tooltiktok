import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { REFERENCE_PHOTO_PRESETS, COLOR_EDIT_PRESET } from '../../../common/photo-preset-catalog';
import { applyListPhotoPreset, photoPresetsCatalog, validatePhotoPreset } from '../photo-presets';
import { getColorEditAsset, renderColorEdit } from '../color-edit';
import { GuideService } from '../guide.service';
import { AutomationSchedulerService } from '../automation-scheduler.service';

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-reference-palettes-'));
  const frontend = await import(pathToFileURL(path.resolve('../frontend/lib/photoPresets.mjs')).href);
  const catalog = photoPresetsCatalog().presets;
  assert.deepEqual(catalog.map(({ id, label, description }) => ({ id, label, description })), frontend.DEFAULT_PHOTO_PRESETS);
  assert.equal(catalog.length, 9);
  assert.equal(new Set(catalog.map(p => p.id)).size, 9);
  assert.deepEqual(REFERENCE_PHOTO_PRESETS.map(p => p.settings), [
    { exposure: 4, brightness: 53, highlights: -35, shadows: 36, brilliance: 20, contrast: 17, blackPoint: -15, saturation: 11, warmth: 13, sharpness: 77 },
    { exposure: -30, brilliance: -6, highlights: 15, shadows: 10, sharpness: 50, contrast: 8, brightness: 32, blackPoint: -6, saturation: 4, tint: 20 },
    { exposure: -5, brilliance: -25, highlights: -10, contrast: 15, blackPoint: 3, sharpness: 25, definition: 5 },
    { exposure: 9, brilliance: 100, highlights: -42, shadows: 22, contrast: 21, brightness: -16, saturation: 26, warmth: -18 },
    { exposure: -23, brilliance: -48, highlights: 34, shadows: -16, contrast: 30, blackPoint: 10, saturation: -25, warmth: -10, sharpness: 35, definition: 45 },
    { exposure: -15, vibrance: -15, contrast: 10, brightness: -5, blackPoint: 7, saturation: -10 },
    { exposure: -23, brilliance: -48, highlights: 34, shadows: -16, contrast: 42, blackPoint: 10, saturation: -25, warmth: -10, sharpness: 35, definition: 65 },
  ]);
  const pixels = Buffer.alloc(64 * 48 * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 37 + Math.floor(i / 192) * 13) % 256;
  const input = await sharp(pixels, { raw: { width: 64, height: 48, channels: 3 } }).png().toBuffer();
  const original = Buffer.from(input), hashes = new Set<string>();
  const service: any = Object.create(GuideService.prototype);
  service.dataRoot = root;
  service.getDriveFileAsset = async () => ({ body: input, isFallback: false });
  const scheduler: any = Object.create(AutomationSchedulerService.prototype);
  for (const p of catalog.filter(p => p.id)) {
    assert.equal(validatePhotoPreset(p.id, 'grid-4'), p.id);
    assert.throws(() => validatePhotoPreset(p.id, 'threads-mix-text'), /chỉ có chữ/);
    assert.equal(scheduler.validateTemplates([{ deckId: 'grid-4', count: 3, photoPreset: p.id }])[0].photoPreset, p.id);
    const list: any = { id: 'fixture', pages: [{ type: 'cover', backgroundImage: '/assets/drive-file?id=fixture' }] };
    applyListPhotoPreset(list, p.id);
    assert.equal(JSON.parse(JSON.stringify(list)).pages[0].photoPreset, p.id, 'Persist/reload preset unchanged');
    const rendered = frontend.photoRenderPage(list.pages[0], list.photoPreset);
    assert.ok(rendered.backgroundImage.includes('preset=' + p.id));
    assert.equal(list.pages[0].backgroundImage, '/assets/drive-file?id=fixture');
    const direct = await renderColorEdit(input, p.id!);
    const cached = await Promise.all(Array.from({ length: 3 }, () => getColorEditAsset(input, root, p.id!)));
    cached.forEach(body => assert.deepEqual(body, direct));
    assert.deepEqual(await service.getColorEditedAsset('/assets/drive-file?id=fixture', p.id), direct);
    const { data, info } = await sharp(direct).raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 64); assert.equal(info.height, 48);
    hashes.add(createHash('sha256').update(data).digest('hex'));
    await assert.rejects(() => service.getColorEditedAsset('https://example.com/a.jpg', p.id), /cache cục bộ/);
    applyListPhotoPreset(list, null); assert.equal(list.photoPreset, undefined); assert.equal(list.pages[0].photoPreset, undefined);
  }
  assert.equal(hashes.size, 8, 'All eight edited palettes produce independent pixels/cache');
  assert.deepEqual(input, original, 'Original image bytes never change');
  assert.deepEqual(await renderColorEdit(input), await renderColorEdit(input, COLOR_EDIT_PRESET));
  await assert.rejects(() => getColorEditAsset(input, root, '../bad'), /không được hỗ trợ/);
  for (const p of REFERENCE_PHOTO_PRESETS) await assert.rejects(() => renderColorEdit(Buffer.from('broken'), p.id));
  console.log('PASS 7 reference recipes, frontend/API parity, 8 distinct cached renders, validation, scheduler, saved snapshots and immutable sources.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
