// Real browser export against source-isolated fixtures. Never writes user data.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { createRequire } = require('node:module');
const front = path.resolve(__dirname, '..'), backend = path.resolve(front, '../backend');
const backendRequire = createRequire(path.join(backend, 'package.json'));
const esbuild = backendRequire('esbuild'), { chromium } = require('playwright');
const reportPath = process.env.DALAT_TEST_REPORT;
assert.ok(reportPath, 'Set DALAT_TEST_REPORT to the isolated test generation.json');
const fixture = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
assert.ok(['isolated source-specific synthetic data/images', 'isolated live Threads Sheet audit'].includes(fixture.fixture), 'An explicitly isolated fixture is required');
assert.equal(fixture.lists.length, fixture.expectedCount || 48);
const selectedDecks = new Set(String(process.env.DALAT_TEST_DECKS || '').split(',').filter(Boolean));
if (selectedDecks.size) {
  fixture.lists = fixture.lists.filter(entry => selectedDecks.has(entry.deckId));
  fixture.expectedCount = fixture.lists.length;
  assert.ok(fixture.expectedCount, 'Selected templates must exist in the fixture');
  assert.ok(fixture.lists.some(entry => entry.deckId === 'grid-4' || entry.deckId === 'summary-note'), 'Include grid-4 or summary-note for the JPG/partial-export check');
}
const testRoot = path.dirname(reportPath), cache = path.join(fixture.root || testRoot, 'cache');
const output = path.join(testRoot, selectedDecks.size ? 'exports-selected' : 'exports'); fs.mkdirSync(output, { recursive: true });
backendRequire('ts-node').register({ project: path.join(backend, 'tsconfig.json'), transpileOnly: true });
const { getColorEditAsset } = backendRequire('./src/modules/guide/color-edit');
const sharp = backendRequire('sharp');
async function main() {
  const source = fs.readFileSync(path.join(front, 'lib/exportClient.js'), 'utf8');
  const bundle = await esbuild.build({ stdin: { contents: source + '\nexport { JSZip, collectPartnerNames, batchFolderName, uniqueBatchFolderNames, parseListSetIndex };', resolveDir: path.join(front, 'lib') }, bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'TestExport' });
  const css = [...fs.readFileSync(path.join(front, 'app/globals.css'), 'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m => fs.readFileSync(path.join(front, 'app', m[1]), 'utf8')).join('\n');
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const send = (value, type = 'application/json') => { res.setHeader('Content-Type', type); res.end(type === 'application/json' ? JSON.stringify(value) : value); };
      if (url.pathname === '/artifact') {
        const name = url.searchParams.get('deck'); assert.match(name, /^[\w-]+$/);
        const stream = fs.createWriteStream(path.join(output, name + '.zip'));
        req.pipe(stream); stream.on('finish', () => send({ ok: true })); return;
      }
      let body = ''; for await (const chunk of req) body += chunk;
      if (url.pathname === '/bundle.js') return send(bundle.outputFiles[0].text, 'text/javascript');
      if (url.pathname === '/fixture') return send(fixture);
      if (url.pathname === '/api/health') return send({ status: 'ok', sessionId: 'isolated-rotation', appVersion: backendRequire('./package.json').version });
      if (url.pathname === '/api/drive-cache/status') return send({ ready: true, phase: 'ready', destinationId: fixture.dataset.source.id, total: 200, cached: 200, completed: 200, failed: 0, percent: 100 });
      if (url.pathname.includes('runtime-performance')) return send({ mode: 'modern', totalMemoryBytes: 32 * 1024 ** 3, freeMemoryBytes: 8 * 1024 ** 3, cpuCount: 8 });
      if (url.pathname === '/api/drive-files/cache-status') {
        const ids = JSON.parse(body).fileIds; const missing = ids.filter(id => !fs.existsSync(path.join(cache, id + '.bin')));
        return send({ missing, total: ids.length, cached: ids.length - missing.length });
      }
      if (url.pathname.includes('prefetch')) throw new Error('Export must not sync or warm user data');
      if (url.pathname === '/assets/drive-file' || url.pathname === '/assets/color-edit') {
        const original = url.pathname === '/assets/color-edit' ? new URL(url.searchParams.get('source'), 'http://localhost') : url;
        const id = original.searchParams.get('id'); assert.match(id || '', /^[\w-]+$/);
        const raw = fs.readFileSync(path.join(cache, id + '.bin'));
        const bytes = url.pathname === '/assets/color-edit' ? await getColorEditAsset(raw, testRoot, url.searchParams.get('preset')) : raw;
        return send(bytes, 'image/png');
      }
      for (const prefix of ['/fonts/', '/templates/']) if (url.pathname.startsWith(prefix)) {
        const file = path.join(front, 'public', prefix, path.basename(url.pathname));
        return send(fs.readFileSync(file), prefix === '/fonts/' ? 'font/woff2' : 'image/png');
      }
      if (url.pathname !== '/') { res.statusCode = 404; return res.end(); }
      send('<!doctype html><meta charset="utf-8"><style>' + css + '</style><pre id="status">Isolated export</pre><script src="/bundle.js"></script>', 'text/html');
    } catch (error) { console.error('HARNESS', req.url, error.message); res.statusCode = 500; res.end(error.message); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const executablePath = [`${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`, `${process.env['PROGRAMFILES(X86)']}/Microsoft/Edge/Application/msedge.exe`].find(p => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const results = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('console', msg => { if (msg.type() === 'warning' || msg.type() === 'error') console.log('BROWSER:', msg.text()); });
    await page.goto('http://127.0.0.1:' + server.address().port);
    for (const deckId of [...new Set(fixture.lists.map(entry => entry.deckId))]) {
      const result = await page.evaluate(async deckId => {
        const fixture = await (await fetch('/fixture')).json();
        const expected = fixture.lists.filter(entry => entry.deckId === deckId);
        const deck = { ...fixture.dataset.decks.find(d => d.id === deckId), lists: expected.map(entry => entry.list) };
        const dataset = { ...fixture.dataset, decks: [deck] }, original = JSON.stringify(dataset);
        const folderNames = TestExport.uniqueBatchFolderNames(expected.map(({ list }) => ({ deck, list })), dataset);
        if (new Set(folderNames).size !== expected.length) throw Error('Colliding list folders');
        let inspected = [], imageCount = 0, archiveCount = 0;
        const outcome = await TestExport.exportBatch({ dataset, selectedListIds: new Set(deck.lists.map(list => list.id)), quality: 'optimized', format: 'png', skipImageErrors: true,
          onArchive: async (blob, name, exportResult) => {
            archiveCount++; const zip = await TestExport.JSZip.loadAsync(await blob.arrayBuffer(), { checkCRC32: true });
            if (exportResult.skippedLists.length) throw new Error(JSON.stringify(exportResult.skippedLists));
            for (const [entryIndex, { list, expectedPartnerNames }] of expected.entries()) {
              const prefix = folderNames[entryIndex] + '/';
              const names = Object.keys(zip.files).filter(name => name.startsWith(prefix) && !zip.files[name].dir);
              const xlsxName = names.find(name => name.endsWith('.xlsx')); if (!xlsxName) throw new Error('Missing workbook: ' + list.id);
              const xlsx = await TestExport.JSZip.loadAsync(await zip.file(xlsxName).async('uint8array'), { checkCRC32: true });
              const xml = await xlsx.file('xl/worksheets/sheet1.xml').async('string');
              const partnerNames = Array.from(new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('t'), el => el.textContent);
              const expectedNames = expectedPartnerNames || [...new Set(list.pages.flatMap(page => page.items || []).filter(item => item.isPartner).map(item => String(item.rawName || item.name).replace(/^[^:]{1,30}:\s*/, '').trim()))];
              if (JSON.stringify([...partnerNames].sort()) !== JSON.stringify([...expectedNames].sort())) throw new Error('Partner mismatch ' + list.id + ': ' + JSON.stringify({ partnerNames, expectedNames }));
              const photos = names.filter(name => /\.(png|jpg|webp)$/i.test(name));
              const textOnly = deckId === 'threads-mix-text', imagePackage = ['threads-food-local', 'threads-cafe-local', 'threads-mix-local'].includes(deckId);
              const count = textOnly ? 0 : imagePackage ? 6 : list.pages.length;
              if (photos.length !== count) throw new Error('Photo/page count ' + list.id + ': ' + photos.length + '/' + count);
              for (const name of photos) { const bitmap = await createImageBitmap(new Blob([await zip.file(name).async('uint8array')])); if (!bitmap.width || !bitmap.height) throw Error('Empty image'); bitmap.close(); imageCount++; }
              if (textOnly || imagePackage) {
                const txt = await zip.file(names.find(name => name.endsWith('noi-dung.txt'))).async('string');
                if (txt.split(/\r?\n/).filter(line => line.startsWith('- ')).length !== list.pages[0].items.length) throw Error('TXT place count');
              }
              inspected.push({ id: list.id, partners: partnerNames, photos: photos.length });
            }
            const archivedPhotos = Object.keys(zip.files).filter(name => /\.(png|jpg|webp)$/i.test(name)).length;
            if (archivedPhotos !== imageCount) throw Error(`ZIP overwrote images: ${archivedPhotos}/${imageCount}`);
            await fetch('/artifact?deck=' + deckId, { method: 'POST', body: blob });
          }
        }, { setStatus: text => document.getElementById('status').textContent = text });
        if (JSON.stringify(dataset) !== original) throw Error('Saved dataset changed during export');
        return { deckId, outcome, inspected, imageCount, archiveCount };
      }, deckId);
      results.push(result); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(results, null, 2));
      assert.equal(result.outcome.success, true, JSON.stringify(result)); assert.equal(result.archiveCount, 1);
      assert.equal(result.inspected.length, fixture.lists.filter(entry => entry.deckId === deckId).length);
      console.log('PASS export', deckId, result.inspected.length, 'XLSX; images:', result.imageCount);
    }
    const extra = await page.evaluate(async () => {
      const fixture = await (await fetch('/fixture')).json();
      const id = fixture.dataset.decks.some(d => d.id === 'summary-note') ? 'summary-note' : 'grid-4';
      const deck = { ...fixture.dataset.decks.find(d => d.id === id), lists: fixture.lists.filter(e => e.deckId === id).slice(0, 2).map(e => structuredClone(e.list)) };
      deck.lists[1].pages.forEach(page => page.items?.forEach(item => { item.isPartner = false; }));
      let jpgCount = 0, skippedReport;
      const outcome = await TestExport.exportBatch({ dataset: { ...fixture.dataset, decks: [deck] }, selectedListIds: new Set(deck.lists.map(list => list.id)), quality: 'optimized', format: 'jpg', skipImageErrors: true,
        onArchive: async (blob, name, outcome) => {
          const zip = await TestExport.JSZip.loadAsync(await blob.arrayBuffer(), { checkCRC32: true });
          skippedReport = JSON.parse(await zip.file('BAO-CAO-LIST-BO-QUA.json').async('string'));
          for (const file of Object.values(zip.files).filter(file => file.name.endsWith('.jpg'))) { const bitmap = await createImageBitmap(new Blob([await file.async('uint8array')])); if (!bitmap.width) throw Error('Invalid JPG'); bitmap.close(); jpgCount++; }
          await fetch('/artifact?deck=partial-jpg', { method: 'POST', body: blob });
        }
      }, { setStatus: text => document.getElementById('status').textContent = text });
      return { outcome, jpgCount, skippedReport, expectedSkippedId: deck.lists[1].id, expectedJpgCount: deck.lists[0].pages.length };
    });
    assert.equal(extra.outcome.success, true); assert.equal(extra.outcome.exportedLists.length, 1); assert.equal(extra.outcome.skippedLists.length, 1); assert.equal(extra.jpgCount, extra.expectedJpgCount);
    assert.ok(JSON.stringify(extra.skippedReport).includes(extra.expectedSkippedId));
    fs.writeFileSync(path.join(output, 'partial-jpg.json'), JSON.stringify(extra, null, 2));
    console.log('PASS JPG/partial export: partner-free list skipped with named report; valid list still exported.');
    // Decode every persisted exported image a second time outside the browser.
    const JSZip = require('jszip'); let decoded = 0;
    for (const name of fs.readdirSync(output).filter(name => name.endsWith('.zip'))) {
      const zip = await JSZip.loadAsync(fs.readFileSync(path.join(output, name)), { checkCRC32: true });
      for (const file of Object.values(zip.files).filter(file => /\.(png|jpg|webp)$/i.test(file.name))) { await sharp(await file.async('nodebuffer')).raw().toBuffer(); decoded++; }
    }
    assert.equal(results.reduce((sum, result) => sum + result.inspected.length, 0), fixture.expectedCount || 48);
    console.log('PASS:', fixture.lists.length, 'lists exported in', results.length, 'actual browser batches; reopened CRC-checked ZIP/XLSX, exact partners, TXT, decoded images:', decoded, 'OUTPUT=' + output);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
