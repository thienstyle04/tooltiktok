import type { CoverPage, DeckPage, GuideItem, ListPage, SectionKey, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { stableHash } from './image-resolver';
import { itemUsageKey } from './data-allocator';

export const THREADS_TOPLIST_ID = 'threads-toplist-dalat';
export const THREADS_TOPLIST_TEMPLATE_VERSION = 1;
export const THREADS_TOPLIST_CAPTION = 'Đà Lạt đi đâu cho đáng? Tui gom 15 chỗ vào list này nè ✍️ Lưu lại rồi cmt chỗ nào mấy ní muốn thêm nha 👇';

const sections: Array<{ title: string; keys: SectionKey[] }> = [
  { title: 'Quán ăn', keys: ['quan_an'] },
  { title: 'Cà phê', keys: ['cafe'] },
  { title: 'Check-in', keys: ['check_in', 'khu_du_lich', 'hoat_dong', 'dia_diem_lich_su'] },
];
const PLACES_PER_PAGE = 5;
const identity = (name: string): string => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');

/** Text-only venue pages; the cover uses a bundled, original local image. */
export function buildThreadsToplistPages(
  itemsBySection: WorkbookItemsBySection,
  seed: string,
  globalUsedItemIds?: Set<string>,
): DeckPage[] {
  const selectedNames = new Set<string>();
  const pages: ListPage[] = sections.map(({ title, keys }) => {
    const byName = new Map<string, GuideItem>();
    for (const key of keys) {
      for (const item of itemsBySection[key] || []) {
        if (!item.name?.trim() || !item.address?.trim()) continue;
        const normalized = identity(item.name);
        if (normalized && !byName.has(normalized)) byName.set(normalized, item);
      }
    }
    const pool = [...byName.values()].filter(item => !selectedNames.has(identity(item.name)));
    if (pool.length < PLACES_PER_PAGE) {
      throw new Error(`Top list Đà Lạt thiếu ${title}: cần ${PLACES_PER_PAGE} địa điểm có tên và địa chỉ, hiện có ${pool.length}. Hãy cập nhật dữ liệu.`);
    }
    pool.sort((a, b) => {
      const score = (item: GuideItem): number =>
        Number(Boolean(globalUsedItemIds?.has(itemUsageKey(item)))) * 2 + Number(!item.isPartner);
      return score(a) - score(b) || stableHash(`${seed}|${title}|${a.id}`) - stableHash(`${seed}|${title}|${b.id}`);
    });
    const chosen = pool.slice(0, PLACES_PER_PAGE);
    chosen.forEach(item => selectedNames.add(identity(item.name)));
    return {
      type: 'list', layoutVariant: 'threads-toplist-page', canvasPreset: 'tiktok-4x5',
      chipText: title, chipTone: 'slate', title, subtitle: '', backgroundImage: '',
      items: chosen.map(item => ({
        id: item.id, sourceKey: itemUsageKey(item), sourceSectionKey: item.sectionKey,
        label: '',
        name: item.name, rawName: item.name, metaPrimary: item.address.trim(), metaSecondary: '',
        imageUrl: '', imageMapped: false, imageSource: 'fallback' as const, imageNote: 'text-only', isPartner: item.isPartner,
      })),
    };
  });
  const cover: CoverPage = {
    type: 'cover', layoutVariant: 'threads-toplist-cover', canvasPreset: 'tiktok-4x5',
    title: 'Top list các địa điểm Đà Lạt', subtitle: '', backgroundImage: '/templates/threads-toplist-door.png', titlePlacement: 'center',
  };
  return [cover, ...pages];
}

/** Catalog-only preview, never used for a generated list. */
export function buildThreadsToplistExample(): DeckPage[] {
  const itemsBySection = {} as WorkbookItemsBySection;
  for (const sectionKey of ['quan_an', 'cafe', 'check_in'] as SectionKey[]) {
    itemsBySection[sectionKey] = Array.from({ length: PLACES_PER_PAGE }, (_, index) => ({
      id: `toplist-example-${sectionKey}-${index}`,
      name: `${sectionKey === 'quan_an' ? 'Quán ăn' : sectionKey === 'cafe' ? 'Quán cà phê' : 'Điểm check-in'} minh họa ${index + 1}`,
      address: 'Địa chỉ minh họa — cập nhật dữ liệu để tạo list thật', sectionKey, isPartner: false,
    } as GuideItem));
  }
  return buildThreadsToplistPages(itemsBySection, 'catalog-example').map(page =>
    page.type === 'cover' ? page : { ...page, subtitle: 'MẪU MINH HỌA · Chưa phải dữ liệu thực' });
}
