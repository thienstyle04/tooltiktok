const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-runtime-instance-'));
  process.env.LOCALAPPDATA = tempRoot;
  const runtime = require('./runtime-instance');

  const release = runtime.acquireStartupLock();
  assert.throws(() => runtime.acquireStartupLock(300), /đang khởi động/);
  release();
  runtime.acquireStartupLock()();

  fs.mkdirSync(runtime.RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(runtime.INSTANCE_PATH, '{not-json', 'utf8');
  assert.deepEqual(runtime.stopPreviousInstance({ sessionId: 'new-session' }), { stopped: false });

  const innocent = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: false,
    stdio: 'ignore',
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
    runtime.writeActiveInstance({
      sessionId: 'old-session',
      launcherPid: innocent.pid,
      launcherCommandLine: 'node scripts/dev.js',
      launcherStartedAtMs: Date.now(),
      workspaceRoot: process.cwd(),
    });
    const result = runtime.stopPreviousInstance({ sessionId: 'new-session' });
    assert.equal(result.stopped, false, 'a reused/unrelated PID must not be stopped');
    process.kill(innocent.pid, 0);
  } finally {
    try { innocent.kill(); } catch {}
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log('PASS runtime registry: lock, corrupt state recovery, reused PID safety');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
