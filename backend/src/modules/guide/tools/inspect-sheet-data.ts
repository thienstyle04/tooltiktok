/**
 * Inspect Google Sheet data before cover/dedup/image logic changes.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';
import { resolveBackendDataDir, resolveBackendRoot } from '../../../config';
import { SECTION_CONFIG } from '../../../common/constants/guide.constants';
import { SectionKey } from '../../../common/interfaces/guide.types';
import { firstValue, itemMappingKey, normalizeText, stableHash } from '../logic/image-resolver';
import { buildSheetDriveManifest, readSheetDriveManifest } from '../sync/sheet-drive-manifest';
import { fetchWorkbookFromSheet } from '../sync/workbook-source';
import { getDriveImageProxyUrl } from '../sync/drive-images';

function preferredImageLink(row: Record<string, string>): string {
  return firstValue(
    row,
    'link_drive__hyperlink',
    'link_drive',
    'link_anh__hyperlink',
    'link_anh',
    'link_hinh__hyperlink',
    'link_hinh',
    'link_hinh_anh__hyperlink',
    'link_hinh_anh',
    'hinh_anh__hyperlink',
    'hinh_anh',
    'anh__hyperlink',
    'anh',
    'image_link__hyperlink',
    'image_link',
  );
}

function isLikelyLinkHeader(header: string): boolean {
  return header.includes('link') || header.includes('anh') || header.includes('hinh');
}

function sheetRows(sheet: XLSX.WorkSheet): Array<Record<string, string>> {
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false, defval: '' });
  if (rows.length === 0) return [];
  const headers = (rows[0] ?? []).map((header) => normalizeText(header));
  const results: Array<Record<string, string>> = [];
  for (const [rowOffset, rawRow] of rows.slice(1).entries()) {
    const rowMap: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      const rawValue = String(rawRow[columnIndex] ?? '').trim();
      const cellRef = XLSX.utils.encode_cell({ r: rowOffset + 1, c: columnIndex });
      const cell = sheet[cellRef];
      const hyperlink = typeof cell?.l?.Target === 'string' ? cell.l.Target.trim() : '';
      rowMap[header] = hyperlink && isLikelyLinkHeader(header) ? hyperlink : rawValue;
      if (hyperlink) rowMap[`${header}__hyperlink`] = hyperlink;
    });
    results.push(rowMap);
  }
  return results;
}

function coverImageForListSimulation(listId: string, title: string, description: string, pool: string[]): string {
  if (pool.length === 0) return '';
  return pool[stableHash(`${listId}|${title}|${description}|cover`) % pool.length] || '';
}

async function main() {
  const dataRoot = resolveBackendDataDir(resolveBackendRoot());
  console.log('=== KIỂM TRA DỮ LIỆU GOOGLE SHEET ===\n');

  const source = await fetchWorkbookFromSheet();
  console.log(`Workbook : ${source.workbookName}`);
  console.log(`Kích thước: ${(source.bytes / 1024).toFixed(1)} KB`);
  console.log(`Sheets   : ${source.workbook.SheetNames.join(', ')}\n`);

  const sectionStats: Array<Record<string, unknown>> = [];
  let hinhNenRows = 0;
  let hinhNenWithLink = 0;

  for (const sheetName of source.workbook.SheetNames) {
    const normalized = normalizeText(sheetName);
    const sheet = source.workbook.Sheets[sheetName];
    const rows = sheetRows(sheet);

    if (normalized === 'hinh_nen') {
      hinhNenRows = rows.length;
      hinhNenWithLink = rows.filter((row) => preferredImageLink(row) || Object.entries(row).some(([h, v]) => isLikelyLinkHeader(h) && /^https?:\/\//i.test(v))).length;
      continue;
    }

    if (!(normalized in SECTION_CONFIG)) continue;
    const sectionKey = normalized as SectionKey;
    let withName = 0;
    let withAddress = 0;
    let withImageLink = 0;
    let withPartner = 0;
    let withPrice = 0;
    const partnerSamples: string[] = [];

    for (const row of rows) {
      const name = firstValue(row, 'ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten');
      if (!name) continue;
      withName += 1;
      if (firstValue(row, 'dia_chi')) withAddress += 1;
      if (preferredImageLink(row)) withImageLink += 1;
      const partner = firstValue(row, 'doi_tac', 'doi_tac_cong_ty');
      if (normalizeText(partner) === 'x') {
        withPartner += 1;
        if (partnerSamples.length < 5) partnerSamples.push(name);
      }
      if (firstValue(row, 'gia')) withPrice += 1;
    }

    sectionStats.push({
      sheet: sheetName,
      sectionKey,
      totalRows: rows.length,
      withName,
      withAddress,
      withImageLink,
      imageLinkPct: withName ? +((withImageLink / withName) * 100).toFixed(1) : 0,
      withPartner,
      withPrice,
      partnerSamples,
    });
  }

  console.log('--- Sheet Hinh_nen (pool cover) ---');
  console.log(`Dòng dữ liệu     : ${hinhNenRows}`);
  console.log(`Dòng có link ảnh : ${hinhNenWithLink}`);

  console.log('\n--- Các sheet địa điểm ---');
  for (const stat of sectionStats) {
    console.log(`\n[${stat.sheet}]`);
    console.log(`  Dòng có tên      : ${stat.withName}/${stat.totalRows}`);
    console.log(`  Có địa chỉ       : ${stat.withAddress}`);
    console.log(`  Có link ảnh Drive: ${stat.withImageLink} (${stat.imageLinkPct}%)`);
    console.log(`  Đối tác (x)      : ${stat.withPartner}`);
    console.log(`  Có giá           : ${stat.withPrice}`);
    if ((stat.partnerSamples as string[]).length) {
      console.log(`  Mẫu đối tác      : ${(stat.partnerSamples as string[]).join(' | ')}`);
    }
  }

  const previousManifest = readSheetDriveManifest(dataRoot, source.workbookName);
  console.log('\n--- Đang resolve ảnh Drive (có thể mất 1-3 phút)... ---');
  const manifest = await buildSheetDriveManifest(source, previousManifest);
  const manifestPath = path.join(dataRoot, 'sheet-drive-images.json');
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  const itemEntries = Object.values(manifest.items);
  const coverPool = manifest.coverImages
    .filter((entry) => entry.fileId)
    .map((entry) => getDriveImageProxyUrl(entry.fileId));

  console.log(`\n--- Manifest Drive sau sync ---`);
  console.log(`Items có ảnh Drive : ${itemEntries.length}`);
  console.log(`Cover pool Hinh_nen: ${coverPool.length} ảnh`);
  console.log(`Lưu tại            : ${manifestPath}`);

  const itemsWithCandidates = itemEntries.filter((e) => (e.candidateImages?.length ?? 0) > 1).length;
  const avgCandidates = itemEntries.length
    ? (itemEntries.reduce((sum, e) => sum + (e.candidateImages?.length ?? 1), 0) / itemEntries.length).toFixed(1)
    : '0';
  console.log(`Item nhiều ảnh (>1) : ${itemsWithCandidates}`);
  console.log(`TB ảnh/item         : ${avgCandidates}`);

  // Simulate cover duplicates for 35 fake lists (current broken logic)
  const fakeLists = Array.from({ length: 35 }, (_, i) => ({
    id: `grid-6-caption-${String(i + 1).padStart(2, '0')}-abc`,
    title: `TOP 6 ĐỊA ĐIỂM ${i + 1}`,
    description: `Mô tả list số ${i + 1}`,
  }));
  const coverAssignments = fakeLists.map((list) => ({
    id: list.id,
    cover: coverImageForListSimulation(list.id, list.title, list.description, coverPool),
  }));
  const coverCounts = new Map<string, number>();
  coverAssignments.forEach((entry) => {
    if (!entry.cover) return;
    coverCounts.set(entry.cover, (coverCounts.get(entry.cover) ?? 0) + 1);
  });
  const duplicatedCovers = [...coverCounts.entries()].filter(([, count]) => count > 1);
  const uniqueCoversUsed = coverCounts.size;

  console.log('\n--- Mô phỏng cover 35 list (logic HIỆN TẠI - hash % pool) ---');
  console.log(`Pool cover         : ${coverPool.length} ảnh`);
  console.log(`Cover unique dùng  : ${uniqueCoversUsed}/35 list`);
  console.log(`Ảnh bị lặp (>=2)  : ${duplicatedCovers.length} ảnh`);
  if (duplicatedCovers.length > 0) {
    const top = duplicatedCovers.sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [url, count] of top) {
      const id = url.match(/id=([^&]+)/)?.[1]?.slice(0, 12) ?? url.slice(-20);
      console.log(`  - ${id}... dùng ${count} lần`);
    }
  }
  if (coverPool.length > 0 && coverPool.length < 35) {
    console.log(`\n⚠ Pool chỉ ${coverPool.length} ảnh → tối đa ${coverPool.length} cover khác nhau dù có dedup.`);
  }

  // Generated lists file check
  const generatedPath = path.join(dataRoot, 'generated-caption-lists.json');
  if (fs.existsSync(generatedPath)) {
    const generated = JSON.parse(fs.readFileSync(generatedPath, 'utf-8')) as Record<string, unknown[]>;
    let listCount = 0;
    const liveCovers: string[] = [];
    for (const lists of Object.values(generated)) {
      if (!Array.isArray(lists)) continue;
      for (const list of lists) {
        listCount += 1;
        const pages = (list as { pages?: Array<{ type?: string; backgroundImage?: string }> }).pages ?? [];
        const cover = pages.find((p) => p.type === 'cover');
        if (cover?.backgroundImage) liveCovers.push(cover.backgroundImage);
      }
    }
    const liveDup = new Map<string, number>();
    liveCovers.forEach((url) => liveDup.set(url, (liveDup.get(url) ?? 0) + 1));
    const liveDupCount = [...liveDup.values()].filter((c) => c > 1).reduce((s, c) => s + c, 0);
    console.log(`\n--- List AI đã lưu (${generatedPath}) ---`);
    console.log(`Tổng list AI       : ${listCount}`);
    console.log(`Cover đã gán       : ${liveCovers.length}`);
    console.log(`Cover URL unique   : ${liveDup.size}`);
    console.log(`Số lần cover trùng : ${liveDupCount - liveDup.size} (nếu >0 có trùng thật)`);
  } else {
    console.log(`\n--- List AI: chưa có file ${generatedPath} ---`);
  }

  console.log('\n=== KẾT LUẬN KIỂM TRA ===');
  const missingLinks = sectionStats.filter((s) => (s.imageLinkPct as number) < 80);
  if (missingLinks.length) {
    console.log(`- ${missingLinks.length} sheet có <80% dòng có link ảnh Drive → cần bổ sung sheet.`);
  } else {
    console.log('- Hầu hết sheet có link ảnh Drive tốt (>=80%).');
  }
  if (coverPool.length < 20) {
    console.log(`- Pool Hinh_nen nhỏ (${coverPool.length}) → nên thêm ảnh hoặc dedup + rotate.`);
  }
  if (duplicatedCovers.length > 0) {
    console.log('- Logic cover hiện tại CHẮC CHẮN gây trùng khi xuất nhiều list → cần sửa dedup (phương án A).');
  }
  console.log('- Bỏ portrait filter phù hợp vì ảnh Drive đã map trực tiếp từ sheet.');
}

main().catch((err) => {
  console.error('Inspect failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
