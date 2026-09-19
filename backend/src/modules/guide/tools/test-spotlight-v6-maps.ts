import assert from 'node:assert/strict';

import type { GuideItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import {
  buildSpotlightV6MapsPages,
  buildV2MainList,
  getV2DeckDefinitions,
  spotlightV6MapsVenuePool,
  V2_DECK_IDS,
} from '../logic/deck-builder-v2';
import { setActiveDestinationLocalize } from '../sync/destination-localize';
import { preferredGoogleMapsImageLink } from '../sync/sheet-drive-manifest';

const keys: SectionKey[] = ['quan_an', 'cafe', 'homestay', 'check_in', 'dich_vu', 'choi_dem', 'hoat_dong', 'dia_diem_lich_su', 'khu_du_lich'];
const makeItem = (sectionKey: SectionKey, index: number, withMap = true, withReal = true): GuideItem => {
  const real = withReal ? `/assets/drive-file?id=real-${sectionKey}-${index}` : '';
  const map = withMap ? `/assets/drive-file?id=map-${sectionKey}-${index}` : '';
  return {
    id: `${sectionKey}-${index}`, sectionKey, sectionTitle: sectionKey,
    name: `Địa điểm ${sectionKey} ${index}`, address: index === 1 ? '' : `${index} Địa chỉ`,
    type: sectionKey, openHours: '', style: '', highlight: '', partnerFlag: '', isPartner: index % 2 === 0,
    headPrice: '', hasHeadPriceColumn: false, price: '', phone: '', imageUrl: real,
    imageMapped: withReal, imageMappingKey: `${sectionKey}-${index}`, imageSource: withReal ? 'manual' : 'fallback',
    candidateImageUrls: real ? [real, `${real}-alt`] : [], mapImageUrl: map, mapCandidateImageUrls: map ? [map] : [],
  };
};

const itemsBySection = Object.fromEntries(keys.map((key) => [key, []])) as unknown as WorkbookItemsBySection;
for (let index = 1; index <= 4; index += 1) itemsBySection.check_in.push(makeItem('check_in', index));
for (let index = 1; index <= 4; index += 1) itemsBySection.hoat_dong.push(makeItem('hoat_dong', index));
itemsBySection.cafe.push(makeItem('cafe', 1, true, false));
itemsBySection.quan_an.push(makeItem('quan_an', 1, false, true));

assert.equal(preferredGoogleMapsImageLink({ anh_gg_maps: 'display', anh_gg_maps__hyperlink: 'https://drive.google.com/maps-folder' }), 'https://drive.google.com/maps-folder');
assert.equal(preferredGoogleMapsImageLink({ link_drive__hyperlink: 'https://drive.google.com/real-folder' }), '');
assert.ok(V2_DECK_IDS.includes('spotlight-v6-maps'));
assert.equal(spotlightV6MapsVenuePool(itemsBySection).length, 8);
for (let index = 2; index <= 6; index++) itemsBySection.quan_an.push(makeItem('quan_an', index));

setActiveDestinationLocalize('dalat');
const common = { itemsBySection, imageUrls: [], libraryEntries: [], coverImageUrls: [] };
const missingFoodCommon = { ...common, coverImageUrls: ['/assets/drive-file?id=test-cover-a', '/assets/drive-file?id=test-cover-b'], itemsBySection: { ...itemsBySection, quan_an: [] } };
// Isolate Maps catalog regression from unrelated strict one-way-story fixture requirements.
const catalogIds = V2_DECK_IDS as unknown as string[];
const oneWayIndex = catalogIds.indexOf('one-way-story');
catalogIds.splice(oneWayIndex, 1);
let missingFoodCatalog: ReturnType<typeof getV2DeckDefinitions>;
try { missingFoodCatalog = getV2DeckDefinitions(missingFoodCommon); }
finally { catalogIds.splice(oneWayIndex, 0, 'one-way-story'); }
const unavailableMaps = missingFoodCatalog.find(deck => deck.id === 'spotlight-v6-maps');
assert.ok(unavailableMaps, 'Maps remains discoverable when its data is incomplete');
assert.equal(unavailableMaps.lists.length, 0);
assert.match(unavailableMaps.description, /0\/4 Quán ăn/);
assert.ok(missingFoodCatalog.some(deck => deck.id !== 'spotlight-v6-maps' && deck.lists.length), 'Other templates still load');
const preview = buildV2MainList('spotlight-v6-maps', common);
assert.equal(preview?.pages.length, 14);
assert.equal(preview?.canvasPreset, 'tiktok-3x4');
assert.equal(preview?.postCaption, 'tới Đà Lạt vì');
assert.deepEqual(preview?.captionHashtags, ['#dalat', '#reviewdalat', '#dalatreview', '#dalatdidau', '#dalattrip']);

const pages = buildSpotlightV6MapsPages({ ...common, globalUsedItemIds: new Set(), globalUsedImageUrls: new Set() }, 'maps-test');
assert.equal(pages.length, 14);
assert.ok(pages.every((page) => page.type === 'list' && page.canvasPreset === 'tiktok-3x4'));
assert.deepEqual(pages.map((page) => page.layoutVariant), Array.from({ length: 7 }, () => ['spotlight-v6-map-page', 'spotlight-v6-map-place']).flat());
const selectedKeys = pages.filter((_, index) => index % 2 === 1).map((page) => page.type === 'list' ? page.items[0]?.sourceKey : '');
assert.equal(new Set(selectedKeys).size, 7);
assert.deepEqual(pages.filter((_, index) => index % 2 === 1).map(page => page.type === 'list' && page.items[0].sourceSectionKey === 'quan_an'), [true, false, true, false, true, false, true]);
assert.throws(() => buildSpotlightV6MapsPages({ ...common, itemsBySection: { ...itemsBySection, quan_an: [] } }, 'no-food'), /0\/4 Quán ăn/);
assert.throws(() => buildSpotlightV6MapsPages({ ...common, itemsBySection: { ...itemsBySection, check_in: itemsBySection.check_in.slice(0, 1), hoat_dong: itemsBySection.hoat_dong.slice(0, 1) } }, 'no-other'), /2\/3 địa điểm nhóm khác/);
for (let pair = 0; pair < 7; pair += 1) {
  const mapPage = pages[pair * 2];
  const placePage = pages[pair * 2 + 1];
  assert.equal(mapPage.type, 'list');
  assert.equal(placePage.type, 'list');
  if (mapPage.type === 'list' && placePage.type === 'list') {
    assert.equal(mapPage.items[0]?.sourceKey, placePage.items[0]?.sourceKey);
    assert.match(mapPage.backgroundImage, /map-/);
    assert.match(placePage.backgroundImage, /real-/);
    assert.notEqual(mapPage.backgroundImage, placePage.backgroundImage);
  }
}
assert.equal(new Set(pages.map((page) => page.backgroundImage)).size, 14);
assert.throws(() => buildSpotlightV6MapsPages({ ...common, itemsBySection: { ...itemsBySection, quan_an: [], check_in: itemsBySection.check_in.slice(0, 3), hoat_dong: itemsBySection.hoat_dong.slice(0, 3) } }, 'short'), /6 địa điểm có cả ảnh thật/);
setActiveDestinationLocalize('greenland');
assert.throws(() => buildSpotlightV6MapsPages(common, 'greenland'), /chỉ áp dụng cho Đà Lạt/);
setActiveDestinationLocalize('dalat');

// Reproduce saved parent titles at every real-photo position, as in the
// reported export. Exercise the service hook used at creation AND display.
const { GuideService } = require('../guide.service');
const { inheritPageTypography } = require('../logic/inherit-page-typography');
const service = Object.create(GuideService.prototype) as any;
const parent: any = { id: 'spotlight-v6-maps', lists: [{ id: 'spotlight-v6-maps-main', pages: structuredClone(pages) }] };
const overrides: any = { decks: { 'spotlight-v6-maps': { 'spotlight-v6-maps-main': {} } } };
for (let index = 1; index < 14; index += 2) {
  overrides.decks['spotlight-v6-maps']['spotlight-v6-maps-main'][index] = {
    title: `Tên mẫu mẹ không được chép ${index}`, subtitle: 'Nội dung cũ', textFontSize: 9,
    items: [{ name: 'Tên cũ', metaPrimary: 'Địa chỉ cũ' }],
  };
}
service.loadPageTextOverrides = () => overrides;
const snapshot = structuredClone(pages);
const generated = inheritPageTypography(parent, service.applyMainTemplateFieldStructure(parent, pages), overrides);
const displayed = service.applyMainTemplateFieldStructure(parent, generated);
for (let index = 0; index < 14; index++) {
  assert.equal(displayed[index].title, snapshot[index].title);
  assert.equal(displayed[index].subtitle, snapshot[index].subtitle);
  assert.equal(displayed[index].backgroundImage, snapshot[index].backgroundImage);
  assert.deepEqual(displayed[index].items, (snapshot[index] as any).items);
  if (index % 2) assert.equal(displayed[index].textFontSize, 9);
}
assert.deepEqual(pages, snapshot, 'Source snapshots remain unchanged');
// Feed the resulting child through the actual frontend/export markup builder.
const esbuild = require('esbuild');
const vm = require('node:vm');
const path = require('node:path');
const bundled = esbuild.buildSync({ entryPoints: [path.resolve(__dirname, '../../../../../frontend/lib/pageMarkup.js')], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const renderModule = { exports: {} as any };
vm.runInNewContext(bundled, { module: renderModule, exports: renderModule.exports, require, console });
const child = { id: 'maps-child-test', pages: displayed, title: 'Test', captionHashtags: [] };
for (let index = 0; index < displayed.length; index++) {
  const page = displayed[index];
  const html = renderModule.exports.renderListPage(page, index, displayed.length, child.id, [], child);
  assert.ok(html.includes(page.backgroundImage), `Page ${index + 1}: source image unchanged by renderer`);
  assert.ok(!html.includes('Tên mẫu mẹ không được chép'));
  if (index % 2) {
    assert.ok(html.includes(page.title), `Page ${index + 1}: correct selected place title`);
    assert.ok(html.includes(page.items[0].metaPrimary), `Page ${index + 1}: correct address`);
    assert.ok(html.includes('data-text-font-size="9"'));
  }
}
console.log('PASS actual export markup: all 14 source URLs, child titles/addresses, 9px metadata, no inherited parent names.');
console.log('PASS Spotlight Maps: 14 pages, paired images, quotas; parent title/address cannot overwrite child at creation/display; font size 9 inherited.');

if (process.argv.includes('--demo')) {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const output = path.resolve(process.cwd(), '../outputs/spotlight-maps-demo');
  fs.mkdirSync(output, { recursive: true });
  const demo = buildV2MainList('spotlight-v6-maps', common);
  fs.writeFileSync(path.join(output, 'list-demo.json'), JSON.stringify({ warning: 'DỮ LIỆU GIẢ LẬP KIỂM THỬ — KHÔNG DÙNG ĐĂNG BÀI', list: demo }, null, 2));
  const cards = demo!.pages.map((page, index) => {
    const item = page.type === 'list' ? page.items[0] : null;
    const map = index % 2 === 0;
    const food = item?.sourceSectionKey === 'quan_an';
    return `<article><header>Trang ${index + 1}/14 · ${food ? 'Quán ăn' : 'Nhóm khác'} · ${map ? 'Maps' : 'Địa điểm'}</header><div class="canvas ${map ? 'map' : 'place'}"><span class="watermark">DEMO · KHÔNG PHẢI ẢNH THẬT</span><div class="content"><div class="icon">${map ? '📍' : food ? '🍽' : '🌲'}</div><h2>${item?.name || ''}</h2><p>${item?.metaPrimary || 'Địa chỉ trống'}</p><p>${map ? 'Vị trí ảnh Maps của địa điểm' : 'Vị trí ảnh thật cùng địa điểm'}</p></div></div></article>`;
  }).join('');
  fs.writeFileSync(path.join(output, 'index.html'), `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Spotlight Maps — mẫu kiểm thử</title><style>body{margin:0;background:#111b17;color:#f4f2e8;font:16px system-ui;padding:24px}h1{font-size:28px}.notice{background:#493926;padding:18px;border-radius:12px;max-width:1000px;line-height:1.6}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,360px));gap:24px;margin-top:24px}header{padding:12px;background:#28392f}.canvas{aspect-ratio:3/4;position:relative;display:grid;place-items:center;overflow:hidden}.map{background:repeating-linear-gradient(35deg,transparent 0 60px,#c6d1b8 61px 67px,transparent 68px 120px),repeating-linear-gradient(-40deg,#718d70 0 80px,#d5d6b8 81px 88px,#718d70 89px 150px)}.place{background:linear-gradient(145deg,#655238,#294638)}.content{text-align:center;background:#142119e6;padding:20px;max-width:80%;border-radius:12px}.icon{font-size:48px}h2{font-size:20px}.watermark{position:absolute;top:14px;background:#0b110ed9;padding:8px;font-size:12px}article{border:1px solid #627264;border-radius:12px;overflow:hidden}</style><h1>Spotlight Maps — list kiểm thử 14 trang</h1><div class="notice"><strong>Đây là sơ đồ minh họa bằng dữ liệu giả, không phải preview ảnh xuất.</strong><br>Được tạo bằng builder thực của tool: 4 Quán ăn xen kẽ 3 địa điểm nhóm khác. Mỗi địa điểm gồm trang Maps → trang ảnh thật. Nguồn thật trên máy hiện thiếu ảnh Maps của Quán ăn nên chưa tạo được bài thật. Không thêm list này vào dữ liệu người dùng.</div><main>${cards}</main></html>`);
  console.log(`DEMO: ${output}`);
}
