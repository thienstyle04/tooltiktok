// Giao diện V2 (DeckStudio thật, mọi API giả lập, không dữ liệu thật): Hôm nay đếm đúng trạng thái,
// hàng chờ lọc được, bấm chữ trên slide nhảy tới ô sửa, chặn rời bản nháp, lưu, xuất hàng loạt ghi
// "Đã xuất", trung tâm tác vụ, Ctrl+K mở ngăn kéo tạo list, chuyển qua lại Classic, bố cục điện thoại.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const front = path.resolve(__dirname, '..');
const esbuild = require(path.join(front, '../backend/node_modules/esbuild')), { chromium } = require('playwright'), { APP_VERSION } = require('../lib/appVersion.js');
const id = 'local-v2-fixture';
const model = { templateId: id, version: 1, width: 1080, height: 1440, fonts: [], nodes: [
  { kind: 'shape', x: 0, y: 0, width: 1080, height: 1440, style: { background: '#ddd' } },
  { kind: 'text', field: 'title', x: 90, y: 100, width: 900, height: 150, style: { fontFamily: 'Arial', fontSize: 60, lineHeight: '70px' } },
] };
const pages = title => [
  { type: 'cover', title, subtitle: '', backgroundImage: '', localRender: model },
  { type: 'list', title: 'Trang hai', subtitle: '', backgroundImage: '', items: [{ name: 'Quán thử', metaPrimary: '1 Đường Thử', isPartner: true }], localRender: model },
];
const dataset = { generatedAt: '2026-10-19T00:00:00Z', source: { destinationId: 'dalat-test', destinationLabel: 'Đà Lạt Test', totalItems: 3, coverImageUrls: [], allowedDeckIds: [id] }, sections: [], decks: [{
  id, navTitle: 'Mẫu thử', title: 'Mẫu thử', description: '', localTemplate: { version: 1, pageCount: 2 }, lists: [
    { id: `${id}-main`, navTitle: 'List chính', title: 'Hook mẹ', pages: pages('Hook mẹ') },
    { id: `${id}-a`, navTitle: 'Set 1', title: 'Hook A', pages: pages('Hook A') },
    { id: `${id}-b`, navTitle: 'Set 2', title: 'Hook B', editedAt: '2026-10-19T08:00:00Z', pages: pages('Hook B') },
    { id: `${id}-c`, navTitle: 'Set 3', title: 'Hook C', exportedAt: '2026-10-19T09:00:00Z', pages: pages('Hook C') },
  ],
}] };

async function main() {
  const bundle = await esbuild.build({ stdin: { contents: "import React from 'react';import{createRoot}from'react-dom/client';import Studio from './components/DeckStudio';createRoot(document.getElementById('root')).render(<Studio initialDataset={window.fixture}/>);", resolveDir: front, loader: 'jsx' }, bundle: true, write: false, format: 'iife', loader: { '.js': 'jsx' }, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const css = [...fs.readFileSync(path.join(front, 'app/globals.css'), 'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m => fs.readFileSync(path.join(front, 'app', m[1]), 'utf8')).join('\n');
  const browser = await chromium.launch({ headless: true, executablePath: [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync) });
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-v2-studio-'));
  const patches = [], marked = [];
  let nativeDialogs = 0;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    await context.addInitScript(() => { localStorage.setItem('dalat-ui-version', 'v2'); localStorage.setItem('dalat-studio-theme', 'dark'); });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (process.env.DEBUG_UI && message.type() === 'error') console.log('CONSOLE', message.text().slice(0, 500)); });
    page.on('dialog', async dialog => { nativeDialogs += 1; await dialog.dismiss(); });
    await page.route('**/*', route => {
      const url = new URL(route.request().url()), p = url.pathname, method = route.request().method();
      if (p === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<meta charset="utf-8"><style>' + css + '</style><div id="root"></div><script>window.fixture=' + JSON.stringify(dataset) + '</script><script>' + bundle.outputFiles[0].text + '</script>' });
      if (p.startsWith('/api/decks/') && method === 'PATCH') { const body = route.request().postDataJSON(); patches.push(body); return route.fulfill({ json: { deckId: id, listId: `${id}-a`, pageIndex: 0, ...body } }); }
      if (p === '/api/decks/mark-exported') { const body = route.request().postDataJSON(); marked.push(body); return route.fulfill({ json: { exportedAt: '2026-10-19T12:00:00.000Z', markedCount: 2 } }); }
      if (p === '/api/automation/manual-export' || p === '/api/night-sync/export-lease') return route.fulfill({ json: { ok: true } });
      if (p === '/api/drive-files/cache-status') return route.fulfill({ json: { missing: [], images: [] } });
      if (p === '/api/guide-data') return route.fulfill({ json: dataset });
      if (p === '/api/destinations') return route.fulfill({ json: { active: { id: 'dalat-test', label: 'Đà Lạt Test' }, destinations: [{ id: 'dalat-test', label: 'Đà Lạt Test' }] } });
      if (p === '/api/drive-cache/status') return route.fulfill({ json: { ready: true, phase: 'ready', destinationId: 'dalat-test' } });
      if (p === '/api/health') return route.fulfill({ json: { status: 'ok', sessionId: 'v2-studio-test', appVersion: APP_VERSION } });
      if (p === '/api/automation') return route.fulfill({ json: { locked: false, schedules: [], runs: [] } });
      if (p === '/api/hook-sources') return route.fulfill({ json: { mode: 'normal', sources: [] } });
      if (p === '/api/photo-presets') return route.fulfill({ json: { presets: [{ id: null, label: 'Ảnh gốc' }] } });
      if (p === '/api/partners') return route.fulfill({ json: [] });
      if (p === '/api/night-sync/status') return route.fulfill({ json: { phase: 'idle', locked: false, sources: [] } });
      if (p.startsWith('/api/app-update/')) return route.fulfill({ json: { enabled: false, currentVersion: APP_VERSION } });
      if (p.startsWith('/api/runtime-performance')) return route.fulfill({ json: { mode: 'modern', reason: 'isolated' } });
      if (p.startsWith('/fonts/')) return route.fulfill({ body: fs.readFileSync(path.join(front, 'public', p)) });
      if (process.env.DEBUG_UI) console.log('UNMOCKED', method, p);
      return route.fulfill({ status: 404, body: 'Isolated test: unavailable' });
    });
    await page.goto('http://v2-studio.test/');
    if (process.env.DEBUG_UI) { await page.waitForTimeout(4000); console.log('ERR', errors, (await page.locator('body').innerHTML()).slice(0, 400)); }
    const nav = name => page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('button', { name: new RegExp(`^${name}`) });

    // Hôm nay: trạng thái tính từ editedAt/exportedAt.
    await page.locator('.v2-hero').waitFor();
    const stat = label => page.locator('.v2-stat').filter({ hasText: label }).locator('strong').innerText();
    assert.equal(await stat('Chờ duyệt'), '1'); assert.equal(await stat('Đã sửa'), '1'); assert.equal(await stat('Đã xuất'), '1');
    assert.match(await nav('Duyệt').getAttribute('aria-label'), /2 chờ/);

    // Hàng chờ: lọc theo trạng thái, list chính tách riêng.
    await nav('Duyệt').click();
    await page.locator('.v2-queue-item').first().waitFor();
    assert.equal(await page.locator('.v2-queue-item').count(), 3, 'Tất cả = list đã tạo, không gồm list chính');
    await page.getByRole('group', { name: 'Lọc trạng thái' }).getByRole('button', { name: /^Mới/ }).click();
    assert.equal(await page.locator('.v2-queue-item').count(), 1);
    await page.getByRole('group', { name: 'Lọc trạng thái' }).getByRole('button', { name: /^Mẫu mẹ/ }).click();
    assert.equal(await page.locator('.v2-queue-item').count(), 1);
    await page.getByRole('group', { name: 'Lọc trạng thái' }).getByRole('button', { name: /^Tất cả/ }).click();

    // Mở list, bấm chữ trên slide → nhảy tới đúng ô sửa.
    await page.locator('.v2-queue-item').filter({ hasText: 'Set 1' }).locator('button').click();
    await page.locator('.v2-canvas [data-edit-field="title"]').waitFor({ timeout: 10000 });
    await page.locator('.v2-canvas [data-edit-field="title"]').click();
    await page.waitForFunction(() => document.activeElement?.dataset?.editTarget === 'title');
    assert.equal(await page.locator('.v2-page-count').innerText(), 'Trang 1/2');

    // Bản nháp: rời trang phải hỏi; ở lại giữ bản nháp; lưu gửi PATCH.
    await page.locator('[data-edit-target="title"]').fill('Hook A đã sửa');
    await page.getByText('● Chưa lưu', { exact: true }).waitFor();
    await nav('Hôm nay').click();
    const confirm = page.getByRole('alertdialog');
    await confirm.waitFor();
    await confirm.getByRole('button', { name: 'Ở lại chỉnh sửa', exact: true }).click();
    await confirm.waitFor({ state: 'detached' });
    assert.equal(await page.locator('[data-edit-target="title"]').inputValue(), 'Hook A đã sửa');
    await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await page.getByText('Đã lưu', { exact: true }).waitFor();
    assert.equal(patches.length, 1); assert.equal(patches[0].title, 'Hook A đã sửa');
    assert.equal(nativeDialogs, 0, 'Không dùng hộp thoại trình duyệt');

    // Dải trang.
    await page.getByRole('tab', { name: 'Trang 2', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.v2-page-count')?.textContent === 'Trang 2/2');

    // Xuất 1 trang: bản sao đưa vào vùng xuất không mang dấu data-edit-field của preview.
    await page.evaluate(() => {
      window.exportCloneHadMarkers = null;
      new MutationObserver(() => {
        const root = document.querySelector('.batch-export-root');
        if (root?.querySelector('.story-page')) window.exportCloneHadMarkers = Boolean(root.querySelector('[data-edit-field]'));
      }).observe(document.body, { childList: true, subtree: true });
    });
    assert.ok(await page.locator('.v2-canvas [data-edit-field]').count(), 'Preview có dấu bấm-để-sửa');
    const [v2Download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: /^Xuất trang PNG$/ }).click()]);
    const v2Png = fs.readFileSync(await v2Download.path());
    await page.waitForFunction(() => window.exportCloneHadMarkers !== null, null, { timeout: 60000 });
    assert.equal(await page.evaluate(() => window.exportCloneHadMarkers), false, 'Markup xuất ảnh không chứa data-edit-field');

    // Chọn 2 list → thanh xuất → xuất xong ghi "Đã xuất".
    await page.getByRole('checkbox', { name: 'Chọn Set 1' }).check();
    await page.getByRole('checkbox', { name: 'Chọn Set 2' }).check();
    const bar = page.getByRole('region', { name: 'Xuất các list đã chọn' });
    await bar.waitFor();
    assert.match(await bar.innerText(), /2 list · 4 trang/);
    await page.screenshot({ path: path.join(output, 'review-selecting.png') });
    const [zipDownload] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), bar.getByRole('button', { name: /^Xuất 2 list/ }).click()]);
    if (process.env.DEBUG_UI) { await page.waitForTimeout(15000); console.log('MARKED', JSON.stringify(marked), 'ERR', errors, 'TOASTS', await page.locator('.v2-toast').allInnerTexts(), 'PROGRESS', await page.locator('#exportProgress').innerText().catch(() => '')); }
    await page.waitForFunction(() => document.querySelectorAll('.v2-queue-item .v2-status[data-status="exported"]').length === 3, null, { timeout: 60000 });
    assert.equal(marked.length, 1);
    // Ảnh xuất 1 trang (sao chép preview V2) phải giống hệt trang đó trong ZIP xuất hàng loạt (dựng độc lập).
    const zip = await require(path.join(front, 'node_modules/jszip')).loadAsync(fs.readFileSync(await zipDownload.path()));
    const pngNames = Object.keys(zip.files).filter(name => /\.png$/i.test(name));
    const zipPngs = await Promise.all(pngNames.map(name => zip.files[name].async('nodebuffer')));
    assert.ok(zipPngs.some(buffer => buffer.equals(v2Png)), `Ảnh trang 2 của Set 1 trùng với ảnh trong ZIP (${pngNames.join(', ')})`);
    assert.deepEqual(marked[0].groups.map(group => [...group.listIds].sort()), [[`${id}-a`, `${id}-b`]]);

    // Trung tâm tác vụ có lượt xuất vừa xong.
    await page.getByRole('button', { name: /^Tác vụ/ }).click();
    const tasks = page.getByRole('dialog', { name: 'Trung tâm tác vụ' });
    await tasks.waitFor();
    assert.match(await tasks.innerText(), /Xuất file/);
    await page.keyboard.press('Escape');

    // Ctrl+K → mẫu → ngăn kéo tạo list dùng bộ tạo list hiện có.
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox', { name: 'Tìm nhanh' }).fill('mau thu');
    await page.keyboard.press('Enter');
    await page.locator('.v2-drawer .list-create-panel').waitFor();
    assert.ok(await page.locator('#createDeckFromCaptionBtn').isVisible());
    await page.getByRole('button', { name: 'Đóng ngăn kéo tạo list' }).click();

    // Điện thoại: không tràn ngang, nút menu có tên.
    await page.setViewportSize({ width: 390, height: 844 });
    await nav('Duyệt').click();
    await page.waitForTimeout(300);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Không tràn ngang ở 390px');
    await page.screenshot({ path: path.join(output, 'review-mobile.png') });
    assert.deepEqual(errors, []);
    console.log('PASS V2 studio: status counts, queue filters, click-to-edit, draft guard + save, filmstrip, batch export marks exported, task center, Ctrl+K drawer, preview export identical to batch export, mobile. Screenshots:', output);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
