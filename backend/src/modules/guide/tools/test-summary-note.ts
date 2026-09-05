import assert from 'node:assert/strict';
import type { GuideItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { buildSummaryNotePages, summaryNoteDefaultCaption, V2_DECK_IDS } from '../logic/deck-builder-v2';
import { setActiveDestinationLocalize } from '../sync/destination-localize';
const item = (sectionKey: SectionKey, index: number, isPartner = false): GuideItem => ({ id:`${sectionKey}-${index}`, sectionKey, sectionTitle:sectionKey, name:`${sectionKey} ${index}`, address:`${index} Ngô Quyền, Cam Ly - Đà Lạt`, type:sectionKey, openHours:'', style:'', highlight:'', partnerFlag:isPartner?'x':'', isPartner, headPrice:'', hasHeadPriceColumn:false, price:'', phone:'', imageUrl:'', imageMapped:false, imageMappingKey:'', imageSource:'fallback', candidateImageUrls:[] });
const itemsBySection = { quan_an:[item('quan_an',1,true),item('quan_an',2,true),item('quan_an',3),item('quan_an',4)], cafe:[item('cafe',1,true),item('cafe',2,true),item('cafe',3),item('cafe',4)], homestay:[],check_in:[],dich_vu:[],choi_dem:[],hoat_dong:[],dia_diem_lich_su:[],khu_du_lich:[] } as WorkbookItemsBySection;
assert.ok(V2_DECK_IDS.includes('summary-note'));
setActiveDestinationLocalize('dalat');
const caption = summaryNoteDefaultCaption();
assert.equal(caption.split('\n').length, 3);
assert.ok(caption.includes('Em sắp có chuyến đi Đà Lạt vào tuần tới ạ'));
assert.equal(caption.includes('#'), false);
for (const destination of ['dalat','greenland'] as const) { setActiveDestinationLocalize(destination); const pages=buildSummaryNotePages({itemsBySection,imageUrls:[],libraryEntries:[],coverImageUrls:[],globalUsedItemIds:new Set<string>()},`summary-note-${destination}`); assert.equal(pages.length,1); assert.equal(pages[0].layoutVariant,'summary-note-page'); assert.equal(pages[0].canvasPreset,'tiktok-9x16'); assert.equal(pages[0].items.length,8); assert.equal(pages[0].items.filter((entry)=>entry.sourceSectionKey === 'cafe').length,4); assert.equal(pages[0].items.filter((entry)=>entry.sourceSectionKey === 'quan_an').length,4); assert.equal(pages[0].items.filter((entry)=>entry.sourceSectionKey === 'cafe' && entry.isPartner).length,2); assert.equal(pages[0].items.filter((entry)=>entry.sourceSectionKey === 'quan_an' && entry.isPartner).length,2); assert.ok(pages[0].title.includes(destination==='dalat'?'Đà Lạt':'Green Land')); assert.ok(pages[0].items.every((entry)=>entry.imageUrl===''&&entry.metaSecondary==='')); }
setActiveDestinationLocalize('dalat'); console.log('PASS summary-note: một trang, 8 Cafe/Quán ăn, 2 đối tác mỗi nhóm, text-only và 9:16 cho cả hai destination.');

