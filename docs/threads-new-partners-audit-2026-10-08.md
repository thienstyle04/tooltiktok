# Kiểm tra đối tác mới của nguồn Đà Lạt Threads — 08/10/2026

## Kết luận

Đối chiếu XLSX tải từ Sheet `1eTupjLJX-C4V06Erwe8rGzgB9JyzfzjG` với snapshot ngày 07/10: **Tiệm Gội An Yên** vừa được đánh dấu đối tác, nhóm dịch vụ, dòng 10; địa điểm đã có trong Sheet trước đó, không phải dòng địa điểm mới. Số dòng đánh dấu đối tác từ 18 lên 19 (không phải số địa điểm duy nhất; có tên trùng giữa nhóm).

Bản chính đã có snapshot mới trước khi audit bắt đầu. SHA-256 workbook đang dùng và XLSX tải trực tiếp từ Sheet khớp nhau: `be21f60e872f74b2ec7ab7b793b7128dac7139b2ce0e32a2bcfc2caf94956098`. API đối tác và parser đều nhận đúng `isPartner: true`; địa chỉ `16 Nguyễn Thượng Hiền, Cam Ly – Đà Lạt`; 6 ảnh riêng trong manifest/cache hợp lệ.

## Tạo và xuất thực tế trong môi trường riêng

Không giả lập địa điểm/ảnh hoặc sửa workbook. Dùng workbook mới đầy đủ và manifest của chính nguồn Threads; chỉ tái sử dụng metadata khi link nguồn vẫn khớp. Cache ảnh được sao chép sang vùng thử, không dùng cache nguồn Đà Lạt khác.

- Tạo **48 list**, 4 list cho mỗi mẫu trong toàn bộ 12 mẫu Threads/Note: 48 thành công, 0 thất bại.
- Tiệm Gội An Yên xuất hiện trong **3 list**: Tổng hợp Threads list 1; Tổng hợp Threads chữ list 1 và list 3. Không ép chọn hoặc sửa nội dung sau khi tạo.
- Xuất **12 batch**, mở lại đủ **48 XLSX** đối chiếu với đối tác thực tế trong list. Kiểm tra TXT, 128 ảnh PNG trong batch chính và 1 ảnh JPG trong bài kiểm thử xuất một phần. ZIP kiểm tra CRC, ảnh giải mã lại trong browser và sharp.
- Trong cả ba TXT tương ứng có dòng `- Tiệm Gội An Yên (Cam Ly - Đà Lạt)`; XLSX có đúng tên `Tiệm Gội An Yên`.
- Quán ăn/Cà phê chỉ chọn nhóm riêng; Top list và các mẫu Note/lịch trình hiện không có slot dịch vụ này. Quán thuộc `Dich_vu` không xuất hiện ở những mẫu đó, không phải lỗi mất đối tác. Đối tác mới cũng không được đảm bảo xuất hiện trong mọi list Tổng hợp vì còn luân phiên các quán khác.

Không sửa code chọn địa điểm, không đồng bộ lại bản chính, không sửa/xóa list người dùng hoặc tiêu hao lịch sử thật. Kiểm tra hash nguồn và JSON dữ liệu chính trước/sau: không đổi. Nguồn đang chọn vẫn là Đà Lạt Threads. Chưa commit, push hoặc phát hành server.

## Bằng chứng

Thư mục thử: `C:/Users/thien/AppData/Local/Temp/threads-new-partners-cGh3GS/`.

- `threads-live.xlsx`: workbook tải từ Sheet.
- `audit.json`: so sánh nguồn cũ/mới, ảnh, parser, 48 kết quả tạo và đối tác mới được chọn.
- `generation.json`: snapshot list thử dùng cho xuất browser.
- `exports/report.json`: tên đối tác đọc từ XLSX thật trong các ZIP.
- `exports/threads-mix-local.zip`, `exports/threads-mix-text.zip`: TXT/XLSX có đối tác mới.

Giới hạn: kiểm tra ảnh từ cache hợp lệ của nguồn đang đồng bộ; không re-resolve lại quyền truy cập của mọi thư mục Drive. Thư mục Temp có thể được hệ thống dọn.
