import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';

import { firstValue, normalizeText } from '../logic/image-resolver';
import { resolveSectionKeyFromSheetName } from '../sync/sheet-section';
import { parseWorkbookBuffer } from '../sync/workbook-source';

type Audit = {
  destinationId: string;
  rows: number;
  rowsWithImageLink: number;
  sections: Record<string, number>;
  names: Set<string>;
};

function audit(destinationId: string, fileName: string): Audit {
  const backendRoot = path.resolve(__dirname, '../../../..');
  const filePath = path.join(backendRoot, 'resources', 'workbooks', fileName);
  const source = parseWorkbookBuffer(fs.readFileSync(filePath), {
    workbookName: fileName,
    destinationId,
    sourceUrl: filePath,
    sourceType: 'bundled-xlsx',
  });
  const result: Audit = {
    destinationId: source.destinationId,
    rows: 0,
    rowsWithImageLink: 0,
    sections: {},
    names: new Set<string>(),
  };

  for (const sheetName of source.workbook.SheetNames) {
    const sectionKey = resolveSectionKeyFromSheetName(sheetName);
    if (!sectionKey) continue;
    const sheet = source.workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false, defval: '' });
    const headers = (rows[0] || []).map((header) => normalizeText(header));
    for (const [offset, rawRow] of rows.slice(1).entries()) {
      const rowMap: Record<string, string> = {};
      let hasImageLink = false;
      headers.forEach((header, columnIndex) => {
        const cell = sheet[XLSX.utils.encode_cell({ r: offset + 1, c: columnIndex })];
        const hyperlink = typeof cell?.l?.Target === 'string' ? cell.l.Target.trim() : '';
        rowMap[header] = String(rawRow[columnIndex] || '').trim();
        if (hyperlink && (header.includes('link') || header.includes('anh') || header.includes('hinh'))) {
          hasImageLink = true;
        }
      });
      const name = firstValue(rowMap, 'ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten');
      if (!name) continue;
      result.rows += 1;
      result.rowsWithImageLink += hasImageLink ? 1 : 0;
      result.sections[sectionKey] = (result.sections[sectionKey] || 0) + 1;
      result.names.add(normalizeText(name));
    }
  }
  return result;
}

const dalat = audit('dalat', 'dalat.xlsx');
const greenland = audit('greenland', 'greenland.xlsx');

for (const source of [dalat, greenland]) {
  assert.ok(source.rows >= 400, `${source.destinationId}: workbook phải có ít nhất 400 địa điểm`);
  assert.ok(Object.keys(source.sections).length >= 8, `${source.destinationId}: thiếu nhóm dữ liệu chính`);
  assert.ok(
    source.rowsWithImageLink / source.rows >= 0.95,
    `${source.destinationId}: quá nhiều dòng không có link ảnh (${source.rowsWithImageLink}/${source.rows})`,
  );
}
assert.notDeepEqual(dalat.sections, greenland.sections, 'Hai nguồn không được trỏ nhầm cùng một workbook');
assert.equal(dalat.destinationId, 'dalat');
assert.equal(greenland.destinationId, 'greenland');

console.log(
  `PASS xlsx-workbook-data: dalat=${dalat.rows} (${dalat.rowsWithImageLink} có link), `
  + `greenland=${greenland.rows} (${greenland.rowsWithImageLink} có link)`,
);
