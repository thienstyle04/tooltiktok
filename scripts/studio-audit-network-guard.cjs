// Test-only preload. Never log credentials or request bodies.
const fs = require('node:fs');
const path = require('node:path');
const file = path.resolve(__dirname, '../outputs/studio-audit-runtime/network-evidence.json');
const evidence = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { aiRequests: 0, requests: [] };
const original = global.fetch;
global.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url || String(input));
  if (url.hostname === 'api.deepseek.com') {
    if (evidence.aiRequests >= 4) throw new Error('Audit AI budget exhausted');
    evidence.aiRequests++;
  }
  evidence.requests.push({ at: new Date().toISOString(), host: url.hostname, path: url.pathname });
  fs.writeFileSync(file, JSON.stringify(evidence, null, 2));
  return original(input, options);
};
