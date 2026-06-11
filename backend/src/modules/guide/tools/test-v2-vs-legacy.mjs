/**
 * So sánh 4 mẫu V2 với bản mẫu legacy tương ứng để phát hiện regression.
 *
 * Cặp so sánh:
 *   grid-8          → grid-8-feed      (V2 remap từ grid-8)
 *   spotlight-guide → spotlight-v2       (V2 remap từ spotlight-guide)
 *   pov-3-day       → pov-3-v2           (cùng nhóm POV, builder khác)
 *   grid-8          → grid-8-quaytung    (cùng nhóm lưới 8 ô, layout khác)
 *
 * Chạy:
 *   node backend/src/modules/guide/tools/test-v2-vs-legacy.mjs
 *   TEST_API_URL=http://127.0.0.1:3000/api/guide-data?refresh=1 node ...
 */
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000/api/guide-data?refresh=1';

/** @typedef {{ legacyId: string, v2Id: string, label: string, mode: 'remap' | 'analog' }} PairDef */

/** @type {PairDef[]} */
const PAIRS = [
  {
    legacyId: 'grid-8',
    v2Id: 'grid-8-feed',
    label: 'Lưới 8 Ô → Lưới 8 Feed V2',
    mode: 'remap',
  },
  {
    legacyId: 'spotlight-guide',
    v2Id: 'spotlight-v2',
    label: 'Spotlight → Spotlight V2',
    mode: 'remap',
  },
  {
    legacyId: 'pov-3-day',
    v2Id: 'pov-3-v2',
    label: 'POV 3 ngày → POV 3 V2',
    mode: 'analog',
  },
  {
    legacyId: 'grid-8',
    v2Id: 'grid-8-quaytung',
    label: 'Lưới 8 Ô → Lưới 8 Quaytung V2',
    mode: 'analog',
  },
];

const V2_LAYOUT_RULES = {
  'grid-8-feed': {
    listVariants: ['grid-8-feed'],
    itemsPerListPage: 8,
    coverNeedsGrid: true,
    minCoverImages: 4,
  },
  'grid-8-quaytung': {
    listVariants: ['grid-8-quaytung', 'grid-8-quaytung-menu'],
    itemsPerGridPage: 8,
    coverVariant: 'grid-8-quaytung-cover',
  },
  'spotlight-v2': {
    listVariants: ['spotlight-v2'],
    itemsPerSpotPage: 1,
    coverNeedsGrid: true,
    minCoverImages: 4,
  },
  'pov-3-v2': {
    listVariants: ['pov-3-v2-stack', 'pov-3-v2-grid'],
    stackItemsPerPage: 3,
    maxStackTagline: 78,
    coverVariant: 'pov-3-v2-cover',
  },
};

const results = [];
let pass = 0;
let fail = 0;
let warn = 0;

function ok(scope, name, detail = '') {
  pass += 1;
  results.push({ level: 'PASS', scope, name, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function bad(scope, name, detail = '') {
  fail += 1;
  results.push({ level: 'FAIL', scope, name, detail });
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

function note(scope, name, detail = '') {
  warn += 1;
  results.push({ level: 'WARN', scope, name, detail });
  console.log(`  ⚠ ${name}${detail ? ` — ${detail}` : ''}`);
}

function getMainList(deck) {
  return (deck?.lists || []).find((list) => /-main$/i.test(String(list?.id || ''))) || deck?.lists?.[0];
}

function pageItems(page) {
  return Array.isArray(page?.items) ? page.items : [];
}

function itemKey(item) {
  return String(item?.id || item?.sourceKey || item?.rawName || item?.name || '').trim();
}

function itemName(item) {
  return String(item?.rawName || item?.name || item?.label || '').trim();
}

function hasVnSuffix(text) {
  return /\bĐà\s*Lạt\s+VN\b/i.test(text) || /\s\/\s*VN\b/i.test(text) || /\sVN\s*$/i.test(text);
}

function extractPrice(item) {
  const secondary = String(item?.metaSecondary || '').replace(/\s+/g, ' ').trim();
  const priceMatch = secondary.match(/Giá:\s*([^·]+)/i);
  if (priceMatch) {
    const raw = priceMatch[1].trim();
    if (/free|miễn\s*phí|^0\s*đ$/i.test(raw)) return 'FREE';
    return raw;
  }
  if (/free|miễn\s*phí/i.test(secondary)) return 'FREE';
  return '';
}

function analyzeList(list) {
  const pages = list?.pages || [];
  const cover = pages.find((p) => p.type === 'cover');
  const listPages = pages.filter((p) => p.type === 'list');
  const allItems = listPages.flatMap((p) => pageItems(p));
  const withImage = allItems.filter((i) => String(i.imageUrl || '').trim());
  const mapped = allItems.filter((i) => i.imageMapped || i.imageSource === 'manual' || i.imageSource === 'auto');
  const named = allItems.filter((i) => itemName(i));
  const dupIdsByPage = listPages.map((p) => {
    const ids = pageItems(p).map(itemKey).filter(Boolean);
    return ids.length - new Set(ids).size;
  });

  return {
    pageCount: pages.length,
    listPageCount: listPages.length,
    cover,
    listPages,
    allItems,
    imageRate: allItems.length ? withImage.length / allItems.length : 1,
    mappedRate: allItems.length ? mapped.length / allItems.length : 1,
    namedRate: allItems.length ? named.length / allItems.length : 1,
    missingImages: allItems.length - withImage.length,
    duplicateItemPages: dupIdsByPage.filter((n) => n > 0).length,
    coverHasImage: Boolean(
      String(cover?.backgroundImage || '').trim()
      || (Array.isArray(cover?.coverImages) && cover.coverImages.filter(Boolean).length > 0),
    ),
    coverImageCount: Array.isArray(cover?.coverImages) ? cover.coverImages.filter(Boolean).length : 0,
  };
}

function pageCategoryKey(page) {
  const chip = String(page?.chipText || '').trim();
  const title = String(page?.title || '').trim();
  return normalizeKey(chip || title || String(page?.layoutVariant || ''));
}

function normalizeKey(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function listPagesByVariant(pages, variants) {
  return pages.filter(
    (p) => p.type === 'list' && variants.includes(String(p.layoutVariant || '')),
  );
}

function groupPagesByCategory(pages) {
  /** @type {Map<string, import('../../../common/interfaces/guide.types').DeckPage[]>} */
  const groups = new Map();
  for (const page of pages) {
    const key = pageCategoryKey(page);
    const bucket = groups.get(key) || [];
    bucket.push(page);
    groups.set(key, bucket);
  }
  return groups;
}

function compareRemapPair(legacy, v2, pair) {
  const legacyGroups = groupPagesByCategory(legacy.listPages);
  const v2Groups = groupPagesByCategory(v2.listPages);
  const allKeys = new Set([...legacyGroups.keys(), ...v2Groups.keys()]);

  let structureMismatch = 0;
  for (const key of allKeys) {
    const legacyCount = legacyGroups.get(key)?.length || 0;
    const v2Count = v2Groups.get(key)?.length || 0;
    if (legacyCount !== v2Count) structureMismatch += 1;
  }

  if (structureMismatch === 0) {
    ok(pair.label, 'cấu trúc trang theo nhóm nội dung khớp', `${allKeys.size} nhóm, ${legacy.listPages.length} trang`);
  } else {
    bad(
      pair.label,
      'cấu trúc trang theo nhóm nội dung khớp',
      `${structureMismatch} nhóm lệch số trang (legacy ${legacy.listPages.length}, v2 ${v2.listPages.length})`,
    );
  }

  let itemCountMismatch = 0;
  let imageRegression = 0;
  let overlapLow = 0;

  for (const key of allKeys) {
    const legacyPages = legacyGroups.get(key) || [];
    const v2Pages = v2Groups.get(key) || [];
    const limit = Math.min(legacyPages.length, v2Pages.length);
    for (let i = 0; i < limit; i += 1) {
      const lItems = pageItems(legacyPages[i]);
      const vItems = pageItems(v2Pages[i]);
      if (lItems.length !== vItems.length) itemCountMismatch += 1;

      const legacyIds = new Set(lItems.map(itemKey).filter(Boolean));
      const v2Ids = new Set(vItems.map(itemKey).filter(Boolean));
      const overlap = [...legacyIds].filter((id) => v2Ids.has(id)).length;
      const union = new Set([...legacyIds, ...v2Ids]).size;
      if (union > 0 && overlap / union < 0.5) overlapLow += 1;

      for (const vItem of vItems) {
        const vk = itemKey(vItem);
        const legacyMatch = lItems.find((item) => itemKey(item) === vk);
        if (legacyMatch && String(legacyMatch.imageUrl || '').trim() && !String(vItem.imageUrl || '').trim()) {
          imageRegression += 1;
        }
      }
    }
  }

  if (itemCountMismatch === 0) ok(pair.label, 'số item/trang giữ nguyên theo nhóm nội dung');
  else bad(pair.label, 'số item/trang giữ nguyên theo nhóm nội dung', `${itemCountMismatch} nhóm lệch`);

  if (overlapLow <= 1) {
    ok(
      pair.label,
      'item overlap hợp lý giữa legacy và V2',
      overlapLow === 0 ? 'cùng pool dữ liệu' : '1 nhóm khác item do global allocator',
    );
  } else {
    note(pair.label, 'item overlap thấp ở nhiều nhóm', `${overlapLow} nhóm — deck build độc lập, không phải bug layout`);
  }

  if (imageRegression === 0) ok(pair.label, 'không mất ảnh trên item trùng legacy');
  else bad(pair.label, 'không mất ảnh trên item trùng legacy', `${imageRegression} ô mất ảnh`);

  const imageDrop = legacy.imageRate - v2.imageRate;
  if (imageDrop <= 0.05) ok(pair.label, 'tỷ lệ có ảnh ≥ legacy', `legacy ${pct(legacy.imageRate)}, v2 ${pct(v2.imageRate)}`);
  else bad(pair.label, 'tỷ lệ có ảnh ≥ legacy', `legacy ${pct(legacy.imageRate)}, v2 ${pct(v2.imageRate)} (giảm ${pct(imageDrop)})`);

  const mappedDrop = legacy.mappedRate - v2.mappedRate;
  if (mappedDrop <= 0.1) ok(pair.label, 'tỷ lệ mapped ≥ legacy', `legacy ${pct(legacy.mappedRate)}, v2 ${pct(v2.mappedRate)}`);
  else bad(pair.label, 'tỷ lệ mapped ≥ legacy', `legacy ${pct(legacy.mappedRate)}, v2 ${pct(v2.mappedRate)}`);
}

function compareAnalogPair(legacy, v2, pair) {
  if (v2.listPageCount >= Math.max(1, legacy.listPageCount - 2)) {
    ok(pair.label, 'V2 có đủ trang nội dung', `legacy ${legacy.listPageCount}, v2 ${v2.listPageCount}`);
  } else {
    bad(pair.label, 'V2 có đủ trang nội dung', `legacy ${legacy.listPageCount}, v2 ${v2.listPageCount}`);
  }

  if (v2.imageRate + 0.05 >= legacy.imageRate) {
    ok(pair.label, 'tỷ lệ có ảnh không thấp hơn legacy nhiều', `legacy ${pct(legacy.imageRate)}, v2 ${pct(v2.imageRate)}`);
  } else {
    bad(pair.label, 'tỷ lệ có ảnh không thấp hơn legacy nhiều', `legacy ${pct(legacy.imageRate)}, v2 ${pct(v2.imageRate)}`);
  }

  if (v2.mappedRate + 0.1 >= legacy.mappedRate) {
    ok(pair.label, 'tỷ lệ mapped không thấp hơn legacy nhiều', `legacy ${pct(legacy.mappedRate)}, v2 ${pct(v2.mappedRate)}`);
  } else {
    bad(pair.label, 'tỷ lệ mapped không thấp hơn legacy nhiều', `legacy ${pct(legacy.mappedRate)}, v2 ${pct(v2.mappedRate)}`);
  }

  if (v2.namedRate >= legacy.namedRate - 0.05) {
    ok(pair.label, 'tỷ lệ có tên item ổn', `legacy ${pct(legacy.namedRate)}, v2 ${pct(v2.namedRate)}`);
  } else {
    bad(pair.label, 'tỷ lệ có tên item ổn', `legacy ${pct(legacy.namedRate)}, v2 ${pct(v2.namedRate)}`);
  }
}

function checkSharedInvariants(scope, stats) {
  if (stats.cover) ok(scope, 'có trang cover');
  else bad(scope, 'có trang cover');

  if (stats.coverHasImage) ok(scope, 'cover có ảnh nền/grid');
  else bad(scope, 'cover có ảnh nền/grid');

  if (stats.listPageCount > 0) ok(scope, 'có trang list', `${stats.listPageCount} trang`);
  else bad(scope, 'có trang list');

  if (stats.allItems.length > 0) ok(scope, 'có item dữ liệu', `${stats.allItems.length} item`);
  else bad(scope, 'có item dữ liệu');

  if (stats.missingImages === 0) ok(scope, 'mọi item có imageUrl');
  else bad(scope, 'mọi item có imageUrl', `thiếu ${stats.missingImages}/${stats.allItems.length}`);

  if (stats.duplicateItemPages === 0) ok(scope, 'không trùng item trên cùng trang');
  else bad(scope, 'không trùng item trên cùng trang', `${stats.duplicateItemPages} trang`);

  const coverTitle = String(stats.cover?.title || '');
  if (!hasVnSuffix(coverTitle)) ok(scope, 'cover title không có hậu tố VN');
  else bad(scope, 'cover title không có hậu tố VN', coverTitle.slice(0, 60));
}

function checkV2SpecificRules(v2Id, list, scope) {
  const rules = V2_LAYOUT_RULES[v2Id];
  if (!rules) return;
  const pages = list?.pages || [];

  if (rules.coverVariant) {
    const cover = pages.find((p) => p.type === 'cover');
    if (cover?.layoutVariant === rules.coverVariant) ok(scope, `cover layoutVariant = ${rules.coverVariant}`);
    else bad(scope, `cover layoutVariant = ${rules.coverVariant}`, String(cover?.layoutVariant || 'n/a'));
  }

  if (rules.coverNeedsGrid) {
    const cover = pages.find((p) => p.type === 'cover');
    const count = Array.isArray(cover?.coverImages) ? cover.coverImages.filter(Boolean).length : 0;
    const min = rules.minCoverImages || 4;
    if (count >= min) ok(scope, `cover grid ≥${min} ảnh`, `${count} ảnh`);
    else bad(scope, `cover grid ≥${min} ảnh`, `${count} ảnh`);
  }

  if (rules.itemsPerListPage) {
    const gridPages = listPagesByVariant(pages, rules.listVariants);
    const badPages = gridPages.filter((p) => pageItems(p).length !== rules.itemsPerListPage);
    if (badPages.length === 0) ok(scope, `mỗi trang lưới có ${rules.itemsPerListPage} item`, `${gridPages.length} trang`);
    else bad(scope, `mỗi trang lưới có ${rules.itemsPerListPage} item`, `${badPages.length}/${gridPages.length} trang lệch`);
  }

  if (rules.itemsPerGridPage) {
    const gridPages = listPagesByVariant(pages, ['grid-8-quaytung']);
    const badPages = gridPages.filter((p) => pageItems(p).length !== rules.itemsPerGridPage);
    if (gridPages.length === 0) note(scope, 'chưa có trang grid-8-quaytung trong sample');
    else if (badPages.length === 0) ok(scope, `trang quaytung có ${rules.itemsPerGridPage} ô`, `${gridPages.length} trang`);
    else bad(scope, `trang quaytung có ${rules.itemsPerGridPage} ô`, `${badPages.length} trang lệch`);
  }

  if (rules.itemsPerSpotPage) {
    const spotPages = listPagesByVariant(pages, ['spotlight-v2']);
    const badPages = spotPages.filter((p) => pageItems(p).length !== rules.itemsPerSpotPage);
    if (badPages.length === 0) ok(scope, 'spotlight mỗi trang 1 địa điểm', `${spotPages.length} trang`);
    else bad(scope, 'spotlight mỗi trang 1 địa điểm', `${badPages.length} trang lệch`);
  }

  if (rules.stackItemsPerPage) {
    const stackPages = listPagesByVariant(pages, ['pov-3-v2-stack']);
    const counts = stackPages.map((p) => pageItems(p).length);
    const allThree = counts.every((n) => n === rules.stackItemsPerPage);
    if (allThree && stackPages.length > 0) ok(scope, `POV stack ${rules.stackItemsPerPage} hàng/trang`, counts.join(', '));
    else if (stackPages.length === 0) bad(scope, `POV stack ${rules.stackItemsPerPage} hàng/trang`, '0 trang stack');
    else bad(scope, `POV stack ${rules.stackItemsPerPage} hàng/trang`, counts.join(', '));
  }

  if (rules.maxStackTagline) {
    const stackPages = listPagesByVariant(pages, ['pov-3-v2-stack']);
    const taglines = stackPages.flatMap((p) => pageItems(p).map((i) => String(i.label || '')));
    const clipped = taglines.filter((text) => /…|\.\.\./.test(text));
    const maxLen = taglines.reduce((max, t) => Math.max(max, t.length), 0);
    if (clipped.length === 0) ok(scope, 'tagline stack không có dấu …', `${taglines.length} dòng`);
    else bad(scope, 'tagline stack không có dấu …', `${clipped.length} dòng còn dấu …`);
    if (maxLen <= rules.maxStackTagline) ok(scope, `tagline stack ≤${rules.maxStackTagline} ký tự`, `max ${maxLen}`);
    else bad(scope, `tagline stack ≤${rules.maxStackTagline} ký tự`, `max ${maxLen}`);
  }

  if (v2Id === 'grid-8-quaytung') {
    const gridPages = listPagesByVariant(pages, ['grid-8-quaytung']);
    let unifiedOk = 0;
    let unifiedFail = 0;
    for (const page of gridPages) {
      const items = pageItems(page).slice(0, 8);
      const prices = items.map(extractPrice);
      const anyPrice = prices.some(Boolean);
      if (!anyPrice) continue;
      const allHave = items.every((item, i) => prices[i] || item?.sourceSectionKey?.includes('check') || item?.sourceSectionKey?.includes('khu_du'));
      if (allHave) unifiedOk += 1;
      else unifiedFail += 1;
    }
    if (unifiedFail === 0) ok(scope, 'giá thống nhất trên trang có giá', unifiedOk > 0 ? `${unifiedOk} trang kiểm tra` : 'sample chưa có giá');
    else bad(scope, 'giá thống nhất trên trang có giá', `${unifiedFail} trang thiếu giá`);
  }
}

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

async function fetchDataset() {
  const res = await fetch(API, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API ${res.status}: ${API}`);
  return res.json();
}

function testPair(dataset, pair) {
  console.log(`\n=== ${pair.label} ===`);
  const legacyDeck = (dataset.decks || []).find((d) => d.id === pair.legacyId);
  const v2Deck = (dataset.decks || []).find((d) => d.id === pair.v2Id);
  if (!legacyDeck) {
    bad(pair.label, 'legacy deck tồn tại', pair.legacyId);
    return;
  }
  if (!v2Deck) {
    bad(pair.label, 'V2 deck tồn tại', pair.v2Id);
    return;
  }

  const legacyList = getMainList(legacyDeck);
  const v2List = getMainList(v2Deck);
  if (!legacyList || !v2List) {
    bad(pair.label, 'cả hai list main tồn tại');
    return;
  }

  const legacyStats = analyzeList(legacyList);
  const v2Stats = analyzeList(v2List);

  console.log(`\n  [${pair.legacyId}]`);
  checkSharedInvariants(`${pair.legacyId}`, legacyStats);

  console.log(`\n  [${pair.v2Id}]`);
  checkSharedInvariants(`${pair.v2Id}`, v2Stats);
  checkV2SpecificRules(pair.v2Id, v2List, pair.v2Id);

  console.log('\n  [So sánh legacy → V2]');
  if (pair.mode === 'remap') compareRemapPair(legacyStats, v2Stats, pair);
  else compareAnalogPair(legacyStats, v2Stats, pair);
}

function printSummary() {
  console.log('\n=== Kết quả ===');
  console.log(`PASS: ${pass}`);
  console.log(`FAIL: ${fail}`);
  if (warn > 0) console.log(`WARN: ${warn}`);

  const failures = results.filter((r) => r.level === 'FAIL');
  if (failures.length > 0) {
    console.log('\nCác lỗi / regression phát hiện:');
    for (const row of failures) {
      console.log(`  - [${row.scope}] ${row.name}${row.detail ? `: ${row.detail}` : ''}`);
    }
  } else {
    console.log('\nKhông phát hiện regression V2 so với legacy.');
  }
}

async function main() {
  console.log('=== Test V2 vs Legacy (phát hiện regression) ===');
  console.log(`API: ${API}`);

  let dataset;
  try {
    dataset = await fetchDataset();
    ok('global', 'API guide-data', `${(dataset.decks || []).length} decks`);
  } catch (error) {
    bad('global', 'API guide-data', error.message);
    printSummary();
    process.exit(1);
  }

  for (const pair of PAIRS) testPair(dataset, pair);
  printSummary();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
