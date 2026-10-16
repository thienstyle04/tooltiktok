#!/usr/bin/env node
// Gói chuyển máy: mang code đúng phiên bản + TOÀN BỘ dữ liệu người dùng sang máy mới.
// Khác bản cũ (pack-lean): không mang shared\ / releases\ (máy mới tự cài đúng phiên
// bản qua bootstrap), không đi theo junction backend\data, không bỏ list/chỉnh sửa/
// lịch sử. Cache ảnh và key API là tùy chọn. Mẫu riêng (local-templates) đi kèm và
// được bootstrap tự đặt vào %LOCALAPPDATA% ở lần chạy đầu.
//
//   node scripts/pack-migration.cjs [--with-image-cache] [--with-env] [--no-local-templates]
//                                   [--out <thư mục>] [--staging-only] [--link-cache]
// --staging-only: chỉ dựng thư mục gói (không nén) — dùng cho test.
// --link-cache  : tạo hard link thay vì chép ảnh (chỉ dùng cho test cùng ổ đĩa).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const projectName = path.basename(root);
const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : fallback; };
const withImageCache = flag('--with-image-cache'), withEnv = flag('--with-env'), withTemplates = !flag('--no-local-templates');
const stagingOnly = flag('--staging-only'), linkCache = flag('--link-cache');
const stamp = new Date(Date.now() + 7 * 3600000).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
const outDir = option('--out', path.join(os.homedir(), 'Desktop'));
const log = message => console.log(message);

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8', windowsHide: true, ...options });
  if (result.error) throw result.error;
  return result;
}
function robocopy(source, target, excludeDirs = [], excludeFiles = []) {
  const r = run('robocopy', [source, target, '/E', '/XJ', '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS', '/NP',
    ...(excludeDirs.length ? ['/XD', ...excludeDirs] : []), ...(excludeFiles.length ? ['/XF', ...excludeFiles] : [])]);
  if (r.status > 7) throw Error(`Robocopy thất bại (${r.status}): ${source}`);
}
function dirSize(dir) {
  let bytes = 0, files = 0;
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else if (e.isFile()) { bytes += fs.statSync(p).size; files++; } } };
  if (fs.existsSync(dir)) walk(dir);
  return { bytes, files };
}
const gb = bytes => `${(bytes / 1024 ** 3).toFixed(2)} GB`;

// Dữ liệu thật: shared\data (bản cài có trình cập nhật) hoặc backend\data (bản clone).
const dataDir = fs.realpathSync(fs.existsSync(path.join(root, 'shared', 'data')) ? path.join(root, 'shared', 'data') : path.join(root, 'backend', 'data'));
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
let commit = '', uncommitted = [];
if (fs.existsSync(path.join(root, '.git'))) {
  commit = String(run('git', ['-C', root, 'rev-parse', 'HEAD']).stdout || '').trim();
  // User data under backend\data is tracked for history but is not "code".
  uncommitted = String(run('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no']).stdout || '')
    .split(/\r?\n/).filter(line => line.trim() && !/\s(backend\/data|shared)\//.test(line));
}

// A running tool may be writing lists/rotation: package a consistent, stopped state.
if (!flag('--allow-running')) {
  const probe = run('powershell.exe', ['-NoProfile', '-Command', '[bool](Get-NetTCPConnection -LocalPort 3000,3001 -State Listen -ErrorAction SilentlyContinue)']);
  if (/True/i.test(probe.stdout || '')) {
    console.error('Tool đang chạy (cổng 3000/3001). Hãy tắt tool rồi đóng gói lại để dữ liệu không bị ghi dở.');
    process.exit(1);
  }
}

const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-migrate-'));
const staging = path.join(stagingRoot, projectName);
log('==============================================================');
log(`  GÓI CHUYỂN MÁY - ${projectName} ${version}${commit ? ` (${commit.slice(0, 8)})` : ''}`);
log('==============================================================');
log(`Dữ liệu: ${dataDir}`);
if (uncommitted.length) log(`CẢNH BÁO: còn ${uncommitted.length} file code chưa commit — gói chứa code CHƯA phát hành. Nên commit + phát hành trước khi bàn giao.`);

log('[1/5] Chép code (không node_modules, .git, shared, releases, cache, test output)...');
const codeDirs = ['node_modules', '.git', '.next', '.next-*', 'outputs', 'shared', 'releases', '.claude', '.cursor', '.codex', '.codex-dev-logs',
  '.codex-runtime', '.test-runtime', '.test-runtime-e2e', '.omx', 'agent-transcripts', 'mcps', 'export-quality-test-output', 'drive-file-cache*',
  'photo-preset-cache', path.join(root, 'backend', 'data'), path.join(root, 'migration')];
robocopy(root, staging, codeDirs, ['.env', '*.log', 'dev-log*.txt', '__*-markup.mjs']);

log('[2/5] Chép dữ liệu người dùng (list, chỉnh sửa chữ, lịch sử dùng, hook, lịch hẹn giờ, workbook)...');
const stagingData = path.join(staging, 'backend', 'data');
robocopy(dataDir, stagingData, ['drive-file-cache*', 'photo-preset-cache'], ['*.log', 'drive-access-cache*.json']);

let imageNote = 'không kèm';
if (withImageCache) {
  log('[3/5] Chép ảnh Drive đang được dùng (chỉ ảnh có trong chỉ mục các nguồn)...');
  const ids = new Set();
  const visit = value => { if (!value || typeof value !== 'object') return;
    for (const key of ['fileId', 'mapFileId']) if (typeof value[key] === 'string' && value[key].trim()) ids.add(value[key].trim());
    Object.values(value).forEach(visit); };
  const manifests = fs.readdirSync(dataDir).filter(name => /^sheet-drive-images\..+\.json$/.test(name)).map(name => path.join(dataDir, name));
  const snapshots = path.join(dataDir, 'source-snapshots');
  if (fs.existsSync(snapshots)) for (const source of fs.readdirSync(snapshots)) {
    const pointer = path.join(snapshots, source, 'current.json');
    if (!fs.existsSync(pointer)) continue;
    const manifest = path.join(snapshots, source, JSON.parse(fs.readFileSync(pointer, 'utf8')).revision, 'manifest.json');
    if (fs.existsSync(manifest)) manifests.push(manifest);
  }
  for (const file of manifests) { try { visit(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { log(`  Bỏ qua chỉ mục hỏng: ${file}`); } }
  const cacheDir = path.join(dataDir, 'drive-file-cache'), targetCache = path.join(stagingData, 'drive-file-cache');
  fs.mkdirSync(targetCache, { recursive: true });
  let copied = 0, bytes = 0;
  for (const id of ids) {
    for (const extension of ['.bin', '.json']) {
      const from = path.join(cacheDir, id + extension);
      if (!fs.existsSync(from)) continue;
      const to = path.join(targetCache, id + extension);
      if (linkCache) fs.linkSync(from, to); else fs.copyFileSync(from, to);
      // Keep mtimes: image validation keys on size + modification time.
      const stat = fs.statSync(from); fs.utimesSync(to, stat.atime, stat.mtime);
      if (extension === '.bin') { copied++; bytes += stat.size; }
    }
  }
  const validation = path.join(cacheDir, 'validation-state.json');
  if (fs.existsSync(validation)) fs.copyFileSync(validation, path.join(targetCache, 'validation-state.json'));
  imageNote = `${copied}/${ids.size} ảnh, ${gb(bytes)}`;
  log(`  ${imageNote}`);
} else log('[3/5] Không kèm cache ảnh (máy mới bấm "Cập nhật dữ liệu ngay" để tải ảnh).');

log('[4/5] Mẫu riêng và cấu hình...');
let templatesNote = 'không kèm';
const templatesDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'DalatTikTokCarouselTool', 'local-templates');
if (withTemplates && fs.existsSync(templatesDir)) {
  const names = fs.readdirSync(templatesDir, { withFileTypes: true }).filter(e => e.isDirectory() && /^local-[a-z0-9-]+$/.test(e.name)).map(e => e.name);
  for (const name of names) robocopy(path.join(templatesDir, name), path.join(staging, 'migration', 'local-templates', name), ['test-output'], []);
  templatesNote = names.length ? names.join(', ') : 'không có';
  log(`  Mẫu riêng: ${templatesNote}`);
}
const envFile = path.join(root, 'backend', '.env');
if (withEnv && fs.existsSync(envFile)) { fs.copyFileSync(envFile, path.join(staging, 'backend', '.env')); log('  Kèm backend\\.env (có key API — giữ gói cẩn thận).'); }
else log('  Không kèm backend\\.env: nhập key AI trong app (Dữ liệu & Cài đặt > Nhà cung cấp AI).');
fs.writeFileSync(path.join(staging, 'build-manifest.json'), JSON.stringify({ version, commit, userDataIncluded: true,
  packedAt: new Date().toISOString(), uncommittedCodeFiles: uncommitted.length }, null, 2));
const userFiles = fs.readdirSync(stagingData).filter(name => /^(generated-caption-lists|page-text-overrides|used-inventory|automation-schedules|custom-destinations)/.test(name));
fs.writeFileSync(path.join(staging, 'HUONG_DAN_MAY_MOI.txt'), [
  'HUONG DAN CHUYEN SANG MAY MOI', '=============================', '',
  `Phien ban: ${version}${commit ? ` (${commit.slice(0, 8)})` : ''}  -  Dong goi: ${stamp}`, '',
  'CAN CO TREN MAY MOI:',
  '- Windows 10/11, o dia NTFS cuc bo (KHONG dat trong OneDrive / USB / o mang).',
  '- Node.js LTS 22.12 tro len (nen dung 24), cai bang quyen admin: https://nodejs.org',
  '- Chrome hoac Edge. Cong 3000 va 3001 con trong.',
  '- Lan dau can Internet: registry.npmjs.org (thu vien), docs.google.com, drive.google.com,',
  '  *.googleusercontent.com, may chu AI (DeepSeek/Gemini) va may chu cap nhat 113.161.254.76.', '',
  'CACH CAI:',
  `1. Giai nen ca thu muc "${projectName}" vao vi tri co dinh, vi du C:\\Tools\\${projectName}`,
  '2. Chay start.bat. Lan dau tool tu cai dat: chuyen backend\\data thanh shared\\data, cai thu vien (vai phut).',
  '3. Khi hoi key DeepSeek: dan key, hoac nhan Enter de bo qua va nhap key AI trong app sau.',
  '4. Vao Du lieu & Cai dat > Nha cung cap AI de nhap lai key (key luu tren may cu khong mang sang duoc).', '',
  'DU LIEU DA KEM:',
  `- Du lieu nguoi dung: ${userFiles.length} file (list da tao, chinh sua chu, lich su dung dia diem, lich hen gio...).`,
  `- Anh Drive: ${withImageCache ? imageNote : 'KHONG kem. Mau co anh se bao thieu anh cho toi khi bam "Cap nhat du lieu ngay" (co the mat nhieu gio).'}`,
  `- Mau rieng: ${templatesNote}${withTemplates ? ' (tu dat vao %LOCALAPPDATA% o lan chay dau)' : ''}`, '',
  'SAU KHI CAI:',
  '- Lich hen gio: kiem tra lai thu muc luu ZIP (vi du D:\\...) co ton tai tren may moi.',
  '- Tool mo cong ra mang noi bo, khong co mat khau: chi dung tren mang tin cay.',
].join('\r\n'), 'utf8');

const size = dirSize(staging);
log(`[5/5] Gói: ${size.files} file, ${gb(size.bytes)}`);
if (stagingOnly) { log(`STAGING=${staging}`); process.exit(0); }
fs.mkdirSync(outDir, { recursive: true });
const base = path.join(outDir, `${projectName}-chuyen-may-${stamp}`);
if (size.bytes > 3.5 * 1024 ** 3) {
  // Very large (image cache): a plain folder is safer than a >4 GB ZIP.
  robocopy(staging, path.join(base, projectName));
  log(`XONG: thư mục ${path.join(base, projectName)} — chép NGUYÊN thư mục này sang máy mới.`);
} else {
  const zip = `${base}.zip`;
  const sevenZip = [path.join(process.env.ProgramFiles || '', '7-Zip', '7z.exe'), path.join(process.env['ProgramFiles(x86)'] || '', '7-Zip', '7z.exe')].find(p => p && fs.existsSync(p));
  const r = sevenZip ? run(sevenZip, ['a', '-tzip', '-mx=7', zip, staging]) : run('tar', ['-a', '-c', '-f', zip, '-C', stagingRoot, projectName]);
  if (r.status !== 0) throw Error(`Nén thất bại: ${r.stderr || r.stdout}`);
  log(`XONG: ${zip} (${gb(fs.statSync(zip).size)})`);
}
// Remove only the unique staging folder created above.
if (/^dalat-migrate-[A-Za-z0-9]+$/.test(path.basename(stagingRoot))) fs.rmSync(stagingRoot, { recursive: true, force: true });
