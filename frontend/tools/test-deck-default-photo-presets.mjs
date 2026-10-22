// Bộ màu chọn sẵn theo Sheet góp ý 2026-10-22: đúng mẫu, đúng bộ, mẫu chỉ có chữ không bị gán.
import assert from 'node:assert/strict';
import { DECK_DEFAULT_PHOTO_PRESETS, defaultPhotoPreset, isKnownPhotoPreset, supportsPhotoPreset } from '../lib/photoPresets.mjs';

const flagged = ['grid-6', 'spotlight-v2', 'spotlight-v3', 'spotlight-v6', 'spotlight-v6-diary', 'itinerary-4n3d-stack', 'one-way-story', 'grid-8-feed'];
assert.deepEqual(Object.keys(DECK_DEFAULT_PHOTO_PRESETS).sort(), [...flagged].sort());
for (const deckId of flagged) {
  assert.equal(defaultPhotoPreset(deckId), 'photo-ref-06-courtyard-calm-v1', deckId);
  assert.ok(isKnownPhotoPreset(defaultPhotoPreset(deckId)) && supportsPhotoPreset(deckId), deckId);
}
for (const deckId of ['grid-4', 'spotlight-v5', 'threads-trip-recap-3n2d', 'threads-note-dark-list', 'itinerary-note-threads-3n2d']) assert.equal(defaultPhotoPreset(deckId), null, deckId);
assert.equal(defaultPhotoPreset(undefined), null);
console.log('PASS bộ màu mặc định theo góp ý: 8 mẫu dùng 06 · Sân vườn dịu, mẫu khác giữ Ảnh gốc.');
