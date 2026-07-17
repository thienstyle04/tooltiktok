/**
 * Kiểm tra "khung thiết kế" (structural parity) giữa list chính và list AI mới tạo, cho TẤT CẢ deck.
 *
 * Cách làm:
 * 1. Với mỗi deck, tạo 2 list mới qua /api/decks/generate-batch (giống người dùng bấm "Tạo list mới").
 * 2. Với mỗi trang (theo đúng thứ tự index) của list mới, render ra HTML bằng chính pageMarkup.js
 *    rồi so sánh "bộ class CSS" xuất hiện trong HTML với trang tương ứng của list chính.
 *    - Bộ class CSS phản ánh cấu trúc/skeleton (có ảnh không, có địa chỉ không, có nhãn/giá không,
 *      dùng layout nào...) — khác với NỘI DUNG (tên quán, địa chỉ...) luôn khác nhau giữa các list.
 *    - Vài class phụ thuộc dữ liệu (nguồn ảnh manual/auto/fallback) được loại ra vì không thuộc "thiết kế".
 * 3. Nếu bộ class giống nhau ở mọi trang, mọi list AI -> deck đó "giống khung mẫu chính".
 *    Nếu khác ở bất kỳ đâu -> "khác khung mẫu chính", kèm chi tiết class thêm/thiếu.
 * 4. Tự xoá các list AI vừa tạo để không để lại rác trong dữ liệu.
 *
 * Chạy: node src/modules/guide/tools/test-structure-parity-all-decks.mjs
 * (yêu cầu backend đang chạy ở http://127.0.0.1:3000)
 */
import { writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../../../../../');
const markupPath = join(rootDir, 'frontend/lib/pageMarkup.js');

const DATA_DEPENDENT_CLASS_TOKENS = new Set(['manual', 'auto', 'fallback']);

async function loadMarkup() {
  const result = await esbuild.build({
    entryPoints: [markupPath],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  const tmp = join(__dirname, '.tmp-structure-parity-markup.mjs');
  writeFileSync(tmp, result.outputFiles[0].text);
  const mod = await import(pathToFileURL(tmp).href);
  unlinkSync(tmp);
  return mod;
}

function classFingerprint(html) {
  const classes = new Set();
  const re = /class="([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) {
    m[1].split(/\s+/).filter(Boolean).forEach((c) => {
      if (!DATA_DEPENDENT_CLASS_TOKENS.has(c)) classes.add(c);
    });
  }
  return classes;
}

function diffSets(mainSet, otherSet) {
  const added = [...otherSet].filter((c) => !mainSet.has(c));
  const removed = [...mainSet].filter((c) => !otherSet.has(c));
  return { added, removed };
}

function renderPage(markup, page, index, list) {
  return page.type === 'cover'
    ? markup.renderCoverPage(page, index, list.pages.length, list.id, list.captionHashtags || [], list, [])
    : markup.renderListPage(page, index, list.pages.length, list.id, list.captionHashtags || [], list);
}

async function fetchGuideData() {
  return fetch(`${API}/api/guide-data`).then((r) => r.json());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateBatch(deckId, count) {
  const res = await fetch(`${API}/api/decks/generate-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deckId, count }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// DeepSeek API có thể bị rate-limit khi gọi liên tục cho 21 deck — thử lại nếu 0 list nào thành công.
async function generateBatchWithRetry(deckId, count, maxAttempts = 3) {
  let last = { successCount: 0, failCount: count, lists: [] };
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    last = await generateBatch(deckId, count);
    if (last.successCount > 0) return last;
    if (attempt < maxAttempts) await sleep(8000);
  }
  return last;
}

async function deleteList(deckId, listId) {
  const res = await fetch(`${API}/api/decks/${deckId}/lists/${listId}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
}

async function main() {
  const markup = await loadMarkup();
  const before = await fetchGuideData();
  const deckIds = before.decks.map((d) => d.id).filter((id) => id !== 'spotlight-partner');

  console.log(`Sẽ tạo 2 list AI cho ${deckIds.length} deck (bỏ qua spotlight-partner vì cần chọn đối tác riêng)...`);

  const genFailures = [];
  for (const deckId of deckIds) {
    try {
      const result = await generateBatchWithRetry(deckId, 2);
      if (result.successCount > 0) {
        console.log(`  [OK] ${deckId} (thành công ${result.successCount}/2)`);
      } else {
        genFailures.push({ deckId, error: 'DeepSeek liên tục lỗi/rate-limit, 0 list tạo được sau 3 lần thử.' });
        console.log(`  [FAIL] ${deckId}: 0/2 list tạo được sau 3 lần thử`);
      }
    } catch (e) {
      genFailures.push({ deckId, error: String(e.message || e) });
      console.log(`  [FAIL] ${deckId}: ${e.message || e}`);
    }
    await sleep(3000);
  }

  const after = await fetchGuideData();
  const results = []; // { deckId, ok: boolean, details: [...] }

  for (const deckId of deckIds) {
    const deck = after.decks.find((d) => d.id === deckId);
    if (!deck) continue;
    const mainList = deck.lists.find((l) => l.id === `${deckId}-main`) || deck.lists.find((l) => !/-caption-/i.test(l.id));
    const captionLists = deck.lists.filter((l) => /-caption-/i.test(l.id));

    const detail = { deckId, ok: true, notes: [] };
    if (!mainList) {
      detail.ok = false;
      detail.notes.push('Không tìm thấy list chính (main) để so sánh.');
      results.push(detail);
      continue;
    }
    if (captionLists.length === 0) {
      detail.ok = false;
      detail.notes.push('Không tạo được list AI nào để so sánh.');
      results.push(detail);
      continue;
    }

    for (const capList of captionLists) {
      if (capList.pages.length !== mainList.pages.length) {
        detail.ok = false;
        detail.notes.push(`${capList.id}: số trang khác (chính=${mainList.pages.length}, AI=${capList.pages.length})`);
        continue;
      }
      mainList.pages.forEach((mainPage, index) => {
        const capPage = capList.pages[index];
        let mainHtml;
        let capHtml;
        try {
          mainHtml = renderPage(markup, mainPage, index, mainList);
          capHtml = renderPage(markup, capPage, index, capList);
        } catch (e) {
          detail.ok = false;
          detail.notes.push(`${capList.id} trang ${index} (${mainPage.chipText || mainPage.title}): lỗi render — ${e.message || e}`);
          return;
        }
        const mainClasses = classFingerprint(mainHtml);
        const capClasses = classFingerprint(capHtml);
        const { added, removed } = diffSets(mainClasses, capClasses);
        if (added.length || removed.length) {
          detail.ok = false;
          const parts = [];
          if (added.length) parts.push(`thêm: ${added.join(', ')}`);
          if (removed.length) parts.push(`thiếu: ${removed.join(', ')}`);
          detail.notes.push(`${capList.id} trang ${index} (${mainPage.chipText || mainPage.title || mainPage.type}): ${parts.join(' | ')}`);
        }
      });
    }

    results.push(detail);
  }

  // Cleanup
  console.log('\nĐang xoá các list AI test...');
  for (const deckId of deckIds) {
    const deck = after.decks.find((d) => d.id === deckId);
    if (!deck) continue;
    for (const list of deck.lists.filter((l) => /-caption-/i.test(l.id))) {
      try {
        await deleteList(deckId, list.id);
      } catch (e) {
        console.log(`  Không xoá được ${list.id}: ${e.message || e}`);
      }
    }
  }

  const same = results.filter((r) => r.ok);
  const diff = results.filter((r) => !r.ok);

  console.log('\n=== BẢNG 1: Mẫu tạo/render GIỐNG khung deck chính ===');
  console.log('| # | Deck |');
  console.log('|---|---|');
  same.forEach((r, i) => console.log(`| ${i + 1} | ${r.deckId} |`));

  console.log('\n=== BẢNG 2: Mẫu tạo/render KHÁC khung deck chính ===');
  console.log('| # | Deck | Chi tiết |');
  console.log('|---|---|---|');
  diff.forEach((r, i) => console.log(`| ${i + 1} | ${r.deckId} | ${r.notes.slice(0, 5).join('<br>')} |`));

  if (genFailures.length) {
    console.log('\n=== Deck tạo list AI thất bại (không kiểm tra được) ===');
    genFailures.forEach((f) => console.log(`- ${f.deckId}: ${f.error}`));
  }

  console.log(`\nTổng: ${same.length} giống / ${diff.length} khác / ${genFailures.length} lỗi tạo list / ${deckIds.length} deck.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
