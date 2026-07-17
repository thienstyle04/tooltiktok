/**
 * Audit tổng quát cho TẤT CẢ các mẫu (deck) — kiểm tra:
 *   1) Cấu trúc: list/main, templateVersion, số trang, cover.
 *   2) Render HTML: mỗi trang render không lỗi, không rỗng, không lộ token hỏng
 *      ([object Object], undefined, NaN, giá tổng hợp ~..k).
 *   3) Toàn vẹn dữ liệu: item thiếu tên/ảnh, trùng item, trùng ảnh, trang list rỗng.
 *   4) Font: quét CSS/markup xem có font script (Caveat/cursive) áp lên chữ tiếng Việt động.
 *
 * KHÔNG sửa gì — chỉ báo cáo. Chạy:
 *   node backend/src/modules/guide/tools/audit-all-templates.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../../../../../');
const markupPath = join(rootDir, 'frontend/lib/pageMarkup.js');
const stylesDir = join(rootDir, 'frontend/app/styles');

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const { pathToFileURL } = await import('node:url');

const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000/api/guide-data?refresh=1';

const VN_DIACRITIC = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const BAD_TOKENS = ['[object Object]', 'undefined', 'NaN'];
const SYNTHETIC_PRICE = /~\s*\d+\s*[–-]\s*\d+\s*k/i; // ví dụ "~30–120k"

/** Lỗi/cảnh báo gom theo deck. */
const report = new Map(); // deckId -> { errors: [], warnings: [] }

function slot(deckId) {
  if (!report.has(deckId)) report.set(deckId, { errors: [], warnings: [] });
  return report.get(deckId);
}
function err(deckId, msg) { slot(deckId).errors.push(msg); }
function warn(deckId, msg) { slot(deckId).warnings.push(msg); }

function getMainList(deck) {
  return (deck?.lists || []).find((l) => /-main$/i.test(String(l?.id || ''))) || deck?.lists?.[0];
}

async function fetchDataset() {
  const res = await fetch(API, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API ${res.status}: ${API}`);
  return res.json();
}

async function buildMarkupRenderer() {
  const tmp = join(__dirname, '__audit-markup.mjs');
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

function scanBadTokens(html) {
  const hits = [];
  // [object Object] là literal cố định — so khớp chuỗi trực tiếp cho chắc.
  if (html.includes('[object Object]')) hits.push('[object Object]');
  // undefined / NaN: chỉ xét khi lộ ra ở TEXT NODE (giữa > và <), bỏ qua class/attr.
  let hasUndef = false, hasNaN = false;
  const textNodeRe = />([^<]*)</g;
  let m;
  while ((m = textNodeRe.exec(html))) {
    const text = m[1];
    if (/\bundefined\b/.test(text)) hasUndef = true;
    if (/\bNaN\b/.test(text)) hasNaN = true;
  }
  if (hasUndef) hits.push('undefined');
  if (hasNaN) hits.push('NaN');
  if (SYNTHETIC_PRICE.test(html)) hits.push('giá tổng hợp ~..k');
  return hits;
}

function auditBudgetCheckinCosts(deckId, list) {
  if (!/^budget-/.test(deckId)) return;
  const table = (list.pages || []).find((p) => p.layoutVariant === 'budget-3n2d-table');
  if (!table) return;
  for (const item of table.items || []) {
    const name = String(item.name || '');
    if (!/^check-in:/i.test(name)) continue;
    const cost = String(item.metaSecondary || '').trim();
    if (/~?\s*20\s*k/i.test(cost) || /^-\d/.test(cost)) {
      err(deckId, `Check-in "${name}" hiển thị "${cost}" — cần Free.`);
    }
  }
}

function auditCaptionPlaceholders(deckId, list) {
  const cap = String(list.postCaption || '').trim();
  const tags = Array.isArray(list.captionHashtags) ? list.captionHashtags : [];
  if (/^Test bảng\b/i.test(cap)) err(deckId, `List ${list.id}: postCaption test "${cap}".`);
  if (tags.some((t) => String(t).toLowerCase() === '#test')) err(deckId, `List ${list.id}: hashtag #test.`);
}

function auditDeckData(deckId, list) {
  const pages = list.pages || [];
  const listPages = pages.filter((p) => p.type === 'list');
  const seenItemIds = new Map();
  const seenImages = new Map();

  auditBudgetCheckinCosts(deckId, list);
  auditCaptionPlaceholders(deckId, list);

  for (const page of listPages) {
    const items = Array.isArray(page.items) ? page.items : [];
    const chip = page.chipText || page.title || `trang ${pages.indexOf(page) + 1}`;
    if (items.length === 0) {
      warn(deckId, `Trang "${chip}" không có item nào.`);
      continue;
    }
    const missingName = items.filter((it) => !String(it?.name || '').trim()).length;
    if (missingName) warn(deckId, `Trang "${chip}": ${missingName}/${items.length} item thiếu tên.`);
    const missingImage = items.filter((it) => !String(it?.imageUrl || '').trim()).length;
    const tableWithoutImages = page.layoutVariant === 'budget-3n2d-table';
    if (missingImage && !tableWithoutImages) warn(deckId, `Trang "${chip}": ${missingImage}/${items.length} item thiếu ảnh.`);

    const pageImages = items.map((it) => String(it?.imageUrl || '').trim()).filter(Boolean);
    if (pageImages.length > 1 && new Set(pageImages).size < pageImages.length) {
      const layout = page.layoutVariant || 'standard';
      const msg = `Trang "${chip}" (${layout}): ảnh trùng trong cùng trang.`;
      if (layout === 'budget-3n2d-gallery' || layout === 'grid-4' || layout === 'grid-6' || layout === 'grid-8') {
        err(deckId, msg);
      } else {
        warn(deckId, msg);
      }
    }

    for (const it of items) {
      const id = String(it?.id || '').trim();
      if (id) seenItemIds.set(id, (seenItemIds.get(id) || 0) + 1);
      const img = String(it?.imageUrl || '').trim();
      if (img) seenImages.set(img, (seenImages.get(img) || 0) + 1);
    }
  }

  const dupItems = [...seenItemIds.values()].filter((n) => n > 1).length;
  if (dupItems) warn(deckId, `${dupItems} địa điểm bị lặp giữa các trang.`);
  const dupImages = [...seenImages.values()].filter((n) => n > 1).length;
  if (dupImages) warn(deckId, `${dupImages} ảnh bị lặp giữa các trang.`);
}

function auditDeckRender(deckId, list, markup) {
  const { renderCoverPage, renderListPage } = markup;
  const pages = list.pages || [];
  const listId = list.id || `${deckId}-main`;
  const cover = pages.find((p) => p.type === 'cover');

  if (!cover) {
    err(deckId, 'Không có trang cover.');
  } else {
    try {
      const html = renderCoverPage(cover, 0, pages.length, listId, [], list, cover.coverImages || []);
      if (!html || !String(html).trim()) err(deckId, 'Cover render ra HTML rỗng.');
      else {
        const bad = scanBadTokens(html);
        if (bad.length) err(deckId, `Cover lộ token hỏng: ${bad.join(', ')}.`);
      }
    } catch (e) {
      err(deckId, `Cover render lỗi: ${e.message}`);
    }
  }

  pages.forEach((page, idx) => {
    if (page.type === 'cover') return;
    const chip = page.chipText || page.title || `trang ${idx + 1}`;
    try {
      const html = renderListPage(page, idx, pages.length, listId, [], list);
      if (!html || !String(html).trim()) {
        err(deckId, `Trang "${chip}" render ra HTML rỗng.`);
        return;
      }
      const bad = scanBadTokens(html);
      if (bad.length) err(deckId, `Trang "${chip}" lộ token hỏng: ${bad.join(', ')}.`);
    } catch (e) {
      err(deckId, `Trang "${chip}" render lỗi: ${e.message}`);
    }
  });
}

function auditDeckStructure(deckId, deck) {
  if (!deck) { err(deckId, 'Deck không có trong catalog API.'); return null; }
  if (!deck.lists || deck.lists.length === 0) { err(deckId, 'Deck không có list nào.'); return null; }
  const list = getMainList(deck);
  if (!list) { err(deckId, 'Không tìm được main list.'); return null; }
  if (!list.templateVersion) warn(deckId, 'main list thiếu templateVersion.');
  const pages = list.pages || [];
  if (pages.length === 0) { err(deckId, 'main list không có trang nào.'); return null; }
  return list;
}

/** Quét font script áp lên chữ VN động — dựa trên CSS + markup. */
function auditFonts() {
  const findings = []; // { deckId, selector, font, note }
  const readCss = (name) => {
    try { return readFileSync(join(stylesDir, name), 'utf8'); } catch { return ''; }
  };
  const markup = readFileSync(markupPath, 'utf8');

  // Map class script -> nội dung render (để biết là VN động hay nhãn cố định Latin).
  const scriptClassContent = {
    'grid6qt-band-script': 'vài địa điểm',       // tiếng Việt CỐ ĐỊNH
    'grid5-cover-script': 'Thong dong',           // Latin cố định (an toàn)
    'itl-cover-script': '${hero}',                // VN động (tên cover)
    'itl-day-head-title': '${dayTitle}',          // VN động (Ngày ...)
    'cover-script': 'Da Lat',                     // Latin cố định
  };

  const cssFiles = {
    'grid-6-quaytung': 'grid6-quaytung-templates.css',
    'grid-5': 'grid5-templates.css',
    'itinerary-timeline': 'itinerary-timeline-templates.css',
  };

  for (const [deckId, cssName] of Object.entries(cssFiles)) {
    const css = readCss(cssName);
    // tìm mọi khai báo biến script và selector dùng nó
    const scriptVarMatch = css.match(/--[\w-]*script[\w-]*:\s*([^;]+);/g) || [];
    for (const decl of scriptVarMatch) {
      const value = decl.split(':')[1].replace(';', '').trim();
      const hasCaveatCursiveOnly = /caveat/i.test(value) && /cursive/i.test(value) && !/vietnam/i.test(value);
      const hasCaveatMixed = /caveat/i.test(value) && /vietnam/i.test(value);
      // liên kết tới class dùng biến này
      for (const [cls, content] of Object.entries(scriptClassContent)) {
        const selRe = new RegExp(`\\.${cls}[^{]*\\{[^}]*var\\(--[\\w-]*script[\\w-]*\\)`, 's');
        if (!selRe.test(css)) continue;
        const isVN = content.includes('${') || VN_DIACRITIC.test(content);
        if (!isVN) continue; // nhãn Latin cố định — bỏ qua
        if (hasCaveatCursiveOnly) {
          findings.push({ deckId, selector: `.${cls}`, font: value, note: `Chữ VN "${content}" dùng Caveat KHÔNG fallback VN → tofu/hỏng dấu.` });
        } else if (hasCaveatMixed) {
          findings.push({ deckId, selector: `.${cls}`, font: value, note: `Chữ VN "${content}" dùng Caveat (fallback BVP) → render lẫn cursive/sans.` });
        }
      }
    }
  }
  return findings;
}

function pad(s, n) { s = String(s); return s + ' '.repeat(Math.max(0, n - s.length)); }

async function main() {
  console.log('══════════════════════════════════════════════════════');
  console.log('  AUDIT TẤT CẢ CÁC MẪU (không sửa — chỉ báo cáo)');
  console.log('══════════════════════════════════════════════════════');
  console.log(`API: ${API}\n`);

  let dataset;
  try {
    dataset = await fetchDataset();
  } catch (e) {
    console.error(`✗ Không gọi được API: ${e.message}`);
    console.error('  → chạy "npm run dev" và đợi backend sẵn sàng.');
    process.exit(1);
  }
  const decks = dataset.decks || [];
  console.log(`✓ API trả ${decks.length} decks. Bắt đầu audit từng mẫu...\n`);

  let markup;
  try {
    markup = await buildMarkupRenderer();
  } catch (e) {
    console.error(`✗ Bundle pageMarkup lỗi: ${e.message}`);
    process.exit(1);
  }

  // Audit từng deck (main + list AI)
  for (const deck of decks) {
    const deckId = deck.id;
    slot(deckId);
    const list = auditDeckStructure(deckId, deck);
    if (!list) continue;
    auditDeckData(deckId, list);
    auditDeckRender(deckId, list, markup);
    for (const extra of deck.lists || []) {
      if (extra.id === list.id) continue;
      auditDeckData(deckId, extra);
      auditDeckRender(deckId, extra, markup);
    }
  }

  // Audit font (theo CSS)
  const fontFindings = auditFonts();
  for (const f of fontFindings) {
    err(f.deckId, `FONT ${f.selector}: ${f.note} (font-family: ${f.font})`);
  }

  // In chi tiết theo deck
  console.log('────────── CHI TIẾT THEO MẪU ──────────\n');
  for (const deck of decks) {
    const deckId = deck.id;
    const r = report.get(deckId) || { errors: [], warnings: [] };
    const status = r.errors.length ? '✗ LỖI' : (r.warnings.length ? '⚠ CẢNH BÁO' : '✓ OK');
    console.log(`${status}  ${deckId}  (${deck.navTitle || ''})`);
    for (const e of r.errors) console.log(`    ✗ ${e}`);
    for (const w of r.warnings) console.log(`    ⚠ ${w}`);
    if (!r.errors.length && !r.warnings.length) console.log('    (không phát hiện vấn đề)');
    console.log('');
  }

  // Bảng tổng hợp
  console.log('────────── BẢNG TỔNG HỢP ──────────\n');
  console.log(`${pad('MẪU', 26)}${pad('LỖI', 6)}${pad('CẢNH BÁO', 10)}TRẠNG THÁI`);
  console.log('─'.repeat(60));
  let totalErr = 0, totalWarn = 0, deckErr = 0, deckWarn = 0, deckOk = 0;
  for (const deck of decks) {
    const r = report.get(deck.id) || { errors: [], warnings: [] };
    totalErr += r.errors.length; totalWarn += r.warnings.length;
    const st = r.errors.length ? 'CẦN FIX' : (r.warnings.length ? 'xem lại' : 'OK');
    if (r.errors.length) deckErr++; else if (r.warnings.length) deckWarn++; else deckOk++;
    console.log(`${pad(deck.id, 26)}${pad(r.errors.length, 6)}${pad(r.warnings.length, 10)}${st}`);
  }
  console.log('─'.repeat(60));
  console.log(`${pad('TỔNG', 26)}${pad(totalErr, 6)}${pad(totalWarn, 10)}`);
  console.log(`\nMẫu cần fix: ${deckErr} | Mẫu cần xem lại: ${deckWarn} | Mẫu OK: ${deckOk} | Tổng: ${decks.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
