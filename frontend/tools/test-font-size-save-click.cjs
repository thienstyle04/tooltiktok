// Regression: a blur-driven typography update must not move Save under the
// pointer between mouse-down and mouse-up. No server/user data/private assets.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const front = path.resolve(__dirname, '..');
const esbuild = require(path.join(front, '../backend/node_modules/esbuild'));
const { chromium } = require('playwright');
async function main() {
  const source = `import React from 'react';import{createRoot}from'react-dom/client';import FontSizeControl from './components/FontSizeControl';
    function App(){const[value,setValue]=React.useState(null),ref=React.useRef(null);window.saved||=[];
      const change=v=>{ref.current=v;setValue(v)};
      return <aside className="right-panel" style={{width:300,padding:20}}><FontSizeControl value={value} actualSizes={value==null?[52,64]:[value]} onChange={change} onReset={()=>change(null)}/><button id="save" onClick={()=>window.saved.push(ref.current)}>Lưu thay đổi</button></aside>;
    }createRoot(document.getElementById('root')).render(<App/>);`;
  const bundle = await esbuild.build({ stdin: { contents: source, resolveDir: front, loader: 'jsx' }, bundle: true, write: false, format: 'iife', loader: { '.js': 'jsx' }, jsx: 'automatic' });
  const css = [...fs.readFileSync(path.join(front, 'app/globals.css'), 'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m => fs.readFileSync(path.join(front, 'app', m[1]), 'utf8')).join('\n');
  const executablePath = [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    for (const width of [390, 1280, 1920]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.setContent('<style>' + css + '</style><div id="root"></div>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const input = page.locator('.font-size-value input'), save = page.locator('#save');
      const before = await save.boundingBox();
      await input.fill('45'); await save.click();
      assert.deepEqual(await page.evaluate(() => window.saved), [45], 'First click must commit and save 45px without Enter');
      const after = await save.boundingBox(); assert.ok(Math.abs(after.y - before.y) < 1, 'Save must not shift on blur');
      await input.fill('44.5'); await save.click(); assert.deepEqual(await page.evaluate(() => window.saved), [45,44.5]);
      await page.getByRole('button', { name: 'Theo mẫu', exact: true }).click();
      const reset = await save.boundingBox(); assert.ok(Math.abs(reset.y - before.y) < 1, 'Reset must not shift Save');
      await input.fill('46'); await save.click(); assert.deepEqual(await page.evaluate(() => window.saved), [45,44.5,46]);
      await page.close(); console.log('PASS font blur/save first click, decimals, reset, stable button:', width);
    }
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
