import { DeckPage, GuideItem, PageItem } from '../core/types';
import { normalizeText } from './image-resolver';

export interface DataAllocatorSnapshot {
  usedItemIds: string[];
  usedImageUrls: string[];
}

export function itemUsageKey(item: GuideItem): string {
  return item.imageMappingKey || [item.sectionKey, normalizeText(item.name), normalizeText(item.address)].join('|') || item.id;
}

export function itemNameUsageKey(item: GuideItem): string {
  return normalizeText(item.name);
}

export function hasItemKey(keys: Set<string>, item: GuideItem): boolean {
  return keys.has(item.id) || keys.has(itemUsageKey(item)) || keys.has(itemNameUsageKey(item));
}

export function markItemKey(keys: Set<string>, item: GuideItem): void {
  keys.add(item.id);
  keys.add(itemUsageKey(item));
  keys.add(itemNameUsageKey(item));
}

function addNormalizedKey(keys: Set<string>, value?: string): void {
  const raw = String(value ?? '').trim();
  if (!raw) return;
  keys.add(raw);
  const normalized = normalizeText(raw);
  if (normalized) keys.add(normalized);
}

export class DataAllocator {
  readonly itemIds: Set<string>;
  readonly imageUrls: Set<string>;

  constructor(initial?: Partial<DataAllocatorSnapshot>) {
    this.itemIds = new Set((initial?.usedItemIds ?? []).filter(Boolean));
    this.imageUrls = new Set((initial?.usedImageUrls ?? []).filter(Boolean));
  }

  clone(): DataAllocator {
    return new DataAllocator({
      usedItemIds: Array.from(this.itemIds),
      usedImageUrls: Array.from(this.imageUrls),
    });
  }

  merge(source: DataAllocator): void {
    source.itemIds.forEach((id) => this.itemIds.add(id));
    source.imageUrls.forEach((url) => this.markImageUrl(url));
  }

  markItem(item: GuideItem): void {
    markItemKey(this.itemIds, item);
  }

  markImageUrl(url?: string): void {
    const cleanUrl = String(url ?? '').trim();
    if (cleanUrl) this.imageUrls.add(cleanUrl);
  }

  markPageItem(item: PageItem): void {
    addNormalizedKey(this.itemIds, item.id);
    addNormalizedKey(this.itemIds, item.rawName || item.name);
    this.markImageUrl(item.imageUrl);
  }

  markPages(pages: DeckPage[]): void {
    pages.forEach((page) => {
      this.markImageUrl(page.backgroundImage);
      if (page.type !== 'list') return;
      page.items?.forEach((item) => this.markPageItem(item));
    });
  }

  snapshot(): DataAllocatorSnapshot {
    return {
      usedItemIds: Array.from(this.itemIds),
      usedImageUrls: Array.from(this.imageUrls),
    };
  }
}
