import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { getDestinationConfig } from '../sync/destination-config';
import { parseWorkbookBuffer } from '../sync/workbook-source';
import { publishSourceSnapshot, publishedSourcePaths } from '../sync/published-source';
import { enableNightSyncPolicy, withSyncPermit } from '../sync/night-sync-policy';

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-test-sync-'));
  const workbookModule = require('../sync/workbook-source'), manifestModule = require('../sync/sheet-drive-manifest'), drive = require('../sync/drive-images');
  const { syncNightSource } = require('../sync/night-sync-source');
  const original = { fetch: workbookModule.fetchWorkbookFromSheet, build: manifestModule.buildSheetDriveManifest, warm: drive.warmDriveFileDiskCache, resolve: drive.resolveDriveLinkToEntries, accessible: drive.filterAccessibleDriveEntries };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['ten_quan', 'dia_chi', 'link_drive'], ['Quán mới', 'Xuân Hương - Đà Lạt', 'https://drive.google.com/drive/folders/new-folder'],
  ]), 'Quan_an');
  const config = getDestinationConfig('dalat-test');
  const source = parseWorkbookBuffer(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), {
    destinationId: config.id, workbookName: config.workbookName, sourceUrl: config.sheetUrl, sourceType: 'google-sheet',
  });
  const key = require('../logic/image-resolver').itemMappingKey('quan_an', 'Quán mới', 'Xuân Hương - Đà Lạt');
  const manifest: any = { version: 5, generatedAt: new Date().toISOString(), workbookName: source.workbookName, workbookMtimeMs: source.fetchedAt,
    items: { [key]: { key, sectionKey: 'quan_an', name: 'Quán mới', address: 'Xuân Hương - Đà Lạt', sourceLink: 'https://drive.google.com/drive/folders/old-folder', fileId: 'old-photo', fileName: 'old.png', candidateImages: [{ fileId: 'old-photo', fileName: 'old.png' }] } }, coverImages: [] };
  enableNightSyncPolicy();
  try {
    publishSourceSnapshot(root, source, manifest, () => true);
    const pointer = fs.readFileSync(path.join(root, 'source-snapshots/dalat-test/current.json'), 'utf8');
    drive.resolveDriveLinkToEntries = async () => { throw new Error('Unavailable folder'); };
    drive.filterAccessibleDriveEntries = async (entries: any) => entries;
    const changed = await original.build(source, manifest, { forceRevalidate: true });
    assert.equal(Object.keys(changed.items).length, 0, 'A changed Sheet link must not borrow the previous folder images');
    let stage = '', marked = 0, saved = 0, fetched = 0;
    const controller = new AbortController();
    workbookModule.fetchWorkbookFromSheet = async () => { fetched++; if (stage === 'fetch') throw new Error('HTTP 503'); return source; };
    manifestModule.buildSheetDriveManifest = async () => { if (stage === 'resolve') throw new Error('Drive folder unavailable'); return stage === 'empty' ? { ...manifest, items: {} } : manifest; };
    drive.warmDriveFileDiskCache = async () => {
      if (stage === 'warm') return { ok: 0, skipped: 0, fail: 1 };
      if (stage === 'abort') controller.abort();
      return { ok: 1, skipped: 0, fail: 0 };
    };
    const hooks = { dataRoot: root, load: () => { throw new Error('Never use a stale Sheet for Test sync'); },
      validate: () => { if (stage === 'validate') throw new Error('Invalid workbook'); }, save: () => { saved++; },
      publish: async (next: any, images: any) => publishSourceSnapshot(root, next, images, () => true) };
    for (stage of ['fetch', 'validate', 'resolve', 'empty', 'warm', 'abort']) {
      const permit = stage === 'abort' ? controller : new AbortController();
      await assert.rejects(withSyncPermit({ manual: true, signal: permit.signal, waitForIdle: async () => {} },
        () => syncNightSource(config, true, () => { marked++; }, hooks)));
      assert.equal(fs.readFileSync(path.join(root, 'source-snapshots/dalat-test/current.json'), 'utf8'), pointer);
      assert.equal(marked, 0); assert.equal(saved, 0);
    }
    stage = '';
    await withSyncPermit({ manual: true, signal: new AbortController().signal, waitForIdle: async () => {} },
      () => syncNightSource(config, true, () => { marked++; }, hooks));
    assert.equal(marked, 1); assert.equal(saved, 0); assert.equal(fetched, 7);
    assert.notEqual(fs.readFileSync(path.join(root, 'source-snapshots/dalat-test/current.json'), 'utf8'), pointer);
    assert.ok(publishedSourcePaths(root, config.id));
    console.log('PASS: changed-link isolation; download/validation/folder/no-photo/warm/cancellation failures keep old atomic snapshot; retry publishes fresh Sheet and manifest together.');
  } finally {
    workbookModule.fetchWorkbookFromSheet = original.fetch; manifestModule.buildSheetDriveManifest = original.build;
    drive.warmDriveFileDiskCache = original.warm; drive.resolveDriveLinkToEntries = original.resolve; drive.filterAccessibleDriveEntries = original.accessible;
    fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
