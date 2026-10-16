import { escapeHtml, sanitizeFilePart } from './utils.js';

const properties = new Set(['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textAlign','color','background','borderRadius','opacity','objectFit','objectPosition','padding','display','alignItems','justifyContent','whiteSpace','transform','transformOrigin','border','boxShadow']);
function css(style = {}) {
  return Object.entries(style).filter(([key, value]) => properties.has(key) && !/[<>;]|url\s*\(|expression\s*\(/i.test(String(value)))
    .map(([key, value]) => `${key.replace(/[A-Z]/g, s => '-'+s.toLowerCase())}:${typeof value === 'number' && ['fontSize','letterSpacing','borderRadius','padding'].includes(key) ? value+'px' : value}${key === 'fontFamily' ? ' !important' : ''}`).join(';');
}
function field(page, key) {
  if (key === 'title' || key === 'subtitle' || key === 'backgroundImage') return String(page[key] || '');
  const cover = /^coverImages\.(\d+)$/.exec(key || '');
  if (cover) return String(page.coverImages?.[Number(cover[1])] || '');
  const match = /^items\.(\d+)\.(name|metaPrimary|metaSecondary|imageUrl)$/.exec(key || '');
  return match ? String(page.items?.[Number(match[1])]?.[match[2]] || '') : '';
}
export function renderLocalTemplate(page, index, listId) {
  const model = page.localRender;
  if (!model || !(model.width > 0 && model.height > 0) || model.width > 4096 || model.height > 4096) throw new Error('Mẫu local thiếu mô hình render/phiên bản.');
  const fonts = model.fonts.map(font => {
    if (!/^[a-zA-Z0-9 _-]+$/.test(font.family) || !/^\/api\/local-templates\/local-[a-z0-9-]+\/\d+\/assets\/[\w.-]+$/.test(font.url)) throw new Error('Tài nguyên font local không hợp lệ.');
    return `@font-face{font-family:"${font.family}";src:url("${font.url}") format("woff2");font-weight:${Number(font.weight)||400};font-style:normal;font-display:block;}`;
  }).join('\n');
  const nodes = model.nodes.map((node, n) => {
    const geometry = `position:absolute;box-sizing:border-box;left:${Number(node.x)}px;top:${Number(node.y)}px;width:${Number(node.width)}px;height:${Number(node.height)}px;${css(node.style)}`;
    if (node.kind === 'shape') {
      if (node.style?.boxShadow && node.style.boxShadow !== 'none' && !/\binset\b/i.test(node.style.boxShadow)) {
        // html2canvas paints outer rounded shadows over the fill at the end caps.
        // Keep the shadow behind a separate fill layer, matching browser paint
        // order in both preview and exports without modifying saved models.
        const shadow = `${geometry};background:transparent`;
        const fill = `${geometry};box-shadow:none`;
        return `<div aria-hidden="true" style="${escapeHtml(shadow)}"></div><div aria-hidden="true" style="${escapeHtml(fill)}"></div>`;
      }
      return `<div aria-hidden="true" style="${escapeHtml(geometry)}"></div>`;
    }
    if (node.kind === 'image') {
      const owner = node.itemIndices?.map(i => page.items?.[i]).find(item => item?.imageUrl);
      const src = owner?.imageUrl || (node.field ? field(page, node.field) : node.src);
      if (!src && node.required) throw new Error(`Mẫu local: thiếu ảnh ở ${node.label || 'trang '+(index+1)}.`);
      if (!src) return '';
      if (!/^\/(?:api\/local-templates\/|assets\/)|^https?:\/\//i.test(src)) throw new Error('URL ảnh local không hợp lệ.');
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(owner?.name || node.label || '')}" loading="eager" decoding="sync" draggable="false" data-local-required="${node.required !== false}" style="${escapeHtml(geometry)}"/>`;
    }
    if (node.itemIndices && node.fieldColors) {
      const content = node.itemIndices.map(i => (node.fields || ['name']).map(key => {
        const value = String(page.items?.[i]?.[key] || '');
        return value ? `<span data-local-field="${escapeHtml(key)}" style="display:block;font-family:inherit!important;font-size:inherit;line-height:inherit;font-weight:inherit;${escapeHtml(css({ color: node.fieldColors[key] || node.style?.color || 'inherit' }))}">${escapeHtml(value)}</span>` : '';
      }).join('')).join('');
      return `<div data-local-text="${n}" data-local-label="${escapeHtml(node.label || page.title || 'Nội dung')}" style="${escapeHtml(geometry)};white-space:pre-line;overflow:visible">${content}</div>`;
    }
    let text = node.field ? field(page, node.field) : String(node.text || '');
    if (node.itemIndices) text = node.itemIndices.map(i => (node.fields || ['name']).map(key => String(page.items?.[i]?.[key] || '')).filter(Boolean).join(node.separator ?? ' - ')).filter(Boolean).join('\n');
    return `<div data-local-text="${n}" data-local-label="${escapeHtml(node.label || page.title || 'Nội dung')}" style="${escapeHtml(geometry)};white-space:pre-line;overflow:visible">${escapeHtml(text)}</div>`;
  }).join('');
  const ratio = 810 / model.width;
  return `<article class="story-page local-template-page" data-local-template="${escapeHtml(model.templateId)}" data-local-fonts="${escapeHtml(JSON.stringify(model.fonts))}" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index+1).padStart(2,'0')}-${sanitizeFilePart(page.title || 'page')}.png" style="width:810px;height:${model.height*ratio}px;aspect-ratio:${model.width}/${model.height}"><style>${fonts}</style><div class="local-template-canvas" style="position:absolute;inset:0;width:${model.width}px;height:${model.height}px;transform:scale(${ratio});transform-origin:0 0">${nodes}</div></article>`;
}

export function checkLocalTemplateLayout(root, strict = false) {
  const pages = root?.matches?.('.local-template-page') ? [root] : [...(root?.querySelectorAll?.('.local-template-page') || [])];
  for (const page of pages) {
    const overflow = [...page.querySelectorAll('[data-local-text]')].filter(node => node.scrollHeight > node.clientHeight + 2 || node.scrollWidth > node.clientWidth + 2);
    page.dataset.localOverflow = String(Boolean(overflow.length));
    page.title = overflow.length ? `Nội dung quá dài: ${overflow.map(n=>n.dataset.localLabel).join(', ')}` : '';
    if (strict && overflow.length) throw new Error(`Mẫu local: tràn chữ ở trang ${Number(page.dataset.pageIndex)+1}, ${overflow.map(n=>n.dataset.localLabel).join(', ')}. Hãy chỉnh nội dung hoặc cỡ chữ trước khi xuất.`);
  }
}
export async function ensureLocalTemplateFonts(root) {
  const pages = root?.matches?.('.local-template-page') ? [root] : [...(root?.querySelectorAll?.('.local-template-page') || [])];
  const fonts = new Map();
  for (const page of pages) for (const font of JSON.parse(page.dataset.localFonts || '[]')) fonts.set(font.family+font.weight, font);
  for (const font of fonts.values()) {
    let timer;
    const loaded = await Promise.race([
      document.fonts.load(`${font.weight} 32px "${font.family}"`, 'Đà Lạt'),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Mẫu local: quá thời gian tải font ${font.family}; hãy thử lại.`)), 10000); }),
    ]).catch(error => { throw new Error(`Mẫu local: không tải được font ${font.family}; hãy kiểm tra tài nguyên và thử lại. ${error.message || ''}`); }).finally(() => clearTimeout(timer));
    if (!loaded.length || !document.fonts.check(`${font.weight} 32px "${font.family}"`, 'Đà Lạt')) throw new Error(`Mẫu local: thiếu font ${font.family}; không xuất bằng font thay thế.`);
  }
}
