import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'lib/exportClient.js'), 'utf8');
const bundle = await esbuild.build({ stdin: { contents: source + '\nexport {runAdaptiveExport, isResourceExportError, exportQualityProfile};', resolveDir: path.join(root, 'lib') }, bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'AdaptiveTest' });
const executablePath = [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  const page = await browser.newPage();
  await page.setContent('<base href="http://localhost:3001/">');
  let reports = 0;
  let exportRoutesOk = true;
  await page.route('**/api/health', route => route.fulfill({ json: { status: 'ok', sessionId: 'adaptive-test', appVersion: '0.6.01' } }));
  await page.route('**/api/drive-cache/status', route => route.fulfill({ json: { ready: true, phase: 'ready' } }));
  await page.route('**/api/drive-files/cache-status', route => route.fulfill(exportRoutesOk
    ? { json: { total: 0, cached: 0, missing: [] } }
    : { status: 404, json: { message: 'route missing' } }));
  await page.route('**/api/drive-files/prefetch', route => route.fulfill({ json: { total: 0, skipped: 0, ok: 0, fail: 0 } }));
  await page.route('**/api/runtime-performance/report', route => { reports++; return route.fulfill({ json: { mode: 'legacy' } }); });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(async () => {
    const t = AdaptiveTest, events = [];
    let attempts = 0;
    const value = await t.runAdaptiveExport(async context => {
      attempts++;
      events.push(context._compatRetry ? 'legacy' : 'modern');
      try {
        if (!context._compatRetry) throw Object.assign(new Error('Canvas allocation failed'), { retryCompatibleExport: true });
        return 'complete';
      } finally { events.push('cleanup'); }
    }, {}, {});
    let failedAttempts = 0;
    try {
      await t.runAdaptiveExport(async () => {
        failedAttempts++;
        throw Object.assign(new Error('Canvas allocation failed'), { retryCompatibleExport: true });
      }, {}, {});
    } catch { /* The second failure must stop. */ }
    let active = 0, peak = 0;
    await Promise.all(Array.from({ length: 3 }, () => t.runAdaptiveExport(async () => {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 10)); active--;
    }, {}, {})));
    const network = ['Drive HTTP 403', 'HTTP 404', 'network failed', 'tràn chữ', 'thiếu dữ liệu'].map(message => t.isResourceExportError(new Error(message)));
    return { value, attempts, events, failedAttempts, peak, network, resource: t.isResourceExportError(new Error('Canvas allocation failed')) };
  });
  assert.equal(result.value, 'complete');
  assert.equal(result.attempts, 2);
  assert.deepEqual(result.events, ['modern', 'cleanup', 'legacy', 'cleanup']);
  assert.equal(result.failedAttempts, 2);
  assert.equal(result.peak, 1);
  assert.ok(result.network.every(value => value === false));
  assert.equal(result.resource, true);
  assert.equal(reports, 2);
  exportRoutesOk = false;
  const mismatch = await page.evaluate(async () => {
    let attempts = 0;
    const result = await AdaptiveTest.runAdaptiveExport(async () => { attempts++; }, {}, {});
    return { result, attempts };
  });
  assert.equal(mismatch.attempts, 0, 'a mismatched runtime must stop before render starts');
  assert.equal(mismatch.result.success, false);
  assert.match(mismatch.result.error, /không đồng bộ/i);
  console.log('PASS adaptive export: cleanup before retry, one retry only, serialized exports, resource/network classification.');
} finally { await browser.close(); }
