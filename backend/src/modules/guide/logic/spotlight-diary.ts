import type { DeckPage, GuideItem, ListPage, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { stableHash } from './image-resolver';
import { hasItemKey, itemUsageKey } from './data-allocator';
import { requiredPartnerKey, requiredPartnerKeys, requiredPartnerRank, requiredPartnersSatisfied, requiredSearchBudget } from './required-partners';

export const DIARY_TEMPLATE_VERSION = 1;
export const DIARY_CAPTION = 'Một vài gợi ý quán ăn và cà phê ở Đà Lạt để mọi người lưu lại.';
export const DIARY_INTRO = 'Gợi ý vài địa điểm ở Đà Lạt cho mọi người nè';
export const DIARY_ORDER = ['quan_an', 'cafe', 'quan_an', 'cafe', 'quan_an', 'cafe', 'quan_an', 'cafe', 'check_in'] as const;
export const DIARY_PAGE_COUNT = 3 + DIARY_ORDER.length;
export const DIARY_PARTNER_COUNT = 8;
const DIARY_SEARCH_LIMIT = 150_000;
const DIARY_GROUPS = ['quan_an', 'cafe', 'check_in'] as const;
const GROUP_LABELS = { quan_an: 'Quán ăn', cafe: 'Cafe', check_in: 'Check-in' };

// A newline is the source author's boundary, not an uppercase letter in a name.
export function diaryDescriptionLines(raw: string): string[] {
  return [...new Set(String(raw || '').split(/\r\n|\r|\n/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean))]
    .filter(s => s.length <= 220 && !/[.!?…]+\s+[\p{L}\p{N}]/u.test(s))
    // Without per-image annotations, don't claim a particular dish is pictured.
    .filter(s => !/(?:^|[^\p{L}])(mì|lẩu|cơm|tokbokki|bánh|khoai|chân gà|hủ tiếu|pizza|steak|sushi|trà sữa|cà phê trứng|matcha|massage|gội đầu|ghế lười)(?=$|[^\p{L}])/iu.test(s));
}

/** Dòng chữ của một địa điểm: mô tả Mo_ta dùng được; không có thì lấy tên + địa chỉ. */
export function diaryItemLines(item: Pick<GuideItem, 'name' | 'address' | 'diaryDescriptionRaw'>): string[] {
  const lines = diaryDescriptionLines(item.diaryDescriptionRaw || '');
  if (lines.length) return lines;
  const name = String(item.name || '').replace(/\s+/g, ' ').trim(), address = String(item.address || '').replace(/\s+/g, ' ').trim();
  return name ? [address ? `${name} - ${address}` : name] : [];
}
const hasOwnDescription = (item: GuideItem) => diaryDescriptionLines(item.diaryDescriptionRaw || '').length > 0;

// Pure string functions called inside the backtracking search; parsing a URL or
// normalizing a name on every step made an infeasible search take minutes.
const imageIdCache = new Map<string, string>(), identityCache = new Map<string, string>();
function remember(cache: Map<string, string>, key: string, compute: () => string): string {
  let value = cache.get(key);
  if (value === undefined) { if (cache.size > 50_000) cache.clear(); value = compute(); cache.set(key, value); }
  return value;
}
export function diaryImageId(url: string): string {
  return remember(imageIdCache, String(url ?? ''), () => {
    try { const parsed = new URL(url, 'http://localhost'); return parsed.pathname === '/assets/drive-file' ? parsed.searchParams.get('id') || '' : ''; } catch { return ''; }
  });
}
export function diaryIdentity(name: string): string {
  return remember(identityCache, name, () => name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd').replace(/[^\p{L}\p{N}]/gu, ''));
}
const identity = (item: GuideItem) => diaryIdentity(item.name);
function diaryItemImages(item: GuideItem): string[] {
  const found = new Map<string, string>();
  for (const url of item.diaryImageUrls ?? [item.imageUrl, ...(item.candidateImageUrls || [])]) { const id = diaryImageId(url); if (id) found.set(id, url); }
  return [...found.values()];
}
export interface DiaryInput {
  destinationId: string;
  itemsBySection: WorkbookItemsBySection;
  randomImages: string[];
  hook: string;
  seed: string;
  usedImages?: Set<string>;
  usedPlaces?: Set<string>;
  usedLines?: Record<string, string[]>;
}

export function buildDiaryPages(input: DiaryInput): DeckPage[] {
  if (input.destinationId !== 'dalat') throw new Error('Spotlight Nhật ký chỉ dành cho Đà Lạt.');
  if (!input.hook.trim()) throw new Error('Spotlight Nhật ký chưa có hook chung.');
  const rank = (key: string) => stableHash(input.seed + key);
  const usedImages = new Set([...(input.usedImages || [])].map(diaryImageId));
  const sortImages = (a: string, b: string) => Number(usedImages.has(diaryImageId(a))) - Number(usedImages.has(diaryImageId(b))) || rank(a) - rank(b);
  const randomPool = [...new Map(input.randomImages.filter(diaryImageId).map(url => [diaryImageId(url), url])).values()].sort(sortImages);
  if (randomPool.length < 3) throw new Error(`Spotlight Nhật ký thiếu ảnh Random (${randomPool.length}/3).`);
  // Per build only: the service may filter an item's photos between builds.
  const imageCache = new Map<GuideItem, string[]>();
  const images = (item: GuideItem): string[] => {
    let found = imageCache.get(item);
    if (!found) imageCache.set(item, found = diaryItemImages(item));
    return found;
  };
  const pools = Object.fromEntries(DIARY_GROUPS.map(section => [section,
    (input.itemsBySection[section] || []).filter(item => (section === 'check_in' || item.isPartner) && item.name.trim() && item.imageSource !== 'fallback' && images(item).length && diaryItemLines(item).length)
      // Ưu tiên địa điểm có mô tả Mo_ta thật; địa điểm chỉ có tên + địa chỉ dùng khi cần.
      .sort((a, b) => requiredPartnerRank(a) - requiredPartnerRank(b) || Number(hasOwnDescription(b)) - Number(hasOwnDescription(a))
        || Number(hasItemKey(input.usedPlaces || new Set(), a)) - Number(hasItemKey(input.usedPlaces || new Set(), b)) || rank(a.id) - rank(b.id)),
  ])) as Record<typeof DIARY_GROUPS[number], GuideItem[]>;
  for (const group of DIARY_GROUPS) {
    const required = DIARY_ORDER.filter(section => section === group).length;
    const count = new Set(pools[group].map(identity)).size;
    if (count < required) throw new Error(`Spotlight Nhật ký thiếu ${group === 'check_in' ? 'địa điểm' : 'đối tác'} ${GROUP_LABELS[group]} có ảnh (${count}/${required}).`);
  }
  // Mọi tổ hợp nhóm phải có đủ địa điểm KHÁC NHAU cho số ô của chúng (một địa điểm có ở nhiều nhóm chỉ tính
  // một lần). Thiếu thì pha 1 không thể thành công: bỏ qua, sang pha 2 cho phép địa điểm đó ở cả hai nhóm.
  const distinctShortage = (): string => {
    const groupSets = [1, 2, 3, 4, 5, 6, 7].map(mask => DIARY_GROUPS.filter((_, index) => mask & (1 << index)))
      .sort((a, b) => a.length - b.length);
    for (const groups of groupSets) {
      const need = DIARY_ORDER.filter(key => groups.includes(key)).length;
      const distinct = new Set(groups.flatMap(group => pools[group].map(identity))).size;
      if (distinct >= need) continue;
      const groupsOf = (key: string) => DIARY_GROUPS.filter(group => pools[group].some(item => identity(item) === key));
      const shared = [...new Map(groups.flatMap(group => pools[group].map(item => [identity(item), item.name] as const))).entries()]
        .filter(([key]) => groupsOf(key).length > 1).map(([key, name]) => `${name} (${groupsOf(key).map(group => GROUP_LABELS[group]).join(' + ')})`);
      return ` Chỉ có ${distinct}/${need} địa điểm không trùng cho ${groups.map(group => GROUP_LABELS[group]).join(' + ')}`
        + (shared.length ? `; có ở nhiều nhóm: ${shared.join(', ')}` : '') + '.';
    }
    return '';
  };
  // A required partner outside every diary pool can never be placed: fail fast
  // instead of exhausting the whole backtracking space.
  const requiredKeys = requiredPartnerKeys();
  const requiredGroups = new Map(requiredKeys.map(key => [key, DIARY_GROUPS.filter(group => pools[group].some(item => requiredPartnerKey(item.name) === key))]));
  const unplaceable = requiredKeys.filter(key => !requiredGroups.get(key)!.length);
  if (unplaceable.length) throw new Error('Spotlight Nhật ký: đối tác bắt buộc chưa đủ điều kiện (cần là đối tác Quán ăn/Cafe có ảnh).');
  const selected: { item: GuideItem; image: string }[] = [];
  const names = new Set<string>(), imageIds = new Set<string>();
  const deadEnds = new Set<string>();
  // Pha 1: mỗi địa điểm một lần. Pha 2: một địa điểm được ở mỗi nhóm một lần (ví dụ quán có cả Quán ăn
  // và Cafe), ảnh vẫn không trùng trong list.
  let slotKey = (item: GuideItem, _group: string) => identity(item);
  let relaxed = false;
  // Pha 2 chỉ cho trùng giữa Quán ăn và Cafe; ô Check-in (địa điểm thường) không trùng quán đã dùng.
  const taken = (item: GuideItem, group: string): boolean => names.has(slotKey(item, group)) || (relaxed && (group === 'check_in'
    ? names.has(`quan_an:${identity(item)}`) || names.has(`cafe:${identity(item)}`)
    : names.has(`check_in:${identity(item)}`)));
  // Backtracking avoids consuming a cross-category venue/image needed by later slots.
  // Feasible data is found within a few dozen steps; an impossible pool used to
  // be searched exhaustively (~750k steps, minutes at startup). Bound it: the
  // outcome ("không đủ") is the same, only reached quickly.
  let steps = 0, exhausted = false;
  const budget = Math.min(requiredSearchBudget(), DIARY_SEARCH_LIMIT);
  const choose = (index: number): boolean => {
    if (++steps > budget) { exhausted = true; return false; }
    if (randomPool.filter(url => !imageIds.has(diaryImageId(url))).length < 3) return false;
    if (index === DIARY_ORDER.length) return requiredPartnersSatisfied(selected.map(entry => entry.item));
    const state = [index, [...names].sort().join('|'), [...imageIds].sort().join('|')].join(':');
    if (deadEnds.has(state)) return false;
    // Every still-missing required partner needs a remaining slot of its group.
    if (requiredKeys.length) {
      const placed = new Set(selected.map(entry => requiredPartnerKey(entry.item.name)));
      const remaining = DIARY_ORDER.slice(index);
      for (const key of requiredKeys) if (!placed.has(key) && !requiredGroups.get(key)!.some(group => remaining.includes(group))) return false;
    }
    // Prune shortage before exploring permutations of the same impossible selection.
    for (const group of DIARY_GROUPS) {
      const need = DIARY_ORDER.slice(index).filter(key => key === group).length;
      const available = pools[group].filter(item => !taken(item, group) && images(item).some(url => !imageIds.has(diaryImageId(url))));
      if (new Set(available.map(item => slotKey(item, group))).size < need) return false;
    }
    const group = DIARY_ORDER[index];
    for (const item of pools[group]) {
      if (taken(item, group)) continue;
      const key = slotKey(item, group);
      for (const image of [...images(item)].sort(sortImages)) {
        const id = diaryImageId(image); if (imageIds.has(id)) continue;
        names.add(key); imageIds.add(id); selected.push({ item, image });
        if (choose(index + 1)) return true;
        selected.pop(); imageIds.delete(id); names.delete(key);
      }
    }
    deadEnds.add(state);
    return false;
  };
  const shortage = distinctShortage();
  let found = !shortage && choose(0);
  if (!found && !(exhausted && requiredKeys.length)) {
    slotKey = (item, group) => `${group}:${identity(item)}`; relaxed = true;
    selected.length = 0; names.clear(); imageIds.clear(); deadEnds.clear(); steps = 0; exhausted = false;
    found = choose(0);
  }
  if (!found) throw new Error(exhausted && requiredKeys.length
    ? 'Spotlight Nhật ký: không tìm được phương án có đủ đối tác bắt buộc (4 Quán ăn + 4 Cafe + 1 Check-in, ảnh không trùng).'
    : `Spotlight Nhật ký không đủ 4 đối tác Quán ăn + 4 đối tác Cafe + 1 Check-in có ảnh không trùng.${shortage}`);
  const backgrounds = randomPool.filter(url => !imageIds.has(diaryImageId(url))).slice(0, 3);
  const page = (image: string, title: string, items: ListPage['items'] = []): ListPage => ({
    type: 'list', title, subtitle: '', chipText: '', chipTone: 'slate', items, backgroundImage: image,
    layoutVariant: 'spotlight-v6-diary-page', titlePlacement: 'center', canvasPreset: 'tiktok-3x4',
  });
  // Một địa điểm xuất hiện hai lần (pha 2) không lặp cùng một dòng chữ khi còn dòng khác.
  const linesInList = new Map<string, string[]>();
  return [
    { ...page(backgrounds[0], input.hook), titlePlacement: 'top-center' },
    page(backgrounds[1], ''), page(backgrounds[2], DIARY_INTRO),
    ...selected.map(({ item, image }) => {
      const lines = diaryItemLines(item);
      const taken = linesInList.get(identity(item)) || [];
      const fresh = lines.filter(line => !taken.includes(line));
      const pool = fresh.length ? fresh : lines;
      const used = input.usedLines?.[identity(item)] || [];
      const available = pool.filter(line => !used.includes(line));
      // Hết câu chưa dùng thì quay vòng, nhưng không lặp đúng câu của list liền trước.
      const notLast = pool.filter(line => line !== used[used.length - 1]);
      const line = (available.length ? available : notLast.length ? notLast : pool).sort((a, b) => rank(a) - rank(b))[0];
      linesInList.set(identity(item), [...taken, line]);
      return page(image, line, [{ id: item.id, sourceKey: itemUsageKey(item), sourceSectionKey: item.sectionKey,
        label: '', name: item.name, rawName: item.name, metaPrimary: item.address || '', metaSecondary: '',
        imageUrl: image, imageMapped: true, imageSource: item.imageSource, imageNote: '', candidateImageUrls: [image], isPartner: Boolean(item.isPartner) }]);
    }),
  ];
}
