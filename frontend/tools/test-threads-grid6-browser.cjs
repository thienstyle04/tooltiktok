const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const front = path.resolve(__dirname, '..'), back = path.resolve(front, '../backend');
const esbuild = require(path.join(back, 'node_modules/esbuild')), sharp = require(path.join(back, 'node_modules/sharp'));
const { chromium } = require('playwright'), JSZip = require('jszip'), XLSX = require(path.join(back, 'node_modules/xlsx'));
const helper = require('./exportClientTestHelper.cjs');
process.env.TS_NODE_PROJECT = path.join(back, 'tsconfig.json'); require(path.join(back, 'node_modules/ts-node/register/transpile-only'));
const { getColorEditAsset } = require(path.join(back, 'src/modules/guide/color-edit.ts'));

async function main() {
  let input = process.argv.slice(2).find(arg => !arg.startsWith('--'));
  if (!input) {
    const output = cp.execFileSync(process.execPath, ['-r', 'ts-node/register/transpile-only', 'src/modules/guide/tools/test-threads-grid6-collage.ts'], { cwd: back, encoding: 'utf8', timeout: 90000 });
    input = output.match(/GRID6_AUDIT=(.+)/)[1].trim();
  }
  const fixture = JSON.parse(fs.readFileSync(input, 'utf8')), lists = fixture.lists;
  const output = path.join(path.dirname(input), 'visual-export'); fs.mkdirSync(output, { recursive: true });
  const bundle = await esbuild.build({ ...helper.bundleOptions({ names: ['renderPagesForExport', 'waitForPageImagesSettled'], overrides: { renderPageBlobWithRetry: 'const actualGrid6Capture = renderPageBlobWithRetry; renderPageBlobWithRetry = async (node, options) => { if (window.grid6FailList === node.dataset.listId && Number(node.dataset.pageIndex) === 2) throw new Error("isolated mid-list render failure"); return actualGrid6Capture(node, options); };', downloadBlobFile: 'downloadBlobFile = (blob,name) => { window.downloads.push({blob,name}); return true; };' }, extra: "export {renderCoverPage,renderListPage} from './pageMarkup'; export {applyPageTextScale} from './pageTextScale'; export {checkThreadsGrid6Layout,assertThreadsGrid6Export} from './threadsGrid6'; export {collectPartnerNames} from './partnerNames.mjs';" }), bundle: true, write: false, format: 'iife', globalName: 'Audit', platform: 'browser' });
  const css = [...fs.readFileSync(path.join(front, 'app/globals.css'), 'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m => fs.readFileSync(path.join(front, 'app', m[1]), 'utf8')).join('\n');
  const executablePath = process.env.TEST_BROWSER_PATH || [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()), p = url.pathname;
      if (p === '/') return route.fulfill({ contentType: 'text/html', body: `<style>${css}</style><div id="preview"></div>` });
      if (p === '/assets/drive-file' || p === '/assets/color-edit') {
        const source = p === '/assets/color-edit' ? new URL(url.searchParams.get('source'), 'http://grid6.test') : url;
        const id = source.searchParams.get('id'); if (!/^[\w-]+$/.test(id || '')) return route.abort();
        const bytes = fs.readFileSync(path.join(fixture.cache, id + '.bin'));
        return route.fulfill({ contentType: 'image/png', body: p === '/assets/color-edit' ? await getColorEditAsset(bytes, path.dirname(input), url.searchParams.get('preset') || 'photo-ref-07-dark-crisp-v1') : bytes });
      }
      if (p.startsWith('/fonts/')) return route.fulfill({ body: fs.readFileSync(path.join(front, 'public', p)) });
      if (p === '/api/health') return route.fulfill({ json: { status: 'ok', sessionId: 'grid6-test', appVersion: require('../lib/appVersion.js').APP_VERSION } });
      if (p === '/api/night-sync/export-lease') return route.fulfill({ json: { ok: true } });
      if (p.startsWith('/api/runtime-performance')) return route.fulfill({ json: { mode: 'modern', totalMemoryBytes: 16 * 1024 ** 3, freeMemoryBytes: 8 * 1024 ** 3, logicalCpuCount: 8 } });
      if (p === '/api/drive-cache/status') return route.fulfill({ json: { ready: true, phase: 'ready' } });
      if (p === '/api/drive-files/cache-status') return route.fulfill({ json: { missing: [], cached: 0 } });
      return route.abort();
    });
    await page.goto('http://grid6.test/'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
    for (let index = 0; index < 5; index++) {
      const geometry = await page.evaluate(async ({ list, index }) => {
        const p = list.pages[index]; document.getElementById('preview').innerHTML = p.type === 'cover' ? Audit.renderCoverPage(p, index, 5, list.id, [], list) : Audit.renderListPage(p, index, 5, list.id, [], list);
        const node = document.querySelector('#preview article'); await Audit.waitForPageImagesSettled(node); await Promise.all([...node.querySelectorAll('img')].map(img => img.decode())); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); Audit.checkThreadsGrid6Layout(node, true);
        return { width: node.offsetWidth, height: node.getBoundingClientRect().height, cells: [...node.querySelectorAll('.threads-grid6-cell')].map(n => [n.offsetWidth, n.offsetHeight]), leaves: node.querySelectorAll('.threads-grid6-leaf').length, font: getComputedStyle(node.querySelector('.threads-grid6-hook,.threads-grid6-label span')).fontSize, text: node.textContent };
      }, { list: lists[0], index });
      assert.equal(geometry.width, 397); assert.ok(Math.abs(geometry.height - 1920 * 397 / 1080) < .05);
      assert.ok(geometry.cells.every(([w, h]) => w === 540 && h === 640)); assert.equal(geometry.leaves, index === 1 ? 2 : 0);
      assert.equal(parseFloat(geometry.font), lists[0].pages[index].textFontSize || (index === 0 ? 38 : 32)); assert.ok(!geometry.text.includes('Không được render địa chỉ'));
      await page.locator('#preview article').screenshot({ path: path.join(output, `preview-${index + 1}.png`) });
      if (process.env.GRID6_DEBUG && index === 1) console.log(await page.evaluate(() => [...document.querySelectorAll('#preview img')].map(img => ({ src: img.src, natural: [img.naturalWidth, img.naturalHeight], box: img.getBoundingClientRect().toJSON(), display: getComputedStyle(img).display, position: getComputedStyle(img).position, visibility: getComputedStyle(img).visibility, opacity: getComputedStyle(img).opacity }))));
    }
    if (fixture.hookPool?.length) {
      const checked = await page.evaluate(({ list, hooks }) => {
        for (const title of hooks) {
          const p = { ...list.pages[0], title };
          document.getElementById('preview').innerHTML = Audit.renderCoverPage(p, 0, 5, list.id, [], list);
          const node = document.querySelector('#preview article'); Audit.applyPageTextScale(node); Audit.checkThreadsGrid6Layout(node, true);
          if (node.querySelector('.threads-grid6-hook').textContent !== title) throw Error('Hook was clipped or changed');
        }
        return hooks.length;
      }, { list: lists[0], hooks: fixture.hookPool });
      assert.equal(checked, 30); console.log('PASS all 30 cover hooks fit the saved 44px/bottom-left layout');
    }
    const overflow = await page.evaluate(async list => {
      const p = list.pages[1]; document.getElementById('preview').innerHTML = Audit.renderListPage(p, 1, 5, list.id, [], list);
      const node = document.querySelector('#preview article'); Audit.applyPageTextScale(node); node.querySelector('.threads-grid6-label span').textContent = 'Tên địa điểm quá dài '.repeat(20);
      try { Audit.checkThreadsGrid6Layout(node, true); return false; } catch { return true; }
    }, lists[0]); assert.ok(overflow, 'Long saved name must block, never shrink or clip');
    if (process.argv.includes('--preview-only')) { console.log('PASS real snapshot preview; 5 pages: ' + output); return; }
    for (const color of ['original', 'preset']) for (const format of ['png', 'jpg']) {
      const selected = color === 'original' ? lists.slice(0, 4) : lists.slice(4);
      const result = await page.evaluate(async ({ lists, format }) => {
        window.downloads = []; const status = []; let busy;
        const callbacks = { setStatus: s => status.push(s), setBusy: b => busy = b, setExportBusy: b => busy = b, setExportProgress: () => {}, startProgress: () => {}, updateProgress: () => {}, completeProgress: () => {}, failProgress: () => {}, resetProgress: () => {} };
        const deck = { id: 'threads-grid6-collage', navTitle: 'Threads · Lưới 6 ảnh', lists }, dataset = { source: { destinationId: 'dalat-threads', allowedDeckIds: [deck.id] }, decks: [deck] };
        await Audit.exportBatch({ dataset, selectedListIds: new Set(lists.map(list => list.id)), quality: 'optimized', format }, callbacks);
        const files = []; for (const item of window.downloads) { const bytes = new Uint8Array(await item.blob.arrayBuffer()); let s = ''; for (let n = 0; n < bytes.length; n += 16384) s += String.fromCharCode(...bytes.slice(n, n + 16384)); files.push({ name: item.name, data: btoa(s) }); }
        return { files, status, busy, expected: lists.map(Audit.collectPartnerNames) };
      }, { lists: selected, format });
      assert.equal(result.busy, false); assert.ok(result.files.length, result.status.join('\n'));
      let images = 0, sheets = 0, texts = 0;
      for (const file of result.files) {
        const bytes = Buffer.from(file.data, 'base64'); fs.writeFileSync(path.join(output, `${color}-${format}-${file.name}`), bytes);
        const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
        for (const entry of Object.values(zip.files).filter(entry => !entry.dir)) {
          if (entry.name.endsWith('.' + format)) { const bytes = await entry.async('nodebuffer'), meta = await sharp(bytes).metadata(); assert.equal(meta.width, 1080); assert.equal(meta.height, 1920); if (images < 5) fs.writeFileSync(path.join(output, `${color}-${format}-${images + 1}.${format}`), bytes); images++; }
          if (entry.name.endsWith('.xlsx')) { const workbook = XLSX.read(await entry.async('nodebuffer')); const names = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }).flat().filter(Boolean); assert.deepEqual(names.sort(), result.expected[sheets].sort()); assert.equal(new Set(names).size, names.length); sheets++; }
          if (entry.name.endsWith('.txt')) { const text = await entry.async('string'); assert.ok(!text.includes('Không được render địa chỉ')); assert.ok(!text.includes('Lưu list này để')); assert.ok(selected.some(list => text.includes(list.postCaption)), 'TXT must contain the separate post description'); assert.ok(selected.every(list => !text.includes(list.pages[0].title)), 'TXT must not repeat the cover hook'); texts++; }
        }
      }
      assert.equal(images, 20); assert.equal(sheets, 4); assert.equal(texts, 4); console.log('PASS', color, format, '20 images + 4 TXT + 4 XLSX');
    }
    const partial = await page.evaluate(async lists => {
      window.downloads = []; window.grid6FailList = lists[0].id; const status = [];
      const cb = { setStatus: s => status.push(s), setBusy: () => {}, setExportBusy: () => {}, setExportProgress: () => {}, startProgress: () => {}, updateProgress: () => {}, completeProgress: () => {}, failProgress: () => {}, resetProgress: () => {} };
      const deck = { id: 'threads-grid6-collage', navTitle: 'Threads · Lưới 6 ảnh', lists };
      await Audit.exportBatch({ dataset: { source: { destinationId: 'dalat-threads', allowedDeckIds: [deck.id] }, decks: [deck] }, selectedListIds: new Set(lists.map(list => list.id)), quality: 'optimized', format: 'jpg', skipImageErrors: true }, cb);
      const result = []; for (const file of window.downloads) { const bytes = new Uint8Array(await file.blob.arrayBuffer()); let str = ''; for (let n = 0; n < bytes.length; n += 16384) str += String.fromCharCode(...bytes.slice(n, n + 16384)); result.push(btoa(str)); }
      return { result, status };
    }, lists.slice(0, 2));
    let retained = 0, metadata = 0;
    for (const file of partial.result) { const zip = await JSZip.loadAsync(Buffer.from(file, 'base64')); const entries = Object.values(zip.files).filter(entry => !entry.dir); retained += entries.filter(entry => entry.name.endsWith('.jpg')).length; metadata += entries.filter(entry => entry.name.endsWith('.xlsx')).length; }
    assert.equal(retained, 5, 'Do not retain the first two pages of a list that fails mid-export'); assert.equal(metadata, 1); assert.ok(partial.status.join(' ').includes('isolated mid-list render failure'));
    for (const format of ['png', 'jpg']) {
      const single = await page.evaluate(async ({ list, format }) => {
        window.downloads = []; delete window.grid6FailList; const status = [];
        const cb = { setStatus: s => status.push(s), setBusy: () => {}, setExportBusy: () => {}, setExportProgress: () => {}, startProgress: () => {}, updateProgress: () => {}, completeProgress: () => {}, failProgress: () => {}, resetProgress: () => {} };
        const deck = { id: 'threads-grid6-collage', navTitle: 'Threads · Lưới 6 ảnh', lists: [list] };
        await Audit.exportActiveList({ deck, list, quality: 'optimized', format }, cb);
        const files = []; for (const file of window.downloads) { const bytes = new Uint8Array(await file.blob.arrayBuffer()); let str = ''; for (let n = 0; n < bytes.length; n += 16384) str += String.fromCharCode(...bytes.slice(n, n + 16384)); files.push(btoa(str)); } return { files, status };
      }, { list: lists[0], format });
      assert.equal(single.files.length, 1, single.status.join('\n'));
      const zip = await JSZip.loadAsync(Buffer.from(single.files[0], 'base64')), entries = Object.values(zip.files).filter(entry => !entry.dir);
      assert.equal(entries.filter(entry => entry.name.endsWith('.' + format)).length, 5); assert.equal(entries.filter(entry => entry.name.endsWith('.txt')).length, 1); assert.equal(entries.filter(entry => entry.name.endsWith('.xlsx')).length, 1);
    }
    console.log('PASS Threads grid6 preview/export geometry, typography, overflow, 80 PNG/JPG, 16 TXT/XLSX pairs, partial failure cleanup. Artifacts: ' + output);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
