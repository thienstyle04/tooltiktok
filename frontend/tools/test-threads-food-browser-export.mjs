import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import http from 'node:http';
import { compactThreadsLocalAddress } from '../lib/threadsFoodExport.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'lib/exportClient.js'), 'utf8');
const bundle = await esbuild.build({
  stdin: {
    contents: `${source}\nexport { createHorizontalXlsx, addThreadsFoodFiles, JSZip };`,
    resolveDir: path.join(root, 'lib'),
  },
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'ThreadsFoodExportTest',
  write: false,
});
const executablePath = [
  `${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`,
  `${process.env['PROGRAMFILES(X86)']}/Microsoft/Edge/Application/msedge.exe`,
].find((candidate) => candidate && fs.existsSync(candidate));
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
let photoServer;

try {
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  if (process.env.DALAT_TEST_REPORT) {
    const fixture = JSON.parse(fs.readFileSync(process.env.DALAT_TEST_REPORT, 'utf8'));
    const actualPhotos = {};
    const servedFiles = new Map();
    const actualCache = path.join(path.dirname(process.env.DALAT_TEST_REPORT), 'cache');
    if (fs.existsSync(actualCache)) {
      const backendRequire = createRequire(path.join(root, '../backend/package.json'));
      backendRequire('ts-node').register({ project: path.join(root, '../backend/tsconfig.json'), transpileOnly: true });
      const { getColorEditAsset } = backendRequire('./src/modules/guide/color-edit');
      for (const { list } of fixture.lists) for (const item of list.pages[0].items.filter(item => item.imageUrl)) {
        const id = new URL(item.imageUrl, 'http://localhost').searchParams.get('id');
        const raw = fs.readFileSync(path.join(actualCache, id + '.bin'));
        const meta = JSON.parse(fs.readFileSync(path.join(actualCache, id + '.json'), 'utf8'));
        const key = (list.photoPreset || 'original') + ':' + item.imageUrl;
        if (actualPhotos[key]) continue;
        const body = list.photoPreset ? await getColorEditAsset(raw, path.dirname(process.env.DALAT_TEST_REPORT), list.photoPreset) : raw;
        const servedPath = list.photoPreset ? path.join(actualCache, id + '.export-test.png') : path.join(actualCache, id + '.bin');
        if (list.photoPreset) fs.writeFileSync(servedPath, body);
        const route = '/' + servedFiles.size;
        servedFiles.set(route, servedPath);
        actualPhotos[key] = { route, extension: list.photoPreset ? 'png' : /png/.test(meta.contentType) ? 'png' : /webp/.test(meta.contentType) ? 'webp' : 'jpg' };
      }
      photoServer = http.createServer((request, response) => {
        response.setHeader('Access-Control-Allow-Origin', '*');
        const file = servedFiles.get(request.url);
        if (!file) { response.writeHead(404); response.end(); return; }
        fs.createReadStream(file).pipe(response);
      });
      await new Promise(resolve => photoServer.listen(0, '127.0.0.1', resolve));
      const baseUrl = 'http://127.0.0.1:' + photoServer.address().port;
      for (const photo of Object.values(actualPhotos)) photo.url = baseUrl + photo.route;
    }
    const batchResults = await page.evaluate(async ({ entries, actualPhotos }) => {
      const results = [];
      for (const sourceId of ['dalat', 'dalat-test']) {
        const batch = new ThreadsFoodExportTest.JSZip();
        const selected = entries.filter(entry => entry.sourceId === sourceId);
        for (const { list } of selected) await ThreadsFoodExportTest.addThreadsFoodFiles(
          batch.folder(list.id), list, async item => {
            const real = actualPhotos[(list.photoPreset || 'original') + ':' + item.imageUrl];
            return real ? { blob: await (await fetch(real.url)).blob(), extension: real.extension }
              : { blob: new Uint8Array([255, 216, 255]), extension: 'jpg' };
          },
          name => name.replaceAll(' ', '-'), ThreadsFoodExportTest.createHorizontalXlsx);
        const reopened = await ThreadsFoodExportTest.JSZip.loadAsync(await batch.generateAsync({ type: 'blob' }));
        for (const { list } of selected) {
          const folder = reopened.folder(list.id);
          const workbook = await ThreadsFoodExportTest.JSZip.loadAsync(await folder.file('doi-tac.xlsx').async('blob'));
          const xml = await workbook.file('xl/worksheets/sheet1.xml').async('string');
          const txt = await folder.file('noi-dung.txt').async('string');
          const photoFiles = Object.keys(reopened.files).filter(name => name.startsWith(list.id + '/anh/') && !reopened.files[name].dir);
          let decoded = 0;
          if (Object.keys(actualPhotos).length) for (const name of photoFiles) {
            const bitmap = await createImageBitmap(new Blob([await reopened.file(name).async('uint8array')]));
            if (bitmap.width && bitmap.height) decoded++;
            bitmap.close();
          }
          results.push({ sourceId, id: list.id, xml, txt,
            names: Array.from(new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('t'), node => node.textContent),
            decoded,
            cells: (xml.match(/<c r="[A-Z]+1"/g) || []).length,
            photos: Object.keys(reopened.files).filter(name => name.startsWith(list.id + '/anh/') && !reopened.files[name].dir).length });
        }
      }
      return results;
    }, { entries: fixture.lists, actualPhotos });
    assert.equal(batchResults.length, 16);
    for (const result of batchResults) {
      const original = fixture.lists.find(entry => entry.sourceId === result.sourceId && entry.list.id === result.id).list;
      const partners = original.pages[0].items.filter(item => item.isPartner);
      assert.equal(result.cells, partners.length);
      assert.equal(result.photos, 6);
      assert.deepEqual(result.names, partners.map(item => item.name));
      if (Object.keys(actualPhotos).length) assert.equal(result.decoded, 6);
      assert.ok(!result.xml.includes('Xuân Hương'));
      assert.equal(result.txt.split(/\r?\n/).filter(line => line.startsWith('- ')).length, 10);
      for (const partner of partners) assert.ok(result.txt.includes('(' + compactThreadsLocalAddress(partner.metaPrimary) + ')'));
      assert.ok(!result.txt.includes('Đường thử'));
    }
    console.log('PASS: 16 saved backend lists exported in two source batches; reopened actual XLSX/TXT/ZIP: partner cells/count/order, compact addresses, 6 photos.');
  }
  const results = await page.evaluate(async () => {
    const items = Array.from({ length: 10 }, (_, index) => ({
      name: `Quán ${index + 1}`,
      sourceSectionKey: ['quan_an', 'check_in', 'cafe', 'khu_du_lich', 'homestay'][index % 5],
      metaPrimary: index % 2 === 0 ? 'Tổ 19 An Sơn, Xuân Hương - Đà Lạt' : '',
      isPartner: index % 2 === 0,
      isLocal: index % 2 !== 0,
      imageUrl: index < 6 ? `https://example.invalid/${index}.jpg` : '',
      imageMapped: index < 6,
      imageSource: index < 6 ? 'manual' : 'fallback',
    }));
    const outputs = [];
    for (const id of ['threads-food-local-caption-01', 'threads-cafe-local-caption-01', 'threads-mix-local-caption-01', 'threads-mix-text-caption-01']) {
      const textOnly = id.startsWith('threads-mix-text');
      const sourceItems = textOnly
        ? [...items, { ...items[0], name: 'Quán 11' }, { ...items[1], name: 'Quán 12' }]
          .map((item) => ({ ...item, isLocal: false, imageUrl: '', imageMapped: false, imageSource: 'fallback' }))
        : items;
      const list = { id, postCaption: 'Đi quán nào trước?', pages: [{ type: 'list', items: sourceItems }] };
      const zip = new ThreadsFoodExportTest.JSZip();
      await ThreadsFoodExportTest.addThreadsFoodFiles(
        zip, list, async () => ({ blob: new Uint8Array([0xff, 0xd8, 0xff]), extension: 'jpg' }),
        (name) => name.replaceAll(' ', '-'), ThreadsFoodExportTest.createHorizontalXlsx,
      );
      const archive = await ThreadsFoodExportTest.JSZip.loadAsync(await zip.generateAsync({ type: 'blob' }));
      const xlsx = await ThreadsFoodExportTest.JSZip.loadAsync(await archive.file('doi-tac.xlsx').async('blob'));
      const xml = await xlsx.file('xl/worksheets/sheet1.xml').async('string');
      const txt = await archive.file('noi-dung.txt').async('string');
      outputs.push({
        id,
        textOnly,
        files: Object.keys(archive.files).filter((name) => !archive.files[name].dir),
        partnerCells: (xml.match(/<c r="[A-Z]+1"/g) || []).length,
        partnerNames: (xml.match(/Quán \d+/g) || []).length,
        xlsxContainsAddress: xml.includes('Tổ 19 An Sơn') || xml.includes('Xuân Hương'),
        txt,
      });
    }
    return outputs;
  });
  for (const result of results) {
    assert.equal(result.files.length, result.textOnly ? 2 : 8);
    assert.equal(result.partnerCells, result.textOnly ? 6 : 5);
    assert.equal(result.partnerNames, result.textOnly ? 6 : 5);
    assert.equal(result.xlsxContainsAddress, false);
    assert.ok(result.txt.includes('- Quán 1 (Xuân Hương - Đà Lạt)'));
    assert.ok(!result.txt.includes('Tổ 19 An Sơn'));
    assert.ok(result.txt.includes(result.textOnly ? '- Quán 12' : '- Quán 10'));
  }
  console.log('Threads food/cafe/mix/text browser ZIP OK: XLSX chỉ tên đối tác; mẫu chữ không có ảnh.');
} finally {
  await browser.close();
  if (photoServer) await new Promise(resolve => photoServer.close(resolve));
}
