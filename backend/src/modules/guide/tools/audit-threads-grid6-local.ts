// Read-only inspection of the current published Threads snapshot. All decoding,
// fingerprint caches and generated examples go into an OS-temp audit directory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx';
import sharp from 'sharp';

async function main() {
  const backend = path.resolve(__dirname, '../../../../'), userData = path.join(backend, 'data');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'threads-grid6-local-')), cache = path.join(root, 'drive-file-cache'); fs.mkdirSync(cache);
  process.env.DALAT_DATA_DIR = root;
  require('../../../../../scripts/test-support/source-links-fixture.cjs').seedSourceLinks(root);
  const { publishedSourcePaths } = require('../sync/published-source');
  const { loadWorkbookItems, loadHinhNenImagePools } = require('../workbook-items');
  const { configureDriveFileDiskCache, extractDriveFileIdFromProxyUrl } = require('../sync/drive-images');
  const { setActiveDestinationLocalize } = require('../sync/destination-localize');
  const { buildThreadsGrid6Pages, grid6OwnPhotos, assertThreadsGrid6Pages, restrictGrid6PhotoCycles, threadsGrid6Hooks, GRID6_PLAY_SECTIONS } = require('../logic/threads-grid6-collage');
  const { rotatePartnerList, restrictRotationPhotos } = require('../logic/partner-rotation');
  configureDriveFileDiskCache(cache); setActiveDestinationLocalize('dalat-threads');
  const published = publishedSourcePaths(userData, 'dalat-threads'); if (!published) throw Error('Chưa có snapshot Threads trên máy.');
  const manifest = JSON.parse(fs.readFileSync(published.manifest, 'utf8'));
  const items = loadWorkbookItems('dalat-threads', backend, XLSX.readFile(published.workbook), [], { version: 1, instructions: [], mappings: [] }, [], manifest);
  const available = new Map<string, boolean>();
  const validate = async (url: string) => {
    const id = extractDriveFileIdFromProxyUrl(url); if (!id) return false;
    if (available.has(id)) return available.get(id);
    try {
      const bytes = fs.readFileSync(path.join(userData, 'drive-file-cache', id + '.bin'));
      const meta = await sharp(bytes).metadata(); if (!meta.width || !meta.height || meta.format === 'svg') throw Error('invalid image');
      fs.writeFileSync(path.join(cache, id + '.bin'), bytes); fs.writeFileSync(path.join(cache, id + '.json'), JSON.stringify({ contentType: `image/${meta.format}`, contentLength: bytes.length })); available.set(id, true); return true;
    } catch { available.set(id, false); return false; }
  };
  const rows: any[] = [];
  for (const [section, pool] of Object.entries(items) as any) {
    for (const item of pool) { const urls = grid6OwnPhotos(item), good = []; for (const url of urls) if (await validate(url)) good.push(url); item.diaryImageUrls = good; item.imageUrl = good[0] || ''; item.candidateImageUrls = good; }
    rows.push({ section, total: pool.length, withCachedOwnPhotos: pool.filter((item: any) => item.diaryImageUrls.length).length, partnersWithPhotos: pool.filter((item: any) => item.isPartner && item.diaryImageUrls.length).length });
  }
  const covers = []; for (const url of loadHinhNenImagePools(manifest).default) if (await validate(url)) covers.push(url);
  const hooks = threadsGrid6Hooks();
  let error = '', pages: any[] = [];
  try { pages = buildThreadsGrid6Pages({ itemsBySection: items, coverImageUrls: covers, seed: 'local-audit', hook: hooks[0] || '' }); } catch (failure) { error = failure instanceof Error ? failure.message : String(failure); }
  const report = { snapshot: path.basename(path.dirname(published.manifest)), sections: rows, coverPhotos: covers.length, normalHooks: hooks.length, playSections: GRID6_PLAY_SECTIONS, error, pages: pages.length };
  fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify(report, null, 2));
  if (pages.length) {
    const lists: any[] = [], usedImages = new Set<string>(), usedItems = new Set<string>(); let history = {};
    for (let n = 0; n < 8; n++) {
      const restricted = restrictRotationPhotos(items, history, false, true); restrictGrid6PhotoCycles(restricted, items, history);
      const pages = buildThreadsGrid6Pages({ itemsBySection: restricted, coverImageUrls: covers, seed: 'local-audit-' + n, hook: hooks[n % hooks.length], usedImages, usedItems, previousPages: lists.map((list: any) => list.pages) });
      const draft = { id: `threads-grid6-collage-caption-local-${n}`, navTitle: `Kiểm tra dữ liệu ${n + 1}`, title: pages[0].title, description: '', postCaption: pages[0].title, captionBody: '', captionHashtags: [], canvasPreset: 'tiktok-9x16', pages };
      const rotated = rotatePartnerList(draft, 'threads-grid6-collage', items, history, 'local-audit-' + n);
      assertThreadsGrid6Pages(rotated.list.pages);
      history = rotated.history;
      if (n >= 4) { rotated.list.photoPreset = 'photo-ref-07-dark-crisp-v1'; rotated.list.pages.forEach((page: any) => page.photoPreset = rotated.list.photoPreset); }
      lists.push(rotated.list);
      for (const page of rotated.list.pages) { if (page.backgroundImage) usedImages.add(page.backgroundImage); for (const item of page.items || []) { usedImages.add(item.imageUrl); usedItems.add(item.id); } }
    }
    fs.writeFileSync(path.join(root, 'fixture.json'), JSON.stringify({ cache, lists }));
  }
  console.log(JSON.stringify(report, null, 2)); console.log('LOCAL_AUDIT=' + root);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
