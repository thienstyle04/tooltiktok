const { execFileSync, spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const {
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
} = require('./runtime-instance');

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const frontendDir = path.join(rootDir, 'frontend');
const npmCliPath = resolveNpmCliPath();
const defaultHost = '0.0.0.0';
const displayHost = 'localhost';
const defaultBackendPort = 3000;
const defaultFrontendPort = 3001;
const appVersion = readAppVersion();
const sessionId = createSessionId();
let shuttingDown = false;
let processes = [];
let managedBrowser = null;
let releaseStartupLock = null;
let instanceState = null;
let stopShutdownWatch = null;

main().catch((error) => {
  shuttingDown = true;
  console.error(`[dev] ${error.message || error}`);
  stopAll();
  stopManagedBrowser();
  clearActiveInstance(sessionId);
  releaseStartupLock?.();
  process.exit(1);
});

async function main() {
  const host = process.env.HOST || defaultHost;
  const requestedBackendPort = parsePort(process.env.PORT, defaultBackendPort, 'PORT');
  const requestedFrontendPort = parsePort(
    process.env.FRONTEND_PORT || process.env.NEXT_PORT,
    defaultFrontendPort,
    'FRONTEND_PORT',
  );

  if (requestedBackendPort !== defaultBackendPort || requestedFrontendPort !== defaultFrontendPort) {
    throw new Error('Tool chỉ chạy cố định tại backend 3000 và frontend 3001. Hãy bỏ cấu hình PORT/FRONTEND_PORT tùy chỉnh.');
  }

  releaseStartupLock = acquireStartupLock();
  const previous = stopPreviousInstance({ sessionId });
  if (previous.stopped) console.log(`[dev] stopped previous tool session ${previous.previous?.sessionId || ''}.`);
  await stopLegacyToolOnFixedPorts();
  stopExistingWorkspaceDevProcesses();
  await assertFixedPortsAvailable(host, [defaultBackendPort, defaultFrontendPort]);

  const backendPort = defaultBackendPort;
  const frontendPort = defaultFrontendPort;
  const backendOrigin = `http://${backendOriginHost(host)}:${backendPort}`;
  const frontendOrigin = `http://${backendOriginHost(host)}:${frontendPort}`;
  const networkHost = firstNetworkHost();

  console.log(`[dev] session: ${sessionId} (v${appVersion})`);
  console.log(`[dev] backend: ${backendOrigin}/`);
  console.log(`[dev] frontend: ${frontendOrigin}/`);
  if (networkHost && host === defaultHost) {
    console.log(`[dev] network: http://${networkHost}:${frontendPort}/`);
  }

  processes = [
    startNpmProcess('backend', ['run', 'start:dev'], backendDir, {
      ...process.env,
      HOST: host,
      PORT: String(backendPort),
      FRONTEND_ORIGIN: frontendOrigin,
      DALAT_SESSION_ID: sessionId,
      DALAT_APP_VERSION: appVersion,
    }),
    startFrontendProcess(frontendPort, {
      ...process.env,
      BACKEND_ORIGIN: backendOrigin,
      PORT: String(frontendPort),
      NEXT_PUBLIC_BACKEND_ORIGIN: backendOrigin,
      NEXT_PUBLIC_DALAT_SESSION_ID: sessionId,
      NEXT_PUBLIC_DALAT_APP_VERSION: appVersion,
    }),
  ];

  const backendProcessState = captureProcessState(processes[0]?.pid);
  const frontendProcessState = captureProcessState(processes[1]?.pid);

  instanceState = {
    sessionId,
    appVersion,
    workspaceRoot: rootDir,
    launcherPid: process.pid,
    launcherCommandLine: currentProcessCommandLine(),
    launcherStartedAtMs: processStartedAtMs(),
    backendPid: processes[0]?.pid || null,
    backendCommandLine: backendProcessState?.commandLine || '',
    backendStartedAtMs: backendProcessState?.startedAtMs || null,
    frontendPid: processes[1]?.pid || null,
    frontendCommandLine: frontendProcessState?.commandLine || '',
    frontendStartedAtMs: frontendProcessState?.startedAtMs || null,
    backendPort,
    frontendPort,
    browserPid: null,
    browserProfileDir: path.join(RUNTIME_DIR, 'browser-profile'),
    startedAt: new Date().toISOString(),
  };
  writeActiveInstance(instanceState);
  stopShutdownWatch = watchForShutdownRequest(sessionId, () => shutdown('REPLACED'));
  releaseStartupLock();
  releaseStartupLock = null;

  if (shouldOpenBrowser()) {
    // Chờ cả frontend và dữ liệu backend sẵn sàng trước khi mở trình duyệt.
    // Nếu chỉ chờ frontend, Next có thể trả về trang trong lúc backend vẫn
    // đang warmup workbook/ảnh; các request đầu tiên sẽ nhận 502 và UI báo
    // nhầm là backend bị mất kết nối.
    await Promise.all([
      waitForServer(frontendOrigin),
      waitForBackendReady(backendOrigin),
    ]);
    await verifyRuntimeEndpoints(backendOrigin, frontendOrigin);
    managedBrowser = openPreferredBrowser(frontendOrigin);
    const browserProcessState = captureProcessState(managedBrowser.pid);
    instanceState = {
      ...instanceState,
      browserPid: managedBrowser.pid || null,
      browserCommandLine: browserProcessState?.commandLine || '',
      browserStartedAtMs: browserProcessState?.startedAtMs || null,
      browserName: managedBrowser.name,
      browserManaged: managedBrowser.managed,
    };
    writeActiveInstance(instanceState);
    console.log(`[dev] opening ${managedBrowser.name}: ${frontendOrigin}/`);
    if (!managedBrowser.managed) {
      console.warn('[dev] Trình duyệt mặc định không thể tự đóng ở lần chạy sau. Chrome hoặc Edge sẽ được quản lý an toàn hơn.');
    }
  }
}

function waitForBackendReady(origin, timeoutMs = 15 * 60 * 1000, intervalMs = 1000) {
  const url = new URL(origin);
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(
        {
          hostname: url.hostname,
          port: url.port,
          path: '/api/guide-data',
          timeout: 5000,
        },
        (response) => {
          response.resume();
          if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
            resolve();
            return;
          }
          retry(new Error(`Backend chưa sẵn sàng (HTTP ${response.statusCode ?? 'unknown'})`));
        },
      );

      request.on('timeout', () => {
        request.destroy(new Error('Backend readiness request timed out'));
      });

      request.on('error', (error) => {
        retry(error);
      });
    };

    const retry = (error) => {
      if (Date.now() >= deadline) {
        reject(error);
        return;
      }
      setTimeout(attempt, intervalMs);
    };

    attempt();
  });
}
function startNpmProcess(label, args, cwd, env) {
  const command = npmCliPath ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const commandArgs = npmCliPath ? [npmCliPath, ...args] : args;
  return startProcess(label, command, commandArgs, cwd, env);
}

function startFrontendProcess(port, env) {
  const nextCliPath = resolveNextCliPath();
  if (nextCliPath) {
    return startProcess(
      'frontend',
      process.execPath,
      [nextCliPath, 'dev', '--webpack', '-H', env.HOST || defaultHost, '-p', String(port)],
      frontendDir,
      env,
    );
  }

  return startNpmProcess('frontend', ['run', 'dev', '--', '-H', env.HOST || defaultHost, '-p', String(port)], frontendDir, env);
}

function shouldOpenBrowser() {
  const flag = String(process.env.DALAT_OPEN_BROWSER ?? '1').trim().toLowerCase();
  return flag !== '0' && flag !== 'false' && flag !== 'no';
}

function waitForServer(origin, timeoutMs = 120000, intervalMs = 1000) {
  const url = new URL(origin);
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(
        {
          hostname: url.hostname,
          port: url.port,
          path: '/',
          timeout: 3000,
        },
        (response) => {
          response.resume();
          if (response.statusCode && response.statusCode >= 200 && response.statusCode < 500) {
            resolve();
            return;
          }
          retry(new Error(`Unexpected status ${response.statusCode}`));
        },
      );

      request.on('timeout', () => {
        request.destroy(new Error('Request timed out'));
      });

      request.on('error', (error) => {
        retry(error);
      });
    };

    const retry = (error) => {
      if (Date.now() >= deadline) {
        reject(error);
        return;
      }
      setTimeout(attempt, intervalMs);
    };

    attempt();
  });
}

function openPreferredBrowser(url) {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const browserProfileDir = path.join(RUNTIME_DIR, 'browser-profile');
    fs.mkdirSync(browserProfileDir, { recursive: true });
    const browserUrl = new URL(url);
    browserUrl.searchParams.set('runtimeSession', sessionId);
    const candidates = [
      {
        name: 'Google Chrome',
        paths: [
          path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        ],
      },
      {
        name: 'Microsoft Edge',
        paths: [
          path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        ],
      },
    ];

    for (const browser of candidates) {
      const executable = browser.paths.find((candidate) => candidate && fs.existsSync(candidate));
      if (!executable) continue;
      const child = spawn(executable, [
        `--user-data-dir=${browserProfileDir}`,
        `--app=${browserUrl.toString()}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-mode',
      ], { detached: true, stdio: 'ignore', shell: false });
      child.unref();
      return { name: browser.name, pid: child.pid, managed: true };
    }

    // Không có Chrome/Edge ở các đường dẫn chuẩn: giao cho Windows mở bằng
    // trình duyệt mặc định thay vì cố gọi lệnh chrome và báo không tìm thấy.
    spawn('cmd', ['/c', 'start', '', browserUrl.toString()], { detached: true, stdio: 'ignore', shell: false }).unref();
    return { name: 'default browser', pid: null, managed: false };
  }

  if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore', shell: false }).unref();
    return { name: 'default browser', pid: null, managed: false };
  }

  spawn('xdg-open', [url], { detached: true, stdio: 'ignore', shell: false }).unref();
  return { name: 'default browser', pid: null, managed: false };
}

async function verifyRuntimeEndpoints(backendOrigin, frontendOrigin) {
  const [backendHealth, frontendHealth, backendCache, frontendCache] = await Promise.all([
    fetchJson(`${backendOrigin}/api/health`),
    fetchJson(`${frontendOrigin}/api/health`),
    fetchJson(`${backendOrigin}/api/drive-cache/status`),
    fetchJson(`${frontendOrigin}/api/drive-cache/status`),
  ]);
  for (const [label, result] of [
    ['backend health', backendHealth],
    ['frontend health proxy', frontendHealth],
    ['backend drive cache', backendCache],
    ['frontend drive cache proxy', frontendCache],
  ]) {
    if (result.status !== 200) throw new Error(`${label} trả HTTP ${result.status}; frontend/backend không đồng bộ.`);
  }
  for (const health of [backendHealth.body, frontendHealth.body]) {
    if (health?.sessionId !== sessionId || health?.appVersion !== appVersion) {
      throw new Error(`Frontend/backend không cùng phiên (cần ${sessionId} v${appVersion}).`);
    }
  }
  if (frontendHealth.frontendSession !== sessionId || frontendHealth.frontendVersion !== appVersion) {
    throw new Error(`Frontend proxy không cùng phiên (cần ${sessionId} v${appVersion}).`);
  }
  console.log('[dev] runtime check: frontend/backend/cache routes matched.');
}

async function fetchJson(url, timeoutMs = 30000) {
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    let body = null;
    try { body = await response.json(); } catch {}
    return {
      status: response.status,
      body,
      frontendSession: response.headers.get('x-dalat-frontend-session') || '',
      frontendVersion: response.headers.get('x-dalat-frontend-version') || '',
    };
  } catch (error) {
    throw new Error(`${url}: ${error?.message || error}`);
  }
}

async function stopLegacyToolOnFixedPorts() {
  const candidates = [
    { port: defaultBackendPort, signatures: ['Dalat Carousel API', 'Dalat TikTok Carousel Tool'] },
    { port: defaultFrontendPort, signatures: ['Dalat TikTok Carousel Tool', '<title>Dalat'] },
  ];
  const confirmedOwners = new Set();
  for (const candidate of candidates) {
    const owners = findProcessIdsOnPorts([candidate.port]).filter((pid) => pid !== process.pid);
    if (!owners.length) continue;
    let confirmed = false;
    try {
      const response = await fetch(`http://127.0.0.1:${candidate.port}/`, { signal: AbortSignal.timeout(3000) });
      const text = await response.text();
      confirmed = candidate.signatures.some((signature) => text.includes(signature));
    } catch {}
    if (confirmed) owners.forEach((pid) => confirmedOwners.add(pid));
  }
  if (!confirmedOwners.size) return;
  const owners = [...confirmedOwners];
  console.warn(`[dev] stopping verified legacy tool process(es): ${owners.join(', ')}`);
  owners.forEach(stopProcessTreeSync);
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (!findProcessIdsOnPorts([defaultBackendPort, defaultFrontendPort]).length) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function assertFixedPortsAvailable(host, ports) {
  for (const port of ports) {
    const owners = describeProcessesOnPorts([port]);
    if (!owners.length && await isPortAvailable(port, host)) continue;
    const detail = owners.length
      ? owners.map((entry) => `PID ${entry.pid} (${entry.name || 'unknown'})`).join(', ')
      : 'không xác định được tiến trình';
    throw new Error(`Cổng cố định ${port} đang bị chiếm bởi ${detail}. Tool không tự đổi cổng để tránh lệch phiên.`);
  }
}

function describeProcessesOnPorts(ports) {
  if (process.platform !== 'win32') return findProcessIdsOnPorts(ports).map((pid) => ({ pid, name: '' }));
  const portFilter = ports.join(',');
  const script = `Get-NetTCPConnection -State Listen -LocalPort ${portFilter} -ErrorAction SilentlyContinue | ForEach-Object { $p=Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; [pscustomobject]@{ pid=$_.OwningProcess; name=$p.ProcessName } } | ConvertTo-Json -Compress`;
  try {
    const output = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { encoding: 'utf8' }).trim();
    if (!output) return [];
    const parsed = JSON.parse(output);
    return (Array.isArray(parsed) ? parsed : [parsed]).map((entry) => ({ pid: Number(entry.pid), name: String(entry.name || '') }));
  } catch {
    return findProcessIdsOnPorts(ports).map((pid) => ({ pid, name: '' }));
  }
}

function readAppVersion() {
  try {
    return String(JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version || 'unknown');
  } catch {
    return 'unknown';
  }
}

function backendOriginHost(host) {
  return host === '0.0.0.0' || host === '::' ? displayHost : host;
}

function firstNetworkHost() {
  const os = require('node:os');
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return '';
}

function startProcess(label, command, args, cwd, env) {
  const child = spawn(command, args, {
    cwd,
    env,
    shell: false,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => writePrefixed(label, chunk));
  child.stderr.on('data', (chunk) => writePrefixed(label, chunk, true));

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`[dev] ${label} stopped${signal ? ` by ${signal}` : ` with code ${code}`}.`);
    stopAll();
    stopManagedBrowser();
    stopShutdownWatch?.();
    clearActiveInstance(sessionId);
    process.exit(code || 1);
  });

  return child;
}

async function isPortAvailable(port, host) {
  const hostsToCheck = [...new Set([host, displayHost, '::'])];
  for (const candidateHost of hostsToCheck) {
    if (!(await canListen(port, candidateHost))) return false;
  }
  return true;
}

function canListen(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (error) => {
      if (error.code === 'EADDRNOTAVAIL' || error.code === 'EAFNOSUPPORT') {
        resolve(true);
        return;
      }
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen({ port, host });
  });
}

function parsePort(value, fallbackPort, envName) {
  if (!value) return fallbackPort;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${envName} must be a TCP port between 1 and 65535.`);
  }

  return port;
}

function findProcessIdsOnPorts(ports) {
  if (process.platform === 'win32') {
    try {
      const portFilter = ports.join(',');
      const output = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          `Get-NetTCPConnection -State Listen -LocalPort ${portFilter} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`,
        ],
        { encoding: 'utf8' },
      );
      return parseProcessIds(output);
    } catch {
      return [];
    }
  }

  try {
    const output = execFileSync('lsof', ['-t', ...ports.flatMap((port) => ['-i', `:${port}`])], { encoding: 'utf8' });
    return parseProcessIds(output);
  } catch {
    return [];
  }
}

function stopExistingWorkspaceDevProcesses() {
  const processIds = findExistingWorkspaceDevProcessIds();
  if (!processIds.length) return;

  console.warn(
    `[dev] stopping existing dev process(es) for this workspace: ${processIds.join(', ')}`,
  );

  for (const pid of processIds) {
    stopProcessTreeSync(pid);
  }
}

function findExistingWorkspaceDevProcessIds() {
  if (process.platform === 'win32') {
    return findExistingWindowsDevProcessIds();
  }

  return findExistingPosixDevProcessIds();
}

function findExistingWindowsDevProcessIds() {
  const script = `
$frontend = ${toPowerShellString(frontendDir)}
$backend = ${toPowerShellString(backendDir)}
$current = ${process.pid}
Get-CimInstance Win32_Process | Where-Object {
  $_.ProcessId -ne $current -and
  $_.CommandLine -and
  $_.Name -match '^(node|node.exe|cmd.exe)$' -and
  (
    ($_.CommandLine -like "*$frontend*" -and $_.CommandLine -match 'next\\\\dist\\\\') -or
    ($_.CommandLine -like "*$backend*" -and $_.CommandLine -match 'ts-node')
  )
} | Select-Object -ExpandProperty ProcessId
`;

  try {
    const output = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { encoding: 'utf8' },
    );
    return parseProcessIds(output);
  } catch {
    return [];
  }
}

function findExistingPosixDevProcessIds() {
  try {
    const output = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' });
    const normalizedFrontendDir = frontendDir.split(path.sep).join('/');
    const normalizedBackendDir = backendDir.split(path.sep).join('/');

    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)\s+(.+)$/);
        if (!match) return null;
        return { pid: Number(match[1]), commandLine: match[2].split(path.sep).join('/') };
      })
      .filter((entry) => entry && entry.pid !== process.pid)
      .filter((entry) => (
        (entry.commandLine.includes(normalizedFrontendDir) && entry.commandLine.includes('next/dist/')) ||
        (entry.commandLine.includes(normalizedBackendDir) && entry.commandLine.includes('ts-node'))
      ))
      .map((entry) => entry.pid);
  } catch {
    return [];
  }
}

function parseProcessIds(output) {
  return [...new Set(String(output)
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0))];
}

function toPowerShellString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function resolveNpmCliPath() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function resolveNextCliPath() {
  try {
    return require.resolve('next/dist/bin/next', { paths: [frontendDir] });
  } catch {
    return '';
  }
}

function writePrefixed(label, chunk, isError = false) {
  const stream = isError ? process.stderr : process.stdout;
  String(chunk)
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((line) => stream.write(`[${label}] ${line}\n`));
}

function stopAll() {
  for (const child of processes) {
    if (!child || child.killed || child.exitCode !== null) continue;
    stopProcessTree(child.pid);
  }
}

function stopManagedBrowser() {
  if (!managedBrowser?.managed || !managedBrowser.pid) return;
  stopProcessTree(managedBrowser.pid);
  managedBrowser = null;
}

function stopProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Process already stopped.
    }
  }
}

function stopProcessTreeSync(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Process already stopped.
    }
  }
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[dev] Received ${signal}. Stopping backend and frontend...`);
  stopShutdownWatch?.();
  stopAll();
  stopManagedBrowser();
  clearActiveInstance(sessionId);
  setTimeout(() => {
    process.exit(0);
  }, 300);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
