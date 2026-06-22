const { execFileSync, spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const frontendDir = path.join(rootDir, 'frontend');
const npmCliPath = resolveNpmCliPath();
const defaultHost = '0.0.0.0';
const displayHost = 'localhost';
const defaultBackendPort = 3000;
const defaultFrontendPort = 3001;
let shuttingDown = false;
let processes = [];
let browserOpenRequested = false;
let browserFrontendOrigin = '';

main().catch((error) => {
  shuttingDown = true;
  console.error(`[dev] ${error.message || error}`);
  stopAll();
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

  stopExistingWorkspaceDevProcesses();

  const backendPort = await findAvailablePort(requestedBackendPort, host);
  const frontendPort = await findAvailablePort(requestedFrontendPort, host, new Set([backendPort]));
  const backendOrigin = `http://${backendOriginHost(host)}:${backendPort}`;
  const frontendOrigin = `http://${backendOriginHost(host)}:${frontendPort}`;
  const networkHost = firstNetworkHost();
  browserFrontendOrigin = frontendOrigin;

  warnIfPortMoved('backend', requestedBackendPort, backendPort);
  warnIfPortMoved('frontend', requestedFrontendPort, frontendPort);
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
    }),
    startFrontendProcess(frontendPort, {
      ...process.env,
      BACKEND_ORIGIN: backendOrigin,
      PORT: String(frontendPort),
      NEXT_PUBLIC_BACKEND_ORIGIN: backendOrigin,
    }),
  ];

  if (shouldOpenBrowser()) {
    scheduleBrowserOpen(frontendOrigin);
  }
}

function scheduleBrowserOpen(origin) {
  waitForServer(origin)
    .then(() => openBrowserForOrigin(origin))
    .catch((error) => {
      if (browserOpenRequested) return;
      console.warn(`[dev] could not open browser automatically: ${error.message || error}`);
      console.warn(`[dev] open manually: ${origin}/`);
    });
}

function openBrowserForOrigin(origin) {
  if (browserOpenRequested) return;
  browserOpenRequested = true;
  console.log(`[dev] opening browser: ${origin}/`);
  const opened = openChrome(`${origin}/`);
  if (!opened) {
    console.warn(`[dev] browser launch failed; open manually: ${origin}/`);
  }
}

function maybeOpenBrowserFromFrontendLog(line) {
  if (!shouldOpenBrowser() || browserOpenRequested || !browserFrontendOrigin) return;
  if (!/ready in/i.test(line) && !/local:\s*http/i.test(line)) return;
  setTimeout(() => openBrowserForOrigin(browserFrontendOrigin), 800);
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

function waitForServer(origin, timeoutMs = 180000, intervalMs = 1000) {
  const url = new URL(origin);
  const deadline = Date.now() + timeoutMs;
  const requestOptions = buildProbeRequestOptions(url);

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(
        requestOptions,
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

function buildProbeRequestOptions(url) {
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return {
      hostname: '127.0.0.1',
      port: url.port,
      path: '/',
      timeout: 5000,
      family: 4,
    };
  }
  return {
    hostname: url.hostname,
    port: url.port,
    path: '/',
    timeout: 5000,
  };
}

function openChrome(url) {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const candidates = [
      path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ].filter(Boolean);

    for (const chromePath of candidates) {
      if (!fs.existsSync(chromePath)) continue;
      try {
        const child = spawn(chromePath, [url], { detached: true, stdio: 'ignore', shell: false });
        child.unref();
        return true;
      } catch {
        // Try next path / fallback.
      }
    }

    return openDefaultBrowserWindows(url);
  }

  if (process.platform === 'darwin') {
    try {
      spawn('open', ['-a', 'Google Chrome', url], { detached: true, stdio: 'ignore', shell: false }).unref();
      return true;
    } catch {
      spawn('open', [url], { detached: true, stdio: 'ignore', shell: false }).unref();
      return true;
    }
  }

  spawn('xdg-open', [url], { detached: true, stdio: 'ignore', shell: false }).unref();
  return true;
}

function openDefaultBrowserWindows(url) {
  try {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', shell: true }).unref();
    return true;
  } catch {
    return false;
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
    process.exit(code || 1);
  });

  return child;
}

async function findAvailablePort(preferredPort, host, reservedPorts = new Set()) {
  for (let port = preferredPort; port < preferredPort + 50 && port <= 65535; port += 1) {
    if (reservedPorts.has(port)) continue;
    if (await isPortAvailable(port, host)) return port;
  }

  throw new Error(`No available port found from ${preferredPort} to ${Math.min(preferredPort + 49, 65535)}.`);
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

function warnIfPortMoved(label, requestedPort, selectedPort) {
  if (requestedPort === selectedPort) return;
  console.warn(`[dev] ${label} port ${requestedPort} is busy; using ${selectedPort} instead.`);
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
    .forEach((line) => {
      stream.write(`[${label}] ${line}\n`);
      if (label === 'frontend') maybeOpenBrowserFromFrontendLog(line);
    });
}

function stopAll() {
  for (const child of processes) {
    if (!child || child.killed || child.exitCode !== null) continue;
    stopProcessTree(child.pid);
  }
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
  stopAll();
  setTimeout(() => process.exit(0), 300);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
