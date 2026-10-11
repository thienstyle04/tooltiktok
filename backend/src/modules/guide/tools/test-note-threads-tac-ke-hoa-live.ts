// Reuse a verified live-Sheet audit, never generate into main user storage.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

async function main() {
  const sourceRoot = process.env.THREADS_TAC_SOURCE_ROOT;
  assert(sourceRoot, 'Set THREADS_TAC_SOURCE_ROOT to an isolated live-Sheet audit');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'threads-tac-ke-hoa-live-'));
  const data = path.join(root, 'data'), cache = path.join(sourceRoot, 'cache');
  fs.mkdirSync(data);
  Object.assign(process.env, { DALAT_DATA_DIR: data, DALAT_DRIVE_FILE_CACHE_DIR: cache,
    DALAT_AUTO_SYNC_SHEET: 'false', DALAT_AUTO_WARM_DRIVE_CACHE: 'false' });
  const { parseWorkbookBuffer } = require('../sync/workbook-source');
  const { publishSourceSnapshot, publishedSourcePaths } = require('../sync/published-source');
  const { GuideService } = require('../guide.service');
  const { normalizeText } = require('../logic/image-resolver');
  const repo = path.resolve(__dirname, '../../../../..'), original = path.join(repo, 'backend/data');
  const digest = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const paths = publishedSourcePaths(original, 'dalat-threads');
  const tracked = [paths.workbook, paths.manifest, ...fs.readdirSync(original)
    .filter(name => /\.json$/.test(name) && fs.statSync(path.join(original, name)).isFile()).map(name => path.join(original, name))];
  const before = new Map(tracked.map((file: string) => [file, digest(file)]));
  const source = parseWorkbookBuffer(fs.readFileSync(path.join(sourceRoot, 'threads-live.xlsx')), {
    workbookName: 'Đà Lạt Threads.xlsx', destinationId: 'dalat-threads',
    sourceUrl: 'https://docs.google.com/spreadsheets/d/1eTupjLJX-C4V06Erwe8rGzgB9JyzfzjG/export?format=xlsx', sourceType: 'google-sheet' });
  const manifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'manifest.json'), 'utf8'));
  publishSourceSnapshot(data, source, manifest, () => true);
  const service: any = new GuideService();
  await service.setActiveDestination({ id: 'dalat-threads' });
  const dataset = await service.getDataset(), entries: any[] = [], results: any[] = [];
  const key = normalizeText('Tắc Kè Hoa');
  for (const deckId of ['itinerary-note-threads-3n2d', 'itinerary-note-threads-2n1d', 'summary-note']) {
    const batch = await service.generateBatchLists({ deckId, count: 4, photoPreset: null, requestId: 'tac-live-' + deckId });
    results.push({ deckId, ...batch });
    assert.equal(batch.failCount, 0, JSON.stringify(batch));
    for (const generated of batch.lists) {
      const list = service.generatedListsByDeckId.get(deckId).find((list: any) => list.id === generated.listId);
      const partnerNames = service.renderedPartnerNames(list);
      if (deckId === 'itinerary-note-threads-3n2d') {
        const items = list.pages.flatMap((page: any) => page.items || []);
        assert.equal(items.length, 18);
        assert.equal(new Set(items.map((item: any) => normalizeText(item.rawName || item.name))).size, 18);
        const hit = items.filter((item: any) => normalizeText(item.rawName || item.name) === key);
        assert.equal(hit.length, 1); assert(hit[0].isPartner); assert.equal(hit[0].sourceSectionKey, 'quan_an');
        assert(hit[0].label.endsWith('|Tối')); assert.equal(partnerNames.filter((name: string) => normalizeText(name) === key).length, 1);
        console.log('REAL_3N2D=' + JSON.stringify({ id: list.id, row: items.indexOf(hit[0]) + 1, label: hit[0].label, name: hit[0].name, partnerNames }));
      }
      entries.push({ sourceId: 'dalat-threads', deckId, list, expectedPartnerNames: partnerNames });
    }
  }
  const reloaded: any = new GuideService();
  reloaded.activeDestinationId = 'dalat-threads'; reloaded.resetDestinationScopedState(); reloaded.ensureGeneratedListsLoaded();
  for (const entry of entries) assert.deepEqual(reloaded.generatedListsByDeckId.get(entry.deckId).find((list: any) => list.id === entry.list.id), entry.list);
  assert.deepEqual([...before].filter(([file, sha]) => digest(file) !== sha), [], 'Main source/user storage changed');
  // Browser exporter expects cache under fixture.root; use verified audit cache.
  fs.writeFileSync(path.join(root, 'generation.json'), JSON.stringify({ fixture: 'isolated live Threads Sheet audit',
    root: sourceRoot, expectedCount: entries.length, source: { id: 'dalat-threads' }, lists: entries, dataset }));
  fs.writeFileSync(path.join(root, 'results.json'), JSON.stringify({ results, mainDataUnchanged: true, reloadPassed: true }, null, 2));
  console.log('PASS live Tắc Kè Hoa: 4/4 new 3N2Đ lists, 18 unique venues, evening slot and XLSX partner recognition; 2N1Đ/summary smoke; reload; main data unchanged. TEST_ROOT=' + root);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
