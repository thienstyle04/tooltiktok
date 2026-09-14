import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const puppeteer = require('../../backend/node_modules/puppeteer-core');
const backendOrigin = 'http://127.0.0.1:3000';
const frontendOrigin = 'http://127.0.0.1:3001';

function browserPath() {
  const local = process.env.LOCALAPPDATA || '';
  return [
    process.env.CHROME_PATH,
    path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].find((entry) => entry && fs.existsSync(entry));
}

async function automationState() {
  const response = await fetch(`${backendOrigin}/api/automation`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`/api/automation HTTP ${response.status}`);
  return response.json();
}

const healthResponse = await fetch(`${backendOrigin}/api/health`, { cache: 'no-store' });
const health = await healthResponse.json();
const executablePath = browserPath();
if (!executablePath) throw new Error('Không tìm thấy Chrome/Edge để chạy test.');
const before = await automationState();
const beforeIds = new Set(before.schedules.map((entry) => entry.id));
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
let createdIds = [];
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    if (request.url().includes('/api/automation/choose-output-directory')) {
      await request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ directory: 'D:\\test', fileName: 'scheduler-regression.zip', path: 'D:\\test\\scheduler-regression.zip' }),
      });
      return;
    }
    await request.continue();
  });
  await page.goto(`${frontendOrigin}/?runtimeSession=${encodeURIComponent(health.sessionId)}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.localStorage.removeItem('dalat-carousel:automation-schedule-draft:v2'));
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('Hẹn giờ')), { timeout: 30_000 });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Hẹn giờ'))?.click());
  await page.waitForSelector('.automation-panel', { timeout: 30_000 });
  await page.click('.automation-output button');
  try {
    await page.waitForFunction(() => document.querySelector('.automation-output output')?.textContent?.includes('scheduler-regression.zip'), { timeout: 10_000 });
  } catch (error) {
    const pickerState = await page.evaluate(() => ({
      button: document.querySelector('.automation-output button')?.outerHTML,
      output: document.querySelector('.automation-output output')?.textContent,
      message: document.querySelector('.automation-form-actions span')?.textContent,
    }));
    throw new Error(`Hộp thoại giả lập không cập nhật form: ${JSON.stringify(pickerState)}; ${error.message}`);
  }
  await page.type('.automation-form input[placeholder^="Ví dụ"]', `Kiểm thử lịch 1 ${Date.now()}`);
  await page.evaluate(() => {
    for (const name of ['Spotlight V6', 'Spotlight V5']) {
      const label = [...document.querySelectorAll('.automation-template-grid label')]
        .find((entry) => entry.textContent?.includes(name));
      label?.querySelector('input[type="checkbox"]')?.click();
    }
  });
  const firstSelection = await page.evaluate(() => ({
    selectedTemplates: document.querySelectorAll('.automation-template-grid label.selected').length,
    counts: [...document.querySelectorAll('.automation-template-grid label.selected input[type="number"]')].map((input) => Number(input.value)),
    summary: document.querySelector('.automation-template-title > span')?.textContent || '',
  }));
  if (firstSelection.selectedTemplates !== 2 || firstSelection.counts.some((count) => count !== 3) || !firstSelection.summary.includes('6 list tổng')) {
    throw new Error(`Giới hạn 3–5 theo từng mẫu chưa đúng: ${JSON.stringify(firstSelection)}`);
  }
  await page.click('.automation-form-actions button[type="submit"]');
  await page.waitForFunction(() => document.querySelector('.automation-form-actions span')?.textContent?.includes('Đã tạo lịch'), { timeout: 30_000 });
  const retained = await page.evaluate(() => ({
    output: document.querySelector('.automation-output output')?.textContent || '',
    selectedTemplates: document.querySelectorAll('.automation-template-grid label.selected').length,
    submitDisabled: document.querySelector('.automation-form-actions button[type="submit"]')?.disabled,
  }));
  if (!retained.output.includes('scheduler-regression.zip') || retained.selectedTemplates !== 0 || !retained.submitDisabled) {
    throw new Error(`Form sau lịch đầu không được đặt lại đúng: ${JSON.stringify(retained)}`);
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('Hẹn giờ')), { timeout: 30_000 });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Hẹn giờ'))?.click());
  await page.waitForSelector('.automation-panel', { timeout: 30_000 });
  const restored = await page.evaluate(() => ({
    output: document.querySelector('.automation-output output')?.textContent || '',
    selectedTemplates: document.querySelectorAll('.automation-template-grid label.selected').length,
  }));
  if (!restored.output.includes('scheduler-regression.zip') || restored.selectedTemplates !== 0) {
    throw new Error(`Nơi lưu ZIP không được khôi phục sau reload: ${JSON.stringify(restored)}`);
  }
  await page.type('.automation-form input[placeholder^="Ví dụ"]', `Kiểm thử lịch 2 ${Date.now()}`);
  await page.evaluate(() => {
    const label = [...document.querySelectorAll('.automation-template-grid label')]
      .find((entry) => entry.textContent?.includes('Spotlight V6'));
    label?.querySelector('input[type="checkbox"]')?.click();
  });
  const secondSubmitDisabled = await page.$eval('.automation-form-actions button[type="submit"]', (button) => button.disabled);
  if (secondSubmitDisabled) throw new Error('Nút Tạo lịch vẫn bị khóa sau khi chọn mẫu cho lịch thứ hai.');
  await page.click('.automation-form-actions button[type="submit"]');
  await page.waitForFunction(async (expectedCount) => {
    const response = await fetch('/api/automation', { cache: 'no-store' });
    const payload = await response.json();
    return Array.isArray(payload.schedules) && payload.schedules.length >= expectedCount;
  }, { timeout: 30_000 }, before.schedules.length + 2);
  const after = await automationState();
  createdIds = after.schedules.filter((entry) => !beforeIds.has(entry.id)).map((entry) => entry.id);
  if (createdIds.length !== 2) throw new Error(`Mong đợi 2 lịch mới, thực tế ${createdIds.length}.`);
  const firstCreated = after.schedules.find((entry) => createdIds.includes(entry.id));
  if (!firstCreated || firstCreated.templates.reduce((sum, entry) => sum + entry.count, 0) !== 6) {
    throw new Error('Backend chưa lưu được lịch có tổng trên 5 khi mỗi mẫu vẫn nằm trong khoảng 3–5.');
  }
  console.log(`PASS Hẹn giờ: mỗi mẫu 3–5 list, tổng vượt 5; nơi lưu ZIP tồn tại sau reload; tạo liên tiếp 2 lịch không bị treo.`);
} finally {
  await browser.close();
  const after = await automationState().catch(() => ({ schedules: [] }));
  createdIds = after.schedules.filter((entry) => !beforeIds.has(entry.id)).map((entry) => entry.id);
  for (const id of createdIds) {
    await fetch(`${backendOrigin}/api/automation/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => undefined);
  }
}
