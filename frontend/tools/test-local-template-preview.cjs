// Real preview components and application CSS; no live data, jobs or mutations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const front = path.resolve(__dirname, '..');
const esbuild = createRequire(path.join(front, '../backend/package.json'))('esbuild');
const { chromium } = require('playwright');

async function main() {
  const fixtureFile = process.argv[2];
  const fixtureData = fixtureFile ? JSON.parse(fs.readFileSync(fixtureFile, 'utf8')) : null;
  const fixtureLists = fixtureFile ? (fixtureData.lists || [fixtureData]) : [{
    id: 'local-preview-fixture-list', title: 'Preview fixture', pages: [{
      type: 'list', title: 'Information', subtitle: 'Full-width content', items: [],
      localRender: { templateId: 'local-preview-fixture', version: 1, width: 1080, height: 1440, fonts: [], nodes: [
        { kind: 'shape', x: 0, y: 0, width: 1080, height: 1440, style: { background: '#203c32' } },
        { kind: 'shape', x: 108, y: 380, width: 864, height: 700, style: { background: '#fff' } },
        { kind: 'text', text: 'Right edge must remain visible', x: 160, y: 450, width: 760, height: 80, style: { fontSize: 36 } },
      ] },
    }],
  }];
  const source = `import React from 'react'; import {createRoot} from 'react-dom/client';
    import SlideCard from './components/SlideCard';
    import FittedStudioPreview from './components/FittedStudioPreview';
    import PreviewDashboardPanel from './components/PreviewDashboardPanel';
    import {checkLocalTemplateLayout} from './lib/localTemplates';
    const root=createRoot(document.getElementById('root'));
    window.mountPreview=(list,index,mode)=>root.render(<div className="studio-workflow" style={{display:'block',height:'auto'}}>
      {mode==='dashboard'?<PreviewDashboardPanel dataset={{decks:[{id:'local-preview-fixture',navTitle:'Local template',lists:[list]}]}} activeDeck={{id:'local-preview-fixture',lists:[list]}} activeList={list} activeDeckId="local-preview-fixture" activeListId={list.id} selectedPageIndex={index} onDeckSelect={()=>{}} onListSelect={()=>{}} onPageSelect={(_,i)=>window.mountPreview(list,i,'dashboard')}/>
      :mode==='editor'?<section className="studio-selected-preview"><header><h3>Preview</h3></header><FittedStudioPreview key={list.id+'-'+index}><SlideCard list={list} page={list.pages[index]} index={index} selected onSelect={()=>{}}/></FittedStudioPreview></section>
      :mode==='grid'?<section className="page-grid"><SlideCard list={list} page={list.pages[index]} index={index} selected onSelect={()=>{}}/></section>
      :<section className="template-compare-focus-stage"><SlideCard list={list} page={list.pages[index]} index={index} selected onSelect={()=>{}}/></section>}
    </div>);
    window.checkLocalTemplateLayout=checkLocalTemplateLayout;`;
  const bundle = await esbuild.build({ stdin: { contents: source, resolveDir: front, loader: 'jsx' }, bundle: true, write: false, format: 'iife', loader: { '.js': 'jsx' }, jsx: 'automatic' });
  const css = [...fs.readFileSync(path.join(front, 'app/globals.css'), 'utf8').matchAll(/@import url\("(.+?)"\)/g)]
    .map(m => fs.readFileSync(path.join(front, 'app', m[1]), 'utf8')).join('\n');
  const executablePath = [path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'), path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe')].find(fs.existsSync);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-local-preview-'));
  try {
    const page = await browser.newPage();
    // Use a copied test fixture only. Its registered resources are read-only.
    const pack = fixtureFile && (fixtureData.lists ? path.resolve(path.dirname(fixtureFile), '..') : path.dirname(fixtureFile));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<style>' + css + '</style><div id="root"></div>' });
      if (pack && url.pathname.startsWith('/api/local-templates/')) {
        const name = url.pathname.split('/').pop();
        const resource = path.join(pack, 'assets', name);
        if (/^[\w.-]+$/.test(name) && fs.existsSync(resource)) return route.fulfill({ body: fs.readFileSync(resource), contentType: name.endsWith('.woff2') ? 'font/woff2' : name.endsWith('.jpg') ? 'image/jpeg' : 'image/png' });
      }
      if (pack && url.pathname === '/assets/drive-file') {
        const id = url.searchParams.get('id');
        const resource = path.resolve(front, '../backend/data/drive-file-cache', (id || '') + '.bin');
        if (/^[\w-]+$/.test(id || '') && fs.existsSync(resource)) return route.fulfill({ body: fs.readFileSync(resource), contentType: 'image/jpeg' });
      }
      return route.fulfill({ status: 404, body: 'Isolated test: resource unavailable' });
    });
    await page.goto('http://local-preview.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    for (const width of [1920, 1280, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const mode of ['editor', 'grid', 'compare', ...(process.argv.includes('--dashboard') ? ['dashboard'] : [])]) {
        let count = 0;
        for (const list of fixtureLists) for (let index = 0; index < list.pages.length; index++) {
          await page.evaluate(({ list, index, mode }) => window.mountPreview(list, index, mode), { list, index, mode });
          await page.waitForFunction(({ id, index }) => {
            const node = document.querySelector('.local-template-page');
            return node?.dataset.listId === id && Number(node.dataset.pageIndex) === index;
          }, { id: list.id, index });
          await page.evaluate(() => document.fonts.ready);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const geometry = await page.evaluate(() => {
            const node = document.querySelector('.local-template-page');
            const article = node.getBoundingClientRect(), canvas = node.querySelector('.local-template-canvas').getBoundingClientRect();
            const viewport = document.querySelector('.studio-fit-viewport')?.getBoundingClientRect();
            return { width: node.clientWidth, height: node.clientHeight, visualRatio: article.width / article.height,
              rightCrop: canvas.right - article.right, leftCrop: article.left - canvas.left,
              bottomCrop: canvas.bottom - article.bottom, viewportOverflow: viewport ? Math.max(viewport.left - article.left, article.right - viewport.right) : 0 };
          });
          const label = `${width}/${mode}/${list.id}/${index}`;
          if (process.argv.includes('--capture-before') && width === 1920 && mode === 'editor' && index === 1) {
            await page.locator('.slide-card-frame').screenshot({ path: path.join(output, 'before.png') });
            console.log('BEFORE screenshot:', path.join(output, 'before.png'));
          }
          assert.equal(geometry.width, 810, label + ': design width changed');
          assert.equal(geometry.height, 1080, label + ': design height changed');
          assert.ok(Math.abs(geometry.visualRatio - 0.75) < 0.002, label + ': expected 3:4, got ' + JSON.stringify(geometry));
          for (const key of ['rightCrop', 'leftCrop', 'bottomCrop', 'viewportOverflow']) assert.ok(geometry[key] <= 2, label + ': ' + key + '=' + geometry[key]);
          await page.evaluate(() => window.checkLocalTemplateLayout(document.body, true));
          if (typeof list.pages[index].textFontSize === 'number') {
            const sizes = await page.locator('[data-local-text]').evaluateAll(nodes => nodes.map(node => Number.parseFloat(getComputedStyle(node).fontSize)));
            assert.ok(sizes.length && sizes.every(size => Math.abs(size - list.pages[index].textFontSize) < 0.01), label + ': saved absolute typography must reach every local text node');
          }
          if (mode === 'dashboard') {
            assert.equal(await page.locator('.studio-page-picker select').nth(1).inputValue(), list.id);
            assert.equal(await page.locator('.studio-page-picker-list button').count(), list.pages.length);
            assert.equal(await page.locator('.studio-selected-preview header h3').innerText(), `Trang ${index+1}/${list.pages.length}`);
            if (width === 1280 && index === 0) await page.locator('.studio-editor-preview').screenshot({ path: path.join(output, 'dashboard.png') });
          }
          if (width === 1280 && mode === 'editor' && count < 6) await page.locator('.slide-card-frame').screenshot({ path: path.join(output, `page-${count + 1}.png`) });
          count++;
        }
        console.log(`PASS ${width}/${mode}: ${count} pages, 3:4 canvas fully visible`);
      }
    }
    console.log('Screenshots:', output);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
