'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import s from './prototype.module.css';
import FakeSlide from './FakeSlide';
import { Icon } from './parts';
import { StatusChip, templateById } from './views';
import { STATUS_LABEL, timeAgo } from './data';

const FILTERS = ['all', 'new', 'edited', 'exported'];
const fold = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').toLowerCase();

function readField(page, path) {
  const [head, index, key] = path.split('.');
  return head === 'items' ? page.items?.[Number(index)]?.[key] ?? '' : page[head] ?? '';
}

// Ô sửa cho trang đang chọn. Ô ứng với chữ vừa bấm trên slide được cuộn tới và sáng lên.
function Inspector({ template, page, pageIndex, activeField, onField, onFocusField, dirty, onSave, onDiscard, onExportOne }) {
  const body = useRef(null);
  useEffect(() => {
    if (!activeField) return;
    const input = body.current?.querySelector(`[data-field-input="${activeField}"]`);
    if (input && document.activeElement !== input) { input.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); input.focus({ preventScroll: true }); }
  }, [activeField, pageIndex]);
  const input = (path, label, multiline = false) => {
    const Tag = multiline ? 'textarea' : 'input';
    return <label key={path} className={`${s.field} ${activeField === path ? s.fieldFocus : ''}`}><span>{label}</span>
      <Tag data-field-input={path} rows={multiline ? 2 : undefined} value={readField(page, path)} onFocus={() => onFocusField(path)} onChange={event => onField(path, event.target.value)} /></label>;
  };
  const showItems = page.type !== 'cover' && template.style !== 'spotlight';
  return (
    <aside className={s.inspector} aria-label="Chỉnh sửa trang">
      <header className={s.inspectorHead}>
        <div><p className={s.eyebrow}>Trang {pageIndex + 1}</p><h3>{page.type === 'cover' ? 'Trang bìa' : template.style === 'spotlight' ? 'Trang địa điểm' : 'Trang dữ liệu'}</h3></div>
        <span className={s.saveBadge} data-state={dirty ? 'dirty' : 'saved'}>{dirty ? '● Chưa lưu' : '✓ Đã lưu'}</span>
      </header>
      <div ref={body} className={s.inspectorBody}>
        <p className={s.hint}>Mẹo: bấm thẳng vào chữ trên slide để nhảy tới ô tương ứng.</p>
        {input('title', page.type === 'cover' ? 'Hook / tiêu đề bìa' : template.style === 'spotlight' ? 'Tên địa điểm' : 'Tiêu đề trang', true)}
        {input('subtitle', template.style === 'spotlight' && page.type !== 'cover' ? 'Địa chỉ' : 'Mô tả', true)}
        {showItems ? page.items.map((item, index) => (
          <fieldset key={index} className={s.itemGroup}><legend>{template.style === 'grid' ? `Ô ${index + 1}` : `Hoạt động ${index + 1}`}</legend>
            {template.style !== 'grid' ? input(`items.${index}.time`, 'Giờ') : null}
            {input(`items.${index}.name`, 'Tên địa điểm')}
            {template.style !== 'grid' ? input(`items.${index}.address`, 'Địa chỉ') : null}
          </fieldset>
        )) : null}
        <details className={s.more}><summary>Cỡ chữ & ảnh</summary><p className={s.hint}>Cỡ chữ, ảnh thay thế và đối tác của trang nằm ở đây (giữ nguyên chức năng hiện có).</p></details>
      </div>
      <footer className={s.inspectorFoot}>
        <button type="button" disabled={!dirty} onClick={onDiscard}>Hoàn tác</button>
        <button type="button" className={s.primary} disabled={!dirty} onClick={onSave}>Lưu <kbd>Ctrl S</kbd></button>
        <button type="button" onClick={onExportOne}><Icon name="export" size={15} /> Xuất list này</button>
      </footer>
    </aside>
  );
}

export default function ReviewView({ lists, activeListId, pages, dirty, selection, setSelection, onOpenList, onField, onSave, onDiscard, onExport, focusRequest }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [activeField, setActiveField] = useState(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [options, setOptions] = useState({ format: 'PNG', quality: 'Cân bằng', removeAfter: false });
  const list = lists.find(entry => entry.id === activeListId) || null;
  const template = list ? templateById(list.templateId) : null;
  const shown = useMemo(() => lists.filter(entry => (filter === 'all' || entry.status === filter) && fold(entry.name).includes(fold(query))), [lists, filter, query]);
  const counts = Object.fromEntries(FILTERS.map(key => [key, key === 'all' ? lists.length : lists.filter(entry => entry.status === key).length]));
  const chosen = lists.filter(entry => selection.has(entry.id));

  useEffect(() => { setPageIndex(0); setActiveField(null); }, [activeListId]);
  useEffect(() => { setActiveField(null); }, [pageIndex]);
  useEffect(() => { if (focusRequest) setPageIndex(0); }, [focusRequest]);
  useEffect(() => {
    const onKey = event => {
      if (event.target.closest?.('input, textarea, select, [contenteditable]')) return;
      if (event.key === 'ArrowRight') setPageIndex(index => Math.min((pages?.length || 1) - 1, index + 1));
      if (event.key === 'ArrowLeft') setPageIndex(index => Math.max(0, index - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pages]);

  const toggle = id => setSelection(previous => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const allShownSelected = shown.length > 0 && shown.every(entry => selection.has(entry.id));
  const page = pages?.[pageIndex];

  return (
    <div className={`${s.review} ${inspectorOpen ? '' : s.reviewWide}`} data-selecting={chosen.length > 0}>
      <aside className={s.queue} aria-label="Hàng chờ list">
        <header className={s.queueHead}>
          <h2>Hàng chờ <small>{lists.length}</small></h2>
          <label className={s.searchBox}><Icon name="search" size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm list…" aria-label="Tìm list" /></label>
          <div className={s.chips} role="group" aria-label="Lọc trạng thái">{FILTERS.map(key => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {filter === key ? <motion.span layoutId="proto-queue-filter" className={s.chipPill} transition={{ type: 'spring', duration: .4, bounce: .2 }} /> : null}
              <span>{key === 'all' ? 'Tất cả' : STATUS_LABEL[key]}</span><small>{counts[key]}</small>
            </button>
          ))}</div>
          <label className={s.selectAll}><input type="checkbox" checked={allShownSelected} onChange={event => setSelection(previous => { const next = new Set(previous); shown.forEach(entry => event.target.checked ? next.add(entry.id) : next.delete(entry.id)); return next; })} /> Chọn {shown.length} list đang hiện</label>
        </header>
        <div className={s.queueList}>
          <AnimatePresence initial={false}>{shown.map(entry => {
            const entryTemplate = templateById(entry.templateId);
            return <motion.div key={entry.id} layout initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} className={s.queueItem} data-active={entry.id === activeListId}>
              <input type="checkbox" aria-label={`Chọn ${entry.name}`} checked={selection.has(entry.id)} onChange={() => toggle(entry.id)} />
              <button type="button" onClick={() => onOpenList(entry.id)}>
                <span className={s.queueThumb}><FakeSlide template={entryTemplate} page={entry.pages[0]} /></span>
                <span className={s.queueCopy}><strong>{entry.name}</strong><small>{entry.pages.length} trang · {timeAgo(entry.createdAt)}</small><StatusChip status={entry.status} /></span>
              </button>
            </motion.div>;
          })}</AnimatePresence>
          {!shown.length ? <p className={s.taskEmpty}>Không có list ở bộ lọc này.</p> : null}
        </div>
      </aside>

      <section className={s.stage} aria-label="Xem trước">
        {list && page ? <>
          <header className={s.stageHead}>
            <div><h2>{list.name}</h2><small>{template.name} · trang {pageIndex + 1}/{pages.length} · <StatusChip status={list.status} /></small></div>
            <div className={s.stageNav}>
              <button type="button" className={s.iconButton} aria-label="Trang trước" disabled={pageIndex === 0} onClick={() => setPageIndex(index => index - 1)}><Icon name="left" /></button>
              <button type="button" className={s.iconButton} aria-label="Trang sau" disabled={pageIndex === pages.length - 1} onClick={() => setPageIndex(index => index + 1)}><Icon name="right" /></button>
              <button type="button" className={s.iconButton} aria-pressed={inspectorOpen} aria-label={inspectorOpen ? 'Thu gọn bảng chỉnh sửa' : 'Mở bảng chỉnh sửa'} onClick={() => setInspectorOpen(open => !open)}><Icon name="panel" /></button>
            </div>
          </header>
          <div className={s.canvas}>
            <AnimatePresence mode="wait">
              <motion.div key={`${list.id}-${pageIndex}`} className={s.canvasSlide} data-ratio={template.ratio} initial={{ opacity: 0, scale: .97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .99 }} transition={{ duration: .18 }}>
                <FakeSlide template={template} page={page} index={pageIndex} mode="full" activeField={activeField} onPickField={field => { setActiveField(field); setInspectorOpen(true); }} />
              </motion.div>
            </AnimatePresence>
          </div>
          <div className={s.filmstrip} role="tablist" aria-label="Các trang">
            {pages.map((entry, index) => <button key={index} type="button" role="tab" aria-selected={index === pageIndex} aria-label={`Trang ${index + 1}`} onClick={() => setPageIndex(index)}>
              {index === pageIndex ? <motion.span layoutId="proto-film-active" className={s.filmActive} transition={{ type: 'spring', duration: .4, bounce: .2 }} /> : null}
              <FakeSlide template={template} page={entry} index={index} />
            </button>)}
          </div>
          <p className={s.hint}>← → đổi trang · bấm vào chữ trên slide để sửa · Ctrl+S lưu</p>
        </> : <div className={s.empty}><Icon name="review" size={26} /><strong>Chọn một list trong hàng chờ</strong><span>Preview và chỉnh sửa sẽ hiện ở đây.</span></div>}
      </section>

      {list && page && inspectorOpen ? <Inspector template={template} page={page} pageIndex={pageIndex} activeField={activeField} onFocusField={setActiveField}
        onField={(path, value) => onField(pageIndex, path, value)} dirty={dirty} onSave={onSave} onDiscard={onDiscard} onExportOne={() => onExport([list.id], options)} /> : null}

      <AnimatePresence>
        {chosen.length ? (
          <motion.div className={s.actionBar} initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: 'spring', duration: .45, bounce: .2 }}>
            <strong>{chosen.length} list · {chosen.reduce((total, entry) => total + entry.pages.length, 0)} trang</strong>
            <div className={s.segmented}>{['PNG', 'JPG'].map(value => <button key={value} type="button" aria-pressed={options.format === value} onClick={() => setOptions(o => ({ ...o, format: value }))}>{options.format === value ? <motion.span layoutId="proto-format" className={s.chipPill} /> : null}<span>{value}</span></button>)}</div>
            <div className={s.segmented}>{['Cân bằng', 'Gốc'].map(value => <button key={value} type="button" aria-pressed={options.quality === value} onClick={() => setOptions(o => ({ ...o, quality: value }))}>{options.quality === value ? <motion.span layoutId="proto-quality" className={s.chipPill} /> : null}<span>{value}</span></button>)}</div>
            <label className={s.selectAll}><input type="checkbox" checked={options.removeAfter} onChange={event => setOptions(o => ({ ...o, removeAfter: event.target.checked }))} /> Xóa list sau khi xuất</label>
            <button type="button" onClick={() => setSelection(new Set())}>Bỏ chọn</button>
            <button type="button" className={s.primary} onClick={() => onExport(chosen.map(entry => entry.id), options)}><Icon name="export" size={16} /> Xuất {chosen.length} list</button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
