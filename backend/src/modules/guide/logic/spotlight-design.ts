import type { GuideDeckList, TitlePlacement } from '../../../common/interfaces/guide.types';
import catalog from '../config/spotlight-cover-labels.json';

export const SPOTLIGHT_DESIGN_DECKS = ['spotlight-guide', 'spotlight-v2', 'spotlight-v3', 'spotlight-v4', 'spotlight-v5', 'spotlight-v5-color-edit'];
export interface CoverLabel { place: string | null; topics: string[]; titlePlacement?: TitlePlacement }
export function coverSourceId(source: string): string {
  try {
    const url = new URL(source, 'http://local');
    const id = url.searchParams.get('id') || url.pathname.match(/\/file\/d\/([^/]+)/)?.[1];
    if (id && (url.pathname === '/assets/drive-file' || /drive\.google\.com$/.test(url.hostname))) return `drive:${id}`;
    return `${url.origin === 'http://local' ? '' : url.origin}${url.pathname}`;
  } catch { return source; }
}
export function spotlightHookTopic(hook: string): string | null {
  const text = hook.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
  if (/dia diem xanh|rung thong|giua rung|mang xanh/.test(text)) return 'green';
  if (/choi dem|ve dem|di dem/.test(text)) return 'night';
  if (/an gi|quan an|an uong|mon ngon/.test(text)) return 'food';
  if (/ca phe|cafe|coffee/.test(text)) return 'cafe';
  if (/homestay|luu tru|khach san/.test(text)) return 'stay';
  if (/pho phuong|pho thi|giua pho/.test(text)) return 'city';
  return null;
}
// Labels are editorial data, never inferred from pixels/file names.
export function prepareSpotlightDesign(list: GuideDeckList, deckId: string, pool: string[], labels: Record<string, CoverLabel> = catalog.images): GuideDeckList {
  if (!SPOTLIGHT_DESIGN_DECKS.includes(deckId)) return list;
  const cover = list.pages.find(p => p.type === 'cover');
  if (!cover || cover.type !== 'cover') return list;
  const topic = spotlightHookTopic(cover.title);
  const urls = [...new Map([...pool, ...(cover.coverImages || []), cover.backgroundImage].filter(Boolean).map(url => [coverSourceId(url), url])).values()];
  const backgroundIds = new Set(list.pages.filter(page => page.layoutVariant === 'spotlight-v4-image').map(page => coverSourceId(page.backgroundImage)));
  // The new V5 copy must not reselect the playlist/venue photo as its cover.
  // Keep legacy V5 selection untouched for compatibility.
  if (deckId === 'spotlight-v5-color-edit') for (const page of list.pages) {
    if (page !== cover && page.backgroundImage) backgroundIds.add(coverSourceId(page.backgroundImage));
  }
  const eligible = urls.filter(url => !backgroundIds.has(coverSourceId(url)));
  const candidates = topic ? eligible.filter(url => labels[coverSourceId(url)]?.topics.includes(topic)) : eligible;
  const selected: string[] = [], places = new Set<string>();
  const count = deckId === 'spotlight-v2' ? 4 : 1;
  const rank = (url: string) => { let n = 0; for (const ch of list.id + coverSourceId(url)) n = (n * 31 + ch.charCodeAt(0)) >>> 0; return n; };
  const ordered = [...candidates].sort((a, b) => rank(a) - rank(b));
  for (const url of ordered) {
    const place = labels[coverSourceId(url)]?.place;
    if (!place || places.has(place)) continue;
    selected.push(url); places.add(place);
    if (selected.length === count) break;
  }
  for (const url of ordered) { if (selected.length >= count) break; if (!selected.includes(url)) selected.push(url); }
  const warnings: string[] = [];
  if (topic && selected.length === 0) warnings.push('Chưa có ảnh bìa được gắn nhãn phù hợp với hook. Chọn ảnh đã xác nhận hoặc đổi hook trước khi xuất.');
  if (count === 4 && places.size < 4) warnings.push('Chưa xác nhận đủ 4 địa điểm khác nhau cho ảnh bìa; hãy kiểm tra ảnh ghép trước khi xuất.');
  const pages = list.pages.map(page => ({ ...page, spotlightDesignRevision: 1 as const }));
  const nextCover = pages.find(p => p.type === 'cover')! as typeof cover;
  if (selected.length) { nextCover.coverImages = selected; nextCover.backgroundImage = selected[0]; }
  nextCover.titlePlacement = labels[coverSourceId(nextCover.backgroundImage)]?.titlePlacement
    || (deckId === 'spotlight-v3' ? 'top-center' : deckId === 'spotlight-v4' || deckId === 'spotlight-v2' ? 'center' : nextCover.titlePlacement);
  return { ...list, spotlightDesignRevision: 1, pages, coverReview: {
    topic, warnings, approvedSourceIds: selected.filter(url => !topic || labels[coverSourceId(url)]?.topics.includes(topic)).map(coverSourceId),
  } };
}
