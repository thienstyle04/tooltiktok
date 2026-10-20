import { DeckPage, GuideDeck, GuideDeckList, GuideItem, HinhNenImageUrlPools, ListPage, PartnerRotationHistory, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { normalizeText, stableHash } from './image-resolver';
import { bootstrapPartnerHistory, partnerIdentity, photoKeys, rotatePartnerList, sourcePhotoId } from './partner-rotation';
import { requiredPartnersFirst, requiredPartnersSatisfied } from './required-partners';

export const CHERRY_ID = 'spotlight-v6-cherry-blossom';
export const CHERRY_NAME = 'Spotlight Mùa hoa đào';
export const CHERRY_VERSION = 2;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const key = (text: string) => normalizeText(text).replace(/[^a-z0-9]/g, '');
export const isCircle = (item: GuideItem) => /^12circle(?:coffee)?$/.test(key(item.name));
export const isDlart = (item: GuideItem) => /^dlartgarden$/.test(key(item.name));
const line = (item: GuideItem) => (item.diaryDescriptionRaw || '').split(/\r?\n/).map(s => s.replace(/^\s*[•●\-*–—]\s*/, '').trim()).find(Boolean) || '';
const regular = (item: GuideItem) => item.cherryRegularImageUrls || item.diaryImageUrls || [];
const flower = (item: GuideItem) => item.themedImageUrls?.['cherry-blossom'] || [];
const distinct = (urls: string[]) => [...new Map(urls.filter(Boolean).map(url => { const keys = photoKeys(url); return [keys[keys.length - 1], url] as const; })).values()];
type State = PartnerRotationHistory[string];
type Request = { owner: string; role: string; urls: string[]; label: string; page: number };

/** All history (including cover, scenery and hook cycles) is committed with the
 * list in the existing atomic list-store write. A failed build consumes nothing. */
export function cherryHistory(lists: GuideDeckList[], items: WorkbookItemsBySection, existing: PartnerRotationHistory = {}): PartnerRotationHistory {
  const result = bootstrapPartnerHistory(lists, CHERRY_ID, Object.values(items).flat(), existing);
  for (const list of lists) {
    if (list.id.endsWith('-main')) continue;
    if (!existing['pool:hook']) {
      const prior = result['pool:hook'] || { position: 1, usedPhotos: [], lastPhotos: [], cycle: 1 };
      result['pool:hook'] = { ...prior, lastPhotos: [list.title], usedPhotos: [...new Set([...prior.usedPhotos, list.title])] };
    }
    const grouped = new Map<string, DeckPage[]>();
    for (const page of list.pages) {
      const item = page.type === 'list' ? page.items[0] : undefined;
      const owner = item ? `venue|${normalizeText(item.rawName || item.name)}` : `pool:${page.imageRole}`;
      grouped.set(owner, [...(grouped.get(owner) || []), page]);
    }
    for (const [owner, pages] of grouped) {
      if (existing[owner]) continue;
      const state = result[owner] || { position: 1, usedPhotos: [], lastPhotos: [], cycle: 1 };
      state.photoPools ||= {};
      for (const page of pages) {
        const role = page.imageRole || 'venue-regular';
        const old = state.photoPools[role] || { usedPhotos: [], cycle: 1 };
        state.photoPools[role] = { ...old, usedPhotos: [...new Set([...old.usedPhotos, ...photoKeys(page.backgroundImage)])] };
      }
      state.lastPhotos = pages.flatMap(page => photoKeys(page.backgroundImage));
      result[owner] = state;
    }
  }
  return result;
}

function venuePage(item: GuideItem, title: string, role: 'venue-regular' | 'venue-cherry-blossom'): ListPage {
  return { type: 'list', layoutVariant: 'spotlight-v6-diary-page', imageRole: role,
    canvasPreset: 'tiktok-9x16', textFontSize: 34, chipText: item.sectionTitle, chipTone: 'berry', title, subtitle: '',
    titlePlacement: 'top-center', backgroundImage: '', items: [{ label: '', id: item.id,
      name: item.name, rawName: item.name, sourceKey: item.imageMappingKey, sourceSectionKey: item.sectionKey,
      metaPrimary: item.streetAddress || item.address, metaSecondary: '', imageUrl: '', candidateImageUrls: [],
      imageMapped: true, imageSource: 'manual', imageNote: '', isPartner: true }] };
}

function makeList(cafes: GuideItem[], foods: GuideItem[], hook: string): GuideDeckList {
  const scene = (): ListPage => ({ type: 'list', layoutVariant: 'spotlight-v6-diary-page', imageRole: 'cherry-blossom-random',
    canvasPreset: 'tiktok-9x16', chipText: 'Cảnh hoa đào', chipTone: 'berry', title: '', subtitle: '', items: [], backgroundImage: '' });
  const blocks = cafes.map(item => [venuePage(item, isCircle(item) || isDlart(item) ? `Ghé ${item.name} ngắm hoa đào nè` : line(item),
    isCircle(item) || isDlart(item) ? 'venue-cherry-blossom' : 'venue-regular'), venuePage(item, '', 'venue-regular')]);
  const meals = foods.map(item => venuePage(item, '', 'venue-regular'));
  return { id: '', navTitle: '', title: hook, coverTitle: hook, description: 'Mùa hoa đào Đà Lạt · 3 cà phê và 4 quán ăn đối tác',
    canvasPreset: 'tiktok-9x16', templateVersion: CHERRY_VERSION,
    captionBody: 'Lưu lại những địa điểm cho chuyến Đà Lạt của bạn.', captionHashtags: ['#dalat', '#riviudalat', '#hoadao'],
    postCaption: `${hook}\n\nLưu lại những địa điểm cho chuyến Đà Lạt của bạn.\n\n#dalat #riviudalat #hoadao`,
    pages: [{ type: 'cover', layoutVariant: 'spotlight-v6-cover', imageRole: 'cherry-blossom', canvasPreset: 'tiktok-9x16',
      title: hook, textFontSize: 44, subtitle: '', backgroundImage: '', titlePlacement: 'center' }, scene(), scene(),
      ...blocks[0], ...blocks[1], scene(), ...blocks[2], meals[0], scene(), scene(), ...meals.slice(1)] };
}

function selectPhotos(list: GuideDeckList, venues: GuideItem[], pools: HinhNenImageUrlPools, old: PartnerRotationHistory, seed: string): PartnerRotationHistory {
  const history = clone(old), requests: Request[] = [];
  list.pages.forEach((page, index) => {
    const item = page.type === 'list' ? page.items[0] : undefined;
    const venue = item && venues.find(source => source.imageMappingKey === item.sourceKey);
    const owner = venue ? partnerIdentity(venue) : `pool:${page.imageRole}`;
    const role = page.imageRole!;
    const urls = distinct(venue ? role === 'venue-cherry-blossom' ? flower(venue) : regular(venue) : pools[role as keyof HinhNenImageUrlPools] || []);
    requests.push({ owner, role, urls, label: venue?.name || (role === 'cherry-blossom' ? 'Ảnh hoa đào (bìa)' : 'Ảnh hoa đào random'), page: index });
  });
  // Solve the scarce venue pools before large background folders. Stable order
  // within each role keeps its multi-image cycle sequential across a boundary.
  requests.sort((a, b) => a.urls.length - b.urls.length || a.page - b.page);
  if (new Set(requests.flatMap(req => req.urls.map(url => { const ids = photoKeys(url); return ids[ids.length - 1]; }))).size < 16) throw new Error(`${CHERRY_NAME}: tổng kho ảnh đúng vai trò chưa đủ 16 ảnh khác nội dung. Hãy bổ sung ảnh riêng.`);
  const chosen = new Map<number, string>(), usedGlobally = new Set<string>();
  let failure: Request | undefined;
  // Backtracking is needed when duplicate uploads occur in different folders.
  // A greedy selection could steal the only valid image from another venue.
  let visits = 0;
  let exhausted = false;
  const solve = (index: number): boolean => {
    if (index === requests.length) return true;
    if (++visits > 150000) { exhausted = true; return false; }
    const req = requests[index];
    const state: State = history[req.owner] ||= { position: 1, lastPhotos: [], usedPhotos: [], cycle: 1 };
    state.photoPools ||= {};
    const prior = state.photoPools[req.role];
    const validIds = new Set(req.urls.flatMap(photoKeys));
    let used = (prior?.usedPhotos || []).filter(id => validIds.has(id));
    let cycle = prior?.cycle || 1;
    if (req.urls.length && req.urls.every(url => photoKeys(url).some(id => used.includes(id)))) { used = []; cycle++; }
    const candidates = req.urls.filter(url => !photoKeys(url).some(id => used.includes(id) || usedGlobally.has(id) || (old[req.owner]?.lastPhotos || []).includes(id)))
      .sort((a, b) => stableHash(`${seed}:${req.page}:${sourcePhotoId(a)}`) - stableHash(`${seed}:${req.page}:${sourcePhotoId(b)}`));
    if (!candidates.length) failure = req;
    for (const url of candidates) {
      const ids = photoKeys(url);
      state.photoPools[req.role] = { usedPhotos: [...new Set([...used, ...ids])], cycle };
      ids.forEach(id => usedGlobally.add(id)); chosen.set(index, url);
      if (solve(index + 1)) return true;
      ids.forEach(id => usedGlobally.delete(id)); chosen.delete(index);
      if (prior) state.photoPools[req.role] = prior; else delete state.photoPools[req.role];
    }
    return false;
  };
  if (!solve(0)) {
    if (exhausted) throw new Error(`${CHERRY_NAME}: chưa tìm được phương án 16 ảnh riêng trong giới hạn tìm kiếm an toàn; không lưu list hoặc tiêu hao lượt. Hãy kiểm tra các kho ảnh bị trùng rồi thử lại.`);
    const req = failure || requests[0];
    throw new Error(`${CHERRY_NAME}: “${req.label}” có ${req.urls.length} ảnh hợp lệ (${req.role}), không đủ ảnh khác lần xuất hiện trước và không trùng toàn list. Hãy bổ sung ảnh đúng thư mục rồi đồng bộ lại.`);
  }
  for (const owner of new Set(requests.map(req => req.owner))) {
    const state = history[owner];
    state.lastPhotos = requests.flatMap((req, index) => req.owner === owner ? photoKeys(chosen.get(index)!) : []);
    state.usedPhotos = [...new Set(Object.values(state.photoPools || {}).flatMap(pool => pool.usedPhotos))];
  }
  requests.forEach((req, index) => {
    const page = list.pages[req.page], url = chosen.get(index)!;
    page.backgroundImage = url;
    if (page.type === 'list' && page.items[0]) { page.items[0].imageUrl = url; page.items[0].candidateImageUrls = [url]; }
  });
  return history;
}

export function buildCherryBlossom(input: { items: WorkbookItemsBySection; pools: HinhNenImageUrlPools; hooks: string[]; history: PartnerRotationHistory; seed: string }): { list: GuideDeckList; history: PartnerRotationHistory } {
  const { items, pools, seed } = input;
  if (!input.hooks.length) throw new Error(`${CHERRY_NAME}: thiếu Hook hoa đào; hãy đồng bộ Google Docs trong Hinh_nen.`);
  if (!distinct(pools['cherry-blossom'] || []).length || distinct(pools['cherry-blossom-random'] || []).length < 5) throw new Error(`${CHERRY_NAME}: cần 1 ảnh bìa và 5 ảnh cảnh khác nhau từ Ảnh hoa đào / Ảnh hoa đào random.`);
  const available = (item: GuideItem, urls: string[]) => distinct(urls).filter(url => !photoKeys(url).some(id => input.history[partnerIdentity(item)]?.lastPhotos.includes(id)));
  const cafe = items.cafe.filter(item => item.isPartner && (item.streetAddress || item.address).trim() && regular(item).length);
  const circle = cafe.find(isCircle), dlart = cafe.find(isDlart);
  for (const [label, item] of [['1/2 Circle Coffee', circle], ['D’Lart Garden', dlart]] as const) {
    if (!item || !flower(item).length) throw new Error(`${CHERRY_NAME}: thiếu đối tác ${label}, địa chỉ hoặc ảnh trong thư mục Hoa đào riêng (${item ? flower(item).length : 0} ảnh). Hãy đồng bộ/bổ sung dữ liệu.`);
    if (!available(item, flower(item)).length || !available(item, regular(item)).length) throw new Error(`${CHERRY_NAME}: ${label} có ${flower(item).length} ảnh hoa đào và ${regular(item).length} ảnh thường; không đủ ảnh khác lần xuất hiện trước. Hãy bổ sung ảnh đúng thư mục.`);
  }
  const thirds = cafe.filter(item => !isCircle(item) && !isDlart(item) && line(item) && available(item, regular(item)).length >= 2);
  const food = items.quan_an.filter(item => item.isPartner && (item.streetAddress || item.address).trim() && available(item, regular(item)).length && !isCircle(item) && !isDlart(item));
  const uniqueFoods = [...new Map(food.map(item => [partnerIdentity(item), item])).values()];
  if (!thirds.length || uniqueFoods.length < 4) {
    const blocked = [...items.cafe, ...items.quan_an].filter(item => item.isPartner && !isCircle(item) && !isDlart(item)
      && available(item, regular(item)).length < (item.sectionKey === 'cafe' ? 2 : 1))
      .map(item => `${item.name}: ${distinct(regular(item)).length} ảnh hợp lệ, ${available(item, regular(item)).length} ảnh khác lần trước`);
    throw new Error(`${CHERRY_NAME}: cần 3 cà phê và 4 quán ăn đối tác có địa chỉ, ảnh riêng; cà phê thứ ba cần Mo_ta. Quán ăn chỉ hiển thị tên và địa chỉ, không yêu cầu Mo_ta. Hiện có ${thirds.length ? 3 : 2}/3 cà phê, ${uniqueFoods.length}/4 quán ăn (không tính trùng địa điểm).${blocked.length ? ' Thiếu ảnh: '+blocked.join('; ')+'. Hãy bổ sung ảnh riêng và đồng bộ lại.' : ''}`);
  }
  const history = clone(input.history);
  const hooks = [...new Set(input.hooks.filter(hook => hook.trim()))];
  const hookState = history['pool:hook'] || { position: 1, lastPhotos: [], usedPhotos: [], cycle: 1 };
  let unused = hooks.filter(hook => !hookState.usedPhotos.includes(hook));
  if (!unused.length) { unused = hooks; hookState.usedPhotos = []; hookState.cycle++; }
  const hook = unused[stableHash(seed) % unused.length];
  const sorted = (pool: GuideItem[]) => [...pool].sort((a, b) => stableHash(`${seed}:${a.name}`) - stableHash(`${seed}:${b.name}`));
  let lastError: unknown;
  // Required partners (user selection) are tried first; a combination missing
  // one of them is never accepted.
  for (const third of requiredPartnersFirst(sorted(thirds))) {
    const candidates = requiredPartnersFirst(sorted(uniqueFoods.filter(item => partnerIdentity(item) !== partnerIdentity(third))));
    const search = (selected: GuideItem[], start: number): { list: GuideDeckList; history: PartnerRotationHistory } | undefined => {
      if (selected.length < 4) {
        for (let i = start; i <= candidates.length - (4 - selected.length); i++) {
          const found = search([...selected, candidates[i]], i + 1); if (found) return found;
        }
        return;
      }
      if (!requiredPartnersSatisfied([circle!, dlart!, third, ...selected])) return;
      try {
        const list = makeList([circle!, dlart!, third], selected, hook);
        const next = selectPhotos(list, [circle!, dlart!, third, ...selected], pools, history, seed);
        const rotated = rotatePartnerList(list, CHERRY_ID, items, input.history, seed, 7, 10, true);
        for (const [owner, state] of Object.entries(next)) rotated.history[owner] = { ...state, position: rotated.history[owner]?.position || state.position };
        rotated.history['pool:hook'] = { ...hookState, lastPhotos: [hook], usedPhotos: [...hookState.usedPhotos, hook] };
        assertCherryList(rotated.list);
        return rotated;
      } catch (error) { lastError = error; return; }
    };
    const found = search([], 0); if (found) return found;
  }
  throw lastError || new Error(`${CHERRY_NAME}: không tìm được phương án đủ dữ liệu.`);
}

export function assertCherryList(list: GuideDeckList): void {
  const pages = list.pages;
  const names = new Set(pages.flatMap(page => page.type === 'list' ? page.items.map(item => normalizeText(item.rawName || item.name)) : []));
  const photos = new Set<string>();
  for (const page of pages) {
    if (!page.backgroundImage || photoKeys(page.backgroundImage).some(id => photos.has(id))) throw new Error(`${CHERRY_NAME}: ảnh trống/trùng nội dung; chưa lưu/xuất list.`);
    photoKeys(page.backgroundImage).forEach(id => photos.add(id));
  }
  if (pages.length !== 16 || names.size !== 7 || pages.filter(page => page.imageRole === 'cherry-blossom-random').length !== 5) throw new Error(`${CHERRY_NAME}: list phải đủ 16 trang, 7 đối tác và 5 ảnh cảnh.`);
}

/** The editable mother is built without consuming any cycle. Never fabricate
 * venues or use a different source when prerequisites are incomplete. */
export function cherryDeck(items: WorkbookItemsBySection, pools: HinhNenImageUrlPools, hooks: string[] = []): GuideDeck {
  let list: GuideDeckList;
  try { list = buildCherryBlossom({ items, pools, hooks, history: {}, seed: 'main-preview' }).list; }
  catch (error) {
    list = { id: '', navTitle: '', title: CHERRY_NAME, description: 'Hãy đồng bộ dữ liệu để tạo list.', canvasPreset: 'tiktok-9x16', templateVersion: CHERRY_VERSION,
      pages: Array.from({ length: 16 }, (_, index) => index === 0 ? { type: 'cover', title: hooks[0] || 'Mùa hoa đào Đà Lạt', subtitle: '', backgroundImage: pools['cherry-blossom']?.[0] || '', imageRole: 'cherry-blossom', layoutVariant: 'spotlight-v6-cover', canvasPreset: 'tiktok-9x16' } : {
        type: 'list', chipText: '', chipTone: 'berry', title: '', subtitle: '', backgroundImage: '', items: [], layoutVariant: 'spotlight-v6-diary-page', imageRole: 'cherry-blossom-random', canvasPreset: 'tiktok-9x16' }), warnings: [String(error instanceof Error ? error.message : error)] };
  }
  list.id = `${CHERRY_ID}-main`; list.navTitle = 'List chính';
  return { id: CHERRY_ID, navTitle: CHERRY_NAME, title: CHERRY_NAME, description: '16 trang · 3 cà phê và 4 quán ăn đối tác · Ảnh hoa đào riêng', lists: [list] };
}
