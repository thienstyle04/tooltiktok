# Sửa kết thúc lượt xuất lỗi và dọn file xuất dở — 2026-10-08

## Thay đổi

- Thanh tiến độ đóng ngay khi báo lỗi, bỏ trạng thái đang xuất và cho phép thao tác/ xuất lại. Thông báo lỗi vẫn nằm ở trạng thái giao diện.
- Hủy timer của lượt trước; cập nhật tiến độ tới muộn không mở lại thanh đã đóng. Xử lý cả lỗi trước khối render, lỗi đóng/lưu ZIP và lỗi khi thử lại ở chế độ tương thích.
- Các worker đang chạy được chờ kết thúc trước khi dọn DOM/cache và mở lượt tiếp theo; ngừng cấp thêm việc sau lỗi. Dọn URL blob và khôi phục hàm đọc style kể cả khi chuẩn bị ảnh/font thất bại.
- Batch có list lỗi ảnh ở trang sau: loại toàn bộ thư mục của list đó, gồm PNG đã render và TXT/XLSX đã tạo, trước khi đóng ZIP. Báo tên mẫu/list, lý do và số file xuất dở đã loại. Không xuất ZIP rỗng.
- Lưu ZIP Hẹn giờ dùng file tạm riêng cho từng lần ghi. Luồng ghi bị lỗi/ngắt/đóng sớm được đóng file handle trước khi xóa trên Windows. Chỉ xóa file tạm của chính lượt này và thư mục do nó tạo nếu rỗng; không xóa đệ quy hoặc ghi đè ZIP thành công. Lỗi xóa được báo kèm đường dẫn, không giả báo đã xóa.
- Lượt Hẹn giờ chuyển sang thất bại ngay khi lưu ZIP lỗi; báo cáo trình duyệt tới muộn không ghi đè kết quả dọn. Màn hình render tự động bỏ thanh đang xuất khi thất bại.
- Khi kiểm thử phát hiện profile chất lượng Gốc chưa chọn engine cho batch trong khi tắt engine fallback; bổ sung html2canvas cho profile này để tránh báo timeout dù chưa render.

Không xóa list, ảnh nguồn, cache ảnh vật lý, workbook hoặc file xuất thành công. Không quét/xóa các file tải về trước đây ngoài lượt xuất hiện tại. Trình duyệt không có quyền tùy ý xóa file cũ trong Downloads.

## Kiểm thử đã đạt

- Browser với export thật, hook React thật, ZIP thật; chỉ tiêm lỗi trong bundle kiểm thử: lỗi trước render, lỗi lưu ZIP, xuất lại cùng phiên không reload, timer cũ, tiến độ tới muộn, lỗi ở trang 2 sau khi trang 1 đã tạo PNG, batch tất cả list lỗi. Thanh tiến độ ẩn, busy false, thao tác khác được bật; ZIP list hợp lệ có CRC đúng và không chứa PNG/TXT/XLSX của list lỗi.
- Backend biệt lập: ZIP rỗng/không hợp lệ, ZIP bị cắt, stream lỗi, aborted và premature close. Cả 5 trường hợp chuyển failed, xóa file tạm sau đóng handle, không còn thư mục rỗng của lượt; file người dùng giả lập không đổi. Thử lại nhận ZIP hợp lệ và chống ghi đè file thành công.
- Kiểm thử xuất một phần/đối tác: đạt; các list hợp lệ tiếp tục xuất, list không đối tác có báo tên, XLSX không rỗng, list gốc không đổi.
- Xuất lại 12 list Note 3N2Đ/2N1Đ/Tổng hợp đã tạo bằng Sheet thật trong môi trường tách biệt: 3 batch, mở ZIP kiểm tra CRC và đối tác XLSX, giải mã 12 PNG và 1 JPG: đạt.
- Kiểm thử báo cáo Hẹn giờ xuất một phần và round-trip PNG/JPG: đạt.
- Backend TypeScript build, bundle hai component giao diện thực và git diff whitespace: đạt.
- Bản chính được nạp lại: backend health OK, frontend HTTP 200, automation không khóa; giữ phiên bản 0.9.06. Chưa commit/push/phát hành server.

Các file/stream lỗi đều là dữ liệu thử trong thư mục tạm riêng. Không dùng dữ liệu hoặc list người dùng để thử xóa.
