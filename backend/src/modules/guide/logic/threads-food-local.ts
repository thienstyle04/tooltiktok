import type { DeckPage, GuideItem, PageItem, WorkbookItemsBySection } from '../../../common/interfaces/guide.types';
import { hasItemKey, itemUsageKey } from './data-allocator';
import { normalizeText, stableHash } from './image-resolver';

export const THREADS_FOOD_ID = 'threads-food-local';
export const THREADS_FOOD_TEMPLATE_VERSION = 2;
export const THREADS_CAFE_ID = 'threads-cafe-local';
export const THREADS_CAFE_TEMPLATE_VERSION = 1;
export const THREADS_MIX_ID = 'threads-mix-local';
export const THREADS_MIX_TEMPLATE_VERSION = 1;
export const THREADS_MIX_TEXT_ID = 'threads-mix-text';
export const THREADS_MIX_TEXT_TEMPLATE_VERSION = 1;

export function isThreadsLocalDeck(deckId: string): boolean {
  return deckId === THREADS_FOOD_ID || deckId === THREADS_CAFE_ID || deckId === THREADS_MIX_ID || deckId === THREADS_MIX_TEXT_ID;
}

const CAPTIONS = [
  'Tuiiiii gom 10 quán ăn Đà Lạt nè. Có quán nào bị overhype hông? Mấy ní cmt thẳng để hội mình né với 👇',
  'Đi Đà Lạt mà cãi nhau vụ ăn ở đâu là mất zuiiiii 😭 List này ổn khum, hay thiếu quán ruột của mấy ní? Thả tên đi 👇',
  '10 quán ăn Đà Lạt, chốt được kèo chưa mng? Quán nào đáng đi, quán nào nên gạch tên? Vào tranh luận coi 👀',
];

export function threadsFoodCaption(variant = 0): string {
  return CAPTIONS[Math.abs(Math.trunc(variant)) % CAPTIONS.length];
}

const CAFE_CAPTIONS = [
  'Tuiiiii gom 10 quán cà phê Đà Lạt nè ☕ Quán nào đẹp thiệt, quán nào chỉ lên hình mới zuiiiii? Mấy ní chấm hộ 👇',
  'Cà phê Đà Lạt chọn view hay chọn đồ uống? Tui có list 10 quán, ai thấy quán nào overhype thì nói thẳng coi 👀',
  '10 quán cà phê Đà Lạt, mà chỉ được chọn 1 quán để quay lại. Mấy ní chọn quán nào? Cmt để tui ké kèo với 👇',
];

export function threadsCafeCaption(variant = 0): string {
  return CAFE_CAPTIONS[Math.abs(Math.trunc(variant)) % CAFE_CAPTIONS.length];
}

const MIX_CAPTIONS = [
  'Tuiiiii gom 10 chỗ Đà Lạt từ ăn uống tới đi chơi nè. Có chỗ nào overhype hông? Mấy ní cãi nhẹ ở dưới coi 👇',
  'Đi Đà Lạt mà chỉ biết ăn với cà phê thì hơi phí á 😭 10 chỗ này ổn khum, hay cần gạch tên ai? Cmt thiệt lòng nha 👀',
  'List Đà Lạt đủ ăn, ở, chơi, check-in đây rồiiii. Chỗ nào đáng đi nhất, chỗ nào nên né? Mấy ní chấm điểm giùm tui 👇',
];

export function threadsMixCaption(variant = 0): string {
  return MIX_CAPTIONS[Math.abs(Math.trunc(variant)) % MIX_CAPTIONS.length];
}

const MIX_TEXT_CAPTIONS = [
  'Tuiiiii gom 12 chỗ Đà Lạt đáng ghé nè. Chỗ nào bị overhype, chỗ nào xứng đáng hơn? Mấy ní cmt thẳng nha 👇',
  'Ăn, ở, chơi Đà Lạt tui gói trong 12 chỗ này. Ai thấy thiếu chỗ ruột thì thả tên cứu list zớiiii 👀',
  '12 chỗ Đà Lạt này đi có ổn khum mng? Chọn 1 chỗ nhất định phải ghé và 1 chỗ nên né coi, tranh luận nhẹ nào 👇',
];

export function threadsMixTextCaption(variant = 0): string {
  return MIX_TEXT_CAPTIONS[Math.abs(Math.trunc(variant)) % MIX_TEXT_CAPTIONS.length];
}

function ownPhoto(item: GuideItem): boolean {
  return item.imageMapped === true
    && item.imageSource === 'manual'
    && /^https?:\/\/|^\/assets\/drive-file/i.test(String(item.imageUrl || '').trim());
}

function ranked(items: GuideItem[], seed: string, used: Set<string>): GuideItem[] {
  return [...items].sort((a, b) => {
    const aUsed = hasItemKey(used, a) ? 1 : 0;
    const bUsed = hasItemKey(used, b) ? 1 : 0;
    if (aUsed !== bUsed) return aUsed - bUsed;
    return stableHash(seed + itemUsageKey(a)) - stableHash(seed + itemUsageKey(b));
  });
}

function uniqueNames(items: GuideItem[]): GuideItem[] {
  const names = new Set<string>();
  return items.filter((item) => {
    const name = normalizeText(item.name);
    if (!name || names.has(name)) return false;
    names.add(name);
    return true;
  });
}

function chooseGroup(items: GuideItem[], seed: string, used: Set<string>, templateName: string, label: string, blockedPhotos = new Set<string>()): Array<{ item: GuideItem; photo: boolean }> {
  const candidates = uniqueNames(items);
  const photos = ranked(candidates.filter((item) => ownPhoto(item) && !blockedPhotos.has(item.imageUrl)), seed + ':photo:', used);
  const distinctPhotos = photos.filter((item, index) => photos.findIndex((other) => other.imageUrl === item.imageUrl) === index);
  if (candidates.length < 5 || distinctPhotos.length < 3) {
    throw new Error('Threads ' + templateName + ' cần 5 ' + label + ' (hiện có ' + candidates.length
      + ') và ít nhất 3 ảnh riêng hợp lệ (hiện có ' + distinctPhotos.length + '). Hãy cập nhật dữ liệu/ảnh rồi tạo lại.');
  }
  const selected = distinctPhotos.slice(0, 3);
  const selectedNames = new Set(selected.map((item) => normalizeText(item.name)));
  const other = ranked(candidates.filter((item) => !selectedNames.has(normalizeText(item.name))), seed + ':other:', used).slice(0, 2);
  if (other.length !== 2) throw new Error('Threads ' + templateName + ' chưa đủ 5 ' + label + ' không trùng.');
  return [...selected.map((item) => ({ item, photo: true })), ...other.map((item) => ({ item, photo: false }))];
}

function buildThreadsLocalPages(itemsBySection: WorkbookItemsBySection, seed: string, used: Set<string>, kind: 'food' | 'cafe'): DeckPage[] {
  const isCafe = kind === 'cafe';
  const templateName = isCafe ? 'Cà phê' : 'Quán ăn';
  const sectionKey = isCafe ? 'cafe' : 'quan_an';
  const venues = itemsBySection[sectionKey] || [];
  const partners = chooseGroup(venues.filter((item) => item.isPartner && String(item.address || '').trim()), seed + ':partner:', used, templateName, 'quán đối tác có địa chỉ');
  const partnerNames = new Set(partners.map((entry) => normalizeText(entry.item.name)));
  const locals = chooseGroup(
    venues.filter((item) => !item.isPartner && normalizeText(item.classification || '') === 'local' && !partnerNames.has(normalizeText(item.name))),
    seed + ':local:', used, templateName, 'quán Local không đối tác',
    new Set(partners.filter((entry) => entry.photo).map((entry) => entry.item.imageUrl)),
  );
  const ordered: Array<{ item: GuideItem; photo: boolean }> = [];
  for (let index = 0; index < 5; index += 1) ordered.push(partners[index], locals[index]);
  const photoUrls = ordered.filter((entry) => entry.photo).map((entry) => entry.item.imageUrl);
  if (new Set(photoUrls).size !== 6) throw new Error('Threads ' + templateName + ' cần 6 ảnh khác nhau; dữ liệu ảnh hiện đang trùng.');
  const items: PageItem[] = ordered.map(({ item, photo }) => ({
    id: item.id,
    sourceKey: itemUsageKey(item),
    sourceSectionKey: sectionKey,
    label: photo ? 'Ảnh minh họa' : '',
    name: item.name.trim(),
    rawName: item.name.trim(),
    metaPrimary: item.isPartner ? item.address.trim() : '',
    metaSecondary: '',
    imageUrl: photo ? item.imageUrl : '',
    imageMapped: photo,
    imageNote: '',
    imageSource: photo ? item.imageSource : 'fallback',
    candidateImageUrls: photo ? [item.imageUrl] : [],
    isPartner: item.isPartner,
    isLocal: !item.isPartner && normalizeText(item.classification || '') === 'local',
  }));
  return [{
    type: 'list',
    chipText: 'TXT + 6 ảnh + XLSX',
    chipTone: 'terracotta',
    title: isCafe ? 'Cà phê nào ở Đà Lạt?' : 'Ăn gì ở Đà Lạt?',
    subtitle: isCafe ? '10 quán cà phê · 5 đối tác + 5 Local' : '10 quán ăn · 5 đối tác + 5 Local',
    items,
    backgroundImage: '',
    layoutVariant: 'standard',
    canvasPreset: 'tiktok-3x4',
  }];
}

export function buildThreadsFoodPages(itemsBySection: WorkbookItemsBySection, seed: string, used = new Set<string>()): DeckPage[] {
  return buildThreadsLocalPages(itemsBySection, seed, used, 'food');
}

export function buildThreadsCafePages(itemsBySection: WorkbookItemsBySection, seed: string, used = new Set<string>()): DeckPage[] {
  return buildThreadsLocalPages(itemsBySection, seed, used, 'cafe');
}

const MIX_PARTNER_SECTIONS = ['quan_an', 'cafe', 'homestay', 'dich_vu', 'choi_dem'] as const;
const MIX_OTHER_SECTIONS = ['check_in', 'khu_du_lich', 'hoat_dong', 'quan_an', 'cafe', 'choi_dem', 'dich_vu', 'homestay'] as const;

function chooseMixedGroup(
  itemsBySection: WorkbookItemsBySection, sectionKeys: readonly (keyof WorkbookItemsBySection)[],
  partner: boolean, seed: string, used: Set<string>, names: Set<string>, photoUrls: Set<string>,
  targetCount = 5, photoTarget = 3,
): Array<{ item: GuideItem; photo: boolean }> {
  const groups = sectionKeys.map((key) => ({
    key,
    items: ranked(uniqueNames((itemsBySection[key] || []).filter((item) => item.isPartner === partner
      && (!partner || String(item.address || '').trim()))), `${seed}:${key}:`, used),
  }));
  const selected: Array<{ item: GuideItem; photo: boolean }> = [];
  const take = (group: typeof groups[number], photo: boolean): boolean => {
    const item = group.items.find((candidate) => !names.has(normalizeText(candidate.name))
      && (!photo || (ownPhoto(candidate) && !photoUrls.has(candidate.imageUrl))));
    if (!item) return false;
    selected.push({ item, photo });
    names.add(normalizeText(item.name));
    if (photo) photoUrls.add(item.imageUrl);
    return true;
  };
  for (const group of groups) {
    if (selected.filter((entry) => entry.photo).length === photoTarget) break;
    take(group, true);
  }
  if (selected.filter((entry) => entry.photo).length < photoTarget) {
    for (const group of groups) {
      if (selected.filter((entry) => entry.photo).length === photoTarget) break;
      take(group, true);
    }
  }
  for (const group of groups) {
    if (selected.length === targetCount) break;
    if (!selected.some((entry) => entry.item.sectionKey === group.key)) take(group, false);
  }
  for (const group of groups) {
    while (selected.length < targetCount && take(group, false)) { /* fill from available sections */ }
  }
  if (selected.length !== targetCount || selected.filter((entry) => entry.photo).length !== photoTarget) {
    const photoRequirement = photoTarget ? `, trong đó ${photoTarget} nơi có ảnh thật riêng` : '';
    throw new Error(`Threads Tổng hợp cần ${targetCount} ${partner ? 'đối tác có địa chỉ' : 'địa điểm thường'} từ nhiều nhóm${photoRequirement}. Dữ liệu hiện tại chưa đủ; hãy đồng bộ dữ liệu rồi tạo lại.`);
  }
  return selected;
}

function buildMixedPages(itemsBySection: WorkbookItemsBySection, seed: string, used: Set<string>, textOnly: boolean): DeckPage[] {
  const names = new Set<string>();
  const photoUrls = new Set<string>();
  const perGroup = textOnly ? 6 : 5;
  const photosPerGroup = textOnly ? 0 : 3;
  const partners = chooseMixedGroup(itemsBySection, MIX_PARTNER_SECTIONS, true, `${seed}:partner`, used, names, photoUrls, perGroup, photosPerGroup);
  const others = chooseMixedGroup(itemsBySection, MIX_OTHER_SECTIONS, false, `${seed}:other`, used, names, photoUrls, perGroup, photosPerGroup);
  const ordered: Array<{ item: GuideItem; photo: boolean }> = [];
  for (let index = 0; index < perGroup; index += 1) ordered.push(partners[index], others[index]);
  const items: PageItem[] = ordered.map(({ item, photo }) => ({
    id: item.id,
    sourceKey: itemUsageKey(item),
    sourceSectionKey: item.sectionKey,
    label: photo ? 'Ảnh minh họa' : '',
    name: item.name.trim(),
    rawName: item.name.trim(),
    metaPrimary: item.isPartner ? item.address.trim() : '',
    metaSecondary: '',
    imageUrl: photo ? item.imageUrl : '',
    imageMapped: photo,
    imageNote: '',
    imageSource: photo ? item.imageSource : 'fallback',
    candidateImageUrls: photo ? [item.imageUrl] : [],
    isPartner: item.isPartner,
    isLocal: false,
  }));
  if (new Set(items.map((item) => item.sourceSectionKey)).size < 4) {
    throw new Error('Threads Tổng hợp cần địa điểm từ ít nhất 4 nhóm dữ liệu khác nhau.');
  }
  return [{
    type: 'list', chipText: textOnly ? 'TXT + XLSX' : 'TXT + 6 ảnh + XLSX', chipTone: 'terracotta',
    title: textOnly ? 'List Đà Lạt lưu lại nè' : 'Đi đâu ở Đà Lạt?',
    subtitle: `${ordered.length} địa điểm · ăn, ở, chơi và check-in`,
    items, backgroundImage: '', layoutVariant: 'standard', canvasPreset: 'tiktok-3x4',
  }];
}

export function buildThreadsMixPages(itemsBySection: WorkbookItemsBySection, seed: string, used = new Set<string>()): DeckPage[] {
  return buildMixedPages(itemsBySection, seed, used, false);
}

export function buildThreadsMixTextPages(itemsBySection: WorkbookItemsBySection, seed: string, used = new Set<string>()): DeckPage[] {
  return buildMixedPages(itemsBySection, seed, used, true);
}
