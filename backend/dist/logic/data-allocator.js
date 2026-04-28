"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataAllocator = void 0;
exports.itemUsageKey = itemUsageKey;
exports.itemNameUsageKey = itemNameUsageKey;
exports.hasItemKey = hasItemKey;
exports.markItemKey = markItemKey;
const image_resolver_1 = require("./image-resolver");
function itemUsageKey(item) {
    return item.imageMappingKey || [item.sectionKey, (0, image_resolver_1.normalizeText)(item.name), (0, image_resolver_1.normalizeText)(item.address)].join('|') || item.id;
}
function itemNameUsageKey(item) {
    return (0, image_resolver_1.normalizeText)(item.name);
}
function hasItemKey(keys, item) {
    return keys.has(item.id) || keys.has(itemUsageKey(item)) || keys.has(itemNameUsageKey(item));
}
function markItemKey(keys, item) {
    keys.add(item.id);
    keys.add(itemUsageKey(item));
    keys.add(itemNameUsageKey(item));
}
function addNormalizedKey(keys, value) {
    const raw = String(value ?? '').trim();
    if (!raw)
        return;
    keys.add(raw);
    const normalized = (0, image_resolver_1.normalizeText)(raw);
    if (normalized)
        keys.add(normalized);
}
class DataAllocator {
    constructor(initial) {
        this.itemIds = new Set((initial?.usedItemIds ?? []).filter(Boolean));
        this.imageUrls = new Set((initial?.usedImageUrls ?? []).filter(Boolean));
    }
    clone() {
        return new DataAllocator({
            usedItemIds: Array.from(this.itemIds),
            usedImageUrls: Array.from(this.imageUrls),
        });
    }
    merge(source) {
        source.itemIds.forEach((id) => this.itemIds.add(id));
        source.imageUrls.forEach((url) => this.markImageUrl(url));
    }
    markItem(item) {
        markItemKey(this.itemIds, item);
    }
    markImageUrl(url) {
        const cleanUrl = String(url ?? '').trim();
        if (cleanUrl)
            this.imageUrls.add(cleanUrl);
    }
    markPageItem(item) {
        addNormalizedKey(this.itemIds, item.id);
        addNormalizedKey(this.itemIds, item.rawName || item.name);
        this.markImageUrl(item.imageUrl);
    }
    markPages(pages) {
        pages.forEach((page) => {
            this.markImageUrl(page.backgroundImage);
            if (page.type !== 'list')
                return;
            page.items?.forEach((item) => this.markPageItem(item));
        });
    }
    snapshot() {
        return {
            usedItemIds: Array.from(this.itemIds),
            usedImageUrls: Array.from(this.imageUrls),
        };
    }
}
exports.DataAllocator = DataAllocator;
