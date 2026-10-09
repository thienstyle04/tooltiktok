# Luân phiên đối tác, vị trí và ảnh — bàn giao 08/10/2026

## Phạm vi

Đã triển khai trên bản chính, giữ phiên bản 0.9.06. Chưa commit, push hoặc phát hành server.

Điều chỉnh sau bàn giao: theo yêu cầu mới, Spotlight Đối tác đã ngừng tạo mới trên mọi nguồn. Mẫu không còn ở thư viện tạo, API/hàng đợi/Hẹn giờ đều chặn; list người dùng đã lưu được giữ trong kho lưu trữ để xem/chỉnh sửa/xuất. Ma trận dưới đây được chạy trước khi ngừng mẫu. Kiểm thử riêng `test-retired-partner-spotlight.ts`, kiểm thử giao diện tạo list, guards nguồn, presets và 48 list Threads đã qua sau thay đổi; build backend/frontend thành công.

- Đối tác đã dùng vẫn được chọn cho list mới; không trùng tên địa điểm trong một lần chọn. Giữ các mức đối tác của builder hiện tại, đồng thời chặn list mới không có đối tác thực sự hiển thị.
- Lịch sử tách theo nguồn → mẫu → tên đối tác chuẩn hóa. Địa điểm có mặt ở cả Quán ăn và Cà phê dùng chung lịch sử trong cùng nguồn/mẫu, thống nhất với nhận diện XLSX.
- Ghép vị trí bằng thuật toán tìm cách sắp xếp hợp lệ, không chỉ shuffle. Giữ nhóm, khung giờ/bữa ăn, thứ tự đối tác trước Local và khối nhiều trang của cùng địa điểm. Trường hợp chỉ một vị trí hợp lệ có cảnh báo lưu cùng list.
- Vòng ảnh dùng ID nguồn và dấu vân tay nội dung cache khi có thể đối chiếu. Không coi Color Edit là ảnh mới; ảnh trên bìa/nền thuộc đối tác cũng được ghi nhận. Không dùng lại ảnh của lần xuất hiện gần nhất.
- Lịch sử ảnh/vị trí và list được ghi chung một file JSON qua cơ chế ghi an toàn. Lượt lỗi không lưu list/hay tiêu hao lịch sử. Xóa list không xóa lịch sử.
- Bootstrap từ list người dùng đã lưu, có áp dụng chỉnh sửa trang; bỏ qua ID trang mẫu mặc định. Không chỉnh sửa list cũ để tạo lịch sử.
- List mới là snapshot: đọc lại, preview, đồng bộ nguồn và xuất không chọn ảnh/vị trí ngẫu nhiên lại.
- Tạo đơn/batch, Spotlight Đối tác, hàng đợi và Hẹn giờ dùng cùng cơ chế; lưu và hiển thị cảnh báo. Batch giữ lượt thành công và nêu từng lượt thất bại.
- Backend trước khi lưu và frontend xuất XLSX dùng chung hàm nhận diện đối tác trên markup thực sự render.

## Kiểm thử tách biệt

Ảnh và địa điểm dùng trong kiểm thử tạo list là dữ liệu giả lập, không phải ảnh/quán người dùng. Google Sheet, AI và mạng bên ngoài bị thay bằng biên kiểm thử. Logic chọn, xoay vòng, lưu JSON, cache ảnh, Hẹn giờ và xuất browser dùng mã thật.

| Nguồn | Mẫu được phép | List kiểm thử (4/mẫu) |
|---|---:|---:|
| Đà Lạt | 29 | 116 |
| Đà Lạt Test | 29 | 116 |
| Green Land | 23 | 92 |
| Đà Lạt Threads | 12 | 48 |
| Tổng | 93 cặp nguồn–mẫu | 372 |

Kết quả tạo: tất cả 372 list qua kiểm tra quota, vòng ảnh, vị trí/cảnh báo, reload, preview và không đổi ảnh khi refresh. Quota V4/V6 vẫn đúng 4; Threads Quán ăn/Cà phê giữ tối đa 5, ít nhất 1, đối tác đứng trước Local.

Các bài kiểm tra bổ sung đã qua:

- 0, 1, 3, 4, 5, 7 đối tác; 1/2/nhiều ảnh; 9 lượt liên tiếp chạy hết ba vòng ảnh.
- Ảnh trùng nội dung dưới ID mới, thiếu/hỏng cache, PNG ghi dở có header đúng; ảnh mới thêm giữa vòng và ID ổn định khi cache biến mất.
- Ghép ảnh giữa các đối tác có pool chồng nhau; bìa chứa ảnh đối tác; một địa điểm đổi nhóm Quán ăn/Cà phê.
- Một đối tác trên grid có Local vẫn phải đổi vị trí, không được báo ngoại lệ giả; lịch trình không đổi bữa sáng thành bữa tối.
- TXT không bắt buộc ảnh; gói Threads chỉ kiểm tra ảnh thực sự được chọn.
- Lỗi render/cache và lỗi ghi list: không tiêu hao lịch sử; batch giữ 3 lượt thành công khi lượt 2 lỗi; hàng đợi tuần tự và retry request không tạo trùng.
- Hẹn giờ tạo 4 list Color Edit và truyền cảnh báo; xóa list giữ lịch sử; file lịch sử hỏng bị chặn, không ghi đè.
- Reserve hook ở cuối vòng không reset trước khi commit. Rollback giữ nguyên vòng hook; request đồng thời không lặp hook đã commit. Lỗi ghi kho hook sau khi list đã lưu trả thành công kèm cảnh báo, không báo thất bại giả để người dùng tạo trùng.
- Kiểm tra nguồn/mẫu và API; kiểm tra migration Color Edit và restart hai lần trên dữ liệu thử cũ, không đổi nội dung/ảnh đã duyệt.
- Backend typecheck, frontend production build và backend standalone bundle đều thành công. Bản chính đã được nạp lại, backend health và frontend HTTP 200; không tạo list thử trên bản chính.

## Xuất và lỗi phát hiện thêm

Đã xuất batch bốn list/mẫu trên browser, mở lại ZIP kiểm tra CRC và XLSX đối chiếu tên đối tác, TXT đếm địa điểm, PNG/JPG giải mã trong browser và bằng sharp. Xuất một list đạt cùng một list không đối tác: list đạt vẫn xuất, list còn lại có báo cáo tên mẫu/list.

Đối chiếu cuối đã qua **372 XLSX độc lập và 2.996 ảnh trong các batch chính** (không tính JPG kiểm tra bổ sung). Không có list mất file vì tên thư mục trùng. Các ảnh giả lập dùng để phân biệt ID/nội dung, không dùng để kết luận ảnh nguồn đẹp hay xấu.

Trong lúc đối chiếu số file thực tế, phát hiện Spotlight Đối tác cũ không có số caption nên nhiều list đều thành `set1`, ghi đè file trong ZIP. Đã thêm tên thư mục duy nhất trong batch, không đổi ID hoặc nội dung list cũ. Chạy lại bốn list cùng đối tác trên ba nguồn: mỗi batch có **4 XLSX và 32 PNG**, không ghi đè. Bộ kiểm thử đã thêm kiểm tra số folder, tổng file ảnh và số XLSX độc lập, không chỉ kiểm tra nội dung trong folder.

Bằng chứng kiểm thử cục bộ (thư mục Temp có thể bị hệ thống dọn):

- Ma trận tạo mới và reload/preview cuối: `C:/Users/thien/AppData/Local/Temp/partner-rotation-integration-2KymKz/summary.json`.
- Ma trận xuất đầy đủ: `C:/Users/thien/AppData/Local/Temp/partner-rotation-integration-DUrK5G/` — mỗi nguồn có `generation.json` và `exports/`.
- Xuất lại thiết kế Spotlight và sửa collision: `C:/Users/thien/AppData/Local/Temp/partner-rotation-integration-2KymKz/` — các nguồn Đà Lạt/Đà Lạt Test/Green Land có `exports-selected/`.
- Đối chiếu ZIP/XLSX cuối, dùng archive đã sửa cho Spotlight Đối tác: `C:/Users/thien/AppData/Local/Temp/partner-rotation-integration-DUrK5G/final-export-matrix.json`.
- Các ca lỗi cuối: `C:/Users/thien/AppData/Local/Temp/partner-rotation-failures-UgKKLu/`.
- Kiểm kê dữ liệu thực chỉ đọc: `C:/Users/thien/AppData/Local/Temp/partner-rotation-data-audit-gSQ3Ta/inventory.json`.

## Dữ liệu thực còn cần chú ý

Kiểm kê workbook/manifest/cache cục bộ không tạo/xóa list, không đồng bộ mạng hay sửa nguồn. Số dưới đây là **dòng được đánh đối tác**, có thể gồm tên trùng giữa hoặc trong nhóm; không được cộng thẳng thành số địa điểm duy nhất.

| Nguồn | Quán ăn | Cà phê | Lưu trú | Dịch vụ | Chơi đêm |
|---|---:|---:|---:|---:|---:|
| Đà Lạt | 6 | 5 | 5 | 1 | 1 |
| Đà Lạt Test | 4 | 5 | 5 | 1 | 1 |
| Green Land | 5 | 17 | 3 | 0 | 1 |
| Đà Lạt Threads | 6 | 5 | 5 | 1 | 1 |

- Các dòng đối tác đã kiểm kê đều có ít nhất hai ảnh cache khác nội dung theo phép so pixel của bài audit. Đa số có 2–6 ảnh, không có nghĩa mọi mẫu nhiều ảnh đều tạo lặp được.
- **Đà Lạt Test / Spotlight Nhật ký:** hiện chỉ 4 dòng đối tác Quán ăn; mẫu cần 5 quán ăn đối tác. Phải bổ sung ít nhất một địa điểm đối tác khác tên, không giảm quota.
- **Spotlight Đối tác:** nếu một lượt đã dùng cả 6 ảnh của quán thì lượt tiếp theo cùng quán cần 6 ảnh khác nữa. Kho ảnh hiện có của nhiều quán chỉ 2–6 ảnh, nên có thể bị chặn đúng chính sách. Ví dụ Lagom Homestay có 3 ảnh, Tori Wooden House và êm đà lạt có 5, Timi Boutique Stay có 2 ảnh trong cache đã kiểm kê. Thông báo tạo sẽ chỉ rõ quán/số ảnh; khi người dùng đã chọn quán cụ thể, không tự đổi sang quán khác.
- **Green Land:** không có dòng đối tác Dịch vụ trong bản kiểm kê; nếu một mẫu yêu cầu riêng đối tác nhóm này thì cần bổ sung, không lấy đối tác sai nhóm.
- **Đà Lạt Threads:** Tắc kè hoa xuất hiện nhiều dòng/nhóm. Selector và lịch sử không tính những dòng cùng tên thành đối tác độc lập để lách quota.
- Chưa xác minh lại quyền truy cập Google Drive trực tuyến hoặc ảnh mới chưa đồng bộ. Audit không tính riêng các cột ảnh Nhật ký; các mẫu theo mùa vẫn phụ thuộc hook/pool của nguồn. Kết quả giả lập chứng minh logic, không khẳng định nguồn thực đủ dữ liệu cho mọi mẫu.

## Chạy lại

Từ `backend/`:

```powershell
npm run build
npx ts-node src/modules/guide/tools/test-partner-rotation.ts
npx ts-node src/modules/guide/tools/test-partner-rotation-failures.ts
npx ts-node src/modules/guide/tools/test-partner-rotation-integration.ts
```

Từ `frontend/`, dùng đường dẫn `generation.json` được in bởi bài integration:

```powershell
$env:DALAT_TEST_REPORT = 'C:\...\dalat\generation.json'
node tools/test-threads-source-export.cjs
```

`DALAT_TEST_DECKS` tùy chọn để chạy lại một số mẫu; cần có `grid-4` hoặc `summary-note` cho bài JPG/bỏ qua list thiếu đối tác. Các bài tạo/lỗi dùng thư mục Temp mới; không trỏ chúng vào kho dữ liệu người dùng.
