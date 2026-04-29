'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { exportActiveList, exportBatch, exportSelectedPagePng } from '../lib/exportClient';
import { clearCachedDataset, readCachedDataset, writeCachedDataset } from '../lib/datasetCache';
import { emptyCaption, normalizeHashtagInput, normalizeSelection, readStoredSelection } from '../lib/selection';
import { SELECTION_STORAGE_KEY, listIsMain } from '../lib/utils';
import CaptionTools from './CaptionTools';
import DeleteListsModal from './DeleteListsModal';
import ExportModal from './ExportModal';
import PageInspector from './PageInspector';
import PreviewPanel from './PreviewPanel';
import ProgressBar from './ProgressBar';
import Sidebar from './Sidebar';

export default function DeckStudio({ initialDataset = null }) {
  const initialDeck = initialDataset?.decks?.[0] || null;
  const initialList = initialDeck?.lists?.[0] || null;
  const [dataset, setDataset] = useState(initialDataset);
  const [activeDeckId, setActiveDeckId] = useState(initialDeck?.id || null);
  const [activeListId, setActiveListId] = useState(initialList?.id || null);
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(initialDataset?.source?.totalItems
    ? `Đã tải ${initialDataset.source.totalItems} địa điểm.`
    : 'Đang tải dữ liệu workbook...');
  const [captionToolsVisible, setCaptionToolsVisible] = useState(false);
  const [captionTone, setCaptionTone] = useState('lich_trinh_huu_ich');
  const [caption, setCaption] = useState(emptyCaption);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedListsForExport, setSelectedListsForExport] = useState(new Set());
  const [selectedListsForDelete, setSelectedListsForDelete] = useState(new Set());
  const [progress, setProgress] = useState({ visible: false, failed: false, value: 0, label: 'Đang chuẩn bị xuất file...' });
  const currentSelectionRef = useRef({ activeDeckId: initialDeck?.id || null, activeListId: initialList?.id || null, selectedPageIndex: 0 });
  const selectionHistoryRef = useRef([]);

  const activeDeck = useMemo(
    () => dataset?.decks?.find((deck) => deck.id === activeDeckId) || null,
    [dataset, activeDeckId],
  );
  const activeList = useMemo(
    () => activeDeck?.lists?.find((list) => list.id === activeListId) || activeDeck?.lists?.[0] || null,
    [activeDeck, activeListId],
  );

  const showProgress = useCallback((label = 'Đang chuẩn bị xuất file...', value = 0) => {
    setProgress({ visible: true, failed: false, value, label });
  }, []);

  const updateProgress = useCallback((value, label) => {
    setProgress((prev) => ({
      visible: true,
      failed: prev.failed,
      value: Math.max(0, Math.min(100, Number(value) || 0)),
      label: label || prev.label,
    }));
  }, []);

  const completeProgress = useCallback((label = 'Đã xuất xong file.') => {
    setProgress({ visible: true, failed: false, value: 100, label });
    window.setTimeout(() => setProgress((prev) => ({ ...prev, visible: false })), 1600);
  }, []);

  const failProgress = useCallback((label = 'Xuất file thất bại.') => {
    setProgress({ visible: true, failed: true, value: 100, label });
  }, []);

  const exportCb = useMemo(() => ({
    setStatus,
    setBusy,
    showProgress,
    updateProgress,
    completeProgress,
    failProgress,
  }), [showProgress, updateProgress, completeProgress, failProgress]);

  const applyDataset = useCallback((nextDataset, preferredSelection = {}) => {
    const normalized = normalizeSelection(nextDataset, {
      ...currentSelectionRef.current,
      ...preferredSelection,
    });
    setDataset(nextDataset);
    setActiveDeckId(normalized.activeDeckId);
    setActiveListId(normalized.activeListId);
    setSelectedPageIndex(normalized.selectedPageIndex);
    currentSelectionRef.current = normalized;
  }, []);

  const loadDataset = useCallback(async (message = 'Đang tải dữ liệu workbook...', preferredSelection = {}, forceRefresh = false, options = {}) => {
    if (!options.silent) setStatus(message);
    const endpoint = forceRefresh ? '/api/guide-data?refresh=1' : '/api/guide-data';
    if (forceRefresh) clearCachedDataset();
    const response = await fetch(endpoint, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Không tải được dữ liệu: HTTP ${response.status}`);
    const nextDataset = await response.json();
    writeCachedDataset(nextDataset);
    applyDataset(nextDataset, preferredSelection);
    setStatus(`Đã tải ${nextDataset.source.totalItems} địa điểm.`);
    return nextDataset;
  }, [applyDataset]);

  useEffect(() => {
    const stored = readStoredSelection();
    currentSelectionRef.current = stored;
    setActiveDeckId(stored.activeDeckId);
    setActiveListId(stored.activeListId);
    setSelectedPageIndex(stored.selectedPageIndex);

    const cached = initialDataset ? null : readCachedDataset();
    if (cached?.dataset) {
      applyDataset(cached.dataset, stored);
      setStatus(`Đã mở dữ liệu đã lưu (${cached.dataset.source?.totalItems || 0} địa điểm). Đang kiểm tra cập nhật nền...`);
      loadDataset('Đang kiểm tra dữ liệu mới...', {}, false, { silent: true }).catch((error) => {
        console.error(error);
        setStatus(`Đang dùng dữ liệu đã lưu. Chưa tải được cập nhật mới: ${error.message}`);
      });
    } else if (initialDataset) {
      writeCachedDataset(initialDataset);
      applyDataset(initialDataset, stored);
      setStatus(`Đã tải ${initialDataset.source?.totalItems || 0} địa điểm.`);
    } else {
      loadDataset('Đang tải dữ liệu workbook...', {}).catch((error) => {
        console.error(error);
        setStatus(error.message);
      });
    }
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    currentSelectionRef.current = { activeDeckId, activeListId, selectedPageIndex };
    try {
      window.localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify({ activeDeckId, activeListId, selectedPageIndex }));
    } catch {
      // Ignore storage failures.
    }
  }, [activeDeckId, activeListId, selectedPageIndex]);

  const pushSelectionSnapshot = useCallback(() => {
    if (!activeDeckId && !activeListId) return;
    const snapshot = { activeDeckId, activeListId, selectedPageIndex };
    const history = selectionHistoryRef.current;
    const last = history[history.length - 1];
    if (
      last?.activeDeckId === snapshot.activeDeckId
      && last?.activeListId === snapshot.activeListId
      && last?.selectedPageIndex === snapshot.selectedPageIndex
    ) {
      return;
    }
    selectionHistoryRef.current = [...history.slice(-23), snapshot];
  }, [activeDeckId, activeListId, selectedPageIndex]);

  const restoreSelectionSnapshot = useCallback(() => {
    const history = selectionHistoryRef.current;
    const snapshot = history[history.length - 1];
    if (!snapshot) {
      setStatus('Chưa có thao tác để hoàn tác.');
      return;
    }

    selectionHistoryRef.current = history.slice(0, -1);
    setActiveDeckId(snapshot.activeDeckId);
    setActiveListId(snapshot.activeListId);
    setSelectedPageIndex(snapshot.selectedPageIndex);
    setCaptionToolsVisible(false);
    setStatus('Đã hoàn tác về lựa chọn trước đó.');
  }, []);

  const handleDeckSelect = useCallback((deck) => {
    pushSelectionSnapshot();
    setActiveDeckId(deck.id);
    setActiveListId(deck.lists[0]?.id || null);
    setSelectedPageIndex(0);
    setCaptionToolsVisible(false);
    setStatus(`Đang xem deck: ${deck.navTitle}.`);
  }, [pushSelectionSnapshot]);

  const handleListSelect = useCallback((list) => {
    pushSelectionSnapshot();
    setActiveListId(list.id);
    setSelectedPageIndex(0);
    setCaptionToolsVisible(false);
    setStatus(`Đang xem list: ${list.navTitle || list.title}.`);
  }, [pushSelectionSnapshot]);

  const handlePageSelect = useCallback((listId, pageIndex) => {
    pushSelectionSnapshot();
    setActiveListId(listId);
    setSelectedPageIndex(Number(pageIndex) || 0);
    setStatus(`Đã chọn trang ${(Number(pageIndex) || 0) + 1} để xuất PNG.`);
  }, [pushSelectionSnapshot]);

  const copyText = useCallback(async (text, message) => {
    if (!text) {
      setStatus('Chưa có nội dung để copy.');
      return;
    }
    await navigator.clipboard.writeText(text);
    setStatus(message);
  }, []);

  const requestCaption = useCallback(async (target = 'full') => {
    if (!activeDeck || !activeList) {
      setStatus('Chưa có list để gửi sang DeepSeek.');
      return;
    }

    setBusy(true);
    setStatus(`Đang gọi DeepSeek cho list "${activeList.title}"...`);
    try {
      const response = await fetch('/api/ai/deepseek/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: activeDeck.id,
          listId: activeList.id,
          tone: captionTone,
          target,
          current: {
            headline: caption.headline.trim(),
            body: caption.body.trim(),
            hashtags: normalizeHashtagInput(caption.hashtags),
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || `DeepSeek trả lỗi HTTP ${response.status}`);
      setCaption({
        headline: payload.headline || '',
        body: payload.body || '',
        hashtags: Array.isArray(payload.hashtags) ? payload.hashtags.join(' ') : '',
      });
      setStatus(`Đã nhận caption DeepSeek cho list "${activeList.title}".`);
    } catch (error) {
      console.error(error);
      setStatus(`Gọi DeepSeek thất bại: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }, [activeDeck, activeList, caption, captionTone]);

  const createDeckFromCaption = useCallback(async () => {
    if (!activeDeck) {
      setStatus('Chưa có deck để tạo list AI mới.');
      return;
    }
    if (!caption.headline.trim() || !caption.body.trim()) {
      setStatus('Cần có headline và body trước khi tạo list AI từ caption.');
      return;
    }

    setBusy(true);
    setStatus(`Đang tạo list AI mới trong deck "${activeDeck.navTitle}"...`);
    try {
      const response = await fetch('/api/decks/generate-from-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: activeDeck.id,
          listId: activeListId,
          caption: {
            headline: caption.headline.trim(),
            body: caption.body.trim(),
            hashtags: normalizeHashtagInput(caption.hashtags),
          },
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Tạo list AI thất bại: HTTP ${response.status}`);
      }
      const payload = await response.json();
      await loadDataset('Đang nạp lại deck sau khi tạo list AI...', {
        activeDeckId: payload.deckId,
        activeListId: payload.listId,
        selectedPageIndex: 0,
      });
      setStatus(`Đã tạo list mới "${payload.navTitle}" ngay trong deck "${activeDeck.navTitle}".`);
    } catch (error) {
      setStatus(error?.message || 'Không tạo được list AI mới.');
    } finally {
      setBusy(false);
    }
  }, [activeDeck, activeListId, caption, loadDataset]);

  const deleteGeneratedList = useCallback(async (deckId, listId) => {
    const confirmed = window.confirm('Bạn có chắc chắn muốn xóa bộ ảnh AI này?');
    if (!confirmed) return;

    setBusy(true);
    setStatus('Đang xóa list AI...');
    try {
      const deckBeforeDelete = dataset?.decks?.find((deck) => deck.id === deckId);
      const listIndex = deckBeforeDelete?.lists?.findIndex((list) => list.id === listId) ?? -1;
      const response = await fetch(`/api/decks/${encodeURIComponent(deckId)}/lists/${encodeURIComponent(listId)}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 204) {
        const message = await response.text();
        throw new Error(message || `Xóa thất bại: HTTP ${response.status}`);
      }

      const nextDataset = {
        ...dataset,
        decks: dataset.decks.map((deck) => deck.id === deckId
          ? { ...deck, lists: deck.lists.filter((list) => list.id !== listId) }
          : deck),
      };
      const nextDeck = nextDataset.decks.find((deck) => deck.id === deckId);
      const nextIndex = Math.max(0, Math.min(listIndex, (nextDeck?.lists?.length || 1) - 1));
      writeCachedDataset(nextDataset);
      applyDataset(nextDataset, {
        activeDeckId: deckId,
        activeListId: activeListId === listId ? nextDeck?.lists?.[nextIndex]?.id : activeListId,
        selectedPageIndex: 0,
      });
      setStatus('Đã xóa list AI thành công.');
    } catch (error) {
      setStatus(error?.message || 'Không xóa được list AI.');
    } finally {
      setBusy(false);
    }
  }, [activeListId, applyDataset, dataset]);

  const deleteSelectedLists = useCallback(async () => {
    const groups = (dataset?.decks || [])
      .map((deck) => ({
        deckId: deck.id,
        listIds: deck.lists.filter((list) => !listIsMain(list) && selectedListsForDelete.has(list.id)).map((list) => list.id),
      }))
      .filter((group) => group.listIds.length > 0);
    const listCount = groups.reduce((total, group) => total + group.listIds.length, 0);
    if (listCount === 0) return;
    const confirmed = window.confirm(`Xóa ${listCount} list AI đã chọn trong ${groups.length} mẫu?`);
    if (!confirmed) return;

    setBusy(true);
    setStatus(`Đang xóa ${listCount} list AI...`);
    try {
      const focusIndexByDeck = new Map();
      for (const group of groups) {
        const deckBeforeDelete = dataset.decks.find((deck) => deck.id === group.deckId);
        const deleteIndexes = group.listIds
          .map((id) => deckBeforeDelete?.lists?.findIndex((list) => list.id === id) ?? -1)
          .filter((index) => index >= 0);
        focusIndexByDeck.set(group.deckId, deleteIndexes.length > 0 ? Math.min(...deleteIndexes) : 0);
        for (const listId of group.listIds) {
          const response = await fetch(`/api/decks/${encodeURIComponent(group.deckId)}/lists/${encodeURIComponent(listId)}`, { method: 'DELETE' });
          if (!response.ok && response.status !== 204) {
            const message = await response.text();
            throw new Error(message || `Xóa thất bại: HTTP ${response.status}`);
          }
        }
      }
      const nextDataset = {
        ...dataset,
        decks: dataset.decks.map((deck) => {
          const group = groups.find((item) => item.deckId === deck.id);
          return group ? { ...deck, lists: deck.lists.filter((list) => !group.listIds.includes(list.id)) } : deck;
        }),
      };
      const activeDeckAfterDelete = nextDataset.decks.find((deck) => deck.id === activeDeckId) || nextDataset.decks[0] || null;
      const focusIndex = focusIndexByDeck.get(activeDeckAfterDelete?.id) ?? 0;
      const activeListStillExists = activeDeckAfterDelete?.lists?.some((list) => list.id === activeListId);
      writeCachedDataset(nextDataset);
      applyDataset(nextDataset, {
        activeDeckId: activeDeckAfterDelete?.id,
        activeListId: activeListStillExists ? activeListId : activeDeckAfterDelete?.lists?.[Math.max(0, Math.min(focusIndex, (activeDeckAfterDelete?.lists?.length || 1) - 1))]?.id,
        selectedPageIndex: 0,
      });
      setSelectedListsForDelete(new Set());
      setDeleteModalOpen(false);
      setStatus(`Đã xóa ${listCount} list AI.`);
    } catch (error) {
      setStatus(error?.message || 'Không xóa được các list AI đã chọn.');
    } finally {
      setBusy(false);
    }
  }, [activeDeckId, activeListId, applyDataset, dataset, selectedListsForDelete]);

  const handleExportBatch = useCallback(async () => {
    setExportModalOpen(false);
    await exportBatch({ dataset, selectedListIds: selectedListsForExport }, exportCb);
    setSelectedListsForExport(new Set());
  }, [dataset, exportCb, selectedListsForExport]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const targetTag = event.target?.tagName?.toLowerCase();
      const isTyping = targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select' || event.target?.isContentEditable;
      if (isTyping) return;

      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 's') {
        event.preventDefault();
        if (!busy) {
          exportSelectedPagePng({ deck: activeDeck, list: activeList, selectedPageIndex }, exportCb);
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault();
        restoreSelectionSnapshot();
        return;
      }

      if (!activeList?.pages?.length || event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        const nextIndex = Math.max(0, Math.min(activeList.pages.length - 1, selectedPageIndex + direction));
        if (nextIndex !== selectedPageIndex) {
          pushSelectionSnapshot();
          setSelectedPageIndex(nextIndex);
          setStatus(`Đã chọn trang ${nextIndex + 1}/${activeList.pages.length}.`);
        }
      }

      if (event.key === 'Escape' && captionToolsVisible) {
        setCaptionToolsVisible(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeDeck,
    activeList,
    busy,
    captionToolsVisible,
    exportCb,
    pushSelectionSnapshot,
    restoreSelectionSnapshot,
    selectedPageIndex,
  ]);

  const workspaceClasses = `workspace-grid list-focus-mode ${captionToolsVisible ? 'show-caption-tools' : ''}`;

  return (
    <main className="app-shell">
      <Sidebar
        dataset={dataset}
        activeDeckId={activeDeckId}
        activeListId={activeListId}
        onDeckSelect={handleDeckSelect}
        onListSelect={handleListSelect}
      />

      <section className="studio-shell">
        <header className="studio-topbar deck-toolbar">
          <div className="deck-heading">
            <p className="eyebrow">Đang làm việc</p>
            <h2 id="deckTitle" className="section-title">{activeDeck?.title || 'Đang tải...'}</h2>
            <p id="deckSubtitle" className="deck-subtitle">{activeDeck?.description || 'Tool đang đọc workbook và dựng các bộ ảnh mẫu.'}</p>
          </div>
          <div className="toolbar-actions">
            <button id="refreshBtn" className="toolbar-button" type="button" disabled={busy} onClick={() => loadDataset('Đang tải lại dữ liệu workbook...', {}, true).catch((error) => setStatus(error.message))}>Làm mới dữ liệu</button>
            <button
              id="showCaptionToolsBtn"
              className="toolbar-button secondary"
              type="button"
              aria-pressed={captionToolsVisible}
              onClick={() => setCaptionToolsVisible((prev) => !prev)}
            >
              {captionToolsVisible ? 'Ẩn sinh caption' : 'Sinh caption tự động'}
            </button>
            <button id="exportSelectedPageBtn" className="toolbar-button" type="button" disabled={busy} onClick={() => exportSelectedPagePng({ deck: activeDeck, list: activeList, selectedPageIndex }, exportCb)}>Xuất trang chọn</button>
            <button id="exportActiveListBtn" className="toolbar-button" type="button" disabled={busy} onClick={() => exportActiveList({ deck: activeDeck, list: activeList }, exportCb)}>Xuất list đang chọn</button>
            <button
              id="deleteListsBtn"
              className="toolbar-button danger"
              type="button"
              disabled={busy}
              onClick={() => {
                setSelectedListsForDelete(() => {
                  const next = new Set();
                  if (activeList && !listIsMain(activeList)) next.add(activeList.id);
                  return next;
                });
                setDeleteModalOpen(true);
              }}
            >
              Xóa list AI
            </button>
            <button id="batchExportBtn" className="toolbar-button primary" type="button" disabled={busy} onClick={() => setExportModalOpen(true)}>Xuất hàng loạt</button>
          </div>
        </header>

        <div className="status-strip">
          <span className="status-dot" />
          <p id="statusText" className="status-text">{status}</p>
        </div>
        <ProgressBar progress={progress} />

        <div className={workspaceClasses}>
          <PreviewPanel
            deck={activeDeck}
            list={activeList}
            selectedPageIndex={selectedPageIndex}
            onPageSelect={handlePageSelect}
            onDeleteList={deleteGeneratedList}
            loading={!dataset}
          />

          <aside className="right-panel">
            <section className="inspector-shell">
              <div className="panel-head compact">
                <div>
                  <p className="panel-kicker">Dữ liệu trang</p>
                  <h3 className="panel-title">Dữ liệu & ảnh</h3>
                </div>
              </div>
              <div id="pageInspector" className="page-inspector">
                <PageInspector deck={activeDeck} list={activeList} selectedPageIndex={selectedPageIndex} />
              </div>
            </section>

            <CaptionTools
              visible={captionToolsVisible}
              tone={captionTone}
              setTone={setCaptionTone}
              caption={caption}
              setCaption={setCaption}
              busy={busy}
              onRequestCaption={requestCaption}
              onCreateList={createDeckFromCaption}
              onCopy={copyText}
            />
          </aside>
        </div>
      </section>

      <ExportModal
        open={exportModalOpen}
        dataset={dataset}
        selectedIds={selectedListsForExport}
        setSelectedIds={setSelectedListsForExport}
        busy={busy}
        onClose={() => setExportModalOpen(false)}
        onExport={handleExportBatch}
      />
      <DeleteListsModal
        open={deleteModalOpen}
        dataset={dataset}
        selectedIds={selectedListsForDelete}
        setSelectedIds={setSelectedListsForDelete}
        busy={busy}
        onClose={() => setDeleteModalOpen(false)}
        onDelete={deleteSelectedLists}
      />
    </main>
  );
}
