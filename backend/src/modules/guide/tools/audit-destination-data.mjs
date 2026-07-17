/**
 * Kiểm tra dataset API có lấy đúng địa điểm từ Google Sheet của destination hay không.
 * Chạy (backend phải bật, đã chọn destination tương ứng):
 *   node backend/src/modules/guide/tools/audit-destination-data.mjs phanthiet
 */
import * as XLSX from 'xlsx';

const destinationId = process.argv[2] || 'phanthiet';
const API_BASE = process.env.TEST_API_URL?.replace(/\/api\/guide-data.*$/, '') || 'http://127.0.0.1:3000';

const DESTINATIONS = {
  dalat: {
    exportUrl: process.env.DALAT_FNB_EXPORT_URL
      || 'https://docs.google.com/spreadsheets/d/1-ECVLtuySSlCO5AShcJle1uP9j8XCA4l/export?format=xlsx',
    sheetUrl: process.env.DALAT_FNB_SHEET_URL
      || 'https://docs.google.com/spreadsheets/d/1-ECVLtuySSlCO5AShcJle1uP9j8XCA4l/edit',
    label: 'Đà Lạt',
  },
  phanthiet: {
    exportUrl: process.env.PHAN_THIET_FNB_EXPORT_URL
      || 'https://docs.google.com/spreadsheets/d/1l1HUVSkqVgj1udZmjtmjqZ3AeWEMgp0PI9kyBd-4CVw/export?format=xlsx',
    sheetUrl: process.env.PHAN_THIET_FNB_SHEET_URL
      || 'https://docs.google.com/spreadsheets/d/1l1HUVSkqVgj1udZmjtmjqZ3AeWEMgp0PI9kyBd-4CVw/edit',
    label: 'Phan Thiết',
  },
};

const ALIASES = { luu_tru: 'homestay' };
const NAME_KEYS = ['ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten'];

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
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function firstValue(row, keys) {
  for (const key of keys) {
    const v = String(row[key] ?? '').trim();
    if (v) return v;
  }
  return '';
}

function getMainList(deck) {
  return (deck?.lists || []).find((l) => /-main$/i.test(String(l?.id || ''))) || deck?.lists?.[0];
}

async function fetchSheetNames(config) {
  const res = await fetch(config.exportUrl, {
    headers: { Referer: config.sheetUrl, 'User-Agent': 'Destination audit' },
  });
  if (!res.ok) throw new Error(`Sheet HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const wb = XLSX.read(buf, { type: 'buffer' });
  const names = new Set();
  const bySection = {};

  for (const sheetName of wb.SheetNames) {
    const norm = normalizeText(sheetName);
    if (norm === 'hinh_nen') continue;
    const sectionKey = ALIASES[norm] || norm;
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rows.length < 2) continue;
    const headers = (rows[0] ?? []).map((h) => normalizeText(h));
    bySection[sectionKey] = bySection[sectionKey] || new Set();

    for (const rawRow of rows.slice(1)) {
      const row = {};
      headers.forEach((h, i) => { row[h] = String(rawRow[i] ?? '').trim(); });
      const name = firstValue(row, NAME_KEYS);
      if (!name) continue;
      const key = normalizeName(name);
      names.add(key);
      bySection[sectionKey].add(key);
    }
  }
  return { names, bySection, sheetCount: wb.SheetNames.length };
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

function collectDeckItems(deck) {
  const list = getMainList(deck);
  const items = [];
  for (const page of list?.pages || []) {
    if (page.type !== 'list') continue;
    for (const item of page.items || []) {
      items.push({
        name: String(item.name || '').trim(),
        rawName: String(item.rawName || item.name || '').trim(),
        id: String(item.id || '').trim(),
        sourceSectionKey: item.sourceSectionKey || '',
        page: page.chipText || page.title || '',
      });
    }
  }
  return { list, items };
}

/** Một số dòng tĩnh trong mẫu budget (xe bus ĐL) — không có trong sheet. */
const KNOWN_STATIC_LABELS = new Set([
  normalizeName('Di chuyển bằng xe Phương Trang SG - ĐL'),
  normalizeName('Check out, lên xe về lại SG'),
  normalizeName('Bến xe liên tỉnh Đà Lạt'),
]);

function main() {
  const config = DESTINATIONS[destinationId];
  if (!config) {
    console.error('Destination không hợp lệ:', destinationId);
    process.exit(1);
  }
  return (async () => {
    console.log(`\n=== AUDIT DỮ LIỆU HIỂN THỊ: ${config.label.toUpperCase()} ===\n`);

    const switched = await switchDestination(destinationId);
    console.log(`API active: ${switched.active?.label} (${switched.active?.id})`);
    console.log(`Dataset items: ${switched.dataset?.source?.totalItems}`);

    const [sheetData, dataset] = await Promise.all([
      fetchSheetNames(config),
      fetchDataset(),
    ]);

    if (dataset?.source?.destinationId !== destinationId) {
      throw new Error(`Dataset destinationId=${dataset?.source?.destinationId}, expected ${destinationId}`);
    }

    console.log(`Sheet tabs: ${sheetData.sheetCount}, tên unique trong sheet: ${sheetData.names.size}`);
    console.log(`Decks API: ${dataset.decks?.length || 0}\n`);

    const deckRows = [];
    let totalDynamic = 0;
    let totalMatched = 0;
    let totalStatic = 0;
    let totalMissing = 0;

    for (const deck of dataset.decks || []) {
      const { list, items } = collectDeckItems(deck);
      if (!list || items.length === 0) {
        deckRows.push({ deckId: deck.id, navTitle: deck.navTitle, items: 0, matched: 0, missing: 0, static: 0, samples: [] });
        continue;
      }

      let matched = 0;
      let missing = 0;
      let staticRows = 0;
      const missingSamples = [];

      for (const item of items) {
        const probe = normalizeName(item.rawName || item.name);
        if (!probe) continue;
        totalDynamic += 1;

        if (KNOWN_STATIC_LABELS.has(probe)) {
          staticRows += 1;
          totalStatic += 1;
          continue;
        }

        if (sheetData.names.has(probe)) {
          matched += 1;
          totalMatched += 1;
        } else {
          missing += 1;
          totalMissing += 1;
          if (missingSamples.length < 3) missingSamples.push(item.rawName || item.name);
        }
      }

      deckRows.push({
        deckId: deck.id,
        navTitle: deck.navTitle,
        pages: list.pages?.length || 0,
        items: items.length,
        matched,
        missing,
        static: staticRows,
        missingSamples,
      });
    }

    console.log('Deck'.padEnd(28), 'Trang', 'Item', 'Khớp sheet', 'Tĩnh', 'Lạ', 'Ghi chú');
    console.log('-'.repeat(95));
    for (const row of deckRows) {
      const note = row.missing > 0
        ? `VD lạ: ${row.missingSamples.join(' | ')}`
        : (row.items === 0 ? 'Không có item' : 'OK');
      console.log(
        String(row.navTitle || row.deckId).slice(0, 27).padEnd(28),
        String(row.pages || 0).padStart(4),
        String(row.items).padStart(4),
        String(row.matched).padStart(10),
        String(row.static).padStart(4),
        String(row.missing).padStart(3),
        note,
      );
    }

    console.log('\n--- TỔNG ---');
    console.log(`Item động (từ sheet): khớp ${totalMatched}/${totalDynamic - totalStatic}, tĩnh (budget bus) ${totalStatic}, không khớp sheet ${totalMissing}`);

    const homestayInSheet = sheetData.bySection.homestay?.size || 0;
    const homestayDeck = deckRows.find((r) => /homestay|luu tru|lưu trú/i.test(r.navTitle || r.deckId));
    console.log(`Tab lưu trú (luu_tru→homestay): ${homestayInSheet} dòng trong sheet`);

    const errors = [];
    if (totalMissing > 0) errors.push(`${totalMissing} item hiển thị không có trong sheet ${config.label}`);
    if (homestayInSheet === 0) errors.push('Sheet không có dữ liệu homestay/luu_tru');

    if (errors.length) {
      console.log('\n❌ PHÁT HIỆN VẤN ĐỀ:');
      errors.forEach((e) => console.log(' -', e));
      process.exitCode = 1;
    } else {
      console.log('\n✅ Các địa điểm hiển thị đều map về sheet', config.label, '(trừ dòng tĩnh budget bus).');
    }
  })();
}

main().catch((error) => {
  console.error('Audit failed:', error);
  process.exitCode = 1;
});
