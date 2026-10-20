// Thêm nguồn mới bằng XLSX qua HTTP thật, trên bản sao dữ liệu (không đụng dữ liệu thật).
// Mạng tới Google chỉ là GET đọc công khai như tool vẫn làm; mọi lượt gọi được đếm.
// Chạy: npx ts-node -T src/modules/guide/tools/test-add-xlsx-source-e2e.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as XLSX from 'xlsx';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../app.module';
import { GuideService } from '../guide.service';

const log = (...args: unknown[]) => console.log('E2E', ...args);

async function main() {
  const original = path.resolve(__dirname, '../../../../data');
  const root = path.resolve(original, '../../outputs', `add-xlsx-e2e-${Date.now()}`);
  const data = path.join(root, 'data'), cache = path.join(data, 'drive-file-cache');
  fs.mkdirSync(cache, { recursive: true });
  const hashes = new Map<string, string>();
  const hash = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  for (const name of fs.readdirSync(original)) {
    const file = path.join(original, name), stat = fs.statSync(file);
    if (stat.isFile()) { hashes.set(file, hash(file)); fs.copyFileSync(file, path.join(data, name)); }
    else if (['source-snapshots', 'source-hooks'].includes(name)) fs.cpSync(file, path.join(data, name), { recursive: true });
  }
  for (const name of fs.readdirSync(path.join(original, 'drive-file-cache'))) {
    const from = path.join(original, 'drive-file-cache', name), to = path.join(cache, name);
    if (!fs.statSync(from).isFile()) continue;
    if (name.endsWith('.json')) fs.copyFileSync(from, to); else fs.linkSync(from, to);
  }
  hashes.set(path.join(original, 'drive-file-cache', 'validation-state.json'), hash(path.join(original, 'drive-file-cache', 'validation-state.json')));
  fs.writeFileSync(path.join(data, 'active-destination.json'), JSON.stringify({ id: 'dalat-threads', savedAt: new Date().toISOString() }));
  Object.assign(process.env, { DALAT_DATA_DIR: data, DALAT_DRIVE_FILE_CACHE_DIR: cache, DALAT_AUTO_SYNC_SHEET: 'false', DALAT_AUTO_WARM_DRIVE_CACHE: 'false',
    DALAT_SESSION_ID: 'add-xlsx-e2e', DALAT_LOCAL_TEMPLATES_DIR: path.join(root, 'no-local-templates') });
  // Workbook giống thật: bản Threads (~270 địa điểm, link Drive thật) đặt tên "Nha Trang thử".
  const threadsDir = path.join(original, 'source-snapshots', 'dalat-threads');
  const revision = JSON.parse(fs.readFileSync(path.join(threadsDir, 'current.json'), 'utf8')).revision;
  const workbookBytes = fs.readFileSync(path.join(threadsDir, revision, 'workbook.xlsx'));
  const realFetch = globalThis.fetch;
  const external: string[] = [];
  let base = '';
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input?.url || input);
    if (!base || !url.startsWith(base)) external.push(url);
    return realFetch(input, init);
  }) as typeof fetch;

  const start = async () => {
    const app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    const address: any = app.getHttpServer().address();
    base = `http://127.0.0.1:${address.port}`;
    const s: any = app.get(GuideService);
    while (s.destinationDataLoading) await new Promise(r => setTimeout(r, 50));
    return { app, s };
  };
  const api = async (method: string, url: string, body?: any) => {
    const t0 = Date.now();
    const res = await realFetch(base + url, { method, body, headers: body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined });
    const text = await res.text();
    let json: any; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json, ms: Date.now() - t0 };
  };
  const upload = (label: string, bytes: Buffer, fileName: string, sheetUrl = '') => {
    const form = new FormData();
    form.set('label', label); form.set('sheetUrl', sheetUrl);
    form.set('file', new Blob([new Uint8Array(bytes)]), fileName);
    return form;
  };
  const destinations = async () => (await api('GET', '/api/destinations')).json;
  const report: string[] = [];
  let { app, s } = await start();
  try {
    const before = await destinations();
    const beforeIds = before.destinations.map((d: any) => d.id);
    // ── Lỗi đầu vào: không được đăng ký nguồn, không đổi nguồn đang dùng ──
    const empty = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(empty, XLSX.utils.aoa_to_sheet([['abc'], ['1']]), 'Sheet1');
    const bad: Array<[string, FormData, RegExp]> = [
      ['file .txt', upload('Nguồn lỗi', Buffer.from('hello'), 'du-lieu.txt'), /\.xlsx/],
      ['xlsx không có nhóm hợp lệ', upload('Nguồn lỗi', XLSX.write(empty, { type: 'buffer', bookType: 'xlsx' }) as Buffer, 'trong.xlsx'), /./],
      ['xlsx hỏng', upload('Nguồn lỗi', Buffer.from('PK\u0003\u0004 not really'), 'hong.xlsx'), /./],
      ['tên quá ngắn', upload('A', workbookBytes, 'nha-trang.xlsx'), /2 đến 60/],
      ['link Sheet sai', upload('Nguồn lỗi', workbookBytes, 'nha-trang.xlsx', 'https://example.com/khong-phai-sheet'), /./],
      ['thiếu file', (() => { const f = new FormData(); f.set('label', 'Nguồn lỗi'); return f; })(), /chọn file/],
    ];
    for (const [label, form, message] of bad) {
      const r = await api('POST', '/api/destinations/xlsx', form);
      assert.equal(r.status, 400, `${label}: phải bị từ chối (HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 160)})`);
      assert.match(String(r.json?.message || r.json), message, `${label}: thông báo rõ`);
      report.push(`từ chối đúng: ${label} → "${String(r.json?.message).slice(0, 80)}"`);
    }
    const afterBad = await destinations();
    assert.deepEqual(afterBad.destinations.map((d: any) => d.id), beforeIds, 'Lỗi đầu vào không để lại nguồn rác');
    assert.equal(afterBad.active.id, 'dalat-threads');
    // ── Thêm nguồn hợp lệ ──
    external.length = 0;
    const added = await api('POST', '/api/destinations/xlsx', upload('Nha Trang thử', workbookBytes, 'nha-trang.xlsx'));
    assert.equal(added.status, 201, `Thêm nguồn: HTTP ${added.status} ${JSON.stringify(added.json).slice(0, 300)}`);
    const newId = added.json.active?.id;
    assert.ok(/^xlsx-/.test(newId), 'Nguồn mới được kích hoạt');
    report.push(`thêm nguồn: ${added.ms} ms, id=${newId}, ${added.json.active?.totalItems ?? '?'} địa điểm, ${added.json.dataset?.decks?.length ?? 0} mẫu`);
    // Ảnh: theo dõi trạng thái cache tới khi xong hoặc 6 phút.
    const t0 = Date.now(); let status: any = {};
    while (Date.now() - t0 < 6 * 60_000) {
      status = (await api('GET', '/api/drive-cache/status')).json;
      if (status?.destinationId === newId && (status.ready || status.phase === 'error' || status.phase === 'ready')) break;
      await new Promise(r => setTimeout(r, 2000));
    }
    report.push(`ảnh: ${Math.round((Date.now() - t0) / 1000)} s → phase=${status.phase} ready=${status.ready} ${status.completed ?? ''}/${status.total ?? ''} "${String(status.message || '').slice(0, 120)}", gọi mạng ngoài=${external.length}`);
    const manifestFile = path.join(data, `sheet-drive-images.${newId}.json`);
    const manifestItems = fs.existsSync(manifestFile) ? Object.keys(JSON.parse(fs.readFileSync(manifestFile, 'utf8')).items || {}).length : -1;
    report.push(`manifest ảnh của nguồn mới: ${manifestItems} mục`);
    await new Promise(r => setTimeout(r, 500));
    const dataset = (await api('GET', '/api/guide-data')).json;
    const items = dataset.decks?.flatMap((d: any) => d.lists || []).flatMap((l: any) => l.pages || []).flatMap((p: any) => p.items || []) || [];
    const partners = (await api('GET', '/api/partners')).json;
    const deckIds = new Set((dataset.decks || []).map((d: any) => d.id));
    report.push(`mẫu được phép nhưng không có trong dataset: ${(dataset.source?.allowedDeckIds || []).filter((id: string) => !deckIds.has(id)).join(', ') || 'không'}`);
    report.push(`dataset: ${dataset.decks?.length} mẫu, ${items.length} ô, ${items.filter((i: any) => String(i.imageUrl || '').includes('drive-file')).length} ô có ảnh Drive; đối tác có ảnh: ${partners.length}`);
    assert.ok(partners.length > 0, 'Nguồn mới phải có đối tác có ảnh sau khi tải ảnh xong');
    // Tạo list và chọn đối tác trên nguồn mới.
    for (const deckId of ['grid-6', 'spotlight-v4', 'itinerary-3n2d']) {
      const r = await api('POST', '/api/decks/generate-from-caption', JSON.stringify({ deckId, caption: { coverTitle: 'Nha Trang thử', headline: '', body: '', hashtags: [] }, hookSelection: { mode: 'normal' } }));
      report.push(`tạo ${deckId}: HTTP ${r.status} ${r.ms} ms ${r.status >= 400 ? String(r.json?.message).slice(0, 140) : r.json?.navTitle}`);
    }
    const eligibility = await api('GET', '/api/partners/eligibility?deckId=grid-6');
    report.push(`chọn đối tác grid-6: HTTP ${eligibility.status} ${eligibility.ms} ms, dùng được ${eligibility.json?.partners?.filter((p: any) => p.eligible).length ?? '?'}/${eligibility.json?.partners?.length ?? '?'}${eligibility.json?.error ? ' lỗi: ' + eligibility.json.error : ''}`);
    // ── Thay workbook: bỏ bớt dòng, số địa điểm phải đổi ──
    const book = XLSX.read(workbookBytes, { type: 'buffer' });
    const sheetName = book.SheetNames.find(name => /an|quan/i.test(name)) || book.SheetNames[0];
    const allRows = XLSX.utils.sheet_to_json<any[]>(book.Sheets[sheetName], { header: 1, defval: '' });
    // Keep the header and half of the rows that actually hold data (many sheet rows are blank).
    const dataRows = allRows.slice(1).filter(row => row.some((cell: unknown) => String(cell).trim()));
    const rows = [allRows[0], ...dataRows];
    book.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(rows.slice(0, Math.max(2, Math.floor(rows.length / 2))));
    const smaller = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const beforeReplace = (await api('GET', '/api/guide-data')).json?.source?.totalItems;
    const replaced = await api('PUT', `/api/destinations/${newId}/xlsx`, upload('', smaller, 'nha-trang-v2.xlsx'));
    assert.ok(replaced.status < 300, `Thay workbook: HTTP ${replaced.status} ${JSON.stringify(replaced.json).slice(0, 200)}`);
    report.push(`thay workbook (bỏ ${rows.length - Math.floor(rows.length / 2)} dòng có dữ liệu ở "${sheetName}"): ${replaced.ms} ms, còn ${replaced.json.active?.totalItems} địa điểm (trước ${beforeReplace})`);
    assert.ok(replaced.json.active?.totalItems < beforeReplace, 'Số địa điểm cập nhật theo file mới');
    assert.equal(replaced.json.dataset?.source?.totalItems, replaced.json.active?.totalItems, 'Tóm tắt nguồn khớp dataset mới');
    // ── Chuyển nguồn qua lại ──
    for (const id of ['dalat-threads', newId, 'dalat-test', newId]) {
      const r = await api('POST', '/api/destination', JSON.stringify({ id }));
      report.push(`chuyển sang ${id === newId ? 'Nha Trang thử' : id}: HTTP ${r.status} ${r.ms} ms`);
      assert.ok(r.status < 300, `chuyển nguồn ${id}: ${JSON.stringify(r.json).slice(0, 200)}`);
    }
    // ── Khởi động lại: nguồn mới còn nguyên ──
    await app.close();
    const t1 = Date.now();
    ({ app, s } = await start());
    const reloaded = await destinations();
    report.push(`khởi động lại: ${Date.now() - t1} ms, nguồn đang dùng=${reloaded.active.id === newId ? 'Nha Trang thử' : reloaded.active.id}, ${reloaded.active.totalItems} địa điểm`);
    assert.equal(reloaded.active.id, newId, 'Nguồn mới vẫn được chọn sau khởi động lại');
    assert.ok(reloaded.destinations.some((d: any) => d.id === newId && d.label === 'Nha Trang thử'));
    const changed = [...hashes].filter(([file, before]) => hash(file) !== before).map(([file]) => file);
    assert.deepEqual(changed, [], 'Dữ liệu thật không bị đổi');
    console.log(report.map(line => '  • ' + line).join('\n'));
    console.log('PASS add XLSX source end-to-end (bad inputs rejected cleanly, add, images, create, eligibility, replace, switch, restart).');
  } catch (error) {
    console.log(report.map(line => '  • ' + line).join('\n'));
    throw error;
  } finally { await app.close(); fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
