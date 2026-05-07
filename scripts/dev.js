const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const frontendDir = path.join(rootDir, 'frontend');
const npmCliPath = resolveNpmCliPath();
const defaultHost = '127.0.0.1';
const defaultBackendPort = 3000;
const defaultFrontendPort = 3001;
let shuttingDown = false;
let processes = [];

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

  const backendPort = await findAvailablePort(requestedBackendPort, host);
  const frontendPort = await findAvailablePort(requestedFrontendPort, host, new Set([backendPort]));
  const backendOrigin = `http://${host}:${backendPort}`;
  const frontendOrigin = `http://${host}:${frontendPort}`;

  warnIfPortMoved('backend', requestedBackendPort, backendPort);
  warnIfPortMoved('frontend', requestedFrontendPort, frontendPort);
  console.log(`[dev] backend: ${backendOrigin}/`);
  console.log(`[dev] frontend: ${frontendOrigin}/`);

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
      [nextCliPath, 'dev', '--webpack', '-p', String(port)],
      frontendDir,
      env,
    );
  }

  return startNpmProcess('frontend', ['run', 'dev', '--', '-p', String(port)], frontendDir, env);
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
  const hostsToCheck = [...new Set([host, defaultHost, '::'])];
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

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[dev] Received ${signal}. Stopping backend and frontend...`);
  stopAll();
  setTimeout(() => process.exit(0), 300);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
