import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GuideService } from '../guide.service';
import { buildItineraryNoteTimedPages } from '../logic/itinerary-note-timed';
import { parseWorkbookBuffer } from '../sync/workbook-source';
import { emptySheetDriveManifest } from '../sync/sheet-drive-manifest';

const workbookPath = path.resolve(process.cwd(), 'data', 'workbook-cache.dalat.xlsx');
assert.ok(fs.existsSync(workbookPath), `Không có workbook cache Đà Lạt: ${workbookPath}`);
const source = parseWorkbookBuffer(fs.readFileSync(workbookPath), {
  workbookName: path.basename(workbookPath), destinationId: 'dalat', sourceUrl: workbookPath, sourceType: 'runtime-xlsx',
});
const service = new GuideService() as any;
const itemsBySection = service.loadWorkbookItems(source.workbook, [], { version: 1, instructions: [], mappings: [] }, [], emptySheetDriveManifest());
const used = new Set<string>();
const lists = [1, 2].map((number) => buildItineraryNoteTimedPages({ itemsBySection, globalUsedItemIds: used }, `live-${number}`));

for (const [listIndex, pages] of lists.entries()) {
  assert.equal(pages.length, 2);
  assert.deepEqual(pages.map((page) => page.items.length), [8, 7]);
  assert.deepEqual(pages.map((page) => page.items.filter((item) => item.isPartner).length), [4, 3]);
  const venues = pages.flatMap((page) => page.items).filter((item) => !item.fixedRow);
  assert.equal(venues.length, 13);
  assert.equal(new Set(venues.map((item) => item.rawName)).size, 13);
  assert.equal(new Set(venues.filter((item) => item.isPartner).map((item) => item.rawName)).size, 7);
  console.log(`List ${listIndex + 1}: ${venues.filter((item) => item.isPartner).map((item) => item.rawName).join(' | ')}`);
}

const firstNames = new Set(lists[0].flatMap((page) => page.items).filter((item) => !item.fixedRow).map((item) => item.rawName));
const secondNames = lists[1].flatMap((page) => page.items).filter((item) => !item.fixedRow).map((item) => item.rawName);
assert.ok(secondNames.some((name) => !firstNames.has(name)), 'List thứ hai phải luân phiên được ít nhất một địa điểm mới.');
console.log('PASS live timed itinerary: tạo read-only 2 list từ workbook-cache.dalat.xlsx, đúng 4/3 đối tác và 13 địa điểm không trùng mỗi list.');
