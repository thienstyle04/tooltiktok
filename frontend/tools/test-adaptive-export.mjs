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
  console.log('PASS adaptive export: cleanup before retry, one retry only, serialized exports, resource/network classification.');
} finally { await browser.close(); }
