// Tool tạm: kiểm tra cột "đối tác" trong Google Sheet hiện tại.
// Chạy: cd backend && npx ts-node src/modules/guide/tools/inspect-partner-values.ts
import 'dotenv/config';
import * as XLSX from 'xlsx';
import { fetchWorkbookFromSheet } from '../sync/workbook-source';

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function firstValue(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = (row[key] ?? '').trim();
    if (value) return value;
  }
  return '';
}

const SUPPORTED_SHEETS = new Set([
  'quan_an', 'cafe', 'homestay', 'check_in', 'dich_vu',
  'choi_dem', 'hoat_dong', 'dia_diem_lich_su', 'khu_du_lich',
]);

async function main(): Promise<void> {
  console.log('Đang tải workbook từ Google Sheet...');
  const source = await fetchWorkbookFromSheet();
  console.log(`✓ Tải xong: ${source.workbookName} (${source.bytes} bytes)\n`);

  const allRowSummary: Array<{
    sheet: string;
    name: string;
    raw: string;
    normalized: string;
    isPartnerCurrent: boolean;
  }> = [];
  const sheetsSkipped: string[] = [];
  const sheetsMissingColumn: Array<{ sheet: string; headers: string[] }> = [];

  for (const sheetName of source.workbook.SheetNames) {
    const normSheet = normalizeText(sheetName);
    if (!SUPPORTED_SHEETS.has(normSheet)) {
      sheetsSkipped.push(`${sheetName}  →  ${normSheet}`);
      continue;
    }

    const sheet = source.workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
      header: 1, raw: false, defval: '',
    });
    if (rows.length === 0) continue;

    const headers = (rows[0] ?? []).map((h) => normalizeText(h));
    const hasPartnerCol = headers.includes('doi_tac') || headers.includes('doi_tac_cong_ty');
    if (!hasPartnerCol) {
      sheetsMissingColumn.push({ sheet: sheetName, headers });
    }

    for (const rawRow of rows.slice(1)) {
      const rowMap: Record<string, string> = {};
      headers.forEach((header, index) => {
        rowMap[header] = String(rawRow[index] ?? '').trim();
      });
      const rawName = firstValue(rowMap, 'ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten');
      if (!rawName) continue;
      const partner = firstValue(rowMap, 'doi_tac', 'doi_tac_cong_ty');
      if (!partner) continue; // chỉ quan tâm dòng có giá trị trong cột đối tác
      allRowSummary.push({
        sheet: normSheet,
        name: rawName,
        raw: partner,
        normalized: normalizeText(partner),
        isPartnerCurrent: normalizeText(partner) === 'x',
      });
    }
  }

  console.log('─── SHEETS BỊ BỎ QUA (không match SECTION_CONFIG) ───');
  if (sheetsSkipped.length === 0) console.log('  (không có)');
  else sheetsSkipped.forEach((s) => console.log(`  • ${s}`));

  console.log('\n─── SHEETS THIẾU CỘT đối tác ───');
  if (sheetsMissingColumn.length === 0) console.log('  (không có)');
  else {
    sheetsMissingColumn.forEach((s) => {
      console.log(`  • ${s.sheet}`);
      console.log(`    headers: ${s.headers.join(', ')}`);
    });
  }

  // Gom nhóm theo giá trị raw (sau trim) để xem có bao nhiêu biến thể
  const byRaw = new Map<string, { count: number; isPartner: boolean; samples: Array<{ sheet: string; name: string }> }>();
  for (const row of allRowSummary) {
    const key = row.raw;
    const entry = byRaw.get(key) ?? { count: 0, isPartner: row.isPartnerCurrent, samples: [] };
    entry.count += 1;
    if (entry.samples.length < 3) entry.samples.push({ sheet: row.sheet, name: row.name });
    byRaw.set(key, entry);
  }

  console.log('\n─── PHÂN BỐ GIÁ TRỊ RAW TRONG CỘT đối tác ───');
  const sorted = [...byRaw.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [raw, info] of sorted) {
    const status = info.isPartner ? '✓ NHẬN' : '✗ BỎ QUA';
    console.log(`  ${status}  | "${raw}"  | ${info.count} dòng  | normalized="${normalizeText(raw)}"`);
    info.samples.forEach((s) => console.log(`           - [${s.sheet}] ${s.name}`));
  }

  const totalWithValue = allRowSummary.length;
  const totalRecognized = allRowSummary.filter((r) => r.isPartnerCurrent).length;
  const totalDropped = totalWithValue - totalRecognized;

  console.log('\n─── TỔNG KẾT ───');
  console.log(`  Tổng dòng có giá trị trong cột đối tác : ${totalWithValue}`);
  console.log(`  Được nhận là đối tác (isPartner=true) : ${totalRecognized}`);
  console.log(`  Bị bỏ qua (giá trị ≠ 'x' sau normalize): ${totalDropped}`);

  if (totalDropped > 0) {
    console.log('\n─── DANH SÁCH DÒNG BỊ BỎ QUA ───');
    allRowSummary
      .filter((r) => !r.isPartnerCurrent)
      .forEach((r) => {
        console.log(`  • [${r.sheet}] "${r.name}"  → raw="${r.raw}"  normalized="${r.normalized}"`);
      });
  }
}

main().catch((error: unknown) => {
  console.error('Inspect partner values failed.', error);
  process.exitCode = 1;
});
