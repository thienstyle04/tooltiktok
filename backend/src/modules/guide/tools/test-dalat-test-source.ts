import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import * as XLSX from 'xlsx';
import sharp from 'sharp';

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-test-source-'));
  const data = path.join(root, 'data'), cache = path.join(root, 'cache');
  fs.mkdirSync(data); fs.mkdirSync(cache);
  Object.assign(process.env, { DALAT_DATA_DIR: data, DALAT_DRIVE_FILE_CACHE_DIR: cache,
    DALAT_AUTO_SYNC_SHEET: 'false', DALAT_AUTO_WARM_DRIVE_CACHE: 'false' });
  const { GuideService } = require('../guide.service');
  const config = require('../sync/destination-config');
  const { setActiveDestinationLocalize, getMarketingCopy, buildCaptionHashtags } = require('../sync/destination-localize');
  const { parseWorkbookBuffer } = require('../sync/workbook-source');
  const { publishedSourcePaths, publishSourceSnapshot } = require('../sync/published-source');
  const { writeSheetDriveManifest, readSheetDriveManifest } = require('../sync/sheet-drive-manifest');
  const { itemMappingKey, composeAddress } = require('../logic/image-resolver');
  const { NightSyncCoordinator } = require('../sync/night-sync-coordinator');
  const { enableNightSyncPolicy } = require('../sync/night-sync-policy');
  const originalFetch = global.fetch;
  const requests: string[] = [];
  global.fetch = (async (url: unknown) => { requests.push(String(url)); throw new Error('Isolated test: network unavailable'); }) as typeof fetch;
  enableNightSyncPolicy();
  const registry = { ...config.DESTINATIONS };
  try {
    assert.match(config.getDestinationConfig('dalat').sheetUrl, /1-ECVLtuySSlCO5AShcJle1uP9j8XCA4l/);
    assert.equal(config.getDestinationConfig('dalat-test').label, 'Đà Lạt Test');
    assert.match(config.getDestinationConfig('dalat-test').exportUrl, /1QlMXQ1XH-uHS6bBEC7Pps5f1p9rYJ780/);
    assert.equal(getMarketingCopy('dalat-test').label, 'Đà Lạt');
    assert.deepEqual(buildCaptionHashtags([], 'gen_z', 'dalat-test', 'threads-food-local'), buildCaptionHashtags([], 'gen_z', 'dalat', 'threads-food-local'));
    const service: any = new GuideService();
    assert.equal(service.activeDestinationId, 'dalat');
    await assert.rejects(service.setActiveDestination({ id: 'dalat-test' }), /Tải dữ liệu/);
    assert.equal(service.activeDestinationId, 'dalat');
    const makeSource = (id: string) => {
      const workbook = XLSX.utils.book_new();
      const manifest: any = { version: 5, generatedAt: new Date().toISOString(), workbookName: id, workbookMtimeMs: Date.now(), items: {}, coverImages: [],
        coverImageGroups: { default: [], green: [], dark: [], random: [], persimmon: [] }, hookSourceGroups: {
          green: 'https://docs.google.com/document/d/test-green/edit', dark: 'https://docs.google.com/document/d/test-dark/edit',
          persimmon: 'https://docs.google.com/document/d/test-persimmon/edit',
        } };
      for (const [sheet, section] of [['Quan_an', 'quan_an'], ['Cafe', 'cafe'], ['Check_in', 'check_in'], ['Choi_dem', 'choi_dem'], ['Homestay', 'homestay'], ['Hoat_dong', 'hoat_dong'], ['Khu_du_lich', 'khu_du_lich']]) {
        const rows: any[][] = [['ten_quan', 'dia_chi', 'ten_phuong', 'doi_tac', 'phan_loai', 'gia_dau_nguoi', 'chu_de']];
        for (let i = 0; i < 16; i++) {
          const name = `${id} ${section} ${i}`, address = composeAddress('12 Đường thử', 'Xuân Hương - Đà Lạt');
          rows.push([name, '12 Đường thử', 'Xuân Hương - Đà Lạt', i < (section === 'quan_an' ? 4 : 5) ? 'x' : '', 'Local', 100000, i % 2 ? 'Tone đen' : 'Mảng xanh']);
          const key = itemMappingKey(section, name, address), fileId = `${id}-${section}-${i}`;
          manifest.items[key] = { key, sectionKey: section, name, address, fileId, fileName: fileId + '.png', sourceLink: 'https://drive.google.com/file/d/' + fileId,
            candidateImages: [{ fileId, fileName: fileId + '.png', viewUrl: '' }] };
        }
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheet);
      }
      for (const group of Object.keys(manifest.coverImageGroups)) {
        manifest.coverImageGroups[group] = Array.from({ length: 12 }, (_, i) => ({ fileId: `${id}-${group}-${i}`, fileName: `${group}-${i}.png`, viewUrl: '' }));
      }
      manifest.coverImages = manifest.coverImageGroups.default;
      const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return { source: parseWorkbookBuffer(bytes, { workbookName: id + '.xlsx', destinationId: id, sourceUrl: config.getDestinationConfig(id).sheetUrl, sourceType: 'google-sheet' }), manifest };
    };
    const old = makeSource('dalat'), test = makeSource('dalat-test');
    fs.writeFileSync(path.join(data, 'workbook-cache.dalat.xlsx'), old.source.workbookBuffer);
    writeSheetDriveManifest(data, old.manifest, 'dalat');
    service.workbookSource = old.source;
    service.workbookSourceByDestination.set('dalat', old.source);
    service.workbookDerivedCache = null;
    service.workbookDerivedCacheByDestination.clear();
    publishSourceSnapshot(data, test.source, test.manifest, () => true);
    const pointerBefore = JSON.stringify(publishedSourcePaths(data, 'dalat-test'));
    assert.throws(() => publishSourceSnapshot(data, test.source, { ...test.manifest, items: {} }, () => false), /Đã dừng đồng bộ/);
    assert.equal(JSON.stringify(publishedSourcePaths(data, 'dalat-test')), pointerBefore);
    assert.equal(Object.keys(readSheetDriveManifest(data, 'dalat-test').items).length, 112);
    assert.throws(() => publishedSourcePaths(data, '../dalat'), /Mã nguồn/);
    for (const fixture of [old, test]) for (const fileId of [
      ...Object.values(fixture.manifest.items).map((entry: any) => entry.fileId),
      ...Object.values(fixture.manifest.coverImageGroups).flat().map((entry: any) => entry.fileId),
    ]) {
      const pixels = crypto.createHash('sha256').update(fileId).digest();
      const raw = Buffer.from(Array.from({ length: 80 * 60 * 3 }, (_, index) => pixels[(index + Math.floor(index / 240)) % pixels.length]));
      const image = await sharp(raw, { raw: { width: 80, height: 60, channels: 3 } }).png().toBuffer();
      fs.writeFileSync(path.join(cache, `${fileId}.bin`), image);
      fs.writeFileSync(path.join(cache, `${fileId}.json`), JSON.stringify({ contentType: 'image/png', contentLength: image.length }));
    }
    const lists: any[] = [];
    for (const id of ['dalat', 'dalat-test']) {
      await service.setActiveDestination({ id });
      assert.equal(service.getDestinations().active.id, id);
      for (const deckId of ['threads-food-local', 'threads-cafe-local']) {
        const result = await service.generateBatchLists({ deckId, count: 4, photoPreset: deckId.includes('cafe') ? 'iphone-color-edit-v1' : null });
        assert.equal(result.failCount, 0, JSON.stringify(result.errors));
        assert.equal(result.successCount, 4);
        const dataset = await service.getDataset();
        for (const generated of result.lists) {
          const list = dataset.decks.find((deck: any) => deck.id === deckId).lists.find((entry: any) => entry.id === generated.listId);
          const items = list.pages[0].items, partners = deckId.includes('food') ? 4 : 5;
          assert.equal(items.length, 10); assert.equal(items.filter((entry: any) => entry.isPartner).length, partners);
          assert.ok(items.slice(0, partners).every((entry: any) => entry.isPartner));
          assert.ok(items.every((entry: any) => entry.name.startsWith(id + ' ')));
          assert.equal(new Set(items.filter((entry: any) => entry.imageUrl).map((entry: any) => entry.imageUrl)).size, 6);
          assert.equal(list.pages[0].threadsPartnerPolicy, 'balanced-local-v1');
          lists.push({ sourceId: id, deckId, list });
        }
      }
    }
    const testStores = service.hooksForSource('dalat-test');
    for (const group of ['green', 'dark', 'persimmon']) {
      testStores[group].fetchDocument = async () => `Hook ${group} nguồn Test\nMột hook ${group} nữa`;
      await testStores[group].ensureReady(test.manifest.hookSourceGroups[group], true);
    }
    for (const deckId of ['spotlight-v4', 'spotlight-v6', 'spotlight-v6-green', 'spotlight-v6-dark', 'spotlight-v6-persimmon']) {
      const created = await service.generateDeckFromCaption({ deckId, caption: { coverTitle: 'Thử Đà Lạt', headline: 'Đi đâu?', body: '', hashtags: [] },
        photoPreset: deckId === 'spotlight-v6' ? 'iphone-color-edit-v1' : null });
      const rendered = (await service.getDataset()).decks.find((deck: any) => deck.id === deckId).lists.find((entry: any) => entry.id === created.listId);
      if (deckId === 'spotlight-v4' || deckId === 'spotlight-v6') {
        assert.equal(rendered.pages.length, 14);
        assert.equal(rendered.pages.filter((page: any) => page.type === 'list' && page.items[0]?.isPartner).length, 4);
      }
      assert.ok(!JSON.stringify(rendered).includes('Đà Lạt Test'));
    }
    const sourceUrl = lists.find(entry => entry.sourceId === 'dalat-test').list.pages[0].items.find((item: any) => item.imageUrl).imageUrl;
    const sourceBody = (await service.getDriveFileAsset(new URL(sourceUrl, 'http://localhost').searchParams.get('id'))).body;
    const editedBody = await service.getColorEditedAsset(sourceUrl, 'iphone-color-edit-v1');
    assert.ok(!sourceBody.equals(editedBody));
    assert.ok((await service.getDriveFileAsset(new URL(sourceUrl, 'http://localhost').searchParams.get('id'))).body.equals(sourceBody));
    const usagePath = path.join(data, 'used-inventory.dalat-test.json');
    const usageBeforeFailure = fs.readFileSync(usagePath, 'utf8');
    const savedBeforeFailure = fs.readFileSync(path.join(data, 'generated-caption-lists.dalat-test.json'), 'utf8');
    const verified = service.buildLocallyVerifiedGenerationContext.bind(service);
    service.buildLocallyVerifiedGenerationContext = async (...args: any[]) => {
      const context = await verified(...args);
      for (const item of context.itemsBySection.quan_an) item.isPartner = false;
      return context;
    };
    await assert.rejects(service.generateDeckFromCaption({ deckId: 'threads-food-local', caption: {} }), /ít nhất 1 đối tác/);
    service.buildLocallyVerifiedGenerationContext = verified;
    assert.equal(fs.readFileSync(usagePath, 'utf8'), usageBeforeFailure);
    assert.equal(fs.readFileSync(path.join(data, 'generated-caption-lists.dalat-test.json'), 'utf8'), savedBeforeFailure);
    const oldState = fs.readFileSync(path.join(data, 'generated-caption-lists.dalat.json'), 'utf8');
    const beforeHook = service.hooksForSource('dalat'), testHook = service.hooksForSource('dalat-test');
    assert.notEqual(beforeHook.green, testHook.green);
    testHook.green.fetchDocument = async () => 'Hook riêng của nguồn Test\nMột câu hook Test thứ hai';
    await testHook.green.ensureReady('https://docs.google.com/document/d/test-hook-source/edit', true);
    testHook.green.commit(testHook.green.reserve());
    assert.equal(beforeHook.green.getCachedHooks().length, 0);
    assert.ok(fs.existsSync(path.join(data, 'source-hooks/dalat-test/spotlight-v6-green-hooks.json')));
    const restarted: any = new GuideService();
    assert.equal(restarted.activeDestinationId, 'dalat-test');
    const reload = await restarted.getDataset();
    for (const { sourceId, deckId, list } of lists.filter(entry => entry.sourceId === 'dalat-test')) {
      const actual = reload.decks.find((deck: any) => deck.id === deckId).lists.find((entry: any) => entry.id === list.id);
      assert.deepEqual(actual.pages, list.pages, `${sourceId} saved pages changed on restart`);
      assert.equal(actual.photoPreset, list.photoPreset);
    }
    assert.equal(fs.readFileSync(path.join(data, 'generated-caption-lists.dalat.json'), 'utf8'), oldState);
    let initialized = false, calls = 0;
    const coordinator = new NightSyncCoordinator({ file: path.join(root, 'sync-test.json'), sources: () => [{ id: 'dalat-test', label: 'Đà Lạt Test' }],
      initialized: () => initialized, automaticEligible: () => initialized, busy: () => false, now: () => Date.parse('2026-10-06T16:00:00Z'),
      run: async () => { calls++; initialized = true; return { downloaded: 1, failed: 0, added: 1, changed: 0 }; } });
    await coordinator.tick(); assert.equal(calls, 0);
    await coordinator.manual('dalat-test'); assert.equal(calls, 1);
    assert.equal(restarted.activeDestinationId, 'dalat-test');
    // Adopt an existing custom source without migrating its IDs or saved lists.
    const savedCustom = path.join(data, 'custom-destinations.json');
    fs.writeFileSync(savedCustom, JSON.stringify({ destinations: [{ ...config.getDestinationConfig('dalat-test'), id: 'sheet-existing', label: 'Sheet hôm qua' }] }));
    const preserved = crypto.createHash('sha256').update(oldState).digest('hex');
    restarted.loadCustomDestinations();
    assert.equal(config.getDestinationConfig('sheet-existing').label, 'Đà Lạt Test');
    assert.equal(config.getDestinationConfig('sheet-existing').contentDestinationId, 'dalat');
    assert.equal(config.getDestinationList().filter((entry: any) => config.isDalatTestSource(entry.id)).length, 1);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(data, 'generated-caption-lists.dalat.json'))).digest('hex'), preserved);
    assert.equal(requests.length, 0, 'Local creation/reload must not call external network');
    const output = process.env.DALAT_TEST_REPORT;
    if (output) { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify({ lists, result: 'passed', fixture: 'isolated synthetic source-specific images' }, null, 2)); }
    console.log('PASS: 16 real service batch lists, separate sources/stores/hooks, persistence/presets, interrupted publication, manual-first/night sync, custom source reuse; no external network.');
  } finally {
    global.fetch = originalFetch;
    for (const id of Object.keys(config.DESTINATIONS)) if (!registry[id]) delete config.DESTINATIONS[id];
    Object.assign(config.DESTINATIONS, registry); setActiveDestinationLocalize('dalat');
    if (process.env.DALAT_TEST_KEEP === '1') console.log('TEST_ROOT=' + root);
    else fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
