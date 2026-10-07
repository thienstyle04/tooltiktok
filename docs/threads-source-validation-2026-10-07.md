# Đà Lạt Threads — bàn giao bản chính

Biên bản dưới đây ghi nhận bước bàn giao trên workspace 0.9.05. Sau đó người dùng yêu cầu commit, push GitHub và phát hành server; bản phát hành kế tiếp là **0.9.06**. Gói phát hành chỉ lấy code từ commit, không đóng kèm dữ liệu người dùng hoặc thư mục công cụ kiểm thử backend/frontend.

Nguồn `dalat-threads` dùng Sheet `1eTupjLJX-C4V06Erwe8rGzgB9JyzfzjG`, tên quản lý **Đà Lạt Threads**, tên địa danh trong nội dung **Đà Lạt**. Không thay link Đà Lạt, Đà Lạt Test hoặc Green Land. Lựa chọn nguồn hiện tại không bị đổi.

## Sử dụng

Chạy `npm run dev` tại thư mục workspace, mở Dữ liệu & Cài đặt, chọn **Đà Lạt Threads** rồi **Tải dữ liệu & chuyển** trong lần đầu. Nguồn này chỉ có 12 mẫu Threads/Note. Các nguồn khác không hiện nhóm này và API từ chối tạo sai nguồn trước khi chọn dữ liệu. Hẹn giờ cũng dùng chính sách này; yêu cầu đang chờ không được âm thầm chuyển sang nguồn khác.

Không tự đồng bộ lần đầu. Sau khi có dữ liệu cục bộ, đồng bộ nền vẫn theo khung 23:00–06:00. Workbook và manifest được công bố cùng nhau qua snapshot nguyên tử; lỗi tải không mượn dữ liệu nguồn khác.

## Kiểm thử đã chạy

- 48 list bằng dữ liệu/ảnh tổng hợp riêng, 4 list cho mỗi mẫu trong 12 mẫu. Tạo qua GuideService thật, không dùng dữ liệu người dùng để thử xóa.
- 12 lần xuất batch bằng trình duyệt thật: 48 XLSX được mở lại và đối chiếu chính xác tên đối tác; 128 ảnh được giải mã lại, TXT đủ số địa điểm. Kiểm tra thêm JPG và batch có một list không có đối tác: chỉ bỏ list lỗi, có báo cáo tên list, list hợp lệ vẫn xuất.
- Quán ăn/Cà phê: 0, 1, 3, 4, 5, 7 đối tác; tối đa 5, thiếu bù Local; thiếu địa chỉ/Local/ảnh và ảnh trùng; kiểm tra không trùng địa điểm.
- Catalog của Đà Lạt, Test, Green Land, Threads và nguồn tùy chỉnh; tạo đơn/batch/caption, request trực tiếp, hàng đợi, kiểm tra lịch Hẹn giờ và lưu/mở lại.
- Trình duyệt thử bộ chọn Hẹn giờ: đúng 12 mẫu trên Threads, không hiện trên nguồn khác; đổi nguồn xóa lựa chọn không hợp lệ, tải lại giữ lựa chọn hợp lệ.
- Spotlight V4/V6, Mảng xanh, Tone đen, Mùa hồng trên nguồn Test vẫn tạo được. Ảnh gốc giữ nguyên; gói ảnh Cà phê dùng Color Edit và giữ preset sau reload. Cache Color Edit ghi dở tự phục hồi.
- Lỗi tải, workbook không hợp lệ, lỗi folder, không có ảnh, lỗi tải ảnh và ngắt đồng bộ: snapshot cũ giữ nguyên; thử lại công bố được snapshot mới. Kiểm tra cho cả Test và Threads.
- Dọn dữ liệu trên bản sao: có sao lưu, chỉ xóa generated list và override liên quan, giữ trang main/vòng sử dụng/ảnh/lịch sử. Chạy lần hai không dọn lại; lỗi ghi phục hồi và journal khôi phục sau gián đoạn.
- Backend TypeScript/bundle và frontend production build thành công.

Trong kiểm thử phát hiện bìa cố định Top list bị bước làm sạch hiển thị thay bằng ảnh ngẫu nhiên. Đã ngăn xoay/thay ảnh Threads/Note khi đọc list; đối chiếu trang trước/sau khởi động lại đã qua.

Sheet thật đã được tải XLSX và đọc cấu trúc **chỉ đọc**: Quán ăn 77 dòng có tên, Cà phê 44; các dòng đánh dấu đối tác hai nhóm đều có địa chỉ và link ảnh. Đây không phải kiểm tra khả năng truy cập toàn bộ ảnh Drive. Manifest và tải ảnh thật sẽ được kiểm tra trong đồng bộ thủ công; dữ liệu/ảnh thiếu phải báo lỗi, không hạ yêu cầu chọn list.

## Sao lưu và trạng thái bản chính

Đã chạy migration trên `backend/data` sau khi kiểm thử bản sao. Không có generated list Threads/Note cũ cần xóa. Lịch `hengio2` vốn đang tắt được giữ nguyên cấu hình/lịch sử và bổ sung lý do tạm dừng theo nguồn.

Sao lưu nguyên bản file lịch ở:

`backend/data/migration-backups/threads-source-1791343291792-013cd141-7b32-4201-89c9-a1c62bcf8eb9/automation-schedules.json`

Marker/report: `backend/data/threads-source-migration-v1.json`. Đọc lại không tạo migration hoặc backup trùng. Muốn khôi phục cấu hình lịch, dừng tool rồi chép file sao lưu đúng tên về `backend/data`; giữ marker để không tự dọn lại. Lịch sai nguồn vẫn bị chặn khi bật/chạy. Muốn tái sử dụng Threads/Note, tạo lịch mới trên Đà Lạt Threads.

Không chỉnh Google Sheet, không reset vòng sử dụng, không xóa workbook/cache/file xuất. Không sửa dữ liệu `shared/data` của bản cài cũ. Không commit, push hoặc phát hành server. Phiên bản workspace vẫn 0.9.05; bản thử chạy từ workspace, không dùng release cũ qua `shared/current.json`.

## Chạy lại kiểm thử

Tại `backend`:

```powershell
npx ts-node src/modules/guide/tools/test-threads-source.ts
npx ts-node src/modules/guide/tools/test-threads-source-migration.ts
npx ts-node src/modules/guide/tools/test-source-request-guards.ts
npx ts-node src/modules/guide/tools/test-threads-food-local.ts
npx ts-node src/modules/guide/tools/test-dalat-test-source.ts
npx ts-node src/modules/guide/tools/test-dalat-test-sync.ts
$env:DALAT_TEST_SYNC_SOURCE = 'dalat-threads'
npx ts-node src/modules/guide/tools/test-dalat-test-sync.ts
npx ts-node src/modules/guide/tools/test-color-edit-cache-recovery.ts
```

Tại `frontend`, dùng đường dẫn `REPORT=...generation.json` do bài kiểm thử 48 list in ra:

```powershell
$env:DALAT_TEST_REPORT = 'DUONG_DAN_REPORT_GENERATION_JSON'
node tools/test-threads-source-export.cjs
node tools/test-threads-source-ui.cjs
```

ZIP/report kiểm thử nằm trong thư mục temp riêng của bài thử, không ghi vào thư mục xuất hay dữ liệu của người dùng.
