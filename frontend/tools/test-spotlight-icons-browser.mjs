import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const front = path.resolve(import.meta.dirname, '..');
const sharp = createRequire(path.resolve(front, '../backend/package.json'))('sharp');
const root = path.resolve(process.env.AUDIT_ROOT || path.join(front, '../outputs', `spotlight-icons-${Date.now()}`));
fs.mkdirSync(root, { recursive: true });
const css = [...fs.readFileSync(path.join(front, 'app/globals.css'), 'utf8').matchAll(/@import (?:url\(["'](.+?)["']\)|["'](.+?)["'])/g)]
  .map(match => fs.readFileSync(path.join(front, 'app', match[1] || match[2]), 'utf8')).join('\n');
const bundle = await esbuild.build({
  stdin: { contents: "export {renderCoverPage,renderListPage} from './pageMarkup'; export {renderPageBlob} from './exportClient';", resolveDir: path.join(front, 'lib') },
  bundle: true, write: false, format: 'iife', globalName: 'Test',
});
const photo = await sharp({ create: { width: 600, height: 1000, channels: 3, background: '#526748' } }).jpeg().toBuffer();
const variants = ['spotlight', 'spotlight-list', 'spotlight-v2', 'spotlight-v2-list', 'spotlight-v3', 'spotlight-v4-page', 'spotlight-v4-image', 'spotlight-v5-place', 'spotlight-v5-playlist', 'spotlight-v6-page', 'spotlight-v6-image', 'spotlight-v6-map-place', 'spotlight-v6-map-page', 'spotlight-v6-diary-page', 'spotlight-partner', 'spotlight-partner-info', 'spotlight-partner-v2', 'spotlight-partner-v2-info'];
const cases = variants.map(variant => ({ variant, type: 'list' })).concat(
  ['spotlight', 'spotlight-v2', 'spotlight-v3', 'spotlight-v4-cover', 'spotlight-v5-cover', 'spotlight-v6-cover', 'spotlight-partner', 'spotlight-partner-v2']
    .map(variant => ({ variant, type: 'cover' })),
);
const imageUrl = '/test-photo.jpg';
const item = { name: 'Cây thông cô đơn', rawName: 'Cây thông cô đơn', metaPrimary: 'Suối Vàng, Xuân Hương - Đà Lạt', metaSecondary: 'Open: 08:00 - 22:00 · Giá: 50.000 đ', imageUrl, sourceSectionKey: 'checkin' };
const executablePath = [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ headless: true, executablePath });
const results = [];
const renderWarnings = [];
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  page.on('console', message => {
    if (message.type() === 'warning' && /export failed|render failed/i.test(message.text())) renderWarnings.push(message.text());
  });
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
  for (const { variant, type } of cases) for (const revision of [undefined, 1]) for (const long of [false, true]) {
    const sample = { type, title: 'Dịch vụ cần lưu', chipText: 'Dịch vụ', items: [{ ...item,
      ...(long ? { name: 'Một địa điểm có tên dài để kiểm tra phần nội dung và địa chỉ xuống dòng', rawName: 'Một địa điểm có tên dài để kiểm tra phần nội dung và địa chỉ xuống dòng', metaPrimary: '123 Đường Nguyễn Trung Trực, khu dân cư trên đồi, phường Xuân Hương - Đà Lạt' } : {}),
    }], backgroundImage: imageUrl, coverImages: [imageUrl, imageUrl, imageUrl, imageUrl], playlistLines: ['Giấc mơ - Tùng', 'An - Lil Wuyn'], layoutVariant: variant, spotlightDesignRevision: revision, titlePlacement: 'bottom-left' };
    const list = { id: `spotlight-icon-test-${variant}`, pages: [sample], spotlightDesignRevision: revision };
    const measurement = await page.evaluate(async ({ list, sample }) => {
      document.body.innerHTML = (sample.type === 'cover' ? Test.renderCoverPage : Test.renderListPage)(sample, 3, 14, list.id, [], list);
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode()));
      const pins = [...document.querySelectorAll('.spotlight-pin')].map(pin => {
        const svg = pin.querySelector('svg');
        const rect = svg.getBoundingClientRect(), parent = pin.getBoundingClientRect();
        return { width: rect.width, height: rect.height, parentWidth: parent.width, parentHeight: parent.height,
          text: pin.parentElement.textContent.trim(), display: getComputedStyle(pin.parentElement).display };
      });
      const rect = document.querySelector('.story-page').getBoundingClientRect();
      const addresses = [...document.querySelectorAll('.spotlight-meta > span:last-child')].map(text => {
        const r = text.getBoundingClientRect();
        return { clipped: text.scrollHeight > text.clientHeight + 1 || text.scrollWidth > text.clientWidth + 1,
          outside: r.left < rect.left - 1 || r.right > rect.right + 1 || r.top < rect.top - 1 || r.bottom > rect.bottom + 1 };
      });
      return { pins, addresses };
    }, { list, sample });
    results.push({ variant, type, revision: revision || 0, long, ...measurement });
    if (variant === 'spotlight' && type === 'list' && revision === 1 && !long) await page.locator('.story-page').screenshot({ path: path.join(root, 'spotlight-preview.png') });
    fs.writeFileSync(path.join(root, 'measurements.json'), JSON.stringify(results, null, 2));
    for (const pin of measurement.pins) {
      assert(pin.width > 0 && pin.width <= 10.1 && pin.height > 0 && pin.height <= 10.1,
        `${variant} revision=${revision || 0} oversized pin: ${JSON.stringify(pin)}`);
      assert(Math.abs(pin.width - pin.parentWidth) < 0.1 && Math.abs(pin.height - pin.parentHeight) < 0.1);
    }
    if (revision === 1) assert(measurement.addresses.every(address => !address.clipped && !address.outside), JSON.stringify({ variant, ...measurement }));
    // Exercise the actual production PNG/JPG engines for every layout, not a screenshot-only export.
    if (!long && revision === 1) for (const engine of [true, false]) for (const format of ['png', 'jpeg']) {
      const bytes = await page.evaluate(async ({ engine, format }) => {
        const blob = await Test.renderPageBlob(document.querySelector('.story-page'), {
          pixelRatio: 1, preferHtml2Canvas: engine, allowEngineFallbacks: !engine, allowFallback: false,
          embedFonts: false, imageFormat: `image/${format}`, imagesReady: true,
        });
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      }, { engine, format });
      const body = Buffer.from(bytes), metadata = await sharp(body).metadata();
      assert.equal(metadata.format, format);
      // On the solid dark-green fixture a huge white pin would occupy thousands of pixels.
      const { data, info } = await sharp(body).resize(397, null).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let white = 0;
      for (let y = Math.floor(info.height * .25); y < Math.floor(info.height * .8); y++) for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * info.channels;
        if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) white++;
      }
      if (variant === 'spotlight' && type === 'list') assert(white < 1500, `Oversized icon in ${engine ? 'html2canvas' : 'html-to-image'} ${format}: ${white} white pixels`);
      fs.writeFileSync(path.join(root, `${variant}-${type}-${engine ? 'canvas' : 'svg'}.${format === 'jpeg' ? 'jpg' : format}`), body);
    }
  }
  assert(results.some(row => row.variant === 'spotlight' && row.revision === 1 && row.pins.length));
  assert.deepEqual(renderWarnings, [], 'All requested export engines must succeed without fallback');
  console.log(`PASS Spotlight icon regression: ${results.length} legacy/revised short/long layout cases; ${cases.length * 4} production PNG/JPG renders. Artifacts: ${root}`);
} finally { await browser.close(); }
