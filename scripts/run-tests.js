#!/usr/bin/env node
// Chạy test theo tầng:
//   unit    (mặc định, `npm test`): offline, không cần server/trình duyệt/Internet.
//   browser (`npm run test:browser`): cần Chrome/Edge + playwright, không cần server.
//   live    (`npm run test:live`): cần backend 3000/frontend 3001 đang chạy hoặc Internet.
//   all     : unit + browser + live.
//   manual  : test cần dữ liệu ngoài (xem BACKEND_TS_EXCLUDED), chỉ để liệt kê/chạy có chủ đích.
// Mọi test chạy với DALAT_DATA_DIR là thư mục tạm riêng. Sau khi chạy, runner
// đối chiếu dữ liệu thật (backend/data) và báo lỗi nếu có file bị thay đổi.
//
// Tùy chọn: --filter <chuỗi>  --list  -j <số luồng>  --verbose
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { seedSourceLinks } = require('./test-support/source-links-fixture.cjs');

const root = path.resolve(__dirname, '..');
const backendRoot = path.join(root, 'backend');
const frontendRoot = path.join(root, 'frontend');
const backendToolsDir = path.join(backendRoot, 'src', 'modules', 'guide', 'tools');
const realDataDir = path.join(backendRoot, 'data');

const UNIT_TIMEOUT_MS = 180_000;
const BROWSER_TIMEOUT_MS = 300_000;
const LIVE_TIMEOUT_MS = 600_000;

const hasSigningKey = () => {
  const key = process.env.DALAT_RELEASE_SIGNING_KEY
    || path.join(process.env.LOCALAPPDATA || '', 'DalatStudioReleaseSigning', 'private.pem');
  return fs.existsSync(key) ? null : 'thiếu khóa ký phát hành cục bộ';
};
const hasPlaywright = () => {
  try { require.resolve('playwright', { paths: [frontendRoot] }); return null; } catch { return 'chưa cài playwright trong frontend'; }
};
const isWindows = () => (process.platform === 'win32' ? null : 'chỉ chạy trên Windows');
// Test puppeteer-core đọc TEST_BROWSER_PATH; tự điền Chrome/Edge nếu chưa đặt.
function findBrowserPath() {
  if (process.env.TEST_BROWSER_PATH) return process.env.TEST_BROWSER_PATH;
  const candidates = [
    path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
  ];
  return candidates.find(file => fs.existsSync(file)) || '';
}
const hasBrowserTools = () => (findBrowserPath() ? hasPlaywright() : 'không tìm thấy Chrome/Edge');

// ---------------------------------------------------------------- tầng unit
const FRONTEND_UNIT = [
  'tools/test-cherry-blossom-copy.mjs',
  'tools/test-sync-status-label.mjs',
  'tools/test-threads-expense-sheet.mjs',
  'tools/test-page-text-rendering.mjs',
  'tools/test-local-template-contract.mjs',
  'tools/test-local-list-set-number.mjs',
  'tools/test-summary-note.mjs',
  'tools/test-spotlight-v4.mjs',
  'tools/test-spotlight-v5.mjs',
  'tools/test-spotlight-v6.mjs',
  'tools/test-spotlight-v6-maps.mjs',
  'tools/test-spotlight-design.mjs',
  'tools/test-threads-food-export.mjs',
  'tools/test-manual-generation-queue.mjs',
  'tools/test-catalog-source-refresh.mjs',
  'tools/test-runtime-session-proxy.mjs',
  'tools/test-sheet-sync-timeout.mjs',
  'tools/test-one-way-story.mjs',
  'lib/publishedDataset.test.mjs',
];
// Các file .cjs này đọc đường dẫn tương đối theo thư mục gốc repo.
const FRONTEND_UNIT_FROM_ROOT = [
  'frontend/tools/test-threads-budget.cjs',
  'frontend/tools/test-threads-budget-no-image-export.cjs',
  'frontend/tools/test-threads-render.cjs',
  'frontend/tools/test-threads-toplist.cjs',
  'frontend/tools/test-ai-proxy.cjs',
];
const SCRIPTS_UNIT = [
  { file: 'scripts/test-update-protocol.js', nodeTest: true },
  { file: 'scripts/test-export-image-preflight.cjs' },
  { file: 'scripts/test-page-text-scale.cjs' },
  { file: 'scripts/test-startup-image-recovery.js' },
  { file: 'scripts/test-runtime-instance.js' },
  { file: 'scripts/test-ai-key-step.cjs', requires: isWindows },
  { file: 'scripts/test-update-apply.js', requires: hasSigningKey },
  { file: 'scripts/typecheck-frontend.js' },
  { file: 'scripts/check-no-source-links.cjs' },
  { file: 'scripts/test-pack-clean.cjs', requires: isWindows },
];
// Mọi backend tools/test-*.ts đều thuộc tầng unit, trừ các file dưới đây.
// Test unit chạy lâu (dựng hàng chục list cho mọi mẫu): 2,5–4 phút tùy máy bận.
const SLOW_UNIT_TESTS = new Set(['test-partner-rotation-integration.ts']);
const BACKEND_TS_EXCLUDED = {
  'test-color-edit.ts': 'live',                    // khởi động toàn bộ AppModule
  'test-spotlight-design-reload.ts': 'live',       // khởi động AppModule, cần AUDIT_ROOT
  'test-photo-presets-reload.ts': 'live',          // khởi động AppModule, cần AUDIT_ROOT
  'test-startup-refresh-live.ts': 'live',          // khởi động AppModule
  'test-note-threads-tac-ke-hoa-live.ts': 'live',  // tải Google Sheet thật
  'test-spotlight-v6-dark.ts': 'live',             // gọi backend :3000
  'test-spotlight-v6-green.ts': 'live',            // gọi backend :3000
  'test-spotlight-v6-persimmon.ts': 'live',        // gọi backend :3000
  'test-spotlight-v6-maps.ts': 'live',             // ghi kết quả vào outputs/
  // Tầng manual: cần dữ liệu ngoài, chạy tay từ backend/:
  //   test-restructured-addresses.ts <dalat.xlsx> <greenland.xlsx>  (file XLSX xuất từ Sheet thật)
  //   DALAT_DATA_DIR=<bản sao có drive-file-cache thật> node -r ts-node/register/transpile-only
  //     src/modules/guide/tools/test-spotlight-diary-integration.ts  (đọc ./data, cần cache ảnh)
  'test-restructured-addresses.ts': 'manual',
  'test-spotlight-diary-integration.ts': 'manual',
  // Bản sao dữ liệu thật + cache ảnh, chạy mọi mẫu (10–30 phút); không gọi mạng:
  'test-required-partners-all-decks.ts': 'manual',
  'test-partner-eligibility.ts': 'manual',
  // Bản sao dữ liệu thật và GET Google Drive công khai thật (đọc link ảnh của XLSX):
  'test-add-xlsx-source-e2e.ts': 'manual',
};

// ------------------------------------------------------------- tầng browser
// Các test này nhận AUDIT_ROOT / DALAT_TEST_OUTPUT_DIR làm nơi ghi kết quả.
const TEMP_OUTPUT_TESTS = new Set(['test-spotlight-icons-browser.mjs', 'test-spotlight-cover-placement.mjs', 'test-ai-settings.cjs']);
const FRONTEND_BROWSER = [
  'tools/test-catalog-layout-refresh.cjs',
  'tools/test-cherry-blossom-preview.cjs',
  'tools/test-update-bell.cjs',
  'tools/test-update-bell-draft.cjs',
  'tools/test-font-size-save-click.cjs',
  'tools/test-ai-settings.cjs',
  'tools/test-export-failure-ui.cjs',
  'tools/test-export-zip.mjs',
  'tools/test-inspector-scroll.mjs',
  'tools/test-itinerary-note-dark.mjs',
  'tools/test-jpg-export.cjs',
  'tools/test-list-create-ui.mjs',
  'tools/test-local-template-preview.cjs',
  'tools/test-local-template-export-paint.cjs',
  'tools/test-partner-export-gate.mjs',
  'tools/test-runtime-performance.mjs',
  'tools/test-status-bar-layout.cjs',
  'tools/test-threads-budget-fit.cjs',
  'tools/test-threads-fit.cjs',
  'tools/test-threads-source-ui.cjs',
  'tools/test-first-source-setup-ui.mjs',
  'tools/test-threads-toplist-visual.cjs',
  'tools/test-spotlight-v4-v6-partners-export.mjs',
  'tools/test-spotlight-v5-partners-export.mjs',
  'tools/test-spotlight-cover-placement.mjs',
  'tools/test-spotlight-icons-browser.mjs',
  'tools/test-v6-export-quality.mjs',
  'tools/test-first-source-sync.mjs',
  'tools/test-threads-food-browser-export.mjs',
  'tools/test-required-partners-ui.mjs',
  'tools/test-add-xlsx-source-ui.mjs',
  'tools/test-spotlight-v5-square-export.cjs',
];
// Đọc đường dẫn tương đối theo thư mục gốc repo.
const FRONTEND_BROWSER_FROM_ROOT = [
  'frontend/tools/test-hidden-preview-typography.mjs',
];

// ---------------------------------------------------------------- tầng live
const FRONTEND_LIVE = [
  'tools/test-adaptive-export.mjs',
  'tools/test-adaptive-mixed-live.mjs',
  'tools/test-all-templates-live.mjs',
  'tools/test-automation-create-twice.mjs',
  'tools/test-export-image-recovery.mjs',
  'tools/test-itinerary-note-live.mjs',
  'tools/test-scheduler-no-reload.mjs',
  'tools/test-spotlight-diary-export.mjs',
  'tools/test-spotlight-v6-persimmon-live-export.mjs',
  'tools/test-v6-export-cache.mjs',
  // Trình duyệt + đọc dữ liệu thật của máy.
  'tools/test-color-edit-browser.mjs',
  'tools/test-jpg-workflows.mjs',
  'tools/test-studio-audit-export.mjs',
  'tools/test-export-recovery-zip.mjs',
  // Cần server audit :3211 (scripts/prepare-studio-audit.cjs) hoặc báo cáo AUDIT_ROOT/DALAT_TEST_REPORT.
  'tools/test-studio-audit-editor-input.mjs',
  'tools/test-studio-audit-font-save.mjs',
  'tools/test-studio-audit-layout.mjs',
  'tools/test-photo-presets-ui.mjs',
  'tools/test-threads-source-export.cjs',
];

function buildManifest() {
  const tests = [];
  const add = (test) => tests.push({ timeoutMs: UNIT_TIMEOUT_MS, ...test, name: test.name || test.file });
  for (const file of FRONTEND_UNIT) add({ tier: 'unit', cwd: frontendRoot, file, name: `frontend/${file}` });
  for (const file of FRONTEND_UNIT_FROM_ROOT) add({ tier: 'unit', cwd: root, file });
  for (const entry of SCRIPTS_UNIT) add({ tier: 'unit', cwd: root, ...entry });
  for (const file of fs.readdirSync(backendToolsDir).filter(name => /^test-.*\.ts$/.test(name)).sort()) {
    add({
      tier: BACKEND_TS_EXCLUDED[file] || 'unit',
      cwd: backendRoot,
      file: `src/modules/guide/tools/${file}`,
      name: `backend/tools/${file}`,
      ts: true,
      timeoutMs: BACKEND_TS_EXCLUDED[file] || SLOW_UNIT_TESTS.has(file) ? LIVE_TIMEOUT_MS : UNIT_TIMEOUT_MS,
    });
  }
  for (const file of FRONTEND_BROWSER) {
    add({ tier: 'browser', cwd: frontendRoot, file, name: `frontend/${file}`, requires: hasBrowserTools, timeoutMs: BROWSER_TIMEOUT_MS });
  }
  for (const file of FRONTEND_BROWSER_FROM_ROOT) {
    add({ tier: 'browser', cwd: root, file, requires: hasBrowserTools, timeoutMs: BROWSER_TIMEOUT_MS });
  }
  for (const file of FRONTEND_LIVE) {
    add({ tier: 'live', cwd: frontendRoot, file, name: `frontend/${file}`, requires: hasBrowserTools, timeoutMs: LIVE_TIMEOUT_MS });
  }
  add({ tier: 'live', cwd: root, file: 'scripts/test-live-update-canary.js', requires: isWindows, timeoutMs: LIVE_TIMEOUT_MS });
  return tests;
}

// ------------------------------------------------- bảo vệ dữ liệu thật
const SNAPSHOT_SKIP = /^(?:drive-file-cache|drive-file-cache-sim-.*|photo-preset-cache)$/;
function snapshotRealData() {
  const entries = new Map();
  if (!fs.existsSync(realDataDir)) return entries;
  const walk = (dir, rel) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!rel && SNAPSHOT_SKIP.test(item.name)) continue;
      const full = path.join(dir, item.name);
      const key = rel ? `${rel}/${item.name}` : item.name;
      if (item.isDirectory()) walk(full, key);
      else if (item.isFile()) {
        const stat = fs.statSync(full);
        entries.set(key, `${stat.size}:${stat.mtimeMs}`);
      }
    }
  };
  walk(realDataDir, '');
  return entries;
}
function diffSnapshots(before, after) {
  const changed = [];
  for (const [key, value] of after) if (before.get(key) !== value) changed.push(before.has(key) ? `đổi: ${key}` : `mới: ${key}`);
  for (const key of before.keys()) if (!after.has(key)) changed.push(`mất: ${key}`);
  return changed;
}

// --------------------------------------------------------------- chạy test
function runOne(test, verbose) {
  return new Promise(resolve => {
    const skipReason = test.requires ? test.requires() : null;
    if (skipReason) return resolve({ test, status: 'skip', reason: skipReason, ms: 0, output: '' });
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-test-data-'));
    // Máy đang dùng có source-links.json (link giả) để 4 nguồn dựng sẵn tồn tại như trước.
    seedSourceLinks(dataDir);
    // Test ghi ảnh/báo cáo vào outputs/ khi chạy tay; qua runner thì ghi vào thư mục tạm rồi xóa.
    const outputDir = TEMP_OUTPUT_TESTS.has(path.basename(test.file)) ? fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-test-output-')) : '';
    // Hook ESM khiến Node nạp file .ts qua trình nạp ESM thay vì ts-node, nên
    // test backend (đã có esbuild trong backend/node_modules) không dùng hook.
    const args = test.ts
      ? ['-r', 'ts-node/register/transpile-only']
      : ['--import', pathToFileHref(path.join(__dirname, 'test-support', 'backend-modules-fallback.mjs'))];
    if (test.nodeTest) args.push('--test');
    args.push(test.file);
    const env = {
      ...process.env,
      DALAT_DATA_DIR: dataDir,
      DALAT_LOCAL_TEMPLATES_DIR: path.join(dataDir, 'local-templates'),
      ...(outputDir ? { AUDIT_ROOT: outputDir, DALAT_TEST_OUTPUT_DIR: outputDir } : {}),
      DALAT_AUTO_SYNC_SHEET: 'false',
      TEST_BROWSER_PATH: findBrowserPath(),
      NODE_PATH: [path.join(backendRoot, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
    };
    const started = Date.now();
    const child = spawn(process.execPath, args, { cwd: test.cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const collect = chunk => { output += chunk; if (verbose) process.stdout.write(chunk); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, test.timeoutMs);
    child.on('close', code => {
      clearTimeout(timer);
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      if (outputDir) fs.rmSync(outputDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      const status = timedOut ? 'timeout' : code === 0 ? 'pass' : 'fail';
      resolve({ test, status, ms: Date.now() - started, output });
    });
  });
}
function pathToFileHref(file) { return require('node:url').pathToFileURL(file).href; }
function killTree(child) {
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else child.kill('SIGKILL');
}

function parseArgs(argv) {
  const options = { tier: 'unit', filter: '', list: false, jobs: Math.max(1, Math.min(4, os.cpus().length - 1)), verbose: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (['unit', 'browser', 'live', 'manual', 'all'].includes(arg)) options.tier = arg;
    else if (arg === '--filter') options.filter = argv[++i] || '';
    else if (arg === '--list') options.list = true;
    else if (arg === '-j' || arg === '--jobs') options.jobs = Math.max(1, Number(argv[++i]) || 1);
    else if (arg === '--verbose') options.verbose = true;
    else throw Error(`Tham số không hợp lệ: ${arg}`);
  }
  if (options.verbose) options.jobs = 1;
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const tests = buildManifest()
    .filter(test => (options.tier === 'all' && test.tier !== 'manual') || test.tier === options.tier)
    .filter(test => !options.filter || test.name.includes(options.filter));
  if (options.list) {
    for (const test of tests) console.log(`${test.tier.padEnd(7)} ${test.name}`);
    console.log(`${tests.length} test`);
    return;
  }
  if (!tests.length) throw Error('Không có test nào khớp.');

  console.log(`Chạy ${tests.length} test (tầng ${options.tier}, ${options.jobs} luồng)...`);
  const before = snapshotRealData();
  const results = [];
  let next = 0;
  const started = Date.now();
  await Promise.all(Array.from({ length: options.jobs }, async () => {
    while (next < tests.length) {
      const result = await runOne(tests[next++], options.verbose);
      results.push(result);
      const label = { pass: 'PASS', fail: 'FAIL', timeout: 'TIMEOUT', skip: 'SKIP' }[result.status];
      const detail = result.status === 'skip' ? `(${result.reason})` : `${result.ms}ms`;
      console.log(`${label.padEnd(7)} ${result.test.name} ${detail}`);
    }
  }));
  const changed = diffSnapshots(before, snapshotRealData());

  const failed = results.filter(result => result.status === 'fail' || result.status === 'timeout');
  for (const result of failed) {
    const tail = result.output.split(/\r?\n/).filter(line => line.trim()).slice(-30).join('\n');
    console.log(`\n----- ${result.test.name} (${result.status}) -----\n${tail}`);
  }
  const count = status => results.filter(result => result.status === status).length;
  console.log(`\n${count('pass')} pass, ${failed.length} lỗi, ${count('skip')} bỏ qua — ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (changed.length) {
    console.error(`\nNGUY HIỂM: dữ liệu thật trong ${realDataDir} đã thay đổi trong lúc chạy test`
      + ` (nếu tool đang mở, hãy tắt tool rồi chạy lại để xác định):\n  ${changed.slice(0, 20).join('\n  ')}`);
  }
  if (failed.length || changed.length) process.exitCode = 1;
}

main().catch(error => { console.error(error.message || error); process.exitCode = 1; });
