// Đối tác bắt buộc: chọn theo tên, cùng định danh với backend/XLSX (tên chuẩn hóa).
export const MAX_REQUIRED_PARTNERS = 12;
const STORAGE_KEY = 'dalat-required-partners-v1';

const SECTION_LABELS = {
  quan_an: 'Ăn uống', cafe: 'Cà phê', homestay: 'Lưu trú', check_in: 'Check-in', dich_vu: 'Dịch vụ',
  choi_dem: 'Chơi đêm', hoat_dong: 'Hoạt động', dia_diem_lich_su: 'Di tích', khu_du_lich: 'Khu du lịch',
};

export function partnerKey(name) {
  return String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
}

export function sectionLabel(section) {
  return SECTION_LABELS[section] || String(section || '');
}

/** Gộp đối tác trùng tên (một quán có thể nằm ở nhiều nhóm Sheet). */
export function partnerOptions(partners) {
  const byKey = new Map();
  for (const partner of Array.isArray(partners) ? partners : []) {
    const key = partnerKey(partner?.name);
    if (!key) continue;
    const entry = byKey.get(key) || { key, name: String(partner.name).trim(), sections: [], address: String(partner.address || '').trim() };
    if (partner.section && !entry.sections.includes(partner.section)) entry.sections.push(partner.section);
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

/** Mẫu riêng (local-*) và mẫu đã ngừng không nhận đối tác bắt buộc. */
export function supportsRequiredPartners(deck) {
  return Boolean(deck?.id) && !deck.localTemplate && !deck.creationDisabled && deck.id !== 'spotlight-partner';
}

export function cleanRequiredPartners(names) {
  const seen = new Set(), result = [];
  for (const name of Array.isArray(names) ? names : []) {
    const text = String(name ?? '').trim(), key = partnerKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key); result.push(text);
  }
  return result.slice(0, MAX_REQUIRED_PARTNERS);
}

export function loadRequiredPartnerChoices() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return Object.fromEntries(Object.entries(saved && typeof saved === 'object' ? saved : {})
      .map(([key, names]) => [key, cleanRequiredPartners(names)]).filter(([, names]) => names.length));
  } catch { return {}; }
}

export function saveRequiredPartnerChoices(choices) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(choices)); } catch { /* still usable in this session */ }
}
