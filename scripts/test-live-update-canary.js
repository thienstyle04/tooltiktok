#!/usr/bin/env node
// One real Windows restart/update in a TEMP install with isolated LOCALAPPDATA.
// Requires both ports 3000/3001 free. Does not copy or edit user data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

const oldZip = path.resolve(process.argv[2] || '');
const newZip = path.resolve(process.argv[3] || '');
const manifestFile = path.resolve(process.argv[4] || '');
if (process.platform !== 'win32') throw Error('Canary requires Windows.');
for (const file of [oldZip, newZip, manifestFile]) if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) throw Error(`Missing ${file}`);

const envelope = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const info = JSON.parse(Buffer.from(envelope.payload, 'base64').toString('utf8'));
const oldName = path.basename(oldZip, '.zip').match(/^dalat-studio-(\d+\.\d+\.\d+)-([a-f0-9]{8})$/);
if (!oldName) throw Error('Old release archive name is invalid.');
const oldVersion = oldName[1], oldRelease = `${oldVersion}-${oldName[2]}`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function portFree(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.on('connect', () => { socket.destroy(); resolve(false); });
    socket.on('error', error => resolve(error.code === 'ECONNREFUSED'));
  });
}
async function health(version) {
  const [backend, frontend] = await Promise.all([
    fetch('http://127.0.0.1:3000/api/health', { signal: AbortSignal.timeout(3000) }),
    fetch('http://127.0.0.1:3001/api/health', { signal: AbortSignal.timeout(3000) }),
  ]);
  const a = await backend.json(), b = await frontend.json();
  return backend.ok && frontend.ok && a.appVersion === version && b.appVersion === version
    && a.sessionId === b.sessionId
    && frontend.headers.get('x-dalat-frontend-version') === version
    && frontend.headers.get('x-dalat-frontend-session') === a.sessionId;
}
async function waitHealth(version, maxMs, log, launchExited = () => false) {
  const until = Date.now() + maxMs;
  while (Date.now() < until) {
    try { if (await health(version)) return; } catch {}
    if (launchExited()) throw Error(`Launcher stopped before health ${version}; log: ${log}`);
    await pause(5000);
  }
  throw Error(`Health did not reach ${version}; log: ${log}`);
}
async function updateCall(name, body) {
  const response = await fetch(`http://127.0.0.1:3000/api/app-update/${name}`, {
    method: 'POST',
    headers: { origin: 'http://127.0.0.1:3001', 'x-dalat-update': '1', 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) throw Error(`${name}: ${JSON.stringify(result)}`);
  return result;
}
function stopCanary(profile) {
  const previous = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = profile;
  try {
    const { stopPreviousInstance } = require('./runtime-instance');
    stopPreviousInstance({ sessionId: `canary-cleanup-${process.pid}` });
  } finally { process.env.LOCALAPPDATA = previous; }
}

async function main() {
  if (!await portFree(3000) || !await portFree(3001)) throw Error('Ports 3000/3001 are in use; canary will not stop the existing tool.');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-live-update-'));
  const profile = path.join(root, 'profile');
  const log = path.join(root, 'canary-launch.log');
  const oldRoot = path.join(root, 'releases', oldRelease);
  fs.mkdirSync(oldRoot, { recursive: true });
  execFileSync('tar', ['-xf', oldZip, '-C', oldRoot], { timeout: 120000 });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'shared', 'data'), { recursive: true });
  fs.mkdirSync(profile, { recursive: true });
  fs.copyFileSync(path.join(oldRoot, 'start.bat'), path.join(root, 'start.bat'));
  fs.copyFileSync(path.join(oldRoot, 'scripts', 'launch-current.ps1'), path.join(root, 'scripts', 'launch-current.ps1'));
  fs.writeFileSync(path.join(root, 'shared', 'current.json'), JSON.stringify({ release: oldRelease, version: oldVersion }));
  fs.writeFileSync(path.join(root, 'shared', 'data', 'canary-keep.json'), '{"data":"unchanged"}');
  const sampleEnv = fs.readFileSync(path.join(oldRoot, 'backend', '.env.example'), 'utf8')
    .replace(/^DEEPSEEK_API_KEY=.*$/m, 'DEEPSEEK_API_KEY=sk-canary-no-network')
    .replace(/^DALAT_AUTO_WARM_DRIVE_CACHE=.*$/m, 'DALAT_AUTO_WARM_DRIVE_CACHE=false');
  fs.writeFileSync(path.join(oldRoot, 'backend', '.env'), `${sampleEnv}\n`);
  const archive = fs.readFileSync(newZip);
  const manifest = fs.readFileSync(manifestFile);
  const server = http.createServer((request, response) => {
    if (request.url === '/stable/latest.json') { response.setHeader('Content-Type', 'application/json'); response.end(manifest); return; }
    if (request.url === `/${info.artifact.path}`) { response.setHeader('Content-Length', String(archive.length)); response.end(archive); return; }
    response.writeHead(404); response.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const env = {
    ...process.env, LOCALAPPDATA: profile,
    DALAT_UPDATE_BASE_URL: `http://127.0.0.1:${server.address().port}/`,
    DALAT_UPDATE_ALLOW_HTTP_FOR_TEST: '1',
  };
  const fd = fs.openSync(log, 'a');
  try {
    let launchExited = false;
    const launcher = spawn('cmd.exe', ['/d', '/c', path.join(root, 'start.bat')], { cwd: root, env, detached: true, windowsHide: true, stdio: ['ignore', fd, fd] });
    launcher.on('exit', () => { launchExited = true; });
    launcher.unref();
    console.log(`Canary root: ${root}`);
    await waitHealth(oldVersion, 12 * 60_000, log, () => launchExited);
    console.log(`Old release healthy: ${oldVersion}`);
    const checked = await updateCall('check');
    assert.equal(checked.availableVersion, info.version);
    const scheduledAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const deferred = await updateCall('defer', { scheduledAt });
    assert.equal(deferred.scheduledAt, scheduledAt);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'shared', 'data', 'app-update-state.json'))).scheduledAt, scheduledAt);
    await updateCall('install');
    const until = Date.now() + 12 * 60_000;
    let state;
    while (Date.now() < until) {
      try { state = JSON.parse(fs.readFileSync(path.join(root, 'shared', 'update-process.json'), 'utf8')); } catch {}
      if (state?.phase === 'complete') break;
      if (state?.phase === 'error') throw Error(`Update failed: ${state.message}; log: ${log}`);
      await pause(3000);
    }
    assert.equal(state?.phase, 'complete', `Update timed out; last state ${JSON.stringify(state)}; log: ${log}`);
    await waitHealth(info.version, 30_000, log);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'shared', 'current.json'))).version, info.version);
    assert.equal(fs.readFileSync(path.join(root, 'shared', 'data', 'canary-keep.json'), 'utf8'), '{"data":"unchanged"}');
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'shared', 'data', 'app-update-state.json'))).scheduledAt, null);
    console.log(`PASS real Windows update ${oldVersion} -> ${info.version}; data unchanged; log: ${log}`);
  } finally {
    stopCanary(profile);
    fs.closeSync(fd);
    server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
