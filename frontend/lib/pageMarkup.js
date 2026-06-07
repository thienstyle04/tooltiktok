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

function isBudget3N2DStoryCover(page) {
  return page.layoutVariant === 'budget-3n2d-story' && page.type === 'cover';
}

const MOJIBAKE_TEXT_RE = /(?:Ã|Â|Ä|Å|Æ|áÂ|â€|ï¿½)/;

const BUDGET72_STORY_TEXT = {
  coverTitle: '"72H" \u1ede \u0110\u00c0 L\u1ea0T V\u1edaI 3TR',
  coverSubtitle: 'L\u1ecbch tr\u00ecnh 3 ng\u00e0y 2 \u0111\u00eam g\u1ecdn h\u01a1n: xem theo t\u1eebng ng\u00e0y, c\u00f3 chi ph\u00ed v\u00e0 c\u00e1c \u0111i\u1ec3m n\u00ean l\u01b0u.',
  day1: {
    chip: 'Ng\u00e0y 01',
    title: 'Ng\u00e0y \u0111\u1ea7u v\u00e0o ph\u1ed1',
    subtitle: '\u0102n s\u00e1ng, cafe, check-in v\u00e0 m\u1ed9t bu\u1ed5i t\u1ed1i v\u1eeba \u0111\u1ee7 nh\u1ecbp \u0111\u1ec3 l\u00e0m quen \u0110\u00e0 L\u1ea1t.',
  },
  day2: {
    chip: 'Ng\u00e0y 02',
    title: 'M\u1ed9t ng\u00e0y \u0111i tr\u1ecdn h\u01a1n',
    subtitle: 'D\u00e0nh ng\u00e0y gi\u1eefa chuy\u1ebfn cho c\u00e1c \u0111i\u1ec3m ch\u00ednh, qu\u00e1n \u0111\u1eb9p v\u00e0 ho\u1ea1t \u0111\u1ed9ng \u0111\u00e1ng gh\u00e9.',
  },
  day3: {
    chip: 'Ng\u00e0y 03',
    title: 'Ng\u00e0y cu\u1ed1i nh\u1eb9 nh\u00e0ng',
    subtitle: 'Gi\u1eef l\u1ecbch g\u1ecdn \u0111\u1ec3 k\u1ecbp \u0103n, mua qu\u00e0, check-out v\u00e0 quay v\u1ec1 kh\u00f4ng b\u1ecb g\u1ea5p.',
  },
  total: {
    chip: 'Chi ph\u00ed',
    title: 'T\u1ed5ng chi ph\u00ed d\u1ef1 ki\u1ebfn',
    subtitle: 'C\u00e1c kho\u1ea3n ch\u00ednh \u0111\u01b0\u1ee3c gom l\u1ea1i \u0111\u1ec3 d\u1ec5 c\u00e2n ng\u00e2n s\u00e1ch tr\u01b0\u1edbc khi \u0111i.',
    label: '72H \u0110\u00e0 L\u1ea1t',
    finalLabel: 'T\u1ed5ng thanh to\u00e1n d\u1ef1 ki\u1ebfn',
  },
};

function hasMojibakeText(value) {
  return MOJIBAKE_TEXT_RE.test(String(value || ''));
}

function cleanStoryText(value, fallback = '') {
  const text = String(value || '').trim();
  if (!text || hasMojibakeText(text)) return fallback;
  return text;
}

function budgetStoryDayNumber(page, index) {
  const raw = `${page?.chipText || ''} ${page?.title || ''} ${index + 1}`.toLowerCase();
  const numberMatch = raw.match(/\b0?([123])\b/);
  if (numberMatch) return Number(numberMatch[1]);
  const pageOffset = index - 1;
  if (pageOffset >= 1 && pageOffset <= 3) return pageOffset;
  return 1;
}

function cleanBudgetStoryDayCopy(page, index) {
  const defaults = BUDGET72_STORY_TEXT[`day${budgetStoryDayNumber(page, index)}`] || BUDGET72_STORY_TEXT.day1;
  return {
    chip: cleanStoryText(page?.chipText, defaults.chip),
    title: cleanStoryText(page?.title, defaults.title),
    subtitle: cleanStoryText(page?.subtitle, defaults.subtitle),
  };
}

function cleanBudgetStoryTotalCopy(page) {
  return {
    chip: cleanStoryText(page?.chipText, BUDGET72_STORY_TEXT.total.chip),
    title: cleanStoryText(page?.title, BUDGET72_STORY_TEXT.total.title),
    subtitle: cleanStoryText(page?.subtitle, BUDGET72_STORY_TEXT.total.subtitle),
  };
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

function spotlightV2ListHeading(page) {
  if (isStayListPage(page)) return 'Homestay cần lưu';
  if (isServiceListPage(page)) return 'Dịch vụ cần lưu';
  return String(page?.title || page?.chipText || '').trim();
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

// ─── Grid 4 Mutant render helpers ────────────────────────────────────────────

function renderGrid4MutantCover(page, index, listId) {
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

function renderGrid4MutantItems(items, position = 'bottom') {
  return items.map((item) => {
    const displayName = compactGridItemName(item?.rawName || item?.name);
    const cleanAddress = cleanGridAddress(item?.metaPrimary);
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
          <div class="grid4-mutant-name story-image-title">${escapeHtml(displayName)}</div>
          ${addressHtml}
        </div>
      </div>
    `;
  }).join('');
}

function renderGrid4MutantContentPage(page, index, listId) {
  const contentStyle = page.contentStyle || 'strip';
  const styleClass = `mutant-${contentStyle}`;
  const showServiceLabel = isServiceOrStayListPage(page);
  const itemsToRender = (page.items || []).slice(0, 4);
  // Filter labels if not service/stay page
  const processedItems = showServiceLabel ? itemsToRender : itemsToRender.map(item => ({ ...item, label: '' }));

  if (contentStyle === 'strip') {
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'grid4-mutant', styleClass))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        <div class="grid4-mutant-body">
          ${renderGrid4MutantItems(processedItems.slice(0, 2), 'top')}
          <div class="grid4-mutant-title-strip">${escapeHtml(page.title)}</div>
          ${renderGrid4MutantItems(processedItems.slice(2, 4), 'bottom')}
        </div>
      </article>
    `;
  }

  // center-card: top row items have overlay at top, bottom row at bottom
  // (so center title card doesn't cover any item text)
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'grid4-mutant', styleClass))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
      <div class="grid4-mutant-body">
        ${renderGrid4MutantItems(processedItems.slice(0, 2), 'top')}
        ${renderGrid4MutantItems(processedItems.slice(2, 4), 'bottom')}
        <div class="grid4-mutant-title-card">${escapeHtml(page.title)}</div>
      </div>
    </article>
  `;
}

// ─── End Grid 4 Mutant ───────────────────────────────────────────────────────

// ─── Grid 6 Zigzag render helpers ────────────────────────────────────────────

function renderZigzagCover(page, index, listId) {
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

function renderZigzagItems(items) {
  return items.map((item) => {
    const displayName = compactGridItemName(item?.rawName || item?.name);
    const address = String(item?.metaPrimary || '').replace(/\s+/g, ' ').trim();
    const price = String(item?.metaSecondary || '').trim();
    const label = String(item?.label || '').trim();
    const addressHtml = address ? `<div class="zigzag-address">${escapeHtml(address)}</div>` : '';
    const priceHtml = price ? `<span class="zigzag-price">${escapeHtml(price)}</span>` : '';
    const labelHtml = (!price && label) ? `<span class="zigzag-label">${escapeHtml(label)}</span>` : '';
    return `
      <div class="zigzag-item">
        <div class="zigzag-thumb ${escapeHtml(item.imageSource || (item.imageMapped ? 'manual' : 'fallback'))}">
          ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
        </div>
        <div class="zigzag-copy">
          <div class="zigzag-name story-image-title">${escapeHtml(displayName)}</div>
          ${addressHtml}
          ${priceHtml}${labelHtml}
        </div>
      </div>
    `;
  }).join('');
}

function renderZigzagContentPage(page, index, listId) {
  const itemsToRender = (page.items || []).slice(0, 6);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'zigzag-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
      <div class="zigzag-header">
        <div class="zigzag-header-title">${escapeHtml(page.title)}</div>
      </div>
      <div class="zigzag-body">
        ${renderZigzagItems(itemsToRender)}
      </div>
    </article>
  `;
}

// ─── End Grid 6 Zigzag ───────────────────────────────────────────────────────

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

  if ((pages || []).some((page) => page?.layoutVariant === 'spotlight-partner')) {
    return polishShortVietnameseCopy(clean);
  }

  const placeNames = collectPagePlaceNames(pages);
  if (hasPagePlaceName(clean, placeNames) || looksLikeStopList(clean) || looksLocationSpecific(clean)) {
    return GENERIC_CAPTION_BODY;
  }

  return polishShortVietnameseCopy(clean);
}

const V2_COVER_VARIANTS = new Set([
  'grid-8-feed',
  'grid-8-quaytung-cover',
  'spotlight-v2',
  'spotlight-partner-v2',
  'pov-maikem',
  'pov-3-v2-cover',
  'budget-wallet-cover',
]);

const V2_LIST_VARIANTS = new Set([
  'grid-8-feed',
  'grid-8-quaytung',
  'grid-8-quaytung-menu',
  'spotlight-v2',
  'spotlight-v2-list',
  'spotlight-partner-v2',
  'spotlight-partner-v2-info',
  'pov-maikem',
  'pov-3-v2-stack',
  'pov-3-v2-grid',
  'budget-wallet-day',
  'budget-wallet-fixed',
  'budget-wallet-bill',
]);

function cafeLightPrice(item) {
  const raw = String(item.metaSecondary || item.metaPrimary || '').trim();
  const match = raw.match(/(\d+\s*k|\d+[.,]?\d*\s*tr)/i);
  return match ? match[1] : (raw.includes('Giá') ? raw : '');
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

function grid8FeedCenterHook(page, list) {
  const kind = gridPageKind(page);
  if (GRID8_FEED_CENTER_HOOKS[kind]) return GRID8_FEED_CENTER_HOOKS[kind];
  const stripped = stripChipPrefixFromTitle(page.chipText, page.title);
  if (stripped) return stripped;
  return String(page.chipText || 'Đà Lạt').trim();
}

function grid8FeedItemMeta(item) {
  const address = cleanGridAddress(item?.metaPrimary);
  if (address) return address;
  const raw = String(item?.metaPrimary || '').trim();
  const phone = raw.match(/(?:\+?84|0)\d[\d\s.]{7,12}\d/);
  if (phone) return phone[0].replace(/\s+/g, ' ').trim();
  return String(item?.metaSecondary || '').trim();
}

function stripChipPrefixFromTitle(chipText, title) {
  const chip = String(chipText || '').trim();
  const raw = String(title || '').trim();
  if (!raw) return '';
  if (!chip) return raw;
  const lowerTitle = raw.toLowerCase();
  const lowerChip = chip.toLowerCase();
  if (lowerTitle === lowerChip) return '';
  if (lowerTitle.startsWith(`${lowerChip} - `)) return raw.slice(chip.length + 3).trim();
  if (lowerTitle.startsWith(`${lowerChip}-`)) return raw.slice(chip.length + 1).trim();
  if (lowerTitle.startsWith(lowerChip)) return raw.slice(chip.length).replace(/^[\s\-–—:]+/, '').trim();
  return raw;
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
  const kind = gridPageKind(page);
  if (kind === 'cafe') {
    const idx = listVariantIndex(list, 2, page.chipText);
    return idx === 0 ? 'Một vài quán cafe đẹp' : 'Một vài quán cafe chill';
  }
  if (GRID5_TITLE_CARDS[kind]) return GRID5_TITLE_CARDS[kind];
  const stripped = stripChipPrefixFromTitle(page.chipText, page.title);
  return stripped || String(page.chipText || 'Gợi ý Đà Lạt').trim();
}

function grid5ItemMeta(item) {
  const address = cleanGridAddress(item?.metaPrimary);
  if (address) return address;
  return String(item?.metaSecondary || '').trim();
}

function renderGrid8FeedSlot(item) {
  const displayName = gridDisplayName(item);
  const meta = grid8FeedItemMeta(item);
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
  const raw = String(hookText || '').trim();
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

function renderGrid8FeedItems(items, centerHook) {
  const cells = (items || []).slice(0, 8);
  const centerHtml = renderGrid8FeedCenterSlot(centerHook);
  const ordered = [
    ...cells.slice(0, 3).map((item) => renderGrid8FeedSlot(item)),
    cells[3] ? renderGrid8FeedSlot(cells[3]) : '',
    centerHtml,
    cells[4] ? renderGrid8FeedSlot(cells[4]) : '',
    ...cells.slice(5, 8).map((item) => renderGrid8FeedSlot(item)),
  ].filter(Boolean);

  return ordered.join('');
}

function renderGrid8FeedCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
  const hero = String(coverTitle || 'CÁC ĐỊA ĐIỂM ĐÀ LẠT').toUpperCase();
  const tagline = String(coverSubtitle || 'BỎ LỠ CHẮC CHẮN LÀ HỐI HẬN').toUpperCase();
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'grid8-feed-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="grid8-feed-cover-photo">
        ${renderPreviewImage(backgroundImage, coverTitle)}
      </div>
      <div class="grid8-feed-cover-dim"></div>
      <div class="grid8-feed-cover-top">
        <h1 class="grid8-feed-cover-hero">${escapeHtml(hero)}</h1>
        <p class="grid8-feed-cover-tagline">${escapeHtml(tagline)}</p>
      </div>
    </article>
  `;
}

function renderGrid8QuaytungDalatBadge() {
  return '<span class="grid8-quaytung-dalat-badge">dalat</span>';
}

function formatGrid8QuaytungCoverTitle(title) {
  const raw = String(title || 'List này toàn địa điểm "vuýp"').replace(/\s+/g, ' ').trim();
  const words = raw.split(' ');
  if (words.length <= 4) return escapeHtml(raw);
  const splitAt = Math.ceil(words.length / 2);
  return `${escapeHtml(words.slice(0, splitAt).join(' '))}<br>${escapeHtml(words.slice(splitAt).join(' '))}`;
}

function renderGrid8QuaytungCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
  const subtitle = String(coverSubtitle || 'Lưu list này cho chuyến đi thành công').replace(/^\[+|\]+$/g, '').trim();
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'grid8-quaytung-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="grid8-quaytung-cover-photo">
        ${renderPreviewImage(backgroundImage, coverTitle)}
      </div>
      <div class="grid8-quaytung-cover-dim"></div>
      <div class="grid8-quaytung-cover-center">
        ${renderGrid8QuaytungDalatBadge()}
        <h1 class="grid8-quaytung-cover-title">${formatGrid8QuaytungCoverTitle(coverTitle)}</h1>
        <p class="grid8-quaytung-cover-sub">[ ${escapeHtml(subtitle)} ]</p>
      </div>
    </article>
  `;
}

function grid8QuaytungItemHours(item) {
  const secondary = String(item?.metaSecondary || '').replace(/\s+/g, ' ').trim();
  const hoursMatch = secondary.match(/Khung giờ:\s*([^·]+)/i);
  if (hoursMatch) return hoursMatch[1].trim();
  const priceMatch = secondary.match(/Giá:\s*([^·]+)/i);
  if (priceMatch && /free|miễn\s*phí|^0\s*đ$/i.test(priceMatch[1])) return 'FREE';
  if (/free|miễn\s*phí/i.test(secondary)) return 'FREE';
  return '';
}

function renderGrid8QuaytungSlot(item) {
  const displayName = gridDisplayName(item);
  const address = cleanGridAddress(item?.metaPrimary) || String(item?.metaPrimary || '').trim();
  const hours = grid8QuaytungItemHours(item);
  return `
    <div class="grid8-quaytung-slot ${escapeHtml(imageSourceClass(item))}">
      <div class="grid8-quaytung-photo">
        ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
        <div class="grid8-quaytung-shade"></div>
        <div class="grid8-quaytung-labels">
          <div class="grid8-quaytung-name">${escapeHtml(displayName)}</div>
          ${address ? `<div class="grid8-quaytung-address">${escapeHtml(address)}</div>` : ''}
          ${hours ? `<div class="grid8-quaytung-hours"><span class="grid8-quaytung-clock" aria-hidden="true">🕒</span> ${escapeHtml(hours)}</div>` : ''}
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
          <div class="grid8-quaytung-center-hook">"${escapeHtml(hook)}"</div>
          ${tagline ? `<div class="grid8-quaytung-center-tagline">${escapeHtml(tagline)}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderGrid8QuaytungItems(page, items, backgroundImage) {
  const cells = (items || []).slice(0, 8);
  const centerHtml = renderGrid8QuaytungCenterSlot(page, backgroundImage);
  const ordered = [
    ...cells.slice(0, 3).map((item) => renderGrid8QuaytungSlot(item)),
    cells[3] ? renderGrid8QuaytungSlot(cells[3]) : '',
    centerHtml,
    cells[4] ? renderGrid8QuaytungSlot(cells[4]) : '',
    ...cells.slice(5, 8).map((item) => renderGrid8QuaytungSlot(item)),
  ].filter(Boolean);
  return ordered.join('');
}

function renderGrid8QuaytungMenuSection(section, reverse) {
  const photoItem = section.items.find((item) => item.imageUrl) || section.items[0];
  const photoUrl = photoItem?.imageUrl || '';
  const rows = section.items.map((item) => {
    const address = cleanGridAddress(item.metaPrimary) || String(item.metaPrimary || '').trim();
    return `
      <li class="grid8-quaytung-menu-row">
        <strong>${escapeHtml(gridDisplayName(item))}</strong>
        ${address ? `<span>${escapeHtml(address)}</span>` : ''}
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
        ${photoUrl ? renderPreviewImage(photoUrl, section.title) : ''}
      </div>
    </section>
  `;
}

function renderGrid8QuaytungMenuPage(page, index, listId, list) {
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
  const backgroundImage = page.backgroundImage || coverBackgroundImage(page, list);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'grid8-quaytung-menu-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText || 'menu')}.png">
      <div class="grid8-quaytung-menu-bg">
        ${renderPreviewImage(backgroundImage, page.title)}
      </div>
      <div class="grid8-quaytung-menu-dim"></div>
      <div class="grid8-quaytung-menu-head">
        ${renderGrid8QuaytungDalatBadge()}
        <h2 class="grid8-quaytung-menu-title">${escapeHtml(page.title || 'ĐỊA ĐIỂM ĂN UỐNG NGON')}</h2>
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

function renderGrid5PhotoCell(item) {
  const meta = grid5ItemMeta(item);
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

function renderGrid5Matrix(items, titleText) {
  const cells = (items || []).slice(0, 5);
  const ordered = [
    renderGrid5TitleCell(titleText),
    cells[0] ? renderGrid5PhotoCell(cells[0]) : '',
    cells[1] ? renderGrid5PhotoCell(cells[1]) : '',
    cells[2] ? renderGrid5PhotoCell(cells[2]) : '',
    cells[3] ? renderGrid5PhotoCell(cells[3]) : '',
    cells[4] ? renderGrid5PhotoCell(cells[4]) : '',
  ].filter(Boolean);
  return ordered.join('');
}

function renderGrid5Cover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
  const hero = String(coverTitle || 'Dalat').trim();
  const hook = String(coverSubtitle || 'Tháng 5+6 nên đi đâu? Làm gì?').trim();
  const bracket = '[ Gợi ý những tọa độ hay ho cho chuyến đi mùa hè ]';
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'grid5-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="grid5-cover-bg">
        ${renderPreviewImage(backgroundImage, coverTitle)}
      </div>
      <div class="grid5-cover-shade"></div>
      <div class="grid5-cover-copy">
        <div class="grid5-cover-script">Thong dong</div>
        <div class="grid5-cover-hero-row">
          <h1 class="grid5-cover-dalat">${escapeHtml(hero)}</h1>
          <p class="grid5-cover-hook">${escapeHtml(hook)}</p>
        </div>
        <p class="grid5-cover-bracket">${escapeHtml(bracket)}</p>
      </div>
    </article>
  `;
}

function renderGrid5Page(page, index, listId, pageSubtitle, list = null) {
  const titleCard = grid5TitleCard(page, list);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'grid5-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
      <div class="grid5-matrix">
        ${renderGrid5Matrix(page.items, titleCard)}
      </div>
    </article>
  `;
}

function spotlightCoverGridSeed(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickUniqueCoverGridImages(pool, seed, count = 4) {
  const unique = [...new Set((pool || []).map((url) => String(url || '').trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  const ordered = [...unique].sort(
    (left, right) => spotlightCoverGridSeed(`${seed}:${left}`) - spotlightCoverGridSeed(`${seed}:${right}`),
  );
  return ordered.slice(0, count);
}

let spotlightV2CoverImagePool = [];

export function setSpotlightV2CoverImagePool(urls) {
  spotlightV2CoverImagePool = Array.isArray(urls) ? urls.filter(Boolean) : [];
}

function spotlightV2CoverGridImages(page, backgroundImage, listId = '', coverImageUrls = []) {
  const fromPage = Array.isArray(page?.coverImages) ? page.coverImages.filter(Boolean) : [];
  const uniqueFromPage = [...new Set(fromPage)];
  if (uniqueFromPage.length >= 4) return uniqueFromPage.slice(0, 4);

  const pool = (coverImageUrls.length > 0 ? coverImageUrls : spotlightV2CoverImagePool).filter(Boolean);
  const seed = `${listId || page?.title || 'spotlight-v2-cover'}|cover-grid`;
  const fromPool = pickUniqueCoverGridImages(pool, seed, 4);
  const merged = [...new Set([...uniqueFromPage, ...fromPool])];
  if (merged.length >= 4) return merged.slice(0, 4);
  if (merged.length > 0) return merged;

  return backgroundImage ? [backgroundImage] : [];
}

function formatSpotlightV2CoverSubtitle(subtitle) {
  const clean = String(subtitle || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.startsWith('/') && clean.endsWith('/')) return clean;
  return `/${clean.replace(/^\/+|\/+$/g, '')}/`;
}

function renderSpotlightV2Cover(page, index, listId, coverTitle, coverSubtitle, backgroundImage, options = {}) {
  const partnerClass = options.partner ? ' spotlight-partner-v2-cover' : '';
  const coverImageUrls = options.coverImageUrls || [];
  let tiles = spotlightV2CoverGridImages(page, backgroundImage, listId, coverImageUrls);
  while (tiles.length < 4) tiles.push('');
  tiles = tiles.slice(0, 4);
  const subtitle = formatSpotlightV2CoverSubtitle(coverSubtitle);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-v2-cover', partnerClass.trim()))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="spotlight-v2-cover-grid">
        ${tiles.map((url, tileIndex) => `
          <div class="spotlight-v2-cover-cell">
            ${url ? renderPreviewImage(url, `${coverTitle || 'cover'} ${tileIndex + 1}`) : ''}
          </div>
        `).join('')}
      </div>
      <div class="spotlight-v2-cover-dim" aria-hidden="true"></div>
      <div class="spotlight-v2-cover-center">
        ${options.partner ? '<div class="spotlight-v2-cover-partner-script">dalat.</div>' : ''}
        ${!options.partner ? '<div class="spotlight-v2-cover-ornament" aria-hidden="true">✦ · 📷 · ✦</div>' : ''}
        ${coverTitle ? `<h1 class="spotlight-v2-cover-title">${escapeHtml(coverTitle)}</h1>` : ''}
        ${subtitle ? `<p class="spotlight-v2-cover-caption">${escapeHtml(subtitle)}</p>` : ''}
      </div>
    </article>
  `;
}

function renderSpotlightV2Page(page, index, listId, list, options = {}) {
  const item = page.items?.[0] || {};
  const backgroundImage = item.imageUrl || page.backgroundImage || coverBackgroundImage(page, list);
  const titleText = item.rawName || item.name || page.title || '';
  const address = spotlightV2AddressLine(item);
  const hours = spotlightV2HoursLine(item);
  const positionClass = spotlightPositionClass(page, index, item);
  const partnerClass = options.partner ? ' spotlight-partner-v2-page' : '';
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-v2-page', `${positionClass} ${partnerClass}`.trim()))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText || item.name || 'spotlight')}.png">
      <div class="spotlight-v2-bg">
        ${renderPreviewImage(backgroundImage, item.name || page.title)}
      </div>
      <div class="spotlight-v2-shade"></div>
      <div class="spotlight-v2-copy">
        <h2 class="spotlight-v2-name">
          <span class="spotlight-pin">${renderPhotomodePin()}</span>
          <span class="spotlight-v2-name-text">${escapeHtml(titleText)}</span>
        </h2>
        ${address ? `<p class="spotlight-v2-address">${escapeHtml(address)}</p>` : ''}
        ${hours ? `<p class="spotlight-v2-hours">${escapeHtml(hours)}</p>` : ''}
      </div>
    </article>
  `;
}

function renderSpotlightPartnerV2Page(page, index, listId, list) {
  return renderSpotlightV2Page(page, index, listId, list, { partner: true });
}

function renderPovMaikemCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'pov-maikem-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="pov-maikem-cover-bg">
        ${renderPreviewImage(backgroundImage, coverTitle)}
      </div>
      <div class="pov-maikem-cover-shade"></div>
      <div class="pov-maikem-cover-copy">
        <h3 class="pov-maikem-cover-title">${escapeHtml(coverTitle)}</h3>
        ${coverSubtitle ? `<p class="pov-maikem-cover-subtitle">${escapeHtml(coverSubtitle)}</p>` : ''}
      </div>
    </article>
  `;
}

function pov3V2HeadlineLines(title) {
  const raw = String(title || 'đứng đâu\ncũng đẹp').replace(/\\n/g, '\n');
  const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return ['đứng đâu', 'cũng đẹp'];
  if (lines.length === 1) {
    const parts = lines[0].split(/\s+/);
    if (parts.length >= 4) return [parts.slice(0, 2).join(' '), parts.slice(2).join(' ')];
    return [lines[0], 'cũng đẹp'];
  }
  return lines.slice(0, 2);
}

function pov3V2BracketSubtitle(subtitle) {
  const clean = String(subtitle || '[ Những địa điểm checkin mang đậm vibe Đà Lạt ]').replace(/\s+/g, ' ').trim();
  if (!clean) return '[ Những địa điểm checkin mang đậm vibe Đà Lạt ]';
  const inner = clean.replace(/^[\[\(\s]+|[\]\)\s]+$/g, '');
  return `[ ${inner} ]`;
}

function renderPov3V2Cover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
  const [lineOne, lineTwo] = pov3V2HeadlineLines(coverTitle);
  const bracketText = pov3V2BracketSubtitle(coverSubtitle);
  const highlightMatch = bracketText.match(/^(.*?)(\bĐà Lạt\b|\bDa Lat\b)(.*)$/i);
  const subtitleHtml = highlightMatch
    ? `${escapeHtml(highlightMatch[1])}<span class="pov-3-v2-accent">${escapeHtml(highlightMatch[2])}</span>${escapeHtml(highlightMatch[3])}`
    : escapeHtml(bracketText);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'pov-3-v2-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="pov-3-v2-cover-bg">
        ${renderPreviewImage(backgroundImage, coverTitle || 'POV 3 cover')}
      </div>
      <div class="pov-3-v2-cover-shade"></div>
      <div class="pov-3-v2-cover-copy">
        <h1 class="pov-3-v2-headline">
          <span>${escapeHtml(lineOne)}</span>
          <span>${escapeHtml(lineTwo || '')}</span>
        </h1>
        <p class="pov-3-v2-bracket">${subtitleHtml}</p>
      </div>
    </article>
  `;
}

function isImageMappingNote(value) {
  return /^(?:Ảnh (?:đã map|tự map|minh họa|đối tác)|Thông tin đối tác)/i.test(String(value || '').trim());
}

function pov3V2StackTagline(item) {
  const label = String(item.label || '').trim();
  const note = String(item.imageNote || '').trim();
  if (label && !isImageMappingNote(label)) return label;
  if (note && !isImageMappingNote(note)) return note;
  return '';
}

function renderPov3V2StackRow(item) {
  const address = String(item.metaPrimary || '').trim();
  const taglineTextRaw = pov3V2StackTagline(item);
  const taglineText = taglineTextRaw
    ? (taglineTextRaw.startsWith('[') ? taglineTextRaw : `[ ${taglineTextRaw.replace(/^[\[(\s]+|[\]\)\s]+$/g, '')} ]`)
    : '';
  return `
    <section class="pov-3-v2-stack-row ${escapeHtml(imageSourceClass(item))}">
      ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
      <div class="pov-3-v2-stack-shade"></div>
      <div class="pov-3-v2-stack-copy">
        <h3 class="pov-3-v2-stack-name">${escapeHtml(item.name)}</h3>
        ${address ? `<p class="pov-3-v2-stack-meta">${escapeHtml(address)}</p>` : ''}
        ${taglineText ? `<p class="pov-3-v2-stack-tagline">${escapeHtml(taglineText)}</p>` : ''}
      </div>
    </section>
  `;
}

function renderPov3V2StackPage(page, index, listId) {
  const items = (page.items || []).slice(0, 3);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'pov-3-v2-stack-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText || 'stack')}.png">
      <div class="pov-3-v2-stack-feed">
        ${items.map((item) => renderPov3V2StackRow(item)).join('')}
      </div>
    </article>
  `;
}

function renderPov3V2GridLabel(item) {
  const address = cleanGridAddress(item.metaPrimary);
  const showAddress = address && address.toLowerCase() !== 'đang cập nhật';
  return `
    <div class="pov-3-v2-grid-name">${escapeHtml(item.name)}</div>
    ${showAddress ? `<div class="pov-3-v2-grid-address">${escapeHtml(address)}</div>` : ''}
  `;
}

function renderPov3V2GridPage(page, index, listId, pageSubtitle) {
  const items = (page.items || []).slice(0, 9);
  const panelTitle = page.title || pageSubtitle || page.chipText || '';
  const backgroundImage = page.backgroundImage || items[0]?.imageUrl || '';
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'pov-3-v2-grid-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText || 'grid')}.png">
      <div class="pov-3-v2-grid-bg">
        ${renderPreviewImage(backgroundImage, panelTitle)}
      </div>
      <div class="pov-3-v2-grid-panel">
        <h2 class="pov-3-v2-grid-title">"${escapeHtml(panelTitle)}"</h2>
        <div class="pov-3-v2-grid-matrix">
          ${items.map((item) => `
            <div class="pov-3-v2-grid-cell ${escapeHtml(imageSourceClass(item))}">
              <div class="pov-3-v2-grid-thumb">
                ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
              </div>
              <div class="pov-3-v2-grid-label">
                ${renderPov3V2GridLabel(item)}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </article>
  `;
}

function renderPovMaikemPage(page, index, listId) {
  const items = (page.items || []).slice(0, 3);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'pov-maikem-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
      <div class="pov-maikem-feed">
        ${items.map((item) => {
          const price = cafeLightPrice(item);
          const meta = [item.metaPrimary, price].filter(Boolean).join(' · ');
          return `
          <section class="pov-maikem-slide ${escapeHtml(imageSourceClass(item))}">
            ${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}
            <div class="pov-maikem-slide-shade"></div>
            <div class="pov-maikem-slide-copy">
              <strong class="pov-maikem-slide-title">${escapeHtml(item.name)}</strong>
              ${meta ? `<p class="pov-maikem-slide-meta">${escapeHtml(meta)}</p>` : ''}
            </div>
          </section>
        `;
        }).join('')}
      </div>
    </article>
  `;
}

function renderBudgetWalletCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
  const titleParts = String(coverTitle || '').split('·').map((part) => part.trim()).filter(Boolean);
  const subtitleParts = String(coverSubtitle || '').split('·').map((part) => part.trim()).filter(Boolean);
  const mainTitle = titleParts[0] || coverTitle || '4N3Đ ĐÀ LẠT';
  const hookLine = titleParts[1] || subtitleParts[0] || 'MỞ VÍ ~4.2TR';
  const subLine = subtitleParts.length > 1
    ? subtitleParts.slice(1).join(' · ')
    : (titleParts.length > 1 ? '' : subtitleParts.slice(1).join(' · '));
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'budget-wallet-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
      <div class="budget-wallet-cover-bg">
        ${renderPreviewImage(backgroundImage, coverTitle)}
      </div>
      <div class="budget-wallet-cover-shade"></div>
      <div class="budget-wallet-cover-copy">
        <div class="budget-wallet-script">dalat.</div>
        <h1 class="budget-wallet-title">${escapeHtml(mainTitle)}</h1>
        <h2 class="budget-wallet-hook">${escapeHtml(hookLine)}</h2>
        ${subLine ? `<p class="budget-wallet-sub">${escapeHtml(subLine)}</p>` : ''}
      </div>
    </article>
  `;
}

function renderBudgetWalletDayPage(page, index, listId, list) {
  const items = (page.items || []).slice(0, 7);
  const thumbs = items.filter((item) => item.imageUrl).slice(0, 3);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'budget-wallet-day'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText || 'ngay')}.png">
      <section class="budget-wallet-slip">
        <header class="budget-wallet-slip-head">
          <div>
            <span>${escapeHtml(String(page.chipText || '').toUpperCase())}</span>
            <h2>${escapeHtml(page.title || '')}</h2>
          </div>
          <span class="budget-wallet-slip-total">${escapeHtml(page.subtitle || '')}</span>
        </header>
        <div class="budget-wallet-lines">
          ${items.map((item) => {
            const { time } = budgetStoryParts(item);
            return `
              <article class="budget-wallet-line">
                <span>${escapeHtml(time)}</span>
                <strong>${escapeHtml(budgetStoryDisplayTitle(item.name))}</strong>
                <em>${escapeHtml(item.metaSecondary || '')}</em>
              </article>
            `;
          }).join('')}
        </div>
        ${thumbs.length > 0 ? `
          <div class="budget-wallet-thumbs">
            ${thumbs.map((item) => `
              <div class="budget-wallet-thumb">${renderPreviewImage(item.imageUrl, item.name, '', item.candidateImageUrls)}</div>
            `).join('')}
          </div>
        ` : ''}
      </section>
    </article>
  `;
}

function renderBudgetWalletFixedPage(page, index, listId) {
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'budget-wallet-fixed'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-phi-co-dinh.png">
      <section class="budget-wallet-fixed-panel">
        <span>${escapeHtml(page.chipText || '')}</span>
        <h2>${escapeHtml(page.title || '')}</h2>
        <p>${escapeHtml(page.subtitle || '')}</p>
        <div class="budget-wallet-lines">
          ${(page.items || []).map((item) => `
            <article class="budget-wallet-line">
              <span>${escapeHtml(item.label || '')}</span>
              <strong>${escapeHtml(item.name || '')}</strong>
              <em>${escapeHtml(item.metaSecondary || '')}</em>
            </article>
          `).join('')}
        </div>
      </section>
    </article>
  `;
}

function renderBudgetWalletBillPage(page, index, listId) {
  const items = page.items || [];
  const total = items.find((item) => /tong|total/i.test(String(item.id || ''))) || items[items.length - 1] || {};
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'budget-wallet-bill'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-bill.png">
      <section class="budget-wallet-bill-panel">
        <span>${escapeHtml(String(page.chipText || 'BILL').toUpperCase())}</span>
        <h2>${escapeHtml(page.title || 'BILL 4N3Đ')}</h2>
        <div class="budget-wallet-lines">
          ${items.filter((item) => !/tong|total/i.test(String(item.id || ''))).map((item) => `
            <article class="budget-wallet-line">
              <span></span>
              <strong>${escapeHtml(item.name || '')}</strong>
              <em>${escapeHtml(item.metaSecondary || '')}</em>
            </article>
          `).join('')}
        </div>
        <div class="budget-wallet-bill-final">
          <span>Tổng bill</span>
          <strong>${escapeHtml(total.metaSecondary || '~4.2tr')}</strong>
        </div>
      </section>
    </article>
  `;
}

function renderCoverPageV2(page, index, listId, coverTitle, coverSubtitle, backgroundImage, coverImageUrls = []) {
  if (page.layoutVariant === 'grid-8-feed') {
    return renderGrid8FeedCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage);
  }
  if (page.layoutVariant === 'grid-8-quaytung-cover') {
    return renderGrid8QuaytungCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage);
  }
  if (page.layoutVariant === 'grid-5') {
    return renderGrid5Cover(page, index, listId, coverTitle, coverSubtitle, backgroundImage);
  }
  if (page.layoutVariant === 'spotlight-v2') {
    return renderSpotlightV2Cover(page, index, listId, coverTitle, coverSubtitle, backgroundImage, { coverImageUrls });
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
  if (page.layoutVariant === 'grid-8-feed') {
    const centerHook = grid8FeedCenterHook(page, list);
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'grid8-feed-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText)}.png">
        <div class="grid8-feed-matrix">
          ${renderGrid8FeedItems(page.items, centerHook)}
        </div>
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
  if (page.layoutVariant === 'spotlight-v2') {
    return renderSpotlightV2Page(page, index, listId, list);
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

export function renderCoverPage(page, index, total, listId, hashtags = [], list = null, coverImageUrls = []) {
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

  if (isBudget3N2DStoryCover(page)) {
    const title = cleanStoryText(coverTitle, BUDGET72_STORY_TEXT.coverTitle);
    const subtitle = cleanStoryText(coverSubtitle, BUDGET72_STORY_TEXT.coverSubtitle);
    return `
      <article class="${escapeHtml(storyPageClass(listId, 'budget72-story-cover'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-cover.png">
        <div class="budget72-story-bg">
          ${renderPreviewImage(backgroundImage, title)}
        </div>
        <div class="budget72-story-cover-shade"></div>
        <div class="budget72-story-cover-copy">
          <div class="budget72-story-script">dalat.</div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(subtitle)}</p>
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

function spotlightV2AddressLine(item) {
  return String(item?.metaPrimary || '').replace(/\s+/g, ' ').trim();
}

function spotlightV2HoursLine(item) {
  const secondary = String(item?.metaSecondary || '').replace(/\s+/g, ' ').trim();
  if (!secondary) return '';

  const labeledHours = secondary.match(/^(Khung giờ|Open|Hoạt động):\s*(.+)$/i);
  if (labeledHours) {
    const label = labeledHours[1].toLowerCase() === 'khung giờ' ? 'Open' : labeledHours[1];
    const hours = labeledHours[2].split('·')[0].trim();
    return hours ? `${label}: ${hours}` : '';
  }

  const embeddedHours = secondary.match(/(?:Khung giờ|Open|Hoạt động):\s*([^·]+)/i);
  if (embeddedHours) {
    const token = embeddedHours[0].trim();
    if (/^open:/i.test(token) || /^hoạt động:/i.test(token)) return token;
    const hours = embeddedHours[1].trim();
    return hours ? `Open: ${hours}` : '';
  }

  if (/(giá|sđt|liên hệ):/i.test(secondary)) return '';
  const fallback = secondary.split('·')[0].trim();
  return fallback ? `Open: ${fallback}` : '';
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
  const exportLabel = item.rawName || item.name || page.title || 'partner';
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-page spotlight-partner-page spotlight-partner-photo-only'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(exportLabel)}.png">
      <div class="spotlight-bg">
        ${renderPreviewImage(backgroundImage, item.rawName || page.title)}
      </div>
      <div class="spotlight-shade"></div>
    </article>
  `;
}

function renderSpotlightListItems(items, options = {}) {
  const showLabels = options.showLabels !== false;
  const showSecondary = options.showSecondary !== false;
  return (items || []).map((item) => {
    const isHomestay = item.sourceSectionKey === 'homestay';
    const metaSecondary = showSecondary
      ? (item.metaSecondary || (isHomestay && item.price ? `Giá: ${item.price}` : ''))
      : '';
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

function renderSpotlightV2ListPage(page, index, listId, list, pageSubtitle) {
  const backgroundImage = page.backgroundImage || firstPortablePageImage(page) || coverBackgroundImage(page, list);
  const showItemLabels = !isStayListPage(page);
  const heading = spotlightV2ListHeading(page);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-v2-list-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText || page.title || 'list')}.png">
      <div class="spotlight-v2-bg">
        ${renderPreviewImage(backgroundImage, heading)}
      </div>
      <div class="spotlight-v2-list-shade"></div>
      <div class="spotlight-v2-list-panel">
        <div class="spotlight-v2-list-heading">
          <h2>${escapeHtml(heading)}</h2>
        </div>
        <div class="spotlight-v2-list-stack">
          ${renderSpotlightListItems(page.items, { showLabels: showItemLabels, showSecondary: false })}
        </div>
      </div>
    </article>
  `;
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
        <div class="spotlight-partner-info-stack">
          ${itemRows}
        </div>
        <div class="spotlight-partner-info-cta">Lưu lại khi cần cho chuyến Đà Lạt tới.</div>
      </div>
    </article>
  `;
}

function renderSpotlightPartnerV2InfoPage(page, index, listId, list) {
  const backgroundImage = page.backgroundImage || firstPortablePageImage(page) || coverBackgroundImage(page, list);
  const itemRows = (page.items || []).map((item) => `
    <article class="spotlight-partner-v2-info-row">
      <span>${escapeHtml(item.label || '')}</span>
      <strong>${escapeHtml(item.metaPrimary || item.name || '')}</strong>
    </article>
  `).join('');

  return `
    <article class="${escapeHtml(storyPageClass(listId, 'spotlight-partner-v2-info-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-thong-tin.png">
      <div class="spotlight-v2-bg">
        ${renderPreviewImage(backgroundImage, page.title)}
      </div>
      <div class="spotlight-v2-shade"></div>
      <div class="spotlight-v2-info-band">
        ${page.title ? `<h2 class="spotlight-v2-info-title">${escapeHtml(page.title)}</h2>` : ''}
        <div class="spotlight-partner-v2-info-stack">
          ${itemRows}
        </div>
        <p class="spotlight-v2-cta">Lưu để đặt / inbox khi cần</p>
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
          <colgroup>
            <col class="budget72-col-day" />
            <col class="budget72-col-time" />
            <col class="budget72-col-activity" />
            <col class="budget72-col-address" />
            <col class="budget72-col-cost" />
          </colgroup>
          <thead>
            <tr>
              <th class="budget72-day">Ngày</th>
              <th class="budget72-time">Thời gian</th>
              <th class="budget72-activity">Hoạt động</th>
              <th class="budget72-address">Địa chỉ</th>
              <th class="budget72-cost">Chi phí</th>
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

function budgetStoryParts(item) {
  const parts = String(item?.label || '').split('|');
  return {
    day: parts[0] || '',
    time: parts[1] || '',
  };
}

function budgetStoryActivityTitle(value) {
  return String(value || '')
    .replace(/^\s*(Ăn sáng|Ăn trưa|Ăn tối|Cà phê chiều|Cà phê|Check-in|Chơi đêm|Mua quà|Hoạt động)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function budgetStoryActivityType(value) {
  const clean = String(value || '').trim();
  const match = clean.match(/^\s*([^:]{2,24})\s*:/);
  return match?.[1]?.trim() || 'Điểm ghé';
}

function budgetStoryDisplayTitle(value) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (/di chuy[eể]n b[aằ]ng xe/i.test(clean) || /ph[uươ]ng trang/i.test(clean)) {
    return 'Xe SG - \u0110\u00e0 L\u1ea1t';
  }
  if (/check\s*out|l[eê]n xe|v[eề]\s+l[aạ]i\s+sg/i.test(clean)) {
    return 'V\u1ec1 l\u1ea1i SG';
  }
  return budgetStoryActivityTitle(clean)
    .replace(/^\s*(\u0102n s\u00e1ng|\u0102n tr\u01b0a|\u0102n t\u1ed1i|C\u00e0 ph\u00ea chi\u1ec1u|C\u00e0 ph\u00ea|Check-in|Ch\u01a1i \u0111\u00eam|Mua qu\u00e0|Ho\u1ea1t \u0111\u1ed9ng|D\u1ecbch v\u1ee5|L\u01b0u tr\u00fa|Cafe|\u0102n nh\u1eb9)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function budgetStoryDisplayType(value) {
  const clean = String(value || '').trim();
  if (/di chuy[eể]n b[aằ]ng xe/i.test(clean) || /ph[uươ]ng trang/i.test(clean) || /check\s*out|l[eê]n xe|v[eề]\s+l[aạ]i\s+sg/i.test(clean)) {
    return 'Di chuy\u1ec3n';
  }
  const type = budgetStoryActivityType(clean);
  return hasMojibakeText(type) ? '\u0110i\u1ec3m gh\u00e9' : type;
}

function renderBudget3N2DDayPage(page, index, listId, list) {
  const items = Array.isArray(page.items) ? page.items.slice(0, 8) : [];
  const hero = items.find((item) => item.imageUrl) || items[0] || {};
  const backgroundImage = hero.imageUrl || page.backgroundImage || coverBackgroundImage(page, list);
  const copy = cleanBudgetStoryDayCopy(page, index);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'budget72-story-day'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(copy.chip || copy.title || 'ngay')}.png">
      <div class="budget72-story-bg">
        ${renderPreviewImage(backgroundImage, copy.title)}
      </div>
      <div class="budget72-story-day-shade"></div>
      <section class="budget72-story-panel">
        <header class="budget72-story-head">
          <span>${escapeHtml(copy.chip)}</span>
          <h2>${escapeHtml(copy.title)}</h2>
          <p>${escapeHtml(copy.subtitle)}</p>
        </header>
        <div class="budget72-story-timeline">
          ${items.map((item) => {
            const { time } = budgetStoryParts(item);
            const secondary = String(item.metaSecondary || '').trim();
            return `
              <article class="budget72-story-stop">
                <div class="budget72-story-time">${escapeHtml(time)}</div>
                <div class="budget72-story-dot"></div>
                <div class="budget72-story-copy">
                  <span>${escapeHtml(budgetStoryDisplayType(item.name))}</span>
                  <strong>${escapeHtml(budgetStoryDisplayTitle(item.name))}</strong>
                  <p>${escapeHtml(item.metaPrimary || '')}</p>
                  ${secondary ? `<em>${escapeHtml(secondary)}</em>` : ''}
                </div>
              </article>
            `;
          }).join('')}
        </div>
      </section>
    </article>
  `;
}

function renderBudget3N2DTotalPage(page, index, listId, list) {
  const items = Array.isArray(page.items) ? page.items : [];
  const total = items.find((item) => /tong|total/i.test(String(item.id || ''))) || items[items.length - 1] || {};
  const backgroundImage = page.backgroundImage || firstPortablePageImage(page) || coverBackgroundImage(page, list);
  const copy = cleanBudgetStoryTotalCopy(page);
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'budget72-story-total'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-tong-chi-phi.png">
      <div class="budget72-story-bg">
        ${renderPreviewImage(backgroundImage, copy.title)}
      </div>
      <div class="budget72-story-total-shade"></div>
      <section class="budget72-total-card">
        <span>${escapeHtml(BUDGET72_STORY_TEXT.total.label)}</span>
        <h2>${escapeHtml(copy.title)}</h2>
        <p>${escapeHtml(copy.subtitle)}</p>
        <div class="budget72-total-list">
          ${items.filter((item) => !/tong|total/i.test(String(item.id || ''))).map((item) => `
            <article>
              <strong>${escapeHtml(item.name || '')}</strong>
              <span>${escapeHtml(item.metaSecondary || '')}</span>
              <p>${escapeHtml(item.metaPrimary || '')}</p>
            </article>
          `).join('')}
        </div>
        <div class="budget72-total-final">
          <span>${escapeHtml(BUDGET72_STORY_TEXT.total.finalLabel)}</span>
          <strong>${escapeHtml(total.metaSecondary || '~2.5tr - 3tr')}</strong>
        </div>
      </section>
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

  if (page.layoutVariant === 'grid-6-zigzag') {
    if (page.type === 'cover') {
      return renderZigzagCover(page, index, listId);
    }
    return renderZigzagContentPage(page, index, listId);
  }

  if (page.layoutVariant === 'grid-4-mutant') {
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
