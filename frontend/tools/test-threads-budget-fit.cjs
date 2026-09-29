const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('../../backend/node_modules/esbuild');
const puppeteer = require('../../backend/node_modules/puppeteer-core');
const root = path.resolve(__dirname, '../..');
const bundle = esbuild.buildSync({ stdin: { contents: "export {renderListPage} from './frontend/lib/pageMarkup'; export {fitItineraryNote} from './frontend/lib/itineraryNote'; export {applyPageTextScale,resetPageTextScale} from './frontend/lib/pageTextScale';", resolveDir: root }, bundle: true, write: false, format: 'iife', globalName: 'BudgetTest' }).outputFiles[0].text;
const exportSource = fs.readFileSync(path.join(root, 'frontend/lib/exportClient.js'), 'utf8');
const exportBundle = esbuild.buildSync({ stdin: { contents: exportSource + '\nexport {prepareQualityLayout,exportQualityProfile,renderPageBlobWithRetry};', resolveDir: path.join(root, 'frontend/lib') }, bundle: true, write: false, format: 'iife', globalName: 'BudgetExportTest' }).outputFiles[0].text;

(async () => {
  const browserPath = process.env.TEST_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'threads-budget-fit-'));
  const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, userDataDir: path.join(outputDir, 'browser-profile'), args: ['--no-sandbox', '--disable-gpu', '--disable-extensions', '--no-first-run'] });
  try {
    const tab = await browser.newPage();
    await tab.setViewport({ width: 1000, height: 1400 });
    await tab.setContent(`<style>${fs.readFileSync(path.join(root, 'frontend/app/styles/grid-templates.css'), 'utf8')}\n${fs.readFileSync(path.join(root, 'frontend/app/styles/itinerary-note.css'), 'utf8')}</style><main id="test" class="batch-export-root"></main>`);
    await tab.addScriptTag({ content: bundle });
    await tab.addScriptTag({ content: exportBundle });
    for (const [mode, long] of [['modern', false], ['modern', true], ['legacy', false], ['original', false]]) {
      const info = await tab.evaluate(async (mode, long) => {
        const groups = ['Di chuyển', 'Lưu trú', 'Ngày 1', 'Ngày 2', 'Ngày 3'];
        const counts = [2, 1, 4, 4, 4];
        const items = groups.flatMap((group, index) => Array.from({ length: counts[index] }, (_, item) => ({
          label: group,
          name: index === 1
            ? (long ? `Homestay trên đường về khu trung tâm Đà Lạt ${item + 1}` : ['MerPerle Dalat Hotel', 'Homey Villa'][item])
            : `${long ? 'Tiệm cà phê trên đường về khu trung tâm Đà Lạt · ' : ''}${group} · Địa điểm ${item + 1}`,
          metaSecondary: index === 1 ? '200.000 đ/người' : '120.000 đ',
        })));
        const page = { type: 'list', layoutVariant: 'itinerary-note-threads-budget', title: 'Đà Lạt 3N2Đ', subtitle: '', textFontSize: 13.44, items };
        const root = document.getElementById('test');
        root.innerHTML = `<div class="list-preview-grid batch-export-grid">${BudgetTest.renderListPage(page, 0, 1, 'budget-main')}</div>`;
        const article = root.querySelector('article');
        const profile = BudgetExportTest.exportQualityProfile(mode === 'original' ? 'original' : 'optimized', 'itinerary-note-threads-budget-3n2d', mode);
        BudgetExportTest.prepareQualityLayout([article], profile);
        BudgetTest.resetPageTextScale(root);
        BudgetTest.fitItineraryNote(root);
        BudgetTest.applyPageTextScale(root);
        BudgetTest.fitItineraryNote(root, true);
        const content = article.querySelector('.in-content');
        const table = article.querySelector('table');
        let captured = null;
        if (!long) {
          const blob = await BudgetExportTest.renderPageBlobWithRetry(article, { ...profile, imagesReady: true, embedFonts: false });
          const bitmap = await createImageBitmap(blob);
          const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
          const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let ink = 0; for (let i = 0; i < pixels.length; i += 64) if (pixels[i] < 200 || pixels[i + 1] < 200 || pixels[i + 2] < 200) ink++;
          captured = { width: bitmap.width, height: bitmap.height, type: blob.type, ink };
          bitmap.close();
        }
        return {
          width: article.getBoundingClientRect().width, height: article.getBoundingClientRect().height,
          overflow: content.scrollHeight > content.clientHeight + 1 || content.scrollWidth > content.clientWidth + 1,
          tableBottom: table.getBoundingClientRect().bottom, contentBottom: content.getBoundingClientRect().bottom,
          rows: article.querySelectorAll('.threads-budget-detail').length,
          images: article.querySelectorAll('img').length,
          total: article.querySelector('.threads-budget-grand')?.textContent,
          clippedPrices: [...article.querySelectorAll('.threads-budget-money')].filter(cell => cell.scrollWidth > cell.clientWidth + 1).length,
          font: article.style.getPropertyValue('--in-font-size'),
          captured,
        };
      }, mode, long);
      assert.equal(info.width, 810);
      assert.equal(info.height, 1080);
      assert.equal(info.overflow, false);
      assert(info.tableBottom <= info.contentBottom + 1);
      assert.equal(info.rows, 15);
      assert.equal(info.images, 0);
      assert.equal(info.clippedPrices, 0);
      assert(info.total.includes('1.880.000 đ'));
      assert(!info.total.includes('Tạm tính'));
      if (!long) { assert.equal(info.captured.width, 1080); assert.equal(info.captured.height, 1440); assert.equal(info.captured.type, 'image/png'); assert(info.captured.ink > 1000); }
      if (mode === 'modern') {
        await tab.evaluate(() => document.getElementById('test').classList.remove('batch-export-root'));
        await (await tab.$('article')).screenshot({ path: path.join(outputDir, long ? 'long.png' : 'normal.png') });
        await tab.evaluate(() => document.getElementById('test').classList.add('batch-export-root'));
      }
      console.log(JSON.stringify({ mode, long, ...info }));
    }
    console.log(`Screenshots: ${outputDir}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
