const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../frontend/lib/exportClient.js'), 'utf8');
const start = source.indexOf('async function assertExportImagesReady(');
const end = source.indexOf('\nlet exportQueue', start);
let reply = { missing: [] }, ok = true, requested;
const context = vm.createContext({
  AbortSignal,
  prefetchDriveFilesForExport: async () => {},
  renderPageMarkupForExport: (_list, page) => page.markup,
  fetch: async (_url, options) => {
    requested = JSON.parse(options.body).fileIds;
    return { ok, status: 503, json: async () => reply };
  },
});
vm.runInContext(source.slice(start, end), context);
const validationSource = fs.readFileSync(require('node:path').join(__dirname, '../frontend/lib/exportImageValidation.js'), 'utf8');
vm.runInContext(validationSource.replace(/^export /gm, ''), context);
const entry = {
  deck: { id: 'spotlight-v5', navTitle: 'Spotlight V5' },
  list: { id: 'test-list', pages: [
    { title: 'Bìa', markup: '<img src="/assets/drive-file?id=valid_image_001" data-candidate-srcs="[&quot;/assets/drive-file?id=unused_image_000&quot;]"><a href="/details?id=not_an_image_001">Info</a>', imageCandidates: ['unused_image_000'] },
    { items: [{ name: 'Không phải địa điểm lỗi', imageUrl: '/assets/drive-file?id=valid_image_001' }, { name: 'Địa điểm thử', imageUrl: '/assets/drive-file?id=missing_image_002' }], markup: '<img src="/assets/drive-file?size=full&amp;id=missing_image_002">' },
  ] },
};
(async () => {
  await context.assertExportImagesReady([entry]);
  assert.deepEqual(requested, ['valid_image_001', 'missing_image_002']);
  reply = { missing: ['missing_image_002'] };
  await assert.rejects(context.assertExportImagesReady([entry]), /Spotlight V5.*test-list.*trang 2.*Địa điểm thử.*missing_image_002/);
  await context.assertExportImagesReady([{ ...entry, onlyPageIndex: 0 }]);
  assert.deepEqual(requested, ['valid_image_001']);
  reply = {};
  await assert.rejects(context.assertExportImagesReady([entry]), /không hợp lệ/);
  ok = false;
  await assert.rejects(context.assertExportImagesReady([entry]), /HTTP 503/);
  ok = true;
  const batch = Array.from({ length: 25 }, (_, index) => ({ ...entry, list: { ...entry.list, id: `batch-${index + 1}` } }));
  const snapshot = JSON.stringify(batch);
  reply = { missing: [] };
  await context.assertExportImagesReady(batch);
  assert.deepEqual(requested, ['valid_image_001', 'missing_image_002']);
  assert.equal(JSON.stringify(batch), snapshot, 'Preflight must not modify snapshots');
  reply = { missing: ['missing_image_002'] };
  const allBad = await context.inspectExportImages(batch, (_list, page) => page.markup);
  assert.equal(allBad.skippedLists.length, 25);
  assert.equal(allBad.validEntries.length, 0);
  const mixed = await context.inspectExportImages([...batch, { ...entry, list: { id: 'good', pages: [entry.list.pages[0]] } }], (_list, page) => page.markup);
  assert.equal(mixed.validEntries.length, 1);
  assert.equal(mixed.validPages, 1);
  assert.equal(mixed.skippedLists.length, 25);
  console.log('PASS: required images, unused candidates, V5 failure context, selected page, invalid response, backend failure, 25-list deduplication and unchanged snapshots');
})().catch(error => { console.error(error); process.exitCode = 1; });
