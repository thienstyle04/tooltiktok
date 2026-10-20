// Máy mới (bản bàn giao không kèm link Sheet): DeckStudio thật + API giả lập.
// Không có nguồn → hiện màn "Thêm nguồn dữ liệu đầu tiên", không đọc dữ liệu cũ; thêm
// link Sheet (Threads, nội dung Đà Lạt) → tải dữ liệu lần đầu → tự chuyển sang nguồn mới.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const esbuild = require('esbuild'), { chromium } = require('playwright');
const root = path.resolve(import.meta.dirname, '..');
const executablePath = [process.env.TEST_BROWSER_PATH, process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(fs.existsSync);
const bundle = (await esbuild.build({ stdin: { contents: "import React from 'react';import {createRoot} from 'react-dom/client';import Studio from './components/DeckStudio';createRoot(document.getElementById('root')).render(<Studio/>);", resolveDir: root, loader: 'jsx' },
  bundle: true, write: false, format: 'iife', platform: 'browser', loader: { '.js': 'jsx' }, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } })).outputFiles[0].text;
const deck = { id: 'threads-food-local', navTitle: 'Quán ăn Threads Local', title: 'Quán ăn Threads Local', lists: [{ id: 'threads-food-local-main', navTitle: 'List chính', title: 'Quán ăn', pages: [{ type: 'cover', title: 'Quán ăn' }] }] };
const created = { id: 'sheet-sg', label: 'Sài Gòn Threads', shortLabel: 'SGT', kind: 'threads', contentDestinationId: 'dalat', sheetUrl: 'https://docs.google.com/spreadsheets/d/fixture-saigon-sheet/edit', hasSheetFallback: true, hasLocalWorkbook: false, allowedDeckIds: ['threads-food-local'] };
const dataset = { generatedAt: new Date().toISOString(), source: { destinationId: 'sheet-sg', destinationLabel: 'Sài Gòn Threads', totalItems: 42, allowedDeckIds: ['threads-food-local'] }, decks: [deck] };
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  const page = await browser.newPage();
  page.on('pageerror', error => console.log('[pageerror]', String(error.stack).slice(0, 800)));
  let state = 'empty', syncPolls = 0, addBody = null;
  const calls = { guideData: 0, sync: 0, switch: 0 };
  // Trình duyệt còn dữ liệu Đà Lạt cũ (cùng máy/cùng cổng): không được hiện khi máy chưa có nguồn.
  await page.addInitScript(() => { try { localStorage.setItem('dalat-carousel-dataset-cache-v82', JSON.stringify({ savedAt: Date.now(), dataset: { source: { destinationId: 'dalat', destinationLabel: 'Đà Lạt cũ', totalItems: 9, allowedDeckIds: ['grid-6'] }, decks: [] } })); } catch { /* ignore */ } });
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
    if (url.pathname === '/api/guide-data') {
      calls.guideData++;
      if (state !== 'active') return route.fulfill({ status: 503, json: { code: 'NO_SOURCE', message: 'Máy này chưa có nguồn dữ liệu.' } });
      return route.fulfill({ json: dataset });
    }
    let body = {};
    if (url.pathname === '/api/destinations' && request.method() === 'POST') {
      addBody = request.postDataJSON(); state = 'added';
      return route.fulfill({ status: 201, json: { active: null, created, needsFirstSync: true, destinations: [created] } });
    }
    if (url.pathname === '/api/destinations') {
      body = state === 'active'
        ? { active: { ...created, hasLocalWorkbook: true, totalItems: 42 }, destinations: [{ ...created, hasLocalWorkbook: true, totalItems: 42 }] }
        : { active: null, destinations: state === 'added' ? [created] : [] };
    } else if (url.pathname === '/api/destinations/sheet-sg/refresh-from-sheet') {
      calls.sync++; body = { accepted: true, destinationId: 'sheet-sg' };
    } else if (url.pathname === '/api/night-sync/status') {
      const running = calls.sync > 0 && syncPolls++ < 2;
      body = { running: running ? 'sheet-sg' : null, queued: [], allowed: false,
        sources: calls.sync ? [{ id: 'sheet-sg', label: 'Sài Gòn Threads', phase: running ? 'running' : 'complete', progress: { stage: 'Đang tải ảnh', total: 10, completed: 5 }, result: running ? undefined : { downloaded: 10, failed: 0, added: 42, changed: 0 } }] : [] };
    } else if (url.pathname === '/api/destination' && request.method() === 'POST') {
      calls.switch++; state = 'active';
      body = { active: { ...created, hasLocalWorkbook: true, totalItems: 42 }, dataset };
    } else if (url.pathname === '/api/drive-cache/status') {
      body = state === 'active'
        ? { ready: true, phase: 'ready', destinationId: 'sheet-sg', total: 10, completed: 10, percent: 100, message: 'Đã tải xong ảnh.' }
        : { ready: true, phase: 'ready', destinationId: '', total: 0, completed: 0, percent: 100, message: 'Máy này chưa có nguồn dữ liệu.' };
    } else if (url.pathname === '/api/partners') body = [];
    else if (url.pathname.startsWith('/api/ai/settings')) body = { active: 'deepseek', profiles: { deepseek: { model: 'deepseek-chat', keySource: 'none' }, gemini: { model: 'gemini', keySource: 'none' } } };
    else if (url.pathname === '/api/health') body = { status: 'ok', sessionId: 'first-source-session' };
    else if (url.pathname === '/api/automation') body = { schedules: [], runs: [], locked: false };
    return route.fulfill({ json: body });
  });
  await page.goto('http://localhost:3001');
  await page.addScriptTag({ content: bundle });

  const dialog = page.getByRole('dialog', { name: 'Thêm nguồn dữ liệu đầu tiên' });
  await dialog.waitFor();
  await page.waitForTimeout(1500);
  assert.equal(calls.guideData, 0, 'Máy chưa có nguồn: không đọc dữ liệu');
  assert.ok(!(await page.locator('body').innerText()).includes('Đà Lạt cũ'), 'Không hiện dữ liệu cũ lưu trong trình duyệt');
  assert.equal(await page.evaluate(() => localStorage.getItem('dalat-carousel-dataset-cache-v82')), null, 'Xóa dữ liệu cũ của trình duyệt');
  const form = dialog.locator('.settings-source-form');
  await form.locator('input[placeholder="Ví dụ: Nha Trang"]').fill('Sài Gòn Threads');
  await form.locator('input[type=url]').fill(created.sheetUrl);
  await form.getByRole('radio', { name: /^Threads/ }).check();
  const submit = form.getByRole('button', { name: 'Thêm và tải dữ liệu' });
  assert.equal(await submit.isDisabled(), true, 'Phải chọn nội dung có phải Đà Lạt không');
  await form.getByRole('radio', { name: /^Có/ }).check();
  await submit.click();

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && calls.switch < 1) await page.waitForTimeout(250);
  assert.deepEqual(addBody, { label: 'Sài Gòn Threads', sheetUrl: created.sheetUrl, kind: 'threads', dalatContent: true });
  assert.equal(calls.sync, 1, 'Tải dữ liệu lần đầu ngay sau khi thêm');
  assert.equal(calls.switch, 1, 'Tự chuyển sang nguồn mới khi tải xong');
  await dialog.waitFor({ state: 'detached', timeout: 10000 });
  await page.getByText('Sài Gòn Threads').first().waitFor();
  console.log('PASS first-source setup UI: máy chưa có nguồn hiện màn thêm nguồn (không đọc dữ liệu cũ); thêm link Sheet Threads + Đà Lạt → tải lần đầu → tự chuyển nguồn.');
} finally { await browser.close(); }
