import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GuideService } from '../guide.service';
import { buildThreadsCafePages, buildThreadsFoodPages, buildThreadsMixPages, buildThreadsMixTextPages } from '../logic/threads-food-local';
import { buildV2MainList } from '../logic/deck-builder-v2';
import { parseWorkbookBuffer } from '../sync/workbook-source';

const workbookPath = path.resolve(process.cwd(), 'data', 'workbook-cache.dalat.xlsx');
assert.ok(fs.existsSync(workbookPath), `Không có workbook cache Đà Lạt: ${workbookPath}`);
const source = parseWorkbookBuffer(fs.readFileSync(workbookPath), {
  workbookName: path.basename(workbookPath), destinationId: 'dalat', sourceUrl: workbookPath, sourceType: 'runtime-xlsx',
});
const service = new GuideService() as any;
const imageMapping = service.loadImageMapping();
const itemsBySection = service.loadWorkbookItems(
  source.workbook, [], imageMapping, service.loadImageLibraryEntries(imageMapping), service.loadSheetDriveManifest(),
);
const foods = itemsBySection.quan_an || [];
const partnerCount = foods.filter((item: { isPartner: boolean; address: string }) => item.isPartner && item.address?.trim()).length;
const localCount = foods.filter((item: { isPartner: boolean; classification: string }) => !item.isPartner && item.classification?.toLowerCase() === 'local').length;
const pages = buildThreadsFoodPages(itemsBySection, 'live-smoke');
assert.equal(pages.length, 1);
assert.equal(pages[0].type, 'list');
if (pages[0].type !== 'list') throw new Error('Expected list page');
assert.equal(pages[0].items.filter((item) => item.isPartner).length, 5);
assert.equal(pages[0].items.filter((item) => item.isLocal).length, 5);
assert.equal(pages[0].items.filter((item) => item.imageUrl).length, 6);
assert.ok(pages[0].items.filter((item) => item.isPartner).every((item) => item.metaPrimary));
console.log(`Threads food live OK: ${partnerCount} đối tác có địa chỉ, ${localCount} quán Local; list 5+5, 6 ảnh.`);

const cafes = itemsBySection.cafe || [];
const cafePartnerCount = cafes.filter((item: { isPartner: boolean; address: string }) => item.isPartner && item.address?.trim()).length;
const cafeLocalCount = cafes.filter((item: { isPartner: boolean; classification: string }) => !item.isPartner && item.classification?.toLowerCase() === 'local').length;
const cafePages = buildThreadsCafePages(itemsBySection, 'live-cafe-smoke');
assert.equal(cafePages.length, 1);
assert.equal(cafePages[0].type, 'list');
if (cafePages[0].type !== 'list') throw new Error('Expected cafe list page');
assert.equal(cafePages[0].items.filter((item) => item.isPartner).length, 5);
assert.equal(cafePages[0].items.filter((item) => item.isLocal).length, 5);
assert.equal(cafePages[0].items.filter((item) => item.imageUrl).length, 6);
assert.ok(cafePages[0].items.every((item) => item.sourceSectionKey === 'cafe'));
assert.ok(cafePages[0].items.filter((item) => item.isPartner).every((item) => item.metaPrimary));
const cafeMain = buildV2MainList('threads-cafe-local', {
  itemsBySection, imageUrls: [], libraryEntries: [], coverImageUrls: [],
});
assert.ok(cafeMain, 'Mẫu cà phê phải có list xem trước trong thư viện.');
assert.equal(cafeMain.pages.length, 1);
assert.ok(String(cafeMain.postCaption || '').includes('cà phê'));
console.log(`Threads cafe live OK: ${cafePartnerCount} đối tác có địa chỉ, ${cafeLocalCount} quán Local; list 5+5, 6 ảnh.`);

const mixedPages = buildThreadsMixPages(itemsBySection, 'live-mix-smoke');
assert.equal(mixedPages.length, 1);
assert.equal(mixedPages[0].type, 'list');
if (mixedPages[0].type !== 'list') throw new Error('Expected mixed list page');
assert.equal(mixedPages[0].items.length, 10);
assert.equal(mixedPages[0].items.filter((item) => item.isPartner).length, 5);
assert.equal(mixedPages[0].items.filter((item) => item.imageUrl).length, 6);
assert.equal(new Set(mixedPages[0].items.filter((item) => item.imageUrl).map((item) => item.imageUrl)).size, 6);
assert.ok(new Set(mixedPages[0].items.map((item) => item.sourceSectionKey)).size >= 4);
assert.equal(new Set(mixedPages[0].items.map((item) => item.name)).size, 10);
const mixedMain = buildV2MainList('threads-mix-local', {
  itemsBySection, imageUrls: [], libraryEntries: [], coverImageUrls: [],
});
assert.ok(mixedMain, 'Mẫu tổng hợp phải có list xem trước trong thư viện.');
assert.equal(mixedMain.pages.length, 1);
console.log(`Threads mix live OK: ${new Set(mixedPages[0].items.map((item) => item.sourceSectionKey)).size} nhóm, 5 đối tác + 5 địa điểm thường, 6 ảnh.`);

const textPages = buildThreadsMixTextPages(itemsBySection, 'live-mix-text-smoke');
assert.equal(textPages.length, 1);
assert.equal(textPages[0].type, 'list');
if (textPages[0].type !== 'list') throw new Error('Expected text-only mixed list page');
assert.equal(textPages[0].items.length, 12);
assert.equal(textPages[0].items.filter((item) => item.isPartner).length, 6);
assert.equal(textPages[0].items.filter((item) => item.imageUrl).length, 0);
assert.ok(new Set(textPages[0].items.map((item) => item.sourceSectionKey)).size >= 4);
const textMain = buildV2MainList('threads-mix-text', {
  itemsBySection, imageUrls: [], libraryEntries: [], coverImageUrls: [],
});
assert.ok(textMain, 'Mẫu tổng hợp chữ phải có list xem trước trong thư viện.');
assert.equal(textMain.pages.length, 1);
console.log(`Threads text-only live OK: ${new Set(textPages[0].items.map((item) => item.sourceSectionKey)).size} nhóm, 6 đối tác + 6 địa điểm thường, 0 ảnh.`);
