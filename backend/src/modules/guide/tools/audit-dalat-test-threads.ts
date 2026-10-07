/** Bounded live Sheet audit. All writes stay in a fresh outputs directory;
 * never copies user lists, overrides, statistics or usage inventory. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as XLSX from 'xlsx';

async function main() {
  const repo = path.resolve(__dirname, '../../../../..');
  const root = path.join(repo, 'outputs', `dalat-test-live-${Date.now()}`), data = path.join(root, 'data'), cache = path.join(root, 'cache');
  fs.mkdirSync(cache, { recursive: true }); fs.mkdirSync(data);
  Object.assign(process.env, { DALAT_DATA_DIR: data, DALAT_DRIVE_FILE_CACHE_DIR: cache, DALAT_AUTO_SYNC_SHEET: 'false', DALAT_AUTO_WARM_DRIVE_CACHE: 'false' });
  const original = path.join(repo, 'backend/data');
  const hash = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const before = new Map(fs.readdirSync(original).filter(name => fs.statSync(path.join(original, name)).isFile()).map(name => [name, hash(path.join(original, name))]));
  const { GuideService } = require('../guide.service');
  const { getDestinationConfig } = require('../sync/destination-config');
  const { fetchWorkbookFromSheet } = require('../sync/workbook-source');
  const { buildSheetDriveManifest, writeSheetDriveManifest } = require('../sync/sheet-drive-manifest');
  const { publishSourceSnapshot } = require('../sync/published-source');
  const { normalizeWorkbookHeaders, normalizeText, firstValue } = require('../logic/image-resolver');
  const { resolveSectionKeyFromSheetName } = require('../sync/sheet-section');
  const { warmDriveFileDiskCache, verifyDriveFileCache } = require('../sync/drive-images');
  const { enableNightSyncPolicy, withSyncPermit } = require('../sync/night-sync-policy');
  enableNightSyncPolicy();
  const service: any = new GuideService(), results: any[] = [], lists: any[] = [];
  console.log('AUDIT_ROOT=' + root);
  const permit = { manual: true, signal: new AbortController().signal, waitForIdle: async () => {} };
  for (const id of ['dalat', 'dalat-test']) {
    const source = await withSyncPermit(permit, () => fetchWorkbookFromSheet(getDestinationConfig(id)));
    const sample = XLSX.read(source.workbookBuffer, { type: 'buffer' });
    const selected: any[] = [];
    for (const name of sample.SheetNames) {
      const sheet = sample.Sheets[name], section = resolveSectionKeyFromSheetName(name);
      const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false, defval: '' });
      const headers: string[] = normalizeWorkbookHeaders(rows[0] || []);
      const linkCols = headers.map((header, index) => /link.*drive|anh_gg_maps/.test(header) ? index : -1).filter(index => index >= 0);
      let partners = 0, locals = 0;
      for (let r = 1; r < rows.length; r++) {
        const row = Object.fromEntries(headers.map((header, index) => [header, String(rows[r][index] || '').trim()]));
        const partner = normalizeText(firstValue(row, 'doi_tac', 'doi_tac_cong_ty')) === 'x';
        const local = !partner && normalizeText(firstValue(row, 'phan_loai')) === 'local';
        const venue = firstValue(row, 'ten_quan', 'ten_dia_diem', 'ten');
        const relevant = section === 'quan_an' || section === 'cafe';
        const keep = normalizeText(name) === 'hinh_nen' || Boolean(relevant && venue && ((partner && partners++ < 5) || (local && locals++ < 6)));
        if (keep && relevant && venue) selected.push({ name: venue, section, partner });
        for (const col of linkCols) if (!keep || headers[col] === 'anh_gg_maps') delete sheet[XLSX.utils.encode_cell({ r, c: col })];
      }
    }
    const manifest = await withSyncPermit(permit, () => buildSheetDriveManifest({ ...source, workbook: sample }, undefined, {
      forceRevalidate: true, onProgress: (done: number, total: number) => { if (done === total || done % 5 === 0) console.log(id + ' RESOLVE ' + done + '/' + total); },
    }));
    for (const entry of Object.values(manifest.items) as any[]) entry.candidateImages = (entry.candidateImages || []).slice(0, 1);
    manifest.coverImages = manifest.coverImages.slice(0, 8);
    for (const group of Object.keys(manifest.coverImageGroups || {})) manifest.coverImageGroups[group] = manifest.coverImageGroups[group].slice(0, 8);
    const ids: string[] = [...new Set<string>([...Object.values(manifest.items).map((entry: any) => entry.fileId), ...Object.values(manifest.coverImageGroups || {}).flat().map((entry: any) => entry.fileId)].filter(Boolean))];
    const warm = await withSyncPermit(permit, () => warmDriveFileDiskCache(ids, { concurrency: 2,
      onProgress: (value: any) => { if ((value.skipped + value.ok + value.fail) % 10 === 0) console.log(id + ' WARM ' + JSON.stringify(value)); } }));
    const verified = await verifyDriveFileCache(ids);
    const bad = verified.filter((entry: any) => entry.status !== 'valid').map((entry: any) => entry.id);
    const unresolved = selected.filter(entry => !(Object.values(manifest.items) as any[]).some(item => item.name === entry.name && item.sectionKey === entry.section));
    if (id === 'dalat-test') publishSourceSnapshot(data, source, manifest, () => true);
    else { fs.writeFileSync(path.join(data, 'workbook-cache.dalat.xlsx'), source.workbookBuffer); writeSheetDriveManifest(data, manifest, id); }
    service.workbookSourceByDestination.set(id, source);
    if (id === service.activeDestinationId) { service.workbookSource = source; service.workbookDerivedCache = null; service.workbookDerivedCacheByDestination.delete(id); }
    await service.setActiveDestination({ id });
    for (const deckId of ['threads-food-local', 'threads-cafe-local']) {
      const batch = await service.generateBatchLists({ deckId, count: 4, photoPreset: deckId.includes('cafe') ? 'iphone-color-edit-v1' : null });
      results.push({ sourceId: id, deckId, ...batch, imageFailures: bad, unresolved, warm });
      if (batch.failCount) continue;
      const dataset = await service.getDataset();
      for (const generated of batch.lists) {
        const list = dataset.decks.find((deck: any) => deck.id === deckId).lists.find((entry: any) => entry.id === generated.listId);
        const items = list.pages[0].items, partners = items.filter((item: any) => item.isPartner);
        assert.equal(items.length, 10); assert.ok(partners.length >= 1 && partners.length <= 5);
        assert.ok(items.slice(0, partners.length).every((item: any) => item.isPartner));
        assert.equal(items.filter((item: any) => item.imageUrl).length, 6);
        lists.push({ sourceId: id, deckId, list });
      }
    }
    fs.writeFileSync(path.join(root, 'generation.json'), JSON.stringify({ lists, results, boundedPhotoAudit: true }, null, 2));
  }
  for (const [name, digest] of before) assert.equal(hash(path.join(original, name)), digest, 'User file changed: ' + name);
  assert.equal(lists.length, 16, JSON.stringify(results.filter(entry => entry.failCount)));
  console.log('PASS live Sheets: 4 food + 4 cafe lists per source; 16 lists; source links/photos separate; user data hashes unchanged. REPORT=' + path.join(root, 'generation.json'));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
