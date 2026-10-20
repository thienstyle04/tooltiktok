import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { DRIVE_THUMB_WIDTH, driveThumbnail } from '../drive-thumbnails';

// Ảnh thu nhỏ cho thumbnail giao diện: nhỏ, đúng chiều rộng, cache trên đĩa, tự sửa cache hỏng,
// không đụng ảnh thay thế/ảnh lạ. Ảnh tự sinh, thư mục tạm; không dùng dữ liệu hay cache thật.
async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dalat-drive-thumbs-'));
  try {
    const width = 2400, height = 3200;
    const pixels = Buffer.alloc(width * height * 3);
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 31 + Math.floor(i / 977)) % 256;
    const original = await sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
    const source = { body: original, contentLength: original.length, contentType: 'image/jpeg' };

    const first = await driveThumbnail(source, root);
    assert.equal(first.contentType, 'image/webp');
    const meta = await sharp(first.body).metadata();
    assert.equal(meta.width, DRIVE_THUMB_WIDTH);
    assert.equal(meta.height, Math.round(height * DRIVE_THUMB_WIDTH / width));
    assert.ok(first.body.length * 20 < original.length, `thumbnail ${first.body.length}B phải nhỏ hơn nhiều so với ảnh gốc ${original.length}B`);
    assert.deepEqual(source.body, original, 'Ảnh gốc không bị đổi');

    const folder = path.join(root, 'drive-file-cache-thumbs');
    const files = (await fs.readdir(folder)).filter(name => name.endsWith('.webp'));
    assert.equal(files.length, 1, 'Ghi đúng một file cache, không để lại file tạm');
    assert.deepEqual((await fs.readdir(folder)).filter(name => name.endsWith('.tmp')), []);

    // Lần sau đọc cache; nhiều yêu cầu cùng lúc dùng chung một lần xử lý.
    const again = await Promise.all(Array.from({ length: 12 }, () => driveThumbnail(source, root)));
    again.forEach(asset => assert.deepEqual(asset.body, first.body));

    // Cache bị cắt dở (header vẫn hợp lệ) phải được dựng lại.
    const target = path.join(folder, files[0]);
    await fs.writeFile(target, first.body.subarray(0, Math.floor(first.body.length / 2)));
    const repaired = await driveThumbnail(source, root);
    assert.deepEqual(repaired.body, first.body);
    assert.deepEqual(await fs.readFile(target), first.body, 'File cache hỏng được thay bằng bản đúng');

    // Ảnh nhỏ hơn khung không bị phóng to.
    const small = await sharp(Buffer.alloc(120 * 90 * 3, 128), { raw: { width: 120, height: 90, channels: 3 } }).png().toBuffer();
    assert.equal((await sharp((await driveThumbnail({ body: small, contentLength: small.length, contentType: 'image/png' }, root)).body).metadata()).width, 120);

    // Ảnh thay thế (chưa có cache hợp lệ) và loại không phải ảnh chụp giữ nguyên.
    const fallback = { body: Buffer.from('<svg/>'), contentLength: 6, contentType: 'image/svg+xml', isFallback: true };
    assert.equal(await driveThumbnail(fallback, root), fallback);
    const svg = { body: Buffer.from('<svg/>'), contentLength: 6, contentType: 'image/svg+xml' };
    assert.equal(await driveThumbnail(svg, root), svg);
    // Dữ liệu hỏng sharp không đọc được: trả ảnh gốc thay vì làm lỗi giao diện.
    const broken = { body: Buffer.from('not a jpeg'), contentLength: 10, contentType: 'image/jpeg' };
    assert.equal(await driveThumbnail(broken, root), broken);

    console.log(`PASS drive thumbnails: ${original.length}B → ${first.body.length}B WebP ${DRIVE_THUMB_WIDTH}px, disk cache, shared in-flight work, truncated cache repaired, no upscale, fallback/svg/broken passthrough`);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
