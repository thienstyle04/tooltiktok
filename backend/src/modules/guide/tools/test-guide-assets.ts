import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GuideService } from '../guide.service';
import sharp from 'sharp';

// Chốt hành vi phục vụ file tĩnh/asset: chặn đường dẫn thoát thư mục, MIME,
// và getColorEditedAsset phải đi qua getDriveFileAsset của chính service
// (test khác thay thế hàm đó trên instance).
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-assets-'));
const write = (relative: string, body: string) => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
};
write('tool/a.txt', 'tool-text');
write('front/styles.css', 'body{}');
write('secret.txt', 'outside');
write('workspace/img/x.png', 'workspace-png');
write('dalat/d.jpg', 'dalat-jpg');
write('tiktok/folder/t.jpg', 'tiktok-jpg');

const configure = (service: any) => {
  for (const [key, value] of Object.entries({
    toolRoot: path.join(root, 'tool'), frontendRoot: path.join(root, 'front'), workspaceRoot: path.join(root, 'workspace'),
    dalatImageDir: path.join(root, 'dalat'), tiktokReferenceDir: path.join(root, 'tiktok'), dataRoot: path.join(root, 'data'),
  })) Object.defineProperty(service, key, { value, configurable: true });
  return service;
};

async function check(service: any, label: string) {
  assert.equal(service.getToolTextFile('a.txt'), 'tool-text', label);
  assert.equal(service.getToolBinaryFile('a.txt').toString(), 'tool-text');
  assert.equal(service.getFrontendTextFile('styles.css'), 'body{}');
  assert.equal(service.getFrontendBinaryFile('styles.css').toString(), 'body{}');
  for (const read of [
    () => service.getToolTextFile('../secret.txt'), () => service.getToolBinaryFile('missing.txt'),
    () => service.getFrontendTextFile('../secret.txt'), () => service.getFrontendBinaryFile(''),
    () => service.getWorkspaceAsset(''), () => service.getWorkspaceAsset('../secret.txt'),
    () => service.getDalatAsset('../secret.txt'), () => service.getTiktokAsset('..', 'secret.txt'),
  ]) assert.throws(read, NotFoundException, label);
  assert.equal(service.getWorkspaceAsset('img/x.png').toString(), 'workspace-png');
  assert.equal(service.getDalatAsset('d.jpg').toString(), 'dalat-jpg');
  assert.equal(service.getTiktokAsset('folder', 't.jpg').toString(), 'tiktok-jpg');

  assert.equal(service.guessMime('a.WEBP'), 'image/webp');
  assert.equal(service.guessMime('a.jfif'), 'image/jpeg');
  assert.equal(service.guessMime('a.css'), 'text/css; charset=utf-8');
  assert.equal(service.guessMime('a.unknown'), 'application/octet-stream');

  const mappingCalls: unknown[] = [];
  service.loadImageMapping = (allowLegacy: unknown) => { mappingCalls.push(allowLegacy); return { libraryRoots: [] }; };
  assert.throws(() => service.getLibraryAsset('x.png', 'khong-co'), NotFoundException);
  assert.deepEqual(mappingCalls, [true], 'Library asset phải đọc mapping kể cả asset cũ');

  await assert.rejects(() => service.getDriveFileAsset('  '), NotFoundException);
  const driveCalls: string[] = [];
  service.getDriveFileAsset = async (id: string) => { driveCalls.push(id); return { body: Buffer.from('x'), isFallback: true }; };
  await assert.rejects(() => service.getColorEditedAsset('/assets/drive-file?id=abc', 'khong-ho-tro'), BadRequestException);
  await assert.rejects(() => service.getColorEditedAsset('https://example.com/a.jpg', 'iphone-color-edit-v1'), BadRequestException);
  await assert.rejects(() => service.getColorEditedAsset('//example.com/a.jpg', 'iphone-color-edit-v1'), BadRequestException);
  await assert.rejects(() => service.getColorEditedAsset('/assets/khac?id=1', 'iphone-color-edit-v1'), BadRequestException);
  await assert.rejects(() => service.getColorEditedAsset('/assets/drive-file?id=abc', 'iphone-color-edit-v1'), /chưa có cache hợp lệ/);
  assert.deepEqual(driveCalls, ['abc'], 'Color edit phải dùng getDriveFileAsset của instance');

  assert.deepEqual(await service.getDriveFilesCacheStatus(['', ' ']), { total: 0, cached: 0, missing: [], images: [] });
  assert.deepEqual(await service.prefetchDriveFiles([]), { total: 0, skipped: 0, ok: 0, fail: 0, cancelled: false });
}

async function main() {
  await check(configure(new GuideService()), 'new GuideService()');
  // Nhiều test dựng service bằng Object.create (không chạy constructor).
  await check(configure(Object.create(GuideService.prototype)), 'Object.create');
  const priorLocalRoot = process.env.DALAT_LOCAL_TEMPLATES_DIR;
  const localRoot = path.join(root, 'templates'), packageRoot = path.join(localRoot, 'local-asset-fixture');
  fs.mkdirSync(path.join(packageRoot, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'template.json'), JSON.stringify({ id: 'local-asset-fixture', version: 1, name: 'Fixture', description: '', allowedSourceIds: ['fixture'], builder: 'builder.cjs', assets: ['photo.png', 'font.woff2'] }));
  const photo = await sharp({ create: { width: 24, height: 32, channels: 3, background: '#a0b0c0' } }).png().toBuffer();
  fs.writeFileSync(path.join(packageRoot, 'assets', 'photo.png'), photo);
  fs.writeFileSync(path.join(packageRoot, 'assets', 'font.woff2'), 'not-a-photo');
  process.env.DALAT_LOCAL_TEMPLATES_DIR = localRoot;
  try {
    const service = configure(new GuideService());
    const edited = await service.getColorEditedAsset('/api/local-templates/local-asset-fixture/1/assets/photo.png', 'iphone-color-edit-v1');
    assert.equal((await sharp(edited).metadata()).width, 24);
    assert.ok(fs.readFileSync(path.join(packageRoot, 'assets', 'photo.png')).equals(photo), 'Do not overwrite original local photograph');
    await assert.rejects(() => service.getColorEditedAsset('/api/local-templates/local-asset-fixture/1/assets/font.woff2', 'iphone-color-edit-v1'), /không phải ảnh/);
    await assert.rejects(() => service.getColorEditedAsset('/api/local-templates/local-asset-fixture/2/assets/photo.png', 'iphone-color-edit-v1'), /Không tìm thấy/);
    await assert.rejects(() => service.getColorEditedAsset('/api/local-templates/local-asset-fixture/1/assets/other.png', 'iphone-color-edit-v1'), /Không tìm thấy/);
    await assert.rejects(() => service.getColorEditedAsset('/api/local-templates/local-asset-fixture/1/assets/../../secret.png', 'iphone-color-edit-v1'), BadRequestException);
  } finally {
    if (priorLocalRoot === undefined) delete process.env.DALAT_LOCAL_TEMPLATES_DIR; else process.env.DALAT_LOCAL_TEMPLATES_DIR = priorLocalRoot;
  }
  fs.rmSync(root, { recursive: true, force: true });
  console.log('PASS guide assets: tool/frontend/asset paths, traversal blocked, MIME, library mapping, color-edit uses instance drive asset');
}

main().catch((error) => { console.error(error); process.exit(1); });
