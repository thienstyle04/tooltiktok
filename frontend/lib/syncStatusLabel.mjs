export function syncStatusLabel(source) {
  if (source?.phase === 'partial') {
    if (!source.result) return 'Lượt cập nhật bị ngắt';
    const images = Number(source.result.failed) > 0;
    const hooks = source.result.hookErrors?.length > 0;
    if (images && hooks) return 'Hoàn tất một phần — còn ảnh và hook lỗi';
    if (hooks) return 'Hoàn tất dữ liệu ảnh — còn hook lỗi';
    if (images) return 'Hoàn tất, còn ảnh lỗi — chỉ dùng ảnh hợp lệ';
    return 'Hoàn tất một phần';
  }
  return ({ waiting: 'Chờ cập nhật', running: 'Đang cập nhật', paused: 'Đang chờ tác vụ tạo/xuất', complete: 'Hoàn tất', error: 'Cập nhật thất bại' })[source?.phase] || 'Chưa cập nhật';
}
