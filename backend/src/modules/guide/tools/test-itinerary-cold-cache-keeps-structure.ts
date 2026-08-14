import assert from 'node:assert/strict';

import type { GuideItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { buildPagesForDeck } from '../logic/deck-builder';

function item(sectionKey: SectionKey, index: number, type: string = sectionKey): GuideItem {
  const id = `${sectionKey}-${index}`;
  const imageUrl = `/assets/drive-file?id=cold-${id}`;
  return {
    id,
    sectionKey,
    sectionTitle: sectionKey,
    name: `Dia diem ${id}`,
    address: `${index} Da Lat`,
    type,
    openHours: '',
    style: '',
    highlight: '',
    partnerFlag: '',
    isPartner: false,
    headPrice: '',
    hasHeadPriceColumn: false,
    price: '',
    phone: '',
    imageUrl,
    imageMapped: true,
    imageMappingKey: id,
    imageSource: 'manual',
    candidateImageUrls: [imageUrl],
  };
}

const make = (sectionKey: SectionKey, count: number, type: string = sectionKey) =>
  Array.from({ length: count }, (_, index) => item(sectionKey, index + 1, type));

const food = [
  ...make('quan_an', 9, 'An sang'),
  ...Array.from({ length: 12 }, (_, index) => item('quan_an', index + 10, index % 2 ? 'An trua' : 'An toi')),
];

const itemsBySection: WorkbookItemsBySection = {
  check_in: make('check_in', 12, 'Check in mien phi'),
  khu_du_lich: make('khu_du_lich', 8),
  quan_an: food,
  cafe: make('cafe', 12),
  choi_dem: make('choi_dem', 8),
  homestay: make('homestay', 8),
  dich_vu: make('dich_vu', 8),
  hoat_dong: make('hoat_dong', 8),
  dia_diem_lich_su: make('dia_diem_lich_su', 8),
};

const pages = buildPagesForDeck(
  'itinerary-3n2d',
  itemsBySection,
  [],
  [],
  'cold-cache-structure',
  new Set<string>(),
  new Set<string>(),
  ['/assets/drive-file?id=cold-cover'],
);

assert.equal(pages.length, 6, 'Mau lich trinh 3N2D phai giu du 6 trang');
for (const [index, page] of pages.slice(1, 4).entries()) {
  assert.equal(page.type, 'list');
  assert.equal(page.items.length, 7, `Ngay ${index + 1} phai co du 7 moc lich trinh`);
  assert.equal(new Set(page.items.map((entry) => entry.id)).size, 7, `Ngay ${index + 1} khong duoc lap dia diem`);
  assert.ok(page.items.every((entry) => entry.imageSource === 'manual' && entry.imageUrl.includes('cold-')));
}

console.log('PASS itinerary-cold-cache: 3 ngay deu du 7 moc, khong co pool bi co theo cache may.');
