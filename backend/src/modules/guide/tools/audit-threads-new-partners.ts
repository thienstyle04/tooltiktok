// Live Threads Sheet audit. User data is read-only; all sync/list/export state
// belongs to a new temporary directory. No Google Sheet edits or main-app sync.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

async function main() {
  const repo = path.resolve(__dirname, '../../../../..');
  const original = path.join(repo, 'backend/data');
  const root = process.env.THREADS_AUDIT_ROOT || fs.mkdtempSync(path.join(os.tmpdir(), 'threads-new-partners-'));
  const data = path.join(root, 'data'), cache = path.join(root, 'cache');
  fs.mkdirSync(data, { recursive: true }); fs.mkdirSync(cache, { recursive: true });
  Object.assign(process.env, { DALAT_DATA_DIR: data, DALAT_DRIVE_FILE_CACHE_DIR: cache,
    DALAT_AUTO_SYNC_SHEET: 'false', DALAT_AUTO_WARM_DRIVE_CACHE: 'false' });
  const { publishedSourcePaths, publishSourceSnapshot } = require('../sync/published-source');
  const { getDestinationConfig, THREADS_NOTE_DECK_IDS } = require('../sync/destination-config');
  const { fetchWorkbookFromSheet, parseWorkbookBuffer } = require('../sync/workbook-source');
  const { normalizeWorkbookHeaders, normalizeText, firstValue, composeAddress, itemMappingKey } = require('../logic/image-resolver');
  const { resolveSectionKeyFromSheetName } = require('../sync/sheet-section');
  const { enableNightSyncPolicy, withSyncPermit } = require('../sync/night-sync-policy');
  const { buildSheetDriveManifest } = require('../sync/sheet-drive-manifest');
  const { warmDriveFileDiskCache, verifyDriveFileCache, configureDriveFileDiskCache } = require('../sync/drive-images');
  configureDriveFileDiskCache(cache);
  const config = getDestinationConfig('dalat-threads');
  const installed = publishedSourcePaths(original, 'dalat-threads');
  assert(installed, 'Installed Threads snapshot is required for comparison');
  const hash = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const originalFiles = [installed.workbook, installed.manifest,
    ...fs.readdirSync(original).filter(name => /\.(json|xlsx)$/.test(name) && fs.statSync(path.join(original, name)).isFile()).map(name => path.join(original, name))];
  const before = new Map(originalFiles.map((file: string) => [file, hash(file)]));
  enableNightSyncPolicy();
  const permit = { manual: true, signal: new AbortController().signal, waitForIdle: async () => {} };
  console.log('AUDIT_ROOT=' + root);
  const workbookPath = path.join(root, 'threads-live.xlsx');
  const source = fs.existsSync(workbookPath)
    ? parseWorkbookBuffer(fs.readFileSync(workbookPath), { workbookName: config.workbookName, destinationId: config.id, sourceUrl: config.exportUrl, sourceType: 'google-sheet' })
    : await withSyncPermit(permit, () => fetchWorkbookFromSheet(config));
  if (!fs.existsSync(workbookPath)) fs.writeFileSync(workbookPath, source.workbookBuffer);
  function inventory(workbook: any) {
    const entries: any[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sectionKey = resolveSectionKeyFromSheetName(sheetName); if (!sectionKey) continue;
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false, defval: '' });
      const headers = normalizeWorkbookHeaders(rows[0] || []);
      for (let r = 1; r < rows.length; r++) {
        const row: any = Object.fromEntries(headers.map((header: string, c: number) => [header, String(rows[r][c] || '').trim()]));
        for (let c = 0; c < headers.length; c++) {
          const target = sheet[XLSX.utils.encode_cell({ r, c })]?.l?.Target;
          if (target) row[headers[c] + '__hyperlink'] = target;
        }
        const name = firstValue(row, 'ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten'); if (!name) continue;
        entries.push({ sheet: sheetName, row: r + 1, sectionKey, name,
          key: sectionKey + '|' + normalizeText(name), venueKey: normalizeText(name),
          isPartner: normalizeText(firstValue(row, 'doi_tac', 'doi_tac_cong_ty')) === 'x',
          classification: firstValue(row, 'phan_loai'),
          address: composeAddress(firstValue(row, 'dia_chi'), firstValue(row, 'ten_phuong')),
          link: firstValue(row, 'link_drive__hyperlink', 'link_drive', 'link_anh__hyperlink', 'link_anh'),
        });
      }
    }
    return entries;
  }
  const baselineWorkbook = process.env.THREADS_AUDIT_BASELINE || installed.workbook;
  const previous = inventory(XLSX.readFile(baselineWorkbook)), current = inventory(source.workbook);
  const oldPartners = new Set(previous.filter(row => row.isPartner).map(row => row.key));
  const newPartners = current.filter(row => row.isPartner && !oldPartners.has(row.key));
  const report: any = { root, fetchedAt: new Date().toISOString(), sheet: config.sheetUrl,
    installedWorkbook: installed.workbook, baselineWorkbook, installedHash: hash(installed.workbook), liveHash: hash(workbookPath),
    oldPartners: previous.filter(row => row.isPartner), currentPartners: current.filter(row => row.isPartner), newPartners,
    newlyFlagged: newPartners.filter(row => previous.some(old => old.key === row.key)),
    addedRows: newPartners.filter(row => !previous.some(old => old.key === row.key)), results: [] };
  fs.writeFileSync(path.join(root, 'audit.json'), JSON.stringify(report, null, 2));
  console.log('PARTNER_DIFF=' + JSON.stringify({ before: report.oldPartners.length, now: report.currentPartners.length,
    added: newPartners.map(row => ({ section: row.sectionKey, name: row.name, row: row.row, address: row.address, hasLink: Boolean(row.link) })) }));
  if (process.env.THREADS_AUDIT_STAGE === 'inventory') return;

  // Reuse only own-source manifest records whose links still match this Sheet.
  // Cache bytes are copied, never linked/written into the installed cache.
  const oldManifest = JSON.parse(fs.readFileSync(installed.manifest, 'utf8').replace(/^\uFEFF/, ''));
  const oldIds = new Set<string>([...Object.values(oldManifest.items).flatMap((entry: any) =>
    [entry.fileId, ...(entry.candidateImages || []).map((image: any) => image.fileId)]),
    ...(oldManifest.coverImages || []).map((image: any) => image.fileId),
    ...Object.values(oldManifest.coverImageGroups || {}).flatMap((images: any) => images.map((image: any) => image.fileId))].filter(Boolean));
  for (const id of oldIds) for (const suffix of ['.bin', '.json']) {
    const file = path.join(original, 'drive-file-cache', id + suffix);
    if (fs.existsSync(file) && !fs.existsSync(path.join(cache, id + suffix))) fs.copyFileSync(file, path.join(cache, id + suffix));
  }
  const manifestPath = path.join(root, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : await withSyncPermit(permit, () => buildSheetDriveManifest(source, oldManifest, { onProgress: (done: number, total: number) => {
      if (done === total || done % 10 === 0) console.log('MANIFEST ' + done + '/' + total);
    } }));
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const ids: string[] = [...new Set<string>([...Object.values(manifest.items).flatMap((entry: any) =>
    (entry.candidateImages?.length ? entry.candidateImages : [{ fileId: entry.fileId }]).map((image: any) => image.fileId)),
    ...(manifest.coverImages || []).map((image: any) => image.fileId)].filter(Boolean))];
  console.log('CACHE_FILES=' + ids.length);
  const warm = await withSyncPermit(permit, () => warmDriveFileDiskCache(ids, { concurrency: 3, onProgress: (value: any) => {
    const done = value.skipped + value.ok + value.fail; if (done % 20 === 0 || done === ids.length) console.log('WARM ' + JSON.stringify(value));
  } }));
  const verified = await verifyDriveFileCache(ids);
  const invalid = new Set(verified.filter((row: any) => row.status !== 'valid').map((row: any) => row.id));
  report.warm = warm; report.invalidPhotos = [...invalid];
  report.newPartners = newPartners.map(row => {
    const entry: any = manifest.items[itemMappingKey(row.sectionKey, row.name, row.address)]
      || Object.values(manifest.items).find((entry: any) => entry.sectionKey === row.sectionKey && normalizeText(entry.name) === normalizeText(row.name));
    const ownIds = (entry?.candidateImages?.length ? entry.candidateImages : [{ fileId: entry?.fileId }]).map((image: any) => image.fileId).filter(Boolean);
    return { ...row, manifestPhotos: ownIds.length, validPhotos: ownIds.filter((id: string) => !invalid.has(id)).length };
  });
  publishSourceSnapshot(data, source, manifest, () => true);
  const { GuideService } = require('../guide.service');
  const service: any = new GuideService();
  await service.setActiveDestination({ id: 'dalat-threads' });
  const dataset = await service.getDataset();
  const context = service.ensureWorkbookDerivedContext();
  report.parsedNewPartners = report.newPartners.map((row: any) => ({ ...row,
    parsed: (context.itemsBySection[row.sectionKey] || []).filter((item: any) => normalizeText(item.name) === normalizeText(row.name))
      .map((item: any) => ({ name: item.name, isPartner: item.isPartner, imageSource: item.imageSource, imageMapped: item.imageMapped, address: item.address, candidatePhotos: item.candidateImageUrls?.length || 0 })) }));
  fs.writeFileSync(path.join(root, 'audit.json'), JSON.stringify(report, null, 2));
  const entries: any[] = [];
  for (const deckId of THREADS_NOTE_DECK_IDS) {
    const batch = await service.generateBatchLists({ deckId, count: 4, photoPreset: null, requestId: 'new-partners-' + deckId });
    const result: any = { deckId, ...batch, appearances: {} };
    for (const generated of batch.lists) {
      const list = service.generatedListsByDeckId.get(deckId).find((list: any) => list.id === generated.listId);
      const partnerNames = service.renderedPartnerNames(list);
      const hits = [...new Set(newPartners.filter(row => partnerNames.some((name: string) => normalizeText(name) === row.venueKey)).map(row => row.name))];
      result.appearances[list.id] = { partnerNames, newPartners: hits };
      entries.push({ sourceId: 'dalat-threads', deckId, list, expectedPartnerNames: partnerNames });
    }
    report.results.push(result);
    console.log('GENERATE ' + deckId + ' ' + batch.successCount + '/4; NEW=' + JSON.stringify(Object.values(result.appearances).map((value: any) => value.newPartners)));
    fs.writeFileSync(path.join(root, 'audit.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(root, 'generation.json'), JSON.stringify({ fixture: 'isolated live Threads Sheet audit', root,
      expectedCount: entries.length, source: { id: 'dalat-threads' }, lists: entries, dataset }));
  }
  report.newPartnerCoverage = [...new Set(newPartners.map(row => row.name))].map(name => ({ name,
    lists: entries.filter(entry => entry.expectedPartnerNames.some((partner: string) => normalizeText(partner) === normalizeText(name))).map(entry => ({ deckId: entry.deckId, listId: entry.list.id })) }));
  report.userFilesChanged = [...before].filter(([file, digest]) => hash(file) !== digest).map(([file]) => file);
  fs.writeFileSync(path.join(root, 'audit.json'), JSON.stringify(report, null, 2));
  assert.equal(report.userFilesChanged.length, 0, 'Main-app source/list/history data changed during audit');
  console.log('AUDIT_DONE=' + JSON.stringify({ lists: entries.length, newPartners: report.newPartnerCoverage.map((row: any) => ({ name: row.name, lists: row.lists.length })), failures: report.results.filter((result: any) => result.failCount).map((result: any) => ({ deckId: result.deckId, errors: result.errors })) }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
