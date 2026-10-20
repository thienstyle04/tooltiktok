'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Icon from '../ui/Icon';
import SlideCard from '../SlideCard';
import FittedStudioPreview from '../FittedStudioPreview';
import InspectorScrollArea from '../InspectorScrollArea';
import PageInspector from '../PageInspector';
import EmptyState from '../ui/EmptyState';
import SlideThumb from './SlideThumb';
import { markEditableText } from './editMarkers';
import { LIST_STATUS_LABEL, collectLists } from '../../lib/listStatus.mjs';
import { coverReviewError, coverReviewWarnings } from '../../lib/spotlightCoverReview.mjs';

const FILTERS = ['all', 'new', 'edited', 'exported', 'main'];
const fold = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'D').toLowerCase();
const noop = () => {};

export function StatusChip({ status }) {
  return <span className="v2-status" data-status={status}>{LIST_STATUS_LABEL[status]}</span>;
}

// Duyệt & Xuất: hàng chờ list (lọc, chọn nhiều) · preview thật + dải trang · bảng sửa · thanh xuất ở đáy.
export default function ReviewView({ studio, onCreate }) {
  const {
    dataset, activeDeck, activeList, activeListId, selectedPageIndex, handleDeckSelect, handleListSelect, handlePageSelect,
    handlePageTextChange, savePageText, savingPageText, editorSaveState, exportFormat, setExportFormat, exportQuality, setExportQuality,
    handleExportPage, handleExportList, handleExportBatch, busy, selectedListsForExport, setSelectedListsForExport,
    setSelectedListsForDelete, setDeleteModalOpen, editorPane, setEditorPane,
  } = studio;
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [removeAfter, setRemoveAfter] = useState(false);
  const stage = useRef(null);

  const entries = useMemo(() => collectLists(dataset, { includeMain: true }), [dataset]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(key => [key, key === 'all' ? entries.filter(entry => entry.status !== 'main').length : entries.filter(entry => entry.status === key).length])), [entries]);
  const shown = entries.filter(entry => (filter === 'all' ? entry.status !== 'main' : entry.status === filter)
    && fold(`${entry.deck.navTitle} ${entry.list.navTitle} ${entry.list.title}`).includes(fold(query)));
  const selectable = shown.filter(entry => entry.status !== 'main');
  const chosen = entries.filter(entry => entry.status !== 'main' && selectedListsForExport.has(entry.list.id));
  const allShownSelected = selectable.length > 0 && selectable.every(entry => selectedListsForExport.has(entry.list.id));
  const pages = activeList?.pages || [];
  const pageIndex = Math.min(Math.max(0, selectedPageIndex || 0), Math.max(0, pages.length - 1));
  const page = pages[pageIndex];
  const activeEntry = entries.find(entry => entry.list.id === activeList?.id);
  const coverIssue = activeList?.spotlightDesignRevision === 1 ? (coverReviewError(activeList) || coverReviewWarnings(activeList).join(' ')) : '';

  // Đánh dấu chữ bấm-để-sửa sau khi SlideCard dựng và căn chữ xong.
  useEffect(() => {
    const root = stage.current?.querySelector('.slide-card-content');
    if (!root || !page) return undefined;
    const mark = () => markEditableText(root, page);
    const frame = requestAnimationFrame(mark);
    const timer = setTimeout(mark, 250);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [activeList?.id, pageIndex, page]);

  const openEntry = entry => { handleDeckSelect(entry.deck); handleListSelect(entry.list); };
  const toggle = id => setSelectedListsForExport(previous => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const focusField = path => {
    setInspectorOpen(true);
    setEditorPane('editor');
    requestAnimationFrame(() => {
      const input = document.querySelector(`.v2-inspector [data-edit-target="${CSS.escape(path)}"]`);
      if (!input) return;
      input.scrollIntoView({ block: 'center', behavior: 'smooth' });
      input.focus({ preventScroll: true });
      input.classList.add('v2-field-flash');
      setTimeout(() => input.classList.remove('v2-field-flash'), 1400);
    });
  };

  return (
    <div className={`v2-review ${inspectorOpen ? '' : 'is-wide'}`} data-selecting={chosen.length > 0}>
      <aside className="v2-queue" aria-label="Hàng chờ list">
        <header className="v2-queue-head">
          <h2>Hàng chờ <small>{counts.all}</small></h2>
          <label className="v2-search"><Icon name="search" size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm list hoặc mẫu…" aria-label="Tìm list" /></label>
          <div className="v2-chips" role="group" aria-label="Lọc trạng thái">{FILTERS.map(key => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {filter === key ? <motion.span layoutId="v2-queue-filter" className="v2-chip-pill" transition={{ type: 'spring', duration: 0.4, bounce: 0.2 }} /> : null}
              <span>{key === 'all' ? 'Tất cả' : LIST_STATUS_LABEL[key]}</span><small>{counts[key]}</small>
            </button>
          ))}</div>
          {selectable.length ? <label className="v2-select-all"><input type="checkbox" checked={allShownSelected} onChange={event => setSelectedListsForExport(previous => {
            const next = new Set(previous);
            selectable.forEach(entry => (event.target.checked ? next.add(entry.list.id) : next.delete(entry.list.id)));
            return next;
          })} /> Chọn {selectable.length} list đang hiện</label> : null}
        </header>
        <div className="v2-queue-list">
          {shown.map(entry => (
            <div key={entry.list.id} className="v2-queue-item" data-deck-id={entry.deck.id} data-list-id={entry.list.id} data-active={entry.list.id === activeList?.id}>
              {entry.status !== 'main' ? <input type="checkbox" aria-label={`Chọn ${entry.list.navTitle || entry.list.title}`} checked={selectedListsForExport.has(entry.list.id)} onChange={() => toggle(entry.list.id)} /> : <span className="v2-queue-spacer" />}
              <button type="button" onClick={() => openEntry(entry)}>
                <SlideThumb list={entry.list} page={entry.list.pages?.[0]} width={44} coverImageUrls={dataset?.source?.coverImageUrls || []} />
                <span className="v2-queue-copy"><strong>{entry.status === 'main' ? entry.deck.navTitle : entry.list.navTitle || entry.list.title}</strong><small>{entry.status === 'main' ? 'List chính' : entry.deck.navTitle} · {entry.list.pages?.length || 0} trang</small><StatusChip status={entry.status} /></span>
              </button>
            </div>
          ))}
          {!shown.length ? (entries.length > counts.main
            ? <EmptyState compact icon="search" title="Không có list ở bộ lọc này">Đổi bộ lọc hoặc từ khóa.</EmptyState>
            : <EmptyState icon="list" title="Chưa có list nào" action={<button type="button" className="toolbar-button primary" onClick={onCreate}>Tạo list</button>}>List tạo từ mẫu sẽ vào đây để duyệt và xuất.</EmptyState>) : null}
        </div>
      </aside>

      <section className="v2-stage" aria-label="Xem trước">
        {activeList && page ? <>
          <header className="v2-stage-head">
            <div>
              <h2>{activeEntry?.status === 'main' ? activeDeck?.navTitle : activeList.navTitle || activeList.title}</h2>
              <p>{activeEntry?.status === 'main' ? 'List chính (mẫu mẹ)' : activeDeck?.navTitle} · {activeEntry ? <StatusChip status={activeEntry.status} /> : null}</p>
            </div>
            <div className="v2-stage-actions">
              <h3 className="v2-page-count">Trang {pageIndex + 1}/{pages.length}</h3>
              <button type="button" className="v2-icon-button" aria-label="Trang trước" disabled={pageIndex === 0} onClick={() => handlePageSelect(activeList.id, pageIndex - 1)}><Icon name="left" /></button>
              <button type="button" className="v2-icon-button" aria-label="Trang sau" disabled={pageIndex >= pages.length - 1} onClick={() => handlePageSelect(activeList.id, pageIndex + 1)}><Icon name="right" /></button>
              <button type="button" className="v2-icon-button" aria-pressed={inspectorOpen} aria-label={inspectorOpen ? 'Thu gọn bảng chỉnh sửa' : 'Mở bảng chỉnh sửa'} onClick={() => setInspectorOpen(open => !open)}><Icon name="panel" /></button>
            </div>
          </header>
          {coverIssue ? <p className="v2-warning" role="status">{coverIssue}</p> : null}
          {activeList.warnings?.length ? <details className="v2-warning"><summary>{activeList.warnings.length} lưu ý của list này</summary>{activeList.warnings.map((message, index) => <div key={index}>{message}</div>)}</details> : null}
          <nav className="v2-pane-switch" aria-label="Vùng chỉnh sửa">
            <button type="button" aria-pressed={editorPane === 'preview'} onClick={() => setEditorPane('preview')}>Xem preview</button>
            <button type="button" aria-pressed={editorPane === 'editor'} onClick={() => setEditorPane('editor')}>Chỉnh sửa nội dung</button>
          </nav>
          <div ref={stage} className="v2-canvas" onClick={event => { const field = event.target.closest?.('[data-edit-field]')?.dataset.editField; if (field) focusField(field); }}>
            <FittedStudioPreview key={`${activeList.id}-${pageIndex}`} reserve={150}>
              <SlideCard list={activeList} page={page} index={pageIndex} selected onSelect={noop} coverImageUrls={dataset?.source?.coverImageUrls || []} />
            </FittedStudioPreview>
          </div>
          <div className="v2-filmstrip" role="tablist" aria-label="Các trang trong list">
            {pages.map((entry, index) => (
              <button key={index} type="button" role="tab" aria-selected={index === pageIndex} aria-label={`Trang ${index + 1}`} onClick={() => handlePageSelect(activeList.id, index)}>
                {index === pageIndex ? <span className="v2-film-active" /> : null}
                <SlideThumb list={activeList} page={entry} index={index} width={62} coverImageUrls={dataset?.source?.coverImageUrls || []} />
              </button>
            ))}
          </div>
          <p className="v2-hint">← → đổi trang · bấm vào chữ trên slide để sửa · Ctrl+S xuất trang</p>
        </> : <EmptyState icon="review" title="Chọn một list trong hàng chờ">Preview, chỉnh sửa và xuất sẽ hiện ở đây.</EmptyState>}
      </section>

      {activeList && page && inspectorOpen ? (
        <aside className="right-panel v2-inspector" aria-label="Chỉnh sửa trang">
          <section className="inspector-shell">
            <div className="panel-head compact">
              <div>
                <p className="panel-kicker">Dữ liệu trang</p>
                <h3 className="panel-title">{page.layoutVariant === 'itinerary-note-threads-budget' || page.layoutVariant === 'threads-expense-sheet' ? 'Dữ liệu bảng chi phí' : activeDeck?.id === 'threads-toplist-dalat' ? 'Dữ liệu địa điểm' : 'Dữ liệu & ảnh'}</h3>
                <p role="status" className="ui-save-badge" data-state={savingPageText ? 'saving' : editorSaveState}>{savingPageText ? 'Đang lưu…' : editorSaveState === 'dirty' ? '● Chưa lưu' : editorSaveState === 'failed' ? 'Lưu thất bại — bản nháp vẫn còn' : 'Đã lưu'}</p>
              </div>
            </div>
            <InspectorScrollArea>
              <PageInspector deck={activeDeck} list={activeList} selectedPageIndex={pageIndex}
                onPageTextChange={handlePageTextChange} onPageTextSave={savePageText} savingPageText={savingPageText}
                exportFormat={exportFormat} setExportFormat={setExportFormat} onExportPage={handleExportPage} onExportList={handleExportList} busy={busy} />
            </InspectorScrollArea>
          </section>
        </aside>
      ) : null}

      <AnimatePresence>
        {chosen.length ? (
          <motion.div className="v2-action-bar" role="region" aria-label="Xuất các list đã chọn" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: 'spring', duration: 0.45, bounce: 0.2 }}>
            <strong>{chosen.length} list · {chosen.reduce((total, entry) => total + (entry.list.pages?.length || 0), 0)} trang</strong>
            <div className="v2-segmented" role="group" aria-label="Định dạng ảnh">{[['png', 'PNG'], ['jpg', 'JPG']].map(([value, label]) => (
              <button key={value} type="button" aria-pressed={exportFormat === value} disabled={busy} onClick={() => setExportFormat(value)}>{exportFormat === value ? <motion.span layoutId="v2-format" className="v2-chip-pill" /> : null}<span>{label}</span></button>
            ))}</div>
            <div className="v2-segmented" role="group" aria-label="Chất lượng">{[['optimized', 'Cân bằng'], ['original', 'Gốc']].map(([value, label]) => (
              <button key={value} type="button" aria-pressed={exportQuality === value} disabled={busy} onClick={() => setExportQuality(value)}>{exportQuality === value ? <motion.span layoutId="v2-quality" className="v2-chip-pill" /> : null}<span>{label}</span></button>
            ))}</div>
            <label className="v2-select-all"><input type="checkbox" checked={removeAfter} disabled={busy} onChange={event => setRemoveAfter(event.target.checked)} /> Xóa list sau khi xuất</label>
            <button type="button" className="toolbar-button" onClick={() => setSelectedListsForExport(new Set())}>Bỏ chọn</button>
            <button type="button" className="toolbar-button" disabled={busy} onClick={() => { setSelectedListsForDelete(new Set(chosen.map(entry => entry.list.id))); setDeleteModalOpen(true); }}>Xóa {chosen.length} list</button>
            <button type="button" className="toolbar-button primary" disabled={busy} onClick={() => handleExportBatch({ deleteAfterExport: removeAfter })}><Icon name="export" size={16} /> Xuất {chosen.length} list</button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
