// ../frontend/lib/utils.js
var DATASET_CACHE_KEY = "dalat-carousel-dataset-cache-v82";
var STUDIO_CATALOG_REVISION_KEY = `${DATASET_CACHE_KEY}:catalog-revision`;
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function sanitizeFilePart(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

// ../frontend/lib/threadsToplist.js
function renderThreadsToplistCover(page, index, listId) {
  return `<article class="story-page threads-toplist-cover" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="01-top-list-da-lat.png">
    <img class="threads-toplist-door" src="${escapeHtml(page.backgroundImage || "/templates/threads-toplist-door.png")}" alt="C\u1EEDa \u0111\u1ECF \u0110\xE0 L\u1EA1t" loading="eager" decoding="sync" draggable="false">
    <div class="threads-toplist-cover-shade" aria-hidden="true"></div>
    <h1>${escapeHtml(page.title || "Top list c\xE1c \u0111\u1ECBa \u0111i\u1EC3m \u0110\xE0 L\u1EA1t")}</h1>
  </article>`;
}
function renderThreadsToplistPage(page, index, listId) {
  const items = Array.isArray(page.items) ? page.items : [];
  const rows = items.map((item) => `<li class="threads-toplist-place"><strong>${escapeHtml(item.name || "")}</strong><span>${escapeHtml(item.metaPrimary || "")}</span></li>`).join("");
  return `<article class="story-page threads-toplist-page" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText || "dia-diem")}.png">
    <div class="threads-toplist-paper">
      <h2>${escapeHtml(page.title || page.chipText || "")}</h2>
      <ul>${rows}</ul>
      ${page.subtitle ? `<p class="threads-toplist-example">${escapeHtml(page.subtitle)}</p>` : ""}
    </div>
  </article>`;
}

// ../frontend/lib/localTemplates.js
var properties = /* @__PURE__ */ new Set(["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "textAlign", "color", "background", "borderRadius", "opacity", "objectFit", "objectPosition", "padding", "display", "alignItems", "justifyContent", "whiteSpace", "transform", "transformOrigin", "border", "boxShadow"]);
function css(style = {}) {
  return Object.entries(style).filter(([key, value]) => properties.has(key) && !/[<>;]|url\s*\(|expression\s*\(/i.test(String(value))).map(([key, value]) => `${key.replace(/[A-Z]/g, (s) => "-" + s.toLowerCase())}:${typeof value === "number" && ["fontSize", "letterSpacing", "borderRadius", "padding"].includes(key) ? value + "px" : value}${key === "fontFamily" ? " !important" : ""}`).join(";");
}
function field(page, key) {
  if (key === "title" || key === "subtitle" || key === "backgroundImage") return String(page[key] || "");
  const cover = /^coverImages\.(\d+)$/.exec(key || "");
  if (cover) return String(page.coverImages?.[Number(cover[1])] || "");
  const match = /^items\.(\d+)\.(name|metaPrimary|metaSecondary|imageUrl)$/.exec(key || "");
  return match ? String(page.items?.[Number(match[1])]?.[match[2]] || "") : "";
}
function renderLocalTemplate(page, index, listId) {
  const model = page.localRender;
  if (!model || !(model.width > 0 && model.height > 0) || model.width > 4096 || model.height > 4096) throw new Error("M\u1EABu local thi\u1EBFu m\xF4 h\xECnh render/phi\xEAn b\u1EA3n.");
  const fonts = model.fonts.map((font) => {
    if (!/^[a-zA-Z0-9 _-]+$/.test(font.family) || !/^\/api\/local-templates\/local-[a-z0-9-]+\/\d+\/assets\/[\w.-]+$/.test(font.url)) throw new Error("T\xE0i nguy\xEAn font local kh\xF4ng h\u1EE3p l\u1EC7.");
    return `@font-face{font-family:"${font.family}";src:url("${font.url}") format("woff2");font-weight:${Number(font.weight) || 400};font-style:normal;font-display:block;}`;
  }).join("\n");
  const nodes = model.nodes.map((node, n) => {
    const geometry = `position:absolute;box-sizing:border-box;left:${Number(node.x)}px;top:${Number(node.y)}px;width:${Number(node.width)}px;height:${Number(node.height)}px;${css(node.style)}`;
    if (node.kind === "shape") {
      if (node.style?.boxShadow && node.style.boxShadow !== "none" && !/\binset\b/i.test(node.style.boxShadow)) {
        const shadow = `${geometry};background:transparent`;
        const fill = `${geometry};box-shadow:none`;
        return `<div aria-hidden="true" style="${escapeHtml(shadow)}"></div><div aria-hidden="true" style="${escapeHtml(fill)}"></div>`;
      }
      return `<div aria-hidden="true" style="${escapeHtml(geometry)}"></div>`;
    }
    if (node.kind === "image") {
      const owner = node.itemIndices?.map((i) => page.items?.[i]).find((item) => item?.imageUrl);
      const src = owner?.imageUrl || (node.field ? field(page, node.field) : node.src);
      if (!src && node.required) throw new Error(`M\u1EABu local: thi\u1EBFu \u1EA3nh \u1EDF ${node.label || "trang " + (index + 1)}.`);
      if (!src) return "";
      if (!/^\/(?:api\/local-templates\/|assets\/)|^https?:\/\//i.test(src)) throw new Error("URL \u1EA3nh local kh\xF4ng h\u1EE3p l\u1EC7.");
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(owner?.name || node.label || "")}" loading="eager" decoding="sync" draggable="false" data-local-required="${node.required !== false}" style="${escapeHtml(geometry)}"/>`;
    }
    if (node.itemIndices && node.fieldColors) {
      const content = node.itemIndices.map((i) => (node.fields || ["name"]).map((key) => {
        const value = String(page.items?.[i]?.[key] || "");
        return value ? `<span data-local-field="${escapeHtml(key)}" style="display:block;font-family:inherit!important;font-size:inherit;line-height:inherit;font-weight:inherit;${escapeHtml(css({ color: node.fieldColors[key] || node.style?.color || "inherit" }))}">${escapeHtml(value)}</span>` : "";
      }).join("")).join("");
      return `<div data-local-text="${n}" data-local-label="${escapeHtml(node.label || page.title || "N\u1ED9i dung")}" style="${escapeHtml(geometry)};white-space:pre-line;overflow:visible">${content}</div>`;
    }
    let text = node.field ? field(page, node.field) : String(node.text || "");
    if (node.itemIndices) text = node.itemIndices.map((i) => (node.fields || ["name"]).map((key) => String(page.items?.[i]?.[key] || "")).filter(Boolean).join(node.separator ?? " - ")).filter(Boolean).join("\n");
    return `<div data-local-text="${n}" data-local-label="${escapeHtml(node.label || page.title || "N\u1ED9i dung")}" style="${escapeHtml(geometry)};white-space:pre-line;overflow:visible">${escapeHtml(text)}</div>`;
  }).join("");
  const ratio = 810 / model.width;
  return `<article class="story-page local-template-page" data-local-template="${escapeHtml(model.templateId)}" data-local-fonts="${escapeHtml(JSON.stringify(model.fonts))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.title || "page")}.png" style="width:810px;height:${model.height * ratio}px;aspect-ratio:${model.width}/${model.height}"><style>${fonts}</style><div class="local-template-canvas" style="position:absolute;inset:0;width:${model.width}px;height:${model.height}px;transform:scale(${ratio});transform-origin:0 0">${nodes}</div></article>`;
}

// ../frontend/lib/markup/shared.js
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
  return /^https?:\/\//i.test(value) || value.startsWith("/assets/drive-file") || value.startsWith("/assets/color-edit?");
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
function pageCounter(index, total) {
  return `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
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
function gridContextKey(value) {
  return normalizeGridText(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
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
  "threads-toplist-cover",
  "grid-6-quaytung-cover",
  "grid-8-feed",
  "grid-8-quaytung-cover",
  "spotlight-v2",
  "spotlight-v3",
  "spotlight-v4-cover",
  "spotlight-v5-cover",
  "spotlight-v6-cover",
  "carousel-mau-1-cover",
  "one-way-story-cover",
  "spotlight-partner-v2",
  "pov-maikem",
  "pov-3-v2-cover",
  "budget-wallet-cover",
  "itinerary-4n3d-stack-cover",
  "itinerary-timeline-cover"
]);
var V2_LIST_VARIANTS = /* @__PURE__ */ new Set([
  "threads-toplist-page",
  "grid-6-quaytung",
  "grid-8-feed",
  "grid-8-quaytung",
  "grid-8-quaytung-menu",
  "spotlight-v2",
  "spotlight-v3",
  "spotlight-v4-image",
  "spotlight-v4-page",
  "spotlight-v5-playlist",
  "spotlight-v5-place",
  "spotlight-v6-image",
  "spotlight-v6-page",
  "spotlight-v6-map-page",
  "spotlight-v6-map-place",
  "spotlight-v6-diary-page",
  "summary-note-page",
  "itinerary-note-day",
  "itinerary-note-dark-day",
  "itinerary-note-threads-day",
  "itinerary-note-threads-budget",
  "threads-expense-sheet",
  "itinerary-note-timed-day",
  "carousel-mau-1-page",
  "one-way-story-road",
  "one-way-story-slope",
  "one-way-story-photo",
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
function gridPriceMetaFromSecondary(value) {
  const secondary = String(value || "").replace(/\s+/g, " ").trim();
  if (!secondary) return "";
  const parts = secondary.split("\xB7").map((part) => part.trim()).filter(Boolean);
  const pricePart = parts.find((part) => /^Giá:/i.test(part));
  if (pricePart) return pricePart;
  const withoutHours = parts.filter((part) => !/^Khung giờ:/i.test(part)).join(" \xB7 ");
  return withoutHours.replace(/(?:^|\s*·\s*)Khung giờ:\s*[^·]+/gi, "").replace(/^[\s·]+|[\s·]+$/g, "").trim();
}
function formatGrid8FeedCoverTagline(value) {
  let text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  text = text.replace(/\.{3,}$/, "").replace(/…+$/, "").trim();
  return escapeHtml(text.toUpperCase());
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
function pov3V2BracketSubtitle(subtitle) {
  const clean = String(subtitle || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const inner = clean.replace(/^[\[\(\s]+|[\]\)\s]+$/g, "");
  return `[ ${inner} ]`;
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
function truncateMenuLine(value, maxLen = 42) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > maxLen * 0.45 ? cut.slice(0, sp) : cut).trim()}\u2026`;
}
function responsiveTitleFitClass(value, prefix, mediumAt = 32, smallAt = 48) {
  const length = String(value || "").replace(/\s+/g, " ").trim().length;
  if (length >= smallAt) return `${prefix}-fit-xs`;
  if (length >= mediumAt) return `${prefix}-fit-sm`;
  return "";
}
function formatBalancedTitleLines(value, maxLines = 2) {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const words = raw.split(" ");
  if (words.length <= 3 || maxLines <= 1) return escapeHtml(raw);
  const lines = [];
  let remaining = [...words];
  for (let lineIndex = 0; lineIndex < maxLines - 1 && remaining.length > 1; lineIndex += 1) {
    const remainingLineCount = maxLines - lineIndex;
    const remainingChars = remaining.join(" ").length;
    const target = remainingChars / remainingLineCount;
    let bestSplit = 1;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (let split = 1; split <= remaining.length - (remainingLineCount - 1); split += 1) {
      const length = remaining.slice(0, split).join(" ").length;
      const diff = Math.abs(length - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestSplit = split;
      }
    }
    lines.push(remaining.slice(0, bestSplit).join(" "));
    remaining = remaining.slice(bestSplit);
  }
  if (remaining.length > 0) lines.push(remaining.join(" "));
  return lines.map((line) => escapeHtml(line)).join("<br>");
}
function normalizeVietnameseDisplayText(value) {
  return String(value || "").normalize("NFC").replace(/\s+/g, " ").trim();
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

// ../frontend/lib/cherryBlossom.js
function cherryBlossomCopy(page) {
  const item = page.items?.[0];
  if (item?.sourceSectionKey === "quan_an") {
    return [item.name, item.metaPrimary].filter(Boolean).join(" \u2014 ");
  }
  const address = item && !(item.sourceSectionKey === "cafe" && page.title) ? `${item.name}${item.metaPrimary ? " \u2014 " + item.metaPrimary : ""}` : "";
  return [page.title, address].filter(Boolean).join("\n");
}
function renderCherryBlossom(page, index, listId) {
  const item = page.items?.[0];
  const copy = cherryBlossomCopy(page);
  const placement = page.titlePlacement || (page.type === "cover" ? "center" : "top-center");
  const top = placement === "bottom-center" ? 76 : placement === "center" ? 50 : 32;
  return `<article class="story-page cherry-blossom-page" data-text-unit-scale="${397 / 1080}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-hoa-dao.png" data-export-strict="true">
    <style>
    .story-page.cherry-blossom-page{position:relative;display:block;width:397px!important;height:${397 * 16 / 9}px!important;min-height:0!important;max-width:none!important;flex:0 0 397px!important;aspect-ratio:9/16;border-radius:0!important;box-shadow:none;padding:0;overflow:hidden;background:#111;isolation:isolate;box-sizing:border-box}
    .cherry-blossom-bg{position:absolute;inset:0;z-index:0}.cherry-blossom-bg img{display:block;width:100%;height:100%;object-fit:cover;object-position:center;border-radius:0}
    .cherry-blossom-copy{position:absolute;z-index:1;left:8%;width:84%;margin:0;transform:translateY(-50%);color:#fff;text-align:center;font-family:'Be Vietnam Pro',sans-serif;font-weight:600;line-height:1.25;white-space:pre-wrap;overflow-wrap:normal;word-break:normal;-webkit-text-stroke:${2 * 397 / 1080}px #000;paint-order:stroke fill;text-shadow:none}
    </style>
    <div class="cherry-blossom-bg">${renderPreviewImage(page.backgroundImage, item?.name || "Hoa \u0111\xE0o \u0110\xE0 L\u1EA1t")}</div>
    ${copy ? `<div class="cherry-blossom-copy" style="top:${top}%;font-size:${(page.type === "cover" ? 44 : 34) * 397 / 1080}px">${escapeHtml(copy)}</div>` : ""}
    </article>`;
}

// ../frontend/lib/threadsFoodExport.mjs
function compactThreadsLocalAddress(address) {
  const fullAddress = String(address || "").replace(/\s+/g, " ").trim();
  const parts = fullAddress.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return fullAddress;
  const locality = parts.at(-1);
  if (!/^Đà Lạt$/i.test(locality)) {
    return /[-–—]\s*Đà Lạt$/i.test(locality) ? locality.replace(/^(?:phường\s+|p\.\s*)/i, "").replace(/\s*[-–—]\s*Đà Lạt$/i, " - \u0110\xE0 L\u1EA1t") : fullAddress;
  }
  const previous = parts.at(-2);
  if (/^(?:phường\s+|p\.\s*)?[^\d]+$/i.test(previous) && !/(?:^|\s)(?:đường|thôn|tổ|hẻm|ngõ)(?:\s|$)/i.test(previous)) {
    return previous.replace(/^(?:phường\s+|p\.\s*)/i, "") + " - \u0110\xE0 L\u1EA1t";
  }
  return fullAddress;
}

// ../frontend/lib/itineraryNote.js
var escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var icon = (body) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + "</svg>";
var share = icon('<path d="M8 8H5v14h14V8h-3M12 15V1m-4 4 4-4 4 4"/>');
var more = icon('<circle cx="12" cy="12" r="10"/><circle cx="7" cy="12" r=".7" fill="currentColor"/><circle cx="12" cy="12" r=".7" fill="currentColor"/><circle cx="17" cy="12" r=".7" fill="currentColor"/>');
function renderItineraryNotePage(page, index, listId) {
  if (page.layoutVariant === "itinerary-note-threads-day") {
    const items = page.items || [];
    if (items.some((item) => /^Ngày \d+\|/.test(item.label || ""))) {
      let previousDay = "";
      const rows2 = items.map((item, itemIndex) => {
        const day = String(item.label || "").split("|")[0];
        const number = Number(day.match(/\d+/)?.[0]) || 1;
        const showDay = day !== previousDay;
        previousDay = day;
        const period = String(item.label || "").split("|")[1] || "";
        const activity = item.sourceSectionKey === "quan_an" ? { S\u00E1ng: "\u0102n s\xE1ng", Tr\u01B0a: "\u0102n tr\u01B0a", T\u1ED1i: "\u0102n t\u1ED1i" }[period] || "\u0102n u\u1ED1ng" : item.sourceSectionKey === "cafe" ? "C\xE0 ph\xEA" : item.sourceSectionKey === "choi_dem" ? "\u0110i ch\u01A1i \u0111\xEAm" : "Tham quan / check-in";
        const note = item.metaSecondary || activity;
        const next = items[itemIndex + 1];
        const rest = period === "Tr\u01B0a" && next && String(next.label || "").startsWith(day + "|") && !String(next.label).endsWith("|Tr\u01B0a") ? '<tr class="threads-rest"><td></td><td colspan="3">Quay l\u1EA1i ch\u1ED7 ngh\u1EC9 \xB7 ngh\u1EC9 ng\u01A1i</td></tr>' : "";
        return `<tr class="threads-place-row day-${number}"><td${showDay ? ` class="threads-day-label threads-day-${number}"` : ""}>${showDay ? escape(day) : ""}</td><td>${escape(item.name)}</td><td>${escape(item.metaPrimary)}</td><td>${escape(note)}</td></tr>${rest}`;
      }).join("");
      return `<article class="story-page itinerary-note-day itinerary-note-threads-day threads-summary threads-portrait" data-list-id="${escape(listId)}" data-page-index="${index}" data-export-name="lich-trinh-tong-hop.png"><div class="in-content"><table class="threads-table"><colgroup><col style="width:12%"><col style="width:26%"><col style="width:40%"><col style="width:22%"></colgroup><thead><tr><th>Ng\xE0y</th><th>\u0110\u1ECBa \u0111i\u1EC3m / ho\u1EA1t \u0111\u1ED9ng</th><th>\u0110\u1ECBa ch\u1EC9</th><th>Ghi ch\xFA</th></tr></thead><tbody>${rows2}</tbody></table></div></article>`;
    }
    const groups2 = ["S\xE1ng", "Tr\u01B0a", "Chi\u1EC1u", "T\u1ED1i"].map((period) => {
      const selected = items.filter((item) => item.label === period);
      if (!selected.length) return "";
      const rows2 = selected.map((item) => {
        const visit = ["check_in", "khu_du_lich", "hoat_dong", "dia_diem_lich_su", "choi_dem"].includes(item.sourceSectionKey);
        const note = item.metaSecondary || (item.sourceSectionKey === "quan_an" ? "\u0102n u\u1ED1ng" : item.sourceSectionKey === "cafe" ? "Cafe" : visit ? "Tham quan / check-in" : "");
        return `<tr class="threads-place-row"><td>${escape(item.scheduleTime || "")}</td><td${visit ? ' class="threads-highlight"' : ""}>${escape(item.name)}</td><td>${escape(item.metaPrimary)}</td></tr>`;
      }).join("");
      return `<tr class="threads-period"><th colspan="3">${period}</th></tr>${rows2}${period === "Tr\u01B0a" ? '<tr class="threads-rest"><td colspan="3">V\u1EC1 ch\u1ED7 ngh\u1EC9 \xB7 ngh\u1EC9 ng\u01A1i</td></tr>' : ""}`;
    }).join("");
    return `<article class="story-page itinerary-note-day itinerary-note-threads-day threads-portrait" data-list-id="${escape(listId)}" data-page-index="${index}" data-export-name="${index + 1}-note-threads.png"><div class="in-content"><h1>${escape(page.title)}</h1><p class="threads-subtitle">${escape(page.subtitle)}</p><table class="threads-table"><colgroup><col style="width:17%"><col style="width:45%"><col style="width:38%"></colgroup><thead><tr><th>Gi\u1EDD d\u1EF1 ki\u1EBFn</th><th>Ho\u1EA1t \u0111\u1ED9ng / \u0111\u1ECBa \u0111i\u1EC3m</th><th>\u0110\u1ECBa ch\u1EC9</th></tr></thead><tbody>${groups2}</tbody></table></div></article>`;
  }
  const dark = page.layoutVariant === "itinerary-note-dark-day";
  const rows = (page.items || []).map((item) => {
    const name = item.name ?? item.rawName ?? "";
    const address = item.metaPrimary ?? "";
    const place = name ? [item.label, name].filter(Boolean).join(" ") : "";
    const text = dark ? place + (item.isPartner && address ? " (" + compactThreadsLocalAddress(address) + ")" : "") : [place, address].filter(Boolean).join(" - ");
    return "<li>" + escape(text) + "</li>";
  }).join("");
  return `<article class="story-page itinerary-note-day${dark ? " itinerary-note-dark-day" : ""}" data-list-id="${escape(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-ngay-${index + 1}.png">
    <div class="in-toolbar" aria-hidden="true"><span>${icon('<path d="m15 3-9 9 9 9"/>')}Ghi ch\xFA</span><span>${share}${more}</span></div>
    <div class="in-content">${dark ? "" : `<h1>${escape(page.title)}</h1><p class="in-day">${escape(page.chipText ?? "Ng\xE0y " + (index + 1))}</p>`}<ul>${rows}</ul></div>
    <div class="in-home" aria-hidden="true"></div>
  </article>`;
}
var timedIcon = (body) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + "</svg>";
var timedShare = timedIcon('<path d="M8 8H5v14h14V8h-3M12 15V1m-4 4 4-4 4 4"/>');
var timedMore = timedIcon('<circle cx="12" cy="12" r="10"/><circle cx="7" cy="12" r=".65" fill="currentColor"/><circle cx="12" cy="12" r=".65" fill="currentColor"/><circle cx="17" cy="12" r=".65" fill="currentColor"/>');
var timedSignal = '<svg viewBox="0 0 20 14" aria-hidden="true"><rect x="1" y="9" width="3" height="4" rx=".6"/><rect x="6" y="6" width="3" height="7" rx=".6"/><rect x="11" y="3" width="3" height="10" rx=".6"/><rect x="16" y="0" width="3" height="13" rx=".6"/></svg>';
var timedWifi = '<svg viewBox="0 0 20 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M2 4.5c4.8-4 11.2-4 16 0M5 8c3-2.5 7-2.5 10 0M8.5 11.2c1-.8 2-.8 3 0"/><circle cx="10" cy="13" r=".8" fill="currentColor" stroke="none"/></svg>';
var timedChecklist = timedIcon('<circle cx="5" cy="6" r="2"/><path d="m4 6 1 1 2-3M10 6h10M3 13h4M10 13h10M3 19h4M10 19h10"/>');
var timedCamera = timedIcon('<path d="M4 7h4l2-3h4l2 3h4v13H4z"/><circle cx="12" cy="13" r="4"/>');
var timedPen = timedIcon('<circle cx="12" cy="12" r="9"/><path d="m8 15 1-4 6-6 3 3-6 6z"/>');
var timedCompose = timedIcon('<path d="M13 4H5v15h15v-8M12 12l8-8m-5 0h5v5"/>');
function renderItineraryNoteTimedPage(page, index, listId) {
  const rows = (page.items || []).map((item) => {
    const time = item.scheduleTime ?? "";
    const iconValue = item.scheduleIcon ?? "\u{1F4CD}";
    const name = item.name ?? item.rawName ?? "";
    const address = item.metaPrimary ?? "";
    const text = [name, address].filter(Boolean).join(address ? " - " : "");
    return `<div class="int-row${item.fixedRow ? " is-fixed" : ""}">
      <div class="int-time">${escape(time)}</div>
      <div class="int-place"><span class="int-place-icon" aria-hidden="true">${text ? escape(iconValue) : ""}</span><span class="int-place-text">${escape(text)}</span></div>
    </div>`;
  }).join("");
  const statusTime = page.noteStatusTime ?? String(page.subtitle || "").match(/^\d{2}:\d{2}/)?.[0] ?? "";
  return `<article class="story-page itinerary-note-timed-day" data-list-id="${escape(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-ngay-${index + 1}.png">
    <div class="int-status" aria-hidden="true"><strong>${escape(statusTime)}</strong><span class="int-status-icons">${timedSignal}${timedWifi}<span class="int-battery">48</span></span></div>
    <div class="int-nav" aria-hidden="true"><span class="int-back"><b>\u2039</b>T\u1EA5t c\u1EA3 iCloud</span><span class="int-actions">${timedShare}${timedMore}</span></div>
    <div class="int-date">${escape(page.subtitle ?? "")}</div>
    <div class="int-content"><p class="int-day">${escape(page.chipText ?? `\u{1F337} Ng\xE0y ${index + 1}`)}</p>${rows}</div>
    <div class="int-bottom-toolbar" aria-hidden="true"><span>${timedChecklist}</span><span>${timedCamera}</span><span>${timedPen}</span><span>${timedCompose}</span></div>
    <div class="int-home" aria-hidden="true"></div>
  </article>`;
}

// ../frontend/lib/threadsBudget.js
var escape2 = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var groups = ["Di chuy\u1EC3n", "L\u01B0u tr\xFA", "Ng\xE0y 1", "Ng\xE0y 2", "Ng\xE0y 3"];
function parseThreadsBudgetAmount(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (/^(?:free|miễn phí|0(?:[.,]0+)?\s*(?:đ|vnd|vnđ)?)$/i.test(raw)) return 0;
  if (/[~–—]|\b(?:từ|khoảng|đến|triệu\s*\/|mỗi|\/người|\/đêm)\b/i.test(raw)) return null;
  const match = raw.match(/^([\d.,\s]+)\s*(tr|triệu|k|nghìn|ngàn|đ|vnd|vnđ)?(?:\s*\/\s*người)?$/i);
  if (!match) return null;
  const digits = match[1].replace(/\s/g, "");
  const unit = match[2] || "";
  let amount;
  if (unit === "tr" || unit === "tri\u1EC7u" || unit === "k" || unit === "ngh\xECn" || unit === "ng\xE0n") {
    amount = Number(digits.replace(",", ".")) * (unit === "tr" || unit === "tri\u1EC7u" ? 1e6 : 1e3);
  } else {
    const normalized = /^[\d]{1,3}(?:[.,]\d{3})+$/.test(digits) ? digits.replace(/[.,]/g, "") : digits;
    amount = Number(normalized);
  }
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}
function threadsBudgetTotals(items) {
  const totals = {};
  for (const group of groups) {
    const rows = (items || []).filter((item) => item.label === group);
    const prices = rows.map((item) => parseThreadsBudgetAmount(item.metaSecondary));
    const known = prices.filter((price) => price !== null);
    totals[group] = {
      amount: known.length ? known.reduce((sum, price) => sum + price, 0) : null,
      count: rows.length,
      missingCount: rows.length - known.length,
      complete: rows.length > 0 && known.length === rows.length
    };
  }
  const knownGroups = groups.filter((group) => totals[group].amount !== null);
  const amount = knownGroups.length ? knownGroups.reduce((sum, group) => sum + totals[group].amount, 0) : null;
  const missingCount = groups.reduce((sum, group) => sum + totals[group].missingCount, 0);
  return { groups: totals, amount, missingCount, complete: missingCount === 0 && groups.every((group) => totals[group].count > 0) };
}
var money = (amount) => amount === null ? "Ch\u01B0a c\xF3 gi\xE1" : `${new Intl.NumberFormat("vi-VN").format(amount)} \u0111`;
function renderThreadsBudgetPage(page, index, listId) {
  const items = page.items || [];
  const totals = threadsBudgetTotals(items);
  const grouped = Object.fromEntries(groups.map((group) => [group, items.filter((item) => item.label === group)]));
  const ordinary = (group, firstCell = "", category = "") => grouped[group].map((item, rowIndex) => `<tr class="threads-budget-detail">${rowIndex === 0 ? firstCell : ""}${rowIndex === 0 && category ? `<td class="threads-budget-category" rowspan="${grouped[group].length}">${escape2(category)}</td>` : ""}<td>${escape2(item.name)}</td><td class="threads-budget-money${parseThreadsBudgetAmount(item.metaSecondary) === null ? " is-missing" : ""}${/\/người\s*$/i.test(item.metaSecondary || "") ? " is-per-person" : ""}">${escape2(item.metaSecondary || "Ch\u01B0a c\xF3 gi\xE1")}</td></tr>`).join("");
  const subtotal = (label, amount, missingCount, tone) => `<tr class="threads-budget-subtotal ${tone}"><th colspan="2">${escape2(label)}${missingCount ? `<small>T\u1EA1m t\xEDnh \xB7 thi\u1EBFu ${missingCount} kho\u1EA3n</small>` : ""}</th><th>${escape2(money(amount))}</th></tr>`;
  const transport = grouped["Di chuy\u1EC3n"].length ? ordinary("Di chuy\u1EC3n", `<td class="threads-budget-index" rowspan="${grouped["Di chuy\u1EC3n"].length + 1}">1</td>`, "Di chuy\u1EC3n") + subtotal("T\u1ED5ng di chuy\u1EC3n", totals.groups["Di chuy\u1EC3n"].amount, totals.groups["Di chuy\u1EC3n"].missingCount, "tone-green") : "";
  const lodging = grouped["L\u01B0u tr\xFA"].length ? ordinary("L\u01B0u tr\xFA", `<td class="threads-budget-index" rowspan="${grouped["L\u01B0u tr\xFA"].length + 1}">2</td>`, "L\u01B0u tr\xFA") + subtotal("T\u1ED5ng l\u01B0u tr\xFA", totals.groups["L\u01B0u tr\xFA"].amount, totals.groups["L\u01B0u tr\xFA"].missingCount, "tone-blue") : "";
  const dailyRows = ["Ng\xE0y 1", "Ng\xE0y 2", "Ng\xE0y 3"].map((group, day) => ordinary(
    group,
    day === 0 ? `<td class="threads-budget-index" rowspan="${["Ng\xE0y 1", "Ng\xE0y 2", "Ng\xE0y 3"].reduce((count, key) => count + grouped[key].length, 0) + 1}">3</td>` : "",
    group
  )).join("");
  const dailyGroups = ["Ng\xE0y 1", "Ng\xE0y 2", "Ng\xE0y 3"];
  const dailyKnown = dailyGroups.filter((group) => totals.groups[group].amount !== null);
  const dailySubtotal = subtotal(
    "T\u1ED5ng \u0103n u\u1ED1ng / sinh ho\u1EA1t",
    dailyKnown.length ? dailyKnown.reduce((sum, group) => sum + totals.groups[group].amount, 0) : null,
    dailyGroups.reduce((sum, group) => sum + totals.groups[group].missingCount, 0),
    "tone-yellow"
  );
  const previewLabel = /MẪU MINH HỌA/i.test(page.subtitle || "") ? `<p class="threads-budget-foot">${escape2(page.subtitle)}</p>` : "";
  return `<article class="story-page itinerary-note-day itinerary-note-threads-budget${previewLabel ? " is-example" : ""}" data-list-id="${escape2(listId)}" data-page-index="${index}" data-export-name="chi-phi-threads-3n2d.png"><div class="in-content"><table class="threads-budget-table"><colgroup><col style="width:8%"><col style="width:23%"><col style="width:49%"><col style="width:20%"></colgroup><thead><tr><th>STT</th><th>H\u1EA1ng m\u1EE5c</th><th>Chi ti\u1EBFt</th><th>Ti\u1EC1n</th></tr></thead><tbody>${transport}${lodging}${dailyRows}${dailySubtotal}<tr class="threads-budget-grand"><th colspan="3">T\u1ED5ng chi ph\xED${totals.missingCount ? `<small>T\u1EA1m t\xEDnh \xB7 c\xF2n ${totals.missingCount} kho\u1EA3n ch\u01B0a c\xF3 gi\xE1</small>` : ""}</th><th>${escape2(money(totals.amount))}</th></tr></tbody></table>${previewLabel}</div></article>`;
}

// ../frontend/lib/threadsExpenseSheet.js
var escape3 = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var THREADS_EXPENSE_PEOPLE = 2;
var PAGE_HEIGHT = 1080;
var COLUMNS = [18, 380, 150, 210, 140];
var FRAME_ROWS = 9;
function parseThousands(value) {
  const raw = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return null;
  let match = raw.match(/^(\d+(?:[.,]\d+)?)(tr|triệu)$/);
  if (match) return Math.round(Number(match[1].replace(",", ".")) * 1e3);
  match = raw.match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:k|nghìn|ngàn)?$/);
  if (match) return Number(match[1].replace(/\./g, ""));
  return null;
}
var formatThousands = (amount) => Math.round(amount).toLocaleString("vi-VN");
function threadsExpenseTotals(items, people = THREADS_EXPENSE_PEOPLE) {
  const amounts = (items || []).map((item) => parseThousands(item.metaSecondary));
  const total = amounts.reduce((sum, amount) => sum + (amount ?? 0), 0);
  return { total, perPerson: Math.round(total / people), missingCount: amounts.filter((amount) => amount === null).length };
}
function threadsExpenseMetrics(rowCount, requestedFontSize) {
  const maxRowHeight = Math.min(46, Math.floor(PAGE_HEIGHT / (rowCount + FRAME_ROWS)));
  const defaultFont = Math.round(maxRowHeight * 0.5 * 2) / 2;
  const requested = Number(requestedFontSize);
  const font = requested >= 8 && requested <= 72 ? Math.min(requested, maxRowHeight * 0.62) : defaultFont;
  return { font, rowHeight: maxRowHeight };
}
function fittedCell(text, columnWidth, font, className = "") {
  const capacity = columnWidth / (font * 0.5);
  const scale = text.length > capacity ? Math.max(0.62, capacity / text.length) : 1;
  const style = scale < 1 ? ` style="font-size:${scale.toFixed(3)}em"` : "";
  return `<td class="${className}"${style}>${escape3(text)}</td>`;
}
function renderThreadsExpensePage(page, index, listId) {
  const items = page.items || [];
  const { total, perPerson, missingCount } = threadsExpenseTotals(items);
  const { font, rowHeight } = threadsExpenseMetrics(items.length, page.textFontSize);
  const blank = () => `<tr class="tes-grid">${"<td></td>".repeat(5)}</tr>`;
  const dataRows = items.map((item) => {
    const amount = String(item.metaSecondary ?? "").trim();
    const invalid = amount && parseThousands(amount) === null;
    return `<tr class="tes-row"><td class="tes-gutter"></td>${fittedCell(item.name || "", COLUMNS[1], font)}<td class="tes-amount${invalid ? " is-invalid" : ""}">${escape3(amount)}</td>${fittedCell(item.metaPrimary || "", COLUMNS[3], font)}<td class="tes-outside"></td></tr>`;
  }).join("");
  const fillerCount = Math.max(0, Math.ceil(PAGE_HEIGHT / rowHeight) - (items.length + FRAME_ROWS) + 1);
  const example = /MẪU MINH HỌA/i.test(page.subtitle || "");
  return `<article class="story-page threads-expense-sheet${example ? " is-example" : ""}" data-list-id="${escape3(listId)}" data-page-index="${index}" data-export-name="bang-chi-tieu-threads.png" style="--tes-font:${font}px;--tes-row:${rowHeight}px"><div class="tes-content"><table class="tes-table"><colgroup>${COLUMNS.map((width) => `<col style="width:${width}px">`).join("")}</colgroup><tbody>` + blank() + `<tr class="tes-grid tes-title-row"><td></td><td class="tes-title" colspan="2">${escape3(page.title || "")}</td><td></td><td></td></tr>` + blank() + '<tr class="tes-head"><td class="tes-gutter"></td><th>N\u1ED8I DUNG</th><th>S\u1ED0 TI\u1EC0N</th><th>GHI CH\xDA</th><td class="tes-outside"></td></tr>' + dataRows + `<tr class="tes-row tes-empty"><td class="tes-gutter"></td><td></td><td></td><td></td><td class="tes-outside"></td></tr><tr class="tes-row tes-total"><td class="tes-gutter"></td><td></td><td class="tes-amount">${escape3(formatThousands(total))}</td><td>${missingCount ? `<small>thi\u1EBFu ${missingCount} kho\u1EA3n</small>` : ""}</td><td class="tes-outside"></td></tr>` + blank() + `<tr class="tes-person"><td class="tes-gutter"></td><td class="tes-person-label">M\u1ED7i ng\u01B0\u1EDDi</td><td class="tes-amount">${escape3(formatThousands(perPerson))}</td><td></td><td></td></tr>` + Array.from({ length: fillerCount }, () => blank()).join("") + `</tbody></table>${example ? `<p class="tes-example">${escape3(page.subtitle)}</p>` : ""}</div></article>`;
}

// ../frontend/lib/photoPresets.mjs
function photoDisplayUrl(source, preset) {
  if (!source || !preset || source.startsWith("/assets/color-edit?")) return source;
  if (!source.startsWith("/assets/") && !/^\/api\/local-templates\/local-[a-z0-9-]+\/\d+\/assets\/[\w.-]+$/.test(source) && !/^https?:\/\//i.test(source)) return source;
  return `/assets/color-edit?preset=${encodeURIComponent(preset)}&source=${encodeURIComponent(source)}`;
}
function photoRenderPage(page, preset) {
  const value = page.photoPreset || preset;
  if (!value || page.layoutVariant === "spotlight-v6-map-page") return page;
  const next = { ...page, photoPreset: value };
  if (page.backgroundImage) next.backgroundImage = photoDisplayUrl(page.backgroundImage, value);
  if (page.coverImages) next.coverImages = page.coverImages.map((src) => photoDisplayUrl(src, value));
  if (page.items) next.items = page.items.map((item) => ({
    ...item,
    imageUrl: photoDisplayUrl(item.imageUrl, value),
    candidateImageUrls: (item.candidateImageUrls || []).map((src) => photoDisplayUrl(src, value))
  }));
  return next;
}
function photoRenderArguments(page, args) {
  const list = args[4], preset = page.photoPreset || list?.photoPreset;
  if (!preset || page.layoutVariant === "spotlight-v6-map-page") return { page, args, preset: null };
  const nextArgs = [...args];
  if (list) nextArgs[4] = { ...list, pages: (list.pages || []).map((p) => photoRenderPage(p, preset)) };
  if (Array.isArray(args[5])) nextArgs[5] = args[5].map((src) => photoDisplayUrl(src, preset));
  return { page: photoRenderPage(page, preset), args: nextArgs, preset };
}
function strictPhotoMarkup(html, preset) {
  if (!preset || /<article[^>]*data-export-strict="true"/.test(html)) return html;
  return html.replace("<article ", '<article data-export-strict="true" data-photo-preset="' + preset + '" ');
}

// ../frontend/lib/markup/oneWayStory.js
function renderOneWayStoryImage(src, alt, candidates = []) {
  return `<div class="one-way-story-bg">${renderPreviewImage(src, alt, "", candidates)}</div><div class="one-way-story-shade" aria-hidden="true"></div>`;
}
function renderOneWayStoryCover(page, index, listId, coverTitle, backgroundImage) {
  const length = String(coverTitle || "").length;
  const fitClass = length > 80 ? "is-long" : length > 60 ? "is-medium" : "";
  return `
    <article class="${escapeHtml(storyPageClass(listId, "one-way-story-page one-way-story-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
      ${renderOneWayStoryImage(backgroundImage, coverTitle, page.coverImages || [])}
      ${coverTitle ? `<div class="one-way-story-cover-copy ${fitClass}"><h1>${escapeHtml(coverTitle || "")}</h1></div>` : ""}
    </article>
  `;
}
function oneWayRoadSubtitleMarkup(subtitle) {
  const blocks = String(subtitle || "").split(/\n{2,}/).map((value) => value.trim()).filter(Boolean);
  const intro = blocks[0] || "";
  const roads = blocks.slice(1).join("\n").split(/\n+/).map((value) => value.trim()).filter(Boolean);
  return `
    ${intro ? `<p class="one-way-story-road-intro">${escapeHtml(intro)}</p>` : ""}
    ${roads.length ? `<div class="one-way-story-road-list">${roads.map((road) => `<span>${escapeHtml(road)}</span>`).join("")}</div>` : ""}
  `;
}
function renderOneWayStoryRoad(page, index, listId) {
  return `
    <article class="${escapeHtml(storyPageClass(listId, "one-way-story-page one-way-story-road"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-duong-mot-chieu.png">
      ${renderOneWayStoryImage(page.backgroundImage, page.title)}
      <section class="one-way-story-road-copy">
        ${page.title ? `<p class="one-way-story-road-lead">${escapeHtml(page.title)}</p>` : ""}
        ${oneWayRoadSubtitleMarkup(page.subtitle)}
      </section>
    </article>
  `;
}
function renderOneWayStorySlope(page, index, listId) {
  const item = page.items?.[0] || {};
  return `
    <article class="${escapeHtml(storyPageClass(listId, "one-way-story-page one-way-story-slope"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-duong-doc.png">
      ${renderOneWayStoryImage(page.backgroundImage || item.imageUrl, page.title, item.candidateImageUrls)}
      <section class="one-way-story-slope-copy">
        ${page.title ? `<p>${escapeHtml(page.title)}</p>` : ""}
        ${page.subtitle ? `<p>${escapeHtml(page.subtitle)}</p>` : ""}
      </section>
    </article>
  `;
}
function renderOneWayStoryPhoto(page, index, listId) {
  const item = page.items?.[0] || {};
  const locationName = String(item.name || "").trim();
  const isFreeCheckin = String(item.sourceSectionKey || "").trim() === "check_in";
  const locationAddress = isFreeCheckin ? "" : String(item.metaPrimary || "").trim();
  return `
    <article class="${escapeHtml(storyPageClass(listId, "one-way-story-page one-way-story-photo"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText)}.png">
      ${renderOneWayStoryImage(page.backgroundImage || item.imageUrl, item.name || page.chipText, item.candidateImageUrls)}
      ${locationName ? `
        <div class="one-way-story-location">
          <strong>${escapeHtml(locationName)}</strong>
          ${locationAddress ? `<span>${escapeHtml(locationAddress)}</span>` : ""}
        </div>
      ` : ""}
    </article>
  `;
}

// ../frontend/lib/markup/spotlight.js
function isSpotlightLayout(page) {
  return page.layoutVariant === "spotlight";
}
function isSpotlightPartnerCover(page) {
  return page.layoutVariant === "spotlight-partner" && page.type === "cover";
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
function spotlightV2ListHeading(page) {
  if (isStayListPage(page)) return "Homestay c\u1EA7n l\u01B0u";
  if (isServiceListPage(page)) return "D\u1ECBch v\u1EE5 c\u1EA7n l\u01B0u";
  return String(page?.title || page?.chipText || "").trim();
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
  const subtitle = options.partner ? formatSpotlightV2CoverSubtitle(coverSubtitle) : "";
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
  if (page?.spotlightDesignRevision === 1 && raw === "center") return "center";
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
function renderCarouselMau1Cover(page, index, listId, coverTitle, backgroundImage) {
  const imageUrl = spotlightV3CoverImage(page, backgroundImage);
  return `
    <article class="${escapeHtml(storyPageClass(listId, "carousel-mau-1-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
      <div class="carousel-mau-1-bg">
        ${imageUrl ? renderPreviewImage(imageUrl, coverTitle || "cover") : ""}
      </div>
      <div class="carousel-mau-1-cover-gradient" aria-hidden="true"></div>
      <div class="carousel-mau-1-cover-copy">
        <h1>${escapeHtml(coverTitle || "")}</h1>
      </div>
    </article>
  `;
}
function renderCarouselMau1Page(page, index, listId, list) {
  const item = page.items?.[0] || {};
  const imageUrl = item.imageUrl || page.backgroundImage || coverBackgroundImage(page, list);
  const name = item.rawName || item.name || page.title || "";
  const address = String(item.metaPrimary || "").trim();
  const line = address ? `${name} \u2013 ${address}` : name;
  return `
    <article class="${escapeHtml(storyPageClass(listId, "carousel-mau-1-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(name || page.chipText || "dia-diem")}.png">
      <div class="carousel-mau-1-bg">
        ${renderPreviewImage(imageUrl, name || page.title)}
      </div>
      <div class="carousel-mau-1-page-gradient" aria-hidden="true"></div>
      <div class="carousel-mau-1-place-line"><span aria-hidden="true">\u{1F4CD}</span>${escapeHtml(line)}</div>
    </article>
  `;
}
function renderSpotlightV2Page(page, index, listId, list, options = {}) {
  const item = page.items?.[0] || {};
  const backgroundImage = item.imageUrl || page.backgroundImage || coverBackgroundImage(page, list);
  const titleText = item.rawName || item.name || page.title || "";
  const address = spotlightV2AddressLine(item);
  const hours = spotlightV2HoursLine(item);
  const price = page.spotlightDesignRevision === 1 ? spotlightV2PriceLine(item).replace(/^Giá:\s*/i, "") : spotlightV2PriceLine(item);
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
function renderSpotlightV4Cover(page, index, listId, coverTitle, backgroundImage) {
  const imageUrl = spotlightV3CoverImage(page, backgroundImage);
  const placement = spotlightV3CoverPlacement(page, listId);
  const placementClass = `spotlight-v2-place-${placement}`;
  return `
    <article class="${escapeHtml(storyPageClass(listId, "spotlight-v4-cover", placementClass))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
      <div class="spotlight-v4-cover-bg">
        ${imageUrl ? renderPreviewImage(imageUrl, coverTitle || "cover") : ""}
      </div>
      <div class="spotlight-v4-cover-shade" aria-hidden="true"></div>
      <div class="spotlight-v4-cover-copy">
        ${coverTitle ? `<h1 class="spotlight-v4-cover-title">${escapeHtml(coverTitle)}</h1>` : ""}
      </div>
    </article>
  `;
}
function renderSpotlightV4ImagePage(page, index, listId) {
  const imageUrl = page.backgroundImage || "";
  return `
    <article class="${escapeHtml(storyPageClass(listId, "spotlight-v4-image"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-image.png">
      <div class="spotlight-v4-image-bg">
        ${imageUrl ? renderPreviewImage(imageUrl, "H\xECnh n\u1EC1n") : ""}
      </div>
    </article>
  `;
}
function renderSpotlightV4VenuePage(page, index, listId, list) {
  const item = page.items?.[0] || {};
  const imageUrl = item.imageUrl || page.backgroundImage || coverBackgroundImage(page, list);
  const name = page.title !== void 0 ? String(page.title || "").trim() : item.rawName || item.name || "";
  const address = String(item.metaPrimary || "").trim();
  return `
    <article class="${escapeHtml(storyPageClass(listId, "spotlight-v4-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(name || "dia-diem")}.png">
      <div class="spotlight-v4-page-bg">
        ${imageUrl ? renderPreviewImage(imageUrl, name || "\u0110\u1ECBa \u0111i\u1EC3m") : ""}
      </div>
      <div class="spotlight-v4-page-shade" aria-hidden="true"></div>
      <div class="spotlight-v4-page-copy">
        ${name ? `<h2 class="spotlight-v4-page-name">${escapeHtml(name)}</h2>` : ""}
        ${address ? `<p class="spotlight-v4-page-address">${escapeHtml(address)}</p>` : ""}
      </div>
    </article>
  `;
}
function renderSummaryNotePage(page, index, listId) {
  const title = page.title !== void 0 ? String(page.title || "").trim() : "";
  const rows = (page.items || []).slice(0, 8).map((item) => {
    const name = String(item?.rawName || item?.name || "").trim();
    const address = String(item?.metaPrimary || "").trim();
    const text = address ? `${name} - ${address}` : name;
    return `<div class="summary-note-row"><span class="summary-note-pin" aria-hidden="true">\u{1F4CD}</span><span class="summary-note-row-text">${escapeHtml(text)}</span></div>`;
  }).join("");
  return `
    <article class="${escapeHtml(storyPageClass(listId, "summary-note-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="01-summary-note.png">
      <div class="summary-note-toolbar" aria-hidden="true">
        <div class="summary-note-back"><span class="summary-note-back-icon">\u2039</span><span>T\u1EA5t c\u1EA3 iCloud</span></div>
        <div class="summary-note-actions"><span class="summary-note-share">\u21E7</span><span class="summary-note-more">\u2022\u2022\u2022</span></div>
      </div>
      <div class="summary-note-date">10:23 ng\xE0y 3 th\xE1ng 9, 2026</div>
      <div class="summary-note-content">
        ${title ? `<h1 class="summary-note-title">${escapeHtml(title)}</h1>` : ""}
        <div class="summary-note-list">${rows}</div>
      </div>
    </article>
  `;
}
function spotlightColorAttrs(page) {
  return page.photoPreset === "iphone-color-edit-v1" ? ' data-export-strict="true" data-photo-preset="iphone-color-edit-v1"' : "";
}
function renderSpotlightPhoto(page, source, alt) {
  if (!source) return "";
  if (!page.photoPreset) return renderPreviewImage(source, alt);
  const url = photoDisplayUrl(source, page.photoPreset);
  return renderPreviewImage(url, alt, "color-edit-photo").replace("<img", `<img data-photo-source="${escapeHtml(source)}"`);
}
function renderSpotlightV6Cover(page, index, listId, coverTitle, backgroundImage) {
  const imageUrl = page.backgroundImage || backgroundImage || "";
  const hookTitle = page.title !== void 0 ? String(page.title) : String(coverTitle || "");
  return `
    <article class="${escapeHtml(storyPageClass(listId, "spotlight-v6-cover"))}"${spotlightColorAttrs(page)} data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
      <div class="spotlight-v6-bg">${renderSpotlightPhoto(page, imageUrl, hookTitle || "cover")}</div>
      ${hookTitle ? `<h1 class="spotlight-v6-cover-title">${escapeHtml(hookTitle)}</h1>` : ""}
    </article>
  `;
}
function renderSpotlightV6ImagePage(page, index, listId) {
  const imageUrl = page.backgroundImage || "";
  const title = String(page.title || "").trim();
  return `
    <article class="${escapeHtml(storyPageClass(listId, "spotlight-v6-image"))}"${spotlightColorAttrs(page)} data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-image.png">
      <div class="spotlight-v6-bg">${renderSpotlightPhoto(page, imageUrl, "H\xECnh n\u1EC1n")}</div>
      ${title ? `<h2 class="spotlight-v6-image-title">${escapeHtml(title)}</h2>` : ""}
    </article>
  `;
}
function renderSpotlightV6VenuePage(page, index, listId, list) {
  const item = page.items?.[0] || {};
  const imageUrl = item.imageUrl || page.backgroundImage || coverBackgroundImage(page, list);
  const name = page.title !== void 0 ? String(page.title || "").trim() : item.rawName || item.name || "";
  const address = String(item.metaPrimary || "").trim();
  return `
    <article class="${escapeHtml(storyPageClass(listId, "spotlight-v6-page"))}"${spotlightColorAttrs(page)} data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(name || "dia-diem")}.png">
      <div class="spotlight-v6-bg">${renderSpotlightPhoto(page, imageUrl, name || "\u0110\u1ECBa \u0111i\u1EC3m")}</div>
      <div class="spotlight-v6-page-copy">
        ${name ? `<h2 class="spotlight-v6-page-name">${escapeHtml(name)}</h2>` : ""}
        ${address ? `<p class="spotlight-v6-page-address">${escapeHtml(address)}</p>` : ""}
      </div>
    </article>
  `;
}
function renderSpotlightV6MapPage(page, index, listId) {
  const item = page.items?.[0] || {};
  const imageUrl = page.backgroundImage || item.imageUrl || "";
  const name = String(item.rawName || item.name || "dia-diem").trim();
  return `
    <article class="${escapeHtml(storyPageClass(listId, "spotlight-v6-map-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-map-${sanitizeFilePart(name)}.png">
      <div class="spotlight-v6-map-bg">${imageUrl ? renderPreviewImage(imageUrl, `Google Maps ${name}`) : ""}</div>
    </article>
  `;
}
function renderSpotlightDiaryPage(page, index, listId) {
  const item = page.items?.[0];
  const image = page.backgroundImage || item?.imageUrl || "";
  const placement = ["top-center", "center", "bottom-center"].includes(page.titlePlacement) ? page.titlePlacement : "center";
  const text = [page.title, item?.name, item?.metaPrimary].filter((value) => String(value ?? "").trim());
  const fontSize = Math.min(13, Math.max(9, Number(page.diaryFontSize) || 13));
  return `<article class="${escapeHtml(storyPageClass(listId, "spotlight-v6-diary-page diary-" + placement))}" data-diary-font-size="${fontSize}" style="--diary-font:${fontSize}px" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(item?.name || (index === 0 ? "cover" : "image"))}.png">
    <div class="diary-bg">${image ? renderPreviewImage(image, item?.name || "\u0110\xE0 L\u1EA1t") : ""}</div>
    <div class="diary-safe"><div class="diary-copy">${text.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</div></div>
  </article>`;
}
function renderSpotlightV6MapPlace(page, index, listId) {
  const item = page.items?.[0] || {};
  const imageUrl = page.backgroundImage || item.imageUrl || "";
  const name = page.title !== void 0 ? String(page.title || "").trim() : String(item.rawName || item.name || "").trim();
  const address = String(item.metaPrimary || "").trim();
  return `
    <article class="${escapeHtml(storyPageClass(listId, "spotlight-v6-map-place"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(name || "dia-diem")}.png">
      <div class="spotlight-v6-map-bg">${imageUrl ? renderPreviewImage(imageUrl, name || "\u0110\u1ECBa \u0111i\u1EC3m") : ""}</div>
      <div class="spotlight-v6-map-copy">
        ${name ? `<h2 class="spotlight-v6-map-name">${escapeHtml(name)}</h2>` : ""}
        ${address ? `<p class="spotlight-v6-map-address">${escapeHtml(address)}</p>` : ""}
      </div>
    </article>
  `;
}
function renderSpotlightV5Cover(page, index, listId, coverTitle, backgroundImage) {
  const imageUrl = page.backgroundImage || backgroundImage || "";
  const placement = page.titlePlacement || "bottom-right";
  const hookTitle = page.title !== void 0 ? String(page.title) : String(coverTitle || "");
  return `
    <article class="${escapeHtml(storyPageClass(listId, "spotlight-v5-cover spotlight-v5-position-" + placement))}"${spotlightColorAttrs(page)} data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
      <div class="spotlight-v5-bg">${renderSpotlightPhoto(page, imageUrl, hookTitle || "cover")}</div>
      <div class="spotlight-v5-shade" aria-hidden="true"></div>
      <h1 class="spotlight-v5-cover-hook">${escapeHtml(hookTitle)}</h1>
    </article>
  `;
}
function renderSpotlightV5PlaylistPage(page, index, listId) {
  const lines = Array.isArray(page.playlistLines) ? page.playlistLines.filter(Boolean) : [];
  const placement = page.titlePlacement || "center";
  return `
    <article class="${escapeHtml(storyPageClass(listId, "spotlight-v5-playlist spotlight-v5-position-" + placement))}"${spotlightColorAttrs(page)} data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-playlist.png">
      <div class="spotlight-v5-bg">${renderSpotlightPhoto(page, page.backgroundImage, "Playlist \u0110\xE0 L\u1EA1t")}</div>
      <div class="spotlight-v5-shade" aria-hidden="true"></div>
      <div class="spotlight-v5-playlist-copy">
        ${lines.map((line) => `<div class="spotlight-v5-playlist-line">\u2022 ${escapeHtml(line)}</div>`).join("")}
      </div>
    </article>
  `;
}
function renderSpotlightV5PlacePage(page, index, listId) {
  const item = page.items?.[0] || {};
  const imageUrl = page.backgroundImage || item.imageUrl || "";
  const name = page.title !== void 0 ? String(page.title || "").trim() : String(item.rawName || item.name || "").trim();
  const address = String(item.metaPrimary || "").trim();
  const placement = page.titlePlacement || "bottom-right";
  return `
    <article class="${escapeHtml(storyPageClass(listId, "spotlight-v5-place spotlight-v5-position-" + placement))}"${spotlightColorAttrs(page)} data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(name || "dia-diem")}.png">
      <div class="spotlight-v5-bg">${renderSpotlightPhoto(page, imageUrl, name || "\u0110\u1ECBa \u0111i\u1EC3m")}</div>
      <div class="spotlight-v5-shade" aria-hidden="true"></div>
      <div class="spotlight-v5-place-copy">
        ${name ? `<div class="spotlight-v5-place-name">${escapeHtml(name)}</div>` : ""}
        ${address ? `<div class="spotlight-v5-place-address">${escapeHtml(address)}</div>` : ""}
      </div>
    </article>
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
          ${page.spotlightDesignRevision === 1 && /dịch vụ/i.test(page.chipText || page.title || "") ? "<h2>D\u1ECBch v\u1EE5 c\u1EA7n l\u01B0u</h2>" : `<span>${escapeHtml(page.chipText || "")}</span><h2>${escapeHtml(page.title || "")}</h2>`}
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

// ../frontend/lib/markup/grid.js
function grid4FeatureBackgroundImage(page, list) {
  if (isPortableImageUrl(page.backgroundImage)) return page.backgroundImage;
  return firstPortablePageImage(page) || coverBackgroundImage(page, list);
}
function isGridLayout(page) {
  return page.layoutVariant === "grid-6" || page.layoutVariant === "grid-8" || page.layoutVariant === "grid-4";
}
function isGrid4FeaturePage(page) {
  return page?.layoutVariant === "grid-4" && page?.type === "cover";
}
function grid8IntroForPage(page, pageSubtitle, list) {
  return polishShortVietnameseCopy(pageSubtitle || "");
}
function gridFeatureSubtitle(page, pageSubtitle, list) {
  return polishShortVietnameseCopy(pageSubtitle || "");
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
        ${page.title ? `<h1 class="grid4-feature-title">${escapeHtml(page.title)}</h1>` : ""}
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
        <div class="zigzag-thumb ${escapeHtml(item.imageSource || (item.imageMapped ? "manual" : "fallback"))}${portraitFocusClass(item)}">
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
function grid8FeedCenterHook(page, list) {
  return String(page.title || "").trim();
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
function grid5TitleCard(page, list) {
  return String(page.title || "").trim();
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
  const pool = (coverImageUrls.length > 0 ? coverImageUrls : spotlightV2CoverImagePool).filter(Boolean);
  const seed = `${listId || page?.chipText || "grid8-feed-page"}|${page?.title || page?.chipText || "bg"}`;
  const backgroundPool = pickUniqueCoverGridImages(pool, seed, 4);
  if (backgroundPool.length > 0) {
    const padded = [...backgroundPool];
    while (padded.length < 4) padded.push(padded[padded.length % backgroundPool.length]);
    return padded.slice(0, 4);
  }
  return [];
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
  const raw = String(title || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  const words = upper.split(" ");
  if (words.length <= 5) return escapeHtml(upper);
  const splitAt = Math.ceil(words.length / 2);
  return `${escapeHtml(words.slice(0, splitAt).join(" "))}<br>${escapeHtml(words.slice(splitAt).join(" "))}`;
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
        ${hero ? `<h1 class="grid8-feed-cover-hero">${hero}</h1>` : ""}
        ${tagline ? `<p class="grid8-feed-cover-tagline">${tagline}</p>` : ""}
      </div>
    </article>
  `;
}
function renderGrid8QuaytungDalatBadge() {
  return '<span class="grid8-quaytung-dalat-badge">dalat</span>';
}
function formatGrid8QuaytungCoverTitle(title) {
  const raw = String(title || 'List n\xE0y to\xE0n \u0111\u1ECBa \u0111i\u1EC3m "vu\xFDp"').replace(/\bĐà\s*Lạt\s+VN\b/giu, "\u0110\xE0 L\u1EA1t").replace(/\s+\/\s*VN\b/giu, "").replace(/\s+\bVN\b(?=\s|$|[./])/giu, "").replace(/\s+/g, " ").trim();
  return formatBalancedTitleLines(raw, raw.length >= 44 ? 3 : 2);
}
function renderGrid8QuaytungCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
  const subtitle = String(coverSubtitle || "").replace(/^\[+|\]+$/g, "").trim();
  const titleFitClass = responsiveTitleFitClass(coverTitle, "grid8-quaytung-cover-title", 28, 44);
  return `
    <article class="${escapeHtml(storyPageClass(listId, "grid8-quaytung-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
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
  const raw = String(title || 'List n\xE0y to\xE0n \u0111\u1ECBa \u0111i\u1EC3m "vu\xFDp"').replace(/\bĐà\s*Lạt\s+VN\b/giu, "\u0110\xE0 L\u1EA1t").replace(/\s+\/\s*VN\b/giu, "").replace(/\s+\bVN\b(?=\s|$|[./])/giu, "").replace(/\s+/g, " ").trim().toUpperCase();
  const words = raw.split(" ");
  if (words.length <= 4) return escapeHtml(raw);
  const splitAt = Math.ceil(words.length / 2);
  return `${escapeHtml(words.slice(0, splitAt).join(" "))}<br>${escapeHtml(words.slice(splitAt).join(" "))}`;
}
function renderGrid6QuaytungCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
  const subtitle = String(coverSubtitle || "").replace(/^\[+|\]+$/g, "").trim();
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
        ${page.title ? `<h2 class="grid8-quaytung-menu-title">${escapeHtml(truncateMenuLine(page.title, 32))}</h2>` : ""}
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
  const hero = String(coverTitle || "").trim();
  const hook = String(coverSubtitle || "").trim();
  return `
    <article class="${escapeHtml(storyPageClass(listId, "grid5-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
      <div class="grid5-cover-bg">
        ${renderPreviewImage(backgroundImage, coverTitle)}
      </div>
      <div class="grid5-cover-shade"></div>
      <div class="grid5-cover-copy">
        <div class="grid5-cover-hero-row">
          ${hero ? `<h1 class="grid5-cover-dalat">${escapeHtml(hero)}</h1>` : ""}
          ${hook ? `<p class="grid5-cover-hook">${escapeHtml(hook)}</p>` : ""}
        </div>
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
    <div class="grid6-item ${escapeHtml(item.imageSource || (item.imageMapped ? "manual" : "fallback"))}${portraitFocusClass(item)}">
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
            <strong class="story-image-title ${escapeHtml(responsiveTitleFitClass(displayName, "grid8-title", 34, 52))}">${escapeHtml(displayName)}</strong>
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
              <strong class="story-image-title ${escapeHtml(responsiveTitleFitClass(displayName, "grid8-title", 34, 52))}">${escapeHtml(displayName)}</strong>
              ${showMeta && shouldShowItemAddress(item, showAddress) ? renderGrid8Meta(item.metaPrimary) : ""}
              ${showMeta ? renderGrid8Secondary(item.metaSecondary, { includeOpenHours: options.includeOpenHours === true }) : ""}
            </div>
          </article>
        `;
  }).join("")}
  `;
}

// ../frontend/lib/markup/itinerary.js
function isJourneyGrid8Layout(page) {
  return page.layoutVariant === "journey-4n2d-grid8";
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
  const raw = String(title || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  const words = upper.split(" ");
  if (words.length <= 4) return escapeHtml(upper);
  const splitAt = Math.ceil(words.length / 2);
  return `${escapeHtml(words.slice(0, splitAt).join(" "))}<br>${escapeHtml(words.slice(splitAt).join(" "))}`;
}
function renderItinerary4N3DStackCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage, coverImageUrls = []) {
  const hero = formatItinerary4N3DStackCoverHero(coverTitle);
  const tagline = escapeHtml(String(coverSubtitle || "").replace(/\s+/g, " ").trim());
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
        ${hero ? `<h1 class="itinerary-4n3d-stack-cover-hero">${hero}</h1>` : ""}
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
function renderItinerary4N3DStackCell(item) {
  const name = gridDisplayName(item);
  const address = cleanGridAddress(item?.metaPrimary);
  const focusClass = itinerary4N3DStackRowFocusClass(item);
  return `
    <div class="itinerary-4n3d-stack-page-cell${focusClass} ${escapeHtml(imageSourceClass(item))}">
      ${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}
      <div class="itinerary-4n3d-stack-page-cell-shade"></div>
      <div class="itinerary-4n3d-stack-row-copy">
        <h3 class="itinerary-4n3d-stack-name">${escapeHtml(name)}</h3>
        ${address ? `<p class="itinerary-4n3d-stack-address">${escapeHtml(address)}</p>` : ""}
      </div>
    </div>
  `;
}
function renderItinerary4N3DStackPage(page, index, listId, pageSubtitle = "") {
  const items = (page.items || []).slice(0, 4);
  const heading = String(page.title || "").trim();
  const lead = String(pageSubtitle || page.subtitle || "").trim();
  const [lineOne, lineTwo] = itinerary4N3DStackHeadlineLines(heading);
  const leadHtml = lead ? itinerary4N3DStackBracketLead(lead) : "";
  return `
    <article class="${escapeHtml(storyPageClass(listId, "itinerary-4n3d-stack-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText)}.png">
      <div class="itinerary-4n3d-stack-page-grid">
        ${items.map((item) => renderItinerary4N3DStackCell(item)).join("")}
      </div>
      <div class="itinerary-4n3d-stack-page-head">
        ${heading ? `<h2 class="itinerary-4n3d-stack-page-headline">
          <span>${escapeHtml(lineOne)}</span>
          ${lineTwo ? `<span>${escapeHtml(lineTwo)}</span>` : ""}
        </h2>` : ""}
        ${leadHtml ? `<p class="itinerary-4n3d-stack-page-bracket">${leadHtml}</p>` : ""}
      </div>
    </article>
  `;
}
function formatItineraryTimelineCoverHero(coverTitle) {
  const raw = String(coverTitle || "").replace(/\s+/g, " ").trim();
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
        ${hero ? `<p class="itl-cover-script" lang="vi">${hero}</p>` : ""}
        ${hero ? '<div class="itl-cover-spark">\u2014 \u2726 \u2014</div>' : ""}
      </div>
    </article>
  `;
}
function renderItineraryTimelineRow(item) {
  const time = String(item?.label || "").trim();
  const place = gridDisplayName(item);
  const address = cleanGridAddress(item?.metaPrimary) || String(item?.metaPrimary || "").trim();
  const placeHtml = place ? `<strong class="itl-day-place">${escapeHtml(place)}</strong>` : "";
  return `
    <div class="itl-day-row ${escapeHtml(imageSourceClass(item))}">
      <div class="itl-day-thumb">
        ${renderPreviewImage(item.imageUrl, item.name, "", item.candidateImageUrls)}
      </div>
      <div class="itl-day-track"><span class="itl-day-dot" aria-hidden="true"></span></div>
      <div class="itl-day-copy">
        ${time ? `<p class="itl-day-time">${escapeHtml(time)}</p>` : ""}
        ${placeHtml}
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
function journeyGrid8Intro(page) {
  return polishShortVietnameseCopy(page?.subtitle || "");
}
function renderItineraryItems(items) {
  return items.map((item) => {
    const displayName = gridDisplayName(item);
    const secondary = String(item?.metaSecondary || "").replace(/\s+/g, " ").trim();
    const hoursMatch = secondary.match(/(?:Khung giờ|Open|Hoạt động):\s*([^·]+)/i);
    const hours = hoursMatch?.[1]?.trim() || "";
    return `
      <div class="item-row itinerary-row">
        <div class="thumb-block itinerary-thumb ${item.imageSource || (item.imageMapped ? "manual" : "fallback")}">
          ${renderPreviewImage(item.imageUrl, displayName, "", item.candidateImageUrls)}
        </div>
        <div class="item-copy itinerary-copy">
          ${hours ? `<div class="itinerary-hours">Khung gi\u1EDD ho\u1EA1t \u0111\u1ED9ng: ${escapeHtml(hours)}</div>` : ""}
          <div class="itinerary-name story-image-title">${escapeHtml(displayName)}</div>
          <p class="item-meta story-image-meta itinerary-detail">${escapeHtml(item.metaPrimary)}</p>
        </div>
      </div>
    `;
  }).join("");
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

// ../frontend/lib/markup/pov.js
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
  const raw = String(title || "").replace(/\\n/g, "\n");
  const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return ["", ""];
  if (lines.length === 1) {
    const parts = lines[0].split(/\s+/);
    if (parts.length >= 4) return [parts.slice(0, 2).join(" "), parts.slice(2).join(" ")];
    return [lines[0], ""];
  }
  return lines.slice(0, 2);
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
        ${bracketText ? `<p class="pov-3-v2-bracket">${subtitleHtml}</p>` : ""}
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
function pov3V2StackRowFocusClass(item) {
  return portraitFocusClass(item);
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
  const panelTitle = String(page.title || "").trim();
  const backgroundImage = page.backgroundImage || items[0]?.imageUrl || "";
  return `
    <article class="${escapeHtml(storyPageClass(listId, "pov-3-v2-grid-page"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText || "grid")}.png">
      <div class="pov-3-v2-grid-bg">
        ${renderPreviewImage(backgroundImage, panelTitle)}
      </div>
      <div class="pov-3-v2-grid-panel">
        ${panelTitle ? `<h2 class="pov-3-v2-grid-title">"${escapeHtml(panelTitle)}"</h2>` : ""}
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

// ../frontend/lib/markup/budget.js
function isBudget3N2DCover(page) {
  return page.layoutVariant === "budget-3n2d" && page.type === "cover";
}
function isBudget3N2DStoryCover(page) {
  return page.layoutVariant === "budget-3n2d-story" && page.type === "cover";
}
var MOJIBAKE_TEXT_RE = /(?:áÂ|â€|ï¿½)/;
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
    title: cleanStoryText(page?.title, ""),
    subtitle: cleanStoryText(page?.subtitle, "")
  };
}
function cleanBudgetStoryTotalCopy(page) {
  return {
    chip: cleanStoryText(page?.chipText, BUDGET72_STORY_TEXT.total.chip),
    title: cleanStoryText(page?.title, ""),
    subtitle: cleanStoryText(page?.subtitle, "")
  };
}
function renderBudgetWalletCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
  const titleParts = String(coverTitle || "").split("\xB7").map((part) => part.trim()).filter(Boolean);
  const subtitleParts = String(coverSubtitle || "").split("\xB7").map((part) => part.trim()).filter(Boolean);
  const mainTitle = titleParts[0] || coverTitle || "";
  const hookLine = titleParts[1] || subtitleParts[0] || "";
  const subLine = subtitleParts.length > 1 ? subtitleParts.slice(1).join(" \xB7 ") : titleParts.length > 1 ? "" : subtitleParts.slice(1).join(" \xB7 ");
  return `
    <article class="${escapeHtml(storyPageClass(listId, "budget-wallet-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
      <div class="budget-wallet-cover-bg">
        ${renderPreviewImage(backgroundImage, coverTitle)}
      </div>
      <div class="budget-wallet-cover-shade"></div>
      <div class="budget-wallet-cover-copy">
        <div class="budget-wallet-script">dalat.</div>
        ${mainTitle ? `<h1 class="budget-wallet-title">${escapeHtml(mainTitle)}</h1>` : ""}
        ${hookLine ? `<h2 class="budget-wallet-hook">${escapeHtml(hookLine)}</h2>` : ""}
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
        ${page.title ? `<h2>${escapeHtml(page.title)}</h2>` : ""}
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
        ${page.title ? `<h2>${escapeHtml(page.title)}</h2>` : ""}
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
  const subtitle = String(page.subtitle ?? "").trim();
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
          ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
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
  const clean = normalizeVietnameseDisplayText(value);
  if (/di chuy[eể]n b[aằ]ng xe/i.test(clean) || /ph[uươ]ng trang/i.test(clean)) {
    return "Xe SG - \u0110\xE0 L\u1EA1t";
  }
  if (/check\s*out|l[eê]n xe|v[eề]\s+l[aạ]i\s+sg/i.test(clean)) {
    return "V\u1EC1 l\u1EA1i SG";
  }
  return normalizeVietnameseDisplayText(budgetStoryActivityTitle(clean).replace(/^\s*(\u0102n s\u00e1ng|\u0102n tr\u01b0a|\u0102n t\u1ed1i|C\u00e0 ph\u00ea chi\u1ec1u|C\u00e0 ph\u00ea|Check-in|Ch\u01a1i \u0111\u00eam|Mua qu\u00e0|Ho\u1ea1t \u0111\u1ed9ng|D\u1ecbch v\u1ee5|L\u01b0u tr\u00fa|Cafe|\u0102n nh\u1eb9)\s*:\s*/i, "").replace(/\s+/g, " ").trim());
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

// ../frontend/lib/pageMarkup.js
function renderCoverPageV2(page, index, listId, coverTitle, coverSubtitle, backgroundImage, coverImageUrls = []) {
  if (page.layoutVariant === "threads-toplist-cover") return renderThreadsToplistCover(page, index, listId);
  if (page.layoutVariant === "one-way-story-cover") {
    return renderOneWayStoryCover(page, index, listId, coverTitle, backgroundImage);
  }
  if (page.layoutVariant === "carousel-mau-1-cover") {
    return renderCarouselMau1Cover(page, index, listId, coverTitle, backgroundImage);
  }
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
  if (page.layoutVariant === "spotlight-v4-cover") {
    return renderSpotlightV4Cover(page, index, listId, coverTitle, backgroundImage);
  }
  if (page.layoutVariant === "spotlight-v6-cover") {
    return renderSpotlightV6Cover(page, index, listId, coverTitle, backgroundImage);
  }
  if (page.layoutVariant === "spotlight-v5-cover") {
    return renderSpotlightV5Cover(page, index, listId, coverTitle, backgroundImage);
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
  if (page.layoutVariant === "threads-toplist-page") return renderThreadsToplistPage(page, index, listId);
  if (page.layoutVariant === "one-way-story-road") {
    return renderOneWayStoryRoad(page, index, listId);
  }
  if (page.layoutVariant === "one-way-story-slope") {
    return renderOneWayStorySlope(page, index, listId);
  }
  if (page.layoutVariant === "one-way-story-photo") {
    return renderOneWayStoryPhoto(page, index, listId);
  }
  if (page.layoutVariant === "carousel-mau-1-page") {
    return renderCarouselMau1Page(page, index, listId, list);
  }
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
  if (page.layoutVariant === "spotlight-v4-image") {
    return renderSpotlightV4ImagePage(page, index, listId);
  }
  if (page.layoutVariant === "itinerary-note-day" || page.layoutVariant === "itinerary-note-dark-day" || page.layoutVariant === "itinerary-note-threads-day") return renderItineraryNotePage(page, index, listId);
  if (page.layoutVariant === "itinerary-note-threads-budget") return renderThreadsBudgetPage(page, index, listId);
  if (page.layoutVariant === "threads-expense-sheet") return renderThreadsExpensePage(page, index, listId);
  if (page.layoutVariant === "itinerary-note-timed-day") return renderItineraryNoteTimedPage(page, index, listId);
  if (page.layoutVariant === "summary-note-page") {
    return renderSummaryNotePage(page, index, listId);
  }
  if (page.layoutVariant === "spotlight-v6-image") {
    return renderSpotlightV6ImagePage(page, index, listId);
  }
  if (page.layoutVariant === "spotlight-v6-map-page") {
    return renderSpotlightV6MapPage(page, index, listId);
  }
  if (page.layoutVariant === "spotlight-v6-diary-page") return renderSpotlightDiaryPage(page, index, listId);
  if (page.layoutVariant === "spotlight-v6-map-place") {
    return renderSpotlightV6MapPlace(page, index, listId);
  }
  if (page.layoutVariant === "spotlight-v6-page") {
    return renderSpotlightV6VenuePage(page, index, listId, list);
  }
  if (page.layoutVariant === "spotlight-v5-playlist") {
    return renderSpotlightV5PlaylistPage(page, index, listId);
  }
  if (page.layoutVariant === "spotlight-v5-place") {
    return renderSpotlightV5PlacePage(page, index, listId);
  }
  if (page.layoutVariant === "spotlight-v4-page") {
    return renderSpotlightV4VenuePage(page, index, listId, list);
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
function renderCoverPage(page, ...args) {
  const render = photoRenderArguments(page, args);
  return strictPhotoMarkup(withPageTextScale(renderCoverPageContent(render.page, .../** @type {[number, number, string, string[]?, any?, string[]?]} */
  render.args), render.page), render.preset);
}
function withPageTextScale(html, page) {
  if (page.spotlightDesignRevision === 1) html = html.replace('class="story-page ', `class="story-page spotlight-design-1 ${isServiceListPage(page) ? "spotlight-service-list " : ""}`);
  const scale = Math.max(50, Math.min(100, Number(page.textScale) || 100));
  const size = Number(page.textFontSize);
  const font = Number.isFinite(size) && size >= 8 && size <= 72 ? ` data-text-font-size="${size}"` : "";
  return html.replace("<article ", `<article data-text-scale="${scale}"${font} `);
}
function renderCoverPageContent(page, index, total, listId, hashtags = [], list = null, coverImageUrls = []) {
  if (page.imageRole) return renderCherryBlossom(page, index, listId);
  if (page.localRender) return renderLocalTemplate(page, index, listId);
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
    const title = String(coverTitle || "").trim();
    const titleFitClass = responsiveTitleFitClass(title, "budget72-title", 32, 50);
    return `
      <article class="${escapeHtml(storyPageClass(listId, "budget72-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
        <div class="budget72-cover-bg">
          ${renderPreviewImage(backgroundImage, title)}
        </div>
        <div class="budget72-cover-shade"></div>
        <div class="budget72-cover-copy">
          <div class="budget72-script">dalat.</div>
          ${title ? `<h1 class="budget72-title ${escapeHtml(titleFitClass)}">${formatBalancedTitleLines(title, 3)}</h1>` : ""}
          ${coverSubtitle ? `<p class="budget72-subtitle">${escapeHtml(coverSubtitle)}</p>` : ""}
        </div>
      </article>
    `;
  }
  if (isBudget3N2DStoryCover(page)) {
    const title = coverTitle ? cleanStoryText(coverTitle, "") : "";
    const subtitle = coverSubtitle ? cleanStoryText(coverSubtitle, "") : "";
    return `
      <article class="${escapeHtml(storyPageClass(listId, "budget72-story-cover"))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-cover.png">
        <div class="budget72-story-bg">
          ${renderPreviewImage(backgroundImage, title)}
        </div>
        <div class="budget72-story-cover-shade"></div>
        <div class="budget72-story-cover-copy">
          <div class="budget72-story-script">dalat.</div>
          ${title ? `<h1>${escapeHtml(title)}</h1>` : ""}
          ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
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
          ${coverTitle ? `<h1 class="grid4-feature-title spotlight-cover-hook">${escapeHtml(coverTitle)}</h1>` : ""}
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
           <h1 class="grid6-cover-title ${escapeHtml(responsiveTitleFitClass(coverTitle, "grid6-cover-title", 34, 52))}">${escapeHtml(coverTitle)}</h1>
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
function renderListPage(page, ...args) {
  const render = photoRenderArguments(page, args);
  return strictPhotoMarkup(withPageTextScale(renderListPageContent(render.page, .../** @type {[number, number, string, string[]?, any?]} */
  render.args), render.page), render.preset);
}
function renderListPageContent(page, index, total, listId, hashtags = [], list = null) {
  if (page.imageRole) return renderCherryBlossom(page, index, listId);
  if (page.localRender) return renderLocalTemplate(page, index, listId);
  const pageSubtitle = sanitizeSubtitleForDisplay(page.subtitle, list?.pages || [page]);
  if (String(listId || "").startsWith("threads-food-local") || String(listId || "").startsWith("threads-cafe-local") || String(listId || "").startsWith("threads-mix-local") || String(listId || "").startsWith("threads-mix-text")) {
    const items = Array.isArray(page.items) ? page.items : [];
    const isCafe = String(listId || "").startsWith("threads-cafe-local");
    const isMix = String(listId || "").startsWith("threads-mix-local");
    const isTextOnly = String(listId || "").startsWith("threads-mix-text");
    return '<article class="' + escapeHtml(storyPageClass(listId, "threads-food-preview", isTextOnly ? "threads-food-preview--text-only" : "")) + '" data-list-id="' + escapeHtml(listId) + '" data-page-index="' + index + '"><div class="threads-food-preview-head"><span>THREADS \xB7 XEM TR\u01AF\u1EDAC</span><h2>' + escapeHtml(page.title || (isTextOnly ? "List \u0110\xE0 L\u1EA1t l\u01B0u l\u1EA1i n\xE8" : isMix ? "\u0110i \u0111\xE2u \u1EDF \u0110\xE0 L\u1EA1t?" : isCafe ? "C\xE0 ph\xEA n\xE0o \u1EDF \u0110\xE0 L\u1EA1t?" : "\u0102n g\xEC \u1EDF \u0110\xE0 L\u1EA1t?")) + "</h2><p>File xu\u1EA5t g\u1ED3m TXT " + (isTextOnly ? "12" : "10") + " " + (isMix || isTextOnly ? "\u0111\u1ECBa \u0111i\u1EC3m \u0111a nh\xF3m" : isCafe ? "qu\xE1n c\xE0 ph\xEA" : "qu\xE1n \u0103n") + ", XLSX " + items.filter((item) => item.isPartner).length + " \u0111\u1ED1i t\xE1c" + (isTextOnly ? "; kh\xF4ng c\xF3 \u1EA3nh" : page.photoPreset ? " v\xE0 6 \u1EA3nh Color Edit" : " v\xE0 6 \u1EA3nh g\u1ED1c") + '; kh\xF4ng xu\u1EA5t khung preview n\xE0y.</p></div><ul class="threads-food-preview-list">' + items.map((item) => "<li>" + escapeHtml(item.name || "") + (item.isPartner && item.metaPrimary ? " (" + escapeHtml(compactThreadsLocalAddress(item.metaPrimary)) + ")" : "") + "</li>").join("") + "</ul>" + (isTextOnly ? "" : '<div class="threads-food-preview-photos">' + items.filter((item) => item.imageUrl).map((item) => '<img src="' + escapeHtml(item.imageUrl) + '" alt="' + escapeHtml(item.name || "") + '" loading="lazy" />').join("") + "</div>") + "</article>";
  }
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
    const grid8Title = page.title;
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
    const dayMatch = String(page.chipText || "").trim().match(/^day\s*0*(\d+)$/i);
    const badgeLabel = dayMatch ? `Ng\xE0y ${Number(dayMatch[1])}` : String(page.chipText || "").trim();
    return `
      <article class="${escapeHtml(storyPageClass(listId, "journey4", `journey-page-${dayNumber}`))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(page.chipText)}.png">
        <div class="journey-bg">${renderPreviewImage(page.backgroundImage, page.title, "", portablePageImageCandidates(page, page.backgroundImage))}</div>
        <div class="journey-day-badge">${escapeHtml(badgeLabel)}</div>
        <div class="journey-card">
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
