// Tổng kết chuyến đi 3N2Đ: dữ liệu giả, không đọc/ghi dữ liệu người dùng.
import assert from 'node:assert/strict';
import type { GuideItem, ListPage, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import {
  assertThreadsRecapPages, buildThreadsRecapExample, buildThreadsRecapPages, pickThreadsRecapCaption, recapMoney, recapShortMoney,
  recapTotals, syncThreadsRecapPhotos, threadsRecapCaptions, THREADS_RECAP_PAGES, THREADS_RECAP_PHOTOS,
} from '../logic/threads-trip-recap';

const make = (sectionKey: SectionKey, type: string, price: string, count: number, partners = 0, prefix: string = sectionKey): GuideItem[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`, sectionKey, sectionTitle: sectionKey, name: `${prefix} ${i + 1}`, address: `${i} Đường thử`, type,
    headPrice: price, price: '', isPartner: i < partners, imageUrl: `/assets/drive-file?id=${prefix}-${i}`, imageMapped: true,
    imageSource: 'manual', candidateImageUrls: [`/assets/drive-file?id=${prefix}-${i}`],
  } as unknown as GuideItem));
const data = (overrides: Partial<Record<SectionKey, GuideItem[]>> = {}): WorkbookItemsBySection => ({
  quan_an: make('quan_an', 'Ăn trưa', '45,000 đ', 10, 2), cafe: make('cafe', 'Cafe', '30,000 đ', 6, 1),
  homestay: make('homestay', 'Lưu trú', '150,000 đ', 3), check_in: make('check_in', 'Check-in', '0 đ', 6),
  khu_du_lich: make('khu_du_lich', 'Khu du lịch', '100.000 đ', 3),
  dich_vu: [...make('dich_vu', 'Nhà xe', '250,000 đ', 1, 0, 'Nhà Xe Thử'), ...make('dich_vu', 'Thuê xe', '120,000 đ', 1, 0, 'Thuê xe Thử'),
    ...make('dich_vu', 'Thuê xe', '150,000 đ', 1, 0, 'Amazing Xanh - Xe điện tự lái'), ...make('dich_vu', 'Đặc sản', '50,000 đ', 1, 0, 'Quà')],
  ...overrides,
} as unknown as WorkbookItemsBySection);
const note = (pages: ReturnType<typeof buildThreadsRecapPages>) => pages[0] as ListPage;
const line = (page: ListPage, kind: string) => page.items.filter(item => item.label === kind);

// Cách ghi tiền như note tự viết; caption làm tròn xuống như "hết 2tr4".
assert.deepEqual([0, 80000, 450000, 1000000, 1050000, 2700000, 4860000].map(recapMoney), ['0k', '80k', '450k', '1tr', '1tr050k', '2tr700k', '4tr860k']);
assert.deepEqual([999000, 1000000, 1205000, 2430000, 2499999].map(recapShortMoney), ['999k', '1tr', '1tr2', '2tr4', '2tr4']);

// Dựng đủ: 1 note + 8 ảnh, mọi số tiền = Giá đầu người × hệ số, tổng/chia đúng.
const pages = buildThreadsRecapPages(data(), 'seed-1', 'Đà Lạt');
assertThreadsRecapPages(pages);
const page = note(pages);
assert.equal(pages.length, THREADS_RECAP_PAGES);
assert.equal(page.title, 'Đà Lạt 3N2Đ'); assert.equal(page.chipText, '2 Người');
assert.equal(page.items.length, 13);
assert.equal(line(page, 'coach')[0].metaSecondary, String(250000 * 2 * 2));
assert.match(line(page, 'coach')[0].name, /khứ hồi$/);
assert.equal(line(page, 'stay')[0].metaSecondary, String(150000 * 2 * 2));
assert.match(line(page, 'stay')[0].name, /2 đêm$/);
const bike = line(page, 'bike')[0];
assert.equal(bike.metaSecondary, String(120000 * 3)); assert.equal(bike.metaPrimary, '120k×3');
assert.ok(!page.items.some(item => /xe điện/i.test(item.name)), 'Xe điện tự lái không phải dòng xe máy');
assert.equal(line(page, 'fuel')[0].metaSecondary, '80000');
for (const item of page.items.filter(item => ['food', 'cafe', 'visit', 'paid-visit'].includes(String(item.label)))) {
  const unit = item.sourceSectionKey === 'quan_an' ? 45000 : item.sourceSectionKey === 'cafe' ? 30000 : item.sourceSectionKey === 'khu_du_lich' ? 100000 : 0;
  assert.equal(item.metaSecondary, String(unit * 2), item.name);
}
assert.equal(line(page, 'paid-visit')[0].sourceSectionKey, 'khu_du_lich', 'Dòng tham quan đầu ưu tiên điểm có vé');
const sum = page.items.reduce((total, item) => total + Number(item.metaSecondary), 0);
assert.deepEqual(recapTotals(page), { total: sum, perPerson: sum / 2 });
const featured = page.items.filter(item => item.imageUrl);
assert.equal(featured.length, THREADS_RECAP_PHOTOS);
assert.deepEqual(pages.slice(1).map(p => p.backgroundImage), featured.map(item => item.imageUrl), 'Ảnh đúng thứ tự dòng');
assert.ok(page.items.some(item => item.isPartner), 'Có ít nhất 1 đối tác');
assert.ok(page.items.every(item => item.rotationGroup), 'Dòng cố định vị trí khi xoay đối tác');
assert.equal(new Set(page.items.filter(item => item.sourceSectionKey).map(item => item.name)).size, page.items.filter(item => item.sourceSectionKey).length);

// List sau ưu tiên địa điểm chưa dùng.
const used = new Set(page.items.map(item => item.sourceKey!).filter(Boolean));
const next = note(buildThreadsRecapPages(data(), 'seed-2', 'Đà Lạt', used));
const repeated = next.items.filter(item => item.sourceSectionKey && used.has(item.sourceKey!));
assert.ok(repeated.length <= 3, `List sau lặp quá nhiều địa điểm: ${repeated.map(item => item.name).join(', ')}`);

// Hết đối tác "chưa dùng": vẫn dành một ô ăn/cà phê cho đối tác.
const allUsed = new Set(Object.values(data()).flat().filter(item => item.isPartner).map(item => `${item.sectionKey}|${item.name.toLowerCase()}|${item.address.toLowerCase()}`));
Object.values(data()).flat().filter(item => item.isPartner).forEach(item => allUsed.add(item.id));
assert.ok(note(buildThreadsRecapPages(data(), 'seed-3', 'Đà Lạt', allUsed)).items.some(item => item.isPartner));

// Nguồn tắt logic đối tác / chưa có đối tác: list 0 đối tác vẫn hợp lệ.
const noPartners = data();
Object.values(noPartners).flat().forEach(item => { item.isPartner = false; });
const zero = buildThreadsRecapPages(noPartners, 'seed-4', 'Phan Thiết');
assertThreadsRecapPages(zero);
assert.equal(note(zero).items.filter(item => item.isPartner).length, 0);
assert.equal(note(zero).title, 'Phan Thiết 3N2Đ');

// Thiếu nhà xe/thuê xe: bỏ dòng, không bịa giá.
const noService = buildThreadsRecapPages(data({ dich_vu: [] }), 'seed-5', 'Đà Lạt');
assertThreadsRecapPages(noService);
assert.equal(note(noService).items.length, 11);
assert.ok(!note(noService).items.some(item => item.label === 'coach' || item.label === 'bike'));

// Thiếu dữ liệu bắt buộc: báo rõ, không dựng list.
assert.throws(() => buildThreadsRecapPages(data({ homestay: make('homestay', 'Lưu trú', '', 3) }), 's', 'Đà Lạt'), /homestay có Giá đầu người/);
const fewPhotos = data({ quan_an: make('quan_an', 'Ăn', '45,000 đ', 10, 2).map(item => ({ ...item, imageUrl: '/assets/drive-file?id=same', candidateImageUrls: [] })) });
assert.throws(() => buildThreadsRecapPages(fewPhotos, 's', 'Đà Lạt'), /quán ăn có Giá đầu người và ảnh riêng chưa trùng/);

// Trang ảnh luôn dựng lại theo dòng note (sau khi bước xoay đổi ảnh đối tác).
const rotated = structuredClone(pages) as ListPage[];
const partnerRow = rotated[0].items.find(item => item.isPartner && item.imageUrl)!;
partnerRow.imageUrl = '/assets/drive-file?id=rotated-photo';
assert.throws(() => assertThreadsRecapPages(rotated), /đúng thứ tự/);
const synced = syncThreadsRecapPhotos(rotated);
assertThreadsRecapPages(synced);
assert.ok(synced.some(p => p.backgroundImage === '/assets/drive-file?id=rotated-photo'));

// Caption: điền số thật, hết vòng mới lặp, không lặp liền nhau ở ranh giới vòng.
const money = recapTotals(page);
const history: string[] = [];
for (let i = 0; i < threadsRecapCaptions().length * 2 + 1; i++) {
  const caption = pickThreadsRecapCaption(history, `cap-${i}`, money);
  assert.ok(!/\{(destination|total|perPerson)\}/.test(caption));
  assert.ok(caption.includes(recapShortMoney(money.perPerson)) || caption.includes(recapMoney(money.total)), caption);
  if (history.length) assert.notEqual(caption, history[history.length - 1]);
  const cycleStart = Math.floor(history.length / threadsRecapCaptions().length) * threadsRecapCaptions().length;
  assert.ok(!history.slice(cycleStart).includes(caption), `Lặp caption trong cùng vòng: ${caption}`);
  history.push(caption);
}
assert.ok(pickThreadsRecapCaption([], 'x', money, 'Phan Thiết').includes('Phan Thiết'));

// Mẫu minh họa của thư viện: không mang link ảnh giả.
const example = buildThreadsRecapExample('Đà Lạt');
assert.equal(example.length, THREADS_RECAP_PAGES);
assert.ok(example.every(p => !p.backgroundImage) && (example[0] as ListPage).items.every(item => !item.imageUrl));

console.log('PASS Tổng kết chuyến đi 3N2Đ: giá × hệ số, tổng/chia, 8 ảnh đúng thứ tự, đối tác tối thiểu, 0 đối tác, thiếu dữ liệu, xoay ảnh, caption.');
