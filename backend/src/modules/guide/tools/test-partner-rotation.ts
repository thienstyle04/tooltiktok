import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GuideItem, GuideDeckList, PartnerRotationHistory, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'partner-rotation-unit-'));
process.env.DALAT_DATA_DIR = root;
process.env.DALAT_DRIVE_FILE_CACHE_DIR = path.join(root, 'cache');
const { bootstrapPartnerHistory, rotatePartnerList, restrictRotationPhotos, partnerIdentity, sourcePhotoId } = require('../logic/partner-rotation');
const item = (n: number, photos = 3, sectionKey = 'quan_an', partner = true): GuideItem => ({
  id: `${sectionKey}-${n}`, name: `${sectionKey} ${n}`, sectionKey, address: '12 Đường thử, Xuân Hương - Đà Lạt',
  isPartner: partner, imageSource: 'manual', imageMapped: true,
  imageUrl: `/assets/drive-file?id=${sectionKey}-${n}-0`,
  candidateImageUrls: Array.from({ length: photos }, (_, i) => `/assets/drive-file?id=${sectionKey}-${n}-${i}`),
} as GuideItem);
const pageItem = (source: GuideItem, photo = true) => ({ ...source, sourceSectionKey: source.sectionKey,
  rawName: source.name, label: '', metaPrimary: source.address, metaSecondary: '', imageNote: '',
  imageUrl: photo ? source.imageUrl : '', candidateImageUrls: photo ? source.candidateImageUrls : [] });
const makeList = (sources: GuideItem[], id = 'test-caption-01'): GuideDeckList => ({
  id, navTitle: id, title: 'Thử riêng', description: '', pages: [{ type: 'list',
    chipText: '', chipTone: 'slate', title: '', subtitle: '', backgroundImage: '', layoutVariant: 'grid-4',
    items: sources.map(source => pageItem(source)) }],
});
const pool = (sources: GuideItem[]) => ({ quan_an: sources } as WorkbookItemsBySection);
const sources = [1, 2, 3, 4].map(n => item(n));
let history: PartnerRotationHistory = {};
const chosen = new Map<string, string[]>();
for (let i = 0; i < 9; i++) {
  const original = makeList(sources, `test-caption-${i}`), snapshot = JSON.stringify(original);
  const next = rotatePartnerList(original, 'grid-4', pool(sources), history, 'fixed', 4);
  assert.equal(JSON.stringify(original), snapshot, 'Do not mutate saved/input pages');
  const items = (next.list.pages[0] as any).items;
  items.forEach((venue: any, index: number) => {
    const key = partnerIdentity(sources.find(source => source.id === venue.id)!);
    if (history[key]) assert.notEqual(index + 1, history[key].position);
    const used = chosen.get(key) || [], photo = sourcePhotoId(venue.imageUrl);
    if (used.length) assert.notEqual(photo, used[used.length - 1]);
    if (used.length % 3) assert.ok(!used.slice(Math.floor(used.length / 3) * 3).includes(photo));
    chosen.set(key, [...used, photo]);
  });
  history = next.history;
}
assert.equal(history[partnerIdentity(sources[0])].cycle, 3);
const single = item(8, 1), first = rotatePartnerList(makeList([single]), 'grid-4', pool([single]), {}, 'a');
assert.throws(() => rotatePartnerList(makeList([single]), 'grid-4', pool([single]), first.history, 'b'), /1 ảnh hợp lệ/);
const fixed = item(9, 2), fixedFirst = rotatePartnerList(makeList([fixed]), 'grid-4', pool([fixed]), {}, 'a');
const fixedNext = rotatePartnerList(makeList([fixed]), 'grid-4', pool([fixed]), fixedFirst.history, 'b');
assert.match(fixedNext.list.warnings.join(' '), /một vị trí/);
assert.notEqual((fixedNext.list.pages[0] as any).items[0].imageUrl, (fixedFirst.list.pages[0] as any).items[0].imageUrl);
assert.throws(() => rotatePartnerList(makeList([item(15, 3, 'quan_an', false)]), 'grid-4', pool([]), {}, 'x'), /đối tác hợp lệ/);
const noPhoto = makeList([single]); (noPhoto.pages[0] as any).items[0].imageUrl = '';
assert.doesNotThrow(() => rotatePartnerList(noPhoto, 'summary-note', pool([single]), first.history, 'txt'));
assert.equal(restrictRotationPhotos(pool([single]), first.history).quan_an.length, 0);
assert.equal(restrictRotationPhotos(pool([single]), first.history, true).quan_an.length, 1);
assert.equal(restrictRotationPhotos(pool([single]), first.history, true).quan_an[0].imageUrl, '');
const saved = [makeList(sources, 'test-main'), makeList(sources, 'test-caption-1'), makeList([...sources].reverse(), 'test-caption-2')];
const savedSnapshot = JSON.stringify(saved), bootstrapped = bootstrapPartnerHistory(saved, 'grid-4', sources);
assert.equal(bootstrapped[partnerIdentity(sources[0])].position, 4);
assert.equal(JSON.stringify(saved), savedSnapshot);
assert.deepEqual(bootstrapPartnerHistory([], 'grid-4', sources, bootstrapped), bootstrapped);
const expanded = [...sources[0].candidateImageUrls!, '/assets/drive-file?id=added-photo'];
const added = { ...sources[0], candidateImageUrls: expanded };
const state = { [partnerIdentity(added)]: { position: 1, lastPhotos: [sourcePhotoId(expanded[2])], usedPhotos: expanded.slice(0, 3).map(sourcePhotoId), cycle: 1 } };
const extra = rotatePartnerList(makeList([added]), 'grid-4', pool([added]), state, 'new');
assert.equal((extra.list.pages[0] as any).items[0].imageUrl, expanded[3]);
assert.equal(sourcePhotoId('/assets/color-edit?source=' + encodeURIComponent(expanded[0])), sourcePhotoId(expanded[0]));
// Venue+map are moved together; map IDs never count as partner photos.
const paired = makeList(sources.slice(0, 2)); paired.pages = sources.slice(0, 2).flatMap(source => [
  { ...paired.pages[0], layoutVariant: 'spotlight-v6-map-page', backgroundImage: `/assets/drive-file?id=map-${source.id}`,
    items: [{ ...pageItem(source), isPartner: false, imageUrl: `/assets/drive-file?id=map-${source.id}` }] },
  { ...paired.pages[0], layoutVariant: 'spotlight-v6-map-place', backgroundImage: source.imageUrl, items: [pageItem(source)] },
]) as any;
const pair1 = rotatePartnerList(paired, 'spotlight-v6-maps', pool(sources), {}, 'maps');
const pair2 = rotatePartnerList(paired, 'spotlight-v6-maps', pool(sources), pair1.history, 'maps');
for (let i = 0; i < 4; i += 2) assert.equal((pair2.list.pages[i] as any).items[0].rawName, (pair2.list.pages[i + 1] as any).items[0].rawName);
// A scarce photograph is reserved for B; A must take its alternative rather
// than failing because a greedy, seeded pick happened to steal B's only image.
const sharedUrl = '/assets/drive-file?id=shared-photo', separateUrl = '/assets/drive-file?id=separate-photo';
const a = { ...item(31), imageUrl: sharedUrl, candidateImageUrls: [sharedUrl, separateUrl] };
const b = { ...item(32), imageUrl: sharedUrl, candidateImageUrls: [sharedUrl] };
for (let i = 0; i < 8; i++) {
  const matched = rotatePartnerList(makeList([a, b]), 'grid-4', pool([a, b]), {}, 'photo-matching-' + i);
  const selected = (matched.list.pages[0] as any).items;
  assert.equal(selected.find((venue: any) => venue.id === a.id).imageUrl, separateUrl);
  assert.equal(selected.find((venue: any) => venue.id === b.id).imageUrl, sharedUrl);
}
// A source photograph used in the cover belongs to the partner's cycle too.
const covered = makeList([fixed]); covered.pages.unshift({ type: 'cover', title: '', subtitle: '', backgroundImage: fixed.imageUrl, coverImages: [fixed.imageUrl] } as any);
const cover1 = rotatePartnerList(covered, 'grid-4', pool([fixed]), {}, 'cover1');
const cover2 = rotatePartnerList(covered, 'grid-4', pool([fixed]), cover1.history, 'cover2');
assert.equal(cover2.list.pages[0].backgroundImage, (cover2.list.pages[1] as any).items[0].imageUrl);
assert.notEqual(cover2.list.pages[0].backgroundImage, cover1.list.pages[0].backgroundImage);
// Reordered rows cannot assign an old venue's history to a new venue sharing ID.
const reordered = { ...sources[1], id: sources[0].id };
const historical = bootstrapPartnerHistory([makeList([sources[0]])], 'grid-4', [reordered]);
assert.ok(!historical[partnerIdentity(reordered)]);
// The same venue changing worksheet category is still the same partner.
const restaurant = item(61, 2), cafeRow = { ...restaurant, id: 'cafe-61', sectionKey: 'cafe' } as GuideItem;
assert.equal(partnerIdentity(restaurant), partnerIdentity(cafeRow));
const category1 = rotatePartnerList(makeList([restaurant]), 'grid-4', { quan_an: [restaurant], cafe: [cafeRow] }, {}, 'category1');
const category2 = rotatePartnerList(makeList([cafeRow]), 'grid-4', { quan_an: [restaurant], cafe: [cafeRow] }, category1.history, 'category2');
assert.notEqual((category1.list.pages[0] as any).items[0].imageUrl, (category2.list.pages[0] as any).items[0].imageUrl);
// A singleton partner on a mixed grid has regular slots available: it must
// move, not claim a false fixed-position exception.
const mixedSources = [item(41), item(42, 3, 'quan_an', false), item(43, 3, 'quan_an', false)];
const mixed1 = rotatePartnerList(makeList(mixedSources), 'grid-4', pool(mixedSources), {}, 'mixed1');
const mixed2 = rotatePartnerList(makeList(mixedSources), 'grid-4', pool(mixedSources), mixed1.history, 'mixed2');
assert.notEqual(mixed1.history[partnerIdentity(mixedSources[0])].position, mixed2.history[partnerIdentity(mixedSources[0])].position);
assert.deepEqual(mixed2.list.warnings, []);
// Reordering never swaps a breakfast venue into a dinner/time slot. Same-role
// venues can exchange days while each day's quota remains unchanged.
const meals = [item(51), item(52), item(53), item(54)];
const schedule = makeList(meals); schedule.pages = [0, 1].map(day => ({ ...(schedule.pages[0] as any), chipText: `Ngày ${day + 1}`, items: [
  { ...pageItem(meals[day * 2]), label: 'Ăn sáng', metaSecondary: 'Ăn sáng', scheduleTime: '08:00' },
  { ...pageItem(meals[day * 2 + 1]), label: 'Ăn tối', metaSecondary: 'Ăn tối', scheduleTime: '18:00' },
] }));
const meal1 = rotatePartnerList(schedule, 'itinerary-3n2d', pool(meals), {}, 'meals1');
const meal2 = rotatePartnerList(schedule, 'itinerary-3n2d', pool(meals), meal1.history, 'meals2');
for (const page of meal2.list.pages as any[]) {
  assert.ok([meals[0].id, meals[2].id].includes(page.items[0].id));
  assert.ok([meals[1].id, meals[3].id].includes(page.items[1].id));
  assert.equal(page.items[0].scheduleTime, '08:00'); assert.equal(page.items[1].scheduleTime, '18:00');
}
console.log('PASS partner rotation: matching, 3 image cycles, singleton warning, TXT exception, source IDs, bootstrap, new photos, maps blocks. ROOT=' + root);
