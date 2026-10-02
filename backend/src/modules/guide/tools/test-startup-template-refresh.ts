import assert from 'node:assert/strict';
import { GuideService } from '../guide.service';
import * as builders from '../logic/deck-builder';

// Prototype-only fixtures: no constructor, disk writes, network or user data.
const fixture = (): any => {
  const service: any = Object.create(GuideService.prototype);
  Object.assign(service, {
    generatedListsLoaded: true, generatedListsByDeckId: new Map(),
    workbookDerivedCache: null, workbookDerivedCacheBuilding: false,
    activeDestinationId: 'dalat',
    ensureGeneratedListsLoaded() {}, loadPageTextOverrides: () => ({ decks: {} }),
    createUsageScope: () => ({ itemIds: new Set(), imageUrls: new Set() }),
    markUsedInDeck() {}, sanitizeGeneratedListText: (list: any) => list,
    sanitizeContentText: (text: string) => text,
    applyMainTemplateFieldStructure: (_: any, pages: any) => pages,
    bannedSampleCaptionPhrases: () => ['Không sao chép mẫu'],
  });
  return service;
};
const list = (id: string, version: number) => ({
  id, templateVersion: version, navTitle: id, title: 'Giữ nguyên tiêu đề',
  coverTitle: 'Giữ nguyên tiêu đề', postCaption: 'Caption đã duyệt',
  description: '', pages: [{ type: 'cover', title: 'Giữ nguyên tiêu đề', subtitle: '', backgroundImage: 'saved-image' }],
});
const service = fixture();
service.buildDatasetContext = () => { throw Error('Title lookup must not build dataset'); };
service.generatedListsByDeckId.set('spotlight-v3', [list('saved-v3', 2)]);
assert.ok(service.getUsedCaptionTitles('spotlight-v3').includes('Giữ nguyên tiêu đề'));
const baseDecks = [{ id: 'spotlight-v3', lists: [{ ...list('spotlight-v3-main', 2), coverTitle: 'Tiêu đề mẫu' }] }];
assert.ok(service.getUsedCaptionTitles('spotlight-v3', baseDecks).includes('Tiêu đề mẫu'));
service.workbookDerivedCache = { baseDecks };
assert.ok(service.getUsedCaptionTitles('spotlight-v3').includes('Tiêu đề mẫu'));

for (const deckId of ['itinerary-note-dark', 'itinerary-note-threads-3n2d', 'itinerary-note-threads-2n1d',
  'itinerary-note-threads-budget', 'threads-food-local', 'threads-cafe-local', 'threads-mix-local', 'threads-mix-text',
  'spotlight-v4', 'spotlight-v6', 'spotlight-v6-green', 'spotlight-v6-dark', 'spotlight-v6-diary', 'spotlight-v6-maps']) {
  const s = fixture();
  const old = list(`${deckId}-saved`, -1);
  s.generatedListsByDeckId.set(deckId, [old]);
  assert.equal(s.hasGeneratedListsNeedingTemplateRefresh(), false, `${deckId}: snapshots must not trigger refresh`);
  s.persistGeneratedLists = () => { throw Error('Must not persist snapshot fixture'); };
  s.refreshGeneratedLists({}, [], [], [], s.createUsageScope(), []);
  assert.equal(s.generatedListsByDeckId.get(deckId)[0], old);
}

const s = fixture();
const currentVersion = s.templateVersionForDeck('spotlight-v3');
const old = list('old-v3', currentVersion - 1);
const current = list('current-v3', currentVersion);
const dark = list('dark-version-3', 3);
s.generatedListsByDeckId.set('spotlight-v3', [old, current]);
s.generatedListsByDeckId.set('itinerary-note-dark', [dark]);
assert.equal(s.hasGeneratedListsNeedingTemplateRefresh(), true);
let builds = 0, saves = 0;
s.buildDatasetContext = () => { throw Error('Refresh must not re-enter dataset construction'); };
s.persistGeneratedLists = () => { saves++; };
const original = builders.buildPagesForDeck;
(builders as any).buildPagesForDeck = () => { builds++; return old.pages; };
try {
  s.refreshGeneratedLists({}, [], [], [], s.createUsageScope(), baseDecks);
  assert.equal(builds, 1, 'Only the outdated eligible list should rebuild');
  assert.equal(saves, 1);
  assert.equal(s.generatedListsByDeckId.get('spotlight-v3')[1], current);
  assert.equal(s.generatedListsByDeckId.get('itinerary-note-dark')[0], dark);
  assert.equal(s.hasGeneratedListsNeedingTemplateRefresh(), false);
  s.refreshGeneratedLists({}, [], [], [], s.createUsageScope(), baseDecks);
  assert.equal(builds, 1, 'Repeated reload must not refresh up-to-date lists');
  assert.equal(saves, 1);
} finally { (builders as any).buildPagesForDeck = original; }

const guard = fixture();
guard.buildWorkbookDerivedCacheNow = () => guard.rebuildWorkbookDerivedCacheNow();
assert.throws(() => guard.rebuildWorkbookDerivedCacheNow(), /dataset lồng nhau/);
assert.equal(guard.workbookDerivedCacheBuilding, false, 'Release guard after errors');
guard.buildWorkbookDerivedCacheNow = () => ({ ready: true });
assert.deepEqual(guard.rebuildWorkbookDerivedCacheNow(), { ready: true });
console.log('PASS startup refresh: read-only titles, old snapshots unchanged, only stale V3 refreshes once, re-entry blocked and errors recover.');
