// Real service failure/queue/scheduler tests. Everything is synthetic and temporary.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import crypto from 'node:crypto';

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'partner-rotation-failures-'));
  Object.assign(process.env, { DALAT_DATA_DIR: path.join(root, 'data'), DALAT_DRIVE_FILE_CACHE_DIR: path.join(root, 'cache'), DALAT_AUTO_SYNC_SHEET: 'false', DALAT_AUTO_WARM_DRIVE_CACHE: 'false' });
  fs.mkdirSync(path.join(root, 'cache')); fs.mkdirSync(path.join(root, 'data'));
  const { GuideService } = require('../guide.service');
  const { AutomationSchedulerService } = require('../automation-scheduler.service');
  const { buildPagesForDeck } = require('../logic/deck-builder');
  const { rotatePartnerList, partnerIdentity, sourcePhotoId } = require('../logic/partner-rotation');
  const { setActiveDestinationLocalize } = require('../sync/destination-localize');
  const { verifyDriveFileCache } = require('../sync/drive-images');
  let context: any;
  const network = global.fetch; global.fetch = (async () => { throw Error('No network in synthetic test'); }) as typeof fetch;
  async function photo(id: string, n: number) {
    const hash = crypto.createHash('sha256').update(String(n)).digest();
    const raw = Buffer.from(Array.from({ length: 80 * 80 * 3 }, (_, i) => hash[(i + Math.floor(i / 240)) % hash.length]));
    const bytes = await sharp(raw, { raw: { width: 80, height: 80, channels: 3 } }).png().toBuffer();
    fs.writeFileSync(path.join(root, 'cache', id + '.bin'), bytes);
    fs.writeFileSync(path.join(root, 'cache', id + '.json'), JSON.stringify({ contentType: 'image/png', contentLength: bytes.length }));
    return '/assets/drive-file?id=' + id;
  }
  const venues: any[] = [];
  for (let i = 0; i < 22; i++) {
    const urls = [await photo('food-' + i + '-0', i + 1), await photo('food-' + i + '-1', i + 70)];
    venues.push({ id: 'food-' + i, sectionKey: 'quan_an', name: 'Quán thử ' + i, address: '12 Đường thử, Xuân Hương - Đà Lạt', type: 'Ăn sáng ăn trưa ăn tối',
      isPartner: i < 7, partnerFlag: i < 7 ? 'x' : '', classification: 'Local', imageUrl: urls[0], candidateImageUrls: urls,
      imageMappingKey: 'food-' + i, imageMapped: true, imageSource: 'manual', headPrice: '100000', price: '100000' });
  }
  const attach = (source = 'dalat-threads') => {
    const service: any = new GuideService(); service.activeDestinationId = source; service.resetDestinationScopedState(); setActiveDestinationLocalize(source);
    service.assertDriveCacheReady = () => undefined; service.prepareWorkbookForDataset = async () => undefined;
    service.buildLocallyVerifiedGenerationContext = async () => structuredClone(context);
    service.ensureWorkbookDerivedContext = () => ({ baseDecks: context.decks });
    return service;
  };
  const setup = (partners: number) => {
    const items = venues.filter((item, i) => !item.isPartner || i < partners);
    const pages = buildPagesForDeck('threads-food-local', { quan_an: items }, [], [], 'fixture', new Set(), new Set(), [], {});
    context = { itemsBySection: { quan_an: items }, imageUrls: [], imageLibraryEntries: [], coverImageUrls: [], hinhNenImagePools: {},
      decks: [{ id: 'threads-food-local', navTitle: 'Quán ăn Threads Local', lists: [{ id: 'threads-food-local-main', navTitle: 'List chính', title: '', description: '', pages }] }] };
  };
  try {
    setActiveDestinationLocalize('dalat-threads');
    assert.throws(() => setup(0), /ít nhất 1 đối tác/);
    for (const count of [1, 3, 4, 5, 7]) {
      setup(count); const service = attach();
      const response = await service.generateDeckFromCaption({ deckId: 'threads-food-local', caption: {} });
      const list = service.generatedListsByDeckId.get('threads-food-local').find((entry: any) => entry.id === response.listId);
      assert.equal(list.pages[0].items.filter((item: any) => item.isPartner).length, Math.min(5, count));
      assert.ok(list.pages[0].items.slice(0, Math.min(5, count)).every((item: any) => item.isPartner));
    }
    setup(1); const service = attach();
    const snapshot = () => JSON.stringify({ lists: [...service.generatedListsByDeckId], history: service.partnerRotation });
    service.ensureGeneratedListsLoaded(); const before = snapshot();
    const originalAssert = service.assertGeneratedImageCache.bind(service);
    service.assertGeneratedImageCache = async () => { throw Error('synthetic render failure'); };
    await assert.rejects(service.generateDeckFromCaption({ deckId: 'threads-food-local', caption: {} }), /synthetic render failure/);
    assert.equal(snapshot(), before, 'Render failure must not consume history or save a list'); service.assertGeneratedImageCache = originalAssert;
    const failing = service.generateDeckFromCaption.bind(service); let attempts = 0;
    service.generateDeckFromCaption = async (request: any) => { if (++attempts === 2) throw Error('synthetic second list failure'); return failing(request); };
    const partial = await service.generateBatchLists({ deckId: 'threads-food-local', count: 4 });
    assert.equal(partial.successCount, 3); assert.equal(partial.failCount, 1); assert.equal(partial.errors[0].index, 2);
    service.generateDeckFromCaption = failing;
    // FIFO promises must observe the history committed by the preceding promise.
    const queued = await Promise.all(Array.from({ length: 4 }, () => service.enqueueGeneration(() => failing({ deckId: 'threads-food-local', caption: {} }))));
    assert.equal(new Set(queued.map((entry: any) => entry.listId)).size, 4);
    assert.ok(queued.every((entry: any) => entry.warnings?.some((message: string) => message.includes('một vị trí'))));
    const scheduler: any = Object.create(AutomationSchedulerService.prototype);
    service.getDestinations = () => ({ active: { id: 'dalat-threads' } });
    Object.assign(scheduler, { manualExportUntil: 0, waitForExistingSync: async () => undefined, assertOutputDirectory: () => undefined, findBrowser: () => ({}),
      assertHookSelectionReady: () => undefined, assertFrontendReady: async () => undefined, waitForDriveCache: async () => undefined,
      touch: () => undefined, persist: () => undefined, closeBrowser: async () => undefined, launchRenderer: async (run: any) => { run.status = 'completed'; }, guideService: service });
    const run: any = { id: 'synthetic-rotation', templates: [{ deckId: 'threads-food-local', count: 4, photoPreset: 'iphone-color-edit-v1' }], destinationId: 'dalat-threads', hook: { mode: 'normal' }, outputDir: 'not-written', generated: [], listIds: [], errors: [], status: 'queued' };
    await scheduler.executeWithAi(run);
    assert.equal(run.status, 'completed'); assert.equal(run.listIds.length, 4); assert.equal(run.errors.length, 0); assert.ok(run.warnings.length);
    // A secondary hook-file error cannot turn an already saved list into a
    // failed request (and cause a client to duplicate it on retry).
    const originalCommit = service.festivalHookSources.commit.bind(service.festivalHookSources);
    service.festivalHookSources.commit = () => { throw Error('synthetic hook disk failure'); };
    const savedWithWarning = await failing({ deckId: 'threads-food-local', caption: {} });
    assert.ok(savedWithWarning.warnings.some((message: string) => message.includes('vòng hook')));
    assert.ok(service.generatedListsByDeckId.get('threads-food-local').some((list: any) => list.id === savedWithWarning.listId));
    service.festivalHookSources.commit = originalCommit;
    // Spotlight's cover design also uses the partner-photo cycle. Its final
    // selected cover must be recorded, not silently reselected after rotation.
    const v4Pool = structuredClone(venues.filter((item, i) => !item.isPartner || i < 4));
    for (const [index, partner] of v4Pool.filter(item => item.isPartner).entries()) {
      for (let n = 2; n < 6; n++) partner.candidateImageUrls.push(await photo(`v4-${index}-${n}`, 200 + index * 6 + n));
    }
    const v4Covers = v4Pool.filter(item => item.isPartner).flatMap(item => item.candidateImageUrls.slice(0, 2));
    const v4Items = { quan_an: v4Pool, cafe: [], check_in: [], khu_du_lich: [], hoat_dong: [], dia_diem_lich_su: [], homestay: [], dich_vu: [], choi_dem: [] };
    const v4Pages = buildPagesForDeck('spotlight-v4', v4Items, v4Covers, [], 'cover-fixture', new Set(), new Set(), v4Covers, {});
    context = { itemsBySection: v4Items, imageUrls: v4Covers, imageLibraryEntries: [], coverImageUrls: v4Covers, hinhNenImagePools: {},
      decks: [{ id: 'spotlight-v4', navTitle: 'Spotlight V4', lists: [{ id: 'spotlight-v4-main', navTitle: 'List chính', title: '', description: '', pages: v4Pages }] }] };
    const v4Service = attach('dalat'); v4Service.warmSpotlightV3Hooks = async () => undefined;
    const { setCachedSpotlightV3Hooks } = require('../sync/spotlight-hook-source'); setCachedSpotlightV3Hooks(['Đà Lạt đáng lưu']);
    const v4Created = await v4Service.generateDeckFromCaption({ deckId: 'spotlight-v4', caption: { coverTitle: 'Đà Lạt đáng lưu' } });
    const v4List = v4Service.generatedListsByDeckId.get('spotlight-v4').find((list: any) => list.id === v4Created.listId);
    const finalCoverId = sourcePhotoId(v4List.pages[0].backgroundImage);
    assert.ok(Object.values(v4Service.partnerRotation['spotlight-v4']).some((state: any) => state.lastPhotos.includes(finalCoverId)), 'Final cover belongs to recorded partner history');
    // Stable IDs survive cache loss; duplicated content under a new ID is excluded.
    const first = venues[0], simple = { id: 'x-caption', navTitle: '', title: '', description: '', pages: [{ type: 'list', chipText: '', layoutVariant: 'standard', items: [{ ...first, rawName: first.name, sourceSectionKey: first.sectionKey, label: '' }] }] };
    const rotated = rotatePartnerList(simple, 'grid-4', { quan_an: [first] }, {}, 'dup');
    const selected = rotated.list.pages[0].items[0].imageUrl, selectedId = selected.split('=')[1];
    fs.copyFileSync(path.join(root, 'cache', selectedId + '.bin'), path.join(root, 'cache', 'duplicate.bin'));
    fs.copyFileSync(path.join(root, 'cache', selectedId + '.json'), path.join(root, 'cache', 'duplicate.json'));
    const duplicate = { ...first, imageUrl: '/assets/drive-file?id=duplicate', candidateImageUrls: ['/assets/drive-file?id=duplicate'] };
    assert.throws(() => rotatePartnerList(simple, 'grid-4', { quan_an: [duplicate] }, rotated.history, 'dup2'), /không đủ ảnh/);
    const stable = sourcePhotoId(selected); fs.renameSync(path.join(root, 'cache', selectedId + '.bin'), path.join(root, 'cache', selectedId + '.removed-for-test'));
    assert.equal(sourcePhotoId(selected), stable, 'Cache disappearance must not invent a new identity');
    // Real cache validator rejects a PNG which has a valid header but truncated pixels.
    const corrupt = await photo('truncated', 150); const corruptPath = path.join(root, 'cache', 'truncated.bin');
    fs.writeFileSync(corruptPath, fs.readFileSync(corruptPath).subarray(0, 48));
    assert.equal((await verifyDriveFileCache(['truncated']))[0].status, 'corrupt');
    // Corrupt persistent history is fail-closed; never overwrite the user's store.
    const store = path.join(root, 'data', 'generated-caption-lists.dalat-threads.json'); const bytes = fs.readFileSync(store);
    const broken = JSON.parse(bytes.toString()); broken.partnerRotation = { 'threads-food-local': { invalid: { position: 0 } } };
    fs.writeFileSync(store, JSON.stringify(broken)); const savedBroken = fs.readFileSync(store);
    assert.throws(() => attach().ensureGeneratedListsLoaded(), /chưa ghi đè dữ liệu/); assert.ok(savedBroken.equals(fs.readFileSync(store)));
    console.log('PASS real generation ratios / render rollback / partial batch / FIFO / scheduler warnings / duplicate content / stable IDs / truncated cache / fail-closed history. ROOT=' + root);
  } finally { global.fetch = network; setActiveDestinationLocalize('dalat'); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
