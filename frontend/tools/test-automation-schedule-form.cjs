// Form lịch tự động (AutomationSchedulerPanel thật, API giả lập): lưu lịch thì chạy thử khô trước,
// mẫu không tạo đủ list hiện hộp cảnh báo (Quay lại sửa = không lưu; Vẫn lưu = lưu), lựa chọn
// "Chạy bù khi lỡ giờ" được gửi đúng, PNG nhiều list có gợi ý, lịch sử hiện nhiều file ZIP và lỗi tạo list.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const front = path.resolve(__dirname, '..');
const esbuild = require(path.join(front, '../backend/node_modules/esbuild')), { chromium } = require('playwright');
const deckIds = ['spotlight-v5', 'spotlight-v6-green', 'spotlight-v6-dark', 'spotlight-v6-persimmon', 'spotlight-v6-maps', 'summary-note'];

async function main() {
  const source = `import React from 'react';import { createRoot } from 'react-dom/client';
    import Panel from './components/AutomationSchedulerPanel';
    import { ConfirmDialogHost } from './components/ui/confirmDialog';
    const runs = [{ id: 'run-1', scheduleId: 's', scheduleName: '90 list', scheduledFor: '2026-10-18T09:50:00Z', destinationId: 'dalat', status: 'partial', progress: 100,
      phase: 'Đã tạo 88/90 list, xuất 88 list vào 5 file ZIP. Không tạo được 2 list ở 1 mẫu. Xem chi tiết bên dưới.', templates: [], hook: { mode: 'normal' }, outputDir: 'C:/out',
      listIds: [], generated: [], outputPath: 'C:/out/run', outputPaths: ['C:/out/run/a-phan-1-tren-5.zip', 'C:/out/run/a-phan-2-tren-5.zip', 'C:/out/run/a-phan-3-tren-5.zip', 'C:/out/run/a-phan-4-tren-5.zip', 'C:/out/run/a-phan-5-tren-5.zip'],
      errors: [{ deckId: 'spotlight-v6-dark', requested: 3, completed: 1, message: 'spotlight-v6-dark: cần ít nhất 1 đối tác hợp lệ; hiện có 0.' }], createdAt: '', updatedAt: '' }];
    function App() {
      const [state, setState] = React.useState({ locked: false, outputPicker: 'save-file-v1', schedules: [], runs, browserAvailable: true, browserName: 'Edge', minListsPerTemplate: 3, maxListsPerTemplate: 5 });
      return <main className="app-shell studio-workflow studio-v2" data-studio-theme="light"><Panel dataset={{ source: { destinationId: 'dalat', destinationLabel: 'Đà Lạt' }, decks: [] }}
        destinations={[{ id: 'dalat', label: 'Đà Lạt', allowedDeckIds: ${JSON.stringify(deckIds)} }, { id: 'dalat-test', label: 'Đà Lạt Test', contentDestinationId: 'dalat', allowedDeckIds: ${JSON.stringify(deckIds)} }]} automationState={state} onStateChange={setState} /><ConfirmDialogHost /></main>;
    }
    createRoot(document.getElementById('root')).render(<App/>);`;
  const bundle = await esbuild.build({ stdin: { contents: source, resolveDir: front, loader: 'jsx' }, bundle: true, write: false, format: 'iife', loader: { '.js': 'jsx' }, jsx: 'automatic', charset: 'utf8', define: { 'process.env.NODE_ENV': '"production"' } });
  const css = [...fs.readFileSync(path.join(front, 'app/globals.css'), 'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m => fs.readFileSync(path.join(front, 'app', m[1]), 'utf8')).join('\n');
  const browser = await chromium.launch({ headless: true, executablePath: [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync) });
  const preflights = [], saved = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => localStorage.removeItem('dalat-carousel:automation-schedule-draft:v2'));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const request = route.request(), p = new URL(request.url()).pathname;
      if (p === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<meta charset="utf-8"><style>' + css + '</style><div id="root"></div>' });
      if (p === '/api/automation/choose-output-directory') return route.fulfill({ json: { directory: 'C:\\out', fileName: 'lich.zip', path: 'C:\\out\\lich.zip' } });
      if (p === '/api/automation/preflight') {
        preflights.push(request.postDataJSON());
        return route.fulfill({ json: { checked: true, templates: request.postDataJSON().templates.map(t => t.deckId === 'spotlight-v6-dark'
          ? { deckId: t.deckId, navTitle: 'Spotlight V6 Tone đen', requested: t.count, possible: 1, checked: true, reason: 'spotlight-v6-dark: cần ít nhất 1 đối tác hợp lệ; hiện có 0. Đối tác chưa có ảnh khác lần trước: Quán A (1 ảnh hợp lệ).' }
          : { deckId: t.deckId, requested: t.count, possible: t.count, checked: true }) } });
      }
      if (p === '/api/automation/schedules') { saved.push(request.postDataJSON()); return route.fulfill({ json: { locked: false, outputPicker: 'save-file-v1', schedules: [], runs: [], browserAvailable: true, minListsPerTemplate: 3, maxListsPerTemplate: 5 } }); }
      if (p === '/api/photo-presets') return route.fulfill({ json: { presets: [{ id: null, label: 'Ảnh gốc' }] } });
      if (p === '/api/hook-sources') return route.fulfill({ json: { mode: 'normal', sources: [] } });
      return route.fulfill({ json: {} });
    });
    await page.goto('http://schedule-form.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });

    // Lịch sử: nhiều file ZIP và lỗi tạo list hiện trong chi tiết, có tên mẫu.
    await page.getByRole('tab', { name: 'Hàng đợi & lịch sử' }).click().catch(() => page.getByRole('button', { name: 'Hàng đợi & lịch sử' }).click());
    const history = page.locator('.automation-history article').first();
    await history.getByText('5 file ZIP', { exact: true }).click();
    await history.getByText('1 lỗi khi tạo/xuất', { exact: true }).click();
    assert.match(await history.innerText(), /a-phan-5-tren-5\.zip/);
    assert.match(await history.innerText(), /Spotlight V6 Tone đen \(tạo 1\/3\)/);
    await page.getByRole('tab', { name: 'Tạo / sửa lịch' }).click().catch(() => page.getByRole('button', { name: 'Tạo / sửa lịch' }).click());

    await page.locator('input[placeholder^="Ví dụ"]').fill('Lịch kiểm tra');
    await page.locator('.automation-output button').click();
    await page.waitForFunction(() => document.querySelector('.automation-output output')?.textContent.includes('lich.zip'));
    const catchUp = page.getByRole('checkbox', { name: /Chạy bù khi lỡ giờ/ });
    assert.equal(await catchUp.isChecked(), true, 'Lịch mới mặc định chạy bù');
    for (const label of ['Spotlight V5', 'Spotlight V6 Mảng xanh', 'Spotlight V6 Tone đen', 'Spotlight Mùa hồng', 'Spotlight V6 Google Maps', 'Tổng hợp địa điểm']) {
      await page.locator('.automation-template-grid label').filter({ hasText: label }).first().locator('input[type=checkbox]').check();
    }
    await page.locator('.automation-hint').filter({ hasText: /PNG nặng/ }).waitFor();
    assert.match(await page.locator('.automation-hint').innerText(), /18 list/);

    // Có mẫu thiếu: hộp cảnh báo; quay lại sửa thì không lưu.
    await page.locator('button[type=submit]').click();
    const dialog = page.getByRole('alertdialog');
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /Spotlight V6 Tone đen: chạy thử chỉ tạo được 1\/3 list/);
    await dialog.getByRole('button', { name: 'Quay lại sửa', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(saved.length, 0, 'Quay lại sửa thì không lưu lịch');
    assert.match(await page.locator('.automation-preflight').innerText(), /Spotlight V6 Tone đen — tạo được 1\/3/);
    assert.equal(preflights.length, 1);
    assert.equal(preflights[0].templates.length, 6);

    // Tắt chạy bù, lưu lại và chấp nhận cảnh báo.
    await catchUp.uncheck();
    await page.locator('button[type=submit]').click();
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'Vẫn lưu lịch', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.automation-form-actions span')?.textContent.includes('Đã tạo lịch'));
    assert.equal(saved.length, 1);
    assert.equal(saved[0].catchUp, false);
    assert.equal(saved[0].templates.length, 6);

    // Lịch dùng nguồn khác nguồn đang mở: không chạy thử, ghi chú cách kiểm tra, vẫn lưu.
    await page.locator('input[placeholder^="Ví dụ"]').fill('Lịch nguồn khác');
    await page.locator('.automation-form label').filter({ hasText: 'Destination' }).locator('select').selectOption('dalat-test');
    await page.locator('.automation-template-grid label').filter({ hasText: 'Spotlight V5' }).first().locator('input[type=checkbox]').check();
    await page.locator('button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('.automation-form-actions span')?.textContent.includes('Đã tạo lịch') && document.querySelector('.automation-preflight-note'));
    assert.match(await page.locator('.automation-preflight-note').innerText(), /lịch dùng nguồn Đà Lạt Test, đang mở nguồn Đà Lạt/);
    assert.equal(preflights.length, 2, 'Không chạy thử cho nguồn khác');
    assert.equal(saved.length, 2);
    assert.deepEqual(errors, []);
    console.log('PASS schedule form: preflight warning (back/keep), catch-up option sent, PNG hint, history files + generation errors');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
