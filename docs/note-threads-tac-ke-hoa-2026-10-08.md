# Tắc Kè Hoa trong Note Threads 3N2Đ — 2026-10-08

## Phạm vi

Theo yêu cầu bổ sung vào một trong hai mẫu, chỉ thay đổi `itinerary-note-threads-3n2d`. List mới ưu tiên một dòng quán ăn đối tác Tắc Kè Hoa có địa chỉ, ưu tiên loại Ăn tối, đặt ở một vị trí buổi tối. Các dòng trùng tên ở quán ăn/cà phê được tính là cùng địa điểm, không xuất hiện hai lần. Khi nguồn không có dòng đối tác hợp lệ, giữ cơ chế lựa chọn hiện tại, không tự tạo dữ liệu.

Không sửa Google Sheet, list đã lưu, bố cục, caption hoặc mẫu 2N1Đ. Không commit/push/phát hành server.

## Kết quả kiểm thử

- Kiểm thử tổng hợp: 12 list 3N2Đ, mỗi list 18 địa điểm duy nhất, Tắc Kè Hoa một lần, đúng nhóm quán ăn và buổi tối. Luân phiên đối tác đổi vị trí giữa những lần xuất hiện gần nhất. Golden snapshot 2N1Đ không thay đổi.
- Bộ kiểm thử Note Threads hiện có: đạt 40 list.
- Sheet Threads thật trong môi trường tách biệt: tạo 4 list 3N2Đ, 4 list 2N1Đ và 4 list Tổng hợp địa điểm. Tắc Kè Hoa có mặt 4/4 list 3N2Đ, lần lượt ở vị trí địa điểm 6 → 18 → 12 → 18, đều thuộc buổi tối, dùng dòng Ăn tối.
- Xuất bằng trình duyệt thật: 3 batch, tổng 12 list. Mở lại ZIP kiểm tra CRC, XLSX đối chiếu chính xác tên đối tác, giải mã 12 PNG và một JPG. Tắc Kè Hoa xuất hiện đúng một lần trong mỗi XLSX của 4 list 3N2Đ.
- Kiểm tra xuất một phần: list không đối tác bị bỏ qua kèm tên; list hợp lệ vẫn xuất.
- Lưu/mở lại giữ nguyên dữ liệu. SHA của workbook và dữ liệu JSON nguồn chính không thay đổi trong thử nghiệm.
- Backend TypeScript build và kiểm tra whitespace: đạt. Sau nạp lại bản chính: backend health OK, frontend HTTP 200, nguồn đang chọn vẫn là `dalat-threads`, phiên bản 0.9.06.

## Tệp thử nghiệm

`C:\Users\thien\AppData\Local\Temp\threads-tac-ke-hoa-live-9jw5Mt`

Thư mục chứa `generation.json`, `results.json` và `exports`. Không dùng list người dùng để thử tạo hoặc xuất; không xóa dữ liệu thử hay cache.
