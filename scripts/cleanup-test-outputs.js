#!/usr/bin/env node
// Dọn kết quả test/audit cũ trong outputs/ và .test-runtime*/.
// Mặc định CHỈ LIỆT KÊ (dry-run). Xóa thật khi thêm --yes.
//   node scripts/cleanup-test-outputs.js [--older-than <ngày>] [--yes]
// Chỉ xét mục có tên khớp mẫu kết quả test/audit đã biết; luôn bỏ qua bản phát hành
// (outputs/update-release), releases/, shared/ và backend/data.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const SCAN_DIRS = ['outputs', '.test-runtime', '.test-runtime-e2e'];
const PROTECTED = new Set(['update-release']);
const TEST_OUTPUT_PATTERNS = [
  /^spotlight-(icons|hooks)-\d+$/,
  /^partners-audit-\d+$/,
  /^photo-presets(-representatives)?-\d+$/,
  /^color-[\w-]+$/,
  /^dalat-test-(live|source-check)[\w-]*$/,
  /^(studio-audit-runtime|browser-test-runtime|low-resource-test|partial-export-test|cache-policy-build)$/,
  /\.(png|jpe?g|log|err\.log|out\.log)$/,
];

function parseArgs(argv) {
  const options = { olderThanDays: 7, yes: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--yes') options.yes = true;
    else if (argv[i] === '--older-than') options.olderThanDays = Math.max(0, Number(argv[++i]));
    else throw new Error(`Tham số không hợp lệ: ${argv[i]}`);
  }
  if (!Number.isFinite(options.olderThanDays)) throw new Error('--older-than cần một số ngày');
  return options;
}

// Liên kết/junction không được tính (fs.rmSync chỉ gỡ liên kết, không xóa thư mục đích);
// file có nhiều hard link chỉ tính một lần.
const countedInodes = new Set();
function sizeOf(target) {
  const stat = fs.lstatSync(target, { bigint: true });
  if (stat.isSymbolicLink()) return 0;
  if (!stat.isDirectory()) {
    if (stat.nlink > 1n) {
      const key = `${stat.dev}:${stat.ino}`;
      if (countedInodes.has(key)) return 0;
      countedInodes.add(key);
    }
    return Number(stat.size);
  }
  let total = 0;
  for (const name of fs.readdirSync(target)) total += sizeOf(path.join(target, name));
  return total;
}

function newestMtime(target) {
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return stat.mtimeMs;
  let newest = stat.mtimeMs;
  for (const name of fs.readdirSync(target)) newest = Math.max(newest, newestMtime(path.join(target, name)));
  return newest;
}

const human = (bytes) => bytes > 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.ceil(bytes / 1e3)} KB`;

function main() {
  const options = parseArgs(process.argv.slice(2));
  const cutoff = Date.now() - options.olderThanDays * 86_400_000;
  const candidates = [];
  let keptBytes = 0;
  for (const dir of SCAN_DIRS) {
    const base = path.join(root, dir);
    if (!fs.existsSync(base)) continue;
    for (const name of fs.readdirSync(base)) {
      const target = path.join(base, name);
      if (path.relative(root, target).startsWith('..')) continue;
      const isTestOutput = dir !== 'outputs' || TEST_OUTPUT_PATTERNS.some((pattern) => pattern.test(name));
      const bytes = sizeOf(target);
      if (PROTECTED.has(name) || !isTestOutput || newestMtime(target) > cutoff) { keptBytes += bytes; continue; }
      candidates.push({ target, bytes });
    }
  }
  candidates.sort((a, b) => b.bytes - a.bytes);
  const total = candidates.reduce((sum, item) => sum + item.bytes, 0);
  for (const item of candidates) console.log(`${options.yes ? 'XÓA ' : 'sẽ xóa'}  ${human(item.bytes).padStart(9)}  ${path.relative(root, item.target)}`);
  console.log(`\n${candidates.length} mục, ${human(total)} (cũ hơn ${options.olderThanDays} ngày); giữ lại ${human(keptBytes)}.`);
  if (!options.yes) {
    console.log('Chưa xóa gì. Chạy lại với --yes để xóa các mục trên.');
    return;
  }
  for (const item of candidates) fs.rmSync(item.target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  console.log('Đã xóa.');
}

main();
