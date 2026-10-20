'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Icon from '../ui/Icon';
import EmptyState from '../ui/EmptyState';
import CaptionTools from '../CaptionTools';
import SlideThumb from './SlideThumb';
import { DECK_GROUPS, creatableDecks, deckInGroup } from '../ui/deckGroups';
import { listIsMain } from '../../lib/utils';
import { supportsPhotoPreset } from '../../lib/photoPresets.mjs';
import { apiFetch, formatApiError } from '../../lib/apiClient';

const fold = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'D').toLowerCase();
const mainList = deck => (deck.lists || []).find(list => listIsMain(list)) || deck.lists?.[0] || null;

// Thẻ mẫu: 3 slide thật xòe ra khi rê chuột (2 slide sau chỉ dựng khi rê lần đầu).
// Chỉ tính là rê khi chuột dừng trên thẻ một nhịp: lăn chuột lướt qua các thẻ không dựng thêm slide.
function TemplateCard({ deck, pinned, coverImageUrls, onTogglePin, onCreate, onPreview }) {
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef(0);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  const startHover = () => { if (!hovered) { clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setHovered(true), 150); } };
  const endHover = () => clearTimeout(hoverTimer.current);
  const list = mainList(deck);
  const pages = list?.pages || [];
  const previewImage = deck.localTemplate?.previewImageUrl;
  return (
    <motion.article className="v2-template-card" whileHover="hover" onPointerMove={startHover} onPointerLeave={endHover} onFocus={() => setHovered(true)}>
      <button type="button" className="v2-template-open" aria-label={`Tạo list từ mẫu ${deck.navTitle}`} onClick={() => onCreate(deck)}>
        <span className="v2-fan">
          {list && pages.length ? [2, 1, 0].filter(index => index < pages.length && (index === 0 || hovered)).map(index => (
            <motion.span key={index} className="v2-fan-slide" style={{ zIndex: 3 - index }}
              variants={{ hover: { x: (1 - index) * 44, rotate: (1 - index) * 6, y: index === 0 ? -6 : 0 } }}
              initial={{ x: -index * 8, rotate: -index * 3 }} transition={{ type: 'spring', duration: 0.5, bounce: 0.25 }}>
              <SlideThumb list={list} page={pages[index]} index={index} width={118} coverImageUrls={coverImageUrls} eager={index > 0} />
            </motion.span>
          )) : previewImage ? <img className="v2-fan-image" src={previewImage} alt="" loading="lazy" /> : <span className="v2-fan-empty">{deck.navTitle}</span>}
        </span>
      </button>
      <div className="v2-template-meta">
        <div><strong>{deck.navTitle}</strong><small>{deck.localTemplate && !deck.lists.length ? `${deck.localTemplate.pageCount || '—'} trang/list · Mẫu riêng` : `${pages.length} trang/list · ${deck.lists.filter(entry => !listIsMain(entry)).length} list đã tạo`}</small></div>
        <button type="button" className={`v2-icon-button ${pinned ? 'is-pinned' : ''}`} aria-pressed={pinned} aria-label={pinned ? `Bỏ ghim ${deck.navTitle}` : `Ghim ${deck.navTitle}`} onClick={() => onTogglePin(deck.id)}><Icon name="star" /></button>
      </div>
      <div className="v2-template-actions">
        <button type="button" className="toolbar-button primary" onClick={() => onCreate(deck)}>Tạo list</button>
        <button type="button" className="toolbar-button" disabled={!list} onClick={() => onPreview(deck)}>Xem mẫu</button>
      </div>
    </motion.article>
  );
}

export default function CreateView({ studio, pinned, onTogglePin, recent, onRemember, drawerOpen, onOpenDrawer, onCloseDrawer, onPreviewDeck }) {
  const { dataset } = studio;
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const coverImageUrls = dataset?.source?.coverImageUrls || [];
  const all = useMemo(() => creatableDecks(dataset), [dataset]);
  const searched = all.filter(deck => fold(`${deck.navTitle} ${deck.title}`).includes(fold(query)));
  const shown = searched.filter(deck => deckInGroup(deck, group));
  const byId = new Map(all.map(deck => [deck.id, deck]));
  const sections = [
    ['Đã ghim', pinned.map(id => byId.get(id)).filter(deck => deck && shown.includes(deck))],
    ['Dùng gần đây', recent.map(id => byId.get(id)).filter(deck => deck && shown.includes(deck) && !pinned.includes(deck.id)).slice(0, 4)],
    ['Tất cả mẫu', shown],
  ].filter(([, items]) => items.length);
  const open = deck => { onRemember(deck.id); onOpenDrawer(deck); };

  return (
    <div className="v2-view-stack">
      <header className="v2-view-head"><div><p className="v2-eyebrow">Tạo</p><h1>Chọn mẫu để tạo list</h1><p>Rê chuột lên mẫu để xem 3 slide đầu. Bấm “Tạo list” để cấu hình; list tạo xong vào hàng chờ Duyệt & Xuất.</p></div></header>
      <div className="v2-filter-bar">
        <label className="v2-search"><Icon name="search" size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm mẫu…" aria-label="Tìm mẫu" /></label>
        <div className="v2-chips" role="group" aria-label="Nhóm mẫu">{['', ...DECK_GROUPS].map(value => {
          const count = searched.filter(deck => deckInGroup(deck, value)).length;
          return <button key={value || 'all'} type="button" aria-pressed={group === value} disabled={!count && group !== value} onClick={() => setGroup(value)}>
            {group === value ? <motion.span layoutId="v2-group-pill" className="v2-chip-pill" transition={{ type: 'spring', duration: 0.45, bounce: 0.2 }} /> : null}
            <span>{value || 'Tất cả'}</span><small>{count}</small>
          </button>;
        })}</div>
      </div>
      {sections.map(([title, decks]) => (
        <section key={title}>
          <h2 className="v2-section-title">{title} <small>{decks.length}</small></h2>
          <div className="v2-template-grid">{decks.map(deck => <TemplateCard key={`${title}-${deck.id}`} deck={deck} pinned={pinned.includes(deck.id)} coverImageUrls={coverImageUrls} onTogglePin={onTogglePin} onCreate={open} onPreview={onPreviewDeck} />)}</div>
        </section>
      ))}
      {!shown.length ? <EmptyState icon="search" title="Không tìm thấy mẫu phù hợp" action={<button type="button" className="toolbar-button" onClick={() => { setQuery(''); setGroup(''); }}>Xóa bộ lọc</button>}>Thử tên mẫu khác hoặc chọn nhóm “Tất cả”.</EmptyState> : null}
      <CreateDrawer studio={studio} open={drawerOpen} onClose={onCloseDrawer} />
    </div>
  );
}

// Ngăn kéo cấu hình: dùng nguyên bộ tạo list (CaptionTools) để giữ đủ tuỳ chọn và kiểm tra hiện có.
function CreateDrawer({ studio, open, onClose }) {
  const {
    activeDeck, captionSourceList, activeListId, dataset, selectedPhotoPreset, photoPresets, changePhotoPreset, captionToolsVisible,
    captionTone, setCaptionTone, caption, setCaption, busy, driveCacheStatus, automationState, handleDeckSelect, handleListSelect,
    previewGeneratedList, requestCaption, createDeckFromCaption, setBusy, loadDataset, setStatus, createBatchLists, createPartnerSpotlight,
    partners, selectedRequiredPartners, changeRequiredPartners, partnerEligibility, requiredPartnerKey, ensurePartnerEligibility, activeDeckId, copyText,
  } = studio;
  return (
    <AnimatePresence>
      {open && activeDeck ? (
        <motion.div className="v2-drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={event => event.target === event.currentTarget && onClose()}>
          <motion.aside className="v2-drawer" role="dialog" aria-modal="true" aria-label={`Tạo list: ${activeDeck.navTitle}`}
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', duration: 0.5, bounce: 0.12 }}
            onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
            <header className="v2-drawer-head">
              <div><p className="v2-eyebrow">Tạo list</p><h2>{activeDeck.navTitle}</h2><p>{dataset?.source?.destinationLabel || 'Nguồn đang mở'} · {captionSourceList?.pages?.length || activeDeck.localTemplate?.pageCount || 0} trang/list · {supportsPhotoPreset(activeDeck.id) ? photoPresets.find(p => p.id === selectedPhotoPreset)?.label || 'Ảnh gốc' : 'Mẫu chỉ chữ'}</p></div>
              <button type="button" className="v2-icon-button" aria-label="Đóng ngăn kéo tạo list" onClick={onClose}><Icon name="close" /></button>
            </header>
            <div className="v2-drawer-body">
              <CaptionTools
                photoPreset={selectedPhotoPreset} photoPresets={photoPresets} onPhotoPresetChange={changePhotoPreset}
                visible={captionToolsVisible} dataset={dataset} activeDeck={activeDeck} activeList={captionSourceList} selectedListId={activeListId}
                tone={captionTone} setTone={setCaptionTone} caption={caption} setCaption={setCaption} busy={busy}
                cacheReady={driveCacheStatus.ready || automationState.locked}
                onDeckSelect={handleDeckSelect} onListSelect={handleListSelect} onGeneratedListSelect={previewGeneratedList}
                onRequestCaption={requestCaption} onCreateList={createDeckFromCaption}
                onSyncLocalTemplate={async () => {
                  if (!activeDeck?.localTemplate || busy) return;
                  setBusy(true);
                  try {
                    const response = await apiFetch(`/api/local-templates/${encodeURIComponent(activeDeck.id)}/sync`, { method: 'POST' });
                    if (!response.ok) throw new Error(await formatApiError(response, 'Không đồng bộ được nội dung mẫu riêng'));
                    await loadDataset('Đang cập nhật nội dung mẫu riêng...', { activeDeckId, activeListId });
                    setStatus('Đã đồng bộ nội dung mẫu riêng; các list đã tạo được giữ nguyên.');
                  } catch (error) { setStatus(error.message || String(error)); }
                  finally { setBusy(false); }
                }}
                onCreateBatchLists={createBatchLists} onCreatePartnerSpotlight={createPartnerSpotlight}
                partners={partners} requiredPartners={selectedRequiredPartners} onRequiredPartnersChange={changeRequiredPartners}
                partnerEligibility={partnerEligibility[requiredPartnerKey]}
                cacheNotice={driveCacheStatus.ready && driveCacheStatus.imagesMissing ? driveCacheStatus.message : ''}
                onPartnerPickerOpen={() => ensurePartnerEligibility(activeDeckId)} onCopy={copyText} />
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
