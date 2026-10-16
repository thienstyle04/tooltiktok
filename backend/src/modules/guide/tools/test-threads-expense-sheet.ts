import assert from 'node:assert/strict';
import type { GuideItem, ListPage, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import {
  buildThreadsExpenseExample, buildThreadsExpensePages, formatThousands, headPriceVnd, THREADS_EXPENSE_2N1D_ID,
  THREADS_EXPENSE_3N2D_ID, threadsExpenseCaption,
} from '../logic/threads-expense-sheet';
import { getAllowedDeckIds } from '../sync/destination-config';
import { rotatePartnerList } from '../logic/partner-rotation';
import { buildDeckList } from '../logic/deck-builder';
import { isTextNoteDeck } from '../deck-kinds';
import { supportsPhotoPreset } from '../photo-presets';

let sequence = 0;
function items(sectionKey: SectionKey, label: string, type: string, prices: Array<string | number>, extra: Partial<GuideItem> = {}): GuideItem[] {
  return prices.map((price, i) => ({
    id: `${sectionKey}-${sequence++}`, sectionKey, name: `${label} ${i + 1}`, address: `Địa chỉ ${label} ${i + 1}`, type,
    headPrice: typeof price === 'number' ? `${price.toLocaleString('en-US')} đ` : price, price: '', isPartner: false,
    signatureDish: 'Bánh canh bột lọc kèm chả cá, nem', ...extra,
  } as GuideItem));
}
function dataset(overrides: Partial<Record<SectionKey, GuideItem[]>> = {}): WorkbookItemsBySection {
  return {
    quan_an: [
      ...items('quan_an', 'Quán sáng', 'Ăn Sáng', [45000, 30000, 35000, 40000]),
      ...items('quan_an', 'Quán trưa', 'Ăn Trưa', [50000, 30000, 60000, 55000]),
      ...items('quan_an', 'Quán tối', 'Ăn Tối', [250000, 150000, 120000, 99000]),
      ...items('quan_an', 'Quán vặt', 'Ăn Vặt', [40000, 30000]),
    ],
    cafe: items('cafe', 'Cà phê', 'Cafe', [25000, 60000, 30000, 45000, 55000], { signatureDish: 'Matcha -cà phê-Latte' }),
    homestay: [...items('homestay', 'Homestay', 'Homestay', [150000, 300000]), ...items('homestay', 'Homestay đối tác', 'Homestay', [300000], { isPartner: true })],
    dich_vu: [
      ...items('dich_vu', 'Xe Phương Trang', 'Nhà xe', [250000]),
      ...items('dich_vu', 'Thuê xe Mai Sơn', 'Thuê xe', [100000]),
      ...items('dich_vu', 'Langfarm', 'Đặc sản', [40000]),
      ...items('dich_vu', 'Mer Spa', 'Spa - Gội Đầu', [100000]),
    ],
    khu_du_lich: items('khu_du_lich', 'Khu du lịch', 'Khu du lịch', [50000, 70000, 60000]),
    hoat_dong: items('hoat_dong', 'Chèo sup hồ', 'Hoạt động', [100000, 0]),
    check_in: items('check_in', 'Đồi', 'Check-in', [0, 0, 20000]),
    choi_dem: [...items('choi_dem', 'Quảng trường', 'Điểm đêm', [0, 0, 0]), ...items('choi_dem', 'Bar', 'Bar-Pub', [199000, 80000])],
    ...overrides,
  } as unknown as WorkbookItemsBySection;
}
const page = (pages: ListPage[]) => { assert.equal(pages.length, 1); return pages[0]; };
const thousands = (value?: string) => Number(String(value ?? '').replace(/\./g, ''));

// Ghi chú dài cắt theo từ, không để từ nối treo ở cuối.
{
  const longDish = page(buildThreadsExpensePages(THREADS_EXPENSE_2N1D_ID, dataset({
    quan_an: dataset().quan_an.map(item => ({ ...item, signatureDish: 'Lẩu gà lá é nấu kèm với măng chua cay đặc biệt' })),
  }), 'seed-long', 'Đà Lạt')).items.find(item => item.label === 'Ăn uống')!;
  assert.equal(longDish.metaPrimary, 'lẩu gà lá é nấu kèm với măng');
}
// Giá đầu người trong Sheet có nhiều định dạng.
assert.equal(headPriceVnd({ headPrice: '45,000 đ' } as GuideItem), 45000);
assert.equal(headPriceVnd({ headPrice: '120.000 đ' } as GuideItem), 120000);
assert.equal(headPriceVnd({ headPrice: '0' } as GuideItem), 0);
assert.equal(headPriceVnd({ headPrice: '' } as GuideItem), null);
assert.equal(formatThousands(1_900_000), '1.900');
assert.equal(formatThousands(90_000), '90');

for (const [deckId, rows, nights, days, title] of [
  [THREADS_EXPENSE_2N1D_ID, 16, 1, 2, 'Đà Lạt 2N1Đ'],
  [THREADS_EXPENSE_3N2D_ID, 21, 2, 3, 'Đà Lạt 3N2Đ'],
] as const) {
  const data = dataset();
  const sheet = page(buildThreadsExpensePages(deckId, data, 'seed-a', 'Đà Lạt'));
  assert.equal(sheet.layoutVariant, 'threads-expense-sheet');
  assert.equal(sheet.canvasPreset, 'tiktok-3x4');
  assert.equal(sheet.title, title);
  assert.equal(sheet.items.length, rows, `${deckId} phải có ${rows} dòng`);
  const all = Object.values(data).flat() as GuideItem[];
  const source = (id?: string) => all.find(item => item.id === id)!;
  const sourced = sheet.items.filter(item => item.sourceSectionKey);
  assert.equal(new Set(sourced.map(item => item.rawName)).size, sourced.length, 'Không được lặp địa điểm trong một bảng');
  // Mọi số tiền = giá đầu người × 2 người (× số đêm/ngày/chiều với phòng, thuê xe, xe khách).
  const [coach, stay, bike, fuel] = sheet.items;
  assert.equal(thousands(coach.metaSecondary), headPriceVnd(source(coach.id))! * 2 * 2 / 1000);
  assert.equal(coach.metaPrimary, 'khứ hồi');
  assert.equal(coach.name, 'Xe Phương Trang 1', 'Tên nhà xe đã có chữ "xe" thì không thêm tiền tố');
  assert.equal(thousands(stay.metaSecondary), headPriceVnd(source(stay.id))! * 2 * nights / 1000);
  assert.equal(stay.metaPrimary, `${nights} đêm`);
  assert.equal(source(stay.id).isPartner, true, 'Ưu tiên đối tác khi chưa dùng');
  assert.equal(thousands(bike.metaSecondary), headPriceVnd(source(bike.id))! * 2 * days / 1000);
  assert.equal(bike.metaPrimary, `thuê ${days} ngày`);
  assert.equal(fuel.name, 'đổ xăng');
  for (const item of sheet.items.slice(4)) {
    assert.equal(thousands(item.metaSecondary), headPriceVnd(source(item.id))! * 2 / 1000, `${item.name}: giá đầu người × 2`);
  }
  // Bữa ăn đúng cột Mô hình trong Sheet; ghi chú là món nổi bật rút gọn.
  for (const item of sheet.items.filter(row => row.label === 'Ăn uống')) {
    const type = source(item.id).type;
    if (item.name.startsWith('ăn sáng')) assert.equal(type, 'Ăn Sáng');
    else if (item.name.startsWith('ăn trưa')) assert.equal(type, 'Ăn Trưa');
    else if (item.name.startsWith('tối ăn')) assert.equal(type, 'Ăn Tối');
    else if (item.name.startsWith('ăn vặt')) assert.equal(type, 'Ăn Vặt');
    else assert.fail(`Tên bữa ăn không đúng mẫu: ${item.name}`);
    assert.equal(item.metaPrimary, 'bánh canh bột lọc kèm chả cá');
  }
  assert.ok(sheet.items.some(item => item.metaPrimary === 'cf chiều'));
  assert.ok(sheet.items.every(item => item.metaPrimary.length <= 30), 'Ghi chú phải ngắn để vừa cột');
  // Có đủ điểm có vé thì không dùng điểm miễn phí.
  const visits = sheet.items.filter(item => item.label === 'Tham quan');
  assert.ok(visits.every(item => item.metaPrimary !== 'free' && thousands(item.metaSecondary) > 0), 'Ưu tiên điểm có vé');
  assert.ok(visits.some(item => item.name.startsWith('vé ')));
  assert.ok(sheet.items.filter(item => item.name.startsWith('tối lên ')).every(item => item.metaPrimary === 'bar' && thousands(item.metaSecondary) > 0), 'Buổi tối ưu tiên chỗ có giá');
  assert.ok(sheet.items.some(item => item.name.startsWith('quà ') && item.metaPrimary === 'mang về'));
  // Bước xoay vị trí đối tác khi tạo list không được đổi chỗ các dòng (thứ tự theo ngày/bữa).
  const draft = buildDeckList(deckId, 'caption-01', '', '', '', [sheet]);
  for (const seed of ['r1', 'r2', 'r3']) {
    const rotated = rotatePartnerList(draft, deckId, data, {}, seed, 1, 1);
    assert.deepEqual((rotated.list.pages[0] as ListPage).items.map(item => item.name), sheet.items.map(item => item.name), 'Giữ nguyên thứ tự dòng sau khi xoay đối tác');
  }
  // Mỗi lần tạo (seed khác) ra bộ khác; cùng seed thì ổn định.
  const again = page(buildThreadsExpensePages(deckId, data, 'seed-a', 'Đà Lạt'));
  assert.deepEqual(again.items.map(item => item.name), sheet.items.map(item => item.name));
  const other = page(buildThreadsExpensePages(deckId, data, 'seed-b', 'Đà Lạt'));
  assert.notDeepEqual(other.items.map(item => item.name), sheet.items.map(item => item.name));
  // Địa điểm đã dùng ở list trước bị đẩy xuống cuối.
  const used = new Set(sheet.items.filter(item => item.label === 'Cà phê').map(item => String(item.id)));
  const fresh = page(buildThreadsExpensePages(deckId, data, 'seed-a', 'Đà Lạt', used));
  const freshCafes = fresh.items.filter(item => item.label === 'Cà phê');
  const unusedAvailable = data.cafe.filter(item => !used.has(item.id)).length;
  assert.equal(freshCafes.filter(item => !used.has(String(item.id))).length, Math.min(freshCafes.length, unusedAvailable), 'Dùng hết cà phê chưa dùng trước khi lặp lại');
  // Ví dụ trong thư viện mẫu dựng được khi nguồn chưa có dữ liệu.
  assert.match(page(buildThreadsExpenseExample(deckId, 'Đà Lạt')).subtitle, /MẪU MINH HỌA/);
  assert.match(threadsExpenseCaption(deckId, 4), /Đà Lạt/);
}

// Hết điểm có vé thì mới dùng điểm miễn phí, ghi "free" và 0 đồng.
const freeOnly = page(buildThreadsExpensePages(THREADS_EXPENSE_2N1D_ID, dataset({
  khu_du_lich: [], hoat_dong: items('hoat_dong', 'Đi dạo', 'Hoạt động', [0, 0]), check_in: items('check_in', 'Đồi cỏ', 'Check-in', [0, 20000]),
}), 'seed-free', 'Đà Lạt'));
const freeVisits = freeOnly.items.filter(item => item.label === 'Tham quan');
assert.equal(freeVisits.filter(item => item.metaPrimary === 'free').length, 2);
assert.ok(freeVisits.every(item => item.metaPrimary !== 'free' || item.metaSecondary === '0'));
assert.ok(freeVisits.some(item => item.name === 'đi dạo 1' || item.name === 'đi dạo 2'), 'Hoạt động viết thường chữ đầu, không thêm "vé"');

// Sheet không có nhà xe/thuê xe/đặc sản: bỏ các dòng phụ đó, bảng vẫn tạo được.
{
  const plain = page(buildThreadsExpensePages(THREADS_EXPENSE_2N1D_ID, dataset({ dich_vu: items('dich_vu', 'Xe', 'dich_vu', [100000, 100000]) }), 'seed-plain', 'Đà Lạt'));
  assert.equal(plain.items.length, 13);
  assert.match(plain.items[0].name, /^phòng /);
  assert.ok(!plain.items.some(item => item.label === 'Quà' || item.metaPrimary === 'khứ hồi' || /^thuê/.test(item.metaPrimary)));
  // Nhận diện theo nhiều cách ghi Loại dịch vụ/tên.
  const variants = page(buildThreadsExpensePages(THREADS_EXPENSE_2N1D_ID, dataset({ dich_vu: [
    ...items('dich_vu', 'Seon Limousine', 'Xe khách', [350000]), ...items('dich_vu', 'Tiệm Xe Máy Bình', 'Cho thuê', [120000]),
    ...items('dich_vu', 'Quà Đà Lạt', 'Quà tặng', [60000]),
  ] }), 'seed-variants', 'Đà Lạt'));
  assert.equal(variants.items.length, 16);
  assert.equal(variants.items[0].name, 'xe Seon Limousine 1');
  assert.equal(variants.items[2].name, 'thuê xe Tiệm Xe Máy Bình 1');
  assert.ok(variants.items.some(item => item.name === 'quà Quà Đà Lạt 1'));
}
// Thiếu dữ liệu bắt buộc thì báo rõ, không tạo bảng thiếu dòng.
assert.throws(() => buildThreadsExpensePages(THREADS_EXPENSE_2N1D_ID, dataset({ homestay: [] }), 's', 'Đà Lạt'), /thiếu homestay/);
assert.throws(() => buildThreadsExpensePages(THREADS_EXPENSE_3N2D_ID, dataset({ cafe: items('cafe', 'Cà phê', 'Cafe', [25000, 30000]) }), 's', 'Đà Lạt'), /thiếu quán cà phê/);
// Thiếu quán đúng bữa thì dùng quán ăn chính khác, không lấy quán ăn vặt.
const fallback = page(buildThreadsExpensePages(THREADS_EXPENSE_3N2D_ID, dataset({
  quan_an: [...items('quan_an', 'Quán tối', 'Ăn Tối', [250000, 150000, 120000, 99000, 80000, 70000, 60000]), ...items('quan_an', 'Quán vặt', 'Ăn Vặt', [40000, 30000])],
}), 'seed-c', 'Đà Lạt'));
assert.equal(fallback.items.filter(item => item.label === 'Ăn uống' && !item.name.startsWith('ăn vặt') && String(item.rawName).startsWith('Quán vặt')).length, 0);

// Mẫu thuộc nguồn Đà Lạt Threads, là mẫu chữ (không AI, không preset ảnh).
for (const deckId of [THREADS_EXPENSE_2N1D_ID, THREADS_EXPENSE_3N2D_ID]) {
  assert.ok(getAllowedDeckIds('dalat-threads').includes(deckId));
  assert.ok(!getAllowedDeckIds('dalat').includes(deckId));
  assert.ok(isTextNoteDeck(deckId));
  assert.equal(supportsPhotoPreset(deckId), false);
}
console.log('PASS threads-expense-sheet: 16/21 dòng, giá đầu người × 2, đúng bữa theo Mô hình, ưu tiên điểm có vé/đối tác/chưa dùng, báo thiếu dữ liệu, chỉ thuộc nguồn Threads.');
