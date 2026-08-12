// lib/utils.js
var DATASET_CACHE_KEY = "dalat-carousel-dataset-cache-v82";
var STUDIO_CATALOG_REVISION_KEY = `${DATASET_CACHE_KEY}:catalog-revision`;
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function sanitizeFilePart(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

// lib/pageMarkup.js
function imageSourceClass(item) {
  return item?.imageSource || (item?.imageMapped ? "manual" : "fallback");
}
function previewImageAttrs() {
  return 'loading="lazy" decoding="async" fetchpriority="low" draggable="false"';
}
var TITLE_FONT_VARIANT_COUNT = 8;
var GENERIC_CAPTION_BODY = "L\u01B0u list n\xE0y \u0111\u1EC3 c\xF3 l\u1ECBch \u0111i \u0110\xE0 L\u1EA1t g\u1ECDn h\u01A1n, d\u1EC5 ch\u1ECDn \u0111i\u1EC3m theo bu\u1ED5i v\xE0 \u0111\u1EE1 m\u1EA5t th\u1EDDi gian m\xF2 t\u1EEBng n\u01A1i.";
function titleFontVariantFromId(raw) {
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = hash * 31 + raw.charCodeAt(index) >>> 0;
  }
  return hash % TITLE_FONT_VARIANT_COUNT + 1;
}
function titleFontClass(listId) {
  const raw = String(listId || "");
  const captionNumber = raw.match(/^(.*?)-caption-(\d+)/i);
  if (captionNumber) {
    return `title-font-${titleFontVariantFromId(`${captionNumber[1]}-main`)}`;
  }
  return `title-font-${titleFontVariantFromId(raw)}`;
}
function storyPageClass(listId, ...classNames) {
  return ["story-page", titleFontClass(listId), ...classNames.filter(Boolean)].join(" ");
}
function previewImageCandidateAttr(src, candidates = []) {
  const urls = [src, ...Array.isArray(candidates) ? candidates : []].map((url) => String(url || "").trim()).filter((url) => isPortableImageUrl(url));
  const uniqueUrls = [...new Set(urls)];
  if (uniqueUrls.length <= 1) return "";
  return ` data-candidate-srcs="${escapeHtml(JSON.stringify(uniqueUrls))}"`;
}
function renderPreviewImage(src, alt, className = "", candidates = []) {
  if (!src) return "";
  const classAttr = className ? ` class="${escapeHtml(className)}"` : "";
  const candidateAttr = previewImageCandidateAttr(src, candidates);
  return `<img${classAttr} src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${candidateAttr} ${previewImageAttrs()}>`;
}
function isPortableImageUrl(src) {
  const value = String(src || "").trim();
  return /^https?:\/\//i.test(value) || value.startsWith("/assets/drive-file");
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
  return fallback || page.backgroundImage || "";
}
function firstPortablePageImage(page) {
  for (const item of page?.items || []) {
    if (isPortableImageUrl(item.imageUrl)) return item.imageUrl;
    for (const candidate of item.candidateImageUrls || []) {
      if (isPortableImageUrl(candidate)) return candidate;
    }
  }
  return "";
}
function portablePageImageCandidates(page, primary = "") {
  const urls = [];
  for (const item of page?.items || []) {
    if (isPortableImageUrl(item.imageUrl)) urls.push(item.imageUrl);
    for (const candidate of item.candidateImageUrls || []) {
      if (isPortableImageUrl(candidate)) urls.push(candidate);
    }
  }
  return [...new Set(urls)].filter((url) => url !== primary);
}
function grid4FeatureBackgroundImage(page, list) {
  if (isPortableImageUrl(page.backgroundImage)) return page.backgroundImage;
  return firstPortablePageImage(page) || coverBackgroundImage(page, list);
}
function pageCounter(index, total) {
  return `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
}
function isGridLayout(page) {
  return page.layoutVariant === "grid-6" || page.layoutVariant === "grid-8" || page.layoutVariant === "grid-4";
}
function isGrid4FeaturePage(page) {
  return page?.layoutVariant === "grid-4" && page?.type === "cover";
}
function isJourneyGrid8Layout(page) {
  return page.layoutVariant === "journey-4n2d-grid8";
}
function isSpotlightLayout(page) {
  return page.layoutVariant === "spotlight";
}
function isSpotlightPartnerCover(page) {
  return page.layoutVariant === "spotlight-partner" && page.type === "cover";
}
function isBudget3N2DCover(page) {
  return page.layoutVariant === "budget-3n2d" && page.type === "cover";
}
function isBudget3N2DStoryCover(page) {
  return page.layoutVariant === "budget-3n2d-story" && page.type === "cover";
}
var MOJIBAKE_TEXT_RE = /(?:Ã|Â|Ä|Å|Æ|áÂ|â€|ï¿½)/;
var BUDGET72_STORY_TEXT = {
  coverTitle: '"72H" \u1EDE \u0110\xC0 L\u1EA0T V\u1EDAI 3TR',
  coverSubtitle: "L\u1ECBch tr\xECnh 3 ng\xE0y 2 \u0111\xEAm g\u1ECDn h\u01A1n: xem theo t\u1EEBng ng\xE0y, c\xF3 chi ph\xED v\xE0 c\xE1c \u0111i\u1EC3m n\xEAn l\u01B0u.",
  day1: {
    chip: "Ng\xE0y 01",
    title: "Ng\xE0y \u0111\u1EA7u v\xE0o ph\u1ED1",
    subtitle: "\u0102n s\xE1ng, cafe, check-in v\xE0 m\u1ED9t bu\u1ED5i t\u1ED1i v\u1EEBa \u0111\u1EE7 nh\u1ECBp \u0111\u1EC3 l\xE0m quen \u0110\xE0 L\u1EA1t."
  },
  day2: {
    chip: "Ng\xE0y 02",
    title: "M\u1ED9t ng\xE0y \u0111i tr\u1ECDn h\u01A1n",
    subtitle: "D\xE0nh ng\xE0y gi\u1EEFa chuy\u1EBFn cho c\xE1c \u0111i\u1EC3m ch\xEDnh, qu\xE1n \u0111\u1EB9p v\xE0 ho\u1EA1t \u0111\u1ED9ng \u0111\xE1ng gh\xE9."
  },
  day3: {
    chip: "Ng\xE0y 03",
    title: "Ng\xE0y cu\u1ED1i nh\u1EB9 nh\xE0ng",
    subtitle: "Gi\u1EEF l\u1ECBch g\u1ECDn \u0111\u1EC3 k\u1ECBp \u0103n, mua qu\xE0, check-out v\xE0 quay v\u1EC1 kh\xF4ng b\u1ECB g\u1EA5p."
  },
  total: {
    chip: "Chi ph\xED",
    title: "T\u1ED5ng chi ph\xED d\u1EF1 ki\u1EBFn",
    subtitle: "C\xE1c kho\u1EA3n ch\xEDnh \u0111\u01B0\u1EE3c gom l\u1EA1i \u0111\u1EC3 d\u1EC5 c\xE2n ng\xE2n s\xE1ch tr\u01B0\u1EDBc khi \u0111i.",
    label: "72H \u0110\xE0 L\u1EA1t",
    finalLabel: "T\u1ED5ng thanh to\xE1n d\u1EF1 ki\u1EBFn"
  }
};
function hasMojibakeText(value) {
  return MOJIBAKE_TEXT_RE.test(String(value || ""));
}
function cleanStoryText(value, fallback = "") {
  const text = String(value || "").trim();
  if (!text || hasMojibakeText(text)) return fallback;
  return text;
}
function budgetStoryDayNumber(page, index) {
  const raw = `${page?.chipText || ""} ${page?.title || ""} ${index + 1}`.toLowerCase();
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
    subtitle: cleanStoryText(page?.subtitle, defaults.subtitle)
  };
}
function cleanBudgetStoryTotalCopy(page) {
  return {
    chip: cleanStoryText(page?.chipText, BUDGET72_STORY_TEXT.total.chip),
    title: cleanStoryText(page?.title, BUDGET72_STORY_TEXT.total.title),
    subtitle: cleanStoryText(page?.subtitle, BUDGET72_STORY_TEXT.total.subtitle)
  };
}
function spotlightPositionClass(page, index, item) {
  const variants = [
    "spotlight-pos-lower-left",
    "spotlight-pos-upper-right",
    "spotlight-pos-center-left",
    "spotlight-pos-lower-right",
    "spotlight-pos-upper-left",
    "spotlight-pos-center-right"
  ];
  const raw = `${page?.title || ""}|${item?.rawName || item?.name || ""}|${item?.metaPrimary || ""}|${index}`;
  let hash = 0;
  for (let charIndex = 0; charIndex < raw.length; charIndex += 1) {
    hash = hash * 33 + raw.charCodeAt(charIndex) >>> 0;
  }
  return variants[hash % variants.length];
}
function isServiceListPage(page) {
  const key = `${page?.chipText || ""} ${page?.title || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();
  return key.includes("dich vu");
}
function isStayListPage(page) {
  const key = `${page?.chipText || ""} ${page?.title || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();
  return key.includes("homestay") || key.includes("luu tru");
}
function isServiceOrStayListPage(page) {
  return isServiceListPage(page) || isStayListPage(page);
}
function isActivityListPage(page) {
  const chip = String(page?.chipText || "").trim().toLowerCase();
  if (chip === "ho\u1EA1t \u0111\u1ED9ng") return true;
  return gridPageKind(page) === "activity";
}
function shouldShowItemAddress(item, showAddress = true) {
  if (!showAddress) return false;
  if (String(item?.sourceSectionKey || "").trim() === "hoat_dong") return false;
  return true;
}
function spotlightV2ListHeading(page) {
  if (isStayListPage(page)) return "Homestay c\u1EA7n l\u01B0u";
  if (isServiceListPage(page)) return "D\u1ECBch v\u1EE5 c\u1EA7n l\u01B0u";
  return String(page?.title || page?.chipText || "").trim();
}
function isGeneratedCaptionList(list) {
  return /caption-/i.test(String(list?.id || ""));
}
function gridContextKey(value) {
  return normalizeGridText(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function sameGridText(left, right) {
  return gridContextKey(left) === gridContextKey(right);
}
function polishShortVietnameseCopy(value) {
  let text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  text = text.replace(/\bĐà\s*Lạt\s+VN\b/giu, "\u0110\xE0 L\u1EA1t").replace(/\s+\/\s*VN\b/giu, "").replace(/\s+\bVN\b(?=\s|$|[./])/giu, "").replace(/\bĐà\s*Lạt\s*ẩn\s*mình\s*sau\s*vách\s*núi\b/giu, "\u0110\u1EA7y \u0111\u1EE7 kinh nghi\u1EC7m cho chuy\u1EBFn \u0111i \u0110\xE0 L\u1EA1t").replace(/\bĐà\s*Lạt\s*đủ\s*để\s*đi\s*ngay\b/giu, "\u0110\u1EA7y \u0111\u1EE7 kinh nghi\u1EC7m cho chuy\u1EBFn \u0111i \u0110\xE0 L\u1EA1t").replace(/\bmở\s+to\s+mắt\b/giu, "m\u1EDF mang t\u1EA7m m\u1EAFt").replace(/\bnhấn\s+lưu\s+liền\s+kẻo\b[^.!?]*[.!?]?$/giu, "Nh\u1EA5n l\u01B0u li\u1EC1n tay \u0111\u1EC3 kh\u1ECFi qu\xEAn list n\xE0y nh\xE9.").replace(/\blưu\s+liền\s+kẻo\b[^.!?]*[.!?]?$/giu, "l\u01B0u li\u1EC1n tay \u0111\u1EC3 kh\u1ECFi qu\xEAn list n\xE0y nh\xE9.").replace(/\blưu\s+lại\s*[.!?]*$/giu, "l\u01B0u l\u1EA1i ngay nh\xE9.").replace(/\blưu\s+liền\s*[.!?]*$/giu, "l\u01B0u li\u1EC1n tay nh\xE9.").replace(/\bmấy\s+chỗ\s+ăn\s+uống\b/giu, "m\u1EA5y ch\u1ED7 \u0103n ngon").replace(/\bchọn\s+điểm\s+đi,\s*ăn\s+uống\s+và\s+chụp\s+hình\b/giu, "ch\u1ECDn \u0111i\u1EC3m \u0111i, qu\xE1n \u0103n v\xE0 g\xF3c ch\u1EE5p").replace(/\btừ\s+ăn\s+uống,\s*check-?in\b/giu, "t\u1EEB qu\xE1n \u0103n, check-in").replace(/\bnhóm\s+ăn\s+uống\b/giu, "nh\xF3m qu\xE1n \u0103n").replace(/[,\-–:;]\s*ăn\s+uống\s*$/giu, ", c\xF3 \u0111i\u1EC3m \u0103n h\u1EE3p l\u1ECBch.").replace(/(^|[^\p{L}\p{N}])ăn\s+uống\s*[.!?]*$/giu, "$1\u0111i\u1EC3m \u0103n h\u1EE3p l\u1ECBch.");
  return text.replace(/\s+([,.!?;:])/g, "$1").replace(/\s+/g, " ").trim();
}
function gridPageKind(page) {
  const key = gridContextKey(`${page?.chipText || ""} ${page?.title || ""}`);
  if (key.includes("quan_an") || key.includes("mon_ngon")) return "food";
  if (key.includes("cafe") || key.includes("ca_phe")) return "cafe";
  if (key.includes("check_in")) return "checkin";
  if (key.includes("choi_dem")) return "nightlife";
  if (key.includes("dich_vu") || key.includes("luu_y")) return "service";
  if (key.includes("homestay") || key.includes("luu_tru")) return "stay";
  if (key.includes("hoat_dong")) return "activity";
  if (key.includes("khu_du_lich")) return "tourism";
  return "generic";
}
function listVariantIndex(list, variantCount, salt = "") {
  if (variantCount <= 1) return 0;
  const rawId = String(list?.id || "");
  const captionMatch = rawId.match(/caption-(\d+)/i);
  if (captionMatch) return Math.max(0, Number(captionMatch[1]) - 1) % variantCount;
  const raw = `${rawId}|${list?.title || ""}|${salt}`;
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = hash * 31 + raw.charCodeAt(index) >>> 0;
  }
  return hash % variantCount;
}
function pickListVariant(list, variants, salt) {
  return variants[listVariantIndex(list, variants.length, salt)] || variants[0] || "";
}
var GRID8_INTRO_VARIANTS = {
  food: [
    "Nh\xF3m qu\xE1n \u0103n \u0111\u01B0\u1EE3c gom ri\xEAng \u0111\u1EC3 ng\u01B0\u1EDDi xem ch\u1ECDn b\u1EEFa nhanh, d\u1EC5 scan tr\u01B0\u1EDBc khi \u0111i.",
    "M\u1ED9t trang ch\u1EC9 d\xE0nh cho \u0111\u1ED3 \u0103n, \u01B0u ti\xEAn ch\u1ED7 d\u1EC5 g\u1ECDi m\xF3n v\xE0 ti\u1EC7n gh\xE9 theo l\u1ECBch.",
    "Ghim s\u1EB5n c\xE1c qu\xE1n \u0103n \u0111\u1EC3 l\xFAc \u0111\xF3i ch\u1EC9 c\u1EA7n m\u1EDF list, ch\u1ECDn nhanh, kh\u1ECFi l\u01B0\u1EDBt l\u1EA1i.",
    "C\xE1c qu\xE1n \u0111\u01B0\u1EE3c l\u1ECDc ri\xEAng \u0111\u1EC3 d\u1EC5 \u0111\u1ED5i b\u1EEFa m\xE0 kh\xF4ng l\xE0m r\u1ED1i l\u1ECBch di chuy\u1EC3n.",
    "Trang n\xE0y gom c\xE1c qu\xE1n \u0111\xE1ng th\u1EED, h\u1EE3p \u0111\u1EC3 ch\u1ED1t b\u1EEFa ch\xEDnh ho\u1EB7c b\u1EEFa ph\u1EE5 trong ng\xE0y.",
    "M\u1ED9t c\u1EE5m \u0111\u1ECBa ch\u1EC9 \u0103n ngon, g\u1ECDn m\u1EAFt, d\xE0nh cho l\xFAc c\u1EA7n quy\u1EBFt nhanh trong chuy\u1EBFn \u0111i."
  ],
  cafe: [
    "C\xE1c qu\xE1n cafe n\xEAn l\u01B0u ri\xEAng \u0111\u1EC3 ch\u1ECDn \u0111i\u1EC3m ng\u1ED3i chill, ngh\u1EC9 ch\xE2n ho\u1EB7c ch\u1EE5p \u1EA3nh.",
    "Trang cafe n\xE0y \u01B0u ti\xEAn ch\u1ED7 c\xF3 kh\xF4ng kh\xED d\u1EC5 ch\u1ECBu, h\u1EE3p \u0111\u1EC3 d\u1EEBng l\u1EA1i gi\u1EEFa l\u1ECBch \u0111i.",
    "Ghim tr\u01B0\u1EDBc v\xE0i qu\xE1n cafe \u0111\u1EC3 c\xF3 \u0111i\u1EC3m ngh\u1EC9, l\xEAn \u1EA3nh \u0111\u1EB9p v\xE0 kh\xF4ng ph\u1EA3i t\xECm ph\xFAt cu\u1ED1i.",
    "M\u1ED9t c\u1EE5m cafe \u0111\u1EC3 \u0111\u1ED5i nh\u1ECBp chuy\u1EBFn \u0111i: ng\u1ED3i l\xE2u \u0111\u01B0\u1EE3c, ch\u1EE5p \u1ED5n, di chuy\u1EC3n v\u1EEBa ph\u1EA3i.",
    "C\xE1c \u0111i\u1EC3m cafe \u0111\u01B0\u1EE3c gom ri\xEAng cho l\xFAc mu\u1ED1n ch\u1EADm l\u1EA1i m\xE0 v\u1EABn c\xF3 \u1EA3nh \u0111\u1EB9p mang v\u1EC1.",
    "Trang n\xE0y d\xE0nh cho mood cafe: ch\u1ECDn nhanh m\u1ED9t ch\u1ED7 ng\u1ED3i, r\u1ED3i \u0111\u1EC3 \u0110\xE0 L\u1EA1t t\u1EF1 d\u1ECBu l\u1EA1i."
  ],
  checkin: [
    "M\u1ED9t trang scan nhanh c\xE1c \u0111i\u1EC3m check-in, \u01B0u ti\xEAn t\xEAn ng\u1EAFn v\xE0 h\xECnh \u1EA3nh r\xF5.",
    "C\xE1c g\xF3c l\xEAn h\xECnh \u0111\u01B0\u1EE3c t\xE1ch ri\xEAng \u0111\u1EC3 d\u1EC5 ch\u1ECDn \u0111i\u1EC3m ch\u1EE5p theo cung \u0111\u01B0\u1EDDng trong ng\xE0y.",
    "Ghim s\u1EB5n c\xE1c \u0111i\u1EC3m check-in \u0111\u1EC3 l\xFAc tr\u1EDDi \u0111\u1EB9p ch\u1EC9 c\u1EA7n m\u1EDF list v\xE0 \u0111i th\u1EB3ng.",
    "Trang n\xE0y gom c\xE1c \u0111i\u1EC3m nh\xECn ph\xE1t hi\u1EC3u ngay, h\u1EE3p cho l\u1ECBch c\u1EA7n \u1EA3nh \u0111\u1EB9p m\xE0 kh\xF4ng v\xF2ng v\xE8o.",
    "M\u1ED9t c\u1EE5m \u0111i\u1EC3m ch\u1EE5p d\u1EC5 scan, gi\xFAp b\u1EA1n ch\u1ECDn nhanh n\u01A1i \u0111\xE1ng gh\xE9 nh\u1EA5t trong bu\u1ED5i \u0111\xF3.",
    "C\xE1c \u0111\u1ECBa \u0111i\u1EC3m l\xEAn \u1EA3nh \u1ED5n \u0111\u01B0\u1EE3c x\u1EBFp ri\xEAng \u0111\u1EC3 chuy\u1EBFn \u0111i c\xF3 v\xE0i khung h\xECnh ch\u1EAFc tay."
  ],
  nightlife: [
    "C\xE1c \u0111i\u1EC3m \u0111i bu\u1ED5i t\u1ED1i, \u0103n \u0111\xEAm v\xE0 nghe nh\u1EA1c \u0111\u01B0\u1EE3c t\xE1ch ri\xEAng \u0111\u1EC3 d\u1EC5 l\u01B0u sau 20h.",
    "Trang n\xE0y d\xE0nh cho bu\u1ED5i t\u1ED1i: ch\u1ECDn ch\u1ED7 \u0103n, nghe nh\u1EA1c ho\u1EB7c \u0111\u1ED5i kh\xF4ng kh\xED sau l\u1ECBch ng\xE0y.",
    "Ghim ri\xEAng c\xE1c \u0111i\u1EC3m ch\u01A1i \u0111\xEAm \u0111\u1EC3 t\u1ED1i \u0111\u1EBFn kh\xF4ng ph\u1EA3i l\u1EE5c l\u1EA1i c\u1EA3 list d\xE0i.",
    "M\u1ED9t c\u1EE5m l\u1EF1a ch\u1ECDn sau ho\xE0ng h\xF4n, h\u1EE3p \u0111\u1EC3 k\xE9o d\xE0i l\u1ECBch m\xE0 v\u1EABn d\u1EC5 quy\u1EBFt.",
    "C\xE1c \u0111i\u1EC3m bu\u1ED5i t\u1ED1i \u0111\u01B0\u1EE3c gom ri\xEAng \u0111\u1EC3 l\u1ECBch \u0111\xEAm c\xF3 nh\u1ECBp, c\xF3 m\xF3n, c\xF3 ch\u1ED7 ng\u1ED3i.",
    "Trang n\xE0y gi\xFAp ch\u1ED1t nhanh ph\u1EA7n sau 20h: \u0103n nh\u1EB9, \u0111i nghe nh\u1EA1c ho\u1EB7c gh\xE9 m\u1ED9t n\u01A1i c\xF3 vibe."
  ],
  service: [
    "C\xE1c d\u1ECBch v\u1EE5 h\u1ED7 tr\u1EE3 chuy\u1EBFn \u0111i \u0111\u01B0\u1EE3c gom ri\xEAng \u0111\u1EC3 ng\u01B0\u1EDDi xem d\u1EC5 li\xEAn h\u1EC7 nhanh.",
    "Trang d\u1ECBch v\u1EE5 n\xE0y \u0111\u1EC3 l\u01B0u nh\u1EEFng th\u1EE9 c\u1EA7n ch\u1ED1t tr\u01B0\u1EDBc: xe, \u0111\u1ED3, qu\xE0 ho\u1EB7c h\u1ED7 tr\u1EE3 t\u1EA1i ch\u1ED7.",
    "Ghim ri\xEAng nh\xF3m d\u1ECBch v\u1EE5 \u0111\u1EC3 l\xFAc c\u1EA7n li\xEAn h\u1EC7 kh\xF4ng ph\u1EA3i tr\u1ED9n v\u1EDBi qu\xE1n \u0103n v\xE0 \u0111i\u1EC3m ch\u01A1i.",
    "M\u1ED9t trang th\u1EF1c d\u1EE5ng cho chuy\u1EBFn \u0111i: c\xE1c m\u1EE5c c\u1EA7n chu\u1EA9n b\u1ECB, \u0111\u1EB7t tr\u01B0\u1EDBc ho\u1EB7c l\u01B0u s\u1ED1.",
    "C\xE1c d\u1ECBch v\u1EE5 quan tr\u1ECDng \u0111\u01B0\u1EE3c t\xE1ch ri\xEAng \u0111\u1EC3 l\u1ECBch \u0111i tr\u01A1n h\u01A1n v\xE0 \xEDt ph\u1EA3i x\u1EED l\xFD g\u1EA5p.",
    "Trang n\xE0y gom nh\u1EEFng th\u1EE9 h\u1EADu c\u1EA7n n\xEAn c\xF3 s\u1EB5n tr\u01B0\u1EDBc khi b\u1EAFt \u0111\u1EA7u ch\u1EA1y l\u1ECBch."
  ],
  stay: [
    "C\xE1c ch\u1ED7 ngh\u1EC9 n\xEAn xem ri\xEAng \u0111\u1EC3 d\u1EC5 ch\u1ED1t ph\xF2ng, kh\xF4ng tr\u1ED9n v\u1EDBi d\u1ECBch v\u1EE5 kh\xE1c.",
    "Trang l\u01B0u tr\xFA n\xE0y gi\xFAp so nhanh v\xE0i l\u1EF1a ch\u1ECDn tr\u01B0\u1EDBc khi quy\u1EBFt ch\u1ED7 \u1EDF cho chuy\u1EBFn \u0111i.",
    "Ghim ri\xEAng homestay \u0111\u1EC3 l\xFAc ch\u1ED1t ph\xF2ng c\xF3 ngay nh\xF3m l\u1EF1a ch\u1ECDn s\u1EA1ch v\xE0 d\u1EC5 xem.",
    "M\u1ED9t c\u1EE5m ch\u1ED7 ngh\u1EC9 \u0111\u1EC3 c\xE2n v\u1ECB tr\xED, vibe v\xE0 l\u1ECBch di chuy\u1EC3n tr\u01B0\u1EDBc khi \u0111\u1EB7t.",
    "C\xE1c l\u1EF1a ch\u1ECDn l\u01B0u tr\xFA \u0111\u01B0\u1EE3c t\xE1ch ri\xEAng \u0111\u1EC3 kh\xF4ng l\u1EABn v\u1EDBi \u0111i\u1EC3m ch\u01A1i trong ng\xE0y.",
    "Trang n\xE0y d\xE0nh cho b\u01B0\u1EDBc ch\u1ED1t n\u01A1i \u1EDF: xem nhanh, so nhanh, r\u1ED3i quay l\u1EA1i l\u1ECBch \u0111i."
  ],
  activity: [
    "C\xE1c ho\u1EA1t \u0111\u1ED9ng v\xE0 \u0111i\u1EC3m gh\xE9 \u0111\u01B0\u1EE3c gom ri\xEAng \u0111\u1EC3 \u0111\u1ED5i nh\u1ECBp cho l\u1ECBch \u0111i.",
    "Trang ho\u1EA1t \u0111\u1ED9ng n\xE0y th\xEAm l\u1EF1a ch\u1ECDn tr\u1EA3i nghi\u1EC7m, h\u1EE3p khi mu\u1ED1n chuy\u1EBFn \u0111i b\u1EDBt ch\u1EC9 check-in.",
    "Ghim c\xE1c ho\u1EA1t \u0111\u1ED9ng ri\xEAng \u0111\u1EC3 d\u1EC5 chen v\xE0o l\u1ECBch khi c\xF2n d\u01B0 th\u1EDDi gian ho\u1EB7c mu\u1ED1n \u0111\u1ED5i mood.",
    "M\u1ED9t c\u1EE5m tr\u1EA3i nghi\u1EC7m \u0111\u1EC3 ng\xE0y \u0111i c\xF3 th\xEAm vi\u1EC7c \u0111\xE1ng l\xE0m, kh\xF4ng ch\u1EC9 ch\u1EE5p \u1EA3nh r\u1ED3i \u0111i ti\u1EBFp.",
    "C\xE1c ho\u1EA1t \u0111\u1ED9ng \u0111\u01B0\u1EE3c t\xE1ch ri\xEAng \u0111\u1EC3 b\u1EA1n ch\u1ECDn nh\u1ECBp vui h\u01A1n cho t\u1EEBng bu\u1ED5i.",
    "Trang n\xE0y d\xE0nh cho nh\u1EEFng l\xFAc mu\u1ED1n l\xE0m g\xEC \u0111\xF3 kh\xE1c h\u01A1n: gh\xE9, th\u1EED, ch\u01A1i, r\u1ED3i \u0111i ti\u1EBFp."
  ],
  tourism: [
    "C\xE1c khu du l\u1ECBch \u0111\u01B0\u1EE3c t\xE1ch ri\xEAng kh\u1ECFi trang check-in \u0111\u1EC3 ng\u01B0\u1EDDi xem c\xE2n l\u1ECBch d\u1EC5 h\u01A1n.",
    "Trang khu du l\u1ECBch n\xE0y h\u1EE3p \u0111\u1EC3 ch\u1ECDn \u0111i\u1EC3m \u0111i d\xE0i h\u01A1i, c\u1EA7n c\xE2n th\u1EDDi gian h\u01A1n \u0111i\u1EC3m gh\xE9 nhanh.",
    "Ghim ri\xEAng c\xE1c khu du l\u1ECBch \u0111\u1EC3 d\u1EC5 quy\u1EBFt n\u01A1i n\xE0o \u0111\xE1ng d\xE0nh h\u1EB3n m\u1ED9t bu\u1ED5i.",
    "M\u1ED9t c\u1EE5m \u0111i\u1EC3m l\u1EDBn h\u01A1n, ph\xF9 h\u1EE3p khi mu\u1ED1n c\xF3 l\u1ECBch r\xF5 thay v\xEC ch\u1EC9 gh\xE9 ch\u1EE5p nhanh.",
    "C\xE1c khu du l\u1ECBch \u0111\u01B0\u1EE3c gom ri\xEAng \u0111\u1EC3 b\u1EA1n xem tr\u01B0\u1EDBc \u0111\u1ED9 xa, \u0111\u1ED9 r\u1ED9ng v\xE0 th\u1EDDi gian c\u1EA7n d\xE0nh.",
    "Trang n\xE0y gi\xFAp ch\u1ECDn c\xE1c \u0111i\u1EC3m \u0111i ch\xEDnh trong ng\xE0y, tr\u01B0\u1EDBc khi th\xEAm cafe hay \u0111i\u1EC3m \u0103n."
  ],
  generic: [
    "Trang n\xE0y gom ri\xEAng c\xE1c m\u1EE5c c\xF9ng nh\xF3m \u0111\u1EC3 scan nhanh v\xE0 l\u01B0u tr\u01B0\u1EDBc khi \u0111i.",
    "M\u1ED9t trang ph\u1EE5 \u0111\u01B0\u1EE3c t\xE1ch ri\xEAng \u0111\u1EC3 list d\u1EC5 \u0111\u1ECDc h\u01A1n v\xE0 kh\xF4ng ph\u1EA3i quy\u1EBFt t\u1EEB m\u1ED9t \u0111\u1ED1ng h\u1ED7n h\u1EE3p.",
    "C\xE1c m\u1EE5c c\xF9ng nh\xF3m \u0111\u01B0\u1EE3c \u0111\u1EB7t chung \u0111\u1EC3 ng\u01B0\u1EDDi xem ch\u1ECDn nhanh theo \u0111\xFAng nhu c\u1EA7u l\xFAc \u0111\xF3.",
    "Trang n\xE0y gi\xFAp list g\u1ECDn h\u01A1n: m\u1EDF ra l\xE0 hi\u1EC3u nh\xF3m n\xE0o, d\xF9ng l\xFAc n\xE0o, l\u01B0u v\xEC sao.",
    "M\u1ED9t c\u1EE5m l\u1EF1a ch\u1ECDn ri\xEAng \u0111\u1EC3 chuy\u1EBFn \u0111i d\u1EC5 xoay nh\u1ECBp m\xE0 kh\xF4ng b\u1ECB lo\xE3ng th\xF4ng tin.",
    "C\xE1c g\u1EE3i \xFD \u0111\u01B0\u1EE3c gom th\xE0nh m\u1ED9t trang r\xF5 \xFD, h\u1EE3p \u0111\u1EC3 scan nhanh tr\u01B0\u1EDBc khi ch\u1ED1t l\u1ECBch."
  ]
};
function contextualGrid8Title(page) {
  const kind = gridPageKind(page);
  if (kind === "food") return "8 QU\xC1N \u0102N \u0110\xC0 L\u1EA0T";
  if (kind === "cafe") return "8 QU\xC1N CAFE";
  if (kind === "checkin") return "8 \u0110I\u1EC2M CHECK-IN";
  if (kind === "nightlife") return "8 \u0110I\u1EC2M CH\u01A0I \u0110\xCAM";
  if (kind === "service") return "8 L\u01AFU \xDD C\u1EA6N NH\u1EDA";
  if (kind === "stay") return "8 HOMESTAY \u0110\xC0 L\u1EA0T";
  if (kind === "activity") return "8 HO\u1EA0T \u0110\u1ED8NG \u0110\xC0 L\u1EA0T";
  if (kind === "tourism") return "8 KHU DU L\u1ECACH \u0110\xC0 L\u1EA0T";
  return page?.title || page?.chipText || "";
}
function contextualGrid8Intro(page, list) {
  const kind = gridPageKind(page);
  const variants = GRID8_INTRO_VARIANTS[kind] || GRID8_INTRO_VARIANTS.generic;
  return polishShortVietnameseCopy(pickListVariant(list, variants, kind));
}
function grid8IntroForPage(page, pageSubtitle, list) {
  if (!isGeneratedCaptionList(list)) return pageSubtitle;
  if (!pageSubtitle || sameGridText(pageSubtitle, list?.description)) return contextualGrid8Intro(page, list);
  if (page.layoutVariant === "grid-8") return contextualGrid8Intro(page, list);
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
    <article class="${escapeHtml(storyPageClass(listId, "grid4-feature-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText)}.png">
      <div class="grid4-feature-bg">
        ${renderPreviewImage(backgroundImage, page.title)}
      </div>
      <div class="grid4-feature-shade"></div>
      <div class="grid4-feature-copy">
        <div class="grid4-feature-kicker">\u0110\xC0 L\u1EA0T</div>
        <h1 class="grid4-feature-title">${escapeHtml(page.title || page.chipText || "")}</h1>
        ${featureSubtitle ? `<p class="grid4-feature-subtitle">${escapeHtml(featureSubtitle)}</p>` : ""}
      </div>
    </article>
  `;
}
function renderGrid4MutantCover(page, index, listId) {
  const placement = page.titlePlacement || "bottom-left";
  const placementClass = `placement-${placement}`;
  return `
    <article class="${escapeHtml(storyPageClass(listId, "grid4-mutant-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
      <div class="grid4-mutant-cover-bg">
        ${renderPreviewImage(page.backgroundImage, page.title)}
      </div>
      <div class="grid4-mutant-cover-shade"></div>
      <div class="grid4-mutant-cover-copy ${escapeHtml(placementClass)}">
        <div class="grid4-mutant-cover-kicker">\u0110\xC0 L\u1EA0T</div>
        <h1 class="grid4-mutant-cover-title">${escapeHtml(page.title || "")}</h1>
        ${page.subtitle ? `<p class="grid4-mutant-cover-subtitle">${escapeHtml(page.subtitle)}</p>` : ""}
      </div>
    </article>
  `;
}
function renderGrid4MutantItems(items, position = "bottom", showAddress = true) {
  return items.map((item) => {
    const displayName = compactGridItemName(item?.rawName || item?.name);
    const cleanAddress = shouldShowItemAddress(item, showAddress) ? truncateMenuLine(cleanGridAddress(item?.metaPrimary), 52) : "";
    const addressHtml = cleanAddress ? `
      <div class="grid4-mutant-address">
        <span class="grid4-mutant-address-pin">${renderPhotomodePin()}</span>
        <span class="grid4-mutant-address-text">${escapeHtml(cleanAddress)}</span>
      </div>
    ` : "";
    const labelHtml = item.label ? `<div class="grid4-mutant-service-label">${escapeHtml(item.label)}</div>` : "";
    const posClass = position === "top" ? "mutant-item-top" : "mutant-item-bottom";
    return `
      <div class="grid4-mutant-item ${posClass} ${escapeHtml(item.imageSource || (item.imageMapped ? "manual" : "fallback"))}">
        ${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}
        <div class="grid4-mutant-overlay">
          ${labelHtml}
          <div class="grid4-mutant-name">${escapeHtml(truncateMenuLine(displayName, 36))}</div>
          ${addressHtml}
        </div>
      </div>
    `;
  }).join("");
}
function renderGrid4MutantContentPage(page, index, listId) {
  const contentStyle = page.contentStyle || "strip";
  const styleClass = `mutant-${contentStyle}`;
  const showServiceLabel = isServiceOrStayListPage(page);
  const showAddress = !isActivityListPage(page);
  const itemsToRender = (page.items || []).slice(0, 4);
  const processedItems = showServiceLabel ? itemsToRender : itemsToRender.map((item) => ({ ...item, label: "" }));
  if (contentStyle === "strip") {
    return `
      <article class="${escapeHtml(storyPageClass(listId, "grid4-mutant", styleClass))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText)}.png">
        <div class="grid4-mutant-body">
          ${renderGrid4MutantItems(processedItems.slice(0, 2), "top", showAddress)}
          <div class="grid4-mutant-title-strip">${escapeHtml(page.title)}</div>
          ${renderGrid4MutantItems(processedItems.slice(2, 4), "bottom", showAddress)}
        </div>
      </article>
    `;
  }
  return `
    <article class="${escapeHtml(storyPageClass(listId, "grid4-mutant", styleClass))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText)}.png">
      <div class="grid4-mutant-body">
        ${renderGrid4MutantItems(processedItems.slice(0, 2), "top", showAddress)}
        ${renderGrid4MutantItems(processedItems.slice(2, 4), "bottom", showAddress)}
        <div class="grid4-mutant-title-card">${escapeHtml(page.title)}</div>
      </div>
    </article>
  `;
}
function renderZigzagCover(page, index, listId) {
  return `
    <article class="${escapeHtml(storyPageClass(listId, "zigzag-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
      <div class="zigzag-cover-bg">
        ${renderPreviewImage(page.backgroundImage, page.title)}
      </div>
      <div class="zigzag-cover-shade"></div>
      <div class="zigzag-cover-copy">
        <div class="zigzag-cover-badge">\u0110\xE0 L\u1EA1t</div>
        <h1 class="zigzag-cover-title">${escapeHtml(page.title || "")}</h1>
        ${page.subtitle ? `<p class="zigzag-cover-subtitle">${escapeHtml(page.subtitle)}</p>` : ""}
      </div>
    </article>
  `;
}
function zigzagThirdLineHtml(item) {
  const label = String(item?.label || "").trim();
  const price = gridPriceMetaFromSecondary(item?.metaSecondary);
  const sectionKey = String(item?.sourceSectionKey || "").trim();
  if (sectionKey === "quan_an" && label) {
    return `<span class="zigzag-label">${escapeHtml(label)}</span>`;
  }
  if (price) {
    return `<span class="zigzag-price">${escapeHtml(price)}</span>`;
  }
  if (label) {
    return `<span class="zigzag-label">${escapeHtml(label)}</span>`;
  }
  return "";
}
function renderZigzagItems(items, { showAddress = true } = {}) {
  return items.map((item) => {
    const displayName = compactGridItemName(item?.rawName || item?.name);
    const address = shouldShowItemAddress(item, showAddress) ? cleanGridAddress(item?.metaPrimary) : "";
    const addressHtml = address ? `<div class="zigzag-address">${escapeHtml(address)}</div>` : "";
    const thirdHtml = zigzagThirdLineHtml(item);
    return `
      <div class="zigzag-item">
        <div class="zigzag-thumb ${escapeHtml(item.imageSource || (item.imageMapped ? "manual" : "fallback"))}">
          ${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}
        </div>
        <div class="zigzag-copy">
          <div class="zigzag-name">${escapeHtml(displayName)}</div>
          ${addressHtml}
          ${thirdHtml}
        </div>
      </div>
    `;
  }).join("");
}
function renderZigzagContentPage(page, index, listId) {
  const itemsToRender = (page.items || []).slice(0, 6);
  const showAddress = !isActivityListPage(page);
  return `
    <article class="${escapeHtml(storyPageClass(listId, "zigzag-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText)}.png">
      <div class="zigzag-header">
        <div class="zigzag-header-title">${escapeHtml(page.title)}</div>
      </div>
      <div class="zigzag-body">
        ${renderZigzagItems(itemsToRender, { showAddress })}
      </div>
    </article>
  `;
}
function renderInlineHashtags(hashtags) {
  if (!Array.isArray(hashtags) || hashtags.length === 0) {
    return "";
  }
  return `
    <div class="page-inline-hashtags">
      ${hashtags.map((tag) => {
    let cleanTag = tag.trim().toLowerCase();
    if (cleanTag && !cleanTag.startsWith("#")) {
      cleanTag = "#" + cleanTag;
    }
    return `<span class="page-inline-hashtag">${escapeHtml(cleanTag)}</span>`;
  }).join("")}
    </div>
  `;
}
function stripVietnameseMarks(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function collectPagePlaceNames(pages) {
  const names = /* @__PURE__ */ new Map();
  const addName = (value) => {
    const name = String(value || "").replace(/\s+/g, " ").trim();
    if (name.length < 3) return;
    names.set(stripVietnameseMarks(name).toLowerCase(), name);
  };
  for (const page of pages || []) {
    if (page?.type !== "list") continue;
    for (const item of page.items || []) {
      addName(item.rawName);
      addName(item.name);
      addName(String(item.name || "").split(/:\s*/).slice(1).join(": "));
    }
  }
  return [...names.values()].sort((a, b) => b.length - a.length);
}
function getPlaceNameCandidates(name) {
  const normalized = String(name || "").replace(/\s+/g, " ").trim();
  const unaccented = stripVietnameseMarks(normalized);
  return [...new Set([normalized, unaccented].filter((value) => value.length >= 3))];
}
function hasPagePlaceName(value, placeNames) {
  return placeNames.some((name) => getPlaceNameCandidates(name).some((candidate) => {
    const escaped = escapeRegExp(candidate).replace(/\s+/g, "\\s+");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "iu").test(value);
  }));
}
function looksLikeStopList(value) {
  const dayMarkers = value.match(/\b(?:ngày\s*(?:đầu|một|hai|ba|bốn|1|2|3|4)|sáng|trưa|chiều|tối)\b/giu) || [];
  const stopVerbs = value.match(/\b(?:ghé|qua|đi|lượn|chạy|săn|ăn|uống|check-?in|chụp)\b/giu) || [];
  return dayMarkers.length >= 2 && stopVerbs.length >= 2;
}
function looksLocationSpecific(value) {
  const normalized = stripVietnameseMarks(value).toLowerCase();
  return /\b(?:nha tho|duong|hem|doc|kdl|bun|banh|lau|xien)\b/.test(normalized) || /\b\d+\s*k\b/i.test(value);
}
function sanitizeSubtitleForDisplay(value, pages) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if ((pages || []).some((page) => page?.layoutVariant === "spotlight-partner")) {
    return polishShortVietnameseCopy(clean);
  }
  const placeNames = collectPagePlaceNames(pages);
  if (hasPagePlaceName(clean, placeNames) || looksLikeStopList(clean) || looksLocationSpecific(clean)) {
    return GENERIC_CAPTION_BODY;
  }
  return polishShortVietnameseCopy(clean);
}
var V2_COVER_VARIANTS = /* @__PURE__ */ new Set([
  "grid-6-quaytung-cover",
  "grid-8-feed",
  "grid-8-quaytung-cover",
  "spotlight-v2",
  "spotlight-v3",
  "spotlight-partner-v2",
  "pov-maikem",
  "pov-3-v2-cover",
  "budget-wallet-cover",
  "itinerary-4n3d-stack-cover",
  "itinerary-timeline-cover"
]);
var V2_LIST_VARIANTS = /* @__PURE__ */ new Set([
  "grid-6-quaytung",
  "grid-8-feed",
  "grid-8-quaytung",
  "grid-8-quaytung-menu",
  "spotlight-v2",
  "spotlight-v3",
  "spotlight-v2-list",
  "spotlight-partner-v2",
  "spotlight-partner-v2-info",
  "pov-maikem",
  "pov-3-v2-stack",
  "pov-3-v2-grid",
  "itinerary-4n3d-stack-page",
  "itinerary-timeline-day",
  "budget-wallet-day",
  "budget-wallet-fixed",
  "budget-wallet-bill"
]);
function cafeLightPrice(item) {
  const raw = String(item.metaSecondary || item.metaPrimary || "").trim();
  const match = raw.match(/(\d+\s*k|\d+[.,]?\d*\s*tr)/i);
  return match ? match[1] : raw.includes("Gi\xE1") ? raw : "";
}
var GRID8_FEED_CENTER_HOOKS = {
  food: "\u0102n u\u1ED1ng g\xEC",
  cafe: "Coffee lowkey",
  checkin: "Checkin free",
  service: "Ti\u1EC7n \xEDch uy t\xEDn",
  nightlife: "Ch\u01A1i \u0111\xEAm chill",
  stay: "Homestay vibe",
  activity: "Ho\u1EA1t \u0111\u1ED9ng hot",
  tourism: "\u0110i\u1EC3m must-go"
};
function grid8FeedCenterHook(page, list) {
  const kind = gridPageKind(page);
  if (GRID8_FEED_CENTER_HOOKS[kind]) return GRID8_FEED_CENTER_HOOKS[kind];
  const stripped = stripChipPrefixFromTitle(page.chipText, page.title);
  if (stripped) return stripped;
  return String(page.chipText || "\u0110\xE0 L\u1EA1t").trim();
}
function gridPriceMetaFromSecondary(value) {
  const secondary = String(value || "").replace(/\s+/g, " ").trim();
  if (!secondary) return "";
  const parts = secondary.split("\xB7").map((part) => part.trim()).filter(Boolean);
  const pricePart = parts.find((part) => /^Giá:/i.test(part));
  if (pricePart) return pricePart;
  const withoutHours = parts.filter((part) => !/^Khung giờ:/i.test(part)).join(" \xB7 ");
  return withoutHours.replace(/(?:^|\s*·\s*)Khung giờ:\s*[^·]+/gi, "").replace(/^[\s·]+|[\s·]+$/g, "").trim();
}
function grid8FeedItemMeta(item, showAddress = true) {
  const parts = [];
  if (shouldShowItemAddress(item, showAddress)) {
    const address = cleanGridAddress(item?.metaPrimary);
    if (address) parts.push(address);
  }
  const price = gridPriceMetaFromSecondary(item?.metaSecondary);
  if (price) parts.push(price);
  if (parts.length > 0) return parts.join(" \xB7 ");
  const raw = String(item?.metaPrimary || "").trim();
  const phone = raw.match(/(?:\+?84|0)\d[\d\s.]{7,12}\d/);
  if (phone) return phone[0].replace(/\s+/g, " ").trim();
  return "";
}
function stripChipPrefixFromTitle(chipText, title) {
  const chip = String(chipText || "").trim();
  const raw = String(title || "").trim();
  if (!raw) return "";
  if (!chip) return raw;
  const lowerTitle = raw.toLowerCase();
  const lowerChip = chip.toLowerCase();
  if (lowerTitle === lowerChip) return "";
  if (lowerTitle.startsWith(`${lowerChip} - `)) return raw.slice(chip.length + 3).trim();
  if (lowerTitle.startsWith(`${lowerChip}-`)) return raw.slice(chip.length + 1).trim();
  if (lowerTitle.startsWith(lowerChip)) return raw.slice(chip.length).replace(/^[\s\-–—:]+/, "").trim();
  return raw;
}
var GRID5_TITLE_CARDS = {
  checkin: "M\u1ED9t v\xE0i \u0111i\u1EC3m check in hot",
  food: "M\u1ED9t v\xE0i qu\xE1n \u0103n ngon",
  cafe: "M\u1ED9t v\xE0i qu\xE1n cafe \u0111\u1EB9p",
  nightlife: "M\u1ED9t v\xE0i spot ch\u01A1i \u0111\xEAm",
  service: "Homestay & Spa",
  stay: "Homestay & Spa",
  activity: "M\u1ED9t v\xE0i ho\u1EA1t \u0111\u1ED9ng hot",
  tourism: "M\u1ED9t v\xE0i \u0111i\u1EC3m du l\u1ECBch"
};
function grid5TitleCard(page, list) {
  const kind = gridPageKind(page);
  if (kind === "cafe") {
    const idx = listVariantIndex(list, 2, page.chipText);
    return idx === 0 ? "M\u1ED9t v\xE0i qu\xE1n cafe \u0111\u1EB9p" : "M\u1ED9t v\xE0i qu\xE1n cafe chill";
  }
  if (GRID5_TITLE_CARDS[kind]) return GRID5_TITLE_CARDS[kind];
  const stripped = stripChipPrefixFromTitle(page.chipText, page.title);
  return stripped || String(page.chipText || "G\u1EE3i \xFD \u0110\xE0 L\u1EA1t").trim();
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
        ${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}
      </div>
      <div class="grid8-feed-labels">
        <div class="grid8-feed-name">${escapeHtml(displayName)}</div>
        ${meta ? `<div class="grid8-feed-meta">${escapeHtml(meta)}</div>` : ""}
      </div>
    </div>
  `;
}
function formatGrid8FeedCenterHook(hookText) {
  const raw = truncateMenuLine(String(hookText || "").trim(), 28);
  if (!raw) return "";
  const words = raw.split(/\s+/);
  if (words.length <= 1) return escapeHtml(raw);
  const splitAt = words.length === 2 ? 1 : Math.ceil(words.length / 2);
  return `${escapeHtml(words.slice(0, splitAt).join(" "))}<br>${escapeHtml(words.slice(splitAt).join(" "))}`;
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
function renderGrid8FeedItems(items, centerHook, showAddress = true) {
  const cells = (items || []).slice(0, 8);
  const centerHtml = renderGrid8FeedCenterSlot(centerHook);
  const ordered = [
    ...cells.slice(0, 3).map((item) => renderGrid8FeedSlot(item, showAddress)),
    cells[3] ? renderGrid8FeedSlot(cells[3], showAddress) : "",
    centerHtml,
    cells[4] ? renderGrid8FeedSlot(cells[4], showAddress) : "",
    ...cells.slice(5, 8).map((item) => renderGrid8FeedSlot(item, showAddress))
  ].filter(Boolean);
  return ordered.join("");
}
function grid8FeedPageBgImages(page, backgroundImage, listId = "", coverImageUrls = []) {
  const fromItems = (Array.isArray(page?.items) ? page.items : []).map((item) => String(item?.imageUrl || "").trim()).filter(Boolean);
  const uniqueFromItems = [...new Set(fromItems)];
  if (uniqueFromItems.length >= 4) return uniqueFromItems.slice(0, 4);
  const fromPageBg = String(page?.backgroundImage || backgroundImage || "").trim();
  const pool = (coverImageUrls.length > 0 ? coverImageUrls : spotlightV2CoverImagePool).filter(Boolean);
  const seed = `${listId || page?.chipText || "grid8-feed-page"}|${page?.title || page?.chipText || "bg"}`;
  const fromPool = pickUniqueCoverGridImages(pool, seed, 4);
  const merged = [...new Set([...uniqueFromItems, fromPageBg, ...fromPool].filter(Boolean))];
  if (merged.length >= 4) return merged.slice(0, 4);
  if (merged.length > 0) {
    const padded = [...merged];
    while (padded.length < 4) padded.push(padded[padded.length % merged.length]);
    return padded.slice(0, 4);
  }
  return fromPageBg ? [fromPageBg] : [];
}
function renderGrid8FeedPageBackground(page, backgroundImage, listId = "", coverImageUrls = []) {
  let tiles = grid8FeedPageBgImages(page, backgroundImage, listId, coverImageUrls);
  while (tiles.length < 4) tiles.push("");
  tiles = tiles.slice(0, 4);
  const label = page?.title || page?.chipText || "background";
  return `
    <div class="grid8-feed-page-bg-grid">
      ${tiles.map((url, tileIndex) => `
        <div class="grid8-feed-page-bg-cell">
          ${url ? renderPreviewImage(url, `${label} ${tileIndex + 1}`) : ""}
        </div>
      `).join("")}
    </div>
  `;
}
function grid8FeedCoverGridImages(page, backgroundImage, listId = "", coverImageUrls = []) {
  const fromPage = Array.isArray(page?.coverImages) ? page.coverImages.filter(Boolean) : [];
  const uniqueFromPage = [...new Set(fromPage)];
  if (uniqueFromPage.length >= 4) return uniqueFromPage.slice(0, 4);
  const pool = (coverImageUrls.length > 0 ? coverImageUrls : spotlightV2CoverImagePool).filter(Boolean);
  const seed = `${listId || page?.title || "grid8-feed-cover"}|cover-grid`;
  const fromPool = pickUniqueCoverGridImages(pool, seed, 4);
  const merged = [.../* @__PURE__ */ new Set([...uniqueFromPage, ...fromPool])];
  if (merged.length >= 4) return merged.slice(0, 4);
  if (merged.length > 0) return merged;
  return backgroundImage ? [backgroundImage] : [];
}
function formatGrid8FeedCoverHero(title) {
  const raw = String(title || "C\xC1C \u0110\u1ECAA \u0110I\u1EC2M \u0110\xC0 L\u1EA0T").replace(/\s+/g, " ").trim();
  const upper = raw.toUpperCase();
  const words = upper.split(" ");
  if (words.length <= 5) return escapeHtml(upper);
  const splitAt = Math.ceil(words.length / 2);
  return `${escapeHtml(words.slice(0, splitAt).join(" "))}<br>${escapeHtml(words.slice(splitAt).join(" "))}`;
}
function formatGrid8FeedCoverTagline(value) {
  let text = String(value || "B\u1ECE L\u1EE0 CH\u1EAEC CH\u1EAEN L\xC0 H\u1ED0I H\u1EACN").replace(/\s+/g, " ").trim();
  text = text.replace(/\.{3,}$/, "").replace(/…+$/, "").trim();
  return escapeHtml(text.toUpperCase());
}
function renderGrid8FeedCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage, coverImageUrls = []) {
  const hero = formatGrid8FeedCoverHero(coverTitle);
  const tagline = formatGrid8FeedCoverTagline(coverSubtitle);
  let tiles = grid8FeedCoverGridImages(page, backgroundImage, listId, coverImageUrls);
  while (tiles.length < 4) tiles.push("");
  tiles = tiles.slice(0, 4);
  return `
    <article class="${escapeHtml(storyPageClass(listId, "grid8-feed-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
      <div class="grid8-feed-cover-grid">
        ${tiles.map((url, tileIndex) => `
          <div class="grid8-feed-cover-cell">
            ${url ? renderPreviewImage(url, `${coverTitle || "cover"} ${tileIndex + 1}`) : ""}
          </div>
        `).join("")}
      </div>
      <div class="grid8-feed-cover-dim" aria-hidden="true"></div>
      <div class="grid8-feed-cover-center">
        <h1 class="grid8-feed-cover-hero">${hero}</h1>
        <p class="grid8-feed-cover-tagline">${tagline}</p>
      </div>
    </article>
  `;
}
function itinerary4N3DStackCoverGridImages(page, backgroundImage, listId = "", coverImageUrls = []) {
  const fromPage = Array.isArray(page?.coverImages) ? page.coverImages.filter(Boolean) : [];
  const uniqueFromPage = [...new Set(fromPage)];
  if (uniqueFromPage.length >= 4) return uniqueFromPage.slice(0, 4);
  const pool = (coverImageUrls.length > 0 ? coverImageUrls : spotlightV2CoverImagePool).filter(Boolean);
  const seed = `${listId || page?.title || "itinerary-4n3d-stack-cover"}|cover-grid`;
  const fromPool = pickUniqueCoverGridImages(pool, seed, 4);
  const merged = [...new Set([...uniqueFromPage, backgroundImage, ...fromPool].filter(Boolean))];
  if (merged.length >= 4) return merged.slice(0, 4);
  if (merged.length > 0) {
    const padded = [...merged];
    while (padded.length < 4) padded.push(padded[padded.length % merged.length]);
    return padded.slice(0, 4);
  }
  return backgroundImage ? [backgroundImage] : [];
}
function formatItinerary4N3DStackCoverHero(title) {
  const raw = String(title || "4N3\u0110 \u0110\xC0 L\u1EA0T").replace(/\s+/g, " ").trim();
  const upper = raw.toUpperCase();
  const words = upper.split(" ");
  if (words.length <= 4) return escapeHtml(upper);
  const splitAt = Math.ceil(words.length / 2);
  return `${escapeHtml(words.slice(0, splitAt).join(" "))}<br>${escapeHtml(words.slice(splitAt).join(" "))}`;
}
function renderItinerary4N3DStackCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage, coverImageUrls = []) {
  const hero = formatItinerary4N3DStackCoverHero(coverTitle);
  const tagline = escapeHtml(String(coverSubtitle || "Gom g\u1ECDn g\u1EE3i \xFD theo t\u1EEBng nh\xF3m \u2014 \u0111i ch\u1EADm, chill t\u1EEBng ng\xE0y").replace(/\s+/g, " ").trim());
  let tiles = itinerary4N3DStackCoverGridImages(page, backgroundImage, listId, coverImageUrls);
  while (tiles.length < 4) tiles.push("");
  tiles = tiles.slice(0, 4);
  return `
    <article class="${escapeHtml(storyPageClass(listId, "itinerary-4n3d-stack-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
      <div class="itinerary-4n3d-stack-cover-grid">
        ${tiles.map((url, tileIndex) => `
          <div class="itinerary-4n3d-stack-cover-cell">
            ${url ? renderPreviewImage(url, `${coverTitle || "cover"} ${tileIndex + 1}`) : ""}
          </div>
        `).join("")}
      </div>
      <div class="itinerary-4n3d-stack-cover-dim" aria-hidden="true"></div>
      <div class="itinerary-4n3d-stack-cover-center">
        <div class="itinerary-4n3d-stack-cover-kicker">L\u1ECACH TR\xCCNH 4N3\u0110</div>
        <h1 class="itinerary-4n3d-stack-cover-hero">${hero}</h1>
        <p class="itinerary-4n3d-stack-cover-tagline">${tagline}</p>
      </div>
    </article>
  `;
}
function itinerary4N3DStackRowFocusClass(item) {
  const name = String(item?.name || item?.rawName || "").toLowerCase();
  if (/phong\s*m|stell|studio|nhà xe|nha xe/.test(name)) return " is-people-focus";
  if (item?.sourceSectionKey === "dich_vu" || item?.sourceSectionKey === "homestay") return " is-people-focus";
  return "";
}
function itinerary4N3DStackHeadlineLines(heading) {
  const raw = String(heading || "").replace(/\s+/g, " ").trim();
  if (!raw) return ["", ""];
  const cleaned = raw.replace(/\s*[·\-–—|]\s*4\s*NGÀY\s*$/i, "").trim() || raw;
  const dotParts = cleaned.split("\xB7").map((part) => part.trim()).filter(Boolean);
  if (dotParts.length >= 2) {
    return [dotParts[0], dotParts.slice(1).join(" \xB7 ")];
  }
  return [cleaned, ""];
}
function itinerary4N3DStackBracketLead(lead) {
  const bracketText = pov3V2BracketSubtitle(lead);
  const highlightMatch = bracketText.match(/^(.*?)(\bĐà Lạt\b|\bDa Lat\b)(.*)$/i);
  if (highlightMatch) {
    return `${escapeHtml(highlightMatch[1])}<span class="itinerary-4n3d-stack-page-accent">${escapeHtml(highlightMatch[2])}</span>${escapeHtml(highlightMatch[3])}`;
  }
  return escapeHtml(bracketText);
}
function renderItinerary4N3DStackCell(item, showAddress = true) {
  const dayLabel = String(item.label || "").trim();
  const name = gridDisplayName(item);
  const address = shouldShowItemAddress(item, showAddress) ? cleanGridAddress(item.metaPrimary) : "";
  const focusClass = itinerary4N3DStackRowFocusClass(item);
  return `
    <div class="itinerary-4n3d-stack-page-cell${focusClass} ${escapeHtml(imageSourceClass(item))}">
      ${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}
      <div class="itinerary-4n3d-stack-page-cell-shade"></div>
      <div class="itinerary-4n3d-stack-row-copy">
        ${dayLabel ? `<div class="itinerary-4n3d-stack-day">${escapeHtml(dayLabel)}</div>` : ""}
        <h3 class="itinerary-4n3d-stack-name">${escapeHtml(name)}</h3>
        ${address ? `<p class="itinerary-4n3d-stack-address">${escapeHtml(address)}</p>` : ""}
      </div>
    </div>
  `;
}
function renderItinerary4N3DStackPage(page, index, listId, pageSubtitle = "") {
  const items = (page.items || []).slice(0, 4);
  const showAddress = !isActivityListPage(page);
  const heading = String(page.title || page.chipText || "").trim();
  const lead = String(pageSubtitle || page.subtitle || "").trim();
  const [lineOne, lineTwo] = itinerary4N3DStackHeadlineLines(heading);
  const leadHtml = lead ? itinerary4N3DStackBracketLead(lead) : "";
  return `
    <article class="${escapeHtml(storyPageClass(listId, "itinerary-4n3d-stack-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText)}.png">
      <div class="itinerary-4n3d-stack-page-grid">
        ${items.map((item) => renderItinerary4N3DStackCell(item, showAddress)).join("")}
      </div>
      <div class="itinerary-4n3d-stack-page-head">
        <h2 class="itinerary-4n3d-stack-page-headline">
          <span>${escapeHtml(lineOne)}</span>
          ${lineTwo ? `<span>${escapeHtml(lineTwo)}</span>` : ""}
        </h2>
        ${leadHtml ? `<p class="itinerary-4n3d-stack-page-bracket">${leadHtml}</p>` : ""}
      </div>
    </article>
  `;
}
function formatItineraryTimelineCoverHero(coverTitle) {
  const raw = String(coverTitle || "\u0110\xE0 L\u1EA1t 3N2\u0110").replace(/\s+/g, " ").trim();
  const match = raw.match(/^(.+?\s+-\s+)(.+)$/);
  if (match && raw.length > 22) {
    return `${escapeHtml(match[1].trim())}<br>${escapeHtml(match[2].trim())}`;
  }
  return escapeHtml(raw);
}
function renderItineraryTimelineCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
  const hero = formatItineraryTimelineCoverHero(coverTitle);
  return `
    <article class="${escapeHtml(storyPageClass(listId, "itinerary-timeline-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
      <div class="itl-cover-photo">
        ${renderPreviewImage(backgroundImage, coverTitle)}
      </div>
      <div class="itl-cover-shade" aria-hidden="true"></div>
      <div class="itl-cover-copy">
        <p class="itl-cover-serif">L\u1ECBch tr\xECnh</p>
        <p class="itl-cover-script" lang="vi">${hero}</p>
        <p class="itl-cover-serif">\u0111i \u0111\xE2u?</p>
        <div class="itl-cover-spark">\u2014 \u2726 \u2014</div>
      </div>
    </article>
  `;
}
function renderItineraryTimelineRow(item) {
  const time = String(item?.label || "").trim();
  const activity = String(item?.metaSecondary || "").trimEnd();
  const place = String(item?.name || "").trim();
  const address = cleanGridAddress(item?.metaPrimary) || String(item?.metaPrimary || "").trim();
  const placeHtml = place ? `${activity ? " " : ""}<strong class="itl-day-place">${escapeHtml(place)}</strong>` : "";
  return `
    <div class="itl-day-row ${escapeHtml(imageSourceClass(item))}">
      <div class="itl-day-thumb">
        ${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}
      </div>
      <div class="itl-day-track"><span class="itl-day-dot" aria-hidden="true"></span></div>
      <div class="itl-day-copy">
        <p class="itl-day-line">
          ${time ? `<span class="itl-day-time">${escapeHtml(time)}</span>` : ""}${time && (activity || place) ? " - " : ""}${activity ? `<span class="itl-day-activity">${escapeHtml(activity)}</span>` : ""}${placeHtml}
        </p>
        ${address ? `<p class="itl-day-address"><span class="itl-day-pin">\u{1F4CD}</span>${escapeHtml(address)}</p>` : ""}
      </div>
    </div>
  `;
}
function computeItineraryTimelineMetrics(itemCount) {
  const rows = Math.max(1, itemCount || 8);
  return {
    rows,
    rowH: 54,
    thumb: 48,
    lineSize: 10.5,
    addrSize: 9,
    feedW: 318
  };
}
function renderItineraryTimelineDay(page, index, listId) {
  const dayTitle = String(page.chipText || page.title || "Ng\xE0y 01").trim();
  const backgroundImage = page.backgroundImage || page.items?.[0]?.imageUrl || "";
  const items = page.items || [];
  const metrics = computeItineraryTimelineMetrics(items.length);
  const feedStyle = [
    `--itl-row-count:${metrics.rows}`,
    `--itl-row-h:${metrics.rowH}px`,
    `--itl-thumb:${metrics.thumb}px`,
    `--itl-line-size:${metrics.lineSize}px`,
    `--itl-addr-size:${metrics.addrSize}px`,
    `--itl-feed-w:${metrics.feedW}px`
  ].join(";");
  const rows = items.map((item) => renderItineraryTimelineRow(item)).join("");
  return `
    <article class="${escapeHtml(storyPageClass(listId, "itinerary-timeline-day"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText)}.png">
      <div class="itl-day-bg">${backgroundImage ? renderPreviewImage(backgroundImage, dayTitle) : ""}</div>
      <div class="itl-day-card">
        <header class="itl-day-head">
          <span class="itl-day-head-spark">\u2014 \u2726 \u2014</span>
          <h2 class="itl-day-head-title" lang="vi">${escapeHtml(dayTitle)}</h2>
        </header>
        <div class="itl-day-feed" style="${feedStyle}">${rows}</div>
      </div>
    </article>
  `;
}
function renderGrid8QuaytungDalatBadge() {
  return '<span class="grid8-quaytung-dalat-badge">dalat</span>';
}
function formatGrid8QuaytungCoverTitle(title) {
  const raw = String(title || 'List n\xE0y to\xE0n \u0111\u1ECBa \u0111i\u1EC3m "vu\xFDp"').replace(/\bĐà\s*Lạt\s+VN\b/giu, "\u0110\xE0 L\u1EA1t").replace(/\s+\/\s*VN\b/giu, "").replace(/\s+\bVN\b(?=\s|$|[./])/giu, "").replace(/\s+/g, " ").trim();
  const words = raw.split(" ");
  if (words.length <= 4) return escapeHtml(raw);
  const splitAt = Math.ceil(words.length / 2);
  return `${escapeHtml(words.slice(0, splitAt).join(" "))}<br>${escapeHtml(words.slice(splitAt).join(" "))}`;
}
function renderGrid8QuaytungCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
  const subtitle = String(coverSubtitle || "L\u01B0u list n\xE0y cho chuy\u1EBFn \u0111i th\xE0nh c\xF4ng").replace(/^\[+|\]+$/g, "").trim();
  return `
    <article class="${escapeHtml(storyPageClass(listId, "grid8-quaytung-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
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
function formatGrid6QuaytungCoverTitle(title) {
  const raw = String(title || 'List n\xE0y to\xE0n \u0111\u1ECBa \u0111i\u1EC3m "vu\xFDp"').replace(/\bĐà\s*Lạt\s+VN\b/giu, "\u0110\xE0 L\u1EA1t").replace(/\s+\/\s*VN\b/giu, "").replace(/\s+\bVN\b(?=\s|$|[./])/giu, "").replace(/\s+/g, " ").trim().toUpperCase();
  const words = raw.split(" ");
  if (words.length <= 4) return escapeHtml(raw);
  const splitAt = Math.ceil(words.length / 2);
  return `${escapeHtml(words.slice(0, splitAt).join(" "))}<br>${escapeHtml(words.slice(splitAt).join(" "))}`;
}
function renderGrid6QuaytungCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
  const subtitle = String(coverSubtitle || "L\u01B0u list n\xE0y cho chuy\u1EBFn \u0111i th\xE0nh c\xF4ng").replace(/^\[+|\]+$/g, "").trim();
  const tag = String(page?.chipText || "loanh quanh ph\u1ED1 ph\u01B0\u1EDDng").trim().toLowerCase();
  return `
    <article class="${escapeHtml(storyPageClass(listId, "grid6-quaytung-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
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
function renderGrid6QuaytungCell(item, labelsAt = "bottom", showAddress = true) {
  const displayName = gridDisplayName(item);
  const address = shouldShowItemAddress(item, showAddress) ? cleanGridAddress(item?.metaPrimary) || String(item?.metaPrimary || "").trim() : "";
  const labelClass = labelsAt === "top" ? "is-labels-top" : "is-labels-bottom";
  return `
    <div class="grid6qt-cell ${labelClass} ${escapeHtml(imageSourceClass(item))}">
      <div class="grid6qt-photo">
        ${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}
        <div class="grid6qt-shade"></div>
        <div class="grid6qt-labels">
          <div class="grid6qt-name">${escapeHtml(displayName)}</div>
          ${address ? `<div class="grid6qt-address">${escapeHtml(address)}</div>` : ""}
        </div>
      </div>
    </div>
  `;
}
function renderGrid6QuaytungBand(page) {
  const hook = String(page.title || "").trim().toUpperCase();
  return `
    <div class="grid6qt-band">
      <div class="grid6qt-band-copy">
        <div class="grid6qt-band-script">v\xE0i \u0111\u1ECBa \u0111i\u1EC3m</div>
        <div class="grid6qt-band-title">${escapeHtml(hook)}</div>
      </div>
    </div>
  `;
}
function renderGrid6QuaytungPageBody(page, items) {
  const cells = (items || []).slice(0, 6);
  const showAddress = !isActivityListPage(page);
  const top = cells.slice(0, 3).map((item) => renderGrid6QuaytungCell(item, "bottom", showAddress)).join("");
  const bottom = cells.slice(3, 6).map((item) => renderGrid6QuaytungCell(item, "top", showAddress)).join("");
  return `
    <div class="grid6qt-stack">
      <div class="grid6qt-row">${top}</div>
      ${renderGrid6QuaytungBand(page)}
      <div class="grid6qt-row">${bottom}</div>
    </div>
  `;
}
function grid8QuaytungExtractPrice(item) {
  const secondary = String(item?.metaSecondary || "").replace(/\s+/g, " ").trim();
  const priceMatch = secondary.match(/Giá:\s*([^·]+)/i);
  if (priceMatch) {
    const raw = priceMatch[1].trim();
    if (/free|miễn\s*phí|^0\s*đ$/i.test(raw)) return "FREE";
    return raw;
  }
  if (/free|miễn\s*phí/i.test(secondary)) return "FREE";
  return "";
}
function grid8QuaytungDefaultPrice(item) {
  const section = String(item?.sourceSectionKey || "").toLowerCase();
  if (section.includes("check") || section.includes("khu_du") || section.includes("lich_su")) return "FREE";
  return "Li\xEAn h\u1EC7";
}
function grid8QuaytungUnifiedPrices(items, page = null) {
  const preferFree = /mảng xanh|check-in|checkin/i.test(`${page?.chipText || ""} ${page?.title || ""}`);
  const labels = (items || []).map((item) => grid8QuaytungExtractPrice(item));
  const showForAll = labels.some(Boolean) || preferFree;
  if (!showForAll) return labels;
  return (items || []).map((item, index) => labels[index] || (preferFree ? "FREE" : grid8QuaytungDefaultPrice(item)));
}
function renderGrid8QuaytungSlot(item, priceLabel = "", showAddress = true) {
  const displayName = gridDisplayName(item);
  const address = shouldShowItemAddress(item, showAddress) ? cleanGridAddress(item?.metaPrimary) || String(item?.metaPrimary || "").trim() : "";
  const price = priceLabel || grid8QuaytungExtractPrice(item);
  return `
    <div class="grid8-quaytung-slot ${escapeHtml(imageSourceClass(item))}">
      <div class="grid8-quaytung-photo">
        ${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}
        <div class="grid8-quaytung-shade"></div>
        <div class="grid8-quaytung-labels">
          <div class="grid8-quaytung-name">${escapeHtml(displayName)}</div>
          ${address ? `<div class="grid8-quaytung-address">${escapeHtml(address)}</div>` : ""}
          ${price ? `<div class="grid8-quaytung-hours"><span class="grid8-quaytung-clock" aria-hidden="true">\u{1F39F}</span> ${escapeHtml(price)}</div>` : ""}
        </div>
      </div>
    </div>
  `;
}
function renderGrid8QuaytungCenterSlot(page, backgroundImage) {
  const hook = String(page.title || "").trim();
  const tagline = String(page.subtitle || "").trim();
  return `
    <div class="grid8-quaytung-slot grid8-quaytung-center-slot">
      <div class="grid8-quaytung-photo">
        ${backgroundImage ? renderPreviewImage(backgroundImage, hook) : ""}
        <div class="grid8-quaytung-center-shade"></div>
        <div class="grid8-quaytung-center-copy">
          ${renderGrid8QuaytungDalatBadge()}
          ${hook ? `<div class="grid8-quaytung-center-hook">${escapeHtml(hook)}</div>` : ""}
          ${tagline ? `<div class="grid8-quaytung-center-tagline">${escapeHtml(tagline)}</div>` : ""}
        </div>
      </div>
    </div>
  `;
}
function renderGrid8QuaytungItems(page, items, backgroundImage) {
  const cells = (items || []).slice(0, 8);
  const showAddress = !isActivityListPage(page);
  const priceLabels = grid8QuaytungUnifiedPrices(cells, page);
  const centerHtml = renderGrid8QuaytungCenterSlot(page, backgroundImage);
  const ordered = [
    ...cells.slice(0, 3).map((item, index) => renderGrid8QuaytungSlot(item, priceLabels[index], showAddress)),
    cells[3] ? renderGrid8QuaytungSlot(cells[3], priceLabels[3], showAddress) : "",
    centerHtml,
    cells[4] ? renderGrid8QuaytungSlot(cells[4], priceLabels[4], showAddress) : "",
    ...cells.slice(5, 8).map((item, offset) => renderGrid8QuaytungSlot(item, priceLabels[offset + 5], showAddress))
  ].filter(Boolean);
  return ordered.join("");
}
function renderGrid8QuaytungMenuSection(section, reverse) {
  const photoItem = section.items.find((item) => item.imageUrl) || section.items[0];
  const photoUrl = photoItem?.imageUrl || "";
  const photoCandidates = photoItem?.candidateImageUrls || [];
  const rows = section.items.map((item) => {
    const address = cleanGridAddress(item.metaPrimary) || String(item.metaPrimary || "").trim();
    const shortAddress = address ? truncateMenuLine(address, 36) : "";
    return `
      <li class="grid8-quaytung-menu-row">
        <strong>${escapeHtml(truncateMenuLine(gridDisplayName(item), 28))}</strong>
        ${shortAddress ? `<span>${escapeHtml(shortAddress)}</span>` : ""}
      </li>
    `;
  }).join("");
  return `
    <section class="grid8-quaytung-menu-section${reverse ? " is-reverse" : ""}">
      <div class="grid8-quaytung-menu-section-copy">
        <h3 class="grid8-quaytung-menu-section-title">\u2713 ${escapeHtml(section.title)}</h3>
        <ul class="grid8-quaytung-menu-list">${rows}</ul>
      </div>
      <div class="grid8-quaytung-menu-section-photo">
        ${photoUrl ? renderPreviewImage(photoUrl, section.title, "", photoCandidates) : ""}
      </div>
    </section>
  `;
}
function renderGrid8QuaytungMenuPage(page, index, listId, list) {
  const sectionOrder = [];
  const sectionMap = /* @__PURE__ */ new Map();
  for (const item of page.items || []) {
    const key = String(item.label || "G\u1EE3i \xFD").trim();
    if (!sectionMap.has(key)) {
      sectionMap.set(key, []);
      sectionOrder.push(key);
    }
    sectionMap.get(key).push(item);
  }
  const sections = sectionOrder.map((title) => ({ title, items: sectionMap.get(title) || [] }));
  const backgroundImage = String(page.backgroundImage || "").trim();
  return `
    <article class="${escapeHtml(storyPageClass(listId, "grid8-quaytung-menu-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText || "menu")}.png">
      ${backgroundImage ? `<div class="grid8-quaytung-menu-bg">${renderPreviewImage(backgroundImage, page.title)}</div>` : ""}
      <div class="grid8-quaytung-menu-dim"></div>
      <div class="grid8-quaytung-menu-head">
        ${renderGrid8QuaytungDalatBadge()}
        <h2 class="grid8-quaytung-menu-title">${escapeHtml(truncateMenuLine(page.title || "\u0110\u1ECAA \u0110I\u1EC2M \u0102N U\u1ED0NG NGON", 32))}</h2>
      </div>
      <div class="grid8-quaytung-menu-sections">
        ${sections.map((section, idx) => renderGrid8QuaytungMenuSection(section, idx % 2 === 1)).join("")}
      </div>
    </article>
  `;
}
function renderGrid5TitleCell(titleText) {
  return `
    <article class="grid5-cell grid5-title-cell">
      <span class="grid5-star grid5-star-tl" aria-hidden="true">\u2726</span>
      <span class="grid5-star grid5-star-tr" aria-hidden="true">\u2605</span>
      <span class="grid5-star grid5-star-bl" aria-hidden="true">\u2726</span>
      <div class="grid5-title-text">${escapeHtml(titleText)}</div>
    </article>
  `;
}
function renderGrid5PhotoCell(item, showAddress = true) {
  const meta = grid5ItemMeta(item, showAddress);
  return `
    <article class="grid5-cell grid5-photo-cell ${escapeHtml(imageSourceClass(item))}">
      ${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}
      <div class="grid5-photo-shade"></div>
      <div class="grid5-photo-copy">
        <div class="grid5-photo-name">${escapeHtml(gridDisplayName(item))}</div>
        ${meta ? `<div class="grid5-photo-meta">${escapeHtml(meta)}</div>` : ""}
      </div>
    </article>
  `;
}
function renderGrid5Matrix(items, titleText, showAddress = true) {
  const cells = (items || []).slice(0, 5);
  const ordered = [
    renderGrid5TitleCell(titleText),
    cells[0] ? renderGrid5PhotoCell(cells[0], showAddress) : "",
    cells[1] ? renderGrid5PhotoCell(cells[1], showAddress) : "",
    cells[2] ? renderGrid5PhotoCell(cells[2], showAddress) : "",
    cells[3] ? renderGrid5PhotoCell(cells[3], showAddress) : "",
    cells[4] ? renderGrid5PhotoCell(cells[4], showAddress) : ""
  ].filter(Boolean);
  return ordered.join("");
}
function renderGrid5Cover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
  const hero = String(coverTitle || "Dalat").trim();
  const hook = String(coverSubtitle || "Th\xE1ng 5+6 n\xEAn \u0111i \u0111\xE2u? L\xE0m g\xEC?").trim();
  const bracket = "[ G\u1EE3i \xFD nh\u1EEFng t\u1ECDa \u0111\u1ED9 hay ho cho chuy\u1EBFn \u0111i m\xF9a h\xE8 ]";
  return `
    <article class="${escapeHtml(storyPageClass(listId, "grid5-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
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
  const showAddress = !isActivityListPage(page);
  return `
    <article class="${escapeHtml(storyPageClass(listId, "grid5-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText)}.png">
      <div class="grid5-matrix">
        ${renderGrid5Matrix(page.items, titleCard, showAddress)}
      </div>
    </article>
  `;
}
function spotlightCoverGridSeed(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function pickUniqueCoverGridImages(pool, seed, count = 4) {
  const unique = [...new Set((pool || []).map((url) => String(url || "").trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  const ordered = [...unique].sort(
    (left, right) => spotlightCoverGridSeed(`${seed}:${left}`) - spotlightCoverGridSeed(`${seed}:${right}`)
  );
  return ordered.slice(0, count);
}
var spotlightV2CoverImagePool = [];
function setSpotlightV2CoverImagePool(urls) {
  spotlightV2CoverImagePool = Array.isArray(urls) ? urls.filter(Boolean) : [];
}
function spotlightV2CoverGridImages(page, backgroundImage, listId = "", coverImageUrls = []) {
  const fromPage = Array.isArray(page?.coverImages) ? page.coverImages.filter(Boolean) : [];
  const uniqueFromPage = [...new Set(fromPage)];
  if (uniqueFromPage.length >= 4) return uniqueFromPage.slice(0, 4);
  const pool = (coverImageUrls.length > 0 ? coverImageUrls : spotlightV2CoverImagePool).filter(Boolean);
  const seed = `${listId || page?.title || "spotlight-v2-cover"}|cover-grid`;
  const fromPool = pickUniqueCoverGridImages(pool, seed, 4);
  const merged = [.../* @__PURE__ */ new Set([...uniqueFromPage, ...fromPool])];
  if (merged.length >= 4) return merged.slice(0, 4);
  if (merged.length > 0) return merged;
  return backgroundImage ? [backgroundImage] : [];
}
function formatSpotlightV2CoverSubtitle(subtitle) {
  const clean = String(subtitle || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.startsWith("/") && clean.endsWith("/")) return clean;
  return `/${clean.replace(/^\/+|\/+$/g, "")}/`;
}
function renderSpotlightV2Cover(page, index, listId, coverTitle, coverSubtitle, backgroundImage, options = {}) {
  if (page?.layoutVariant === "spotlight-v3") {
    return renderSpotlightV3Cover(page, index, listId, coverTitle, backgroundImage, options);
  }
  const partnerClass = options.partner ? " spotlight-partner-v2-cover" : "";
  const coverImageUrls = options.coverImageUrls || [];
  let tiles = spotlightV2CoverGridImages(page, backgroundImage, listId, coverImageUrls);
  while (tiles.length < 4) tiles.push("");
  tiles = tiles.slice(0, 4);
  const subtitle = formatSpotlightV2CoverSubtitle(coverSubtitle);
  const placement = String(page?.titlePlacement || "center").trim() || "center";
  const placementClass = `spotlight-v2-place-${placement}`;
  return `
    <article class="${escapeHtml(storyPageClass(listId, "spotlight-v2-cover", `${partnerClass} ${placementClass}`.trim()))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
      <div class="spotlight-v2-cover-grid">
        ${tiles.map((url, tileIndex) => `
          <div class="spotlight-v2-cover-cell">
            ${url ? renderPreviewImage(url, `${coverTitle || "cover"} ${tileIndex + 1}`) : ""}
          </div>
        `).join("")}
      </div>
      <div class="spotlight-v2-cover-dim" aria-hidden="true"></div>
      <div class="spotlight-v2-cover-center">
        ${options.partner ? '<div class="spotlight-v2-cover-partner-script">dalat.</div>' : ""}
        ${!options.partner ? '<div class="spotlight-v2-cover-ornament" aria-hidden="true">\u2726 \xB7 \u{1F4F7} \xB7 \u2726</div>' : ""}
        ${coverTitle ? `<h1 class="spotlight-v2-cover-title">${escapeHtml(coverTitle)}</h1>` : ""}
        ${subtitle ? `<p class="spotlight-v2-cover-caption">${escapeHtml(subtitle)}</p>` : ""}
      </div>
    </article>
  `;
}
function spotlightV3CoverImage(page, backgroundImage) {
  const fromPage = Array.isArray(page?.coverImages) ? page.coverImages.filter(Boolean) : [];
  return fromPage[0] || backgroundImage || page?.backgroundImage || "";
}
function spotlightV3CoverPlacement(page, listId = "") {
  const allowed = [
    "top-left",
    "top-center",
    "top-right",
    "mid-left",
    "mid-right",
    "bottom-left",
    "bottom-center",
    "bottom-right"
  ];
  const raw = String(page?.titlePlacement || "").trim();
  if (allowed.includes(raw)) return raw;
  const seed = `${listId || page?.title || "v3"}|place`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = hash * 33 + seed.charCodeAt(i) >>> 0;
  return allowed[hash % allowed.length];
}
function renderSpotlightV3Cover(page, index, listId, coverTitle, backgroundImage, options = {}) {
  const imageUrl = spotlightV3CoverImage(page, backgroundImage);
  const placement = spotlightV3CoverPlacement(page, listId);
  const placementClass = `spotlight-v2-place-${placement}`;
  return `
    <article class="${escapeHtml(storyPageClass(listId, "spotlight-v2-cover spotlight-v3-cover", placementClass))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
      <div class="spotlight-v3-cover-bg">
        ${imageUrl ? renderPreviewImage(imageUrl, coverTitle || "cover") : ""}
      </div>
      <div class="spotlight-v2-cover-center">
        ${coverTitle ? `<h1 class="spotlight-v2-cover-title">${escapeHtml(coverTitle)}</h1>` : ""}
      </div>
    </article>
  `;
}
function renderSpotlightV2Page(page, index, listId, list, options = {}) {
  const item = page.items?.[0] || {};
  const backgroundImage = item.imageUrl || page.backgroundImage || coverBackgroundImage(page, list);
  const titleText = item.rawName || item.name || page.title || "";
  const address = spotlightV2AddressLine(item);
  const hours = spotlightV2HoursLine(item);
  const price = spotlightV2PriceLine(item);
  const positionClass = spotlightPositionClass(page, index, item);
  const partnerClass = options.partner ? " spotlight-partner-v2-page" : "";
  const v3Class = page?.layoutVariant === "spotlight-v3" ? " spotlight-v3-page" : "";
  return `
    <article class="${escapeHtml(storyPageClass(listId, "spotlight-v2-page", `${positionClass} ${partnerClass}${v3Class}`.trim()))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText || item.name || "spotlight")}.png">
      <div class="spotlight-v2-bg">
        ${renderPreviewImage(backgroundImage, item.name || page.title)}
      </div>
      <div class="spotlight-v2-shade"></div>
      <div class="spotlight-v2-copy">
        <h2 class="spotlight-v2-name">
          <span class="spotlight-pin">${renderPhotomodePin()}</span>
          <span class="spotlight-v2-name-text">${escapeHtml(titleText)}</span>
        </h2>
        ${address ? `<p class="spotlight-v2-address">${escapeHtml(address)}</p>` : ""}
        ${hours ? `<p class="spotlight-v2-hours">${escapeHtml(hours)}</p>` : ""}
        ${price ? `<p class="spotlight-v2-price">${escapeHtml(price)}</p>` : ""}
      </div>
    </article>
  `;
}
function renderSpotlightPartnerV2Page(page, index, listId, list) {
  return renderSpotlightV2Page(page, index, listId, list, { partner: true });
}
function renderPovMaikemCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
  return `
    <article class="${escapeHtml(storyPageClass(listId, "pov-maikem-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
      <div class="pov-maikem-cover-bg">
        ${renderPreviewImage(backgroundImage, coverTitle)}
      </div>
      <div class="pov-maikem-cover-shade"></div>
      <div class="pov-maikem-cover-copy">
        <h3 class="pov-maikem-cover-title">${escapeHtml(coverTitle)}</h3>
        ${coverSubtitle ? `<p class="pov-maikem-cover-subtitle">${escapeHtml(coverSubtitle)}</p>` : ""}
      </div>
    </article>
  `;
}
function pov3V2HeadlineLines(title) {
  const raw = String(title || "\u0111\u1EE9ng \u0111\xE2u\nc\u0169ng \u0111\u1EB9p").replace(/\\n/g, "\n");
  const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return ["\u0111\u1EE9ng \u0111\xE2u", "c\u0169ng \u0111\u1EB9p"];
  if (lines.length === 1) {
    const parts = lines[0].split(/\s+/);
    if (parts.length >= 4) return [parts.slice(0, 2).join(" "), parts.slice(2).join(" ")];
    return [lines[0], "c\u0169ng \u0111\u1EB9p"];
  }
  return lines.slice(0, 2);
}
function pov3V2BracketSubtitle(subtitle) {
  const clean = String(subtitle || "[ Nh\u1EEFng \u0111\u1ECBa \u0111i\u1EC3m checkin mang \u0111\u1EADm vibe \u0110\xE0 L\u1EA1t ]").replace(/\s+/g, " ").trim();
  if (!clean) return "[ Nh\u1EEFng \u0111\u1ECBa \u0111i\u1EC3m checkin mang \u0111\u1EADm vibe \u0110\xE0 L\u1EA1t ]";
  const inner = clean.replace(/^[\[\(\s]+|[\]\)\s]+$/g, "");
  return `[ ${inner} ]`;
}
function renderPov3V2Cover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
  const [lineOne, lineTwo] = pov3V2HeadlineLines(coverTitle);
  const bracketText = pov3V2BracketSubtitle(coverSubtitle);
  const highlightMatch = bracketText.match(/^(.*?)(\bĐà Lạt\b|\bDa Lat\b)(.*)$/i);
  const subtitleHtml = highlightMatch ? `${escapeHtml(highlightMatch[1])}<span class="pov-3-v2-accent">${escapeHtml(highlightMatch[2])}</span>${escapeHtml(highlightMatch[3])}` : escapeHtml(bracketText);
  return `
    <article class="${escapeHtml(storyPageClass(listId, "pov-3-v2-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
      <div class="pov-3-v2-cover-bg">
        ${renderPreviewImage(backgroundImage, coverTitle || "POV 3 cover")}
      </div>
      <div class="pov-3-v2-cover-shade"></div>
      <div class="pov-3-v2-cover-copy">
        <h1 class="pov-3-v2-headline">
          <span>${escapeHtml(lineOne)}</span>
          <span>${escapeHtml(lineTwo || "")}</span>
        </h1>
        <p class="pov-3-v2-bracket">${subtitleHtml}</p>
      </div>
    </article>
  `;
}
function isImageMappingNote(value) {
  return /^(?:Ảnh (?:đã map|tự map|minh họa|đối tác)|Thông tin đối tác)/i.test(String(value || "").trim());
}
var POV_3_V2_STACK_TAGLINE_MAX = 92;
function trimIncompleteTaglineTail(text) {
  let result = String(text || "").replace(/\s+/g, " ").trim();
  const trailing = /\s+(?:khi|va|và|và|cua|của|cho|với|với|mà|nên|để|de|trong|tại|tại|ở|o|là|la|còn|con|như|nhu|nếu|neu|sau|trước|trước)$/i;
  for (let i = 0; i < 4 && trailing.test(result); i += 1) {
    result = result.replace(trailing, "").trim();
  }
  return result;
}
function truncatePov3V2StackTagline(value, maxLen = POV_3_V2_STACK_TAGLINE_MAX) {
  const clean = trimIncompleteTaglineTail(
    String(value || "").replace(/^\[+|\]+$/g, "").replace(/\s+/g, " ").trim()
  );
  if (!clean) return "";
  if (clean.length <= maxLen) {
    return /[.!?…]$/.test(clean) ? clean : `${clean}.`;
  }
  const slice = clean.slice(0, maxLen + 1);
  const sentenceEnd = Math.max(slice.lastIndexOf("."), slice.lastIndexOf("!"), slice.lastIndexOf("?"));
  if (sentenceEnd >= maxLen * 0.35) {
    return clean.slice(0, sentenceEnd + 1).trim();
  }
  const cut = clean.slice(0, maxLen);
  const sp = cut.lastIndexOf(" ");
  const wordCut = (sp > maxLen * 0.45 ? cut.slice(0, sp) : cut).trim();
  const trimmed = trimIncompleteTaglineTail(wordCut);
  if (!trimmed) return "";
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}\u2026`;
}
function portraitFocusClass(item) {
  const section = String(item?.sourceSectionKey || "").trim();
  if (["check_in", "khu_du_lich", "dich_vu", "hoat_dong", "homestay"].includes(section)) {
    return " is-portrait-focus";
  }
  const name = String(item?.name || item?.rawName || "").toLowerCase();
  if (/tháp|thap|vinaphone|nhà thờ|nha tho|con gà|con ga|chụp|check.?in|thuê|thue|spa|nail|tóc|toc|makeup|photo|chụp hình|đồ|ao|váy|vay/.test(name)) {
    return " is-portrait-focus";
  }
  return "";
}
function pov3V2StackRowFocusClass(item) {
  return portraitFocusClass(item);
}
function truncateMenuLine(value, maxLen = 42) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > maxLen * 0.45 ? cut.slice(0, sp) : cut).trim()}\u2026`;
}
function isCompletePov3V2Tagline(text) {
  const t = String(text || "").trim();
  if (t.length < 18) return false;
  if (!/[.!?…]$/.test(t)) return false;
  return !/\s+(?:khi|va|và|của|cho|với|mà|nên|để|trong|tại|ở|là|còn|như|nếu|sau|trước|đà|dalat|lối|qua|chủ|duy|nào|đâu|trôi|vô)\s*[.…]?$/i.test(t);
}
function buildFallbackPov3V2Tagline(item) {
  const name = String(item?.name || "\u0111\u1ECBa \u0111i\u1EC3m n\xE0y").trim();
  const section = String(item?.sourceSectionKey || "").trim();
  if (section === "check_in") {
    return `${name} l\xE0 g\xF3c check-in n\u1ED5i b\u1EADt \u1EDF \u0110\xE0 L\u1EA1t, d\u1EC5 ch\u1EE5p v\xE0 d\u1EC5 gh\xE9p v\xE0o l\u1ECBch \u0111i.`;
  }
  if (section === "khu_du_lich" || section === "hoat_dong") {
    return `${name} \u2014 \u0111i\u1EC3m tham quan \u0111\xE1ng gh\xE9 n\u1EBFu b\u1EA1n th\xEDch view r\u1ED9ng v\xE0 kh\xF4ng gian chill.`;
  }
  return `Gh\xE9 ${name} n\u1EBFu mu\u1ED1n th\xEAm m\u1ED9t \u0111i\u1EC3m d\u1EEBng g\u1ECDn trong chuy\u1EBFn \u0111i \u0110\xE0 L\u1EA1t.`;
}
function highlightLooksTruncated(raw) {
  const t = String(raw || "").replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (!/[.!?…]$/.test(t)) return true;
  return /\s+(?:khi|va|và|của|cho|với|mà|nên|để|trong|tại|ở|là|còn|như|nếu|sau|trước)$/i.test(t);
}
function finalizePov3V2StackTagline(item) {
  const label = String(item.label || "").trim();
  const note = String(item.imageNote || "").trim();
  const raw = (label && !isImageMappingNote(label) ? label : "") || (note && !isImageMappingNote(note) ? note : "");
  if (highlightLooksTruncated(raw)) {
    return truncatePov3V2StackTagline(buildFallbackPov3V2Tagline(item));
  }
  const fromHighlight = truncatePov3V2StackTagline(raw);
  if (isCompletePov3V2Tagline(fromHighlight)) return fromHighlight;
  return truncatePov3V2StackTagline(buildFallbackPov3V2Tagline(item));
}
function pov3V2StackTagline(item) {
  return finalizePov3V2StackTagline(item);
}
function renderPov3V2StackRow(item) {
  const address = String(item.metaPrimary || "").trim();
  const taglineTextRaw = pov3V2StackTagline(item);
  const taglineText = taglineTextRaw ? taglineTextRaw.startsWith("[") ? taglineTextRaw : `[ ${taglineTextRaw.replace(/^[\[(\s]+|[\]\)\s]+$/g, "")} ]` : "";
  return `
    <section class="pov-3-v2-stack-row${pov3V2StackRowFocusClass(item)} ${escapeHtml(imageSourceClass(item))}">
      ${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}
      <div class="pov-3-v2-stack-shade"></div>
      <div class="pov-3-v2-stack-copy">
        <h3 class="pov-3-v2-stack-name">${escapeHtml(item.name)}</h3>
        ${address ? `<p class="pov-3-v2-stack-meta">${escapeHtml(address)}</p>` : ""}
        ${taglineText ? `<p class="pov-3-v2-stack-tagline">${escapeHtml(taglineText)}</p>` : ""}
      </div>
    </section>
  `;
}
function renderPov3V2StackPage(page, index, listId) {
  const items = (page.items || []).slice(0, 3);
  return `
    <article class="${escapeHtml(storyPageClass(listId, "pov-3-v2-stack-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText || "stack")}.png">
      <div class="pov-3-v2-stack-feed">
        ${items.map((item) => renderPov3V2StackRow(item)).join("")}
      </div>
    </article>
  `;
}
function renderPov3V2GridLabel(item) {
  const address = cleanGridAddress(item.metaPrimary);
  const showAddress = address && address.toLowerCase() !== "\u0111ang c\u1EADp nh\u1EADt";
  return `
    <div class="pov-3-v2-grid-name">${escapeHtml(item.name)}</div>
    ${showAddress ? `<div class="pov-3-v2-grid-address">${escapeHtml(address)}</div>` : ""}
  `;
}
function renderPov3V2GridPage(page, index, listId, pageSubtitle) {
  const items = (page.items || []).slice(0, 9);
  const panelTitle = page.title || pageSubtitle || page.chipText || "";
  const backgroundImage = page.backgroundImage || items[0]?.imageUrl || "";
  return `
    <article class="${escapeHtml(storyPageClass(listId, "pov-3-v2-grid-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText || "grid")}.png">
      <div class="pov-3-v2-grid-bg">
        ${renderPreviewImage(backgroundImage, panelTitle)}
      </div>
      <div class="pov-3-v2-grid-panel">
        <h2 class="pov-3-v2-grid-title">"${escapeHtml(panelTitle)}"</h2>
        <div class="pov-3-v2-grid-matrix">
          ${items.map((item) => `
            <div class="pov-3-v2-grid-cell ${escapeHtml(imageSourceClass(item))}">
              <div class="pov-3-v2-grid-thumb">
                ${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}
              </div>
              <div class="pov-3-v2-grid-label">
                ${renderPov3V2GridLabel(item)}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    </article>
  `;
}
function renderPovMaikemPage(page, index, listId) {
  const items = (page.items || []).slice(0, 3);
  return `
    <article class="${escapeHtml(storyPageClass(listId, "pov-maikem-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText)}.png">
      <div class="pov-maikem-feed">
        ${items.map((item) => {
    const price = cafeLightPrice(item);
    const meta = [item.metaPrimary, price].filter(Boolean).join(" \xB7 ");
    return `
          <section class="pov-maikem-slide ${escapeHtml(imageSourceClass(item))}">
            ${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}
            <div class="pov-maikem-slide-shade"></div>
            <div class="pov-maikem-slide-copy">
              <strong class="pov-maikem-slide-title">${escapeHtml(item.name)}</strong>
              ${meta ? `<p class="pov-maikem-slide-meta">${escapeHtml(meta)}</p>` : ""}
            </div>
          </section>
        `;
  }).join("")}
      </div>
    </article>
  `;
}
function renderBudgetWalletCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
  const titleParts = String(coverTitle || "").split("\xB7").map((part) => part.trim()).filter(Boolean);
  const subtitleParts = String(coverSubtitle || "").split("\xB7").map((part) => part.trim()).filter(Boolean);
  const mainTitle = titleParts[0] || coverTitle || "4N3\u0110 \u0110\xC0 L\u1EA0T";
  const hookLine = titleParts[1] || subtitleParts[0] || "M\u1EDE V\xCD ~4.2TR";
  const subLine = subtitleParts.length > 1 ? subtitleParts.slice(1).join(" \xB7 ") : titleParts.length > 1 ? "" : subtitleParts.slice(1).join(" \xB7 ");
  return `
    <article class="${escapeHtml(storyPageClass(listId, "budget-wallet-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
      <div class="budget-wallet-cover-bg">
        ${renderPreviewImage(backgroundImage, coverTitle)}
      </div>
      <div class="budget-wallet-cover-shade"></div>
      <div class="budget-wallet-cover-copy">
        <div class="budget-wallet-script">dalat.</div>
        <h1 class="budget-wallet-title">${escapeHtml(mainTitle)}</h1>
        <h2 class="budget-wallet-hook">${escapeHtml(hookLine)}</h2>
        ${subLine ? `<p class="budget-wallet-sub">${escapeHtml(subLine)}</p>` : ""}
      </div>
    </article>
  `;
}
function renderBudgetWalletDayPage(page, index, listId, list) {
  const items = (page.items || []).slice(0, 7);
  const thumbs = items.filter((item) => item.imageUrl).slice(0, 3);
  return `
    <article class="${escapeHtml(storyPageClass(listId, "budget-wallet-day"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText || "ngay")}.png">
      <section class="budget-wallet-slip">
        <header class="budget-wallet-slip-head">
          <div>
            <span>${escapeHtml(String(page.chipText || "").toUpperCase())}</span>
            <h2>${escapeHtml(page.title || "")}</h2>
          </div>
          <span class="budget-wallet-slip-total">${escapeHtml(page.subtitle || "")}</span>
        </header>
        <div class="budget-wallet-lines">
          ${items.map((item) => {
    const { time } = budgetStoryParts(item);
    return `
              <article class="budget-wallet-line">
                <span>${escapeHtml(time)}</span>
                <strong>${escapeHtml(budgetStoryDisplayTitle(item.name))}</strong>
                <em>${escapeHtml(item.metaSecondary || "")}</em>
              </article>
            `;
  }).join("")}
        </div>
        ${thumbs.length > 0 ? `
          <div class="budget-wallet-thumbs">
            ${thumbs.map((item) => `
              <div class="budget-wallet-thumb">${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}</div>
            `).join("")}
          </div>
        ` : ""}
      </section>
    </article>
  `;
}
function renderBudgetWalletFixedPage(page, index, listId) {
  return `
    <article class="${escapeHtml(storyPageClass(listId, "budget-wallet-fixed"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-phi-co-dinh.png">
      <section class="budget-wallet-fixed-panel">
        <span>${escapeHtml(page.chipText || "")}</span>
        <h2>${escapeHtml(page.title || "")}</h2>
        <p>${escapeHtml(page.subtitle || "")}</p>
        <div class="budget-wallet-lines">
          ${(page.items || []).map((item) => `
            <article class="budget-wallet-line">
              <span>${escapeHtml(item.label || "")}</span>
              <strong>${escapeHtml(item.name || "")}</strong>
              <em>${escapeHtml(item.metaSecondary || "")}</em>
            </article>
          `).join("")}
        </div>
      </section>
    </article>
  `;
}
function renderBudgetWalletBillPage(page, index, listId) {
  const items = page.items || [];
  const total = items.find((item) => /tong|total/i.test(String(item.id || ""))) || items[items.length - 1] || {};
  return `
    <article class="${escapeHtml(storyPageClass(listId, "budget-wallet-bill"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-bill.png">
      <section class="budget-wallet-bill-panel">
        <span>${escapeHtml(String(page.chipText || "BILL").toUpperCase())}</span>
        <h2>${escapeHtml(page.title || "BILL 4N3\u0110")}</h2>
        <div class="budget-wallet-lines">
          ${items.filter((item) => !/tong|total/i.test(String(item.id || ""))).map((item) => `
            <article class="budget-wallet-line">
              <span></span>
              <strong>${escapeHtml(item.name || "")}</strong>
              <em>${escapeHtml(item.metaSecondary || "")}</em>
            </article>
          `).join("")}
        </div>
        <div class="budget-wallet-bill-final">
          <span>T\u1ED5ng bill</span>
          <strong>${escapeHtml(total.metaSecondary || "~4.2tr")}</strong>
        </div>
      </section>
    </article>
  `;
}
function renderCoverPageV2(page, index, listId, coverTitle, coverSubtitle, backgroundImage, coverImageUrls = []) {
  if (page.layoutVariant === "grid-8-feed") {
    return renderGrid8FeedCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage, coverImageUrls);
  }
  if (page.layoutVariant === "itinerary-4n3d-stack-cover") {
    return renderItinerary4N3DStackCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage, coverImageUrls);
  }
  if (page.layoutVariant === "itinerary-timeline-cover") {
    return renderItineraryTimelineCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage);
  }
  if (page.layoutVariant === "grid-6-quaytung-cover") {
    return renderGrid6QuaytungCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage);
  }
  if (page.layoutVariant === "grid-8-quaytung-cover") {
    return renderGrid8QuaytungCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage);
  }
  if (page.layoutVariant === "grid-5") {
    return renderGrid5Cover(page, index, listId, coverTitle, coverSubtitle, backgroundImage);
  }
  if (page.layoutVariant === "spotlight-v2" || page.layoutVariant === "spotlight-v3") {
    return renderSpotlightV2Cover(page, index, listId, coverTitle, coverSubtitle, backgroundImage, { coverImageUrls });
  }
  if (page.layoutVariant === "spotlight-partner-v2") {
    return renderSpotlightV2Cover(page, index, listId, coverTitle, coverSubtitle, backgroundImage, { partner: true, coverImageUrls });
  }
  if (page.layoutVariant === "pov-maikem") {
    return renderPovMaikemCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage);
  }
  if (page.layoutVariant === "pov-3-v2-cover") {
    return renderPov3V2Cover(page, index, listId, page.title || coverTitle, coverSubtitle, backgroundImage);
  }
  if (page.layoutVariant === "budget-wallet-cover") {
    return renderBudgetWalletCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage);
  }
  return "";
}
function renderListPageV2(page, index, listId, list, pageSubtitle) {
  if (page.layoutVariant === "grid-8-feed") {
    const centerHook = grid8FeedCenterHook(page, list);
    const showAddress = !isActivityListPage(page);
    const backgroundImage = page.backgroundImage || page.items?.[0]?.imageUrl || coverBackgroundImage(page, list);
    const coverImageUrls = list?.coverImageUrls || [];
    return `
      <article class="${escapeHtml(storyPageClass(listId, "grid8-feed-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText)}.png">
        ${renderGrid8FeedPageBackground(page, backgroundImage, listId, coverImageUrls)}
        <div class="grid8-feed-page-dim" aria-hidden="true"></div>
        <div class="grid8-feed-matrix">
          ${renderGrid8FeedItems(page.items, centerHook, showAddress)}
        </div>
      </article>
    `;
  }
  if (page.layoutVariant === "grid-6-quaytung") {
    return `
      <article class="${escapeHtml(storyPageClass(listId, "grid6-quaytung-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText)}.png">
        ${renderGrid6QuaytungPageBody(page, page.items)}
      </article>
    `;
  }
  if (page.layoutVariant === "grid-8-quaytung") {
    const bg = page.backgroundImage || page.items?.[0]?.imageUrl || coverBackgroundImage(page, list);
    return `
      <article class="${escapeHtml(storyPageClass(listId, "grid8-quaytung-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText)}.png">
        <div class="grid8-quaytung-matrix">
          ${renderGrid8QuaytungItems(page, page.items, bg)}
        </div>
      </article>
    `;
  }
  if (page.layoutVariant === "grid-8-quaytung-menu") {
    return renderGrid8QuaytungMenuPage(page, index, listId, list);
  }
  if (page.layoutVariant === "grid-5") {
    return renderGrid5Page(page, index, listId, pageSubtitle, list);
  }
  if (page.layoutVariant === "spotlight-v2" || page.layoutVariant === "spotlight-v3") {
    return renderSpotlightV2Page(page, index, listId, list);
  }
  if (page.layoutVariant === "spotlight-partner-v2") {
    return renderSpotlightPartnerV2Page(page, index, listId, list);
  }
  if (page.layoutVariant === "spotlight-v2-list") {
    return renderSpotlightV2ListPage(page, index, listId, list, pageSubtitle);
  }
  if (page.layoutVariant === "spotlight-partner-v2-info") {
    return renderSpotlightPartnerV2InfoPage(page, index, listId, list);
  }
  if (page.layoutVariant === "pov-maikem") {
    return renderPovMaikemPage(page, index, listId);
  }
  if (page.layoutVariant === "pov-3-v2-stack") {
    return renderPov3V2StackPage(page, index, listId);
  }
  if (page.layoutVariant === "pov-3-v2-grid" || page.layoutVariant === "pov-3-v2-grid-food") {
    return renderPov3V2GridPage(page, index, listId, pageSubtitle);
  }
  if (page.layoutVariant === "itinerary-4n3d-stack-page") {
    return renderItinerary4N3DStackPage(page, index, listId, pageSubtitle);
  }
  if (page.layoutVariant === "itinerary-timeline-day") {
    return renderItineraryTimelineDay(page, index, listId);
  }
  if (page.layoutVariant === "budget-wallet-day") {
    return renderBudgetWalletDayPage(page, index, listId, list);
  }
  if (page.layoutVariant === "budget-wallet-fixed") {
    return renderBudgetWalletFixedPage(page, index, listId);
  }
  if (page.layoutVariant === "budget-wallet-bill") {
    return renderBudgetWalletBillPage(page, index, listId);
  }
  return "";
}
function renderCoverPage(page, index, total, listId, hashtags = [], list = null, coverImageUrls = []) {
  const coverSubtitle = sanitizeSubtitleForDisplay(page.subtitle, list?.pages || []);
  const coverTitle = polishShortVietnameseCopy(page.title);
  const backgroundImage = coverBackgroundImage(page, list);
  if (page.layoutVariant === "grid-5") {
    return renderGrid5Cover(page, index, listId, coverTitle, coverSubtitle, backgroundImage);
  }
  if (V2_COVER_VARIANTS.has(page.layoutVariant)) {
    const v2Html = renderCoverPageV2(page, index, listId, coverTitle, coverSubtitle, backgroundImage, coverImageUrls);
    if (v2Html) return v2Html;
  }
  if (page.layoutVariant === "grid-6-zigzag") {
    return renderZigzagCover(page, index, listId);
  }
  if (page.layoutVariant === "grid-4-mutant") {
    return renderGrid4MutantCover(page, index, listId);
  }
  if (isBudget3N2DCover(page)) {
    const title = coverTitle || '"72H" \u1EDE \u0110\xC0 L\u1EA0T V\u1EDAI 3TR';
    return `
      <article class="${escapeHtml(storyPageClass(listId, "budget72-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
        <div class="budget72-cover-bg">
          ${renderPreviewImage(backgroundImage, title)}
        </div>
        <div class="budget72-cover-shade"></div>
        <div class="budget72-cover-copy">
          <div class="budget72-script">dalat.</div>
          <h1 class="budget72-title">${escapeHtml(title)}</h1>
          <p class="budget72-subtitle">${escapeHtml(coverSubtitle || "/G\u1EE3i \xFD l\u1ECBch tr\xECnh du h\xED 3N2\u0110/")}</p>
        </div>
      </article>
    `;
  }
  if (isBudget3N2DStoryCover(page)) {
    const title = cleanStoryText(coverTitle, BUDGET72_STORY_TEXT.coverTitle);
    const subtitle = cleanStoryText(coverSubtitle, BUDGET72_STORY_TEXT.coverSubtitle);
    return `
      <article class="${escapeHtml(storyPageClass(listId, "budget72-story-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
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
    const coverClass = isSpotlightPartnerCover(page) ? "spotlight-cover spotlight-partner-cover" : "spotlight-cover";
    return `
      <article class="${escapeHtml(storyPageClass(listId, "grid4-feature-cover", coverClass))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
        <div class="grid4-feature-bg">
          ${renderPreviewImage(backgroundImage, coverTitle)}
        </div>
        <div class="grid4-feature-shade"></div>
        <div class="grid4-feature-copy">
          ${isSpotlightPartnerCover(page) ? `<div class="spotlight-partner-cover-script">dalat.</div>` : ""}
          ${isSpotlightPartnerCover(page) ? `<h1 class="grid4-feature-title">${escapeHtml(coverTitle || "")}</h1>` : ""}
          ${coverSubtitle ? `<p class="grid4-feature-subtitle spotlight-cover-caption">${escapeHtml(coverSubtitle)}</p>` : ""}
        </div>
      </article>
    `;
  }
  if (isJourneyGrid8Layout(page)) {
    return `
      <article class="${escapeHtml(storyPageClass(listId, "grid8-cover-page", "journey-grid8-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
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
  if (page.layoutVariant === "grid-8") {
    return `
      <article class="${escapeHtml(storyPageClass(listId, "grid8-cover-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
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
    const gridVariantClass = page.layoutVariant === "grid-4" ? " grid4-cover" : page.layoutVariant === "grid-8" ? " grid8-cover" : "";
    return `
      <article class="${escapeHtml(storyPageClass(listId, "grid6-cover", gridVariantClass.trim()))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
        <div class="grid6-cover-bg">
          ${renderPreviewImage(backgroundImage, coverTitle)}
        </div>
        <div class="grid6-cover-overlay">
           <div class="grid6-cover-header">\u0110\xC0 L\u1EA0T</div>
           <h1 class="grid6-cover-title">${escapeHtml(coverTitle)}</h1>
            <div class="grid6-cover-subtitle">${escapeHtml(coverSubtitle)}</div>
        </div>
      </article>
    `;
  }
  if (page.layoutVariant === "journey-4n3d") {
    return `
      <article class="${escapeHtml(storyPageClass(listId, "journey-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
        <div class="journey-cover-photo">
          ${renderPreviewImage(backgroundImage, coverTitle)}
        </div>
        <div class="journey-cover-panel">
          <div class="journey-cover-kicker">L\u1ECACH TR\xCCNH 4N3\u0110</div>
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
  if (page.layoutVariant === "photomode") {
    return `
      <article class="${escapeHtml(storyPageClass(listId, "photomode", "photomode-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
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
  const hashtagClass = Array.isArray(hashtags) && hashtags.length > 0 ? " has-inline-hashtags" : "";
  return `
    <article class="${escapeHtml(storyPageClass(listId, hashtagClass.trim()))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
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
function renderListItems(items) {
  return items.map((item) => `
    <div class="item-row">
      <div class="thumb-block ${escapeHtml(item.imageSource || (item.imageMapped ? "manual" : "fallback"))}">
        ${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}
      </div>
      <div class="item-copy">
        ${item.label ? `<div class="item-label">${escapeHtml(item.label)}</div>` : ""}
        <div class="item-name story-image-title">${escapeHtml(item.name)}</div>
        <p class="item-meta story-image-meta">${escapeHtml(item.metaPrimary)}</p>
        ${(() => {
    const secondary = gridPriceMetaFromSecondary(item.metaSecondary);
    return secondary ? `<p class="item-meta story-image-meta secondary">${escapeHtml(secondary)}</p>` : "";
  })()}
        <div class="mapping-chip compact ${escapeHtml(item.imageSource || (item.imageMapped ? "manual" : "fallback"))}">
          ${item.imageSource === "manual" ? "\u0110\xFAng \u1EA3nh" : item.imageSource === "auto" ? "T\u1EF1 map" : "Minh h\u1ECDa"}
        </div>
      </div>
    </div>
  `).join("");
}
function renderPhotomodePin() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" class="photomode-pin-icon">
      <path fill="currentColor" d="M12 2.25a7.25 7.25 0 0 0-7.25 7.25c0 5.29 5.42 10.74 6.57 11.84a.98.98 0 0 0 1.36 0c1.15-1.1 6.57-6.55 6.57-11.84A7.25 7.25 0 0 0 12 2.25Zm0 9.5a2.25 2.25 0 1 1 0-4.5a2.25 2.25 0 0 1 0 4.5Z"/>
    </svg>
  `;
}
function cleanGridAddress(value) {
  return String(value || "").replace(/^\s*\(?\s*(?:\+?84|0|1900|1800)(?:[\s.-]?\d){3,11}\s*\)?\s*/g, "").replace(/\s*\((?:\+?84|0|1900|1800)(?:[\s.-]?\d){3,11}\)\s*/g, " ").replace(/^\s*(đường|duong|đ\.|hẻm|hem|dốc|doc)\s+/i, "").replace(/(^|\s)(đường|duong|đ\.)\s+/gi, "$1").replace(/\s+/g, " ").trim();
}
function renderGridAddress(value) {
  const cleanAddress = cleanGridAddress(value);
  if (!cleanAddress) {
    return "";
  }
  return `
    <div class="grid6-address story-image-meta">
      <span class="grid6-address-pin">${renderPhotomodePin()}</span>
      <span class="grid6-address-text">${escapeHtml(cleanAddress)}</span>
    </div>
  `;
}
function renderGridSecondary(value) {
  const cleanValue = gridPriceMetaFromSecondary(value);
  if (!cleanValue) return "";
  return `
    <div class="grid6-address grid6-address-extra story-image-meta">
      <span class="grid6-address-text">${escapeHtml(cleanValue)}</span>
    </div>
  `;
}
function renderSpotlightMetaLine(value, className = "") {
  const cleanValue = String(value || "").replace(/\s+/g, " ").trim();
  if (!cleanValue) return "";
  return `
    <div class="spotlight-meta ${escapeHtml(className)}">
      <span class="spotlight-pin">${renderPhotomodePin()}</span>
      <span>${escapeHtml(cleanValue)}</span>
    </div>
  `;
}
function spotlightV2AddressLine(item) {
  return String(item?.metaPrimary || "").replace(/\s+/g, " ").trim();
}
function spotlightV2PriceLine(item) {
  const secondary = String(item?.metaSecondary || "").replace(/\s+/g, " ").trim();
  if (!secondary) return "";
  const match = secondary.match(/Giá:\s*([^·]+)/i);
  if (!match) return "";
  const price = String(match[1] || "").trim();
  return price ? `Gi\xE1: ${price}` : "";
}
function spotlightV2HoursLine(item) {
  const secondary = String(item?.metaSecondary || "").replace(/\s+/g, " ").trim();
  if (!secondary) return "";
  const labeledHours = secondary.match(/^(Khung giờ|Open|Hoạt động):\s*(.+)$/i);
  if (labeledHours) {
    const label = labeledHours[1].toLowerCase() === "khung gi\u1EDD" ? "Open" : labeledHours[1];
    const hours = labeledHours[2].split("\xB7")[0].trim();
    return hours ? `${label}: ${hours}` : "";
  }
  const embeddedHours = secondary.match(/(?:Khung giờ|Open|Hoạt động):\s*([^·]+)/i);
  if (embeddedHours) {
    const token = embeddedHours[0].trim();
    if (/^open:/i.test(token) || /^hoạt động:/i.test(token)) return token;
    const hours = embeddedHours[1].trim();
    return hours ? `Open: ${hours}` : "";
  }
  if (/(giá|sđt|liên hệ):/i.test(secondary)) return "";
  const fallback = secondary.split("\xB7")[0].trim();
  return fallback ? `Open: ${fallback}` : "";
}
function spotlightTitleFitClass(value) {
  const length = String(value || "").trim().length;
  if (length >= 28) return "spotlight-title-fit-xs";
  if (length >= 23) return "spotlight-title-fit-sm";
  if (length >= 18) return "spotlight-title-fit-md";
  return "";
}
function renderSpotlightPage(page, index, listId, list, pageSubtitle) {
  const item = page.items?.[0] || {};
  const backgroundImage = item.imageUrl || page.backgroundImage || coverBackgroundImage(page, list);
  const positionClass = spotlightPositionClass(page, index, item);
  const titleText = item.rawName || item.name || page.title || "";
  const titleFitClass = spotlightTitleFitClass(titleText);
  return `
    <article class="${escapeHtml(storyPageClass(listId, "spotlight-page", positionClass))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText || item.name || "spotlight")}.png">
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
  const exportLabel = item.rawName || item.name || page.title || "partner";
  return `
    <article class="${escapeHtml(storyPageClass(listId, "spotlight-page spotlight-partner-page spotlight-partner-photo-only"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(exportLabel)}.png">
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
    const isHomestay = item.sourceSectionKey === "homestay";
    const metaSecondary = showSecondary ? gridPriceMetaFromSecondary(item.metaSecondary) || (isHomestay && item.price ? `Gi\xE1: ${item.price}` : "") : "";
    return `
    <article class="spotlight-list-row ${escapeHtml(imageSourceClass(item))}">
      <div class="spotlight-list-thumb">
        ${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}
      </div>
      <div class="spotlight-list-copy">
        ${showLabels && item.label ? `<span class="spotlight-list-label">${escapeHtml(item.label)}</span>` : ""}
        <strong class="story-image-title">${escapeHtml(item.rawName || item.name || "")}</strong>
        ${renderSpotlightMetaLine(item.metaPrimary)}
        ${renderSpotlightMetaLine(metaSecondary, "secondary")}
      </div>
    </article>
  `;
  }).join("");
}
function renderSpotlightV2ListPage(page, index, listId, list, pageSubtitle) {
  const backgroundImage = page.backgroundImage || firstPortablePageImage(page) || coverBackgroundImage(page, list);
  const showItemLabels = !isStayListPage(page);
  const heading = spotlightV2ListHeading(page);
  return `
    <article class="${escapeHtml(storyPageClass(listId, "spotlight-v2-list-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText || page.title || "list")}.png">
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
    <article class="${escapeHtml(storyPageClass(listId, "spotlight-list-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText || page.title || "list")}.png">
      <div class="spotlight-bg">
        ${renderPreviewImage(backgroundImage, page.title)}
      </div>
      <div class="spotlight-list-shade"></div>
      <div class="spotlight-list-panel">
        <div class="spotlight-list-heading">
          <span>${escapeHtml(page.chipText || "")}</span>
          <h2>${escapeHtml(page.title || "")}</h2>
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
      <span>${escapeHtml(item.label || "")}</span>
      <strong>${escapeHtml(item.metaPrimary || item.name || "")}</strong>
    </article>
  `).join("");
  return `
    <article class="${escapeHtml(storyPageClass(listId, "spotlight-list-page spotlight-partner-info-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-thong-tin.png">
      <div class="spotlight-bg">
        ${renderPreviewImage(backgroundImage, page.title)}
      </div>
      <div class="spotlight-list-shade"></div>
      <div class="spotlight-partner-info-panel">
        <div class="spotlight-partner-info-stack">
          ${itemRows}
        </div>
        <div class="spotlight-partner-info-cta">L\u01B0u l\u1EA1i khi c\u1EA7n cho chuy\u1EBFn \u0110\xE0 L\u1EA1t t\u1EDBi.</div>
      </div>
    </article>
  `;
}
function renderSpotlightPartnerV2InfoPage(page, index, listId, list) {
  const backgroundImage = page.backgroundImage || firstPortablePageImage(page) || coverBackgroundImage(page, list);
  const itemRows = (page.items || []).map((item) => `
    <article class="spotlight-partner-v2-info-row">
      <span>${escapeHtml(item.label || "")}</span>
      <strong>${escapeHtml(item.metaPrimary || item.name || "")}</strong>
    </article>
  `).join("");
  return `
    <article class="${escapeHtml(storyPageClass(listId, "spotlight-partner-v2-info-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-thong-tin.png">
      <div class="spotlight-v2-bg">
        ${renderPreviewImage(backgroundImage, page.title)}
      </div>
      <div class="spotlight-v2-shade"></div>
      <div class="spotlight-v2-info-band">
        ${page.title ? `<h2 class="spotlight-v2-info-title">${escapeHtml(page.title)}</h2>` : ""}
        <div class="spotlight-partner-v2-info-stack">
          ${itemRows}
        </div>
        <p class="spotlight-v2-cta">L\u01B0u \u0111\u1EC3 \u0111\u1EB7t / inbox khi c\u1EA7n</p>
      </div>
    </article>
  `;
}
function budgetTableParts(item) {
  const parts = String(item?.label || "").split("|");
  return {
    day: parts[0] || "",
    time: parts[1] || ""
  };
}
function budget72CostDisplay(value) {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  if (/^free$/i.test(raw) || /miễn\s*phí/i.test(raw)) return "Free";
  let text = raw.replace(/(?:Khung giờ|Open|Hoạt động):\s*[^·]+(?:\s*·\s*)?/gi, "").replace(/^Giá:\s*/i, "").trim();
  const inlinePrice = text.match(/Giá:\s*([^·]+)/i);
  if (inlinePrice) return inlinePrice[1].trim();
  const segments = text.split("\xB7").map((part) => part.trim()).filter(Boolean);
  if (segments.length > 1) {
    const priceSegment = segments.find((part) => /~?\d/.test(part) && /(?:k|tr|đ\b)/i.test(part));
    if (priceSegment) return priceSegment.replace(/^Giá:\s*/i, "").trim();
  }
  return text.replace(/^·\s*/, "").trim();
}
function renderBudget3N2DTableRows(items) {
  let lastDay = "";
  return (items || []).filter((item) => !String(item.label || "").startsWith("T\u1ED5ng|")).map((item) => {
    const { day, time } = budgetTableParts(item);
    const showDay = day && day !== lastDay;
    lastDay = day || lastDay;
    return `
        <tr>
          <td class="budget72-day">${showDay ? escapeHtml(day) : ""}</td>
          <td class="budget72-time">${escapeHtml(time)}</td>
          <td class="budget72-activity">${escapeHtml(item.name || "")}</td>
          <td class="budget72-address">${escapeHtml(item.metaPrimary || "")}</td>
          <td class="budget72-cost">${escapeHtml(budget72CostDisplay(item.metaSecondary))}</td>
        </tr>
      `;
  }).join("");
}
function renderBudget3N2DSummaryRows(items) {
  return (items || []).filter((item) => String(item.label || "").startsWith("T\u1ED5ng|")).filter((item) => item.id !== "budget-3n2d-main-summary-total").map((item) => `
      <tr>
        <td>${escapeHtml(item.name || "")}</td>
        <td>${escapeHtml(item.metaSecondary || "")}</td>
        <td>${escapeHtml(item.metaPrimary || "")}</td>
      </tr>
    `).join("");
}
function budget3N2DTotalItem(items) {
  return (items || []).find((item) => String(item.label || "").startsWith("T\u1ED5ng|") && /tong|total/i.test(String(item.id || ""))) || (items || []).filter((item) => String(item.label || "").startsWith("T\u1ED5ng|")).slice(-1)[0] || null;
}
function renderBudget3N2DTablePage(page, index, listId) {
  const totalItem = budget3N2DTotalItem(page.items);
  const totalValue = String(totalItem?.metaSecondary || "").trim() || "~0k";
  return `
    <article class="${escapeHtml(storyPageClass(listId, "budget72-table-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-bang-chi-phi.png">
      <div class="budget72-table-shell">
        <h2>${escapeHtml(page.title || "\u0110\xC0 L\u1EA0T 3 NG\xC0Y 2 \u0110\xCAM")}</h2>
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
              <th class="budget72-day">Ng\xE0y</th>
              <th class="budget72-time">Th\u1EDDi gian</th>
              <th class="budget72-activity">Ho\u1EA1t \u0111\u1ED9ng</th>
              <th class="budget72-address">\u0110\u1ECBa ch\u1EC9</th>
              <th class="budget72-cost">Chi ph\xED</th>
            </tr>
          </thead>
          <tbody>
            ${renderBudget3N2DTableRows(page.items)}
          </tbody>
        </table>
        <table class="budget72-summary-table">
          <thead>
            <tr>
              <th>T\xEAn m\u1EE5c</th>
              <th>Chi ph\xED</th>
              <th>Chi ti\u1EBFt</th>
            </tr>
          </thead>
          <tbody>
            ${renderBudget3N2DSummaryRows(page.items)}
          </tbody>
        </table>
        <div class="budget72-total-bar">
          <span>T\u1ED5ng thanh to\xE1n d\u1EF1 ki\u1EBFn</span>
          <strong>${escapeHtml(totalValue)}</strong>
        </div>
      </div>
    </article>
  `;
}
function budgetGalleryMetaText(item) {
  const primary = String(item?.metaPrimary || "").replace(/\s+/g, " ").trim();
  const secondary = String(item?.metaSecondary || "").replace(/\s+/g, " ").trim();
  const combined = `${primary} ${secondary}`.trim();
  const hoursMatch = combined.match(/Khung gi(?:ờ|á»):\s*([^·]+)/i);
  if (hoursMatch?.[1]) {
    return `Khung gi\u1EDD: ${hoursMatch[1].trim()}`;
  }
  if (/^Khung gi(?:ờ|á»):/i.test(secondary)) {
    return secondary.replace(/\s*·.*$/, "").trim();
  }
  return "";
}
function renderBudget3N2DGalleryCorner(item, cornerIndex) {
  const secondary = budgetGalleryMetaText(item);
  return `
    <article class="budget72-corner-card budget72-corner-${cornerIndex + 1} ${escapeHtml(imageSourceClass(item))}">
      ${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}
      <div class="budget72-corner-copy">
        <div class="budget72-corner-topline">
          <span class="budget72-gallery-index">${String(cornerIndex + 1).padStart(2, "0")}</span>
          ${item.label ? `<span class="budget72-gallery-label">${escapeHtml(item.label)}</span>` : ""}
          ${item.isPartner ? '<span class="budget72-gallery-partner">\u0110\u1ED1i t\xE1c</span>' : ""}
        </div>
        <strong class="story-image-title">${escapeHtml(item.rawName || item.name || "")}</strong>
        <div class="budget72-corner-meta">
          ${secondary ? `<div class="budget72-gallery-price">${escapeHtml(secondary)}</div>` : ""}
        </div>
      </div>
    </article>
  `;
}
function renderBudget3N2DGalleryCornerPage(page, index, listId, list) {
  const items = Array.isArray(page.items) ? page.items.slice(0, 4) : [];
  const backgroundImage = page.backgroundImage || firstPortablePageImage(page) || coverBackgroundImage(page, list);
  return `
    <article class="${escapeHtml(storyPageClass(listId, "budget72-gallery-page budget72-corner-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText || page.title || "gallery")}.png">
      <div class="budget72-gallery-backdrop">
        ${renderPreviewImage(backgroundImage, page.title)}
      </div>
      <div class="budget72-gallery-shell">
        <div class="budget72-corner-grid">
          ${items.map((item, cornerIndex) => renderBudget3N2DGalleryCorner(item, cornerIndex)).join("")}
        </div>
        <section class="budget72-gallery-center">
          <span>dalat.</span>
          <h2>${escapeHtml(page.title || "")}</h2>
          <p>${escapeHtml(page.subtitle || "G\u1EE3i \xFD nhanh \u0111\u1EC3 l\u01B0u l\u1EA1i v\xE0 ch\u1ECDn \u0111i\u1EC3m gh\xE9 h\u1EE3p l\u1ECBch.")}</p>
        </section>
      </div>
    </article>
  `;
}
function budgetStoryParts(item) {
  const parts = String(item?.label || "").split("|");
  return {
    day: parts[0] || "",
    time: parts[1] || ""
  };
}
function budgetStoryActivityTitle(value) {
  return String(value || "").replace(/^\s*(Ăn sáng|Ăn trưa|Ăn tối|Cà phê chiều|Cà phê|Check-in|Chơi đêm|Mua quà|Hoạt động)\s*:\s*/i, "").replace(/\s+/g, " ").trim();
}
function budgetStoryActivityType(value) {
  const clean = String(value || "").trim();
  const match = clean.match(/^\s*([^:]{2,24})\s*:/);
  return match?.[1]?.trim() || "\u0110i\u1EC3m gh\xE9";
}
function budgetStoryDisplayTitle(value) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (/di chuy[eể]n b[aằ]ng xe/i.test(clean) || /ph[uươ]ng trang/i.test(clean)) {
    return "Xe SG - \u0110\xE0 L\u1EA1t";
  }
  if (/check\s*out|l[eê]n xe|v[eề]\s+l[aạ]i\s+sg/i.test(clean)) {
    return "V\u1EC1 l\u1EA1i SG";
  }
  return budgetStoryActivityTitle(clean).replace(/^\s*(\u0102n s\u00e1ng|\u0102n tr\u01b0a|\u0102n t\u1ed1i|C\u00e0 ph\u00ea chi\u1ec1u|C\u00e0 ph\u00ea|Check-in|Ch\u01a1i \u0111\u00eam|Mua qu\u00e0|Ho\u1ea1t \u0111\u1ed9ng|D\u1ecbch v\u1ee5|L\u01b0u tr\u00fa|Cafe|\u0102n nh\u1eb9)\s*:\s*/i, "").replace(/\s+/g, " ").trim();
}
function budgetStoryDisplayType(value) {
  const clean = String(value || "").trim();
  if (/di chuy[eể]n b[aằ]ng xe/i.test(clean) || /ph[uươ]ng trang/i.test(clean) || /check\s*out|l[eê]n xe|v[eề]\s+l[aạ]i\s+sg/i.test(clean)) {
    return "Di chuy\u1EC3n";
  }
  const type = budgetStoryActivityType(clean);
  return hasMojibakeText(type) ? "\u0110i\u1EC3m gh\xE9" : type;
}
function renderBudget3N2DDayPage(page, index, listId, list) {
  const items = Array.isArray(page.items) ? page.items.slice(0, 8) : [];
  const hero = items.find((item) => item.imageUrl) || items[0] || {};
  const backgroundImage = hero.imageUrl || page.backgroundImage || coverBackgroundImage(page, list);
  const copy = cleanBudgetStoryDayCopy(page, index);
  return `
    <article class="${escapeHtml(storyPageClass(listId, "budget72-story-day"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(copy.chip || copy.title || "ngay")}.png">
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
    const secondary = gridPriceMetaFromSecondary(item.metaSecondary);
    return `
              <article class="budget72-story-stop">
                <div class="budget72-story-time">${escapeHtml(time)}</div>
                <div class="budget72-story-dot"></div>
                <div class="budget72-story-copy">
                  <span>${escapeHtml(budgetStoryDisplayType(item.name))}</span>
                  <strong>${escapeHtml(budgetStoryDisplayTitle(item.name))}</strong>
                  <p>${escapeHtml(item.metaPrimary || "")}</p>
                  ${secondary ? `<em>${escapeHtml(secondary)}</em>` : ""}
                </div>
              </article>
            `;
  }).join("")}
        </div>
      </section>
    </article>
  `;
}
function renderBudget3N2DTotalPage(page, index, listId, list) {
  const items = Array.isArray(page.items) ? page.items : [];
  const total = items.find((item) => /tong|total/i.test(String(item.id || ""))) || items[items.length - 1] || {};
  const backgroundImage = page.backgroundImage || firstPortablePageImage(page) || coverBackgroundImage(page, list);
  const copy = cleanBudgetStoryTotalCopy(page);
  return `
    <article class="${escapeHtml(storyPageClass(listId, "budget72-story-total"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-tong-chi-phi.png">
      <div class="budget72-story-bg">
        ${renderPreviewImage(backgroundImage, copy.title)}
      </div>
      <div class="budget72-story-total-shade"></div>
      <section class="budget72-total-card">
        <span>${escapeHtml(BUDGET72_STORY_TEXT.total.label)}</span>
        <h2>${escapeHtml(copy.title)}</h2>
        <p>${escapeHtml(copy.subtitle)}</p>
        <div class="budget72-total-list">
          ${items.filter((item) => !/tong|total/i.test(String(item.id || ""))).map((item) => `
            <article>
              <strong>${escapeHtml(item.name || "")}</strong>
              <span>${escapeHtml(item.metaSecondary || "")}</span>
              <p>${escapeHtml(item.metaPrimary || "")}</p>
            </article>
          `).join("")}
        </div>
        <div class="budget72-total-final">
          <span>${escapeHtml(BUDGET72_STORY_TEXT.total.finalLabel)}</span>
          <strong>${escapeHtml(total.metaSecondary || "~2.5tr - 3tr")}</strong>
        </div>
      </section>
    </article>
  `;
}
function normalizeGridText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}
function compactGridItemName(value) {
  const original = String(value || "").replace(/\s+/g, " ").trim();
  const normalized = normalizeGridText(original);
  if (normalized.includes("nha tho domaine de marie")) return "Nh\xE0 th\u1EDD Domain";
  if (normalized.includes("kdl the florest") || normalized.includes("the florest")) return "The Florest";
  if (normalized.includes("truong dai hoc da lat")) return "\u0110H \u0110\xE0 L\u1EA1t";
  if (normalized.includes("doc han thuyen")) return "D\u1ED1c H\xE0n Thuy\xEAn";
  const cleaned = original.replace(/^\s*(Ăn\s+(sáng|trưa|tối)|Cafe|Cà phê|Check-?in|Điểm ghé|Bắt đầu|Chốt chuyến|Dịch vụ|Cần lưu|Cần nhớ|Nên ghé|Buổi sáng|Sáng sớm)\s*:\s*/i, "").replace(/^\s*KDL\s+/i, "").replace(/\s*-\s*(Hoa Trong Rung|Hoa Trong Rừng|Da Lat|Đa Lat|Đà Lạt).*$/i, "").replace(/\s+/g, " ").trim();
  return cleaned;
}
function gridDisplayName(item) {
  return compactGridItemName(item?.rawName || item?.name);
}
function renderPhotomodeItems(items) {
  return items.map((item) => `
    <section class="photomode-item${portraitFocusClass(item)} ${escapeHtml(item.imageSource || (item.imageMapped ? "manual" : "fallback"))}">
      ${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}
      <div class="photomode-copy">
        <div class="photomode-name-row">
          <span class="photomode-pin">${renderPhotomodePin()}</span>
          <h4 class="photomode-name story-image-title">${escapeHtml(item.name)}</h4>
        </div>
        <p class="photomode-meta story-image-meta">
          ${item.label ? `<span class="photomode-label">${escapeHtml(item.label)}</span><span class="photomode-divider"> - </span>` : ""}
          <span class="photomode-address">${escapeHtml(item.metaPrimary)}</span>
        </p>
      </div>
    </section>
  `).join("");
}
function renderGrid6Items(items, { numbered = false, twoDigitNumber = false, showLabel = false, showAddress = true } = {}) {
  return items.map((item, index) => {
    const displayName = gridDisplayName(item);
    const itemNumber = twoDigitNumber ? String(index + 1).padStart(2, "0") : String(index + 1);
    const itemName = numbered ? `${itemNumber}. ${displayName}` : displayName;
    return `
    <div class="grid6-item ${escapeHtml(item.imageSource || (item.imageMapped ? "manual" : "fallback"))}">
      ${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}
      <div class="grid6-overlay">
        ${showLabel && item.label ? `<div class="grid6-service-label">${escapeHtml(item.label)}</div>` : ""}
        <div class="grid6-name story-image-title">${escapeHtml(itemName)}</div>
        ${shouldShowItemAddress(item, showAddress) ? renderGridAddress(item.metaPrimary) : ""}
        ${renderGridSecondary(item.metaSecondary)}
      </div>
    </div>
  `;
  }).join("");
}
function renderGrid8Meta(value) {
  const cleanAddress = cleanGridAddress(value);
  if (!cleanAddress) {
    return "";
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
  const cleanValue = includeOpenHours ? String(value || "").replace(/\s+/g, " ").trim() : gridPriceMetaFromSecondary(value);
  if (!cleanValue) return "";
  return `<div class="grid8-meta grid8-meta-extra story-image-meta"><span>${escapeHtml(cleanValue)}</span></div>`;
}
function journeyGrid8Intro(page) {
  const chip = String(page?.chipText || "").trim().toLowerCase();
  const title = String(page?.title || "").trim().toLowerCase();
  const textKey = `${chip} ${title}`;
  const pageSubtitle = polishShortVietnameseCopy(page?.subtitle || "");
  if (textKey.includes("day 01") || textKey.includes("ng\xE0y 1") || textKey.includes("vao pho") || textKey.includes("v\xE0o ph\u1ED1")) {
    return pageSubtitle || "M\u1ED9t nh\u1ECBp m\u1EDF \u0111\u1EA7u d\u1EC5 \u0111i, \u0111\u1EE7 b\u1EEFa \u0103n, cafe v\xE0 check-in trong ng\xE0y \u0111\u1EA7u.";
  }
  if (textKey.includes("day 02") || textKey.includes("ng\xE0y 2") || textKey.includes("san anh") || textKey.includes("s\u0103n \u1EA3nh")) {
    return pageSubtitle || "\u01AFu ti\xEAn c\xE1c \u0111i\u1EC3m c\xF3 \u1EA3nh \u0111\u1EB9p, di chuy\u1EC3n theo nh\u1ECBp s\xE1ng \u0111\u1EBFn t\u1ED1i.";
  }
  if (textKey.includes("day 03") || textKey.includes("ng\xE0y 3") || textKey.includes("di sau") || textKey.includes("\u0111i s\xE2u")) {
    return pageSubtitle || "Ng\xE0y gi\u1EEFa chuy\u1EBFn \u0111i d\xE0nh cho \u0111i\u1EC3m xa h\u01A1n, tr\u1EA3i nghi\u1EC7m r\xF5 ch\u1EA5t \u0110\xE0 L\u1EA1t.";
  }
  if (textKey.includes("day 04") || textKey.includes("ng\xE0y 4") || textKey.includes("sang cham") || textKey.includes("s\xE1ng ch\u1EADm")) {
    return pageSubtitle || "M\u1ED9t ng\xE0y cu\u1ED1i g\u1ECDn nh\u1ECBp, v\u1EABn \u0111\u1EE7 \u0111i\u1EC3m gh\xE9 v\xE0 ch\u1ED1t b\u1EEFa t\u1ED1i. L\u01B0u l\u1EA1i ngay nh\xE9.";
  }
  if (textKey.includes("l\u01B0u tr\xFA") || textKey.includes("luu tru")) {
    return pageSubtitle || "C\xE1c l\u1EF1a ch\u1ECDn n\xEAn xem tr\u01B0\u1EDBc \u0111\u1EC3 ch\u1ED1t n\u01A1i ngh\u1EC9 ph\xF9 h\u1EE3p l\u1ECBch tr\xECnh.";
  }
  if (textKey.includes("d\u1ECBch v\u1EE5") || textKey.includes("dich vu")) {
    return pageSubtitle || "C\xE1c d\u1ECBch v\u1EE5 h\u1ED7 tr\u1EE3 chuy\u1EBFn \u0111i, \u01B0u ti\xEAn m\u1EE5c c\xF3 th\xF4ng tin r\xF5 \u0111\u1EC3 li\xEAn h\u1EC7 nhanh.";
  }
  return polishShortVietnameseCopy(sanitizeSubtitleForDisplay(page?.subtitle, [page]));
}
function renderGrid8Items(items, title, chipText, backgroundImage, introText = "", options = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return "";
  }
  const showTime = Boolean(options.showTime);
  const showMeta = options.showMeta !== false;
  const showCenterChip = options.showCenterChip !== false;
  const showLabel = Boolean(options.showLabel);
  const showAddress = options.showAddress !== false;
  const centerImageHtml = backgroundImage ? renderPreviewImage(backgroundImage, title || "", "grid8-center-bg") : "";
  return `
    ${items.slice(0, 4).map((item) => {
    const displayName = gridDisplayName(item);
    return `
        <article class="grid8-cell ${escapeHtml(imageSourceClass(item))}">
          ${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}
          <div class="grid8-cell-copy">
            ${showTime && item.label ? `<span class="grid8-cell-time">${escapeHtml(item.label)}</span>` : ""}
            ${showLabel && item.label ? `<span class="grid8-cell-service">${escapeHtml(item.label)}</span>` : ""}
            <strong class="story-image-title">${escapeHtml(displayName)}</strong>
            ${showMeta && shouldShowItemAddress(item, showAddress) ? renderGrid8Meta(item.metaPrimary) : ""}
            ${showMeta ? renderGrid8Secondary(item.metaSecondary, { includeOpenHours: options.includeOpenHours === true }) : ""}
          </div>
        </article>
      `;
  }).join("")}
    <article class="grid8-center">
      ${centerImageHtml}
      ${showCenterChip ? `<span class="grid8-center-chip">${escapeHtml(chipText || "List")}</span>` : ""}
      <h3 class="grid8-center-title">${escapeHtml(title || "")}</h3>
      ${introText ? `<p class="grid8-center-intro">${escapeHtml(introText)}</p>` : ""}
    </article>
    ${items.slice(4, 8).map((item) => {
    const displayName = gridDisplayName(item);
    return `
          <article class="grid8-cell ${escapeHtml(imageSourceClass(item))}">
            ${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}
            <div class="grid8-cell-copy">
              ${showTime && item.label ? `<span class="grid8-cell-time">${escapeHtml(item.label)}</span>` : ""}
              ${showLabel && item.label ? `<span class="grid8-cell-service">${escapeHtml(item.label)}</span>` : ""}
              <strong class="story-image-title">${escapeHtml(displayName)}</strong>
              ${showMeta && shouldShowItemAddress(item, showAddress) ? renderGrid8Meta(item.metaPrimary) : ""}
              ${showMeta ? renderGrid8Secondary(item.metaSecondary, { includeOpenHours: options.includeOpenHours === true }) : ""}
            </div>
          </article>
        `;
  }).join("")}
  `;
}
function renderItineraryItems(items) {
  return items.map((item) => `
    <div class="item-row itinerary-row">
      <div class="thumb-block itinerary-thumb ${item.imageSource || (item.imageMapped ? "manual" : "fallback")}">
        ${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}
      </div>
      <div class="item-copy itinerary-copy">
        <div class="itinerary-topline">
          <div class="item-label itinerary-time">${escapeHtml(item.label)}</div>
          <div class="itinerary-name story-image-title">${escapeHtml(item.name)}</div>
        </div>
        <p class="item-meta story-image-meta itinerary-detail">
          ${escapeHtml(item.metaPrimary)}${item.metaSecondary ? ` \xB7 ${escapeHtml(item.metaSecondary)}` : ""}
        </p>
      </div>
    </div>
  `).join("");
}
function renderJourney4N3DItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "";
  }
  return `
    <div class="journey-timeline">
      ${items.map((item) => `
        <article class="journey-time-row ${escapeHtml(item.imageSource || (item.imageMapped ? "manual" : "fallback"))}">
          <div class="journey-stop-thumb">
            ${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}
          </div>
          <div class="journey-time-copy">
            <strong class="story-image-title">${escapeHtml(item.name)}</strong>
            <p class="story-image-meta">${escapeHtml(item.metaPrimary)}</p>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}
function journey4N3DTitle(chipText, title) {
  const chip = String(chipText || "").trim();
  const cleanTitle = String(title || "").trim();
  if (!chip || !cleanTitle) {
    return cleanTitle || chip;
  }
  if (cleanTitle.toLowerCase().startsWith(`${chip.toLowerCase()} - `)) {
    return cleanTitle;
  }
  return `${chip} - ${cleanTitle}`;
}
function renderListPage(page, index, total, listId, hashtags = [], list = null) {
  const pageSubtitle = sanitizeSubtitleForDisplay(page.subtitle, list?.pages || [page]);
  if (page.layoutVariant === "grid-5") {
    return renderGrid5Page(page, index, listId, pageSubtitle, list);
  }
  if (V2_LIST_VARIANTS.has(page.layoutVariant)) {
    const v2Html = renderListPageV2(page, index, listId, list, pageSubtitle);
    if (v2Html) return v2Html;
  }
  if (isSpotlightLayout(page)) {
    return renderSpotlightPage(page, index, listId, list, pageSubtitle);
  }
  if (page.layoutVariant === "spotlight-partner") {
    return renderSpotlightPartnerPage(page, index, listId, list);
  }
  if (page.layoutVariant === "spotlight-partner-info") {
    return renderSpotlightPartnerInfoPage(page, index, listId, list);
  }
  if (page.layoutVariant === "spotlight-list") {
    return renderSpotlightListPage(page, index, listId, list, pageSubtitle);
  }
  if (page.layoutVariant === "budget-3n2d-table") {
    return renderBudget3N2DTablePage(page, index, listId);
  }
  if (page.layoutVariant === "budget-3n2d-gallery") {
    return renderBudget3N2DGalleryCornerPage(page, index, listId, list);
  }
  if (page.layoutVariant === "budget-3n2d-day") {
    return renderBudget3N2DDayPage(page, index, listId, list);
  }
  if (page.layoutVariant === "budget-3n2d-total") {
    return renderBudget3N2DTotalPage(page, index, listId, list);
  }
  if (page.layoutVariant === "photomode") {
    const photomodeTitleHtml = /^pov-3-day/i.test(String(listId || "")) && page.title ? `
        <div class="photomode-page-heading">
          <span>${escapeHtml(page.chipText || "")}</span>
          <h3>${escapeHtml(page.title)}</h3>
        </div>
      ` : "";
    return `
      <article class="${escapeHtml(storyPageClass(listId, "photomode"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText)}.png">
        ${photomodeTitleHtml}
        <div class="photomode-stack">
          ${renderPhotomodeItems(page.items)}
        </div>
      </article>
    `;
  }
  if (page.layoutVariant === "grid-8") {
    const grid8Title = isGeneratedCaptionList(list) ? contextualGrid8Title(page) : page.title;
    const grid8Intro = grid8IntroForPage(page, pageSubtitle, list);
    const showAddress = !isActivityListPage(page);
    const grid8Background = page.backgroundImage || firstPortablePageImage(page) || coverBackgroundImage(page, list);
    return `
      <article class="${escapeHtml(storyPageClass(listId, "grid8-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText)}.png">
        <div class="grid8-matrix">
          ${renderGrid8Items(page.items, grid8Title, page.chipText, grid8Background, grid8Intro, { showLabel: isServiceOrStayListPage(page), showAddress })}
        </div>
      </article>
    `;
  }
  if (isJourneyGrid8Layout(page)) {
    const hideCenterChip = page.chipText === "L\u01B0u tr\xFA" || page.chipText === "Homestay" || page.chipText === "D\u1ECBch v\u1EE5";
    const showJourneyServiceLabel = isServiceOrStayListPage(page) || hideCenterChip;
    const showAddress = !isActivityListPage(page);
    const journeyBackground = page.backgroundImage || firstPortablePageImage(page) || coverBackgroundImage(page, list);
    return `
      <article class="${escapeHtml(storyPageClass(listId, "grid8-page", "journey-grid8-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText)}.png">
        <div class="grid8-matrix">
          ${renderGrid8Items(page.items, page.title, page.chipText, journeyBackground, journeyGrid8Intro(page), { showTime: false, showMeta: true, showCenterChip: !hideCenterChip, showLabel: showJourneyServiceLabel, showAddress })}
        </div>
      </article>
    `;
  }
  if (page.layoutVariant === "grid-6-zigzag") {
    if (page.type === "cover") {
      return renderZigzagCover(page, index, listId);
    }
    return renderZigzagContentPage(page, index, listId);
  }
  if (page.layoutVariant === "grid-4-mutant") {
    if (page.type === "cover") {
      return renderGrid4MutantCover(page, index, listId);
    }
    return renderGrid4MutantContentPage(page, index, listId);
  }
  if (isGridLayout(page)) {
    if (isGrid4FeaturePage(page)) {
      return renderGrid4FeaturePage(page, index, listId, list, pageSubtitle);
    }
    const gridVariantClass = page.layoutVariant === "grid-4" ? " grid4" : page.layoutVariant === "grid-8" ? " grid8" : "";
    const gridBodyClass = page.layoutVariant === "grid-4" ? " grid4-body" : page.layoutVariant === "grid-8" ? " grid8-body" : "";
    const showServiceLabel = isServiceOrStayListPage(page);
    const showAddress = !isActivityListPage(page);
    return `
      <article class="${escapeHtml(storyPageClass(listId, "grid6", gridVariantClass.trim()))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText)}.png">
        <div class="grid6-header">
           <div class="grid6-header-top">${escapeHtml(page.title)}</div>
        </div>
        <div class="grid6-body${gridBodyClass}">
          ${renderGrid6Items(page.items, { showLabel: showServiceLabel, showAddress })}
        </div>
      </article>
    `;
  }
  if (page.layoutVariant === "journey-4n3d") {
    const dayNumber = String(Math.max(index, 1)).padStart(2, "0");
    return `
      <article class="${escapeHtml(storyPageClass(listId, "journey4", `journey-page-${dayNumber}`))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText)}.png">
        <div class="journey-bg">${renderPreviewImage(page.backgroundImage, page.title, "", portablePageImageCandidates(page, page.backgroundImage))}</div>
        <div class="journey-day-badge">${escapeHtml(page.chipText)}</div>
        <div class="journey-card">
          <div class="journey-title-block">
            <h3 class="page-title">${escapeHtml(journey4N3DTitle(page.chipText, page.title))}</h3>
            ${pageSubtitle ? `<p class="page-lead">${escapeHtml(pageSubtitle)}</p>` : ""}
          </div>
          ${renderJourney4N3DItems(page.items)}
        </div>
      </article>
    `;
  }
  const variantClass = page.layoutVariant === "dense" ? " dense" : page.layoutVariant === "itinerary" ? " itinerary" : page.layoutVariant === "compact" ? " compact" : "";
  const crowdedClass = Array.isArray(page.items) && page.items.length >= 6 ? " crowded" : "";
  const hashtagsHtml = renderInlineHashtags(hashtags);
  const hashtagClass = Array.isArray(hashtags) && hashtags.length > 0 ? " has-inline-hashtags" : "";
  const itemsHtml = page.layoutVariant === "itinerary" ? renderItineraryItems(page.items) : renderListItems(page.items);
  return `
    <article class="${escapeHtml(storyPageClass(listId, variantClass.trim(), crowdedClass.trim(), hashtagClass.trim()))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText)}.png">
      <div class="page-shell-bg">${renderPreviewImage(page.backgroundImage, page.title, "", portablePageImageCandidates(page, page.backgroundImage))}</div>
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
export {
  pageCounter,
  renderCoverPage,
  renderGrid6Items,
  renderGrid8Items,
  renderInlineHashtags,
  renderItineraryItems,
  renderJourney4N3DItems,
  renderListItems,
  renderListPage,
  renderPhotomodeItems,
  setSpotlightV2CoverImagePool
};
