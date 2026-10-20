// Dữ liệu minh họa cho prototype GĐ0. Không đọc/ghi backend hay dữ liệu thật.
export const PLACES = [
  { name: 'Cà phê Túi Mơ To', address: 'Hẻm 31 Sào Nam, P.11', time: '07:00', kind: 'cafe' },
  { name: 'Đồi chè Cầu Đất', address: 'Xã Xuân Trường', time: '08:30', kind: 'check-in' },
  { name: 'Bánh căn Nhà Chung', address: '1 Nhà Chung, P.3', time: '10:00', kind: 'ăn uống' },
  { name: 'Hồ Tuyền Lâm', address: 'Đường Hồ Tuyền Lâm, P.3', time: '11:30', kind: 'check-in' },
  { name: 'Lẩu gà lá é Tao Ngộ', address: '5 Đường 3/4, P.3', time: '12:30', kind: 'ăn uống' },
  { name: 'Vườn dâu Đất Lành', address: 'Thôn Đa Lộc, Xuân Thọ', time: '14:00', kind: 'trải nghiệm' },
  { name: 'Ga Đà Lạt', address: '1 Quang Trung, P.10', time: '15:30', kind: 'check-in' },
  { name: 'Đồi Robin', address: 'Đèo Prenn, P.3', time: '16:30', kind: 'check-in' },
  { name: 'Chợ đêm Đà Lạt', address: 'Nguyễn Thị Minh Khai, P.1', time: '19:00', kind: 'ăn uống' },
  { name: 'Quảng trường Lâm Viên', address: 'Trần Quốc Toản, P.10', time: '20:30', kind: 'check-in' },
  { name: 'Homestay Mây Lang Thang', address: 'Thôn Đa Phú, Xuân Thọ', time: '21:30', kind: 'lưu trú' },
  { name: 'Tiệm bánh Liên Hoa', address: '15 Đường 3/2, P.1', time: '06:30', kind: 'ăn uống' },
];

export const PARTNERS = ['Cà phê Túi Mơ To', 'Lẩu gà lá é Tao Ngộ', 'Homestay Mây Lang Thang', 'Vườn dâu Đất Lành', 'Tiệm bánh Liên Hoa'];

// style quyết định cách FakeSlide vẽ; hue là màu nền giả lập "ảnh".
export const TEMPLATES = [
  { id: 'spotlight-v6', name: 'Spotlight V6', group: 'Spotlight', style: 'spotlight', ratio: '4:5', pageCount: 10, hue: 22, description: 'Mỗi trang một địa điểm, ảnh tràn viền và tên lớn.' },
  { id: 'spotlight-maps', name: 'Spotlight Google Maps', group: 'Spotlight', style: 'spotlight', ratio: '4:5', pageCount: 8, hue: 160, description: 'Ảnh địa điểm kèm thẻ địa chỉ kiểu bản đồ.' },
  { id: 'spotlight-diary', name: 'Nhật ký Đà Lạt', group: 'Spotlight', style: 'spotlight', ratio: '4:5', pageCount: 9, hue: 330, description: 'Giọng kể nhật ký, chữ viết tay trên ảnh.' },
  { id: 'itinerary-3n2d', name: 'Lịch trình 3N2Đ', group: 'Lịch trình', style: 'itinerary', ratio: '4:5', pageCount: 6, hue: 35, description: 'Cover riêng, mỗi ngày một trang, chốt ăn sáng và dịch vụ.' },
  { id: 'itinerary-72h', name: '72H ở Đà Lạt với 3tr', group: 'Lịch trình', style: 'itinerary', ratio: '4:5', pageCount: 5, hue: 200, description: 'Bảng chi phí và lịch trình theo giờ.' },
  { id: 'itinerary-timeline', name: 'Lịch trình Timeline', group: 'Lịch trình', style: 'itinerary', ratio: '9:16', pageCount: 4, hue: 260, description: 'Dòng thời gian dọc, hợp đăng story.' },
  { id: 'grid-6', name: 'Lưới 6 ô', group: 'Lưới', style: 'grid', ratio: '4:5', pageCount: 6, hue: 95, description: 'Sáu ảnh nhỏ quanh tiêu đề, hợp chủ đề quán ăn.' },
  { id: 'grid-8-feed', name: 'Lưới 8 Feed', group: 'Lưới', style: 'grid', ratio: '4:5', pageCount: 5, hue: 12, description: 'Tám ô kiểu feed Instagram.' },
  { id: 'note-timed', name: 'Note theo giờ', group: 'Note', style: 'note', ratio: '9:16', pageCount: 2, hue: 48, description: 'Ghi chú iPhone, mỗi hoạt động một khung giờ.' },
  { id: 'note-2days', name: 'Note 2 ngày', group: 'Note', style: 'note', ratio: '9:16', pageCount: 3, hue: 48, description: 'Ghi chú lịch trình hai ngày cho Threads.' },
];

export const GROUPS = ['Spotlight', 'Lịch trình', 'Lưới', 'Note'];

const HOOKS = ['Đà Lạt 3 ngày không lo lạc', 'Đi Đà Lạt lần đầu nên ghé đâu?', 'Lịch trình chill cho hội bạn thân', 'Ăn gì ở Đà Lạt cho đáng tiền', 'Săn mây sớm, cafe chiều', 'Đà Lạt mùa dã quỳ'];

function rotate(array, offset) { return array.map((_, index) => array[(index + offset) % array.length]); }

export function buildPages(template, seed = 0) {
  const places = rotate(PLACES, seed * 3);
  const cover = { type: 'cover', title: HOOKS[seed % HOOKS.length], subtitle: 'Gợi ý từ dân địa phương · lưu lại để đi', items: [] };
  const pages = [cover];
  for (let index = 1; index < template.pageCount; index++) {
    if (template.style === 'spotlight') {
      const place = places[index % places.length];
      pages.push({ type: 'item', title: place.name, subtitle: place.address, items: [{ ...place }] });
    } else if (template.style === 'grid') {
      pages.push({ type: 'item', title: `Top quán ${index}`, subtitle: 'Ảnh thật · giá dễ chịu', items: rotate(places, index).slice(0, 4).map(place => ({ ...place })) });
    } else {
      pages.push({ type: 'item', title: `Ngày ${index}`, subtitle: 'Đi chậm, ăn ngon, ngủ sớm', items: rotate(places, index * 2).slice(0, template.style === 'note' ? 6 : 4).map(place => ({ ...place })) });
    }
  }
  return pages;
}

let listCounter = 0;
export function makeList(template, { status = 'new', minutesAgo = 0, setNumber } = {}) {
  listCounter += 1;
  const set = setNumber ?? listCounter;
  return {
    id: `${template.id}-${listCounter}-${Date.now().toString(36)}`,
    templateId: template.id,
    name: `${template.name} · Set ${set}`,
    status,
    createdAt: Date.now() - minutesAgo * 60_000,
    pages: buildPages(template, listCounter),
  };
}

export function initialLists() {
  const byId = Object.fromEntries(TEMPLATES.map(template => [template.id, template]));
  return [
    makeList(byId['spotlight-v6'], { status: 'new', minutesAgo: 6, setNumber: 4 }),
    makeList(byId['spotlight-v6'], { status: 'new', minutesAgo: 6, setNumber: 5 }),
    makeList(byId['itinerary-3n2d'], { status: 'edited', minutesAgo: 35, setNumber: 2 }),
    makeList(byId['note-timed'], { status: 'new', minutesAgo: 50, setNumber: 1 }),
    makeList(byId['grid-6'], { status: 'edited', minutesAgo: 90, setNumber: 3 }),
    makeList(byId['spotlight-maps'], { status: 'exported', minutesAgo: 240, setNumber: 1 }),
    makeList(byId['itinerary-72h'], { status: 'exported', minutesAgo: 600, setNumber: 2 }),
    makeList(byId['spotlight-diary'], { status: 'new', minutesAgo: 15, setNumber: 6 }),
  ];
}

export const INITIAL_SCHEDULES = [
  { id: 's1', name: 'Bài sáng Đà Lạt', time: '07:30', repeat: 'Hằng ngày', templates: ['Spotlight V6 ×3', 'Lịch trình 3N2Đ ×3'], enabled: true, next: 'Mai 07:30' },
  { id: 's2', name: 'Threads cuối tuần', time: '19:00', repeat: 'Thứ 6', templates: ['Note theo giờ ×4'], enabled: true, next: 'Thứ 6 19:00' },
  { id: 's3', name: 'Lưới quán ăn', time: '11:00', repeat: 'Một lần', templates: ['Lưới 6 ô ×5'], enabled: false, next: 'Đang tắt' },
];

export const INITIAL_JOBS = [
  { id: 'j-old-1', kind: 'export', title: 'Xuất 3 list · Spotlight Maps', status: 'done', progress: 100, detail: 'ZIP đã lưu vào Desktop\\Bai-dang', finishedAt: Date.now() - 4 * 3600_000 },
  { id: 'j-old-2', kind: 'sync', title: 'Đồng bộ đêm · Green Land', status: 'failed', progress: 62, detail: '3 ảnh Drive không tải được. Dữ liệu cũ vẫn được giữ.', finishedAt: Date.now() - 9 * 3600_000 },
];

export const SOURCES = [
  { id: 'dalat', label: 'Đà Lạt', count: 418, kind: 'Google Sheet', synced: '23:04 hôm qua', active: true },
  { id: 'greenland', label: 'Green Land', count: 459, kind: 'XLSX cục bộ', synced: '23:05 hôm qua', active: false },
  { id: 'threads', label: 'Đà Lạt Threads', count: 271, kind: 'Google Sheet', synced: '23:07 hôm qua', active: false },
];

export const STATUS_LABEL = { new: 'Mới', edited: 'Đã sửa', exported: 'Đã xuất' };

export function timeAgo(timestamp) {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} giờ trước` : `${Math.round(hours / 24)} ngày trước`;
}
