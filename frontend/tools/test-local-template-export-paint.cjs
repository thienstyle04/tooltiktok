// Pixel regression through the real single/batch ZIP export path. Synthetic
// local models only: no private design/assets, user data or live API writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const front = path.resolve(__dirname, '..');
const esbuild = require(path.join(front, '../backend/node_modules/esbuild'));
const { chromium } = require('playwright');
const helper = require('./exportClientTestHelper.cjs');

const model = { templateId: 'local-paint-fixture', version: 1, width: 1080, height: 1440, fonts: [], nodes: [
  { kind: 'shape', x: 0, y: 0, width: 1080, height: 1440, style: { background: '#204020' } },
  { kind: 'shape', x: 281, y: 142, width: 518, height: 113, style: { background: '#f9d500', borderRadius: 70, boxShadow: '0 1px 8px rgba(0,0,0,.2)' } },
  { kind: 'shape', x: 108, y: 388, width: 864, height: 255, style: { background: '#ffffff', borderRadius: 45 } },
  { kind: 'shape', x: 140, y: 335, width: 297, height: 82, style: { background: '#9d0808', borderRadius: 41 } },
  { kind: 'text', x: 350, y: 450, width: 598, height: 90, itemIndices: [0], fields: ['name'], style: { fontSize: 32, lineHeight: '44px', color: '#000' } },
] };
const lists = [1, 2].map(n => ({ id: `local-paint-fixture-${n}`, title: `Paint ${n}`, pages: [{ type: 'list', title: 'Paint fixture', subtitle: '', backgroundImage: '', items: [{ name: `Partner ${n}`, isPartner: true, imageUrl: '' }], localRender: model }] }));

async function main() {
  const options = helper.bundleOptions({ names: ['renderPagesForExport'], overrides: { downloadBlobFile: 'downloadBlobFile = (blob,name) => { window.downloads.push({blob,name}); return true; };' }, extra: "export {default as JSZip} from 'jszip'; export {renderLocalTemplate} from './localTemplates';" });
  const bundle = await esbuild.build({ ...options, bundle: true, write: false, format: 'iife', globalName: 'Smoke', platform: 'browser' });
  const css = [...fs.readFileSync(path.join(front, 'app/globals.css'), 'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m => fs.readFileSync(path.join(front, 'app', m[1]), 'utf8')).join('\n');
  const executablePath = [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  let external = 0;
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-local-export-paint-'));
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1500 } });
    await page.route('**/*', route => {
      const p = new URL(route.request().url()).pathname;
      if (p === '/') return route.fulfill({ contentType: 'text/html', body: `<style>${css}</style><div id="preview"></div>` });
      if (p === '/api/health') return route.fulfill({ json: { status: 'ok', sessionId: 'paint-test', appVersion: '0.9.07' } });
      if (p === '/api/night-sync/export-lease') return route.fulfill({ json: { ok: true } });
      if (p.startsWith('/api/runtime-performance')) return route.fulfill({ json: { mode: 'modern', totalMemoryBytes: 16 * 1024 ** 3, freeMemoryBytes: 8 * 1024 ** 3, logicalCpuCount: 8 } });
      if (p === '/api/drive-cache/status') return route.fulfill({ json: { ready: true, phase: 'ready' } });
      if (p === '/api/drive-files/cache-status') return route.fulfill({ json: { missing: [], cached: 0 } });
      if (p.startsWith('/fonts/')) return route.fulfill({ body: fs.readFileSync(path.join(front, 'public', p)) });
      external++; return route.abort();
    });
    await page.goto('http://local-paint.test/'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(list => { document.getElementById('preview').innerHTML = Smoke.renderLocalTemplate(list.pages[0], 0, list.id); }, lists[0]);
    await page.locator('#preview .story-page').screenshot({ path: path.join(output, 'preview.png') });
    for (const mode of ['single', 'batch']) for (const quality of ['optimized', 'original']) for (const format of ['png', 'jpg']) {
      const result = await page.evaluate(async ({ lists, mode, quality, format }) => {
        window.downloads = []; const busy = [];
        const cb = { setStatus: () => {}, setBusy: b => busy.push(b), setExportBusy: b => busy.push(b), setExportProgress: () => {}, startProgress: () => {}, updateProgress: () => {}, completeProgress: () => {}, failProgress: () => {}, resetProgress: () => {} };
        const deck = { id: 'local-paint-fixture', navTitle: 'Paint', lists };
        const dataset = { source: { destinationId: 'fixture', allowedDeckIds: [deck.id] }, decks: [deck] };
        const outcome = mode === 'batch'
          ? await Smoke.exportBatch({ dataset, selectedListIds: new Set(lists.map(l => l.id)), quality, format }, cb)
          : await Smoke.exportActiveList({ deck, list: lists[0], quality, format }, cb);
        if (outcome?.success === false || !window.downloads.length) throw Error('Export failed ' + JSON.stringify(outcome));
        const images = []; let sheets = 0;
        for (const d of window.downloads) {
          const zip = await Smoke.JSZip.loadAsync(await d.blob.arrayBuffer(), { checkCRC32: true });
          for (const f of Object.values(zip.files).filter(f => !f.dir)) {
            if (f.name.endsWith('.xlsx')) { sheets++; continue; }
            if (!f.name.endsWith('.' + format)) continue;
            const bytes = await f.async('uint8array'); const bitmap = await createImageBitmap(new Blob([bytes]));
            const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
            const c = canvas.getContext('2d'); c.drawImage(bitmap, 0, 0); bitmap.close();
            const sample = (x, y) => [...c.getImageData(x, y, 1, 1).data].slice(0, 3);
            images.push({ width: canvas.width, height: canvas.height, yellow: [[300,198],[540,150],[780,198]].map(([x,y]) => sample(x,y)), white: sample(200,500), red: sample(160,376) });
          }
        }
        return { images, sheets, busy: busy.at(-1), previewWidth: document.querySelector('#preview .story-page').clientWidth };
      }, { lists, mode, quality, format });
      const count = mode === 'batch' ? 2 : 1;
      assert.equal(result.images.length, count); assert.equal(result.sheets, count); assert.equal(result.busy, false); assert.equal(result.previewWidth, 810);
      for (const im of result.images) {
        assert.equal(im.width, 1080); assert.equal(im.height, 1440);
        const tolerance = format === 'jpg' ? 8 : 1;
        const near = (got, expected) => assert.ok(got.every((v, i) => Math.abs(v - expected[i]) <= tolerance), `${mode}/${quality}/${format}: ${JSON.stringify(got)} != ${expected}`);
        im.yellow.forEach(rgb => near(rgb, [249,213,0])); near(im.white, [255,255,255]); near(im.red, [157,8,8]);
      }
      console.log(`PASS ${mode}/${quality}/${format}: ${count} ZIP image(s), solid rounded fills, XLSX, exact dimensions, busy cleared, preview unchanged`);
    }
    assert.equal(external, 0); console.log('Preview:', output);
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
