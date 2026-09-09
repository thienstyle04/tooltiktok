import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const manifest = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'data', 'sheet-drive-images.dalat.json'), 'utf8'),
);
const groups = manifest.coverImageGroups || {};
const idsFor = (group) => new Set((groups[group] || []).map((entry) => String(entry.fileId || '')).filter(Boolean));
const defaultIds = new Set((manifest.coverImages || []).map((entry) => String(entry.fileId || '')).filter(Boolean));
const greenIds = idsFor('green');
const darkIds = idsFor('dark');
const randomIds = idsFor('random');

assert.ok(darkIds.size >= 1, 'Manifest thiếu pool Ảnh tone đen.');
assert.ok(randomIds.size >= 5, 'Manifest thiếu pool Ảnh random.');
for (const id of [...greenIds, ...darkIds, ...randomIds]) {
  assert.ok(!defaultIds.has(id), 'Ảnh đặc biệt không được nằm trong pool Hinh_nen mặc định: ' + id);
}

function fileIdFromUrl(value) {
  const match = String(value || '').match(/[?&]id=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function api(pathname, options = {}) {
  const response = await fetch(API + pathname, {
    ...options,
    signal: AbortSignal.timeout(300000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(pathname + ' HTTP ' + response.status + ': ' + text.slice(0, 300));
  return text ? JSON.parse(text) : {};
}

async function verifyAsset(url) {
  const response = await fetch(API + url, { signal: AbortSignal.timeout(120000) });
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const body = Buffer.from(await response.arrayBuffer());
  assert.ok(response.ok, 'Asset lỗi HTTP ' + response.status + ': ' + url);
  assert.match(contentType, /^image\//, 'Asset không trả content-type ảnh: ' + url);
  assert.notEqual(contentType, 'image/svg+xml', 'Asset trả placeholder SVG: ' + url);
  assert.ok(body.length > 1024, 'Asset ảnh quá nhỏ hoặc rỗng: ' + url);
}

const createdIds = [];
try {
  const created = await api('/api/decks/generate-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deckId: 'spotlight-v6',
      count: 2,
      requestId: 'spotlight-v6-live-pools-' + Date.now(),
    }),
  });
  createdIds.push(...(created.lists || []).map((entry) => entry.listId).filter(Boolean));
  assert.equal(createdIds.length, 2, 'Không tạo đủ 2 list V6.');

  const dataset = await api('/api/guide-data');
  assert.equal(dataset.source?.destinationId, 'dalat');
  const deck = (dataset.decks || []).find((entry) => entry.id === 'spotlight-v6');
  assert.ok(deck, 'Catalog Đà Lạt không có Spotlight V6.');
  const checked = [];
  for (const listId of createdIds) {
    const list = (deck.lists || []).find((entry) => entry.id === listId);
    assert.ok(list, 'Không tìm thấy list vừa tạo: ' + listId);
    assert.equal(list.pages.length, 14);
    const cover = list.pages[0];
    const coverId = fileIdFromUrl(cover.backgroundImage);
    assert.ok(darkIds.has(coverId), 'Cover không thuộc folder Ảnh tone đen: ' + coverId);
    assert.ok(!greenIds.has(coverId), 'Cover dùng nhầm folder Ảnh mảng xanh.');

    const imagePages = list.pages.filter((page) => page.layoutVariant === 'spotlight-v6-image');
    assert.equal(imagePages.length, 5);
    const randomPageIds = imagePages.map((page) => fileIdFromUrl(page.backgroundImage));
    assert.equal(new Set(randomPageIds).size, 5, 'Năm trang ảnh Random bị trùng trong cùng list.');
    assert.ok(randomPageIds.every((id) => randomIds.has(id)), 'Có trang ảnh không thuộc folder Ảnh random.');
    assert.ok(randomPageIds.every((id) => !greenIds.has(id)), 'Có trang ảnh dùng nhầm folder Ảnh mảng xanh.');
    assert.equal(list.pages.filter((page) => page.layoutVariant === 'spotlight-v6-page').length, 8);

    await Promise.all([cover.backgroundImage, ...imagePages.map((page) => page.backgroundImage)].map(verifyAsset));
    checked.push({ listId, coverId, randomPageIds });
  }
  console.log(JSON.stringify({
    ok: true,
    manifestCounts: {
      default: defaultIds.size,
      green: greenIds.size,
      dark: darkIds.size,
      random: randomIds.size,
    },
    checked,
  }, null, 2));
} finally {
  for (const listId of createdIds) {
    await fetch(API + '/api/decks/spotlight-v6/lists/' + encodeURIComponent(listId), {
      method: 'DELETE',
      signal: AbortSignal.timeout(120000),
    }).catch(() => undefined);
  }
}
