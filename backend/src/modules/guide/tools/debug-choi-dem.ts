import * as XLSX from 'xlsx';
import { fetchWorkbookFromSheet } from '../sync/workbook-source';
import { firstValue, normalizeText } from '../logic/image-resolver';

async function main() {
  const src = await fetchWorkbookFromSheet();
  console.log('All sheets:', src.workbook.SheetNames.map((n) => JSON.stringify(n)).join(', '));

  for (const sheetName of src.workbook.SheetNames) {
    const norm = normalizeText(sheetName);
    if (!norm.includes('choi')) continue;

    console.log('\n===', sheetName, '===');
    console.log('normalized:', norm);
    console.log('in SECTION_CONFIG:', norm in { choi_dem: 1 });

    const sheet = src.workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false, defval: '' });
    console.log('total rows (incl header):', rows.length);

    const rawHeaders = (rows[0] ?? []).map((h) => String(h));
    const headers = rawHeaders.map((h) => normalizeText(h));
    console.log('raw headers:', rawHeaders.join(' | '));
    console.log('norm headers:', headers.join(' | '));

    let anyContent = 0;
    let withTenQuan = 0;
    let withTen = 0;
    let withTenDiaDiem = 0;
    let withHoatDong = 0;

    for (const rawRow of rows.slice(1)) {
      const rowMap: Record<string, string> = {};
      headers.forEach((header, index) => {
        rowMap[header] = String(rawRow[index] ?? '').trim();
      });
      const hasAny = Object.values(rowMap).some((v) => v);
      if (hasAny) anyContent += 1;
      if (rowMap.ten_quan) withTenQuan += 1;
      if (rowMap.ten) withTen += 1;
      if (rowMap.ten_dia_diem) withTenDiaDiem += 1;
      if (rowMap.hoat_dong) withHoatDong += 1;
    }

    console.log('rows with any content:', anyContent);
    console.log('ten_quan:', withTenQuan, '| ten:', withTen, '| ten_dia_diem:', withTenDiaDiem, '| hoat_dong:', withHoatDong);
    console.log('firstValue match:', rows.slice(1).filter((rawRow) => {
      const rowMap: Record<string, string> = {};
      headers.forEach((header, index) => { rowMap[header] = String(rawRow[index] ?? '').trim(); });
      return !!firstValue(rowMap, 'ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten');
    }).length);

    for (const [i, rawRow] of rows.slice(1, 6).entries()) {
      const rowMap: Record<string, string> = {};
      headers.forEach((header, index) => { rowMap[header] = String(rawRow[index] ?? '').trim(); });
      console.log(`sample row ${i + 2} by index:`);
      (rawRow ?? []).forEach((cell, col) => {
        const val = String(cell ?? '').trim();
        if (val) console.log(`  col[${col}] = ${val.slice(0, 80)}`);
      });
      const linkCell = sheet[XLSX.utils.encode_cell({ r: i + 1, c: 8 })];
      if (linkCell?.l?.Target) console.log(`  link_drive hyperlink: ${linkCell.l.Target}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
