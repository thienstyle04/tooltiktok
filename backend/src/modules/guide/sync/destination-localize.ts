import { DestinationId, DEFAULT_DESTINATION_ID, getDestinationConfig } from './destination-config';
import { GuideDeck, GuideDeckList, DeckPage, PageItem } from '../../../common/interfaces/guide.types';

export interface DestinationMarketingCopy {
  label: string;
  labelUpper: string;
  shortLabel: string;
  budgetCoverTitle: string;
  budgetTableTitle: string;
  budgetBusInActivity: string;
  budgetBusInAddress: string;
  budgetBusInCost: string;
  budgetBusOutActivity: string;
  budgetBusOutAddress: string;
  povCoverTitle: string;
  povCoverSubtitle: string;
  captionBodyFallback: string;
  hashtags: string[];
}

export const DESTINATION_MARKETING_COPY: Record<DestinationId, DestinationMarketingCopy> = {
  dalat: {
    label: 'Đà Lạt',
    labelUpper: 'ĐÀ LẠT',
    shortLabel: 'ĐL',
    budgetCoverTitle: '"72H" Ở ĐÀ LẠT VỚI 3TR',
    budgetTableTitle: 'ĐÀ LẠT 3 NGÀY 2 ĐÊM',
    budgetBusInActivity: 'Di chuyển bằng xe Phương Trang SG - ĐL',
    budgetBusInAddress: 'Bến xe liên tỉnh Đà Lạt',
    budgetBusInCost: '~540k/khứ hồi',
    budgetBusOutActivity: 'Check out, lên xe về lại SG',
    budgetBusOutAddress: 'Bến xe liên tỉnh Đà Lạt',
    povCoverTitle: 'POV: có 3 ngày\nvi vu khắp Đà Lạt',
    povCoverSubtitle: 'dalat. [gợi ý local guide ngắn ngày]',
    captionBodyFallback: 'Lưu list này để có lịch đi Đà Lạt gọn hơn, dễ chọn điểm theo buổi và đỡ mất thời gian mò từng nơi.',
    hashtags: ['#riviudalat', '#dalat', '#dalatreview', '#72hdalat', '#dulichdalat'],
  },
  phanthiet: {
    label: 'Phan Thiết',
    labelUpper: 'PHAN THIẾT',
    shortLabel: 'PT',
    budgetCoverTitle: '"72H" Ở PHAN THIẾT VỚI 3TR',
    budgetTableTitle: 'PHAN THIẾT 3 NGÀY 2 ĐÊM',
    budgetBusInActivity: 'Di chuyển từ TP.HCM đến Phan Thiết',
    budgetBusInAddress: 'Bến xe / trung tâm Phan Thiết',
    budgetBusInCost: '~300k/khứ hồi',
    budgetBusOutActivity: 'Check out, lên xe về lại SG',
    budgetBusOutAddress: 'Bến xe / trung tâm Phan Thiết',
    povCoverTitle: 'POV: có 3 ngày\nvi vu khắp Phan Thiết',
    povCoverSubtitle: 'phanthiet. [gợi ý local guide ngắn ngày]',
    captionBodyFallback: 'Lưu list này để có lịch đi Phan Thiết gọn hơn, dễ chọn điểm theo buổi và đỡ mất thời gian mò từng nơi.',
    hashtags: ['#riviuphanthiet', '#phanthiet', '#phanthietreview', '#72hphanthiet', '#dulich31'],
  },
  // Green Land dùng lại dữ liệu Đà Lạt nguyên văn (địa danh, mô tả không đổi) — copy này chỉ tồn tại để thoả kiểu Record,
  // các hàm localizeText/localizeList/localizeDeck/localizeDecks đều early-return cho 'greenland' nên các field thay thế
  // (budgetCoverTitle, povCoverTitle...) không thực sự được dùng. Chỉ `hashtags` được dùng thật (tag thương hiệu riêng).
  greenland: {
    label: 'Green Land',
    labelUpper: 'GREEN LAND',
    shortLabel: 'GL',
    budgetCoverTitle: '"72H" Ở ĐÀ LẠT VỚI 3TR',
    budgetTableTitle: 'ĐÀ LẠT 3 NGÀY 2 ĐÊM',
    budgetBusInActivity: 'Di chuyển bằng xe Phương Trang SG - ĐL',
    budgetBusInAddress: 'Bến xe liên tỉnh Đà Lạt',
    budgetBusInCost: '~540k/khứ hồi',
    budgetBusOutActivity: 'Check out, lên xe về lại SG',
    budgetBusOutAddress: 'Bến xe liên tỉnh Đà Lạt',
    povCoverTitle: 'POV: có 3 ngày\nvi vu khắp Đà Lạt',
    povCoverSubtitle: 'dalat. [gợi ý local guide ngắn ngày]',
    captionBodyFallback: 'Lưu list này để có lịch đi Đà Lạt gọn hơn, dễ chọn điểm theo buổi và đỡ mất thời gian mò từng nơi.',
    hashtags: ['#greenland', '#greenlanddalat', '#greenlandreview', '#72hgreenland', '#dulichgreenland'],
  },
};

let activeDestinationId: DestinationId = DEFAULT_DESTINATION_ID;

/** dalat + greenland đều dùng nguyên văn địa danh "Đà Lạt" trong nội dung — chỉ phanthiet mới cần thay chữ. */
function skipsTextLocalization(id: DestinationId): boolean {
  return id === 'dalat' || id === 'greenland';
}

/** Cụm thay thế từ bản gốc Đà Lạt → điểm đến hiện tại (theo thứ tự dài trước). */
const PHRASE_REPLACEMENTS: Array<[string, keyof DestinationMarketingCopy]> = [
  ['Di chuyển bằng xe Phương Trang SG - ĐL', 'budgetBusInActivity'],
  ['Bến xe liên tỉnh Đà Lạt', 'budgetBusInAddress'],
  ['"72H" Ở ĐÀ LẠT VỚI 3TR', 'budgetCoverTitle'],
  ['ĐÀ LẠT 3 NGÀY 2 ĐÊM', 'budgetTableTitle'],
  ['POV: có 3 ngày\nvi vu khắp Đà Lạt', 'povCoverTitle'],
  ['dalat. [gợi ý local guide ngắn ngày]', 'povCoverSubtitle'],
  ['Lưu list này để có lịch đi Đà Lạt gọn hơn, dễ chọn điểm theo buổi và đỡ mất thời gian mò từng nơi.', 'captionBodyFallback'],
];

const HASHTAG_REPLACEMENTS: Array<[RegExp, number]> = [
  [/#riviudalat/gi, 0],
  [/#72hdalat/gi, 3],
  [/#dalatreview/gi, 2],
  [/#dalat\b/gi, 1],
];

export function normalizeHashtagKey(tag: string): string {
  return String(tag || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function normalizeHashtagTag(tag: string): string {
  const trimmed = String(tag || '').trim();
  if (!trimmed) return '';
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

export function localizeHashtag(tag: string, id: DestinationId = activeDestinationId): string {
  return normalizeHashtagTag(localizeText(normalizeHashtagTag(tag), id));
}

const DALAT_HASHTAG_KEYS = new Set(
  DESTINATION_MARKETING_COPY.dalat.hashtags.map((tag) => normalizeHashtagKey(tag)),
);

export function isDalatHashtag(tag: string): boolean {
  const key = normalizeHashtagKey(tag);
  return DALAT_HASHTAG_KEYS.has(key) || key.includes('dalat');
}

/** 2 hashtag cuối (vị trí 4–5) — cố định theo từng mẫu deck. 3 hashtag đầu lấy từ `copy.hashtags`. */
export const DECK_HASHTAG_EXTRAS: Record<DestinationId, Record<string, readonly [string, string]>> = {
  dalat: {
    'itinerary-3n2d': ['#lichtrinhdalat', '#3n2ddalat'],
    'budget-3n2d': ['#72hdalat', '#dulichdalat'],
    'budget-72h-summary': ['#72hdalat', '#budgetdalat'],
    'budget-3n2d-story': ['#72hdalat', '#storydalat'],
    'itinerary-4n3d': ['#4n3ddalat', '#traveldalat'],
    'itinerary-4n2d-grid8': ['#4n3ddalat', '#grid8dalat'],
    'pov-3-day': ['#povdalat', '#72hdalat'],
    'grid-6': ['#grid6dalat', '#checkindalat'],
    'grid-6-zigzag': ['#grid6dalat', '#checkindalat'],
    'grid-8': ['#grid8dalat', '#listdalat'],
    'grid-4': ['#grid4dalat', '#anchoidalat'],
    'grid-4-mutant': ['#grid4dalat', '#checkindalat'],
    'grid-5': ['#grid5dalat', '#listdalat'],
    'spotlight-guide': ['#spotlightdalat', '#dulichdalat'],
    'spotlight-partner': ['#spotlightdalat', '#dichvudalat'],
    'grid-6-quaytung': ['#quaytungdalat', '#checkindalat'],
    'grid-8-feed': ['#feeddalat', '#listdalat'],
    'grid-8-quaytung': ['#quaytungdalat', '#anchoidalat'],
    'spotlight-v2': ['#spotlightdalat', '#reviewdalat'],
    'pov-3-v2': ['#povdalat', '#72hdalat'],
    'itinerary-4n3d-stack': ['#4n3ddalat', '#stackdalat'],
    'itinerary-timeline': ['#lichtrinhdalat', '#timelinedalat'],
  },
  phanthiet: {
    'itinerary-3n2d': ['#lichtrinhphanthiet', '#3n2dphanthiet'],
    'budget-3n2d': ['#72hphanthiet', '#dulichphanthiet'],
    'budget-72h-summary': ['#72hphanthiet', '#budgetphanthiet'],
    'budget-3n2d-story': ['#72hphanthiet', '#storyphanthiet'],
    'itinerary-4n3d': ['#4n3dphanthiet', '#travelphanthiet'],
    'itinerary-4n2d-grid8': ['#4n3dphanthiet', '#grid8phanthiet'],
    'pov-3-day': ['#povphanthiet', '#72hphanthiet'],
    'grid-6': ['#grid6phanthiet', '#checkinphanthiet'],
    'grid-6-zigzag': ['#grid6phanthiet', '#checkinphanthiet'],
    'grid-8': ['#grid8phanthiet', '#listphanthiet'],
    'grid-4': ['#grid4phanthiet', '#anchoiphanthiet'],
    'grid-4-mutant': ['#grid4phanthiet', '#checkinphanthiet'],
    'grid-5': ['#grid5phanthiet', '#listphanthiet'],
    'spotlight-guide': ['#spotlightphanthiet', '#dulichphanthiet'],
    'spotlight-partner': ['#spotlightphanthiet', '#dichvuphanthiet'],
    'grid-6-quaytung': ['#quaytungphanthiet', '#checkinphanthiet'],
    'grid-8-feed': ['#feedphanthiet', '#listphanthiet'],
    'grid-8-quaytung': ['#quaytungphanthiet', '#anchoiphanthiet'],
    'spotlight-v2': ['#spotlightphanthiet', '#reviewphanthiet'],
    'pov-3-v2': ['#povphanthiet', '#72hphanthiet'],
    'itinerary-4n3d-stack': ['#4n3dphanthiet', '#stackphanthiet'],
    'itinerary-timeline': ['#lichtrinhphanthiet', '#timelinephanthiet'],
  },
  // Không dùng lại tag "#xxxdalat" ở đây: buildCaptionHashtags() có bộ lọc isDalatHashtag() loại bỏ
  // mọi tag chứa "dalat" khi destination khác 'dalat' — dùng tag thương hiệu "greenland" riêng cho nhất quán.
  greenland: {
    'itinerary-3n2d': ['#lichtrinhgreenland', '#3n2dgreenland'],
    'budget-3n2d': ['#72hgreenland', '#dulichgreenland'],
    'budget-72h-summary': ['#72hgreenland', '#budgetgreenland'],
    'budget-3n2d-story': ['#72hgreenland', '#storygreenland'],
    'itinerary-4n3d': ['#4n3dgreenland', '#travelgreenland'],
    'itinerary-4n2d-grid8': ['#4n3dgreenland', '#grid8greenland'],
    'pov-3-day': ['#povgreenland', '#72hgreenland'],
    'grid-6': ['#grid6greenland', '#checkingreenland'],
    'grid-6-zigzag': ['#grid6greenland', '#checkingreenland'],
    'grid-8': ['#grid8greenland', '#listgreenland'],
    'grid-4': ['#grid4greenland', '#anchoigreenland'],
    'grid-4-mutant': ['#grid4greenland', '#checkingreenland'],
    'grid-5': ['#grid5greenland', '#listgreenland'],
    'spotlight-guide': ['#spotlightgreenland', '#dulichgreenland'],
    'spotlight-partner': ['#spotlightgreenland', '#dichvugreenland'],
    'grid-6-quaytung': ['#quaytunggreenland', '#checkingreenland'],
    'grid-8-feed': ['#feedgreenland', '#listgreenland'],
    'grid-8-quaytung': ['#quaytunggreenland', '#anchoigreenland'],
    'spotlight-v2': ['#spotlightgreenland', '#reviewgreenland'],
    'pov-3-v2': ['#povgreenland', '#72hgreenland'],
    'itinerary-4n3d-stack': ['#4n3dgreenland', '#stackgreenland'],
    'itinerary-timeline': ['#lichtrinhgreenland', '#timelinegreenland'],
  },
};

const ALL_DECK_IDS = Object.keys(DECK_HASHTAG_EXTRAS.dalat).sort((a, b) => b.length - a.length);

export function resolveDeckIdFromListId(listId: string): string | undefined {
  const id = String(listId || '').trim();
  if (!id) return undefined;
  for (const deckId of ALL_DECK_IDS) {
    if (id === deckId || id.startsWith(`${deckId}-`) || id.startsWith(`${deckId}|`)) return deckId;
  }
  return undefined;
}

export function getDeckHashtagExtras(deckId: string, id: DestinationId = activeDestinationId): [string, string] {
  const extras = DECK_HASHTAG_EXTRAS[id]?.[deckId];
  if (extras) return [localizeHashtag(extras[0], id), localizeHashtag(extras[1], id)];
  const copy = getMarketingCopy(id);
  return [copy.hashtags[3] || '', copy.hashtags[4] || ''].filter(Boolean) as [string, string];
}

export const TONE_HASHTAG_SUGGESTIONS: Record<DestinationId, Record<string, string[]>> = {
  dalat: {
    gen_z: ['#checkindalat', '#anchoidalat'],
    tinh_te: ['#dalatchill', '#dalatnhenhang'],
    review_chan_that: ['#reviewdalat', '#kinhnghiemdalat'],
    ban_hang_nhe: ['#goiydalat', '#dichvudalat'],
    lich_trinh_huu_ich: ['#lichtrinhdalat', '#traveldalat'],
  },
  phanthiet: {
    gen_z: ['#checkinphanthiet', '#anchoiphanthiet'],
    tinh_te: ['#phanthietchill', '#phanthietnhenhang'],
    review_chan_that: ['#reviewphanthiet', '#kinhnghiemphanthiet'],
    ban_hang_nhe: ['#goiyphanthiet', '#dichvuphanthiet'],
    lich_trinh_huu_ich: ['#lichtrinhphanthiet', '#travelphanthiet'],
  },
  greenland: {
    gen_z: ['#checkingreenland', '#anchoigreenland'],
    tinh_te: ['#greenlandchill', '#greenlandnhenhang'],
    review_chan_that: ['#reviewgreenland', '#kinhnghiemgreenland'],
    ban_hang_nhe: ['#goiygreenland', '#dichvugreenland'],
    lich_trinh_huu_ich: ['#lichtrinhgreenland', '#travelgreenland'],
  },
};

const LEGACY_HASHTAG_ALIASES: Partial<Record<DestinationId, Record<string, string>>> = {
  dalat: { dulich31: '#dulichdalat' },
};

function migrateLegacyHashtag(tag: string, id: DestinationId): string {
  const key = normalizeHashtagKey(tag);
  const alias = LEGACY_HASHTAG_ALIASES[id]?.[key];
  return alias || tag;
}

export function buildCaptionHashtags(
  values: string[],
  tone: string,
  id: DestinationId = activeDestinationId,
  deckId?: string,
): string[] {
  const copy = getMarketingCopy(id);
  if (deckId) {
    const deckExtras = getDeckHashtagExtras(deckId, id);
    return [
      copy.hashtags[0],
      copy.hashtags[1],
      copy.hashtags[2],
      deckExtras[0],
      deckExtras[1],
    ];
  }

  const toneExtras = TONE_HASHTAG_SUGGESTIONS[id]?.[tone] || [];
  const seen = new Set<string>();
  const extras: string[] = [];

  const pushExtra = (raw: string) => {
    const localized = localizeHashtag(migrateLegacyHashtag(raw, id), id);
    if (!localized) return;
    const key = normalizeHashtagKey(localized);
    if (!key || seen.has(key)) return;
    if (id !== 'dalat' && isDalatHashtag(localized)) return;
    const coreKeys = copy.hashtags.slice(0, 3).map((tag) => normalizeHashtagKey(tag));
    if (coreKeys.includes(key)) return;
    seen.add(key);
    extras.push(localized);
  };

  for (const raw of values) pushExtra(raw);
  for (const raw of toneExtras) pushExtra(raw);

  return [
    copy.hashtags[0],
    copy.hashtags[1],
    copy.hashtags[2],
    extras[0] || copy.hashtags[3],
    extras[1] || copy.hashtags[4],
  ];
}

export function setActiveDestinationLocalize(id: DestinationId): void {
  activeDestinationId = id;
}

export function getActiveDestinationLocalize(): DestinationId {
  return activeDestinationId;
}

export function getMarketingCopy(id: DestinationId = activeDestinationId): DestinationMarketingCopy {
  return DESTINATION_MARKETING_COPY[id];
}

export function cityLabel(id: DestinationId = activeDestinationId): string {
  return getDestinationConfig(id).label;
}

export function cityLabelUpper(id: DestinationId = activeDestinationId): string {
  return getMarketingCopy(id).labelUpper;
}

export function cityShortLabel(id: DestinationId = activeDestinationId): string {
  return getDestinationConfig(id).shortLabel;
}

export function localizeText(text: string, id: DestinationId = activeDestinationId): string {
  if (!text || skipsTextLocalization(id)) return text;

  const copy = getMarketingCopy(id);
  let result = text;

  for (const [from, key] of PHRASE_REPLACEMENTS) {
    const replacement = String(copy[key] ?? '');
    if (replacement) result = result.split(from).join(replacement);
  }

  for (const [pattern, index] of HASHTAG_REPLACEMENTS) {
    const replacement = copy.hashtags[index];
    if (replacement) result = result.replace(pattern, replacement);
  }

  result = result
    .replace(/ĐÀ LẠT/g, copy.labelUpper)
    .replace(/Đà Lạt/g, copy.label)
    .replace(/đà lạt/g, copy.label.toLowerCase())
    .replace(/\bdalat\b/gi, 'phanthiet')
    .replace(/\bSG - ĐL\b/g, 'SG - PT');

  return result;
}

function localizePageItem(item: PageItem, id: DestinationId): PageItem {
  return {
    ...item,
    label: localizeText(item.label || '', id),
    name: localizeText(item.name || '', id),
    rawName: item.rawName ? localizeText(item.rawName, id) : item.rawName,
    metaPrimary: localizeText(item.metaPrimary || '', id),
    metaSecondary: localizeText(item.metaSecondary || '', id),
    imageNote: localizeText(item.imageNote || '', id),
  };
}

function localizePage(page: DeckPage, id: DestinationId): DeckPage {
  if (page.type === 'cover') {
    return {
      ...page,
      title: localizeText(page.title || '', id),
      subtitle: localizeText(page.subtitle || '', id),
    };
  }

  return {
    ...page,
    chipText: localizeText(page.chipText || '', id),
    title: localizeText(page.title || '', id),
    subtitle: localizeText(page.subtitle || '', id),
    items: Array.isArray(page.items) ? page.items.map((item) => localizePageItem(item, id)) : page.items,
  };
}

export function localizeList(list: GuideDeckList, id: DestinationId = activeDestinationId): GuideDeckList {
  if (skipsTextLocalization(id)) return list;
  return {
    ...list,
    navTitle: localizeText(list.navTitle || '', id),
    title: localizeText(list.title || '', id),
    description: localizeText(list.description || '', id),
    coverTitle: list.coverTitle ? localizeText(list.coverTitle, id) : list.coverTitle,
    postCaption: list.postCaption ? localizeText(list.postCaption, id) : list.postCaption,
    captionHashtags: Array.isArray(list.captionHashtags)
      ? list.captionHashtags.map((tag) => localizeText(String(tag || ''), id)).filter(Boolean)
      : list.captionHashtags,
    pages: Array.isArray(list.pages) ? list.pages.map((page) => localizePage(page, id)) : list.pages,
  };
}

export function localizeDeck(deck: GuideDeck, id: DestinationId = activeDestinationId): GuideDeck {
  if (skipsTextLocalization(id)) return deck;
  return {
    ...deck,
    title: localizeText(deck.title || '', id),
    description: localizeText(deck.description || '', id),
    lists: (deck.lists || []).map((list) => localizeList(list, id)),
  };
}

export function localizeDecks(decks: GuideDeck[], id: DestinationId = activeDestinationId): GuideDeck[] {
  if (skipsTextLocalization(id)) return decks;
  return decks.map((deck) => localizeDeck(deck, id));
}
