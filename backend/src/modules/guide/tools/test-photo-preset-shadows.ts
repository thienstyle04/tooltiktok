// Bộ màu 01/02 nâng vùng tối mạnh: trước đây hệ số sáng tone/y nhân cả vào màu nên nhiễu
// gần đen thành mảng xanh dương/đen loang (góp ý 2026-10-22). Ảnh tổng hợp, không đọc dữ liệu thật.
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { REFERENCE_PHOTO_PRESETS } from '../../../common/photo-preset-catalog';
import { renderColorEdit } from '../color-edit';

const pixels: Array<[number, number, number]> = [
  [0, 0, 0], [2, 2, 9], [3, 1, 6], [6, 3, 2], [1, 4, 2], // gần đen, nhiễu màu nhẹ
  [40, 60, 90], [120, 100, 80], [200, 180, 160], [250, 250, 250], [180, 40, 40],
];

async function render(preset: string): Promise<Buffer> {
  const input = await sharp(Buffer.from(pixels.flat()), { raw: { width: pixels.length, height: 1, channels: 3 } }).png().toBuffer();
  return (await sharp(await renderColorEdit(input, preset)).raw().toBuffer());
}

async function main() {
  for (const preset of REFERENCE_PHOTO_PRESETS) {
    const out = await render(preset.id);
    const at = (i: number) => [out[i * 3], out[i * 3 + 1], out[i * 3 + 2]];
    // Gần đen: được nâng sáng thành xám, không thành màu chói.
    for (let i = 0; i < 5; i++) {
      const [r, g, b] = at(i);
      assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 24, `${preset.id}: pixel tối ${pixels[i]} thành màu chói ${[r, g, b]}`);
    }
    // Đen tuyệt đối không bị ép đen giữa vùng tối đã nâng sáng (mảng đen loang).
    const black = at(0), nearBlack = at(1);
    assert.ok(Math.abs(black[1] - nearBlack[1]) <= 12, `${preset.id}: pixel đen ${black} lệch xa pixel gần đen ${nearBlack}`);
  }
  // Pixel trung tính/sáng giữ nguyên hướng màu (đỏ vẫn đỏ) ở mọi bộ.
  for (const preset of REFERENCE_PHOTO_PRESETS) {
    const out = await render(preset.id);
    const red = [out[27], out[28], out[29]];
    assert.ok(red[0] > red[1] && red[0] > red[2], `${preset.id}: pixel đỏ đổi hướng màu ${red}`);
  }
  console.log('PASS 7 bộ màu: vùng tối không vỡ màu xanh/đen loang, màu sáng giữ hướng.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
