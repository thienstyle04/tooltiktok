// Isolated UI/render test: all API calls are mocked; never creates real lists/schedules.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const repo = path.resolve(__dirname, '../..'), frontend = path.join(repo, 'frontend');
require(path.join(repo, 'backend/node_modules/ts-node')).register({ project: path.join(repo, 'backend/tsconfig.json'), transpileOnly: true });
const { photoPresetsCatalog } = require(path.join(repo, 'backend/src/modules/guide/photo-presets.ts'));
const { renderColorEdit } = require(path.join(repo, 'backend/src/modules/guide/color-edit.ts'));
const esbuild = require('esbuild'), { chromium } = require('playwright'), sharp = require(path.join(repo, 'backend/node_modules/sharp'));
const catalog = photoPresetsCatalog(), recipes = catalog.presets.slice(2);
const output = path.resolve(process.env.DALAT_TEST_OUTPUT_DIR || path.join(repo, 'outputs/reference-photo-presets'));
const bundle = contents => esbuild.buildSync({ stdin: { contents, resolveDir: frontend, loader: 'jsx' }, bundle: true, write: false, format: 'iife', loader: { '.js': 'jsx' }, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } }).outputFiles[0].text;
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const source = await sharp(Buffer.from('<svg width="180" height="240"><defs><linearGradient id="g"><stop stop-color="#153d2a"/><stop offset=".5" stop-color="#acbe91"/><stop offset="1" stop-color="#f5c065"/></linearGradient></defs><rect width="180" height="240" fill="url(#g)"/><circle cx="100" cy="100" r="45" fill="#cc7647"/></svg>')).png().toBuffer();
  const images = new Map();
  for (const preset of recipes) images.set(preset.id, await renderColorEdit(source, preset.id));
  const executablePath = process.env.TEST_BROWSER_PATH || [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }), errors = [], posted = [];
    page.on('pageerror', error => errors.push(error.message));
    const dataset = { source: { destinationId: 'dalat', destinationLabel: 'Đà Lạt', totalItems: 1, allowedDeckIds: ['grid-6'] }, decks: [{ id: 'grid-6', navTitle: 'Mẫu Lưới 6 Ô', title: 'Lưới 6', lists: [{ id: 'grid-6-main', navTitle: 'List chính', title: 'Lưới', pages: [{ type: 'cover', title: 'Lưới' }] }] }] };
    const css = [...fs.readFileSync(path.join(frontend, 'app/globals.css'), 'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m => fs.readFileSync(path.join(frontend, 'app', m[1]), 'utf8')).join('\n');
    await page.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: '<style>' + css + '</style><div id="root"></div>' });
      let body = {};
      if (url.pathname === '/api/photo-presets') body = catalog;
      else if (url.pathname === '/api/guide-data') body = dataset;
      else if (url.pathname === '/api/health') body = { status: 'ok', sessionId: 'preset-test' };
      else if (url.pathname === '/api/automation') body = { schedules: [], runs: [], locked: false, browserAvailable: true };
      else if (url.pathname === '/api/destinations') body = { active: { id: 'dalat' }, destinations: [{ id: 'dalat', label: 'Đà Lạt', allowedDeckIds: ['grid-6'] }] };
      else if (url.pathname === '/api/drive-cache/status') body = { ready: true, total: 1, cached: 1, destinationId: 'dalat' };
      else if (url.pathname === '/api/automation/manual-generation' && request.method() === 'POST') { posted.push(request.postDataJSON()); body = { id: 'mock', status: 'failed', error: 'Mô phỏng: chỉ kiểm tra payload' }; }
      else if (url.pathname === '/api/runtime-performance') body = { mode: 'normal' };
      else if (url.pathname === '/assets/color-edit') return route.fulfill({ contentType: 'image/png', body: images.get(url.searchParams.get('preset')) || source });
      return route.fulfill({ json: body });
    });
    const studio = bundle("import React from 'react';import{createRoot}from'react-dom/client';import Studio from './components/DeckStudio';createRoot(document.getElementById('root')).render(<Studio initialDataset={window.__dataset}/>);");
    const mount = async () => { await page.goto('http://preset.test'); await page.evaluate(d => { window.__dataset = d; }, dataset); await page.addScriptTag({ content: studio }); await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('button', { name: /^Tạo/ }).click(); await page.getByRole('button', { name: 'Tạo list', exact: true }).first().click(); };
    // V2: ngăn kéo tạo list đang mở che menu; đóng nó rồi mới sang màn Tự động.
    const openScheduler = async () => {
      const close = page.getByRole('button', { name: 'Đóng ngăn kéo tạo list' });
      if (await close.count()) await close.click();
      await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('button', { name: /^Tự động/ }).click();
    };
    await mount();
    for (const preset of recipes) {
      await page.locator('.photo-preset-trigger').click(); assert.equal(await page.locator('.photo-preset-options input').count(), catalog.presets.length);
      await page.getByRole('radio', { name: preset.label, exact: true }).click();
      assert.match(await page.locator('.photo-preset-trigger').textContent(), new RegExp(preset.label));
      await page.locator('#nonAiBatchCountSelect').selectOption('1'); await page.locator('#createDeckFromCaptionBtn').click();
      await page.waitForFunction(() => !document.querySelector('#createDeckFromCaptionBtn')?.disabled);
      assert.equal(posted.at(-1).request.photoPreset, preset.id);
    }
    await mount(); assert.match(await page.locator('.photo-preset-trigger').textContent(), /07 · Dark Crisp/);
    await page.locator('#nonAiBatchCountSelect').selectOption('3'); await page.locator('#createDeckFromCaptionBtn').click();
    await page.waitForFunction(() => !document.querySelector('#createDeckFromCaptionBtn')?.disabled);
    assert.equal(posted.at(-1).request.photoPreset, recipes.at(-1).id); assert.equal(posted.at(-1).request.count, 3);
    for (const width of [1920, 1280, 768, 390]) {
      await page.setViewportSize({ width, height: 900 }); await page.locator('.photo-preset-trigger').click();
      const bounds = await page.locator('.photo-preset-options').evaluate(e => ({ left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right, width: innerWidth }));
      assert.ok(bounds.left >= 0 && bounds.right <= bounds.width + 1, 'Palette menu stays inside viewport');
      await page.getByRole('radio', { name: recipes.at(-1).label, exact: true }).scrollIntoViewIfNeeded();
      if (width === 390 || width === 1280) await page.screenshot({ path: path.join(output, `picker-${width}.png`) });
      await page.keyboard.press('Escape'); assert.equal(await page.locator('.photo-preset-options').count(), 0);
    }
    await page.setViewportSize({ width: 1280, height: 900 }); await openScheduler();
    const row = page.locator('.automation-template-grid label').filter({ hasText: 'Mẫu Lưới 6 Ô' });
    await row.locator('input[type=checkbox]').check();
    for (const preset of recipes) { await row.locator('select').selectOption(preset.id); const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('dalat-carousel:automation-schedule-draft:v2'))); assert.equal(draft.templates[0].photoPreset, preset.id); }
    await mount(); await openScheduler();
    assert.equal(await row.locator('select').inputValue(), recipes.at(-1).id, 'Scheduled palette survives draft reload');
    // Actual shared page renderer and PNG/JPG capture: only image URLs receive the preset.
    const exported = esbuild.buildSync({ stdin: { contents: "export {renderCoverPage} from './lib/pageMarkup';export {renderPageBlobWithRetry} from './lib/exporter/render';", resolveDir: path.join(frontend, 'lib/..') }, bundle: true, write: false, format: 'iife', globalName: 'PaletteExport' }).outputFiles[0].text;
    await page.goto('http://preset.test'); await page.addScriptTag({ content: exported });
    for (const preset of recipes) {
      const captures = await page.evaluate(async p => {
        const model = { type: 'cover', title: 'GIỮ NGUYÊN CHỮ', subtitle: '', backgroundImage: '/assets/drive-file?id=fixture', layoutVariant: 'spotlight-v6-cover', photoPreset: p.id };
        const before = JSON.stringify(model), list = { id: 'fixture', photoPreset: p.id, pages: [model] };
        document.body.innerHTML = '<style>article{position:relative;width:180px;height:240px}article img{position:absolute;width:100%;height:100%;object-fit:cover}.spotlight-v6-cover-title{position:relative;color:white}</style>' + PaletteExport.renderCoverPage(model, 0, 1, 'fixture', [], list, []);
        const node = document.querySelector('article');
        await Promise.all([...node.querySelectorAll('img')].map(img => img.decode()));
        const results = [];
        for (const imageFormat of ['image/png', 'image/jpeg']) {
          const blob = await PaletteExport.renderPageBlobWithRetry(node, { imageFormat, imageQuality: .95, pixelRatio: 1, imagesReady: true, embedFonts: false, preferHtml2Canvas: true });
          results.push({ type: blob.type, bytes: [...new Uint8Array(await blob.arrayBuffer())] });
        }
        return { results, before, after: JSON.stringify(model), html: node.outerHTML };
      }, preset);
      assert.equal(captures.before, captures.after); assert.ok(captures.html.includes('preset=' + preset.id)); assert.ok(captures.html.includes('GIỮ NGUYÊN CHỮ'));
      assert.deepEqual(captures.results.map(c=>c.type), ['image/png', 'image/jpeg']);
      for (const capture of captures.results) { const expected = capture.type === 'image/png' ? 'png' : 'jpeg', bytes = Buffer.from(capture.bytes); assert.equal((await sharp(bytes).metadata()).format, expected); await sharp(bytes).stats(); fs.writeFileSync(path.join(output, preset.id + (expected === 'png' ? '.png' : '.jpg')), bytes); }
    }
    assert.deepEqual(errors, []);
    console.log('PASS seven palettes: create/batch payloads, memory/reload, scheduler draft/reload, 4 viewport sizes, Escape, 14 actual PNG/JPG captures, immutable source/text.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
