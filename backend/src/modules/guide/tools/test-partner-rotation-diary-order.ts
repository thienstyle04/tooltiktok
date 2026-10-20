import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GuideDeckList, GuideItem, PartnerRotationHistory, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';

// Diary: mọi trang địa điểm dùng chung layout, nhưng DIARY_ORDER cố định nhóm
// (quán ăn/cafe) của từng trang. Xoay vòng đối tác chỉ được đổi trang cùng nhóm.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'partner-rotation-diary-'));
process.env.DALAT_DATA_DIR = root;
// Máy đang dùng: 4 nguồn dựng sẵn với link giả (code không chứa link thật).
require('../../../../../scripts/test-support/source-links-fixture.cjs').seedSourceLinks(process.env.DALAT_DATA_DIR as string);
process.env.DALAT_DRIVE_FILE_CACHE_DIR = path.join(root, 'cache');
const { rotatePartnerList } = require('../logic/partner-rotation');
const { DIARY_ORDER } = require('../logic/spotlight-diary');

const item = (sectionKey: string, n: number): GuideItem => ({
  id: `${sectionKey}-${n}`, name: `${sectionKey} ${n}`, sectionKey, address: '12 Đường thử, Xuân Hương - Đà Lạt',
  isPartner: true, imageSource: 'manual', imageMapped: true,
  imageUrl: `/assets/drive-file?id=${sectionKey}-${n}-0`,
  candidateImageUrls: Array.from({ length: 3 }, (_, i) => `/assets/drive-file?id=${sectionKey}-${n}-${i}`),
} as GuideItem);
const pools = { quan_an: [1, 2, 3, 4].map(n => item('quan_an', n)), cafe: [1, 2, 3, 4].map(n => item('cafe', n)), check_in: [{ ...item('check_in', 1), isPartner: false }] };
const counters = { quan_an: 0, cafe: 0, check_in: 0 };
const diaryPage = (source: GuideItem) => ({
  type: 'list', chipText: '', chipTone: 'slate', title: source.name, subtitle: '', backgroundImage: '',
  layoutVariant: 'spotlight-v6-diary-page',
  items: [{ ...source, sourceSectionKey: source.sectionKey, rawName: source.name, label: '', metaPrimary: source.address,
    metaSecondary: '', imageNote: '' }],
});
const list: GuideDeckList = {
  id: 'diary-test', navTitle: 'diary-test', title: 'Diary', description: '',
  pages: DIARY_ORDER.map((sectionKey: 'quan_an' | 'cafe' | 'check_in') => diaryPage(pools[sectionKey][counters[sectionKey]++])),
} as GuideDeckList;
const sectionsOf = (deck: GuideDeckList) => deck.pages.map((page: any) => page.items[0].sourceSectionKey);
assert.deepEqual(sectionsOf(list), [...DIARY_ORDER]);

let history: PartnerRotationHistory = {};
let moved = false;
for (let i = 0; i < 8; i++) {
  const next = rotatePartnerList(list, 'spotlight-v6-diary', pools as WorkbookItemsBySection, history, `seed-${i}`, 1);
  assert.deepEqual(sectionsOf(next.list), [...DIARY_ORDER], `Lần xoay ${i + 1} phá thứ tự quán ăn/cafe của Diary`);
  moved ||= next.list.pages.some((page: any, index: number) => page.items[0].id !== (list.pages[index] as any).items[0].id);
  history = next.history;
}
assert.ok(moved, 'Đối tác vẫn phải được đổi vị trí trong cùng nhóm');

// Chỉ 7 đối tác khác nhau: quán có cả Quán ăn và Cafe chiếm một ô mỗi nhóm. Hai ô dùng hai ảnh khác nhau,
// không lặp ảnh của list liền trước, hết ảnh thì quay vòng dùng lại ảnh cũ.
const sharedRow = (sectionKey: string, photos: number[]): GuideItem => ({ ...item(sectionKey, 9), id: `${sectionKey}-shared`, name: 'Quán chung',
  imageUrl: `/assets/drive-file?id=shared-${photos[0]}`, candidateImageUrls: photos.map(n => `/assets/drive-file?id=shared-${n}`) } as GuideItem);
const sharedPools = { quan_an: [...pools.quan_an.slice(0, 3), sharedRow('quan_an', [0, 1])], cafe: [...pools.cafe.slice(0, 3), sharedRow('cafe', [2, 3])], check_in: pools.check_in };
const sharedCounters = { quan_an: 0, cafe: 0, check_in: 0 };
const sharedList: GuideDeckList = { ...list, id: 'diary-shared', pages: DIARY_ORDER.map((sectionKey: 'quan_an' | 'cafe' | 'check_in') => {
  const page = diaryPage(sharedPools[sectionKey][sharedCounters[sectionKey]++]);
  return { ...page, backgroundImage: page.items[0].imageUrl };
}) } as GuideDeckList;
let sharedHistory: PartnerRotationHistory = {}, previous: string[] = [];
const seenPhotos = new Set<string>();
for (let i = 0; i < 8; i++) {
  const next = rotatePartnerList(sharedList, 'spotlight-v6-diary', sharedPools as WorkbookItemsBySection, sharedHistory, `shared-${i}`, 7, 8);
  assert.deepEqual(sectionsOf(next.list), [...DIARY_ORDER]);
  const photos = next.list.pages.filter((page: any) => page.items[0].name === 'Quán chung').map((page: any) => page.items[0].imageUrl);
  assert.equal(photos.length, 2, 'Quán chung ở cả ô Quán ăn và Cafe');
  assert.notEqual(photos[0], photos[1], `List ${i + 1}: hai ô của cùng quán dùng hai ảnh khác nhau`);
  assert.ok(photos.every((url: string) => !previous.includes(url)), `List ${i + 1}: không lặp ảnh của list liền trước`);
  next.list.pages.forEach((page: any) => assert.equal(page.backgroundImage, page.items[0].imageUrl));
  assert.deepEqual(next.list.warnings, [], 'Không cảnh báo "giữ vị trí" cho quán ở cả hai nhóm');
  photos.forEach((url: string) => seenPhotos.add(url));
  previous = photos; sharedHistory = next.history;
}
assert.equal(seenPhotos.size, 4, 'Dùng hết 4 ảnh rồi quay vòng');
fs.rmSync(root, { recursive: true, force: true });
console.log('PASS diary partner rotation: pages only swap within quan_an/cafe, DIARY_ORDER kept across 8 rotations');
