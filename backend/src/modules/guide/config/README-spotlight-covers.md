# Nhãn ảnh bìa Spotlight

`spotlight-cover-labels.json` là cấu hình biên tập đi kèm code. Khởi động lại backend sau khi sửa. Không sửa Google Sheet hoặc file dữ liệu/cache của người dùng.

Khóa ảnh dùng ID nguồn: `/assets/drive-file?id=ABC` và link Google Drive của cùng ảnh đều thành `drive:ABC`. Không dùng URL có chữ ký, tên file hoặc đường dẫn cache làm khóa.

Ví dụ cấu trúc một mục (ABC chỉ là ví dụ, không phải ảnh thật):

```json
"drive:ABC": {
  "place": "Tên địa điểm đã xác nhận",
  "topics": ["green", "general"],
  "titlePlacement": "top-center"
}
```

Nhãn: green (xanh/rừng), city (phố), night (đêm), food (ăn uống), cafe (cà phê), stay (lưu trú), general (chung).

Chỉ điền nhãn và địa điểm đã được người quản lý nguồn ảnh xác nhận. Hiện nguồn ảnh nền chỉ có ID và tên số, nên danh mục chưa được điền thay bằng suy đoán. Nhãn thiếu sẽ hiện cảnh báo; hook có chủ đề rõ bị chặn xuất cho tới khi có ảnh phù hợp hoặc người dùng kiểm tra và xác nhận bìa thủ công trong Chỉnh sửa. Đổi hook hoặc đổi ảnh làm xác nhận cũ mất hiệu lực.

Thiết kế revision 1 chỉ gắn lúc tạo list mới. List cũ thiếu revision vẫn dùng CSS/renderer cũ. Ảnh, vị trí chữ và xác nhận thủ công được lưu riêng theo list.
