import { SectionConfigEntry, SectionKey } from './types';

export const SECTION_CONFIG: Record<SectionKey, SectionConfigEntry> = {
  quan_an: { title: 'Ăn uống', accent: 'terracotta' },
  cafe: { title: 'Cafe', accent: 'gold' },
  homestay: { title: 'Lưu trú', accent: 'pine' },
  check_in: { title: 'Check-in', accent: 'berry' },
  dich_vu: { title: 'Dịch vụ', accent: 'slate' },
  dia_diem_lich_su: { title: 'Lịch sử', accent: 'gold' },
  khu_du_lich: { title: 'Khu du lịch', accent: 'pine' },
};
