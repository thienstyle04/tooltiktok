import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { build } = require('esbuild');

const bundle = await build({
  stdin: {
    contents: `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import SettingsPanel from './components/SettingsPanel';
      window.calls = [];
      function App() {
        const [hasLocal, setHasLocal] = useState(false);
        window.setHasLocal = setHasLocal;
        return <SettingsPanel
          activeDestinationId="dalat"
          destinations={[
            { id: 'dalat', label: 'Đà Lạt', hasLocalWorkbook: true, hasSheetFallback: true },
            { id: 'greenland', label: 'Green Land', hasLocalWorkbook: hasLocal, hasSheetFallback: true },
          ]}
          cacheStatus={{ ready: true }}
          onDestinationChange={id => window.calls.push('switch:' + id)}
          onRefreshFromSheet={async id => window.calls.push('sync:' + id)}
        />;
      }
      createRoot(document.getElementById('app')).render(<App />);
    `,
    resolveDir: process.cwd(),
    loader: 'jsx',
  },
  loader: { '.js': 'jsx' },
  jsx: 'automatic',
  bundle: true,
  write: false,
});

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
try {
  const page = await browser.newPage();
  page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
  await page.route('**/api/**', route => route.fulfill({ json: { sources: [], active: 'deepseek', profiles: { deepseek: { model: 'deepseek-chat' } } } }));
  await page.setContent('<div id="app"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.locator('.settings-destination-list').waitFor();
  const greenland = page.getByRole('option', { name: /Green Land/ });
  await greenland.getByText('Tải dữ liệu & chuyển').click();
  await page.waitForFunction(() => window.calls.length === 1);
  assert.deepEqual(await page.evaluate(() => window.calls), ['sync:greenland']);
  await page.evaluate(() => window.setHasLocal(true));
  await greenland.getByText('Chuyển', { exact: true }).click();
  await page.waitForFunction(() => window.calls.length === 2);
  assert.deepEqual(await page.evaluate(() => window.calls), ['sync:greenland', 'switch:greenland']);
  console.log('PASS fresh Green Land action syncs explicitly; initialized source switches locally.');
} finally {
  await browser.close();
}
