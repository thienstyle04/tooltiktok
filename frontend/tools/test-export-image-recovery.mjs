import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const root = path.resolve(import.meta.dirname, '..');
const bundle = await esbuild.build({ stdin: { contents: fs.readFileSync(path.join(root, 'lib/exportClient.js'), 'utf8') + '\nexport {inlineImagesAsBlobs};', resolveDir: path.join(root, 'lib') }, bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'Probe' });
const executablePath = [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  const maker = await browser.newPage();
  const png = Buffer.from(await maker.evaluate(() => { const c = document.createElement('canvas'); c.width = 30; c.height = 40; c.getContext('2d').fillRect(0, 0, 30, 40); return c.toDataURL().split(',')[1]; }), 'base64');
  await maker.close();
  for (const mode of ['normal', 'fetch-failure', 'placeholder', 'all-fail']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    let retries = 0;
    await page.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<article class="story-page" data-export-strict="true" data-page-index="3"><img src="/assets/drive-file?id=recovery-test"></article>' });
      if (request.resourceType() === 'fetch' && mode !== 'normal') return route.abort('failed');
      if (request.resourceType() === 'xhr') {
        retries++;
        if (mode === 'all-fail') return route.abort('failed');
        if (mode === 'placeholder') return route.fulfill({ contentType: 'image/svg+xml', headers: { 'x-drive-image-fallback': '1' }, body: '<svg xmlns="http://www.w3.org/2000/svg"/>' });
      }
      return route.fulfill({ contentType: 'image/png', body: png });
    });
    await page.goto('http://localhost:3001/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const result = await page.evaluate(async () => { try { await Probe.inlineImagesAsBlobs(document.querySelector('article')); return 'OK'; } catch (e) { return e.message; } });
    if (mode === 'normal' || mode === 'fetch-failure') assert.equal(result, 'OK');
    else { assert.match(result, /trang 4/); assert.match(result, /recovery-test/); assert.match(result, mode === 'placeholder' ? /placeholder/ : /XHR/); }
    assert.equal(retries, mode === 'normal' ? 0 : 1);
    console.log('PASS', mode, result);
    await context.close();
  }
} finally { await browser.close(); }
