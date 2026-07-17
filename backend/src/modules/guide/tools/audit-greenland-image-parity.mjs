/**
 * Kiểm tra Green Land: tên / địa chỉ / ảnh Drive khớp manifest khi tạo list + markup xuất.
 * Chạy: node backend/src/modules/guide/tools/audit-greenland-image-parity.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../../../../../');
const manifestPath = join(rootDir, 'backend/data/sheet-drive-images.greenland.json');
const markupPath = join(rootDir, 'frontend/lib/pageMarkup.js');

const API_BASE = process.env.GUIDE_API_BASE || 'http://127.0.0.1:3000';
const DESTINATION = 'greenland';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const { pathToFileURL } = await import('node:url');

let pass = 0;
let fail = 0;
const issues = [];

function ok(msg) { pass += 1; console.log(`  ✓ ${msg}`); }
function bad(msg, detail = '') {
  fail += 1;
  const line = detail ? `${msg} — ${detail}` : msg;
  issues.push(line);
  console.log(`  ✗ ${line}`);
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stripLabelPrefix(name) {
  return String(name ?? '').replace(/^[^:]{1,30}:\s*/, '').trim();
}

function getMainList(deck) {
  return (deck?.lists || []).find((l) => /-main$/i.test(String(l?.id || ''))) || deck?.lists?.[0];
}

function driveIdFromUrl(url) {
  const value = String(url || '');
  const proxy = value.match(/[?&]id=([^&]+)/i);
  if (proxy) return proxy[1];
  const direct = value.match(/\/d\/([^/]+)/i);
  return direct ? direct[1] : '';
}

function isLibraryOrGeneric(url) {
  const value = String(url || '').toLowerCase();
  return value.includes('/assets/library')
    || value.includes('/assets/dalat')
    || value.includes('anh_nen')
    || value.includes('hinh_nen');
}

async function switchDestination(id) {
  const res = await fetch(`${API_BASE}/api/destination`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Switch destination HTTP ${res.status}`);
  return res.json();
}

async function fetchDataset() {
  const res = await fetch(`${API_BASE}/api/guide-data?refresh=1`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Dataset HTTP ${res.status}`);
  return res.json();
}

async function buildMarkupRenderer() {
  const tmp = join(__dirname, '__audit-gl-markup.mjs');
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

function buildManifestIndex(manifest) {
  const byName = new Map();
  const byKey = new Map();
  for (const entry of Object.values(manifest.items || {})) {
    const nameKey = normalizeName(entry.name);
    const usageKey = `${entry.sectionKey}|${normalizeText(entry.name)}|${normalizeText(entry.address)}`;
    byKey.set(entry.key, entry);
    byKey.set(usageKey, entry);
    if (!byName.has(nameKey)) byName.set(nameKey, []);
    byName.get(nameKey).push(entry);
  }
  return { byName, byKey };
}

function findManifestForItem(item, manifestIndex) {
  if (item.sourceKey && manifestIndex.byKey.has(item.sourceKey)) {
    return manifestIndex.byKey.get(item.sourceKey);
  }
  const raw = normalizeName(item.rawName || stripLabelPrefix(item.name));
  const candidates = manifestIndex.byName.get(raw) || [];
  if (candidates.length === 1) return candidates[0];
  const addr = normalizeText(item.metaPrimary || '');
  return candidates.find((entry) => normalizeText(entry.address) === addr) || candidates[0] || null;
}

function itemNeedsAddress(page) {
  const variant = String(page.layoutVariant || '');
  if (variant.includes('menu')) return true;
  if (variant.includes('grid') || variant.includes('spotlight') || variant.includes('pov')) return true;
  if (variant.includes('budget') || variant.includes('itinerary') || variant.includes('timeline')) return true;
  return false;
}

function auditItemImage(item, page, deckId, manifestIndex) {
  const imageUrl = String(item.imageUrl || '').trim();
  if (!imageUrl) return null;

  const displayName = stripLabelPrefix(item.name || item.rawName || '');
  if (!displayName) {
    bad(`${deckId} | ${page.title || page.chipText}: thiếu tên`, item.id || '');
    return null;
  }

  if (isLibraryOrGeneric(imageUrl)) {
    bad(`${deckId} | ${displayName}: ảnh thư viện/nền`, imageUrl.slice(0, 80));
    return null;
  }

  const manifest = findManifestForItem(item, manifestIndex);
  if (!manifest) {
    bad(`${deckId} | ${displayName}: không có trong manifest Drive`, item.id || '');
    return null;
  }

  const expectedIds = new Set(
    (manifest.candidateImages || []).map((img) => img.fileId).filter(Boolean),
  );
  if (manifest.fileId) expectedIds.add(manifest.fileId);

  const actualId = driveIdFromUrl(imageUrl);
  if (!actualId || !expectedIds.has(actualId)) {
    bad(
      `${deckId} | ${displayName}: ảnh không khớp manifest`,
      `got ${actualId || 'none'}, expected one of ${[...expectedIds].slice(0, 2).join(', ')}`,
    );
    return null;
  }

  const manifestName = normalizeName(manifest.name);
  const itemName = normalizeName(item.rawName || stripLabelPrefix(item.name));
  if (manifestName && itemName && manifestName !== itemName) {
    bad(`${deckId} | tên lệch manifest`, `${itemName} vs ${manifestName}`);
  }

  if (itemNeedsAddress(page)) {
    const addr = String(item.metaPrimary || '').trim();
    if (!addr || /đang cập nhật/i.test(addr)) {
      bad(`${deckId} | ${displayName}: thiếu địa chỉ`, item.id || '');
    } else {
      const manifestAddr = normalizeText(manifest.address);
      const itemAddr = normalizeText(addr);
      if (manifestAddr && itemAddr && manifestAddr !== itemAddr) {
        bad(`${deckId} | ${displayName}: địa chỉ lệch`, `${addr} vs ${manifest.address}`);
      }
    }
  }

  return { displayName, imageUrl, manifest };
}

async function main() {
  console.log('\n=== AUDIT GREEN LAND: tên · địa chỉ · ảnh Drive ===\n');

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const manifestIndex = buildManifestIndex(manifest);
  ok(`manifest Green Land: ${Object.keys(manifest.items || {}).length} mục`);

  const switched = await switchDestination(DESTINATION);
  if (switched.active?.id !== DESTINATION) throw new Error(`Active destination is ${switched.active?.id}`);
  ok(`API active: ${switched.active.label}`);

  const dataset = await fetchDataset();
  if (dataset?.source?.destinationId !== DESTINATION) {
    throw new Error(`Dataset destinationId=${dataset?.source?.destinationId}`);
  }
  ok(`Dataset: ${dataset.decks?.length || 0} decks, ${dataset.source?.totalItems || 0} items sheet`);

  let totalWithImage = 0;
  let totalChecked = 0;
  const deckStats = [];

  for (const deck of dataset.decks || []) {
    const list = getMainList(deck);
    if (!list) continue;
    let deckWithImage = 0;
    let deckOk = 0;
    let deckBad = 0;

    for (const page of list.pages || []) {
      if (page.type !== 'list') continue;
      for (const item of page.items || []) {
        const imageUrl = String(item.imageUrl || '').trim();
        if (!imageUrl) continue;
        deckWithImage += 1;
        totalWithImage += 1;
        const before = fail;
        auditItemImage(item, page, deck.id, manifestIndex);
        totalChecked += 1;
        if (fail === before) deckOk += 1;
        else deckBad += 1;
      }
    }

    deckStats.push({
      deckId: deck.id,
      navTitle: deck.navTitle,
      withImage: deckWithImage,
      ok: deckOk,
      bad: deckBad,
    });
  }

  console.log('\n--- Theo mẫu (main list, có ảnh) ---');
  for (const row of deckStats) {
    if (row.withImage === 0) {
      console.log(`  · ${row.deckId}: 0 ảnh (bỏ qua kiểm tra ảnh)`);
      continue;
    }
    if (row.bad === 0) ok(`${row.navTitle || row.deckId}: ${row.ok}/${row.withImage} ảnh khớp manifest`);
    else bad(`${row.navTitle || row.deckId}: ${row.bad}/${row.withImage} lỗi ảnh/tên/địa chỉ`);
  }

  // Markup export parity: sample 3 decks có nhiều ảnh
  const sampleDecks = deckStats
    .filter((row) => row.withImage > 0 && row.bad === 0)
    .sort((a, b) => b.withImage - a.withImage)
    .slice(0, 5)
    .map((row) => row.deckId);

  if (sampleDecks.length > 0) {
    console.log('\n--- Markup xuất (HTML chứa đúng tên + src ảnh) ---');
    const markup = await buildMarkupRenderer();
    const { renderListPage } = markup;

    for (const deckId of sampleDecks) {
      const deck = dataset.decks.find((d) => d.id === deckId);
      const list = getMainList(deck);
      let markupIssues = 0;
      let markupChecked = 0;

      for (const page of list.pages || []) {
        if (page.type !== 'list') continue;
        const idx = list.pages.indexOf(page);
        const html = renderListPage(page, idx, `${deckId}-main`, list, page.subtitle);
        for (const item of page.items || []) {
          const imageUrl = String(item.imageUrl || '').trim();
          if (!imageUrl) continue;
          const displayName = stripLabelPrefix(item.name || item.rawName || '');
          markupChecked += 1;
          if (!html.includes(displayName)) {
            markupIssues += 1;
            bad(`${deckId} markup: thiếu tên "${displayName}"`, page.title || page.layoutVariant || '');
            continue;
          }
          const id = driveIdFromUrl(imageUrl);
          if (id && !html.includes(id)) {
            markupIssues += 1;
            bad(`${deckId} markup: thiếu ảnh Drive ${displayName}`, id);
          }
          const addr = String(item.metaPrimary || '').trim();
          if (addr && itemNeedsAddress(page) && !html.includes(addr)) {
            markupIssues += 1;
            bad(`${deckId} markup: thiếu địa chỉ ${displayName}`, addr);
          }
        }
      }

      if (markupChecked > 0 && markupIssues === 0) {
        ok(`${deckId}: markup export ${markupChecked} ô ảnh khớp tên/ảnh/địa chỉ`);
      }
    }
  }

  console.log(`\n=== KẾT QUẢ ===`);
  console.log(`PASS: ${pass}`);
  console.log(`FAIL: ${fail}`);
  console.log(`Tổng ô có ảnh đã kiểm: ${totalChecked}`);

  if (issues.length > 0) {
    console.log('\nChi tiết lỗi (tối đa 15):');
    issues.slice(0, 15).forEach((line) => console.log(`  - ${line}`));
    if (issues.length > 15) console.log(`  ... và ${issues.length - 15} lỗi khác`);
  }

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
