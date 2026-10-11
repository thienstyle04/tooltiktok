import type { DeckPage, GuideDeckList, GuideItem, ListPage, PageItem, PartnerRotationHistory, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { normalizeText, stableHash } from './image-resolver';
import { extractDriveFileIdFromProxyUrl, getCachedDriveFileVisualFingerprint, uniqueCachedDriveFileIdsByVisualContent } from '../sync/drive-images';

export const PARTNER_ROTATION_VERSION = 1;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export function partnerIdentity(item: Pick<GuideItem, 'name' | 'sectionKey'>): string {
  // XLSX and the selector identify a venue by normalized name. A venue listed
  // in both Quán ăn and Cà phê must not get two independent rotation histories.
  return `venue|${normalizeText(item.name)}`;
}

export function sourcePhotoId(url: string): string {
  if (!url) return '';
  // Preset URLs are render derivatives, never separate source photographs.
  try {
    const parsed = new URL(url, 'http://localhost');
    const source = parsed.searchParams.get('source') || parsed.searchParams.get('url');
    if (source && /color-edit|photo-preset/.test(parsed.pathname)) return sourcePhotoId(source);
    const id = extractDriveFileIdFromProxyUrl(url);
    if (id) return `drive:${id}`;
    return `${parsed.origin === 'http://localhost' ? '' : parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch { return url; }
}

// Stable source ID is authoritative even if the cache disappears. A content
// alias also prevents a re-upload of the same picture being counted as new.
function photoKeys(url: string): string[] {
  const id = sourcePhotoId(url), driveId = id.startsWith('drive:') ? id.slice(6) : '';
  const fingerprint = driveId ? getCachedDriveFileVisualFingerprint(driveId) : '';
  return fingerprint ? [id, `content:${fingerprint}`] : [id];
}

export function validateRotationStore(value: unknown): Record<string, PartnerRotationHistory> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Lịch sử luân phiên đối tác không hợp lệ; cần khôi phục file lưu trước khi tạo list.');
  for (const history of Object.values(value)) {
    if (!history || typeof history !== 'object' || Array.isArray(history)) throw new Error('Lịch sử luân phiên đối tác bị hỏng.');
    for (const state of Object.values(history) as any[]) {
      if (!state || !Number.isInteger(state.position) || state.position < 1 || !Number.isInteger(state.cycle) || state.cycle < 1
        || !Array.isArray(state.lastPhotos) || !Array.isArray(state.usedPhotos)
        || ![...state.lastPhotos, ...state.usedPhotos].every(id => typeof id === 'string')) throw new Error('Lịch sử vị trí/ảnh đối tác bị hỏng; chưa thể tạo list.');
    }
  }
  return clone(value as Record<string, PartnerRotationHistory>);
}

function ownPhotos(item: GuideItem): string[] {
  if (item.imageSource === 'fallback') return [];
  const seen = new Set<string>();
  const urls = [item.imageUrl, ...(item.candidateImageUrls || []), ...(item.diaryImageUrls || [])].filter(Boolean);
  const driveIds = urls.map(url => extractDriveFileIdFromProxyUrl(url)).filter(Boolean);
  const distinct = new Set(uniqueCachedDriveFileIdsByVisualContent(driveIds));
  return urls.filter(url => {
    const id = sourcePhotoId(url), driveId = extractDriveFileIdFromProxyUrl(url);
    if (!id || seen.has(id) || (driveId && !distinct.has(driveId))) return false;
    seen.add(id); return true;
  });
}

function venuePhotos(source: GuideItem, sources: GuideItem[]): string[] {
  const rows = sources.filter(item => partnerIdentity(item) === partnerIdentity(source));
  const urls = rows.flatMap(ownPhotos);
  return ownPhotos({ ...source, imageSource: urls.length ? 'manual' : 'fallback', imageUrl: urls[0] || '', candidateImageUrls: urls, diaryImageUrls: [] });
}

type Ref = { page: number; item: number };
type Unit = { key: string; source?: GuideItem; refs: Ref[]; position: number; partner: boolean; group: string; wholePages: number[] };

function sourceFor(item: PageItem, sources: GuideItem[]): GuideItem | undefined {
  const name = normalizeText(item.rawName || item.name);
  // Workbook row IDs can be reused after a Sheet reorder. Never let an old
  // saved row ID attribute its history to a different venue in the new Sheet.
  return sources.find(source => normalizeText(source.name) === name && (source.id === item.id || Boolean(item.sourceKey && (source.imageMappingKey === item.sourceKey))))
    || sources.find(source => normalizeText(source.name) === normalizeText(item.rawName || item.name)
      && (!item.sourceSectionKey || source.sectionKey === item.sourceSectionKey));
}

function keyFor(item: PageItem, source?: GuideItem): string {
  return source ? partnerIdentity(source) : `venue|${normalizeText(item.rawName || item.name)}`;
}

// Negative item indices address the background (-1) and coverImages (-2, -3,
// ...). These photos share a venue's cycle but never add a venue position.
function photoAt(pages: DeckPage[], ref: Ref): string {
  const page = pages[ref.page];
  if (ref.item === -1) return page.backgroundImage || '';
  if (ref.item < -1) return page.type === 'cover' ? page.coverImages?.[-ref.item - 2] || '' : '';
  return page.type === 'list' ? page.items[ref.item].imageUrl : '';
}

function extraPhotoRefs(pages: DeckPage[], source?: GuideItem, sources: GuideItem[] = []): Ref[] {
  if (!source) return [];
  const ids = new Set((sources.length ? venuePhotos(source, sources) : ownPhotos(source)).flatMap(photoKeys)), refs: Ref[] = [];
  const belongs = (url: string) => Boolean(url && photoKeys(url).some(id => ids.has(id)));
  pages.forEach((page, index) => {
    if (page.layoutVariant === 'spotlight-v6-map-page') return;
    if (belongs(page.backgroundImage || '')) refs.push({ page: index, item: -1 });
    if (page.type === 'cover') (page.coverImages || []).forEach((url, photo) => {
      if (belongs(url)) refs.push({ page: index, item: -2 - photo });
    });
  });
  return refs;
}

function slotRole(item: PageItem, timed: boolean): string {
  if (!timed) return '';
  const text = normalizeText(`${item.label || ''} ${item.metaSecondary || ''}`);
  const meal = ['an_sang', 'an_trua', 'an_toi'].find(role => text.includes(role)) || '';
  const activity = ['san_may', 'gui_do', 've_nghi', 'di_chup_hinh'].find(role => text.includes(role)) || '';
  const time = String(item.scheduleTime || item.label || '').match(/\b(\d{1,2}):\d{2}\b/);
  const hour = time ? Number(time[1]) : undefined;
  const period = hour === undefined ? '' : hour < 7 ? 'early' : hour < 11 ? 'morning' : hour < 16 ? 'noon' : hour < 20 ? 'evening' : 'night';
  return `${(item.label || '').replace(/Ngày\s*\d+/gi, 'Ngày').replace(/\d{1,2}:\d{2}/g, 'giờ')}:${meal}:${activity}:${period}`;
}

function unitsFor(pages: DeckPage[], deckId: string, sources: GuideItem[] = []): Unit[] {
  const units = new Map<string, Unit>();
  pages.forEach((page, pageIndex) => {
    if (page.type !== 'list' || page.layoutVariant === 'spotlight-v6-map-page' || page.layoutVariant === 'spotlight-partner-info') return;
    page.items.forEach((item, itemIndex) => {
      const source = sourceFor(item, sources);
      if (!source && (!item.rawName || !item.sourceSectionKey) && !item.isPartner) return;
      if (!source && /^(Tổng|Nghỉ|Quay lại)/i.test(item.label || '')) return;
      const key = keyFor(item, source);
      let unit = units.get(key);
      if (!unit) {
        unit = { key, source, refs: [], position: units.size + 1, partner: item.isPartner === true, group: '', wholePages: [] };
        units.set(key, unit);
      }
      unit.refs.push({ page: pageIndex, item: itemIndex });
      unit.partner ||= item.isPartner === true;
    });
  });
  const result = [...units.values()];
  const timed = /itinerary|journey|budget|pov/.test(deckId), itinerary = /itinerary|journey/.test(deckId);
  const pageRole = (ref: Ref, source?: GuideItem) => {
    const p = pages[ref.page] as ListPage, item = p.items[ref.item];
    return `${ref.page}:${p.layoutVariant || 'standard'}:${p.chipText}:${item.sourceSectionKey || source?.sectionKey}:${slotRole(item, timed)}`;
  };
  const statuses = new Map<string, Set<boolean>>();
  for (const unit of result) for (const ref of unit.refs) {
    const key = pageRole(ref, unit.source);
    statuses.set(key, new Set([...(statuses.get(key) || []), unit.partner]));
  }
  for (const unit of result) {
    const first = unit.refs[0], page = pages[first.page] as ListPage, item = page.items[first.item];
    const venuePages = [...new Set(unit.refs.map(ref => ref.page))];
    const whole = deckId.startsWith('spotlight') && venuePages.every(index => {
      const p = pages[index] as ListPage;
      return p.items.every(candidate => keyFor(candidate, sourceFor(candidate, sources)) === unit.key);
    });
    if (whole) {
      unit.wholePages = venuePages.flatMap(index => {
        const prior = pages[index - 1];
        return page.layoutVariant === 'spotlight-v6-map-place' && prior?.type === 'list'
          && prior.layoutVariant === 'spotlight-v6-map-page' ? [index - 1, index] : [index];
      });
      unit.group = `whole:${unit.wholePages.map(index => (pages[index] as ListPage).layoutVariant).join(',')}`;
    } else {
      // Keep fixed activity/time/day slots. Only names/images move, never the slot's role.
      const threads = deckId.startsWith('threads-') && deckId !== 'threads-toplist-dalat';
      // Threads keeps the partner/Local order. Cross-day itineraries keep per-day
      // partner quotas. A normal grid's partner can move into a regular's slot;
      // having only one partner does NOT make its position intrinsically fixed.
      const mixedThreads = deckId === 'threads-mix-local' || deckId === 'threads-mix-text';
      unit.group = unit.refs.map(ref => {
        const p = pages[ref.page] as ListPage, slot = p.items[ref.item];
        // A mixed page can move a partner into a regular's equivalent slot while
        // retaining its quota. Homogeneous day/meal groups can swap across days
        // without altering each day's partner count. Do not declare a singleton
        // exception merely because there is only one partner on a mixed grid.
        const crossDay = itinerary && statuses.get(pageRole(ref, unit.source))?.size === 1;
        const status = threads || crossDay ? `partner:${unit.partner}` : '';
        return `${crossDay ? '' : ref.page}:${p.layoutVariant || 'standard'}:${p.chipText.replace(/Ngày\s*\d+/gi, 'Ngày')}:${mixedThreads ? '' : slot.sourceSectionKey || unit.source?.sectionKey}:${slotRole(slot, timed)}:${status}`;
      }).join(';');
    }
  }
  return result;
}

export function bootstrapPartnerHistory(lists: GuideDeckList[], deckId: string, sources: GuideItem[], existing: PartnerRotationHistory = {}): PartnerRotationHistory {
  const history = clone(existing);
  // Persisted array order is creation order; the IDs are not sortable timestamps.
  for (const list of lists) {
    if (/-main$/i.test(list.id) || list.id === 'main') continue;
    for (const unit of unitsFor(list.pages, deckId, sources)) {
      if (!unit.partner || existing[unit.key]) continue;
      const photos = [...new Set([...unit.refs, ...extraPhotoRefs(list.pages, unit.source, sources)].flatMap(ref => photoAt(list.pages, ref) ? photoKeys(photoAt(list.pages, ref)) : []))];
      const previous = history[unit.key];
      history[unit.key] = { position: unit.position, lastPhotos: photos,
        usedPhotos: [...new Set([...(previous?.usedPhotos || []), ...photos])], cycle: previous?.cycle || 1 };
    }
  }
  return history;
}

export function restrictRotationPhotos(items: WorkbookItemsBySection, history: PartnerRotationHistory, optionalPhotos = false): WorkbookItemsBySection {
  const result = clone(items);
  const sources = Object.values(items).flat();
  for (const pool of Object.values(result)) for (const item of pool) {
    if (!item.isPartner) continue;
    const state = history[partnerIdentity(item)];
    if (!state?.lastPhotos.length) continue;
    const available = venuePhotos(item, sources).filter(url => !photoKeys(url).some(id => state.lastPhotos.includes(id)));
    // Optional Threads illustrations may be filled by Local; the TXT partner remains eligible.
    if (!available.length && optionalPhotos) { item.imageUrl = ''; item.candidateImageUrls = []; item.imageMapped = false; continue; }
    item.imageUrl = available[0] || '';
    item.candidateImageUrls = available;
    if (item.diaryImageUrls) item.diaryImageUrls = available;
  }
  if (!optionalPhotos) for (const key of Object.keys(result) as Array<keyof WorkbookItemsBySection>) {
    result[key] = result[key].filter(item => !item.isPartner || Boolean(item.imageUrl));
  }
  return result;
}

export function rotationPhotoShortage(items: WorkbookItemsBySection, history: PartnerRotationHistory): string {
  const sources = Object.values(items).flat();
  const blocked = sources.filter(item => item.isPartner && history[partnerIdentity(item)]?.lastPhotos.length
    && !venuePhotos(item, sources).some(url => !photoKeys(url).some(id => history[partnerIdentity(item)].lastPhotos.includes(id))));
  return blocked.length ? ` Đối tác chưa có ảnh khác lần trước: ${[...new Set(blocked.map(item => `${item.name} (${venuePhotos(item, sources).length} ảnh hợp lệ)`))].join(', ')}. Hãy bổ sung ảnh riêng.` : '';
}

export function visiblePartnerCount(pages: DeckPage[]): number {
  return new Set(pages.flatMap(page => page.type === 'list' ? page.items
    .filter(item => item.isPartner && Boolean(String(item.rawName || item.name).trim()))
    .map(item => normalizeText(item.rawName || item.name)) : [])).size;
}

export function partnerSlotCount(pages: DeckPage[]): number {
  return pages.reduce((count, page) => count + (page.type === 'list' ? page.items.filter(item => item.isPartner).length : 0), 0);
}

export function requiredPartnerCount(deckId: string, items: WorkbookItemsBySection, baseline: DeckPage[]): number {
  if (['spotlight-v4', 'spotlight-v6', 'spotlight-v6-maps'].includes(deckId)) return 4;
  if (deckId === 'spotlight-v5') return 7;
  if (deckId === 'spotlight-v6-diary') return 9;
  if (['itinerary-note-2days', 'itinerary-note-dark', 'itinerary-note-timed'].includes(deckId)) return 7;
  if (deckId === 'threads-mix-local' || deckId === 'one-way-story') return 5;
  if (deckId === 'threads-mix-text') return 6;
  if (deckId === 'spotlight-v6-persimmon') return Math.max(1, visiblePartnerCount(baseline));
  if (deckId === 'threads-food-local' || deckId === 'threads-cafe-local') {
    const pool = items[deckId === 'threads-cafe-local' ? 'cafe' : 'quan_an'] || [];
    return Math.max(1, Math.min(5, new Set(pool.filter(item => item.isPartner && item.address.trim()).map(item => normalizeText(item.name))).size));
  }
  if (deckId === 'summary-note') return Math.max(1, ['quan_an', 'cafe'].reduce((sum, key) => sum + Math.min(2,
    new Set((items[key as keyof WorkbookItemsBySection] || []).filter(item => item.isPartner && item.address.trim()).map(item => normalizeText(item.name))).size), 0));
  // Other builders retain their category/page quotas. Their unique-name total can
  // vary legitimately (e.g. a venue also appears in a budget gallery); it is not
  // a quota and must not be frozen to a random baseline's unique-name count.
  return 1;
}

export function rotatePartnerList(input: GuideDeckList, deckId: string, items: WorkbookItemsBySection,
  previous: PartnerRotationHistory, seed: string, requiredPartners = 1, requiredSlots = requiredPartners): { list: GuideDeckList; history: PartnerRotationHistory } {
  const list = clone(input), history = clone(previous), sources = Object.values(items).flat();
  // Information rows are labels (address/hours/price), not extra partner venues.
  // Only the new list is normalized; old saved lists remain untouched.
  if (deckId === 'spotlight-partner') for (const page of list.pages) if (page.type === 'list' && page.layoutVariant === 'spotlight-partner-info') {
    page.items.forEach(item => { item.isPartner = false; });
  }
  const units = unitsFor(list.pages, deckId, sources), warnings: string[] = [];
  if (visiblePartnerCount(list.pages) < requiredPartners) throw new Error(`${deckId}: cần ít nhất ${requiredPartners} đối tác hợp lệ; hiện có ${visiblePartnerCount(list.pages)}. Hãy bổ sung đối tác đúng nhóm, không giảm tỷ lệ để tạo list.`);
  if (partnerSlotCount(list.pages) < requiredSlots) throw new Error(`${deckId}: chỉ có ${partnerSlotCount(list.pages)}/${requiredSlots} ô đối tác theo quy tắc mẫu. Không giảm tỷ lệ; hãy bổ sung ảnh/đối tác đúng nhóm.`);
  const groups = new Map<string, Unit[]>();
  units.forEach(unit => groups.set(unit.group, [...(groups.get(unit.group) || []), unit]));
  const originalPages = clone(list.pages);
  for (const group of groups.values()) {
    const owner = new Map<number, number>(), destinations = new Map<number, number>();
    const assign = (index: number, seen: Set<number>): boolean => {
      const unit = group[index], lastPosition = history[unit.key]?.position;
      const slots = group.map((target, slot) => ({ target, slot })).filter(({ target }) =>
        !unit.partner || lastPosition === undefined || target.position !== lastPosition || group.length === 1)
        .sort((a, b) => stableHash(`${seed}:${unit.key}:${a.target.position}`) - stableHash(`${seed}:${unit.key}:${b.target.position}`));
      for (const { slot } of slots) {
        if (seen.has(slot)) continue;
        seen.add(slot);
        const occupied = owner.get(slot);
        if (occupied === undefined || assign(occupied, seen)) { owner.set(slot, index); destinations.set(index, slot); return true; }
      }
      return false;
    };
    for (let index = 0; index < group.length; index++) {
      if (!assign(index, new Set())) throw new Error(`${deckId}: chưa thể đổi vị trí đối tác “${group[index].source?.name || group[index].key}” trong các vị trí hợp lệ. Chưa lưu list; hãy bổ sung đối tác đúng nhóm.`);
    }
    group.forEach((unit, index) => {
      const target = group[destinations.get(index)!];
      if (unit.partner && history[unit.key]?.position === target.position && group.length === 1) {
        warnings.push(`Đối tác “${unit.source?.name || (originalPages[unit.refs[0].page] as ListPage).items[unit.refs[0].item].rawName}” giữ vị trí ${target.position}: mẫu chỉ có một vị trí phù hợp.`);
      }
      if (unit.wholePages.length) unit.wholePages.forEach((pageIndex, offset) => {
        list.pages[target.wholePages[offset]] = clone(originalPages[pageIndex]);
      });
      else unit.refs.forEach((ref, offset) => {
        const to = target.refs[offset], sourceItem = (originalPages[ref.page] as ListPage).items[ref.item];
        const slotItem = (originalPages[to.page] as ListPage).items[to.item];
        const moved = { ...clone(sourceItem), label: deckId.startsWith('threads-') ? sourceItem.label : slotItem.label };
        if (slotItem.scheduleTime !== undefined) moved.scheduleTime = slotItem.scheduleTime; else delete moved.scheduleTime;
        (list.pages[to.page] as ListPage).items[to.item] = moved;
      });
    });
  }
  const rotated = unitsFor(list.pages, deckId, sources);
  const usedInList = new Set(rotated.filter(unit => !unit.partner).flatMap(unit => unit.refs.flatMap(ref => {
    const page = list.pages[ref.page] as ListPage;
    return page.items[ref.item].imageUrl ? photoKeys(page.items[ref.item].imageUrl) : [];
  })));
  type PhotoRequest = { key: string; refs: Ref[]; choices: string[] };
  const requests: PhotoRequest[] = [];
  const photoStates = new Map<string, { unit: Unit; pool: string[]; old: PartnerRotationHistory[string]; used: Set<string> }>();
  for (const unit of rotated) {
    if (!unit.partner) continue;
    const old = history[unit.key] || { position: unit.position, lastPhotos: [], usedPhotos: [], cycle: 1 };
    const source = unit.source;
    const pool = source ? venuePhotos(source, sources) : [];
    const refsByPhoto = new Map<string, Ref[]>();
    for (const ref of [...unit.refs, ...extraPhotoRefs(list.pages, source, sources)]) {
      const url = photoAt(list.pages, ref);
      if (url) refsByPhoto.set(sourcePhotoId(url), [...(refsByPhoto.get(sourcePhotoId(url)) || []), ref]);
    }
    const validIds = new Set(pool.flatMap(photoKeys));
    const used = new Set(old.usedPhotos.filter(id => validIds.has(id)));
    const fresh = pool.filter(url => !photoKeys(url).some(id => used.has(id)));
    const available = (urls: string[]) => urls.filter(url => !photoKeys(url).some(id => old.lastPhotos.includes(id) || usedInList.has(id)))
      .sort((a, b) => stableHash(`${seed}:${unit.key}:${sourcePhotoId(a)}`) - stableHash(`${seed}:${unit.key}:${sourcePhotoId(b)}`));
    // The first slots consume all remaining unused photographs before any slot
    // may open a new cycle. Global matching prevents a greedy choice for A from
    // stealing the only valid photo of B when A has another option.
    [...refsByPhoto.values()].forEach((refs, index) => requests.push({ key: unit.key, refs,
      choices: available(index < fresh.length ? fresh : pool) }));
    photoStates.set(unit.key, { unit, pool, old, used });
  }
  const photoOwner = new Map<string, number>(), chosen = new Map<number, string>();
  const contentId = (url: string) => { const keys = photoKeys(url); return keys[keys.length - 1]; };
  const assignPhoto = (index: number, seen: Set<string>): boolean => {
    for (const url of requests[index].choices) {
      const key = contentId(url);
      if (seen.has(key)) continue;
      seen.add(key);
      const occupied = photoOwner.get(key);
      if (occupied === undefined || assignPhoto(occupied, seen)) { photoOwner.set(key, index); chosen.set(index, url); return true; }
    }
    return false;
  };
  for (const index of requests.map((_, index) => index).sort((a, b) => requests[a].choices.length - requests[b].choices.length)) {
    if (!assignPhoto(index, new Set())) {
      const state = photoStates.get(requests[index].key)!;
      throw new Error(`${deckId}: đối tác “${state.unit.source?.name || state.unit.key}” có ${state.pool.length} ảnh hợp lệ, không đủ ảnh khác lần xuất hiện trước để luân phiên. Chưa lưu list; hãy bổ sung ảnh riêng cho đối tác.`);
    }
  }
  for (const { unit, pool, old, used: initialUsed } of photoStates.values()) {
    let used = initialUsed, cycle = old.cycle;
    const selected: string[] = [];
    requests.forEach((request, index) => {
      if (request.key !== unit.key) return;
      if (pool.every(url => photoKeys(url).some(id => used.has(id)))) { used = new Set(); cycle++; }
      const url = chosen.get(index)!, ids = photoKeys(url);
      selected.push(...ids); ids.forEach(id => used.add(id));
      for (const ref of request.refs) {
        const page = list.pages[ref.page];
        if (ref.item === -1) { page.backgroundImage = url; continue; }
        if (ref.item < -1) { if (page.type === 'cover' && page.coverImages) page.coverImages[-ref.item - 2] = url; continue; }
        if (page.type !== 'list') continue;
        const item = page.items[ref.item];
        item.imageUrl = url; item.candidateImageUrls = pool; item.imageMapped = true; item.imageSource = unit.source!.imageSource;
      }
    });
    history[unit.key] = { position: unit.position, lastPhotos: selected, usedPhotos: [...used], cycle };
  }
  list.partnerRotationVersion = PARTNER_ROTATION_VERSION;
  list.warnings = [...new Set([...(list.warnings || []), ...warnings])];
  return { list, history };
}
