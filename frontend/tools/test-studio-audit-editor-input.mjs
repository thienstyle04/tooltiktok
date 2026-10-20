import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true, executablePath: `${process.env['PROGRAMFILES(X86)']}/Microsoft/Edge/Application/msedge.exe` });
const evidence = {};
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto('http://127.0.0.1:3211/');
  // V2: mở list chính (mẫu mẹ) của một mẫu trong màn Duyệt & Xuất.
  const openMainList = async deckId => {
    await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('button', { name: /^Duyệt & Xuất/ }).click({ timeout: 60000 });
    await page.getByRole('group', { name: 'Lọc trạng thái' }).getByRole('button', { name: /^Mẫu mẹ/ }).click();
    await page.locator(`.v2-queue-item[data-deck-id="${deckId}"] > button`).first().click();
    await page.locator('.v2-canvas article').waitFor({ timeout: 60000 });
  };
  await openMainList('itinerary-4n3d');
  await page.locator('.v2-filmstrip button').nth(1).click();
  const field = page.locator('.right-panel textarea').first();
  await field.scrollIntoViewIfNeeded();
  const positions = () => field.evaluate(node => {
    const result = []; for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (parent.scrollHeight > parent.clientHeight + 1) result.push({ className: parent.className, top: parent.scrollTop });
    } return result;
  });
  const before = await positions();
  await field.hover(); await page.mouse.wheel(0, 420); await page.waitForTimeout(250);
  const after = await positions();
  assert.ok(after.some((entry, i) => entry.top > (before[i]?.top || 0)), 'Wheel over textarea must scroll a containing panel');
  evidence.wheel = { before, after };
  const input = page.locator('.font-size-value input');
  await input.scrollIntoViewIfNeeded();
  const size = await input.inputValue();
  await input.fill('9'); await input.press('Escape');
  assert.equal(await input.inputValue(), size);
  evidence.escapeRestoresDraft = true;
  await input.fill('9'); await input.press('Enter');
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('button', { name: /^Hôm nay/ }).click();
  const warning = page.getByRole('alertdialog');
  evidence.unsavedWarning = await warning.innerText();
  await warning.getByRole('button', { name: 'Ở lại chỉnh sửa', exact: true }).click();
  await warning.waitFor({ state: 'detached' });
  assert.ok(await page.locator('.font-size-value input').isVisible(), 'Rejecting navigation keeps the editor');
  await input.focus(); await page.keyboard.press('Tab');
  evidence.tabTarget = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  assert.equal(evidence.tabTarget, 'Tăng cỡ chữ 0,5 px');
  await page.keyboard.press('Shift+Tab'); assert.ok(await input.evaluate(n => n === document.activeElement));
  console.log('PASS editor input: wheel over textarea, Escape draft reset, unsaved navigation warning, Tab/Shift+Tab');
} finally { fs.writeFileSync('outputs/studio-audit-runtime/ui-evidence/editor-input-results.json', JSON.stringify(evidence, null, 2)); await browser.close(); }
