// ─── Chữ người dùng sửa trên từng trang (page-text-overrides.<nguồn>.json) ────
// Hàm thuần: không giữ trạng thái, không biết nguồn đang chọn. GuideService lo
// đường dẫn file, tìm list/trang và ghi file.
import { BadRequestException } from '@nestjs/common';
import * as fs from 'node:fs';
import type { DeckPage, GuideDeck, GuideDeckList, PageTextOverrideStore, UpdatePageTextRequest } from '../../common/interfaces/guide.types';

export type PageTextOverride = PageTextOverrideStore['decks'][string][string][string];

const TITLE_PLACEMENTS = ['top-left', 'top-center', 'top-right', 'mid-left', 'mid-right', 'bottom-left', 'bottom-center', 'bottom-right', 'center'];

export function normalizeEditablePageText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeEditablePageMultilineText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function readPageTextOverrides(filePath: string): PageTextOverrideStore {
  const empty: PageTextOverrideStore = { version: 1, savedAt: '', decks: {} };
  if (!fs.existsSync(filePath)) return empty;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Partial<PageTextOverrideStore>;
    return {
      version: 1,
      savedAt: String(parsed.savedAt || ''),
      decks: parsed.decks && typeof parsed.decks === 'object' ? parsed.decks : {},
    };
  } catch {
    return empty;
  }
}

/** Trang có các dòng dữ liệu (tên/địa chỉ...) người dùng được sửa trực tiếp. */
function hasEditableRows(deckId: string, page: DeckPage): boolean {
  if (page.localRender) return true;
  return (page.layoutVariant === 'itinerary-note-day' || page.layoutVariant === 'itinerary-note-dark-day' || page.layoutVariant === 'itinerary-note-threads-day' || page.layoutVariant === 'itinerary-note-threads-budget' || page.layoutVariant === 'threads-expense-sheet' || page.layoutVariant === 'threads-toplist-page')
    || page.layoutVariant === 'itinerary-note-timed-day'
    || page.layoutVariant === 'spotlight-v6-map-place'
    || page.layoutVariant === 'spotlight-v6-diary-page'
    || (deckId === 'spotlight-v6-persimmon' && page.layoutVariant === 'spotlight-v6-page');
}

/**
 * Kiểm tra yêu cầu sửa chữ của một trang và dựng bản override mới.
 * `prior` là override đã lưu của chính trang đó; `coverImageUrls` là kho ảnh nền hiện tại.
 */
export function buildPageTextOverride(
  deckId: string,
  page: DeckPage,
  request: UpdatePageTextRequest,
  prior: PageTextOverride | undefined,
  coverImageUrls: string[],
): PageTextOverride {
  const titleLimit = page.imageRole ? 4000 : page.spotlightDesignRevision === 1 && page.type === 'cover' ? 220 : page.layoutVariant === 'spotlight-v6-diary-page' ? 220 : page.layoutVariant === 'one-way-story-cover'
    ? 110
    : page.layoutVariant === 'one-way-story-road' || page.layoutVariant === 'one-way-story-slope'
      ? 220
      : page.type === 'cover' ? 60 : 90;
  const normalizedTitle = normalizeEditablePageText(request.title ?? page.title);
  if (page.imageRole && normalizedTitle.length > titleLimit) throw new BadRequestException('Nội dung vượt 4000 ký tự; hãy rút gọn, không tự cắt chữ.');
  const title = normalizedTitle.slice(0, titleLimit);
  const subtitle = (page.localRender || page.layoutVariant === 'one-way-story-road'
    ? normalizeEditablePageMultilineText(request.subtitle ?? page.subtitle)
    : normalizeEditablePageText(request.subtitle ?? page.subtitle)).slice(0, page.localRender ? 4000 : 220);

  let items = prior?.items;
  if (hasEditableRows(deckId, page) && page.type === 'list' && request.items !== undefined) {
    if (!Array.isArray(request.items) || request.items.length !== page.items.length) throw new BadRequestException(`Cần giữ đủ ${page.items.length} dòng dữ liệu.`);
    items = request.items.map(item => ({
      name: normalizeEditablePageText(item.name ?? ''),
      metaPrimary: normalizeEditablePageText(item.metaPrimary ?? ''),
      ...(page.layoutVariant === 'itinerary-note-threads-budget' || page.layoutVariant === 'threads-expense-sheet' ? { metaSecondary: normalizeEditablePageText(item.metaSecondary ?? '').slice(0, 80) } : {}),
      ...(page.layoutVariant === 'itinerary-note-timed-day' ? { scheduleTime: normalizeEditablePageText(item.scheduleTime ?? '').slice(0, 24) } : {}),
    }));
  }
  const chipText = page.layoutVariant === 'itinerary-note-timed-day'
    ? normalizeEditablePageText(request.chipText ?? page.chipText).slice(0, 40)
    : undefined;
  const editableSpotlightCover = page.type === 'cover' && page.spotlightDesignRevision === 1;
  const rawCoverImages = editableSpotlightCover ? request.coverImages ?? prior?.coverImages : undefined;
  const coverImages = Array.isArray(rawCoverImages) ? rawCoverImages.map(url => typeof url === 'string' ? url.trim() : url).filter(url => url !== '') : rawCoverImages;
  const coverApproval = editableSpotlightCover ? request.coverApproval ?? prior?.coverApproval : undefined;
  if (coverImages !== undefined && (!Array.isArray(coverImages) || coverImages.length !== (deckId === 'spotlight-v2' ? 4 : 1)
    || new Set(coverImages).size !== coverImages.length || coverImages.some(url => !coverImageUrls.includes(url)))) {
    throw new BadRequestException('Ảnh bìa phải khác nhau và thuộc kho ảnh nền hiện tại.');
  }
  if (coverApproval !== undefined && (typeof coverApproval !== 'string' || coverApproval.length > 4000)) throw new BadRequestException('Xác nhận ảnh bìa không hợp lệ.');
  const titlePlacement = page.imageRole || page.layoutVariant === 'spotlight-v6-diary-page' || editableSpotlightCover
    ? request.titlePlacement ?? prior?.titlePlacement ?? page.titlePlacement
    : undefined;
  if (titlePlacement && !TITLE_PLACEMENTS.includes(titlePlacement)) throw new BadRequestException('Vị trí chữ không hợp lệ.');
  if (page.layoutVariant === 'spotlight-v6-diary-page' && titlePlacement && !['top-center', 'center', 'bottom-center'].includes(titlePlacement)) throw new BadRequestException('Vị trí chữ không hợp lệ.');
  const textScale = request.textScale ?? prior?.textScale ?? page.textScale ?? 100;
  const textFontSize = request.textFontSize !== undefined ? request.textFontSize : prior?.textFontSize ?? page.textFontSize ?? null;
  if (textFontSize !== null && (typeof textFontSize !== 'number' || !Number.isFinite(textFontSize) || textFontSize < 8 || textFontSize > 72 || textFontSize * 2 !== Math.round(textFontSize * 2))) throw new BadRequestException('Cỡ chữ phải từ 8 đến 72px, bước 0.5px.');
  if (typeof textScale !== 'number' || !Number.isFinite(textScale) || textScale < 50 || textScale > 100 || textScale % 5 !== 0) throw new BadRequestException('Cỡ chữ phải từ 50 đến 100%, bước 5%.');
  const diaryFontSize = page.layoutVariant === 'spotlight-v6-diary-page'
    ? request.diaryFontSize ?? prior?.diaryFontSize ?? page.diaryFontSize ?? 13
    : undefined;
  if (diaryFontSize !== undefined && (typeof diaryFontSize !== 'number' || !Number.isFinite(diaryFontSize) || diaryFontSize < 9 || diaryFontSize > 13 || diaryFontSize * 2 !== Math.round(diaryFontSize * 2))) throw new BadRequestException('Cỡ chữ Nhật ký phải từ 9 đến 13px, bước 0.5px.');
  return { title, subtitle, textScale, textFontSize, ...(coverImages ? { coverImages } : {}), ...(coverApproval !== undefined ? { coverApproval } : {}), ...(diaryFontSize !== undefined ? { diaryFontSize } : {}), ...(titlePlacement ? { titlePlacement } : {}), ...(chipText !== undefined ? { chipText } : {}), ...(items ? { items } : {}) };
}

export function applyPageTextOverrides(
  deckId: string,
  lists: GuideDeckList[],
  store: PageTextOverrideStore,
): GuideDeckList[] {
  const deckOverrides = store.decks[deckId];
  if (!deckOverrides) return lists;
  return lists.map((list) => {
    const listOverrides = deckOverrides[list.id];
    if (!listOverrides) return list;
    const pages = list.pages.map((page, pageIndex) => {
      const ownOverride = listOverrides?.[String(pageIndex)];
      if (!ownOverride) return page;
      return { ...page, title: ownOverride.title, subtitle: ownOverride.subtitle,
        ...(ownOverride.textScale !== undefined ? { textScale: ownOverride.textScale } : {}),
        ...(ownOverride.textFontSize !== undefined ? { textFontSize: ownOverride.textFontSize } : {}),
        ...((page.imageRole || page.layoutVariant === 'spotlight-v6-diary-page' || page.spotlightDesignRevision === 1) && ownOverride.titlePlacement ? { titlePlacement: ownOverride.titlePlacement } : {}),
        ...(page.type === 'cover' && page.spotlightDesignRevision === 1 && ownOverride.coverImages ? { coverImages: ownOverride.coverImages, backgroundImage: ownOverride.coverImages[0] } : {}),
        ...(page.type === 'cover' && page.spotlightDesignRevision === 1 && ownOverride.coverApproval !== undefined ? { coverApproval: ownOverride.coverApproval } : {}),
        ...(page.layoutVariant === 'spotlight-v6-diary-page' && ownOverride.diaryFontSize !== undefined ? { diaryFontSize: ownOverride.diaryFontSize } : {}),
        ...(page.layoutVariant === 'itinerary-note-timed-day' && ownOverride.chipText !== undefined ? { chipText: ownOverride.chipText } : {}),
        ...(page.type === 'list' && hasEditableRows(deckId, page) && ownOverride.items ? {
          items: page.items.map((item, index) => ({ ...item, ...ownOverride.items?.[index] })),
        } : {}),
      };
    });
    const coverOverride = pages[0]?.type === 'cover'
      ? listOverrides?.['0']
      : undefined;
    // Lần sửa gần nhất của list; bản sửa cũ chưa có mốc giờ dùng giờ lưu kho.
    const editedAt = Object.values(listOverrides).map(override => override.editedAt || store.savedAt || '').sort().pop();
    const edited = editedAt ? { editedAt } : {};
    return coverOverride
      ? { ...list, title: coverOverride.title, coverTitle: coverOverride.title, ...edited, pages }
      : { ...list, ...edited, pages };
  });
}

/**
 * Đồng bộ tiêu đề/phụ đề các trang trong (không phải bìa) theo list chính của mẫu.
 * `loadStore` chỉ được gọi khi mẫu có list chính.
 */
export function applyMainTemplateFieldStructure(deck: GuideDeck, pages: DeckPage[], loadStore: () => PageTextOverrideStore): DeckPage[] {
  const mainList = deck.lists.find((list) => (
    /-main$/i.test(String(list.id || ''))
    || String(list.id || '').toLowerCase() === 'main'
    || String(list.navTitle || '').trim().toLowerCase() === 'list chính'
  ));
  if (!mainList) return pages;

  const templateOverrides = loadStore().decks[deck.id]?.[mainList.id];
  return pages.map((page, pageIndex) => {
    // Trang bìa: tiêu đề là hook riêng của từng list (AI/pool), không đồng bộ/ghi đè
    // theo override của list mẫu (main) — nếu không mọi list mới sẽ bị ép về cùng 1 câu.
    if (page.type === 'cover') return page;
    const templatePage = mainList.pages?.[pageIndex];
    if (!templatePage) return page;
    const override = templateOverrides?.[String(pageIndex)];
    if (override) {
      return {
        ...page,
        title: override.title,
        subtitle: override.subtitle,
      };
    }
    const templateTitle = templatePage.title;
    const templateSubtitle = templatePage.subtitle;
    return {
      ...page,
      ...(String(templateTitle ?? '').trim() ? {} : { title: '' }),
      ...(String(templateSubtitle ?? '').trim() ? {} : { subtitle: '' }),
    };
  });
}

/** Xóa override của một list; trả về false nếu không có gì để xóa. */
export function removeListOverrides(store: PageTextOverrideStore, deckId: string, listId: string): boolean {
  const deck = store.decks[deckId];
  if (!deck?.[listId]) return false;
  delete deck[listId];
  if (Object.keys(deck).length === 0) delete store.decks[deckId];
  store.savedAt = new Date().toISOString();
  return true;
}
