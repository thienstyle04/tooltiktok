// ─── Nguồn "Lấy từ server": JSON /api/guide-data (PostgreSQL) → workbook như Google Sheet ───
// Server chỉ có địa điểm (tên, địa chỉ, đối tác, giá, mô tả, link Drive). Phần server chưa có
// (tab Hinh_nen, Luu_y, cột Chu_de, Anh_GG_maps) được ghép từ workbook Sheet Đà Lạt đang có trên máy,
// khớp theo tên địa điểm. Sau khi đổi, workbook đi tiếp đúng quy trình của nguồn Sheet.
import * as XLSX from 'xlsx';
import { BadRequestException } from '@nestjs/common';
import type { SectionKey } from '../../../common/interfaces/guide.types';
import { normalizeText, normalizeWorkbookHeaders } from '../logic/image-resolver';
import { resolveSectionKeyFromSheetName } from './sheet-section';

export const SERVER_GUIDE_DATA_MAX_BYTES = 20 * 1024 * 1024;

interface ServerItem {
  id?: unknown; name?: unknown; category?: unknown; address?: unknown; ward?: unknown; district?: unknown; city?: unknown;
  models?: unknown; classification?: unknown; styles?: unknown; highlights?: unknown; description?: unknown;
  openingHours?: unknown; priceRange?: unknown; pricePerPerson?: unknown; phone?: unknown; isPartner?: unknown;
  direction?: unknown; driveUrl?: unknown;
}
interface ServerDeck { id?: unknown; catalogKey?: unknown; label?: unknown; items?: unknown; lists?: unknown }
export interface ServerGuideData { decks?: unknown; source?: { totalItems?: unknown } }

// Nhóm server → tab của tool (ưu tiên catalogKey nếu đúng tên nhóm).
const DECK_SECTIONS: Record<string, SectionKey> = {
  food: 'quan_an', cafe: 'cafe', stay: 'homestay', attraction: 'khu_du_lich', checkin: 'check_in',
  activity: 'hoat_dong', service: 'dich_vu', nightlife: 'choi_dem',
};
const SECTION_SHEETS: Record<SectionKey, string> = {
  quan_an: 'Quan_an', cafe: 'Cafe', homestay: 'Homestay', check_in: 'Check_in', dich_vu: 'Dich_vu',
  choi_dem: 'Choi_dem', hoat_dong: 'Hoat_dong', dia_diem_lich_su: 'Dia_diem_lich_su', khu_du_lich: 'Khu_du_lich',
};
// Cột "loại" quyết định kiểu địa điểm như Sheet: Quán ăn dùng Mo_hinh, Dịch vụ/Chơi đêm dùng Loai_dich_vu,
// Quán ăn/Cafe/Khu du lịch có Phong_cach; nhóm khác không có các cột này (giữ đúng hành vi của Sheet).
const TYPE_COLUMN: Partial<Record<SectionKey, 'Mo_hinh' | 'Loai_dich_vu'>> = { quan_an: 'Mo_hinh', dich_vu: 'Loai_dich_vu', choi_dem: 'Loai_dich_vu' };
const STYLE_SECTIONS = new Set<SectionKey>(['quan_an', 'cafe', 'khu_du_lich']);
const COMMON_COLUMNS = ['Ten_quan', 'Dia_chi', 'Ten_phuong', 'Gio_mo_cua', 'Gia', 'Gia_dau_nguoi', 'Thoi_diem', 'Huong_di', 'Phan_loai',
  'Doi_tac', 'Mon_an_noi_bat', 'Mo_ta', 'SDT', 'Link_drive', 'Chu_de', 'Anh_GG_maps'];
// Danh sách con chung của mọi nhóm, không phải bữa ăn/thời điểm.
const GENERIC_LISTS = new Set(['tat_ca', 'doi_tac']);

const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value)).replace(/\s+/g, ' ').trim();
const textList = (value: unknown): string[] => (Array.isArray(value) ? value : value ? [value] : []).map(text).filter(Boolean);

export function isGoogleDocsUrl(value: string): boolean {
  try { return new URL(value).hostname === 'docs.google.com'; } catch { return false; }
}

/** Link server hợp lệ: http(s), không phải Google Sheet/Docs. Bỏ khoảng trắng và #fragment. */
export function parseServerSourceUrl(value: unknown): { sourceUrl: string } {
  const raw = String(value ?? '').trim();
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new BadRequestException('Link server không hợp lệ.'); }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new BadRequestException('Link server phải bắt đầu bằng http:// hoặc https://.');
  if (parsed.hostname === 'docs.google.com') throw new BadRequestException('Đây là link Google Sheet; hãy chọn “Link Google Sheet”.');
  parsed.hash = '';
  return { sourceUrl: parsed.toString() };
}

function sectionFor(deck: ServerDeck): SectionKey | null {
  const catalog = normalizeText(text(deck.catalogKey));
  if (catalog && resolveSectionKeyFromSheetName(catalog)) return resolveSectionKeyFromSheetName(catalog);
  return DECK_SECTIONS[normalizeText(text(deck.id))] || null;
}

/** Cột Chủ đề/ảnh Maps của Sheet Đà Lạt theo tên địa điểm (ưu tiên cùng nhóm). */
function supplementColumns(workbook: XLSX.WorkBook | null): Map<string, { theme: string; maps: string }> {
  const result = new Map<string, { theme: string; maps: string }>();
  if (!workbook) return result;
  for (const sheetName of workbook.SheetNames) {
    const section = resolveSectionKeyFromSheetName(sheetName);
    if (!section) continue;
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false, defval: '' });
    const headers = normalizeWorkbookHeaders(rows[0] ?? []);
    const at = (name: string) => headers.indexOf(name);
    const nameColumn = ['ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten'].map(at).find(index => index >= 0) ?? -1;
    const themeColumn = ['chu_de', 'chude'].map(at).find(index => index >= 0) ?? -1;
    const mapsColumn = at('anh_gg_maps');
    if (nameColumn < 0 || (themeColumn < 0 && mapsColumn < 0)) continue;
    rows.slice(1).forEach((row, offset) => {
      const name = normalizeText(text(row[nameColumn]));
      if (!name) return;
      const mapsCell = mapsColumn >= 0 ? sheet[XLSX.utils.encode_cell({ r: offset + 1, c: mapsColumn })] : undefined;
      const maps = text(mapsCell?.l?.Target) || text(row[mapsColumn]);
      const theme = themeColumn >= 0 ? text(row[themeColumn]) : '';
      if (!theme && !maps) return;
      for (const key of [`${section}|${name}`, `*|${name}`]) if (!result.has(key)) result.set(key, { theme, maps });
    });
  }
  return result;
}

/**
 * Đổi JSON server thành workbook XLSX theo đúng tab/cột của Sheet. `supplement` là workbook Sheet Đà Lạt
 * (có thể null) để lấy tab Hinh_nen, Luu_y và cột Chu_de, Anh_GG_maps mà server chưa có.
 */
export function serverGuideDataToWorkbook(data: ServerGuideData, supplement: XLSX.WorkBook | null = null): { workbook: XLSX.WorkBook; buffer: Buffer; itemCount: number } {
  if (!data || typeof data !== 'object' || !Array.isArray(data.decks)) throw new Error('Dữ liệu server không đúng định dạng (thiếu danh sách nhóm "decks").');
  const extra = supplementColumns(supplement);
  const rowsBySection = new Map<SectionKey, string[][]>();
  let itemCount = 0;
  for (const deck of data.decks as ServerDeck[]) {
    if (!deck || typeof deck !== 'object' || !Array.isArray(deck.items)) continue;
    const section = sectionFor(deck);
    if (!section) continue;
    // Tên danh sách con chứa địa điểm (Ăn sáng, View Check In…): cột Mo_hinh/Thoi_diem như Sheet.
    const listLabels = new Map<string, string[]>();
    for (const list of Array.isArray(deck.lists) ? deck.lists as Array<{ id?: unknown; label?: unknown; itemIds?: unknown }> : []) {
      const label = text(list?.label);
      if (!label || GENERIC_LISTS.has(normalizeText(label)) || GENERIC_LISTS.has(normalizeText(text(list?.id)))) continue;
      for (const id of Array.isArray(list.itemIds) ? list.itemIds : []) listLabels.set(text(id), [...(listLabels.get(text(id)) || []), label]);
    }
    const typeColumn = TYPE_COLUMN[section];
    const header = [...(typeColumn ? [typeColumn] : []), ...(STYLE_SECTIONS.has(section) ? ['Phong_cach'] : []), ...COMMON_COLUMNS];
    const rows = rowsBySection.get(section) || [header];
    for (const item of deck.items as ServerItem[]) {
      const name = text(item?.name);
      if (!name) continue;
      itemCount += 1;
      const lists = listLabels.get(text(item.id)) || [];
      const models = textList(item.models);
      const merged = extra.get(`${section}|${normalizeText(name)}`) || extra.get(`*|${normalizeText(name)}`);
      const values: Record<string, string> = {
        Mo_hinh: (models.length ? models : lists).join(', '),
        Loai_dich_vu: (models.length ? models : textList(item.category)).join(', '),
        Phong_cach: textList(item.styles).join(', '),
        Ten_quan: name,
        Dia_chi: text(item.address),
        // Như Sheet: "Phường - Thành phố" (vd "Xuân Hương - Đà Lạt").
        Ten_phuong: [text(item.ward) || text(item.district), text(item.city)].filter(Boolean).join(' - '),
        Gio_mo_cua: text(item.openingHours),
        Gia: text(item.priceRange),
        Gia_dau_nguoi: text(item.pricePerPerson),
        Thoi_diem: lists.join(', '),
        Huong_di: text(item.direction),
        Phan_loai: text(item.classification),
        Doi_tac: item.isPartner === true || normalizeText(text(item.isPartner)) === 'true' ? 'X' : '',
        Mon_an_noi_bat: textList(item.highlights).join(', '),
        // Giữ xuống dòng: Nhật ký lấy từng dòng mô tả.
        Mo_ta: String(item.description ?? '').trim(),
        SDT: text(item.phone),
        Link_drive: text(item.driveUrl),
        Chu_de: merged?.theme || '',
        Anh_GG_maps: merged?.maps || '',
      };
      rows.push(header.map(column => values[column] ?? ''));
    }
    rowsBySection.set(section, rows);
  }
  if (!itemCount) throw new Error('Dữ liệu server không có địa điểm nào.');
  const workbook = XLSX.utils.book_new();
  for (const [section, rows] of rowsBySection) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), SECTION_SHEETS[section]);
  // Tab server chưa có: lấy nguyên từ Sheet Đà Lạt (giữ hyperlink thư mục ảnh nền).
  for (const name of supplement?.SheetNames || []) {
    if (!['hinh_nen', 'luu_y'].includes(normalizeText(name))) continue;
    XLSX.utils.book_append_sheet(workbook, supplement!.Sheets[name], name);
  }
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return { workbook, buffer, itemCount };
}

// Workbook Sheet Đà Lạt trên máy (GuideService đăng ký); null khi máy không có.
let supplementProvider: (() => XLSX.WorkBook | null) | null = null;
export function setServerSourceSupplement(provider: (() => XLSX.WorkBook | null) | null): void { supplementProvider = provider; }
export function serverSourceSupplement(): XLSX.WorkBook | null {
  try { return supplementProvider?.() || null; } catch { return null; }
}
