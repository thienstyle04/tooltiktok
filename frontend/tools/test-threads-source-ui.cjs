// Actual scheduler component and shared selection policy, with mocked APIs only.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { createRequire } = require('node:module');
const front = path.resolve(__dirname, '..'), backend = path.resolve(front, '../backend');
const backRequire = createRequire(path.join(backend, 'package.json')), { chromium } = require('playwright'), esbuild = backRequire('esbuild');
backRequire('ts-node').register({ project: path.join(backend, 'tsconfig.json'), transpileOnly: true });
const cfg = backRequire('./src/modules/guide/sync/destination-config');
const destinations = cfg.getDestinationList().map(cfg.toDestinationInfo);
destinations.push({ ...destinations.find(s => s.id === 'dalat'), id: 'sheet-custom', label: 'Nguồn tùy chỉnh' });
async function main() {
  const bundle = await esbuild.build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Panel from '../components/AutomationSchedulerPanel';
    export {normalizeSelection} from './selection'; export {filterSourceTemplates} from './sourceTemplatePolicy.mjs';
    export function mount(destinations) { createRoot(document.getElementById('app')).render(React.createElement(Panel, {destinations, dataset:{source:{destinationId:'dalat'},decks:[]}, automationState:{schedules:[],runs:[],outputPicker:'save-file-v1',browserAvailable:true}, onStateChange:()=>{}})); }`, resolveDir: path.join(front, 'lib') }, bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'TestUi', loader: { '.js': 'jsx' }, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bundle.outputFiles[0].text); }
    if (req.url.startsWith('/api/photo-presets')) return res.end(JSON.stringify({ presets: [{ id: null, label: 'Ảnh gốc' }, { id: 'iphone-color-edit-v1', label: 'Color Edit' }] }));
    if (req.url.startsWith('/api/hook-sources')) return res.end(JSON.stringify({ destinationId: new URL(req.url, 'http://localhost').searchParams.get('destinationId'), sources: [] }));
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><div id="app"></div><script src="/bundle.js"></script><script>TestUi.mount(' + JSON.stringify(destinations) + ')</script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const executablePath = [`${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`, `${process.env['PROGRAMFILES(X86)']}/Microsoft/Edge/Application/msedge.exe`].find(p => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    const page = await browser.newPage(), url = 'http://127.0.0.1:' + server.address().port;
    page.on('pageerror', error => console.error('UI ERROR:', error.message));
    page.on('console', message => { if (message.type() === 'error') console.error('UI CONSOLE:', message.text()); });
    await page.goto(url); await page.locator('.automation-template-grid').waitFor();
    for (const source of destinations) {
      await page.locator('.automation-form select').first().selectOption(source.id);
      await page.waitForFunction(() => document.querySelectorAll('.automation-template-grid input[type=checkbox]').length > 0);
      const titles = await page.locator('.automation-template-grid label > span').allTextContents();
      if (source.id === 'dalat-threads') assert.equal(titles.length, 12);
      else assert.ok(!titles.some(title => /Threads|Note|Tổng hợp địa điểm|Top list/.test(title)), source.id);
      await page.locator('.automation-template-grid input[type=checkbox]').first().check();
      await page.locator('.automation-form select').first().selectOption(source.id === 'dalat-threads' ? 'dalat' : 'dalat-threads');
      assert.equal(await page.locator('.automation-template-grid input[type=checkbox]:checked').count(), 0);
    }
    await page.locator('.automation-form select').first().selectOption('dalat-threads');
    await page.locator('.automation-template-grid input[type=checkbox]').first().check();
    await page.reload(); await page.locator('.automation-template-grid').waitFor();
    assert.equal(await page.locator('.automation-form select').first().inputValue(), 'dalat-threads');
    assert.equal(await page.locator('.automation-template-grid input[type=checkbox]:checked').count(), 1);
    const selected = await page.evaluate(destinations => {
      const catalog = [{id:'threads-food-local',lists:[{id:'food-main',pages:[]}]},{id:'spotlight-v6',lists:[{id:'spotlight-main',pages:[]}]}];
      const decks = TestUi.filterSourceTemplates(catalog, destinations.find(s=>s.id==='dalat-threads'));
      return TestUi.normalizeSelection({decks}, {activeDeckId:'spotlight-v6',activeListId:'old-list',selectedPageIndex:5});
    }, destinations);
    assert.ok(!JSON.stringify(selected).includes('spotlight-v6'));
    console.log('PASS browser UI: five source catalogs, exact 12 Threads/Note, no forbidden templates elsewhere, source change clears selection, reload keeps valid source/draft, stale main selection removed.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
