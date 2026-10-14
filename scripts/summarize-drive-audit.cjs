const fs = require('node:fs'), path = require('node:path');
const dir = path.resolve(__dirname, '../outputs/drive-audit');
const report = JSON.parse(fs.readFileSync(path.join(dir, 'verified-report.json')));
const namesById = new Map();
for (const destination of ['dalat', 'greenland']) {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../backend/data/sheet-drive-images.${destination}.json`)));
  for (const item of Object.values(manifest.items || {})) {
    for (const id of [item.fileId, ...(item.candidateImages || []).map(image => image.fileId)]) {
      if (!id) continue;
      if (!namesById.has(id)) namesById.set(id, new Set());
      namesById.get(id).add(`${destination} / ${item.name}`);
    }
  }
}
const labels = {
  image_ok: 'Tải được ảnh',
  folder_link_points_to_image: 'Link ghi dạng thư mục nhưng ID tải được ảnh qua endpoint file',
  folder_has_verified_image: 'Thư mục có ít nhất một ảnh tải được',
  reachable_not_image: 'Endpoint trả HTML/nội dung khác, chưa tải được ảnh',
  unreachable: 'Không truy cập được công khai qua các endpoint đã thử',
  network_error: 'Lỗi mạng/timeout — chưa kết luận',
  access_required: 'Yêu cầu quyền truy cập/đăng nhập',
  folder_no_files_detected: 'Không đọc được danh sách file — chưa khẳng định thư mục trống',
  folder_has_files_unverified_images: 'Có danh sách file, chưa xác minh ảnh',
  folder_files_no_downloadable_image: 'Có file nhưng chưa tải được ảnh nào qua các endpoint đã thử',
  folder_image_check_inconclusive: 'Có file nhưng kiểm tra ảnh gặp lỗi mạng',
};
const clean = value => String(value || '').replace(/[|\r\n]/g, ' ');
const lines = ['# Rà link Drive Đà Lạt và Green Land', '', `Thời điểm: ${report.checkedAt}`, '',
  'Phạm vi: link nguồn trong manifest hiện có trên máy và các ID ảnh trong snapshot list đã lưu. Không đồng bộ Google Sheet trong đợt kiểm tra này. Không dùng cache để xác nhận link còn hoạt động. Không sửa/xóa cache, list hay dữ liệu nguồn.', '',
  'Thư mục được thử file lần lượt cho đến khi tải được một ảnh; kết quả “có ảnh” không có nghĩa mọi ảnh trong thư mục đều tốt. File được kiểm tra qua endpoint view, thumbnail và download, nhận dạng chữ ký ảnh JPEG/PNG/GIF/WebP. HTTP 404 hoặc HTML không chứng minh file bị xóa: có thể do quyền, giới hạn dịch vụ hoặc endpoint.', '',
  '| Kết quả | Số link |', '|---|---:|',
  ...Object.entries(report.counts).map(([key, count]) => `| ${labels[key] || key} | ${count} |`), '',
  '## Chi tiết link cần kiểm tra', '', '| Nguồn / địa điểm / list | Link | Kết quả |', '|---|---|---|'];
for (const entry of report.results.filter(r => !['image_ok', 'folder_has_verified_image'].includes(r.status))) {
  const refs = [...new Set([...entry.refs.map(r => [r.destination, r.name || r.group || r.deck, r.list, r.page ? `trang ${r.page}` : ''].filter(Boolean).join(' / ')), ...(namesById.get(entry.id) || [])])];
  const url = entry.folder ? `https://drive.google.com/drive/folders/${entry.id}` : `https://drive.google.com/open?id=${entry.id}`;
  lines.push(`| ${clean(refs.join('; '))} | [${entry.id}](${url}) | ${labels[entry.status] || entry.status} |`);
}
lines.push('', 'Danh sách đầy đủ, lần thử HTTP và ảnh đã xác minh nằm trong verified-report.json cùng thư mục.');
fs.writeFileSync(path.join(dir, 'KET-QUA.md'), lines.join('\n'));
fs.writeFileSync(path.join(dir, 'progress.json'), JSON.stringify({ completed: report.results.length, total: report.results.length, finished: true }));
fs.writeFileSync(path.join(dir, 'folder-progress.json'), JSON.stringify({ completed: report.results.length, total: report.results.length, finished: true }));
console.log(report.counts);
