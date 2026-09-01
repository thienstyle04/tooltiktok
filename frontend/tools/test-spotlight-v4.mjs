import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const bundle = await esbuild.build({
  entryPoints: [path.join(here, '../lib/pageMarkup.js')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { renderCoverPage, renderListPage } = await import(`${moduleUrl}#spotlight-v4`);
const list = { id: 'spotlight-v4-main', pages: [] };
const cover = { type: 'cover', title: 'Hook lễ A', subtitle: '', backgroundImage: 'https://example.invalid/hinh-nen-1.jpg', coverImages: ['https://example.invalid/hinh-nen-1.jpg'], layoutVariant: 'spotlight-v4-cover', titlePlacement: 'bottom-left' };
const image = { type: 'list', chipText: '', title: '', subtitle: '', items: [], backgroundImage: 'https://example.invalid/hinh-nen-2.jpg', layoutVariant: 'spotlight-v4-image' };
const venue = { type: 'list', chipText: '', title: 'Quán thử', subtitle: '', items: [{ name: 'Quán thử', rawName: 'Quán thử', imageUrl: 'https://example.invalid/venue.jpg', metaPrimary: '33 Ngô Quyền, Cam Ly - Đà Lạt', metaSecondary: 'Giá: 100k', candidateImageUrls: [] }], backgroundImage: 'https://example.invalid/venue.jpg', layoutVariant: 'spotlight-v4-page' };
list.pages = [cover, image, venue];

const coverHtml = renderCoverPage(cover, 0, 8, list.id, [], list, []);
assert.match(coverHtml, /spotlight-v4-cover/);
assert.match(coverHtml, /Hook lễ A/);
const imageHtml = renderListPage(image, 1, 8, list.id, [], list);
assert.match(imageHtml, /spotlight-v4-image/);
assert.doesNotMatch(imageHtml, /spotlight-v4-page-name|Quán thử/);
const venueHtml = renderListPage(venue, 2, 8, list.id, [], list);
assert.match(venueHtml, /spotlight-v4-page/);
assert.match(venueHtml, /Quán thử/);
assert.match(venueHtml, /33 Ngô Quyền, Cam Ly - Đà Lạt/);
assert.doesNotMatch(venueHtml, /Giá: 100k|07:00|22:00/);
const blankVenueHtml = renderListPage({ ...venue, title: '' }, 2, 8, list.id, [], list);
assert.doesNotMatch(blankVenueHtml, /Quán thử/);
console.log('PASS spotlight-v4 renderer: cover hook, ảnh không chữ, venue chỉ tên + địa chỉ.');
