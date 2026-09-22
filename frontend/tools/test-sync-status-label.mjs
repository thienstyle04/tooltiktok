import assert from 'node:assert/strict';
import { syncStatusLabel } from '../lib/syncStatusLabel.mjs';
assert.equal(syncStatusLabel({ phase: 'partial' }), 'Lượt cập nhật bị ngắt');
assert.equal(syncStatusLabel({ phase: 'partial', result: { failed: 0, hookErrors: ['offline'] } }), 'Hoàn tất dữ liệu ảnh — còn hook lỗi');
assert.equal(syncStatusLabel({ phase: 'partial', result: { failed: 2, hookErrors: ['offline'] } }), 'Hoàn tất một phần — còn ảnh và hook lỗi');
assert.equal(syncStatusLabel({ phase: 'partial', result: { failed: 2 } }), 'Hoàn tất, còn ảnh lỗi — chỉ dùng ảnh hợp lệ');
assert.equal(syncStatusLabel({ phase: 'complete', result: { failed: 0 } }), 'Hoàn tất');
console.log('PASS sync status: interrupted, hook-only, image-only, combined and complete');
