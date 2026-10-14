// Mẫu lưới: grid 4/5/6/8, mutant, zigzag, quay tưng, feed và photomode.
import { escapeHtml, sanitizeFilePart } from '../utils.js';
import { cleanGridAddress, compactGridItemName, coverBackgroundImage, firstPortablePageImage, formatBalancedTitleLines, formatGrid8FeedCoverTagline, gridContextKey, gridDisplayName, gridPageKind, gridPriceMetaFromSecondary, imageSourceClass, isActivityListPage, isPortableImageUrl, isServiceOrStayListPage, pickListVariant, pickUniqueCoverGridImages, polishShortVietnameseCopy, portraitFocusClass, renderPhotomodePin, renderPreviewImage, responsiveTitleFitClass, shouldShowItemAddress, spotlightV2CoverImagePool, storyPageClass, truncateMenuLine } from './shared.js';

function grid4FeatureBackgroundImage(page, list) {
  if (isPortableImageUrl(page.backgroundImage)) return page.backgroundImage;
  return firstPortablePageImage(page) || coverBackgroundImage(page, list);
}

export function isGridLayout(page) {
  return page.layoutVariant === 'grid-6' || page.layoutVariant === 'grid-8' || page.layoutVariant === 'grid-4';
}

export function isGrid4FeaturePage(page) {
  return page?.layoutVariant === 'grid-4' && page?.type === 'cover';
}

function sameGridText(left, right) {
  return gridContextKey(left) === gridContextKey(right);
}

const GRID8_INTRO_VARIANTS = {
  food: [
    'Nhóm quán ăn được gom riêng để người xem chọn bữa nhanh, dễ scan trước khi đi.',
    'Một trang chỉ dành cho đồ ăn, ưu tiên chỗ dễ gọi món và tiện ghé theo lịch.',
    'Ghim sẵn các quán ăn để lúc đói chỉ cần mở list, chọn nhanh, khỏi lướt lại.',
    'Các quán được lọc riêng để dễ đổi bữa mà không làm rối lịch di chuyển.',
    'Trang này gom các quán đáng thử, hợp để chốt bữa chính hoặc bữa phụ trong ngày.',
    'Một cụm địa chỉ ăn ngon, gọn mắt, dành cho lúc cần quyết nhanh trong chuyến đi.',
  ],
  cafe: [
    'Các quán cafe nên lưu riêng để chọn điểm ngồi chill, nghỉ chân hoặc chụp ảnh.',
    'Trang cafe này ưu tiên chỗ có không khí dễ chịu, hợp để dừng lại giữa lịch đi.',
    'Ghim trước vài quán cafe để có điểm nghỉ, lên ảnh đẹp và không phải tìm phút cuối.',
    'Một cụm cafe để đổi nhịp chuyến đi: ngồi lâu được, chụp ổn, di chuyển vừa phải.',
    'Các điểm cafe được gom riêng cho lúc muốn chậm lại mà vẫn có ảnh đẹp mang về.',
    'Trang này dành cho mood cafe: chọn nhanh một chỗ ngồi, rồi để Đà Lạt tự dịu lại.',
  ],
  checkin: [
    'Một trang scan nhanh các điểm check-in, ưu tiên tên ngắn và hình ảnh rõ.',
    'Các góc lên hình được tách riêng để dễ chọn điểm chụp theo cung đường trong ngày.',
    'Ghim sẵn các điểm check-in để lúc trời đẹp chỉ cần mở list và đi thẳng.',
    'Trang này gom các điểm nhìn phát hiểu ngay, hợp cho lịch cần ảnh đẹp mà không vòng vèo.',
    'Một cụm điểm chụp dễ scan, giúp bạn chọn nhanh nơi đáng ghé nhất trong buổi đó.',
    'Các địa điểm lên ảnh ổn được xếp riêng để chuyến đi có vài khung hình chắc tay.',
  ],
  nightlife: [
    'Các điểm đi buổi tối, ăn đêm và nghe nhạc được tách riêng để dễ lưu sau 20h.',
    'Trang này dành cho buổi tối: chọn chỗ ăn, nghe nhạc hoặc đổi không khí sau lịch ngày.',
    'Ghim riêng các điểm chơi đêm để tối đến không phải lục lại cả list dài.',
    'Một cụm lựa chọn sau hoàng hôn, hợp để kéo dài lịch mà vẫn dễ quyết.',
    'Các điểm buổi tối được gom riêng để lịch đêm có nhịp, có món, có chỗ ngồi.',
    'Trang này giúp chốt nhanh phần sau 20h: ăn nhẹ, đi nghe nhạc hoặc ghé một nơi có vibe.',
  ],
  service: [
    'Các dịch vụ hỗ trợ chuyến đi được gom riêng để người xem dễ liên hệ nhanh.',
    'Trang dịch vụ này để lưu những thứ cần chốt trước: xe, đồ, quà hoặc hỗ trợ tại chỗ.',
    'Ghim riêng nhóm dịch vụ để lúc cần liên hệ không phải trộn với quán ăn và điểm chơi.',
    'Một trang thực dụng cho chuyến đi: các mục cần chuẩn bị, đặt trước hoặc lưu số.',
    'Các dịch vụ quan trọng được tách riêng để lịch đi trơn hơn và ít phải xử lý gấp.',
    'Trang này gom những thứ hậu cần nên có sẵn trước khi bắt đầu chạy lịch.',
  ],
  stay: [
    'Các chỗ nghỉ nên xem riêng để dễ chốt phòng, không trộn với dịch vụ khác.',
    'Trang lưu trú này giúp so nhanh vài lựa chọn trước khi quyết chỗ ở cho chuyến đi.',
    'Ghim riêng homestay để lúc chốt phòng có ngay nhóm lựa chọn sạch và dễ xem.',
    'Một cụm chỗ nghỉ để cân vị trí, vibe và lịch di chuyển trước khi đặt.',
    'Các lựa chọn lưu trú được tách riêng để không lẫn với điểm chơi trong ngày.',
    'Trang này dành cho bước chốt nơi ở: xem nhanh, so nhanh, rồi quay lại lịch đi.',
  ],
  activity: [
    'Các hoạt động và điểm ghé được gom riêng để đổi nhịp cho lịch đi.',
    'Trang hoạt động này thêm lựa chọn trải nghiệm, hợp khi muốn chuyến đi bớt chỉ check-in.',
    'Ghim các hoạt động riêng để dễ chen vào lịch khi còn dư thời gian hoặc muốn đổi mood.',
    'Một cụm trải nghiệm để ngày đi có thêm việc đáng làm, không chỉ chụp ảnh rồi đi tiếp.',
    'Các hoạt động được tách riêng để bạn chọn nhịp vui hơn cho từng buổi.',
    'Trang này dành cho những lúc muốn làm gì đó khác hơn: ghé, thử, chơi, rồi đi tiếp.',
  ],
  tourism: [
    'Các khu du lịch được tách riêng khỏi trang check-in để người xem cân lịch dễ hơn.',
    'Trang khu du lịch này hợp để chọn điểm đi dài hơi, cần cân thời gian hơn điểm ghé nhanh.',
    'Ghim riêng các khu du lịch để dễ quyết nơi nào đáng dành hẳn một buổi.',
    'Một cụm điểm lớn hơn, phù hợp khi muốn có lịch rõ thay vì chỉ ghé chụp nhanh.',
    'Các khu du lịch được gom riêng để bạn xem trước độ xa, độ rộng và thời gian cần dành.',
    'Trang này giúp chọn các điểm đi chính trong ngày, trước khi thêm cafe hay điểm ăn.',
  ],
  generic: [
    'Trang này gom riêng các mục cùng nhóm để scan nhanh và lưu trước khi đi.',
    'Một trang phụ được tách riêng để list dễ đọc hơn và không phải quyết từ một đống hỗn hợp.',
    'Các mục cùng nhóm được đặt chung để người xem chọn nhanh theo đúng nhu cầu lúc đó.',
    'Trang này giúp list gọn hơn: mở ra là hiểu nhóm nào, dùng lúc nào, lưu vì sao.',
    'Một cụm lựa chọn riêng để chuyến đi dễ xoay nhịp mà không bị loãng thông tin.',
    'Các gợi ý được gom thành một trang rõ ý, hợp để scan nhanh trước khi chốt lịch.',
  ],
};

function contextualGrid8Title(page) {
  const kind = gridPageKind(page);
  if (kind === 'food') return '8 QUÁN ĂN ĐÀ LẠT';
  if (kind === 'cafe') return '8 QUÁN CAFE';
  if (kind === 'checkin') return '8 ĐIỂM CHECK-IN';
  if (kind === 'nightlife') return '8 ĐIỂM CHƠI ĐÊM';
  if (kind === 'service') return '8 LƯU Ý CẦN NHỚ';
  if (kind === 'stay') return '8 HOMESTAY ĐÀ LẠT';
  if (kind === 'activity') return '8 HOẠT ĐỘNG ĐÀ LẠT';
  if (kind === 'tourism') return '8 KHU DU LỊCH ĐÀ LẠT';
  return page?.title || page?.chipText || '';
}

function contextualGrid8Intro(page, list) {
  const kind = gridPageKind(page);
  const variants = GRID8_INTRO_VARIANTS[kind] || GRID8_INTRO_VARIANTS.generic;
  return polishShortVietnameseCopy(pickListVariant(list, variants, kind));
}

export function grid8IntroForPage(page, pageSubtitle, list) {
  return polishShortVietnameseCopy(pageSubtitle || '');
}

function gridFeatureSubtitle(page, pageSubtitle, list) {
  return polishShortVietnameseCopy(pageSubtitle || '');
}

export function renderGrid4FeaturePage(page, index, listId, list, pageSubtitle) {
  const backgroundImage = grid4FeatureBackgroundImage(page, list);
  const featureSubtitle = gridFeatureSubtitle(page, pageSubtitle, list);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'grid4-feature-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
      <div class="grid4-feature-bg">
        ${renderPreviewImage(backgroundImage, page.title)}
      </div>
      <div class="grid4-feature-shade"></div>
      <div class="grid4-feature-copy">
        <div class="grid4-feature-kicker">ĐÀ LẠT</div>
        ${page.title ? `<h1 class="grid4-feature-title">${escapeHtml(page.title)}</h1>` : ''}
        ${featureSubtitle ? `<p class="grid4-feature-subtitle">${escapeHtml(featureSubtitle)}</p>` : ''}
      </div>
    </article>
  `;
}

// ─── Grid 4 Mutant render helpers ────────────────────────────────────────────

export function renderGrid4MutantCover(page, index, listId) {
  const placement = page.titlePlacement || 'bottom-left';
  const placementClass = `placement-${placement}`;
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'grid4-mutant-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="grid4-mutant-cover-bg">
        ${renderPreviewImage(page.backgroundImage, page.title)}
      </div>
      <div class="grid4-mutant-cover-shade"></div>
      <div class="grid4-mutant-cover-copy ${escapeHtml(placementClass)}">
        <div class="grid4-mutant-cover-kicker">ĐÀ LẠT</div>
        <h1 class="grid4-mutant-cover-title">${escapeHtml(page.title || '')}</h1>
        ${page.subtitle ? `<p class="grid4-mutant-cover-subtitle">${escapeHtml(page.subtitle)}</p>` : ''}
      </div>
    </article>
  `;
}

function renderGrid4MutantItems(items, position = 'bottom', showAddress = true) {
  return items.map((item) => {
    const displayName = compactGridItemName(item?.rawName || item?.name);
    const cleanAddress = shouldShowItemAddress(item, showAddress)
      ? truncateMenuLine(cleanGridAddress(item?.metaPrimary), 52)
      : '';
    const addressHtml = cleanAddress ? `
      <div class="grid4-mutant-address">
        <span class="grid4-mutant-address-pin">${renderPhotomodePin()}</span>
        <span class="grid4-mutant-address-text">${escapeHtml(cleanAddress)}</span>
      </div>
    ` : '';
    const labelHtml = item.label ? `<div class="grid4-mutant-service-label">${escapeHtml(item.label)}</div>` : '';
    const posClass = position === 'top' ? 'mutant-item-top' : 'mutant-item-bottom';
    return `
      <div class="grid4-mutant-item ${posClass} ${escapeHtml(item.imageSource || (item.imageMapped ? 'manual' : 'fallback'))}">
        ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
        <div class="grid4-mutant-overlay">
          ${labelHtml}
          <div class="grid4-mutant-name">${escapeHtml(truncateMenuLine(displayName, 36))}</div>
          ${addressHtml}
        </div>
      </div>
    `;
  }).join('');
}

export function renderGrid4MutantContentPage(page, index, listId) {
  const contentStyle = page.contentStyle || 'strip';
  const styleClass = `mutant-${contentStyle}`;
  const showServiceLabel = isServiceOrStayListPage(page);
  const showAddress = !isActivityListPage(page);
  const itemsToRender = (page.items || []).slice(0, 4);
  // Filter labels if not service/stay page
  const processedItems = showServiceLabel ? itemsToRender : itemsToRender.map(item => ({ ...item, label: '' }));

  if (contentStyle === 'strip') {
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'grid4-mutant', styleClass))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        <div class="grid4-mutant-body">
          ${renderGrid4MutantItems(processedItems.slice(0, 2), 'top', showAddress)}
          <div class="grid4-mutant-title-strip">${escapeHtml(page.title)}</div>
          ${renderGrid4MutantItems(processedItems.slice(2, 4), 'bottom', showAddress)}
        </div>
      </article>
    `;
  }

  // center-card: top row items have overlay at top, bottom row at bottom
  // (so center title card doesn't cover any item text)
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'grid4-mutant', styleClass))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
      <div class="grid4-mutant-body">
        ${renderGrid4MutantItems(processedItems.slice(0, 2), 'top', showAddress)}
        ${renderGrid4MutantItems(processedItems.slice(2, 4), 'bottom', showAddress)}
        <div class="grid4-mutant-title-card">${escapeHtml(page.title)}</div>
      </div>
    </article>
  `;
}

// ─── End Grid 4 Mutant ───────────────────────────────────────────────────────

// ─── Grid 6 Zigzag render helpers ────────────────────────────────────────────

export function renderZigzagCover(page, index, listId) {
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'zigzag-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="zigzag-cover-bg">
        ${renderPreviewImage(page.backgroundImage, page.title)}
      </div>
      <div class="zigzag-cover-shade"></div>
      <div class="zigzag-cover-copy">
        <div class="zigzag-cover-badge">Đà Lạt</div>
        <h1 class="zigzag-cover-title">${escapeHtml(page.title || '')}</h1>
        ${page.subtitle ? `<p class="zigzag-cover-subtitle">${escapeHtml(page.subtitle)}</p>` : ''}
      </div>
    </article>
  `;
}

function zigzagThirdLineHtml(item) {
  const label = String(item?.label || '').trim();
  const price = gridPriceMetaFromSecondary(item?.metaSecondary);
  const sectionKey = String(item?.sourceSectionKey || '').trim();

  if (sectionKey === 'quan_an' && label) {
    return `<span class="zigzag-label">${escapeHtml(label)}</span>`;
  }
  if (price) {
    return `<span class="zigzag-price">${escapeHtml(price)}</span>`;
  }
  if (label) {
    return `<span class="zigzag-label">${escapeHtml(label)}</span>`;
  }
  return '';
}

function renderZigzagItems(items, { showAddress = true } = {}) {
  return items.map((item) => {
    const displayName = compactGridItemName(item?.rawName || item?.name);
    const address = shouldShowItemAddress(item, showAddress)
      ? cleanGridAddress(item?.metaPrimary)
      : '';
    const addressHtml = address
      ? `<div class="zigzag-address">${escapeHtml(address)}</div>`
      : '';
    const thirdHtml = zigzagThirdLineHtml(item);
    return `
      <div class="zigzag-item">
        <div class="zigzag-thumb ${escapeHtml(item.imageSource || (item.imageMapped ? 'manual' : 'fallback'))}${portraitFocusClass(item)}">
          ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
        </div>
        <div class="zigzag-copy">
          <div class="zigzag-name">${escapeHtml(displayName)}</div>
          ${addressHtml}
          ${thirdHtml}
        </div>
      </div>
    `;
  }).join('');
}

export function renderZigzagContentPage(page, index, listId) {
  const itemsToRender = (page.items || []).slice(0, 6);
  const showAddress = !isActivityListPage(page);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'zigzag-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
      <div class="zigzag-header">
        <div class="zigzag-header-title">${escapeHtml(page.title)}</div>
      </div>
      <div class="zigzag-body">
        ${renderZigzagItems(itemsToRender, { showAddress })}
      </div>
    </article>
  `;
}

const GRID8_FEED_CENTER_HOOKS = {
  food: 'Ăn uống gì',
  cafe: 'Coffee lowkey',
  checkin: 'Checkin free',
  service: 'Tiện ích uy tín',
  nightlife: 'Chơi đêm chill',
  stay: 'Homestay vibe',
  activity: 'Hoạt động hot',
  tourism: 'Điểm must-go',
};

export function grid8FeedCenterHook(page, list) {
  return String(page.title || '').trim();
}

function grid8FeedItemMeta(item, showAddress = true) {
  const parts = [];
  if (shouldShowItemAddress(item, showAddress)) {
    const address = cleanGridAddress(item?.metaPrimary);
    if (address) parts.push(address);
  }
  const price = gridPriceMetaFromSecondary(item?.metaSecondary);
  if (price) parts.push(price);
  if (parts.length > 0) return parts.join(' · ');
  const raw = String(item?.metaPrimary || '').trim();
  const phone = raw.match(/(?:\+?84|0)\d[\d\s.]{7,12}\d/);
  if (phone) return phone[0].replace(/\s+/g, ' ').trim();
  return '';
}

const GRID5_TITLE_CARDS = {
  checkin: 'Một vài điểm check in hot',
  food: 'Một vài quán ăn ngon',
  cafe: 'Một vài quán cafe đẹp',
  nightlife: 'Một vài spot chơi đêm',
  service: 'Homestay & Spa',
  stay: 'Homestay & Spa',
  activity: 'Một vài hoạt động hot',
  tourism: 'Một vài điểm du lịch',
};

function grid5TitleCard(page, list) {
  return String(page.title || '').trim();
}

function grid5ItemMeta(item, showAddress = true) {
  if (!shouldShowItemAddress(item, showAddress)) return gridPriceMetaFromSecondary(item?.metaSecondary);
  const address = cleanGridAddress(item?.metaPrimary);
  if (address) return address;
  return gridPriceMetaFromSecondary(item?.metaSecondary);
}

function renderGrid8FeedSlot(item, showAddress = true) {
  const displayName = gridDisplayName(item);
  const meta = grid8FeedItemMeta(item, showAddress);
  return `
    <div class="grid8-feed-slot ${escapeHtml(imageSourceClass(item))}">
      <div class="grid8-feed-frame">
        ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
      </div>
      <div class="grid8-feed-labels">
        <div class="grid8-feed-name">${escapeHtml(displayName)}</div>
        ${meta ? `<div class="grid8-feed-meta">${escapeHtml(meta)}</div>` : ''}
      </div>
    </div>
  `;
}

function formatGrid8FeedCenterHook(hookText) {
  const raw = truncateMenuLine(String(hookText || '').trim(), 28);
  if (!raw) return '';
  const words = raw.split(/\s+/);
  if (words.length <= 1) return escapeHtml(raw);
  const splitAt = words.length === 2 ? 1 : Math.ceil(words.length / 2);
  return `${escapeHtml(words.slice(0, splitAt).join(' '))}<br>${escapeHtml(words.slice(splitAt).join(' '))}`;
}

function renderGrid8FeedCenterSlot(hookText) {
  return `
    <div class="grid8-feed-slot grid8-feed-center-slot">
      <div class="grid8-feed-center-stage">
        <div class="grid8-feed-center-hook">${formatGrid8FeedCenterHook(hookText)}</div>
      </div>
      <div class="grid8-feed-center-label-spacer" aria-hidden="true"></div>
    </div>
  `;
}

export function renderGrid8FeedItems(items, centerHook, showAddress = true) {
  const cells = (items || []).slice(0, 8);
  const centerHtml = renderGrid8FeedCenterSlot(centerHook);
  const ordered = [
    ...cells.slice(0, 3).map((item) => renderGrid8FeedSlot(item, showAddress)),
    cells[3] ? renderGrid8FeedSlot(cells[3], showAddress) : '',
    centerHtml,
    cells[4] ? renderGrid8FeedSlot(cells[4], showAddress) : '',
    ...cells.slice(5, 8).map((item) => renderGrid8FeedSlot(item, showAddress)),
  ].filter(Boolean);

  return ordered.join('');
}

function grid8FeedPageBgImages(page, backgroundImage, listId = '', coverImageUrls = []) {
  // Nền Grid 8 Feed là một nguồn dữ liệu riêng: chỉ được lấy từ sheet/thư mục
  // Hình_nền (coverImageUrls). Không mượn imageUrl/backgroundImage của địa điểm,
  // nếu không quá trình inline lúc xuất sẽ "claim" ảnh chính trước các ô quán và
  // buộc ô quán dùng candidate chưa cache, dẫn đến trắng ảnh trên máy khác.
  const pool = (coverImageUrls.length > 0 ? coverImageUrls : spotlightV2CoverImagePool).filter(Boolean);
  const seed = `${listId || page?.chipText || 'grid8-feed-page'}|${page?.title || page?.chipText || 'bg'}`;
  const backgroundPool = pickUniqueCoverGridImages(pool, seed, 4);
  if (backgroundPool.length > 0) {
    const padded = [...backgroundPool];
    while (padded.length < 4) padded.push(padded[padded.length % backgroundPool.length]);
    return padded.slice(0, 4);
  }
  return [];
}

export function renderGrid8FeedPageBackground(page, backgroundImage, listId = '', coverImageUrls = []) {
  let tiles = grid8FeedPageBgImages(page, backgroundImage, listId, coverImageUrls);
  while (tiles.length < 4) tiles.push('');
  tiles = tiles.slice(0, 4);
  const label = page?.title || page?.chipText || 'background';
  return `
    <div class="grid8-feed-page-bg-grid">
      ${tiles.map((url, tileIndex) => `
        <div class="grid8-feed-page-bg-cell">
          ${url ? renderPreviewImage(url, `${label} ${tileIndex + 1}`) : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function grid8FeedCoverGridImages(page, backgroundImage, listId = '', coverImageUrls = []) {
  const fromPage = Array.isArray(page?.coverImages) ? page.coverImages.filter(Boolean) : [];
  const uniqueFromPage = [...new Set(fromPage)];
  if (uniqueFromPage.length >= 4) return uniqueFromPage.slice(0, 4);

  const pool = (coverImageUrls.length > 0 ? coverImageUrls : spotlightV2CoverImagePool).filter(Boolean);
  const seed = `${listId || page?.title || 'grid8-feed-cover'}|cover-grid`;
  const fromPool = pickUniqueCoverGridImages(pool, seed, 4);
  const merged = [...new Set([...uniqueFromPage, ...fromPool])];
  if (merged.length >= 4) return merged.slice(0, 4);
  if (merged.length > 0) return merged;

  return backgroundImage ? [backgroundImage] : [];
}

function formatGrid8FeedCoverHero(title) {
  const raw = String(title || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  const words = upper.split(' ');
  if (words.length <= 5) return escapeHtml(upper);
  const splitAt = Math.ceil(words.length / 2);
  return `${escapeHtml(words.slice(0, splitAt).join(' '))}<br>${escapeHtml(words.slice(splitAt).join(' '))}`;
}

export function renderGrid8FeedCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage, coverImageUrls = []) {
  const hero = formatGrid8FeedCoverHero(coverTitle);
  const tagline = formatGrid8FeedCoverTagline(coverSubtitle);
  let tiles = grid8FeedCoverGridImages(page, backgroundImage, listId, coverImageUrls);
  while (tiles.length < 4) tiles.push('');
  tiles = tiles.slice(0, 4);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'grid8-feed-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="grid8-feed-cover-grid">
        ${tiles.map((url, tileIndex) => `
          <div class="grid8-feed-cover-cell">
            ${url ? renderPreviewImage(url, `${coverTitle || 'cover'} ${tileIndex + 1}`) : ''}
          </div>
        `).join('')}
      </div>
      <div class="grid8-feed-cover-dim" aria-hidden="true"></div>
      <div class="grid8-feed-cover-center">
        ${hero ? `<h1 class="grid8-feed-cover-hero">${hero}</h1>` : ''}
        ${tagline ? `<p class="grid8-feed-cover-tagline">${tagline}</p>` : ''}
      </div>
    </article>
  `;
}

function renderGrid8QuaytungDalatBadge() {
  return '<span class="grid8-quaytung-dalat-badge">dalat</span>';
}

function formatGrid8QuaytungCoverTitle(title) {
  const raw = String(title || 'List này toàn địa điểm "vuýp"')
    .replace(/\bĐà\s*Lạt\s+VN\b/giu, 'Đà Lạt')
    .replace(/\s+\/\s*VN\b/giu, '')
    .replace(/\s+\bVN\b(?=\s|$|[./])/giu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return formatBalancedTitleLines(raw, raw.length >= 44 ? 3 : 2);
}

export function renderGrid8QuaytungCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
  const subtitle = String(coverSubtitle || '').replace(/^\[+|\]+$/g, '').trim();
  const titleFitClass = responsiveTitleFitClass(coverTitle, 'grid8-quaytung-cover-title', 28, 44);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'grid8-quaytung-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="grid8-quaytung-cover-photo">
        ${renderPreviewImage(backgroundImage, coverTitle)}
      </div>
      <div class="grid8-quaytung-cover-dim"></div>
      <div class="grid8-quaytung-cover-center">
        ${renderGrid8QuaytungDalatBadge()}
        <h1 class="grid8-quaytung-cover-title ${escapeHtml(titleFitClass)}">${formatGrid8QuaytungCoverTitle(coverTitle)}</h1>
        <p class="grid8-quaytung-cover-sub">${escapeHtml(subtitle)}</p>
      </div>
    </article>
  `;
}

function formatGrid6QuaytungCoverTitle(title) {
  const raw = String(title || 'List này toàn địa điểm "vuýp"')
    .replace(/\bĐà\s*Lạt\s+VN\b/giu, 'Đà Lạt')
    .replace(/\s+\/\s*VN\b/giu, '')
    .replace(/\s+\bVN\b(?=\s|$|[./])/giu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  const words = raw.split(' ');
  if (words.length <= 4) return escapeHtml(raw);
  const splitAt = Math.ceil(words.length / 2);
  return `${escapeHtml(words.slice(0, splitAt).join(' '))}<br>${escapeHtml(words.slice(splitAt).join(' '))}`;
}

export function renderGrid6QuaytungCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
  const subtitle = String(coverSubtitle || '').replace(/^\[+|\]+$/g, '').trim();
  const tag = String(page?.chipText || 'loanh quanh phố phường').trim().toLowerCase();
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'grid6-quaytung-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="grid6qt-cover-photo">
        ${renderPreviewImage(backgroundImage, coverTitle)}
      </div>
      <div class="grid6qt-cover-dim"></div>
      <div class="grid6qt-cover-copy">
        <span class="grid6qt-cover-tag">${escapeHtml(tag)}</span>
        <h1 class="grid6qt-cover-title">${formatGrid6QuaytungCoverTitle(coverTitle)}</h1>
        <p class="grid6qt-cover-sub">[ ${escapeHtml(subtitle)} ]</p>
      </div>
    </article>
  `;
}

function renderGrid6QuaytungCell(item, labelsAt = 'bottom', showAddress = true) {
  const displayName = gridDisplayName(item);
  const address = shouldShowItemAddress(item, showAddress)
    ? (cleanGridAddress(item?.metaPrimary) || String(item?.metaPrimary || '').trim())
    : '';
  const labelClass = labelsAt === 'top' ? 'is-labels-top' : 'is-labels-bottom';
  return `
    <div class="grid6qt-cell ${labelClass} ${escapeHtml(imageSourceClass(item))}">
      <div class="grid6qt-photo">
        ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
        <div class="grid6qt-shade"></div>
        <div class="grid6qt-labels">
          <div class="grid6qt-name">${escapeHtml(displayName)}</div>
          ${address ? `<div class="grid6qt-address">${escapeHtml(address)}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderGrid6QuaytungBand(page) {
  const hook = String(page.title || '').trim().toUpperCase();
  return `
    <div class="grid6qt-band">
      <div class="grid6qt-band-copy">
        <div class="grid6qt-band-script">vài địa điểm</div>
        <div class="grid6qt-band-title">${escapeHtml(hook)}</div>
      </div>
    </div>
  `;
}

export function renderGrid6QuaytungPageBody(page, items) {
  const cells = (items || []).slice(0, 6);
  const showAddress = !isActivityListPage(page);
  const top = cells.slice(0, 3).map((item) => renderGrid6QuaytungCell(item, 'bottom', showAddress)).join('');
  const bottom = cells.slice(3, 6).map((item) => renderGrid6QuaytungCell(item, 'top', showAddress)).join('');
  return `
    <div class="grid6qt-stack">
      <div class="grid6qt-row">${top}</div>
      ${renderGrid6QuaytungBand(page)}
      <div class="grid6qt-row">${bottom}</div>
    </div>
  `;
}

function grid8QuaytungExtractPrice(item) {
  const secondary = String(item?.metaSecondary || '').replace(/\s+/g, ' ').trim();
  const priceMatch = secondary.match(/Giá:\s*([^·]+)/i);
  if (priceMatch) {
    const raw = priceMatch[1].trim();
    if (/free|miễn\s*phí|^0\s*đ$/i.test(raw)) return 'FREE';
    return raw;
  }
  if (/free|miễn\s*phí/i.test(secondary)) return 'FREE';
  return '';
}

function grid8QuaytungDefaultPrice(item) {
  const section = String(item?.sourceSectionKey || '').toLowerCase();
  if (section.includes('check') || section.includes('khu_du') || section.includes('lich_su')) return 'FREE';
  return 'Liên hệ';
}

function grid8QuaytungUnifiedPrices(items, page = null) {
  const preferFree = /mảng xanh|check-in|checkin/i.test(`${page?.chipText || ''} ${page?.title || ''}`);
  const labels = (items || []).map((item) => grid8QuaytungExtractPrice(item));
  const showForAll = labels.some(Boolean) || preferFree;
  if (!showForAll) return labels;
  return (items || []).map((item, index) => labels[index] || (preferFree ? 'FREE' : grid8QuaytungDefaultPrice(item)));
}

function renderGrid8QuaytungSlot(item, priceLabel = '', showAddress = true) {
  const displayName = gridDisplayName(item);
  const address = shouldShowItemAddress(item, showAddress)
    ? (cleanGridAddress(item?.metaPrimary) || String(item?.metaPrimary || '').trim())
    : '';
  const price = priceLabel || grid8QuaytungExtractPrice(item);
  return `
    <div class="grid8-quaytung-slot ${escapeHtml(imageSourceClass(item))}">
      <div class="grid8-quaytung-photo">
        ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
        <div class="grid8-quaytung-shade"></div>
        <div class="grid8-quaytung-labels">
          <div class="grid8-quaytung-name">${escapeHtml(displayName)}</div>
          ${address ? `<div class="grid8-quaytung-address">${escapeHtml(address)}</div>` : ''}
          ${price ? `<div class="grid8-quaytung-hours"><span class="grid8-quaytung-clock" aria-hidden="true">🎟</span> ${escapeHtml(price)}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderGrid8QuaytungCenterSlot(page, backgroundImage) {
  const hook = String(page.title || '').trim();
  const tagline = String(page.subtitle || '').trim();
  return `
    <div class="grid8-quaytung-slot grid8-quaytung-center-slot">
      <div class="grid8-quaytung-photo">
        ${backgroundImage ? renderPreviewImage(backgroundImage, hook) : ''}
        <div class="grid8-quaytung-center-shade"></div>
        <div class="grid8-quaytung-center-copy">
          ${renderGrid8QuaytungDalatBadge()}
          ${hook ? `<div class="grid8-quaytung-center-hook">${escapeHtml(hook)}</div>` : ''}
          ${tagline ? `<div class="grid8-quaytung-center-tagline">${escapeHtml(tagline)}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

export function renderGrid8QuaytungItems(page, items, backgroundImage) {
  const cells = (items || []).slice(0, 8);
  const showAddress = !isActivityListPage(page);
  const priceLabels = grid8QuaytungUnifiedPrices(cells, page);
  const centerHtml = renderGrid8QuaytungCenterSlot(page, backgroundImage);
  const ordered = [
    ...cells.slice(0, 3).map((item, index) => renderGrid8QuaytungSlot(item, priceLabels[index], showAddress)),
    cells[3] ? renderGrid8QuaytungSlot(cells[3], priceLabels[3], showAddress) : '',
    centerHtml,
    cells[4] ? renderGrid8QuaytungSlot(cells[4], priceLabels[4], showAddress) : '',
    ...cells.slice(5, 8).map((item, offset) => renderGrid8QuaytungSlot(item, priceLabels[offset + 5], showAddress)),
  ].filter(Boolean);
  return ordered.join('');
}

function renderGrid8QuaytungMenuSection(section, reverse) {
  const photoItem = section.items.find((item) => item.imageUrl) || section.items[0];
  const photoUrl = photoItem?.imageUrl || '';
  const photoCandidates = photoItem?.candidateImageUrls || [];
  const rows = section.items.map((item) => {
    const address = cleanGridAddress(item.metaPrimary) || String(item.metaPrimary || '').trim();
    const shortAddress = address ? truncateMenuLine(address, 36) : '';
    return `
      <li class="grid8-quaytung-menu-row">
        <strong>${escapeHtml(truncateMenuLine(gridDisplayName(item), 28))}</strong>
        ${shortAddress ? `<span>${escapeHtml(shortAddress)}</span>` : ''}
      </li>
    `;
  }).join('');
  return `
    <section class="grid8-quaytung-menu-section${reverse ? ' is-reverse' : ''}">
      <div class="grid8-quaytung-menu-section-copy">
        <h3 class="grid8-quaytung-menu-section-title">✓ ${escapeHtml(section.title)}</h3>
        <ul class="grid8-quaytung-menu-list">${rows}</ul>
      </div>
      <div class="grid8-quaytung-menu-section-photo">
        ${photoUrl ? renderPreviewImage(photoUrl, section.title, '', photoCandidates) : ''}
      </div>
    </section>
  `;
}

export function renderGrid8QuaytungMenuPage(page, index, listId, list) {
  const sectionOrder = [];
  const sectionMap = new Map();
  for (const item of page.items || []) {
    const key = String(item.label || 'Gợi ý').trim();
    if (!sectionMap.has(key)) {
      sectionMap.set(key, []);
      sectionOrder.push(key);
    }
    sectionMap.get(key).push(item);
  }
  const sections = sectionOrder.map((title) => ({ title, items: sectionMap.get(title) || [] }));
  const backgroundImage = String(page.backgroundImage || '').trim();
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'grid8-quaytung-menu-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText || 'menu')}.png">
      ${backgroundImage ? `<div class="grid8-quaytung-menu-bg">${renderPreviewImage(backgroundImage, page.title)}</div>` : ''}
      <div class="grid8-quaytung-menu-dim"></div>
      <div class="grid8-quaytung-menu-head">
        ${renderGrid8QuaytungDalatBadge()}
        ${page.title ? `<h2 class="grid8-quaytung-menu-title">${escapeHtml(truncateMenuLine(page.title, 32))}</h2>` : ''}
      </div>
      <div class="grid8-quaytung-menu-sections">
        ${sections.map((section, idx) => renderGrid8QuaytungMenuSection(section, idx % 2 === 1)).join('')}
      </div>
    </article>
  `;
}

function renderGrid5TitleCell(titleText) {
  return `
    <article class="grid5-cell grid5-title-cell">
      <span class="grid5-star grid5-star-tl" aria-hidden="true">✦</span>
      <span class="grid5-star grid5-star-tr" aria-hidden="true">★</span>
      <span class="grid5-star grid5-star-bl" aria-hidden="true">✦</span>
      <div class="grid5-title-text">${escapeHtml(titleText)}</div>
    </article>
  `;
}

function renderGrid5PhotoCell(item, showAddress = true) {
  const meta = grid5ItemMeta(item, showAddress);
  return `
    <article class="grid5-cell grid5-photo-cell ${escapeHtml(imageSourceClass(item))}">
      ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
      <div class="grid5-photo-shade"></div>
      <div class="grid5-photo-copy">
        <div class="grid5-photo-name">${escapeHtml(gridDisplayName(item))}</div>
        ${meta ? `<div class="grid5-photo-meta">${escapeHtml(meta)}</div>` : ''}
      </div>
    </article>
  `;
}

function renderGrid5Matrix(items, titleText, showAddress = true) {
  const cells = (items || []).slice(0, 5);
  const ordered = [
    renderGrid5TitleCell(titleText),
    cells[0] ? renderGrid5PhotoCell(cells[0], showAddress) : '',
    cells[1] ? renderGrid5PhotoCell(cells[1], showAddress) : '',
    cells[2] ? renderGrid5PhotoCell(cells[2], showAddress) : '',
    cells[3] ? renderGrid5PhotoCell(cells[3], showAddress) : '',
    cells[4] ? renderGrid5PhotoCell(cells[4], showAddress) : '',
  ].filter(Boolean);
  return ordered.join('');
}

export function renderGrid5Cover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
  const hero = String(coverTitle || '').trim();
  const hook = String(coverSubtitle || '').trim();
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'grid5-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="grid5-cover-bg">
        ${renderPreviewImage(backgroundImage, coverTitle)}
      </div>
      <div class="grid5-cover-shade"></div>
      <div class="grid5-cover-copy">
        <div class="grid5-cover-hero-row">
          ${hero ? `<h1 class="grid5-cover-dalat">${escapeHtml(hero)}</h1>` : ''}
          ${hook ? `<p class="grid5-cover-hook">${escapeHtml(hook)}</p>` : ''}
        </div>
      </div>
    </article>
  `;
}

export function renderGrid5Page(page, index, listId, pageSubtitle, list = null) {
  const titleCard = grid5TitleCard(page, list);
  const showAddress = !isActivityListPage(page);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'grid5-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
      <div class="grid5-matrix">
        ${renderGrid5Matrix(page.items, titleCard, showAddress)}
      </div>
    </article>
  `;
}

function renderGridAddress(value) {
  const cleanAddress = cleanGridAddress(value);
  if (!cleanAddress) {
    return '';
  }

  return `
    <div class="grid6-address story-image-meta">
      <span class="grid6-address-pin">${renderPhotomodePin()}</span>
      <span class="grid6-address-text">${escapeHtml(cleanAddress)}</span>
    </div>
  `;
}

function renderGridSecondary(value) {
  // Dùng cùng bộ lọc với zigzag: chỉ hiện Giá/Liên hệ, không để "Khung giờ" trộn lẫn vào dòng giá.
  const cleanValue = gridPriceMetaFromSecondary(value);
  if (!cleanValue) return '';

  return `
    <div class="grid6-address grid6-address-extra story-image-meta">
      <span class="grid6-address-text">${escapeHtml(cleanValue)}</span>
    </div>
  `;
}

/** @param {import('../types').PageItem[]} items @returns {string} */
export function renderPhotomodeItems(items) {
  return items.map((item) => `
    <section class="photomode-item${portraitFocusClass(item)} ${escapeHtml(item.imageSource || (item.imageMapped ? 'manual' : 'fallback'))}">
      ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
      <div class="photomode-copy">
        <div class="photomode-name-row">
          <span class="photomode-pin">${renderPhotomodePin()}</span>
          <h4 class="photomode-name story-image-title">${escapeHtml(item.name)}</h4>
        </div>
        <p class="photomode-meta story-image-meta">
          ${item.label ? `<span class="photomode-label">${escapeHtml(item.label)}</span><span class="photomode-divider"> - </span>` : ''}
          <span class="photomode-address">${escapeHtml(item.metaPrimary)}</span>
        </p>
      </div>
    </section>
  `).join('');
}

export function renderGrid6Items(items, { numbered = false, twoDigitNumber = false, showLabel = false, showAddress = true } = {}) {
  return items.map((item, index) => {
    const displayName = gridDisplayName(item);
    const itemNumber = twoDigitNumber ? String(index + 1).padStart(2, '0') : String(index + 1);
    const itemName = numbered ? `${itemNumber}. ${displayName}` : displayName;
    return `
    <div class="grid6-item ${escapeHtml(item.imageSource || (item.imageMapped ? 'manual' : 'fallback'))}${portraitFocusClass(item)}">
      ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
      <div class="grid6-overlay">
        ${showLabel && item.label ? `<div class="grid6-service-label">${escapeHtml(item.label)}</div>` : ''}
        <div class="grid6-name story-image-title">${escapeHtml(itemName)}</div>
        ${shouldShowItemAddress(item, showAddress) ? renderGridAddress(item.metaPrimary) : ''}
        ${renderGridSecondary(item.metaSecondary)}
      </div>
    </div>
  `;
  }).join('');
}

function renderGrid8Meta(value) {
  const cleanAddress = cleanGridAddress(value);
  if (!cleanAddress) {
    return '';
  }

  return `
    <div class="grid8-meta story-image-meta">
      <span class="grid8-pin">${renderPhotomodePin()}</span>
      <span>${escapeHtml(cleanAddress)}</span>
    </div>
  `;
}

function renderGrid8Secondary(value, options = {}) {
  const includeOpenHours = options.includeOpenHours === true;
  const cleanValue = includeOpenHours
    ? String(value || '').replace(/\s+/g, ' ').trim()
    : gridPriceMetaFromSecondary(value);
  if (!cleanValue) return '';
  return `<div class="grid8-meta grid8-meta-extra story-image-meta"><span>${escapeHtml(cleanValue)}</span></div>`;
}

export function renderGrid8Items(items, title, chipText, backgroundImage, introText = '', options = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return '';
  }
  const showTime = Boolean(options.showTime);
  const showMeta = options.showMeta !== false;
  const showCenterChip = options.showCenterChip !== false;
  const showLabel = Boolean(options.showLabel);
  const showAddress = options.showAddress !== false;
  const centerImageHtml = backgroundImage
    ? renderPreviewImage(backgroundImage, title || '', 'grid8-center-bg')
    : '';

  return `
    ${items.slice(0, 4).map((item) => {
      const displayName = gridDisplayName(item);
      return `
        <article class="grid8-cell ${escapeHtml(imageSourceClass(item))}">
          ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
          <div class="grid8-cell-copy">
            ${showTime && item.label ? `<span class="grid8-cell-time">${escapeHtml(item.label)}</span>` : ''}
            ${showLabel && item.label ? `<span class="grid8-cell-service">${escapeHtml(item.label)}</span>` : ''}
            <strong class="story-image-title ${escapeHtml(responsiveTitleFitClass(displayName, 'grid8-title', 34, 52))}">${escapeHtml(displayName)}</strong>
            ${showMeta && shouldShowItemAddress(item, showAddress) ? renderGrid8Meta(item.metaPrimary) : ''}
            ${showMeta ? renderGrid8Secondary(item.metaSecondary, { includeOpenHours: options.includeOpenHours === true }) : ''}
          </div>
        </article>
      `;
    }).join('')}
    <article class="grid8-center">
      ${centerImageHtml}
      ${showCenterChip ? `<span class="grid8-center-chip">${escapeHtml(chipText || 'List')}</span>` : ''}
      <h3 class="grid8-center-title">${escapeHtml(title || '')}</h3>
      ${introText ? `<p class="grid8-center-intro">${escapeHtml(introText)}</p>` : ''}
    </article>
    ${items.slice(4, 8).map((item) => {
        const displayName = gridDisplayName(item);
        return `
          <article class="grid8-cell ${escapeHtml(imageSourceClass(item))}">
            ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
            <div class="grid8-cell-copy">
              ${showTime && item.label ? `<span class="grid8-cell-time">${escapeHtml(item.label)}</span>` : ''}
              ${showLabel && item.label ? `<span class="grid8-cell-service">${escapeHtml(item.label)}</span>` : ''}
              <strong class="story-image-title ${escapeHtml(responsiveTitleFitClass(displayName, 'grid8-title', 34, 52))}">${escapeHtml(displayName)}</strong>
              ${showMeta && shouldShowItemAddress(item, showAddress) ? renderGrid8Meta(item.metaPrimary) : ''}
              ${showMeta ? renderGrid8Secondary(item.metaSecondary, { includeOpenHours: options.includeOpenHours === true }) : ''}
            </div>
          </article>
        `;
      }).join('')}
  `;
}
