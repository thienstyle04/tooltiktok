const { execFileSync, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const RUNTIME_DIR = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'DalatTikTokCarouselTool',
  'runtime',
);
const INSTANCE_PATH = path.join(RUNTIME_DIR, 'active-instance.json');
const STARTUP_LOCK_PATH = path.join(RUNTIME_DIR, 'startup.lock');

function createSessionId() {
  return crypto.randomUUID();
}

function acquireStartupLock(timeoutMs = 15000) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const fd = fs.openSync(STARTUP_LOCK_PATH, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      return () => {
        try { fs.closeSync(fd); } catch {}
        try { fs.unlinkSync(STARTUP_LOCK_PATH); } catch {}
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (startupLockIsStale()) {
        try { fs.unlinkSync(STARTUP_LOCK_PATH); } catch {}
        continue;
      }
      sleepSync(200);
    }
  }
  throw new Error('Một phiên tool khác đang khởi động. Hãy chờ vài giây rồi chạy lại start.bat.');
}

function startupLockIsStale() {
  try {
    const stat = fs.statSync(STARTUP_LOCK_PATH);
    return Date.now() - stat.mtimeMs > 120000;
  } catch {
    return true;
  }
}

function readActiveInstance() {
  try {
    return JSON.parse(fs.readFileSync(INSTANCE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeActiveInstance(state) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  const tempPath = `${INSTANCE_PATH}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tempPath, INSTANCE_PATH);
}

function clearActiveInstance(sessionId) {
  const current = readActiveInstance();
  if (current?.sessionId && current.sessionId !== sessionId) return;
  try { fs.unlinkSync(INSTANCE_PATH); } catch {}
}

function processStartedAtMs() {
  return Math.round(Date.now() - process.uptime() * 1000);
}

function currentProcessCommandLine() {
  return inspectProcess(process.pid)?.commandLine || '';
}

function captureProcessState(pid) {
  const info = inspectProcess(Number(pid));
  return info ? {
    pid: info.pid,
    name: info.name,
    commandLine: info.commandLine,
    startedAtMs: Number.isFinite(info.createdAtMs) ? info.createdAtMs : null,
  } : null;
}

function inspectProcess(pid) {
  if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) return null;
  if (process.platform !== 'win32') return inspectPosixProcess(Number(pid));
  const script = [
    `$p=Get-CimInstance Win32_Process -Filter \"ProcessId=${Number(pid)}\" -ErrorAction SilentlyContinue`,
    'if ($p) { [pscustomobject]@{ ProcessId=$p.ProcessId; Name=$p.Name; CommandLine=$p.CommandLine; CreationDate=$p.CreationDate.ToUniversalTime().ToString("o") } | ConvertTo-Json -Compress }',
  ].join('; ');
  try {
    const output = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { encoding: 'utf8' }).trim();
    if (!output) return null;
    const value = JSON.parse(output);
    return {
      pid: Number(value.ProcessId),
      name: String(value.Name || ''),
      commandLine: String(value.CommandLine || ''),
      createdAtMs: Date.parse(value.CreationDate || ''),
    };
  } catch {
    return null;
  }
}

function inspectPosixProcess(pid) {
  try {
    const output = execFileSync('ps', ['-p', String(pid), '-o', 'pid=,lstart=,args='], { encoding: 'utf8' }).trim();
    if (!output) return null;
    return { pid, name: 'node', commandLine: output, createdAtMs: NaN };
  } catch {
    return null;
  }
}

function isRecordedToolProcess(info, state) {
  if (!info || info.pid === process.pid) return false;
  const command = normalizePath(info.commandLine);
  const recordedRoot = normalizePath(state?.workspaceRoot || '');
  const recordedCommand = normalizePath(state?.launcherCommandLine || '');
  const matchesNewFingerprint = Boolean(recordedCommand) && command === recordedCommand;
  const matchesLegacyWorkspace = !recordedCommand && Boolean(recordedRoot) && command.includes(recordedRoot);
  if (!command.includes('scripts\\dev.js') || (!matchesNewFingerprint && !matchesLegacyWorkspace)) return false;
  const expectedStart = Number(state?.launcherStartedAtMs || 0);
  return !(expectedStart && Number.isFinite(info.createdAtMs) && Math.abs(info.createdAtMs - expectedStart) > 10000);
}

function isRecordedBrowserProcess(info, state) {
  if (!info || info.pid === process.pid) return false;
  const command = normalizePath(info.commandLine);
  const profile = normalizePath(state?.browserProfileDir || '');
  const browserName = String(info.name || '').toLowerCase();
  const expectedCommand = normalizePath(state?.browserCommandLine || '');
  const expectedStart = Number(state?.browserStartedAtMs || 0);
  return Boolean(profile) && command.includes(profile)
    && (browserName.includes('chrome') || browserName.includes('msedge'))
    && (!expectedCommand || command === expectedCommand)
    && !(expectedStart && Number.isFinite(info.createdAtMs) && Math.abs(info.createdAtMs - expectedStart) > 10000);
}

function isRecordedChildProcess(info, state, prefix) {
  if (!info || info.pid === process.pid) return false;
  const expectedCommand = normalizePath(state?.[`${prefix}CommandLine`] || '');
  const expectedStart = Number(state?.[`${prefix}StartedAtMs`] || 0);
  if (!expectedCommand || normalizePath(info.commandLine) !== expectedCommand) return false;
  return !(expectedStart && Number.isFinite(info.createdAtMs) && Math.abs(info.createdAtMs - expectedStart) > 10000);
}

function stopPreviousInstance(options = {}) {
  const state = readActiveInstance();
  if (!state || state.sessionId === options.sessionId) return { stopped: false };
  const launcher = inspectProcess(Number(state.launcherPid));
  const backend = inspectProcess(Number(state.backendPid));
  const frontend = inspectProcess(Number(state.frontendPid));
  const browser = inspectProcess(Number(state.browserPid));
  const launcherValid = isRecordedToolProcess(launcher, state);
  const backendValid = isRecordedChildProcess(backend, state, 'backend');
  const frontendValid = isRecordedChildProcess(frontend, state, 'frontend');
  const browserValid = isRecordedBrowserProcess(browser, state);

  if (browserValid) stopProcessTreeSync(browser.pid);
  if (launcherValid) {
    try { fs.writeFileSync(shutdownRequestPath(state.sessionId), new Date().toISOString(), 'utf8'); } catch {}
    if (!waitForProcessExit(launcher.pid, 6000)) stopProcessTreeSync(launcher.pid);
    if (!waitForProcessExit(launcher.pid, 5000)) {
      throw new Error(`Không thể tắt phiên tool cũ (PID ${launcher.pid}). Hãy đóng cửa sổ cũ hoặc chạy start.bat bằng quyền phù hợp.`);
    }
  } else {
    for (const child of [backendValid ? backend : null, frontendValid ? frontend : null].filter(Boolean)) {
      stopProcessTreeSync(child.pid);
      if (!waitForProcessExit(child.pid, 5000)) {
        throw new Error(`Không thể tắt tiến trình tool cũ PID ${child.pid}. Hãy đóng cửa sổ cũ hoặc chạy start.bat bằng quyền phù hợp.`);
      }
    }
  }
  clearActiveInstance(state.sessionId);
  return { stopped: launcherValid || backendValid || frontendValid || browserValid, previous: state };
}

function watchForShutdownRequest(sessionId, onRequest) {
  const requestPath = shutdownRequestPath(sessionId);
  try { fs.unlinkSync(requestPath); } catch {}
  const timer = setInterval(() => {
    if (!fs.existsSync(requestPath)) return;
    clearInterval(timer);
    try { fs.unlinkSync(requestPath); } catch {}
    onRequest();
  }, 500);
  timer.unref?.();
  return () => clearInterval(timer);
}

function shutdownRequestPath(sessionId) {
  return path.join(RUNTIME_DIR, `shutdown-${String(sessionId).replace(/[^a-zA-Z0-9-]/g, '')}.request`);
}

function waitForProcessExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!inspectProcess(pid)) return true;
    sleepSync(200);
  }
  return !inspectProcess(pid);
}

function stopProcessTreeSync(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
    return;
  }
  try { process.kill(pid, 'SIGTERM'); } catch {}
}

function normalizePath(value) {
  return String(value || '').replace(/\//g, '\\').toLowerCase();
}

function sleepSync(ms) {
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, ms);
}

module.exports = {
  INSTANCE_PATH,
  RUNTIME_DIR,
  acquireStartupLock,
  captureProcessState,
  clearActiveInstance,
  createSessionId,
  currentProcessCommandLine,
  processStartedAtMs,
  stopPreviousInstance,
  watchForShutdownRequest,
  writeActiveInstance,
};
