import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const output = 'outputs/studio-audit-runtime/ui-evidence';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: `${process.env['PROGRAMFILES(X86)']}/Microsoft/Edge/Application/msedge.exe` });
const results = [], errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3211/');
  await page.getByRole('button', { name: '3 · Chỉnh sửa', exact: true }).click({ timeout: 60000 });
  await page.locator('.studio-selected-preview article').waitFor({ timeout: 60000 });
  for (const theme of ['dark', 'light']) {
    if (await page.locator('main.studio-workflow').getAttribute('data-studio-theme') !== theme) await page.locator('.studio-theme-toggle').click();
    for (const [width, height] of [[600,800],[1024,768],[1366,768],[1920,1080],[2560,1440],[3840,2160]]) {
      await page.setViewportSize({ width, height });
      if (width < 1024) await page.getByRole('button', { name: 'Chỉnh sửa nội dung', exact: true }).click();
      await page.waitForTimeout(250);
      const state = await page.evaluate(() => {
        const control = document.querySelector('.font-size-value input');
        const save = [...document.querySelectorAll('.right-panel button')].find(n => n.textContent.includes('Lưu thay đổi'));
        const rect = save?.getBoundingClientRect();
        return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, fontSize: control?.value, saveWithinHorizontalBounds: !!rect && rect.left >= 0 && rect.right <= innerWidth, hiddenFocus: [...document.querySelectorAll('.studio-editor-preview button')].some(n => n === document.activeElement && getComputedStyle(n).visibility === 'hidden') };
      });
      results.push({ theme, width, height, ...state });
      assert.ok(state.scrollWidth <= width + 1, JSON.stringify(results.at(-1)));
      assert.ok(Number(state.fontSize) > 0, 'Font size must remain measured');
      assert.ok(state.saveWithinHorizontalBounds, 'Save must remain inside window horizontally');
      assert.equal(state.hiddenFocus, false);
      if ([600,1366,1920].includes(width)) {
        await page.waitForFunction(() => [...document.querySelectorAll('.studio-selected-preview img')].every(img => img.complete && img.naturalWidth > 0), { timeout: 30000 });
        await page.screenshot({ path: `${output}/${theme}-${width}.png` });
      }
    }
  }
  for (const view of ['List đã tạo', 'Hẹn giờ', 'Dữ liệu & Cài đặt']) {
    await page.locator('.sidebar-menu-item').filter({ hasText: view }).click();
    for (const theme of ['dark', 'light']) {
      if (await page.locator('main.studio-workflow').getAttribute('data-studio-theme') !== theme) await page.locator('.studio-theme-toggle').click();
      for (const [width, height] of [[600,800],[1024,768],[1366,768],[1920,1080],[2560,1440],[3840,2160]]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(150);
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        results.push({ view, theme, width, height, scrollWidth });
        assert.ok(scrollWidth <= width + 1, JSON.stringify(results.at(-1)));
      }
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS 48 viewport/theme/view combinations; editor font measurement and save bounds');
} finally {
  fs.writeFileSync(`${output}/layout-results.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
