/**
 * Kiểm tra thật (browser export) xem file partners-*.xlsx trong ZIP xuất ra của
 * budget-72h-summary có liệt kê đối tác không (bug: collectPartnerNames dùng
 * renderedMarkupIncludesImage nhưng dòng bảng chi phí không có imageUrl → luôn 0).
 *
 *   node backend/src/modules/guide/tools/test-budget72h-partners-xlsx-export.mjs
 */
import { chromium } from '../../../../../frontend/node_modules/playwright/index.mjs';
import JSZip from '../../../../../frontend/node_modules/jszip/dist/jszip.min.js';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'export-quality-test-output', 'budget72h-partners-xlsx');
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const FRONTEND = process.env.FRONTEND_URL || 'http://127.0.0.1:3001';
const DECK_ID = 'budget-72h-summary';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function generateBatch(deckId, count) {
  const response = await fetch(`${API}/api/decks/generate-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deckId, count }),
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) throw new Error(`generate-batch HTTP ${response.status}: ${(await response.text()).slice(0, 160)}`);
  return response.json();
}

async function deleteList(deckId, listId) {
  await fetch(`${API}/api/decks/${encodeURIComponent(deckId)}/lists/${encodeURIComponent(listId)}`, { method: 'DELETE' }).catch(() => null);
}

async function main() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  console.log('Tạo 1 list test budget-72h-summary...');
  const gen = await generateBatch(DECK_ID, 1);
  const created = (gen.lists || []).map((l) => l.listId || l.id).filter(Boolean);
  if (!created.length) throw new Error('Không tạo được list test.');
  console.log('  ->', created[0]);

  let zipPath = '';
  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 1100 });
    zipPath = join(OUT_DIR, 'budget-72h-summary-1.zip');
    const downloadPromise = page.waitForEvent('download', { timeout: 5 * 60 * 1000 }).then(async (d) => { await d.saveAs(zipPath); return zipPath; }).catch(() => null);

    const url = `${FRONTEND}/export-benchmark?autostart=1&mode=caption&lists=1&deck=${encodeURIComponent(DECK_ID)}`;
    console.log('Đang export qua browser thật:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__EXPORT_BENCHMARK__?.done === true, null, { timeout: 5 * 60 * 1000 });
    const bench = await page.evaluate(() => window.__EXPORT_BENCHMARK__);
    console.log('  benchmark result:', JSON.stringify(bench));
    const saved = await downloadPromise;
    await browser.close();

    if (!saved) throw new Error('Không nhận được file ZIP xuất ra.');

    const zip = await JSZip.loadAsync(readFileSync(saved));
    const xlsxEntries = Object.keys(zip.files).filter((name) => /partners-set.*\.xlsx$/i.test(name));
    console.log('\nFile partners-*.xlsx trong ZIP:', xlsxEntries);
    if (!xlsxEntries.length) throw new Error('Không thấy file partners-*.xlsx nào trong ZIP.');

    // Đọc thô nội dung sheet1.xml trong file xlsx (định dạng tối giản, inlineStr) để đếm số cell có chữ.
    let totalPartnerCells = 0;
    for (const entryName of xlsxEntries) {
      const xlsxBuf = await zip.files[entryName].async('nodebuffer');
      const innerZip = await JSZip.loadAsync(xlsxBuf);
      const sheetXml = await innerZip.file('xl/worksheets/sheet1.xml')?.async('string');
      const matches = sheetXml ? sheetXml.match(/<t>([^<]*)<\/t>/g) || [] : [];
      const names = matches.map((m) => m.replace(/<\/?t>/g, ''));
      console.log(`  ${entryName}: ${names.length} đối tác ->`, names);
      totalPartnerCells += names.length;
    }

    if (totalPartnerCells === 0) {
      console.error('\nFAIL: partners-*.xlsx vẫn 0 đối tác sau export thật qua browser.');
      process.exitCode = 1;
    } else {
      console.log(`\nPASS: partners-*.xlsx có ${totalPartnerCells} đối tác sau export thật.`);
    }
  } finally {
    console.log('\nXóa list test...');
    for (const id of created) await deleteList(DECK_ID, id);
  }
}

main().catch((error) => {
  console.error('ERROR:', error);
  process.exit(1);
});
