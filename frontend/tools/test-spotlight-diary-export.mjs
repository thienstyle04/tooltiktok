// Real renderer/export test using read-only cached diary source fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const root = path.resolve(import.meta.dirname, '..');
const appVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const data = path.resolve(root, '../backend/data');
const fixture = path.resolve(root, '../.test-runtime/diary/lists.json');
assert.ok(fs.existsSync(fixture), 'Run backend diary integration --output ../.test-runtime/diary/lists.json first.');
const { lists, automationLists } = JSON.parse(fs.readFileSync(fixture, 'utf8'));
const list = lists[0];
assert.equal(list.pages.length, 10);
let source = fs.readFileSync(path.join(root, 'lib/exportClient.js'), 'utf8')
  .replace('function downloadBlobFile(', 'function originalDownloadBlobFile(');
source += '\nfunction downloadBlobFile(blob, name) { window.__downloads.push({ blob, name }); return true; }\nexport { JSZip, renderPagesForExport, fitSpotlightDiary };';
const bundle = await esbuild.build({
  stdin: { contents: source, resolveDir: path.join(root, 'lib') },
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'Smoke',
  write: false,
});
const executablePath = [
  process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe',
  process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe',
].find(fs.existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
let external = 0;
const missing = new Set();

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 2100 } });
  const css = [...fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8').matchAll(/@import url\("(.+?)"\)/g)]
    .map((match) => fs.readFileSync(path.join(root, 'app', match[1]), 'utf8'))
    .join('\n');
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<html><head><style>${css}</style></head><body></body></html>` });
    if (url.pathname === '/api/health') {
      return route.fulfill({ json: { status: 'ok', sessionId: 'diary-export-smoke', appVersion } });
    }
    if (url.pathname === '/api/drive-cache/status') {
      return route.fulfill({ json: { phase: 'ready', ready: true, destinationId: 'dalat', total: 736, completed: 736, cached: 736, failed: 0, percent: 100 } });
    }
    if (url.pathname === '/api/drive-files/cache-status') {
      const ids = route.request().postDataJSON().fileIds;
      const absent = ids.filter((id) => !fs.existsSync(path.join(data, 'drive-file-cache', `${id}.bin`)));
      return route.fulfill({ json: { missing: absent, cached: ids.length - absent.length } });
    }
    if (url.pathname === '/api/drive-files/prefetch') {
      const ids = route.request().postDataJSON().fileIds;
      const absent = ids.filter((id) => !fs.existsSync(path.join(data, 'drive-file-cache', `${id}.bin`)));
      return route.fulfill({ json: { total: ids.length, skipped: ids.length - absent.length, ok: 0, fail: absent.length, cancelled: false } });
    }
    if (url.pathname === '/api/runtime-performance' || url.pathname === '/api/runtime-performance/report') {
      return route.fulfill({ json: { mode: 'modern', reason: 'smoke test', totalMemoryBytes: 16 * 1024 ** 3, freeMemoryBytes: 8 * 1024 ** 3, logicalCpuCount: 8 } });
    }
    if (url.pathname === '/assets/drive-file') {
      const id = url.searchParams.get('id');
      const file = path.join(data, 'drive-file-cache', `${id}.bin`);
      if (/^[\w-]+$/.test(id || '') && fs.existsSync(file)) {
        const body = fs.readFileSync(file);
        const contentType = body[0] === 0x89 ? 'image/png' : body[0] === 0xff ? 'image/jpeg' : 'image/webp';
        return route.fulfill({ body, contentType });
      }
      missing.add(id); return route.abort();
    }
    if (url.pathname.startsWith('/fonts/')) {
      const file = path.join(root, 'public', url.pathname);
      if (fs.existsSync(file)) return route.fulfill({ body: fs.readFileSync(file) });
    }
    external += 1;
    console.error('UNEXPECTED_EXPORT_REQUEST', route.request().method(), url.href);
    return route.abort();
  });
  await page.goto('http://localhost:3001/');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  for (const mode of ['modern', 'legacy', 'original']) {
  const result = await page.evaluate(async ({ list, mode }) => {
    window.__downloads = [];
    const deck = { id: 'spotlight-v6-diary', lists: [list] };
    const dataset = { decks: [deck], source: { destinationId: 'dalat' } };
    const failures = [];
    await Smoke.exportActiveList({ deck, list, quality: mode === 'original' ? 'original' : 'optimized', _compatRetry: mode === 'legacy', dataset }, { failProgress: (message) => failures.push(message) });
    if (failures.length) throw new Error(failures.join('\n'));
    const download = window.__downloads.find((entry) => entry.name.endsWith('.zip'));
    if (!download) throw new Error('Khong tao duoc ZIP.');
    const zip = await Smoke.JSZip.loadAsync(await download.blob.arrayBuffer(), { checkCRC32: true });
    const pngs = Object.values(zip.files).filter((file) => file.name.endsWith('.png')).sort((a,b) => a.name.localeCompare(b.name));
    window.__diaryPreviewBuffer = await pngs[0].async('uint8array');
    window.__diaryPlaceBuffer = await pngs[3].async('uint8array');
    let opaqueCorners = 0;
    const cornerSamples = [];
    for (const file of pngs) {
      const bitmap = await createImageBitmap(new Blob([await file.async('uint8array')], { type: 'image/png' }));
      if (bitmap.width !== 1080 || bitmap.height !== 1440) throw new Error(`Sai kich thuoc ${file.name}`);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      const corners = [[0, 0], [1079, 0], [0, 1439], [1079, 1439]];
      if (!cornerSamples.length) cornerSamples.push(...corners.map(([x,y]) => [...context.getImageData(x,y,1,1).data]));
      if (corners.every(([x, y]) => context.getImageData(x, y, 1, 1).data[3] === 255)) opaqueCorners += 1;
      bitmap.close();
    }
    const workbookFile = Object.values(zip.files).find((file) => /partners-set.*\.xlsx$/i.test(file.name));
    if (!workbookFile) throw new Error('Thieu partners XLSX.');
    const workbook = await Smoke.JSZip.loadAsync(await workbookFile.async('uint8array'));
    const sheetXml = await workbook.file('xl/worksheets/sheet1.xml').async('string');
    const partnerCells = (sheetXml.match(/<c r="[A-Z]+1"/g) || []).length;
    const doc = new DOMParser().parseFromString(sheetXml, 'text/xml');
    const names = [...doc.querySelectorAll('t')].map(node => node.textContent).sort();
    const expected = list.pages.slice(3).map(page => page.items[0].rawName).sort();
    if (JSON.stringify(names) !== JSON.stringify(expected)) throw new Error('Excel names differ from the seven snapshot partners');
    const captionFile = Object.values(zip.files).find(file => /caption-set.*\.txt$/i.test(file.name));
    const caption = await captionFile.async('string');
    if (!caption.includes('Một vài gợi ý quán ăn và cà phê ở Đà Lạt') || !caption.includes('#dalattrip')) throw new Error('Missing diary caption');
    const captions = Object.values(zip.files).filter((file) => /caption-set.*\.txt$/i.test(file.name)).length;
    return { name: download.name, bytes: download.blob.size, pngs: pngs.length, opaqueCorners, partnerCells, captions, cornerSamples };
  }, { list, mode });

  assert.equal(result.pngs, list.pages.length);
  fs.writeFileSync(path.join(path.dirname(fixture), `${mode}.png`), Buffer.from(await page.evaluate(() => Array.from(window.__diaryPreviewBuffer))));
  if (mode === 'modern') fs.writeFileSync(path.join(path.dirname(fixture), 'place.png'), Buffer.from(await page.evaluate(() => Array.from(window.__diaryPlaceBuffer))));
  assert.equal(result.opaqueCorners, list.pages.length);
  assert.equal(result.partnerCells, 7);
  assert.equal(result.captions, 1);
  assert.equal(external, 0, 'Unexpected network request');
  assert.equal(missing.size, 0, `Missing cache IDs: ${[...missing].join(', ')}`);
  console.log('PASS Spotlight diary cached export', mode, JSON.stringify(result));
  }
  const checks = await page.evaluate(async ({ lists }) => {
    const list = lists[0];
    const nodes = Smoke.renderPagesForExport(list);
    for (const node of nodes) Smoke.fitSpotlightDiary(node, true);
    const blank = nodes[1].querySelector('.diary-copy').textContent;
    if (blank !== '') throw new Error('Page two must be blank');
    const tooLong = nodes[3];
    tooLong.querySelector('.diary-copy').textContent = 'Nội dung quá dài '.repeat(200);
    let blocked = false;
    try { Smoke.fitSpotlightDiary(tooLong, true); } catch { blocked = true; }
    if (!blocked) throw new Error('Overflow was not blocked');
    nodes.forEach(node => node.remove());
    window.__downloads = [];
    const errors = [];
    const deck = { id: 'spotlight-v6-diary', lists };
    const v6 = { id: 'spotlight-v6-caption-diary-regression', navTitle: 'V6', title: 'V6', pages: [{ ...list.pages[3], layoutVariant: 'spotlight-v6-page', canvasPreset: 'tiktok-9x16' }] };
    const v5 = { id: 'spotlight-v5-caption-diary-regression', navTitle: 'V5', title: 'V5', pages: [{ ...list.pages[3], layoutVariant: 'spotlight-v5-place', canvasPreset: 'tiktok-4x5' }] };
    const dataset = { source: { destinationId: 'dalat' }, decks: [deck, { id: 'spotlight-v6', lists: [v6] }, { id: 'spotlight-v5', lists: [v5] }] };
    await Smoke.exportSelectedPagePng({ deck, list, selectedPageIndex: 3, quality: 'optimized', dataset }, { failProgress: message => errors.push(message) });
    const single = window.__downloads.find(entry => entry.name.endsWith('.png'));
    if (!single) throw new Error('Missing single page');
    const image = await createImageBitmap(single.blob);
    if (image.width !== 1080 || image.height !== 1440) throw new Error('Wrong single page size');
    image.close();
    await Smoke.exportBatch({ dataset, selectedListIds: new Set([...lists.map(list => list.id), v6.id, v5.id]), quality: 'optimized' }, { failProgress: message => errors.push(message) });
    if (errors.length) throw new Error(errors.join('; '));
    const zipFile = window.__downloads.find(entry => entry.name.endsWith('.zip'));
    const zip = await Smoke.JSZip.loadAsync(await zipFile.blob.arrayBuffer(), { checkCRC32: true });
    const dimensions = {};
    for (const file of Object.values(zip.files).filter(file => file.name.endsWith('.png'))) {
      const bitmap = await createImageBitmap(new Blob([await file.async('uint8array')], { type: 'image/png' }));
      const key = `${bitmap.width}x${bitmap.height}`;
      dimensions[key] = (dimensions[key] || 0) + 1; bitmap.close();
    }
    return { dimensions, overflowBlocked: blocked };
  }, { lists });
  assert.deepEqual(checks.dimensions, { '1080x1440': 20, '1080x1920': 1, '1080x1350': 1 });
  console.log('PASS single page, mixed batch CRC/dimensions, blank page and overflow', JSON.stringify(checks));
  const automatic = await page.evaluate(async ({ automationLists }) => {
    window.__downloads = [];
    const errors = [];
    const deck = { id: 'spotlight-v6-diary', lists: automationLists };
    await Smoke.exportBatch({ dataset: { decks: [deck], source: { destinationId: 'dalat' } }, selectedListIds: new Set(automationLists.map(list => list.id)), quality: 'optimized' }, { failProgress: message => errors.push(message) });
    if (errors.length) throw new Error(errors.join('; '));
    const download = window.__downloads.find(file => file.name.endsWith('.zip'));
    const zip = await Smoke.JSZip.loadAsync(await download.blob.arrayBuffer(), { checkCRC32: true });
    let pngCount = 0, workbooks = 0;
    for (const file of Object.values(zip.files)) {
      if (file.name.endsWith('.png')) {
        const bitmap = await createImageBitmap(new Blob([await file.async('uint8array')], { type: 'image/png' }));
        if (bitmap.width !== 1080 || bitmap.height !== 1440) throw new Error('Wrong automation PNG size');
        pngCount++; bitmap.close();
      }
      if (file.name.endsWith('.xlsx')) {
        const book = await Smoke.JSZip.loadAsync(await file.async('uint8array'), { checkCRC32: true });
        const xml = await book.file('xl/worksheets/sheet1.xml').async('string');
        if ((xml.match(/<c r="[A-Z]+1"/g) || []).length !== 7) throw new Error('Wrong automation partner count');
        workbooks++;
      }
    }
    return { pngCount, workbooks, bytes: download.blob.size };
  }, { automationLists });
  assert.equal(automatic.pngCount, 30); assert.equal(automatic.workbooks, 3);
  console.log('PASS isolated automation generation/export payload', JSON.stringify(automatic));
} finally {
  await browser.close();
}
