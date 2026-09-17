const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const http = require('node:http');
const path = require('node:path');

async function main() {
  const source = fs.readFileSync(path.join(__dirname, 'dev.js'), 'utf8');
  const probe = source.slice(source.indexOf('function waitForBackendReady('), source.indexOf('function startNpmProcess('));
  const paths = [];
  const server = http.createServer((req, res) => {
    paths.push(req.url);
    res.writeHead(req.url === '/api/health' ? 200 : 503);
    res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const context = vm.createContext({ http, URL, Date, Promise, Error, setTimeout });
    vm.runInContext(probe, context);
    await context.waitForBackendReady(`http://127.0.0.1:${server.address().port}`, 1000, 10);
    assert.deepEqual(paths, ['/api/health']);
  } finally { server.close(); }

  const client = fs.readFileSync(path.join(__dirname, '../frontend/lib/exportClient.js'), 'utf8');
  const fn = client.slice(client.indexOf('async function fetchImageBlob('), client.indexOf('async function blobLooksLikeDriveFallback('));
  for (const recovers of [true, false]) {
    let calls = 0;
    const context = vm.createContext({
      AbortController, IMAGE_FETCH_TIMEOUT_MS: 10000, clearTimeout,
      setTimeout: (callback, ms) => setTimeout(callback, ms === 1000 ? 1 : ms),
      localDriveImageUrl: () => true,
      fetch: async () => {
        calls++;
        return new Response('image', { headers: { 'x-drive-image-fallback': recovers && calls === 2 ? '0' : '1' } });
      },
    });
    vm.runInContext(fn, context);
    const result = await context.fetchImageBlob('/assets/drive-file?id=test');
    assert.equal(calls, 2);
    assert.equal(Boolean(result.blob), recovers);
    if (!recovers) assert.equal(result.fallback, true);
  }
  console.log('PASS: startup probes health only; export retries placeholder once, persistent failure stays blocked');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
