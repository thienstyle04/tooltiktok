import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright'), esbuild = require('esbuild');
const front = path.resolve(import.meta.dirname, '..'), root = path.resolve(process.env.AUDIT_ROOT);
const backend = path.resolve(front, '../backend'), br = createRequire(path.join(backend, 'package.json'));
br('ts-node').register({ project: path.join(backend, 'tsconfig.json'), transpileOnly: true });
const { getColorEditAsset } = br(path.join(backend, 'src/modules/guide/color-edit.ts'));
const sharp = br('sharp');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'generation.json'))), deck = fixture.decks.find(d=>d.id===(process.env.AUDIT_DECK || fixture.decks[0].id)), list = deck.lists.find(l=>l.photoPreset) || deck.lists[0];
const v5 = deck.id === 'spotlight-v5-color-edit' || deck.id === 'spotlight-v5';
const source = fs.readFileSync(path.join(front, 'lib/exportClient.js'), 'utf8')
  .replace('function downloadBlobFile(', 'function originalDownloadBlobFile(')
  + '\nfunction downloadBlobFile(blob,name){window.__downloads.push({blob,name});return true;}\nexport {renderPageMarkupForExport, assertPartnerExportReady};';
const bundle = await esbuild.build({ stdin: { contents: source, resolveDir: path.join(front, 'lib') }, bundle: true, write: false, format: 'iife', globalName: 'Test' });
const css = [...fs.readFileSync(path.join(front, 'app/globals.css'), 'utf8').matchAll(/@import url\("(.+?)"\)/g)]
  .map(m => fs.readFileSync(path.join(front, 'app', m[1]), 'utf8')).join('\n');
const executablePath = [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ headless: true, executablePath });
let failImages = false;
try {
  const page = await browser.newPage();
  await page.route('**/*', async route => {
    const u = new URL(route.request().url()), json = value => route.fulfill({ json: value });
    if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<style>${css}</style>` });
    if (u.pathname === '/api/health') return json({ status: 'ok', sessionId: 'color-test', appVersion: '0.9.03' });
    if (u.pathname === '/api/night-sync/export-lease') return json({ ok: true });
    if (u.pathname === '/api/drive-cache/status') return json({ phase: 'ready', ready: true, destinationId: 'dalat' });
    if (u.pathname.includes('runtime-performance')) return json({ mode: 'modern', totalMemoryBytes: 32*1024**3, freeMemoryBytes: 8*1024**3, logicalCpuCount: 8 });
    if (u.pathname === '/api/drive-files/cache-status') return json({ missing: [] });
    if (u.pathname === '/assets/color-edit') {
      if (failImages) return route.fulfill({ status: 400, body: 'Color Edit failed' });
      const original = new URL(u.searchParams.get('source'), 'http://test.local'), id = original.searchParams.get('id');
      const body = await getColorEditAsset(fs.readFileSync(path.join(root, 'data/drive-file-cache', id + '.bin')), path.join(root, 'data'), u.searchParams.get('preset'));
      return route.fulfill({ body, contentType: 'image/png' });
    }
    if (u.pathname === '/assets/drive-file') {
      return route.fulfill({ body: fs.readFileSync(path.join(root, 'data/drive-file-cache', u.searchParams.get('id') + '.bin')), contentType: 'image/jpeg' });
    }
    if (u.pathname.startsWith('/fonts/')) { const f = path.join(front, 'public/fonts', path.basename(u.pathname)); if (fs.existsSync(f)) return route.fulfill({ body: fs.readFileSync(f) }); }
    return route.abort();
  });
  await page.goto('http://test.local/'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const index = list.pages.findIndex(p => p.layoutVariant === (v5 ? 'spotlight-v5-place' : 'spotlight-v6-page'));
  const preview = await page.evaluate(async ({ list, index, deckId }) => {
    document.body.innerHTML = Test.renderPageMarkupForExport(list, list.pages[index], index);
    const img = document.querySelector('img'); await img.decode();
    const page = document.querySelector('.story-page');
    const original = { ...list.pages[index] }; delete original.photoPreset;
    const oldMarkup = Test.renderPageMarkupForExport({ ...list, photoPreset: undefined }, original, index);
    return { src: img.getAttribute('src'), filter: getComputedStyle(img).filter,
      ratio: page.offsetWidth / page.offsetHeight, oldUnchanged: !oldMarkup.includes('/assets/color-edit'), names: Test.assertPartnerExportReady(list, deckId) };
  }, { list, index, deckId: deck.id });
  assert.match(preview.src, /\/assets\/color-edit/); assert.equal(preview.filter, 'none');
  assert(Math.abs(preview.ratio - (v5 ? 4 / 5 : 9 / 16)) < 0.005); assert.equal(preview.oldUnchanged, true); assert.equal(preview.names.length, v5 ? 7 : 4);
  if (deck.id === 'spotlight-v5-color-edit') {
    const shortError=await page.evaluate(({list,deckId})=>{
      const short=structuredClone(list);
      short.pages.find(page=>page.items?.[0]?.isPartner).items[0].isPartner=false;
      try { Test.assertPartnerExportReady(short,deckId); return ''; } catch(error) { return error.message; }
    },{list,deckId:deck.id});
    assert.match(shortError,/6\/7/);
  }
  await page.locator('.story-page').screenshot({ path: path.join(root, 'color-edit-preview.png') });
  for (const selectedIndex of (v5 ? [0, 1, index] : [index])) for (const format of ['png', 'jpg']) {
    const result = await page.evaluate(async ({ deck, list, index, format, source }) => {
      window.__downloads = [];
      const result = await Test.exportSelectedPagePng({ deck, list, dataset: { source, decks: [deck] }, selectedPageIndex: index, format, quality: 'optimized' });
      const download = window.__downloads[0];
      return { result, name: download?.name, bytes: download ? Array.from(new Uint8Array(await download.blob.arrayBuffer())) : [] };
    }, { deck, list, index: selectedIndex, format, source: fixture.source });
    assert(result.bytes.length > 0, JSON.stringify(result.result));
    const body = Buffer.from(result.bytes), info = await sharp(body).metadata();
    assert.equal(info.width, 1080); assert.equal(info.height, v5 ? 1350 : 1920); assert.equal(info.format, format === 'jpg' ? 'jpeg' : 'png');
    fs.writeFileSync(path.join(root, (selectedIndex === index ? 'color-edit-export' : 'color-edit-page-' + selectedIndex) + '.' + format), body);
  }
  // Optional visual proof: identical production layout with/without preset.
  // No source photo edits or changes to saved test lists.
  if (process.env.AUDIT_COMPARE === '1') {
    const candidates = deck.lists.flatMap(l => l.pages.map((p, i) => ({ list: l, index: i, page: p })));
    const samples = [], used = new Set();
    for (const selector of [p => p.page.type === 'cover', p => p.page.items?.[0]?.sourceSectionKey === 'quan_an', p => p.page.items?.[0]?.sourceSectionKey === 'cafe', p => p.page.items?.[0]?.sourceSectionKey === 'choi_dem']) {
      const sample = candidates.find(p => selector(p) && !used.has(p.page.backgroundImage));
      if (sample) { samples.push(sample); used.add(sample.page.backgroundImage); }
    }
    for (const candidate of candidates) if (samples.length < 4 && !used.has(candidate.page.backgroundImage)) { samples.push(candidate); used.add(candidate.page.backgroundImage); }
    await page.setViewportSize({ width: 1320, height: 1300 });
    await page.evaluate(async samples => {
      document.body.style.cssText = 'margin:0;background:#202420;color:white;font-family:Arial';
      document.body.innerHTML = '<div style="padding:16px;font-size:24px">Sheet mới — bên trái: ảnh gốc · bên phải: Color Edit</div><main style="display:grid;grid-template-columns:repeat(4,320px);gap:8px;padding:12px"></main>';
      const main = document.querySelector('main');
      for (const { list, index, page } of samples) for (const edited of [false, true]) {
        const value = { ...page, photoPreset: edited ? page.photoPreset : undefined };
        const section = document.createElement('section');
        section.innerHTML = `<div style="height:28px">${edited ? 'Color Edit' : 'Ảnh gốc'}</div>` + Test.renderPageMarkupForExport({ ...list, photoPreset: edited ? list.photoPreset : undefined }, value, index);
        main.appendChild(section);
        section.querySelector('.story-page').style.cssText += ';width:320px;height:568.89px';
      }
      await Promise.all([...document.images].map(img => img.decode()));
      await document.fonts.ready;
    }, samples);
    await page.screenshot({ path: path.join(root, 'new-sheet-before-after.png'), fullPage: true });
    // Restore the selected page for the failure-blocking regression below.
    await page.evaluate(({ list, index }) => { document.body.innerHTML = Test.renderPageMarkupForExport(list, list.pages[index], index); }, { list, index });
  }
  failImages = true;
  const failed = await page.evaluate(async ({ deck, list, index, source }) => {
    window.__downloads = [];
    const errors = [];
    const result = await Test.exportSelectedPagePng({ deck, list, dataset: { source, decks: [deck] }, selectedPageIndex: index, quality: 'optimized' }, { failProgress: message => errors.push(message) });
    return { result, errors, downloads: window.__downloads.length };
  }, { deck, list, index, source: fixture.source });
  assert(failed.errors.length || failed.result?.success === false); assert.equal(failed.downloads, 0);
  console.log(`PASS browser ${deck.id}: preview filtered once, unfiltered layout unchanged, PNG/JPG 1080x${v5?1350:1920}, processing failure blocks download.`);
} finally { await browser.close(); }
