// Real renderer, isolated fixture; backend HTTP boundary serves local cache only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const front = path.resolve(import.meta.dirname, '..');
const runtime = path.resolve(front, '../outputs/studio-audit-runtime');
const modes = process.env.AUDIT_EXPORT_MODES?.split(',') || ['mixed25', 'legacy', 'original', 'partial', 'allbad', 'cancel'];
const output = path.join(runtime, process.env.AUDIT_EXPORT_MODES ? 'export-evidence-extra' : 'export-evidence');
fs.mkdirSync(output, { recursive: true });
const { lists } = JSON.parse(fs.readFileSync(path.join(runtime, 'audit-lists.json')));
assert.equal(lists.length, 25);
assert.ok(lists.every(list => list.pages.length === 12));
const version = JSON.parse(fs.readFileSync(path.join(front, 'package.json'))).version;
const source = fs.readFileSync(path.join(front, 'lib/exportClient.js'), 'utf8')
  .replace('function downloadBlobFile(', 'function originalDownloadBlobFile(')
  + '\nfunction downloadBlobFile(blob, name) { window.__downloads.push({blob,name}); return true; }\nexport { JSZip };';
const bundle = await esbuild.build({ stdin: { contents: source, resolveDir: path.join(front, 'lib') }, bundle: true, write: false, format: 'iife', globalName: 'Audit' });
const css = [...fs.readFileSync(path.join(front, 'app/globals.css'), 'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m => fs.readFileSync(path.join(front, 'app', m[1]), 'utf8')).join('\n');
const executablePath = [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ headless: true, executablePath });
const requests = [], results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const json = value => route.fulfill({ json: value });
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<style>${css}</style>` });
    if (url.pathname === '/api/health') return json({ status: 'ok', sessionId: 'audit', appVersion: version });
    if (url.pathname === '/api/drive-cache/status') return json({ ready: true, phase: 'ready', destinationId: 'dalat' });
    if (url.pathname === '/api/night-sync/export-lease') return json({ ok: true });
    if (url.pathname.includes('runtime-performance')) return json({ mode: 'modern', totalMemoryBytes: 32 * 1024 ** 3, freeMemoryBytes: 8 * 1024 ** 3, logicalCpuCount: 8 });
    if (url.pathname === '/api/drive-files/cache-status') {
      const ids = route.request().postDataJSON().fileIds;
      // Simulate a file disappearing after the preflight said it was valid.
      const missing = ids.filter(id => id !== 'audit_late_image' && !fs.existsSync(path.join(runtime, 'backend/data/drive-file-cache', id + '.bin')));
      return json({ total: ids.length, cached: ids.length - missing.length, missing });
    }
    if (url.pathname === '/assets/drive-file') {
      const id = url.searchParams.get('id');
      if (/^[\w-]+$/.test(id || '')) {
        const file = path.join(runtime, 'backend/data/drive-file-cache', id + '.bin');
        if (fs.existsSync(file)) {
          const body = fs.readFileSync(file);
          return route.fulfill({ body, contentType: body[0] === 137 ? 'image/png' : body[0] === 255 ? 'image/jpeg' : 'image/webp' });
        }
      }
      return route.fulfill({ status: 404, body: 'missing' });
    }
    if (url.pathname.startsWith('/fonts/')) {
      const file = path.join(front, 'public/fonts', path.basename(url.pathname));
      if (fs.existsSync(file)) return route.fulfill({ body: fs.readFileSync(file) });
    }
    requests.push(url.href); return route.abort();
  });
  await page.goto('http://audit.local/');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  for (const mode of modes) {
    const result = await page.evaluate(async ({ mode, lists }) => {
      window.__downloads = [];
      const chosen = mode === 'mixed25' ? lists.slice(0, 24) : lists.slice(0, ['partial', 'cancel', 'late', 'late-cancel'].includes(mode) ? 2 : 1);
      const deck = { id: 'spotlight-v6-diary', lists: chosen };
      const decks = [deck];
      if (mode === 'mixed25') {
        const mixed = { ...lists[24], id: 'spotlight-v6-caption-audit', pages: lists[24].pages.slice(3).map(p => ({ ...p, layoutVariant: 'spotlight-v6-page', canvasPreset: 'tiktok-9x16' })) };
        decks.push({ id: 'spotlight-v6', lists: [mixed] });
      }
      if (['partial', 'allbad', 'cancel'].includes(mode)) chosen[0].pages[0].backgroundImage = '/assets/drive-file?id=audit_missing_image';
      if (['late', 'late-cancel'].includes(mode)) chosen[0].pages[3].backgroundImage = '/assets/drive-file?id=audit_late_image';
      const dataset = { source: { destinationId: 'dalat' }, decks };
      const before = JSON.stringify(dataset);
      let prompts = 0; const errors = [];
      const context = { dataset, deck, list: chosen[0], selectedListIds: new Set(decks.flatMap(d => d.lists.map(l => l.id))), quality: mode === 'original' ? 'original' : 'optimized', _compatRetry: mode === 'legacy', confirmSkipImages: async () => { prompts++; return !['cancel', 'late-cancel'].includes(mode); } };
      const handlers = { failProgress: message => errors.push(message) };
      let outcome;
      if (['legacy', 'original'].includes(mode)) outcome = await Audit.exportActiveList(context, handlers);
      else outcome = await Audit.exportBatch(context, handlers);
      if (JSON.stringify(dataset) !== before) throw Error('Snapshot mutated');
      const download = window.__downloads.find(d => d.name.endsWith('.zip'));
      if (!download) return { mode, prompts, errors, archives: 0, outcome };
      const zip = await Audit.JSZip.loadAsync(await download.blob.arrayBuffer(), { checkCRC32: true });
      const dimensions = {}; let pngs = 0, captions = 0, workbooks = 0;
      for (const file of Object.values(zip.files)) {
        if (file.name.endsWith('.png')) {
          const bitmap = await createImageBitmap(new Blob([await file.async('uint8array')], { type: 'image/png' }));
          const key = bitmap.width + 'x' + bitmap.height; dimensions[key] = (dimensions[key] || 0) + 1; pngs++; bitmap.close();
        }
        if (file.name.endsWith('.xlsx')) { await Audit.JSZip.loadAsync(await file.async('uint8array'), { checkCRC32: true }); workbooks++; }
        if (file.name.endsWith('.txt')) { if (!(await file.async('string')).trim()) throw Error('Empty caption'); captions++; }
      }
      return { mode, prompts, errors, archives: 1, pngs, dimensions, captions, workbooks, bytes: download.blob.size, crc: true, outcome };
    }, { mode, lists });
    results.push(result);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(result));
    if (mode === 'mixed25') { assert.equal(result.pngs, 297); assert.equal(result.dimensions['1080x1440'], 288); assert.equal(result.dimensions['1080x1920'], 9); assert.equal(result.workbooks, 25); }
    if (['legacy', 'original', 'partial', 'late'].includes(mode)) assert.equal(result.pngs, 12);
    if (['allbad', 'cancel', 'late-cancel'].includes(mode)) assert.equal(result.archives, 0);
    if (['late', 'late-cancel'].includes(mode)) assert.equal(result.prompts, 1, 'Late image failure must ask before skipping');
  }
  assert.deepEqual(requests, [], 'No unexpected requests or network warm-up');
} finally { await browser.close(); fs.writeFileSync(path.join(output, 'unexpected-requests.json'), JSON.stringify(requests)); }
