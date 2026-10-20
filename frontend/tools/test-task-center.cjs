// Trung tâm tác vụ + toast (thay thanh trạng thái cố định của giao diện cũ). Component thật,
// trạng thái controller giả lập: hủy yêu cầu đang xếp hàng (đang hủy/đã gửi/lỗi/thử lại),
// toast không đẩy bố cục, bảng tác vụ nổi không làm xê dịch nội dung, không tràn ngang.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createRequire } = require('node:module');
const front = path.resolve(__dirname, '..');
const esbuild = createRequire(path.resolve(front, '../backend/package.json'))('esbuild');
const { chromium } = require('playwright');

async function main() {
  const source = `import React from 'react';import { createRoot } from 'react-dom/client';
    import TaskCenter, { taskBadge } from './components/v2/TaskCenter';
    import { Toasts, useStatusToasts } from './components/v2/Overlays';
    function App() {
      const [job, setJob] = React.useState(null), [status, setStatus] = React.useState('Dữ liệu đã sẵn sàng.'), [theme, setTheme] = React.useState('dark'), [open, setOpen] = React.useState(false);
      const [busy, setBusy] = React.useState(false), [progress, setProgress] = React.useState({ visible: false, failed: false, value: 0, label: '' });
      const studio = { manualJob: job, busy, status, setStatus, progress, automationState: { locked: false, runs: [] }, loadAutomationState: async () => null,
        manualSyncProgress: null, manualSyncTerminal: true, setManualSyncVisible: () => {}, driveCacheStatus: { ready: true } };
      const { toasts, dismiss } = useStatusToasts(status);
      window.ui = { setJob, setStatus, setTheme, setOpen, setBusy, setProgress };
      return <main className="app-shell studio-workflow studio-v2" data-studio-theme={theme} data-view="today">
        <aside className="v2-sidebar"><nav className="v2-nav"><button type="button">Hôm nay</button></nav></aside>
        <section className="v2-workspace"><header className="v2-topbar"><div className="v2-title"><h2>Hôm nay</h2></div>
          <div className="v2-top-actions"><button type="button" className="v2-icon-button v2-task-button" aria-label={'Tác vụ: ' + taskBadge(studio)} onClick={() => setOpen(value => !value)}>T</button></div>
          <div className="v2-task-anchor"><TaskCenter studio={studio} open={open} onClose={() => setOpen(false)} history={[]} onClearHistory={() => {}} /></div></header>
          <div className="v2-content"><section id="content" className="v2-panel"><h2>Tạo list mới</h2><p>Nội dung đang làm việc.</p></section></div></section>
        <Toasts toasts={toasts} onDismiss={dismiss} /></main>;
    }
    createRoot(document.getElementById('root')).render(<App/>);`;
  const bundle = await esbuild.build({ stdin: { contents: source, resolveDir: front, loader: 'jsx' }, bundle: true, write: false, format: 'iife', loader: { '.js': 'jsx' }, jsx: 'automatic', charset: 'utf8' });
  const css = [...fs.readFileSync(path.join(front, 'app/globals.css'), 'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m => fs.readFileSync(path.join(front, 'app', m[1]), 'utf8')).join('\n');
  const executablePath = [`${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`, `${process.env['PROGRAMFILES(X86)']}/Microsoft/Edge/Application/msedge.exe`].find(fs.existsSync);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-task-center-'));
  try {
    const page = await browser.newPage();
    const cancelCalls = [];
    let cancelFails = true;
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<meta charset="utf-8"><style>' + css + '</style><div id="root"></div>' });
      if (url.pathname.endsWith('/cancel')) {
        cancelCalls.push(url.pathname);
        await new Promise(resolve => setTimeout(resolve, 150));
        return cancelFails ? route.fulfill({ status: 409, json: { message: 'Không thể hủy: lỗi mạng thử nghiệm.' } }) : route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ status: 404, body: 'Isolated test' });
    });
    await page.goto('http://task-center.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.waitForFunction(() => window.ui);
    const geometry = () => page.evaluate(() => Object.fromEntries(['.v2-sidebar', '.v2-workspace', '.v2-topbar', '#content'].map(selector => {
      const rect = document.querySelector(selector).getBoundingClientRect(); return [selector, { x: rect.x, y: rect.y, width: rect.width, height: rect.height }];
    })));

    for (const width of [1920, 1280, 768, 390]) for (const theme of ['dark', 'light']) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(t => { window.ui.setOpen(false); window.ui.setJob(null); window.ui.setTheme(t); }, theme);
      await page.waitForTimeout(40);
      const before = await geometry();
      for (const state of ['queued', 'running', 'toast-long', 'toast-error', 'open']) {
        await page.evaluate(s => {
          if (s === 'queued' || s === 'running') window.ui.setJob({ id: 'fixture', status: s });
          if (s === 'toast-long') window.ui.setStatus('Đã xử lý: ' + 'nội dung rất dài '.repeat(30));
          if (s === 'toast-error') window.ui.setStatus('Không tạo được list: lỗi thử nghiệm.');
          if (s === 'open') window.ui.setOpen(true);
        }, state);
        await page.waitForTimeout(60);
        assert.deepEqual(await geometry(), before, `${width}/${theme}/${state}: toast và bảng tác vụ không được đẩy bố cục`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}/${state}: tràn ngang`);
      }
      const panel = await page.getByRole('dialog', { name: 'Trung tâm tác vụ' }).boundingBox();
      assert.ok(panel.x >= 0 && panel.x + panel.width <= width + 1, `${width}: bảng tác vụ nằm trong màn hình`);
      console.log('PASS stable layout:', width, theme);
    }

    // Hủy yêu cầu đang xếp hàng: lỗi → cho thử lại và báo lỗi; thành công → "Đã gửi hủy".
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => { window.ui.setJob({ id: 'cancel-fixture', status: 'queued' }); window.ui.setOpen(true); });
    const tasks = page.getByRole('dialog', { name: 'Trung tâm tác vụ' });
    await tasks.getByRole('button', { name: 'Hủy yêu cầu', exact: true }).click();
    assert.equal(await tasks.getByRole('button', { name: 'Đang hủy...', exact: true }).isDisabled(), true);
    await page.locator('.v2-toast').filter({ hasText: 'lỗi mạng thử nghiệm' }).waitFor();
    assert.equal(await tasks.getByRole('button', { name: 'Hủy yêu cầu', exact: true }).isEnabled(), true);
    cancelFails = false;
    await tasks.getByRole('button', { name: 'Hủy yêu cầu', exact: true }).click();
    await tasks.getByRole('button', { name: 'Đã gửi hủy', exact: true }).waitFor();
    assert.equal(await tasks.getByRole('button', { name: 'Đã gửi hủy', exact: true }).isDisabled(), true);
    assert.deepEqual(cancelCalls, ['/api/automation/manual-generation/cancel-fixture/cancel', '/api/automation/manual-generation/cancel-fixture/cancel']);
    // Lượt mới đổi id → nút hủy về trạng thái ban đầu.
    await page.evaluate(() => window.ui.setJob({ id: 'next-fixture', status: 'queued' }));
    await tasks.getByRole('button', { name: 'Hủy yêu cầu', exact: true }).waitFor();
    assert.match(await page.getByRole('button', { name: /^Tác vụ/ }).getAttribute('aria-label'), /1/);
    await page.screenshot({ path: path.join(output, 'tasks-desktop.png') });

    // Mã nguồn: giao diện chỉ còn V2, không còn thanh trạng thái cố định.
    const studio = fs.readFileSync(path.join(front, 'components/DeckStudio.js'), 'utf8');
    assert.ok(studio.includes('<StudioV2') && !studio.includes('StudioStatusBar'), 'DeckStudio chỉ dựng giao diện V2');
    console.log('PASS task center: cancel pending/sent/failure/retry, toasts without layout shift, floating panel. Screenshots:', output);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
