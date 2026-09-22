import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const origin = 'http://127.0.0.1:3211';
const health = await (await fetch(origin + '/api/health')).json();
assert.equal(health.sessionId, 'studio-audit-isolated');
const before = await (await fetch(origin + '/api/guide-data')).json();
const deck = before.decks.find(d => d.id === 'itinerary-3n2d');
const list = deck.lists.find(l => l.id.endsWith('-main')) || deck.lists[0];
const originalSize = list.pages[0].textFontSize;
const browser = await chromium.launch({ headless: true, executablePath: `${process.env['PROGRAMFILES(X86)']}/Microsoft/Edge/Application/msedge.exe` });
const evidence = { originalSize: originalSize ?? null, destinationId: before.source.destinationId, checks: [] };
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 800 } });
  const openEditor = async () => {
    await page.goto(origin);
    await page.getByRole('button', { name: '3 · Chỉnh sửa', exact: true }).click({ timeout: 60000 });
    await page.locator('.studio-page-picker select').nth(0).selectOption(deck.id);
    await page.locator('.studio-page-picker select').nth(1).selectOption(list.id);
    await page.locator('.studio-page-picker-list button').first().click();
    await page.getByRole('button', { name: 'Chỉnh sửa nội dung', exact: true }).click();
  };
  await openEditor();
  const input = page.locator('.font-size-value input');
  const save = page.getByRole('button', { name: 'Lưu thay đổi', exact: true });
  await input.fill('9');
  const saved = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().includes('/pages/0/text'));
  await save.click();
  const response = await saved;
  assert.equal(response.status(), 200);
  assert.equal(response.request().postDataJSON().textFontSize, 9, 'Save click must commit the latest input without Enter');
  assert.equal((await response.json()).textFontSize, 9);
  evidence.checks.push('9px blur/save payload and response');
  await openEditor();
  assert.equal(await input.inputValue(), '9');
  evidence.checks.push('9px survives page reload');
  await page.route('**/api/decks/*/lists/*/pages/0/text', route => route.fulfill({ status: 500, json: { message: 'AUDIT simulated save failure' } }), { times: 1 });
  await input.fill('10'); await save.click();
  await page.getByText('Lưu thất bại — bản nháp vẫn còn', { exact: true }).waitFor();
  assert.equal(await input.inputValue(), '10');
  evidence.checks.push('Failed save retains draft and displays failure');
  if (originalSize == null) await page.getByRole('button', { name: 'Theo mẫu', exact: true }).click();
  else await input.fill(String(originalSize));
  const restored = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().includes('/pages/0/text'));
  await save.click(); assert.equal((await restored).status(), 200);
  evidence.checks.push('Original font setting restored in isolated copy');
  console.log('PASS actual UI font 9px: save without Enter, reload, failed save preserves draft');
} finally {
  await fetch(`${origin}/api/decks/${deck.id}/lists/${list.id}/pages/0/text`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: list.pages[0].title || '', subtitle: list.pages[0].subtitle || '', textScale: list.pages[0].textScale ?? 100, textFontSize: originalSize ?? null }),
  });
  fs.writeFileSync('outputs/studio-audit-runtime/ui-evidence/font-save-results.json', JSON.stringify(evidence, null, 2));
  await browser.close();
}
