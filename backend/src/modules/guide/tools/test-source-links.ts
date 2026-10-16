// Link Google Sheet/Docs không nằm trong code: mỗi máy giữ link trong source-links.json.
// Kiểm tra: khôi phục một lần cho máy đang dùng (bản phát hành cũ, dữ liệu, biến môi trường),
// máy mới bắt đầu với 0 nguồn, thêm nguồn Thường/Threads có/không nội dung Đà Lạt, đổi link
// và khởi động lại. Hoàn toàn offline, chỉ dùng thư mục tạm.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as XLSX from 'xlsx';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-links-'));
const dir = (...parts: string[]) => { const target = path.join(root, ...parts); fs.mkdirSync(target, { recursive: true }); return target; };
const write = (file: string, text: string) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const sheetId = (url: string) => String(url).match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)?.[1] || '';
const repo = path.resolve(__dirname, '../../../../..');
// Commit cuối cùng còn link trong code (trước khi đưa link ra cấu hình theo máy).
const LAST_COMMIT_WITH_LINKS = '230503d4';

// Máy mới: data trống, code mới.
const freshData = dir('fresh', 'data');
process.env.DALAT_DATA_DIR = freshData;
process.env.DALAT_DRIVE_FILE_CACHE_DIR = dir('fresh', 'cache');
process.env.DALAT_AUTO_SYNC_SHEET = 'false';
process.env.DALAT_AUTO_WARM_DRIVE_CACHE = 'false';
const templates = dir('templates');
process.env.DALAT_LOCAL_TEMPLATES_DIR = templates;
write(path.join(templates, 'local-fake-dalat', 'template.json'), JSON.stringify({ id: 'local-fake-dalat', version: 1, name: 'Mẫu riêng thử', description: '', allowedSourceIds: ['dalat-test'], builder: 'builder.cjs', assets: [] }));
write(path.join(freshData, 'source-links.json'), JSON.stringify({ version: 1, builtins: {}, hookDocs: {}, createdAt: '2026-01-01T00:00:00.000Z' }));

const config = require('../sync/destination-config');
const links = require('../sync/source-links');
const { GuideService } = require('../guide.service');
const { loadSpotlightV3Hooks } = require('../sync/spotlight-hook-source');

function workbookBuffer(label: string): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const [sheet, section] of [['Quan_an', 'quan_an'], ['Cafe', 'cafe'], ['Check_in', 'check_in']]) {
    const rows: unknown[][] = [['ten_quan', 'dia_chi', 'ten_phuong', 'doi_tac']];
    for (let i = 0; i < 6; i++) rows.push([`${label} ${section} ${i}`, `${i} Đường thử`, 'Phường thử', i < 2 ? 'x' : '']);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheet);
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

async function main() {
  const requests: string[] = [];
  const originalFetch = global.fetch;
  global.fetch = (async (input: unknown) => {
    const url = String(input);
    requests.push(url);
    if (/docs\.google\.com\/spreadsheets\/d\/[^/]+\/export/.test(url)) {
      return new Response(new Uint8Array(workbookBuffer(sheetId(url))), { status: 200, headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
    }
    throw new Error(`offline: ${url}`);
  }) as typeof fetch;
  try {
    // ── 1. Khôi phục: máy mới không có dấu vết nào ──
    const empty = links.recoverSourceLinks(dir('empty', 'data'), dir('empty', 'tool'), {});
    assert.deepEqual(empty.builtins, {}, 'máy mới không có nguồn dựng sẵn');
    assert.deepEqual(empty.hookDocs, {}, 'máy mới không có Doc hook');

    // ── 2. Máy đang dùng: link nằm trong code của bản phát hành cũ còn trên đĩa ──
    const install = dir('install');
    const guideAt = (release: string) => path.join(install, 'releases', release, 'backend', 'src', 'modules', 'guide');
    let oldFiles: Record<string, string> | null = null;
    try {
      const show = (file: string) => execFileSync('git', ['-C', repo, 'show', `${LAST_COMMIT_WITH_LINKS}:backend/src/modules/guide/${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      oldFiles = { 'sync/destination-config.ts': show('sync/destination-config.ts'), 'sync/spotlight-hook-source.ts': show('sync/spotlight-hook-source.ts'), 'guide.service.ts': show('guide.service.ts') };
    } catch { console.log(`SKIP phần bản phát hành cũ: không đọc được commit ${LAST_COMMIT_WITH_LINKS} bằng git.`); }
    if (oldFiles) {
      for (const [file, text] of Object.entries(oldFiles)) write(path.join(guideAt('0.10.01-aaaaaaaa'), file), text);
      // Bản cũ hơn với link khác: bản mới nhất phải thắng.
      write(path.join(guideAt('0.9.01-bbbbbbbb'), 'sync/destination-config.ts'),
        "  dalat: {\n    sheetUrl:\n      'https://docs.google.com/spreadsheets/d/older-fake-dalat-sheet-0000/edit',\n  },\n");
      // Code mới (không link) cũng nằm trong releases.
      write(path.join(guideAt('0.10.02-cccccccc'), 'sync/destination-config.ts'), fs.readFileSync(path.join(__dirname, '../sync/destination-config.ts'), 'utf8'));
      const sharedData = dir('install', 'shared', 'data');
      const recovered = links.recoverSourceLinks(sharedData, path.join(install, 'releases', '0.10.02-cccccccc', 'backend'), {});
      assert.deepEqual(Object.keys(recovered.builtins), ['dalat', 'greenland', 'dalat-test', 'dalat-threads']);
      const oldConfig = oldFiles['sync/destination-config.ts'];
      for (const id of ['dalat', 'greenland']) {
        const value = sheetId(recovered.builtins[id].sheetUrl);
        assert.ok(value && oldConfig.includes(`/spreadsheets/d/${value}/edit`), `${id}: link lấy đúng từ code cũ`);
        assert.equal(sheetId(recovered.builtins[id].exportUrl), value);
      }
      assert.ok(oldConfig.includes(`DALAT_TEST_SHEET_ID = '${sheetId(recovered.builtins['dalat-test'].sheetUrl)}'`));
      assert.ok(oldConfig.includes(`DALAT_THREADS_SHEET_ID = '${sheetId(recovered.builtins['dalat-threads'].sheetUrl)}'`));
      assert.notEqual(sheetId(recovered.builtins.dalat.sheetUrl), 'older-fake-dalat-sheet-0000', 'bản phát hành mới nhất được ưu tiên');
      assert.ok(oldFiles['sync/spotlight-hook-source.ts'].includes(`DEFAULT_DOC_ID = '${recovered.hookDocs.spotlight}'`));
      assert.ok(oldFiles['guide.service.ts'].includes(`HOOK_DOC_ID = '${recovered.hookDocs.sections}'`));

      // Ghi một lần; lần sau đọc file, không dò lại.
      links.applySourceLinks(sharedData, path.join(install, 'releases', '0.10.02-cccccccc', 'backend'));
      const saved = JSON.parse(fs.readFileSync(path.join(sharedData, 'source-links.json'), 'utf8'));
      assert.deepEqual(saved.builtins, recovered.builtins);
      assert.equal(links.hookDocId('spotlight'), recovered.hookDocs.spotlight);
      assert.deepEqual(config.getDestinationList().map((entry: any) => entry.id), ['dalat', 'greenland', 'dalat-test', 'dalat-threads']);
      assert.equal(config.isDalatTestSource('dalat-test'), true);
      assert.equal(config.isDalatThreadsSource('dalat-threads'), true);
      assert.equal(config.isIsolatedSheetSource('dalat'), false);
      fs.rmSync(path.join(install, 'releases'), { recursive: true, force: true });
      delete saved.builtins.greenland;
      fs.writeFileSync(path.join(sharedData, 'source-links.json'), JSON.stringify(saved));
      links.applySourceLinks(sharedData, install);
      assert.equal(config.isDestinationId('greenland'), false, 'nguồn bỏ khỏi cấu hình của máy không còn xuất hiện');
      assert.equal(config.isDestinationId('dalat'), true);
    }

    // ── 3. Không còn bản phát hành cũ: dùng dữ liệu đã đồng bộ và biến môi trường ──
    const traces = dir('traces', 'data');
    write(path.join(traces, 'source-snapshots', 'dalat-test', 'current.json'), JSON.stringify({ revision: 'r1', sourceUrl: 'https://docs.google.com/spreadsheets/d/fixture-snapshot-test-sheet/export?format=xlsx' }));
    write(path.join(traces, 'spotlight-v3-hooks.json'), JSON.stringify({ docId: 'fixture-spotlight-cache-doc-id', hooks: ['a'] }));
    write(path.join(traces, 'workbook-cache.greenland.xlsx'), 'x');
    const fromTraces = links.recoverSourceLinks(traces, dir('traces', 'tool'), { DALAT_FNB_SHEET_URL: 'https://docs.google.com/spreadsheets/d/fixture-env-dalat-sheet-01/edit' });
    assert.deepEqual(Object.keys(fromTraces.builtins), ['dalat', 'greenland', 'dalat-test']);
    assert.equal(sheetId(fromTraces.builtins.dalat.exportUrl), 'fixture-env-dalat-sheet-01');
    assert.deepEqual(fromTraces.builtins.greenland, { sheetUrl: '', exportUrl: '' }, 'có dữ liệu nhưng không có link: chỉ dùng XLSX cục bộ');
    assert.equal(sheetId(fromTraces.builtins['dalat-test'].exportUrl), 'fixture-snapshot-test-sheet');
    assert.deepEqual(fromTraces.hookDocs, { spotlight: 'fixture-spotlight-cache-doc-id' });

    // ── 4. Máy mới chạy tool: 0 nguồn, không lỗi, có hướng dẫn thêm nguồn ──
    const service: any = new GuideService();
    assert.equal(service.activeDestinationId, '');
    assert.deepEqual(service.getDestinations(), { active: null, destinations: [] });
    await service.warmUpDatasetCache();
    assert.equal(service.getDriveCacheWarmStatus().ready, true);
    assert.match(service.getDriveCacheWarmStatus().message, /chưa có nguồn/i);
    await assert.rejects(service.getDataset(), (error: any) => /chưa có nguồn/i.test(JSON.stringify(error.getResponse?.() ?? error.message)));
    const before = requests.length;
    const hooks = await loadSpotlightV3Hooks({ dataRoot: freshData });
    assert.ok(hooks.length > 0, 'chưa cấu hình Doc hook: dùng hook đóng gói');
    assert.equal(requests.length, before, 'không gọi Google Docs khi máy chưa cấu hình Doc');

    // ── 5. Thêm nguồn Threads không phải Đà Lạt ──
    const sheet = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;
    const threads = await service.addDestination({ label: 'Sài Gòn Threads', sheetUrl: sheet('fixture-saigon-threads-sheet'), kind: 'threads', dalatContent: false });
    assert.equal(threads.needsFirstSync, true);
    assert.equal(threads.active, null, 'chưa chuyển nguồn trước lượt tải đầu tiên');
    const threadsId = threads.created.id;
    assert.equal(threads.created.kind, 'threads');
    assert.equal(threads.created.contentDestinationId, threadsId);
    assert.ok(threads.created.allowedDeckIds.includes('threads-food-local'));
    assert.ok(!threads.created.allowedDeckIds.includes('threads-toplist-dalat'), 'Top list Đà Lạt chỉ cho nội dung Đà Lạt');
    assert.ok(!threads.created.allowedDeckIds.includes('grid-6'));
    assert.equal(config.isIsolatedSheetSource(threadsId), true);
    assert.ok(requests.some(url => url.includes('fixture-saigon-threads-sheet/export')), 'link được kiểm tra bằng cách tải Sheet');

    // ── 6. Thêm nguồn Thường nội dung Đà Lạt: mở Hoa đào và mẫu riêng Đà Lạt ──
    const dalat = await service.addDestination({ label: 'Đà Lạt của tôi', sheetUrl: sheet('fixture-my-dalat-sheet-01'), kind: 'standard', dalatContent: 'true' });
    const dalatId = dalat.created.id;
    assert.equal(dalat.created.contentDestinationId, 'dalat');
    assert.equal(config.isDalatTestSource(dalatId), true);
    assert.ok(dalat.created.allowedDeckIds.includes('spotlight-v6-cherry-blossom'));
    assert.ok(dalat.created.allowedDeckIds.includes('local-fake-dalat'), 'mẫu riêng Đà Lạt mở cho nguồn Đà Lạt');
    assert.ok(dalat.created.allowedDeckIds.includes('grid-6'));

    // ── 7. Thêm nguồn Thường không phải Đà Lạt ──
    const plain = await service.addDestination({ label: 'Nha Trang', sheetUrl: sheet('fixture-nha-trang-sheet-01'), kind: 'standard', dalatContent: false });
    const plainId = plain.created.id;
    assert.equal(config.isDalatContentSource(plainId), false);
    assert.ok(!plain.created.allowedDeckIds.includes('spotlight-v6-cherry-blossom'));
    assert.ok(!plain.created.allowedDeckIds.includes('local-fake-dalat'));
    assert.ok(plain.created.allowedDeckIds.includes('grid-6'));
    assert.match(config.sourceTemplateError(plainId, 'threads-food-local'), /Sài Gòn Threads/, 'lỗi chỉ ra nguồn Threads có trên máy');

    await assert.rejects(service.addDestination({ label: 'Sai loại', sheetUrl: sheet('fixture-wrong-kind-sheet-1'), kind: 'reels' }), /Thường hoặc Threads/);
    await assert.rejects(service.addDestination({ label: 'Trùng', sheetUrl: sheet('fixture-nha-trang-sheet-01'), kind: 'standard' }), /đã được thêm/);
    const saved = JSON.parse(fs.readFileSync(path.join(freshData, 'custom-destinations.json'), 'utf8')).destinations;
    assert.deepEqual(saved.map((entry: any) => [entry.label, entry.kind, entry.contentDestinationId || '']),
      [['Sài Gòn Threads', 'threads', ''], ['Đà Lạt của tôi', 'standard', 'dalat'], ['Nha Trang', 'standard', '']]);

    // ── 8. Đổi link của nguồn trên máy này ──
    const updated = service.updateDestinationSheetLink(plainId, { sheetUrl: sheet('fixture-nha-trang-sheet-02') });
    assert.equal(sheetId(updated.destinations.find((entry: any) => entry.id === plainId).sheetUrl), 'fixture-nha-trang-sheet-02');
    assert.throws(() => service.updateDestinationSheetLink(plainId, { sheetUrl: sheet('fixture-my-dalat-sheet-01') }), /đang dùng cho nguồn/);
    assert.throws(() => service.updateDestinationSheetLink(plainId, { sheetUrl: 'https://example.com/x' }), /docs\.google\.com/);
    const afterUpdate = JSON.parse(fs.readFileSync(path.join(freshData, 'custom-destinations.json'), 'utf8')).destinations;
    assert.equal(sheetId(afterUpdate.find((entry: any) => entry.id === plainId).exportUrl), 'fixture-nha-trang-sheet-02');

    // ── 9. Khởi động lại: giữ loại nguồn; chưa có dữ liệu thì vẫn chờ ở màn thêm nguồn ──
    const restarted: any = new GuideService();
    assert.deepEqual(restarted.getDestinations().destinations.map((entry: any) => [entry.id, entry.kind, entry.contentDestinationId]),
      [[threadsId, 'threads', threadsId], [dalatId, 'standard', 'dalat'], [plainId, 'standard', plainId]]);
    assert.equal(restarted.activeDestinationId, '', 'nguồn chưa tải dữ liệu không được mở mặc định');
    assert.equal(restarted.getDestinations().active, null);

    // ── 9b. Nguồn Threads từ file XLSX: dùng ngay, chỉ mẫu Threads ──
    const buffer = workbookBuffer('xlsx-threads');
    const xlsx = await restarted.addXlsxDestination({ label: 'Threads từ file', kind: 'threads', dalatContent: 'false' },
      { buffer, originalname: 'sg-threads.xlsx', size: buffer.length, mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    assert.equal(restarted.activeDestinationId, xlsx.active.id);
    assert.equal(xlsx.active.kind, 'threads');
    assert.ok(xlsx.dataset.source.totalItems > 0);
    assert.ok(xlsx.active.allowedDeckIds.includes('threads-food-local'));
    assert.ok(!xlsx.active.allowedDeckIds.includes('grid-6'));
    assert.throws(() => restarted.assertTemplateAllowed('grid-6'), /Threads/);

    // ── 10. Nguồn dựng sẵn: đổi link ghi vào source-links.json, không vào code ──
    const builtinData = dir('builtin', 'data');
    require('../../../../../scripts/test-support/source-links-fixture.cjs').seedSourceLinks(builtinData);
    process.env.DALAT_DATA_DIR = builtinData;
    const builtin: any = new GuideService();
    builtin.updateDestinationSheetLink('dalat', { sheetUrl: sheet('fixture-new-dalat-sheet-01') });
    const builtinLinks = JSON.parse(fs.readFileSync(path.join(builtinData, 'source-links.json'), 'utf8'));
    assert.equal(sheetId(builtinLinks.builtins.dalat.exportUrl), 'fixture-new-dalat-sheet-01');
    assert.ok(!fs.existsSync(path.join(builtinData, 'custom-destinations.json')) || !fs.readFileSync(path.join(builtinData, 'custom-destinations.json'), 'utf8').includes('"dalat"'));

    console.log('PASS source-links: khôi phục link theo máy (bản cũ/dữ liệu/env), máy mới 0 nguồn, thêm Thường/Threads ± Đà Lạt, đổi link, khởi động lại.');
  } finally {
    global.fetch = originalFetch;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
