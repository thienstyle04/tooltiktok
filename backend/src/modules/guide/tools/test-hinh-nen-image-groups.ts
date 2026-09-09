import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

import {
  buildSheetDriveManifest,
  classifyHinhNenImageGroup,
  emptySheetDriveManifest,
} from '../sync/sheet-drive-manifest';
import type { SheetWorkbookSource } from '../sync/workbook-source';

assert.equal(classifyHinhNenImageGroup('Ảnh mảng xanh'), 'green');
assert.equal(classifyHinhNenImageGroup('ẢNH TONE ĐEN'), 'dark');
assert.equal(classifyHinhNenImageGroup('Ảnh random'), 'random');
assert.equal(classifyHinhNenImageGroup('ảnh ramdom'), 'random');
assert.equal(classifyHinhNenImageGroup('ảnh 12'), 'default');

const rows = [
  ['STT', 'Link_drive', '', ''],
  ['1', 'Ảnh 1'],
  ['2', 'Ảnh mảng xanh'],
  ['3', 'Ảnh tone đen'],
  ['4', 'Ảnh random'],
  ['5', 'Ảnh ramdom'],
];
const sheet = XLSX.utils.aoa_to_sheet(rows);
sheet.D3 = { t: 's', v: 'Hook mảng xanh', l: { Target: 'https://docs.google.com/document/d/green-hook-doc-id/edit' } };
const ids = {
  default: 'default-file-id-0001',
  green: 'green-file-id-0001',
  dark: 'dark-file-id-0001',
  random: 'random-file-id-0001',
  ramdom: 'ramdom-file-id-0001',
};
Object.values(ids).forEach((id, index) => {
  const cell = sheet[XLSX.utils.encode_cell({ r: index + 1, c: 1 })];
  cell.l = { Target: 'https://drive.google.com/file/d/' + id + '/view' };
});
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, sheet, 'Hinh_nen');
const source: SheetWorkbookSource = {
  workbook,
  workbookName: 'test-hinh-nen.xlsx',
  destinationId: 'dalat',
  bytes: 1,
  fetchedAt: 1,
  sourceUrl: 'test',
  sourceType: 'runtime-xlsx',
};

async function main(): Promise<void> {
  const manifest = await buildSheetDriveManifest(source, emptySheetDriveManifest());
  assert.equal(manifest.version, 3);
  assert.equal(manifest.hookSourceGroups?.green, 'https://docs.google.com/document/d/green-hook-doc-id/edit');
  assert.deepEqual(manifest.coverImages.map((entry) => entry.fileId), [ids.default]);
  assert.deepEqual(manifest.coverImageGroups?.default.map((entry) => entry.fileId), [ids.default]);
  assert.deepEqual(manifest.coverImageGroups?.green.map((entry) => entry.fileId), [ids.green]);
  assert.deepEqual(manifest.coverImageGroups?.dark.map((entry) => entry.fileId), [ids.dark]);
  assert.deepEqual(
    new Set(manifest.coverImageGroups?.random.map((entry) => entry.fileId)),
    new Set([ids.random, ids.ramdom]),
  );
  const defaultIds = new Set(manifest.coverImages.map((entry) => entry.fileId));
  assert.ok(!defaultIds.has(ids.green));
  assert.ok(!defaultIds.has(ids.dark));
  assert.ok(!defaultIds.has(ids.random));
  assert.ok(!defaultIds.has(ids.ramdom));
  console.log('PASS Hinh_nen: tách pool ảnh và đọc đúng hyperlink Hook mảng xanh cùng dòng.');
}

void main();
