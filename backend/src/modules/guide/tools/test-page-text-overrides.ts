import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { GuideDeck, GuideDeckList } from '../../../common/interfaces/guide.types';
import { GuideService } from '../guide.service';

const tempDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-page-text-'));

function baseList(id = 'grid-8-feed-main', navTitle = 'List chính'): GuideDeckList {
  return {
    id,
    navTitle,
    title: 'Cover gốc',
    coverTitle: 'Cover gốc',
    description: '',
    pages: [
      { type: 'cover', title: 'Cover gốc', subtitle: 'Mô tả gốc', backgroundImage: '' },
      { type: 'list', chipText: 'Ngày 1', chipTone: 'terracotta', title: 'Trang gốc', subtitle: 'Mô tả trang gốc', items: [], backgroundImage: '' },
    ],
  };
}

function context(deck: GuideDeck) {
  return {
    imageUrls: [], coverImageUrls: [], imageLibraryEntries: [], itemsBySection: {},
    baseDecks: [deck], totalItems: 0, mappedItemCount: 0, manualMappedItemCount: 0, autoMappedItemCount: 0,
  };
}

try {
  const service = new GuideService() as any;
  Object.defineProperty(service, 'dataRoot', { value: tempDataRoot });
  service.activeDestinationId = 'dalat';
  const deck = { id: 'grid-8-feed', navTitle: 'Grid', title: 'Grid', description: '', lists: [baseList()] };
  service.workbookDerivedCache = context(deck);

  const saved = service.updatePageText('grid-8-feed', 'grid-8-feed-main', 1, {
    title: '  Tiêu đề tiếng Việt   hợp lý  ',
    subtitle: '  Mô tả   đã chỉnh  ',
  });
  assert.equal(saved.title, 'Tiêu đề tiếng Việt hợp lý');
  assert.equal(saved.subtitle, 'Mô tả đã chỉnh');

  let merged = service.mergeGeneratedLists([deck]);
  assert.equal(merged[0].lists[0].pages[1].title, saved.title);
  assert.equal(merged[0].lists[0].pages[1].subtitle, saved.subtitle);

  const generated = baseList('caption-01-test', 'AI 01');
  generated.title = 'Cover AI riêng';
  generated.coverTitle = 'Cover AI riêng';
  generated.pages[0].title = 'Cover AI riêng';
  generated.pages[0].subtitle = 'Mô tả cover AI riêng';
  generated.pages[1].title = 'Tiêu đề AI chưa kế thừa';
  generated.pages[1].subtitle = 'Mô tả AI chưa kế thừa';
  service.generatedListsByDeckId.set('grid-8-feed', [generated]);
  merged = service.mergeGeneratedLists([deck]);
  let mergedGenerated = merged[0].lists.find((list: GuideDeckList) => list.id === generated.id);
  assert.equal(mergedGenerated.pages[1].title, saved.title);
  assert.equal(mergedGenerated.pages[1].subtitle, saved.subtitle);

  service.updatePageText('grid-8-feed', 'grid-8-feed-main', 1, {
    title: 'Tiêu đề mẫu không được spam',
    subtitle: '',
  });
  merged = service.mergeGeneratedLists([deck]);
  mergedGenerated = merged[0].lists.find((list: GuideDeckList) => list.id === generated.id);
  assert.equal(mergedGenerated.pages[1].title, 'Tiêu đề mẫu không được spam');
  assert.equal(mergedGenerated.pages[1].subtitle, '');
  let structuredPages = service.applyMainTemplateFieldStructure(deck, generated.pages);
  assert.equal(structuredPages[1].title, 'Tiêu đề mẫu không được spam');
  assert.equal(structuredPages[1].subtitle, '');

  service.updatePageText('grid-8-feed', generated.id, 1, {
    title: 'Tiêu đề sửa riêng',
    subtitle: '',
  });
  merged = service.mergeGeneratedLists([deck]);
  const independentlyEdited = merged[0].lists.find((list: GuideDeckList) => list.id === generated.id);
  assert.equal(independentlyEdited.pages[1].title, 'Tiêu đề sửa riêng');
  assert.equal(independentlyEdited.pages[1].subtitle, '');

  const legacy = service.updateGeneratedListCover('grid-8-feed', 'grid-8-feed-main', { coverSubtitle: '' });
  assert.equal(legacy.coverTitle, 'Cover gốc');
  assert.equal(legacy.coverSubtitle, '');
  merged = service.mergeGeneratedLists([deck]);
  assert.equal(merged[0].lists[0].coverTitle, 'Cover gốc');
  assert.equal(merged[0].lists[0].pages[0].subtitle, '');
  const generatedAfterCoverRule = merged[0].lists.find((list: GuideDeckList) => list.id === generated.id);
  assert.equal(generatedAfterCoverRule.pages[0].title, 'Cover gốc');
  assert.equal(generatedAfterCoverRule.pages[0].subtitle, '');
  structuredPages = service.applyMainTemplateFieldStructure(deck, generated.pages);
  assert.equal(structuredPages[0].title, 'Cover gốc');
  assert.equal(structuredPages[0].subtitle, '');

  const blankCoverMain = baseList('blank-cover-main', 'List chính');
  blankCoverMain.pages[0].title = '';
  blankCoverMain.pages[0].subtitle = '';
  const blankCoverDeck = { ...deck, id: 'blank-cover-deck', lists: [blankCoverMain] };
  const blankCoverChildPages = service.applyMainTemplateFieldStructure(blankCoverDeck, generated.pages);
  assert.equal(blankCoverChildPages[0].title, '');
  assert.equal(blankCoverChildPages[0].subtitle, '');

  service.activeDestinationId = 'greenland';
  merged = service.mergeGeneratedLists([deck]);
  assert.equal(merged[0].lists[0].pages[1].title, 'Trang gốc');

  service.activeDestinationId = 'dalat';
  const emptyStructure = service.updatePageText('grid-8-feed', 'grid-8-feed-main', 1, { title: '   ', subtitle: '' });
  assert.equal(emptyStructure.title, '');
  structuredPages = service.applyMainTemplateFieldStructure(deck, generated.pages);
  assert.equal(structuredPages[1].title, '');
  assert.equal(structuredPages[1].subtitle, '');
  assert.throws(() => service.updatePageText('grid-8-feed', 'grid-8-feed-main', 99, { title: 'Sai trang', subtitle: '' }));

  console.log('PASS page text overrides: cover/content inheritance, AI copy isolation, destination isolation');
} finally {
  fs.rmSync(tempDataRoot, { recursive: true, force: true });
}
