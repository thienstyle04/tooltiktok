// Nạp bằng `node --import` khi chạy test: nếu `import 'esbuild'` (hoặc gói khác)
// không tìm thấy theo đường thường, thử lại từ backend/node_modules. Frontend
// không khai báo esbuild, nên thiếu fallback này test chỉ chạy được trên máy
// có sẵn esbuild ở thư mục cha. require() phía CommonJS dùng NODE_PATH.
import { register } from 'node:module';

register('./backend-modules-resolve-hook.mjs', import.meta.url);
