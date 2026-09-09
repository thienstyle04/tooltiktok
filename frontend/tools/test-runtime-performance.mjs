import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), { chromium } = require('playwright'), esbuild = require('esbuild');
const root = path.resolve(import.meta.dirname, '..');
const bundle = await esbuild.build({ stdin: { contents: "export * from './lib/runtimePerformance.js';", resolveDir: root }, bundle: true, platform: 'browser', format: 'iife', globalName: 'RuntimeTest', write: false });
const executablePath = [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  for (const scenario of ['success', 'hidden', 'hidden-during', 'unsupported', 'busy']) {
    const page = await browser.newPage();
    let reports = [];
    let mode = 'checking';
    await page.route('**/api/runtime-performance', route => route.fulfill({ json: { mode, busy: scenario === 'busy', reason: '', evaluatedAt: null } }));
    await page.route('**/api/runtime-performance/report', async route => {
      reports.push(route.request().postDataJSON());
      const report = reports.at(-1);
      mode = report.hidden || !report.success ? 'legacy' : 'modern';
      await route.fulfill({ json: { mode, reason: '', evaluatedAt: 'now' } });
    });
    await page.setContent('<html><head><base href="http://runtime-test.local/"></head><body></body></html>');
    if (scenario === 'hidden') await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }));
    if (scenario === 'unsupported') await page.evaluate(() => { window.createImageBitmap = undefined; });
    if (scenario === 'busy') await page.evaluate(() => { window.createImageBitmap = () => { throw new Error('Benchmark must not run while busy'); }; });
    if (scenario === 'hidden-during') await page.evaluate(() => {
      const decode = window.createImageBitmap.bind(window);
      window.createImageBitmap = async (...args) => {
        const bitmap = await decode(...args);
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
        return bitmap;
      };
    });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const result = await page.evaluate(() => RuntimeTest.ensureRuntimePerformanceForBalancedExport());
    assert.equal(result.mode, scenario === 'success' ? 'modern' : 'legacy');
    assert.equal(reports.length, 1);
    if (scenario === 'success') assert.ok(reports[0].elapsedMs > 0);
    if (scenario === 'hidden') assert.equal(reports[0].hidden, true);
    if (scenario === 'hidden-during') assert.equal(reports[0].hidden, true);
    if (scenario === 'busy') assert.equal(reports[0].failureKind, 'benchmark');
    if (scenario === 'unsupported') assert.equal(reports[0].failureKind, 'unsupported');
    mode = 'legacy';
    assert.equal((await page.evaluate(() => RuntimeTest.ensureRuntimePerformanceForBalancedExport())).mode, 'legacy', 'Must observe another tab downgrade');
    assert.equal(reports.length, 1, 'Must not benchmark an already assessed backend');
    await page.close();
  }
  console.log('PASS browser runtime benchmark: success, hidden before/during, unsupported, busy and fresh shared status.');
} finally { await browser.close(); }
