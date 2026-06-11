/**
 * Render 4 mẫu V2 thành 1 file HTML tĩnh để kiểm tra trực quan layout/font/ảnh.
 *
 * - Bundle frontend/lib/pageMarkup.js bằng esbuild (resolve ./utils).
 * - Fetch dữ liệu deck từ API đang chạy.
 * - Inline toàn bộ CSS trong frontend/app/styles.
 * - Prefix origin cho ảnh /assets/... để mở file:// vẫn tải được ảnh.
 *
 * Chạy: node backend/src/modules/guide/tools/preview-v2-decks.mjs
 *   API_ORIGIN=http://127.0.0.1:3000 node ...
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const rootDir = join(__dirname, '../../../../../');
const frontendLib = join(rootDir, 'frontend/lib/pageMarkup.js');
const stylesDir = join(rootDir, 'frontend/app/styles');
const outDir = join(__dirname, 'v2-preview-output');

const API_ORIGIN = process.env.API_ORIGIN || 'http://127.0.0.1:3000';
const API = `${API_ORIGIN}/api/guide-data?refresh=1`;
const ALL_V2_DECKS = ['grid-8-feed', 'grid-8-quaytung', 'spotlight-v2', 'pov-3-v2'];
// ONLY_DECK=pov-3-v2 để chỉ render 1 deck.
const V2_DECKS = process.env.ONLY_DECK ? [process.env.ONLY_DECK] : ALL_V2_DECKS;
// EXPORT_MODE=1 bọc mỗi trang trong .batch-export-root để áp CSS export-fix (giống html2canvas).
const EXPORT_MODE = process.env.EXPORT_MODE === '1';
const gridClass = EXPORT_MODE ? 'preview-grid batch-export-root' : 'preview-grid';

function getMainList(deck) {
  return (deck?.lists || []).find((list) => /-main$/i.test(String(list?.id || ''))) || deck?.lists?.[0];
}

function absolutizeImages(html) {
  return html
    .replace(/src="\/assets\//g, `src="${API_ORIGIN}/assets/`)
    .replace(/data-candidate-srcset="([^"]*)"/g, (match, value) => {
      const fixed = value.replace(/\/assets\//g, `${API_ORIGIN}/assets/`);
      return `data-candidate-srcset="${fixed}"`;
    });
}

async function buildMarkupModule() {
  const tmp = join(outDir, '__pageMarkup.bundle.mjs');
  await esbuild.build({
    entryPoints: [frontendLib],
    outfile: tmp,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });
  return pathToFileURL(tmp).href;
}

function loadAllCss() {
  const files = readdirSync(stylesDir).filter((name) => name.endsWith('.css'));
  // template-variants-v2.css cuối cùng để override.
  files.sort((a, b) => {
    if (a.includes('template-variants-v2')) return 1;
    if (b.includes('template-variants-v2')) return -1;
    return a.localeCompare(b);
  });
  return files.map((name) => `/* ===== ${name} ===== */\n${readFileSync(join(stylesDir, name), 'utf8')}`).join('\n\n');
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  const moduleUrl = await buildMarkupModule();
  const markup = await import(moduleUrl);
  const { renderCoverPage, renderListPage, setSpotlightV2CoverImagePool } = markup;

  const res = await fetch(API, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API ${res.status}: ${API}`);
  const dataset = await res.json();
  const coverImageUrls = dataset.coverImageUrls || [];
  if (typeof setSpotlightV2CoverImagePool === 'function') setSpotlightV2CoverImagePool(coverImageUrls);

  const css = loadAllCss();
  const deckSections = [];

  for (const deckId of V2_DECKS) {
    const deck = (dataset.decks || []).find((d) => d.id === deckId);
    const list = getMainList(deck);
    if (!list) {
      deckSections.push(`<section class="preview-deck"><h2>${deckId} — KHÔNG CÓ DỮ LIỆU</h2></section>`);
      continue;
    }
    const pages = list.pages || [];
    const cards = pages.map((page, index) => {
      const html = page.type === 'cover'
        ? renderCoverPage(page, index, pages.length, list.id, [], list, coverImageUrls)
        : renderListPage(page, index, pages.length, list.id, [], list);
      const label = `${index + 1}. ${page.type === 'cover' ? 'COVER' : (page.chipText || page.title || page.layoutVariant || 'list')} — ${page.layoutVariant || ''}`;
      return `<div class="preview-card"><div class="preview-card-label">${label}</div>${absolutizeImages(html)}</div>`;
    }).join('\n');

    deckSections.push(`
      <section class="preview-deck">
        <h2>${deck.navTitle || deckId} <small>(${deckId} · v${list.templateVersion ?? '?'} · ${pages.length} trang)</small></h2>
        <div class="${gridClass}">${cards}</div>
      </section>
    `);
  }

  const doc = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>Preview 4 mẫu V2</title>
<style>${css}</style>
<style>
  body { margin: 0; padding: 24px; background: #11141a; color: #e6e8ee; font-family: system-ui, sans-serif; }
  h1 { font-size: 20px; }
  .preview-deck { margin: 32px 0; }
  .preview-deck > h2 { font-size: 16px; border-bottom: 1px solid #333; padding-bottom: 8px; }
  .preview-deck small { color: #8b93a7; font-weight: 400; }
  .preview-grid { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-start; }
  .preview-card { background: #1b1f29; padding: 8px; border-radius: 10px; }
  .preview-card-label { font-size: 11px; color: #9aa3b8; margin-bottom: 6px; max-width: 397px; }
  .preview-card .story-page { transform: none; }
</style>
</head>
<body>
  <h1>Preview 4 mẫu V2 — nguồn: ${API}</h1>
  ${deckSections.join('\n')}
</body>
</html>`;

  const suffix = process.env.ONLY_DECK ? `-${process.env.ONLY_DECK}` : '';
  const outFile = join(outDir, `${EXPORT_MODE ? 'v2-preview-export' : 'v2-preview'}${suffix}.html`);
  writeFileSync(outFile, doc, 'utf8');

  // Dọn bundle tạm.
  try { rmSync(join(outDir, '__pageMarkup.bundle.mjs'), { force: true }); } catch {}

  console.log('Đã tạo preview:', outFile);
  console.log('Mở bằng trình duyệt để kiểm tra trực quan 4 mẫu V2.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
