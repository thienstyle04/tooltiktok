import { useEffect, useMemo, useState } from 'react';
import SlideCard from './SlideCard';
import { listIsMain } from '../lib/utils';

export const TEMPLATE_COMPARE_PAIRS = [
  { id: 'grid8', label: 'Lưới 8 Ô ↔ Feed', a: 'grid-8', b: 'grid-8-feed' },
  { id: 'grid5', label: 'Lưới 4 Ô ↔ Lưới 5 Ô', a: 'grid-4', b: 'grid-5' },
  { id: 'spotlight', label: 'Spotlight ↔ V2', a: 'spotlight-guide', b: 'spotlight-v2' },
];

function mainListForDeck(deck) {
  if (!deck) return null;
  return (deck.lists || []).find((list) => listIsMain(list)) || deck.lists?.[0] || null;
}

function pageLabel(page, index) {
  if (page?.type === 'cover') return 'Cover';
  return page?.chipText || page?.title || `Trang ${index + 1}`;
}

function CompareDeckColumn({
  label,
  deck,
  list,
  selectedPageIndex,
  onPageSelect,
}) {
  if (!list?.pages?.length) {
    return (
      <div className="template-compare-column">
        <div className="template-compare-column-head">
          <p className="panel-kicker">{label}</p>
          <h4>{deck?.title || '—'}</h4>
        </div>
        <div className="empty-state compact">Mẫu này chưa có dữ liệu preview.</div>
      </div>
    );
  }

  const safeIndex = Math.min(Math.max(selectedPageIndex, 0), list.pages.length - 1);
  const activePage = list.pages[safeIndex];

  return (
    <div className="template-compare-column">
      <div className="template-compare-column-head">
        <p className="panel-kicker">{label}</p>
        <h4>{deck?.title || '—'}</h4>
        <p className="panel-note">
          {String(list.pages.length).padStart(2, '0')} trang · đang xem {String(safeIndex + 1).padStart(2, '0')}
        </p>
      </div>

      <div className="template-compare-page-strip" role="tablist" aria-label={`Chọn trang ${deck?.navTitle || label}`}>
        {list.pages.map((page, index) => (
          <button
            key={`${list.id}-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={index === safeIndex}
            className={`template-compare-page-tab ${index === safeIndex ? 'active' : ''}`}
            title={pageLabel(page, index)}
            onClick={() => onPageSelect(index)}
          >
            {String(index + 1).padStart(2, '0')}
          </button>
        ))}
      </div>

      <div className="template-compare-focus-stage">
        <p className="template-compare-page-caption">{pageLabel(activePage, safeIndex)}</p>
        <SlideCard
          list={list}
          page={activePage}
          index={safeIndex}
          selected
          onSelect={(_, pageIndex) => onPageSelect(pageIndex)}
        />
      </div>
    </div>
  );
}

export default function TemplateCompareModal({
  open,
  dataset,
  initialDeckAId = 'grid-8',
  initialDeckBId = 'grid-8-feed',
  onClose,
}) {
  const decks = dataset?.decks || [];
  const deckOptions = useMemo(
    () => decks.filter((deck) => (deck.lists || []).length > 0),
    [decks],
  );

  const [deckAId, setDeckAId] = useState(initialDeckAId);
  const [deckBId, setDeckBId] = useState(initialDeckBId);
  const [selectedPageIndexA, setSelectedPageIndexA] = useState(0);
  const [selectedPageIndexB, setSelectedPageIndexB] = useState(0);
  const [activePairId, setActivePairId] = useState('grid8');
  const [syncPages, setSyncPages] = useState(true);

  useEffect(() => {
    if (!open) return;
    setDeckAId(initialDeckAId);
    setDeckBId(initialDeckBId);
    setSelectedPageIndexA(0);
    setSelectedPageIndexB(0);
    setActivePairId('grid8');
  }, [open, initialDeckAId, initialDeckBId]);

  if (!open) return null;

  const deckA = deckOptions.find((deck) => deck.id === deckAId) || deckOptions[0] || null;
  const deckB = deckOptions.find((deck) => deck.id === deckBId) || deckOptions[1] || deckOptions[0] || null;
  const listA = mainListForDeck(deckA);
  const listB = mainListForDeck(deckB);
  const maxSharedPages = Math.min(listA?.pages?.length || 0, listB?.pages?.length || 0);
  const sharedPageIndexA = maxSharedPages > 0
    ? Math.min(selectedPageIndexA, maxSharedPages - 1)
    : selectedPageIndexA;
  const sharedPageIndexB = maxSharedPages > 0
    ? Math.min(selectedPageIndexB, maxSharedPages - 1)
    : selectedPageIndexB;

  const applyPair = (pair) => {
    setDeckAId(pair.a);
    setDeckBId(pair.b);
    setActivePairId(pair.id);
    setSelectedPageIndexA(0);
    setSelectedPageIndexB(0);
  };

  const handlePageSelectA = (pageIndex) => {
    const next = Number(pageIndex) || 0;
    setSelectedPageIndexA(next);
    if (syncPages) setSelectedPageIndexB(next);
  };

  const handlePageSelectB = (pageIndex) => {
    const next = Number(pageIndex) || 0;
    setSelectedPageIndexB(next);
    if (syncPages) setSelectedPageIndexA(next);
  };

  return (
    <div id="templateCompareModal" className="modal-overlay" onClick={(event) => event.target.id === 'templateCompareModal' && onClose()}>
      <div className="modal-card template-compare-modal">
        <div className="modal-head">
          <div>
            <p className="panel-kicker">So sánh mẫu</p>
            <h3 className="modal-title">Chọn 2 mẫu để đối chiếu</h3>
          </div>
          <button className="modal-close-btn" type="button" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p className="modal-description">Dùng cặp gợi ý hoặc chọn tự do. Mẫu V2 nằm song song mẫu cũ — giữ mẫu nào ổn sau khi test.</p>

          <div className="template-compare-pairs">
            {TEMPLATE_COMPARE_PAIRS.map((pair) => {
              const disabled = !deckOptions.some((deck) => deck.id === pair.a) || !deckOptions.some((deck) => deck.id === pair.b);
              return (
                <button
                  key={pair.id}
                  type="button"
                  className={`template-compare-pair-btn ${activePairId === pair.id ? 'active' : ''}`}
                  disabled={disabled}
                  onClick={() => applyPair(pair)}
                >
                  {pair.label}
                </button>
              );
            })}
          </div>

          <div className="template-compare-toolbar">
            <div className="template-compare-selectors">
              <label>
                Mẫu A
                <select value={deckA?.id || ''} onChange={(event) => { setDeckAId(event.target.value); setSelectedPageIndexA(0); setSelectedPageIndexB(0); setActivePairId(''); }}>
                  {deckOptions.map((deck) => (
                    <option key={deck.id} value={deck.id}>{deck.navTitle}</option>
                  ))}
                </select>
              </label>
              <label>
                Mẫu B
                <select value={deckB?.id || ''} onChange={(event) => { setDeckBId(event.target.value); setSelectedPageIndexA(0); setSelectedPageIndexB(0); setActivePairId(''); }}>
                  {deckOptions.map((deck) => (
                    <option key={deck.id} value={deck.id}>{deck.navTitle}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="template-compare-sync-toggle">
              <input
                type="checkbox"
                checked={syncPages}
                onChange={(event) => setSyncPages(event.target.checked)}
              />
              <span>Đồng bộ số trang A ↔ B</span>
            </label>
          </div>

          {syncPages && listA && listB && listA.pages.length !== listB.pages.length ? (
            <p className="template-compare-sync-note">
              Hai mẫu khác số trang ({listA.pages.length} vs {listB.pages.length}). Đang so khớp theo thứ tự trang chung ({maxSharedPages} trang).
            </p>
          ) : null}

          <div className="template-compare-stage">
            <CompareDeckColumn
              label="Mẫu A"
              deck={deckA}
              list={listA}
              selectedPageIndex={syncPages ? sharedPageIndexA : selectedPageIndexA}
              onPageSelect={handlePageSelectA}
            />
            <CompareDeckColumn
              label="Mẫu B"
              deck={deckB}
              list={listB}
              selectedPageIndex={syncPages ? sharedPageIndexB : selectedPageIndexB}
              onPageSelect={handlePageSelectB}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
