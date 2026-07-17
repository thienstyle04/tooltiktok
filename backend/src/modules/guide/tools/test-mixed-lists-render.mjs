/**
 * Test render hỗn hợp: gom 1 list từ mỗi mẫu, render toàn bộ trang (giống export batch).
 * cd backend && node src/modules/guide/tools/test-mixed-lists-render.mjs
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../../../../../');
const markupPath = join(rootDir, 'frontend/lib/pageMarkup.js');
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const { pathToFileURL } = await import('node:url');

const API = process.env.GUIDE_API_BASE || 'http://127.0.0.1:3000';

async function buildMarkupRenderer() {
  const tmp = join(__dirname, '__mixed-markup.mjs');
  await esbuild.build({
    entryPoints: [markupPath],
    outfile: tmp,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });
  return import(pathToFileURL(tmp).href);
}

function getMainList(deck) {
  return (deck?.lists || []).find((l) => /-main$/i.test(String(l?.id || ''))) || deck?.lists?.[0];
}

function pageIssues(page, list, deckId) {
  const issues = [];
  if (page.layoutVariant === 'budget-3n2d-table') {
    for (const item of page.items || []) {
      if (!/^check-in:/i.test(String(item.name || ''))) continue;
      const cost = String(item.metaSecondary || '').trim();
      if (/~?\s*20\s*k/i.test(cost)) issues.push(`${deckId}/${list.id}: ${item.name} → ${cost}`);
    }
  }
  if (page.layoutVariant === 'budget-3n2d-gallery' || page.layoutVariant === 'grid-4') {
    const urls = (page.items || []).map((i) => i.imageUrl).filter(Boolean);
    const seen = new Set();
    for (const url of urls) {
      if (seen.has(url)) issues.push(`${deckId}/${list.id} trang "${page.chipText}": ảnh trùng`);
      seen.add(url);
    }
  }
  return issues;
}

async function main() {
  console.log('=== Test render hỗn hợp (1 list/mẫu) ===\n');
  const res = await fetch(`${API}/api/guide-data?refresh=1`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const dataset = await res.json();
  const markup = await buildMarkupRenderer();
  const { renderCoverPage, renderListPage } = markup;

  let pages = 0;
  let failed = 0;
  const issues = [];

  for (const deck of dataset.decks || []) {
    const list = getMainList(deck);
    if (!list?.pages?.length) {
      console.log(`⚠ ${deck.id}: không có list`);
      failed += 1;
      continue;
    }
    let deckOk = true;
    for (const [idx, page] of list.pages.entries()) {
      pages += 1;
      issues.push(...pageIssues(page, list, deck.id));
      try {
        const html = page.type === 'cover'
          ? renderCoverPage(page, idx, list.pages.length, list.id, list.captionHashtags || [], list, page.coverImages || [])
          : renderListPage(page, idx, list.pages.length, list.id, list.captionHashtags || [], list);
        if (!html || !String(html).trim()) {
          issues.push(`${deck.id}: trang ${idx} HTML rỗng`);
          deckOk = false;
        }
      } catch (e) {
        issues.push(`${deck.id}: trang ${idx} render lỗi — ${e.message}`);
        deckOk = false;
      }
    }
    console.log(`${deckOk && !issues.some((i) => i.startsWith(deck.id)) ? '✅' : '❌'} ${deck.id} (${list.pages.length} trang)`);
    if (!deckOk) failed += 1;
  }

  const uniqueIssues = [...new Set(issues)];
  if (uniqueIssues.length) {
    console.log('\nChi tiết:');
    uniqueIssues.slice(0, 20).forEach((i) => console.log('  -', i));
    if (uniqueIssues.length > 20) console.log(`  ... +${uniqueIssues.length - 20} lỗi`);
    failed += 1;
  }

  console.log(`\nTổng: ${dataset.decks?.length || 0} mẫu | ${pages} trang render`);
  console.log(failed ? '❌ FAIL' : '✅ PASS — hỗn hợp OK');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
