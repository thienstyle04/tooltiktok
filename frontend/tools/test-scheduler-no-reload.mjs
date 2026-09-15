// Full studio with mocked APIs: no real schedules, lists or image cache mutations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(import.meta.dirname, '..');
const bundle = await require('esbuild').build({
  stdin: { contents: "import React from 'react'; import {createRoot} from 'react-dom/client'; import Studio from './components/DeckStudio'; createRoot(document.getElementById('root')).render(<Studio initialDataset={{source:{destinationId:'dalat',destinationLabel:'Đà Lạt',totalItems:1},decks:[]}}/>);", resolveDir: root, loader: 'jsx' },
  bundle: true, write: false, platform: 'browser', loader: { '.js': 'jsx' }, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
});
const executablePath = [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  const page = await browser.newPage();
  let documents = 0, guideRequests = 0;
  const state = { schedules: [], runs: [], locked: false, outputPicker: 'save-file-v1', browserAvailable: true, browserName: 'Chrome' };
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.isNavigationRequest()) { documents++; return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }); }
    if (url.pathname.includes('guide-data')) { guideRequests++; return route.fulfill({ json: { source: {}, decks: [] } }); }
    let body = {};
    if (url.pathname === '/api/automation/schedules') {
      state.schedules.push({ ...request.postDataJSON(), id: 'test-' + state.schedules.length }); body = state;
    } else if (url.pathname === '/api/automation') body = state;
    else if (url.pathname.endsWith('choose-output-directory')) body = { directory: 'C:\\test', fileName: 'test.zip', path: 'C:\\test\\test.zip' };
    else if (url.pathname === '/api/health') body = { status: 'ok', sessionId: 'unchanged-test-session' };
    else if (url.pathname === '/api/destinations') body = { active: { id: 'dalat' }, destinations: [{ id: 'dalat', label: 'Đà Lạt' }] };
    else if (url.pathname === '/api/partners') body = [];
    else if (url.pathname === '/api/drive-cache/status') body = { ready: true };
    return route.fulfill({ json: body });
  });
  await page.goto('http://localhost:3001');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByRole('button', { name: 'Hẹn giờ', exact: true }).click();
  await page.waitForTimeout(1000);
  const initialGuideRequests = guideRequests;
  await page.locator('.automation-output button').click();
  await page.waitForFunction(() => document.querySelector('.automation-output output')?.textContent.includes('test.zip'));
  for (let i = 0; i < 2; i++) {
    await page.locator('input[placeholder^="Ví dụ"]').fill('Test ' + i);
    await page.locator('.automation-template-grid label').filter({ hasText: 'Tổng hợp địa điểm' }).locator('input[type=checkbox]').check();
    await page.locator('button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('.automation-form-actions span')?.textContent.includes('Đã tạo lịch'));
    await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
  }
  // Exceed the old five-second focus throttle and include multiple health polls.
  await page.waitForTimeout(6000);
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(500);
  assert.equal(state.schedules.length, 2);
  assert.equal(documents, 1, 'Unexpected document reload');
  assert.equal(guideRequests, initialGuideRequests, 'Unexpected dataset fetch after startup');
  assert.equal(await page.locator('.automation-panel').count(), 1);
  console.log('PASS: two schedules + picker + focus/visibility; 0 reloads, 0 additional guide-data requests, same backend session.');
} finally { await browser.close(); }
