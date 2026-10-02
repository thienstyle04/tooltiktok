import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const root = path.resolve(import.meta.dirname, '..');
const bundle = await esbuild.build({
  stdin: {
    contents: "export { renderItineraryNotePage, fitItineraryNote } from './lib/itineraryNote.js';",
    resolveDir: root,
  },
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'DarkNoteTest',
  write: false,
});
const exportSource = fs.readFileSync(path.join(root, 'lib/exportClient.js'), 'utf8');
const exportBundle = await esbuild.build({
  stdin: {
    contents: `${exportSource}\nexport { addListMetadataFiles, assertItineraryNoteDarkPartnerExportReady, JSZip };`,
    resolveDir: path.join(root, 'lib'),
  },
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'DarkNoteExportTest',
  write: false,
});
const browserPath = [
  `${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`,
  `${process.env['PROGRAMFILES(X86)']}/Microsoft/Edge/Application/msedge.exe`,
].find((candidate) => candidate && fs.existsSync(candidate));
const browser = await chromium.launch({ headless: true, ...(browserPath ? { executablePath: browserPath } : {}) });

try {
  const page = await browser.newPage();
  const css = fs.readFileSync(path.join(root, 'app/styles/itinerary-note.css'), 'utf8');
  await page.setContent(`<html><head><style>${css}</style></head><body></body></html>`);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.addScriptTag({ content: exportBundle.outputFiles[0].text });
  const result = await page.evaluate(async () => {
    const names = ['Tiệm Nướng Trong Rừng', 'Mê Lá', 'Đường Nguyễn Khuyến', 'Thung Lũng Tình Yêu',
      'Bún Bò 35K', 'Khu Du Lịch Lá Phong', 'Gạch Cà Phê', 'Đường Cô Bắc - Cô Giang',
      'Núi Langbiang', 'Vị Bản', 'Đêm Nhạc Bình Minh Ơi'];
    const items = names.map((name, index) => ({
      label: [0, 4, 9].includes(index) ? 'Ăn tại' : [1, 6].includes(index) ? 'Ghé cà phê' : 'Ghé',
      name,
      metaPrimary: index === 10 ? 'Hoàng Hoa Thám, Xuân Hương – Đà Lạt' : 'Tổ 19 An Sơn, Xuân Hương - Đà Lạt',
      isPartner: [0, 1, 9, 10].includes(index),
    }));
    const dayTwoNames = ['Tầm Bóp Lẩu Nướng', '1/2 Circle Coffee', 'Đường Hàn Thuyên', 'Núi Langbiang',
      'Hủ Tiếu Mực Ông Diệm', 'The Roof by Banla Dalat', 'Mirk cà phê', 'Rừng Thông',
      'Puppy Farm', "D’Lart Garden", 'Peng Quán'];
    const dayTwoItems = dayTwoNames.map((name, index) => ({
      ...items[index], name, isPartner: [0, 1, 9].includes(index),
      metaPrimary: index === 1 ? 'Hẻm 4, Đặng Thái Thân, Xuân Hương - Đà Lạt' : items[index].metaPrimary,
    }));
    const render = (layoutVariant, title, pageItems = items, pageIndex = 0) => {
      document.body.innerHTML = DarkNoteTest.renderItineraryNotePage({
        layoutVariant, title, chipText: `Ngày ${pageIndex + 1}`, items: pageItems,
      }, pageIndex, 'itinerary-note-dark-caption-01');
      const article = document.querySelector('article');
      DarkNoteTest.fitItineraryNote(article, true);
      return {
        background: getComputedStyle(article).backgroundColor,
        text: getComputedStyle(article).color,
        home: getComputedStyle(article.querySelector('.in-home')).backgroundColor,
        titleCount: article.querySelectorAll('h1').length,
        day: article.querySelector('.in-day')?.textContent,
        count: article.querySelectorAll('li').length,
        bottomGap: Math.round(article.querySelector('.in-content').getBoundingClientRect().bottom
          - article.querySelector('li:last-child').getBoundingClientRect().bottom),
        firstRow: article.querySelector('li')?.textContent,
        fifthRow: article.querySelectorAll('li')[4]?.textContent,
        lastRow: article.querySelector('li:last-child')?.textContent,
        overflow: article.dataset.noteOverflow,
      };
    };
    const list = {
      id: 'itinerary-note-dark-caption-01',
      title: 'Lịch trình Note nền đen',
      postCaption: 'Đi lịch này ổn khum?',
      pages: [0, 1].map((day) => ({
        type: 'list', layoutVariant: 'itinerary-note-dark-day',
        items: items.map((item, index) => ({
          ...item, name: `Ngày ${day + 1} - ${item.name}`,
          isPartner: index < (day === 0 ? 4 : 3),
        })),
      })),
    };
    DarkNoteExportTest.assertItineraryNoteDarkPartnerExportReady(list, 'itinerary-note-dark');
    const zip = new DarkNoteExportTest.JSZip();
    await DarkNoteExportTest.addListMetadataFiles(zip, list, 1, 'itinerary-note-dark');
    const xlsxPath = Object.keys(zip.files).find((file) => /^partners-.*\.xlsx$/.test(file));
    const xlsx = await DarkNoteExportTest.JSZip.loadAsync(await zip.file(xlsxPath).async('blob'));
    const sheetXml = await xlsx.file('xl/worksheets/sheet1.xml').async('string');
    list.pages[1].items[2].isPartner = false;
    let missingPartnerError = '';
    try { DarkNoteExportTest.assertItineraryNoteDarkPartnerExportReady(list, 'itinerary-note-dark'); }
    catch (error) { missingPartnerError = error.message; }
    return {
      dark: render('itinerary-note-dark-day', 'Tiêu đề không được hiện'),
      darkDayTwo: render('itinerary-note-dark-day', '', dayTwoItems, 1),
      original: render('itinerary-note-day', 'Đi Đà Lạt tháng 10'),
      xlsxPartnerCells: (sheetXml.match(/<c r="[A-Z]+1"/g) || []).length,
      xlsxFileName: xlsxPath,
      xlsxHasAddress: sheetXml.includes('An Sơn') || sheetXml.includes('Xuân Hương'),
      missingPartnerError,
    };
  });
  assert.equal(result.dark.background, 'rgb(0, 0, 0)');
  assert.equal(result.dark.text, 'rgb(255, 255, 255)');
  assert.equal(result.dark.home, 'rgb(255, 255, 255)');
  assert.equal(result.dark.titleCount, 0);
  assert.equal(result.dark.day, undefined);
  assert.equal(result.dark.count, 11);
  assert.match(result.dark.firstRow, /Tiệm Nướng Trong Rừng \(Xuân Hương - Đà Lạt\)/);
  assert.ok(!result.dark.firstRow.includes('Tổ 19 An Sơn'));
  assert.equal(result.dark.fifthRow, 'Ăn tại Bún Bò 35K');
  assert.match(result.dark.lastRow, /Đêm Nhạc Bình Minh Ơi \(Xuân Hương - Đà Lạt\)/);
  assert.equal(result.dark.overflow, 'false');
  assert.equal(result.dark.bottomGap, 40);
  assert.equal(result.darkDayTwo.day, undefined);
  assert.equal(result.darkDayTwo.count, 11);
  assert.equal(result.darkDayTwo.overflow, 'false');
  assert.equal(result.darkDayTwo.bottomGap, 40);
  assert.equal(result.original.background, 'rgb(255, 255, 255)');
  assert.equal(result.original.titleCount, 1);
  assert.match(result.original.firstRow, /Tổ 19 An Sơn/);
  assert.equal(result.xlsxPartnerCells, 7);
  assert.match(result.xlsxFileName, /^partners-.*\.xlsx$/);
  assert.equal(result.xlsxHasAddress, false);
  assert.match(result.missingPartnerError, /6\/7 đối tác/);
  console.log(`Dark itinerary Note browser preview/export OK: 11 rows, ${result.dark.bottomGap}px bottom gap, 7 names in XLSX.`);
} finally {
  await browser.close();
}
