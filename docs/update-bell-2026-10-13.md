# Chuông cập nhật — 13/10/2026

Thay banner tự hiện bằng chuông cố định góc phải. Bảng nổi giữ nội dung updater cũ, chỉ mở khi bấm; ghi chú cuộn riêng để nút đóng và các thao tác luôn nhìn thấy. Chấm đỏ giữ đến khi không còn phiên bản mới. Không thay API/backend, lịch kiểm tra phiên bản, tải/xác minh, khởi động lại hoặc rollback.

Trạng thái được đọc mỗi 60 giây khi đóng, 5 giây khi mở, và khi mở bảng. Nút Kiểm tra lại dùng POST check sẵn có. Dọn timer/listener và hủy GET khi đóng/unmount; phản hồi GET cũ không được ghi đè kết quả thao tác mới. Lỗi không bị diễn giải thành chưa có cập nhật.

Vùng updater được loại khỏi guard bỏ bản nháp của DeckStudio. Mở, đóng, kiểm tra và hẹn giờ không lưu/xóa bản nháp; chuyển trang vẫn cảnh báo thật. Cập nhật ngay bị khóa khi backend bận hoặc có nội dung chưa lưu. Đóng bảng không hủy lịch hay trình cập nhật.

## Kiểm thử

- `node scripts/run-tests.js browser --filter test-update-bell`: hai test offline dùng API giả lập, không cài đặt thật.
- Các trạng thái: không có/có phiên bản mới, đã xem, hẹn/hủy lịch theo UTC+7, bận, đang tải, lỗi cài, mất mạng, lỗi kiểm tra/thử lại, hoàn tất và updater chưa bật.
- Kiểm tra polling 60/5 giây, cleanup, stale response, Strict Mode, chấm đỏ, thao tác bàn phím/focus, click ngoài và Escape.
- Real Sidebar/CSS tại 1920/1280/768/390, sáng/tối: không đẩy nội dung, không chồng menu/nút Sáng–Tối, bảng vừa khung và chuông cố định khi cuộn.
- Full DeckStudio: giữ cỡ chữ 45 và nội dung chưa lưu khi mở/hẹn/đóng chuông; không tự lưu/cảnh báo sai; lưu sau đó và chuyển trang thành công. Guard chuyển trang thật vẫn hoạt động.
- Hồi quy `test-status-bar-layout` và frontend typecheck đạt.

Chỉ bàn giao bản chính, giữ phiên bản 0.9.07. Chưa commit, push, tạo release hoặc đưa lên server; máy khác chỉ nhận UI sau một đợt phát hành riêng.
