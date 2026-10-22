# Note 01 · Đen tối giản

Mẫu thường `threads-note-dark-list`, phiên bản 1. Chỉ nguồn loại Threads và nội dung Đà Lạt. Chưa triển khai Note 02/03; chưa commit, push hoặc phát hành.

## Thiết kế

Một trang 1080×1920, dựng theo ảnh chụp Ghi chú iPhone chế độ tối (2026-10-22). Nền #000, chữ #fff, điểm nhấn #eec333. Trên cùng: status bar (giờ + chuông tắt, sóng, wifi, pin; giờ 8:00–22:59 và % pin lấy theo id list để mỗi list khác nhau), thanh “‹ Tất cả iCloud” + hoàn tác, làm lại (xám), chia sẻ, thêm. Dưới cùng: checklist, kẹp giấy, bút đánh dấu, soạn mới và thanh home. Không hiện dòng tiêu đề trên ảnh (bỏ theo yêu cầu 2026-10-22); dữ liệu vẫn giữ title “Đà Lạt lưu lại nè” cho kiểm tra và list con, ô “Tiêu đề trang” bị ẩn ở mẫu này. Nhóm hiển thị “🍂 Quán Cafe xinh”, “🍂 Địa điểm đi chơi”, “🍪 Địa điểm ăn” chữ trắng thường cùng cỡ tên; tên thụt vào sau gạch “–”, cỡ 42/400, line-height 1.33, lề trái 76. Font hệ thống giống iPhone (-apple-system/SF Pro, Windows dùng Segoe UI, dự phòng Be Vietnam Pro). Thanh cỡ chữ điều chỉnh tỷ lệ từ cỡ tên (tối đa khoảng 50 với 18 tên một dòng); vị trí áp vào cả khối nội dung. Không tự co chữ hoặc cắt tên. Preview và export cùng renderer và kiểm tra tràn.

## Dữ liệu

6 cafe + 6 đi chơi/check-in (`check_in`, `khu_du_lich`, `hoat_dong`, `dia_diem_lich_su`) + 6 quan_an. Chỉ cần tên hợp lệ; không cần ảnh hoặc địa chỉ. Matcher chung 18 vị trí, khử trùng tên giữa nhóm, tối đa 2 đối tác/nhóm, ưu tiên nhiều đối tác hợp lệ nhất. Thiếu đối tác bù địa điểm thường, cho phép 0 đối tác. Không đủ địa điểm thường hoặc trùng nhóm gây thiếu phương án thì dừng và báo lỗi. Hỗ trợ đối tác bắt buộc trong giới hạn nhóm, không tự tăng quota.

Snapshot lưu tên, source key/section, nhóm, thứ tự, caption, typography và version. Chọn mới ưu tiên tên không nằm ở list gần nhất, số lần dùng ít hơn; đổi vị trí khi có thể. Lịch sử lấy từ snapshot đã lưu của cùng nguồn–mẫu. Ghi lỗi khôi phục danh sách cũ, không tiêu hao vòng. Không cần bảng dữ liệu/hook mới hoặc API mới.

## Caption và xuất

30 caption riêng, giọng Threads gần gũi và gợi bình luận, không tự nhận trải nghiệm; chỉ ở caption/TXT, không trên ảnh. Hết kho mới lặp, không lặp liền nhau ở ranh giới vòng. List chính không tiêu hao. List con kế thừa tiêu đề note, cỡ chữ và vị trí đã lưu của List chính, không kế thừa tên địa điểm hoặc caption main.

Tạo đơn/batch/Hẹn giờ dùng queue hiện có; Note01 không chờ Drive cache, không gọi AI. Xuất một PNG/JPG + TXT, thêm XLSX khi có đối tác hiển thị. Nếu 0 đối tác không ghi XLSX trống. Ngoại lệ chỉ đúng Note01; mẫu cũ vẫn chặn theo quy tắc riêng. Tràn chữ hoặc lỗi render bỏ toàn folder list lỗi, giữ list đạt và báo cáo bỏ qua.

## Kiểm tra

`test-threads-note-dark-list.ts`: 61 list trong thư mục tạm, vòng caption, trùng nhóm/quota, đối tác bắt buộc, 0/1/2 đối tác, thiếu dữ liệu, không ảnh/địa chỉ, source guard, lưu/reload, main typography, rollback, capacity và scheduler không Drive.

`test-threads-note-dark-browser.cjs`: khung/font, overflow, đơn/batch PNG/JPG 1080×1920, TXT đúng caption, XLSX đúng tên hiển thị, không XLSX ở list 0 đối tác, giữ list hợp lệ khi list khác tràn; kiểm tra ngoại lệ không lan sang mẫu cũ.

`audit-note01-local.ts`: chỉ đọc snapshot Threads Đà Lạt đã đồng bộ, dựng bản duyệt vào OS temp. Không sửa Sheet, Drive, file nguồn hoặc list người dùng.
