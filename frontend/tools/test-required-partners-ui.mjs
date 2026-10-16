// Đối tác bắt buộc trên giao diện: bộ chọn ở panel tạo list và panel hẹn giờ.
// API được giả lập hoàn toàn; không tạo list, lịch hoặc ghi dữ liệu thật.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const esbuild = require('esbuild'), { chromium } = require('playwright');
const root = path.resolve(import.meta.dirname, '..');
const executablePath = [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const build = async contents => (await esbuild.build({ stdin: { contents, resolveDir: root, loader: 'jsx' }, bundle: true, write: false, format: 'iife', platform: 'browser',
  loader: { '.js': 'jsx' }, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } })).outputFiles[0].text;
const partners = [
  { id: 'quan_an-1', name: 'Quán một', section: 'quan_an', address: 'Xuân Hương' },
  { id: 'cafe-9', name: 'Quán Một', section: 'cafe', address: 'Xuân Hương' },
  { id: 'cafe-1', name: 'Cafe hai', section: 'cafe', address: 'Cam Ly' },
  ...Array.from({ length: 12 }, (_, i) => ({ id: `extra-${i}`, name: `Đối tác ${String(i + 1).padStart(2, '0')}`, section: 'dich_vu', address: '' })),
];
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  // ── A. CaptionTools: chọn, tìm, gộp trùng tên, bỏ chọn, giới hạn, ẩn với mẫu riêng ──
  {
    const bundle = await build(`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import CaptionTools from './components/CaptionTools';
const decks=[{id:'grid-6',navTitle:'Lưới 6',lists:[{id:'grid-6-main',navTitle:'List chính',pages:[]}]},{id:'local-demo',navTitle:'Mẫu riêng',localTemplate:{version:1},lists:[]}];
function App(){const[deck,setDeck]=useState(decks[0]),[required,setRequired]=useState([]),[eligibility,setEligibility]=useState(undefined),[notice,setNotice]=useState('');window.required=required;window.setEligibility=setEligibility;window.setNotice=setNotice;window.opened=window.opened||0;
 return <CaptionTools dataset={{decks}} activeDeck={deck} activeList={deck.lists[0]} caption={{coverTitle:'',headline:'',body:'',hashtags:''}} setCaption={()=>{}} busy={false} cacheReady={true}
  photoPreset={null} onPhotoPresetChange={()=>{}} tone="gen_z" setTone={()=>{}} partners={${JSON.stringify(partners)}} requiredPartners={required} onRequiredPartnersChange={setRequired} partnerEligibility={eligibility} onPartnerPickerOpen={()=>{window.opened++;}} cacheNotice={notice}
  onDeckSelect={setDeck} onListSelect={()=>{}} onCreateList={()=>{}} onCreateBatchLists={()=>{}} onRequestCaption={()=>{}} onCopy={()=>{}} onGeneratedListSelect={()=>{}}/>;}
createRoot(document.getElementById('root')).render(<App/>);`);
    const page = await browser.newPage();
    await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: bundle });
    const trigger = page.locator('.required-partner-trigger');
    assert.match(await trigger.textContent(), /Tự động/);
    await trigger.click();
    const options = page.locator('.required-partner-list label');
    assert.equal(await options.count(), 14, 'Same venue in two Sheet groups is one option');
    assert.match(await options.filter({ hasText: 'Quán một' }).textContent(), /Ăn uống \/ Cà phê/);
    await page.locator('.required-partner-options input[type=search]').fill('cam ly');
    assert.equal(await options.count(), 1);
    await options.first().locator('input').check();
    assert.deepEqual(await page.evaluate(() => window.required), ['Cafe hai']);
    assert.match(await trigger.textContent(), /1 đối tác bắt buộc/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.required-partner-options').count(), 0, 'Escape closes the picker');
    assert.equal(await page.locator('.required-partner-chips li').count(), 1);
    await page.getByRole('button', { name: 'Bỏ Cafe hai' }).click();
    assert.deepEqual(await page.evaluate(() => window.required), []);
    await trigger.click();
    for (let i = 0; i < 14; i++) { const box = options.nth(i).locator('input'); if (await box.isEnabled()) await box.check(); }
    assert.equal((await page.evaluate(() => window.required)).length, 12, 'At most 12 required partners');
    assert.equal(await page.locator('.required-partner-list input:disabled').count(), 2);
    await page.getByRole('button', { name: 'Bỏ chọn tất cả' }).click();
    assert.deepEqual(await page.evaluate(() => window.required), []);
    // Eligibility from the template dry run: unavailable partners are grouped,
    // cannot be chosen, show the reason; a chosen one becomes a flagged chip.
    assert.ok(await page.evaluate(() => window.opened) >= 1, 'Opening the picker requests the template check');
    await trigger.click(); await trigger.click();
    await page.evaluate(() => window.setEligibility({ status: 'loading' }));
    await page.waitForFunction(() => /Đang kiểm tra/.test(document.querySelector('.required-partner-options')?.textContent || ''), null, { timeout: 5000 });
    assert.equal(await page.locator('.required-partner-list input:enabled').count(), 0, 'No choice while checking');
    await page.evaluate(() => window.setEligibility({ status: 'ready', data: { deckId: 'grid-6', partners: [{ name: 'Cafe hai', sections: ['cafe'], eligible: false, reason: 'Mẫu này không có ô nhóm Cà phê' }, { name: 'Quán một', sections: ['quan_an'], eligible: true }] } }));
    await page.waitForSelector('.required-partner-unavailable', { timeout: 5000 });
    const unavailable = page.locator('.required-partner-unavailable');
    assert.match(await unavailable.locator('summary').textContent(), /Không hiển thị được trong mẫu này \(1\)/);
    await unavailable.locator('summary').click();
    assert.match(await unavailable.textContent(), /Cafe hai.*Mẫu này không có ô nhóm Cà phê/);
    assert.ok(await unavailable.locator('input').isDisabled(), 'Unavailable partner cannot be chosen');
    assert.equal(await page.locator('.required-partner-list > label').count(), 13, 'Available partners stay on top');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.setEligibility(undefined));
    await trigger.click(); await options.filter({ hasText: 'Cafe hai' }).locator('input').check(); await page.keyboard.press('Escape');
    await page.evaluate(() => window.setEligibility({ status: 'ready', data: { deckId: 'grid-6', partners: [{ name: 'Cafe hai', sections: ['cafe'], eligible: false, reason: 'Mẫu này không có ô nhóm Cà phê' }] } }));
    assert.match(await page.locator('.required-partner-chips li.stale').textContent(), /Cafe hai · không hiển thị được trong mẫu này/);
    await page.getByRole('button', { name: 'Bỏ Cafe hai' }).click();
    // New machine without photos: the create panel says so (no false "ready").
    assert.equal(await page.locator('.list-create-warning').count(), 0);
    await page.evaluate(() => window.setNotice('Máy này chưa có ảnh (0/2517) của nguồn Đà Lạt Test.'));
    await page.waitForSelector('.list-create-warning[role=alert]');
    assert.match(await page.locator('.list-create-warning').textContent(), /chưa có ảnh \(0\/2517\)/);
    await page.evaluate(() => window.setNotice(''));
    await page.locator('#captionDeckSelect').selectOption('local-demo');
    assert.equal(await page.locator('.required-partner-picker').count(), 0, 'Private local templates never show the picker');
    await page.close();
  }
  // ── B. DeckStudio thật: payload tạo list/batch và lịch hẹn giờ mang requiredPartners ──
  {
    const bundle = await build(`import React from 'react';import {createRoot} from 'react-dom/client';import Studio from './components/DeckStudio';
createRoot(document.getElementById('root')).render(<Studio initialDataset={window.__dataset}/>);`);
    const page = await browser.newPage();
    const posted = [], schedules = [], eligibilityCalls = [];
    const state = { schedules: [], runs: [], locked: false, outputPicker: 'save-file-v1', browserAvailable: true, browserName: 'Chrome' };
    const dataset = { source: { destinationId: 'dalat', destinationLabel: 'Đà Lạt', totalItems: 1, allowedDeckIds: ['grid-6'] },
      decks: [{ id: 'grid-6', navTitle: 'Mẫu Lưới 6 Ô', title: 'Mẫu Lưới 6 Ô', lists: [{ id: 'grid-6-main', navTitle: 'List chính', title: 'Lưới', pages: [{ type: 'cover', title: 'Lưới' }] }] }] };
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
      if (url.pathname.includes('guide-data')) return route.fulfill({ json: dataset });
      let body = {};
      if (url.pathname === '/api/automation/manual-generation' && request.method() === 'POST') { posted.push(request.postDataJSON()); body = { id: 'job-1', status: 'failed', error: 'Mô phỏng: dừng sau khi kiểm tra payload.' }; }
      else if (url.pathname.startsWith('/api/automation/manual-generation/')) body = { id: 'job-1', status: 'failed', error: 'Mô phỏng: dừng sau khi kiểm tra payload.' };
      else if (url.pathname === '/api/automation/schedules') { const s = { ...request.postDataJSON(), id: 'test-' + state.schedules.length }; schedules.push(s); state.schedules.push(s); body = state; }
      else if (url.pathname === '/api/automation') body = state;
      else if (url.pathname.endsWith('choose-output-directory')) body = { directory: 'C:\\test', fileName: 'test.zip', path: 'C:\\test\\test.zip' };
      else if (url.pathname === '/api/health') body = { status: 'ok', sessionId: 'unchanged-test-session' };
      else if (url.pathname === '/api/destinations') body = { active: { id: 'dalat' }, destinations: [{ id: 'dalat', label: 'Đà Lạt', allowedDeckIds: ['grid-6', 'spotlight-v4'] }, { id: 'greenland', label: 'Green Land', allowedDeckIds: ['grid-6', 'spotlight-v4'] }] };
      else if (url.pathname === '/api/partners') body = [...partners.slice(0, 3), { id: 'dich_vu-1', name: 'Tiệm Gội An Yên', section: 'dich_vu', address: '' }];
      else if (url.pathname === '/api/partners/eligibility') { eligibilityCalls.push(url.searchParams.get('deckId')); body = { deckId: 'grid-6', partners: [{ name: 'Quán một', sections: ['quan_an', 'cafe'], eligible: true }, { name: 'Cafe hai', sections: ['cafe'], eligible: true }, { name: 'Tiệm Gội An Yên', sections: ['dich_vu'], eligible: false, reason: 'Mẫu này không có ô nhóm Dịch vụ' }] }; }
      else if (url.pathname === '/api/drive-cache/status') body = { ready: true, total: 1, cached: 1, destinationId: 'dalat' };
      else if (url.pathname === '/api/runtime-performance') body = { mode: 'normal' };
      return route.fulfill({ json: body });
    });
    await page.goto('http://localhost:3001');
    await page.evaluate(value => { window.__dataset = value; }, dataset);
    await page.addScriptTag({ content: bundle });
    page.on('dialog', dialog => dialog.accept());
    if (process.env.DEBUG_UI) { page.on('console', m => console.log('[console]', m.text().slice(0, 300))); await page.waitForTimeout(4000); console.log((await page.locator('body').innerText()).slice(0, 1500)); }
    // Create panel: choose a partner, create 1 list and a batch; both requests carry it.
    await page.getByRole('button', { name: 'Tạo list', exact: true }).first().click();
    await page.locator('.list-create-required .required-partner-trigger').click();
    await page.locator('.required-partner-list label').filter({ hasText: 'Cafe hai' }).locator('input').check();
    await page.keyboard.press('Escape');
    await page.locator('#nonAiBatchCountSelect').selectOption('3');
    await page.locator('#createDeckFromCaptionBtn').click();
    await page.waitForFunction(() => !document.querySelector('#createDeckFromCaptionBtn')?.disabled);
    assert.equal(posted.length, 1);
    assert.equal(posted[0].kind, 'batch');
    assert.deepEqual(posted[0].request.requiredPartners, ['Cafe hai']);
    assert.deepEqual(eligibilityCalls, ['grid-6'], 'Template check loaded once when the picker opens');
    await page.locator('.list-create-required .required-partner-trigger').click();
    assert.ok(await page.locator('.required-partner-unavailable input').filter({ hasNot: page.locator('xx') }).first().isDisabled());
    await page.keyboard.press('Escape');
    assert.deepEqual(eligibilityCalls, ['grid-6'], 'Cached: reopening does not recheck');
    // Persisted per source + template, restored after reload.
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('dalat-required-partners-v1'))), { 'dalat:grid-6': ['Cafe hai'] });
    // Scheduler: per-template partner row; saved schedule template carries the names.
    await page.getByRole('button', { name: 'Hẹn giờ', exact: true }).click();
    await page.locator('.automation-output button').click();
    await page.waitForFunction(() => document.querySelector('.automation-output output')?.textContent.includes('test.zip'));
    // Open source: only templates its loaded catalog can build (no Spotlight V4 here).
    assert.equal(await page.locator('.automation-template-grid label').filter({ hasText: 'Spotlight V4' }).count(), 0, 'Scheduler hides templates the open source cannot build');
    await page.locator('input[placeholder^="Ví dụ"]').fill('Lịch có đối tác');
    await page.locator('.automation-template-grid label').filter({ hasText: 'Mẫu Lưới 6 Ô' }).locator('input[type=checkbox]').check();
    const row = page.locator('.automation-required-row').filter({ hasText: 'Mẫu Lưới 6 Ô' });
    await row.locator('.required-partner-trigger').click();
    await row.locator('.required-partner-list label').filter({ hasText: 'Quán một' }).locator('input').check();
    await page.keyboard.press('Escape');
    await page.locator('button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('.automation-form-actions span')?.textContent.includes('Đã tạo lịch'));
    assert.equal(schedules.length, 1);
    assert.deepEqual(schedules[0].templates, [{ deckId: 'grid-6', count: 3, requiredPartners: ['Quán một'] }]);
    // A schedule for another source cannot offer this source's partners.
    await page.locator('.automation-form select').first().selectOption('greenland');
    assert.equal(await page.locator('.automation-template-grid label').filter({ hasText: 'Spotlight V4' }).count(), 1, 'Other sources keep the full allowed list');
    await page.locator('.automation-template-grid label').filter({ hasText: 'Mẫu Lưới 6 Ô' }).locator('input[type=checkbox]').check();
    const other = page.locator('.automation-required-row').filter({ hasText: 'Mẫu Lưới 6 Ô' });
    await other.locator('.required-partner-trigger').click();
    assert.equal(await other.locator('.required-partner-list label').count(), 0);
    assert.match(await other.locator('.required-partner-note').textContent(), /nguồn khác/);
    await page.close();
  }
  console.log('PASS required partners UI: create panel picker (search, dedupe, chips, limit 12, Escape, hidden for private templates), create/batch payload, saved per source+template, scheduler per-template partners, other-source guard.');
} finally { await browser.close(); }
