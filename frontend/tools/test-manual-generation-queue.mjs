import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const result = await build({ entryPoints: ['lib/manualGenerationQueue.js'], bundle: true, write: false, format: 'cjs', platform: 'node', plugins: [{ name: 'mock-api', setup(b) {
  b.onResolve({ filter: /apiClient$/ }, () => ({ path: 'mock', namespace: 'mock' }));
  b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const apiFetch = (...args) => globalThis.__queueFetch(...args);' }));
} }] });
const mod = { exports: {} };
new Function('exports', 'module', result.outputFiles[0].text)(mod.exports, mod);
const queuedGeneration = mod.exports.queuedGeneration;
const oldTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn) => oldTimeout(fn, 0);
try {
  const calls = [];
  let polls = 0;
  globalThis.__queueFetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(options.method === 'POST' ? { id: 'one', status: 'queued' } : ++polls === 1 ? { id: 'one', status: 'running' } : { id: 'one', status: 'completed', result: { successCount: 3 } }));
  };
  const states = [];
  const response = await queuedGeneration('batch', { deckId: 'summary-note', count: 3 }, 'dalat', { mode: 'normal' }, job => states.push(job.status));
  assert.equal((await response.json()).successCount, 3);
  assert.deepEqual(states, ['queued', 'running', 'completed']);
  assert.equal(calls.filter(c => c.options.method === 'POST').length, 1);
  assert.equal(JSON.parse(calls[0].options.body).destinationId, 'dalat');
  globalThis.__queueFetch = async () => new Response(JSON.stringify({ id: 'two', status: 'cancelled' }));
  await assert.rejects(queuedGeneration('batch', {}, 'dalat', {mode:'normal'}, () => {}), /Đã hủy/);
  console.log('PASS queue client: status transitions, snapshot submission, no resubmit, cancelled request');
} finally { globalThis.setTimeout = oldTimeout; delete globalThis.__queueFetch; }
