import assert from 'node:assert/strict';
import { applyExportedAt, collectLists, groupListIds, isMainList, listStatus } from '../lib/listStatus.mjs';

assert.equal(listStatus({ id: 'deck-main' }), 'main');
assert.equal(listStatus({ id: 'x', navTitle: 'List chính' }), 'main');
assert.equal(listStatus({ id: 'ai-1' }), 'new');
assert.equal(listStatus({ id: 'ai-1', editedAt: '2026-10-19T08:00:00Z' }), 'edited');
assert.equal(listStatus({ id: 'ai-1', exportedAt: '2026-10-19T09:00:00Z' }), 'exported');
assert.equal(listStatus({ id: 'ai-1', editedAt: '2026-10-19T08:00:00Z', exportedAt: '2026-10-19T09:00:00Z' }), 'exported', 'Sửa trước khi xuất vẫn là đã xuất');
assert.equal(listStatus({ id: 'ai-1', editedAt: '2026-10-19T10:00:00Z', exportedAt: '2026-10-19T09:00:00Z' }), 'edited', 'Sửa sau khi xuất cần xuất lại');
assert.equal(listStatus({ id: 'ai-1', exportedAt: 'không hợp lệ' }), 'new');
assert.ok(isMainList({ id: 'MAIN' }));

const dataset = { decks: [
  { id: 'a', lists: [{ id: 'a-main' }, { id: 'a-1' }, { id: 'a-2', exportedAt: '2026-10-19T09:00:00Z' }] },
  { id: 'b', lists: [{ id: 'b-1', editedAt: '2026-10-19T08:00:00Z' }] },
] };
const entries = collectLists(dataset);
assert.deepEqual(entries.map(entry => entry.list.id), ['a-2', 'a-1', 'b-1'], 'Không có list chính; list mới hơn của mỗi mẫu đứng trước');
assert.deepEqual(entries.map(entry => entry.status), ['exported', 'new', 'edited']);
assert.equal(collectLists(dataset, { includeMain: true }).at(-1).list.id, 'a-main', 'List chính xếp cuối khi được hiển thị');

const groups = groupListIds([{ deckId: 'a', listId: 'a-1' }, { deckId: 'a', listId: 'a-1' }, { deckId: 'b', listId: 'b-1' }, { deckId: '', listId: 'x' }]);
assert.deepEqual(groups, [{ deckId: 'a', listIds: ['a-1'] }, { deckId: 'b', listIds: ['b-1'] }]);
const marked = applyExportedAt(dataset, [{ deckId: 'a', listIds: ['a-1', 'a-main'] }], '2026-10-19T11:00:00Z');
assert.equal(marked.decks[0].lists[1].exportedAt, '2026-10-19T11:00:00Z');
assert.equal(marked.decks[0].lists[0].exportedAt, undefined, 'List chính không nhận exportedAt');
assert.equal(marked.decks[1], dataset.decks[1], 'Mẫu không liên quan giữ nguyên tham chiếu');
console.log('PASS list status: main/new/edited/exported, ordering, grouping and local exportedAt update');
