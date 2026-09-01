import assert from 'node:assert/strict';

import { CoverPage } from '../../../common/interfaces/guide.types';
import { applyCaptionToPages } from '../logic/deck-builder';

function cover(layoutVariant: CoverPage['layoutVariant']): CoverPage {
  return {
    type: 'cover',
    title: 'Hook cũ',
    subtitle: 'Mô tả cũ không được hiện lại',
    backgroundImage: '',
    layoutVariant,
  };
}

const caption = {
  coverTitle: 'Hook mới',
  headline: 'Câu mở đầu bài đăng',
  body: 'Mô tả do người dùng nhập.',
};

const spotlight = applyCaptionToPages([cover('spotlight')], caption)[0] as CoverPage;
const spotlightV2 = applyCaptionToPages([cover('spotlight-v2')], caption)[0] as CoverPage;
const spotlightV3 = applyCaptionToPages([cover('spotlight-v3')], caption)[0] as CoverPage;
const spotlightV4 = applyCaptionToPages([cover('spotlight-v4-cover')], caption)[0] as CoverPage;

assert.equal(spotlight.title, 'Hook mới');
assert.equal(spotlight.subtitle, 'Mô tả do người dùng nhập.');
assert.equal(spotlightV2.title, 'Hook mới');
assert.equal(spotlightV2.subtitle, '', 'Spotlight V2 cover không được render mô tả');
assert.equal(spotlightV3.subtitle, '', 'Spotlight V3 cover tiếp tục không có mô tả');
assert.equal(spotlightV4.subtitle, '', 'Spotlight V4 cover không được có mô tả AI');

console.log('PASS spotlight-cover-copy: V2/V3/V4 không có mô tả cover, Spotlight thường giữ cấu trúc hiện tại');
