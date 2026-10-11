import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import * as XLSX from 'xlsx';
import sharp from 'sharp';

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'threads-source-test-'));
  const data = path.join(root, 'data'), cache = path.join(root, 'cache');
  fs.mkdirSync(data); fs.mkdirSync(cache);
  Object.assign(process.env, { DALAT_DATA_DIR: data, DALAT_DRIVE_FILE_CACHE_DIR: cache, DALAT_AUTO_SYNC_SHEET: 'false', DALAT_AUTO_WARM_DRIVE_CACHE: 'false' });
  const { GuideService } = require('../guide.service');
  const { AutomationSchedulerService } = require('../automation-scheduler.service');
  const config = require('../sync/destination-config');
  const { parseWorkbookBuffer } = require('../sync/workbook-source');
  const { publishSourceSnapshot, publishedSourcePaths } = require('../sync/published-source');
  const { writeSheetDriveManifest } = require('../sync/sheet-drive-manifest');
  const { itemMappingKey, composeAddress } = require('../logic/image-resolver');
  const { setActiveDestinationLocalize, getMarketingCopy, buildCaptionHashtags } = require('../sync/destination-localize');
  const { NightSyncCoordinator } = require('../sync/night-sync-coordinator');
  require('../sync/night-sync-policy').enableNightSyncPolicy();
  const requests: string[] = [], originalFetch = global.fetch;
  global.fetch = (async (url: any) => { requests.push(String(url)); throw Error('Test forbids external network'); }) as typeof fetch;
  const registry = { ...config.DESTINATIONS };
  const fixtures: any[] = [], entries: any[] = [];
  try {
    config.registerDestination({ ...config.getDestinationConfig('dalat'), id: 'sheet-other', label: 'Nguồn tùy chỉnh' });
    const service: any = new GuideService();
    assert.equal(service.activeDestinationId, 'dalat');
    assert.equal(config.getDestinationConfig('dalat-threads').label, 'Đà Lạt Threads');
    assert.match(config.getDestinationConfig('dalat-threads').exportUrl, /1eTupjLJX-C4V06Erwe8rGzgB9JyzfzjG/);
    assert.equal(getMarketingCopy('dalat-threads').label, 'Đà Lạt');
    assert.deepEqual(buildCaptionHashtags([], 'gen_z', 'dalat-threads', 'threads-food-local'), buildCaptionHashtags([], 'gen_z', 'dalat', 'threads-food-local'));
    await assert.rejects(service.setActiveDestination({ id: 'dalat-threads' }), /Tải dữ liệu/);
    assert.equal(service.activeDestinationId, 'dalat');
    for (const id of ['dalat', 'dalat-test', 'greenland', 'sheet-other', 'dalat-threads']) {
      const workbook = XLSX.utils.book_new();
      const manifest: any = { version: 5, generatedAt: new Date().toISOString(), workbookName: id, workbookMtimeMs: Date.now(), items: {}, coverImages: [], coverImageGroups: { default: [], green: [], dark: [], random: [], persimmon: [] } };
      for (const [sheet, section] of [['Quan_an', 'quan_an'], ['Cafe', 'cafe'], ['Check_in', 'check_in'], ['Choi_dem', 'choi_dem'], ['Homestay', 'homestay'], ['Hoat_dong', 'hoat_dong'], ['Khu_du_lich', 'khu_du_lich'], ['Dich_vu', 'dich_vu']]) {
        const rows: any[][] = [['ten_quan', 'dia_chi', 'ten_phuong', 'doi_tac', 'phan_loai', 'gia_dau_nguoi', 'mo_hinh', 'gio_mo_cua', 'chu_de']];
        const count = section === 'quan_an' ? 4 : section === 'cafe' ? 5 : section === 'homestay' ? 5 : section === 'choi_dem' ? 1 : 0;
        for (let i = 0; i < 18; i++) {
          const name = `${id} ${section === 'dich_vu' ? 'Xe' : section} ${i}`, address = composeAddress('12 Đường thử', 'Xuân Hương - Đà Lạt');
          rows.push([name, '12 Đường thử', 'Xuân Hương - Đà Lạt', i < count ? 'x' : '', 'Local', 100000, section === 'homestay' ? 'Homestay' : section, '06:00 - 23:00', 'Mảng xanh']);
          const key = itemMappingKey(section, name, address), fileId = `${id}-${section}-${i}`;
          manifest.items[key] = { key, sectionKey: section, name, address, fileId, fileName: fileId + '.png', sourceLink: 'https://drive.google.com/file/d/' + fileId, candidateImages: [{ fileId, fileName: fileId + '.png', viewUrl: '' }] };
        }
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheet);
      }
      for (const group of Object.keys(manifest.coverImageGroups)) manifest.coverImageGroups[group] = Array.from({ length: 12 }, (_, i) => ({ fileId: `${id}-${group}-${i}`, fileName: `${group}-${i}.png`, viewUrl: '' }));
      manifest.coverImages = manifest.coverImageGroups.default;
      const source = parseWorkbookBuffer(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { destinationId: id, workbookName: id + '.xlsx', sourceUrl: config.getDestinationConfig(id).sheetUrl, sourceType: 'google-sheet' });
      service.validateWorkbookData(source);
      if (config.isIsolatedSheetSource(id)) publishSourceSnapshot(data, source, manifest, () => true);
      else { fs.writeFileSync(path.join(data, `workbook-cache.${id}.xlsx`), source.workbookBuffer); writeSheetDriveManifest(data, manifest, id); }
      service.workbookSourceByDestination.set(id, source);
      if (id === service.activeDestinationId) service.workbookSource = source;
      fixtures.push({ id, source, manifest });
      for (const fileId of [...Object.values(manifest.items).map((item: any) => item.fileId), ...Object.values(manifest.coverImageGroups).flat().map((item: any) => item.fileId)]) {
        const hash = crypto.createHash('sha256').update(fileId).digest();
        const pixels = Buffer.from(Array.from({ length: 80 * 60 * 3 }, (_, i) => hash[(i + Math.floor(i / 240)) % hash.length]));
        const image = await sharp(pixels, { raw: { width: 80, height: 60, channels: 3 } }).png().toBuffer();
        fs.writeFileSync(path.join(cache, fileId + '.bin'), image); fs.writeFileSync(path.join(cache, fileId + '.json'), JSON.stringify({ contentType: 'image/png', contentLength: image.length }));
      }
    }
    service.workbookDerivedCache = null; service.workbookDerivedCacheByDestination.clear();
    for (const id of ['dalat', 'dalat-test', 'greenland', 'sheet-other']) {
      await service.setActiveDestination({ id });
      const dataset = await service.getDataset();
      assert.ok(dataset.decks.every((deck: any) => !config.THREADS_NOTE_DECK_IDS.includes(deck.id)), id);
      assert.ok(dataset.decks.some((deck: any) => deck.id === (id === 'sheet-other' ? 'grid-4' : 'spotlight-v4')));
      const before = fs.existsSync(path.join(data, `used-inventory.${id}.json`)) ? fs.readFileSync(path.join(data, `used-inventory.${id}.json`)) : null;
      for (const deckId of config.THREADS_NOTE_DECK_IDS) {
        await assert.rejects(service.generateDeckFromCaption({ deckId, caption: {} }), /Đà Lạt Threads/);
        await assert.rejects(service.generateBatchLists({ deckId, count: 4 }), /Đà Lạt Threads/);
        await assert.rejects(service.generateDeepSeekCaption({ deckId }), /Đà Lạt Threads/);
      }
      if (before) assert.ok(before.equals(fs.readFileSync(path.join(data, `used-inventory.${id}.json`))));
    }
    await service.setActiveDestination({ id: 'dalat-threads' });
    const initial = await service.getDataset();
    assert.deepEqual(initial.decks.map((deck: any) => deck.id).sort(), [...config.THREADS_NOTE_DECK_IDS].sort());
    assert.deepEqual(initial.source.allowedDeckIds.sort(), [...config.THREADS_NOTE_DECK_IDS].sort());
    for (const deckId of ['spotlight-v4', 'spotlight-v6', 'grid-4']) {
      await assert.rejects(service.generateDeckFromCaption({ deckId, caption: {} }), /chỉ dành cho Threads và Note/);
      await assert.rejects(service.generateBatchLists({ deckId, count: 4 }), /chỉ dành cho Threads và Note/);
    }
    await assert.rejects(service.generatePartnerSpotlight({}), /đã ngừng sử dụng/);
    const scheduler: any = new AutomationSchedulerService(service);
    scheduler.findBrowser = () => ({ name: 'Test browser', path: 'test' });
    const scheduleInput = { name: 'Thử lịch riêng', destinationId: 'dalat-threads', frequency: 'daily', dailyTime: '23:15', outputDir: root, templates: [{ deckId: 'threads-food-local', count: 4 }], hook: { mode: 'normal' } };
    assert.equal(scheduler.create(scheduleInput).schedules[0].destinationId, 'dalat-threads');
    assert.throws(() => scheduler.create({ ...scheduleInput, destinationId: 'dalat' }), /Đà Lạt Threads/);
    assert.throws(() => scheduler.submitManualGeneration({ kind: 'batch', destinationId: 'dalat', requestId: 'forbidden', request: { deckId: 'threads-food-local', hookSelection: { mode: 'normal' } } }), /Đà Lạt Threads/);
    const oldSchedule: any = { ...scheduleInput, id: 'forbidden-schedule', destinationId: 'dalat', enabled: false };
    scheduler.state.schedules.push(oldSchedule);
    assert.throws(() => scheduler.setEnabled(oldSchedule.id, true), /Đà Lạt Threads/);
    assert.throws(() => scheduler.runNow(oldSchedule.id), /Đà Lạt Threads/);
    oldSchedule.disabledReason = 'Old source paused';
    scheduler.update(oldSchedule.id, scheduleInput);
    assert.equal(oldSchedule.disabledReason, undefined);
    oldSchedule.destinationId = 'dalat';
    scheduler.state.runs.push({ id: 'old-run', destinationId: 'dalat', templates: oldSchedule.templates, status: 'failed' });
    assert.throws(() => scheduler.retry('old-run'), /Đà Lạt Threads/);
    const failedRun = { id: 'queued-old', destinationId: 'dalat', templates: oldSchedule.templates, errors: [], status: 'queued' };
    await scheduler.execute(failedRun); assert.equal(failedRun.status, 'failed'); assert.match((failedRun as any).phase, /Đà Lạt Threads/);
    const sourceBefore = fs.readFileSync(path.join(data, 'source-snapshots/dalat-threads/current.json'));
    const fixture = fixtures.find(entry => entry.id === 'dalat-threads');
    assert.throws(() => publishSourceSnapshot(data, fixture.source, fixture.manifest, () => false), /Đã dừng đồng bộ/);
    assert.ok(sourceBefore.equals(fs.readFileSync(path.join(data, 'source-snapshots/dalat-threads/current.json'))));
    assert.ok(publishedSourcePaths(data, 'dalat-threads'));
    // All real creation entrypoints funnel through the same strict builder.
    for (const deckId of config.THREADS_NOTE_DECK_IDS) {
      const photoPreset = deckId === 'threads-cafe-local' ? 'iphone-color-edit-v1' : null;
      const batch = await service.generateBatchLists({ deckId, count: 4, photoPreset, hookSelection: { mode: 'normal' } });
      assert.equal(batch.successCount, 4, deckId + ': ' + JSON.stringify(batch.errors));
      assert.equal(batch.failCount, 0);
      const dataset = await service.getDataset();
      for (const created of batch.lists) {
        const list = dataset.decks.find((deck: any) => deck.id === deckId).lists.find((entry: any) => entry.id === created.listId);
        const places = list.pages.flatMap((page: any) => page.items || []);
        assert.ok(places.length && places.some((item: any) => item.isPartner), deckId);
        assert.ok(places.filter((item: any) => item.sourceSectionKey).every((item: any) => (item.rawName || item.name).startsWith('dalat-threads ')), deckId + ' source mixing');
        assert.equal(new Set(places.filter((item: any) => item.sourceSectionKey).map((item: any) => item.rawName || item.name)).size, places.filter((item: any) => item.sourceSectionKey).length, deckId + ' duplicate place');
        if (['threads-food-local', 'threads-cafe-local'].includes(deckId)) {
          const partnerCount = deckId.includes('food') ? 4 : 5;
          assert.equal(places.length, 10); assert.equal(places.filter((item: any) => item.isPartner).length, partnerCount);
          assert.ok(places.slice(0, partnerCount).every((item: any) => item.isPartner));
          assert.equal(places.filter((item: any) => item.imageUrl).length, 6);
        }
        entries.push({ sourceId: 'dalat-threads', deckId, list });
      }
    }
    assert.equal(entries.length, 48);
    const restarted: any = new GuideService();
    assert.equal(restarted.activeDestinationId, 'dalat-threads');
    const reload = await restarted.getDataset();
    for (const { deckId, list } of entries) {
      const actual = reload.decks.find((deck: any) => deck.id === deckId).lists.find((entry: any) => entry.id === list.id);
      assert.deepEqual(actual.pages, list.pages, deckId + ' reload'); assert.equal(actual.photoPreset, list.photoPreset);
    }
    assert.notEqual(restarted.hooksForSource('dalat').festival, restarted.hooksForSource('dalat-threads').festival);
    assert.notEqual(restarted.hooksForSource('dalat-test').green, restarted.hooksForSource('dalat-threads').green);
    let initialized = false, calls = 0;
    const coordinator = new NightSyncCoordinator({ file: path.join(root, 'night-sync-test.json'), sources: () => [{ id: 'dalat-threads', label: 'Đà Lạt Threads' }], initialized: () => initialized, automaticEligible: () => initialized, busy: () => false, now: () => Date.parse('2026-10-07T16:00:00Z'), run: async () => { calls++; initialized = true; return { downloaded: 1, failed: 0, added: 1, changed: 0 }; } });
    await coordinator.tick(); assert.equal(calls, 0);
    await coordinator.manual('dalat-threads'); assert.equal(calls, 1); assert.equal(restarted.activeDestinationId, 'dalat-threads');
    fs.writeFileSync(path.join(data, 'custom-destinations.json'), JSON.stringify({ destinations: [{ ...config.getDestinationConfig('dalat-threads'), id: 'sheet-reused', label: 'Old custom name' }] }));
    restarted.loadCustomDestinations();
    assert.equal(config.getDestinationConfig('sheet-reused').label, 'Đà Lạt Threads');
    assert.equal(config.getDestinationList().filter((source: any) => config.isDalatThreadsSource(source.id)).length, 1);
    assert.deepEqual(config.getAllowedDeckIds('sheet-reused'), config.THREADS_NOTE_DECK_IDS);
    assert.equal(requests.length, 0, 'Creation/reload must remain local');
    fs.writeFileSync(path.join(root, 'generation.json'), JSON.stringify({ lists: entries, dataset: reload, root, fixture: 'isolated source-specific synthetic data/images' }, null, 2));
    console.log('PASS: 48 real service lists / 12 templates, source catalogs and API guards, scheduled/manual preflight, reload, presets, source isolation, manual-first/night sync, custom Sheet reuse. REPORT=' + path.join(root, 'generation.json'));
  } finally {
    global.fetch = originalFetch;
    for (const id of Object.keys(config.DESTINATIONS)) if (!registry[id]) delete config.DESTINATIONS[id];
    Object.assign(config.DESTINATIONS, registry); setActiveDestinationLocalize('dalat');
    // Keep this isolated fixture for the browser export verification.
    console.log('TEST_ROOT=' + root);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
