// Runs only reviewed, isolated fixtures. Never constructs the production service.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'outputs', 'studio-audit-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(output, { recursive: true });
function fingerprint(dir) {
  const result = {};
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(result, fingerprint(file));
    else if (entry.isFile()) result[file] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
  return result;
}
const before = fingerprint(path.join(root, 'backend/data'));
fs.writeFileSync(path.join(output, 'data-before.json'), JSON.stringify(before, null, 2));
const tests = ['test-local-image-validation', 'test-generation-cache-filter', 'test-night-sync',
  'test-new-machine-sync', 'test-green-hook-source', 'test-dark-hook-source',
  'test-v4-batch-diagnostics', 'test-spotlight-v4', 'test-spotlight-v6-maps', 'test-spotlight-diary',
  'test-partial-export-report', 'test-generation-waits-for-sync', 'test-spotlight-hook-network-policy',
  'test-themed-hook-sync', 'test-manual-generation-queue', 'test-manual-queue-scheduled-lifecycle',
  'test-inherit-page-typography', 'test-sync-generation-gate', 'test-automation-history-delete',
  'test-all-decks-cold-cache-structure'];
const results = [];
for (const name of tests) {
  const start = Date.now();
  const run = spawnSync(process.execPath, ['node_modules/ts-node/dist/bin.js', 'src/modules/guide/tools/' + name + '.ts'],
    { cwd: path.join(root, 'backend'), encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  fs.writeFileSync(path.join(output, name + '.log'), (run.stdout || '') + (run.stderr || '') + (run.error?.message || ''));
  const result = { name, status: run.status === 0 ? 'PASS' : 'FAIL', exitCode: run.status, milliseconds: Date.now() - start };
  results.push(result);
  console.log(JSON.stringify(result));
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
}
const after = fingerprint(path.join(root, 'backend/data'));
const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key => before[key] !== after[key]);
fs.writeFileSync(path.join(output, 'data-after.json'), JSON.stringify(after, null, 2));
fs.writeFileSync(path.join(output, 'data-changes.json'), JSON.stringify(changed, null, 2));
console.log('User data changed:', changed.length, 'Evidence:', output);
process.exitCode = changed.length || results.some(r => r.status !== 'PASS') ? 1 : 0;
