import assert from 'node:assert/strict';
import { buildDiaryPages, diaryDescriptionLines, diaryImageId, diaryIdentity, DIARY_ORDER, DIARY_PARTNER_COUNT } from '../logic/spotlight-diary';
import type { GuideItem, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { buildPagesForDeckV2, buildV2MainList, V2_DECK_IDS } from '../logic/deck-builder-v2';
import { setActiveDestinationLocalize } from '../sync/destination-localize';
import { setSpotlightV3BuildContext, clearSpotlightV3BuildContext } from '../sync/spotlight-hook-source';
const image = (id: string) => '/assets/drive-file?id=' + id;
const item = (id: string, sectionKey: 'quan_an' | 'cafe' | 'check_in'): GuideItem => ({ id, name: id, sectionKey, isPartner: sectionKey !== 'check_in', imageUrl: image(id), imageSource: 'manual', diaryDescriptionRaw: 'View Đà Lạt đẹp\r\nQuán xinh\n\nQuán xinh', address: '07 Trần Quang Diệu' } as GuideItem);
const input = { destinationId: 'dalat', randomImages: ['r1','r2','r3'].map(image), hook: 'Hook chung', seed: 'test', itemsBySection: { quan_an: Array.from({length:4},(_,i)=>item('food'+i,'quan_an')), cafe: Array.from({length:4},(_,i)=>item('cafe'+i,'cafe')), check_in: [item('checkin', 'check_in')] } as WorkbookItemsBySection };
const pages = buildDiaryPages(input);
assert.equal(pages.length,12);
assert.deepEqual(pages.slice(3).map(p=>(p as any).items[0].sourceSectionKey),DIARY_ORDER);
assert.equal(new Set(pages.map(p=>diaryImageId(p.backgroundImage))).size,12);
assert.equal(pages.slice(3).filter(p=>(p as any).items[0].isPartner).length, DIARY_PARTNER_COUNT);
assert.equal((pages[11] as any).items[0].isPartner, false, 'A regular Check-in must not become a partner in XLSX');
assert.equal(new Set(pages.slice(3).map(p => diaryIdentity((p as any).items[0].name))).size, 9);
assert.deepEqual(diaryDescriptionLines('View Đà Lạt đẹp\r\nQuán xinh\nQuán xinh\nMột câu. Hai câu'),['View Đà Lạt đẹp','Quán xinh']);
assert.throws(()=>buildDiaryPages({...input,destinationId:'greenland'}),/Đà Lạt/);
assert.throws(()=>buildDiaryPages({...input,randomImages:[]}),/Random/);
assert.throws(()=>buildDiaryPages({...input,itemsBySection:{...input.itemsBySection,cafe:input.itemsBySection.cafe.slice(0,2)}}),/Cafe/);
const usedLines = Object.fromEntries(pages.slice(3).map(p=>[diaryIdentity((p as any).items[0].name),[p.title]]));
const next=buildDiaryPages({...input,usedLines});
assert.ok(next.slice(3).every(p=>!usedLines[diaryIdentity((p as any).items[0].name)].includes(p.title)));
assert.deepEqual(diaryDescriptionLines('Ăn mì ngon\nBánh ngon lắm\nView đẹp. quán xinh\nView Đà Lạt đẹp'), ['View Đà Lạt đẹp']);
assert.equal(diaryIdentity('Đà Lạt'), diaryIdentity('da lat'));
const sharedRandom = buildDiaryPages({ ...input, randomImages: [...input.randomImages, image('food0')] });
assert.equal(new Set(sharedRandom.map(p => diaryImageId(p.backgroundImage))).size, 12);
assert.throws(() => buildDiaryPages({ ...input, itemsBySection: { ...input.itemsBySection, quan_an: input.itemsBySection.quan_an.slice(0,3) } }), /Quán ăn/);
assert.throws(() => buildDiaryPages({ ...input, itemsBySection: { ...input.itemsBySection, cafe: input.itemsBySection.cafe.map(p => ({ ...p, imageUrl: image('same') })) } }), /không trùng/);
assert.throws(() => buildDiaryPages({ ...input, itemsBySection: { ...input.itemsBySection, cafe: input.itemsBySection.cafe.map(p => ({ ...p, diaryImageUrls: [] })) } }), /Cafe/, 'Do not use name-matched library photos instead of Link_drive');
assert.ok(V2_DECK_IDS.includes('spotlight-v6-diary'));
setActiveDestinationLocalize('dalat'); setSpotlightV3BuildContext({ hooks: ['Hook kiểm thử'] });
const common = { itemsBySection: input.itemsBySection, imageUrls: [], libraryEntries: [], coverImageUrls: [], hinhNenImagePools: { default: [], green: [], dark: [], random: input.randomImages } };
assert.equal(buildV2MainList('spotlight-v6-diary', common)?.canvasPreset, 'tiktok-3x4');
assert.equal(buildV2MainList('spotlight-v6-diary', common)?.pages.length, 12);
setActiveDestinationLocalize('greenland');
assert.throws(() => buildPagesForDeckV2('spotlight-v6-diary', input.itemsBySection, [], [], 'test', undefined, undefined, [], common.hinhNenImagePools), /Đà Lạt/);
setActiveDestinationLocalize('dalat'); clearSpotlightV3BuildContext();
const coldPreview = buildV2MainList('spotlight-v6-diary', common);
assert.equal(coldPreview?.pages.length, 12, 'Cold-start preview must not depend on async hook warmup');
assert.ok(coldPreview?.pages[0].title.trim());
assert.throws(() => buildDiaryPages({ ...input, hook: '' }), /hook chung/, 'Generated lists must still reject missing hooks');
assert.throws(() => buildDiaryPages({ ...input, itemsBySection: { ...input.itemsBySection, check_in: [] } }), /Check-in.*0\/1/);
assert.throws(() => buildDiaryPages({ ...input, itemsBySection: { ...input.itemsBySection, check_in: [{ ...input.itemsBySection.check_in[0], name: 'food0' }] } }), /không trùng.*food0 \(Quán ăn \+ Check-in\)/);
// All lines used: the cycle restarts but never repeats the line used by the previous list.
for (let seed = 0; seed < 8; seed++) {
  const cycled = buildDiaryPages({ ...input, seed: 'cycle-' + seed, usedLines: { food0: ['Quán xinh', 'View Đà Lạt đẹp'] } });
  assert.equal(cycled.find(p => (p as any).items?.[0]?.name === 'food0')?.title, 'Quán xinh', 'Cycle must skip the last used line');
}
// A partner without a usable Mo_ta line still fills its slot with "tên - địa chỉ".
const noDescription = buildDiaryPages({ ...input, itemsBySection: { ...input.itemsBySection,
  quan_an: [...input.itemsBySection.quan_an.slice(0, 3), { ...item('food9', 'quan_an'), diaryDescriptionRaw: '' }] } });
assert.equal(noDescription.find(p => (p as any).items?.[0]?.name === 'food9')?.title, 'food9 - 07 Trần Quang Diệu');
// Only 7 distinct partners (cafe0 is in both Quán ăn and Cafe): cafe0 fills one Quán ăn and one Cafe slot,
// with different photos and lines; all 8 partner slots and 12 distinct photos remain.
const sharedPartner = buildDiaryPages({ ...input, itemsBySection: { ...input.itemsBySection,
  quan_an: [...input.itemsBySection.quan_an.slice(0, 3), { ...item('cafe0', 'quan_an'), imageUrl: image('cafe0-food') }] } });
const cafe0Pages = sharedPartner.filter(p => (p as any).items?.[0]?.name === 'cafe0') as any[];
assert.deepEqual(cafe0Pages.map(p => p.items[0].sourceSectionKey).sort(), ['cafe', 'quan_an']);
assert.notEqual(cafe0Pages[0].backgroundImage, cafe0Pages[1].backgroundImage, 'Same venue twice uses different photos');
assert.notEqual(cafe0Pages[0].title, cafe0Pages[1].title, 'Same venue twice uses different lines');
assert.equal(sharedPartner.slice(3).filter(p => (p as any).items[0].isPartner).length, DIARY_PARTNER_COUNT);
assert.equal(new Set(sharedPartner.map(p => diaryImageId(p.backgroundImage))).size, 12);
assert.deepEqual(sharedPartner.slice(3).map(p => (p as any).items[0].sourceSectionKey), DIARY_ORDER);
// Normal data still prefers 8 different venues.
assert.equal(new Set(pages.slice(3, 11).map(p => diaryIdentity((p as any).items[0].name))).size, 8);
// A venue shared by food and cafe cannot count twice; use a fifth cafe candidate.
const sharedVenue = buildDiaryPages({ ...input, itemsBySection: { ...input.itemsBySection,
  cafe: [{ ...item('food0', 'cafe'), imageUrl: image('shared-food-cafe') }, ...input.itemsBySection.cafe] } });
assert.equal(new Set(sharedVenue.slice(3).map(p => diaryIdentity((p as any).items[0].name))).size, 9);
const partnerCheckin = buildDiaryPages({ ...input, itemsBySection: { ...input.itemsBySection,
  check_in: [{ ...input.itemsBySection.check_in[0], isPartner: true }] } });
assert.equal(partnerCheckin.slice(3).filter(p => (p as any).items[0].isPartner).length, 9, 'Preserve a Check-in partner flag when it really belongs to a partner');
console.log('PASS diary core: 12 pages, 4 food/4 cafe partners + 1 Check-in, distinct venues/images, line boundaries, rotation and shortage errors.');
