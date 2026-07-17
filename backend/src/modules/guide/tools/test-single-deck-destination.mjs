/**
 * Test một mẫu cụ thể với destination: dữ liệu sheet, title, không lẫn Đà Lạt.
 * node backend/src/modules/guide/tools/test-single-deck-destination.mjs phanthiet itinerary-3n2d
 */
import * as XLSX from 'xlsx';
import fs from 'fs';

const destinationId = process.argv[2] || 'phanthiet';
const deckId = process.argv[3] || 'itinerary-3n2d';
const API = process.env.GUIDE_API_BASE || 'http://127.0.0.1:3000';

const DESTINATIONS = {
  dalat: {
    exportUrl: 'https://docs.google.com/spreadsheets/d/1-ECVLtuySSlCO5AShcJle1uP9j8XCA4l/export?format=xlsx',
    sheetUrl: 'https://docs.google.com/spreadsheets/d/1-ECVLtuySSlCO5AShcJle1uP9j8XCA4l/edit',
    label: 'Đà Lạt',
  },
  phanthiet: {
    exportUrl: 'https://docs.google.com/spreadsheets/d/1l1HUVSkqVgj1udZmjtmjqZ3AeWEMgp0PI9kyBd-4CVw/export?format=xlsx',
    sheetUrl: 'https://docs.google.com/spreadsheets/d/1l1HUVSkqVgj1udZmjtmjqZ3AeWEMgp0PI9kyBd-4CVw/edit',
    label: 'Phan Thiết',
  },
};

const DALAT_MARKERS = [/đà lạt/i, /\bdalat\b/i, /SG - ĐL/];
const NAME_KEYS = ['ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten'];

function normalizeText(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function normalizeName(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function firstValue(row, keys) {
  for (const key of keys) {
    const v = String(row[key] ?? '').trim();
    if (v) return v;
  }
  return '';
}

async function fetchSheetNames(config) {
  const res = await fetch(config.exportUrl, {
    headers: { Referer: config.sheetUrl, 'User-Agent': 'Single deck test' },
  });
  if (!res.ok) throw new Error(`Sheet HTTP ${res.status}`);
  const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: 'buffer' });
  const names = new Set();
  for (const sheetName of wb.SheetNames) {
    if (normalizeText(sheetName) === 'hinh_nen') continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
    if (rows.length < 2) continue;
    const headers = (rows[0] ?? []).map((h) => normalizeText(h));
    for (const rawRow of rows.slice(1)) {
      const row = {};
      headers.forEach((h, i) => { row[h] = String(rawRow[i] ?? '').trim(); });
      const name = firstValue(row, NAME_KEYS);
      if (name) names.add(normalizeName(name));
    }
  }
  return names;
}

function getMainList(deck) {
  return (deck?.lists || []).find((l) => /-main$/i.test(String(l?.id || ''))) || deck?.lists?.[0];
}

function collectTitles(deck) {
  const out = [];
  out.push(['deck.title', deck.title]);
  out.push(['deck.description', deck.description]);
  const list = getMainList(deck);
  if (list) {
    out.push(['list.title', list.title]);
    out.push(['list.coverTitle', list.coverTitle]);
    out.push(['list.description', list.description]);
    for (const page of list.pages || []) {
      out.push([`page.${page.type}.title`, page.title]);
      out.push([`page.${page.type}.subtitle`, page.subtitle]);
      out.push([`page.${page.type}.chipText`, page.chipText]);
    }
  }
  return out.filter(([, v]) => v);
}

async function main() {
  const config = DESTINATIONS[destinationId];
  const otherId = destinationId === 'phanthiet' ? 'dalat' : 'phanthiet';
  const otherConfig = DESTINATIONS[otherId];

  console.log(`\n=== TEST MẪU: ${deckId} | Destination: ${config.label} ===\n`);

  await fetch(`${API}/api/destination`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: destinationId }),
  });

  const dataset = await (await fetch(`${API}/api/guide-data?refresh=1`)).json();
  const deck = (dataset.decks || []).find((d) => d.id === deckId);
  if (!deck) throw new Error(`Không tìm thấy deck ${deckId}`);

  console.log('--- Nguồn API ---');
  console.log(`destinationId: ${dataset.source?.destinationId}`);
  console.log(`destinationLabel: ${dataset.source?.destinationLabel}`);
  console.log(`totalItems pool: ${dataset.source?.totalItems}`);
  console.log(`sheetId: ${dataset.source?.sheetId?.slice(0, 20)}...`);

  if (dataset.source?.destinationId !== destinationId) {
    console.log('\n❌ FAIL: API không trả đúng destination');
    process.exit(1);
  }
  console.log('✅ Destination API đúng\n');

  console.log('--- Title / Cover ---');
  const titles = collectTitles(deck);
  let titleIssues = 0;
  for (const [key, text] of titles) {
    const bad = DALAT_MARKERS.some((re) => re.test(String(text)));
    const icon = bad && destinationId === 'phanthiet' ? '❌' : '  ';
    if (bad && destinationId === 'phanthiet') titleIssues += 1;
    console.log(`${icon} ${key}: ${String(text).slice(0, 100)}`);
  }
  if (destinationId === 'phanthiet' && titleIssues === 0) {
    console.log('\n✅ Title không còn "Đà Lạt"\n');
  } else if (destinationId === 'phanthiet') {
    console.log(`\n❌ ${titleIssues} title còn "Đà Lạt"\n`);
  }

  const list = getMainList(deck);
  const items = [];
  for (const page of list?.pages || []) {
    if (page.type !== 'list') continue;
    for (const item of page.items || []) {
      items.push({
        name: String(item.name || '').trim(),
        rawName: String(item.rawName || item.name || '').trim(),
        section: item.sourceSectionKey || '',
        page: page.chipText || page.title || '',
      });
    }
  }

  console.log('--- Dữ liệu địa điểm ---');
  console.log(`Số item động: ${items.length}`);
  if (items.length === 0) {
    console.log('⚠️  Mẫu không có item list (cover-only?)');
  } else {
    console.log('Mẫu 5 item đầu:');
    items.slice(0, 5).forEach((it, i) => {
      console.log(`  ${i + 1}. [${it.section || '?'}] ${it.name}`);
    });
  }

  const [activeSheet, otherSheet] = await Promise.all([
    fetchSheetNames(config),
    fetchSheetNames(otherConfig),
  ]);

  let inActive = 0;
  let inOtherOnly = 0;
  let inNeither = 0;
  const otherOnlySamples = [];
  const neitherSamples = [];

  for (const item of items) {
    const key = normalizeName(item.rawName || item.name);
    if (!key) continue;
    const onActive = activeSheet.has(key);
    const onOther = otherSheet.has(key);
    if (onActive) inActive += 1;
    else if (onOther) {
      inOtherOnly += 1;
      if (otherOnlySamples.length < 5) otherOnlySamples.push(item.name);
    } else {
      inNeither += 1;
      if (neitherSamples.length < 3) neitherSamples.push(item.name);
    }
  }

  console.log(`\nKhớp sheet ${config.label}: ${inActive}/${items.length}`);
  console.log(`Chỉ có trên sheet ${otherConfig.label} (có thể lẫn DL): ${inOtherOnly}`);
  console.log(`Không có trên cả 2 sheet (tĩnh/đổi tên): ${inNeither}`);

  if (inOtherOnly > 0) {
    console.log('\n❌ CẢNH BÁO — item có thể lấy nhầm từ sheet kia:');
    otherOnlySamples.forEach((s) => console.log(`   - ${s}`));
  } else if (items.length > 0) {
    console.log(`\n✅ Không có item nào chỉ tồn tại trên sheet ${otherConfig.label}`);
  }

  if (neitherSamples.length) {
    console.log('\nItem không map sheet (có thể label tĩnh):');
    neitherSamples.forEach((s) => console.log(`   - ${s}`));
  }

  const pass = dataset.source?.destinationId === destinationId
    && (destinationId !== 'phanthiet' || titleIssues === 0)
    && inOtherOnly === 0
    && (items.length === 0 || inActive > 0);

  console.log('\n--- KẾT LUẬN ---');
  console.log(pass ? '✅ PASS' : '❌ FAIL');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
