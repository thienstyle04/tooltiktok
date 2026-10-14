# Thanh trạng thái ổn định khi tạo list

## Nguyên nhân và sửa

Khung `automation-lock-banner` của hàng đợi nằm trực tiếp trong `.app-shell.studio-workflow`. CSS đặt khung ở vị trí static và grid-column 2, nên khi khung xuất hiện nó tạo thêm hàng trong lưới và đẩy sidebar/giao diện chính xuống. Khi job chuyển queued sang running, khung bị tháo và bố cục nhảy trở lại.

- Thay khung hàng đợi và thông báo lịch tự động bằng `StudioStatusBar` bên trong `studio-shell`, sử dụng thanh trạng thái đã có, không thêm một hàng ở root.
- Thanh có chiều cao ổn định 64 px và vùng nút dành sẵn; nội dung hai dòng, chuỗi dài xuống dòng/cắt hiển thị với title giữ toàn bộ thông báo. Nút Hủy chỉ hiện khi queued, có trạng thái đang hủy/đã gửi, chặn bấm trùng, timeout 10 giây và hiển thị lỗi để thử lại.
- Đưa cảnh báo bìa/lưu ý của list vào nội dung chính, không để chúng thành con trực tiếp tạo hàng cho grid root. Đặt rõ hàng/cột của sidebar và shell trên desktop.
- Không sửa logic tạo list, hàng đợi backend, ảnh, dữ liệu, preset, các mẫu hoặc xuất file.

## Kiểm thử

- Browser với component và CSS thật: 1920, 1280, 768, 390 px, cả sáng/tối. Đối chiếu hình chữ nhật sidebar, shell, header, thanh trạng thái, vùng tạo list qua queued/running/completed/failed/cancelled/automated/thông báo dài: không dịch chuyển, không tràn ngang.
- Hủy yêu cầu: pending, thành công, lỗi mạng, bấm lại và job mới; nút không nhân đôi request và lỗi được báo trong thanh.
- Kiểm thử UI tạo list hiện có đạt. Kiểm thử UI khôi phục xuất lỗi vẫn đạt.
- Bundle DeckStudio thật và kiểm tra whitespace đạt. Bản chính backend health OK v0.9.07, frontend HTTP 200; người dùng tải lại giao diện để nhận thay đổi.

Không tạo/hủy job thật hoặc sửa dữ liệu người dùng trong kiểm thử. Chưa commit/push hoặc phát hành thay đổi này lên server.
