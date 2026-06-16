/**
 * Kiểm tra render thực tế (HTML) cho các bug sheet dòng 117+.
 */
import { writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../../../../../');
const markupPath = join(rootDir, 'frontend/lib/pageMarkup.js');

async function loadMarkup() {
  const result = await esbuild.build({
    entryPoints: [markupPath],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  const tmp = join(__dirname, '.tmp-verify-markup.mjs');
  writeFileSync(tmp, result.outputFiles[0].text);
  const mod = await import(pathToFileURL(tmp).href);
  unlinkSync(tmp);
  return mod;
}

function parseZigzagItems(html) {
  const chunks = html.split('class="zigzag-item"').slice(1);
  return chunks.map((block, i) => {
    const name = block.match(/zigzag-name[^>]*>([^<]+)/)?.[1]?.trim() || '';
    const addr = block.match(/zigzag-address[^>]*>([^<]+)/)?.[1]?.trim() || '';
    const price = block.match(/zigzag-price[^>]*>([^<]+)/)?.[1]?.trim() || '';
    const label = block.match(/zigzag-label[^>]*>([^<]+)/)?.[1]?.trim() || '';
    const third = price || label;
    return { i, name, addr, third, has3: Boolean(name && addr && third) };
  });
}

function parseMutantAddresses(html) {
  const chunks = html.split('class="grid4-mutant-item').slice(1);
  return chunks.map((block) => ({
    name: block.match(/grid4-mutant-name[^>]*>([^<]+)/)?.[1]?.trim() || '',
    addr: block.match(/grid4-mutant-address-text[^>]*>([^<]+)/)?.[1]?.trim() || '',
  }));
}

function parsePhotomodeMeta(html) {
  const chunks = html.split('class="photomode-item').slice(1);
  return chunks.map((block) => ({
    name: block.match(/photomode-name[^>]*>([^<]+)/)?.[1]?.trim() || '',
    meta: block.match(/photomode-meta[^>]*>([^<]+)/)?.[1]?.trim() || '',
  }));
}

function parseItineraryRows(html) {
  const chunks = html.split('itinerary-row').slice(1);
  return chunks.map((block) => ({
    time: block.match(/itinerary-time[^>]*>([^<]+)/)?.[1]?.trim() || '',
    name: block.match(/itinerary-name[^>]*>([^<]+)/)?.[1]?.trim() || '',
    detail: block.match(/itinerary-detail[^>]*>([^<]+)/)?.[1]?.trim() || '',
  }));
}

const data = await fetch(process.env.TEST_API_URL || 'http://127.0.0.1:3000/api/guide-data').then((r) => r.json());
const markup = await loadMarkup();

function deckList(deckId) {
  return data.decks.find((d) => d.id === deckId)?.lists?.[0];
}

console.log('=== grid-6-zigzag · Quán ăn (render HTML) ===');
const zz = deckList('grid-6-zigzag');
const zzPage = zz?.pages?.find((p) => p.chipText === 'Quán ăn');
const zzHtml = markup.renderListPage(zzPage, 1, zz.pages.length, zz.id, [], zz);
const zzItems = parseZigzagItems(zzHtml);
for (const it of zzItems) {
  console.log(`  [${it.i}] ${it.name} | địa chỉ: ${it.addr ? 'có' : 'THIẾU'} | dòng 3: ${it.third || 'THIẾU'}`);
}
console.log(`  Kết quả: ${zzItems.filter((x) => x.has3).length}/${zzItems.length} ô đủ 3 dòng (tên + địa chỉ + giá/label)`);

console.log('\n=== grid-4-mutant · Khu du lịch (render HTML) ===');
const gm = deckList('grid-4-mutant');
const gmPage = gm?.pages?.find((p) => p.chipText === 'Khu du lịch');
const gmHtml = markup.renderListPage(gmPage, 7, gm.pages.length, gm.id, [], gm);
const gmAddrs = parseMutantAddresses(gmHtml);
for (const [i, a] of gmAddrs.entries()) {
  console.log(`  [${i}] ${a.name} | ${a.addr || 'THIẾU địa chỉ'}`);
}
console.log(`  Kết quả: ${gmAddrs.filter((a) => a.addr).length}/${gmAddrs.length} ô có địa chỉ`);

console.log('\n=== grid-6 · Khu du lịch (render HTML) ===');
const g6 = deckList('grid-6');
const g6Page = g6?.pages?.find((p) => p.chipText === 'Khu du lịch');
const g6Html = markup.renderListPage(g6Page, 7, g6.pages.length, g6.id, [], g6);
const g6Items = parsePhotomodeMeta(g6Html);
for (const [i, a] of g6Items.entries()) {
  console.log(`  [${i}] ${a.name} | meta: ${a.meta || 'THIẾU'}`);
}
console.log(`  Kết quả: ${g6Items.filter((a) => a.meta).length}/${g6Items.length} ô có meta (địa chỉ/giá)`);

console.log('\n=== itinerary-3n2d · Ngày 1 (render HTML) ===');
const it = deckList('itinerary-3n2d');
const itPage = it?.pages?.find((p) => p.chipText === 'Ngày 1');
const itHtml = markup.renderListPage(itPage, 1, it.pages.length, it.id, [], it);
const rows = parseItineraryRows(itHtml);
console.log(`  ${rows.length} dòng lịch trình (API: ${itPage?.items?.length ?? 0} items)`);
for (const r of rows) {
  console.log(`  ${r.time} · ${r.name} · ${r.detail.slice(0, 60)}`);
}
console.log(`  Layout: itinerary + ${itHtml.includes('crowded') ? 'crowded' : 'normal'}`);
