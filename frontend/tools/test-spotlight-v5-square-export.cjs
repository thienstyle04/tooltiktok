// Spotlight V5 xuất ảnh tràn viền: góc bo của thẻ xem trước không được cắt vào ảnh.
// Kiểm tra bằng trình duyệt thật với CSS của app: 4 góc PNG/JPG phải đặc, đúng màu nền.
// Đối chứng: một trang thường có bo góc vẫn bị cắt góc như trước (test nhận ra được bo góc).
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const esbuild = require('../../backend/node_modules/esbuild');
const puppeteer = require('../../backend/node_modules/puppeteer-core');
const styles = path.resolve(__dirname, '../app/styles');
(async () => {
  const exportTest = require('./exportClientTestHelper.cjs');
  const bundle = esbuild.buildSync({ ...exportTest.bundleOptions({ names: ['exportQualityProfile', 'renderPageBlobWithRetry'] }), bundle: true, write: false, format: 'iife', globalName: 'V5Test' });
  const css = ['story-base.css', 'template-variants-v2.css'].map(name => fs.readFileSync(path.join(styles, name), 'utf8')).join('\n');
  const executablePath = process.env.TEST_BROWSER_PATH || [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<div id="root">
      ${['spotlight-v5-cover', 'spotlight-v5-playlist', 'spotlight-v5-place'].map(kind => `<article class="story-page ${kind}" data-kind="${kind}" style="background:#c81e1e"></article>`).join('')}
      <article class="story-page" data-kind="rounded-control" style="width:397px;height:496px;border-radius:18px;background:#c81e1e"></article></div>`);
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const results = await page.evaluate(async () => {
      const out = [];
      for (const node of document.querySelectorAll('[data-kind]')) {
        // Preview card really is rounded (the bug's source), before export.
        const previewRadius = getComputedStyle(node).borderTopLeftRadius;
        for (const format of ['png', 'jpg']) {
          const profile = V5Test.exportQualityProfile('optimized', 'spotlight-v5', 'modern', format);
          node.dataset.exportName = '01-test.' + format;
          const blob = await V5Test.renderPageBlobWithRetry(node, { ...profile, imagesReady: true, embedFonts: false });
          const bitmap = await createImageBitmap(blob);
          const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
          const w = bitmap.width, h = bitmap.height;
          const corners = [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]].map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
          out.push({ kind: node.dataset.kind, format, previewRadius, w, h, corners });
          bitmap.close();
          node.style.removeProperty('border-radius');
          if (node.dataset.kind === 'rounded-control') node.style.borderRadius = '18px';
        }
      }
      return out;
    });
    const red = ([r, g, b, a]) => a === 255 && r > 170 && g < 70 && b < 70;
    for (const r of results) {
      if (r.kind === 'rounded-control') {
        assert.ok(!r.corners.every(red), `control ${r.format}: a rounded page must still be clipped (test sensitivity)`);
        continue;
      }
      assert.equal(r.previewRadius, '18px', `${r.kind}: preview keeps its rounded card`);
      assert.ok(r.corners.every(red), `${r.kind} ${r.format}: corners must be solid page colour, got ${JSON.stringify(r.corners)}`);
      assert.equal(r.w * 5, r.h * 4, `${r.kind} ${r.format}: 4:5 output (${r.w}×${r.h})`);
    }
    console.log(`PASS Spotlight V5 square export: cover/playlist/place PNG+JPG corners solid (${results.find(r => r.kind === 'spotlight-v5-cover').w}×${results.find(r => r.kind === 'spotlight-v5-cover').h}), preview still rounded, control rounded page still clipped.`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
