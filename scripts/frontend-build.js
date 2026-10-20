// Bản build giao diện (frontend/.next-build) cho start.bat: next build + next start nhanh và mượt
// hơn nhiều so với next dev. Chỉ build lại khi mã giao diện, phiên bản, dependencies, Node hay
// thư mục cài đặt đổi. Build vào thư mục tạm rồi mới thay: build hỏng hoặc bị tắt giữa chừng
// không làm mất bản đang có.
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PRODUCTION_DIST_NAME = '.next-build';
const PRODUCTION_BUILD_TMP_NAME = `${PRODUCTION_DIST_NAME}-tmp`;
const MARKER_NAME = 'dalat-build.json';
const SOURCE_ENTRIES = ['app', 'components', 'lib', 'public', 'next.config.js', 'jsconfig.json', 'package.json', 'package-lock.json'];
const RM_OPTIONS = { recursive: true, force: true, maxRetries: 10, retryDelay: 300 };

function resolveNextCliPath(frontendDir) {
  try {
    return require.resolve('next/dist/bin/next', { paths: [frontendDir] });
  } catch {
    return '';
  }
}

function productionBuildFingerprint(frontendDir, { appVersion, backendOrigin }) {
  const hash = crypto.createHash('sha256');
  const addEntry = (relative) => {
    const absolute = path.join(frontendDir, relative);
    let stat;
    try { stat = fs.statSync(absolute); } catch { hash.update(`missing:${relative}\0`); return; }
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) addEntry(path.join(relative, name));
      return;
    }
    hash.update(`${relative.split(path.sep).join('/')}\0`);
    hash.update(fs.readFileSync(absolute));
    hash.update('\0');
  };
  SOURCE_ENTRIES.forEach(addEntry);
  let nextVersion = '';
  try {
    nextVersion = String(require(require.resolve('next/package.json', { paths: [frontendDir] })).version || '');
  } catch {}
  return {
    appVersion: String(appVersion || ''),
    nextVersion,
    nodeVersion: process.versions.node,
    frontendDir: path.resolve(frontendDir).toLowerCase(),
    backendOrigin: String(backendOrigin || ''),
    sourceHash: hash.digest('hex'),
  };
}

function productionBuildReusable(frontendDir, expected) {
  const distDir = path.join(frontendDir, PRODUCTION_DIST_NAME);
  try {
    if (!fs.existsSync(path.join(distDir, 'BUILD_ID'))) return false;
    const marker = JSON.parse(fs.readFileSync(path.join(distDir, MARKER_NAME), 'utf8'));
    return Object.keys(expected).every((key) => marker[key] === expected[key]);
  } catch {
    return false;
  }
}

function runNextBuild(nextCliPath, frontendDir, env, { track, log }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextCliPath, 'build', '--webpack'], {
      cwd: frontendDir,
      env: { ...env, NODE_ENV: 'production', NEXT_DIST_DIR: PRODUCTION_BUILD_TMP_NAME },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const untrack = track?.(child) || (() => {});
    child.stdout.on('data', (chunk) => log?.(chunk, false));
    child.stderr.on('data', (chunk) => log?.(chunk, true));
    child.on('error', (error) => { untrack(); reject(error); });
    child.on('exit', (code, signal) => {
      untrack();
      if (code === 0) resolve();
      else reject(new Error(signal ? `next build bị dừng (${signal})` : `next build thoát với mã ${code}`));
    });
  });
}

/**
 * Đảm bảo frontend/.next-build khớp mã hiện tại. Trả { built, buildMs }.
 * track(child) đăng ký tiến trình build để Ctrl+C / phiên mới tắt được; trả hàm hủy đăng ký.
 */
async function ensureProductionBuild({ frontendDir, appVersion, env = process.env, onStage, log, track }) {
  const nextCliPath = resolveNextCliPath(frontendDir);
  if (!nextCliPath) throw new Error('không tìm thấy Next.js trong frontend/node_modules');
  const fingerprint = productionBuildFingerprint(frontendDir, { appVersion, backendOrigin: env.NEXT_PUBLIC_BACKEND_ORIGIN });
  if (productionBuildReusable(frontendDir, fingerprint)) return { built: false, buildMs: 0 };
  onStage?.();
  const distDir = path.join(frontendDir, PRODUCTION_DIST_NAME);
  const tmpDir = path.join(frontendDir, PRODUCTION_BUILD_TMP_NAME);
  fs.rmSync(tmpDir, RM_OPTIONS);
  const startedAt = Date.now();
  try {
    await runNextBuild(nextCliPath, frontendDir, env, { track, log });
  } catch (error) {
    fs.rmSync(tmpDir, RM_OPTIONS);
    throw error;
  }
  // Cache webpack (~150 MB) chỉ dùng khi build; next start không cần.
  fs.rmSync(path.join(tmpDir, 'cache'), RM_OPTIONS);
  const buildMs = Date.now() - startedAt;
  fs.writeFileSync(path.join(tmpDir, MARKER_NAME), JSON.stringify({ ...fingerprint, builtAt: new Date().toISOString(), buildMs }, null, 2), 'utf8');
  fs.rmSync(distDir, RM_OPTIONS);
  fs.renameSync(tmpDir, distDir);
  return { built: true, buildMs };
}

module.exports = {
  PRODUCTION_DIST_NAME,
  PRODUCTION_BUILD_TMP_NAME,
  ensureProductionBuild,
  productionBuildFingerprint,
  productionBuildReusable,
  resolveNextCliPath,
};
