import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { GuideItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { buildSpotlightV6MapsPages } from '../logic/deck-builder-v2';
import { extractDriveFileIdFromProxyUrl, fetchDriveFileAsset, getDriveImageProxyUrl } from '../sync/drive-images';
import { setActiveDestinationLocalize } from '../sync/destination-localize';
import type { SheetDriveImageManifest, SheetDriveImageManifestEntry } from '../sync/sheet-drive-manifest';

const expectedNames = ['Lang Biang', 'Cầu Đất', 'Dốc Nhà Bò', 'Tháp Truyền Hình', 'Tháp Vinaphone', 'Suối Tía', 'Dinh Bảo Đại 3'];
const sectionKeys: SectionKey[] = ['quan_an', 'cafe', 'homestay', 'check_in', 'dich_vu', 'choi_dem', 'hoat_dong', 'dia_diem_lich_su', 'khu_du_lich'];

function proxyUrls(entries: Array<{ fileId: string }> | undefined, fallbackId = ''): string[] {
  return [...new Set((entries?.length ? entries.map((entry) => entry.fileId) : [fallbackId]).filter(Boolean).map(getDriveImageProxyUrl))];
}

function guideItem(entry: SheetDriveImageManifestEntry, index: number): GuideItem {
  const realUrls = proxyUrls(entry.candidateImages, entry.fileId);
  const mapUrls = proxyUrls(entry.mapCandidateImages, entry.mapFileId);
  return {
    id: `live-map-${index}`, sectionKey: entry.sectionKey, sectionTitle: entry.sectionKey,
    name: entry.name, address: entry.address, type: entry.sectionKey, openHours: '', style: '', highlight: '',
    partnerFlag: '', isPartner: false, headPrice: '', hasHeadPriceColumn: false, price: '', phone: '',
    imageUrl: realUrls[0] || '', imageMapped: realUrls.length > 0, imageMappingKey: entry.key,
    imageSource: realUrls.length ? 'manual' : 'fallback', candidateImageUrls: realUrls,
    mapImageUrl: mapUrls[0] || '', mapCandidateImageUrls: mapUrls,
  };
}

async function main(): Promise<void> {
  const manifestPath = path.resolve(__dirname, '../../../../data/sheet-drive-images.dalat.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as SheetDriveImageManifest;
  const entries = Object.values(manifest.items).filter((entry) => Boolean(entry.mapFileId || entry.mapCandidateImages?.length));
  assert.equal(entries.length, 7, 'Sheet hiện tại phải có đúng 7 địa điểm Anh_GG_maps.');
  for (const expected of expectedNames) assert.ok(entries.some((entry) => entry.name.includes(expected)), `Thiếu dữ liệu ${expected}`);

  const itemsBySection = Object.fromEntries(sectionKeys.map((key) => [key, []])) as unknown as WorkbookItemsBySection;
  entries.forEach((entry, index) => itemsBySection[entry.sectionKey].push(guideItem(entry, index)));
  setActiveDestinationLocalize('dalat');
  const usedItems = new Set<string>();
  const usedImages = new Set<string>();
  for (let listIndex = 1; listIndex <= 2; listIndex += 1) {
    const pages = buildSpotlightV6MapsPages({
      itemsBySection, imageUrls: [], libraryEntries: [], coverImageUrls: [],
      globalUsedItemIds: usedItems, globalUsedImageUrls: usedImages,
    }, `live-${listIndex}`);
    assert.equal(pages.length, 14);
    assert.equal(new Set(pages.map((page) => page.backgroundImage)).size, 14, `List ${listIndex} lặp ảnh trong list.`);
    for (let pair = 0; pair < 7; pair += 1) {
      const mapPage = pages[pair * 2];
      const realPage = pages[pair * 2 + 1];
      assert.equal(mapPage.type, 'list');
      assert.equal(realPage.type, 'list');
      if (mapPage.type !== 'list' || realPage.type !== 'list') continue;
      assert.equal(mapPage.items[0]?.sourceKey, realPage.items[0]?.sourceKey);
      for (const page of [mapPage, realPage]) {
        const fileId = extractDriveFileIdFromProxyUrl(page.backgroundImage);
        assert.ok(fileId, `Trang ${pair + 1} thiếu Drive file ID.`);
        const asset = await fetchDriveFileAsset(fileId);
        assert.equal(Boolean(asset.isFallback), false, `${fileId} trả placeholder.`);
        assert.ok(asset.contentType.startsWith('image/'), `${fileId} không trả ảnh thật.`);
      }
    }
    console.log(`PASS live list ${listIndex}: 14 trang, 7 cặp đúng nguồn, không placeholder.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
