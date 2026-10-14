import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GuideService } from '../guide.service';
import { parseWorkbookBuffer } from '../sync/workbook-source';
import { setActiveDestinationLocalize } from '../sync/destination-localize';
import { getCachedSpotlightV3Hooks, setCachedSpotlightV3Hooks } from '../sync/spotlight-hook-source';
import { diaryDescriptionLines, diaryIdentity, diaryImageId, DIARY_ORDER, DIARY_PARTNER_COUNT } from '../logic/spotlight-diary';
import { getDriveImageProxyUrl, hasDriveFileDiskCache } from '../sync/drive-images';
import { publishedSourcePaths } from '../sync/published-source';
import { loadWorkbookItems } from '../workbook-items';
import type { DestinationId } from '../sync/destination-config';

async function main() {
  const data = path.resolve('data');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-diary-test-'));
  const sourceArg = process.argv.indexOf('--source');
  const sourceId: DestinationId = sourceArg >= 0 ? process.argv[sourceArg + 1] : 'dalat';
  assert.ok(['dalat', 'dalat-test'].includes(sourceId));
  const published = publishedSourcePaths(data, sourceId);
  const manifest = JSON.parse(fs.readFileSync(published?.manifest || path.join(data, `sheet-drive-images.${sourceId}.json`), 'utf8'));
  const workbook = parseWorkbookBuffer(fs.readFileSync(published?.workbook || path.join(data, `workbook-cache.${sourceId}.xlsx`)), {
    workbookName: `workbook-cache.${sourceId}.xlsx`, destinationId: sourceId, sourceUrl: '', sourceType: 'runtime-xlsx',
  }).workbook;
  setActiveDestinationLocalize('dalat');
  setCachedSpotlightV3Hooks(JSON.parse(fs.readFileSync(path.join(data, 'spotlight-v3-hooks.json'), 'utf8')).hooks);
  const items = loadWorkbookItems(sourceId, path.resolve('..'), workbook, [], { version: 1, instructions: [], mappings: [] }, [], manifest);
  const cached = (url: string) => Boolean(diaryImageId(url) && hasDriveFileDiskCache(diaryImageId(url)));
  for (const group of ['quan_an','cafe','check_in'] as const) {
    for (const item of items[group]) {
      const urls = [item.imageUrl, ...(item.candidateImageUrls || [])].filter(cached);
      item.imageUrl = urls[0] || ''; item.candidateImageUrls = urls;
      item.diaryImageUrls = (item.diaryImageUrls || []).filter(cached);
    }
    const valid = items[group].filter((item: any) => (group === 'check_in' || item.isPartner) && item.diaryImageUrls.length && diaryDescriptionLines(item.diaryDescriptionRaw).length);
    console.log(group, 'eligible cached partners:', new Set(valid.map((item: any) => diaryIdentity(item.name))).size);
    if (group !== 'check_in') assert.ok(valid.some((item: any) => /[\r\n]/.test(item.diaryDescriptionRaw)), 'Parser must preserve description newlines');
  }
  const random = (manifest.coverImageGroups?.random || []).map((entry: any) => getDriveImageProxyUrl(entry.fileId)).filter(cached);
  const deck = { id: 'spotlight-v6-diary', navTitle: 'Spotlight Nhật ký Đà Lạt', title: '', description: '', lists: [] };
  const context = { itemsBySection: items, imageUrls: [], imageLibraryEntries: [], coverImageUrls: [], hinhNenImagePools: { default: [], green: [], dark: [], random }, decks: [deck], baseDecks: [deck] };
  const service = () => {
    const s = new GuideService() as any;
    Object.defineProperty(s, 'dataRoot', { value: root });
    s.activeDestinationId = sourceId;
    s.prepareWorkbookForDataset = async () => {};
    // Isolated fixture is already limited to verified disk-cache images.
    s.assertDriveCacheReady = () => {};
    s.buildDatasetContext = () => structuredClone(context);
    s.ensureWorkbookDerivedContext = () => context;
    s.warmSpotlightV3Hooks = async () => {};
    // festivalHookSources is a getter since 3e4e61ed; shadow it on the instance.
    Object.defineProperty(s, 'festivalHookSources', { value: { reserve: () => null, commit: () => {}, rollback: () => {} } });
    return s;
  };
  const s = service();
  const request = { deckId: deck.id, caption: { coverTitle: '', headline: '', body: '', hashtags: [] } };
  try {
    await s.generateDeckFromCaption(request);
    const first = structuredClone(s.generatedListsByDeckId.get(deck.id)[0]);
    const cycle = structuredClone(s.diaryUsedLines);
    const persist = s.persistGeneratedLists.bind(s);
    s.persistGeneratedLists = () => { throw new Error('SIMULATED_DISK_FAILURE'); };
    await assert.rejects(s.generateDeckFromCaption(request), /SIMULATED_DISK_FAILURE/);
    assert.equal(s.generatedListsByDeckId.get(deck.id).length, 1);
    assert.deepEqual(s.diaryUsedLines, cycle);
    s.persistGeneratedLists = persist;
    await s.generateDeckFromCaption(request);
    const lists = s.generatedListsByDeckId.get(deck.id);
    for (const list of lists) {
      assert.equal(list.pages.length, 12);
      assert.equal(new Set(list.pages.map((p: any) => diaryImageId(p.backgroundImage))).size, 12);
      assert.deepEqual(list.pages.slice(3).map((p: any) => p.items[0].sourceSectionKey), DIARY_ORDER);
      assert.ok(getCachedSpotlightV3Hooks().includes(list.pages[0].title));
      for (const p of list.pages.slice(3)) {
        const section = p.items[0].sourceSectionKey as keyof typeof items;
        const item = items[section].find((i: any) => i.id === p.items[0].id);
        assert.ok(item, `Snapshot source missing: ${JSON.stringify(p.items[0])}; available IDs: ${items[section].map((i: any) => i.id).join(',')}`);
        assert.equal(p.items[0].isPartner, Boolean(item.isPartner));
        if (item.sectionKey !== 'check_in') assert.ok(item.isPartner);
        assert.ok(diaryDescriptionLines(item.diaryDescriptionRaw || '').includes(p.title));
        assert.equal(p.items[0].metaPrimary, item.address);
      }
      assert.ok(list.pages.slice(3).filter((p: any) => p.items[0].isPartner).length >= DIARY_PARTNER_COUNT);
      assert.equal(new Set(list.pages.slice(3).map((p: any) => diaryIdentity(p.items[0].rawName))).size, 9);
    }
    s.updatePageText(deck.id, first.id, 3, { title: '', subtitle: '', diaryFontSize: 10.5, titlePlacement: 'bottom-center', items: [{ name: '', metaPrimary: '' }] });
    s.updatePageText(deck.id, first.id, 3, { textFontSize: 12.5, textScale: 75, title: '', subtitle: '', items: [{ name: '', metaPrimary: '' }] });
    assert.throws(() => s.updatePageText(deck.id, first.id, 3, { textFontSize: 7 }), /Cỡ chữ/);
    assert.throws(() => s.updatePageText(deck.id, first.id, 3, { textScale: 45 }), /Cỡ chữ/);
    assert.throws(() => s.updatePageText(deck.id, first.id, 3, { textScale: 77 }), /Cỡ chữ/);
    assert.throws(() => s.updatePageText(deck.id, first.id, 3, { diaryFontSize: 8 }), /Cỡ chữ/);
    const restarted = service();
    restarted.ensureGeneratedListsLoaded();
    assert.deepEqual(restarted.generatedListsByDeckId.get(deck.id), lists);
    assert.deepEqual(restarted.diaryUsedLines, s.diaryUsedLines);
    const restored = restarted.applyPageTextOverrides(deck.id, [first], restarted.loadPageTextOverrides())[0].pages[3];
    assert.equal(restored.title, ''); assert.equal(restored.items[0].name, ''); assert.equal(restored.items[0].metaPrimary, '');
    assert.equal(restored.titlePlacement, 'bottom-center');
    assert.equal(restored.diaryFontSize, 10.5, 'Font size persists across restart');
    assert.equal(restored.textScale, 75, 'Shared text scale persists across restart');
    assert.equal(restored.textFontSize, 12.5, 'Absolute size persists across restart');
    const shown = restarted.mergeGeneratedLists([deck])[0].lists.find((list: any) => list.id === first.id);
    assert.deepEqual(shown.pages[3], restored, 'Full display merge must preserve blank text and position');
    assert.deepEqual(shown.pages[1], first.pages[1], 'Blank opening page must not gain fallback text');
    restarted.refreshGeneratedListImages(items);
    assert.deepEqual(restarted.generatedListsByDeckId.get(deck.id), lists, 'Refresh must not change snapshots');
    const batchRequest = { deckId: deck.id, count: 3, automationRunId: 'diary-isolated-automation', requestId: 'diary-isolated-automation-3' };
    const [batch, duplicate] = await Promise.all([
      s.enqueueGeneration(() => s.generateBatchLists(batchRequest)),
      s.enqueueGeneration(() => s.generateBatchLists(batchRequest)),
    ]);
    assert.equal(batch.successCount, 3); assert.equal(batch.failCount, 0);
    assert.deepEqual(duplicate, batch, 'Concurrent retry must reuse the completed request');
    const automationLists = s.generatedListsByDeckId.get(deck.id).filter((list: any) => list.automationRunId === batchRequest.automationRunId);
    assert.equal(automationLists.length, 3);
    assert.equal(new Set(automationLists.map((list: any) => list.automationPosition)).size, 3);
    const prior = new Map<string, { position: number; image: string }>();
    for (const list of s.generatedListsByDeckId.get(deck.id)) {
      assert.equal(list.pages.length, 12);
      assert.deepEqual(list.pages.slice(3).map((p: any) => p.items[0].sourceSectionKey), DIARY_ORDER);
      for (const [index, page] of list.pages.slice(3).entries()) {
        const item = page.items[0];
        if (!item.isPartner) continue;
        const key = diaryIdentity(item.rawName), previous = prior.get(key);
        if (previous) {
          assert.notEqual(index + 1, previous.position, `${key}: must move from last position`);
          assert.notEqual(diaryImageId(item.imageUrl), previous.image, `${key}: must not repeat last photo`);
        }
        prior.set(key, { position: index + 1, image: diaryImageId(item.imageUrl) });
      }
    }
    const outputArg = process.argv.indexOf('--output');
    if (process.argv.includes('--stress')) {
      for (let i = 0; i < 25; i++) await s.generateDeckFromCaption(request);
      const stressLists = s.generatedListsByDeckId.get(deck.id).filter((entry: any) => !entry.automationRunId).slice(0, 25);
      assert.equal(stressLists.length, 25);
      assert.equal(new Set(stressLists.map((entry: any) => entry.id)).size, 25);
      const target = path.resolve(process.argv[outputArg + 1]);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, JSON.stringify({ lists: stressLists }));
      console.log('STRESS', JSON.stringify({ lists: 25, pages: stressLists.flatMap((l: any) => l.pages).length, uniqueImages: new Set(stressLists.flatMap((l: any) => l.pages.map((p: any) => p.backgroundImage))).size }));
      return;
    }
    if (outputArg >= 0) {
      const target = path.resolve(process.argv[outputArg + 1]);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, JSON.stringify({ lists, automationLists, source: 'cached Dalat workbook + cached Drive assets' }));
    }
    console.log(`PASS diary integration (${sourceId}): five lists; 4 food/4 cafe partners + 1 Check-in, unique venues, position/photo rotation, source text/address, failed-save rollback, restart, overrides, snapshot preservation and queued batch.`);
  } finally {
    // Only this test's mkdtemp directory, never user data.
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'dalat-diary-test-')));
    fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
