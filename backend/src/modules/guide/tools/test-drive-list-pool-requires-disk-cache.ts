import assert from 'node:assert/strict';
import { GuideItem, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { createDeckBuildPools } from '../logic/deck-builder';

const item = (id: string, imageUrl: string): GuideItem => ({
  id,
  sectionKey: 'quan_an',
  sectionTitle: 'Quán ăn',
  name: id,
  address: 'Đà Lạt',
  type: 'Quán ăn',
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
});

const sections = (items: GuideItem[]): WorkbookItemsBySection => ({
  check_in: [], khu_du_lich: [], quan_an: items, cafe: [], choi_dem: [],
  homestay: [], dich_vu: [], hoat_dong: [], dia_diem_lich_su: [],
});

const first = item('first', '/assets/drive-file?id=first-file');
const second = item('second', '/assets/drive-file?id=second-file');

assert.deepEqual(
  createDeckBuildPools(sections([first, second])).foodItems.map((entry) => entry.id),
  ['first', 'second'],
  'Cache lanh khong duoc lam co pool va pha so luong slot cua mau',
);

console.log('PASS drive-list-pool: cache lanh van giu nguyen cau truc pool tao list.');
