import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { build } = require('esbuild');
const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Area from './components/InspectorScrollArea'; window.React=React; createRoot(document.getElementById('app')).render(<Area><div className="inspector-summary inspector-summary-text-only"><div className="inspector-copy">Lịch trình Note theo giờ</div></div><input aria-label="Giờ" defaultValue="07:00"/><div style={{height:1400}}>Kéo ở đây</div></Area>);`, resolveDir: process.cwd(), loader: 'jsx' }, loader: { '.js': 'jsx' }, bundle: true, write: false });
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
try {
  const page = await browser.newPage();
  const css = [...fs.readFileSync('app/globals.css','utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m => fs.readFileSync(path.join('app', m[1]),'utf8')).join('\n');
  await page.setContent(`<style>${css}</style><div class="workspace-grid" style="display:block;width:560px"><section class="inspector-shell"><div class="panel-head">Dữ liệu & ảnh</div><div id="app" style="display:contents"></div></section></div>`);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const area = page.locator('#pageInspector');
  await area.waitFor();
  assert.ok(await page.locator('.inspector-copy').evaluate(n => n.clientWidth > 400), 'Text-only header must span the panel');
  const box = await area.boundingBox();
  await page.mouse.move(box.x + 200, box.y + 240); await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 80, {steps:8}); await page.mouse.up();
  assert.ok(await area.evaluate(n => n.scrollTop) > 100, 'Mouse drag scrolls');
  await area.evaluate(n => { n.scrollTop=0; });
  await page.getByLabel('Giờ').fill('08:00');
  assert.equal(await page.getByLabel('Giờ').inputValue(), '08:00');
  assert.equal(await area.evaluate(n => n.scrollTop), 0);
  for (const width of [1920, 1366, 1024, 600]) {
    await page.setViewportSize({width, height:800});
    await area.evaluate(n => { n.scrollTop=0; });
    const rect = await area.boundingBox();
    await page.mouse.move(rect.x+100, rect.y+100);
    await page.mouse.wheel(0, 450);
    await page.waitForFunction(() => document.getElementById('pageInspector').scrollTop > 100);
    assert.equal(await area.evaluate(n => getComputedStyle(n).overflowY), 'auto');
    console.log(`PASS wheel scrolling with full application CSS at ${width}px`);
  }
  await page.getByLabel('Giờ').evaluate(n => { n.parentElement.classList.add('inspector-page-editor'); });
  assert.equal(await page.getByLabel('Giờ').evaluate(n => getComputedStyle(n).backgroundColor), 'rgb(20, 23, 21)');
  console.log('PASS inspector: full-width header, drag, wheel, input editing and dark input background');
} finally { await browser.close(); }
