/**
 * So sánh bảng chi phí main vs list giả lập cho budget-3n2d và budget-72h-summary.
 * node backend/src/modules/guide/tools/compare-budget-table-lists.mjs
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

require('ts-node/register/transpile-only');

const { buildPagesForDeck, createDeckBuildPools } = require('../logic/deck-builder.ts');
const { fetchWorkbookFromSheet } = require('../sync/workbook-source.ts');
const { getDestinationConfig } = require('../sync/destination-config.ts');
const { readSheetDriveManifest } = require('../sync/sheet-drive-manifest.ts');
const { resolveBackendDataDir, resolveBackendRoot } = require('../../../config.ts');
const {
  imageUrlsForDirectory,
  readAssetFromBase,
  resolveMappedImage,
  itemMappingKey,
  firstValue,
  normalizeText,
} = require('../logic/image-resolver.ts');
const { SECTION_CONFIG } = require('../../../common/constants/guide.constants.ts');
const { resolveSectionKeyFromSheetName } = require('../sync/sheet-section.ts');
const XLSX = require('xlsx');
const fs = require('node:fs');
const path = require('node:path');

function tableSignature(pages) {
  const table = (pages || []).find((p) => p.layoutVariant === 'budget-3n2d-table');
  return (table?.items || [])
    .filter((it) => !String(it.label || '').startsWith('Tổng|'))
    .map((it) => `${it.label}|${it.rawName || it.name}|${it.metaSecondary || ''}`)
    .join('\n');
}

function tableVenueNames(pages) {
  const table = (pages || []).find((p) => p.layoutVariant === 'budget-3n2d-table');
  return (table?.items || [])
    .filter((it) => !String(it.label || '').startsWith('Tổng|'))
    .filter((it) => !/xe phương trang|bến xe|check out/i.test(String(it.name || '')))
    .map((it) => String(it.rawName || it.name || '').replace(/^[^:]+:\s*/, '').trim())
    .filter(Boolean);
}

async function loadItemsBySection() {
  const dataRoot = resolveBackendDataDir(resolveBackendRoot(__dirname));
  const source = await fetchWorkbookFromSheet(getDestinationConfig('dalat'));
  const imageUrls = [];
  const imageMapping = { version: 1, items: {} };
  const libraryEntries = [];
  const manifest = readSheetDriveManifest(dataRoot, 'dalat');
  const workbook = source.workbook;
  const results = Object.fromEntries(Object.keys(SECTION_CONFIG).map((k) => [k, []]));

  for (const sheetName of workbook.SheetNames) {
    const sectionKey = resolveSectionKeyFromSheetName(sheetName);
    if (!sectionKey) continue;
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const headers = (rows[0] ?? []).map((h) => normalizeText(h));
    let seq = 0;
    for (const rawRow of rows.slice(1)) {
      const row = {};
      headers.forEach((h, i) => { row[h] = String(rawRow[i] ?? '').trim(); });
      const rawName = firstValue(row, 'ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten');
      if (!rawName) continue;
      seq += 1;
      results[sectionKey].push({
        id: `${sectionKey}-${seq}`,
        sectionKey,
        name: rawName,
        address: firstValue(row, 'dia_chi'),
        headPrice: firstValue(row, 'gia_dau_nguoi'),
        hasHeadPriceColumn: 'gia_dau_nguoi' in row,
        price: firstValue(row, 'gia'),
        isPartner: normalizeText(firstValue(row, 'doi_tac', 'doi_tac_cong_ty')) === 'x',
        imageMappingKey: itemMappingKey(sectionKey, rawName, firstValue(row, 'dia_chi')),
        imageUrl: '',
        imageMapped: false,
        imageSource: 'fallback',
      });
    }
  }
  return results;
}

async function main() {
  const itemsBySection = await loadItemsBySection();
  const pools = createDeckBuildPools(itemsBySection);
  const usedIds = new Set();
  const usedImages = new Set();

  for (const deckId of ['budget-3n2d', 'budget-72h-summary']) {
    console.log(`\n=== ${deckId} ===`);
    const mainPages = buildPagesForDeck(deckId, itemsBySection, [], [], `${deckId}-main`, usedIds, usedImages, []);
    const ai1Pages = buildPagesForDeck(deckId, itemsBySection, [], [], `${deckId}|ai-01|tone-a|seed-1`, usedIds, usedImages, []);
    const ai2Pages = buildPagesForDeck(deckId, itemsBySection, [], [], `${deckId}|ai-02|tone-b|seed-2`, usedIds, usedImages, []);

    const mainSig = tableSignature(mainPages);
    const ai1Sig = tableSignature(ai1Pages);
    const ai2Sig = tableSignature(ai2Pages);

    const mainNames = tableVenueNames(mainPages).slice(0, 4);
    const ai1Names = tableVenueNames(ai1Pages).slice(0, 4);
    const ai2Names = tableVenueNames(ai2Pages).slice(0, 4);

    console.log('Main vs AI1 table identical:', mainSig === ai1Sig ? 'YES (BUG)' : 'NO (OK)');
    console.log('AI1 vs AI2 table identical:', ai1Sig === ai2Sig ? 'YES (BUG)' : 'NO (OK)');
    console.log('Main sample venues:', mainNames.join(' | '));
    console.log('AI1 sample venues:', ai1Names.join(' | '));
    console.log('AI2 sample venues:', ai2Names.join(' | '));
    console.log('Page count main/ai1/ai2:', mainPages.length, ai1Pages.length, ai2Pages.length);
  }

  console.log('\n--- Export resolver (frontend logic) ---');
  const fakeList = { id: 'budget-3n2d-caption-01', pages: [{ layoutVariant: 'budget-3n2d-table', items: [{ name: 'AI-only' }] }] };
  const fakeMain = { id: 'budget-3n2d-main', pages: [{ layoutVariant: 'budget-3n2d-table', items: [{ name: 'Main-only' }] }] };
  const fakeDeck3n2d = { id: 'budget-3n2d', lists: [fakeMain] };
  const fakeDeck72h = { id: 'budget-72h-summary', lists: [fakeMain] };

  // mirror utils.js resolveBudget72HExportList
  function resolveExport(deck, list) {
    if (!deck || !list || deck.id !== 'budget-72h-summary') return list;
    return { ...list, templateVersion: fakeMain.templateVersion };
  }

  const out3 = resolveExport(fakeDeck3n2d, fakeList);
  const out72 = resolveExport(fakeDeck72h, fakeList);
  console.log('budget-3n2d export keeps AI table:', out3.pages[0].items[0].name);
  console.log('budget-72h-summary export keeps AI table:', out72.pages[0].items[0].name);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
