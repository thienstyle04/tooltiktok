// Tổng kết chuyến đi 3N2Đ trên trình duyệt thật: preview, tràn chữ, xuất đơn/batch PNG/JPG,
// TXT caption, XLSX đối tác (không ghi XLSX rỗng khi nguồn tắt logic đối tác). Dữ liệu giả, thư mục tạm.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');
const front = path.resolve(__dirname, '..'), back = path.resolve(front, '../backend');
const esbuild = require(back + '/node_modules/esbuild'), sharp = require(back + '/node_modules/sharp');
const { chromium } = require('playwright'), JSZip = require('jszip'), helper = require('./exportClientTestHelper.cjs');

function buildFixture(out) {
  // Dựng list bằng đúng builder backend (TS) với dữ liệu giả.
  const script = `
    const R = require('./src/modules/guide/logic/threads-trip-recap');
    const make = (sectionKey, type, price, count, partners = 0, prefix = sectionKey) => Array.from({ length: count }, (_, i) => ({
      id: prefix + '-' + i, sectionKey, name: prefix === 'quan_an' && i === 0 ? 'Lẩu gà lá é Tao Ngộ' : prefix + ' ' + (i + 1), address: '', type, headPrice: price, isPartner: i < partners,
      imageUrl: '/assets/drive-file?id=' + prefix + '-' + i, imageMapped: true, imageSource: 'manual', candidateImageUrls: [] }));
    const items = (partners) => ({ quan_an: make('quan_an', 'Ăn', '45,000 đ', 10, partners ? 2 : 0), cafe: make('cafe', 'Cafe', '30,000 đ', 6, partners ? 1 : 0),
      homestay: make('homestay', 'Lưu trú', '150,000 đ', 3, partners ? 1 : 0, 'Timi Boutique Stay'), check_in: make('check_in', 'Check-in', '0 đ', 6),
      khu_du_lich: make('khu_du_lich', 'KDL', '100.000 đ', 3), dich_vu: [...make('dich_vu', 'Nhà xe', '250,000 đ', 1, 0, 'Nhà Xe Phương Trang'), ...make('dich_vu', 'Thuê xe', '120,000 đ', 1, 0, 'Thuê xe Mai Sơn')] });
    const lists = [];
    for (let n = 0; n < 4; n++) {
      const partners = n !== 3, pages = R.buildThreadsRecapPages(items(partners), 'browser-' + n, 'Đà Lạt');
      R.assertThreadsRecapPages(pages);
      const postCaption = R.pickThreadsRecapCaption(lists.map(l => l.postCaption), 'cap-' + n, R.recapTotals(pages[0]));
      lists.push({ id: R.THREADS_RECAP_ID + '-caption-0' + (n + 1) + '-test', navTitle: 'Mẫu 0' + (n + 1), title: pages[0].title, description: '', postCaption,
        captionBody: '', captionHashtags: [], canvasPreset: 'tiktok-3x4', templateVersion: R.THREADS_RECAP_VERSION, pages, partners });
    }
    require('fs').writeFileSync(${JSON.stringify(out)}, JSON.stringify({ lists }));`;
  cp.execFileSync(process.execPath, ['-r', 'ts-node/register/transpile-only', '-e', script], { cwd: back, encoding: 'utf8', timeout: 90000 });
  return JSON.parse(fs.readFileSync(out, 'utf8')).lists;
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'threads-recap-')), out = path.join(root, 'visual');
  fs.mkdirSync(out);
  const lists = buildFixture(path.join(root, 'fixture.json'));
  const bundle = await esbuild.build({ ...helper.bundleOptions({ overrides: { downloadBlobFile: 'downloadBlobFile = (blob,name) => { window.downloads.push({blob,name});return true; };' },
    extra: "export {renderListPage} from './pageMarkup';export {checkThreadsRecapLayout,assertThreadsRecapExport,recapTotals,recapMoney} from './threadsRecap';export {collectPartnerNames} from './partnerNames.mjs';" }),
  bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'Audit' });
  const css = [...fs.readFileSync(front + '/app/globals.css', 'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m => fs.readFileSync(path.join(front, 'app', m[1]), 'utf8')).join('\n');
  const executablePath = [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
  const photos = new Map();
  const photo = async id => {
    if (!photos.has(id)) {
      const hue = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
      photos.set(id, await sharp({ create: { width: 600, height: 800, channels: 3, background: `hsl(${hue},55%,55%)` } }).jpeg().toBuffer());
    }
    return photos.get(id);
  };
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()), p = url.pathname;
      if (p === '/') return route.fulfill({ contentType: 'text/html', body: `<style>${css}</style><div id="preview"></div>` });
      if (p.startsWith('/fonts/')) return route.fulfill({ body: fs.readFileSync(path.join(front, 'public', p)) });
      if (p === '/assets/drive-file') return route.fulfill({ contentType: 'image/jpeg', body: await photo(url.searchParams.get('id')) });
      if (p === '/api/health') return route.fulfill({ json: { status: 'ok', sessionId: 'recap-test', appVersion: require('../lib/appVersion').APP_VERSION } });
      if (p === '/api/night-sync/export-lease') return route.fulfill({ json: { ok: true } });
      if (p.startsWith('/api/runtime-performance')) return route.fulfill({ json: { mode: 'modern', totalMemoryBytes: 16 * 1024 ** 3, freeMemoryBytes: 8 * 1024 ** 3, logicalCpuCount: 8 } });
      if (p === '/api/drive-cache/status') return route.fulfill({ json: { ready: true, phase: 'ready' } });
      if (p === '/api/drive-files/cache-status') return route.fulfill({ json: { missing: [], cached: 0 } });
      return route.abort();
    });
    await page.goto('http://recap.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });

    // Preview: 9 trang 397px tỉ lệ 3:4, không tràn, đủ dòng + Tổng + Chia theo người.
    const list = lists[0];
    const metrics = await page.evaluate(async list => {
      document.querySelector('#preview').innerHTML = list.pages.map((p, i) => Audit.renderListPage(p, i, list.pages.length, list.id, [], list)).join('');
      await document.fonts.ready;
      await Promise.all([...document.images].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
      const nodes = [...document.querySelectorAll('#preview article')];
      nodes.forEach(node => Audit.checkThreadsRecapLayout(node, true));
      const note = nodes[0], rows = [...note.querySelectorAll('.threads-recap-row')].map(n => n.textContent);
      return { count: nodes.length, sizes: nodes.map(n => [n.offsetWidth, Math.round(n.getBoundingClientRect().height * 100) / 100]), rows,
        highlight: note.querySelector('.threads-recap-hl')?.textContent, underline: note.querySelector('.threads-recap-per')?.textContent,
        brokenImages: [...document.images].filter(img => !img.naturalWidth).length, photoImgs: nodes.slice(1).map(n => n.querySelectorAll('img').length),
        partners: Audit.collectPartnerNames(list), totals: Audit.recapTotals(list.pages[0]) };
    }, list);
    assert.equal(metrics.count, 9);
    assert.ok(metrics.sizes.every(([w, h]) => w === 397 && Math.abs(h - 1440 * 397 / 1080) < 0.05), JSON.stringify(metrics.sizes));
    assert.equal(metrics.rows.length, list.pages[0].items.length + 2);
    assert.equal(metrics.rows.at(-2), 'Tổng ' + await page.evaluate(v => Audit.recapMoney(v), metrics.totals.total));
    assert.match(metrics.underline, /^Chia theo người: /);
    assert.equal(metrics.highlight, '360k', 'Dòng thuê xe tô vàng số tiền 120k×3');
    assert.equal(metrics.brokenImages, 0); assert.deepEqual(metrics.photoImgs, Array(8).fill(1));
    assert.ok(metrics.partners.includes('Timi Boutique Stay 1') || metrics.partners.some(name => list.pages[0].items.some(item => item.isPartner && item.rawName === name)));
    for (const name of metrics.partners) assert.ok(!/ 2 đêm$/.test(name), 'XLSX ghi tên quán, không ghi "2 đêm"');
    assert.ok(!metrics.rows.join(' ').includes(list.postCaption), 'Caption chỉ ở TXT');
    await page.locator('#preview article').nth(0).screenshot({ path: path.join(out, 'preview-note.png') });
    await page.locator('#preview article').nth(1).screenshot({ path: path.join(out, 'preview-photo.png') });

    // Tên quá dài: báo tràn, không tự cắt chữ.
    const overflow = await page.evaluate(list => {
      const p = structuredClone(list.pages[0]); p.items[4].name = 'Tên địa điểm rất dài không cắt chữ '.repeat(12);
      document.querySelector('#preview').innerHTML = Audit.renderListPage(p, 0, 9, list.id, [], list);
      try { Audit.checkThreadsRecapLayout(document.querySelector('article'), true); return false; } catch { return true; }
    }, list);
    assert.ok(overflow);
    // List thiếu ảnh/sai thứ tự không được xuất.
    const guarded = await page.evaluate(list => { const broken = structuredClone(list); broken.pages[2].backgroundImage = broken.pages[3].backgroundImage; try { Audit.assertThreadsRecapExport(broken); return false; } catch { return true; } }, list);
    assert.ok(guarded);

    const runExport = (selected, format, single, partnerLogicOff = false) => page.evaluate(async ({ lists, format, single, partnerLogicOff }) => {
      window.downloads = []; const status = [], cb = { setStatus: s => status.push(s) };
      const deck = { id: 'threads-trip-recap-3n2d', navTitle: 'Tổng kết chuyến đi 3N2Đ', lists };
      const dataset = { source: { destinationId: 'dalat-threads', allowedDeckIds: [deck.id], ...(partnerLogicOff ? { partnerLogicOff: true } : {}) }, decks: [deck] };
      const result = single ? await Audit.exportActiveList({ deck, list: lists[0], dataset, quality: 'optimized', format }, cb)
        : await Audit.exportBatch({ dataset, selectedListIds: new Set(lists.map(l => l.id)), quality: 'optimized', format, skipImageErrors: true }, cb);
      const files = [];
      for (const file of window.downloads) { const bytes = new Uint8Array(await file.blob.arrayBuffer()); let s = ''; for (let i = 0; i < bytes.length; i += 16384) s += String.fromCharCode(...bytes.slice(i, i + 16384)); files.push({ name: file.name, data: btoa(s) }); }
      return { files, status, result };
    }, { lists: selected, format, single, partnerLogicOff });

    const inspect = async (result, format) => {
      const summary = { images: 0, txt: [], xlsx: 0 };
      for (const file of result.files) {
        const zip = await JSZip.loadAsync(Buffer.from(file.data, 'base64'), { checkCRC32: true });
        for (const entry of Object.values(zip.files).filter(e => !e.dir)) {
          if (entry.name.endsWith('.' + format)) {
            const bytes = await entry.async('nodebuffer'), meta = await sharp(bytes).metadata();
            assert.equal(meta.width, 1080, entry.name); assert.equal(meta.height, 1440, entry.name);
            if (!summary.images) fs.writeFileSync(path.join(out, `export-note.${format}`), bytes);
            if (summary.images === 1) fs.writeFileSync(path.join(out, `export-photo.${format}`), bytes);
            summary.images++;
          }
          if (entry.name.endsWith('.txt')) summary.txt.push(await entry.async('string'));
          if (entry.name.endsWith('.xlsx')) summary.xlsx++;
        }
      }
      return summary;
    };
    for (const format of ['png', 'jpg']) {
      const batch = await runExport(lists.slice(0, 3), format, false);
      assert.ok(batch.files.length, batch.status.join('\n'));
      const summary = await inspect(batch, format);
      assert.equal(summary.images, 27, `${format}: 3 list × 9 ảnh`); assert.equal(summary.xlsx, 3);
      assert.ok(lists.slice(0, 3).every(l => summary.txt.some(t => t.includes(l.postCaption))));
      const single = await runExport([lists[1]], format, true);
      assert.ok(single.files.length, single.status.join('\n'));
      const one = await inspect(single, format);
      assert.equal(one.images, 9); assert.equal(one.xlsx, 1);
      console.log('PASS', format, 'batch 3 list + single');
    }
    // Nguồn tắt logic đối tác: list 0 đối tác xuất được, không có XLSX rỗng. Không có cờ thì bị chặn.
    const blocked = await runExport([lists[3]], 'png', true);
    assert.equal(blocked.files.length, 0); assert.match(String(blocked.result?.error || blocked.status.join(' ')), /đối tác/);
    const zero = await inspect(await runExport([lists[3]], 'png', true, true), 'png');
    assert.equal(zero.images, 9); assert.equal(zero.xlsx, 0);
    console.log(`PASS Tổng kết chuyến đi 3N2Đ: preview + tràn chữ + PNG/JPG 1080×1440 + TXT/XLSX + 0 đối tác. RECAP_VISUAL=${out}`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
