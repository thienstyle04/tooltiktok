import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright'), esbuild = require('esbuild');
const front = path.resolve(import.meta.dirname, '..');
const sharp = createRequire(path.resolve(front, '../backend/package.json'))('sharp');
const root = path.resolve(process.env.AUDIT_ROOT || path.join(front, '../outputs', `spotlight-hooks-${Date.now()}`));
fs.mkdirSync(root, { recursive: true });
const css = [...fs.readFileSync(path.join(front, 'app/globals.css'), 'utf8').matchAll(/@import (?:url\(["'](.+?)["']\)|["'](.+?)["'])/g)]
  .map(match => fs.readFileSync(path.join(front, 'app', match[1] || match[2]), 'utf8')).join('\n');
const bundle = await esbuild.build({
  stdin: { contents: "export {renderCoverPage} from './pageMarkup'; export {renderPageBlob} from './exportClient';", resolveDir: path.join(front, 'lib') },
  bundle: true, write: false, format: 'iife', globalName: 'Test',
});
const photo = await sharp({ create: { width: 600, height: 1000, channels: 3, background: '#344c35' } }).jpeg().toBuffer();
const imageUrl = '/test-photo.jpg';
const placements = ['center', 'top-center', 'bottom-center', 'top-left', 'top-right', 'mid-left', 'mid-right', 'bottom-left', 'bottom-right'];
const titles = ['Lưu bản thân như một người bạn yêu Đà Lạt', 'Mở album ảnh chuyến đi Đà Lạt.', 'Đà Lạt không chỉ có những góc phố quen thuộc, lưu lại chuyến đi này để cùng bạn bè khám phá'];
async function whiteBounds(body, width, height) {
  const { data, info } = await sharp(body).resize(width, height, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = width, right = -1, top = height, bottom = -1, count = 0;
  // JPEG fills the transparent rounded corners white; these are not hook pixels.
  for (let y = 32; y < height - 32; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * info.channels;
    if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); count++;
    }
  }
  assert(count > 10, 'Hook must exist in rendered image');
  return { left, right, top, bottom, count };
}
const executablePath = [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ headless: true, executablePath });
const results = [], renderWarnings = [];
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  page.on('console', message => { if (message.type() === 'warning' && /export failed|render failed/i.test(message.text())) renderWarnings.push(message.text()); });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<style>${css}</style>` });
    if (url.pathname === '/test-photo.jpg') return route.fulfill({ contentType: 'image/jpeg', body: photo });
    if (url.pathname.startsWith('/fonts/')) {
      const file = path.join(front, 'public/fonts', path.basename(url.pathname));
      if (fs.existsSync(file)) return route.fulfill({ body: fs.readFileSync(file) });
    }
    return route.abort();
  });
  await page.goto('http://spotlight-test.local/');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const variants = (process.env.AUDIT_VARIANTS || 'spotlight-v2,spotlight-v3').split(',');
  for (const variant of variants) for (const revision of [1, undefined]) for (const placement of placements) for (const [titleIndex, title] of titles.entries()) {
    if (variant === 'spotlight-v5-cover' && !revision && ['top-center', 'bottom-center'].includes(placement)) continue;
    const sample = { type: 'cover', title, backgroundImage: imageUrl, coverImages: [imageUrl, imageUrl, imageUrl, imageUrl], layoutVariant: variant, spotlightDesignRevision: revision, titlePlacement: placement };
    const list = { id: `${variant}-cover-regression`, pages: [sample], spotlightDesignRevision: revision };
    const measurement = await page.evaluate(async ({ sample, list }) => {
      document.body.innerHTML = Test.renderCoverPage(sample, 0, 14, list.id, [], list);
      await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode()));
      const node = document.querySelector('.story-page'), rect = node.getBoundingClientRect();
      const heading = node.querySelector('h1'), h = heading.getBoundingClientRect();
      const style = getComputedStyle(heading);
      return { width: Math.round(rect.width), height: Math.round(rect.height), outside: h.left < rect.left || h.right > rect.right || h.top < rect.top || h.bottom > rect.bottom,
        heading: { left: h.left - rect.left, right: h.right - rect.left, top: h.top - rect.top, bottom: h.bottom - rect.top }, clipped: /hidden|clip/.test(style.overflow) && (heading.scrollWidth > heading.clientWidth + 1 || heading.scrollHeight > heading.clientHeight + 1) };
    }, { sample, list });
    const key = `${variant}-r${revision || 0}-${placement}-${titleIndex}`;
    assert(!measurement.outside && !measurement.clipped, `${key} DOM bounds: ${JSON.stringify(measurement)}`);
    const preview = await page.locator('.story-page').screenshot();
    const expected = await whiteBounds(preview, measurement.width, measurement.height);
    fs.writeFileSync(path.join(root, `${key}-preview.png`), preview);
    for (const engine of [true, false]) for (const format of ['png', 'jpeg']) {
      const bytes = await page.evaluate(async ({ engine, format }) => {
        const blob = await Test.renderPageBlob(document.querySelector('.story-page'), {
          pixelRatio: 1, preferHtml2Canvas: engine, allowEngineFallbacks: !engine, allowFallback: false, embedFonts: true, imageFormat: `image/${format}`, imagesReady: true,
        });
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      }, { engine, format });
      const body = Buffer.from(bytes), actual = await whiteBounds(body, measurement.width, measurement.height);
      fs.writeFileSync(path.join(root, `${key}-${engine ? 'canvas' : 'svg'}.${format === 'jpeg' ? 'jpg' : format}`), body);
      results.push({ key, engine: engine ? 'canvas' : 'svg', format, expected, actual });
      fs.writeFileSync(path.join(root, 'results.json'), JSON.stringify(results, null, 2));
      // Small italic glyphs/strokes rasterize slightly differently in canvas.
      if (engine) for (const axis of ['left', 'right', 'top', 'bottom']) assert(Math.abs(actual[axis] - expected[axis]) <= 8,
        `${key} canvas ${format}: hook moved/clipped on ${axis}: preview=${JSON.stringify(expected)} export=${JSON.stringify(actual)}`);
      // SVG rasterization can use different glyph metrics/line balancing. It must
      // still keep all glyphs inside the measured heading and away from the edge.
      else assert(actual.left >= measurement.heading.left - 5 && actual.right <= measurement.heading.right + 5
        && actual.top >= expected.top - 5 && actual.bottom <= measurement.heading.bottom + 5,
        `${key} svg ${format}: glyphs outside hook box: ${JSON.stringify({ actual, measurement })}`);
    }
  }
  assert.deepEqual(renderWarnings, []);
  console.log(`PASS ${variants.join('/')} cover placement: ${results.length / 4} preview cases and ${results.length} PNG/JPG exports; 9 placements, legacy/revised, short/long hooks. Artifacts: ${root}`);
} finally { await browser.close(); }
