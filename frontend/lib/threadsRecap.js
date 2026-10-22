import { escapeHtml } from './utils.js';
import { renderPreviewImage } from './markup/shared.js';

// "Tổng kết chuyến đi 3N2Đ": trang 1 là note trắng kiểu Ghi chú iPhone (chi phí
// 2 người, tự cộng tổng và chia theo người), 8 trang sau là ảnh của đúng các dòng
// có ảnh trong note. Toạ độ thiết kế = pixel xuất (1080×1440), preview thu về 397px.
const W = 1080, H = 1440, scale = 397 / W;
const PHOTO_COUNT = 8, PEOPLE = 2;
const NAME = 'Tổng kết chuyến đi 3N2Đ';

const amountOf = item => (/^\d+$/.test(String(item?.metaSecondary ?? '').trim()) ? Number(item.metaSecondary) : null);
/** Cùng cách ghi với backend (threads-trip-recap.ts): 0k, 450k, 1tr, 2tr700k, 1tr050k. */
export function recapMoney(vnd) {
  const k = Math.round(vnd / 1000);
  if (k < 1000) return `${k}k`;
  const tr = Math.floor(k / 1000), rest = k % 1000;
  return rest ? `${tr}tr${String(rest).padStart(3, '0')}k` : `${tr}tr`;
}
export function recapTotals(page) {
  const total = (page?.items || []).reduce((sum, item) => sum + (amountOf(item) || 0), 0);
  return { total, perPerson: Math.round(total / PEOPLE) };
}

const photoKey = value => { try { const url = new URL(value, 'http://local'); return url.pathname.includes('color-edit') ? photoKey(url.searchParams.get('source')) : url.searchParams.get('id') || value; } catch { return value; } };

export function assertThreadsRecapExport(list) {
  const pages = list?.pages || [], note = pages[0];
  if (pages.length !== 1 + PHOTO_COUNT || note?.layoutVariant !== 'threads-recap-note' || !String(note.title || '').trim()) throw new Error(`${NAME} cần 1 trang note và ${PHOTO_COUNT} trang ảnh; hãy tạo lại list.`);
  if ((note.items || []).some(item => !String(item.name || '').trim() || amountOf(item) === null)) throw new Error(`${NAME}: dòng chi phí thiếu tên hoặc số tiền; chưa xuất.`);
  const featured = (note.items || []).filter(item => String(item.imageUrl || '').trim()).map(item => item.imageUrl);
  const shown = pages.slice(1).map(page => page.backgroundImage || '');
  if (featured.length !== PHOTO_COUNT || new Set(shown.map(photoKey)).size !== PHOTO_COUNT || shown.some((url, index) => !url || url !== featured[index] || pages[index + 1].layoutVariant !== 'threads-recap-photo')) {
    throw new Error(`${NAME}: ${PHOTO_COUNT} ảnh phải là ảnh riêng, không trùng, đúng thứ tự các địa điểm trong note; chưa xuất.`);
  }
}

const css = `<style>
.story-page.threads-recap{position:relative;display:block;width:397px!important;height:${H * scale}px!important;min-height:0!important;max-width:none!important;flex:0 0 397px!important;aspect-ratio:3/4;padding:0!important;overflow:hidden;border-radius:0!important;box-shadow:none;box-sizing:border-box;background:#fff!important;isolation:isolate}
.threads-recap-design{position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform:scale(${scale});transform-origin:top left;background:#fff;color:#2b2b2d}
.threads-recap .threads-recap-design,.threads-recap .threads-recap-design *{font-family:-apple-system,'SF Pro Text','Segoe UI','Be Vietnam Pro',sans-serif!important}
.threads-recap-body{position:absolute;left:56px;right:56px;top:64px;bottom:56px}
.threads-recap-body h1{margin:0!important;font-weight:700!important;line-height:1.22!important;color:#1d1d1f!important;letter-spacing:-.5px;white-space:pre-wrap;overflow-wrap:normal;word-break:normal}
.threads-recap-body h1+h1{margin:6px 0 30px 14px!important}
.threads-recap-row{margin:0!important;font-weight:400!important;line-height:1.5!important;color:#2b2b2d!important;white-space:pre-wrap;overflow-wrap:normal;word-break:normal}
.threads-recap-hl{color:#e2a610}
.threads-recap-per{font-weight:600!important;text-decoration:underline;text-decoration-thickness:3px;text-underline-offset:7px;color:#1d1d1f!important}
.threads-recap-photo img{display:block;width:100%;height:100%;object-fit:cover;object-position:center;border-radius:0!important}
.threads-recap[data-recap-overflow="true"]{outline:2px solid #ef4444}
</style>`;

export function renderThreadsRecap(page, index, listId) {
  const exportName = `${String(index + 1).padStart(2, '0')}-tong-ket-chuyen-di.png`;
  const open = `<article class="story-page threads-recap${page.layoutVariant === 'threads-recap-photo' ? ' threads-recap-photo' : ''}" data-export-strict="true"${page.photoPreset ? ` data-photo-preset="${escapeHtml(page.photoPreset)}"` : ''} data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${exportName}">${css}`;
  if (page.layoutVariant === 'threads-recap-photo') {
    return `${open}<div class="threads-recap-design">${renderPreviewImage(page.backgroundImage, page.title || 'Ảnh địa điểm').replace('loading="lazy"', 'loading="eager"')}</div></article>`;
  }
  const size = Number(page.textFontSize) || 44;
  const items = page.items || [];
  const { total, perPerson } = recapTotals(page);
  const rows = items.map((item, i) => {
    const amount = recapMoney(amountOf(item) || 0);
    // Dòng có phép nhân (thuê xe theo ngày) tô vàng số tiền như bài gốc.
    const value = item.metaPrimary ? `${escapeHtml(item.metaPrimary)} = <span class="threads-recap-hl">${amount}</span>` : amount;
    return `<p class="threads-recap-row"><span data-edit-field="items.${i}.name">${escapeHtml(item.name)}</span>: ${value}</p>`;
  }).join('');
  return `${open}<div class="threads-recap-design"><div class="threads-recap-body" style="font-size:${size}px">
<h1 data-edit-field="title" style="font-size:${Math.round(size * 1.55)}px">${escapeHtml(page.title || '')}</h1><h1 style="font-size:${Math.round(size * 1.55)}px">${escapeHtml(page.chipText || `${PEOPLE} Người`)}</h1>
${rows}<p class="threads-recap-row">Tổng ${recapMoney(total)}</p><p class="threads-recap-row threads-recap-per">Chia theo người: ${recapMoney(perPerson)}</p>
${/MẪU MINH HỌA/i.test(page.subtitle || '') ? `<p class="threads-recap-row" style="font-size:.6em;color:#8e8e93!important;margin-top:16px!important">${escapeHtml(page.subtitle)}</p>` : ''}</div></div></article>`;
}

export function checkThreadsRecapLayout(root, strict = false) {
  const pages = root?.matches?.('.threads-recap') ? [root] : [...(root?.querySelectorAll?.('.threads-recap') || [])];
  for (const page of pages) {
    const body = page.querySelector('.threads-recap-body');
    if (!body) continue;
    const bounds = body.getBoundingClientRect();
    const invalid = [...body.children].some(node => {
      const rect = node.getBoundingClientRect();
      return rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.bottom > bounds.bottom + 1 || node.scrollWidth > node.clientWidth + 1;
    });
    page.dataset.recapOverflow = String(invalid);
    page.title = invalid ? 'Tràn chữ: rút gọn tên hoặc giảm cỡ chữ trước khi xuất.' : '';
    if (strict && invalid) throw new Error(`${NAME}: note bị tràn chữ; hãy rút gọn tên hoặc giảm cỡ chữ (không tự cắt chữ).`);
  }
}
