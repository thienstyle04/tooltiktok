import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), { chromium } = require('playwright'), esbuild = require('esbuild');
const root = path.resolve(import.meta.dirname, '..'), API = 'http://127.0.0.1:3000';
async function api(url, method = 'GET', body) {
  const response = await fetch(API + url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}
let source = fs.readFileSync(path.join(root, 'lib/exportClient.js'), 'utf8').replace('function downloadBlobFile(', 'function unusedDownloadBlobFile(');
source += '\nfunction downloadBlobFile(blob,name){window.downloads.push({blob,name});return true;} export {JSZip};';
const bundle = await esbuild.build({ stdin: { contents: source, resolveDir: path.join(root, 'lib') }, bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'MixedTest' });
const css = [...fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m => fs.readFileSync(path.join(root, 'app', m[1]), 'utf8')).join('\n');
const executablePath = [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const created = [];
try {
  for (const deckId of ['spotlight-v6', 'spotlight-v4', 'summary-note']) {
    const result = await api('/api/decks/generate-from-caption', 'POST', { deckId, tone: 'lich_trinh_huu_ich', caption: { coverTitle: 'Kiểm thử xuất hỗn hợp', headline: 'Kiểm thử', body: 'Kiểm thử', hashtags: [] } });
    assert.ok(result.listId);
    created.push({ deckId, listId: result.listId });
  }
  const dataset = await api('/api/guide-data');
  const page = await browser.newPage({ viewport: { width: 1400, height: 2200 } });
  await page.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<style>${css}</style>` });
    if (u.pathname.startsWith('/fonts/')) {
      const file = path.join(root, 'public', u.pathname);
      if (fs.existsSync(file)) return route.fulfill({ body: fs.readFileSync(file) });
    }
    if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/assets/')) return route.fulfill({ response: await route.fetch({ url: API + u.pathname + u.search }) });
    return route.abort();
  });
  await page.goto('http://localhost:3001/');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(async ({ dataset, created }) => {
    window.downloads = [];
    const errors = [], statuses = [];
    const selectedListIds = new Set(created.map(x => x.listId));
    const expected = dataset.decks.flatMap(d => d.lists).filter(l => selectedListIds.has(l.id)).reduce((n, l) => n + l.pages.length, 0);
    const response = await MixedTest.exportBatch({ dataset, selectedListIds, quality: 'optimized' }, { failProgress: m => errors.push(m), setStatus: m => statuses.push(m) });
    if (errors.length || !response?.success || window.downloads.length !== 1) throw new Error(JSON.stringify({ errors, response, downloads: window.downloads.length }));
    const zip = await MixedTest.JSZip.loadAsync(await window.downloads[0].blob.arrayBuffer(), { checkCRC32: true });
    const pngs = Object.values(zip.files).filter(f => f.name.endsWith('.png'));
    if (pngs.length !== expected) throw new Error('Missing pages in mixed ZIP');
    const sizes = new Set();
    for (const file of pngs) {
      const image = await createImageBitmap(new Blob([await file.async('uint8array')], { type: 'image/png' }));
      sizes.add(`${image.width}x${image.height}`); image.close();
    }
    return { pages: pngs.length, bytes: window.downloads[0].blob.size, sizes: [...sizes], modes: [...new Set(statuses.filter(x => x.includes('Cân bằng')))] };
  }, { dataset, created });
  console.log('PASS mixed real-cache batch', JSON.stringify(result));
} finally {
  await browser.close();
  const cleanup = await Promise.allSettled(created.map(x => api(`/api/decks/${x.deckId}/lists/${x.listId}`, 'DELETE')));
  if (cleanup.some(x => x.status === 'rejected')) throw new Error('Some test lists could not be deleted: ' + JSON.stringify(created));
  console.log('Cleaned mixed test lists:', created.length);
}
