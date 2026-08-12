import assert from 'node:assert/strict';
import { renderCoverPage, renderListPage } from '../lib/pageMarkup.js';

const items = Array.from({ length: 8 }, (_, index) => ({
  id: `item-${index}`,
  name: `Địa điểm ${index + 1}`,
  imageUrl: `/image-${index + 1}.jpg`,
  metaPrimary: `Địa chỉ ${index + 1}`,
  metaSecondary: '',
}));

function cover(layoutVariant, title = 'Tiêu đề thử', subtitle = '') {
  const page = { type: 'cover', layoutVariant, title, subtitle, backgroundImage: '/cover.jpg', items: [] };
  return renderCoverPage(page, 0, 1, `test-${layoutVariant}`, [], { pages: [page] }, []);
}

function content(layoutVariant, title = 'Tiêu đề thử', subtitle = '', chipText = 'Day 01') {
  const page = { type: 'content', layoutVariant, chipText, title, subtitle, items };
  return renderListPage(page, 1, 2, `test-${layoutVariant}`, [], { id: 'test-main', pages: [page] });
}

function renderedText(html) {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const journeyEmpty = content('journey-4n2d-grid8', 'Vào phố nhẹ nhàng', '');
assert.match(journeyEmpty, /Vào phố nhẹ nhàng/);
assert.doesNotMatch(journeyEmpty, /grid8-center-intro/);
assert.doesNotMatch(journeyEmpty, /Một nhịp mở đầu dễ đi/);

const journeyWithSubtitle = content('journey-4n2d-grid8', 'Vào phố nhẹ nhàng', 'Mô tả do người dùng nhập');
assert.match(journeyWithSubtitle, /Mô tả do người dùng nhập/);

const emptySubtitleCases = [
  ['budget-3n2d-story-cover', 'Lịch trình 3 ngày 2 đêm gọn hơn'],
  ['grid-5', 'Tháng 5+6 nên đi đâu'],
  ['grid-6-quaytung-cover', 'Lưu list này cho chuyến đi thành công'],
  ['grid-8-quaytung-cover', 'Lưu list này cho chuyến đi thành công'],
  ['pov-3-v2-cover', 'Những địa điểm checkin mang đậm vibe'],
  ['itinerary-4n3d-stack-cover', 'Gom gọn gợi ý theo từng nhóm'],
];

for (const [layoutVariant, forbiddenText] of emptySubtitleCases) {
  assert.doesNotMatch(cover(layoutVariant), new RegExp(forbiddenText, 'i'), layoutVariant);
}

const grid5EmptySubtitle = cover('grid-5', 'Đà Lạt', '');
assert.doesNotMatch(grid5EmptySubtitle, /grid5-cover-hook|grid5-cover-bracket|grid5-cover-script/);
assert.doesNotMatch(grid5EmptySubtitle, /Thong dong|Gợi ý những tọa độ hay ho/);

const grid5CustomSubtitle = cover('grid-5', 'Đà Lạt', 'Mô tả do người dùng nhập');
assert.match(grid5CustomSubtitle, /Mô tả do người dùng nhập/);
assert.doesNotMatch(grid5CustomSubtitle, /Thong dong|Gợi ý những tọa độ hay ho/);

const emptyTitleCoverCases = [
  ['grid-5', /Dalat/i],
  ['itinerary-timeline-cover', /Đà Lạt 3N2Đ/i],
  ['grid-8-feed', /CÁC ĐỊA ĐIỂM ĐÀ LẠT/i],
  ['itinerary-4n3d-stack-cover', /4N3Đ ĐÀ LẠT/i],
];
for (const [layoutVariant, forbiddenText] of emptyTitleCoverCases) {
  assert.doesNotMatch(cover(layoutVariant, '', ''), forbiddenText, layoutVariant);
}

const emptyGrid8FeedCover = cover('grid-8-feed', '', '');
assert.doesNotMatch(emptyGrid8FeedCover, /grid8-feed-cover-hero|grid8-feed-cover-tagline/);
assert.doesNotMatch(emptyGrid8FeedCover, /BỎ LỠ CHẮC CHẮN LÀ HỐI HẬN/i);

const customGrid8FeedCover = cover('grid-8-feed', 'Tiêu đề người dùng', 'Mô tả người dùng');
assert.match(customGrid8FeedCover, /TIÊU ĐỀ NGƯỜI DÙNG/);
assert.match(customGrid8FeedCover, /MÔ TẢ NGƯỜI DÙNG/);

const emptyTitleContentCases = [
  ['grid-8-quaytung-menu', /ĐỊA ĐIỂM ĂN UỐNG NGON/i],
  ['budget-wallet-bill', /BILL 4N3Đ/i],
  ['budget-3n2d', /ĐÀ LẠT 3 NGÀY 2 ĐÊM/i],
];
for (const [layoutVariant, forbiddenText] of emptyTitleContentCases) {
  assert.doesNotMatch(content(layoutVariant, '', ''), forbiddenText, layoutVariant);
}

const povGridWithoutTitle = content('pov-3-v2-grid', '', 'Mô tả không được dùng thay tiêu đề');
assert.doesNotMatch(povGridWithoutTitle, /pov-3-v2-grid-title/);

const chipMustNotReplaceTitleCases = [
  ['grid-4-feature', 'grid4-feature-title'],
  ['grid-5', 'grid5-title-text'],
  ['grid-8-feed', 'grid8-feed-center-hook'],
  ['itinerary-4n3d-stack-page', 'itinerary-4n3d-stack-page-headline'],
];
for (const [layoutVariant, titleClass] of chipMustNotReplaceTitleCases) {
  assert.doesNotMatch(content(layoutVariant, '', ''), new RegExp(`${titleClass}[^>]*>\\s*Day 01`, 'i'), layoutVariant);
}

const grid8Feed = content('grid-8-feed', 'Tiêu đề tùy chỉnh', '');
assert.match(renderedText(grid8Feed), /Tiêu đề tùy chỉnh/);
assert.doesNotMatch(grid8Feed, /Ăn uống gì|Coffee lowkey|Checkin free/);

const regularGrid8 = content('grid-8', 'Tiêu đề tùy chỉnh', '');
assert.match(renderedText(regularGrid8), /Tiêu đề tùy chỉnh/);
assert.doesNotMatch(regularGrid8, /grid8-center-intro/);

const grid8Quaytung = content('grid-8-quaytung', 'CAFE SÁNG', 'Mô tả tùy chỉnh');
assert.match(grid8Quaytung, /grid8-quaytung-center-hook/);
assert.match(renderedText(grid8Quaytung), /CAFE SÁNG/);
assert.match(renderedText(grid8Quaytung), /Mô tả tùy chỉnh/);

const emptyGrid8Quaytung = content('grid-8-quaytung', '', '');
assert.doesNotMatch(emptyGrid8Quaytung, /grid8-quaytung-center-hook/);
assert.doesNotMatch(emptyGrid8Quaytung, /grid8-quaytung-center-tagline/);

for (const layoutVariant of ['grid-8-feed', 'grid-5']) {
  const withoutCount = renderedText(content(layoutVariant, 'QUÁN ĂN ĐÀ LẠT', '', 'Quán ăn'));
  const withCount = renderedText(content(layoutVariant, '8 QUÁN ĂN ĐÀ LẠT', '', 'Quán ăn'));
  assert.match(withoutCount, /QUÁN ĂN ĐÀ LẠT/, `${layoutVariant} without count`);
  assert.match(withCount, /8 QUÁN ĂN ĐÀ LẠT/, `${layoutVariant} with count`);
}

console.log('PASS page text rendering: empty fields stay empty across shared layouts');
