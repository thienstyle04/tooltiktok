/**
 * Kiểm tra màng đen đã bị tắt khi tạo/xem bài đăng.
 *
 *   node backend/src/modules/guide/tools/test-no-black-veils.mjs
 *   CREATE=1 node backend/src/modules/guide/tools/test-no-black-veils.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../../../');
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const FE = process.env.TEST_FE_URL || 'http://127.0.0.1:3001';
const CREATE = process.env.CREATE === '1';

function extractClassesFromMarkup(src) {
  const classes = new Set();
  const re = /class=\"([^\"]+)\"/g;
  let m;
  while ((m = re.exec(src))) {
    for (const part of m[1].split(/\s+/)) {
      if (!part) continue;
      if (/modal-overlay/i.test(part)) continue;
      if (/(^|-)(shade|dim|overlay)(-|$)/i.test(part) || /(shade|dim|overlay)/i.test(part)) {
        classes.add(part);
      }
    }
  }
  return [...classes].sort();
}

function extractHiddenSelectors(css) {
  const selectors = [];
  const re = /([^{}/]+)\{([^}]*)\}/g;
  let match;
  while ((match = re.exec(css))) {
    const head = match[1].trim();
    if (!head || head.startsWith('/*')) continue;
    const body = match[2];
    const hides =
      /display\s*:\s*none/i.test(body)
      || (/background\s*:\s*none/i.test(body) && /background-image\s*:\s*none/i.test(body))
      || /content\s*:\s*none/i.test(body);
    if (!hides) continue;
    for (const sel of head.split(',')) {
      const cleaned = sel.trim();
      if (cleaned) selectors.push(cleaned);
    }
  }
  return selectors;
}

function classCovered(className, selectors) {
  const needle = `.${className}`;
  return selectors.some((sel) => sel.includes(needle));
}

async function api(pathname, options = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(300000),
  });
  const text = await res.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 400) }; }
  return { ok: res.ok, status: res.status, body, text };
}

async function main() {
  const report = { ok: true, failures: [], checks: [] };
  const markupSrc = fs.readFileSync(path.join(root, 'frontend/lib/pageMarkup.js'), 'utf8');
  const photoCss = fs.readFileSync(path.join(root, 'frontend/app/styles/story-photo.css'), 'utf8');
  const veilCss = fs.readFileSync(path.join(root, 'frontend/app/styles/no-black-veils.css'), 'utf8');
  const globals = fs.readFileSync(path.join(root, 'frontend/app/globals.css'), 'utf8');

  const imported = globals.includes('no-black-veils.css');
  report.checks.push({ name: 'globals imports no-black-veils.css', ok: imported });
  if (!imported) report.failures.push('globals.css thiếu import no-black-veils.css');

  const shadeClasses = extractClassesFromMarkup(markupSrc);
  const selectors = extractHiddenSelectors(veilCss);
  report.shadeClassesInMarkup = shadeClasses;
  report.hideRuleCount = selectors.length;

  const uncovered = shadeClasses.filter((cls) => !classCovered(cls, selectors));
  report.checks.push({
    name: 'mọi class shade/dim/overlay trong pageMarkup bị CSS tắt',
    ok: uncovered.length === 0,
    uncovered,
  });
  if (uncovered.length) report.failures.push(`Chưa tắt: ${uncovered.join(', ')}`);

  const pseudoNeeded = [
    'photomode-item::after',
    'journey-bg::after',
    'grid8-cell::after',
    'grid8-hero::after',
    'grid8-center::after',
  ];
  for (const pseudo of pseudoNeeded) {
    const ok = veilCss.replace(/\s+/g, '').includes(pseudo.replace(/\s+/g, ''));
    report.checks.push({ name: `CSS tắt ${pseudo}`, ok });
    if (!ok) report.failures.push(`Thiếu ${pseudo}`);
  }

  // photomode still defines ::after gradient in source CSS — override must win via import order
  const photomodeHasAfter = /photomode-item::after/.test(photoCss) && /rgba\(9,\s*8,\s*7/.test(photoCss);
  report.checks.push({
    name: 'photomode nguồn vẫn có gradient (override phải thắng)',
    ok: photomodeHasAfter,
  });

  // FE bundle: open homepage and look for veil rules in linked CSS chunks
  try {
    const home = await fetch(FE, { signal: AbortSignal.timeout(30000) });
    const html = await home.text();
    const cssHrefs = [...html.matchAll(/href=\"([^\"]+_next\/static\/css\/[^\"]+\.css(?:\?[^\"]*)?)\"/g)].map((m) => m[1]);
    let bundled = '';
    for (const href of cssHrefs.slice(0, 12)) {
      const url = href.startsWith('http') ? href : new URL(href, FE).href;
      try {
        const cssRes = await fetch(url, { signal: AbortSignal.timeout(20000) });
        bundled += `\n${await cssRes.text()}`;
      } catch {
        // ignore missing chunk
      }
    }
    const hasVeilInBundle =
      bundled.includes('no-black-veils')
      || bundled.includes('grid8-feed-cover-dim')
      || /grid8-feed-cover-dim[^}]*display\s*:\s*none/i.test(bundled)
      || /spotlight-v2-shade[^}]*display\s*:\s*none/i.test(bundled);
    // Next may hash class names? Unlikely for global CSS class selectors.
    const dimHidden = /grid8-feed-cover-dim[\s\S]{0,120}?display:\s*none/i.test(bundled)
      || /grid8-feed-cover-dim\{display:none/i.test(bundled.replace(/\s+/g, ''));
    report.checks.push({
      name: 'FE bundle chứa rule tắt màng đen',
      ok: hasVeilInBundle || dimHidden,
      cssChunks: cssHrefs.length,
      dimHidden,
      sampleHit: hasVeilInBundle,
    });
    if (!(hasVeilInBundle || dimHidden)) {
      report.failures.push('Không thấy rule no-black-veils trong CSS bundle FE — hard refresh / restart Next');
    }
  } catch (error) {
    report.checks.push({ name: 'FE bundle check', ok: false, error: error.message });
    report.failures.push(`FE không truy cập được: ${error.message}`);
  }

  if (CREATE) {
    const guide = await api('/api/guide-data');
    report.checks.push({ name: 'API guide-data', ok: guide.ok, status: guide.status });
    if (!guide.ok) {
      report.failures.push('API không sẵn sàng cho CREATE');
    } else {
      const created = await api('/api/decks/generate-from-caption', {
        method: 'POST',
        body: JSON.stringify({
          deckId: 'grid-8-feed',
          tone: 'gen_z',
          caption: {
            coverTitle: 'TEST BO MANG DEN',
            headline: 'Test veil offline',
            body: 'List test kiểm tra màng đen khi tạo bài đăng Đà Lạt cafe check-in homestay.',
            hashtags: ['#dalat', '#testveil'],
          },
        }),
      });
      report.checks.push({
        name: 'tạo list AI (generate-from-caption)',
        ok: created.ok,
        status: created.status,
        listId: created.body?.listId,
        error: created.ok ? undefined : (created.body?.message || created.body?.raw || created.text?.slice(0, 200)),
      });
      if (!created.ok) {
        report.failures.push('Tạo list AI thất bại — không xác nhận được đường tạo bài đăng');
      } else {
        // Cleanup test list
        const del = await api(`/api/decks/grid-8-feed/lists/${encodeURIComponent(created.body.listId)}`, { method: 'DELETE' });
        report.checks.push({ name: 'xóa list test sau khi kiểm tra', ok: del.ok || del.status === 404, status: del.status });
      }
    }
  }

  report.ok = report.failures.length === 0;
  const outDir = path.join(root, 'backend/reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'no-black-veils-check.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
