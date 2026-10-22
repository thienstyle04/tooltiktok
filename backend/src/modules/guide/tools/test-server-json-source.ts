// Nguồn "Lấy từ server" (JSON /api/guide-data từ PostgreSQL): đổi thành workbook như Google Sheet,
// ghép Hình nền/Lưu ý/Chủ đề/ảnh Maps từ Sheet Đà Lạt trên máy, thêm/đổi link/khởi động lại.
// Hoàn toàn offline, chỉ dùng thư mục tạm và fetch giả lập.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as XLSX from 'xlsx';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'server-json-source-'));
const data = path.join(root, 'data');
fs.mkdirSync(data, { recursive: true });
Object.assign(process.env, { DALAT_DATA_DIR: data, DALAT_DRIVE_FILE_CACHE_DIR: path.join(root, 'cache'),
  DALAT_AUTO_SYNC_SHEET: 'false', DALAT_AUTO_WARM_DRIVE_CACHE: 'false' });
// Máy mới chưa có nguồn nào: không gieo link dựng sẵn.
fs.writeFileSync(path.join(data, 'source-links.json'), JSON.stringify({ version: 1, builtins: {}, hookDocs: {}, createdAt: '2026-01-01T00:00:00.000Z' }));

const { parseServerSourceUrl, serverGuideDataToWorkbook } = require('../sync/server-json-source');
const { loadWorkbookItems } = require('../workbook-items');
const { validateWorkbookData } = require('../workbook-store');
const { resolveDriveLinkToEntries } = require('../sync/drive-images');
const { GuideService } = require('../guide.service');
const config = require('../sync/destination-config');

const file = (id: string) => `https://drive.google.com/file/d/${id}/view`;
const item = (deck: string, n: number, extra: Record<string, unknown> = {}) => ({
  id: `${deck}-${n}`, name: `${deck} thử ${n}`, slug: `${deck}-${n}`, category: deck, address: `${n} Đường thử`, ward: 'Xuân Hương', district: '', city: 'Đà Lạt',
  models: [], classification: 'Local', styles: ['Hiện đại'], highlights: ['Món ngon'], description: `Dòng mô tả một ${n}\nDòng mô tả hai ${n}`,
  notes: '', openingHours: '07:00–22:00', priceRange: '50k - 100k', pricePerPerson: 70000, phone: '0900 000 000', isPartner: n < 2,
  direction: 'Trung Tâm', driveUrl: `${file(`${deck}-${n}-a`)}; ${file(`${deck}-${n}-b`)}`, ...extra,
});
const deck = (id: string, catalogKey: string | undefined, count: number, lists: Array<{ id: string; label: string; itemIds: string[] }> = []) => ({
  id, ...(catalogKey ? { catalogKey } : {}), label: id, sortOrder: 0, totalItems: count,
  items: Array.from({ length: count }, (_, n) => item(id, n)),
  lists: [{ id: 'tat-ca', label: 'Tất cả', itemIds: Array.from({ length: count }, (_, n) => `${id}-${n}`) }, { id: 'doi-tac', label: 'Đối tác', itemIds: [`${id}-0`, `${id}-1`] }, ...lists],
});
const serverData = {
  schemaVersion: 1, generatedAt: '2026-10-20T07:06:00.000Z',
  source: { destinationId: 'da-lat', destinationLabel: 'Đà Lạt', totalItems: 30, storage: 'postgres' },
  decks: [
    deck('food', 'quan_an', 6, [{ id: 'an-toi', label: 'Ăn tối', itemIds: ['food-0', 'food-2'] }, { id: 'an-sang', label: 'Ăn sáng', itemIds: ['food-0'] }]),
    deck('cafe', undefined, 6, [{ id: 'view', label: 'View Check In', itemIds: ['cafe-1'] }]),
    deck('stay', undefined, 3), deck('attraction', undefined, 3), deck('checkin', undefined, 3),
    deck('activity', undefined, 3), deck('service', undefined, 3), deck('nightlife', undefined, 3),
  ],
};

// Sheet Đà Lạt trên máy: có Chủ đề, ảnh Maps, tab Hình nền và Lưu ý mà server chưa có.
// withLinks=false cho phần chạy GuideService: không để tool đi tải ảnh Drive giả (chậm khi offline).
function dalatSheet(withLinks = true): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const food = XLSX.utils.aoa_to_sheet([['Ten_quan', 'Dia_chi', 'Ten_phuong', 'Doi_tac', 'Chu_de', 'Anh_GG_maps'],
    ['food thử 0', '0 Đường thử', 'Xuân Hương - Đà Lạt', 'X', 'Tone đen', 'Bản đồ'], ['Quán chỉ có ở Sheet', '1 Đường khác', 'Cam Ly - Đà Lạt', '', 'Mảng xanh', '']]);
  if (withLinks) food.F2.l = { Target: file('maps-food-0') };
  XLSX.utils.book_append_sheet(workbook, food, 'Quan_an');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Ten_quan', 'Chu_de'], ['checkin thử 1', 'Mảng xanh']]), 'Check_in');
  const covers = XLSX.utils.aoa_to_sheet([['STT', 'Link_drive'], [1, 'Ảnh vinaphone']]);
  if (withLinks) covers.B2.l = { Target: file('cover-1') };
  XLSX.utils.book_append_sheet(workbook, covers, 'Hinh_nen');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['STT', 'Danh_muc', 'Tieu_de', 'Giai_thich'], [1, 'Thời tiết', 'Mang áo ấm', 'Đêm lạnh']]), 'Luu_y');
  return workbook;
}
const emptyManifest = { version: 1, items: {}, coverImages: [], coverImageGroups: {} };
const sectionRows = (workbook: XLSX.WorkBook, sheet: string) => XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[sheet], { raw: false, defval: '' });

async function main() {
  // ── 1. Link server ──
  assert.equal(parseServerSourceUrl(' https://113.161.254.76/api/guide-data#x ').sourceUrl, 'https://113.161.254.76/api/guide-data');
  assert.throws(() => parseServerSourceUrl('https://docs.google.com/spreadsheets/d/fixture-sheet/edit'), /Google Sheet/);
  assert.throws(() => parseServerSourceUrl('ftp://server/api/guide-data'), /http/);
  assert.throws(() => parseServerSourceUrl('không phải link'), /không hợp lệ/);

  // ── 2. Đổi JSON → workbook đúng tab/cột của Sheet, ghép phần server chưa có ──
  const { buffer, itemCount } = serverGuideDataToWorkbook(serverData, dalatSheet());
  assert.equal(itemCount, 30);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  assert.deepEqual(workbook.SheetNames, ['Quan_an', 'Cafe', 'Homestay', 'Khu_du_lich', 'Check_in', 'Hoat_dong', 'Dich_vu', 'Choi_dem', 'Hinh_nen', 'Luu_y']);
  assert.equal(workbook.Sheets.Hinh_nen.B2.l?.Target, file('cover-1'), 'Hình nền giữ link thư mục ảnh của Sheet');
  const food = sectionRows(workbook, 'Quan_an');
  assert.equal(food[0].Doi_tac, 'X');
  assert.equal(food[3].Doi_tac, '');
  assert.equal(food[0].Mo_hinh, 'Ăn tối, Ăn sáng', 'Mo_hinh lấy từ danh sách con, bỏ "Tất cả"/"Đối tác"');
  assert.equal(food[0].Ten_phuong, 'Xuân Hương - Đà Lạt');
  assert.equal(food[0].Chu_de, 'Tone đen', 'Chủ đề ghép từ Sheet theo tên');
  assert.equal(food[0].Anh_GG_maps, file('maps-food-0'), 'ảnh Maps lấy link thật của ô Sheet');
  assert.equal(food[1].Chu_de, '');
  assert.equal(sectionRows(workbook, 'Check_in')[1].Chu_de, 'Mảng xanh');
  assert.equal(sectionRows(workbook, 'Cafe')[1].Thoi_diem, 'View Check In');
  assert.ok(!('Mo_hinh' in sectionRows(workbook, 'Cafe')[0]), 'Cafe không có Mo_hinh, giống Sheet');
  assert.equal(sectionRows(workbook, 'Dich_vu')[0].Loai_dich_vu, 'service');

  const source = { workbook, workbookName: 'Server', destinationId: 'server-test', bytes: buffer.length, fetchedAt: Date.now(), sourceUrl: '', workbookBuffer: buffer, sourceType: 'server-json' };
  assert.doesNotThrow(() => validateWorkbookData(source));
  const items = loadWorkbookItems('server-test', root, workbook, [], { version: 1, instructions: [], mappings: [] }, [], emptyManifest);
  const partner = items.quan_an.find((entry: any) => entry.name === 'food thử 0');
  assert.equal(partner.isPartner, true);
  assert.equal(partner.address, '0 Đường thử, Xuân Hương - Đà Lạt');
  assert.equal(partner.theme, 'Tone đen');
  assert.equal(partner.type, 'Ăn tối, Ăn sáng');
  assert.equal(partner.headPrice, '70000');
  assert.match(partner.diaryDescriptionRaw, /Dòng mô tả một 0\nDòng mô tả hai 0/, 'giữ xuống dòng cho Nhật ký');
  assert.equal(items.homestay.length, 3);
  assert.equal(items.khu_du_lich.length, 3);
  assert.equal(items.choi_dem.length, 3);

  // Không có Sheet Đà Lạt: vẫn đủ địa điểm, chỉ thiếu phần ghép.
  const bare = XLSX.read(serverGuideDataToWorkbook(serverData, null).buffer, { type: 'buffer' });
  assert.ok(!bare.SheetNames.includes('Hinh_nen'));
  assert.equal(sectionRows(bare, 'Quan_an')[0].Chu_de, '');
  assert.throws(() => serverGuideDataToWorkbook({ items: [] }), /decks/);
  assert.throws(() => serverGuideDataToWorkbook({ decks: [{ id: 'food', items: [] }] }), /không có địa điểm/);

  // ── 3. Một ô driveUrl nhiều link (;): gộp ảnh theo thứ tự, bỏ trùng ──
  const entries = await resolveDriveLinkToEntries(`${file('a1')}; ${file('a2')};${file('a1')}`, 'Quán', '');
  assert.deepEqual(entries.map((entry: any) => entry.fileId), ['a1', 'a2']);

  // ── 4. Thêm nguồn trên máy: Sheet Đà Lạt trước, rồi nguồn server có nội dung Đà Lạt ──
  const serverUrl = 'https://fixture-server.local/api/guide-data';
  const offlineServerData = { ...serverData, decks: serverData.decks.map(entry => ({ ...entry, items: entry.items.map(row => ({ ...row, driveUrl: '' })) })) };
  const requests: string[] = [];
  const originalFetch = global.fetch;
  global.fetch = (async (input: unknown) => {
    const url = String(input);
    requests.push(url);
    if (url.startsWith('https://fixture-server.local/')) return new Response(JSON.stringify(offlineServerData), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.startsWith('https://broken-server.local/')) return new Response('<html>404</html>', { status: 404 });
    if (/docs\.google\.com\/spreadsheets\/d\/[^/]+\/export/.test(url)) {
      return new Response(new Uint8Array(XLSX.write(dalatSheet(false), { type: 'buffer', bookType: 'xlsx' })), { status: 200 });
    }
    throw new Error(`offline: ${url}`);
  }) as typeof fetch;
  try {
    const service: any = new GuideService();
    const sheet = await service.addDestination({ label: 'Sheet Đà Lạt', sheetUrl: 'https://docs.google.com/spreadsheets/d/fixture-dalat-sheet-01/edit', dalatContent: true });
    assert.equal(sheet.active.sourceType, 'google-sheet');

    await assert.rejects(service.addDestination({ label: 'Server hỏng', sheetUrl: 'https://broken-server.local/api/guide-data', sourceType: 'server', dalatContent: true }),
      /HTTP 404.*link server/);
    const added = await service.addDestination({ label: 'Đà Lạt server', sheetUrl: serverUrl, sourceType: 'server', dalatContent: true });
    const id = added.active.id;
    assert.match(id, /^server-[a-z0-9]+$/);
    assert.equal(added.active.sourceType, 'server-json');
    assert.equal(added.active.contentDestinationId, 'dalat');
    assert.equal(added.dataset.source.totalItems, 30);
    assert.ok(requests.includes(serverUrl), 'link được kiểm tra bằng cách tải JSON');
    const snapshot = XLSX.read(fs.readFileSync(path.join(data, `workbook-cache.${id}.xlsx`)), { type: 'buffer' });
    assert.ok(snapshot.SheetNames.includes('Hinh_nen'), 'workbook lưu trên máy đã ghép Hình nền từ Sheet Đà Lạt');
    assert.equal(sectionRows(snapshot, 'Quan_an')[0].Chu_de, 'Tone đen');

    // Link http(s) không phải Google Sheet tự được nhận là link server (trùng thì báo).
    await assert.rejects(service.addDestination({ label: 'Trùng', sheetUrl: serverUrl, dalatContent: true }), /Link server này đã được thêm/);
    const saved = JSON.parse(fs.readFileSync(path.join(data, 'custom-destinations.json'), 'utf8')).destinations;
    assert.deepEqual(saved.find((entry: any) => entry.id === id) && [saved.find((entry: any) => entry.id === id).sourceType, saved.find((entry: any) => entry.id === id).exportUrl], ['server-json', serverUrl]);

    // ── 5. Đổi link server; link Google Sheet không dùng cho nguồn server ──
    service.updateDestinationSheetLink(id, { sheetUrl: 'https://fixture-server.local/api/guide-data?refresh=1' });
    assert.equal(config.getDestinationConfig(id).exportUrl, 'https://fixture-server.local/api/guide-data?refresh=1');
    assert.throws(() => service.updateDestinationSheetLink(id, { sheetUrl: 'https://docs.google.com/spreadsheets/d/fixture-x/edit' }), /Google Sheet/);

    // ── 6. Khởi động lại: nguồn server còn nguyên ──
    config.unregisterDestination(id);
    const restarted: any = new GuideService();
    const reloaded = restarted.getDestinations().destinations.find((entry: any) => entry.id === id);
    assert.equal(reloaded.sourceType, 'server-json');
    assert.equal(config.getDestinationConfig(id).exportUrl, 'https://fixture-server.local/api/guide-data?refresh=1');
    console.log('PASS server JSON source: URL rules, JSON→workbook (tabs/columns, partners, address, lists, Mo_ta lines), Sheet supplement (Hình nền/Lưu ý/Chủ đề/Maps), multi-link driveUrl, add/duplicate/error, change link, restart.');
  } finally {
    global.fetch = originalFetch;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
