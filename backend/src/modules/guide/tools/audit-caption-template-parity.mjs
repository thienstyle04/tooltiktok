/**
 * Audit: list AI caption có render giống list chính không?
 * Kiểm tra title-font, meta/giá/label, class markup.
 */
import { writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../../../../../');
const markupPath = join(rootDir, 'frontend/lib/pageMarkup.js');

const FOOD_PAGE_CHIPS = ['Quán ăn', 'Cà phê', 'Check-in'];

async function loadMarkup() {
  const result = await esbuild.build({
    entryPoints: [markupPath],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  const tmp = join(__dirname, '.tmp-audit-markup.mjs');
  writeFileSync(tmp, result.outputFiles[0].text);
  const mod = await import(pathToFileURL(tmp).href);
  unlinkSync(tmp);
  return mod;
}

function titleFontFromHtml(html) {
  return html.match(/\btitle-font-(\d+)\b/)?.[1] || '';
}

function pickContentPage(list) {
  const pages = (list?.pages || []).filter((p) => p.type === 'list');
  for (const chip of FOOD_PAGE_CHIPS) {
    const hit = pages.find((p) => p.chipText === chip);
    if (hit?.items?.length) return { page: hit, label: chip };
  }
  return pages[0] ? { page: pages[0], label: pages[0].chipText || 'first-list' } : null;
}

function analyzeHtml(html, deckId) {
  const issues = [];
  const titleFont = titleFontFromHtml(html);

  if (/Khung giờ:/i.test(html) && /zigzag-price[^>]*>[^<]*Khung giờ:/i.test(html)) {
    issues.push({ code: 'zigzag-price-khung-gio', severity: 'high' });
  }

  if (/grid8-feed-meta[^>]*>[^<]*Khung giờ:/i.test(html)) {
    issues.push({ code: 'grid8-feed-meta-khung-gio', severity: 'medium' });
  }

  if (/story-image-title/.test(html)) {
    const risky = [];
    if (/zigzag-name story-image-title/.test(html)) risky.push('zigzag-name');
    if (/grid4-mutant-name story-image-title/.test(html)) risky.push('grid4-mutant-name');
    if (risky.length) issues.push({ code: 'story-image-title-override', classes: risky, severity: 'low' });
  }

  if (deckId === 'grid-6-zigzag' && /zigzag-price[^>]*>[^<]*Ăn /i.test(html)) {
    issues.push({ code: 'zigzag-price-meal-label', severity: 'high' });
  }

  // Quán ăn zigzag: expect labels not empty price badges with giá text only
  if (deckId === 'grid-6-zigzag') {
    const foodLabels = (html.match(/zigzag-label/g) || []).length;
    const foodPrices = (html.match(/zigzag-price/g) || []).length;
    if (foodPrices > 0 && foodLabels === 0) {
      issues.push({ code: 'zigzag-food-missing-labels', severity: 'high' });
    }
  }

  return { titleFont, issues, htmlLen: html.length };
}

function simulateCaptionList(mainList, deckId) {
  return {
    ...mainList,
    id: `${deckId}-caption-01-audit`,
    navTitle: 'AI 01',
    title: 'AUDIT CAPTION LIST',
  };
}

async function main() {
  let data;
  try {
    data = await fetch(process.env.TEST_API_URL || 'http://127.0.0.1:3000/api/guide-data').then((r) => r.json());
  } catch (error) {
    console.error('API offline:', error.message);
    process.exit(2);
  }

  const markup = await loadMarkup();
  const rows = [];
  let failCount = 0;

  for (const deck of data.decks || []) {
    const mainList = (deck.lists || []).find((l) => String(l.id || '').endsWith('-main'))
      || deck.lists?.[0];
    if (!mainList) continue;

    const picked = pickContentPage(mainList);
    if (!picked) continue;

    const { page, label } = picked;
    const pageIndex = mainList.pages.indexOf(page);
    const captionList = simulateCaptionList(mainList, deck.id);

    const mainHtml = markup.renderListPage(page, pageIndex, mainList.pages.length, mainList.id, [], mainList);
    const capHtml = markup.renderListPage(page, pageIndex, captionList.pages.length, captionList.id, [], captionList);

    const main = analyzeHtml(mainHtml, deck.id);
    const cap = analyzeHtml(capHtml, deck.id);
    const rowIssues = [];

    if (main.titleFont !== cap.titleFont) {
      rowIssues.push({
        code: 'title-font-drift',
        severity: 'high',
        main: main.titleFont,
        caption: cap.titleFont,
      });
      failCount += 1;
    }

    for (const issue of [...main.issues, ...cap.issues]) {
      rowIssues.push(issue);
      if (issue.severity === 'high') failCount += 1;
    }

    rows.push({
      deckId: deck.id,
      page: label,
      layout: page.layoutVariant || page.type,
      mainFont: main.titleFont,
      captionFont: cap.titleFont,
      issues: rowIssues,
      ok: rowIssues.length === 0,
    });
  }

  console.log('=== Audit caption vs main (render HTML) ===\n');
  for (const row of rows) {
    const status = row.ok ? 'OK' : 'ISSUE';
    console.log(`[${status}] ${row.deckId} · ${row.page} (${row.layout})`);
    console.log(`       title-font: main=${row.mainFont} caption=${row.captionFont}`);
    for (const issue of row.issues) {
      console.log(`       - ${issue.code}${issue.main != null ? ` (main=${issue.main} cap=${issue.caption})` : ''}`);
    }
  }

  const bad = rows.filter((r) => !r.ok);
  console.log(`\nTổng: ${rows.length} mẫu, ${bad.length} có vấn đề, ${failCount} lỗi high-severity`);
  process.exit(bad.length > 0 ? 1 : 0);
}

main();
