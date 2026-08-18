import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const requireFromBackend = createRequire(join(here, '../../backend/package.json'));
const esbuild = requireFromBackend('esbuild');
const entry = join(here, '../lib/pageMarkup.js');
const bundle = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { renderCoverPage, renderListPage } = await import(moduleUrl);

const image = 'https://example.invalid/one-way.jpg';
const list = { id: 'one-way-story-main', title: 'Đường một chiều', pages: [] };
const cover = {
  type: 'cover', title: 'Mới đi Đà Lạt về mà bị phạt 6 triệu trời ơi, đừng ai ngu như tui',
  subtitle: '', backgroundImage: image, coverImages: [image], layoutVariant: 'one-way-story-cover',
};
const road = {
  type: 'list', chipText: 'Đường một chiều', title: 'tui đi ngược chiều mấy bà ơi huhu, tui quẹo vô đường Nguyễn Văn Trỗi xong bị hốt',
  subtitle: 'haizzz, tui chia sẻ thêm mấy con đường để mấy bà tránh nha\n\nTrần Nhật Duật\nYagout\nThông Thiên Học\nTrương Công Định\nKhu Hòa Bình có đường bạn không được rẽ á',
  items: [], backgroundImage: image, layoutVariant: 'one-way-story-road',
};
const partnerPhoto = {
  type: 'list', chipText: 'Cafe đối tác', title: '', subtitle: '', backgroundImage: image,
  layoutVariant: 'one-way-story-photo', items: [{ name: 'Tên quán', metaPrimary: '12 Đường Đà Lạt', imageUrl: image, candidateImageUrls: [image], isPartner: true }],
};
const checkinPhoto = {
  ...partnerPhoto, chipText: 'Check-in', items: [{ ...partnerPhoto.items[0], name: 'Điểm check-in', metaPrimary: '' }],
};
list.pages = [cover, road, partnerPhoto, checkinPhoto];

const coverHtml = renderCoverPage(cover, 0, 4, list.id, [], list, [image]);
assert.match(coverHtml, /one-way-story-cover/);
assert.match(coverHtml, /Mới đi Đà Lạt về/);

const roadHtml = renderListPage(road, 1, 4, list.id, [], list);
assert.match(roadHtml, /one-way-story-road/);
assert.match(roadHtml, /Nguyễn Văn Trỗi/);
assert.match(roadHtml, /one-way-story-road-list/);
assert.match(roadHtml, /Khu Hòa Bình có đường bạn không được rẽ á/);

const partnerHtml = renderListPage(partnerPhoto, 2, 4, list.id, [], list);
assert.match(partnerHtml, /one-way-story-location/);
assert.match(partnerHtml, /<strong>Tên quán<\/strong>/);
assert.match(partnerHtml, /12 Đường Đà Lạt/);

const checkinHtml = renderListPage(checkinPhoto, 3, 4, list.id, [], list);
assert.match(checkinHtml, /one-way-story-location/);
assert.match(checkinHtml, /<strong>Điểm check-in<\/strong>/);
assert.doesNotMatch(checkinHtml, /<span>/);

const css = await readFile(join(here, '../app/styles/one-way-story.css'), 'utf8');
assert.match(css, /font-family:\s*"TikTok Sans"/);
assert.match(css, /-webkit-text-stroke:/);
assert.match(css, /--one-way-story-font-size:\s*13px/);
assert.doesNotMatch(css, /font-size:\s*(?:19|21|23|25)px/);
const locationRule = css.match(/\.one-way-story-location\s*\{([\s\S]*?)\}/)?.[1] || '';
assert.doesNotMatch(locationRule, /background\s*:/);

console.log('PASS one-way-story markup: toàn mẫu dùng chữ 13px; trang địa điểm có tên/địa chỉ và không còn màn gradient đen.');
