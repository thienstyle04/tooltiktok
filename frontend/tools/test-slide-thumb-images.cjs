// Thumbnail slide (thư viện mẫu, hàng chờ, dải trang) chỉ tải ảnh thu nhỏ /assets/drive-thumb và
// giải mã bất đồng bộ; renderer của preview/xuất ảnh vẫn trỏ ảnh gốc /assets/drive-file. Nhiều thumbnail
// cùng lọt vào màn được dựng rải qua nhiều khung hình. Dữ liệu và ảnh tự sinh, không gọi backend thật.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const front = path.resolve(__dirname, '..');
const esbuild = createRequire(path.resolve(front, '../backend/package.json'))('esbuild');
const sharp = createRequire(path.resolve(front, '../backend/package.json'))('sharp');
const { chromium } = require('playwright');

async function main() {
  const source = `import React from 'react';import { createRoot } from 'react-dom/client';
    import SlideThumb, { thumbnailMarkup } from './components/v2/SlideThumb';
    import { renderCoverPage, renderListPage } from './lib/pageMarkup';
    const item = n => ({ name: 'Quán ' + n, metaPrimary: n + ' Đường Thử', imageUrl: '/assets/drive-file?id=item' + n });
    const pages = [{ type: 'cover', title: 'Bìa thử', subtitle: '', backgroundImage: '/assets/drive-file?id=cover' },
      { type: 'list', title: 'Trang hai', subtitle: '', backgroundImage: '/assets/drive-file?id=bg2', items: [1, 2, 3].map(item) }];
    const list = { id: 'thumb-test-a', title: 'List thử', pages, captionHashtags: [] };
    window.exportMarkup = renderCoverPage(pages[0], 0, 2, list.id, [], list, []) + renderListPage(pages[1], 1, 2, list.id, [], list);
    window.thumbnailMarkup = thumbnailMarkup;
    window.commits = [];
    new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) if (node.classList?.contains('v2-thumb-content')) window.commits.push(performance.now()); })
      .observe(document.getElementById('root'), { childList: true, subtree: true });
    function Probe({ i }) { return <div className="probe"><SlideThumb list={list} page={pages[i % 2]} index={i % 2} width={80} eager /></div>; }
    function App() {
      const [many, setMany] = React.useState(false);
      window.showMany = () => setMany(true);
      return <div>{(many ? Array.from({ length: 30 }, (_, i) => i) : [0, 1]).map(i => <Probe key={i} i={i} />)}</div>;
    }
    createRoot(document.getElementById('root')).render(<App/>);`;
  const bundle = await esbuild.build({ stdin: { contents: source, resolveDir: front, loader: 'jsx' }, bundle: true, write: false, format: 'iife', loader: { '.js': 'jsx' }, jsx: 'automatic', charset: 'utf8' });
  const css = [...fs.readFileSync(path.join(front, 'app/globals.css'), 'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m => fs.readFileSync(path.join(front, 'app', m[1]), 'utf8')).join('\n');
  const image = await sharp({ create: { width: 360, height: 480, channels: 3, background: '#7a8' } }).webp().toBuffer();
  const executablePath = [`${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`, `${process.env['PROGRAMFILES(X86)']}/Microsoft/Edge/Application/msedge.exe`].find(fs.existsSync);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const requested = [];
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<meta charset="utf-8"><style>' + css + '</style><div id="root"></div>' });
      if (url.pathname.startsWith('/assets/')) { requested.push(url.pathname + url.search); return route.fulfill({ contentType: 'image/webp', body: image }); }
      if (url.pathname.startsWith('/fonts/')) return route.fulfill({ body: fs.readFileSync(path.join(front, 'public', url.pathname)) });
      return route.fulfill({ status: 404, body: 'Isolated test' });
    });
    await page.goto('http://slide-thumb.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.waitForFunction(() => document.querySelectorAll('.v2-thumb-content').length === 2);
    await page.waitForTimeout(300);

    // Renderer dùng cho preview/xuất ảnh không đổi: vẫn là ảnh gốc.
    const exportMarkup = await page.evaluate(() => window.exportMarkup);
    assert.match(exportMarkup, /\/assets\/drive-file\?id=cover/);
    assert.doesNotMatch(exportMarkup, /drive-thumb/);
    // Thumbnail: chỉ ảnh thu nhỏ, mọi <img> giải mã bất đồng bộ.
    const thumbs = await page.evaluate(() => [...document.querySelectorAll('.v2-thumb-content')].map(node => node.innerHTML).join(''));
    assert.doesNotMatch(thumbs, /drive-file/);
    assert.match(thumbs, /\/assets\/drive-thumb\?id=cover/);
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('.v2-thumb-content img')].every(img => img.decoding === 'async')), 'img thumbnail phải decoding="async"');
    assert.ok(requested.length > 0 && requested.every(entry => entry.startsWith('/assets/drive-thumb?id=')), 'Chỉ tải ảnh thu nhỏ: ' + JSON.stringify(requested));
    assert.equal(await page.evaluate(() => window.thumbnailMarkup('<img src="/assets/drive-file?id=a"><div style="background-image:url(/assets/drive-file?id=b)">')),
      '<img decoding="async" src="/assets/drive-thumb?id=a"><div style="background-image:url(/assets/drive-thumb?id=b)">');

    // 30 thumbnail cùng lúc: dựng rải qua nhiều khung hình, cuối cùng đủ cả 30.
    await page.evaluate(() => { window.commits = []; window.showMany(); });
    await page.waitForFunction(() => document.querySelectorAll('.v2-thumb-content').length === 30, null, { timeout: 15000 });
    const spread = await page.evaluate(() => { const times = window.commits; return { count: times.length, span: Math.max(...times) - Math.min(...times) }; });
    assert.ok(spread.span > 16, 'Thumbnail phải được dựng rải qua nhiều khung hình: ' + JSON.stringify(spread));
    console.log('PASS slide thumbnails: drive-thumb only, async decode, export markup keeps drive-file, 30 thumbs spread over', Math.round(spread.span), 'ms');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
