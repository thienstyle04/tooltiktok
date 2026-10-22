import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { createRequire } from 'node:module';
import { addThreadsFoodFiles, compactThreadsLocalAddress, threadsLocalAddress, threadsFoodPayload } from '../lib/threadsFoodExport.mjs';

const items = Array.from({ length: 10 }, (_, index) => {
  const partner = index % 2 === 0;
  const photo = index < 6;
  return {
    name: 'Quán số ' + (index + 1),
    sourceSectionKey: ['quan_an', 'check_in', 'cafe', 'khu_du_lich', 'homestay'][index % 5],
    isPartner: partner,
    isLocal: !partner,
    metaPrimary: partner ? 'Tổ 19 An Sơn' : '',
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
assert.ok(payload.txt.includes('- Quán số 1 (Tổ 19 An Sơn)'));
assert.ok(!payload.txt.includes('Xuân Hương'));
assert.ok(!payload.txt.includes('- Quán số 1 (Xuân Hương - Đà Lạt)'));
assert.ok(payload.txt.includes('- Quán số 10\r\n'));
assert.ok(!payload.txt.includes('01. Quán'));
assert.ok(!payload.txt.includes('example.invalid'));
const cafePayload = threadsFoodPayload({ ...list, id: 'threads-cafe-local-caption-01', postCaption: 'Quán cà phê nào đáng đi?' });
assert.ok(cafePayload.txt.includes('- Quán số 1 (Tổ 19 An Sơn)'));
assert.equal(cafePayload.partnerNames.length, 5);
const mixPayload = threadsFoodPayload({ ...list, id: 'threads-mix-local-caption-01', pages: [{ type: 'list', items: items.map((item) => ({ ...item, isLocal: false })) }] });
assert.equal(mixPayload.partnerNames.length, 5);
assert.ok(mixPayload.txt.includes('- Quán số 1 (Tổ 19 An Sơn)'));
const textItems = [...items, { ...items[0], name: 'Quán số 11' }, { ...items[1], name: 'Quán số 12' }]
  .map((item) => ({ ...item, isLocal: false, imageUrl: '', imageMapped: false, imageSource: 'fallback' }));
const textList = { ...list, id: 'threads-mix-text-caption-01', pages: [{ type: 'list', items: textItems }] };
const textPayload = threadsFoodPayload(textList);
assert.equal(textPayload.photos.length, 0);
assert.equal(textPayload.partnerNames.length, 6);
assert.ok(textPayload.txt.includes('- Quán số 12\r\n'));
assert.ok(textPayload.txt.includes('Tổ 19 An Sơn'));
assert.equal(threadsLocalAddress('51 Trần Bình Trọng, Cam Ly - Đà Lạt'), '51 Trần Bình Trọng, Cam Ly - Đà Lạt');
assert.equal(threadsLocalAddress('  Hẻm 8   Trần Nhật Duật\n'), 'Hẻm 8 Trần Nhật Duật');
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
const require = createRequire(import.meta.url);
const esbuild = require('../../backend/node_modules/esbuild');
const bundle = await esbuild.build({ entryPoints: ['lib/pageMarkup.js'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { renderListPage } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
for (const id of ['threads-food-local', 'threads-cafe-local', 'threads-mix-local', 'threads-mix-text']) {
  const saved = { ...list, id: id + '-caption-01' }, before = JSON.stringify(saved);
  const html = renderListPage(saved.pages[0], 0, 1, saved.id, [], saved, []);
  assert.ok(html.includes('Quán số 1 (Tổ 19 An Sơn)'));
  assert.ok(!html.includes('Xuân Hương'));
  assert.ok(!html.includes('Quán số 1 (Xuân Hương - Đà Lạt)'));
  assert.equal(JSON.stringify(saved), before, 'Preview does not rewrite saved lists');
}
assert.equal(await archive.file('noi-dung.txt').async('string'), payload.txt);
// Source with partner logic off (e.g. Phan Thiết): 10 regular venues export without an empty XLSX.
const offItems = items.map((item) => ({ ...item, isPartner: false, isLocal: true, metaPrimary: '' }));
const offList = { ...list, pages: [{ type: 'list', items: offItems }] };
assert.throws(() => threadsFoodPayload(offList), /10 tên/, 'Without the source flag zero partners stay blocked');
const offPayload = threadsFoodPayload({ ...offList, partnerOptional: true });
assert.equal(offPayload.partnerNames.length, 0);
assert.equal(offPayload.photos.length, 6);
assert.ok(offPayload.txt.includes('- Quán số 1\r\n'));
assert.throws(() => threadsFoodPayload({ ...offList, partnerOptional: true, pages: [{ type: 'list', items: offItems.slice(1) }] }), /10 tên/);
const offZip = new JSZip();
await addThreadsFoodFiles(offZip, { ...offList, partnerOptional: true }, async () => ({ blob: new Uint8Array([0xff, 0xd8, 0xff]), extension: 'jpg' }), (name) => name, async () => { throw new Error('Không ghi XLSX đối tác rỗng'); });
const offFiles = Object.keys((await JSZip.loadAsync(await offZip.generateAsync({ type: 'nodebuffer' }))).files);
assert.ok(offFiles.includes('noi-dung.txt') && !offFiles.includes('doi-tac.xlsx'));
const checksBundle = await esbuild.build({ stdin: { contents: "export { assertPartnerExportReady } from './exporter/checks.js'; export { resolveExportList } from './exporter/shared.js';", resolveDir: 'lib' }, bundle: true, write: false, format: 'esm', platform: 'node' });
const checks = await import('data:text/javascript;base64,' + Buffer.from(checksBundle.outputFiles[0].text).toString('base64'));
const noteDeck = { id: 'itinerary-note-threads-3n2d' };
const noteList = { id: 'itinerary-note-threads-3n2d-caption-01', title: 'Mẫu 01', pages: [{ type: 'list', items: [{ name: 'Quán thường', isPartner: false }] }] };
assert.throws(() => checks.assertPartnerExportReady(checks.resolveExportList(noteDeck, noteList, { source: {} }), noteDeck.id), /không có đối tác/);
const offResolved = checks.resolveExportList(noteDeck, noteList, { source: { partnerLogicOff: true } });
assert.deepEqual(checks.assertPartnerExportReady(offResolved, noteDeck.id), []);
assert.equal(noteList.partnerOptional, undefined, 'Resolving for export must not mutate the saved list');
assert.doesNotThrow(() => checks.assertPartnerExportReady(checks.resolveExportList({ id: 'itinerary-note-dark' }, noteList, { source: { partnerLogicOff: true } }), 'itinerary-note-dark'));
console.log('Threads food TXT/XLSX/ZIP payload OK');
