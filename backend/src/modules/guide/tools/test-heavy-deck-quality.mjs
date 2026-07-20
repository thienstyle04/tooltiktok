/**
 * Test nặng toàn bộ mẫu:
 * - Tạo 4–5 list mới / mẫu
 * - Render HTML: thiếu ảnh, font lỗi (mojibake), cấu trúc vs list chính
 * - Khớp tên/địa chỉ/ảnh (candidate + trùng ảnh khác tên)
 * - Mô phỏng xuất: tải thật các URL ảnh
 *
 * Chạy (backend + DEEPSEEK_API_KEY):
 *   node backend/src/modules/guide/tools/test-heavy-deck-quality.mjs
 *
 * Env:
 *   TEST_API_URL=http://127.0.0.1:3000
 *   TEST_ASSET_URL=http://127.0.0.1:3000
 *   DESTINATION=dalat
 *   LISTS_PER_DECK=4
 *   KEEP_LISTS=0
 *   DECK_FILTER=grid-6-zigzag,itinerary-3n2d   (optional)
 */
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const ASSET = process.env.TEST_ASSET_URL || API;
const DESTINATION = process.env.DESTINATION || 'dalat';
const LISTS_PER_DECK = Math.min(Math.max(Number(process.env.LISTS_PER_DECK || 4), 1), 5);
const KEEP_LISTS = process.env.KEEP_LISTS === '1';
const DECK_FILTER = String(process.env.DECK_FILTER || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../../../../../');
const markupPath = join(rootDir, 'frontend/lib/pageMarkup.js');
const reportDir = join(rootDir, 'backend/reports');
const reportPath = join(reportDir, `heavy-deck-quality.${DESTINATION}.json`);

const DATA_DEPENDENT_CLASS_TOKENS = new Set(['manual', 'auto', 'fallback']);
/** Class lệch do nội dung AI (hashtag), không tính là lệch khung thiết kế. */
const STRUCTURE_ALLOWED_CLASS_DIFF = new Set(['has-inline-hashtags', 'is-portrait-focus', 'is-landscape-focus']);
/**
 * Mojibake thật (UTF-8 đọc nhầm) — KHÔNG dùng Ã/Â đơn vì đó là chữ Việt hợp lệ
 * (Âu, Ẩm, Ẵ...). Chỉ bắt chuỗi kiểu Ã¢, Ä‘, â€, �.
 */
const MOJIBAKE_RE = /(?:Ã[\x80-\xbf]|Ä[\x80-\xbf]|Å[\x80-\xbf]|Æ[\x80-\xbf]|â€.|ï¿½|�|Ãƒ.|Ã‚.)/;
const SKIP_IMAGE_LAYOUTS = new Set([
  'budget-3n2d-table',
  'budget-3n2d-day',
  'budget-3n2d-total',
  // Menu text-only — không có ảnh theo thiết kế
  'grid-8-quaytung-menu',
]);
/** Class bật/tắt theo nội dung AI (có/không địa chỉ, giá, vị trí overlay…) — không coi là lệch khung. */
const STRUCTURE_CONTENT_CLASS_RE = /^(?:grid6-address-extra|grid6-address-pin|grid8-meta-extra|grid8-pin|zigzag-price|zigzag-label|zigzag-address|grid8-quaytung-hours|grid8-quaytung-clock|grid6qt-address|itinerary-4n3d-stack-address|spotlight-pos-|spotlight-title-fit-|spotlight-v2-hours|placement-|mutant-center-card|mutant-strip|grid4-mutant-|photomode-pin-icon)/;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadMarkup() {
  const result = await esbuild.build({
    entryPoints: [markupPath],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  const tmp = join(__dirname, '.tmp-heavy-quality-markup.mjs');
  writeFileSync(tmp, result.outputFiles[0].text);
  const mod = await import(pathToFileURL(tmp).href);
  unlinkSync(tmp);
  return mod;
}

function classFingerprint(html) {
  const classes = new Set();
  const re = /class="([^"]*)"/g;
  let match;
  while ((match = re.exec(html))) {
    match[1].split(/\s+/).filter(Boolean).forEach((token) => {
      if (!DATA_DEPENDENT_CLASS_TOKENS.has(token)) classes.add(token);
    });
  }
  return classes;
}

function diffSets(mainSet, otherSet) {
  return {
    added: [...otherSet].filter((c) => !mainSet.has(c)),
    removed: [...mainSet].filter((c) => !otherSet.has(c)),
  };
}

function renderPage(markup, page, index, list) {
  return page.type === 'cover'
    ? markup.renderCoverPage(page, index, list.pages.length, list.id, list.captionHashtags || [], list, [])
    : markup.renderListPage(page, index, list.pages.length, list.id, list.captionHashtags || [], list);
}

function collectTextFields(list) {
  const texts = [];
  for (const page of list.pages || []) {
    for (const key of ['title', 'subtitle', 'chipText']) {
      if (page[key]) texts.push(String(page[key]));
    }
    for (const item of page.items || []) {
      for (const key of ['name', 'rawName', 'metaPrimary', 'metaSecondary', 'label', 'imageNote']) {
        if (item[key]) texts.push(String(item[key]));
      }
    }
  }
  if (list.coverTitle) texts.push(String(list.coverTitle));
  if (list.postCaption) texts.push(String(list.postCaption));
  return texts;
}

function collectImageRefs(list) {
  const refs = [];
  for (const page of list.pages || []) {
    if (SKIP_IMAGE_LAYOUTS.has(page.layoutVariant)) continue;
    if (String(page.backgroundImage || '').trim()) {
      refs.push({
        kind: 'background',
        page: page.chipText || page.title || page.type,
        name: '(background)',
        url: String(page.backgroundImage).trim(),
        item: null,
      });
    }
    for (const item of page.items || []) {
      refs.push({
        kind: 'item',
        page: page.chipText || page.title || page.type,
        name: item.name || item.label || item.id || '(item)',
        url: String(item.imageUrl || '').trim(),
        item,
        pageObj: page,
      });
    }
  }
  return refs;
}

async function probeImageOnce(url, timeoutMs) {
  if (!url) return { state: 'empty' };
  if (url.startsWith('/assets/library') || url.startsWith('/assets/dalat') || url.startsWith('/assets/tiktok')) {
    const response = await fetch(`${ASSET}${url}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return { state: 'hardFail', status: response.status };
    const type = String(response.headers.get('content-type') || '');
    return type.includes('image') ? { state: 'ok' } : { state: 'hardFail', status: response.status, type };
  }
  if (!url.includes('/assets/drive-file') && !/^https?:\/\//i.test(url)) {
    return { state: 'ok', skipped: true };
  }
  const path = url.startsWith('http') ? new URL(url).pathname + new URL(url).search : url;
  const response = await fetch(`${ASSET}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  const fallback = response.headers.get('x-drive-image-fallback') === '1';
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!response.ok) return { state: 'hardFail', status: response.status };
  if (fallback || type.includes('svg')) return { state: 'driveFallback' };
  if (type.includes('image')) return { state: 'ok' };
  return { state: 'hardFail', status: response.status, type };
}

async function probeImage(url) {
  try {
    return await probeImageOnce(url, 25000);
  } catch (error) {
    const message = String(error.message || error);
    if (!message.includes('timeout') && !message.includes('aborted')) {
      return { state: 'hardFail', error: message };
    }
    try {
      await sleep(500);
      return await probeImageOnce(url, 35000);
    } catch (retryError) {
      return { state: 'timeout', error: String(retryError.message || retryError) };
    }
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  }));
  return results;
}

function checkNameImageConsistency(list) {
  const issues = [];
  for (const page of list.pages || []) {
    if (SKIP_IMAGE_LAYOUTS.has(page.layoutVariant)) continue;
    const urlToNames = new Map();
    for (const item of page.items || []) {
      const name = String(item.name || '').trim();
      const url = String(item.imageUrl || '').trim();
      const candidates = Array.isArray(item.candidateImageUrls) ? item.candidateImageUrls.map(String) : [];
      if (url && candidates.length > 0 && !candidates.includes(url)) {
        issues.push({
          type: 'image_not_in_candidates',
          page: page.chipText || page.title,
          name,
          url: url.slice(0, 80),
        });
      }
      if (url) {
        if (!urlToNames.has(url)) urlToNames.set(url, []);
        urlToNames.get(url).push(name);
      }
    }
    for (const [url, names] of urlToNames.entries()) {
      const unique = [...new Set(names.filter(Boolean))];
      if (unique.length >= 2) {
        issues.push({
          type: 'same_image_different_names',
          page: page.chipText || page.title,
          names: unique,
          url: url.slice(0, 80),
        });
      }
    }
  }
  return issues;
}

const SKIP_BACKGROUND_LAYOUTS = new Set([
  ...SKIP_IMAGE_LAYOUTS,
  'grid-8-quaytung-menu',
]);

function missingBackgroundPages(markup, list) {
  const missing = [];
  (list.pages || []).forEach((page, index) => {
    if (SKIP_BACKGROUND_LAYOUTS.has(page.layoutVariant)) return;
    const needsBg = page.type === 'cover'
      || page.layoutVariant === 'journey-4n2d-grid8'
      || page.layoutVariant === 'grid-8'
      || page.layoutVariant === 'spotlight'
      || page.layoutVariant === 'spotlight-list'
      || String(page.layoutVariant || '').includes('cover');
    if (!needsBg) return;
    try {
      const html = renderPage(markup, page, index, list);
      const hasImg = /<img\b[^>]*\bsrc=["'][^"']+["']/i.test(html);
      if (!hasImg) {
        missing.push(`${page.chipText || page.title || page.type || `p${index}`}`);
      }
    } catch {
      missing.push(`${page.chipText || page.title || page.type || `p${index}`}:render-error`);
    }
  });
  return missing;
}

function analyzeList(markup, mainList, list) {
  const result = {
    listId: list.id,
    pageCount: list.pages?.length || 0,
    structureOk: true,
    structureNotes: [],
    mojibake: [],
    emptyImages: 0,
    missingBackground: [],
    imageProbe: { ok: 0, driveFallback: 0, hardFail: 0, timeout: 0, empty: 0 },
    nameImageIssues: [],
    renderErrors: [],
  };

  // Font / mojibake on data fields
  for (const text of collectTextFields(list)) {
    if (MOJIBAKE_RE.test(text)) {
      result.mojibake.push(text.slice(0, 80));
    }
  }

  // Structure vs main
  if (!mainList) {
    result.structureOk = false;
    result.structureNotes.push('Không có list chính để so sánh');
  } else if ((list.pages || []).length !== (mainList.pages || []).length) {
    result.structureOk = false;
    result.structureNotes.push(`Số trang khác: main=${mainList.pages.length} list=${list.pages.length}`);
  } else {
    (mainList.pages || []).forEach((mainPage, index) => {
      const page = list.pages[index];
      try {
        const mainHtml = renderPage(markup, mainPage, index, mainList);
        const html = renderPage(markup, page, index, list);
        if (MOJIBAKE_RE.test(html.replace(/<[^>]+>/g, ' '))) {
          result.mojibake.push(`render page ${index}: ${(page.chipText || page.title || '').slice(0, 40)}`);
        }
        const { added, removed } = diffSets(classFingerprint(mainHtml), classFingerprint(html));
        const isContentClass = (token) => (
          STRUCTURE_ALLOWED_CLASS_DIFF.has(token) || STRUCTURE_CONTENT_CLASS_RE.test(token)
        );
        const realAdded = added.filter((token) => !isContentClass(token));
        const realRemoved = removed.filter((token) => !isContentClass(token));
        if (realAdded.length || realRemoved.length) {
          result.structureOk = false;
          const parts = [];
          if (realAdded.length) parts.push(`+${realAdded.slice(0, 6).join(',')}`);
          if (realRemoved.length) parts.push(`-${realRemoved.slice(0, 6).join(',')}`);
          result.structureNotes.push(`p${index} ${page.chipText || page.title || page.type}: ${parts.join(' ')}`);
        }
      } catch (error) {
        result.renderErrors.push(`p${index}: ${error.message || error}`);
      }
    });
  }

  result.nameImageIssues = checkNameImageConsistency(list);
  result.missingBackground = missingBackgroundPages(markup, list);
  return result;
}

async function probeListImages(list, cache) {
  const refs = collectImageRefs(list);
  const stats = { ok: 0, driveFallback: 0, hardFail: 0, timeout: 0, empty: 0, samples: [] };
  const uniqueUrls = [...new Set(refs.map((ref) => ref.url).filter(Boolean))];

  await mapLimit(uniqueUrls, 2, async (url) => {
    if (!cache.has(url)) cache.set(url, await probeImage(url));
  });

  for (const ref of refs) {
    if (!ref.url) {
      stats.empty += 1;
      if (stats.samples.length < 6) stats.samples.push(`${ref.page}/${ref.name}: EMPTY`);
      continue;
    }
    const probe = cache.get(ref.url) || { state: 'hardFail' };
    if (probe.state === 'ok') stats.ok += 1;
    else if (probe.state === 'driveFallback') {
      stats.driveFallback += 1;
      if (stats.samples.length < 6) stats.samples.push(`${ref.page}/${ref.name}: FALLBACK`);
    } else if (probe.state === 'timeout') {
      stats.timeout += 1;
      if (stats.samples.length < 6) stats.samples.push(`${ref.page}/${ref.name}: TIMEOUT`);
    } else {
      stats.hardFail += 1;
      if (stats.samples.length < 6) stats.samples.push(`${ref.page}/${ref.name}: HARD`);
    }
  }
  return stats;
}

async function switchDestination(id) {
  const response = await fetch(`${API}/api/destination`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!response.ok) throw new Error(`switch destination ${response.status}`);
}

async function fetchGuideData() {
  return fetch(`${API}/api/guide-data`, { signal: AbortSignal.timeout(120000) }).then((r) => r.json());
}

async function generateBatch(deckId, count) {
  const response = await fetch(`${API}/api/decks/generate-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deckId, count }),
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`generate-batch HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

async function generateBatchWithRetry(deckId, count, maxAttempts = 3) {
  let last = { successCount: 0, failCount: count, lists: [] };
  let remaining = count;
  const lists = [];
  for (let attempt = 1; attempt <= maxAttempts && remaining > 0; attempt += 1) {
    try {
      last = await generateBatch(deckId, remaining);
      lists.push(...(last.lists || []));
      remaining = Math.max(0, remaining - (last.successCount || 0));
      if (remaining === 0) break;
    } catch (error) {
      last = { successCount: 0, failCount: remaining, lists: [], error: String(error.message || error) };
    }
    if (attempt < maxAttempts && remaining > 0) {
      console.log(`    retry ${attempt + 1}/${maxAttempts} (còn ${remaining}) sau 12s...`);
      await sleep(12000);
    }
  }
  return {
    successCount: lists.length,
    failCount: Math.max(0, count - lists.length),
    lists,
    error: last.error,
  };
}

async function deleteList(deckId, listId) {
  const response = await fetch(`${API}/api/decks/${encodeURIComponent(deckId)}/lists/${encodeURIComponent(listId)}`, {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 404) throw new Error(`DELETE ${response.status}`);
}

function mainListOf(deck) {
  return (deck.lists || []).find((list) => list.id === `${deck.id}-main`)
    || (deck.lists || []).find((list) => !/-caption-/i.test(list.id))
    || deck.lists?.[0];
}

async function main() {
  console.log('=== HEAVY DECK QUALITY TEST ===');
  console.log(`API=${API} ASSET=${ASSET} DEST=${DESTINATION} LISTS_PER_DECK=${LISTS_PER_DECK}`);

  await switchDestination(DESTINATION);
  const markup = await loadMarkup();
  const before = await fetchGuideData();
  let deckIds = (before.decks || []).map((deck) => deck.id).filter((id) => id !== 'spotlight-partner');
  if (DECK_FILTER.length) deckIds = deckIds.filter((id) => DECK_FILTER.includes(id));

  console.log(`Số mẫu: ${deckIds.length} | tạo ${LISTS_PER_DECK} list/mẫu\n`);

  const genLog = [];
  const createdListIds = [];

  for (const deckId of deckIds) {
    process.stdout.write(`Tạo list: ${deckId} ... `);
    try {
      const result = await generateBatchWithRetry(deckId, LISTS_PER_DECK);
      genLog.push({ deckId, successCount: result.successCount, failCount: result.failCount });
      for (const entry of result.lists || []) {
        createdListIds.push({ deckId, listId: entry.listId });
      }
      console.log(`${result.successCount}/${LISTS_PER_DECK}`);
    } catch (error) {
      genLog.push({ deckId, successCount: 0, failCount: LISTS_PER_DECK, error: String(error.message || error) });
      console.log(`FAIL ${error.message || error}`);
    }
    await sleep(2500);
  }

  const after = await fetchGuideData();
  const imageCache = new Map();
  const deckReports = [];

  for (const deckId of deckIds) {
    const deck = after.decks.find((entry) => entry.id === deckId);
    if (!deck) {
      deckReports.push({ deckId, status: 'MISSING_DECK' });
      continue;
    }
    const mainList = mainListOf(deck);
    const captionLists = (deck.lists || []).filter((list) => /-caption-/i.test(list.id));
    // Prefer lists vừa tạo trong session nếu còn; nếu không test mọi caption hiện có của deck
    const targetLists = captionLists.length > 0 ? captionLists.slice(-LISTS_PER_DECK) : [];

    const listReports = [];
    for (const list of targetLists) {
      const analyzed = analyzeList(markup, mainList, list);
      analyzed.imageProbe = await probeListImages(list, imageCache);
      analyzed.emptyImages = analyzed.imageProbe.empty;
      listReports.push(analyzed);
    }

    // Also analyze main list baseline
    const mainAnalyzed = mainList ? analyzeList(markup, mainList, mainList) : null;
    if (mainList) {
      mainAnalyzed.imageProbe = await probeListImages(mainList, imageCache);
      mainAnalyzed.emptyImages = mainAnalyzed.imageProbe.empty;
    }

    const structureFail = listReports.filter((list) => !list.structureOk).length;
    const mojibakeFail = listReports.filter((list) => list.mojibake.length > 0).length;
    // empty: chỉ FAIL nếu nhiều hơn list chính (menu text-only có empty hợp lệ); hardFail luôn FAIL
    const mainEmpty = mainAnalyzed?.imageProbe?.empty || 0;
    const imageFail = listReports.filter((list) => (
      list.imageProbe.hardFail > 0 || list.imageProbe.empty > mainEmpty
    )).length;
    const bgFail = listReports.filter((list) => (list.missingBackground || []).length > 0).length;
    const timeoutWarn = listReports.filter((list) => list.imageProbe.timeout > 0).length;
    const mismatchFail = listReports.filter((list) => list.nameImageIssues.length > 0).length;
    const fallbackWarn = listReports.filter((list) => list.imageProbe.driveFallback > 0).length;

    const status = listReports.length === 0
      ? 'NO_LISTS'
      : (structureFail || mojibakeFail || imageFail || mismatchFail || bgFail
        ? 'FAIL'
        : ((fallbackWarn || timeoutWarn) ? 'WARN' : 'PASS'));

    deckReports.push({
      deckId,
      status,
      generated: genLog.find((entry) => entry.deckId === deckId),
      listsChecked: listReports.length,
      structureFail,
      mojibakeFail,
      imageFail,
      bgFail,
      timeoutWarn,
      mismatchFail,
      fallbackWarn,
      main: mainAnalyzed ? {
        empty: mainAnalyzed.imageProbe.empty,
        ok: mainAnalyzed.imageProbe.ok,
        fallback: mainAnalyzed.imageProbe.driveFallback,
        hardFail: mainAnalyzed.imageProbe.hardFail,
        mojibake: mainAnalyzed.mojibake.length,
      } : null,
      lists: listReports,
    });

    console.log(
      `${status.padEnd(4)} ${deckId.padEnd(22)} lists=${listReports.length}`
      + ` structFail=${structureFail} fontFail=${mojibakeFail}`
      + ` imgFail=${imageFail} bgFail=${bgFail} timeoutWarn=${timeoutWarn} mismatch=${mismatchFail} fbWarn=${fallbackWarn}`,
    );
  }

  if (!KEEP_LISTS) {
    console.log('\nĐang xoá list AI test...');
    for (const entry of createdListIds) {
      try {
        await deleteList(entry.deckId, entry.listId);
      } catch (error) {
        console.log(`  không xoá được ${entry.listId}: ${error.message || error}`);
      }
    }
  } else {
    console.log('\nKEEP_LISTS=1 — giữ list AI vừa tạo.');
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    destination: DESTINATION,
    listsPerDeck: LISTS_PER_DECK,
    pass: deckReports.filter((row) => row.status === 'PASS').length,
    warn: deckReports.filter((row) => row.status === 'WARN').length,
    fail: deckReports.filter((row) => row.status === 'FAIL').length,
    noLists: deckReports.filter((row) => row.status === 'NO_LISTS').length,
    decks: deckReports.length,
  };

  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, JSON.stringify({ summary, genLog, deckReports }, null, 2));

  console.log('\n=== TỔNG KẾT ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Report: ${reportPath}`);

  const failed = deckReports.filter((row) => row.status === 'FAIL' || row.status === 'NO_LISTS');
  if (failed.length) {
    console.log('\n=== CHI TIẾT LỖI ===');
    for (const row of failed) {
      console.log(`\n# ${row.deckId} [${row.status}]`);
      for (const list of row.lists || []) {
        if (!list.structureOk) console.log(`  structure: ${list.structureNotes.slice(0, 3).join(' | ')}`);
        if (list.mojibake.length) console.log(`  font: ${list.mojibake.slice(0, 3).join(' | ')}`);
        if ((list.missingBackground || []).length) {
          console.log(`  missingBg: ${list.missingBackground.slice(0, 6).join(' | ')}`);
        }
        if (list.imageProbe.empty || list.imageProbe.hardFail || list.imageProbe.timeout) {
          console.log(`  images: empty=${list.imageProbe.empty} hard=${list.imageProbe.hardFail} timeout=${list.imageProbe.timeout} fallback=${list.imageProbe.driveFallback}`);
          for (const sample of list.imageProbe.samples || []) console.log(`    - ${sample}`);
        }
        if (list.nameImageIssues.length) {
          console.log(`  mismatch: ${list.nameImageIssues.length}`);
          for (const issue of list.nameImageIssues.slice(0, 4)) {
            console.log(`    - ${issue.type} ${issue.page} ${issue.name || (issue.names || []).join(' / ')}`);
          }
        }
      }
    }
  }

  if (summary.fail > 0 || summary.noLists > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
