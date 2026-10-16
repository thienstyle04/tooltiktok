import assert from 'node:assert/strict';
import { renderLocalTemplate } from '../lib/localTemplates.js';
import { photoRenderPage, photoDisplayUrl } from '../lib/photoPresets.mjs';

const photo = '/api/local-templates/local-contract-fixture/1/assets/photo.png';
const page = {
  type: 'list', title: 'Fixture', backgroundImage: photo,
  items: [{ name: '<b>Place</b>', metaPrimary: 'A & B', imageUrl: '/assets/drive-file?id=fixture' }],
  localRender: {
    templateId: 'local-contract-fixture', version: 1, width: 1080, height: 1440, fonts: [],
    nodes: [
      { kind: 'image', x: 0, y: 0, width: 1080, height: 1440, field: 'backgroundImage', required: true },
      { kind: 'image', x: 10, y: 10, width: 20, height: 20, src: '/api/local-templates/local-contract-fixture/1/assets/icon.png' },
      { kind: 'text', x: 50, y: 50, width: 400, height: 120, itemIndices: [0], fields: ['name', 'metaPrimary'], fieldColors: { name: '#000', metaPrimary: '#543210' }, style: { fontFamily: 'Fixture', fontSize: 40 } },
    ],
  },
};
const original = structuredClone(page);
const html = renderLocalTemplate(page, 0, 'fixture');
assert.ok(html.includes('&lt;b&gt;Place&lt;/b&gt;') && html.includes('A &amp; B'));
assert.ok(!html.includes('<b>Place</b>'));
assert.ok(html.includes('data-local-field="metaPrimary"') && html.includes('color:#543210'));
assert.ok(html.includes('font-family:inherit!important'));
const preset = 'iphone-color-edit-v1';
const rendered = photoRenderPage(page, preset);
assert.equal(rendered.backgroundImage, photoDisplayUrl(photo, preset));
assert.equal(rendered.items[0].imageUrl, photoDisplayUrl(page.items[0].imageUrl, preset));
assert.deepEqual(rendered.localRender, page.localRender, 'Do not apply photo presets to icons, text or decoration nodes');
assert.equal(photoDisplayUrl(rendered.backgroundImage, preset), rendered.backgroundImage);
assert.equal(photoDisplayUrl('/api/local-templates/local-contract-fixture/1/assets/../secret.png', preset), '/api/local-templates/local-contract-fixture/1/assets/../secret.png');
assert.deepEqual(page, original);
const collage = { ...page, type: 'cover', coverImages: ['/assets/drive-file?id=cover-a', '/assets/drive-file?id=cover-b'], localRender: { ...page.localRender, nodes: [0, 1].map(i => ({ kind: 'image', x: i * 540, y: 0, width: 540, height: 720, field: `coverImages.${i}`, required: true })) } };
const collageHtml = renderLocalTemplate(collage, 0, 'fixture');
assert.ok(collageHtml.includes('id=cover-a') && collageHtml.includes('id=cover-b'));
const coloredCollage = photoRenderPage(collage, preset);
assert.deepEqual(coloredCollage.coverImages, collage.coverImages.map(url => photoDisplayUrl(url, preset)));
assert.ok(renderLocalTemplate(coloredCollage, 0, 'fixture').includes('/assets/color-edit?'));
assert.throws(() => renderLocalTemplate({ ...collage, coverImages: ['javascript:alert(1)'] }, 0, 'fixture'), /URL/);
assert.throws(() => renderLocalTemplate({ ...collage, coverImages: [] }, 0, 'fixture'), /thiếu ảnh/);
console.log('PASS local render contract: safe colored text fields, inherited fonts, photographic background preset, original model and decorations unchanged');
