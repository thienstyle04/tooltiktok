/**
 * Full Google Sheet audit: raw rows vs parser vs Drive manifest.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';
import { SECTION_CONFIG } from '../../../common/constants/guide.constants';
import { SectionKey } from '../../../common/interfaces/guide.types';
import { resolveBackendDataDir, resolveBackendRoot } from '../../../config';
import { firstValue, itemMappingKey, normalizeText } from '../logic/image-resolver';
import { readSheetDriveManifest } from '../sync/sheet-drive-manifest';
import { fetchWorkbookFromSheet } from '../sync/workbook-source';

const NAME_KEYS = ['ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten'] as const;
const IMAGE_KEYS = [
  'link_drive__hyperlink', 'link_drive', 'link_anh__hyperlink', 'link_anh',
  'link_hinh__hyperlink', 'link_hinh', 'link_hinh_anh__hyperlink', 'link_hinh_anh',
  'hinh_anh__hyperlink', 'hinh_anh', 'anh__hyperlink', 'anh', 'image_link__hyperlink', 'image_link',
] as const;

function isLikelyLinkHeader(header: string): boolean {
  return header.includes('link') || header.includes('anh') || header.includes('hinh');
}

function rowMapFromSheet(sheet: XLSX.WorkSheet, withHyperlinks: boolean): Array<Record<string, string>> {
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false, defval: '' });
  if (rows.length === 0) return [];
  const headers = (rows[0] ?? []).map((h) => normalizeText(h));
  const results: Array<Record<string, string>> = [];

  for (const [rowOffset, rawRow] of rows.slice(1).entries()) {
    const rowMap: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      const rawValue = String(rawRow[columnIndex] ?? '').trim();
      if (withHyperlinks) {
        const cellRef = XLSX.utils.encode_cell({ r: rowOffset + 1, c: columnIndex });
        const cell = sheet[cellRef];
        const hyperlink = typeof cell?.l?.Target === 'string' ? cell.l.Target.trim() : '';
        rowMap[header] = hyperlink && isLikelyLinkHeader(header) ? hyperlink : rawValue;
        if (hyperlink) rowMap[`${header}__hyperlink`] = hyperlink;
      } else {
        rowMap[header] = rawValue;
      }
    });
    results.push(rowMap);
  }
  return results;
}

function parserName(row: Record<string, string>): string {
  return firstValue(row, ...NAME_KEYS);
}

function fallbackNameFromCol1(row: Record<string, string>, rawRow: (string | number)[]): string {
  const fromParser = parserName(row);
  if (fromParser) return fromParser;
  return String(rawRow[1] ?? '').trim();
}

function imageLink(row: Record<string, string>): string {
  return firstValue(row, ...IMAGE_KEYS);
}

function imageLinkFromRow(sheet: XLSX.WorkSheet, rawRow: (string | number)[], headers: string[], rowIndex: number): string {
  const rowMap: Record<string, string> = {};
  headers.forEach((header, columnIndex) => {
    const rawValue = String(rawRow[columnIndex] ?? '').trim();
    const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
    const cell = sheet[cellRef];
    const hyperlink = typeof cell?.l?.Target === 'string' ? cell.l.Target.trim() : '';
    rowMap[header] = hyperlink && isLikelyLinkHeader(header) ? hyperlink : rawValue;
    if (hyperlink) rowMap[`${header}__hyperlink`] = hyperlink;
  });
  const preferred = imageLink(rowMap);
  if (preferred) return preferred;
  return Object.entries(rowMap).find(([h, v]) => isLikelyLinkHeader(h) && /^https?:\/\//i.test(v))?.[1] ?? '';
}

type SheetAudit = {
  sheetName: string;
  sectionKey: string;
  inSectionConfig: boolean;
  rawHeaders: string[];
  unnamedHeaderCols: number;
  rowsAnyContent: number;
  parserNameCount: number;
  fallbackCol1NameCount: number;
  parserWithImageLink: number;
  manifestItemCount: number;
  gapRows: number;
  issues: string[];
  samples: string[];
};

async function main() {
  const dataRoot = resolveBackendDataDir(resolveBackendRoot());
  const manifest = readSheetDriveManifest(dataRoot);
  const manifestBySection = new Map<string, number>();
  for (const entry of Object.values(manifest.items)) {
    manifestBySection.set(entry.sectionKey, (manifestBySection.get(entry.sectionKey) ?? 0) + 1);
  }

  const source = await fetchWorkbookFromSheet();
  const workbook = source.workbook;
  const audits: SheetAudit[] = [];
  const configuredSections = Object.keys(SECTION_CONFIG) as SectionKey[];
  const sheetSectionKeys = new Set<string>();

  console.log('=== AUDIT TOÀN BỘ GOOGLE SHEET ===\n');
  console.log(`URL sheet : ${process.env.DALAT_FNB_SHEET_URL || '(default workbook)'}`);
  console.log(`Tabs      : ${workbook.SheetNames.join(', ')}\n`);

  for (const sheetName of workbook.SheetNames) {
    const sectionKey = normalizeText(sheetName);
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false, defval: '' });
    const rawHeaders = (rawRows[0] ?? []).map((h) => String(h).trim());
    const normHeaders = rawHeaders.map((h) => normalizeText(h));
    const unnamedHeaderCols = normHeaders.filter((h) => !h).length;

    if (sectionKey === 'hinh_nen') {
      const rowsWithLinks = rowMapFromSheet(sheet, true);
      let linkRows = 0;
      for (const row of rowsWithLinks) {
        if (imageLink(row) || Object.entries(row).some(([h, v]) => isLikelyLinkHeader(h) && /^https?:\/\//i.test(v))) linkRows += 1;
      }
      audits.push({
        sheetName, sectionKey, inSectionConfig: false,
        rawHeaders, unnamedHeaderCols, rowsAnyContent: rowsWithLinks.filter((r) => Object.values(r).some((v) => v)).length,
        parserNameCount: 0, fallbackCol1NameCount: 0, parserWithImageLink: linkRows,
        manifestItemCount: manifest.coverImages.length, gapRows: 0,
        issues: linkRows < rowsWithLinks.length ? [`${rowsWithLinks.length - linkRows} dòng Hinh_nen thiếu link`] : [],
        samples: [`cover pool manifest: ${manifest.coverImages.length} ảnh`],
      });
      continue;
    }

    if (sectionKey === 'luu_y') {
      const contentRows = rawRows.slice(1).filter((r) => (r ?? []).some((c) => String(c).trim())).length;
      audits.push({
        sheetName, sectionKey, inSectionConfig: false,
        rawHeaders, unnamedHeaderCols, rowsAnyContent: contentRows,
        parserNameCount: 0, fallbackCol1NameCount: 0, parserWithImageLink: 0,
        manifestItemCount: 0, gapRows: contentRows,
        issues: contentRows > 0 ? ['Sheet Luu_y có dữ liệu nhưng không nằm trong SECTION_CONFIG — app không đọc'] : [],
        samples: [],
      });
      continue;
    }

    const inSectionConfig = sectionKey in SECTION_CONFIG;
    if (inSectionConfig) sheetSectionKeys.add(sectionKey);

    const issues: string[] = [];
    const samples: string[] = [];
    let rowsAnyContent = 0;
    let parserNameCount = 0;
    let fallbackCol1NameCount = 0;
    let parserWithImageLink = 0;

    const rowsPlain = rowMapFromSheet(sheet, false);
    const rowsLinked = rowMapFromSheet(sheet, true);

    for (let i = 0; i < rawRows.slice(1).length; i++) {
      const rawRow = rawRows[i + 1] ?? [];
      const hasContent = rawRow.some((c) => String(c).trim());
      if (!hasContent) continue;
      rowsAnyContent += 1;

      const plain = rowsPlain[i] ?? {};
      const linked = rowsLinked[i] ?? {};
      const name = parserName(plain);
      const fallbackName = fallbackNameFromCol1(plain, rawRow);
      if (name) parserNameCount += 1;
      if (fallbackName) fallbackCol1NameCount += 1;
      if (name && imageLink(linked)) parserWithImageLink += 1;

      if (!name && fallbackName && samples.length < 3) {
        samples.push(`"${fallbackName}" (cột B, thiếu header tên)`);
      }
    }

    const manifestItemCount = inSectionConfig ? (manifestBySection.get(sectionKey as SectionKey) ?? 0) : 0;
    const effectiveRows = Math.max(parserNameCount, fallbackCol1NameCount);
    const gapRows = rowsAnyContent - parserNameCount;

    if (!inSectionConfig) {
      issues.push('Tab không map vào SECTION_CONFIG — bỏ qua khi load');
    } else if (gapRows > 0) {
      issues.push(`${gapRows} dòng có dữ liệu nhưng parser không đọc được tên (thiếu header ten_quan/ten/...)`);
    }
    if (inSectionConfig && parserNameCount > 0 && parserWithImageLink < parserNameCount) {
      issues.push(`${parserNameCount - parserWithImageLink} dòng có tên nhưng thiếu link ảnh Drive`);
    }
    if (inSectionConfig && parserNameCount !== manifestItemCount) {
      issues.push(`Manifest Drive: ${manifestItemCount} item (parser đọc ${parserNameCount} tên)`);
    }
    if (unnamedHeaderCols > 0 && gapRows > 0) {
      issues.push(`${unnamedHeaderCols} cột đầu không có header — có thể cần Ten_quan / Mo_hinh`);
    }

    audits.push({
      sheetName, sectionKey, inSectionConfig,
      rawHeaders: rawHeaders.filter(Boolean),
      unnamedHeaderCols, rowsAnyContent, parserNameCount, fallbackCol1NameCount,
      parserWithImageLink, manifestItemCount, gapRows, issues, samples,
    });
  }

  // Sections in config but missing from workbook
  const missingSheets = configuredSections.filter((k) => !sheetSectionKeys.has(k));

  // Print table
  console.log('--- BẢNG ĐỐI CHIẾU ---\n');
  const header = ['Sheet', 'Section', 'Dòng DL', 'Parser đọc', 'Col-B fallback', 'Có link ảnh', 'Manifest', 'Trạng thái'];
  console.log(header.join('\t'));
  for (const a of audits) {
    const status = a.inSectionConfig
      ? (a.gapRows > 0 ? '⚠ THIẾU' : (a.parserNameCount === a.manifestItemCount ? '✓ OK' : '⚠ LỆCH'))
      : (a.sectionKey === 'hinh_nen' ? '✓ cover' : (a.rowsAnyContent > 0 ? 'ℹ ngoài app' : '—'));
    console.log([
      a.sheetName,
      a.sectionKey,
      a.rowsAnyContent,
      a.parserNameCount,
      a.fallbackCol1NameCount,
      a.parserWithImageLink || (a.sectionKey === 'hinh_nen' ? a.parserWithImageLink : a.parserWithImageLink),
      a.manifestItemCount,
      status,
    ].join('\t'));
  }

  console.log('\n--- CHI TIẾT TỪNG TAB ---\n');
  for (const a of audits) {
    console.log(`[${a.sheetName}] → ${a.sectionKey}`);
    if (a.rawHeaders.length) console.log(`  Headers: ${a.rawHeaders.join(' | ')}`);
    if (a.unnamedHeaderCols) console.log(`  Cột không header: ${a.unnamedHeaderCols}`);
    console.log(`  Dòng có nội dung: ${a.rowsAnyContent}`);
    if (a.inSectionConfig) {
      console.log(`  Parser đọc tên  : ${a.parserNameCount}`);
      console.log(`  Fallback cột B  : ${a.fallbackCol1NameCount}`);
      console.log(`  Có link ảnh     : ${a.parserWithImageLink}`);
      console.log(`  Manifest Drive  : ${a.manifestItemCount}`);
    }
    if (a.sectionKey === 'hinh_nen') {
      console.log(`  Dòng có link    : ${a.parserWithImageLink}`);
      console.log(`  Cover pool      : ${a.manifestItemCount} ảnh`);
    }
    if (a.issues.length) a.issues.forEach((issue) => console.log(`  ⚠ ${issue}`));
    if (a.samples.length) a.samples.forEach((s) => console.log(`  → ${s}`));
    console.log('');
  }

  if (missingSheets.length) {
    console.log('--- SECTION CONFIG NHƯNG KHÔNG CÓ TAB SHEET ---\n');
    missingSheets.forEach((k) => console.log(`  - ${k} (${SECTION_CONFIG[k].title})`));
    console.log('');
  }

  // Special deep check: hoat_dong structure
  const hoatDong = audits.find((a) => a.sectionKey === 'hoat_dong');
  if (hoatDong && hoatDong.parserNameCount > 0 && hoatDong.parserWithImageLink === hoatDong.parserNameCount) {
    const sheet = workbook.Sheets[hoatDong.sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as string[][];
    const noAddress = rows.slice(1).filter((r) => r.some((c) => String(c).trim()) && !String(r[normalizeText(rows[0]?.join('')) ? 0 : 0]).length);
    void noAddress;
  }

  // Summary
  const totalRaw = audits.filter((a) => a.inSectionConfig).reduce((s, a) => s + a.rowsAnyContent, 0);
  const totalParsed = audits.filter((a) => a.inSectionConfig).reduce((s, a) => s + a.parserNameCount, 0);
  const totalManifest = Object.values(manifest.items).length;
  const totalGap = audits.filter((a) => a.inSectionConfig).reduce((s, a) => s + a.gapRows, 0);

  console.log('=== TỔNG KẾT ===\n');
  console.log(`Dòng có DL trên sheet (các section) : ${totalRaw}`);
  console.log(`Parser đọc được tên               : ${totalParsed}`);
  console.log(`Manifest Drive items              : ${totalManifest}`);
  console.log(`Dòng MẤT do parser                : ${totalGap}`);
  console.log(`Cover pool Hinh_nen               : ${manifest.coverImages.length}`);

  const blockers = audits.filter((a) => a.inSectionConfig && a.gapRows > 0);
  if (blockers.length) {
    console.log('\nCần sửa TRƯỚC KHI code cover/portrait:');
    blockers.forEach((a) => console.log(`  • ${a.sheetName}: ${a.gapRows} dòng không vào app`));
  } else {
    console.log('\nTất cả section đều khớp parser — có thể bước vào code cover/portrait.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
