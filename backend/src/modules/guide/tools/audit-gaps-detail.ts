import * as XLSX from 'xlsx';
import { resolveBackendDataDir, resolveBackendRoot } from '../../../config';
import { firstValue, itemMappingKey, normalizeText } from '../logic/image-resolver';
import { readSheetDriveManifest } from '../sync/sheet-drive-manifest';
import { fetchWorkbookFromSheet } from '../sync/workbook-source';

function rowsWithLinks(sheet: XLSX.WorkSheet): Array<Record<string, string>> {
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false, defval: '' });
  const headers = (rows[0] ?? []).map((h) => normalizeText(h));
  const out: Array<Record<string, string>> = [];
  for (const [i, raw] of rows.slice(1).entries()) {
    const m: Record<string, string> = {};
    headers.forEach((h, j) => {
      const v = String(raw[j] ?? '').trim();
      const cell = sheet[XLSX.utils.encode_cell({ r: i + 1, c: j })];
      const link = typeof cell?.l?.Target === 'string' ? cell.l.Target.trim() : '';
      m[h] = (h.includes('link') || h.includes('anh') || h.includes('hinh')) && link ? link : v;
      if (link) m[`${h}__hyperlink`] = link;
    });
    out.push(m);
  }
  return out;
}

async function main() {
  const src = await fetchWorkbookFromSheet();
  const manifest = readSheetDriveManifest(resolveBackendDataDir(resolveBackendRoot()));

  console.log('=== QUAN_AN: 5 item parser có nhưng manifest thiếu ===\n');
  const quanSheet = src.workbook.Sheets.Quan_an;
  const quanRows = rowsWithLinks(quanSheet);
  const missing: Array<{ name: string; address: string; link: string }> = [];
  for (const row of quanRows) {
    const name = firstValue(row, 'ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten');
    if (!name) continue;
    const address = firstValue(row, 'dia_chi');
    const key = itemMappingKey('quan_an', name, address);
    if (!manifest.items[key]) {
      missing.push({
        name,
        address,
        link: firstValue(row, 'link_drive__hyperlink', 'link_drive'),
      });
    }
  }
  console.log(`Thiếu key trong manifest: ${missing.length}`);
  missing.forEach((m) => console.log(`  • ${m.name} | ${m.address}`));

  const keyCounts = new Map<string, string[]>();
  for (const row of quanRows) {
    const name = firstValue(row, 'ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten');
    if (!name) continue;
    const key = itemMappingKey('quan_an', name, firstValue(row, 'dia_chi'));
    if (!keyCounts.has(key)) keyCounts.set(key, []);
    keyCounts.get(key)!.push(name);
  }
  const dupKeys = [...keyCounts.entries()].filter(([, names]) => names.length > 1);
  console.log(`Unique mapping keys: ${keyCounts.size} / ${quanRows.filter((r) => firstValue(r, 'ten_quan')).length} dòng`);
  if (dupKeys.length) {
    console.log(`Trùng key (ghi đè manifest): ${dupKeys.length}`);
    dupKeys.slice(0, 5).forEach(([key, names]) => console.log(`  • ${key} (${names.length} dòng)`));
  }

  console.log('\n=== CHOI_DEM: dòng có tên cột B + link Drive ===\n');
  const choiSheet = src.workbook.Sheets['Choi_đem'];
  const rawRows = XLSX.utils.sheet_to_json<(string | number)[]>(choiSheet, { header: 1, raw: false, defval: '' });
  const choiLinked = rowsWithLinks(choiSheet);
  let ok = 0;
  for (let i = 0; i < choiLinked.length; i++) {
    const rawRow = rawRows[i + 1] ?? [];
    const name = String(rawRow[1] ?? '').trim();
    const type = String(rawRow[2] ?? '').trim();
    const link = firstValue(choiLinked[i], 'link_drive__hyperlink', 'link_drive');
    if (!name) continue;
    const hasDrive = /^https?:\/\//i.test(link);
    if (hasDrive) {
      ok += 1;
      if (ok <= 5) console.log(`  • ${name} (${type}) → có link Drive`);
    } else {
      console.log(`  ⚠ ${name} — thiếu link Drive`);
    }
  }
  console.log(`\nTổng: ${ok}/24 có tên + link Drive sẵn sàng (chỉ cần parser đọc cột B)`);

  console.log('\n=== LUU_Y: mẫu nội dung (không vào app) ===\n');
  const luuSheet = src.workbook.Sheets.Luu_y;
  const luuRows = XLSX.utils.sheet_to_json<(string | number)[]>(luuSheet, { header: 1, raw: false, defval: '' });
  const headers = (luuRows[0] ?? []).map((h) => String(h));
  console.log('Headers:', headers.join(' | '));
  for (const row of luuRows.slice(1, 6)) {
    const vals = row.map((c) => String(c ?? '').trim()).filter(Boolean);
    if (vals.length) console.log(' ', vals.join(' | '));
  }
  console.log(`  ... tổng ${luuRows.slice(1).filter((r) => r.some((c) => String(c).trim())).length} dòng`);

  console.log('\n=== HOAT_DONG: kiểm tra địa chỉ ===\n');
  const hdRows = rowsWithLinks(src.workbook.Sheets.Hoat_dong);
  const noAddr = hdRows.filter((r) => firstValue(r, 'ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten') && !firstValue(r, 'dia_chi'));
  console.log(`Hoạt động không có Dia_chi: ${noAddr.length}/${hdRows.filter((r) => firstValue(r, 'hoat_dong', 'ten')).length} (bình thường — sheet không có cột địa chỉ)`);

  console.log('\n=== HINH_NEN: dòng có / không link ===\n');
  const hinhSheet = src.workbook.Sheets.Hinh_nen;
  const hinhRaw = XLSX.utils.sheet_to_json<(string | number)[]>(hinhSheet, { header: 1, raw: false, defval: '' });
  const hinhLinked = rowsWithLinks(hinhSheet);
  let hinhOk = 0;
  let hinhMissing = 0;
  for (let i = 0; i < hinhLinked.length; i++) {
    const hasRow = (hinhRaw[i + 1] ?? []).some((c) => String(c).trim());
    if (!hasRow) continue;
    const link = firstValue(hinhLinked[i], 'link_drive__hyperlink', 'link_drive');
    if (/^https?:\/\//i.test(link)) hinhOk += 1;
    else { hinhMissing += 1; console.log(`  ⚠ dòng ${i + 2}: thiếu link`); }
  }
  console.log(`Có link: ${hinhOk} | Thiếu link: ${hinhMissing} | Cover pool: ${manifest.coverImages.length} ảnh`);
}

main().catch((e) => { console.error(e); process.exit(1); });
