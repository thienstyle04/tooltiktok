// Giao diện chạy bản build (scripts/frontend-build.js): build lần đầu, lần sau dùng lại, sửa mã thì
// build lại, build lỗi giữ nguyên bản cũ, next start đọc mã phiên lúc chạy (không đóng cứng lúc build).
// Chạy trên bản sao frontend trong thư mục tạm (node_modules nối junction); không đụng frontend thật,
// không dùng cổng 3000/3001 và không gọi backend thật.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { PRODUCTION_DIST_NAME, PRODUCTION_BUILD_TMP_NAME, ensureProductionBuild, resolveNextCliPath } = require('./frontend-build');

const sourceFrontend = path.resolve(__dirname, '..', 'frontend');
const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const freePort = async () => { const server = http.createServer(); const port = await listen(server); await new Promise((resolve) => server.close(resolve)); return port; };

async function waitFor(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(3000) }); return response; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Không mở được ${url}`);
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-frontend-build-'));
  const frontendDir = path.join(root, 'frontend');
  let server = null, backend = null;
  try {
    fs.mkdirSync(frontendDir);
    for (const entry of ['app', 'components', 'lib', 'public', 'next.config.js', 'jsconfig.json', 'package.json', 'package-lock.json']) {
      fs.cpSync(path.join(sourceFrontend, entry), path.join(frontendDir, entry), { recursive: true });
    }
    fs.symlinkSync(path.join(sourceFrontend, 'node_modules'), path.join(frontendDir, 'node_modules'), 'junction');
    const env = { ...process.env, NEXT_PUBLIC_BACKEND_ORIGIN: 'http://localhost:3000' };
    delete env.NEXT_DIST_DIR;
    const tracked = new Set();
    const options = { frontendDir, appVersion: '9.9.9-test', env, track: (child) => { tracked.add(child); return () => tracked.delete(child); } };
    const distDir = path.join(frontendDir, PRODUCTION_DIST_NAME);

    let stages = 0;
    const first = await ensureProductionBuild({ ...options, onStage: () => stages++ });
    assert.equal(first.built, true);
    assert.equal(stages, 1, 'Báo tiến độ build cho trang chờ');
    assert.equal(tracked.size, 0, 'Tiến trình build được đăng ký rồi hủy đăng ký');
    assert.ok(fs.existsSync(path.join(distDir, 'BUILD_ID')));
    assert.ok(!fs.existsSync(path.join(distDir, 'cache')), 'Bỏ cache webpack khỏi bản build');
    assert.ok(!fs.existsSync(path.join(frontendDir, PRODUCTION_BUILD_TMP_NAME)));
    const buildId = fs.readFileSync(path.join(distDir, 'BUILD_ID'), 'utf8');

    const reused = await ensureProductionBuild({ ...options, onStage: () => assert.fail('Không được build lại khi mã không đổi') });
    assert.equal(reused.built, false);

    // Đổi phiên bản app → build lại.
    assert.equal((await ensureProductionBuild({ ...options, appVersion: '9.9.10-test' })).built, true);
    const rebuiltId = fs.readFileSync(path.join(distDir, 'BUILD_ID'), 'utf8');
    assert.notEqual(rebuiltId, buildId);

    // Mã hỏng: build lỗi, bản đang có giữ nguyên và không để lại thư mục tạm.
    const broken = path.join(frontendDir, 'lib', '__broken-build-test.js');
    fs.writeFileSync(broken, 'export const x = ;\n');
    fs.appendFileSync(path.join(frontendDir, 'app', 'page.js'), "\nimport '../lib/__broken-build-test.js';\n");
    await assert.rejects(() => ensureProductionBuild({ ...options, appVersion: '9.9.10-test', log: () => {} }), /next build/);
    assert.equal(fs.readFileSync(path.join(distDir, 'BUILD_ID'), 'utf8'), rebuiltId, 'Build lỗi không được làm mất bản cũ');
    assert.ok(!fs.existsSync(path.join(frontendDir, PRODUCTION_BUILD_TMP_NAME)));
    fs.copyFileSync(path.join(sourceFrontend, 'app', 'page.js'), path.join(frontendDir, 'app', 'page.js'));
    fs.rmSync(broken);
    // Mã trở lại như lúc build trước → dùng lại bản build đó.
    assert.equal((await ensureProductionBuild({ ...options, appVersion: '9.9.10-test', onStage: () => assert.fail('mã không đổi') })).built, false);

    // next start: mã phiên đọc lúc chạy (trước đây đóng cứng NEXT_PUBLIC_* lúc build).
    backend = http.createServer((request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', sessionId: 'runtime-session-xyz', appVersion: '9.9.10-test' }));
    });
    const backendPort = await listen(backend);
    const port = await freePort();
    server = spawn(process.execPath, [resolveNextCliPath(frontendDir), 'start', '-H', '127.0.0.1', '-p', String(port)], {
      cwd: frontendDir,
      env: { ...env, NODE_ENV: 'production', NEXT_DIST_DIR: PRODUCTION_DIST_NAME, BACKEND_ORIGIN: `http://127.0.0.1:${backendPort}`,
        DALAT_FRONTEND_SESSION_ID: 'runtime-session-xyz', DALAT_FRONTEND_APP_VERSION: '9.9.10-test' },
      stdio: 'ignore',
    });
    const page = await waitFor(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 200);
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('x-dalat-frontend-session'), 'runtime-session-xyz');
    assert.equal(health.headers.get('x-dalat-frontend-version'), '9.9.10-test');
    console.log('PASS frontend production build: build, reuse, rebuild on change, failed build keeps previous, next start reads runtime session');
  } finally {
    if (server?.pid) spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
    backend?.close();
    try { fs.unlinkSync(path.join(frontendDir, 'node_modules')); } catch {}
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
