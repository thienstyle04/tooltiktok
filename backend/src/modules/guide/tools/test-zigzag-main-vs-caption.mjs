/**
 * So sánh render HTML zigzag: list chính vs list AI caption.
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../../../../../');
const markupPath = join(rootDir, 'frontend/lib/pageMarkup.js');
const generatedPath = join(rootDir, 'backend/data/generated-caption-lists.dalat.json');

async function loadMarkup() {
  const result = await esbuild.build({
    entryPoints: [markupPath],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  const tmp = join(__dirname, '.tmp-zigzag-markup.mjs');
  writeFileSync(tmp, result.outputFiles[0].text);
  const mod = await import(pathToFileURL(tmp).href);
  unlinkSync(tmp);
  return mod;
}

function parseZigzagItems(html) {
  return html.split('class="zigzag-item"').slice(1).map((block, i) => {
    const name = block.match(/zigzag-name[^>]*>([^<]+)/)?.[1]?.trim() || '';
    const addr = block.match(/zigzag-address[^>]*>([^<]+)/)?.[1]?.trim() || '';
    const price = block.match(/zigzag-price[^>]*>([^<]+)/)?.[1]?.trim() || '';
    const label = block.match(/zigzag-label[^>]*>([^<]+)/)?.[1]?.trim() || '';
    const third = price || label;
    const thirdKind = price ? 'price' : label ? 'label' : 'none';
    return { i, name, addr, third, thirdKind, has3: Boolean(name && addr && third) };
  });
}

function pageShellSignature(html) {
  return {
    zigzagPage: html.includes('zigzag-page'),
    zigzagCover: html.includes('zigzag-cover'),
    titleFont: html.match(/title-font-(\d+)/)?.[1] || '',
    hasStoryImageTitleOnName: /zigzag-name story-image-title/.test(html),
    hasPageBg: html.includes('zigzag-page-bg'),
  };
}

function compareItems(mainItems, captionItems) {
  const mismatches = [];
  const len = Math.min(mainItems.length, captionItems.length);
  for (let index = 0; index < len; index += 1) {
    const main = mainItems[index];
    const cap = captionItems[index];
    if (main.thirdKind !== cap.thirdKind) {
      mismatches.push({ index, field: 'thirdKind', main: main.thirdKind, caption: cap.thirdKind });
    }
    if (Boolean(main.addr) !== Boolean(cap.addr)) {
      mismatches.push({ index, field: 'address', main: !!main.addr, caption: !!cap.addr });
    }
  }
  return mismatches;
}

const generatedStore = JSON.parse(readFileSync(generatedPath, 'utf8'));
const captionList = generatedStore.decks?.['grid-6-zigzag']?.[0];
if (!captionList) {
  console.error('Không tìm thấy list caption grid-6-zigzag trong generated JSON');
  process.exit(1);
}

let mainDeck;
try {
  const data = await fetch(process.env.TEST_API_URL || 'http://127.0.0.1:3000/api/guide-data').then((r) => r.json());
  mainDeck = data.decks.find((d) => d.id === 'grid-6-zigzag')?.lists?.find((l) => l.id === 'grid-6-zigzag-main')
    || data.decks.find((d) => d.id === 'grid-6-zigzag')?.lists?.[0];
} catch {
  mainDeck = null;
}

const markup = await loadMarkup();
const foodPage = (list) => list.pages.find((p) => p.chipText === 'Quán ăn');
const mainFood = mainDeck ? foodPage(mainDeck) : null;
const capFood = foodPage(captionList);

const capHtml = markup.renderListPage(capFood, 1, captionList.pages.length, captionList.id, [], captionList);
const capItems = parseZigzagItems(capHtml);
const capShell = pageShellSignature(capHtml);

console.log('=== grid-6-zigzag caption (Quán ăn) ===');
for (const it of capItems) {
  console.log(`  [${it.i}] ${it.name.slice(0, 28)} | addr:${it.addr ? 'Y' : 'N'} | ${it.thirdKind}:${it.third}`);
}
console.log(`  Đủ 3 dòng: ${capItems.filter((x) => x.has3).length}/${capItems.length}`);
console.log('  Shell:', capShell);

if (!mainFood) {
  console.log('\n(API offline — chỉ kiểm tra caption render)');
  const badPrice = capItems.filter((it) => it.thirdKind === 'price' && /Khung giờ:/i.test(it.third));
  if (badPrice.length > 0) {
    console.error(`FAIL: ${badPrice.length} ô quán ăn vẫn hiển thị khung giờ trong badge giá`);
    process.exit(1);
  }
  const foodLabels = capItems.filter((it) => it.thirdKind === 'label');
  if (foodLabels.length < capItems.length) {
    console.error(`FAIL: chỉ ${foodLabels.length}/${capItems.length} ô dùng label bữa ăn`);
    process.exit(1);
  }
  if (capShell.hasStoryImageTitleOnName) {
    console.error('FAIL: zigzag-name vẫn mang class story-image-title');
    process.exit(1);
  }
  console.log('PASS (caption-only checks)');
  process.exit(0);
}

const mainHtml = markup.renderListPage(mainFood, 1, mainDeck.pages.length, mainDeck.id, [], mainDeck);
const mainItems = parseZigzagItems(mainHtml);
const mainShell = pageShellSignature(mainHtml);

console.log('\n=== grid-6-zigzag main (Quán ăn) ===');
for (const it of mainItems) {
  console.log(`  [${it.i}] ${it.name.slice(0, 28)} | addr:${it.addr ? 'Y' : 'N'} | ${it.thirdKind}:${it.third}`);
}
console.log(`  Đủ 3 dòng: ${mainItems.filter((x) => x.has3).length}/${mainItems.length}`);
console.log('  Shell:', mainShell);

const mismatches = compareItems(mainItems, capItems);
console.log('\n=== So sánh main vs caption ===');
if (mainShell.titleFont !== capShell.titleFont) {
  console.error(`FAIL title-font: main=${mainShell.titleFont} caption=${capShell.titleFont}`);
  process.exit(1);
}
if (capShell.hasStoryImageTitleOnName || mainShell.hasStoryImageTitleOnName) {
  console.error('FAIL: zigzag-name vẫn mang class story-image-title');
  process.exit(1);
}
if (mismatches.length > 0) {
  console.error('FAIL mismatches:', mismatches.slice(0, 6));
  process.exit(1);
}
console.log('PASS — main và caption cùng kiểu render (label/giá/địa chỉ)');
