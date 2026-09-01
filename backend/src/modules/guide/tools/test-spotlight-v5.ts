import assert from 'node:assert/strict';
import type { GuideItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { buildSpotlightV5Pages, getV2DeckDefinitions, V2_DECK_IDS } from '../logic/deck-builder-v2';
import { setActiveDestinationLocalize } from '../sync/destination-localize';

const keys: SectionKey[] = ['quan_an','cafe','check_in','khu_du_lich','hoat_dong','dia_diem_lich_su','choi_dem','homestay','dich_vu'];
function item(sectionKey: SectionKey, n: number): GuideItem { const id = `${sectionKey}-${n}`; const imageUrl = `https://example.invalid/${id}.jpg`; return { id, sectionKey, sectionTitle: sectionKey, name: `Địa điểm ${n} ${sectionKey}`, address: `${n} Ngô Quyền, Cam Ly - Đà Lạt`, type: sectionKey, openHours:'', style:'', highlight:'', partnerFlag:'', isPartner:false, headPrice:'', hasHeadPriceColumn:false, price:'', phone:'', imageUrl, imageMapped:true, imageMappingKey:id, imageSource:'manual', candidateImageUrls:[imageUrl] }; }
const itemsBySection = Object.fromEntries(keys.map((key) => [key, key === 'homestay' || key === 'dich_vu' ? [] : Array.from({length: key === 'quan_an' ? 5 : 2}, (_,i) => item(key, i+1))])) as WorkbookItemsBySection;
const hinhNen = Array.from({length: 6}, (_,i) => `https://example.invalid/hinh-nen-${i+1}.jpg`);
setActiveDestinationLocalize('greenland');
assert.ok(!getV2DeckDefinitions({itemsBySection,imageUrls:[],libraryEntries:[],coverImageUrls:hinhNen}).some((d) => d.id === 'spotlight-v5'));
setActiveDestinationLocalize('dalat');
assert.ok(V2_DECK_IDS.includes('spotlight-v5'));
const usedItems = new Set<string>(); const usedImages = new Set<string>();
const build = (seed:string) => buildSpotlightV5Pages({itemsBySection,imageUrls:[],libraryEntries:[],coverImageUrls:hinhNen,globalUsedItemIds:usedItems,globalUsedImageUrls:usedImages}, seed);
const pages = build('v5-test-1'); assert.equal(pages.length,15); assert.equal(pages[0].layoutVariant,'spotlight-v5-cover'); assert.equal(pages[1].layoutVariant,'spotlight-v5-playlist'); assert.equal(pages.slice(2).every((p) => p.layoutVariant === 'spotlight-v5-place'), true); assert.equal(pages[0].title,'có nhạc rồi đi Đà Lạt thoiiii'); assert.equal((pages[1] as any).playlistLines.length,20);
const bg = pages.slice(0,2).map((p) => p.backgroundImage); assert.equal(new Set(bg).size,2); const places = pages.slice(2).map((p:any) => p.items[0]); assert.equal(new Set(places.map((x:any) => x.id)).size,13); assert.ok(places.every((x:any) => x.metaSecondary === '')); assert.ok(places.every((x:any) => !/^(?:Đường|Phường)\s/i.test(x.metaPrimary))); assert.equal(new Set(places.map((x:any) => x.imageUrl)).size,13); assert.ok(places.every((x:any) => !bg.includes(x.imageUrl))); const sourceSections = new Set(places.map((x:any) => x.sourceSectionKey)); for (const section of ['quan_an','cafe','check_in','khu_du_lich','hoat_dong','dia_diem_lich_su','choi_dem']) assert.ok(sourceSections.has(section), 'V5 phải có đại diện nhóm ' + section);
assert.throws(() => buildSpotlightV5Pages({itemsBySection,imageUrls:[],libraryEntries:[],coverImageUrls:[hinhNen[0]]},'short-bg'), /ít nhất 2 ảnh/);
assert.throws(() => buildSpotlightV5Pages({itemsBySection:{...itemsBySection, quan_an:[]},imageUrls:[],libraryEntries:[],coverImageUrls:hinhNen},'short-place'), /ít nhất 13 địa điểm/);
setActiveDestinationLocalize('greenland'); assert.throws(() => buildSpotlightV5Pages({itemsBySection,imageUrls:[],libraryEntries:[],coverImageUrls:hinhNen},'green'), /chỉ áp dụng cho Đà Lạt/);
console.log('PASS spotlight-v5 builder: 15 trang, hook/playlist cố định, pool địa điểm+ảnh không trùng, catalog chỉ Đà Lạt.');