import { renderThreadsToplistCover, renderThreadsToplistPage } from './threadsToplist.js';
import { escapeHtml, sanitizeFilePart } from './utils.js';
import { renderLocalTemplate } from './localTemplates.js';
import { renderItineraryNotePage, renderItineraryNoteTimedPage } from './itineraryNote.js';
import { renderThreadsBudgetPage } from './threadsBudget.js';
import { photoRenderArguments, strictPhotoMarkup } from './photoPresets.mjs';
import { compactThreadsLocalAddress } from './threadsFoodExport.mjs';
import { renderOneWayStoryCover, renderOneWayStoryPhoto, renderOneWayStoryRoad, renderOneWayStorySlope } from './markup/oneWayStory.js';
import { isSpotlightLayout, isSpotlightPartnerCover, renderCarouselMau1Cover, renderCarouselMau1Page, renderSpotlightDiaryPage, renderSpotlightListPage, renderSpotlightPage, renderSpotlightPartnerInfoPage, renderSpotlightPartnerPage, renderSpotlightPartnerV2InfoPage, renderSpotlightPartnerV2Page, renderSpotlightV2Cover, renderSpotlightV2ListPage, renderSpotlightV2Page, renderSpotlightV4Cover, renderSpotlightV4ImagePage, renderSpotlightV4VenuePage, renderSpotlightV5Cover, renderSpotlightV5PlacePage, renderSpotlightV5PlaylistPage, renderSpotlightV6Cover, renderSpotlightV6ImagePage, renderSpotlightV6MapPage, renderSpotlightV6MapPlace, renderSpotlightV6VenuePage, renderSummaryNotePage } from './markup/spotlight.js';
import { grid8FeedCenterHook, grid8IntroForPage, isGrid4FeaturePage, isGridLayout, renderGrid4FeaturePage, renderGrid4MutantContentPage, renderGrid4MutantCover, renderGrid5Cover, renderGrid5Page, renderGrid6Items, renderGrid6QuaytungCover, renderGrid6QuaytungPageBody, renderGrid8FeedCover, renderGrid8FeedItems, renderGrid8FeedPageBackground, renderGrid8Items, renderGrid8QuaytungCover, renderGrid8QuaytungItems, renderGrid8QuaytungMenuPage, renderPhotomodeItems, renderZigzagContentPage, renderZigzagCover } from './markup/grid.js';
import { isJourneyGrid8Layout, journeyGrid8Intro, renderItinerary4N3DStackCover, renderItinerary4N3DStackPage, renderItineraryItems, renderItineraryTimelineCover, renderItineraryTimelineDay, renderJourney4N3DItems } from './markup/itinerary.js';
import { renderPov3V2Cover, renderPov3V2GridPage, renderPov3V2StackPage, renderPovMaikemCover, renderPovMaikemPage } from './markup/pov.js';
import { cleanStoryText, isBudget3N2DCover, isBudget3N2DStoryCover, renderBudget3N2DDayPage, renderBudget3N2DGalleryCornerPage, renderBudget3N2DTablePage, renderBudget3N2DTotalPage, renderBudgetWalletBillPage, renderBudgetWalletCover, renderBudgetWalletDayPage, renderBudgetWalletFixedPage } from './markup/budget.js';
import { V2_COVER_VARIANTS, V2_LIST_VARIANTS, coverBackgroundImage, firstPortablePageImage, formatBalancedTitleLines, isActivityListPage, isServiceListPage, isServiceOrStayListPage, polishShortVietnameseCopy, portablePageImageCandidates, renderInlineHashtags, renderListItems, renderPreviewImage, responsiveTitleFitClass, sanitizeSubtitleForDisplay, storyPageClass } from './markup/shared.js';
export { pageCounter, renderInlineHashtags, setSpotlightV2CoverImagePool, renderListItems } from './markup/shared.js';
export { renderPhotomodeItems, renderGrid6Items, renderGrid8Items } from './markup/grid.js';
export { renderItineraryItems, renderJourney4N3DItems } from './markup/itinerary.js';

function renderCoverPageV2(page, index, listId, coverTitle, coverSubtitle, backgroundImage, coverImageUrls = []) {
  if (page.layoutVariant === 'threads-toplist-cover') return renderThreadsToplistCover(page, index, listId);
  if (page.layoutVariant === 'one-way-story-cover') {
    return renderOneWayStoryCover(page, index, listId, coverTitle, backgroundImage);
  }
  if (page.layoutVariant === 'carousel-mau-1-cover') {
    return renderCarouselMau1Cover(page, index, listId, coverTitle, backgroundImage);
  }
  if (page.layoutVariant === 'grid-8-feed') {
    return renderGrid8FeedCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage, coverImageUrls);
  }
  if (page.layoutVariant === 'itinerary-4n3d-stack-cover') {
    return renderItinerary4N3DStackCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage, coverImageUrls);
  }
  if (page.layoutVariant === 'itinerary-timeline-cover') {
    return renderItineraryTimelineCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage);
  }
  if (page.layoutVariant === 'grid-6-quaytung-cover') {
    return renderGrid6QuaytungCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage);
  }
  if (page.layoutVariant === 'grid-8-quaytung-cover') {
    return renderGrid8QuaytungCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage);
  }
  if (page.layoutVariant === 'grid-5') {
    return renderGrid5Cover(page, index, listId, coverTitle, coverSubtitle, backgroundImage);
  }
  if (page.layoutVariant === 'spotlight-v2' || page.layoutVariant === 'spotlight-v3') {
    return renderSpotlightV2Cover(page, index, listId, coverTitle, coverSubtitle, backgroundImage, { coverImageUrls });
  }
  if (page.layoutVariant === 'spotlight-v4-cover') {
    return renderSpotlightV4Cover(page, index, listId, coverTitle, backgroundImage);
  }
  if (page.layoutVariant === 'spotlight-v6-cover') {
    return renderSpotlightV6Cover(page, index, listId, coverTitle, backgroundImage);
  }
  if (page.layoutVariant === 'spotlight-v5-cover') {
    return renderSpotlightV5Cover(page, index, listId, coverTitle, backgroundImage);
  }
  if (page.layoutVariant === 'spotlight-partner-v2') {
    return renderSpotlightV2Cover(page, index, listId, coverTitle, coverSubtitle, backgroundImage, { partner: true, coverImageUrls });
  }
  if (page.layoutVariant === 'pov-maikem') {
    return renderPovMaikemCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage);
  }
  if (page.layoutVariant === 'pov-3-v2-cover') {
    return renderPov3V2Cover(page, index, listId, page.title || coverTitle, coverSubtitle, backgroundImage);
  }
  if (page.layoutVariant === 'budget-wallet-cover') {
    return renderBudgetWalletCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage);
  }
  return '';
}

function renderListPageV2(page, index, listId, list, pageSubtitle) {
  if (page.layoutVariant === 'threads-toplist-page') return renderThreadsToplistPage(page, index, listId);
  if (page.layoutVariant === 'one-way-story-road') {
    return renderOneWayStoryRoad(page, index, listId);
  }
  if (page.layoutVariant === 'one-way-story-slope') {
    return renderOneWayStorySlope(page, index, listId);
  }
  if (page.layoutVariant === 'one-way-story-photo') {
    return renderOneWayStoryPhoto(page, index, listId);
  }
  if (page.layoutVariant === 'carousel-mau-1-page') {
    return renderCarouselMau1Page(page, index, listId, list);
  }
  if (page.layoutVariant === 'grid-8-feed') {
    const centerHook = grid8FeedCenterHook(page, list);
    const showAddress = !isActivityListPage(page);
    const backgroundImage = page.backgroundImage || page.items?.[0]?.imageUrl || coverBackgroundImage(page, list);
    const coverImageUrls = list?.coverImageUrls || [];
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'grid8-feed-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        ${renderGrid8FeedPageBackground(page, backgroundImage, listId, coverImageUrls)}
        <div class="grid8-feed-page-dim" aria-hidden="true"></div>
        <div class="grid8-feed-matrix">
          ${renderGrid8FeedItems(page.items, centerHook, showAddress)}
        </div>
      </article>
    `;
  }
  if (page.layoutVariant === 'grid-6-quaytung') {
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'grid6-quaytung-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        ${renderGrid6QuaytungPageBody(page, page.items)}
      </article>
    `;
  }
  if (page.layoutVariant === 'grid-8-quaytung') {
    const bg = page.backgroundImage || page.items?.[0]?.imageUrl || coverBackgroundImage(page, list);
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'grid8-quaytung-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        <div class="grid8-quaytung-matrix">
          ${renderGrid8QuaytungItems(page, page.items, bg)}
        </div>
      </article>
    `;
  }
  if (page.layoutVariant === 'grid-8-quaytung-menu') {
    return renderGrid8QuaytungMenuPage(page, index, listId, list);
  }
  if (page.layoutVariant === 'grid-5') {
    return renderGrid5Page(page, index, listId, pageSubtitle, list);
  }
  if (page.layoutVariant === 'spotlight-v2' || page.layoutVariant === 'spotlight-v3') {
    return renderSpotlightV2Page(page, index, listId, list);
  }
  if (page.layoutVariant === 'spotlight-v4-image') {
    return renderSpotlightV4ImagePage(page, index, listId);
  }
  if (page.layoutVariant === 'itinerary-note-day' || page.layoutVariant === 'itinerary-note-dark-day' || page.layoutVariant === 'itinerary-note-threads-day') return renderItineraryNotePage(page, index, listId);
  if (page.layoutVariant === 'itinerary-note-threads-budget') return renderThreadsBudgetPage(page, index, listId);
  if (page.layoutVariant === 'itinerary-note-timed-day') return renderItineraryNoteTimedPage(page, index, listId);
  if (page.layoutVariant === 'summary-note-page') {
    return renderSummaryNotePage(page, index, listId);
  }
  if (page.layoutVariant === 'spotlight-v6-image') {
    return renderSpotlightV6ImagePage(page, index, listId);
  }
  if (page.layoutVariant === 'spotlight-v6-map-page') {
    return renderSpotlightV6MapPage(page, index, listId);
  }
  if (page.layoutVariant === 'spotlight-v6-diary-page') return renderSpotlightDiaryPage(page, index, listId);
  if (page.layoutVariant === 'spotlight-v6-map-place') {
    return renderSpotlightV6MapPlace(page, index, listId);
  }
  if (page.layoutVariant === 'spotlight-v6-page') {
    return renderSpotlightV6VenuePage(page, index, listId, list);
  }
  if (page.layoutVariant === 'spotlight-v5-playlist') {
    return renderSpotlightV5PlaylistPage(page, index, listId);
  }
  if (page.layoutVariant === 'spotlight-v5-place') {
    return renderSpotlightV5PlacePage(page, index, listId);
  }
  if (page.layoutVariant === 'spotlight-v4-page') {
    return renderSpotlightV4VenuePage(page, index, listId, list);
  }
  if (page.layoutVariant === 'spotlight-partner-v2') {
    return renderSpotlightPartnerV2Page(page, index, listId, list);
  }
  if (page.layoutVariant === 'spotlight-v2-list') {
    return renderSpotlightV2ListPage(page, index, listId, list, pageSubtitle);
  }
  if (page.layoutVariant === 'spotlight-partner-v2-info') {
    return renderSpotlightPartnerV2InfoPage(page, index, listId, list);
  }
  if (page.layoutVariant === 'pov-maikem') {
    return renderPovMaikemPage(page, index, listId);
  }
  if (page.layoutVariant === 'pov-3-v2-stack') {
    return renderPov3V2StackPage(page, index, listId);
  }
  if (page.layoutVariant === 'pov-3-v2-grid' || page.layoutVariant === 'pov-3-v2-grid-food') {
    return renderPov3V2GridPage(page, index, listId, pageSubtitle);
  }
  if (page.layoutVariant === 'itinerary-4n3d-stack-page') {
    return renderItinerary4N3DStackPage(page, index, listId, pageSubtitle);
  }
  if (page.layoutVariant === 'itinerary-timeline-day') {
    return renderItineraryTimelineDay(page, index, listId);
  }
  if (page.layoutVariant === 'budget-wallet-day') {
    return renderBudgetWalletDayPage(page, index, listId, list);
  }
  if (page.layoutVariant === 'budget-wallet-fixed') {
    return renderBudgetWalletFixedPage(page, index, listId);
  }
  if (page.layoutVariant === 'budget-wallet-bill') {
    return renderBudgetWalletBillPage(page, index, listId);
  }
  return '';
}

/**
 * Trang bìa → HTML. args: index, total, listId, hashtags, list, coverImageUrls (photoRenderArguments có thể chèn preset).
 * @param {import('./types').CoverPage} page
 * @param {...any} args
 * @returns {string}
 */
export function renderCoverPage(page, ...args) {
  const render = photoRenderArguments(page, args);
  return strictPhotoMarkup(withPageTextScale(renderCoverPageContent(render.page, .../** @type {[number, number, string, string[]?, any?, string[]?]} */ (render.args)), render.page), render.preset);
}

function withPageTextScale(html, page) {
  if (page.spotlightDesignRevision === 1) html = html.replace('class="story-page ', `class="story-page spotlight-design-1 ${isServiceListPage(page) ? 'spotlight-service-list ' : ''}`);
  const scale = Math.max(50, Math.min(100, Number(page.textScale) || 100));
  const size = Number(page.textFontSize);
  const font = Number.isFinite(size) && size >= 8 && size <= 72 ? ` data-text-font-size="${size}"` : '';
  return html.replace('<article ', `<article data-text-scale="${scale}"${font} `);
}

/**
 * @param {import('./types').CoverPage} page
 * @param {number} index
 * @param {number} total
 * @param {string} listId
 * @param {string[]} [hashtags]
 * @param {import('./types').GuideDeckList | null} [list]
 * @param {string[]} [coverImageUrls]
 * @returns {string}
 */
function renderCoverPageContent(page, index, total, listId, hashtags = [], list = null, coverImageUrls = []) {
  if (page.localRender) return renderLocalTemplate(page, index, listId);
  const coverSubtitle = sanitizeSubtitleForDisplay(page.subtitle, list?.pages || []);
  const coverTitle = polishShortVietnameseCopy(page.title);
  const backgroundImage = coverBackgroundImage(page, list);
  if (page.layoutVariant === 'grid-5') {
    return renderGrid5Cover(page, index, listId, coverTitle, coverSubtitle, backgroundImage);
  }
  if (V2_COVER_VARIANTS.has(page.layoutVariant)) {
    const v2Html = renderCoverPageV2(page, index, listId, coverTitle, coverSubtitle, backgroundImage, coverImageUrls);
    if (v2Html) return v2Html;
  }
  if (page.layoutVariant === 'grid-6-zigzag') {
    return renderZigzagCover(page, index, listId);
  }
  if (page.layoutVariant === 'grid-4-mutant') {
    return renderGrid4MutantCover(page, index, listId);
  }
  if (isBudget3N2DCover(page)) {
    const title = String(coverTitle || '').trim();
    const titleFitClass = responsiveTitleFitClass(title, 'budget72-title', 32, 50);
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'budget72-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
        <div class="budget72-cover-bg">
          ${renderPreviewImage(backgroundImage, title)}
        </div>
        <div class="budget72-cover-shade"></div>
        <div class="budget72-cover-copy">
          <div class="budget72-script">dalat.</div>
          ${title ? `<h1 class="budget72-title ${escapeHtml(titleFitClass)}">${formatBalancedTitleLines(title, 3)}</h1>` : ''}
          ${coverSubtitle ? `<p class="budget72-subtitle">${escapeHtml(coverSubtitle)}</p>` : ''}
        </div>
      </article>
    `;
  }

  if (isBudget3N2DStoryCover(page)) {
    const title = coverTitle ? cleanStoryText(coverTitle, '') : '';
    const subtitle = coverSubtitle ? cleanStoryText(coverSubtitle, '') : '';
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'budget72-story-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
        <div class="budget72-story-bg">
          ${renderPreviewImage(backgroundImage, title)}
        </div>
        <div class="budget72-story-cover-shade"></div>
        <div class="budget72-story-cover-copy">
          <div class="budget72-story-script">dalat.</div>
          ${title ? `<h1>${escapeHtml(title)}</h1>` : ''}
          ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
        </div>
      </article>
    `;
  }

  if (isSpotlightLayout(page) || isSpotlightPartnerCover(page)) {
    const coverClass = isSpotlightPartnerCover(page) ? 'spotlight-cover spotlight-partner-cover' : 'spotlight-cover';
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'grid4-feature-cover', coverClass))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
        <div class="grid4-feature-bg">
          ${renderPreviewImage(backgroundImage, coverTitle)}
        </div>
        <div class="grid4-feature-shade"></div>
        <div class="grid4-feature-copy">
          ${isSpotlightPartnerCover(page) ? `<div class="spotlight-partner-cover-script">dalat.</div>` : ''}
          ${coverTitle ? `<h1 class="grid4-feature-title spotlight-cover-hook">${escapeHtml(coverTitle)}</h1>` : ''}
          ${coverSubtitle ? `<p class="grid4-feature-subtitle spotlight-cover-caption">${escapeHtml(coverSubtitle)}</p>` : ''}
        </div>
      </article>
    `;
  }

  if (isJourneyGrid8Layout(page)) {
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'grid8-cover-page', 'journey-grid8-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
        <div class="grid8-cover-photo">
          ${renderPreviewImage(backgroundImage, coverTitle)}
        </div>
        <div class="grid8-cover-shade"></div>
        <div class="grid8-cover-copy">
          <h1 class="grid8-cover-title">${escapeHtml(coverTitle)}</h1>
          <p class="grid8-cover-subtitle">${escapeHtml(coverSubtitle)}</p>
        </div>
      </article>
    `;
  }

  if (page.layoutVariant === 'grid-8') {
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'grid8-cover-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
        <div class="grid8-cover-photo">
          ${renderPreviewImage(backgroundImage, coverTitle)}
        </div>
        <div class="grid8-cover-shade"></div>
        <div class="grid8-cover-copy">
          <h1 class="grid8-cover-title">${escapeHtml(coverTitle)}</h1>
          <p class="grid8-cover-subtitle">${escapeHtml(coverSubtitle)}</p>
        </div>
      </article>
    `;
  }

  if (isGridLayout(page)) {
    const gridVariantClass = page.layoutVariant === 'grid-4'
      ? ' grid4-cover'
      // @ts-expect-error -- 'grid-8' đã return ở nhánh riêng phía trên; nhánh này không chạy tới.
      : page.layoutVariant === 'grid-8'
        ? ' grid8-cover'
        : '';
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'grid6-cover', gridVariantClass.trim()))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
        <div class="grid6-cover-bg">
          ${renderPreviewImage(backgroundImage, coverTitle)}
        </div>
        <div class="grid6-cover-overlay">
           <div class="grid6-cover-header">ĐÀ LẠT</div>
           <h1 class="grid6-cover-title ${escapeHtml(responsiveTitleFitClass(coverTitle, 'grid6-cover-title', 34, 52))}">${escapeHtml(coverTitle)}</h1>
            <div class="grid6-cover-subtitle">${escapeHtml(coverSubtitle)}</div>
        </div>
      </article>
    `;
  }

  if (page.layoutVariant === 'journey-4n3d') {
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'journey-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
        <div class="journey-cover-photo">
          ${renderPreviewImage(backgroundImage, coverTitle)}
        </div>
        <div class="journey-cover-panel">
          <div class="journey-cover-kicker">LỊCH TRÌNH 4N3Đ</div>
          <h1 class="journey-cover-title">${escapeHtml(coverTitle)}</h1>
          <p class="journey-cover-subtitle">${escapeHtml(coverSubtitle)}</p>
          <div class="journey-route-pills">
            <span>Day 01</span>
            <span>Day 02</span>
            <span>Day 03</span>
            <span>Day 04</span>
          </div>
        </div>
      </article>
    `;
  }

  if (page.layoutVariant === 'photomode') {
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'photomode', 'photomode-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
        <div class="photomode-cover-bg">
          ${renderPreviewImage(backgroundImage, coverTitle)}
        </div>
        <div class="photomode-cover-copy">
          <h3 class="photomode-cover-title">${escapeHtml(coverTitle)}</h3>
          <p class="photomode-cover-subtitle">${escapeHtml(coverSubtitle)}</p>
        </div>
      </article>
    `;
  }

  const hashtagsHtml = renderInlineHashtags(hashtags);
  const hashtagClass = Array.isArray(hashtags) && hashtags.length > 0 ? ' has-inline-hashtags' : '';
  return `
    <article class="${escapeHtml(storyPageClass(listId, hashtagClass.trim()))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="page-cover">
        ${renderPreviewImage(backgroundImage, coverTitle)}
      </div>
      <div class="cover-copy">
        <div class="cover-script">Da Lat</div>
        <h3 class="cover-title">${escapeHtml(coverTitle)}</h3>
        <p class="cover-subtitle">${escapeHtml(coverSubtitle)}</p>
      </div>
    </article>
  `;
}

/**
 * Trang nội dung → HTML. args: index, total, listId, hashtags, list.
 * @param {import('./types').ListPage} page
 * @param {...any} args
 * @returns {string}
 */
export function renderListPage(page, ...args) {
  const render = photoRenderArguments(page, args);
  return strictPhotoMarkup(withPageTextScale(renderListPageContent(render.page, .../** @type {[number, number, string, string[]?, any?]} */ (render.args)), render.page), render.preset);
}

/**
 * @param {import('./types').ListPage} page
 * @param {number} index
 * @param {number} total
 * @param {string} listId
 * @param {string[]} [hashtags]
 * @param {import('./types').GuideDeckList | null} [list]
 * @returns {string}
 */
function renderListPageContent(page, index, total, listId, hashtags = [], list = null) {
  if (page.localRender) return renderLocalTemplate(page, index, listId);
  const pageSubtitle = sanitizeSubtitleForDisplay(page.subtitle, list?.pages || [page]);
  if (String(listId || '').startsWith('threads-food-local') || String(listId || '').startsWith('threads-cafe-local') || String(listId || '').startsWith('threads-mix-local') || String(listId || '').startsWith('threads-mix-text')) {
    const items = Array.isArray(page.items) ? page.items : [];
    const isCafe = String(listId || '').startsWith('threads-cafe-local');
    const isMix = String(listId || '').startsWith('threads-mix-local');
    const isTextOnly = String(listId || '').startsWith('threads-mix-text');
    return '<article class="' + escapeHtml(storyPageClass(listId, 'threads-food-preview', isTextOnly ? 'threads-food-preview--text-only' : ''))
      + '" data-list-id="' + escapeHtml(listId) + '" data-page-index="' + index + '">'
      + '<div class="threads-food-preview-head"><span>THREADS · XEM TRƯỚC</span><h2>'
      + escapeHtml(page.title || (isTextOnly ? 'List Đà Lạt lưu lại nè' : isMix ? 'Đi đâu ở Đà Lạt?' : isCafe ? 'Cà phê nào ở Đà Lạt?' : 'Ăn gì ở Đà Lạt?'))
      + '</h2><p>File xuất gồm TXT ' + (isTextOnly ? '12' : '10') + ' ' + (isMix || isTextOnly ? 'địa điểm đa nhóm' : isCafe ? 'quán cà phê' : 'quán ăn')
      + ', XLSX ' + items.filter(item => item.isPartner).length + ' đối tác' + (isTextOnly ? '; không có ảnh' : page.photoPreset ? ' và 6 ảnh Color Edit' : ' và 6 ảnh gốc') + '; không xuất khung preview này.</p></div>'
      + '<ul class="threads-food-preview-list">'
      + items.map((item) => '<li>' + escapeHtml(item.name || '')
        + (item.isPartner && item.metaPrimary ? ' (' + escapeHtml(compactThreadsLocalAddress(item.metaPrimary)) + ')' : '') + '</li>').join('')
      + '</ul>' + (isTextOnly ? '' : '<div class="threads-food-preview-photos">'
        + items.filter((item) => item.imageUrl).map((item) => '<img src="' + escapeHtml(item.imageUrl)
          + '" alt="' + escapeHtml(item.name || '') + '" loading="lazy" />').join('')
        + '</div>') + '</article>';
  }
  if (page.layoutVariant === 'grid-5') {
    return renderGrid5Page(page, index, listId, pageSubtitle, list);
  }
  if (V2_LIST_VARIANTS.has(page.layoutVariant)) {
    const v2Html = renderListPageV2(page, index, listId, list, pageSubtitle);
    if (v2Html) return v2Html;
  }
  if (isSpotlightLayout(page)) {
    return renderSpotlightPage(page, index, listId, list, pageSubtitle);
  }

  if (page.layoutVariant === 'spotlight-partner') {
    return renderSpotlightPartnerPage(page, index, listId, list);
  }

  if (page.layoutVariant === 'spotlight-partner-info') {
    return renderSpotlightPartnerInfoPage(page, index, listId, list);
  }

  if (page.layoutVariant === 'spotlight-list') {
    return renderSpotlightListPage(page, index, listId, list, pageSubtitle);
  }

  if (page.layoutVariant === 'budget-3n2d-table') {
    return renderBudget3N2DTablePage(page, index, listId);
  }

  if (page.layoutVariant === 'budget-3n2d-gallery') {
    return renderBudget3N2DGalleryCornerPage(page, index, listId, list);
  }

  if (page.layoutVariant === 'budget-3n2d-day') {
    return renderBudget3N2DDayPage(page, index, listId, list);
  }

  if (page.layoutVariant === 'budget-3n2d-total') {
    return renderBudget3N2DTotalPage(page, index, listId, list);
  }

  if (page.layoutVariant === 'photomode') {
    const photomodeTitleHtml = /^pov-3-day/i.test(String(listId || '')) && page.title
      ? `
        <div class="photomode-page-heading">
          <span>${escapeHtml(page.chipText || '')}</span>
          <h3>${escapeHtml(page.title)}</h3>
        </div>
      `
      : '';
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'photomode'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        ${photomodeTitleHtml}
        <div class="photomode-stack">
          ${renderPhotomodeItems(page.items)}
        </div>
      </article>
    `;
  }

  if (page.layoutVariant === 'grid-8') {
    const grid8Title = page.title;
    const grid8Intro = grid8IntroForPage(page, pageSubtitle, list);
    const showAddress = !isActivityListPage(page);
    const grid8Background = page.backgroundImage || firstPortablePageImage(page) || coverBackgroundImage(page, list);
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'grid8-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        <div class="grid8-matrix">
          ${renderGrid8Items(page.items, grid8Title, page.chipText, grid8Background, grid8Intro, { showLabel: isServiceOrStayListPage(page), showAddress })}
        </div>
      </article>
    `;
  }

  if (isJourneyGrid8Layout(page)) {
    const hideCenterChip = page.chipText === 'Lưu trú' || page.chipText === 'Homestay' || page.chipText === 'Dịch vụ';
    const showJourneyServiceLabel = isServiceOrStayListPage(page) || hideCenterChip;
    const showAddress = !isActivityListPage(page);
    const journeyBackground = page.backgroundImage || firstPortablePageImage(page) || coverBackgroundImage(page, list);
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'grid8-page', 'journey-grid8-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        <div class="grid8-matrix">
          ${renderGrid8Items(page.items, page.title, page.chipText, journeyBackground, journeyGrid8Intro(page), { showTime: false, showMeta: true, showCenterChip: !hideCenterChip, showLabel: showJourneyServiceLabel, showAddress })}
        </div>
      </article>
    `;
  }

  if (page.layoutVariant === 'grid-6-zigzag') {
    // @ts-expect-error -- trang bìa luôn được chuyển sang renderCoverPage (SlideCard, xuất ảnh, partnerNames); nhánh phòng thủ.
    if (page.type === 'cover') {
      return renderZigzagCover(page, index, listId);
    }
    return renderZigzagContentPage(page, index, listId);
  }

  if (page.layoutVariant === 'grid-4-mutant') {
    // @ts-expect-error -- trang bìa luôn được chuyển sang renderCoverPage (SlideCard, xuất ảnh, partnerNames); nhánh phòng thủ.
    if (page.type === 'cover') {
      return renderGrid4MutantCover(page, index, listId);
    }
    return renderGrid4MutantContentPage(page, index, listId);
  }

  if (isGridLayout(page)) {
    if (isGrid4FeaturePage(page)) {
      return renderGrid4FeaturePage(page, index, listId, list, pageSubtitle);
    }

    const gridVariantClass = page.layoutVariant === 'grid-4'
      ? ' grid4'
      // @ts-expect-error -- 'grid-8' đã return ở nhánh riêng phía trên; nhánh này không chạy tới.
      : page.layoutVariant === 'grid-8'
        ? ' grid8'
        : '';
    const gridBodyClass = page.layoutVariant === 'grid-4'
      ? ' grid4-body'
      // @ts-expect-error -- 'grid-8' đã return ở nhánh riêng phía trên; nhánh này không chạy tới.
      : page.layoutVariant === 'grid-8'
        ? ' grid8-body'
        : '';
    const showServiceLabel = isServiceOrStayListPage(page);
    const showAddress = !isActivityListPage(page);
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'grid6', gridVariantClass.trim()))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        <div class="grid6-header">
           <div class="grid6-header-top">${escapeHtml(page.title)}</div>
        </div>
        <div class="grid6-body${gridBodyClass}">
          ${renderGrid6Items(page.items, { showLabel: showServiceLabel, showAddress })}
        </div>
      </article>
    `;
  }

  if (page.layoutVariant === 'journey-4n3d') {
    const dayNumber = String(Math.max(index, 1)).padStart(2, '0');
    const dayMatch = String(page.chipText || '').trim().match(/^day\s*0*(\d+)$/i);
    const badgeLabel = dayMatch ? `Ngày ${Number(dayMatch[1])}` : String(page.chipText || '').trim();
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'journey4', `journey-page-${dayNumber}`))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        <div class="journey-bg">${renderPreviewImage(page.backgroundImage, page.title, '', portablePageImageCandidates(page, page.backgroundImage))}</div>
        <div class="journey-day-badge">${escapeHtml(badgeLabel)}</div>
        <div class="journey-card">
          ${renderJourney4N3DItems(page.items)}
        </div>
      </article>
    `;
  }

  const variantClass = page.layoutVariant === 'dense'
    ? ' dense'
    : page.layoutVariant === 'itinerary'
      ? ' itinerary'
      : page.layoutVariant === 'compact'
        ? ' compact'
      : '';
  const crowdedClass = Array.isArray(page.items) && page.items.length >= 6 ? ' crowded' : '';
  const hashtagsHtml = renderInlineHashtags(hashtags);
  const hashtagClass = Array.isArray(hashtags) && hashtags.length > 0 ? ' has-inline-hashtags' : '';
  const itemsHtml = page.layoutVariant === 'itinerary'
    ? renderItineraryItems(page.items)
    : renderListItems(page.items);
  return `
    <article class="${escapeHtml(storyPageClass(listId, variantClass.trim(), crowdedClass.trim(), hashtagClass.trim()))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
      <div class="page-shell-bg">${renderPreviewImage(page.backgroundImage, page.title, '', portablePageImageCandidates(page, page.backgroundImage))}</div>
      <div class="page-card">
        <div class="page-chip chip-${escapeHtml(page.chipTone)}">${escapeHtml(page.chipText)}</div>
        <h3 class="page-title">${escapeHtml(page.title)}</h3>
        <p class="page-lead">${escapeHtml(pageSubtitle)}</p>
        <div class="item-stack">
          ${itemsHtml}
        </div>
      </div>
    </article>
  `;
}
