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
    contents: `${source}\nexport { collectPartnerNames, createHorizontalXlsx, JSZip };`,
    resolveDir: path.join(root, 'lib'),
  },
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'TestExport',
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
  const result = await page.evaluate(async () => {
    const v5Pages = Array.from({ length: 13 }, (_, index) => ({
      type: 'list',
      layoutVariant: 'spotlight-v5-place',
      title: `Địa điểm ${index + 1}`,
      subtitle: '',
      chipText: '',
      chipTone: 'slate',
      // Mô phỏng trạng thái thật sau refresh: ảnh item đổi nhưng snapshot trang không đổi.
      backgroundImage: `/assets/drive-file?id=visible-snapshot-${index + 1}`,
      items: [{
        id: `place-${index + 1}`,
        name: `Địa điểm ${index + 1}`,
        rawName: `Địa điểm ${index + 1}`,
        metaPrimary: 'Đà Lạt',
        imageUrl: `/assets/drive-file?id=refreshed-folder-image-${index + 1}`,
        isPartner: index < 7,
      }],
    }));
    const v5List = { id: 'v5-partner-export', pages: v5Pages, captionHashtags: [] };
    const names = TestExport.collectPartnerNames(v5List);
    const workbookBlob = await TestExport.createHorizontalXlsx(names);
    const zip = await TestExport.JSZip.loadAsync(workbookBlob);
    const sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string');

    const stableOtherTemplate = {
      id: 'other-template',
      pages: [{
        ...v5Pages[0],
        layoutVariant: 'spotlight-v6-map-place',
        items: [{ ...v5Pages[0].items[0], isPartner: true }],
      }],
      captionHashtags: [],
    };
    return {
      names,
      cellCount: (sheetXml.match(/<c r="[A-Z]+1"/g) || []).length,
      hasFirst: sheetXml.includes('Địa điểm 1'),
      hasSeventh: sheetXml.includes('Địa điểm 7'),
      otherTemplateNames: TestExport.collectPartnerNames(stableOtherTemplate),
    };
  });

  assert.equal(result.names.length, 7);
  assert.equal(new Set(result.names).size, 7);
  assert.equal(result.cellCount, 7);
  assert.equal(result.hasFirst, true);
  assert.equal(result.hasSeventh, true);
  assert.deepEqual(result.otherTemplateNames, []);
  console.log('PASS Spotlight V5 partners export: 7 tên sau refresh, XLSX đủ 7 ô; mẫu khác giữ nguyên bộ lọc ảnh.');
} finally {
  await browser.close();
}
