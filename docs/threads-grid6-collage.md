# Threads · Lưới 6 ảnh

Mẫu thường `threads-grid6-collage`, phiên bản 1. Chỉ nguồn `kind=threads` **và** `contentDestinationId=dalat`; không suy ra quyền từ tên hiển thị. Chưa commit/push/phát hành.

Theo yêu cầu cập nhật: giữ giọng gần gũi, gợi bình luận của các mẫu Threads hiện có, nhưng dùng kho riêng 30 hook và 18 mô tả bài đăng. Không chỉ sao chép ba câu Threads Tổng hợp; không lấy hook Spotlight/Google Docs hay tự nhận trải nghiệm cá nhân. Hook và mô tả có hai vòng độc lập dựa trên các snapshot lưu thành công: dùng hết kho mới lặp, không lặp liền nhau ở ranh giới vòng. Mô tả bài đăng/caption TXT không sao chép hook bìa. List chính (kể cả minh họa thiếu dữ liệu) không tiêu hao vòng. List đã lưu giữ nguyên snapshot; list mới áp dụng thay đổi này. Kho hữu hạn nên vẫn lặp sau khi dùng hết, không phải tạo câu AI vô hạn.

## Nội dung và thiết kế

- 1080×1920, 5 trang: bìa; hai lưới đi chơi/check-in; cà phê; quán ăn. 24 địa điểm và 25 ảnh khác nhau.
- Lưới kín 2×3, ô 540×640. Nhãn đen, ghim SVG đỏ, tên trắng Be Vietnam Pro 32/400, tối đa 492px và hai dòng. Không địa chỉ/giá/mô tả.
- Bìa Be Vietnam Pro 38/600, mặc định x86/y890/rộng700. Điều khiển cỡ chữ và 9 vị trí có sẵn; xuất chặn tràn chữ, không tự giảm cỡ.
- Hai lá phong SVG chỉ ở trang 2. Không overlay tối cả ảnh hoặc giao diện Threads.
- Preset chỉ chuyển URL ảnh, không áp bộ lọc lên nhãn/chữ. Ảnh gốc cũng xuất strict, không thay ảnh thiếu bằng ảnh minh họa.

## Chọn dữ liệu và trạng thái

- Solver chung 24 ô: không trùng tên chuẩn hóa giữa nhóm; phân bổ đa dạng nhóm đi chơi có dữ liệu; ưu tiên tối đa 2 đối tác/trang, thiếu bù thường, tối thiểu 1 đối tác toàn list.
- Chỉ ảnh trực tiếp Link_drive (`diaryImageUrls`), không lấy thư viện ghép tên, ảnh bản đồ hay ảnh của quán khác. Dữ liệu cũ không có trường này chỉ chấp nhận ảnh manual.
- Matching ảnh toàn list và kiểm tra sau rotation bằng ID gốc + dấu vân tay cache; derivative Color Edit không là ảnh mới.
- Định danh nội dung strict riêng cho mẫu mới: SHA ảnh cache, với PNG dùng pixel giải nén để nhận ra cả bản nén lại. Không dùng dHash để coi hai ảnh cùng bố cục/cùng cảnh là một. Cơ chế nhận diện của mẫu cũ giữ nguyên.
- Dùng lại solver vị trí/ảnh đối tác hiện có, chỉ đổi trong trang hợp lệ. Lịch sử chỉ commit cùng list thành công. Thiếu hook/ảnh/nhóm hoặc lỗi ghi không tiêu hao lượt.
- List chính xem không tiêu hao; list con chỉ kế thừa typography/vị trí, không lấy hook đã sửa của List chính. Hook/ảnh/caption/preset/template version lưu cố định.
- Vòng hook, ảnh bìa và ảnh thường được tái dựng từ thứ tự snapshot đã lưu; hết vòng mở vòng mới. Xem/sửa List chính và lượt ghi thất bại không mở hay tiêu hao vòng.
- Catalog vẫn có đủ 5 trang minh họa nếu dữ liệu thiếu, và nêu lý do. Catalog revision mới buộc bộ nhớ giao diện cũ tải lại danh sách mẫu/quyền.

## Xuất và tích hợp

Tạo đơn, batch và Hẹn giờ dùng API/hàng đợi hiện có. Không thuộc `isThreadsLocalDeck`: xuất 5 PNG/JPG + caption TXT + XLSX tên đối tác hiển thị (không địa chỉ, không trùng). Luồng batch bỏ cả thư mục list tràn chữ/ảnh lỗi/render lỗi; giữ list đạt và báo cáo bỏ qua, theo cơ chế xác nhận bỏ qua lỗi hiện có.

## Kiểm thử

- `node scripts/run-tests.js unit --filter threads-grid6-collage --verbose`
- `node scripts/run-tests.js browser --filter threads-grid6 --verbose`
- `node scripts/run-tests.js unit --filter threads-source --verbose`
- `node scripts/run-tests.js browser --filter threads --verbose`
- `npm run build --prefix backend`
- `node scripts/typecheck-frontend.js`
- `node scripts/test-frontend-build.js`

Test riêng tạo 4 list gốc + 4 Dark Crisp, chạy vòng ảnh/đổi vị trí, hook không lặp trước hết vòng, trùng ID/nội dung, ảnh hỏng, thiếu nhóm/hook, nguồn Threads khác địa phương, lỗi ghi, reload, batch lỗi một lượt và đăng ký Hẹn giờ. Browser kiểm tra hình học/crop, typography, tên dài, 80 ảnh xuất batch cả PNG/JPG, TXT/XLSX đúng list, 2 lần xuất đơn và lỗi render giữa list không để file dở. Không ghi dữ liệu người dùng.

Audit dữ liệu đã đồng bộ, chỉ đọc:

`cd backend; node -r ts-node/register/transpile-only src/modules/guide/tools/audit-threads-grid6-local.ts`

Audit tạo bản sao ảnh/cache và ví dụ ở OS temp, không đổi Sheet/Drive/snapshot/list thật. Kết quả đối chiếu để tại `outputs/threads-grid6-review/index.html`.
