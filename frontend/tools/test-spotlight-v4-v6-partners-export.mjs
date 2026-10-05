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
    contents: `${source}\nexport { collectPartnerNames, createHorizontalXlsx, assertSpotlightV4V6PartnerExportReady, JSZip };`,
    resolveDir: path.join(root, 'lib'),
  },
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'SpotlightExportTest',
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
    const makeList = (version, partnerCount) => ({
      id: `spotlight-${version}-saved-list`,
      pages: Array.from({ length: 8 }, (_, index) => ({
        type: 'list',
        layoutVariant: version === 'v6-color-edit' ? 'spotlight-v6-page' : `spotlight-${version}-page`,
        ...(version === 'v6-color-edit' ? { photoPreset: 'iphone-color-edit-v1' } : {}),
        title: `Địa điểm ${index + 1}`,
        backgroundImage: `/assets/drive-file?id=venue-${index + 1}`,
        items: [{
          id: `venue-${index + 1}`,
          name: `Địa điểm ${index + 1}`,
          rawName: `Địa điểm ${index + 1}`,
          metaPrimary: 'Đà Lạt',
          imageUrl: `/assets/drive-file?id=venue-${index + 1}`,
          isPartner: index < partnerCount,
        }],
      })),
    });
    const outputs = [];
    for (const version of ['v4', 'v6', 'v6-color-edit']) {
      for (const partnerCount of [0, 3, 4]) {
        const list = JSON.parse(JSON.stringify(makeList(version, partnerCount)));
        const names = SpotlightExportTest.collectPartnerNames(list);
        let error = '';
        try { SpotlightExportTest.assertSpotlightV4V6PartnerExportReady(list, `spotlight-${version}`); }
        catch (caught) { error = caught.message; }
        let cellCount = 0;
        if (partnerCount === 4) {
          const blob = await SpotlightExportTest.createHorizontalXlsx(names);
          const zip = await SpotlightExportTest.JSZip.loadAsync(blob);
          const sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string');
          cellCount = (sheetXml.match(/<c r="[A-Z]+1"/g) || []).length;
        }
        outputs.push({ version, partnerCount, names: names.length, cellCount, error });
      }
    }
    // Các biến thể V6 khác dùng cùng renderer nhưng có quy tắc đối tác riêng.
    SpotlightExportTest.assertSpotlightV4V6PartnerExportReady(makeList('v6', 0), 'spotlight-v6-green');
    return outputs;
  });
  for (const result of results) {
    assert.equal(result.names, result.partnerCount);
    if (result.partnerCount < 4) assert.match(result.error, new RegExp(`${result.partnerCount}/4 đối tác`));
    else {
      assert.equal(result.error, '');
      assert.equal(result.cellCount, 4);
    }
  }
  console.log('PASS Spotlight V4/V6 export: list cũ 0/3 bị chặn; list 4 đối tác ghi đúng 4 ô XLSX.');
} finally {
  await browser.close();
}
