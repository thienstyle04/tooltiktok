const assert = require('node:assert/strict');
const esbuild = require('../../backend/node_modules/esbuild');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const code = esbuild.buildSync({ stdin: { contents: "export {inspectExportImages} from './frontend/lib/exportImageValidation'; export {renderListPage} from './frontend/lib/pageMarkup';", resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const mod = { exports: {} };
new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
const { inspectExportImages, renderListPage } = mod.exports;
const page = { type: 'list', layoutVariant: 'itinerary-note-threads-budget', title: 'Bảng chi phí', backgroundImage: '/assets/drive-file?id=SHOULD_NOT_BE_USED123', items: [
  { label: 'Di chuyển', name: 'Xe', metaSecondary: '50.000 đ', imageUrl: '/assets/drive-file?id=SHOULD_NOT_BE_USED456' },
] };
const deck = { id: 'itinerary-note-threads-budget-3n2d', navTitle: 'Chi phí Threads 3N2Đ' };
const list = { id: 'budget-main', navTitle: 'List chính', pages: [page] };
const oldFetch = global.fetch;
global.fetch = async () => { throw new Error('Text-only page must not request Drive cache'); };
inspectExportImages([{ deck, list }], (_, selected, index) => renderListPage(selected, index, 1, list.id, [], list))
  .then(result => {
    assert.equal(result.validEntries.length, 1);
    assert.equal(result.skippedLists.length, 0);
    assert(!/<img\b|SHOULD_NOT_BE_USED/i.test(renderListPage(page, 0, 1, list.id, [], list)));
    console.log('PASS: text-only budget export preflight ignores even stale image URLs and does not call cache API');
  })
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => { global.fetch = oldFetch; });
