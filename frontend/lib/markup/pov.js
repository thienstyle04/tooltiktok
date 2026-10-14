// Mẫu POV 3 (v2 stack/grid, Maikem): tagline, dòng ảnh và lưới.
import { escapeHtml, sanitizeFilePart } from '../utils.js';
import { cafeLightPrice, cleanGridAddress, imageSourceClass, portraitFocusClass, pov3V2BracketSubtitle, renderPreviewImage, storyPageClass } from './shared.js';

export function renderPovMaikemCover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
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
  const raw = String(title || '').replace(/\\n/g, '\n');
  const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return ['', ''];
  if (lines.length === 1) {
    const parts = lines[0].split(/\s+/);
    if (parts.length >= 4) return [parts.slice(0, 2).join(' '), parts.slice(2).join(' ')];
    return [lines[0], ''];
  }
  return lines.slice(0, 2);
}

export function renderPov3V2Cover(page, index, listId, coverTitle, coverSubtitle, backgroundImage) {
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
        ${bracketText ? `<p class="pov-3-v2-bracket">${subtitleHtml}</p>` : ''}
      </div>
    </article>
  `;
}

function isImageMappingNote(value) {
  return /^(?:Ảnh (?:đã map|tự map|minh họa|đối tác)|Thông tin đối tác)/i.test(String(value || '').trim());
}

const POV_3_V2_STACK_TAGLINE_MAX = 92;

function trimIncompleteTaglineTail(text) {
  let result = String(text || '').replace(/\s+/g, ' ').trim();
  const trailing = /\s+(?:khi|va|và|và|cua|của|cho|với|với|mà|nên|để|de|trong|tại|tại|ở|o|là|la|còn|con|như|nhu|nếu|neu|sau|trước|trước)$/i;
  for (let i = 0; i < 4 && trailing.test(result); i += 1) {
    result = result.replace(trailing, '').trim();
  }
  return result;
}

function truncatePov3V2StackTagline(value, maxLen = POV_3_V2_STACK_TAGLINE_MAX) {
  const clean = trimIncompleteTaglineTail(
    String(value || '')
      .replace(/^\[+|\]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  if (!clean) return '';
  if (clean.length <= maxLen) {
    return /[.!?…]$/.test(clean) ? clean : `${clean}.`;
  }
  const slice = clean.slice(0, maxLen + 1);
  const sentenceEnd = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
  if (sentenceEnd >= maxLen * 0.35) {
    return clean.slice(0, sentenceEnd + 1).trim();
  }
  const cut = clean.slice(0, maxLen);
  const sp = cut.lastIndexOf(' ');
  const wordCut = (sp > maxLen * 0.45 ? cut.slice(0, sp) : cut).trim();
  const trimmed = trimIncompleteTaglineTail(wordCut);
  if (!trimmed) return '';
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}…`;
}

function pov3V2StackRowFocusClass(item) {
  return portraitFocusClass(item);
}

function isCompletePov3V2Tagline(text) {
  const t = String(text || '').trim();
  if (t.length < 18) return false;
  if (!/[.!?…]$/.test(t)) return false;
  return !/\s+(?:khi|va|và|của|cho|với|mà|nên|để|trong|tại|ở|là|còn|như|nếu|sau|trước|đà|dalat|lối|qua|chủ|duy|nào|đâu|trôi|vô)\s*[.…]?$/i.test(t);
}

function buildFallbackPov3V2Tagline(item) {
  const name = String(item?.name || 'địa điểm này').trim();
  const section = String(item?.sourceSectionKey || '').trim();
  if (section === 'check_in') {
    return `${name} là góc check-in nổi bật ở Đà Lạt, dễ chụp và dễ ghép vào lịch đi.`;
  }
  if (section === 'khu_du_lich' || section === 'hoat_dong') {
    return `${name} — điểm tham quan đáng ghé nếu bạn thích view rộng và không gian chill.`;
  }
  return `Ghé ${name} nếu muốn thêm một điểm dừng gọn trong chuyến đi Đà Lạt.`;
}

function highlightLooksTruncated(raw) {
  const t = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!t) return true;
  if (!/[.!?…]$/.test(t)) return true;
  return /\s+(?:khi|va|và|của|cho|với|mà|nên|để|trong|tại|ở|là|còn|như|nếu|sau|trước)$/i.test(t);
}

function finalizePov3V2StackTagline(item) {
  const label = String(item.label || '').trim();
  const note = String(item.imageNote || '').trim();
  const raw = (label && !isImageMappingNote(label) ? label : '')
    || (note && !isImageMappingNote(note) ? note : '');
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
  const address = String(item.metaPrimary || '').trim();
  const taglineTextRaw = pov3V2StackTagline(item);
  const taglineText = taglineTextRaw
    ? (taglineTextRaw.startsWith('[') ? taglineTextRaw : `[ ${taglineTextRaw.replace(/^[\[(\s]+|[\]\)\s]+$/g, '')} ]`)
    : '';
  return `
    <section class="pov-3-v2-stack-row${pov3V2StackRowFocusClass(item)} ${escapeHtml(imageSourceClass(item))}">
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

export function renderPov3V2StackPage(page, index, listId) {
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

export function renderPov3V2GridPage(page, index, listId, pageSubtitle) {
  const items = (page.items || []).slice(0, 9);
  const panelTitle = String(page.title || '').trim();
  const backgroundImage = page.backgroundImage || items[0]?.imageUrl || '';
  return `
    <article class="${escapeHtml(storyPageClass(listId, 'pov-3-v2-grid-page'))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-${sanitizeFilePart(page.chipText || 'grid')}.png">
      <div class="pov-3-v2-grid-bg">
        ${renderPreviewImage(backgroundImage, panelTitle)}
      </div>
      <div class="pov-3-v2-grid-panel">
        ${panelTitle ? `<h2 class="pov-3-v2-grid-title">"${escapeHtml(panelTitle)}"</h2>` : ''}
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

export function renderPovMaikemPage(page, index, listId) {
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
