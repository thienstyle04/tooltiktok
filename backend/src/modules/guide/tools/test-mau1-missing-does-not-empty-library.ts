import assert from 'node:assert/strict';
import type { GuideItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { getV2DeckDefinitions } from '../logic/deck-builder-v2';

const sectionKeys: SectionKey[] = [
  'quan_an', 'cafe', 'homestay', 'check_in', 'dich_vu',
  'choi_dem', 'hoat_dong', 'dia_diem_lich_su', 'khu_du_lich',
];
const itemsBySection = Object.fromEntries(sectionKeys.map((sectionKey) => [
  sectionKey,
  Array.from({ length: 24 }, (_, index): GuideItem => {
    const id = `${sectionKey}-${index}`;
    const imageUrl = `https://example.invalid/${id}.jpg`;
    return {
      id, sectionKey, sectionTitle: sectionKey, name: id, address: `Địa chỉ ${index}`,
      type: sectionKey, openHours: '', style: '', highlight: '', partnerFlag: '', isPartner: false,
      headPrice: '', hasHeadPriceColumn: false,
      price: sectionKey === 'check_in' ? '50.000' : '',
      phone: '', imageUrl, imageMapped: true, imageMappingKey: id, imageSource: 'manual',
      candidateImageUrls: [imageUrl],
    };
  }),
])) as WorkbookItemsBySection;

const library = getV2DeckDefinitions({
  itemsBySection,
  imageUrls: [],
  libraryEntries: [],
  coverImageUrls: Array.from({ length: 20 }, (_, index) => `https://example.invalid/cover-${index}.jpg`),
});
assert.ok(library.length > 5, 'Thư viện V2 phải vẫn có nhiều mẫu');
assert.equal(library.some((deck) => deck.id === 'carousel-mau-1'), false, 'Mẫu 1 phải được ẩn khỏi thư viện');
assert.ok(library.every((deck) => deck.lists.length > 0), 'Các mẫu còn hiển thị phải có list chính');
console.log('PASS carousel-mau-1 hidden: other templates remain available');
