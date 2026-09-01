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
  let namedRows = 0;
  let wardPrefixRows = 0;
  let displayPrefixRows = 0;
  let addressPrefixRows = 0;
  let samples = 0;

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: false, defval: '' });
    if (!rows.length) continue;
    const headers = normalizeWorkbookHeaders(rows[0] ?? []);
    for (const rawRow of rows.slice(1)) {
      const row: Record<string, string> = {};
      headers.forEach((header, index) => { row[header] = String(rawRow[index] ?? '').replace(/\s+/g, ' ').trim(); });
      const name = firstValue(row, 'ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten');
      if (!name) continue;
      namedRows += 1;
      const rawAddress = firstValue(row, 'dia_chi');
      const ward = firstValue(row, 'ten_phuong');
      const display = composeAddress(rawAddress, ward);
      const wardHasPrefix = /^(?:phường|phuong)\s+/iu.test(ward);
      const addressHasPrefix = /(^|[,;]\s*)(?:phường|phuong)\s+/iu.test(rawAddress);
      const displayHasPrefix = /(^|[,;]\s*)(?:phường|phuong)\s+/iu.test(display);
      if (wardHasPrefix) wardPrefixRows += 1;
      if (addressHasPrefix) addressPrefixRows += 1;
      if (displayHasPrefix) displayPrefixRows += 1;
      if ((wardHasPrefix || addressHasPrefix) && samples < 20) {
        console.log(`${sheetName} | ${name} | Dia_chi="${rawAddress}" | Ten_phuong="${ward}" | Hien_thi="${display}"`);
        samples += 1;
      }
    }
  }

  console.log(`SUMMARY ${workbookPath}: rows=${namedRows}, wardPrefixes=${wardPrefixRows}, addressPrefixes=${addressPrefixRows}, displayPrefixes=${displayPrefixRows}`);
}
