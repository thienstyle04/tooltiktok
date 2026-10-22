# Tổng kết chuyến đi 3N2Đ

Mẫu `threads-trip-recap-3n2d`, phiên bản 1 (2026-10-22). Chuyển từ bài Threads "Tổng kết cho 1 chuyến đi Mộc Châu 3N2D hết 2tr4 mà đẹp cỡ này" sang Đà Lạt. Mở cho mọi nguồn Threads (địa danh đổi theo nguồn qua `localizeList`). Chưa commit, push hoặc phát hành.

## Thiết kế

9 trang 3:4, xuất 1080×1440 (cùng nhánh xuất 397px với Spotlight Maps/Nhật ký).

- **Trang 1, note trắng kiểu Ghi chú iPhone:** tiêu đề đậm "Đà Lạt 3N2Đ" và dòng " 2 Người". Mỗi dòng ghi "Tên: tiền", sau đó là "Tổng …", rồi "Chia theo người: …" in đậm gạch chân. Dòng thuê xe ghi phép nhân (`100k×3 = 300k`), số tiền tô vàng như bài gốc.
- **Font:** font hệ thống (-apple-system/SF Pro, Windows dùng Segoe UI). Cỡ mặc định 44, chỉnh bằng thanh cỡ chữ. Không tự co chữ hay cắt tên; tràn chữ thì chặn xuất.
- **Trang 2–9:** ảnh riêng (ảnh tay trong Sheet) của 8 dòng địa điểm đầu, đúng thứ tự dòng, phủ kín khung, có hỗ trợ bộ màu ảnh.

## Số tiền

Tất cả tính bằng code từ cột Giá đầu người (`headPriceVnd`), cho 2 người:

| Dòng | Cách tính |
|---|---|
| Nhà xe/limousine khứ hồi | giá × 2 người × 2 chiều (bỏ dòng nếu Sheet không có nhà xe) |
| Homestay 2 đêm | giá × 2 người × 2 đêm (bắt buộc) |
| Thuê xe máy | giá × 3 ngày, 1 xe (không lấy xe điện/ô tô; bỏ dòng nếu không có) |
| Xăng | 80k cố định, như Bảng chi tiêu Threads 3N2Đ |
| 9 địa điểm | giá × 2 người; điểm miễn phí ghi 0k; dòng tham quan đầu ưu tiên điểm có vé |

Thứ tự địa điểm: tham quan có vé, ăn, cà phê, tham quan, ăn, tham quan, cà phê, ăn, ăn. Cách ghi tiền: `0k`, `450k`, `1tr`, `2tr700k`, `1tr050k`. Tổng và phần chia theo người được renderer tính lại từ các dòng. Thiếu giá hoặc thiếu ảnh riêng thì báo lỗi rõ, không bịa số.

## Đối tác và xoay vòng

- Ưu tiên địa điểm chưa dùng ở list trước. Mỗi list có ít nhất 1 đối tác: nếu đối tác "chưa dùng" đã hết thì dành một ô ăn/cà phê cho đối tác.
- Dòng giữ cố định vị trí (`rotationGroup` riêng từng dòng); bước xoay chỉ đổi ảnh đối tác. Sau khi xoay, trang ảnh được dựng lại từ note (`syncThreadsRecapPhotos`) nên ảnh luôn khớp dòng.
- XLSX ghi tên quán thật (`rawName`), không ghi "… 2 đêm", và chỉ ghi khi tên quán thật sự hiện trên dòng.
- Nguồn tắt logic đối tác: list 0 đối tác vẫn tạo và xuất được, không ghi XLSX rỗng.

## Caption

12 caption có điền số thật: `{perPerson}` làm tròn xuống như "2tr4", `{total}` ghi đủ. Giọng chi phí tham khảo, gợi chia sẻ và tag bạn, không tự nhận là chuyến đi thật. Hết vòng mới lặp, không lặp liền nhau ở ranh giới vòng. Caption chỉ có trong TXT, không in lên ảnh.

## Kiểm tra

- `backend/.../tools/test-threads-trip-recap.ts`: số tiền theo hệ số, tổng/chia, 8 ảnh đúng thứ tự, đối tác tối thiểu, 0 đối tác, thiếu nhà xe/thuê xe, thiếu giá/ảnh, đồng bộ ảnh sau khi xoay, vòng caption, mẫu minh họa.
- `frontend/tools/test-threads-recap-browser.cjs`: preview 9 trang 3:4, tràn chữ, xuất đơn/batch PNG/JPG 1080×1440, TXT đúng caption, XLSX đối tác, 0 đối tác (có cờ thì xuất, không cờ thì chặn).
- `test-partner-rotation-integration.ts` tự gồm mẫu này trong nguồn `dalat-threads`: tạo 4 list thật, xoay ảnh đối tác, bộ màu ảnh, tải lại.
