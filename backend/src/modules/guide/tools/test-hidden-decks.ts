// Mẫu tạm ẩn theo Sheet góp ý 2026-10-22: không còn trong quyền tạo của nguồn nào, có thông báo rõ.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DALAT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hidden-decks-'));
require('../../../../../scripts/test-support/source-links-fixture.cjs').seedSourceLinks(process.env.DALAT_DATA_DIR);
const { HIDDEN_DECK_LABELS, getAllowedDeckIds, isHiddenDeck, sourceTemplateError } = require('../sync/destination-config');

const hidden = ['grid-6-zigzag', 'grid-5', 'spotlight-guide', 'spotlight-v4'];
assert.deepEqual(Object.keys(HIDDEN_DECK_LABELS).sort(), [...hidden].sort());
for (const sourceId of ['dalat', 'dalat-test', 'greenland', 'dalat-threads']) {
  const allowed = getAllowedDeckIds(sourceId);
  assert.ok(allowed.length > 0, sourceId);
  for (const deckId of hidden) assert.ok(!allowed.includes(deckId), `${sourceId} vẫn cho tạo ${deckId}`);
}
assert.ok(getAllowedDeckIds('dalat').includes('grid-4') && getAllowedDeckIds('dalat').includes('spotlight-v5'), 'Mẫu Giữ không bị ẩn');
for (const deckId of hidden) {
  assert.ok(isHiddenDeck(deckId));
  assert.match(sourceTemplateError('dalat', deckId), /tạm ẩn theo góp ý/);
}
assert.ok(!isHiddenDeck('grid-6') && !isHiddenDeck('constructor'));
console.log('PASS 4 mẫu tạm ẩn: không tạo trên mọi nguồn, thông báo rõ, mẫu Giữ không bị ảnh hưởng.');
