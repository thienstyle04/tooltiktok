import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { GuideDeckList, PageTextOverrideStore } from '../../../common/interfaces/guide.types';
import { GuideService } from '../guide.service';

const DECK_IDS = ['spotlight-guide', 'spotlight-v2', 'spotlight-v3', 'spotlight-v4', 'carousel-mau-1'];

function festivalList(deckId: string, index: number): GuideDeckList {
  const hook = `H${index + 1}`;
  const layoutVariant = deckId === 'spotlight-guide'
    ? 'spotlight'
    : deckId === 'carousel-mau-1'
      ? 'carousel-mau-1-cover'
      : deckId === 'spotlight-v4'
        ? 'spotlight-v4-cover'
      : deckId;
  return {
    id: `${deckId}-caption-festival-${index + 1}`,
    navTitle: `List ${index + 1}`,
    title: hook,
    description: '',
    coverTitle: hook,
    postCaption: '',
    captionBody: '',
    captionHashtags: [],
    templateVersion: 1,
    hookSnapshot: {
      mode: 'festival',
      sourceId: 'hook-source-a',
      sourceRevision: 'revision-a',
    },
    pages: [{
      type: 'cover',
      title: hook,
      subtitle: '',
      backgroundImage: '',
      layoutVariant,
    }],
  } as unknown as GuideDeckList;
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'festival-hook-snapshots-'));
try {
  const writer = new GuideService() as any;
  writer.dataRoot = root;
  writer.activeDestinationId = 'dalat';
  writer.generatedListsLoaded = true;
  writer.generatedListsByDeckId = new Map(
    DECK_IDS.map((deckId, index) => [deckId, [festivalList(deckId, index)]]),
  );
  writer.persistGeneratedLists();

  const overrides: PageTextOverrideStore = {
    version: 1,
    savedAt: new Date().toISOString(),
    decks: {
      'spotlight-guide': {
        'spotlight-guide-caption-festival-1': { '0': { title: 'Nội dung riêng', subtitle: '' } },
      },
      'spotlight-v2': {
        'spotlight-v2-caption-festival-2': { '0': { title: '', subtitle: '' } },
      },
    },
  };
  fs.writeFileSync(
    path.join(root, 'page-text-overrides.dalat.json'),
    JSON.stringify(overrides, null, 2),
    'utf8',
  );

  const restarted = new GuideService() as any;
  restarted.dataRoot = root;
  restarted.activeDestinationId = 'dalat';
  restarted.generatedListsLoaded = false;
  restarted.generatedListsByDeckId.clear();
  restarted.ensureGeneratedListsLoaded();

  for (const [index, deckId] of DECK_IDS.entries()) {
    const restored = restarted.generatedListsByDeckId.get(deckId)?.[0] as GuideDeckList;
    assert.ok(restored, `${deckId}: list phải được khôi phục sau restart`);
    assert.equal(restored.coverTitle, `H${index + 1}`, `${deckId}: snapshot hook phải giữ nguyên`);
    assert.equal(restored.hookSnapshot?.sourceRevision, 'revision-a');

    const versionBumped = restarted.sanitizeGeneratedListText({
      ...restored,
      templateVersion: 999,
    }, deckId) as GuideDeckList;
    assert.equal(versionBumped.coverTitle, `H${index + 1}`, `${deckId}: tăng template version không được đổi hook`);
  }

  const stored = restarted.loadPageTextOverrides() as PageTextOverrideStore;
  const spotlightGuide = restarted.applyPageTextOverrides(
    'spotlight-guide',
    restarted.generatedListsByDeckId.get('spotlight-guide'),
    stored,
  )[0] as GuideDeckList;
  assert.equal(spotlightGuide.coverTitle, 'Nội dung riêng', 'Nội dung sửa thủ công phải ưu tiên cao nhất');

  const spotlightV2 = restarted.applyPageTextOverrides(
    'spotlight-v2',
    restarted.generatedListsByDeckId.get('spotlight-v2'),
    stored,
  )[0] as GuideDeckList;
  assert.equal(spotlightV2.coverTitle, '', 'Override rỗng phải tiếp tục rỗng sau restart');
  assert.equal(spotlightV2.pages[0].title, '', 'Trang cover không được tự hiện lại hook sau override rỗng');

  console.log('PASS festival-hook-list-snapshots: 5 mẫu giữ hook, manual/blank override thắng sau restart và version bump');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
