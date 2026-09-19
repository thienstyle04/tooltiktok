const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const esbuild = require('../backend/node_modules/esbuild');
function load(file, globals = {}) {
  const code = esbuild.buildSync({ entryPoints: [file], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
  const module = { exports: {} }; vm.runInNewContext(code, { module, exports: module.exports, require, console, ...globals }); return module.exports;
}
const markup = load('frontend/lib/pageMarkup.js');
const types = fs.readFileSync('backend/src/common/interfaces/guide.types.ts', 'utf8');
const variants = new Set([...types.matchAll(/layoutVariant\?: ([^;]+);/g)].flatMap(m => [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])));
let count = 0;
for (const variant of variants) for (const type of ['cover', 'list']) {
  const page = { type, layoutVariant: variant, textScale: 75, title: 'Tên địa điểm', subtitle: 'Địa chỉ', chipText: 'Ngày 1', items: [], backgroundImage: '' };
  const list = { id: 'test', title: 'Test', pages: [page], captionHashtags: [] };
  const html = (type === 'cover' ? markup.renderCoverPage : markup.renderListPage)(page, 0, 1, list.id, [], list);
  assert.match(html, /<article data-text-scale="75"/ , `${variant}/${type}`);
  count++;
}
const text = (size) => ({ tagName: 'SPAN', dataset: {}, style: { fontSize: '' }, childNodes: [{ nodeType: 3, textContent: 'Text' }], size });
const nodes = [text(20), text(12)];
const page = { dataset: { textScale: '75' }, tagName: 'ARTICLE', childNodes: [], querySelectorAll: () => nodes, matches: () => true };
const { applyPageTextScale } = load('frontend/lib/pageTextScale.js', { getComputedStyle: n => ({ fontSize: n.style.fontSize || `${n.size}px` }) });
applyPageTextScale(page); assert.equal(nodes[0].style.fontSize, '15px'); assert.equal(nodes[1].style.fontSize, '9px');
applyPageTextScale(page); assert.equal(nodes[0].style.fontSize, '15px', 'No repeated shrinking');
page.dataset.textScale = '100'; applyPageTextScale(page); assert.equal(nodes[0].style.fontSize, '', 'Restore original CSS');
console.log(`PASS: ${count} cover/list layout paths, scaling, repeat and reset`);
page.dataset.textFontSize = '13'; applyPageTextScale(page);
assert.equal(nodes[0].style.fontSize, '13px'); assert.equal(nodes[1].style.fontSize, '13px');
applyPageTextScale(page); assert.equal(nodes[0].style.fontSize, '13px');
delete page.dataset.textFontSize; applyPageTextScale(page); assert.equal(nodes[0].style.fontSize, '');
console.log('PASS: absolute px, repeat and reset');
