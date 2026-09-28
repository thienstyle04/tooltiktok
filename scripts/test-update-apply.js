const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const JSZip = require('../frontend/node_modules/jszip');

const keyFile = path.join(process.env.LOCALAPPDATA || '', 'DalatStudioReleaseSigning', 'private.pem');
if (!fs.existsSync(keyFile)) throw Error('Test cần khóa ký phát hành cục bộ, không nằm trong Git.');

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-update-apply-test-'));
  fs.mkdirSync(path.join(root, 'shared', 'data'), { recursive: true });
  fs.mkdirSync(path.join(root, 'releases'), { recursive: true });
  fs.writeFileSync(path.join(root, 'shared', 'data', 'keep.json'), '{"important":"unchanged"}');
  fs.writeFileSync(path.join(root, 'shared', 'current.json'), JSON.stringify({ release: '0.7.04-00000000', version: '0.7.04' }));
  return root;
}
async function makePackage() {
  const zip = new JSZip();
  const packages = ['package.json', 'frontend/package.json', 'backend/package.json'];
  zip.file('VERSION', '0.7.5\n');
  zip.file('start.bat', '@echo off\r\n');
  zip.file('scripts/dev.js', '// test');
  zip.file('scripts/update-client.js', '// test');
  for (const name of packages) zip.file(name, JSON.stringify({ version: '0.7.05' }));
  const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const artifact = { path: 'releases/test-0.7.05.zip', sha256: crypto.createHash('sha256').update(archive).digest('hex'), size: archive.length };
  const payload = Buffer.from(JSON.stringify({ schema: 1, channel: 'stable', platform: 'win32-x64', version: '0.7.05', commit: 'a'.repeat(40), notes: ['Test'], artifact }));
  const signature = crypto.sign(null, payload, fs.readFileSync(keyFile)).toString('base64');
  return { archive, manifest: Buffer.from(JSON.stringify({ payload: payload.toString('base64'), signature })) };
}
function runUpdater(root, url, healthFail = false) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(__dirname, 'update-client.js'), 'apply', root], {
      env: { ...process.env, DALAT_UPDATE_BASE_URL: url, DALAT_UPDATE_ALLOW_HTTP_FOR_TEST: '1', DALAT_UPDATE_TEST_NO_RESTART: '1', DALAT_UPDATE_TEST_HEALTH_FAIL: healthFail ? '1' : '0' },
      stdio: 'ignore', windowsHide: true,
    });
    child.on('exit', code => resolve(code));
  });
}
async function main() {
  const { archive, manifest } = await makePackage();
  let serveCorrupt = false;
  const server = http.createServer((request, response) => {
    if (request.url === '/stable/latest.json') { response.setHeader('Content-Type', 'application/json'); response.end(manifest); return; }
    if (request.url === '/releases/test-0.7.05.zip') { response.setHeader('Content-Length', String(archive.length)); response.end(serveCorrupt ? Buffer.alloc(archive.length, 1) : archive); return; }
    response.writeHead(404); response.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    const successRoot = makeRoot();
    const staging = path.join(successRoot, 'shared', 'update-staging');
    fs.mkdirSync(staging, { recursive: true });
    fs.writeFileSync(path.join(staging, `0.7.05-${'a'.repeat(8)}.zip`), Buffer.from('incomplete older download'));
    assert.equal(await runUpdater(successRoot, url), 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(successRoot, 'shared', 'current.json'))).version, '0.7.05');
    assert.equal(fs.readFileSync(path.join(successRoot, 'shared', 'data', 'keep.json'), 'utf8'), '{"important":"unchanged"}');
    const rollbackRoot = makeRoot();
    assert.equal(await runUpdater(rollbackRoot, url, true), 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(rollbackRoot, 'shared', 'current.json'))).version, '0.7.04');
    assert.equal(fs.readFileSync(path.join(rollbackRoot, 'shared', 'data', 'keep.json'), 'utf8'), '{"important":"unchanged"}');
    serveCorrupt = true;
    const badHashRoot = makeRoot();
    assert.equal(await runUpdater(badHashRoot, url), 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(badHashRoot, 'shared', 'current.json'))).version, '0.7.04');
    assert.equal(fs.readFileSync(path.join(badHashRoot, 'shared', 'data', 'keep.json'), 'utf8'), '{"important":"unchanged"}');
    console.log('PASS update apply and rollback in isolated Windows roots:', successRoot, rollbackRoot);
  } finally { server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
