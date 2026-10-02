const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('../../backend/node_modules/esbuild');
const puppeteer = require('../../backend/node_modules/puppeteer-core');

const root = path.resolve(__dirname, '../..');
const bundle = esbuild.buildSync({
  stdin: { contents: "export {renderCoverPage,renderListPage} from './frontend/lib/pageMarkup';", resolveDir: root },
  bundle: true, write: false, format: 'iife', globalName: 'ToplistTest',
}).outputFiles[0].text;
const exportSource = fs.readFileSync(path.join(root, 'frontend/lib/exportClient.js'), 'utf8');
const exportBundle = esbuild.buildSync({
  stdin: { contents: exportSource + '\nexport {prepareQualityLayout,exportQualityProfile,renderPageBlobWithRetry};\nexport {fitThreadsToplist} from "./threadsToplist";', resolveDir: path.join(root, 'frontend/lib') },
  bundle: true, write: false, format: 'iife', globalName: 'ToplistExportTest',
}).outputFiles[0].text;
const css = ['foundation.css', 'story-base.css', 'tiktok-classic-font.css', 'threads-toplist.css'].map(name =>
  fs.readFileSync(path.join(root, 'frontend/app/styles', name), 'utf8')).join('\n');
const image = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'frontend/public/templates/threads-toplist-door.png')).toString('base64');
const localFontFaces = [400, 700, 800].map(weight => `@font-face{font-family:"Be Vietnam Pro";src:url(data:font/ttf;base64,${fs.readFileSync(path.join(root, `frontend/public/fonts/BeVietnamPro-${weight}.ttf`)).toString('base64')}) format('truetype');font-weight:${weight}}`).join('');

(async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'threads-toplist-visual-'));
  const browserPath = process.env.TEST_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, userDataDir: path.join(outputDir, 'browser-profile'), args: ['--no-sandbox', '--disable-gpu', '--disable-extensions', '--no-first-run'] });
  try {
    const tab = await browser.newPage();
    await tab.setViewport({ width: 900, height: 1100, deviceScaleFactor: 1 });
    await tab.setContent(`<style>${css}\n${localFontFaces}</style><main id="test" class="batch-export-root"></main>`);
    await tab.addScriptTag({ content: bundle });
    await tab.addScriptTag({ content: exportBundle });
    const info = await tab.evaluate(async (coverImage) => {
      const cover = { type: 'cover', layoutVariant: 'threads-toplist-cover', title: 'Top list các địa điểm Đà Lạt', subtitle: '', backgroundImage: '' };
      const page = { type: 'list', layoutVariant: 'threads-toplist-page', chipText: 'Quán ăn', title: 'Quán ăn', subtitle: '', backgroundImage: '', items: Array.from({ length: 5 }, (_, i) => ({ label: String(i + 1).padStart(2, '0'), name: ['Tiệm Nướng Trong Rừng', 'Bánh Ướt Lòng Gà', 'Bún Bò 35K', 'Quán Ăn Nhỏ', 'Đồ Chiên Kun Kun'][i], metaPrimary: i === 1 ? '123 Đường Hai Bà Trưng, Phường Xuân Hương, Thành phố Đà Lạt' : `Địa chỉ ${i + 1}, Đà Lạt`, imageUrl: '' })) };
      const cafe = { ...page, chipText: 'Cà phê', title: 'Cà phê', items: page.items.map((item, i) => ({ ...item, label: String(i + 6).padStart(2, '0'), name: ['Mê Lá', 'Cà Phê Linh Lam', '1/2 Circle Coffee', 'Tiệm Cà Phê Cô Ba', 'Mirk Cà Phê'][i] })) };
      const checkin = { ...page, chipText: 'Check-in', title: 'Check-in', items: page.items.map((item, i) => ({ ...item, label: String(i + 11).padStart(2, '0'), name: ['Đồi Chè Cầu Đất', 'Dốc Sương Nguyệt Ánh', 'Hồ Tuyền Lâm', 'Đồi Ngô Quyền', 'Thung Lũng Tình Yêu'][i], metaPrimary: ['Thôn Cầu Đất, Xuân Trường – Đà Lạt', 'Sương Nguyệt Ánh, Xuân Hương – Đà Lạt', 'Hoa Hồng, Xuân Hương – Đà Lạt', 'Đồi Ngô Quyền, Cam Ly – Đà Lạt', 'Mai Anh Đào, Xuân Hương – Đà Lạt'][i] })) };
      const list = { id: 'threads-toplist-dalat-main', pages: [cover, page, cafe, checkin] };
      const root = document.getElementById('test');
      root.innerHTML = ToplistTest.renderCoverPage(cover, 0, 4, list.id, [], list).replace('/templates/threads-toplist-door.png', coverImage) + list.pages.slice(1).map((venuePage, index) => ToplistTest.renderListPage(venuePage, index + 1, 4, list.id, [], list)).join('');
      await document.fonts.ready;
      const imageNode = root.querySelector('.threads-toplist-door');
      await imageNode.decode();
      const pages = [...root.querySelectorAll('article')];
      const profiles = pages.map(article => {
        const profile = ToplistExportTest.exportQualityProfile('optimized', 'threads-toplist-dalat', 'modern');
        ToplistExportTest.prepareQualityLayout([article], profile);
        return profile;
      });
      const captures = [];
      for (let i = 0; i < pages.length; i++) {
        const blob = await ToplistExportTest.renderPageBlobWithRetry(pages[i], { ...profiles[i], imagesReady: true, embedFonts: false });
        const bitmap = await createImageBitmap(blob);
        captures.push({ width: bitmap.width, height: bitmap.height, type: blob.type });
        bitmap.close();
      }
      const sheets = pages.slice(1);
      const rowCounts = sheets.map(sheet => sheet.querySelectorAll('li').length);
      const lastRowMargins = sheets.map(sheet => sheet.getBoundingClientRect().bottom - [...sheet.querySelectorAll('li')].at(-1).getBoundingClientRect().bottom);
      const lineMetrics = sheets.map(sheet => {
        const firstRow = sheet.querySelector('li');
        const paper = sheet.querySelector('.threads-toplist-paper');
        return { firstRowOffset: firstRow.getBoundingClientRect().top - paper.getBoundingClientRect().top, nameLineHeight: getComputedStyle(firstRow.querySelector('strong')).lineHeight, addressLineHeight: getComputedStyle(firstRow.querySelector('.threads-toplist-place span')).lineHeight, rowHeight: firstRow.getBoundingClientRect().height };
      });
      return { captures, imageLoaded: imageNode.naturalWidth > 0, pageSize: pages.map(node => ({ width: node.clientWidth, height: node.clientHeight })), rowCounts, lastRowMargins, lineMetrics, horizontalOverflow: sheets.some(sheet => sheet.scrollWidth > sheet.clientWidth + 1) };
    }, image);
    assert.equal(info.imageLoaded, true);
    assert.deepEqual(info.rowCounts, [5, 5, 5]);
    assert(info.lastRowMargins.every(margin => margin > 10), 'Notebook rows must fit inside the page');
    assert(info.lineMetrics.every(({ firstRowOffset, nameLineHeight, addressLineHeight, rowHeight }) => firstRowOffset === 78 && nameLineHeight === '26px' && addressLineHeight === '26px' && rowHeight % 26 === 0), 'Name and address must sit on complete ruled-paper lines');
    assert.equal(info.horizontalOverflow, false);
    assert(info.pageSize.every(page => page.width === 397 && page.height === 496));
    assert(info.captures.every(capture => capture.width === 1080 && capture.height === 1350 && capture.type === 'image/png'));
    await (await tab.$('.threads-toplist-cover')).screenshot({ path: path.join(outputDir, 'cover.png') });
    await (await tab.$('.threads-toplist-page')).screenshot({ path: path.join(outputDir, 'places.png') });
    await (await tab.$$('.threads-toplist-page'))[2].screenshot({ path: path.join(outputDir, 'check-in.png') });
    const wrapped = await tab.evaluate(() => {
      const sheet = document.querySelector('.threads-toplist-page');
      sheet.querySelectorAll('.threads-toplist-place span')[4].textContent = 'Thôn Trạm Hành, Phường Xuân Trường, Thành phố Đà Lạt, Tỉnh Lâm Đồng, Việt Nam; '.repeat(2);
      ToplistExportTest.fitThreadsToplist(sheet, true);
      const last = [...sheet.querySelectorAll('li')].at(-1);
      return { overflow: sheet.dataset.toplistOverflow, rowMinHeight: sheet.style.getPropertyValue('--toplist-row-min-height'), margin: sheet.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom, lastRowHeight: last.getBoundingClientRect().height };
    });
    assert.equal(wrapped.overflow, 'false', 'A realistically long address must fit');
    assert.equal(wrapped.rowMinHeight, '52px', 'Borrow blank ruled lines before reducing text size');
    assert(wrapped.margin > 10 && wrapped.lastRowHeight % 26 === 0);
    await (await tab.$('.threads-toplist-page')).screenshot({ path: path.join(outputDir, 'places-wrapped.png') });
    const overflow = await tab.evaluate(() => {
      const sheet = document.querySelector('.threads-toplist-page');
      sheet.querySelectorAll('.threads-toplist-place span').forEach(span => { span.textContent = 'Đường Hai Bà Trưng, Phường Xuân Hương, Thành phố Đà Lạt, Lâm Đồng, Việt Nam '.repeat(8); });
      ToplistExportTest.fitThreadsToplist(sheet);
      let message = '';
      try { ToplistExportTest.fitThreadsToplist(sheet, true); } catch (error) { message = error.message; }
      return { flagged: sheet.dataset.toplistOverflow, message };
    });
    assert.equal(overflow.flagged, 'true', 'Long addresses must be flagged before export');
    assert.match(overflow.message, /nội dung quá dài/);
    console.log('PASS threads toplist visual/export: ' + JSON.stringify(info));
    console.log('Screenshots: ' + outputDir);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
