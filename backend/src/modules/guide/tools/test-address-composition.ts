import { composeAddress } from '../logic/image-resolver';

const cases: Array<[string, string, string]> = [
  ['41 Đào Duy Từ', 'Xuân Hương - Đà Lạt', '41 Đào Duy Từ, Xuân Hương - Đà Lạt'],
  ['41 Đào Duy Từ', 'Phường Xuân Hương', '41 Đào Duy Từ, Phường Xuân Hương'],
  ['Đường Nguyễn Khuyến', 'Cam Ly - Đà Lạt', 'Đường Nguyễn Khuyến, Cam Ly - Đà Lạt'],
  ['33 Ngô Quyền', '', '33 Ngô Quyền'],
];

for (const [address, ward, expected] of cases) {
  const actual = composeAddress(address, ward);
  if (actual !== expected) {
    throw new Error(`Expected "${expected}", got "${actual}"`);
  }
  console.log(`PASS ${actual}`);
}
