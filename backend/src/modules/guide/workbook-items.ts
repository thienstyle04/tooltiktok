// ─── Dựng địa điểm từ workbook Google Sheet (hàm thuần) ──────────────────────
// Đọc từng sheet thành GuideItem (tên, địa chỉ, giờ, giá, ảnh Drive/thư viện) và
// gom kho ảnh nền Hinh_nen theo nhóm.
import * as XLSX from 'xlsx';
import type { DestinationId } from './sync/destination-config';
import * as listDisplay from './list-display';
import { SECTION_CONFIG } from '../../common/constants/guide.constants';
import { GuideItem, HinhNenImageUrlPools, ImageLibraryFolderEntry, ImageMappingFile, SectionKey, WorkbookItemsBySection } from '../../common/interfaces/guide.types';
import { composeAddress, firstValue, itemMappingKey, normalizeText, normalizeWorkbookHeaders, resolveMappedImage } from './logic/image-resolver';
import { isIsolatedSheetSource } from './sync/destination-config';
import { filterKnownAvailableDriveProxyUrls, getDriveImageProxyUrl, isKnownUnavailableDriveProxyUrl } from './sync/drive-images';
import { SheetDriveImageManifest } from './sync/sheet-drive-manifest';
import { resolveSectionKeyFromSheetName } from './sync/sheet-section';

export function loadHinhNenImagePools(sheetDriveManifest: SheetDriveImageManifest): HinhNenImageUrlPools {
  const coverLimit = Math.max(0, Number(process.env.DALAT_DRIVE_CACHE_COVER_LIMIT || 120));
  const specialLimit = Math.max(
    0,
    Number(process.env.DALAT_DRIVE_CACHE_SPECIAL_COVER_LIMIT || 120),
  );
  const toProxyUrls = (entries: typeof sheetDriveManifest.coverImages, limit: number): string[] => {
    const seen = new Set<string>();
    return (entries || [])
      .slice(0, limit)
      .map((entry) => {
        const fileId = String(entry?.fileId || '').trim();
        // Giữ pool ổn định qua lỗi Drive tạm thời; warm/revalidate sẽ loại ID
        // hỏng trước khi dataset được đánh dấu sẵn sàng.
        return fileId ? getDriveImageProxyUrl(fileId) : '';
      })
      .filter((url) => {
        if (!url || seen.has(url)) return false;
        seen.add(url);
        return true;
      });
  };
  const grouped = sheetDriveManifest.coverImageGroups;
  const defaultEntries = grouped?.default?.length
    ? grouped.default
    : sheetDriveManifest.coverImages || [];
  return {
    default: toProxyUrls(defaultEntries, coverLimit),
    green: toProxyUrls(grouped?.green || [], specialLimit),
    dark: toProxyUrls(grouped?.dark || [], specialLimit),
    random: toProxyUrls(grouped?.random || [], specialLimit),
    persimmon: toProxyUrls(grouped?.persimmon || [], specialLimit),
  };
}

export function loadWorkbookItems(destinationId: DestinationId, workspaceRoot: string,
  workbook: XLSX.WorkBook,
  imageUrls: string[],
  imageMapping: ImageMappingFile,
  libraryEntries: ImageLibraryFolderEntry[],
  sheetDriveManifest: SheetDriveImageManifest,
): WorkbookItemsBySection {
  const results = Object.keys(SECTION_CONFIG).reduce((carry, sectionKey) => {
    carry[sectionKey as SectionKey] = [];
    return carry;
  }, {} as WorkbookItemsBySection);

  let sequence = 0;
  for (const sheetName of workbook.SheetNames) {
    const sectionKey = resolveSectionKeyFromSheetName(sheetName);
    if (!sectionKey) continue;

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false, defval: '' });
    if (rows.length === 0) continue;

    const headers = normalizeWorkbookHeaders(rows[0] ?? []);
    for (const rawRow of rows.slice(1)) {
      const rowMap: Record<string, string> = {};
      headers.forEach((header, index) => { rowMap[header] = String(rawRow[index] ?? '').trim(); });
      sequence += 1;
      const item = buildItem(destinationId, workspaceRoot, sectionKey, rowMap, sequence, imageUrls, imageMapping, libraryEntries, sheetDriveManifest);
      // Giữ cả dòng chưa map ảnh để title và địa chỉ vẫn đúng dữ liệu sheet.
      if (item) {
        results[sectionKey].push(item);
      }
    }
  }

  return results;
}

export function buildItem(destinationId: DestinationId, workspaceRoot: string,
  sectionKey: SectionKey,
  row: Record<string, string>,
  sequence: number,
  imageUrls: string[],
  imageMapping: ImageMappingFile,
  libraryEntries: ImageLibraryFolderEntry[],
  sheetDriveManifest: SheetDriveImageManifest,
): GuideItem | null {
  const rawName = firstValue(row, 'ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten');
  if (!rawName) return null;
  const name = listDisplay.normalizeDisplayName(rawName);

  const placeType = firstValue(row, 'mo_hinh', 'loai_dich_vu', 'phong_cach');
  const rawAddress = firstValue(row, 'dia_chi');
  const address = composeAddress(rawAddress, firstValue(row, 'ten_phuong'));
  const openHours = firstValue(row, 'gio_mo_cua', 'gio_mo_cua_', 'gio_mo_cua_1');
  const style = firstValue(row, 'phong_cach');
  const highlight = firstValue(row, 'mo_ta', 'mota', 'mo_ta_dia_diem', 'mon_an_noi_bat', 'mon_noi_bat', 'noi_bat');
  const theme = firstValue(row, 'chu_de', 'chude');
  const partner = firstValue(row, 'doi_tac', 'doi_tac_cong_ty');
  const phone = firstValue(row, 'sdt');
  const headPrice = firstValue(row, 'gia_dau_nguoi', 'head_price', 'per_person_price');
  const hasHeadPriceColumn = 'gia_dau_nguoi' in row
    || 'head_price' in row
    || 'per_person_price' in row;
  const price = firstValue(row, 'gia');
  const imageHint = firstValue(row, 'anh', 'hinh_anh', 'hinh', 'ten_anh', 'thu_muc_anh', 'folder_anh', 'link_anh', 'url', 'link');
  const mappingKey = itemMappingKey(sectionKey, rawName, address);
  const legacyMappingKey = rawAddress === address ? '' : itemMappingKey(sectionKey, rawName, rawAddress);
  const displayMappingKey = itemMappingKey(sectionKey, name, address);
  const legacyDisplayMappingKey = legacyMappingKey ? itemMappingKey(sectionKey, name, rawAddress) : '';
  const sheetDriveEntry = sheetDriveManifest.items[mappingKey]
    ?? sheetDriveManifest.items[displayMappingKey]
    ?? (legacyMappingKey ? sheetDriveManifest.items[legacyMappingKey] : undefined)
    ?? (legacyDisplayMappingKey ? sheetDriveManifest.items[legacyDisplayMappingKey] : undefined);
  const rawSheetDriveCandidateUrls = sheetDriveEntry
    ? (sheetDriveEntry.candidateImages && sheetDriveEntry.candidateImages.length > 0
        ? sheetDriveEntry.candidateImages
        : [{ fileId: sheetDriveEntry.fileId, fileName: sheetDriveEntry.fileName, viewUrl: '' }]
      )
        .filter((entry) => entry.fileId)
        .map((entry) => getDriveImageProxyUrl(entry.fileId))
    : [];
  const sheetDriveCandidateUrls = filterKnownAvailableDriveProxyUrls(rawSheetDriveCandidateUrls);
  const rawMapCandidateUrls = sheetDriveEntry
    ? (sheetDriveEntry.mapCandidateImages?.length
        ? sheetDriveEntry.mapCandidateImages
        : sheetDriveEntry.mapFileId
          ? [{ fileId: sheetDriveEntry.mapFileId, fileName: sheetDriveEntry.mapFileName || '', viewUrl: '' }]
          : [])
      .filter((entry) => entry.fileId)
      .map((entry) => getDriveImageProxyUrl(entry.fileId))
    : [];
  const mapCandidateImageUrls = filterKnownAvailableDriveProxyUrls(rawMapCandidateUrls);
  const sheetDriveUrlsBlocked = rawSheetDriveCandidateUrls.length > 0
    && (sheetDriveCandidateUrls.length === 0
      || rawSheetDriveCandidateUrls.every((url) => isKnownUnavailableDriveProxyUrl(url)));
  const resolvedByName = () => resolveMappedImage(
    sectionKey, placeType || SECTION_CONFIG[sectionKey].title, rawName, address,
    imageUrls, sequence, imageMapping, libraryEntries, workspaceRoot,
  );
  const resolvedByHint = () => resolveMappedImage(
    sectionKey, placeType || SECTION_CONFIG[sectionKey].title, imageHint, address,
    imageUrls, sequence, imageMapping, libraryEntries, workspaceRoot,
  );
  const fallbackResolvedImage = (): ReturnType<typeof resolveMappedImage> => {
    if (isIsolatedSheetSource(destinationId)) return {
      imageUrl: '', imageMapped: false, imageMappingKey: mappingKey, imageSource: 'fallback', candidateImageUrls: [],
    };
    const direct = resolvedByName();
    if (!imageHint || normalizeText(imageHint) === normalizeText(rawName)) return direct;
    const hinted = resolvedByHint();
    return hinted.imageMapped || hinted.imageSource !== 'fallback'
      ? { ...hinted, imageMappingKey: mappingKey }
      : direct;
  };

  const directImageUrls = imageHint ? imageHint.split(/[\n,;]+/).map(s => s.trim()).filter(s => /^https?:\/\//i.test(s)
    && (!isIsolatedSheetSource(destinationId) || !/^https?:\/\/(?:drive|docs)\.google\.com\//i.test(s))) : [];

  // Item đã có ảnh Drive/link trực tiếp riêng của chính nó -> KHÔNG trộn thêm ảnh thư viện nền chung
  // (resolveMappedImage so khớp mờ theo tên, dễ khớp nhầm sang địa điểm khác) vào candidateImageUrls.
  // Chỉ dùng thư viện nền làm nguồn ảnh khi item không có ảnh thật nào.
  const resolvedImage = sheetDriveEntry && sheetDriveCandidateUrls.length > 0 && !sheetDriveUrlsBlocked
    ? {
        imageUrl: sheetDriveCandidateUrls[0] || getDriveImageProxyUrl(sheetDriveEntry.fileId),
        imageMapped: true,
        imageMappingKey: mappingKey,
        imageSource: 'manual' as const,
        candidateImageUrls: Array.from(new Set(sheetDriveCandidateUrls)),
      }
    : (directImageUrls.length > 0
        ? {
            imageUrl: directImageUrls[0],
            imageMapped: true,
            imageMappingKey: mappingKey,
            imageSource: 'manual' as const,
            candidateImageUrls: directImageUrls,
          }
        : fallbackResolvedImage());

  return {
    id: `${sectionKey}-${sequence}`,
    sectionKey,
    sectionTitle: SECTION_CONFIG[sectionKey].title,
    name, address,
    type: placeType || SECTION_CONFIG[sectionKey].title,
    openHours, style, highlight, theme, streetAddress: rawAddress,
    diaryDescriptionRaw: String(row.mo_ta ?? row.mota ?? row.mo_ta_dia_diem ?? ''),
    diaryImageUrls: [...sheetDriveCandidateUrls],
    partnerFlag: partner,
    classification: firstValue(row, 'phan_loai'),
    isPartner: normalizeText(partner) === 'x',
    headPrice,
    hasHeadPriceColumn,
    price, phone,
    imageUrl: resolvedImage.imageUrl,
    imageMapped: resolvedImage.imageMapped,
    imageMappingKey: resolvedImage.imageMappingKey,
    imageSource: resolvedImage.imageSource,
    candidateImageUrls: resolvedImage.candidateImageUrls,
    mapImageUrl: mapCandidateImageUrls[0] || '',
    mapCandidateImageUrls: Array.from(new Set(mapCandidateImageUrls)),
    mapSourceLink: String(sheetDriveEntry?.mapSourceLink || '').trim(),
  };
}
