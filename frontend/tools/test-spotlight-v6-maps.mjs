import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'lib/pageMarkup.js'), 'utf8');
const bundle = await esbuild.build({
  stdin: { contents: source, resolveDir: path.join(root, 'lib') },
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'TestMarkup',
  write: false,
});
const context = { console };
vm.runInNewContext(bundle.outputFiles[0].text, context);

const item = {
  id: 'place-1', sourceKey: 'check_in|place-1', sourceSectionKey: 'check_in',
  name: 'Dốc Nhà Bò', rawName: 'Dốc Nhà Bò', metaPrimary: 'Đào Duy Từ, Xuân Hương - Đà Lạt',
  imageUrl: '/assets/drive-file?id=test-image', imageMapped: true, imageSource: 'manual',
};
const mapPage = {
  type: 'list', layoutVariant: 'spotlight-v6-map-page', chipText: '', chipTone: 'slate',
  title: '', subtitle: '', backgroundImage: '/assets/drive-file?id=map-snapshot', items: [{ ...item, imageUrl: '/assets/drive-file?id=wrong-real-photo' }], canvasPreset: 'tiktok-3x4',
};
const placePage = { ...mapPage, layoutVariant: 'spotlight-v6-map-place', title: item.name, backgroundImage: '/assets/drive-file?id=real-snapshot' };
const list = { id: 'maps-list', title: 'Maps', pages: [mapPage, placePage] };
const mapMarkup = context.TestMarkup.renderListPage(mapPage, 0, 14, list.id, [], list);
const placeMarkup = context.TestMarkup.renderListPage(placePage, 1, 14, list.id, [], list);

assert.match(mapMarkup, /spotlight-v6-map-page/);
assert.match(mapMarkup, /01-map-doc-nha-bo\.png/);
assert.doesNotMatch(mapMarkup, /spotlight-v6-map-copy/);
assert.match(mapMarkup, /map-snapshot/);
assert.doesNotMatch(mapMarkup, /wrong-real-photo/);
assert.match(placeMarkup, /spotlight-v6-map-place/);
assert.match(placeMarkup, /02-doc-nha-bo\.png/);
assert.match(placeMarkup, /real-snapshot/);
assert.doesNotMatch(placeMarkup, /wrong-real-photo/);
assert.match(placeMarkup, /Dốc Nhà Bò/);
assert.match(placeMarkup, /Đào Duy Từ, Xuân Hương - Đà Lạt/);

const empty = context.TestMarkup.renderListPage({ ...placePage, title: '', items: [{ ...item, metaPrimary: '' }] }, 1, 14, list.id, [], list);
assert.doesNotMatch(empty, /spotlight-v6-map-name/);
assert.doesNotMatch(empty, /spotlight-v6-map-address/);
console.log('PASS Spotlight V6 Maps markup: map nguyên bản, trang ảnh thật, tên file theo cặp và override rỗng.');
