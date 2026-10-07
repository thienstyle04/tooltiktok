# Đà Lạt Test và xuất batch một phần — 0.9.05

- Giữ nguồn Đà Lạt, thêm Đà Lạt Test với Sheet `1QlMXQ1XH-uHS6bBEC7Pps5f1p9rYJ780`. Lần đầu chọn **Dữ liệu & Cài đặt → Đà Lạt Test → Tải dữ liệu & chuyển**; không tự đổi nguồn đang chọn. Đồng bộ tự động vẫn trong 23:00–06:00.
- Workbook/manifest được công bố cùng nhau sau khởi tạo thành công. List, chỉnh sửa, vòng sử dụng và hook theo chủ đề tách nguồn; cache ảnh vật lý dùng chung theo Drive ID. Nguồn tùy chỉnh đã dùng Sheet mới giữ ID và list.
- Threads Quán ăn/Cà phê cho hai nguồn Đà Lạt: đúng 10 tên, tối đa 5 đối tác có địa chỉ, phần thiếu bù Local cùng nhóm, tối thiểu 1 đối tác, đối tác trước; đủ 6 ảnh riêng khác nhau. XLSX chỉ tên đối tác thực tế.
- Xuất batch bỏ qua list không đạt kiểm tra đối tác/dữ liệu; các list hợp lệ vẫn xuất. Thông báo và `BAO-CAO-LIST-BO-QUA.txt/json` ghi tên mẫu, tên list và lý do. List bỏ qua không bị xóa bởi thao tác xuất rồi xóa. Tất cả không hợp lệ thì không tạo ZIP rỗng. Không nới quy tắc đủ đối tác của Spotlight V4/V6 hoặc quy tắc ảnh của mẫu.

Kiểm thử: 16 list giả lập tách nguồn; 16 list từ hai workbook thật và 96 ảnh xuất (ảnh gốc/Color Edit), TXT/XLSX/ZIP được mở lại. Tập link thật gồm 22 địa điểm nguồn cũ và 21 địa điểm Test không ghi nhận lỗi; chưa phải audit toàn bộ link. Các ca thiếu đối tác/Local/ảnh, đồng bộ hỏng/ngắt/thử lại, lưu/reload, Hẹn giờ, themed Spotlight và build backend/frontend đã đạt. Không dùng dữ liệu chính để tạo list thử.
