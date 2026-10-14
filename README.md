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
├── start.bat                  # Tự kiểm tra + cài môi trường (Node.js, dependencies, API key) roi chạy backend + frontend
├── package.json               # Script workspace, chủ yếu là npm run dev
├── scripts/
│   ├── dev.js                 # Chạy dev server, tự chọn port trống và dọn server cũ
│   ├── run-tests.js           # Chạy test theo tầng (npm test / test:browser / test:live)
│   ├── typecheck-frontend.js  # Kiểm tra kiểu JSDoc cho frontend/lib
│   └── cleanup-test-outputs.js # Liệt kê/dọn kết quả test cũ (mặc định chỉ liệt kê)
├── backend/
│   ├── .env.example           # Mẫu biến môi trường
│   ├── package.json           # Script backend
│   ├── src/
│   │   ├── main.ts            # Entry NestJS, CORS và port backend
│   │   ├── app.module.ts      # Module gốc
│   │   ├── common/            # Constants, interfaces (guide.types.ts dùng chung với frontend), utils
│   │   ├── config/            # Cấu hình app
│   │   └── modules/guide/
│   │       ├── guide.controller.ts      # API cho frontend
│   │       ├── guide.service.ts         # Điều phối: nguồn dữ liệu, dataset, tạo/làm mới list
│   │       ├── guide-asset.service.ts   # File tĩnh, ảnh Drive/thư viện, Color Edit
│   │       ├── generation-gate.ts       # Hàng đợi tạo list, cờ bận, giữ chỗ khi xuất
│   │       ├── caption-text.ts          # Prompt/caption AI, làm sạch chữ list
│   │       ├── list-display.ts          # Hiển thị/làm mới list đã lưu, phiên bản mẫu
│   │       ├── generated-list-store.ts  # Đọc/ghi kho list đã tạo
│   │       ├── page-text-overrides.ts   # Chữ người dùng sửa trên từng trang
│   │       ├── workbook-store.ts        # Link Sheet, XLSX tải lên, bản chụp workbook, thống kê nguồn
│   │       ├── workbook-items.ts        # Dựng địa điểm từ workbook
│   │       ├── guide-file-io.ts         # Ghi JSON an toàn, đường dẫn dữ liệu theo nguồn
│   │       ├── deck-kinds.ts            # Nhóm mẫu dùng chung
│   │       ├── logic/                   # Logic chọn dữ liệu, dựng trang carousel
│   │       ├── sync/                    # Đồng bộ Google Sheet và Google Drive
│   │       └── tools/                   # Test (test-*.ts) và audit chạy tay
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
    │   └── studio/            # Hàm phụ của DeckStudio (catalog, chặn tên trong caption)
    ├── lib/                   # API client, export, render helpers
    │   ├── pageMarkup.js      # Điểm vào render trang → HTML (renderCoverPage/renderListPage)
    │   ├── markup/            # Render theo nhóm mẫu: grid, spotlight, itinerary, budget, pov...
    │   ├── exportClient.js    # Điểm vào xuất ảnh/ZIP (exportBatch, exportActiveList...)
    │   ├── exporter/          # Xuất: ảnh, render canvas, kiểm tra trước khi xuất, ZIP/XLSX
    │   └── types.js           # Kiểu JSDoc lấy từ backend guide.types.ts
    ├── tools/                 # Test frontend (test-*) và helper exportClientTestHelper.cjs
    └── public/fonts/          # Font dùng khi render carousel
```

## Cài Đặt Trên Máy Windows Khác

Yêu cầu trước khi cài:

- Cài Node.js bản mới, khuyến nghị Node.js 24 hoặc bản LTS mới.
- Có kết nối mạng để tải package npm, Google Sheet và Google Drive.
- Nếu dùng caption AI, cần DeepSeek API key.

Các bước chạy:

1. Clone hoặc tải project về máy.
2. Mở thư mục gốc `dalat-tiktok-carousel-tool`.
3. Chạy thẳng `start.bat`.
4. Trong lần chạy đầu tiên, mở `backend/.env` và kiểm tra API key nếu được yêu cầu.
5. Chờ tool tự mở cửa sổ Chrome riêng; nếu không có Chrome, tool dùng Edge.

`start.bat` tự kiểm tra Node.js (tự cài qua winget nếu thiếu), tự dùng lại dependencies và `backend/.env` được lưu trong `%LOCALAPPDATA%\DalatTikTokCarouselTool`, và tự hỏi `DEEPSEEK_API_KEY` nếu file `.env` chưa có key hợp lệ. Khi giải nén phiên bản mới trên cùng máy, không cần chạy file cài đặt nào riêng — chỉ `start.bat`. Hệ thống chỉ cài lại dependencies một lần khi danh sách dependencies thực sự thay đổi.

## Cấu Hình Backend

File cấu hình chính là `backend/.env`.

```env
DEEPSEEK_API_KEY=sk-your-deepseek-api-key-here
DALAT_AUTO_SYNC_SHEET=false
DALAT_SESSION_STICKY_DATASET=true

# Nếu muốn đổi sang Google Sheet khác
DALAT_FNB_SHEET_URL=https://docs.google.com/spreadsheets/d/.../edit
DALAT_FNB_EXPORT_URL=https://docs.google.com/spreadsheets/d/.../export?format=xlsx

# Nếu muốn dùng thư mục ảnh local bổ sung
DALAT_IMAGE_DIR=data/images/dalat
TIKTOK_REFERENCE_DIR=data/images/tiktok
```

Ghi chú:

- Không commit `backend/.env` vì file này có thể chứa API key.
- Mặc định tool chỉ tải Google Sheet **một lần lúc mở**; tạo list / xuất file không rebuild Sheet nền.
- Bấm **Làm mới** hoặc đổi điểm đến vẫn sync Sheet ngay.
- `DALAT_AUTO_SYNC_SHEET=true` chỉ bật khi muốn tự kéo Sheet định kỳ (~10 phút/lần) trong lúc tool đang chạy.
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

Tool luôn dùng backend `3000` và frontend `3001`. Mỗi máy chỉ chạy một phiên: lần chạy mới sẽ xác minh rồi tắt đúng phiên tool cũ và cửa sổ Chrome/Edge chuyên dụng. Nếu một ứng dụng khác chiếm cổng hoặc phiên cũ không thể tắt, startup dừng và báo PID thay vì tự đổi cổng.

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

- Bấm **Làm mới** trên giao diện (hoặc gọi `/api/guide-data?refresh=1`).
- Hoặc tắt tool rồi mở lại `start.bat` để tải Sheet lần đầu của phiên mới.
- Chỉ bật `DALAT_AUTO_SYNC_SHEET=true` nếu muốn tự kéo Sheet định kỳ khi tool đang chạy.

### Next.js báo còn dev server cũ

`start.bat` sẽ xóa cache `frontend/.next` trước khi chạy. Launcher chỉ mở giao diện sau khi health và API cache ảnh của frontend/backend cùng phiên, cùng phiên bản. Nếu vẫn báo cổng bị chiếm, đóng ứng dụng theo PID được in trong terminal rồi chạy lại `start.bat`.

## Kiểm Tra Trước Khi Đẩy Code

```bash
# Từ thư mục gốc: test offline (~3 phút) + kiểm tra kiểu frontend
npm test

# Cần Chrome/Edge (không cần bật tool)
npm run test:browser

cd backend
npm run build

cd ../frontend
npm run build
```

### Các tầng test

| Lệnh | Gồm | Điều kiện |
|---|---|---|
| `npm test` | Test offline backend (`tools/test-*.ts`), frontend, scripts và `typecheck:frontend` | Không cần mạng/server |
| `npm run test:browser` | Test giao diện/xuất ảnh trong trình duyệt headless | Chrome hoặc Edge, playwright trong `frontend/node_modules` |
| `npm run test:live` | Test gọi backend `3000`/frontend `3001` thật hoặc Internet | Tool đang chạy (nên dùng dữ liệu thử) |
| `node scripts/run-tests.js manual` | Liệt kê test cần dữ liệu ngoài (xem chú thích trong `scripts/run-tests.js`) | Chạy tay theo hướng dẫn |

- Tùy chọn: `--filter <chuỗi>`, `--list`, `-j <số luồng>`, `--verbose`.
- Mỗi test chạy với `DALAT_DATA_DIR` là thư mục tạm riêng. Sau khi chạy, runner đối chiếu `backend/data` và báo **NGUY HIỂM** nếu dữ liệu thật bị đổi (hãy tắt tool trước khi chạy test).
- Test ghi ảnh/báo cáo (spotlight icons, cover placement, AI settings) ghi vào thư mục tạm khi chạy qua runner.
- `node scripts/build-update-release.js` tự chạy `npm test` và dừng nếu lỗi (bỏ qua có chủ đích: `DALAT_RELEASE_SKIP_TESTS=1`).
- Test frontend cần hàm nội bộ của exportClient dùng `frontend/tools/exportClientTestHelper.cjs`, không đọc mã nguồn bằng văn bản.

### Kiểm tra kiểu frontend

`npm run typecheck:frontend` chạy TypeScript (của backend) ở chế độ `checkJs` trên `frontend/lib` theo `frontend/tsconfig.checkjs.json`. Kiểu dữ liệu chung khai báo bằng JSDoc qua `frontend/lib/types.js`, lấy trực tiếp từ `backend/src/common/interfaces/guide.types.ts`, ví dụ:

```js
/** @param {import('./types').ListPage} page */
```

### Dọn kết quả test cũ

```bash
node scripts/cleanup-test-outputs.js                    # chỉ liệt kê (mặc định > 7 ngày)
node scripts/cleanup-test-outputs.js --older-than 30    # đổi ngưỡng ngày
node scripts/cleanup-test-outputs.js --yes              # xóa thật các mục đã liệt kê
```

Chỉ xét mục có tên khớp mẫu kết quả test/audit trong `outputs/` và `.test-runtime*/`; luôn bỏ qua `outputs/update-release`, `releases/`, `shared/` và dữ liệu thật. Liên kết/junction bên trong chỉ bị gỡ liên kết, thư mục đích không bị xóa.

### Tùy chọn: ẩn thay đổi dữ liệu runtime khỏi `git status`

Các file trong `backend/data` vẫn nằm trong git, nên mỗi lần dùng tool đều tạo diff. Nếu chỉ muốn ẩn trên máy mình (không ảnh hưởng máy khác, không đổi repo):

```bash
git ls-files backend/data | xargs git update-index --skip-worktree     # ẩn
git ls-files -v backend/data | grep '^S'                              # xem file đang ẩn
git ls-files backend/data | xargs git update-index --no-skip-worktree  # bỏ ẩn
```

Lưu ý: khi file đang ẩn, `git pull` có thay đổi các file đó sẽ báo lỗi; bỏ ẩn trước khi pull/commit dữ liệu.

Nên kiểm tra thêm trên trình duyệt:

- Mở `http://localhost:3001`.
- Vào Preview.
- Chọn vài mẫu deck.
- Kiểm tra ảnh địa điểm đúng nội dung trang.
- Kiểm tra trang cover có ảnh nền từ sheet `Hinh_nen`.
