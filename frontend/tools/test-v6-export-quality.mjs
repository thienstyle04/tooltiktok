import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'lib/exportClient.js'), 'utf8');
const bundle = await esbuild.build({ stdin: { contents: source + '\nexport { exportQualityProfile, prepareQualityLayout, resizeImageBlobForExport, fitImageBlobToElement, renderPageBlobWithRetry, mapExportWithSequentialRetry };', resolveDir: path.join(root, 'lib') }, bundle: true, platform: 'browser', format: 'iife', globalName: 'TestExport', write: false });
const executablePath = [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 2100 } });
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(async () => {
    const t = TestExport;
    const check = (ok, message) => { if (!ok) throw new Error(message); };
    const standard = t.exportQualityProfile('optimized', 'spotlight-v4');
    for (const id of ['spotlight-v4', 'spotlight-v5', 'spotlight-v6', 'spotlight-v6-green', 'summary-note', 'itinerary-note-2days']) {
      const legacy = t.exportQualityProfile('optimized', id, 'legacy');
      check(legacy.compatibility && legacy.pixelRatio === 2.5 && legacy.sourceImageMaxDimension === 3000 && legacy.sourceImageFormat === 'image/jpeg' && legacy.sourceImageQuality === 0.97, 'Wrong compatible image profile');
      check(legacy.imagePrepareConcurrency === 1 && legacy.captureConcurrency === 1 && legacy.renderChunkSize === 1, 'Wrong compatible concurrency');
      check(t.exportQualityProfile('original', id, 'legacy') === t.exportQualityProfile('original'), 'Compatibility changed Original');
    }
    for (const id of ['spotlight-v4', 'spotlight-v5', 'summary-note', 'itinerary-note-2days']) {
      const next = t.exportQualityProfile('optimized', id);
      check(next.losslessSource && next.sourceImageMaxDimension === 0 && next.sourceImageFormat === 'image/png', 'Missing rollout profile');
      check(t.exportQualityProfile('original', id) === t.exportQualityProfile('original'), 'Changed Original');
    }
    check(t.exportQualityProfile('original', 'spotlight-v6') === t.exportQualityProfile('original'), 'Changed Original');
    const profile = t.exportQualityProfile('optimized', 'spotlight-v6');
    const greenProfile = t.exportQualityProfile('optimized', 'spotlight-v6-green');
    check(greenProfile.fullResolutionV6 && greenProfile.pixelRatio === profile.pixelRatio && greenProfile.sourceImageFormat === 'image/png', 'Green V6 does not share full-resolution profile');
    check(profile.sourceImageMaxDimension === 0 && profile.sourceImageFormat === 'image/png', 'Wrong source policy');
    check(profile.captureConcurrency === standard.captureConcurrency && profile.renderChunkSize === standard.renderChunkSize, 'Changed scheduling');
    const source = document.createElement('canvas'); source.width = 3600; source.height = 2400;
    const ctx = source.getContext('2d'); ctx.fillStyle = '#4cba75'; ctx.fillRect(0, 0, 3600, 2400);
    ctx.fillStyle = '#fcfcfc'; for (let x = 0; x < 3600; x += 12) ctx.fillRect(x, 0, 2, 2400);
    const blob = await new Promise(resolve => source.toBlob(resolve, 'image/png'));
    const unchanged = await t.resizeImageBlobForExport(blob, { maxDimension: 0, imageFormat: 'image/png' });
    check(unchanged === blob, 'Recompressed original source');
    const url = URL.createObjectURL(blob);
    const node = document.createElement('article'); node.className = 'story-page spotlight-v6-page';
    node.style.cssText = 'position:relative;width:200px;height:355px;overflow:hidden;background:white;';
    node.innerHTML = '<img style="position:absolute;width:100%;height:100%;object-fit:cover;object-position:25% 60%"><div style="position:absolute;top:50%;left:8%;right:8%;font: bold 13px Arial;color:white;text-align:center">Tên địa điểm — Địa chỉ nguyên bản</div>';
    document.body.appendChild(node); const img = node.querySelector('img'); img.src = url; await img.decode();
    t.prepareQualityLayout([node], profile);
    check(node.getBoundingClientRect().width === 397, 'Preview size used');
    const fitted = await t.fitImageBlobToElement(blob, img, { fitImagesToElement: true, fitPixelRatio: profile.pixelRatio, imageFormat: profile.sourceImageFormat, imageQuality: 1 });
    check(fitted.type === 'image/png', 'JPEG intermediate');
    const bitmap = await createImageBitmap(fitted); check(bitmap.width === 1080 && bitmap.height === 1920, 'Wrong crop dimensions'); bitmap.close();
    const cropUrl = URL.createObjectURL(fitted); img.src = cropUrl; await img.decode();
    const sizes = [], start = performance.now();
    for (let i = 0; i < 14; i++) {
      node.className = 'story-page ' + ['spotlight-v6-cover', 'spotlight-v6-image', 'spotlight-v6-page'][i % 3];
      node.style.borderRadius = '18px';
      const selectedProfile = i < 7 ? profile : t.exportQualityProfile('original', 'spotlight-v6');
      t.prepareQualityLayout([node], selectedProfile);
      const output = await t.renderPageBlobWithRetry(node, { ...selectedProfile, preferHtml2Canvas: true, imagesReady: true, embedFonts: false });
      const image = await createImageBitmap(output);
      check(image.width === 1080 && image.height === 1920, 'Wrong output dimensions');
      const probe = document.createElement('canvas'); probe.width = image.width; probe.height = image.height;
      const pixels = probe.getContext('2d'); pixels.drawImage(image, 0, 0);
      for (const [x, y] of [[0, 0], [1079, 0], [0, 1919], [1079, 1919]]) {
        check(pixels.getImageData(x, y, 1, 1).data[3] === 255, 'Rounded/transparent V6 corner');
      }
      probe.width = 0; probe.height = 0;
      image.close(); sizes.push(output.size);
    }
    const variants = ['spotlight-cover', 'spotlight-v2-cover', 'spotlight-v3-page', 'spotlight-v4-page', 'spotlight-v5-cover', 'spotlight-v5-playlist', 'spotlight-v5-place', 'summary-note-page', 'itinerary-note-day', 'grid6'];
    for (const variant of variants) {
      node.className = 'story-page ' + variant;
      node.style.cssText = 'position:relative;width:397px;height:562px;overflow:hidden;background:white;';
      t.prepareQualityLayout([node], standard);
      const result = await t.renderPageBlobWithRetry(node, { ...standard, imagesReady: true, embedFonts: false });
      const image = await createImageBitmap(result);
      const expected = variant.startsWith('spotlight-v5') ? [1080, 1350] : variant.includes('note') ? [1080, 1920] : [992, 1405];
      check(image.width === expected[0] && image.height === expected[1], 'Changed aspect/output ' + variant + ': ' + image.width + 'x' + image.height);
      image.close();
    }
    let active = 0, attempts = 0;
    await t.mapExportWithSequentialRetry([0, 1], 2, async (item) => {
      active++; try { if (item === 0 && attempts++ === 0) throw new Error('Out of memory'); await new Promise(r => setTimeout(r, 5)); if (attempts > 1) check(active === 1, 'Retry overlaps capture'); } finally { active--; }
    }, () => true);
    URL.revokeObjectURL(cropUrl); URL.revokeObjectURL(url); node.remove();
    return { pages: sizes.length, bytes: sizes.reduce((a, b) => a + b, 0), elapsedMs: Math.round(performance.now() - start), pngIntermediate: true, dimensions: '1080x1920' };
  });
  assert.equal(result.pages, 14); console.log('PASS V6 export quality', JSON.stringify(result));
} finally { await browser.close(); }
