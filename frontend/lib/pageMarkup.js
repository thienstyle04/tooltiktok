import { escapeHtml, sanitizeFilePart } from './utils';

function sourceLabel(item) {
  const source = item?.imageSource || (item?.imageMapped ? 'manual' : 'fallback');
  if (source === 'manual') return 'Đúng ảnh';
  if (source === 'auto') return 'Tự map';
  return 'Minh họa';
}

function imageSourceClass(item) {
  return item?.imageSource || (item?.imageMapped ? 'manual' : 'fallback');
}

function previewImageAttrs() {
  return 'loading="lazy" decoding="async" fetchpriority="low" draggable="false"';
}

const TITLE_FONT_VARIANT_COUNT = 8;
const GENERIC_CAPTION_BODY = 'Lưu list này để có lịch đi Đà Lạt gọn hơn, dễ chọn điểm theo buổi và đỡ mất thời gian mò từng nơi.';

function titleFontVariantFromId(raw) {
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return (hash % TITLE_FONT_VARIANT_COUNT) + 1;
}

function titleFontClass(listId) {
  const raw = String(listId || '');
  const captionNumber = raw.match(/^(.*?)-caption-(\d+)/i);
  if (captionNumber) {
    const baseVariant = titleFontVariantFromId(`${captionNumber[1]}-main`);
    const generatedOffset = Number(captionNumber[2]) || 1;
    return `title-font-${((baseVariant - 1 + generatedOffset) % TITLE_FONT_VARIANT_COUNT) + 1}`;
  }

  return `title-font-${titleFontVariantFromId(raw)}`;
}

function storyPageClass(listId, ...classNames) {
  return ['story-page', titleFontClass(listId), ...classNames.filter(Boolean)].join(' ');
}

function previewImageCandidateAttr(src, candidates = []) {
  const urls = [src, ...(Array.isArray(candidates) ? candidates : [])]
    .map((url) => String(url || '').trim())
    .filter((url) => isPortableImageUrl(url));
  const uniqueUrls = [...new Set(urls)];
  if (uniqueUrls.length <= 1) return '';
  return ` data-candidate-srcs="${escapeHtml(JSON.stringify(uniqueUrls))}"`;
}

function renderPreviewImage(src, alt, className = '', candidates = []) {
  if (!src) return '';
  const classAttr = className ? ` class="${escapeHtml(className)}"` : '';
  const candidateAttr = previewImageCandidateAttr(src, candidates);
  return `<img${classAttr} src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${candidateAttr} ${previewImageAttrs()}>`;
}

function isPortableImageUrl(src) {
  const value = String(src || '').trim();
  return /^https?:\/\//i.test(value) || value.startsWith('/assets/drive-file');
}

function collectPortableListImages(list) {
  const urls = [];
  for (const page of list?.pages || []) {
    if (isPortableImageUrl(page?.backgroundImage)) urls.push(page.backgroundImage);
    for (const item of page?.items || []) {
      if (isPortableImageUrl(item.imageUrl)) urls.push(item.imageUrl);
      for (const candidate of item.candidateImageUrls || []) {
        if (isPortableImageUrl(candidate)) urls.push(candidate);
      }
    }
  }
  return [...new Set(urls)];
}

function coverBackgroundImage(page, list) {
  if (isPortableImageUrl(page.backgroundImage)) return page.backgroundImage;
  const fallback = collectPortableListImages(list)[0];
  return fallback || page.backgroundImage || '';
}

function firstPortablePageImage(page) {
  for (const item of page?.items || []) {
    if (isPortableImageUrl(item.imageUrl)) return item.imageUrl;
    for (const candidate of item.candidateImageUrls || []) {
      if (isPortableImageUrl(candidate)) return candidate;
    }
  }
  return '';
}

function grid4FeatureBackgroundImage(page, list) {
  if (isPortableImageUrl(page.backgroundImage)) return page.backgroundImage;
  return firstPortablePageImage(page) || coverBackgroundImage(page, list);
}

export function pageCounter(index, total) {
  return `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
}

function isGridLayout(page) {
  return page.layoutVariant === 'grid-6' || page.layoutVariant === 'grid-8' || page.layoutVariant === 'grid-4';
}

function isGrid4FeaturePage(page) {
  return page?.layoutVariant === 'grid-4' && page?.type === 'cover';
}

function isJourneyGrid8Layout(page) {
  return page.layoutVariant === 'journey-4n2d-grid8';
}

function isSpotlightLayout(page) {
  return page.layoutVariant === 'spotlight';
}

function isSpotlightPartnerCover(page) {
  return page.layoutVariant === 'spotlight-partner' && page.type === 'cover';
}

function isBudget3N2DCover(page) {
  return page.layoutVariant === 'budget-3n2d' && page.type === 'cover';
}

function spotlightPositionClass(page, index, item) {
  const variants = [
    'spotlight-pos-lower-left',
    'spotlight-pos-upper-right',
    'spotlight-pos-center-left',
    'spotlight-pos-lower-right',
    'spotlight-pos-upper-left',
    'spotlight-pos-center-right',
  ];
  const raw = `${page?.title || ''}|${item?.rawName || item?.name || ''}|${item?.metaPrimary || ''}|${index}`;
  let hash = 0;
  for (let charIndex = 0; charIndex < raw.length; charIndex += 1) {
    hash = (hash * 33 + raw.charCodeAt(charIndex)) >>> 0;
  }
  return variants[hash % variants.length];
}

function isServiceListPage(page) {
  const key = `${page?.chipText || ''} ${page?.title || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase();
  return key.includes('dich vu');
}

function isStayListPage(page) {
  const key = `${page?.chipText || ''} ${page?.title || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase();
  return key.includes('homestay') || key.includes('luu tru');
}

function isServiceOrStayListPage(page) {
  return isServiceListPage(page) || isStayListPage(page);
}

function isGeneratedCaptionList(list) {
  return /caption-/i.test(String(list?.id || ''));
}

function gridContextKey(value) {
  return normalizeGridText(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function sameGridText(left, right) {
  return gridContextKey(left) === gridContextKey(right);
}

function polishShortVietnameseCopy(value) {
  let text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';

  text = text
    .replace(/\bĐà\s*Lạt\s*ẩn\s*mình\s*sau\s*vách\s*núi\b/giu, 'Đầy đủ kinh nghiệm cho chuyến đi Đà Lạt')
    .replace(/\bĐà\s*Lạt\s*đủ\s*để\s*đi\s*ngay\b/giu, 'Đầy đủ kinh nghiệm cho chuyến đi Đà Lạt')
    .replace(/\bmở\s+to\s+mắt\b/giu, 'mở mang tầm mắt')
    .replace(/\bnhấn\s+lưu\s+liền\s+kẻo\b[^.!?]*[.!?]?$/giu, 'Nhấn lưu liền tay để khỏi quên list này nhé.')
    .replace(/\blưu\s+liền\s+kẻo\b[^.!?]*[.!?]?$/giu, 'lưu liền tay để khỏi quên list này nhé.')
    .replace(/\blưu\s+lại\s*[.!?]*$/giu, 'lưu lại ngay nhé.')
    .replace(/\blưu\s+liền\s*[.!?]*$/giu, 'lưu liền tay nhé.')
    .replace(/\bmấy\s+chỗ\s+ăn\s+uống\b/giu, 'mấy chỗ ăn ngon')
    .replace(/\bchọn\s+điểm\s+đi,\s*ăn\s+uống\s+và\s+chụp\s+hình\b/giu, 'chọn điểm đi, quán ăn và góc chụp')
    .replace(/\btừ\s+ăn\s+uống,\s*check-?in\b/giu, 'từ quán ăn, check-in')
    .replace(/\bnhóm\s+ăn\s+uống\b/giu, 'nhóm quán ăn')
    .replace(/[,\-–:;]\s*ăn\s+uống\s*$/giu, ', có điểm ăn hợp lịch.')
    .replace(/(^|[^\p{L}\p{N}])ăn\s+uống\s*[.!?]*$/giu, '$1điểm ăn hợp lịch.');

  return text.replace(/\s+([,.!?;:])/g, '$1').replace(/\s+/g, ' ').trim();
}

function gridPageKind(page) {
  const key = gridContextKey(`${page?.chipText || ''} ${page?.title || ''}`);
  if (key.includes('quan_an') || key.includes('mon_ngon')) return 'food';
  if (key.includes('cafe') || key.includes('ca_phe')) return 'cafe';
  if (key.includes('check_in')) return 'checkin';
  if (key.includes('choi_dem')) return 'nightlife';
  if (key.includes('dich_vu') || key.includes('luu_y')) return 'service';
  if (key.includes('homestay') || key.includes('luu_tru')) return 'stay';
  if (key.includes('hoat_dong')) return 'activity';
  if (key.includes('khu_du_lich')) return 'tourism';
  return 'generic';
}

function listVariantIndex(list, variantCount, salt = '') {
  if (variantCount <= 1) return 0;
  const rawId = String(list?.id || '');
  const captionMatch = rawId.match(/caption-(\d+)/i);
  if (captionMatch) return Math.max(0, Number(captionMatch[1]) - 1) % variantCount;

  const raw = `${rawId}|${list?.title || ''}|${salt}`;
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return hash % variantCount;
}

function pickListVariant(list, variants, salt) {
  return variants[listVariantIndex(list, variants.length, salt)] || variants[0] || '';
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

function grid8IntroForPage(page, pageSubtitle, list) {
  if (!isGeneratedCaptionList(list)) return pageSubtitle;
  if (!pageSubtitle || sameGridText(pageSubtitle, list?.description)) return contextualGrid8Intro(page, list);
  if (page.layoutVariant === 'grid-8') return contextualGrid8Intro(page, list);
  return pageSubtitle;
}

function gridFeatureSubtitle(page, pageSubtitle, list) {
  if (pageSubtitle && !sameGridText(pageSubtitle, list?.description)) return polishShortVietnameseCopy(pageSubtitle);
  const kind = gridPageKind(page);
  const variants = GRID8_INTRO_VARIANTS[kind] || GRID8_INTRO_VARIANTS.generic;
  return polishShortVietnameseCopy(pickListVariant(list, variants, kind));
}

function renderGrid4FeaturePage(page, index, listId, list, pageSubtitle) {
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
        <h1 class="grid4-feature-title">${escapeHtml(page.title || page.chipText || '')}</h1>
        ${featureSubtitle ? `<p class="grid4-feature-subtitle">${escapeHtml(featureSubtitle)}</p>` : ''}
      </div>
    </article>
  `;
}

export function renderInlineHashtags(hashtags) {
  if (!Array.isArray(hashtags) || hashtags.length === 0) {
    return '';
  }

  return `
    <div class="page-inline-hashtags">
      ${hashtags.map((tag) => {
        let cleanTag = tag.trim().toLowerCase();
        if (cleanTag && !cleanTag.startsWith('#')) {
          cleanTag = '#' + cleanTag;
        }
        return `<span class="page-inline-hashtag">${escapeHtml(cleanTag)}</span>`;
      }).join('')}
    </div>
  `;
}

function stripVietnameseMarks(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectPagePlaceNames(pages) {
  const names = new Map();
  const addName = (value) => {
    const name = String(value || '').replace(/\s+/g, ' ').trim();
    if (name.length < 3) return;
    names.set(stripVietnameseMarks(name).toLowerCase(), name);
  };

  for (const page of pages || []) {
    if (page?.type !== 'list') continue;
    for (const item of page.items || []) {
      addName(item.rawName);
      addName(item.name);
      addName(String(item.name || '').split(/:\s*/).slice(1).join(': '));
    }
  }

  return [...names.values()].sort((a, b) => b.length - a.length);
}

function getPlaceNameCandidates(name) {
  const normalized = String(name || '').replace(/\s+/g, ' ').trim();
  const unaccented = stripVietnameseMarks(normalized);
  return [...new Set([normalized, unaccented].filter((value) => value.length >= 3))];
}

function hasPagePlaceName(value, placeNames) {
  return placeNames.some((name) => getPlaceNameCandidates(name).some((candidate) => {
    const escaped = escapeRegExp(candidate).replace(/\s+/g, '\\s+');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(value);
  }));
}

function looksLikeStopList(value) {
  const dayMarkers = value.match(/\b(?:ngày\s*(?:đầu|một|hai|ba|bốn|1|2|3|4)|sáng|trưa|chiều|tối)\b/giu) || [];
  const stopVerbs = value.match(/\b(?:ghé|qua|đi|lượn|chạy|săn|ăn|uống|check-?in|chụp)\b/giu) || [];
  return dayMarkers.length >= 2 && stopVerbs.length >= 2;
}

function looksLocationSpecific(value) {
  const normalized = stripVietnameseMarks(value).toLowerCase();
  return /\b(?:nha tho|duong|hem|doc|kdl|bun|banh|lau|xien)\b/.test(normalized)
    || /\b\d+\s*k\b/i.test(value);
}

function sanitizeSubtitleForDisplay(value, pages) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  const placeNames = collectPagePlaceNames(pages);
  if (hasPagePlaceName(clean, placeNames) || looksLikeStopList(clean) || looksLocationSpecific(clean)) {
    return GENERIC_CAPTION_BODY;
  }

  return polishShortVietnameseCopy(clean);
}

export function renderCoverPage(page, index, total, listId, hashtags = [], list = null) {
  const coverSubtitle = sanitizeSubtitleForDisplay(page.subtitle, list?.pages || []);
  const coverTitle = polishShortVietnameseCopy(page.title);
  const backgroundImage = coverBackgroundImage(page, list);
  if (isBudget3N2DCover(page)) {
    const title = coverTitle || '"72H" Ở ĐÀ LẠT VỚI 3TR';
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'budget72-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
        <div class="budget72-cover-bg">
          ${renderPreviewImage(backgroundImage, title)}
        </div>
        <div class="budget72-cover-shade"></div>
        <div class="budget72-cover-copy">
          <div class="budget72-script">dalat.</div>
          <h1 class="budget72-title">${escapeHtml(title)}</h1>
          <p class="budget72-subtitle">${escapeHtml(coverSubtitle || '/Gợi ý lịch trình du hí 3N2Đ/')}</p>
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
          ${isSpotlightPartnerCover(page) ? `<h1 class="grid4-feature-title">${escapeHtml(coverTitle || '')}</h1>` : ''}
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
           <h1 class="grid6-cover-title">${escapeHtml(coverTitle)}</h1>
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

export function renderListItems(items) {
  return items.map((item) => `
    <div class="item-row">
      <div class="thumb-block ${escapeHtml(item.imageSource || (item.imageMapped ? 'manual' : 'fallback'))}">
        ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
      </div>
      <div class="item-copy">
        ${item.label ? `<div class="item-label">${escapeHtml(item.label)}</div>` : ''}
        <div class="item-name story-image-title">${escapeHtml(item.name)}</div>
        <p class="item-meta story-image-meta">${escapeHtml(item.metaPrimary)}</p>
        ${item.metaSecondary ? `<p class="item-meta story-image-meta secondary">${escapeHtml(item.metaSecondary)}</p>` : ''}
        <div class="mapping-chip compact ${escapeHtml(item.imageSource || (item.imageMapped ? 'manual' : 'fallback'))}">
          ${item.imageSource === 'manual' ? 'Đúng ảnh' : item.imageSource === 'auto' ? 'Tự map' : 'Minh họa'}
        </div>
      </div>
    </div>
  `).join('');
}

function renderPhotomodePin() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" class="photomode-pin-icon">
      <path fill="currentColor" d="M12 2.25a7.25 7.25 0 0 0-7.25 7.25c0 5.29 5.42 10.74 6.57 11.84a.98.98 0 0 0 1.36 0c1.15-1.1 6.57-6.55 6.57-11.84A7.25 7.25 0 0 0 12 2.25Zm0 9.5a2.25 2.25 0 1 1 0-4.5a2.25 2.25 0 0 1 0 4.5Z"/>
    </svg>
  `;
}

function cleanGridAddress(value) {
  return String(value || '')
    .replace(/^\s*\(?\s*(?:\+?84|0|1900|1800)(?:[\s.-]?\d){3,11}\s*\)?\s*/g, '')
    .replace(/\s*\((?:\+?84|0|1900|1800)(?:[\s.-]?\d){3,11}\)\s*/g, ' ')
    .replace(/^\s*(đường|duong|đ\.|hẻm|hem|dốc|doc)\s+/i, '')
    .replace(/(^|\s)(đường|duong|đ\.)\s+/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim();
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
  const cleanValue = String(value || '').replace(/\s+/g, ' ').trim();
  if (!cleanValue) return '';

  return `
    <div class="grid6-address grid6-address-extra story-image-meta">
      <span class="grid6-address-text">${escapeHtml(cleanValue)}</span>
    </div>
  `;
}

function renderSpotlightMetaLine(value, className = '') {
  const cleanValue = String(value || '').replace(/\s+/g, ' ').trim();
  if (!cleanValue) return '';

  return `
    <div class="spotlight-meta ${escapeHtml(className)}">
      <span class="spotlight-pin">${renderPhotomodePin()}</span>
      <span>${escapeHtml(cleanValue)}</span>
    </div>
  `;
}

function spotlightTitleFitClass(value) {
  const length = String(value || '').trim().length;
  if (length >= 28) return 'spotlight-title-fit-xs';
  if (length >= 23) return 'spotlight-title-fit-sm';
  if (length >= 18) return 'spotlight-title-fit-md';
  return '';
}

function renderSpotlightPage(page, index, listId, list, pageSubtitle) {
  const item = page.items?.[0] || {};
  const backgroundImage = item.imageUrl || page.backgroundImage || coverBackgroundImage(page, list);
  const positionClass = spotlightPositionClass(page, index, item);
  const titleText = item.rawName || item.name || page.title || '';
  const titleFitClass = spotlightTitleFitClass(titleText);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-page', positionClass))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText || item.name || 'spotlight')}.png">
      <div class="spotlight-bg">
        ${renderPreviewImage(backgroundImage, item.name || page.title)}
      </div>
      <div class="spotlight-shade"></div>
      <div class="spotlight-copy">
        <h2 class="spotlight-title story-image-title ${escapeHtml(titleFitClass)}">${escapeHtml(titleText)}</h2>
        <div class="spotlight-info">
          ${renderSpotlightMetaLine(item.metaPrimary)}
        </div>
      </div>
    </article>
  `;
}

function renderSpotlightPartnerPage(page, index, listId, list) {
  const item = page.items?.[0] || {};
  const backgroundImage = page.backgroundImage || item.imageUrl || coverBackgroundImage(page, list);
  const positionClass = spotlightPositionClass(page, index, item);
  const titleText = page.title || item.name || '';
  const titleFitClass = spotlightTitleFitClass(titleText);
  const descriptionText = item.metaSecondary || '';
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-page spotlight-partner-page', positionClass))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(titleText || item.rawName || 'partner')}.png">
      <div class="spotlight-bg">
        ${renderPreviewImage(backgroundImage, item.rawName || page.title)}
      </div>
      <div class="spotlight-shade"></div>
      <div class="spotlight-copy">
        <span class="spotlight-partner-brand">${escapeHtml(item.metaPrimary || item.rawName || '')}</span>
        <h2 class="spotlight-title story-image-title ${escapeHtml(titleFitClass)}">${escapeHtml(titleText)}</h2>
        <div class="spotlight-info">
          ${descriptionText ? `<p class="spotlight-partner-desc">${escapeHtml(descriptionText)}</p>` : ''}
          ${renderSpotlightMetaLine(page.subtitle)}
        </div>
      </div>
    </article>
  `;
}

function renderSpotlightListItems(items, options = {}) {
  const showLabels = options.showLabels !== false;
  return (items || []).map((item) => {
    const isHomestay = item.sourceSectionKey === 'homestay';
    const metaSecondary = item.metaSecondary
      || (isHomestay && item.price ? `Giá: ${item.price}` : '');
    return `
    <article class="spotlight-list-row ${escapeHtml(imageSourceClass(item))}">
      <div class="spotlight-list-thumb">
        ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
      </div>
      <div class="spotlight-list-copy">
        ${showLabels && item.label ? `<span class="spotlight-list-label">${escapeHtml(item.label)}</span>` : ''}
        <strong class="story-image-title">${escapeHtml(item.rawName || item.name || '')}</strong>
        ${renderSpotlightMetaLine(item.metaPrimary)}
        ${renderSpotlightMetaLine(metaSecondary, 'secondary')}
      </div>
    </article>
  `;
  }).join('');
}

function renderSpotlightListPage(page, index, listId, list, pageSubtitle) {
  const backgroundImage = page.backgroundImage || firstPortablePageImage(page) || coverBackgroundImage(page, list);
  const showItemLabels = !isStayListPage(page);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-list-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText || page.title || 'list')}.png">
      <div class="spotlight-bg">
        ${renderPreviewImage(backgroundImage, page.title)}
      </div>
      <div class="spotlight-list-shade"></div>
      <div class="spotlight-list-panel">
        <div class="spotlight-list-heading">
          <span>${escapeHtml(page.chipText || '')}</span>
          <h2>${escapeHtml(page.title || '')}</h2>
        </div>
        <div class="spotlight-list-stack">
          ${renderSpotlightListItems(page.items, { showLabels: showItemLabels })}
        </div>
      </div>
    </article>
  `;
}

function renderSpotlightPartnerInfoPage(page, index, listId, list) {
  const backgroundImage = page.backgroundImage || firstPortablePageImage(page) || coverBackgroundImage(page, list);
  const itemRows = (page.items || []).map((item) => `
    <article class="spotlight-partner-info-row">
      <span>${escapeHtml(item.label || '')}</span>
      <strong>${escapeHtml(item.metaPrimary || item.name || '')}</strong>
    </article>
  `).join('');

  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-list-page spotlight-partner-info-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-thong-tin.png">
      <div class="spotlight-bg">
        ${renderPreviewImage(backgroundImage, page.title)}
      </div>
      <div class="spotlight-list-shade"></div>
      <div class="spotlight-partner-info-panel">
        <span class="spotlight-partner-info-kicker">${escapeHtml(page.chipText || '')}</span>
        <h2>${escapeHtml(page.title || 'Thông tin cần lưu')}</h2>
        <p>${escapeHtml(page.subtitle || '')}</p>
        <div class="spotlight-partner-info-stack">
          ${itemRows}
        </div>
        <div class="spotlight-partner-info-cta">Lưu lại khi cần cho chuyến Đà Lạt tới.</div>
      </div>
    </article>
  `;
}

function budgetTableParts(item) {
  const parts = String(item?.label || '').split('|');
  return {
    day: parts[0] || '',
    time: parts[1] || '',
  };
}

function renderBudget3N2DTableRows(items) {
  let lastDay = '';
  return (items || [])
    .filter((item) => !String(item.label || '').startsWith('Tổng|'))
    .map((item) => {
      const { day, time } = budgetTableParts(item);
      const showDay = day && day !== lastDay;
      lastDay = day || lastDay;
      return `
        <tr>
          <td class="budget72-day">${showDay ? escapeHtml(day) : ''}</td>
          <td class="budget72-time">${escapeHtml(time)}</td>
          <td class="budget72-activity">${escapeHtml(item.name || '')}</td>
          <td class="budget72-address">${escapeHtml(item.metaPrimary || '')}</td>
          <td class="budget72-cost">${escapeHtml(item.metaSecondary || '')}</td>
        </tr>
      `;
    }).join('');
}

function renderBudget3N2DSummaryRows(items) {
  return (items || [])
    .filter((item) => String(item.label || '').startsWith('Tổng|'))
    .filter((item) => item.id !== 'budget-3n2d-main-summary-total')
    .map((item) => `
      <tr>
        <td>${escapeHtml(item.name || '')}</td>
        <td>${escapeHtml(item.metaSecondary || '')}</td>
        <td>${escapeHtml(item.metaPrimary || '')}</td>
      </tr>
    `).join('');
}

function budget3N2DTotalItem(items) {
  return (items || []).find((item) => String(item.label || '').startsWith('Tổng|') && /tong|total/i.test(String(item.id || '')))
    || (items || []).filter((item) => String(item.label || '').startsWith('Tổng|')).slice(-1)[0]
    || null;
}

function renderBudget3N2DTablePage(page, index, listId) {
  const totalItem = budget3N2DTotalItem(page.items);
  const totalValue = String(totalItem?.metaSecondary || '').trim() || '~2.5tr - 3tr';
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'budget72-table-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-bang-chi-phi.png">
      <div class="budget72-table-shell">
        <h2>${escapeHtml(page.title || 'ĐÀ LẠT 3 NGÀY 2 ĐÊM')}</h2>
        <table class="budget72-schedule-table">
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Thời gian</th>
              <th>Hoạt động</th>
              <th>Địa chỉ</th>
              <th>Chi phí</th>
            </tr>
          </thead>
          <tbody>
            ${renderBudget3N2DTableRows(page.items)}
          </tbody>
        </table>
        <table class="budget72-summary-table">
          <thead>
            <tr>
              <th>Tên mục</th>
              <th>Chi phí</th>
              <th>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            ${renderBudget3N2DSummaryRows(page.items)}
          </tbody>
        </table>
        <div class="budget72-total-bar">
          <span>Tổng thanh toán dự kiến</span>
          <strong>${escapeHtml(totalValue)}</strong>
        </div>
      </div>
    </article>
  `;
}

function renderBudget3N2DGalleryRow(item, rowIndex) {
  const secondary = budgetGalleryMetaText(item);
  return `
    <article class="budget72-gallery-row ${escapeHtml(imageSourceClass(item))}">
      <div class="budget72-gallery-row-index">${String(rowIndex + 2).padStart(2, '0')}</div>
      <div class="budget72-gallery-row-thumb">
        ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
      </div>
      <div class="budget72-gallery-row-copy">
        ${item.label ? `<span class="budget72-gallery-label">${escapeHtml(item.label)}</span>` : ''}
        <strong class="story-image-title">${escapeHtml(item.rawName || item.name || '')}</strong>
        ${secondary ? `<div class="budget72-gallery-price">${escapeHtml(secondary)}</div>` : ''}
      </div>
    </article>
  `;
}

function renderBudget3N2DGalleryPage(page, index, listId, list) {
  const items = Array.isArray(page.items) ? page.items.slice(0, 4) : [];
  const hero = items[0] || {};
  const heroMeta = budgetGalleryMetaText(hero);
  const backgroundImage = page.backgroundImage || hero.imageUrl || coverBackgroundImage(page, list);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'budget72-gallery-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText || page.title || 'gallery')}.png">
      <div class="budget72-gallery-backdrop">
        ${renderPreviewImage(backgroundImage, page.title)}
      </div>
      <div class="budget72-gallery-shell">
        <header class="budget72-gallery-head">
          <span>72H Đà Lạt</span>
          <h2>${escapeHtml(page.title || '')}</h2>
        </header>
        <section class="budget72-gallery-hero ${escapeHtml(imageSourceClass(hero))}">
          ${renderPreviewImage(hero.imageUrl || backgroundImage, hero.name || page.title, '', hero.candidateImageUrls)}
          <div class="budget72-gallery-hero-copy">
            <div class="budget72-gallery-hero-top">
              <span class="budget72-gallery-index">01</span>
              ${hero.label ? `<span class="budget72-gallery-label">${escapeHtml(hero.label)}</span>` : ''}
              ${hero.isPartner ? '<span class="budget72-gallery-partner">Đối tác</span>' : ''}
            </div>
            <h3 class="story-image-title">${escapeHtml(hero.rawName || hero.name || '')}</h3>
            ${heroMeta ? `<div class="budget72-gallery-price">${escapeHtml(heroMeta)}</div>` : ''}
          </div>
        </section>
        <section class="budget72-gallery-stack">
          ${items.slice(1).map((item, rowIndex) => renderBudget3N2DGalleryRow(item, rowIndex)).join('')}
        </section>
      </div>
    </article>
  `;
}

function budgetGalleryMetaText(item) {
  const primary = String(item?.metaPrimary || '').replace(/\s+/g, ' ').trim();
  const secondary = String(item?.metaSecondary || '').replace(/\s+/g, ' ').trim();
  const combined = `${primary} ${secondary}`.trim();
  const hoursMatch = combined.match(/Khung gi(?:ờ|á»):\s*([^·]+)/i);
  if (hoursMatch?.[1]) {
    return `Khung giờ: ${hoursMatch[1].trim()}`;
  }
  if (/^Khung gi(?:ờ|á»):/i.test(secondary)) {
    return secondary.replace(/\s*·.*$/, '').trim();
  }
  return '';
}

function renderBudget3N2DGalleryCorner(item, cornerIndex) {
  const secondary = budgetGalleryMetaText(item);
  return `
    <article class="budget72-corner-card budget72-corner-${cornerIndex + 1} ${escapeHtml(imageSourceClass(item))}">
      ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
      <div class="budget72-corner-copy">
        <div class="budget72-corner-topline">
          <span class="budget72-gallery-index">${String(cornerIndex + 1).padStart(2, '0')}</span>
          ${item.label ? `<span class="budget72-gallery-label">${escapeHtml(item.label)}</span>` : ''}
          ${item.isPartner ? '<span class="budget72-gallery-partner">Đối tác</span>' : ''}
        </div>
        <strong class="story-image-title">${escapeHtml(item.rawName || item.name || '')}</strong>
        <div class="budget72-corner-meta">
          ${secondary ? `<div class="budget72-gallery-price">${escapeHtml(secondary)}</div>` : ''}
        </div>
      </div>
    </article>
  `;
}

function renderBudget3N2DGalleryCornerPage(page, index, listId, list) {
  const items = Array.isArray(page.items) ? page.items.slice(0, 4) : [];
  const backgroundImage = page.backgroundImage || firstPortablePageImage(page) || coverBackgroundImage(page, list);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'budget72-gallery-page budget72-corner-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText || page.title || 'gallery')}.png">
      <div class="budget72-gallery-backdrop">
        ${renderPreviewImage(backgroundImage, page.title)}
      </div>
      <div class="budget72-gallery-shell">
        <div class="budget72-corner-grid">
          ${items.map((item, cornerIndex) => renderBudget3N2DGalleryCorner(item, cornerIndex)).join('')}
        </div>
        <section class="budget72-gallery-center">
          <span>dalat.</span>
          <h2>${escapeHtml(page.title || '')}</h2>
          <p>${escapeHtml(page.subtitle || 'Gợi ý nhanh để lưu lại và chọn điểm ghé hợp lịch.')}</p>
        </section>
      </div>
    </article>
  `;
}

function normalizeGridText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function compactGridItemName(value) {
  const original = String(value || '').replace(/\s+/g, ' ').trim();
  const normalized = normalizeGridText(original);

  if (normalized.includes('nha tho domaine de marie')) return 'Nhà thờ Domain';
  if (normalized.includes('kdl the florest') || normalized.includes('the florest')) return 'The Florest';
  if (normalized.includes('truong dai hoc da lat')) return 'ĐH Đà Lạt';
  if (normalized.includes('doc han thuyen')) return 'Dốc Hàn Thuyên';

  const cleaned = original
    .replace(/^\s*(Ăn\s+(sáng|trưa|tối)|Cafe|Cà phê|Check-?in|Điểm ghé|Bắt đầu|Chốt chuyến|Dịch vụ|Cần lưu|Cần nhớ|Nên ghé|Buổi sáng|Sáng sớm)\s*:\s*/i, '')
    .replace(/^\s*KDL\s+/i, '')
    .replace(/\s*-\s*(Hoa Trong Rung|Hoa Trong Rừng|Da Lat|Đa Lat|Đà Lạt).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

function gridDisplayName(item) {
  return compactGridItemName(item?.rawName || item?.name);
}

export function renderPhotomodeItems(items) {
  return items.map((item) => `
    <section class="photomode-item ${escapeHtml(item.imageSource || (item.imageMapped ? 'manual' : 'fallback'))}">
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

export function renderGrid6Items(items, { numbered = false, twoDigitNumber = false, showLabel = false } = {}) {
  return items.map((item, index) => {
    const displayName = gridDisplayName(item);
    const itemNumber = twoDigitNumber ? String(index + 1).padStart(2, '0') : String(index + 1);
    const itemName = numbered ? `${itemNumber}. ${displayName}` : displayName;
    return `
    <div class="grid6-item ${escapeHtml(item.imageSource || (item.imageMapped ? 'manual' : 'fallback'))}">
      ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
      <div class="grid6-overlay">
        ${showLabel && item.label ? `<div class="grid6-service-label">${escapeHtml(item.label)}</div>` : ''}
        <div class="grid6-name story-image-title">${escapeHtml(itemName)}</div>
        ${renderGridAddress(item.metaPrimary)}
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

function renderGrid8Secondary(value) {
  const cleanValue = String(value || '').replace(/\s+/g, ' ').trim();
  if (!cleanValue) return '';
  return `<div class="grid8-meta grid8-meta-extra story-image-meta"><span>${escapeHtml(cleanValue)}</span></div>`;
}

function journeyGrid8Intro(page) {
  const chip = String(page?.chipText || '').trim().toLowerCase();
  const title = String(page?.title || '').trim().toLowerCase();
  const textKey = `${chip} ${title}`;
  const pageSubtitle = polishShortVietnameseCopy(page?.subtitle || '');
  if (textKey.includes('day 01') || textKey.includes('ngày 1') || textKey.includes('vao pho') || textKey.includes('vào phố')) {
    return pageSubtitle || 'Một nhịp mở đầu dễ đi, đủ bữa ăn, cafe và check-in trong ngày đầu.';
  }
  if (textKey.includes('day 02') || textKey.includes('ngày 2') || textKey.includes('san anh') || textKey.includes('săn ảnh')) {
    return pageSubtitle || 'Ưu tiên các điểm có ảnh đẹp, di chuyển theo nhịp sáng đến tối.';
  }
  if (textKey.includes('day 03') || textKey.includes('ngày 3') || textKey.includes('di sau') || textKey.includes('đi sâu')) {
    return pageSubtitle || 'Ngày giữa chuyến đi dành cho điểm xa hơn, trải nghiệm rõ chất Đà Lạt.';
  }
  if (textKey.includes('day 04') || textKey.includes('ngày 4') || textKey.includes('sang cham') || textKey.includes('sáng chậm')) {
    return pageSubtitle || 'Một ngày cuối gọn nhịp, vẫn đủ điểm ghé và chốt bữa tối. Lưu lại ngay nhé.';
  }
  if (textKey.includes('lưu trú') || textKey.includes('luu tru')) {
    return pageSubtitle || 'Các lựa chọn nên xem trước để chốt nơi nghỉ phù hợp lịch trình.';
  }
  if (textKey.includes('dịch vụ') || textKey.includes('dich vu')) {
    return pageSubtitle || 'Các dịch vụ hỗ trợ chuyến đi, ưu tiên mục có thông tin rõ để liên hệ nhanh.';
  }
  return polishShortVietnameseCopy(sanitizeSubtitleForDisplay(page?.subtitle, [page]));
}

export function renderGrid8Items(items, title, chipText, backgroundImage, introText = '', options = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return '';
  }
  const showTime = Boolean(options.showTime);
  const showMeta = options.showMeta !== false;
  const showCenterChip = options.showCenterChip !== false;
  const showLabel = Boolean(options.showLabel);
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
            <strong class="story-image-title">${escapeHtml(displayName)}</strong>
            ${showMeta ? renderGrid8Meta(item.metaPrimary) : ''}
            ${showMeta ? renderGrid8Secondary(item.metaSecondary) : ''}
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
              <strong class="story-image-title">${escapeHtml(displayName)}</strong>
              ${showMeta ? renderGrid8Meta(item.metaPrimary) : ''}
              ${showMeta ? renderGrid8Secondary(item.metaSecondary) : ''}
            </div>
          </article>
        `;
      }).join('')}
  `;
}

export function renderItineraryItems(items) {
  return items.map((item) => `
    <div class="item-row itinerary-row">
      <div class="thumb-block itinerary-thumb ${item.imageSource || (item.imageMapped ? 'manual' : 'fallback')}">
        ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
      </div>
      <div class="item-copy itinerary-copy">
        <div class="itinerary-topline">
          <div class="item-label itinerary-time">${escapeHtml(item.label)}</div>
          <div class="itinerary-name story-image-title">${escapeHtml(item.name)}</div>
        </div>
        <p class="item-meta story-image-meta itinerary-detail">
          ${escapeHtml(item.metaPrimary)}${item.metaSecondary ? ` · ${escapeHtml(item.metaSecondary)}` : ''}
        </p>
      </div>
    </div>
  `).join('');
}

export function renderJourney4N3DItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '';
  }

  return `
    <div class="journey-timeline">
      ${items.map((item) => `
        <article class="journey-time-row ${escapeHtml(item.imageSource || (item.imageMapped ? 'manual' : 'fallback'))}">
          <div class="journey-stop-thumb">
            ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
          </div>
          <div class="journey-time-copy">
            <strong class="story-image-title">${escapeHtml(item.name)}</strong>
            <p class="story-image-meta">${escapeHtml(item.metaPrimary)}</p>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function journey4N3DTitle(chipText, title) {
  const chip = String(chipText || '').trim();
  const cleanTitle = String(title || '').trim();
  if (!chip || !cleanTitle) {
    return cleanTitle || chip;
  }
  if (cleanTitle.toLowerCase().startsWith(`${chip.toLowerCase()} - `)) {
    return cleanTitle;
  }
  return `${chip} - ${cleanTitle}`;
}

export function renderListPage(page, index, total, listId, hashtags = [], list = null) {
  const pageSubtitle = sanitizeSubtitleForDisplay(page.subtitle, list?.pages || [page]);
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
    const grid8Title = isGeneratedCaptionList(list) ? contextualGrid8Title(page) : page.title;
    const grid8Intro = grid8IntroForPage(page, pageSubtitle, list);
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'grid8-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        <div class="grid8-matrix">
          ${renderGrid8Items(page.items, grid8Title, page.chipText, page.backgroundImage, grid8Intro, { showLabel: isServiceOrStayListPage(page) })}
        </div>
      </article>
    `;
  }

  if (isJourneyGrid8Layout(page)) {
    const hideCenterChip = page.chipText === 'Lưu trú' || page.chipText === 'Homestay' || page.chipText === 'Dịch vụ';
    const showJourneyServiceLabel = isServiceOrStayListPage(page) || hideCenterChip;
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'grid8-page', 'journey-grid8-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        <div class="grid8-matrix">
          ${renderGrid8Items(page.items, page.title, page.chipText, page.backgroundImage, journeyGrid8Intro(page), { showTime: false, showMeta: true, showCenterChip: !hideCenterChip, showLabel: showJourneyServiceLabel })}
        </div>
      </article>
    `;
  }

  if (isGridLayout(page)) {
    if (isGrid4FeaturePage(page)) {
      return renderGrid4FeaturePage(page, index, listId, list, pageSubtitle);
    }

    const gridVariantClass = page.layoutVariant === 'grid-4'
      ? ' grid4'
      : page.layoutVariant === 'grid-8'
        ? ' grid8'
        : '';
    const gridBodyClass = page.layoutVariant === 'grid-4'
      ? ' grid4-body'
      : page.layoutVariant === 'grid-8'
        ? ' grid8-body'
        : '';
    const showServiceLabel = isServiceOrStayListPage(page);
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'grid6', gridVariantClass.trim()))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        <div class="grid6-header">
           <div class="grid6-header-top">${escapeHtml(page.title)}</div>
        </div>
        <div class="grid6-body${gridBodyClass}">
          ${renderGrid6Items(page.items, { showLabel: showServiceLabel })}
        </div>
      </article>
    `;
  }

  if (page.layoutVariant === 'journey-4n3d') {
    const dayNumber = String(Math.max(index, 1)).padStart(2, '0');
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'journey4', `journey-page-${dayNumber}`))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        <div class="journey-bg">${renderPreviewImage(page.backgroundImage, page.title)}</div>
        <div class="journey-day-badge">${escapeHtml(page.chipText)}</div>
        <div class="journey-card">
          <div class="journey-title-block">
            <h3 class="page-title">${escapeHtml(journey4N3DTitle(page.chipText, page.title))}</h3>
            ${pageSubtitle ? `<p class="page-lead">${escapeHtml(pageSubtitle)}</p>` : ''}
          </div>
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
      <div class="page-shell-bg">${renderPreviewImage(page.backgroundImage, page.title)}</div>
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
