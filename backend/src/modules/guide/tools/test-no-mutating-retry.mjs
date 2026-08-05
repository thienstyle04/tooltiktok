/**
 * Guard: mutating API must not be retried by apiFetch / proxy origin loop.
 * Run: node frontend check via static read of source files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../');
const apiClient = fs.readFileSync(path.join(root, 'frontend/lib/apiClient.js'), 'utf8');
const proxy = fs.readFileSync(path.join(root, 'frontend/lib/backendProxy.js'), 'utf8');
const route = fs.readFileSync(path.join(root, 'frontend/app/api/[...path]/route.js'), 'utf8');

const checks = [
  {
    name: 'apiFetch skips fallback for mutating methods',
    ok: apiClient.includes('isIdempotentMethod(method)') && apiClient.includes('function isIdempotentMethod'),
  },
  {
    name: 'proxy uses single origin for mutating',
    ok: proxy.includes('isMutating') && proxy.includes('.slice(0, 1)'),
  },
  {
    name: 'long-running generate timeout >= 600s',
    ok: proxy.includes('600_000') && route.includes('maxDuration = 600'),
  },
];

const failed = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ ok: failed.length === 0, checks, failed: failed.map((c) => c.name) }, null, 2));
if (failed.length) process.exit(1);
