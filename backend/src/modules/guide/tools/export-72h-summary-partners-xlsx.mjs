/**
 * Xuất danh sách đối tác (isPartner=true) đang xuất hiện trong bảng chi phí của
 * mẫu "72H Tổng hợp" (deckId: budget-72h-summary) ra file .xlsx.
 *
 * Chỉ lấy theo NGUỒN DỮ LIỆU ĐANG ACTIVE hiện tại (không tự đổi destination),
 * quét qua tất cả list hiện có (main + list đã tạo) của nguồn đó.
 *
 *   node backend/src/modules/guide/tools/export-72h-summary-partners-xlsx.mjs
 *
 * Env:
 *   OUT_FILE=... (mặc định: backend/reports/doi-tac-72h-tong-hop-<nguon>-<timestamp>.xlsx)
 */
import { utils as XLSXUtils, write as writeXLSX } from '../../../../node_modules/xlsx/xlsx.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const DECK_ID = 'budget-72h-summary';
const DESTINATION_LABELS = { dalat: 'Đà Lạt', greenland: 'Green Land', phanthiet: 'Phan Thiết' };

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(180000),
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 200) }; }
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${String(body.message || body.raw || text).slice(0, 180)}`);
  return body;
}

function parseDayTime(label) {
  const [day = '', time = ''] = String(label || '').split('|');
  return { day: day.trim(), time: time.trim() };
}

async function main() {
  // Không gọi POST /api/destination — chỉ đọc nguồn đang active hiện tại, tránh làm đổi
  // dữ liệu người dùng đang xem trên giao diện.
  const data = await api('/api/guide-data');
  const destinationId = data?.source?.destinationId || 'unknown';
  const destinationLabel = DESTINATION_LABELS[destinationId] || data?.source?.destinationLabel || destinationId;

  console.log(`\n=== XUẤT ĐỐI TÁC "72H Tổng hợp" -> XLSX | nguồn đang active: ${destinationLabel} ===\n`);

  const deck = (data.decks || []).find((d) => d.id === DECK_ID);
  if (!deck) throw new Error(`Không tìm thấy deck ${DECK_ID} trong dataset hiện tại.`);

  const rows = [];
  for (const list of deck.lists || []) {
    const tablePage = (list.pages || []).find((p) => p.type === 'list');
    if (!tablePage) continue;
    for (const item of tablePage.items || []) {
      if (!item.isPartner) continue;
      const { day, time } = parseDayTime(item.label);
      rows.push({
        List: list.title || list.id,
        'List ID': list.id,
        Ngày: day,
        'Thời gian': time,
        'Tên đối tác': item.name || '',
        'Địa chỉ': item.metaPrimary || '',
        'Chi phí': item.metaSecondary || '',
      });
    }
  }

  console.log(`Nguồn ${destinationLabel}: ${rows.length} dòng đối tác trong bảng chi phí (trên ${deck.lists?.length || 0} list).`);

  const workbook = XLSXUtils.book_new();
  const worksheet = XLSXUtils.json_to_sheet(rows, {
    header: ['List', 'List ID', 'Ngày', 'Thời gian', 'Tên đối tác', 'Địa chỉ', 'Chi phí'],
  });
  worksheet['!cols'] = [
    { wch: 26 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 34 }, { wch: 30 }, { wch: 14 },
  ];
  XLSXUtils.book_append_sheet(workbook, worksheet, 'Doi tac 72H Tong hop');

  const outDir = join(__dirname, '..', '..', '..', '..', 'reports');
  mkdirSync(outDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = process.env.OUT_FILE || join(outDir, `doi-tac-72h-tong-hop-${destinationId}-${timestamp}.xlsx`);
  const buffer = writeXLSX(workbook, { type: 'buffer', bookType: 'xlsx' });
  writeFileSync(outFile, buffer);

  console.log(`\nĐã ghi ${rows.length} dòng đối tác (nguồn: ${destinationLabel}) vào: ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
