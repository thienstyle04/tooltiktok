// Trình xuất tự động (AutomationExportRunner thật, mọi API giả lập): lượt chia 3 phần ZIP, mỗi phần
// báo kết quả và gửi ZIP riêng kèm số phần; phần 2 lưu lỗi thì báo lỗi phần đó và vẫn xuất phần 3.
// Mỗi ZIP chỉ chứa list của phần mình. Không dùng backend hay dữ liệu thật.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const front = path.resolve(__dirname, '..');
const esbuild = require(path.join(front, '../backend/node_modules/esbuild')), { chromium } = require('playwright');
const JSZip = require(path.join(front, 'node_modules/jszip'));
const id = 'local-runner-fixture';
const model = { templateId: id, version: 1, width: 1080, height: 1440, fonts: [], nodes: [
  { kind: 'shape', x: 0, y: 0, width: 1080, height: 1440, style: { background: '#cfe' } },
  { kind: 'text', field: 'title', x: 90, y: 100, width: 900, height: 150, style: { fontFamily: 'Arial', fontSize: 60, lineHeight: '70px' } },
] };
const listIds = ['a', 'b', 'c', 'd', 'e'].map(suffix => `${id}-${suffix}`);
const dataset = { generatedAt: '2026-10-19T00:00:00Z', source: { destinationId: 'dalat-test', destinationLabel: 'Đà Lạt Test', totalItems: 3, coverImageUrls: [], allowedDeckIds: [id] }, sections: [], decks: [{
  id, navTitle: 'Mẫu thử', title: 'Mẫu thử', description: '', localTemplate: { version: 1, pageCount: 2 },
  lists: [{ id: `${id}-main`, navTitle: 'List chính', title: 'Hook mẹ', pages: [{ type: 'cover', title: 'Hook mẹ', subtitle: '', backgroundImage: '', localRender: model }] },
    ...listIds.map((listId, index) => ({ id: listId, navTitle: `Set ${index + 1}`, title: `Hook ${index + 1}`, pages: [
      { type: 'cover', title: `Hook ${index + 1}`, subtitle: '', backgroundImage: '', localRender: model },
      { type: 'list', title: 'Trang hai', subtitle: '', backgroundImage: '', items: [{ name: 'Quán thử', metaPrimary: '1 Đường Thử', isPartner: true }], localRender: model }] }))],
}] };
const parts = [listIds.slice(0, 2), listIds.slice(2, 4), listIds.slice(4)];

async function main() {
  const bundle = await esbuild.build({ stdin: { contents: "import React from 'react';import{createRoot}from'react-dom/client';import Runner from './components/AutomationExportRunner';createRoot(document.getElementById('root')).render(<Runner runId='run-test' token='tok'/>);", resolveDir: front, loader: 'jsx' },
    bundle: true, write: false, format: 'iife', loader: { '.js': 'jsx' }, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const browser = await chromium.launch({ headless: true, executablePath: [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync) });
  const outcomes = [], archives = [], failures = [];
  try {
    const page = await browser.newPage();
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<meta charset="utf-8"><div id="root"></div><script>' + bundle.outputFiles[0].text + '</script>' });
      if (p === '/api/automation/runs/run-test/export-context') return route.fulfill({ json: { runId: 'run-test', listIds, quality: 'optimized', format: 'jpg', parts } });
      if (p === '/api/automation/runs/run-test/progress') { const body = request.postDataJSON(); if (body.outcome) outcomes.push({ part: body.part, ...body.outcome }); return route.fulfill({ status: 204, body: '' }); }
      if (p === '/api/automation/runs/run-test/archive') {
        const part = Number(url.searchParams.get('part'));
        const zip = await JSZip.loadAsync(request.postDataBuffer());
        archives.push({ part, files: Object.keys(zip.files) });
        return part === 2 ? route.fulfill({ status: 500, json: { message: 'Ổ đĩa đầy (giả lập).' } }) : route.fulfill({ json: { outputPath: `C:/x/part-${part}.zip`, bytes: 1 } });
      }
      if (p === '/api/automation/runs/run-test/export-failure') { failures.push(request.postDataJSON()); return route.fulfill({ status: 204, body: '' }); }
      if (p === '/api/guide-data') return route.fulfill({ json: dataset });
      if (p === '/api/night-sync/export-lease') return route.fulfill({ json: { ok: true } });
      if (p === '/api/drive-files/cache-status') return route.fulfill({ json: { missing: [], images: [] } });
      if (p === '/api/drive-cache/status') return route.fulfill({ json: { ready: true, phase: 'ready' } });
      if (p === '/api/health') return route.fulfill({ json: { status: 'ok', sessionId: 'runner-test', appVersion: '0.10.03' } });
      if (p.startsWith('/api/runtime-performance')) return route.fulfill({ json: { mode: 'modern', reason: 'isolated' } });
      if (p.startsWith('/fonts/')) return route.fulfill({ body: fs.readFileSync(path.join(front, 'public', p)) });
      return route.fulfill({ status: 404, body: 'Isolated test: unavailable' });
    });
    await page.goto('http://runner.test/');
    await page.waitForFunction(() => /Phần 3\/3/.test(document.body.innerText) && /Đã xuất|xuất 1 list/i.test(document.body.innerText) || /Lỗi:/.test(document.body.innerText), null, { timeout: 120000 });
    await page.waitForTimeout(500);
    const text = await page.locator('main').innerText();
    assert.doesNotMatch(text, /Lỗi:/, 'Phần 2 lỗi không được dừng cả lượt: ' + text);

    assert.deepEqual(outcomes.map(entry => entry.part), [1, 2, 3], 'Mỗi phần báo kết quả kèm số phần');
    outcomes.forEach((entry, index) => assert.deepEqual(entry.exportedLists.map(item => item.listId).sort(), [...parts[index]].sort()));
    assert.deepEqual(archives.map(entry => entry.part), [1, 2, 3], 'Gửi ZIP từng phần, phần 3 vẫn được xuất sau khi phần 2 lỗi');
    archives.forEach((entry, index) => {
      const folders = new Set(entry.files.filter(name => name.endsWith('/')).map(name => name.split('/')[0]));
      const others = listIds.filter(listId => !parts[index].includes(listId));
      assert.ok(entry.files.length > 0);
      assert.ok(others.every(listId => !entry.files.some(name => name.includes(listId))), `ZIP phần ${index + 1} chỉ chứa list của phần mình: ${[...folders].join(', ')}`);
    });
    assert.equal(failures.length, 1);
    assert.equal(failures[0].part, 2);
    assert.match(failures[0].message, /Ổ đĩa đầy/);
    console.log('PASS automation runner: 3 ZIP parts, per-part outcome+archive, failed part 2 reported, part 3 still exported');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
