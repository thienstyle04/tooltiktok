import { escapeHtml } from './utils.js';

const groups = ['Cà phê', 'Đi chơi / check-in', 'Quán ăn'];
const keys = [['cafe'],['check_in','khu_du_lich','hoat_dong','dia_diem_lich_su'],['quan_an']];
// Mirrors an iPhone Notes screenshot in dark mode: status bar, "Tất cả iCloud"
// nav, emoji group headings (no note title line, as in the sample), indented en-dash rows, bottom toolbar, home bar.
const headings = ['Quán Cafe xinh', 'Địa điểm đi chơi', 'Địa điểm ăn'];
const emojis = ['🍂', '🍂', '🍪'];
const svg = (paths, extra = '') => `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${paths}</svg>`;
const navIcons = [
  svg('<circle cx="16" cy="16" r="14"/><path d="M11.5 13h7.5a4.5 4.5 0 0 1 0 9h-5"/><path d="m14.5 9.5-3.5 3.5 3.5 3.5"/>'),
  svg('<circle cx="16" cy="16" r="14"/><path d="M20.5 13H13a4.5 4.5 0 0 0 0 9h5"/><path d="m17.5 9.5 3.5 3.5-3.5 3.5"/>', ' class="note-dark-off"'),
  svg('<path d="M11 12H8v17h16V12h-3M16 21V2.5m-5.5 5.5L16 2.5 21.5 8"/>'),
  svg('<circle cx="16" cy="16" r="14"/><circle cx="9.5" cy="16" r="1.3" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r="1.3" fill="currentColor" stroke="none"/><circle cx="22.5" cy="16" r="1.3" fill="currentColor" stroke="none"/>'),
];
const footerIcons = [
  svg('<circle cx="6" cy="9" r="4.5" fill="currentColor" stroke="none"/><path d="m3.8 9 1.6 1.6 2.8-3" stroke="#000" stroke-width="1.5"/><path d="M14 9h16"/><circle cx="6" cy="23" r="4.2"/><path d="M14 23h16"/>'),
  svg('<path d="m21 9-9.5 9.5a2.8 2.8 0 0 0 4 4L26 12a5.5 5.5 0 0 0-7.8-7.8L7.5 15a8 8 0 0 0 11.3 11.3l7-7"/>'),
  svg('<circle cx="16" cy="16" r="14"/><path d="m11.5 25 1.8-9L16 8l2.7 8 1.8 9"/><path d="M13.3 16h5.4"/>'),
  svg('<path d="M24 17v11H4V8h11"/><path d="M26.5 3.5a2.5 2.5 0 0 1 3.5 3.5L17 20l-4.7 1.2L13.5 16.5z"/>'),
];
const scale = 397/1080;
// Clock and battery vary per list so consecutive posts are not pixel-identical.
const statusFor = listId => {
  let h = 2166136261;
  for (const ch of String(listId || '')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const minutes = 8 * 60 + h % (15 * 60);
  return { time: `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`, battery: 42 + (h >>> 12) % 55 };
};
const statusBar = ({ time, battery }) => `<div class="note-dark-status"><span class="note-dark-time">${time}<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M16 4a8 8 0 0 0-8 8v6l-3 4h22l-3-4v-6a8 8 0 0 0-8-8zm-3.5 20a3.5 3.5 0 0 0 7 0z"/><path d="M4 3 28 29" stroke="#000" stroke-width="4.5"/><path d="M4 3 28 29" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></span><span class="note-dark-spacer"></span><svg class="note-dark-signal" viewBox="0 0 52 34" fill="currentColor" aria-hidden="true"><rect x="0" y="23" width="9" height="11" rx="2.5"/><rect x="14" y="16" width="9" height="18" rx="2.5"/><rect x="28" y="8" width="9" height="26" rx="2.5"/><rect x="42" y="0" width="9" height="34" rx="2.5" opacity=".35"/></svg><svg class="note-dark-wifi" viewBox="0 0 46 34" fill="currentColor" aria-hidden="true"><path d="M23 34 15.5 25.6a11 11 0 0 1 15 0zM9.6 19a19.5 19.5 0 0 1 26.8 0l4.3-4.6a26 26 0 0 0-35.4 0zM3.4 12.4a28.5 28.5 0 0 1 39.2 0L47 7.7a35 35 0 0 0-48 0z"/></svg><span class="note-dark-battery"><span>${battery}</span></span></div>`;
export function assertNoteDarkExport(list) {
  const page=list?.pages?.[0];
  if(list?.pages?.length!==1||page?.type!=='list'||page.layoutVariant!=='threads-note-dark-list'||!page.title?.trim()||page.items?.length!==18)throw Error('Note 01 · Đen tối giản cần một trang, tiêu đề và đủ 18 tên.');
  const names=new Set();
  for(let g=0;g<3;g++){
    const rows=page.items.slice(g*6,g*6+6);
    if(rows.filter(i=>i.isPartner).length>2)throw Error(`Note 01: ${groups[g]} chỉ được tối đa 2 đối tác.`);
    for(const row of rows){const name=String(row.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().replace(/[^a-z0-9]/g,'');if(!name||names.has(name)||!keys[g].includes(row.sourceSectionKey)||row.imageUrl||row.metaPrimary||row.metaSecondary)throw Error('Note 01: tên trùng, trống, sai nhóm hoặc có ảnh/địa chỉ; chưa xuất.');names.add(name);}
  }
}

export function renderNoteDark(page,index,listId) {
  const ratio=(Number(page.textFontSize)||42)/42*(Number(page.textScale)||100)/100;
  const placement=page.titlePlacement||'top-left',align=placement.endsWith('right')?'right':placement.endsWith('center')||placement==='center'?'center':'left';
  const justify=placement.startsWith('bottom')?'flex-end':placement.startsWith('mid')||placement==='center'?'center':'flex-start';
  const rowJustify=align==='right'?'flex-end':align==='center'?'center':'flex-start';
  return `<article class="story-page threads-note-dark" data-list-id="${escapeHtml(listId)}" data-page-index="${index}" data-export-strict="true" data-export-name="01-note-den.png"><style>
  .story-page.threads-note-dark{position:relative;display:block;width:397px!important;height:${1920*scale}px!important;min-height:0!important;max-width:none!important;flex:0 0 397px!important;padding:0!important;overflow:hidden;background:#000!important;border-radius:0!important;box-shadow:none;box-sizing:border-box}
  .note-dark-design{position:absolute;left:0;top:0;width:1080px;height:1920px;transform:scale(${scale});transform-origin:top left;color:#fff;font-weight:400;background:#000}
  .threads-note-dark .note-dark-design,.threads-note-dark .note-dark-design *{font-family:-apple-system,'SF Pro Text','Segoe UI','Be Vietnam Pro',sans-serif!important}.threads-note-dark .note-dark-design .note-dark-emoji{font-family:'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif!important}
  .note-dark-status{position:absolute;left:120px;right:94px;top:52px;height:56px;display:flex;align-items:center;gap:22px;color:#fff}.note-dark-spacer{flex:1}
  .note-dark-time{display:flex;align-items:center;gap:10px;font-size:43px;font-weight:600;letter-spacing:-.5px}.note-dark-time svg{width:34px;height:34px}
  .note-dark-signal{width:54px;height:34px}.note-dark-wifi{width:46px;height:34px}.note-dark-battery{position:relative;display:flex;align-items:center;justify-content:center;width:70px;height:36px;border-radius:11px;background:#fff;color:#000;font-size:25px;font-weight:700;letter-spacing:-.5px;margin-right:8px}.note-dark-battery:after{content:'';position:absolute;right:-8px;top:12px;width:4px;height:12px;border-radius:0 3px 3px 0;background:rgba(255,255,255,.45)}
  .note-dark-nav{position:absolute;left:28px;right:52px;top:160px;height:64px;display:flex;align-items:center;gap:52px;color:#eec333}.note-dark-nav svg{width:62px;height:62px;display:block}.note-dark-nav .note-dark-off{color:#5b5b5f}
  .note-dark-back{display:flex;align-items:center;gap:14px;font-size:41px;letter-spacing:-.2px;margin-right:auto;white-space:nowrap}.note-dark-back svg{width:30px!important;height:46px!important}
  .note-dark-body{position:absolute;left:76px;right:60px;top:262px;bottom:210px;display:flex;flex-direction:column;justify-content:${justify};text-align:${align}}
  .note-dark-content{flex:0 0 auto;min-height:0}
  .note-dark-group h2{display:flex;justify-content:${rowJustify};align-items:baseline;font-family:inherit!important;font-size:${42*ratio}px!important;font-weight:400!important;line-height:1.33!important;color:#fff!important;margin:${3*ratio}px 0 0!important}.note-dark-emoji{flex:0 0 auto;width:${64*ratio}px;font-size:.9em;text-align:left}
  .note-dark-row{display:flex;justify-content:${rowJustify};font-family:inherit!important;font-size:${42*ratio}px!important;font-weight:400!important;line-height:1.33!important;margin:0!important;color:#fff!important;white-space:pre-wrap;overflow-wrap:normal;word-break:normal}.note-dark-row span:last-child{min-width:0;max-width:${944-84*ratio}px}.note-dark-dash{flex:0 0 auto;width:${52*ratio}px;margin-left:${32*ratio}px;text-align:left}
  .note-dark-footer{position:absolute;left:54px;right:50px;top:1750px;display:flex;justify-content:space-between;color:#eec333}.note-dark-footer svg{width:62px;height:62px}
  .note-dark-home{position:absolute;left:346px;width:388px;bottom:22px;height:12px;border-radius:6px;background:#fff}.threads-note-dark[data-note-overflow="true"]{outline:2px solid #ef4444}
  </style><div class="note-dark-design">${statusBar(statusFor(listId))}<div class="note-dark-nav"><span class="note-dark-back"><svg viewBox="0 0 20 32" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 3 4 16l12 13"/></svg>Tất cả iCloud</span>${navIcons.join('')}</div><div class="note-dark-body"><div class="note-dark-content">${groups.map((_,g)=>`<section class="note-dark-group"><h2><span class="note-dark-emoji">${emojis[g]}</span><span>${headings[g]}</span></h2>${(page.items||[]).slice(g*6,g*6+6).map((item,i)=>`<div class="note-dark-row"><span class="note-dark-dash">–</span><span data-edit-field="items.${g*6+i}.name">${escapeHtml(item.name)}</span></div>`).join('')}</section>`).join('')}</div></div><div class="note-dark-footer">${footerIcons.join('')}</div><div class="note-dark-home"></div></div></article>`;
}

export function checkNoteDarkLayout(root,strict=false) {
  const pages=root?.matches?.('.threads-note-dark')?[root]:[...(root?.querySelectorAll?.('.threads-note-dark')||[])];
  for(const page of pages){const body=page.querySelector('.note-dark-body');if(!body)continue;const b=body.getBoundingClientRect();const invalid=[...page.querySelectorAll('.note-dark-group h2,.note-dark-row')].some(node=>{const r=node.getBoundingClientRect();return r.left<b.left-1||r.right>b.right+1||r.top<b.top-1||r.bottom>b.bottom+1||node.scrollWidth>node.clientWidth+1;});page.dataset.noteOverflow=String(invalid);page.title=invalid?'Tràn chữ: chỉnh tên, cỡ chữ hoặc vị trí trước khi xuất.':'';if(strict&&invalid)throw Error('Note 01 · Đen tối giản: tràn chữ; không tự cắt tên hoặc giảm cỡ chữ đã lưu.');}
}
