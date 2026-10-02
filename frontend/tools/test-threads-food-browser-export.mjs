import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

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

try {
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
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
}
