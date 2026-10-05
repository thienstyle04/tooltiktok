#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, spawn } = require('node:child_process');
const { fetchLatest, downloadRelease, compareVersions, parseJsonUtf8, writeJsonAtomic } = require('./update-protocol');
const { stopPreviousInstance } = require('./runtime-instance');
const { INSTANCE_PATH } = require('./runtime-instance');

function fail(message) { throw Error(message); }
function releasePath(root, name) {
  if (!/^[a-zA-Z0-9._-]+$/.test(name) || name.startsWith('.')) fail('Tên bản phát hành không hợp lệ.');
  return path.join(root, 'releases', name);
}
function readCurrent(root) {
  const value = parseJsonUtf8(fs.readFileSync(path.join(root, 'shared', 'current.json'), 'utf8'));
  if (!value || typeof value.release !== 'string' || !/^\d+\.\d+\.\d+-[a-f0-9]{8}$/.test(value.release)) fail('Con trỏ phiên bản đang dùng không hợp lệ.');
  return value;
}
function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
let statusFile = '';
function phase(name, message, extra = {}) {
  if (!statusFile) return;
  writeJsonAtomic(statusFile, { phase: name, message, updatedAt: new Date().toISOString(), ...extra });
}
function validateZipEntries(file) {
  const entries = execFileSync('tar', ['-tf', file], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).split(/\r?\n/).filter(Boolean);
  if (!entries.length || entries.length > 50_000) fail('Gói cập nhật rỗng hoặc có quá nhiều file.');
  for (const name of entries) {
    const parts = name.replace(/\\/g, '/').split('/');
    if (name.startsWith('/') || name.includes(':') || parts.includes('..') || parts.some(part => part === '') && !name.endsWith('/')) fail('Gói cập nhật có đường dẫn không an toàn.');
    if (parts.includes('.env') || parts.includes('node_modules') || parts.includes('drive-file-cache') || parts.includes('shared')) fail('Gói cập nhật chứa dữ liệu riêng của máy.');
  }
}
function inspectRelease(dir, version) {
  for (const relative of ['start.bat', 'VERSION', 'package.json', 'frontend/package.json', 'backend/package.json', 'scripts/dev.js', 'scripts/update-client.js']) {
    if (!fs.statSync(path.join(dir, relative), { throwIfNoEntry: false })?.isFile()) fail(`Bản phát hành thiếu ${relative}.`);
  }
  const rawVersion = fs.readFileSync(path.join(dir, 'VERSION'), 'utf8').trim();
  const parts = rawVersion.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!parts || `${Number(parts[1])}.${Number(parts[2])}.${String(Number(parts[3])).padStart(2, '0')}` !== version) fail('Phiên bản trong gói không khớp manifest.');
  for (const name of ['package.json', 'frontend/package.json', 'backend/package.json']) {
    if (parseJsonUtf8(fs.readFileSync(path.join(dir, name), 'utf8')).version !== version) fail('Backend/frontend không cùng phiên bản.');
  }
  const walk = folder => {
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, item.name);
      if (item.isSymbolicLink()) fail('Gói cập nhật chứa liên kết không an toàn.');
      if (item.isDirectory()) walk(file);
    }
  };
  walk(dir);
}
async function stageRelease(root, info) {
  const name = `${info.version}-${info.commit.slice(0, 8)}`;
  const target = releasePath(root, name);
  if (fs.existsSync(target)) {
    const installed = parseJsonUtf8(fs.readFileSync(path.join(target, '.release.json'), 'utf8'));
    if (installed.sha256 !== info.artifact.sha256) fail('Tên bản phát hành đã tồn tại với nội dung khác.');
    inspectRelease(target, info.version);
    return name;
  }
  const stagingRoot = path.join(root, 'shared', 'update-staging');
  fs.mkdirSync(stagingRoot, { recursive: true });
  const zip = path.join(stagingRoot, `${name}.zip`);
  if (fs.existsSync(zip) && (fs.statSync(zip).size !== info.artifact.size || sha256(zip) !== info.artifact.sha256)) {
    // Only this staging file is disposable; never touch shared/data or releases.
    fs.unlinkSync(zip);
  }
  if (!fs.existsSync(zip)) await downloadRelease(info, zip, (bytes, total) => phase('downloading', 'Đang tải gói cập nhật', { version: info.version, bytes, total }));
  validateZipEntries(zip);
  const temporary = releasePath(root, `.staging-${name}-${process.pid}`.slice(1));
  if (fs.existsSync(temporary)) fail('Thư mục staging đã tồn tại.');
  fs.mkdirSync(temporary, { recursive: false });
  execFileSync('tar', ['-xf', zip, '-C', temporary], { timeout: 180_000 });
  inspectRelease(temporary, info.version);
  fs.writeFileSync(path.join(temporary, '.release.json'), JSON.stringify({ version: info.version, commit: info.commit, sha256: info.artifact.sha256 }));
  fs.renameSync(temporary, target);
  return name;
}
async function waitForHealth(version, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const [backend, frontend] = await Promise.all([
        fetch('http://127.0.0.1:3000/api/health', { signal: AbortSignal.timeout(3000) }),
        fetch('http://127.0.0.1:3001/api/health', { signal: AbortSignal.timeout(3000) }),
      ]);
      if (backend.ok && frontend.ok) {
        const a = await backend.json(), b = await frontend.json();
        const frontendVersion = frontend.headers.get('x-dalat-frontend-version');
        const frontendSession = frontend.headers.get('x-dalat-frontend-session');
        if (a.appVersion === version && b.appVersion === version && b.sessionId === a.sessionId
          && frontendVersion === version && frontendSession === a.sessionId) return true;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  return false;
}
async function waitForIdle(timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (!fs.existsSync(INSTANCE_PATH)) return;
    try {
      const response = await fetch('http://127.0.0.1:3000/api/app-update/freeze', {
        method: 'POST', headers: { origin: 'http://127.0.0.1:3001', 'x-dalat-update': '1' },
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok && (await response.json()).ready) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  fail('Tool vẫn đang xử lý tác vụ hoặc backend không phản hồi; chưa cài bản mới.');
}
function launch(root) {
  // The helper inherits the old release's environment. A stable-root launcher
  // must resolve current.json instead of treating the root as that release.
  const env = { ...process.env };
  delete env.DALAT_INSTALL_ROOT;
  delete env.DALAT_DATA_DIR;
  spawn('cmd.exe', ['/d', '/c', path.join(root, 'start.bat')], { cwd: root, env, detached: true, windowsHide: true, stdio: 'ignore' }).unref();
}
async function apply(rootArgument) {
  if (process.platform !== 'win32') fail('Trình cập nhật này chỉ hỗ trợ Windows.');
  const root = fs.realpathSync(rootArgument);
  const isolatedTest = process.env.DALAT_UPDATE_TEST_NO_RESTART === '1';
  if (isolatedTest && !root.toLowerCase().startsWith(path.resolve(os.tmpdir()).toLowerCase() + path.sep)) fail('Chế độ test chỉ dùng trong TEMP.');
  statusFile = path.join(root, 'shared', 'update-process.json');
  phase('checking', 'Đang xác minh bản phát hành.');
  const pointerFile = path.join(root, 'shared', 'current.json');
  const previous = readCurrent(root);
  const info = await fetchLatest();
  if (process.env.DALAT_UPDATE_REQUESTED_VERSION && info.version !== process.env.DALAT_UPDATE_REQUESTED_VERSION) fail('Phiên bản phát hành đã đổi; hãy kiểm tra lại trên giao diện.');
  if (compareVersions(info.version, previous.version) <= 0) return;
  phase('staging', 'Đang chuẩn bị gói cập nhật.', { version: info.version });
  const nextRelease = await stageRelease(root, info);
  if (!isolatedTest) {
    phase('waiting', 'Đang chờ tác vụ hiện tại hoàn tất.', { version: info.version });
    await waitForIdle(2 * 60 * 60_000);
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  phase('restarting', 'Đang đóng tool và chuyển sang phiên bản mới.', { version: info.version });
  if (!isolatedTest) stopPreviousInstance({ sessionId: `updater-${process.pid}` });
  writeJsonAtomic(pointerFile, { release: nextRelease, version: info.version });
  if (!isolatedTest) launch(root);
  if (process.env.DALAT_UPDATE_TEST_HEALTH_FAIL !== '1' && (isolatedTest || await waitForHealth(info.version, 5 * 60_000))) {
    writeJsonAtomic(path.join(root, 'shared', 'data', 'app-update-state.json'), { scheduledAt: null });
    phase('complete', 'Cập nhật hoàn tất.', { version: info.version });
    return;
  }
  phase('rollback', 'Bản mới không khởi động; đang khôi phục bản cũ.', { version: previous.version });
  if (!isolatedTest) stopPreviousInstance({ sessionId: `updater-rollback-${process.pid}` });
  writeJsonAtomic(pointerFile, previous);
  if (!isolatedTest) {
    launch(root);
    await waitForHealth(previous.version, 5 * 60_000);
  }
  fail('Bản mới không khởi động đúng; đã khôi phục con trỏ bản cũ.');
}

if (require.main === module) {
  apply(process.argv[3] || '').catch(error => {
    phase('error', error?.message || String(error));
    const root = process.argv[3];
    try {
      if (root) fs.appendFileSync(path.join(root, 'shared', 'update-error.log'), `${new Date().toISOString()} ${error?.message || error}\n`);
    } catch {}
    process.exitCode = 1;
  });
}

module.exports = { apply, readCurrent, releasePath, validateZipEntries, inspectRelease };
