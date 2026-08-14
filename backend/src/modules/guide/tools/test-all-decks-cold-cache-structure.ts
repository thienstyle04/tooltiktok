import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { DeckPage, GuideItem, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { buildDecks } from '../logic/deck-builder';
import { configureDriveFileDiskCache } from '../sync/drive-images';

const allFileIds: string[] = [];

function item(sectionKey: SectionKey, index: number): GuideItem {
  const id = `${sectionKey}-${index}`;
  const fileId = `all-decks-${id}`;
  const imageUrl = `/assets/drive-file?id=${fileId}`;
  allFileIds.push(fileId);
  const type = sectionKey === 'quan_an'
    ? (index % 3 === 0 ? 'An sang' : index % 3 === 1 ? 'An trua' : 'An toi lau nuong')
    : sectionKey === 'check_in'
      ? 'Check in mien phi'
      : sectionKey;
  return {
    id,
    sectionKey,
    sectionTitle: sectionKey,
    name: `Dia diem ${id}`,
    address: `${index} Da Lat`,
    type,
    openHours: '07:00-22:00',
    style: '',
    highlight: `Diem noi bat ${id}`,
    partnerFlag: index % 4 === 0 ? 'x' : '',
    isPartner: index % 4 === 0,
    headPrice: '100000',
    hasHeadPriceColumn: true,
    price: sectionKey === 'check_in' ? 'Free' : '100000',
    phone: '',
    imageUrl,
    imageMapped: true,
    imageMappingKey: id,
    imageSource: 'manual',
    candidateImageUrls: [imageUrl],
  };
}

const make = (sectionKey: SectionKey, count = 32) =>
  Array.from({ length: count }, (_, index) => item(sectionKey, index + 1));

const itemsBySection: WorkbookItemsBySection = {
  check_in: make('check_in'),
  khu_du_lich: make('khu_du_lich'),
  quan_an: make('quan_an', 48),
  cafe: make('cafe'),
  choi_dem: make('choi_dem'),
  homestay: make('homestay'),
  dich_vu: make('dich_vu'),
  hoat_dong: make('hoat_dong'),
  dia_diem_lich_su: make('dia_diem_lich_su'),
};

function pageSignature(page: DeckPage) {
  return {
    type: page.type,
    layoutVariant: page.layoutVariant || '',
    itemCount: page.type === 'list' ? page.items.length : 0,
  };
}

function deckSignatures() {
  const decks = buildDecks(
    itemsBySection,
    [],
    [],
    ['/assets/drive-file?id=all-decks-cover'],
  );
  return Object.fromEntries(decks.map((deck) => {
    const main = deck.lists.find((list) => list.id === `${deck.id}-main`) || deck.lists[0];
    assert.ok(main, `${deck.id}: thieu list mau`);
    assert.ok(main.pages.length > 0, `${deck.id}: list mau khong co trang`);
    main.pages.forEach((page, index) => {
      if (page.type !== 'list') return;
      assert.ok(page.items.length > 0, `${deck.id} trang ${index + 1}: khong duoc mat toan bo item`);
    });
    return [deck.id, main.pages.map(pageSignature)];
  }));
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'all-decks-cache-parity-'));
try {
  configureDriveFileDiskCache(temp);
  const cold = deckSignatures();

  for (const fileId of [...new Set(allFileIds)]) {
    fs.writeFileSync(path.join(temp, `${fileId}.bin`), Buffer.from('ffd8ff', 'hex'));
    fs.writeFileSync(path.join(temp, `${fileId}.json`), JSON.stringify({
      contentType: 'image/jpeg',
      savedAt: Date.now(),
    }));
  }
  const warm = deckSignatures();

  assert.deepEqual(
    cold,
    warm,
    'Trang thai cache lanh/nong khong duoc thay doi so trang, layout hoac so item cua bat ky mau nao',
  );
  console.log(`PASS all-decks-cold-cache: ${Object.keys(cold).length} mau giu nguyen cau truc khi cache lanh.`);
} finally {
  configureDriveFileDiskCache('');
  fs.rmSync(temp, { recursive: true, force: true });
}
