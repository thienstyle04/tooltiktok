// Offline export smoke: uses a saved Mua hong snapshot and the local Drive cache only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const root = path.resolve(import.meta.dirname, '..');
const data = path.resolve(root, '../backend/data');
const saved = JSON.parse(fs.readFileSync(path.join(data, 'generated-caption-lists.dalat.json'), 'utf8'));
const list = (saved.decks?.['spotlight-v6-persimmon'] || []).find((entry) => entry.id.includes('-caption-'));

if (!list || list.pages?.length < 9 || list.pages?.length > 11) {
  console.log('SKIP Spotlight Mua hong export: can snapshot runtime 9-11 trang.');
  process.exit(0);
}

let source = fs.readFileSync(path.join(root, 'lib/exportClient.js'), 'utf8')
  .replace('function downloadBlobFile(', 'function originalDownloadBlobFile(');
source += '\nfunction downloadBlobFile(blob, name) { window.__downloads.push({ blob, name }); return true; }\nexport { JSZip };';
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
      return route.fulfill({ json: { status: 'ok', sessionId: 'persimmon-export-smoke', appVersion: '0.6.03' } });
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
      if (/^[\w-]+$/.test(id || '') && fs.existsSync(file)) return route.fulfill({ body: fs.readFileSync(file) });
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
  const result = await page.evaluate(async ({ list }) => {
    window.__downloads = [];
    const deck = { id: 'spotlight-v6-persimmon', lists: [list] };
    const dataset = { decks: [deck], source: { destinationId: 'dalat' } };
    const failures = [];
    await Smoke.exportActiveList({ deck, list, quality: 'optimized', dataset }, { failProgress: (message) => failures.push(message) });
    if (failures.length) throw new Error(failures.join('\n'));
    const download = window.__downloads.find((entry) => entry.name.endsWith('.zip'));
    if (!download) throw new Error('Khong tao duoc ZIP.');
    const zip = await Smoke.JSZip.loadAsync(await download.blob.arrayBuffer(), { checkCRC32: true });
    const pngs = Object.values(zip.files).filter((file) => file.name.endsWith('.png'));
    let opaqueCorners = 0;
    for (const file of pngs) {
      const bitmap = await createImageBitmap(new Blob([await file.async('uint8array')], { type: 'image/png' }));
      if (bitmap.width !== 1080 || bitmap.height !== 1920) throw new Error(`Sai kich thuoc ${file.name}`);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      const corners = [[0, 0], [1079, 0], [0, 1919], [1079, 1919]];
      if (corners.every(([x, y]) => context.getImageData(x, y, 1, 1).data[3] === 255)) opaqueCorners += 1;
      bitmap.close();
    }
    const workbookFile = Object.values(zip.files).find((file) => /partners-set.*\.xlsx$/i.test(file.name));
    if (!workbookFile) throw new Error('Thieu partners XLSX.');
    const workbook = await Smoke.JSZip.loadAsync(await workbookFile.async('uint8array'));
    const sheetXml = await workbook.file('xl/worksheets/sheet1.xml').async('string');
    const partnerCells = (sheetXml.match(/<c r="[A-Z]+1"/g) || []).length;
    const captions = Object.values(zip.files).filter((file) => /caption-set.*\.txt$/i.test(file.name)).length;
    return { name: download.name, bytes: download.blob.size, pngs: pngs.length, opaqueCorners, partnerCells, captions };
  }, { list });

  assert.equal(result.pngs, list.pages.length);
  assert.equal(result.opaqueCorners, list.pages.length);
  assert.equal(result.partnerCells, list.pages.length - 4);
  assert.equal(result.captions, 1);
  assert.equal(external, 0, 'Unexpected network request');
  assert.equal(missing.size, 0, `Missing cache IDs: ${[...missing].join(', ')}`);
  console.log('PASS Spotlight Mua hong live export', JSON.stringify(result));
} finally {
  await browser.close();
}
