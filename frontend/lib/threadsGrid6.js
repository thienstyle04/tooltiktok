import { escapeHtml } from './utils.js';
import { renderPreviewImage } from './markup/shared.js';

const scale = 397 / 1080;
const ownPhoto = (url, name) => renderPreviewImage(url, name).replace('loading="lazy"', 'loading="eager"');
export function assertThreadsGrid6Export(list) {
  const pages = list.pages || [], names = new Set(), photos = new Set();
  const photoId = value => { try { const url = new URL(value, 'http://local'); return url.pathname.includes('color-edit') ? photoId(url.searchParams.get('source')) : url.searchParams.get('id') || value; } catch { return value; } };
  const addPhoto = url => { const key = photoId(url); if (!key || photos.has(key)) throw new Error('Threads · Lưới 6 ảnh: thiếu ảnh hoặc trùng ảnh; chưa xuất list.'); photos.add(key); };
  if (pages.length !== 5 || pages[0]?.type !== 'cover' || !pages[0].title?.trim()) throw new Error('Threads · Lưới 6 ảnh cần đủ 5 trang và hook.');
  addPhoto(pages[0].backgroundImage);
  pages.slice(1).forEach((page, index) => {
    const items = page.items || [], allowed = index < 2 ? ['check_in', 'khu_du_lich', 'hoat_dong', 'dia_diem_lich_su'] : [index === 2 ? 'cafe' : 'quan_an'];
    if (page.layoutVariant !== 'threads-grid6-page' || items.length !== 6 || items.filter(item => item.isPartner).length > 2) throw new Error('Threads · Lưới 6 ảnh: mỗi trang cần đủ 6 ô, tối đa 2 đối tác.');
    for (const item of items) {
      const name = String(item.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
      if (!name || names.has(name) || !allowed.includes(item.sourceSectionKey)) throw new Error('Threads · Lưới 6 ảnh: địa điểm trùng hoặc sai nhóm.');
      names.add(name); addPhoto(item.imageUrl);
    }
  });
}
const pin = '<svg aria-hidden="true" width="22" height="32" viewBox="0 0 22 32"><path fill="#f04444" d="M11 0a10 10 0 0 0-10 10c0 7 10 21 10 21s10-14 10-21A10 10 0 0 0 11 0Z"/><circle cx="11" cy="10" r="4" fill="#ffb0a0"/></svg>';
const leaf = '<svg viewBox="0 0 80 84" aria-hidden="true"><path d="m40 0 7 23 11-9-1 19 18-6-8 17 12 4-25 17-9-2-2 20-5 1 1-21-11 3L2 50l12-5-8-16 19 4-1-20 11 10Z" fill="#d86120"/><path d="m40 10 2 51M14 43l26 18 26-19M27 27l13 34 14-34" stroke="#f9b843" fill="none" stroke-width="2"/></svg>';
const css = `<style>
.story-page.threads-grid6{position:relative;display:block;width:397px!important;height:${1920 * scale}px!important;min-height:0!important;max-width:none!important;flex:0 0 397px!important;aspect-ratio:9/16;border-radius:0!important;box-shadow:none;padding:0!important;overflow:hidden;background:#344139;isolation:isolate;box-sizing:border-box}
.threads-grid6-design{position:absolute;left:0;top:0;width:1080px;height:1920px;transform:scale(${scale});transform-origin:top left;font-family:'Be Vietnam Pro',sans-serif;color:#fff}
.threads-grid6-design img{display:block;width:100%;height:100%;object-fit:cover;object-position:center;border-radius:0!important}
.threads-grid6-cover-photo{position:absolute;inset:0}.threads-grid6-hook{position:absolute;left:86px;top:890px;width:700px;margin:0!important;font-family:'Be Vietnam Pro',sans-serif!important;font-size:38px;line-height:1.25;font-weight:600!important;color:#fff;white-space:pre-wrap;overflow-wrap:normal;word-break:normal;text-align:left;text-shadow:none}
.threads-grid6-matrix{display:grid;grid-template-columns:540px 540px;grid-template-rows:640px 640px 640px;width:1080px;height:1920px;gap:0}
.threads-grid6-cell{position:relative;overflow:hidden;width:540px;height:640px;background:#344139}
.threads-grid6-label{position:absolute;top:70px;left:50%;transform:translateX(-50%);width:max-content;max-width:492px;background:#000;color:#fff;padding:10px 16px;box-sizing:border-box;font-family:'Be Vietnam Pro',sans-serif!important;font-size:32px;font-weight:400!important;line-height:1.25;text-align:center;white-space:normal;overflow-wrap:normal;word-break:normal}
.threads-grid6-label svg{display:inline-block;width:22px;height:32px;vertical-align:-5px;margin-right:8px}.threads-grid6-leaf{position:absolute;left:500px;width:80px;height:84px;pointer-events:none}.threads-grid6-leaf svg{display:block;width:100%;height:100%}
.threads-grid6[data-grid6-overflow="true"]{outline:2px solid #ef4444}
</style>`;

// Inner design coordinates are output pixels, so saved text sizes are exact.
export function renderThreadsGrid6(page, index, listId) {
  const cover = page.type === 'cover';
  const placement = page.titlePlacement || 'mid-left';
  const y = placement.startsWith('top') ? 180 : placement.startsWith('bottom') ? 1550 : 890;
  const right = placement.endsWith('right'), center = placement.endsWith('center') || placement === 'center';
  const x = right ? 294 : center ? 190 : 86;
  const body = cover ? `<div class="threads-grid6-cover-photo">${ownPhoto(page.backgroundImage, 'Ảnh bìa Đà Lạt')}</div><h1 class="threads-grid6-hook" data-edit-field="title" style="left:${x}px;top:${y}px;text-align:${center ? 'center' : right ? 'right' : 'left'}">${escapeHtml(page.title || '')}</h1>`
    : `<div class="threads-grid6-matrix">${(page.items || []).map((item, i) => `<div class="threads-grid6-cell">${ownPhoto(item.imageUrl, item.name)}<div class="threads-grid6-label" style="font-size:${Number(page.textFontSize) || 32}px">${pin}<span data-edit-field="items.${i}.name">${escapeHtml(item.name || '')}</span></div></div>`).join('')}</div>${index === 1 ? [600, 1240].map(y => `<div class="threads-grid6-leaf" style="top:${y}px">${leaf}</div>`).join('') : ''}`;
  return `<article class="story-page threads-grid6" data-export-strict="true"${page.photoPreset ? ` data-photo-preset="${escapeHtml(page.photoPreset)}"` : ''} data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-name="${String(index + 1).padStart(2, '0')}-threads-grid6.png">${css}<div class="threads-grid6-design">${body}</div></article>`;
}

export function checkThreadsGrid6Layout(root, strict = false) {
  const pages = root?.matches?.('.threads-grid6') ? [root] : [...(root?.querySelectorAll?.('.threads-grid6') || [])];
  for (const page of pages) {
    const frame = page.querySelector('.threads-grid6-design');
    if (!frame) continue;
    const bounds = frame.getBoundingClientRect();
    const invalid = [...page.querySelectorAll('.threads-grid6-label,.threads-grid6-hook')].some(node => {
      const rect = node.getBoundingClientRect();
      const label = node.classList.contains('threads-grid6-label');
      const text = node.querySelector('span') || node;
      const range = document.createRange(); range.selectNodeContents(text);
      const lines = new Set([...range.getClientRects()].map(box => Math.round(box.top * 10) / 10));
      return (label && lines.size > 2) || node.scrollWidth > node.clientWidth + 1 || rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1;
    });
    page.dataset.grid6Overflow = String(invalid);
    page.title = invalid ? 'Tràn chữ: rút gọn tên/hook hoặc chỉnh cỡ chữ/vị trí trước khi xuất.' : '';
    if (invalid && strict) throw new Error(`Threads · Lưới 6 ảnh: tràn chữ trang ${Number(page.dataset.pageIndex) + 1}; tên tối đa hai dòng, không tự cắt hoặc giảm cỡ chữ.`);
  }
}
