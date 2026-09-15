import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';
const { proxyBackendRequest } = await import('../lib/backendProxy.js');
const originalFetch = globalThis.fetch;
try {
  for (const [name, expected] of [['TimeoutError', 504], ['TypeError', 502]]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; const error = new Error('simulated'); error.name = name; throw error; };
    const response = await proxyBackendRequest(new Request('http://localhost:3001/api/destinations/dalat/refresh-from-sheet', { method: 'POST' }));
    assert.equal(response.status, expected);
    assert.equal(calls, 1, 'must not replay sync');
    assert.ok((await response.json()).code.startsWith('BACKEND_'));
  }
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(new ReadableStream({ start(c) { c.error(new Error('body interrupted')); } })); };
  assert.equal((await proxyBackendRequest(new Request('http://localhost:3001/api/destinations/dalat/refresh-from-sheet', { method: 'POST' }))).status, 502);
  assert.equal(calls, 1);
  const bundle = await build({ entryPoints: [new URL('../lib/sheetSyncDiagnostic.js', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1')], bundle: true, write: false, platform: 'node', format: 'esm' });
  const { diagnoseUnconfirmedSheetSync } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  for (const ready of [true, false]) {
    const paths = [];
    globalThis.fetch = async (url, options) => { paths.push(url); assert.notEqual(options?.method, 'POST'); return Response.json(url.includes('health') ? { status: 'ok' } : { ready }); };
    const message = await diagnoseUnconfirmedSheetSync();
    assert.match(message, /Backend vẫn phản hồi/);
    assert.match(message, /Chưa xác nhận đồng bộ hoàn tất/);
    assert.equal(paths.length, 2);
  }
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.match(await diagnoseUnconfirmedSheetSync(), /Chưa kiểm tra được backend/);
  const route = fs.readFileSync(new URL('../app/api/[...path]/route.js', import.meta.url), 'utf8');
  assert.match(route, /isPrefetch \|\| isSheetSync/);
  console.log('PASS sync timeout/network/body failure: one POST only; read-only diagnostics never claim sync success.');
} finally { globalThis.fetch = originalFetch; }
