// Synthetic data only. No user workbook/list/cache is read or changed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'partner-rotation-integration-'));
  const data = path.join(root, 'data'), cache = path.join(root, 'cache');
  fs.mkdirSync(data); fs.mkdirSync(cache);
  Object.assign(process.env, { DALAT_DATA_DIR: data, DALAT_DRIVE_FILE_CACHE_DIR: cache,
    DALAT_AUTO_SYNC_SHEET: 'false', DALAT_AUTO_WARM_DRIVE_CACHE: 'false' });
  const { GuideService } = require('../guide.service');
  const { buildDecks } = require('../logic/deck-builder');
  const { setSpotlightV3BuildContext, clearSpotlightV3BuildContext } = require('../logic/deck-builder-v2');
  const { setActiveDestinationLocalize } = require('../sync/destination-localize');
  const { getAllowedDeckIds } = require('../sync/destination-config');
  const { partnerIdentity, sourcePhotoId } = require('../logic/partner-rotation');
  const { supportsPhotoPreset } = require('../photo-presets');
  const { setCachedSpotlightV3Hooks } = require('../sync/spotlight-hook-source');
  setCachedSpotlightV3Hooks(['Đà Lạt đáng lưu']);
  const sections = ['quan_an', 'cafe', 'check_in', 'khu_du_lich', 'hoat_dong', 'dia_diem_lich_su', 'homestay', 'dich_vu', 'choi_dem'];
  const sources = ['dalat', 'dalat-test', 'greenland', 'dalat-threads'];
  const allReports: any[] = [];
  let context: any, service: any;
  const network = global.fetch;
  global.fetch = (async () => { throw Error('Rotation test forbids external network'); }) as typeof fetch;
  const hook = { ready: true, ensureReady: async () => undefined,
    reserve: () => ({ hook: 'Đà Lạt đáng lưu', sourceId: 'synthetic', sourceRevision: 'test' }), commit: () => undefined, rollback: () => undefined };
  const attach = (target: any) => {
    target.assertDriveCacheReady = () => undefined;
    target.prepareWorkbookForDataset = async () => undefined;
    target.buildLocallyVerifiedGenerationContext = async () => structuredClone(context);
    target.ensureWorkbookDerivedContext = () => ({ baseDecks: context.decks });
    target.warmSpotlightV3Hooks = async () => undefined;
    target.loadDeckHookSection = async () => ['Đà Lạt đáng lưu'];
    target.resolveDeckHookCoverTitle = async () => 'Đà Lạt đáng lưu';
    target.resolvePremadeHookCoverTitle = () => 'Đà Lạt đáng lưu';
    target.enrichPov3V2StackTaglines = async (pages: any) => pages;
    target.fetchDeepSeekChat = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ coverTitle: 'Đà Lạt đáng lưu', headline: 'Lưu lại nha', body: 'Gợi ý chuyến đi.', hashtags: [] }) } }] }), { status: 200 });
    for (const name of ['greenHookSource', 'darkHookSource', 'persimmonHookSource']) Object.defineProperty(target, name, { value: hook, configurable: true });
    for (const [name, group] of [['prepareSpotlightV6GreenResources', 'green'], ['prepareSpotlightV6DarkResources', 'dark'], ['prepareSpotlightV6PersimmonResources', 'persimmon']]) {
      target[name] = async () => new Set(context.hinhNenImagePools[group].map((url: string) => new URL(url, 'http://localhost').searchParams.get('id')));
    }
    target.prepareSpotlightV6MapsResources = async () => ({ real: new Set(Object.values(context.itemsBySection).flat().flatMap((item: any) => item.candidateImageUrls.map((url: string) => new URL(url, 'http://localhost').searchParams.get('id')))),
      map: new Set(Object.values(context.itemsBySection).flat().map((item: any) => new URL(item.mapImageUrl, 'http://localhost').searchParams.get('id'))) });
    return target;
  };
  async function photo(id: string) {
    const hash = crypto.createHash('sha256').update(id).digest();
    const raw = Buffer.from(Array.from({ length: 64 * 96 * 3 }, (_, i) => hash[(i + Math.floor(i / 192)) % hash.length]));
    const image = await sharp(raw, { raw: { width: 64, height: 96, channels: 3 } }).png().toBuffer();
    fs.writeFileSync(path.join(cache, id + '.bin'), image);
    fs.writeFileSync(path.join(cache, id + '.json'), JSON.stringify({ contentType: 'image/png', contentLength: image.length }));
    return '/assets/drive-file?id=' + id;
  }
  try {
    service = attach(new GuideService());
    for (const sourceId of sources) {
      service.activeDestinationId = sourceId; service.resetDestinationScopedState(); setActiveDestinationLocalize(sourceId);
      const items: any = {};
      for (const sectionKey of sections) {
        items[sectionKey] = [];
        for (let i = 0; i < 32; i++) {
          const id = `${sourceId}-${sectionKey}-${i}`, isPartner = i < 12;
          const urls = []; for (let n = 0; n < (i === 0 ? 12 : 4); n++) urls.push(await photo(id + '-photo-' + n));
          const mapImageUrl = await photo(id + '-map');
          const name = sectionKey === 'homestay' && i < 3 ? ['Lagom Homestay', 'Little Fish Dalat', 'Tori Wooden House'][i]
            : sectionKey === 'dich_vu' ? `${sourceId} Thuê xe ${i}` : sectionKey === 'check_in' && i === 0 ? `${sourceId} Dốc thử` : `${sourceId} ${sectionKey} ${i}`;
          items[sectionKey].push({ id, sectionKey, sectionTitle: sectionKey, name,
            address: `${i} Đường thử, Xuân Hương - Đà Lạt`, type: sectionKey === 'quan_an' ? 'Ăn sáng ăn trưa ăn tối' : sectionKey === 'homestay' ? 'Homestay' : sectionKey,
            style: 'Chill', highlight: 'Tham quan', theme: 'Mảng xanh', classification: 'Local', openHours: '06:00 - 23:00', phone: '000',
            partnerFlag: isPartner ? 'x' : '', isPartner, headPrice: '100000', price: '100000', hasHeadPriceColumn: true,
            imageUrl: urls[0], candidateImageUrls: urls, imageMapped: true, imageMappingKey: id, imageSource: 'manual',
            mapImageUrl, mapCandidateImageUrls: [mapImageUrl], diaryImageUrls: urls,
            diaryDescriptionRaw: 'View Đà Lạt đẹp\nQuán xinh quá\nChỗ này chill\nĐáng ghé lại\nLưu lại nha' });
        }
      }
      const covers: string[] = []; for (let i = 0; i < 24; i++) covers.push(await photo(`${sourceId}-cover-${i}`));
      const backgrounds = { default: covers, green: covers, dark: covers, random: covers, persimmon: covers };
      setSpotlightV3BuildContext({ hooks: ['Đà Lạt đáng lưu'], destinationId: sourceId === 'greenland' ? 'greenland' : 'dalat' });
      const catalog = buildDecks(items, covers, [], covers, undefined, undefined, backgrounds);
      clearSpotlightV3BuildContext();
      const allowed = new Set(getAllowedDeckIds(sourceId, catalog.map((deck: any) => deck.id)));
      const decks = catalog.filter((deck: any) => allowed.has(deck.id));
      context = { itemsBySection: items, imageUrls: covers, imageLibraryEntries: [], coverImageUrls: covers, hinhNenImagePools: backgrounds, decks };
      service.ensureGeneratedListsLoaded();
      const entries: any[] = [], errors: any[] = [];
      for (const deck of decks) {
        try {
          const lists: any[] = [];
          for (let i = 0; i < 4; i++) {
            const beforeHistory = structuredClone(service.partnerRotation[deck.id] || {});
            const result = deck.id === 'spotlight-partner'
              ? await service.generatePartnerSpotlight({ partnerId: items.quan_an[0].id })
              : await service.generateDeckFromCaption({ deckId: deck.id,
                caption: { coverTitle: 'Đà Lạt đáng lưu', headline: 'Lưu lại nha', body: '', hashtags: [] },
                photoPreset: i % 2 && supportsPhotoPreset(deck.id) ? 'iphone-color-edit-v1' : null });
            const list = service.generatedListsByDeckId.get(deck.id).find((entry: any) => entry.id === result.listId);
            assert.equal(list.partnerRotationVersion, 1); assert.ok(Object.keys(service.partnerRotation[deck.id]).length);
            const history = service.partnerRotation[deck.id];
            for (const [key, state] of Object.entries(history) as any) {
              if (JSON.stringify(state) === JSON.stringify(beforeHistory[key])) continue;
              const last = beforeHistory[key];
              if (last) {
                assert.ok(state.lastPhotos.every((id: string) => !last.lastPhotos.includes(id)), `${deck.id}: repeated partner photo ${key}`);
                if (state.position === last.position) assert.ok(list.warnings.some((message: string) => message.includes('một vị trí')), `${deck.id}: no position exception`);
              }
            }
            assert.ok(list.pages.flatMap((page: any) => page.items || []).some((item: any) => item.isPartner));
            if (['spotlight-v4', 'spotlight-v6'].includes(deck.id)) assert.equal(list.pages.filter((page: any) => page.items?.[0]?.isPartner).length, 4);
            lists.push(list); entries.push({ sourceId, deckId: deck.id, list, expectedPartnerNames: service.renderedPartnerNames(list) });
          }
          const storedBefore = fs.readFileSync(path.join(data, `generated-caption-lists.${sourceId}.json`));
          const reloaded = attach(new GuideService()); reloaded.activeDestinationId = sourceId; reloaded.resetDestinationScopedState(); reloaded.ensureGeneratedListsLoaded();
          for (const list of lists) assert.deepEqual(reloaded.generatedListsByDeckId.get(deck.id).find((entry: any) => entry.id === list.id), list);
          assert.deepEqual(reloaded.partnerRotation, service.partnerRotation);
          const display = service.mergeGeneratedLists([deck], covers)[0];
          for (const list of lists) assert.deepEqual(display.lists.find((entry: any) => entry.id === list.id), list, 'Preview must not reshuffle a saved snapshot');
          service.refreshGeneratedListImages(items);
          assert.ok(storedBefore.equals(fs.readFileSync(path.join(data, `generated-caption-lists.${sourceId}.json`))), 'Refresh must preserve snapshots');
          console.log('PASS', sourceId, deck.id, '4 lists + reload + frozen images');
        } catch (error: any) { const message = error.message.split('\n')[0]; errors.push({ deckId: deck.id, message }); console.log('FAIL', sourceId, deck.id, message); }
      }
      const fixture = { fixture: 'isolated source-specific synthetic data/images', root, expectedCount: entries.length,
        source: { id: sourceId }, lists: entries, dataset: { canvas: { width: 1080, height: 1440 }, source: { id: sourceId }, decks } };
      const reportDir = path.join(root, sourceId); fs.mkdirSync(reportDir);
      fs.writeFileSync(path.join(reportDir, 'generation.json'), JSON.stringify(fixture));
      allReports.push({ sourceId, templates: decks.length, lists: entries.length, errors, reportPath: path.join(reportDir, 'generation.json') });
    }
    // Rollback and deletion are tested using temporary copies, not user lists.
    const deckId = 'threads-food-local', before = fs.readFileSync(path.join(data, 'generated-caption-lists.dalat-threads.json'));
    const stateBefore = structuredClone(service.partnerRotation), listsBefore = structuredClone(service.generatedListsByDeckId.get(deckId));
    const persist = service.persistGeneratedLists.bind(service);
    service.persistGeneratedLists = () => { throw Error('synthetic disk failure'); };
    await assert.rejects(service.generateDeckFromCaption({ deckId, caption: {} }), /synthetic disk failure/);
    assert.deepEqual(service.partnerRotation, stateBefore); assert.deepEqual(service.generatedListsByDeckId.get(deckId), listsBefore);
    assert.ok(before.equals(fs.readFileSync(path.join(data, 'generated-caption-lists.dalat-threads.json'))));
    service.persistGeneratedLists = persist;
    service.generatedListsByDeckId.set(deckId, []); service.persistGeneratedLists();
    const afterDelete = attach(new GuideService()); afterDelete.activeDestinationId = 'dalat-threads'; afterDelete.resetDestinationScopedState(); afterDelete.ensureGeneratedListsLoaded();
    assert.deepEqual(afterDelete.partnerRotation, stateBefore, 'Delete must retain rotation history');
    const batch = await service.generateBatchLists({ deckId, count: 4, requestId: 'rotation-test', photoPreset: null });
    assert.equal(batch.successCount, 4); assert.equal(batch.failCount, 0); assert.ok(batch.lists.every((list: any) => Array.isArray(list.warnings)));
    assert.deepEqual(await service.generateBatchLists({ deckId, count: 4, requestId: 'rotation-test' }), batch, 'Idempotent retry');
    console.log('PASS atomic rollback / delete history / batch / idempotent request');
    fs.writeFileSync(path.join(root, 'summary.json'), JSON.stringify(allReports, null, 2));
    console.log('TEST_ROOT=' + root);
    assert.ok(allReports.every(report => !report.errors.length), JSON.stringify(allReports.flatMap(report => report.errors)));
  } finally { global.fetch = network; clearSpotlightV3BuildContext(); setActiveDestinationLocalize('dalat'); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
