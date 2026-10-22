'use client';
// Kiểm tra trước khi xuất: đối tác, ngân sách 72h, ảnh Drive cần cache.
import { getRuntimePerformance } from '../runtimePerformance';
import { collectPartnerNames } from '../partnerNames.mjs';
import { coverReviewError } from '../spotlightCoverReview.mjs';
import { isThreadsLocalDeck, threadsFoodPayload } from '../threadsFoodExport.mjs';
import { budget72HListHasLegacyScheduleCosts, listIsMain } from '../utils';
import { resolveExportList } from './shared';
import { assertThreadsGrid6Export } from '../threadsGrid6';
import { assertNoteDarkExport } from '../threadsNoteDark';
import { assertThreadsRecapExport } from '../threadsRecap';

export function isResourceExportError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  if (/drive|http\s*(403|404|429|5\d\d)|network|mạng|quyền|dữ liệu|overflow|tràn chữ/.test(message)) return false;
  return /out of memory|memory|allocation|bitmap|canvas|decode|context lost|quota|insufficient resource/.test(message);
}

export async function assertRuntimeResources(profile) {
  if (!profile.losslessSource) return;
  const current = await getRuntimePerformance();
  if (!current.unavailable && current.mode === 'legacy') {
    throw new Error('Insufficient resource: backend đã xác nhận cần dùng Cân bằng tương thích.');
  }
}

function collectDriveFileIdsFromValue(value, ids = new Set()) {
  if (!value) return ids;
  if (typeof value === 'string') {
    if (value.includes('/assets/drive-file') || /drive\.google\.com|googleusercontent\.com/i.test(value)) {
      const match = value.match(/[?&](?:id|id%3D)=([a-zA-Z0-9_-]{10,})/i)
        || value.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/i)
        || value.match(/[?&]id=([a-zA-Z0-9_-]{10,})/i);
      if (match?.[1]) ids.add(match[1]);
    }
    return ids;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectDriveFileIdsFromValue(item, ids));
    return ids;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((item) => collectDriveFileIdsFromValue(item, ids));
  }
  return ids;
}

export function collectDriveFileIdsFromLists(lists) {
  const ids = new Set();
  const visit = (value) => {
    if (!value) return;
    if (typeof value === 'string') {
      // coverImageUrls/coverImages là mảng chuỗi; trước đây các URL này bị bỏ
      // qua nên cover 8 Feed có thể xuất trắng một phần trên máy chưa có cache.
      collectDriveFileIdsFromValue(value, ids);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object') return;
    // Threads chi phí chỉ render chữ; ảnh còn sót trong snapshot không phải tài nguyên xuất.
    if (value.layoutVariant === 'itinerary-note-threads-budget' || value.layoutVariant === 'threads-expense-sheet') return;
    for (const [key, child] of Object.entries(value)) {
      // Candidate chỉ dùng khi primary fail — không prefetch hết (máy mới sẽ rất lâu).
      if (key === 'candidateImageUrls' || key === 'candidates') continue;
      if (typeof child === 'string') {
        if (/image|cover|photo|background|src/i.test(key) || child.includes('/assets/drive-file')) {
          collectDriveFileIdsFromValue(child, ids);
        }
        continue;
      }
      visit(child);
    }
  };
  for (const entry of lists || []) {
    const list = entry?.list || entry;
    visit(list);

    // 8 Feed có nhiều ảnh trên cùng trang. Trên máy mới, nếu ảnh chính lỗi mà
    // candidate chưa có trong disk cache, renderer phải tải gấp nhiều ảnh cùng
    // lúc và dễ bị Drive rate-limit. Cache trước hai candidate đầu của mỗi ô.
    for (const page of list?.pages || []) {
      if (page?.layoutVariant !== 'grid-8-feed') continue;
      for (const item of page?.items || []) {
        for (const candidate of (item?.candidateImageUrls || []).slice(0, 2)) {
          collectDriveFileIdsFromValue(candidate, ids);
        }
      }
    }
  }
  return [...ids];
}

export function assertSpotlightV4V6PartnerExportReady(list, deckId = '') {
  if (deckId === 'spotlight-v6-cherry-blossom') {
    const count = collectPartnerNames(list).length;
    const ids = (list.pages || []).map(page => page.backgroundImage);
    if (count !== 7 || ids.length !== 16 || new Set(ids).size !== 16 || ids.some(id => !id)) throw new Error(`Spotlight Mùa hoa đào cần đúng 7 đối tác và 16 ảnh riêng; hiện có ${count}/7 đối tác. Hãy sửa/tạo lại list trước khi xuất.`);
    return;
  }
  if (deckId === 'spotlight-v5-color-edit') {
    const count = collectPartnerNames(list).length;
    if (count !== 7) throw new Error(`List Spotlight V5 Color Edit có ${count}/7 đối tác hiển thị hợp lệ. Hãy tạo lại list đủ đối tác trước khi xuất.`);
    return;
  }
  const isV4V6 = deckId === 'spotlight-v4' || (deckId === 'spotlight-v6' || deckId === 'spotlight-v6-color-edit');
  if (!isV4V6) return;
  const count = collectPartnerNames(list).length;
  if (count < 4) {
    throw new Error(`List Spotlight V4/V6 chỉ có ${count}/4 đối tác hiển thị hợp lệ. Đây có thể là list cũ; hãy tạo list mới rồi xuất lại.`);
  }
}

export function assertPartnerExportReady(list, deckId = '') {
  if(deckId==='threads-note-dark-list'){assertNoteDarkExport(list);return;}
  if (deckId === 'threads-grid6-collage') assertThreadsGrid6Export(list);
  if (deckId === 'threads-trip-recap-3n2d') assertThreadsRecapExport(list);
  const coverError = coverReviewError(list);
  if (coverError) throw new Error(coverError);
  // Use exactly the names written to this template's XLSX, not a raw count of
  // isPartner flags: hidden/unrendered partners must not pass the export gate.
  const names = isThreadsLocalDeck(deckId)
    ? (list.pages || []).flatMap(page => (page.items || []).filter(item => item.isPartner === true).map(item => String(item.name || '').trim())).filter(Boolean)
    : collectPartnerNames(list);
  if (!names.length && !list?.partnerOptional) {
    const label = String(list?.navTitle || list?.title || list?.id || deckId).trim();
    const error = /** @type {Error & { code?: string }} */ (new Error(`Không thể xuất list “${label}”: không có đối tác hiển thị hợp lệ để ghi XLSX. Hãy tạo lại list có đối tác rồi xuất lại.`));
    error.code = 'EXPORT_PARTNER_REQUIRED';
    throw error;
  }
  if (isThreadsLocalDeck(deckId)) threadsFoodPayload(list);
  assertSpotlightV4V6PartnerExportReady(list, deckId);
  assertItineraryNoteDarkPartnerExportReady(list, deckId);
  return names;
}

export function assertExportContextPartners(context, batch = false) {
  if (batch) {
    const selected = new Set(context.selectedListIds || []);
    const validIds = new Set();
    const skippedLists = [...(context._partnerSkippedLists || [])];
    for (const deck of context.dataset?.decks || []) for (const list of deck.lists || []) {
      if (!selected.has(list.id) || listIsMain(list)) continue;
      try {
        assertPartnerExportReady(resolveExportList(deck, list, context.dataset), deck.id);
        validIds.add(list.id);
      } catch (error) {
        const deckName = deck.navTitle || deck.title || deck.id;
        const listName = list.navTitle || list.title || list.id;
        skippedLists.push({ deckId: deck.id, listId: list.id, deckName, listName,
          label: `${deckName} / ${listName}`, code: error.code || 'EXPORT_LIST_INVALID',
          errors: [{ page: null, id: '', reason: error.message }] });
      }
    }
    if (skippedLists.length && !validIds.size) {
      const error = /** @type {Error & { code?: string, skippedLists?: unknown[] }} */ (new Error(`Không có list hợp lệ để xuất; không tạo ZIP rỗng. ${formatSkippedListSummary(skippedLists)}`));
      error.code = 'EXPORT_PARTNER_REQUIRED';
      error.skippedLists = skippedLists;
      throw error;
    }
    return { ...context, selectedListIds: validIds, _partnerSkippedLists: skippedLists };
  } else if (context.deck && context.list) {
    try { assertPartnerExportReady(resolveExportList(context.deck, context.list, context.dataset), context.deck.id); }
    catch (error) {
      error.message = `${context.deck.navTitle || context.deck.title || context.deck.id} / ${context.list.navTitle || context.list.title || context.list.id}: ${error.message}`;
      throw error;
    }
  }
  return context;
}

export function formatSkippedListSummary(skippedLists = []) {
  if (!skippedLists.length) return '';
  const groups = new Map();
  for (const list of skippedLists) {
    const name = list.deckName || list.label?.split(' / ')[0] || list.deckId;
    const entries = groups.get(name) || [];
    entries.push(`${list.listName || list.label?.split(' / ').slice(1).join(' / ') || list.listId} (${(list.errors || []).map(error => error.reason).join('; ')})`);
    groups.set(name, entries);
  }
  return `Bỏ qua ${skippedLists.length} list: ` + Array.from(groups, ([name, lists]) => `${name}: ${lists.join(', ')}`).join(' | ');
}

export function assertItineraryNoteDarkPartnerExportReady(list, deckId = '') {
  if (deckId !== 'itinerary-note-dark' || list?.partnerOptional) return;
  const pages = (list.pages || []).filter((page) => page?.layoutVariant === 'itinerary-note-dark-day');
  const dailyCounts = pages.map((page) => (page.items || []).filter((item) => item?.isPartner && String(item.rawName || item.name || '').trim()).length);
  const names = collectPartnerNames(list);
  if (pages.length !== 2 || dailyCounts[0] !== 4 || dailyCounts[1] !== 3 || names.length !== 7) {
    throw new Error(`Lịch trình Note nền đen chỉ có ${names.length}/7 đối tác hợp lệ trong list. Cần 4 đối tác Ngày 1 và 3 đối tác Ngày 2; hãy tạo lại list trước khi xuất.`);
  }
}

export function assertBudget72HExportReady(deck, list) {
  if (deck?.id !== 'budget-72h-summary') return;
  if (budget72HListHasLegacyScheduleCosts(list)) {
    throw new Error('Bảng chi phí 72H đang dùng dữ liệu giá cũ (~30k / ~200k-600k). Bấm 「Làm mới」 rồi xuất lại.');
  }
}
