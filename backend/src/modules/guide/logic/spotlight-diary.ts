import type { DeckPage, GuideItem, ListPage, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { stableHash } from './image-resolver';
import { hasItemKey, itemUsageKey } from './data-allocator';

export const DIARY_TEMPLATE_VERSION = 1;
export const DIARY_CAPTION = 'Một vài gợi ý quán ăn và cà phê ở Đà Lạt để mọi người lưu lại.';
export const DIARY_INTRO = 'Gợi ý vài địa điểm ở Đà Lạt cho mọi người nè';
export const DIARY_ORDER = ['quan_an', 'cafe', 'quan_an', 'cafe', 'quan_an', 'cafe', 'quan_an'] as const;

// A newline is the source author's boundary, not an uppercase letter in a name.
export function diaryDescriptionLines(raw: string): string[] {
  return [...new Set(String(raw || '').split(/\r\n|\r|\n/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean))]
    .filter(s => s.length <= 220 && !/[.!?…]+\s+[\p{L}\p{N}]/u.test(s))
    // Without per-image annotations, don't claim a particular dish is pictured.
    .filter(s => !/(?:^|[^\p{L}])(mì|lẩu|cơm|tokbokki|bánh|khoai|chân gà|hủ tiếu|pizza|steak|sushi|trà sữa|cà phê trứng|matcha|massage|gội đầu|ghế lười)(?=$|[^\p{L}])/iu.test(s));
}

export function diaryImageId(url: string): string {
  try { const parsed = new URL(url, 'http://localhost'); return parsed.pathname === '/assets/drive-file' ? parsed.searchParams.get('id') || '' : ''; } catch { return ''; }
}
export function diaryIdentity(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd').replace(/[^\p{L}\p{N}]/gu, '');
}
const identity = (item: GuideItem) => diaryIdentity(item.name);
function images(item: GuideItem): string[] {
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
  const pools = Object.fromEntries(['quan_an', 'cafe'].map(section => [section,
    (input.itemsBySection[section as 'quan_an' | 'cafe'] || []).filter(item => item.isPartner && item.name.trim() && item.imageSource !== 'fallback' && images(item).length && diaryDescriptionLines(item.diaryDescriptionRaw || '').length)
      .sort((a, b) => Number(hasItemKey(input.usedPlaces || new Set(), a)) - Number(hasItemKey(input.usedPlaces || new Set(), b)) || rank(a.id) - rank(b.id)),
  ])) as Record<'quan_an' | 'cafe', GuideItem[]>;
  for (const [group, required] of [['quan_an', 4], ['cafe', 3]] as const) {
    const count = new Set(pools[group].map(identity)).size;
    if (count < required) throw new Error(`Spotlight Nhật ký thiếu đối tác ${group === 'cafe' ? 'Cafe' : 'Quán ăn'} có ảnh và một dòng mô tả phù hợp (${count}/${required}).`);
  }
  const selected: { item: GuideItem; image: string }[] = [];
  const names = new Set<string>(), imageIds = new Set<string>();
  const deadEnds = new Set<string>();
  // Backtracking avoids consuming a cross-category venue/image needed by later slots.
  const choose = (index: number): boolean => {
    if (randomPool.filter(url => !imageIds.has(diaryImageId(url))).length < 3) return false;
    if (index === DIARY_ORDER.length) return true;
    const state = [index, [...names].sort().join('|'), [...imageIds].sort().join('|')].join(':');
    if (deadEnds.has(state)) return false;
    // Prune shortage before exploring permutations of the same impossible selection.
    for (const group of ['quan_an', 'cafe'] as const) {
      const need = DIARY_ORDER.slice(index).filter(key => key === group).length;
      const available = pools[group].filter(item => !names.has(identity(item)) && images(item).some(url => !imageIds.has(diaryImageId(url))));
      if (new Set(available.map(identity)).size < need) return false;
    }
    for (const item of pools[DIARY_ORDER[index]]) {
      const key = identity(item); if (names.has(key)) continue;
      for (const image of images(item).sort(sortImages)) {
        const id = diaryImageId(image); if (imageIds.has(id)) continue;
        names.add(key); imageIds.add(id); selected.push({ item, image });
        if (choose(index + 1)) return true;
        selected.pop(); imageIds.delete(id); names.delete(key);
      }
    }
    deadEnds.add(state);
    return false;
  };
  if (!choose(0)) throw new Error('Spotlight Nhật ký không đủ 4 Quán ăn + 3 Cafe có địa điểm và ảnh không trùng.');
  const backgrounds = randomPool.filter(url => !imageIds.has(diaryImageId(url))).slice(0, 3);
  const page = (image: string, title: string, items: ListPage['items'] = []): ListPage => ({
    type: 'list', title, subtitle: '', chipText: '', chipTone: 'slate', items, backgroundImage: image,
    layoutVariant: 'spotlight-v6-diary-page', titlePlacement: 'center', canvasPreset: 'tiktok-3x4',
  });
  return [
    { ...page(backgrounds[0], input.hook), titlePlacement: 'top-center' },
    page(backgrounds[1], ''), page(backgrounds[2], DIARY_INTRO),
    ...selected.map(({ item, image }) => {
      const lines = diaryDescriptionLines(item.diaryDescriptionRaw || '');
      const used = input.usedLines?.[identity(item)] || [];
      const available = lines.filter(line => !used.includes(line));
      const line = (available.length ? available : lines).sort((a, b) => rank(a) - rank(b))[0];
      return page(image, line, [{ id: item.id, sourceKey: itemUsageKey(item), sourceSectionKey: item.sectionKey,
        label: '', name: item.name, rawName: item.name, metaPrimary: item.address || '', metaSecondary: '',
        imageUrl: image, imageMapped: true, imageSource: item.imageSource, imageNote: '', candidateImageUrls: [image], isPartner: true }]);
    }),
  ];
}
