import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { addThreadsFoodFiles, compactThreadsLocalAddress, threadsFoodPayload } from '../lib/threadsFoodExport.mjs';

const items = Array.from({ length: 10 }, (_, index) => {
  const partner = index % 2 === 0;
  const photo = index < 6;
  return {
    name: 'Quán số ' + (index + 1),
    sourceSectionKey: ['quan_an', 'check_in', 'cafe', 'khu_du_lich', 'homestay'][index % 5],
    isPartner: partner,
    isLocal: !partner,
    metaPrimary: partner ? 'Tổ 19 An Sơn, Xuân Hương - Đà Lạt' : '',
    imageUrl: photo ? 'https://example.invalid/' + index + '.jpg' : '',
    imageMapped: photo,
    imageSource: photo ? 'manual' : 'fallback',
  };
});
const list = { postCaption: 'Đi ăn quán nào trước? 👇', pages: [{ type: 'list', items }] };
const payload = threadsFoodPayload(list);
assert.equal(payload.photos.length, 6);
assert.equal(payload.partnerNames.length, 5);
assert.ok(payload.txt.startsWith('\uFEFF'));
assert.ok(payload.txt.includes('- Quán số 1 (Xuân Hương - Đà Lạt)'));
assert.ok(!payload.txt.includes('Tổ 19 An Sơn'));
assert.ok(payload.txt.includes('- Quán số 10\r\n'));
assert.ok(!payload.txt.includes('01. Quán'));
assert.ok(!payload.txt.includes('example.invalid'));
const cafePayload = threadsFoodPayload({ ...list, id: 'threads-cafe-local-caption-01', postCaption: 'Quán cà phê nào đáng đi?' });
assert.ok(cafePayload.txt.includes('- Quán số 1 (Xuân Hương - Đà Lạt)'));
assert.equal(cafePayload.partnerNames.length, 5);
const mixPayload = threadsFoodPayload({ ...list, id: 'threads-mix-local-caption-01', pages: [{ type: 'list', items: items.map((item) => ({ ...item, isLocal: false })) }] });
assert.equal(mixPayload.partnerNames.length, 5);
assert.ok(mixPayload.txt.includes('- Quán số 1 (Xuân Hương - Đà Lạt)'));
const textItems = [...items, { ...items[0], name: 'Quán số 11' }, { ...items[1], name: 'Quán số 12' }]
  .map((item) => ({ ...item, isLocal: false, imageUrl: '', imageMapped: false, imageSource: 'fallback' }));
const textList = { ...list, id: 'threads-mix-text-caption-01', pages: [{ type: 'list', items: textItems }] };
const textPayload = threadsFoodPayload(textList);
assert.equal(textPayload.photos.length, 0);
assert.equal(textPayload.partnerNames.length, 6);
assert.ok(textPayload.txt.includes('- Quán số 12\r\n'));
assert.ok(!textPayload.txt.includes('Tổ 19 An Sơn'));
assert.throws(() => threadsFoodPayload({ ...textList, pages: [{ type: 'list', items: textItems.slice(1) }] }), /12 tên/);
assert.throws(() => threadsFoodPayload({ ...textList, pages: [{ type: 'list', items: textItems.map((item, index) => index === 0 ? { ...item, imageUrl: 'https:\/\/example.invalid\/extra.jpg' } : item) }] }), /không được chứa ảnh/);
assert.equal(compactThreadsLocalAddress('51 Trần Bình Trọng, Cam Ly - Đà Lạt'), 'Cam Ly - Đà Lạt');
assert.equal(compactThreadsLocalAddress('51 Trần Bình Trọng, Phường Xuân Hương - Đà Lạt'), 'Xuân Hương - Đà Lạt');
assert.equal(compactThreadsLocalAddress('Xuân Hương, Đà Lạt'), 'Xuân Hương - Đà Lạt');
assert.equal(compactThreadsLocalAddress('Hẻm 8 Trần Nhật Duật'), 'Hẻm 8 Trần Nhật Duật');
assert.equal(compactThreadsLocalAddress('51 Trần Bình Trọng, Đà Lạt, Lâm Đồng'), '51 Trần Bình Trọng, Đà Lạt, Lâm Đồng');
assert.throws(() => threadsFoodPayload({ ...list, id: 'threads-cafe-local-caption-01', pages: [{ type: 'list', items: items.slice(1) }] }), /Threads Cà phê/);
assert.throws(() => threadsFoodPayload({ ...list, pages: [{ type: 'list', items: items.slice(1) }] }), /10 tên/);
assert.throws(() => threadsFoodPayload({ ...list, pages: [{ type: 'list', items: items.map((item) => ({ ...item, imageUrl: '' })) }] }), /6 ảnh/);
assert.throws(() => threadsFoodPayload({ ...list, pages: [{ type: 'list', items: items.map((item) => ({ ...item, metaPrimary: '' })) }] }), /thiếu địa chỉ/);
const zip = new JSZip();
let exportedPartners = [];
await addThreadsFoodFiles(zip, list, async () => ({ blob: new Uint8Array([0xff, 0xd8, 0xff]), extension: 'jpg' }), (name) => name.replaceAll(' ', '-'), async (names) => {
  exportedPartners = names;
  return new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
});
const archive = await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }));
const files = Object.keys(archive.files).filter((name) => !archive.files[name].dir);
assert.equal(files.length, 8);
assert.equal(files.filter((name) => name.startsWith('anh/') && name.endsWith('.jpg')).length, 6);
assert.deepEqual(exportedPartners, ['Quán số 1', 'Quán số 3', 'Quán số 5', 'Quán số 7', 'Quán số 9']);
assert.ok(archive.file('doi-tac.xlsx'));
assert.equal((await archive.file('noi-dung.txt').async('string')).includes('- Quán số 10'), true);
const textZip = new JSZip();
let textPartnerNames = [];
await addThreadsFoodFiles(textZip, textList, async () => { throw new Error('Mẫu chữ không được tải ảnh'); }, (name) => name, async (names) => {
  textPartnerNames = names;
  return new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
});
const textArchive = await JSZip.loadAsync(await textZip.generateAsync({ type: 'nodebuffer' }));
assert.deepEqual(Object.keys(textArchive.files).sort(), ['doi-tac.xlsx', 'noi-dung.txt']);
assert.equal(textPartnerNames.length, 6);
console.log('Threads food TXT/XLSX/ZIP payload OK');
