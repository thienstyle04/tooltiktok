import * as fs from 'node:fs';
import * as XLSX from 'xlsx';
import { composeAddress, firstValue, normalizeText, normalizeWorkbookHeaders } from '../logic/image-resolver';

// Needs real post-restructure sheet exports (bundled resources/workbooks predate ten_phuong).
// Usage: test-restructured-addresses.ts <dalat.xlsx> <greenland.xlsx>
const workbookPaths = process.argv.slice(2);
if (!workbookPaths.length) {
  console.log('SKIP restructured-addresses: pass exported sheet workbooks as arguments (external fixture)');
  process.exit(0);
}

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

  if (!checked) throw new Error(`${workbookPath}: no dia_chi + ten_phuong rows; not a restructured workbook`);
  console.log(`PASS ${workbookPath}: checked ${checked} ward prefixes, inferred ${inferredWardColumns} columns`);
}
