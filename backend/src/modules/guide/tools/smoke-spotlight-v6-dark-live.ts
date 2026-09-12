import assert from 'node:assert/strict';

import { GuideService } from '../guide.service';
import { buildSpotlightV6DarkPages, spotlightV6DarkVenuePool } from '../logic/deck-builder-v2';
import { getDestinationConfig } from '../sync/destination-config';
import { extractDriveFileIdFromProxyUrl, getDriveImageProxyUrl, hasDriveFileDiskCache } from '../sync/drive-images';
import { readSheetDriveManifest } from '../sync/sheet-drive-manifest';
import { fetchWorkbookFromSheet } from '../sync/workbook-source';

async function main(): Promise<void> {
  const service = new GuideService() as any;
  const source = await fetchWorkbookFromSheet(getDestinationConfig('dalat'));
  const manifest = readSheetDriveManifest(service.dataRoot, 'dalat');
  const itemsBySection = service.loadWorkbookItems(
    source.workbook,
    [],
    { version: 1, instructions: [], mappings: [] },
    [],
    manifest,
  );
  const darkEntries = manifest.coverImageGroups?.dark || [];
  const darkUrls = darkEntries.map((entry) => getDriveImageProxyUrl(entry.fileId));
  assert.ok(darkUrls.length >= 6, `Pool Ảnh tone đen chỉ có ${darkUrls.length}/6 ảnh.`);
  const venues = spotlightV6DarkVenuePool(itemsBySection);
  assert.ok(venues.length >= 5, `Pool địa điểm Tone đen chỉ có ${venues.length}/5 địa điểm.`);

  const sectionCounts = Object.fromEntries(
    ['quan_an', 'cafe', 'hoat_dong', 'check_in', 'khu_du_lich'].map((sectionKey) => [
      sectionKey,
      venues.filter((item) => item.sectionKey === sectionKey).length,
    ]),
  );
  const usedItems = new Set<string>();
  const usedImages = new Set<string>();
  const common = {
    itemsBySection,
    imageUrls: [],
    libraryEntries: [],
    coverImageUrls: [],
    hinhNenImagePools: { default: [], green: [], dark: darkUrls, random: [] },
    globalUsedItemIds: usedItems,
    globalUsedImageUrls: usedImages,
  };
  const lists = [1, 2].map((number) => buildSpotlightV6DarkPages(common, `live-dark-${number}`, {
    destinationId: 'dalat',
    hooks: [`Hook Tone tối thử ${number}`],
  }));

  for (const [index, pages] of lists.entries()) {
    assert.equal(pages.length, 11);
    const imagePages = pages.filter((page) => page.layoutVariant === 'spotlight-v6-cover' || page.layoutVariant === 'spotlight-v6-image');
    const venuePages = pages.filter((page) => page.layoutVariant === 'spotlight-v6-page');
    assert.equal(imagePages.length, 6);
    assert.equal(venuePages.length, 5);
    assert.equal(new Set(imagePages.map((page) => page.backgroundImage)).size, 6);
    assert.ok(imagePages.every((page) => darkUrls.includes(page.backgroundImage)));
    assert.equal(new Set(venuePages.map((page) => page.type === 'list' ? page.items[0]?.sourceKey : '')).size, 5);
    const fileIds = pages.map((page) => extractDriveFileIdFromProxyUrl(page.backgroundImage)).filter(Boolean) as string[];
    const cached = fileIds.filter((fileId) => hasDriveFileDiskCache(fileId)).length;
    console.log(`List ${index + 1}: 11 trang, ${cached}/${fileIds.length} ảnh đã có cache thật, nhóm địa điểm=${venuePages.map((page) => page.type === 'list' ? page.items[0]?.sourceSectionKey : '').join(',')}`);
  }
  const firstBackgrounds = new Set(lists[0].filter((page) => page.layoutVariant !== 'spotlight-v6-page').map((page) => page.backgroundImage));
  const secondBackgrounds = lists[1].filter((page) => page.layoutVariant !== 'spotlight-v6-page').map((page) => page.backgroundImage);
  assert.ok(secondBackgrounds.every((url) => !firstBackgrounds.has(url)), 'Hai list thử không được lặp ảnh Tone đen khi pool còn đủ.');
  const firstVenues = new Set(lists[0].filter((page) => page.layoutVariant === 'spotlight-v6-page').map((page) => page.type === 'list' ? page.items[0]?.sourceKey : ''));
  const secondVenues = lists[1].filter((page) => page.layoutVariant === 'spotlight-v6-page').map((page) => page.type === 'list' ? page.items[0]?.sourceKey : '');
  assert.ok(secondVenues.every((key) => !firstVenues.has(key)), 'Hai list thử không được lặp địa điểm Tone đen khi từng nhóm còn đủ.');
  console.log(`PASS live Spotlight V6 Tone đen: darkImages=${darkUrls.length}, venues=${venues.length}, sections=${JSON.stringify(sectionCounts)}.`);
}

void main();
