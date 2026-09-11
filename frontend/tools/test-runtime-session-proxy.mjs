import assert from 'node:assert/strict';

process.env.BACKEND_ORIGIN = 'http://stale-backend.test:3999';
process.env.NEXT_PUBLIC_BACKEND_ORIGIN = '';
process.env.NEXT_PUBLIC_DALAT_SESSION_ID = 'proxy-test-session';
process.env.NEXT_PUBLIC_DALAT_APP_VERSION = '0.6.01';

const { proxyBackendRequest } = await import('../lib/backendProxy.js');
const originalFetch = globalThis.fetch;
const calls = [];

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  calls.push(url.toString());
  if (url.hostname === 'stale-backend.test') {
    return Response.json({ message: 'old route missing' }, { status: 404 });
  }
  return Response.json({ ok: true, origin: url.origin }, { status: 200 });
};

try {
  const infrastructureChecks = [
    ['GET', '/api/health'],
    ['GET', '/api/drive-cache/status'],
    ['POST', '/api/drive-files/cache-status'],
    ['POST', '/api/drive-files/prefetch'],
    ['GET', '/assets/drive-file?fileId=test-file'],
  ];

  for (const [method, path] of infrastructureChecks) {
    calls.length = 0;
    const request = new Request(`http://localhost:3001${path}`, {
      method,
      headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: method === 'POST' ? JSON.stringify({ fileIds: [] }) : undefined,
    });
    const response = await proxyBackendRequest(request);
    assert.equal(response.status, 200, `${path} must retry the next backend origin after a 404`);
    assert.equal(calls.length, 2, `${path} must make exactly one fallback attempt`);
    assert.match(calls[0], /^http:\/\/stale-backend\.test:3999\//);
    assert.match(calls[1], /^http:\/\/localhost:3000\//);
    if (path === '/api/health') {
      assert.equal(response.headers.get('x-dalat-frontend-session'), 'proxy-test-session');
      assert.equal(response.headers.get('x-dalat-frontend-version'), '0.6.01');
    }
  }

  calls.length = 0;
  const business404 = await proxyBackendRequest(new Request('http://localhost:3001/api/decks/missing'));
  assert.equal(business404.status, 404, 'business route 404 must be preserved');
  assert.equal(calls.length, 1, 'business route 404 must not retry another backend');

  console.log('PASS runtime infrastructure proxy retries only safe 404 routes');
} finally {
  globalThis.fetch = originalFetch;
}
