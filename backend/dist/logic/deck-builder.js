"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeItemType = normalizeItemType;
exports.dedupeItems = dedupeItems;
exports.metaText = metaText;
exports.backgroundFor = backgroundFor;
exports.pageItemWithResolver = pageItemWithResolver;
exports.schedulePageItemWithResolver = schedulePageItemWithResolver;
exports.buildCoverPage = buildCoverPage;
exports.sanitizeDeckHeadline = sanitizeDeckHeadline;
exports.buildListPage = buildListPage;
exports.buildDeckList = buildDeckList;
exports.createListPicker = createListPicker;
exports.pickMixedItemsWithPartnerQuota = pickMixedItemsWithPartnerQuota;
exports.pickMixedItemsWithPartnerAndRegularPools = pickMixedItemsWithPartnerAndRegularPools;
exports.pickContextualItems = pickContextualItems;
exports.createDeckBuildPools = createDeckBuildPools;
exports.collectMappedImageUrls = collectMappedImageUrls;
exports.splitCaptionBody = splitCaptionBody;
exports.applyCaptionToPages = applyCaptionToPages;
exports.pickPhotomodeItemsWithQuota = pickPhotomodeItemsWithQuota;
exports.buildPagesForDeck = buildPagesForDeck;
exports.buildDecks = buildDecks;
const data_allocator_1 = require("./data-allocator");
const image_resolver_1 = require("./image-resolver");
// ─── Utility helpers shared by all deck builders ─────────────────────────────
function normalizeItemType(item, ...needles) {
    const itemType = item.type
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
    return needles.some((n) => itemType.includes(n));
}
function dedupeItems(items) {
    const seen = new Set();
    return items.filter((item) => {
        const key = (0, data_allocator_1.itemUsageKey)(item);
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
function metaText(item) {
    const primary = item.address || 'Đang cập nhật địa chỉ';
    const secondaryParts = [];
    if (item.openHours)
        secondaryParts.push(`Khung giờ: ${item.openHours}`);
    if (item.price)
        secondaryParts.push(`Giá: ${item.price}`);
    else if (item.phone)
        secondaryParts.push(`Liên hệ: ${item.phone}`);
    return [primary, secondaryParts.join(' · ')];
}
function backgroundFor(imageUrls, seed, usedImageUrls) {
    if (imageUrls.length === 0)
        return '';
    const ordered = [...imageUrls].sort((left, right) => (0, image_resolver_1.stableHash)(`${seed}:${left}`) - (0, image_resolver_1.stableHash)(`${seed}:${right}`));
    const picked = ordered.find((url) => !usedImageUrls?.has(url)) || ordered[0] || '';
    if (picked)
        usedImageUrls?.add(picked);
    return picked;
}
function normalizeText(value) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}
function firstHourFromOpenHours(value) {
    const match = String(value ?? '').match(/(\d{1,2})\s*[:hH]\s*(\d{2})|(\d{1,2})/);
    if (!match)
        return null;
    const hour = Number(match[1] ?? match[3]);
    return Number.isFinite(hour) ? hour : null;
}
function isMorningCafe(item) {
    if (item.sectionKey !== 'cafe')
        return false;
    const hour = firstHourFromOpenHours(item.openHours);
    if (hour !== null)
        return hour <= 8;
    const normalized = normalizeText(`${item.type} ${item.highlight}`);
    return normalized.includes('sang') || normalized.includes('breakfast');
}
function isOutdoorSpot(item) {
    const normalized = normalizeText(`${item.name} ${item.address} ${item.type} ${item.highlight}`);
    return [
        'doi',
        'ho',
        'suoi',
        'thac',
        'rung',
        'trai',
        'lang',
        'vuon',
        'ngoai_canh',
        'mimosa',
        'lam_ha',
        'ta_nung',
        'cung_duong',
        'cay',
        'quan_truong',
        'huyen',
    ].some((token) => normalized.includes(token));
}
function photomodeMetaPrimary(item) {
    if (item.sectionKey === 'dich_vu' && item.phone && item.address) {
        return `(${item.phone}) ${item.address}`;
    }
    return item.address || item.phone || 'Đang cập nhật';
}
function photomodeServiceLabel(item) {
    const normalized = normalizeText(`${item.type} ${item.name}`);
    if (item.sectionKey === 'homestay')
        return 'lưu trú';
    if (normalized.includes('dac_san') || normalized.includes('qua'))
        return 'quà tặng';
    if (normalized.includes('thue_xe') || normalized.includes('xe'))
        return 'dịch vụ thuê xe';
    return 'dịch vụ cần lưu ý';
}
function photomodePageItemWithResolver(item, label, resolveImage) {
    const resolvedImage = resolveImage(item);
    return {
        label,
        id: item.id,
        name: item.name,
        metaPrimary: photomodeMetaPrimary(item),
        metaSecondary: '',
        imageUrl: resolvedImage.imageUrl,
        imageMapped: resolvedImage.imageMapped,
        imageSource: resolvedImage.imageSource,
        imageNote: resolvedImage.imageNote,
        isPartner: item.isPartner,
        rawName: item.name,
    };
}
// ─── Page item factories ──────────────────────────────────────────────────────
function pageItemWithResolver(item, label, resolveImage) {
    const [metaPrimary, metaSecondary] = metaText(item);
    const resolvedImage = resolveImage(item);
    return {
        label,
        id: item.id,
        name: item.name,
        metaPrimary,
        metaSecondary,
        imageUrl: resolvedImage.imageUrl,
        imageMapped: resolvedImage.imageMapped,
        imageSource: resolvedImage.imageSource,
        imageNote: resolvedImage.imageNote,
        isPartner: item.isPartner,
        rawName: item.name,
    };
}
function schedulePageItemWithResolver(time, prefix, item, resolveImage) {
    const [metaPrimary, metaSecondary] = metaText(item);
    const resolvedImage = resolveImage(item);
    return {
        label: time,
        id: item.id,
        name: `${prefix} ${item.name}`,
        metaPrimary,
        metaSecondary,
        imageUrl: resolvedImage.imageUrl,
        imageMapped: resolvedImage.imageMapped,
        imageSource: resolvedImage.imageSource,
        imageNote: resolvedImage.imageNote,
        isPartner: item.isPartner,
        rawName: item.name,
    };
}
function buildCoverPage(title, subtitle, backgroundImage) {
    return { type: 'cover', title, subtitle, backgroundImage };
}
function sanitizeDeckHeadline(value) {
    return String(value || '')
        .replace(/\bFREE\b/g, 'ĐẸP')
        .replace(/\bFree\b/g, 'Đẹp')
        .replace(/\bfree\b/g, 'đẹp')
        .replace(/miễn\s*phí/gi, 'dễ đi')
        .replace(/\s+/g, ' ')
        .trim();
}
function coverSubtitleFromCaption(body, fallback) {
    const cleanBody = String(body || '').replace(/\s+/g, ' ').trim();
    return sanitizeDeckHeadline(cleanBody || fallback || '');
}
function buildListPage(chipText, chipTone, title, subtitle, items, backgroundImage, layoutVariant = 'standard') {
    return { type: 'list', chipText, chipTone, title, subtitle, items, backgroundImage, layoutVariant };
}
function buildDeckList(deckId, listSuffix, navTitle, title, description, pages) {
    return { id: `${deckId}-${listSuffix}`, navTitle, title, description, pages };
}
function remainingItems(items, selectedItems) {
    const selectedKeys = new Set();
    selectedItems.forEach((item) => (0, data_allocator_1.markItemKey)(selectedKeys, item));
    return items.filter((item) => !(0, data_allocator_1.hasItemKey)(selectedKeys, item));
}
function candidateScore(item, seed) {
    let infoScore = 0;
    if (item.openHours)
        infoScore += 15;
    if (item.price)
        infoScore += 10;
    if (item.highlight)
        infoScore += 8;
    if (item.phone)
        infoScore += 8;
    return {
        total: (item.isPartner ? 100 : 0) + infoScore,
        tieBreaker: 10_000 - ((0, image_resolver_1.stableHash)(seed + item.id) % 10_000),
    };
}
function sortCandidates(items, seed) {
    return [...items].sort((l, r) => {
        const sl = candidateScore(l, seed);
        const sr = candidateScore(r, seed);
        if (sr.total !== sl.total)
            return sr.total - sl.total;
        if (sr.tieBreaker !== sl.tieBreaker)
            return sr.tieBreaker - sl.tieBreaker;
        return l.name.localeCompare(r.name, 'vi');
    });
}
function createListPicker(initialUsedIds = new Set()) {
    const softUsedIds = initialUsedIds;
    const localUsedIds = new Set();
    const pick = (items, count, seed, predicate) => {
        const filtered = predicate ? items.filter(predicate) : items;
        const source = filtered.length > 0 ? filtered : items;
        const sorted = sortCandidates(dedupeItems(source), seed).filter((item) => !(0, data_allocator_1.hasItemKey)(localUsedIds, item));
        const fresh = sorted.filter((item) => !(0, data_allocator_1.hasItemKey)(softUsedIds, item));
        const previouslyUsed = sorted.filter((item) => (0, data_allocator_1.hasItemKey)(softUsedIds, item));
        const selected = (fresh.length > 0 ? fresh : previouslyUsed).slice(0, count);
        selected.forEach((item) => {
            (0, data_allocator_1.markItemKey)(localUsedIds, item);
            (0, data_allocator_1.markItemKey)(softUsedIds, item);
        });
        return selected;
    };
    pick.isUsed = (item) => (0, data_allocator_1.hasItemKey)(localUsedIds, item) || (0, data_allocator_1.hasItemKey)(softUsedIds, item);
    return pick;
}
function freshForPicker(items, pick) {
    return pick.isUsed ? items.filter((item) => !pick.isUsed?.(item)) : items;
}
function pickMixedItemsWithPartnerQuota(items, count, seed, pick) {
    const partnerPool = items.filter((i) => i.isPartner);
    const regularPool = items.filter((i) => !i.isPartner);
    const freshPartnerPool = freshForPicker(partnerPool, pick);
    const freshRegularPool = freshForPicker(regularPool, pick);
    const targetPartnerCount = Math.min(3, freshPartnerPool.length);
    const targetRegularCount = count - targetPartnerCount;
    const selectedPartners = pick(freshPartnerPool, targetPartnerCount, `${seed}-partners`);
    const selectedRegulars = pick(freshRegularPool.length > 0 ? freshRegularPool : regularPool, targetRegularCount, `${seed}-regular`);
    const selected = [...selectedPartners, ...selectedRegulars];
    if (selected.length < count) {
        selected.push(...pick(remainingItems(items, selected), count - selected.length, `${seed}-fill`));
    }
    return selected.slice(0, count);
}
function pickMixedItemsWithPartnerAndRegularPools(partnerItems, regularItems, count, seed, pick) {
    const partnerPool = partnerItems.filter((i) => i.isPartner);
    const regularPool = regularItems.filter((i) => !i.isPartner);
    const freshPartnerPool = freshForPicker(partnerPool, pick);
    const freshRegularPool = freshForPicker(regularPool, pick);
    const targetPartnerCount = Math.min(3, freshPartnerPool.length);
    const targetRegularCount = count - targetPartnerCount;
    const selectedPartners = pick(freshPartnerPool, targetPartnerCount, `${seed}-partners`);
    const selectedRegulars = pick(freshRegularPool.length > 0 ? freshRegularPool : regularPool, targetRegularCount, `${seed}-regular`);
    const selected = [...selectedPartners, ...selectedRegulars];
    if (selected.length < count) {
        selected.push(...pick(remainingItems([...partnerItems, ...regularItems], selected), count - selected.length, `${seed}-fill`));
    }
    return selected.slice(0, count);
}
function shuffleItems(items, seed) {
    return [...items].sort((a, b) => (0, image_resolver_1.stableHash)(`${seed}:shuffle:${a.id}`) - (0, image_resolver_1.stableHash)(`${seed}:shuffle:${b.id}`));
}
function shuffleListPages(pages, seed) {
    return [...pages].sort((a, b) => (0, image_resolver_1.stableHash)(`${seed}:page:${a.title}`) - (0, image_resolver_1.stableHash)(`${seed}:page:${b.title}`));
}
function pickPartnerBalancedItems(primaryItems, fallbackItems, count, targetPartnerCount, seed, pick, allowUsedPartnerFallback = false) {
    const primaryPool = dedupeItems(primaryItems);
    const primaryIds = new Set(primaryPool.map((item) => item.id));
    const fallbackPool = dedupeItems(fallbackItems).filter((item) => !primaryIds.has(item.id));
    const primaryPartnerPool = primaryPool.filter((i) => i.isPartner);
    const primaryRegularPool = primaryPool.filter((i) => !i.isPartner);
    const fallbackPartnerPool = fallbackPool.filter((i) => i.isPartner);
    const fallbackRegularPool = fallbackPool.filter((i) => !i.isPartner);
    const freshPrimaryPartnerPool = freshForPicker(primaryPartnerPool, pick);
    const freshPrimaryRegularPool = freshForPicker(primaryRegularPool, pick);
    const freshFallbackPartnerPool = freshForPicker(fallbackPartnerPool, pick);
    const freshFallbackRegularPool = freshForPicker(fallbackRegularPool, pick);
    const selected = [];
    const selectedIds = new Set();
    const addItems = (nextItems) => {
        for (const item of nextItems) {
            if ((0, data_allocator_1.hasItemKey)(selectedIds, item))
                continue;
            selected.push(item);
            (0, data_allocator_1.markItemKey)(selectedIds, item);
            if (selected.length >= count)
                return;
        }
    };
    const partnerCount = Math.min(Math.max(targetPartnerCount, 0), count);
    const primaryPartnerSource = freshPrimaryPartnerPool.length > 0 || !allowUsedPartnerFallback
        ? freshPrimaryPartnerPool
        : primaryPartnerPool;
    addItems(pick(primaryPartnerSource, Math.min(partnerCount, primaryPartnerSource.length), `${seed}-partners-primary`));
    if (selected.length < partnerCount) {
        const fallbackPartnerSource = freshFallbackPartnerPool.length > 0 || !allowUsedPartnerFallback
            ? freshFallbackPartnerPool
            : fallbackPartnerPool;
        addItems(pick(fallbackPartnerSource, partnerCount - selected.length, `${seed}-partners-fallback`));
    }
    const regularCount = count - selected.length;
    addItems(pick(freshPrimaryRegularPool.length > 0 ? freshPrimaryRegularPool : primaryRegularPool, regularCount, `${seed}-regular-primary`));
    if (selected.length < count) {
        addItems(pick(freshFallbackRegularPool.length > 0 ? freshFallbackRegularPool : fallbackRegularPool, count - selected.length, `${seed}-regular-fallback`));
    }
    if (selected.length < count) {
        addItems(pick([...primaryPool, ...fallbackPool].filter((item) => !(0, data_allocator_1.hasItemKey)(selectedIds, item)), count - selected.length, `${seed}-fill`));
    }
    return shuffleItems(selected.slice(0, count), seed);
}
function pickGrid4ItemsWithPartnerQuota(primaryItems, fallbackItems, count, seed, pick) {
    const partnerCount = primaryItems.filter((i) => i.isPartner).length;
    const targetPartnerCount = partnerCount === 2 ? 1 : Math.min(2, partnerCount);
    return pickPartnerBalancedItems(primaryItems, fallbackItems, count, targetPartnerCount, seed, pick);
}
function pickGridItemsWithPartnerQuota(primaryItems, fallbackItems, count, seed, pick) {
    if (count === 4)
        return pickGrid4ItemsWithPartnerQuota(primaryItems, fallbackItems, count, seed, pick);
    const partnerCount = primaryItems.filter((i) => i.isPartner).length;
    const combinedPartnerCount = dedupeItems([...primaryItems, ...fallbackItems]).filter((i) => i.isPartner).length;
    const targetPartnerCount = partnerCount === 2 ? 1 : Math.min(3, combinedPartnerCount);
    return pickPartnerBalancedItems(primaryItems, fallbackItems, count, targetPartnerCount, seed, pick);
}
function pickGrid8ItemsWithPartnerQuota(primaryItems, fallbackItems, count, seed, pick) {
    const combinedPartnerCount = dedupeItems([...primaryItems, ...fallbackItems]).filter((i) => i.isPartner).length;
    const targetPartnerCount = Math.min(3, combinedPartnerCount);
    const selected = pickPartnerBalancedItems(primaryItems, fallbackItems, count, targetPartnerCount, seed, pick, true);
    const currentPartnerCount = selected.filter((item) => item.isPartner).length;
    if (currentPartnerCount >= targetPartnerCount)
        return selected;
    const selectedIds = new Set();
    selected.forEach((item) => (0, data_allocator_1.markItemKey)(selectedIds, item));
    const extraPartners = sortCandidates(dedupeItems([...primaryItems, ...fallbackItems]).filter((item) => item.isPartner), `${seed}-visible-partners`)
        .filter((item) => !(0, data_allocator_1.hasItemKey)(selectedIds, item))
        .slice(0, targetPartnerCount - currentPartnerCount);
    if (extraPartners.length === 0)
        return selected;
    const keptRegulars = selected.filter((item) => !item.isPartner).slice(0, count - currentPartnerCount - extraPartners.length);
    return shuffleItems([...selected.filter((item) => item.isPartner), ...extraPartners, ...keptRegulars].slice(0, count), `${seed}-visible-partners`);
}
function pickContextualItems(preferredItems, fallbackItems, count, seed, pick) {
    const preferredPool = dedupeItems(preferredItems);
    const selected = preferredPool.length > 0 ? pick(preferredPool, count, seed) : [];
    if (selected.length >= count)
        return selected.slice(0, count);
    const fallbackPool = remainingItems(dedupeItems([...preferredItems, ...fallbackItems]), selected);
    return [
        ...selected,
        ...pick(fallbackPool, count - selected.length, `${seed}-fallback`),
    ].slice(0, count);
}
function pickSingleContextualItem(preferred, fallback, seed, pick) {
    return pickContextualItems(preferred, fallback, 1, seed, pick);
}
function pickItineraryPageItems(slots, pick, resolveImage) {
    const pageItems = [];
    slots.forEach((slot) => {
        const selected = pickSingleContextualItem(slot.preferredItems, slot.fallbackItems, slot.seed, pick)[0];
        if (selected)
            pageItems.push(schedulePageItemWithResolver(slot.time, slot.prefix, selected, resolveImage));
    });
    return pageItems;
}
function pickItineraryListItems(preferredItems, fallbackItems, count, seed, label, pick, resolveImage) {
    const pools = [...dedupeItems(preferredItems), ...dedupeItems(fallbackItems)];
    return pickMixedItemsWithPartnerQuota(pools, count, seed, pick).map((item) => pageItemWithResolver(item, label, resolveImage));
}
// ─── Pool helpers ─────────────────────────────────────────────────────────────
function createDeckBuildPools(itemsBySection) {
    const foodItems = itemsBySection.quan_an;
    const cafeItems = itemsBySection.cafe;
    const stayItems = itemsBySection.homestay;
    const checkinItems = itemsBySection.check_in;
    const serviceItems = itemsBySection.dich_vu;
    const historyItems = itemsBySection.dia_diem_lich_su;
    const tourismItems = itemsBySection.khu_du_lich;
    return {
        foodItems, cafeItems, stayItems, checkinItems, serviceItems, historyItems, tourismItems,
        breakfastItems: foodItems.filter((i) => normalizeItemType(i, 'sang')),
        lunchItems: foodItems.filter((i) => normalizeItemType(i, 'trua')),
        dinnerItems: foodItems.filter((i) => normalizeItemType(i, 'toi')),
        freeCheckinItems: checkinItems.filter((i) => i.price.toLowerCase().includes('free')),
        famousItems: [...historyItems, ...tourismItems],
    };
}
function collectMappedImageUrls(pools) {
    return [
        ...pools.foodItems, ...pools.cafeItems, ...pools.stayItems,
        ...pools.checkinItems, ...pools.serviceItems, ...pools.historyItems, ...pools.tourismItems,
    ]
        .filter((i) => i.imageSource === 'manual' || i.imageSource === 'auto')
        .map((i) => i.imageUrl)
        .filter(Boolean);
}
// ─── Caption helpers ──────────────────────────────────────────────────────────
function splitCaptionBody(text, count) {
    if (!text)
        return Array.from({ length: count }, () => '');
    const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    if (sentences.length >= count) {
        const chunks = Array.from({ length: count }, () => []);
        sentences.forEach((s, i) => chunks[i % count].push(s));
        return chunks.map((c) => c.join(' ').trim());
    }
    const words = text.split(/\s+/).filter(Boolean);
    const wordsPerChunk = Math.ceil(words.length / Math.max(count, 1));
    return Array.from({ length: count }, (_, i) => words.slice(i * wordsPerChunk, (i + 1) * wordsPerChunk).join(' ').trim());
}
function applyCaptionToPages(pages, caption) {
    const bodyChunks = splitCaptionBody(caption.body, Math.max(pages.length - 1, 1));
    return pages.map((page, index) => {
        if (page.type === 'cover') {
            return {
                ...page,
                title: sanitizeDeckHeadline(caption.headline || page.title),
                subtitle: coverSubtitleFromCaption(caption.body, page.subtitle),
            };
        }
        return { ...page, subtitle: bodyChunks[index - 1] || page.subtitle };
    });
}
// ─── Individual deck page builders ───────────────────────────────────────────
function buildItineraryPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls) {
    const mappedImageUrls = collectMappedImageUrls(pools);
    const imageResolver = (0, image_resolver_1.createListImageResolver)(imageUrls, libraryEntries, `${seedPrefix}:itinerary`, mappedImageUrls, globalUsedImageUrls || []);
    const background = (seed) => backgroundFor(imageUrls, seed, globalUsedImageUrls);
    const pick = createListPicker(globalUsedItemIds);
    const servicePagePick = createListPicker(globalUsedItemIds);
    const breakfastOrLunchItems = dedupeItems([...pools.breakfastItems, ...pools.lunchItems]);
    const arrivalServiceItems = pools.serviceItems.filter((item) => {
        const t = item.type.toLowerCase();
        const n = item.name.toLowerCase();
        return t.includes('thue') || n.includes('thue') || t.includes('rental') || n.includes('rental');
    });
    return [
        buildCoverPage('Gợi ý lịch trình 3N2Đ', 'Một bộ khung ngắn để đi Đà Lạt lần đầu mà vẫn có ăn sáng, cafe, check-in và chỗ chơi đáng lưu.', background(`${seedPrefix}-cover-itinerary`)),
        buildListPage('Ngày 1', 'terracotta', 'Ngày 1 - tuyến trung tâm', 'Một page gom đủ gửi đồ, ăn sáng, cafe, ăn trưa, check-in và ăn tối của ngày đầu.', pickItineraryPageItems([
            { time: '05:00', prefix: 'Gửi đồ:', preferredItems: pools.stayItems, fallbackItems: [...arrivalServiceItems, ...pools.serviceItems, ...pools.stayItems], seed: `${seedPrefix}-it-day1-stay` },
            { time: '07:30', prefix: 'Ăn sáng:', preferredItems: pools.breakfastItems, fallbackItems: breakfastOrLunchItems, seed: `${seedPrefix}-it-day1-breakfast` },
            { time: '09:00', prefix: 'Cafe:', preferredItems: pools.cafeItems, fallbackItems: pools.cafeItems, seed: `${seedPrefix}-it-day1-cafe` },
            { time: '12:00', prefix: 'Ăn trưa:', preferredItems: pools.lunchItems, fallbackItems: pools.foodItems, seed: `${seedPrefix}-it-day1-lunch` },
            { time: '15:00', prefix: 'Check-in:', preferredItems: [...pools.freeCheckinItems, ...pools.checkinItems], fallbackItems: [...pools.checkinItems, ...pools.famousItems], seed: `${seedPrefix}-it-day1-checkin` },
            { time: '18:30', prefix: 'Ăn tối:', preferredItems: pools.dinnerItems, fallbackItems: pools.dinnerItems, seed: `${seedPrefix}-it-day1-dinner` },
        ], pick, imageResolver), background(`${seedPrefix}-it-day1`), 'itinerary'),
        buildListPage('Ngày 2', 'pine', 'Ngày 2 - săn ảnh và đi chơi', 'Tuyến ngày hai ưu tiên cảnh đẹp, cafe nghỉ chân, ăn trưa, check-in và ăn tối.', pickItineraryPageItems([
            { time: '06:30', prefix: 'Ăn sáng:', preferredItems: pools.breakfastItems, fallbackItems: breakfastOrLunchItems, seed: `${seedPrefix}-it-day2-breakfast` },
            { time: '08:30', prefix: 'Bắt đầu:', preferredItems: pools.famousItems, fallbackItems: [...pools.famousItems, ...pools.checkinItems], seed: `${seedPrefix}-it-day2-famous` },
            { time: '10:30', prefix: 'Cafe:', preferredItems: pools.cafeItems, fallbackItems: pools.cafeItems, seed: `${seedPrefix}-it-day2-cafe` },
            { time: '12:30', prefix: 'Ăn trưa:', preferredItems: pools.lunchItems, fallbackItems: pools.foodItems, seed: `${seedPrefix}-it-day2-lunch` },
            { time: '15:00', prefix: 'Check-in:', preferredItems: [...pools.freeCheckinItems, ...pools.checkinItems], fallbackItems: [...pools.checkinItems, ...pools.famousItems], seed: `${seedPrefix}-it-day2-checkin` },
            { time: '18:30', prefix: 'Ăn tối:', preferredItems: pools.dinnerItems, fallbackItems: pools.dinnerItems, seed: `${seedPrefix}-it-day2-dinner` },
        ], pick, imageResolver), background(`${seedPrefix}-it-day2`), 'itinerary'),
        buildListPage('Ngày 3', 'gold', 'Ngày 3 - chill nhẹ rồi mua quà', 'Ngày cuối giữ nhịp nhẹ: ăn sáng, cafe, điểm ghé, ăn trưa và dịch vụ chốt chuyến.', pickItineraryPageItems([
            { time: '07:30', prefix: 'Ăn sáng:', preferredItems: pools.breakfastItems, fallbackItems: breakfastOrLunchItems, seed: `${seedPrefix}-it-day3-breakfast` },
            { time: '09:00', prefix: 'Cafe:', preferredItems: pools.cafeItems, fallbackItems: pools.cafeItems, seed: `${seedPrefix}-it-day3-cafe` },
            { time: '10:30', prefix: 'Điểm ghé:', preferredItems: pools.famousItems, fallbackItems: [...pools.famousItems, ...pools.checkinItems], seed: `${seedPrefix}-it-day3-famous` },
            { time: '12:00', prefix: 'Ăn trưa:', preferredItems: pools.lunchItems, fallbackItems: pools.foodItems, seed: `${seedPrefix}-it-day3-lunch` },
            { time: '15:00', prefix: 'Dịch vụ:', preferredItems: pools.serviceItems, fallbackItems: [...pools.serviceItems, ...pools.stayItems], seed: `${seedPrefix}-it-day3-service` },
            { time: '17:00', prefix: 'Chốt chuyến:', preferredItems: pools.stayItems, fallbackItems: [...pools.stayItems, ...pools.serviceItems], seed: `${seedPrefix}-it-day3-stay` },
        ], pick, imageResolver), background(`${seedPrefix}-it-day3`), 'itinerary'),
        buildListPage('Check-in', 'berry', 'Địa điểm check-in', 'Các điểm check-in không thể bỏ qua, ưu tiên các đối tác và các điểm tham quan miễn phí tại Đà Lạt.', pickPhotomodeItemsWithQuota(dedupeItems([...pools.checkinItems, ...pools.freeCheckinItems, ...pools.famousItems, ...pools.tourismItems]), 6, `${seedPrefix}-it-checkin-page`, pick).map((item) => pageItemWithResolver(item, 'Check-in', imageResolver)), background(`${seedPrefix}-it-checkin-page`), 'compact'),
        buildListPage('Dịch vụ', 'slate', 'Một số dịch vụ cần lưu ý cho bạn', 'Một trang chốt để nhắc về thuê xe, mua quà hoặc chỗ nghỉ trước khi chốt hành trình, nên bổ sung nhiều điểm hơn để dễ chọn nhanh.', pickContextualItems(dedupeItems([...pools.serviceItems, ...pools.stayItems]), dedupeItems([...pools.checkinItems, ...pools.cafeItems, ...pools.famousItems]), 6, `${seedPrefix}-it-service-page`, servicePagePick).map((item) => pageItemWithResolver(item, 'Cần lưu', imageResolver)), background(`${seedPrefix}-it-service-page`), 'compact'),
    ];
}
function pickJourneySlots(slotPools, seed, pick, imageResolver, labels) {
    const selected = [];
    let partnerCount = 0;
    for (let i = 0; i < slotPools.length; i++) {
        const pool = slotPools[i];
        if (!pool || pool.length === 0)
            continue;
        // We want to target around 3 partners total.
        let chosen;
        // If we need more partners and this pool has partners, try to pick one
        const partnersInPool = pool.filter(item => item.isPartner);
        const regularsInPool = pool.filter(item => !item.isPartner);
        if (partnerCount < 3 && partnersInPool.length > 0) {
            chosen = pick(partnersInPool, 1, `${seed}-slot${i}-partner`)[0];
            if (chosen)
                partnerCount++;
        }
        // If we have enough partners, or couldn't pick a partner, try to pick regular
        if (!chosen && regularsInPool.length > 0) {
            chosen = pick(regularsInPool, 1, `${seed}-slot${i}-regular`)[0];
        }
        // Fallback if needed
        if (!chosen) {
            chosen = pick(pool, 1, `${seed}-slot${i}-fallback`)[0];
        }
        if (chosen) {
            selected.push({ item: chosen, label: labels[i] || `ĐIỂM ${i + 1}` });
        }
    }
    return selected.map(({ item, label }) => pageItemWithResolver(item, label, imageResolver));
}
function buildItinerary4N3DPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls) {
    const mappedImageUrls = collectMappedImageUrls(pools);
    const imageResolver = (0, image_resolver_1.createListImageResolver)(imageUrls, libraryEntries, `${seedPrefix}:journey-4n3d`, mappedImageUrls, globalUsedImageUrls || []);
    const background = (seed) => backgroundFor(imageUrls, seed, globalUsedImageUrls);
    const pick = createListPicker(globalUsedItemIds);
    const breakfastOrLunchItems = dedupeItems([...pools.breakfastItems, ...pools.lunchItems]);
    const mealItems = dedupeItems([...pools.breakfastItems, ...pools.lunchItems, ...pools.dinnerItems, ...pools.foodItems]);
    const scenicItems = dedupeItems([...pools.famousItems, ...pools.tourismItems, ...pools.checkinItems]);
    const outdoorItems = dedupeItems([...scenicItems.filter(isOutdoorSpot), ...pools.tourismItems, ...pools.famousItems]);
    const day1Items = pickJourneySlots([
        breakfastOrLunchItems, // ĂN SÁNG
        pools.cafeItems, // CAFE
        dedupeItems([...pools.checkinItems, ...pools.tourismItems]), // ĐI DẠO
        pools.lunchItems.length > 0 ? pools.lunchItems : pools.foodItems, // ĂN TRƯA
        dedupeItems([...outdoorItems, ...pools.checkinItems]), // CHECK-IN
        pools.dinnerItems, // ĂN TỐI
    ], `${seedPrefix}-journey-day1`, pick, imageResolver, ['ĂN SÁNG', 'CAFE', 'ĐI DẠO', 'ĂN TRƯA', 'CHECK-IN', 'ĂN TỐI']);
    const day2Items = pickJourneySlots([
        pools.breakfastItems, // ĐI SỚM
        outdoorItems, // OUTDOOR
        pools.cafeItems, // CAFE
        pools.checkinItems, // CHECK-IN
        pools.lunchItems, // ĂN TRƯA
        pools.dinnerItems // ĂN TỐI
    ], `${seedPrefix}-journey-day2`, pick, imageResolver, ['ĐI SỚM', 'OUTDOOR', 'CAFE', 'CHECK-IN', 'ĂN TRƯA', 'ĂN TỐI']);
    const day3Items = pickJourneySlots([
        pools.tourismItems, // ĐIỂM NEO
        dedupeItems([...pools.famousItems, ...outdoorItems]), // VIEWPOINT
        pools.cafeItems, // CAFE
        pools.lunchItems, // ĂN TRƯA
        pools.checkinItems, // TRẢI NGHIỆM
        pools.dinnerItems // ĂN TỐI
    ], `${seedPrefix}-journey-day3`, pick, imageResolver, ['ĐIỂM NEO', 'VIEWPOINT', 'CAFE', 'ĂN TRƯA', 'TRẢI NGHIỆM', 'ĂN TỐI']);
    const day4Items = pickJourneySlots([
        pools.cafeItems, // CAFE SÁNG
        breakfastOrLunchItems, // ĂN NHẸ
        dedupeItems([...pools.famousItems, ...pools.checkinItems]), // ĐIỂM GHÉ
        pools.lunchItems.length > 0 ? pools.lunchItems : pools.foodItems, // ĂN TRƯA
        dedupeItems([...pools.checkinItems, ...outdoorItems]), // CHECK-IN
        pools.dinnerItems.length > 0 ? pools.dinnerItems : mealItems // ĂN TỐI
    ], `${seedPrefix}-journey-day4`, pick, imageResolver, ['CAFE SÁNG', 'ĂN NHẸ', 'ĐIỂM GHÉ', 'ĂN TRƯA', 'CHECK-IN', 'ĂN TỐI']);
    return [
        {
            ...buildCoverPage('4N3Đ ĐÀ LẠT\nĐI CHẬM CHILL SÂU', '', // subtitle removed as requested
            background(`${seedPrefix}-journey-cover`)),
            layoutVariant: 'journey-4n3d',
        },
        buildListPage('Day 01', 'terracotta', 'Vào phố nhẹ nhàng', '', day1Items, background(`${seedPrefix}-journey-day1-bg`), 'journey-4n3d'),
        buildListPage('Day 02', 'gold', 'Săn ảnh và bắt sáng', '', day2Items, background(`${seedPrefix}-journey-day2-bg`), 'journey-4n3d'),
        buildListPage('Day 03', 'berry', 'Đi sâu hơn một nhịp', '', day3Items, background(`${seedPrefix}-journey-day3-bg`), 'journey-4n3d'),
        buildListPage('Day 04', 'slate', 'Sáng chậm rồi rời phố', '', day4Items, background(`${seedPrefix}-journey-day4-bg`), 'journey-4n3d'),
        buildListPage('Lưu trú', 'pine', 'Địa điểm lưu trú', '', pickJourneySlots(Array(6).fill(pools.stayItems), `${seedPrefix}-journey-stay`, pick, imageResolver, ['KHÁCH SẠN', 'LƯU TRÚ', 'GẦN TRUNG TÂM', 'NGHỈ NGƠI', 'CHECK-IN', 'CHỐT PHÒNG']), background(`${seedPrefix}-journey-stay-bg`), 'journey-4n3d'),
        buildListPage('Dịch vụ', 'slate', 'Dịch vụ cần chú ý', '', pickJourneySlots(Array(6).fill(pools.serviceItems), `${seedPrefix}-journey-services`, pick, imageResolver, ['THUÊ XE', 'DỊCH VỤ', 'ĐẶT TRƯỚC', 'MUA QUÀ', 'HỖ TRỢ', 'CẦN NHỚ']), background(`${seedPrefix}-journey-services-bg`), 'journey-4n3d'),
    ];
}
function buildMustGoPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls) {
    const mappedImageUrls = collectMappedImageUrls(pools);
    const imageResolver = (0, image_resolver_1.createListImageResolver)(imageUrls, libraryEntries, `${seedPrefix}:must-go`, mappedImageUrls, globalUsedImageUrls || []);
    const background = (seed) => backgroundFor(imageUrls, seed, globalUsedImageUrls);
    const pick = createListPicker(globalUsedItemIds);
    const breakfastOrLunchItems = dedupeItems([...pools.breakfastItems, ...pools.lunchItems]);
    return [
        buildCoverPage('Những điểm không thể bỏ qua', 'Dùng cho các bộ ảnh kiểu must-go: điểm nổi tiếng, check-in đẹp, cafe có concept và chỗ ở đáng ghim.', background(`${seedPrefix}-cover-must-go`)),
        buildListPage('Must go', 'terracotta', 'Điểm nổi tiếng nên ghé', 'Trang này gom nhiều điểm nổi bật hơ để người xem lưu ngay nếu không muốn bỏ lỡ nơi nổi tiếng khi đến Đà Lạt.', pickMixedItemsWithPartnerQuota(pools.famousItems, 4, `${seedPrefix}-must-famous-page`, pick).map((i) => pageItemWithResolver(i, 'Điểm nổi tiếng', imageResolver)), background(`${seedPrefix}-must-famous-page`), 'dense'),
        buildListPage('Gợi ý', 'gold', 'Điểm check-in dễ đi', 'Các điểm đẹp được tăng thêm số lượng để trang này thật sự có giá trị lưu lại, không chỉ dừng ở 1-2 địa điểm.', pickMixedItemsWithPartnerQuota(pools.freeCheckinItems.length > 0 ? pools.freeCheckinItems : pools.checkinItems, 4, `${seedPrefix}-must-free-page`, pick).map((i) => pageItemWithResolver(i, 'Check-in', imageResolver)), background(`${seedPrefix}-must-free-page`), 'dense'),
        buildListPage('Cafe', 'pine', 'Quán cafe có concept', 'Giữ layout chữ to, tên quán nổi rõ nhưng tăng thêm dữ liệu để page cafe trông thật sự đáng lưu.', pickMixedItemsWithPartnerQuota(pools.cafeItems, 4, `${seedPrefix}-must-cafe-page`, pick).map((i) => pageItemWithResolver(i, 'Cafe đẹp', imageResolver)), background(`${seedPrefix}-must-cafe-page`), 'dense'),
        buildListPage('Ăn uống', 'berry', 'Ăn sáng rồi đi đâu', 'Một trang xen giữa ăn sáng và điểm đến để bộ carousel bớt lặp toàn check-in, đồng thời có đủ dữ liệu để dùng được ngay.', pickMixedItemsWithPartnerQuota(breakfastOrLunchItems, 4, `${seedPrefix}-must-food-page`, pick).map((i) => pageItemWithResolver(i, 'Ăn sáng', imageResolver)), background(`${seedPrefix}-must-food-page`), 'dense'),
        buildListPage('Lưu trú', 'slate', 'Homestay và dịch vụ nên nhớ', 'Trang cuối dùng để chốt các điểm thực dụng như ở đâu, thuê gì, mua quà ở đâu trước khi kết thúc bộ nội dung, nên mình tăng thêm lựa chọn.', pickMixedItemsWithPartnerQuota([...pools.stayItems, ...pools.serviceItems], 4, `${seedPrefix}-must-stay-page`, pick).map((i) => pageItemWithResolver(i, 'Chốt chuyến', imageResolver)), background(`${seedPrefix}-must-stay-page`), 'dense'),
    ];
}
function buildFirstTimePages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls) {
    const mappedImageUrls = collectMappedImageUrls(pools);
    const imageResolver = (0, image_resolver_1.createListImageResolver)(imageUrls, libraryEntries, `${seedPrefix}:first-time`, mappedImageUrls, globalUsedImageUrls || []);
    const background = (seed) => backgroundFor(imageUrls, seed, globalUsedImageUrls);
    const pick = createListPicker(globalUsedItemIds);
    const breakfastOrLunchItems = dedupeItems([...pools.breakfastItems, ...pools.lunchItems]);
    return [
        buildCoverPage('Đi Đà Lạt lần đầu nên lưu gì', 'Một bộ trang dành cho người chuẩn bị đi Đà Lạt: ăn sáng, cafe, check-in, địa điểm nổi tiếng và dịch vụ cần nhớ.', background(`${seedPrefix}-cover-first-time`)),
        buildListPage('Lưu ý', 'terracotta', 'Đi sớm để săn ảnh đẹp', 'Mở đầu bằng các điểm hợp buổi sáng để bộ nội dung có nhịp giống mẫu, nhưng tăng số điểm để người mới nhìn là có nhiều gợi ý hơn.', pickMixedItemsWithPartnerQuota([...pools.breakfastItems, ...pools.cafeItems, ...pools.freeCheckinItems], 4, `${seedPrefix}-first-morning-page`, pick).map((i) => pageItemWithResolver(i, 'Sáng sớm', imageResolver)), background(`${seedPrefix}-first-morning-page`), 'dense'),
        buildListPage('Ăn sáng', 'gold', 'Quán ăn sáng dễ chốt', 'Ưu tiên những chỗ có địa chỉ rõ, dữ liệu đủ sạch để dùng cho bộ ảnh dành cho người mới lên kế hoạch, nên bổ sung thêm số lượng.', pickMixedItemsWithPartnerQuota(breakfastOrLunchItems, 4, `${seedPrefix}-first-breakfast-page`, pick).map((i) => pageItemWithResolver(i, 'Buổi sáng', imageResolver)), background(`${seedPrefix}-first-breakfast-page`), 'dense'),
        buildListPage('Cafe', 'pine', 'Cafe để ngồi và chụp', 'Trang này đóng vai trò cầu nối giữa lịch trình và visual, nên tăng số quán để người mới dễ chọn concept phù hợp.', pickMixedItemsWithPartnerQuota(pools.cafeItems, 4, `${seedPrefix}-first-cafe-page`, pick).map((i) => pageItemWithResolver(i, 'Cafe', imageResolver)), background(`${seedPrefix}-first-cafe-page`), 'dense'),
        buildListPage('Check-in', 'berry', 'Điểm chụp hình nên ghé', 'Một trang tập trung vào check-in và điểm nổi tiếng để người chuẩn bị đi có thể lưu nhanh nhiều chỗ hơn, không chỉ 1-2 điểm.', pick([...pools.checkinItems, ...pools.famousItems], 4, `${seedPrefix}-first-checkin-page`).map((i) => pageItemWithResolver(i, 'Nên ghé', imageResolver)), background(`${seedPrefix}-first-checkin-page`), 'dense'),
        buildListPage('Cuối list', 'slate', 'Dịch vụ và chỗ nghỉ cần nhớ', 'Trang chốt tổng hợp các thứ thực dụng: ở đâu, liên hệ gì, mua quà hay thuê xe ở đâu cho gọn, nên mình tăng thêm điểm để tiện chốt nhanh.', pick([...pools.serviceItems, ...pools.stayItems], 4, `${seedPrefix}-first-service-page`).map((i) => pageItemWithResolver(i, 'Cần nhớ', imageResolver)), background(`${seedPrefix}-first-service-page`), 'dense'),
    ];
}
function pickPhotomodeItemsWithQuota(items, count, seed, pick) {
    const partnerPool = items.filter((i) => i.isPartner);
    const regularPool = items.filter((i) => !i.isPartner);
    const freshPartnerPool = freshForPicker(partnerPool, pick);
    const freshRegularPool = freshForPicker(regularPool, pick);
    // Tỉ lệ 2/3 đối tác, 1/3 không phải đối tác
    let targetPartnerCount = Math.floor((count * 2) / 3);
    if (freshPartnerPool.length < targetPartnerCount) {
        targetPartnerCount = freshPartnerPool.length;
    }
    const selectedPartners = pick(freshPartnerPool, targetPartnerCount, `${seed}-partners`);
    const selectedRegulars = pick(freshRegularPool.length > 0 ? freshRegularPool : regularPool, count - selectedPartners.length, `${seed}-regular`);
    const combined = [...selectedPartners, ...selectedRegulars];
    if (combined.length < count) {
        combined.push(...pick(remainingItems(items, combined), count - combined.length, `${seed}-fill`));
    }
    return combined.sort((a, b) => (0, image_resolver_1.stableHash)(`${seed}:shuffle:${a.id}`) - (0, image_resolver_1.stableHash)(`${seed}:shuffle:${b.id}`));
}
function buildPhotomodeItems(preferredItems, fallbackItems, count, seed, pick, resolveImage, labelForItem) {
    const pool = dedupeItems([...preferredItems, ...fallbackItems]);
    return pickPhotomodeItemsWithQuota(pool, count, seed, pick).map((item) => photomodePageItemWithResolver(item, labelForItem(item), resolveImage));
}
function buildPov3DayPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls) {
    const mappedImageUrls = collectMappedImageUrls(pools);
    const imageResolver = (0, image_resolver_1.createListImageResolver)(imageUrls, libraryEntries, `${seedPrefix}:pov-3-day`, mappedImageUrls, globalUsedImageUrls || []);
    const background = (seed) => backgroundFor(imageUrls, seed, globalUsedImageUrls);
    const pick = createListPicker(globalUsedItemIds);
    const allSpots = dedupeItems([...pools.checkinItems, ...pools.famousItems]);
    const outdoorSpots = allSpots.filter(isOutdoorSpot);
    const morningCafes = pools.cafeItems.filter(isMorningCafe);
    const chillCafes = pools.cafeItems.filter((item) => !isMorningCafe(item));
    const catchAllItems = dedupeItems([
        ...pools.checkinItems,
        ...pools.cafeItems,
        ...pools.foodItems,
        ...pools.serviceItems,
        ...pools.stayItems,
        ...pools.famousItems,
    ]);
    const coverItem = pickSingleContextualItem([...outdoorSpots, ...pools.freeCheckinItems], [...allSpots, ...pools.cafeItems, ...catchAllItems], `${seedPrefix}-cover`, pick)[0];
    const coverImage = coverItem
        ? photomodePageItemWithResolver(coverItem, 'checkin ngoại cảnh', imageResolver).imageUrl
        : background(`${seedPrefix}-cover-bg`);
    return [
        {
            ...buildCoverPage('POV: có 3 ngày\nvi vu khắp Đà Lạt', 'dalat. [gợi ý local guide ngắn ngày]', coverImage),
            layoutVariant: 'photomode',
        },
        buildListPage('Check-in', 'terracotta', 'Check-in đẹp cho 3 ngày vi vu', 'Gom các điểm check-in đẹp local, dùng layout photomode bám sát mẫu tham chiếu.', buildPhotomodeItems([...pools.freeCheckinItems, ...pools.checkinItems], allSpots, 3, `${seedPrefix}-free-checkin`, pick, imageResolver, () => 'check-in'), '', 'photomode'),
        buildListPage('Cafe sáng', 'gold', 'Cafe sáng', 'Ưu tiên các quán mở sớm và hợp nhịp buổi sáng.', buildPhotomodeItems(morningCafes, pools.cafeItems, 3, `${seedPrefix}-morning-cafe`, pick, imageResolver, () => 'cà phê sáng'), '', 'photomode'),
        buildListPage('Cafe chill', 'pine', 'Cafe chill', 'Những quán có vibe ngồi lâu, chill hoặc săn ảnh cuối ngày.', buildPhotomodeItems(chillCafes, pools.cafeItems, 3, `${seedPrefix}-chill-cafe`, pick, imageResolver, () => 'cà phê chill'), '', 'photomode'),
        buildListPage('Ngoại cảnh', 'berry', 'Check-in ngoại cảnh', 'Ưu tiên các cảnh rộng, điểm ngoại cảnh và spots hợp chụp ảnh.', buildPhotomodeItems([...outdoorSpots, ...pools.famousItems], allSpots, 3, `${seedPrefix}-outdoor-checkin`, pick, imageResolver, () => 'checkin ngoại cảnh'), '', 'photomode'),
        buildListPage('Ăn sáng', 'gold', 'Ăn sáng', 'Các quán dễ chèn vào buổi sớm trong chuỗi 3 ngày vi vu.', buildPhotomodeItems(pools.breakfastItems, pools.foodItems, 3, `${seedPrefix}-breakfast`, pick, imageResolver, () => 'ăn sáng'), '', 'photomode'),
        buildListPage('Ăn trưa', 'terracotta', 'Ăn trưa', 'Các quán hợp buổi trưa, nhìn là biết nên lưu ngay.', buildPhotomodeItems(pools.lunchItems, pools.foodItems, 3, `${seedPrefix}-lunch`, pick, imageResolver, () => 'ăn trưa'), '', 'photomode'),
        buildListPage('Ăn tối', 'slate', 'Ăn tối', 'Nhóm quán nên lưu cho buổi tối, ưu tiên ảnh món và không khí quán.', buildPhotomodeItems(pools.dinnerItems, pools.foodItems, 3, `${seedPrefix}-dinner`, pick, imageResolver, () => 'ăn tối'), '', 'photomode'),
        buildListPage('Dịch vụ', 'pine', 'Dịch vụ cần lưu ý', 'Trang chốt gom các dịch vụ thực dụng như lưu trú, mua quà, thuê xe và những điểm nên lưu trước khi chốt chuyến.', pickPhotomodeItemsWithQuota(dedupeItems([...pools.stayItems, ...pools.serviceItems]), 3, `${seedPrefix}-services`, pick).map((item) => photomodePageItemWithResolver(item, photomodeServiceLabel(item), imageResolver)), '', 'photomode'),
    ];
}
function buildGridPageItems(primaryItems, fallbackItems, count, seed, pick, imageResolver, labelForItem) {
    return pickGridItemsWithPartnerQuota(primaryItems, fallbackItems, count, seed, pick).map((item) => photomodePageItemWithResolver(item, labelForItem(item), imageResolver));
}
function buildGrid8PageItems(primaryItems, fallbackItems, count, seed, pick, imageResolver, labelForItem) {
    return pickGrid8ItemsWithPartnerQuota(primaryItems, fallbackItems, count, seed, pick).map((item) => photomodePageItemWithResolver(item, labelForItem(item), imageResolver));
}
function buildGrid6Pages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls) {
    const mappedImageUrls = collectMappedImageUrls(pools);
    const imageResolver = (0, image_resolver_1.createListImageResolver)(imageUrls, libraryEntries, `${seedPrefix}:grid-6`, mappedImageUrls, globalUsedImageUrls || []);
    const background = (seed) => backgroundFor(imageUrls, seed, globalUsedImageUrls);
    const pick = createListPicker(globalUsedItemIds);
    const catchAllItems = dedupeItems([
        ...pools.famousItems,
        ...pools.checkinItems,
        ...pools.cafeItems,
        ...pools.foodItems,
        ...pools.stayItems,
        ...pools.serviceItems,
    ]);
    const tourismFallbackItems = dedupeItems([...pools.tourismItems, ...pools.famousItems, ...pools.checkinItems]);
    return [
        {
            ...buildCoverPage('TOP 6 ĐỊA ĐIỂM ĐÀ LẠT', 'Một bộ gợi ý ngắn, dễ quét nhanh để chọn điểm đi, ăn uống và chụp hình trong ngày.', background(`${seedPrefix}-cover`)),
            layoutVariant: 'grid-6',
        },
        buildListPage('Check-in', 'terracotta', 'DANH SÁCH ĐỊA ĐIỂM', 'Điểm check-in dễ lưu lại', buildGridPageItems(pools.checkinItems, catchAllItems, 6, `${seedPrefix}-checkin`, pick, imageResolver, (item) => item.type), '', 'grid-6'),
        buildListPage('Cà phê', 'gold', 'QUÁN CAFE ĐÀ LẠT', 'View cực chill, săn mây đỉnh', buildGridPageItems(pools.cafeItems, catchAllItems, 6, `${seedPrefix}-cafe`, pick, imageResolver, (item) => item.type), '', 'grid-6'),
        buildListPage('Ẩm thực', 'berry', 'MÓN NGON ĐÀ LẠT', 'Ăn là ghiền, nhất định phải thử', buildGridPageItems(pools.foodItems, catchAllItems, 6, `${seedPrefix}-food`, pick, imageResolver, (item) => item.type), '', 'grid-6'),
        buildListPage('Khu du lịch', 'slate', 'KHU DU LỊCH HOT', 'Điểm đến không thể bỏ qua', buildGridPageItems(pools.tourismItems, tourismFallbackItems, 6, `${seedPrefix}-tourism`, pick, imageResolver, (item) => item.type), '', 'grid-6'),
        buildListPage('Dịch vụ', 'pine', 'DỊCH VỤ CẦN CHÚ Ý', 'Lưu trú, thuê xe & quà tặng', buildGridPageItems([...pools.stayItems, ...pools.serviceItems], catchAllItems, 6, `${seedPrefix}-services`, pick, imageResolver, photomodeServiceLabel), '', 'grid-6'),
    ];
}
function buildGrid8Pages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls) {
    const mappedImageUrls = collectMappedImageUrls(pools);
    const imageResolver = (0, image_resolver_1.createListImageResolver)(imageUrls, libraryEntries, `${seedPrefix}:grid-8`, mappedImageUrls, globalUsedImageUrls || []);
    const background = (seed) => backgroundFor(imageUrls, seed, globalUsedImageUrls);
    const pick = createListPicker(globalUsedItemIds);
    const catchAllItems = dedupeItems([
        ...pools.famousItems,
        ...pools.checkinItems,
        ...pools.cafeItems,
        ...pools.foodItems,
        ...pools.tourismItems,
        ...pools.stayItems,
        ...pools.serviceItems,
    ]);
    const tourismFallbackItems = dedupeItems([...pools.tourismItems, ...pools.famousItems, ...pools.checkinItems]);
    const contentPages = [
        buildListPage('Check-in', 'terracotta', '8 ĐIỂM CHECK-IN', 'Một trang scan nhanh 8 điểm, ưu tiên ảnh rõ và tên ngắn.', buildGrid8PageItems(pools.checkinItems, catchAllItems, 8, `${seedPrefix}-checkin`, pick, imageResolver, (item) => item.type), background(`${seedPrefix}-checkin-center`), 'grid-8'),
        buildListPage('Cafe', 'gold', '8 QUÁN CAFE', 'Gợi ý quán ngồi chill, dễ lưu trước khi đi.', buildGrid8PageItems(pools.cafeItems, catchAllItems, 8, `${seedPrefix}-cafe`, pick, imageResolver, (item) => item.type), background(`${seedPrefix}-cafe-center`), 'grid-8'),
        buildListPage('Ăn uống', 'berry', '8 MÓN NÊN THỬ', 'Nhóm quán ăn được gom gọn để người xem chọn nhanh.', buildGrid8PageItems(pools.foodItems, catchAllItems, 8, `${seedPrefix}-food`, pick, imageResolver, (item) => item.type), background(`${seedPrefix}-food-center`), 'grid-8'),
        buildListPage('Đi chơi', 'slate', '8 ĐIỂM ĐI CHƠI', 'Các điểm tham quan và khu du lịch đặt trong lưới dày hơn.', buildGrid8PageItems(pools.tourismItems, catchAllItems, 8, `${seedPrefix}-tourism`, pick, imageResolver, (item) => item.type), background(`${seedPrefix}-tourism-center`), 'grid-8'),
        buildListPage('Dịch vụ', 'pine', '8 LƯU Ý CẦN NHỚ', 'Lưu trú, thuê xe và dịch vụ thực dụng được đặt ở trang cuối.', buildGrid8PageItems([...pools.stayItems, ...pools.serviceItems], catchAllItems, 8, `${seedPrefix}-services`, pick, imageResolver, photomodeServiceLabel), background(`${seedPrefix}-services-center`), 'grid-8'),
    ];
    const shuffledContentPages = shuffleListPages(contentPages.slice(0, -1), seedPrefix);
    const servicePage = contentPages[contentPages.length - 1];
    return [
        {
            ...buildCoverPage('ĐÀ LẠT 8 ĐIỂM / 1 TRANG', 'Mẫu lưới dày để xem nhiều lựa chọn hơn trong một lần lướt.', background(`${seedPrefix}-cover`)),
            layoutVariant: 'grid-8',
        },
        ...shuffledContentPages,
        ...(servicePage ? [servicePage] : []),
    ];
}
function buildGrid4Pages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls) {
    const mappedImageUrls = collectMappedImageUrls(pools);
    const imageResolver = (0, image_resolver_1.createListImageResolver)(imageUrls, libraryEntries, `${seedPrefix}:grid-4`, mappedImageUrls, globalUsedImageUrls || []);
    const background = (seed) => backgroundFor(imageUrls, seed, globalUsedImageUrls);
    const pick = createListPicker(globalUsedItemIds);
    const catchAllItems = dedupeItems([...pools.famousItems, ...pools.checkinItems, ...pools.cafeItems, ...pools.foodItems]);
    const tourismFallbackItems = dedupeItems([...pools.tourismItems, ...pools.famousItems, ...pools.checkinItems]);
    const contentPages = [
        buildListPage('Check-in', 'terracotta', 'ĐỊA ĐIỂM CHECK-IN', 'Mỗi trang cân bằng đối tác và địa điểm thường', buildGridPageItems(pools.checkinItems, catchAllItems, 4, `${seedPrefix}-checkin`, pick, imageResolver, (item) => item.type), '', 'grid-4'),
        buildListPage('Cà phê', 'gold', 'QUÁN CAFE ĐÀ LẠT', '2 đối tác và 2 địa điểm thường khi đủ dữ liệu', buildGridPageItems(pools.cafeItems, catchAllItems, 4, `${seedPrefix}-cafe`, pick, imageResolver, (item) => item.type), '', 'grid-4'),
        buildListPage('Ẩm thực', 'berry', 'MÓN NGON ĐÀ LẠT', 'Ảnh được đổi theo seed của từng bộ AI', buildGridPageItems(pools.foodItems, catchAllItems, 4, `${seedPrefix}-food`, pick, imageResolver, (item) => item.type), '', 'grid-4'),
        buildListPage('Khu du lịch', 'slate', 'KHU DU LỊCH HOT', 'Gọn hơn mẫu 6 ô nhưng giữ cùng tinh thần thiết kế', buildGridPageItems(pools.tourismItems, tourismFallbackItems, 4, `${seedPrefix}-tourism`, pick, imageResolver, (item) => item.type), '', 'grid-4'),
        buildListPage('Dịch vụ', 'pine', 'DỊCH VỤ CẦN CHÚ Ý', 'Lưu trú, thuê xe & quà tặng', buildGridPageItems([...pools.stayItems, ...pools.serviceItems], catchAllItems, 4, `${seedPrefix}-services`, pick, imageResolver, photomodeServiceLabel), '', 'grid-4'),
    ];
    const shuffledContentPages = shuffleListPages(contentPages.slice(0, -1), seedPrefix);
    const servicePage = contentPages[contentPages.length - 1];
    return [
        {
            ...buildCoverPage('TOP 4 ĐỊA ĐIỂM ĐÀ LẠT', 'Biến thể lưới gọn, mỗi trang 4 hình để xem rõ tên điểm, ảnh và vị trí trước khi chọn.', background(`${seedPrefix}-cover`)),
            layoutVariant: 'grid-4',
        },
        ...shuffledContentPages,
        ...(servicePage ? [servicePage] : []),
    ];
}
// ─── Public entry point ───────────────────────────────────────────────────────
function buildPagesForDeck(deckId, itemsBySection, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls) {
    const pools = createDeckBuildPools(itemsBySection);
    if (deckId === 'itinerary-3n2d')
        return buildItineraryPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls);
    if (deckId === 'itinerary-4n3d')
        return buildItinerary4N3DPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls);
    if (deckId === 'pov-3-day')
        return buildPov3DayPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls);
    if (deckId === 'must-go')
        return buildMustGoPages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls);
    if (deckId === 'first-time')
        return buildFirstTimePages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls);
    if (deckId === 'grid-6')
        return buildGrid6Pages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls);
    if (deckId === 'grid-8')
        return buildGrid8Pages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls);
    if (deckId === 'grid-4')
        return buildGrid4Pages(pools, imageUrls, libraryEntries, seedPrefix, globalUsedItemIds, globalUsedImageUrls);
    throw new Error(`Không hỗ trợ deck: ${deckId}`);
}
function buildDecks(itemsBySection, imageUrls, libraryEntries, globalUsedItemIds, globalUsedImageUrls) {
    const common = { itemsBySection, imageUrls, libraryEntries, globalUsedItemIds, globalUsedImageUrls };
    return [
        {
            id: 'itinerary-3n2d',
            navTitle: 'Lịch trình 3N2Đ',
            title: 'Bộ trang gợi ý lịch trình 3N2Đ',
            description: 'Format này nghiêng về kiểu kể theo ngày: có cover riêng, mỗi ngày là một trang, rồi chốt thêm trang ăn sáng và dịch vụ.',
            lists: [buildDeckList('itinerary-3n2d', 'main', 'List chính', 'List lịch trình 3N2Đ', 'Danh sách ảnh chính cho bộ lịch trình 3N2Đ.', buildPagesForDeck('itinerary-3n2d', common.itemsBySection, common.imageUrls, common.libraryEntries, 'itinerary-main', common.globalUsedItemIds, common.globalUsedImageUrls))],
        },
        {
            id: 'itinerary-4n3d',
            navTitle: 'Lịch trình 4N3Đ',
            title: 'Bộ trang 4N3Đ kiểu travel journal',
            description: 'Format mới khác 3N2Đ: cover poster, route map, mỗi ngày có ảnh hero lớn và 5 stop nhỏ theo nhịp đi chậm.',
            lists: [buildDeckList('itinerary-4n3d', 'main', 'List chính', 'List lịch trình 4N3Đ', 'Danh sách ảnh chính cho bộ 4N3Đ thiết kế kiểu travel journal.', buildPagesForDeck('itinerary-4n3d', common.itemsBySection, common.imageUrls, common.libraryEntries, 'itinerary-4n3d-main', common.globalUsedItemIds, common.globalUsedImageUrls))],
        },
        {
            id: 'pov-3-day',
            navTitle: 'POV 3 ngày',
            title: 'Bộ trang POV 3 ngày vi vu khắp Đà Lạt',
            description: 'Format này bám sát photomode TikTok: cover mạnh, rồi chia theo nhóm điểm local như check-in free, cafe, ăn uống và dịch vụ cần lưu ý.',
            lists: [buildDeckList('pov-3-day', 'main', 'List chính', 'List POV 3 ngày', 'Danh sách ảnh chính cho bộ POV 3 ngày vi vu khắp Đà Lạt.', buildPagesForDeck('pov-3-day', common.itemsBySection, common.imageUrls, common.libraryEntries, 'pov-3-day-main', common.globalUsedItemIds, common.globalUsedImageUrls))],
        },
        {
            id: 'must-go',
            navTitle: 'Điểm không thể bỏ qua',
            title: 'Bộ trang các điểm không thể bỏ qua',
            description: 'Format này bám gần series must-go: cover mạnh, sau đó tách riêng điểm nổi tiếng, check-in free, cafe và lưu trú.',
            lists: [buildDeckList('must-go', 'main', 'List chính', 'List must-go', 'Danh sách ảnh chính cho bộ điểm không thể bỏ qua.', buildPagesForDeck('must-go', common.itemsBySection, common.imageUrls, common.libraryEntries, 'must-go-main', common.globalUsedItemIds, common.globalUsedImageUrls))],
        },
        {
            id: 'first-time',
            navTitle: 'Lưu ý cho người mới',
            title: 'Bộ trang dành cho người chuẩn bị đến Đà Lạt',
            description: 'Format này đi theo logic tư vấn trước chuyến đi: đi sớm, ăn gì, ngồi cafe ở đâu, check-in ở đâu và cần nhớ gì.',
            lists: [buildDeckList('first-time', 'main', 'List chính', 'List cho người mới', 'Danh sách ảnh chính cho bộ lưu ý người mới đến Đà Lạt.', buildPagesForDeck('first-time', common.itemsBySection, common.imageUrls, common.libraryEntries, 'first-time-main', common.globalUsedItemIds, common.globalUsedImageUrls))],
        },
        {
            id: 'grid-6',
            navTitle: 'Mẫu Lưới 6 Ô',
            title: 'Bộ trang bố cục lưới 2x3 (6 địa điểm)',
            description: 'Mẫu thiết kế mật độ thông tin cao, mỗi trang hiển thị 6 địa điểm theo dạng lưới 2 cột x 3 hàng.',
            lists: [buildDeckList('grid-6', 'main', 'List chính', 'List lưới 6 ô', 'Danh sách ảnh chính cho mẫu lưới 2x3.', buildPagesForDeck('grid-6', common.itemsBySection, common.imageUrls, common.libraryEntries, 'grid-6-main', common.globalUsedItemIds, common.globalUsedImageUrls))],
        },
        {
            id: 'grid-8',
            navTitle: 'Mẫu Lưới 8 Ô',
            title: 'Bộ trang bố cục lưới 2x4 (8 địa điểm)',
            description: 'Biến thể dày hơn của mẫu lưới 6 ô, mỗi trang hiển thị 8 dữ liệu ảnh cùng tên và vị trí ngắn để scan nhanh.',
            lists: [buildDeckList('grid-8', 'main', 'List chính', 'List lưới 8 ô', 'Danh sách ảnh chính cho mẫu lưới 2x4.', buildPagesForDeck('grid-8', common.itemsBySection, common.imageUrls, common.libraryEntries, 'grid-8-main', common.globalUsedItemIds, common.globalUsedImageUrls))],
        },
        {
            id: 'grid-4',
            navTitle: 'Mẫu Lưới 4 Ô',
            title: 'Bộ trang bố cục lưới 2x2 (4 địa điểm)',
            description: 'Biến thể từ mẫu lưới 6 ô, giữ cùng phong cách hiển thị nhưng mỗi trang chỉ còn 4 hình và cân bằng đối tác/không đối tác.',
            lists: [buildDeckList('grid-4', 'main', 'List chính', 'List lưới 4 ô', 'Danh sách ảnh chính cho mẫu lưới 2x2.', buildPagesForDeck('grid-4', common.itemsBySection, common.imageUrls, common.libraryEntries, 'grid-4-main', common.globalUsedItemIds, common.globalUsedImageUrls))],
        },
    ];
}
