// Thêm nguồn XLSX trên giao diện thật (DeckStudio + API giả lập): sau khi backend
// đọc xong ảnh Drive của workbook vừa nhập, giao diện tự nạp lại dữ liệu và đối tác
// đúng một lần; ô chọn file chỉ nhận .xlsx. Không ghi dữ liệu thật.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const esbuild = require('esbuild'), { chromium } = require('playwright');
const root = path.resolve(import.meta.dirname, '..');
const executablePath = [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const bundle = (await esbuild.build({ stdin: { contents: "import React from 'react';import {createRoot} from 'react-dom/client';import Studio from './components/DeckStudio';createRoot(document.getElementById('root')).render(<Studio initialDataset={window.__dataset}/>);", resolveDir: root, loader: 'jsx' },
  bundle: true, write: false, format: 'iife', platform: 'browser', loader: { '.js': 'jsx' }, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } })).outputFiles[0].text;
const deck = { id: 'grid-6', navTitle: 'Mẫu Lưới 6 Ô', title: 'Mẫu Lưới 6 Ô', lists: [{ id: 'grid-6-main', navTitle: 'List chính', title: 'Lưới', pages: [{ type: 'cover', title: 'Lưới' }] }] };
const datasetFor = (id, label, partners) => ({ source: { destinationId: id, destinationLabel: label, totalItems: 271, allowedDeckIds: ['grid-6'] }, decks: [deck], partnersHint: partners });
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  const page = await browser.newPage();
  let active = 'dalat', photosPolls = -1;
  const counts = { guideAfterAdd: 0, partnersAfterAdd: 0 };
  let added = false, addBody = '', serverBody = null;
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
    if (url.pathname.includes('guide-data')) { if (added) counts.guideAfterAdd++; return route.fulfill({ json: datasetFor(active, active === 'dalat' ? 'Đà Lạt' : 'Nha Trang thử') }); }
    let body = {};
    if (url.pathname === '/api/destinations/xlsx' && request.method() === 'POST') {
      active = 'xlsx-nt'; added = true; photosPolls = 0; addBody = request.postData() || '';
      body = { active: { id: 'xlsx-nt', label: 'Nha Trang thử', totalItems: 271 }, dataset: datasetFor('xlsx-nt', 'Nha Trang thử'), destinations: [{ id: 'dalat', label: 'Đà Lạt', allowedDeckIds: ['grid-6'] }, { id: 'xlsx-nt', label: 'Nha Trang thử', allowedDeckIds: ['grid-6'] }] };
      return route.fulfill({ status: 201, json: body });
    }
    if (url.pathname === '/api/destinations' && request.method() === 'POST') {
      serverBody = request.postDataJSON();
      return route.fulfill({ status: 400, json: { message: 'Không tải được dữ liệu từ server (Đà Lạt server). HTTP 404. Hãy kiểm tra link server mở được từ máy này (trả về JSON /api/guide-data).' } });
    }
    if (url.pathname === '/api/drive-cache/status') {
      // After the add: two "reading photos" polls, then ready for the new source.
      if (photosPolls >= 0 && photosPolls < 2) { photosPolls++; body = { ready: false, phase: 'warming', destinationId: 'xlsx-nt', total: 565, completed: 100 * photosPolls, percent: 20, message: 'Đang tải dữ liệu ảnh từ workbook...' }; }
      else body = { ready: true, phase: 'ready', destinationId: active, total: 565, completed: 565, percent: 100, message: 'Đã tải xong ảnh Drive vào cache.' };
      return route.fulfill({ json: body });
    }
    if (url.pathname === '/api/partners') { if (added) counts.partnersAfterAdd++; body = active === 'xlsx-nt' && photosPolls >= 2 ? [{ id: 'quan_an-1', name: 'Quán Nha Trang', section: 'quan_an', address: '' }] : []; }
    else if (url.pathname === '/api/destinations') body = { active: { id: active, label: active === 'dalat' ? 'Đà Lạt' : 'Nha Trang thử' }, destinations: [{ id: 'dalat', label: 'Đà Lạt', allowedDeckIds: ['grid-6'] }, ...(added ? [{ id: 'xlsx-nt', label: 'Nha Trang thử', allowedDeckIds: ['grid-6'] }] : [])] };
    else if (url.pathname.startsWith('/api/ai/settings')) body = { active: 'deepseek', profiles: { deepseek: { model: 'deepseek-chat', keySource: 'none' }, gemini: { model: 'gemini', keySource: 'none' } } };
    else if (url.pathname === '/api/health') body = { status: 'ok', sessionId: 'unchanged-test-session' };
    else if (url.pathname === '/api/automation') body = { schedules: [], runs: [], locked: false };
    return route.fulfill({ json: body });
  });
  if (process.env.DEBUG_UI) { page.on('console', m => console.log('[console]', m.type(), m.text().slice(0, 300))); page.on('pageerror', e => console.log('[pageerror]', String(e.stack).slice(0, 1200))); }
  await page.goto('http://localhost:3001');
  await page.evaluate(value => { window.__dataset = value; }, datasetFor('dalat', 'Đà Lạt'));
  await page.addScriptTag({ content: bundle });
  await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
  if (process.env.DEBUG_UI) { await page.waitForTimeout(2000); console.log((await page.locator('body').innerText()).slice(0, 1500)); }
  const form = page.locator('.settings-source-form');
  await form.waitFor();
  // Mặc định thêm bằng link Sheet; chọn File XLSX để hiện ô chọn file.
  assert.equal(await form.locator('input[type=file]').count(), 0);
  await form.getByRole('radio', { name: 'File XLSX' }).check();
  assert.equal(await form.locator('input[type=file]').getAttribute('accept'), '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'File picker only offers .xlsx (backend rejects .xls)');
  await form.locator('input[placeholder="Ví dụ: Nha Trang"]').fill('Nha Trang thử');
  await form.locator('input[type=file]').setInputFiles({ name: 'nha-trang.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('PK test') });
  assert.equal(await form.getByRole('button', { name: 'Thêm và sử dụng' }).isDisabled(), true, 'phải trả lời nội dung có phải Đà Lạt không');
  await form.getByRole('radio', { name: /^Không/ }).check();
  await form.getByRole('button', { name: 'Thêm và sử dụng' }).click();
  // Photos become ready after a few polls: catalog and partners reload once.
  await page.waitForFunction(() => true);
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline && (counts.guideAfterAdd < 1 || counts.partnersAfterAdd < 2)) await page.waitForTimeout(250);
  assert.match(addBody, /name="kind"\r?\n\r?\nstandard/, 'gửi loại nguồn');
  assert.match(addBody, /name="dalatContent"\r?\n\r?\nfalse/, 'gửi lựa chọn nội dung Đà Lạt');
  assert.ok(counts.guideAfterAdd >= 1, `catalog reloaded after photos were ready (${counts.guideAfterAdd})`);
  assert.ok(counts.partnersAfterAdd >= 2, `partners reloaded after photos were ready (${counts.partnersAfterAdd})`);
  // Link server: nhãn/gợi ý riêng, gửi sourceType=server; lỗi server hiện ngay trên form.
  await form.getByRole('radio', { name: 'Link server' }).check();
  assert.equal(await form.locator('input[type=file]').count(), 0);
  const link = form.locator('input[type=url]');
  assert.equal(await link.getAttribute('placeholder'), 'https://.../api/guide-data');
  assert.match(await form.locator('label:has(input[type=url])').innerText(), /Link dữ liệu server/);
  await form.locator('input[placeholder="Ví dụ: Nha Trang"]').fill('Đà Lạt server');
  await link.fill('https://113.161.254.76/api/guide-data');
  await form.getByRole('radio', { name: /^Có/ }).check();
  await form.getByRole('button', { name: 'Thêm và sử dụng' }).click();
  await page.locator('.settings-form-error').waitFor();
  assert.deepEqual(serverBody, { label: 'Đà Lạt server', sheetUrl: 'https://113.161.254.76/api/guide-data', kind: 'standard', dalatContent: true, sourceType: 'server' });
  assert.match(await page.locator('.settings-form-error').innerText(), /link server/);
  const settled = { ...counts };
  await page.waitForTimeout(6000);
  assert.deepEqual(counts, settled, 'Reload happens once, not on every later "ready" poll');
  console.log(`PASS add XLSX/server source UI: server link sends sourceType=server and shows the error; .xlsx-only picker; after photos ready the catalog (${counts.guideAfterAdd}×) and partners reloaded once; no repeated reloads.`);
} finally { await browser.close(); }
