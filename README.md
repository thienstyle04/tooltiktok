# Dalat TikTok Carousel Tool

Công cụ chuyển đổi dữ liệu từ Google Sheet/Excel thành bộ ảnh TikTok Carousel với tính năng tự động gợi ý ảnh và tạo caption AI.

## 🚀 Tính năng nổi bật
- **Tự động hóa**: Chuyển đổi từ file Excel thành các bộ ảnh 4, 6, 8 trang hoặc Itinerary 3N2D/4N3D.
- **AI Caption**: Tích hợp DeepSeek để tạo nội dung caption hấp dẫn cho TikTok.
- **Preview Trực tiếp**: Xem trước bộ ảnh ngay trên trình duyệt trước khi xuất file.
- **Tính di động**: Có thể chạy dễ dàng trên USB hoặc clone từ GitHub sang máy khác.

---

## 💻 Hướng dẫn chạy trên máy khác (USB / GitHub)

Để đảm bảo tool hoạt động ổn định khi di chuyển sang máy tính khác, hãy làm theo các bước sau:

### 1. Cài đặt môi trường ban đầu
Chạy file `setup.bat` ở thư mục gốc. File này sẽ:
- Tự động cài đặt các thư viện cần thiết (`npm install`).
- Tạo file cấu hình `.env` cho Backend.

### 2. Cấu hình ảnh (Portability)
Tool hỗ trợ 2 cách để nhận diện thư mục ảnh khi bạn đổi máy:

- **Cách 1 (Khuyên dùng cho USB)**: Copy các thư mục ảnh của bạn vào bên trong thư mục `data/images/` của project:
  - Thư mục ảnh Đà Lạt: `data/images/dalat/`
  - Thư mục ảnh mẫu TikTok: `data/images/tiktok/`
  - Thư mục thư viện ảnh (từ ổ C cũ): `data/images/library/`
- **Cách 2 (Sử dụng .env)**: Mở file `backend/.env` và cập nhật đường dẫn tuyệt đối hoặc tương đối:
  ```env
  DALAT_IMAGE_DIR=data/images/dalat
  TIKTOK_REFERENCE_DIR=data/images/tiktok
  ```

### 3. Khởi động
Chạy file `start.bat` để mở tool.
- Frontend: `http://localhost:3001`
- Backend: `http://localhost:3000`

---

## 🛠 Lệnh CLI (Cho Developer)

1. Cài đặt dependencies:
   - `cd backend && npm install`
   - `cd frontend && npm install`
2. Chạy cả backend và frontend:
   - `npm run dev` (ở thư mục gốc)

---

## 📝 Lưu ý khi sử dụng
- **Google Sheet Data**: Dữ liệu hiện được đồng bộ trực tiếp từ Google Sheet. Bạn có thể thay đổi URL Sheet mục tiêu bằng cách cập nhật `DALAT_FNB_SHEET_URL` và `DALAT_FNB_EXPORT_URL` trong file `backend/.env`.
- **Auto Sync**: Mặc định tool sẽ tự động kiểm tra và tải dữ liệu mới từ Sheet mỗi khi khởi động (nếu bật `DALAT_AUTO_SYNC_SHEET=true`).
- **DeepSeek API**: Nhớ cập nhật `DEEPSEEK_API_KEY` trong `backend/.env` để sử dụng tính năng tạo caption AI.
- **Cấu hình Library**: Nếu bạn đã map ảnh trong `backend/data/image-mapping.json`, tool sẽ ưu tiên tìm trong thư mục library đã cấu hình. Nếu không tìm thấy ở đường dẫn cũ (ổ C), nó sẽ tự động tìm trong `data/images/library/`.
