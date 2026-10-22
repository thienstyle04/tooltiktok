import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'threads-grid6-')), data = path.join(root, 'data'), cache = path.join(root, 'drive-file-cache');
  fs.mkdirSync(data); fs.mkdirSync(cache);
  Object.assign(process.env, { DALAT_DATA_DIR: data, DALAT_DRIVE_FILE_CACHE_DIR: cache, DALAT_AUTO_SYNC_SHEET: 'false', DALAT_AUTO_WARM_DRIVE_CACHE: 'false' });
  require('../../../../../scripts/test-support/source-links-fixture.cjs').seedSourceLinks(data);
  const { GuideService } = require('../guide.service');
  const { buildThreadsGrid6Pages, assertThreadsGrid6Pages, buildThreadsGrid6Example, pickThreadsGrid6Hook, threadsGrid6Hooks, threadsGrid6PostCaption, threadsGrid6PostCaptions, THREADS_GRID6_ID: id } = require('../logic/threads-grid6-collage');
  const { setCachedSpotlightV3Hooks } = require('../sync/spotlight-hook-source');
  const { setActiveDestinationLocalize } = require('../sync/destination-localize');
  const { isDeckAllowedForSource, DESTINATIONS } = require('../sync/destination-config');
  const { photoKeys } = require('../logic/partner-rotation');
  const { configureDriveFileDiskCache } = require('../sync/drive-images');
  const { buildPageTextOverride, applyPageTextOverrides } = require('../page-text-overrides');
  configureDriveFileDiskCache(cache); setActiveDestinationLocalize('dalat-threads');
  const hooks = Array.from({ length: 10 }, (_, i) => `Gợi ý Đà Lạt ${i + 1} — lưu lại để tham khảo`);
  setCachedSpotlightV3Hooks([]); // Existing Threads hooks must not depend on Docs.
  const photo = async (key: string) => {
    const hash = crypto.createHash('sha256').update(key).digest();
    const raw = Buffer.from(Array.from({ length: 90 * 120 * 3 }, (_, i) => hash[(i + Math.floor(i / 270)) % hash.length]));
    const bytes = await sharp(raw, { raw: { width: 90, height: 120, channels: 3 } }).png().toBuffer();
    fs.writeFileSync(path.join(cache, `${key}.bin`), bytes); fs.writeFileSync(path.join(cache, `${key}.json`), JSON.stringify({ contentType: 'image/png', contentLength: bytes.length }));
    return '/assets/drive-file?id=' + key;
  };
  const items: any = {};
  for (const section of ['check_in', 'khu_du_lich', 'hoat_dong', 'dia_diem_lich_su', 'cafe', 'quan_an', 'homestay', 'dich_vu', 'choi_dem']) {
    items[section] = [];
    if (['homestay', 'dich_vu', 'choi_dem'].includes(section)) continue;
    for (let index = 0; index < 10; index++) {
      const key = `${section}-${index}`, urls = [];
      for (let n = 0; n < 4; n++) urls.push(await photo(`${key}-${n}`));
      items[section].push({ id: key, sectionKey: section, sectionTitle: section, name: `${section === 'cafe' ? 'Cà phê' : section === 'quan_an' ? 'Quán ăn' : 'Đi chơi'} ${key}`, address: 'Không được render địa chỉ', streetAddress: 'Không được render địa chỉ', type: '', openHours: '', style: '', highlight: '', partnerFlag: index < 2 ? 'x' : '', isPartner: index < 2, headPrice: '', hasHeadPriceColumn: false, price: '', phone: '', imageUrl: urls[0], candidateImageUrls: urls, diaryImageUrls: urls, imageMapped: true, imageMappingKey: key, imageSource: 'manual' });
    }
  }
  // Same physical venue in cafe/food; joint allocation must not duplicate it.
  items.quan_an.push({ ...items.cafe[0], sectionKey: 'quan_an', id: 'cross-section' });
  const covers = []; for (let n = 0; n < 10; n++) covers.push(await photo(`cover-${n}`));
  const input = { itemsBySection: items, coverImageUrls: covers, seed: 'test', hook: hooks[0] };
  const hookHistory: string[] = [];
  for (let n = 0; n < 21; n++) {
    const hook = pickThreadsGrid6Hook(hooks.slice(0, 3), hookHistory, 'hook-cycle-' + n);
    assert.notEqual(hook, hookHistory[hookHistory.length - 1]); hookHistory.push(hook);
    if (n % 3 === 2) assert.equal(new Set(hookHistory.slice(-3)).size, 3, 'Every hook cycle uses the whole pool');
  }
  const actualHooks = threadsGrid6Hooks(), actualPosts = threadsGrid6PostCaptions();
  assert.equal(actualHooks.length, 30); assert.equal(new Set(actualHooks).size, 30);
  assert.equal(actualPosts.length, 18); assert.equal(new Set(actualPosts).size, 18);
  assert.ok(actualPosts.every((post: string) => !actualHooks.includes(post)));
  const committedHooks: string[] = ['Hook cũ không còn trong kho'], committedPosts: string[] = ['Mô tả cũ không còn trong kho'];
  for (let n = 0; n < 91; n++) {
    const hook = pickThreadsGrid6Hook(actualHooks, committedHooks, 'full-cycle-' + n);
    const post = threadsGrid6PostCaption(hook, committedPosts, 'full-cycle-' + n);
    assert.notEqual(hook, committedHooks[committedHooks.length - 1]); assert.notEqual(post, committedPosts[committedPosts.length - 1]);
    assert.notEqual(hook, post); committedHooks.push(hook); committedPosts.push(post);
    if ((n + 1) % 30 === 0) assert.equal(new Set(committedHooks.slice(-30)).size, 30, 'No hook repeats before all 30 are used');
    if ((n + 1) % 18 === 0) assert.equal(new Set(committedPosts.slice(-18)).size, 18, 'Descriptions rotate independently through all 18');
    assert.equal(pickThreadsGrid6Hook(actualHooks, JSON.parse(JSON.stringify(committedHooks)), 'reload'), pickThreadsGrid6Hook(actualHooks, committedHooks, 'reload'));
    assert.equal(threadsGrid6PostCaption(hook, JSON.parse(JSON.stringify(committedPosts)), 'reload'), threadsGrid6PostCaption(hook, committedPosts, 'reload'));
  }
  const pages = buildThreadsGrid6Pages(input); assertThreadsGrid6Pages(pages);
  const photoHistory: any[] = [];
  for (let n = 0; n < 6; n++) {
    const pages = buildThreadsGrid6Pages({ ...input, coverImageUrls: covers.slice(0, 2), previousPages: photoHistory, seed: 'cover-cycle-' + n });
    if (n) assert.notEqual(pages[0].backgroundImage, photoHistory[n - 1][0].backgroundImage);
    photoHistory.push(pages);
    if (n % 2) assert.equal(new Set(photoHistory.slice(-2).map(pages => pages[0].backgroundImage)).size, 2);
  }
  const deck: any = { id, navTitle: 'Threads · Lưới 6 ảnh', title: 'Threads · Lưới 6 ảnh', description: '', lists: [{ id: id + '-main', navTitle: 'List chính', title: '', description: '', pages }] };
  const store: any = { version: 1, decks: { [id]: { [id + '-main']: { '0': buildPageTextOverride(id, pages[0], { title: 'Hook main riêng — KHÔNG kế thừa', textFontSize: 44, titlePlacement: 'bottom-left' }, undefined, covers), '1': buildPageTextOverride(id, pages[1], { textFontSize: 35 }, undefined, covers) } } } };
  deck.lists = applyPageTextOverrides(id, deck.lists, store);
  const context = { itemsBySection: items, imageUrls: covers, imageLibraryEntries: [], coverImageUrls: covers, hinhNenImagePools: { default: covers, dark: [], green: [], random: [] }, decks: [deck] };
  const attach = (service: any) => {
    service.activeDestinationId = 'dalat-threads'; service.resetDestinationScopedState();
    service.assertDriveCacheReady = () => undefined;
    service.prepareWorkbookForDataset = async () => undefined;
    service.buildLocallyVerifiedGenerationContext = async () => structuredClone(context);
    service.ensureWorkbookDerivedContext = () => ({ baseDecks: [deck] });
    service.warmSpotlightV3Hooks = async () => { throw Error('Grid6 must not load Spotlight/Docs hooks'); };
    service.loadPageTextOverrides = () => store;
    return service;
  };
  const service = attach(new GuideService()); const lists: any[] = [];
  try {
    assert.ok(isDeckAllowedForSource('dalat-threads', id));
    DESTINATIONS['threads-green-test'] = { ...DESTINATIONS['dalat-threads'], id: 'threads-green-test', label: 'Đà Lạt giả tên', contentDestinationId: 'greenland' };
    assert.equal(isDeckAllowedForSource('threads-green-test', id), false, 'Kind Threads alone or a misleading label must not grant permission');
    for (const source of ['dalat', 'greenland', 'dalat-test']) assert.equal(isDeckAllowedForSource(source, id), false);
    for (let n = 0; n < 8; n++) {
      const before = structuredClone(service.partnerRotation[id] || {});
      const result = await service.generateDeckFromCaption({ deckId: id, caption: {}, photoPreset: n >= 4 ? 'photo-ref-07-dark-crisp-v1' : null });
      const list = service.generatedListsByDeckId.get(id).find((list: any) => list.id === result.listId);
      assertThreadsGrid6Pages(list.pages); assert.equal(list.pages[0].textFontSize, 44); assert.equal(list.pages[0].titlePlacement, 'bottom-left'); assert.equal(list.pages[1].textFontSize, 35);
      assert.ok(threadsGrid6Hooks().includes(list.pages[0].title)); assert.ok(list.pages[0].title.includes('24')); assert.notEqual(list.postCaption, list.pages[0].title); assert.ok(threadsGrid6PostCaptions().includes(list.postCaption)); assert.equal(list.captionBody, ''); assert.equal(list.templateVersion, 1); assert.equal(list.canvasPreset, 'tiktok-9x16');
      for (const [key, value] of Object.entries(service.partnerRotation[id]) as any) if (before[key] && JSON.stringify(before[key]) !== JSON.stringify(value)) {
        assert.notEqual(value.position, before[key].position); assert.ok(value.lastPhotos.every((photo: string) => !before[key].lastPhotos.includes(photo)));
      }
      lists.push(list);
    }
    const generatedHooks = lists.map(list => list.pages[0].title);
    assert.equal(new Set(lists.map(list => list.postCaption)).size, lists.length, 'Post descriptions have an independent, unspent cycle');
    assert.ok(threadsGrid6PostCaption('Hook người dùng chỉnh riêng').trim());
    assert.equal(new Set(generatedHooks).size, generatedHooks.length, 'Do not recycle the old three-hook pool after only three lists');
    const reload = attach(new GuideService()); reload.ensureGeneratedListsLoaded();
    assert.deepEqual(reload.generatedListsByDeckId.get(id), lists, 'Restart preserves complete snapshots');
    const before = JSON.stringify({ history: service.partnerRotation, lists: service.generatedListsByDeckId.get(id) });
    const coverBackups = covers.map((url: string) => { const file = path.join(cache, url.split('id=')[1] + '.bin'); return { file, bytes: fs.readFileSync(file) }; });
    try {
      coverBackups.forEach((entry: any) => fs.writeFileSync(entry.file, 'broken-image'));
      await assert.rejects(service.generateDeckFromCaption({ deckId: id, caption: {} }), /ảnh|cache|Ảnh/);
      assert.equal(JSON.stringify({ history: service.partnerRotation, lists: service.generatedListsByDeckId.get(id) }), before, 'Corrupt images must not consume a hook or rotation');
    } finally { coverBackups.forEach((entry: any) => fs.writeFileSync(entry.file, entry.bytes)); }
    const persist = service.persistGeneratedLists; service.persistGeneratedLists = () => { throw Error('test disk failure'); };
    await assert.rejects(service.generateDeckFromCaption({ deckId: id, caption: {} }), /test disk failure/);
    assert.equal(JSON.stringify({ history: service.partnerRotation, lists: service.generatedListsByDeckId.get(id) }), before);
    service.persistGeneratedLists = persist;
    assert.throws(() => buildThreadsGrid6Pages({ ...input, hook: '' }), /thiếu hook/);
    const mixed = structuredClone(items); mixed.check_in.forEach((item: any) => item.isPartner = false); mixed.khu_du_lich.forEach((item: any) => item.isPartner = false); mixed.hoat_dong.forEach((item: any) => item.isPartner = false); mixed.dia_diem_lich_su.forEach((item: any) => item.isPartner = false);
    assertThreadsGrid6Pages(buildThreadsGrid6Pages({ ...input, itemsBySection: mixed }));
    const missing = structuredClone(items); missing.cafe = missing.cafe.slice(0, 3); assert.throws(() => buildThreadsGrid6Pages({ ...input, itemsBySection: missing }), /Cà phê.*3\/6/);
    const noOwn = structuredClone(items); noOwn.cafe.forEach((item: any) => item.diaryImageUrls = []); assert.throws(() => buildThreadsGrid6Pages({ ...input, itemsBySection: noOwn }), /Cà phê.*0\/6/);
    const duplicate = structuredClone(pages); duplicate[1].items[1].imageUrl = duplicate[1].items[0].imageUrl; assert.throws(() => assertThreadsGrid6Pages(duplicate), /trùng ảnh/);
    // Re-upload the same pixels under a different source ID.
    const url = pages[1].items[0].imageUrl, original = url.split('id=')[1], alias = 'duplicate-alias';
    const recompressed = await sharp(fs.readFileSync(path.join(cache, original + '.bin'))).png({ compressionLevel: 0 }).toBuffer();
    fs.writeFileSync(path.join(cache, alias + '.bin'), recompressed); fs.writeFileSync(path.join(cache, alias + '.json'), JSON.stringify({ contentType: 'image/png', contentLength: recompressed.length }));
    const aliasUrl = '/assets/drive-file?id=' + alias; assert.ok(photoKeys(url).some((key: string) => key.startsWith('content:') && photoKeys(aliasUrl).includes(key)));
    duplicate[1].items[1].imageUrl = aliasUrl; assert.throws(() => assertThreadsGrid6Pages(duplicate), /trùng ảnh/);
    const { getCachedDriveFileContentFingerprint, getCachedDriveFileVisualFingerprint } = require('../sync/drive-images');
    for (const [key, value] of [['same-scene-a', 230], ['same-scene-b', 240]] as const) {
      const bytes = await sharp({ create: { width: 90, height: 120, channels: 3, background: { r: value, g: value, b: value } } }).png().toBuffer();
      fs.writeFileSync(path.join(cache, key + '.bin'), bytes); fs.writeFileSync(path.join(cache, key + '.json'), JSON.stringify({ contentType: 'image/png', contentLength: bytes.length }));
    }
    assert.equal(getCachedDriveFileVisualFingerprint('same-scene-a'), getCachedDriveFileVisualFingerprint('same-scene-b'));
    assert.notEqual(getCachedDriveFileContentFingerprint('same-scene-a'), getCachedDriveFileContentFingerprint('same-scene-b'));
    duplicate[1].items[0].imageUrl = '/assets/drive-file?id=same-scene-a'; duplicate[1].items[1].imageUrl = '/assets/drive-file?id=same-scene-b';
    assertThreadsGrid6Pages(duplicate); // Similar composition is not duplicate content.
    assert.equal(buildThreadsGrid6Example().length, 5);
    const { AutomationSchedulerService } = require('../automation-scheduler.service');
    const scheduler = new AutomationSchedulerService(service); scheduler.findBrowser = () => ({ name: 'isolated', path: 'test' });
    const schedule = { name: 'Grid6 isolated', destinationId: 'dalat-threads', frequency: 'daily', dailyTime: '23:15', outputDir: root, templates: [{ deckId: id, count: 3, photoPreset: 'photo-ref-07-dark-crisp-v1' }], hook: { mode: 'normal' } };
    assert.ok(scheduler.create(schedule).schedules.some((entry: any) => entry.templates.some((template: any) => template.deckId === id)));
    assert.throws(() => scheduler.create({ ...schedule, destinationId: 'threads-green-test' }), /Threads.*Đà Lạt/);
    const generate = service.generateDeckFromCaption.bind(service); let attempts = 0;
    service.generateDeckFromCaption = async (request: any) => { if (++attempts === 1) throw Error('isolated first-list failure'); return generate(request); };
    const batch = await service.generateBatchLists({ deckId: id, count: 2 });
    assert.equal(batch.successCount, 1); assert.equal(batch.failCount, 1); assert.ok(batch.errors[0].message.includes('first-list failure'));
    service.generateDeckFromCaption = generate;
    service.activeDestinationId = 'dalat'; await assert.rejects(service.generateDeckFromCaption({ deckId: id, caption: {} }), /Threads.*Đà Lạt/);
    fs.writeFileSync(path.join(root, 'fixture.json'), JSON.stringify({ lists, cache, hookPool: actualHooks, report: '4 original + 4 Dark Crisp, synthetic only; 91 independent copy selections' }));
    console.log('PASS Threads grid6: 8 lists; global selection, sources, photo fingerprints, rotation, hooks, typography, rollback and restart.');
    console.log('GRID6_AUDIT=' + path.join(root, 'fixture.json'));
  } finally { await service.onModuleDestroy?.(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
