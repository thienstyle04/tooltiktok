/**
 * Test cover dedup + orientation:any via live API (~2 lists).
 * Run: node src/modules/guide/tools/test-fix-2lists.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = process.env.GUIDE_API_BASE || 'http://127.0.0.1:3000';
const DECK_ID = process.env.TEST_DECK_ID || 'grid-6-zigzag';

function stableHash(seed) {
  let result = 0;
  for (let index = 0; index < seed.length; index += 1) {
    result = (result * 131 + seed.charCodeAt(index) + index) % 2_147_483_647;
  }
  return result;
}

function oldCoverPick(list, pool) {
  if (!pool.length) return '';
  return pool[stableHash(`${list.id}|${list.title}|${list.description}|cover`) % pool.length] || '';
}

function newCoverPick(list, pool, used) {
  if (!pool.length) return '';
  const seed = `${list.id}|${list.title}|${list.description}|cover`;
  const ordered = [...pool].sort((a, b) => stableHash(`${seed}:${a}`) - stableHash(`${seed}:${b}`));
  const picked = ordered.find((url) => !used.has(url)) || ordered[0] || '';
  if (picked) used.add(picked);
  return picked;
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${path} → ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  return body;
}

function coverFromList(list) {
  const page = (list.pages || []).find((p) => p.type === 'cover');
  return page?.backgroundImage || '';
}

function itemImageStats(list) {
  const urls = [];
  for (const page of list.pages || []) {
    if (page.type !== 'list') continue;
    for (const item of page.items || []) {
      if (item.imageUrl) urls.push(item.imageUrl);
    }
  }
  const drive = urls.filter((u) => u.includes('/assets/drive-file')).length;
  const library = urls.filter((u) => u.includes('/assets/library')).length;
  const dalat = urls.filter((u) => u.includes('/assets/dalat')).length;
  const http = urls.filter((u) => /^https?:\/\//i.test(u)).length;
  return { total: urls.length, drive, library, dalat, http };
}

async function main() {
  console.log('=== TEST FIX: cover dedup + orientation any (~2 list) ===\n');
  console.log(`API  : ${API_BASE}`);
  console.log(`Deck : ${DECK_ID}\n`);

  const health = await api('/api/health');
  console.log('Health:', health.status);

  const captions = [
    {
      coverTitle: 'TOP 6 BAR ĐÀ LẠT',
      headline: 'Test cover dedup list 1',
      body: 'Lưu list này để có gợi ý chơi đêm Đà Lạt gọn hơn, dễ chọn quán theo vibe và đỡ mất thời gian mò từng nơi.',
      hashtags: ['#dalat', '#choidem'],
    },
    {
      coverTitle: '6 QUÁN NIGHTLIFE',
      headline: 'Test cover dedup list 2',
      body: 'List test thứ hai kiểm tra cover không trùng và ảnh item lấy từ Drive sheet sau khi bỏ portrait filter.',
      hashtags: ['#dalatnight', '#bar'],
    },
  ];

  const created = [];
  for (let i = 0; i < captions.length; i += 1) {
    const t0 = Date.now();
    const result = await api('/api/decks/generate-from-caption', {
      method: 'POST',
      body: JSON.stringify({ deckId: DECK_ID, tone: 'lich_trinh_huu_ich', caption: captions[i] }),
    });
    console.log(`\n[${i + 1}/2] Generated: ${result.listId} (${Date.now() - t0}ms)`);
    created.push({ deckId: result.deckId, listId: result.listId });
  }

  const tFetch = Date.now();
  const dataset = await api('/api/guide-data?refresh=true');
  console.log(`\nDataset loaded (${Date.now() - tFetch}ms)`);

  const deck = (dataset.decks || []).find((d) => d.id === DECK_ID);
  if (!deck) throw new Error(`Deck not found: ${DECK_ID}`);

  const testLists = deck.lists.filter((l) => created.some((c) => c.listId === l.id));
  if (testLists.length !== 2) {
    throw new Error(`Expected 2 test lists, got ${testLists.length}`);
  }

  const manifestPath = path.resolve(__dirname, '../../../../data/sheet-drive-images.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const coverPool = (manifest.coverImages || [])
    .filter((e) => e.fileId)
    .map((e) => `/assets/drive-file?id=${e.fileId}`);
  console.log(`\nCover pool size: ${coverPool.length}`);
  console.log(`Sheet items   : ${Object.keys(manifest.items || {}).length} (choi_dem: ${Object.keys(manifest.items || {}).filter((k) => k.startsWith('choi_dem')).length})`);
  console.log(`Dataset items : ${dataset.source?.totalItems ?? '?'} total, ${dataset.source?.mappedItemCount ?? '?'} mapped`);

  const covers = testLists.map((list) => ({
    id: list.id,
    title: list.title,
    cover: coverFromList(list),
  }));

  console.log('\n--- Cover thực tế từ API ---');
  covers.forEach((c, i) => {
    const short = c.cover.includes('id=') ? c.cover.split('id=')[1]?.slice(0, 16) : c.cover.slice(-24);
    console.log(`  List ${i + 1}: ${c.id}`);
    console.log(`    cover fileId: ${short || '(empty)'}`);
  });

  const uniqueCovers = new Set(covers.map((c) => c.cover).filter(Boolean));
  const coverDup = covers.length - uniqueCovers.size;

  const oldUsed = new Set();
  const newUsed = new Set();
  const oldPicks = testLists.map((l) => oldCoverPick(l, coverPool));
  const newPicks = testLists.map((l) => newCoverPick(l, coverPool, newUsed));
  const oldUnique = new Set(oldPicks.filter(Boolean)).size;

  console.log('\n--- So sánh logic cover ---');
  console.log(`  Logic CŨ (hash % pool)  : ${oldUnique}/${testLists.length} unique`);
  console.log(`  Logic MỚI (dedup)       : ${newUsed.size}/${testLists.length} unique`);
  console.log(`  API trả về sau sanitize : ${uniqueCovers.size}/${testLists.length} unique`);
  console.log(`  Cover trùng trên API    : ${coverDup}`);

  console.log('\n--- Ảnh item (orientation any) ---');
  let totalItems = 0;
  let totalDrive = 0;
  let totalLibrary = 0;
  let totalDalat = 0;
  testLists.forEach((list, i) => {
    const stats = itemImageStats(list);
    totalItems += stats.total;
    totalDrive += stats.drive;
    totalLibrary += stats.library;
    totalDalat += stats.dalat;
    console.log(`  List ${i + 1} (${list.id}): ${stats.total} ảnh → Drive ${stats.drive} | library ${stats.library} | dalat ${stats.dalat}`);
  });
  const drivePct = totalItems ? ((totalDrive / totalItems) * 100).toFixed(1) : '0';
  console.log(`  Tổng: ${totalItems} ảnh item, ${totalDrive} từ Drive (${drivePct}%)`);

  const choiDemItems = [];
  for (const list of testLists) {
    for (const page of list.pages || []) {
      if (page.type !== 'list') continue;
      for (const item of page.items || []) {
        if (item.sourceSectionKey === 'choi_dem' || item.sectionKey === 'choi_dem') {
          choiDemItems.push(item.name);
        }
      }
    }
  }
  if (choiDemItems.length) {
    console.log(`  Chơi đêm trong list: ${choiDemItems.length} item (${choiDemItems.slice(0, 3).join(', ')}...)`);
  }

  console.log('\n--- Dọn list test ---');
  for (const entry of created) {
    const res = await fetch(`${API_BASE}/api/decks/${entry.deckId}/lists/${entry.listId}`, { method: 'DELETE' });
    console.log(`  DELETE ${entry.listId}: ${res.status}`);
  }

  console.log('\n=== KẾT QUẢ ===');
  const passCover = coverDup === 0 && uniqueCovers.size === 2;
  const passDrive = totalDrive > 0;
  console.log(`Cover dedup   : ${passCover ? 'PASS' : 'FAIL'} (${uniqueCovers.size}/2 unique)`);
  console.log(`Drive images  : ${passDrive ? 'PASS' : 'FAIL'} (${totalDrive}/${totalItems} ảnh Drive)`);
  process.exit(passCover && passDrive ? 0 : 1);
}

main().catch((err) => {
  console.error('\nTest failed:', err.message || err);
  process.exit(1);
});
