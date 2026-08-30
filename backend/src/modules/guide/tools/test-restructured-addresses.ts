import * as fs from 'node:fs';
import * as XLSX from 'xlsx';
import { composeAddress, firstValue, normalizeText, normalizeWorkbookHeaders } from '../logic/image-resolver';

const workbookPaths = [
  'C:/Users/thien/AppData/Local/Temp/dalat-sheet-audit-20260829/dalat.xlsx',
  'C:/Users/thien/AppData/Local/Temp/dalat-sheet-audit-20260829/greenland.xlsx',
];

for (const workbookPath of workbookPaths) {
  if (!fs.existsSync(workbookPath)) throw new Error(`Missing workbook: ${workbookPath}`);
  const workbook = XLSX.readFile(workbookPath, { cellText: false, cellDates: false });
  let checked = 0;
  let inferredWardColumns = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
    if (!rows.length) continue;
    const rawHeaders = rows[0] ?? [];
    const headers = normalizeWorkbookHeaders(rawHeaders);
    const rawNormalized = rawHeaders.map((header) => normalizeText(header));
    if (!rawNormalized.includes('ten_phuong') && headers.includes('ten_phuong')) inferredWardColumns += 1;

    for (const rawRow of rows.slice(1)) {
      const row: Record<string, string> = {};
      headers.forEach((header, index) => { row[header] = String(rawRow[index] ?? '').trim(); });
      const address = firstValue(row, 'dia_chi');
      const ward = firstValue(row, 'ten_phuong');
      const name = firstValue(row, 'ten_quan', 'ten_dia_diem', 'ten');
      if (/d.?lart\s+garden/i.test(name)) console.log(`  SOURCE ${sheetName}:`, JSON.stringify(row));
      if (!address || !ward) continue;
      const composed = composeAddress(address, ward);
      if (!composed.endsWith(ward)) throw new Error(`${workbookPath} / ${sheetName}: source ward changed in "${composed}"`);
      console.log(`  ${sheetName}: ${composed}`);
      checked += 1;
    }
  }

  console.log(`PASS ${workbookPath}: checked ${checked} ward prefixes, inferred ${inferredWardColumns} columns`);
}
