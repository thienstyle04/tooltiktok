// Ảnh bìa bị loại theo Sheet góp ý 2026-10-22: đúng mẫu, không ảnh hưởng mẫu khác, không làm rỗng kho.
import assert from 'node:assert/strict';
import { coverImagesForDeck } from '../logic/cover-exclusions';

const url = (id: string) => `/assets/drive-file?id=${id}`;
const stencil = url('16Idv26434sHvILpXL-aOf2f9fbgAUg0J'), stencil2 = url('1LCpQtrywT1oTBL8ncT4i-U7vImg3pPK6');
const timelineCover = url('1v4NilNh9fHy71qZTVlLeKwtUhAFUJp89'), normal = url('normal-photo-1');
const pool = [stencil, stencil2, timelineCover, normal];
for (const deckId of ['spotlight-v2', 'grid-8-feed', 'itinerary-4n3d-stack']) assert.deepEqual(coverImagesForDeck(deckId, pool), [timelineCover, normal], deckId);
assert.deepEqual(coverImagesForDeck('itinerary-timeline', pool), [stencil, stencil2, normal]);
assert.deepEqual(coverImagesForDeck('one-way-story', pool), pool, 'Đường một chiều vẫn dùng ảnh chữ sơn');
assert.deepEqual(coverImagesForDeck('spotlight-v2', [stencil, stencil2]), [stencil, stencil2], 'Không làm rỗng kho bìa');
console.log('PASS ảnh bìa bị loại: đúng 3 mẫu bìa ghép + timeline, mẫu khác giữ nguyên, không làm rỗng kho.');
