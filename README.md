# Dalat TikTok Carousel Tool

Công cụ tạo bộ ảnh TikTok Carousel cho nội dung du lịch Đà Lạt. Ứng dụng đọc dữ liệu địa điểm từ Google Sheet, lấy ảnh từ Google Drive hoặc thư mục ảnh đã cấu hình, hiển thị preview theo nhiều mẫu deck và hỗ trợ tạo caption AI.

## Tổng Quan

- Frontend: Next.js, chạy giao diện preview tại `http://localhost:3001`.
- Backend: NestJS, cung cấp API dữ liệu và proxy ảnh tại `http://localhost:3000`.
- Nguồn dữ liệu chính: Google Sheet, được backend đồng bộ thành dữ liệu nội bộ.
- Ảnh địa điểm: lấy từ link Google Drive trong Google Sheet hoặc các mapping ảnh trong `backend/data`.
- Ảnh cover: lấy từ sheet `Hinh_nen` trong Google Sheet và proxy qua `/assets/drive-file?id=...`.
- Caption AI: dùng DeepSeek API nếu có `DEEPSEEK_API_KEY`.

## Cấu Trúc Dự Án

```text
dalat-tiktok-carousel-tool/
├── setup.bat                  # Cài dependency và tạo backend/.env từ mẫu
├── start.bat                  # Chạy backend + frontend cho người dùng Windows
├── package.json               # Script workspace, chủ yếu là npm run dev
├── scripts/
│   └── dev.js                 # Chạy dev server, tự chọn port trống và dọn server cũ
├── backend/
│   ├── .env.example           # Mẫu biến môi trường
│   ├── package.json           # Script backend
│   ├── src/
│   │   ├── main.ts            # Entry NestJS, CORS và port backend
│   │   ├── app.module.ts      # Module gốc
│   │   ├── common/            # Constants, interfaces, utils dùng chung
│   │   ├── config/            # Cấu hình app
│   │   └── modules/guide/
│   │       ├── guide.controller.ts   # API cho frontend
│   │       ├── guide.service.ts      # Build dataset, deck, caption list
│   │       ├── logic/                # Logic chọn dữ liệu, dựng trang carousel
│   │       └── sync/                 # Đồng bộ Google Sheet và Google Drive
│   ├── data/
│   │   ├── sheet-drive-images.json   # Manifest ảnh đã sync từ Google Sheet/Drive
│   │   ├── generated-caption-lists.json
│   │   ├── image-mapping.json
│   │   └── used-inventory.json
│   └── reports/
└── frontend/
    ├── package.json           # Script frontend
    ├── app/
    │   ├── page.js            # Trang chính
    │   ├── api/[...path]/     # Proxy API từ frontend sang backend
    │   └── assets/[...path]/  # Proxy asset/ảnh từ frontend sang backend
    ├── components/            # UI preview, deck studio, controls
    ├── lib/                   # API client, export, render helpers
    └── public/fonts/          # Font dùng khi render carousel
```

## Cài Đặt Trên Máy Windows Khác

Yêu cầu trước khi cài:

- Cài Node.js bản mới, khuyến nghị Node.js 24 hoặc bản LTS mới.
- Có kết nối mạng để tải package npm, Google Sheet và Google Drive.
- Nếu dùng caption AI, cần DeepSeek API key.

Các bước cài:

1. Clone hoặc tải project về máy.
2. Mở thư mục gốc `dalat-tiktok-carousel-tool`.
3. Chạy `setup.bat`.
4. Mở `backend/.env` và kiểm tra cấu hình cần thiết.
5. Chạy `start.bat`.
6. Mở trình duyệt tại `http://localhost:3001`.

`setup.bat` sẽ cài package cho root, backend, frontend và tạo `backend/.env` từ `backend/.env.example` nếu file này chưa tồn tại.

## Cấu Hình Backend

File cấu hình chính là `backend/.env`.

```env
DEEPSEEK_API_KEY=sk-your-deepseek-api-key-here
DALAT_AUTO_SYNC_SHEET=true

# Nếu muốn đổi sang Google Sheet khác
DALAT_FNB_SHEET_URL=https://docs.google.com/spreadsheets/d/.../edit
DALAT_FNB_EXPORT_URL=https://docs.google.com/spreadsheets/d/.../export?format=xlsx

# Nếu muốn dùng thư mục ảnh local bổ sung
DALAT_IMAGE_DIR=data/images/dalat
TIKTOK_REFERENCE_DIR=data/images/tiktok
```

Ghi chú:

- Không commit `backend/.env` vì file này có thể chứa API key.
- `DALAT_AUTO_SYNC_SHEET=true` giúp backend tự đồng bộ Google Sheet khi khởi động.
- Nếu Google Sheet public hoặc có quyền truy cập đúng, máy mới không cần file Excel local để lấy dữ liệu chính.
- Sheet `Hinh_nen` đang được dùng làm nguồn ảnh nền cover cho các mẫu.

## Luồng Dữ Liệu Và Ảnh

1. Backend tải Google Sheet qua `DALAT_FNB_EXPORT_URL`.
2. Các sheet địa điểm được đọc thành danh sách địa điểm, quán, dịch vụ, homestay, khu du lịch...
3. Link Google Drive trong từng dòng được sync vào `backend/data/sheet-drive-images.json`.
4. Sheet `Hinh_nen` được sync vào trường `coverImages` để dùng riêng cho ảnh cover.
5. Frontend gọi `/api/guide-data`; route frontend sẽ proxy sang backend.
6. Ảnh Drive được hiển thị qua `/assets/drive-file?id=...`, giúp chạy được trên máy khác mà không phụ thuộc đường dẫn ảnh cũ.

## Chạy Dự Án

Cách dành cho người dùng:

```bat
start.bat
```

Cách dành cho developer:

```bash
npm run dev
```

Mặc định:

- Backend: `http://127.0.0.1:3000`
- Frontend: `http://127.0.0.1:3001`

Nếu port `3000` hoặc `3001` đang bận, script `scripts/dev.js` có thể chọn port trống kế tiếp và in URL thật ra terminal.

## Lệnh Hữu Ích

```bash
# Chạy cả backend và frontend từ thư mục gốc
npm run dev

# Kiểm tra TypeScript backend
cd backend
npm run build

# Đồng bộ lại Google Sheet và Google Drive manifest
cd backend
npm run sync:sheet

# Build frontend
cd frontend
npm run build
```

## Xử Lý Lỗi Thường Gặp

### Frontend báo `/api/guide-data` 404

- Kiểm tra backend có đang chạy không.
- Xem terminal `npm run dev` để biết backend/frontend đang dùng port nào.
- Thử mở trực tiếp `http://127.0.0.1:3000/api/guide-data`.
- Nếu có server Next.js cũ đang chạy, tắt bằng lệnh mà terminal gợi ý, ví dụ:

```bat
taskkill /PID <PID> /F
```

### Ảnh cover không hiện khi chạy trên máy khác

- Kiểm tra Google Sheet có sheet `Hinh_nen` và các link Drive còn truy cập được.
- Chạy lại:

```bash
cd backend
npm run sync:sheet
```

- Sau đó refresh frontend hoặc gọi lại `/api/guide-data?refresh=1`.

### Dữ liệu vẫn cũ sau khi sửa Google Sheet

- Đảm bảo `DALAT_AUTO_SYNC_SHEET=true`.
- Chạy thủ công `npm run sync:sheet` trong thư mục `backend`.
- Khởi động lại `start.bat` nếu backend đang giữ cache cũ.

### Next.js báo còn dev server cũ

`start.bat` sẽ xóa cache `frontend/.next` trước khi chạy. Nếu vẫn còn lỗi, tắt process cũ theo PID được in trong terminal rồi chạy lại `start.bat`.

## Kiểm Tra Trước Khi Đẩy Code

```bash
cd backend
npm run build

cd ../frontend
npm run build
```

Nên kiểm tra thêm trên trình duyệt:

- Mở `http://localhost:3001`.
- Vào Preview.
- Chọn vài mẫu deck.
- Kiểm tra ảnh địa điểm đúng nội dung trang.
- Kiểm tra trang cover có ảnh nền từ sheet `Hinh_nen`.
