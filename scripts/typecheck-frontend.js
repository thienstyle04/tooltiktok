#!/usr/bin/env node
// Kiểm tra kiểu JSDoc cho frontend/lib bằng TypeScript của backend (frontend không cài TypeScript).
// Kiểu dữ liệu chung lấy từ backend/src/common/interfaces/guide.types.ts qua frontend/lib/types.js.
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const tsc = path.join(root, 'backend', 'node_modules', 'typescript', 'bin', 'tsc');
const result = spawnSync(process.execPath, [tsc, '-p', path.join(root, 'frontend', 'tsconfig.checkjs.json')], {
  cwd: path.join(root, 'frontend'),
  stdio: 'inherit',
  windowsHide: true,
});
if (result.status === 0) console.log('PASS typecheck frontend/lib (checkJs)');
process.exitCode = result.status ?? 1;
