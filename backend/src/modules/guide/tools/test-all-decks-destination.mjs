/**
 * Test tất cả mẫu với destination: title/mô tả + dữ liệu PT (thiếu data section OK).
 * node backend/src/modules/guide/tools/test-all-decks-destination.mjs phanthiet
 */
import * as XLSX from 'xlsx';

const destinationId = process.argv[2] || 'phanthiet';
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

const DALAT_MARKERS = [/đà lạt/i, /đÀ lẠT/, /\bdalat\b/i, /SG - ĐL/];
const NAME_KEYS = ['ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten'];
const STATIC_LABELS = new Set([
  'di chuyển bằng xe phương trang sg - đl',
  'check out, lên xe về lại sg',
  'bến xe liên tỉnh đà lạt',
].map((s) => s.toLowerCase()));

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

function hasDalatMarker(text) {
  const s = String(text || '');
  if (!s) return false;
  if (/@\w*dalat\w*/i.test(s)) return false;
  return DALAT_MARKERS.some((re) => re.test(s));
}

async function fetchSheetNames(config) {
  const res = await fetch(config.exportUrl, {
    headers: { Referer: config.sheetUrl, 'User-Agent': 'All decks test' },
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

function collectMarketingTexts(deck) {
  const texts = [];
  texts.push(deck.title, deck.description);
  for (const list of deck.lists || []) {
    texts.push(list.title, list.description, list.coverTitle, list.postCaption);
    for (const page of list.pages || []) {
      texts.push(page.title, page.subtitle, page.chipText);
    }
  }
  return texts.filter(Boolean).map(String);
}

function collectItems(deck) {
  const list = getMainList(deck);
  const items = [];
  for (const page of list?.pages || []) {
    if (page.type !== 'list') continue;
    for (const item of page.items || []) {
      items.push({
        name: String(item.name || '').trim(),
        rawName: String(item.rawName || item.name || '').trim(),
      });
    }
  }
  return items;
}

async function main() {
  const config = DESTINATIONS[destinationId];
  const otherId = destinationId === 'phanthiet' ? 'dalat' : 'phanthiet';
  const otherConfig = DESTINATIONS[otherId];

  console.log(`\n=== TEST TẤT CẢ MẪU | ${config.label.toUpperCase()} ===\n`);

  await fetch(`${API}/api/destination`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: destinationId }),
  });

  const [dataset, activeSheet, otherSheet] = await Promise.all([
    fetch(`${API}/api/guide-data?refresh=1`).then((r) => r.json()),
    fetchSheetNames(config),
    fetchSheetNames(otherConfig),
  ]);

  if (dataset?.source?.destinationId !== destinationId) {
    throw new Error(`Expected ${destinationId}, got ${dataset?.source?.destinationId}`);
  }

  console.log(`Pool: ${dataset.source?.totalItems} item | Sheet PT names: ${activeSheet.size}\n`);
  console.log(
    'Mẫu'.padEnd(28),
    'Item',
    'Khớp PT',
    'Lẫn ĐL',
    'Title',
    'Ghi chú',
  );
  console.log('-'.repeat(95));

  const titleFails = [];
  const dataFails = [];
  let totalItems = 0;
  let totalMatched = 0;
  let totalCross = 0;
  let emptyDecks = 0;

  for (const deck of dataset.decks || []) {
    const label = String(deck.navTitle || deck.id).slice(0, 27);
    const items = collectItems(deck);
    const titleHits = collectMarketingTexts(deck).filter(hasDalatMarker);

    let matched = 0;
    let cross = 0;
    let staticCount = 0;

    for (const item of items) {
      const key = normalizeName(item.rawName || item.name);
      if (!key) continue;
      totalItems += 1;
      if (STATIC_LABELS.has(key)) {
        staticCount += 1;
        continue;
      }
      if (activeSheet.has(key)) {
        matched += 1;
        totalMatched += 1;
      } else if (otherSheet.has(key)) {
        cross += 1;
        totalCross += 1;
      }
    }

    const titleOk = destinationId !== 'phanthiet' || titleHits.length === 0;
    const dataOk = cross === 0;
    const noteParts = [];

    if (items.length === 0) {
      emptyDecks += 1;
      noteParts.push('không có item');
    }
    if (!titleOk) {
      titleFails.push({ deck: label, hits: titleHits.slice(0, 2) });
      noteParts.push(`title: "${titleHits[0].slice(0, 50)}..."`);
    }
    if (!dataOk) {
      dataFails.push({ deck: label, cross });
      noteParts.push(`lẫn ${cross} item ĐL`);
    }
    if (staticCount > 0) noteParts.push(`${staticCount} dòng tĩnh budget`);

    const icon = titleOk && dataOk ? '✅' : '❌';
    console.log(
      `${icon} ${label.padEnd(26)}`,
      String(items.length).padStart(4),
      String(matched).padStart(7),
      String(cross).padStart(6),
      (titleOk ? 'OK' : 'SAI').padStart(5),
      noteParts.join('; ') || 'OK',
    );
  }

  console.log('\n--- TỔNG KẾT ---');
  console.log(`Mẫu: ${dataset.decks?.length || 0} | Có item: ${(dataset.decks?.length || 0) - emptyDecks} | Trống item: ${emptyDecks}`);
  console.log(`Item động: ${totalItems} | Khớp sheet ${config.label}: ${totalMatched} | Lẫn sheet ${otherConfig.label}: ${totalCross}`);
  console.log(`Title/mô tả sai (còn Đà Lạt): ${titleFails.length} mẫu`);
  console.log(`Dữ liệu lẫn ${otherConfig.label}: ${dataFails.length} mẫu`);

  if (titleFails.length) {
    console.log('\n❌ Title/mô tả cần sửa:');
    titleFails.forEach(({ deck, hits }) => {
      console.log(`  - ${deck}`);
      hits.forEach((h) => console.log(`      "${h.slice(0, 70)}"`));
    });
  }

  if (dataFails.length) {
    console.log('\n❌ Dữ liệu lẫn sheet kia:');
    dataFails.forEach(({ deck, cross }) => console.log(`  - ${deck}: ${cross} item`));
  }

  const pass = titleFails.length === 0 && dataFails.length === 0;
  console.log(`\n${pass ? '✅ PASS — title đúng, không lẫn dữ liệu Đà Lạt' : '❌ CÓ VẤN ĐỀ CẦN XEM LẠI'}`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
