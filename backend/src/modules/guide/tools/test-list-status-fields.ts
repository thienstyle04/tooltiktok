// Trạng thái list cho màn Duyệt & Xuất: exportedAt (ghi khi xuất xong) và editedAt (từ bản sửa trang).
import assert from 'node:assert/strict';
import { GuideService } from '../guide.service';
import { applyPageTextOverrides } from '../page-text-overrides';
import type { GuideDeckList, PageTextOverrideStore } from '../../../common/interfaces/guide.types';

function testMarkExported(): void {
  const service = new GuideService() as any;
  let persisted = 0;
  service.generatedListsLoaded = true;
  service.persistGeneratedLists = () => { persisted += 1; };
  service.generatedListsByDeckId = new Map([
    ['deck-a', [{ id: 'ai-1', pages: [] }, { id: 'ai-2', pages: [] }]],
    ['deck-b', [{ id: 'ai-3', pages: [] }]],
  ]);

  const result = service.markListsExported([
    { deckId: 'deck-a', listIds: ['ai-2', 'missing'] },
    { deckId: 'deck-missing', listIds: ['ai-9'] },
    { deckId: 'deck-b', listIds: [] },
  ]);

  assert.equal(result.markedCount, 1, 'Chỉ đánh dấu list đã tạo còn tồn tại');
  assert.ok(Date.parse(result.exportedAt) > 0);
  const deckA = service.generatedListsByDeckId.get('deck-a');
  assert.equal(deckA[0].exportedAt, undefined, 'List không được chọn giữ nguyên');
  assert.equal(deckA[1].exportedAt, result.exportedAt);
  assert.equal(service.generatedListsByDeckId.get('deck-b')[0].exportedAt, undefined);
  assert.equal(persisted, 1, 'Ghi kho đúng một lần');

  const none = service.markListsExported([{ deckId: 'deck-a', listIds: ['missing'] }]);
  assert.equal(none.markedCount, 0);
  assert.equal(persisted, 1, 'Không có gì để đánh dấu thì không ghi file');
}

function testEditedAt(): void {
  const page = { type: 'list', title: 'A', subtitle: '', items: [] } as any;
  const lists = [
    { id: 'edited', navTitle: 'E', title: 'E', description: '', pages: [page, page] },
    { id: 'legacy', navTitle: 'L', title: 'L', description: '', pages: [page] },
    { id: 'clean', navTitle: 'C', title: 'C', description: '', pages: [page] },
  ] as GuideDeckList[];
  const store: PageTextOverrideStore = {
    version: 1,
    savedAt: '2026-10-01T00:00:00.000Z',
    decks: { deck: {
      edited: {
        0: { title: 'A', subtitle: '', editedAt: '2026-10-18T08:00:00.000Z' },
        1: { title: 'B', subtitle: '', editedAt: '2026-10-19T09:30:00.000Z' },
      },
      legacy: { 0: { title: 'Cũ', subtitle: '' } },
    } },
  };
  const [edited, legacy, clean] = applyPageTextOverrides('deck', lists, store);
  assert.equal(edited.editedAt, '2026-10-19T09:30:00.000Z', 'Lấy lần sửa mới nhất trong list');
  assert.equal(legacy.editedAt, store.savedAt, 'Bản sửa cũ chưa có mốc giờ dùng giờ lưu kho');
  assert.equal(clean.editedAt, undefined, 'List chưa sửa không có editedAt');
  assert.equal(edited.pages[1].title, 'B');
}

testMarkExported();
testEditedAt();
console.log('PASS list status fields: mark exported + editedAt from page overrides');
