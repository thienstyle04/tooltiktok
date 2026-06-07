'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { exportActiveList, exportBatch, exportSelectedPagePng } from '../lib/exportClient';
import { apiFetch } from '../lib/apiClient';
import {
  clearCachedDataset,
  markDatasetBackgroundChecked,
  readCachedDataset,
  shouldCheckDatasetInBackground,
  writeCachedDataset,
} from '../lib/datasetCache';
import { emptyCaption, normalizeHashtagInput, normalizeSelection, readStoredSelection } from '../lib/selection';
import { RETIRED_DECK_IDS, SELECTION_STORAGE_KEY, STUDIO_CATALOG_REVISION, STUDIO_CATALOG_REVISION_KEY, listIsMain, sanitizeDataset } from '../lib/utils';
import { setSpotlightV2CoverImagePool } from '../lib/pageMarkup';
import CaptionTools from './CaptionTools';
import DataStatsPanel from './DataStatsPanel';
import DeleteListsModal from './DeleteListsModal';
import ExportModal from './ExportModal';
import PageInspector from './PageInspector';
import PreviewDashboardPanel from './PreviewDashboardPanel';
import ProgressBar from './ProgressBar';
import Sidebar from './Sidebar';
import TemplateGalleryPanel from './TemplateGalleryPanel';

const GENERIC_CAPTION_BODY = 'Lưu list này để có lịch đi Đà Lạt gọn hơn, dễ chọn điểm theo buổi và đỡ mất thời gian mò từng nơi.';
const SPOTLIGHT_PARTNER_DECK_ID = 'spotlight-partner';

async function readApiPayload(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function apiErrorMessage(payload, fallback) {
  if (payload?.message) return payload.message;
  if (payload?.detail) return payload.detail;
  return fallback;
}

function stripVietnameseMarks(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function normalizeCaptionNameKey(value) {
  return stripVietnameseMarks(value).toLowerCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectCaptionForbiddenNames(list) {
  const names = new Map();
  const addName = (value) => {
    const name = String(value || '').replace(/\s+/g, ' ').trim();
    if (name.length < 3) return;
    names.set(normalizeCaptionNameKey(name), name);
  };

  for (const page of list?.pages || []) {
    if (page.type !== 'list') continue;
    for (const item of page.items || []) {
      addName(item.rawName);
      addName(item.name);
      addName(String(item.name || '').split(/:\s*/).slice(1).join(': '));
    }
  }

  return [...names.values()].sort((a, b) => b.length - a.length);
}

function getPlaceNameCandidates(name) {
  const normalized = String(name || '').replace(/\s+/g, ' ').trim();
  const unaccented = stripVietnameseMarks(normalized);
  return [...new Set([normalized, unaccented].filter((value) => value.length >= 3))];
}

function hasForbiddenPlaceName(value, forbiddenPlaceNames) {
  return forbiddenPlaceNames.some((name) => getPlaceNameCandidates(name).some((candidate) => {
    const escaped = escapeRegExp(candidate).replace(/\s+/g, '\\s+');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(value);
  }));
}

function bodyListsStops(value, forbiddenPlaceNames) {
  if (hasForbiddenPlaceName(value, forbiddenPlaceNames)) return true;

  const dayMarkers = value.match(/\b(?:ngày\s*(?:đầu|một|hai|ba|bốn|1|2|3|4)|sáng|trưa|chiều|tối)\b/giu) || [];
  const stopVerbs = value.match(/\b(?:ghé|qua|đi|lượn|chạy|săn|ăn|uống|check-?in|chụp)\b/giu) || [];
  return dayMarkers.length >= 2 && stopVerbs.length >= 2;
}

function sanitizeCaptionBody(body, list) {
  const clean = String(body || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  const forbiddenPlaceNames = collectCaptionForbiddenNames(list);
  return bodyListsStops(clean, forbiddenPlaceNames) ? GENERIC_CAPTION_BODY : clean;
}

const V2_TEMPLATE_DECK_IDS = [
  'grid-8-feed',
  'grid-8-quaytung',
  'spotlight-v2',
  'pov-3-v2',
];

const REQUIRED_CATALOG_DECK_IDS = [
  'grid-5',
  ...V2_TEMPLATE_DECK_IDS,
];

function hasEmptySpotlightPartnerDeck(dataset) {
  const deck = (dataset?.decks || []).find((item) => item.id === SPOTLIGHT_PARTNER_DECK_ID);
  return Boolean(deck && (deck.lists || []).length === 0);
}

function missingCatalogDecks(dataset) {
  const deckIds = new Set((dataset?.decks || []).map((deck) => deck.id));
  return REQUIRED_CATALOG_DECK_IDS.filter((deckId) => !deckIds.has(deckId));
}

function hasRetiredCatalogDecks(dataset) {
  return (dataset?.decks || []).some((deck) => RETIRED_DECK_IDS.has(deck.id));
}

function needsSpotlightCoverRefresh(dataset) {
  const coverCount = dataset?.source?.coverImageCount;
  if (typeof coverCount !== 'number' || coverCount < 4) return true;
  const deck = (dataset?.decks || []).find((item) => item.id === 'spotlight-v2');
  const cover = deck?.lists?.[0]?.pages?.find((page) => page.type === 'cover');
  const images = Array.isArray(cover?.coverImages) ? cover.coverImages.filter(Boolean) : [];
  return new Set(images).size < 4;
}

function needsGrid8QuaytungCatalogRefresh(dataset) {
  const deck = (dataset?.decks || []).find((item) => item.id === 'grid-8-quaytung');
  if (!deck) return true;
  const main = (deck.lists || []).find((list) => listIsMain(list));
  if (!main) return true;
  if (Number(main.templateVersion || 0) < 1) return true;
  if ((main.pages || []).length < 7) return true;
  const cover = main.pages.find((page) => page.type === 'cover');
  return cover?.layoutVariant !== 'grid-8-quaytung-cover';
}

function storedCatalogRevision() {
  if (typeof window === 'undefined') return '';
  try {
    return String(window.localStorage.getItem(STUDIO_CATALOG_REVISION_KEY) || '').trim();
  } catch {
    return '';
  }
}

function markCatalogRevisionStored() {
  if (typeof window === 'undefined') return;
  const value = STUDIO_CATALOG_REVISION;
  for (const storage of [window.localStorage, window.sessionStorage].filter(Boolean)) {
    try {
      storage.setItem(STUDIO_CATALOG_REVISION_KEY, value);
    } catch {
      // Ignore quota errors.
    }
  }
}

function needsTemplateCatalogRefresh(dataset) {
  if (storedCatalogRevision() !== STUDIO_CATALOG_REVISION) return true;
  return hasEmptySpotlightPartnerDeck(dataset)
    || hasRetiredCatalogDecks(dataset)
    || missingCatalogDecks(dataset).length > 0
    || needsSpotlightCoverRefresh(dataset)
    || needsGrid8QuaytungCatalogRefresh(dataset);
}

function listCountSignature(dataset) {
  return (dataset?.decks || [])
    .map((deck) => `${deck.id}:${(deck.lists || []).length}`)
    .join('|');
}

function deckCatalogSignature(dataset) {
  return (dataset?.decks || [])
    .map((deck) => deck.id)
    .sort()
    .join('|');
}

function formatSheetSyncTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

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
  const [activeView, setActiveView] = useState('preview');
  const [captionToolsVisible, setCaptionToolsVisible] = useState(false);
  const [captionTone, setCaptionTone] = useState('lich_trinh_huu_ich');
  const [caption, setCaption] = useState(emptyCaption);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedListsForExport, setSelectedListsForExport] = useState(new Set());
  const [exportQuality, setExportQuality] = useState('optimized');
  const [selectedListsForDelete, setSelectedListsForDelete] = useState(new Set());
  const [progress, setProgress] = useState({ visible: false, failed: false, value: 0, label: 'Đang chuẩn bị xuất file...' });
  const [partners, setPartners] = useState([]);
  const [savingCoverText, setSavingCoverText] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const currentSelectionRef = useRef({ activeDeckId: initialDeck?.id || null, activeListId: initialList?.id || null, selectedPageIndex: 0 });
  const v2CatalogRefreshAttemptedRef = useRef(false);
  const selectionHistoryRef = useRef([]);
  const spotlightPartnerRefreshRef = useRef(false);
  const datasetRef = useRef(initialDataset);
  const focusRefreshRef = useRef(0);

  const activeDeck = useMemo(
    () => dataset?.decks?.find((deck) => deck.id === activeDeckId) || null,
    [dataset, activeDeckId],
  );
  const activeList = useMemo(
    () => activeDeck?.lists?.find((list) => list.id === activeListId) || activeDeck?.lists?.[0] || null,
    [activeDeck, activeListId],
  );
  const captionSourceList = useMemo(
    () => (activeDeck?.lists || []).find((list) => listIsMain(list)) || activeList,
    [activeDeck, activeList],
  );
  const captionInspectList = useMemo(
    () => (activeList && !listIsMain(activeList) ? activeList : captionSourceList),
    [activeList, captionSourceList],
  );
  const activePage = activeList?.pages?.[selectedPageIndex] || null;
  const activePageItems = Array.isArray(activePage?.items) ? activePage.items : [];
  const activePartnerCount = activePageItems.filter((item) => item.isPartner).length;

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
    setProgress((prev) => ({
      visible: true,
      failed: true,
      value: Math.min(99, Math.max(0, Number(prev.value) || 0)),
      label,
    }));
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
    const sanitized = sanitizeDataset(nextDataset);
    setSpotlightV2CoverImagePool(sanitized?.source?.coverImageUrls || []);
    const normalized = normalizeSelection(sanitized, {
      ...currentSelectionRef.current,
      ...preferredSelection,
    });
    datasetRef.current = sanitized;
    setDataset(sanitized);
    setActiveDeckId(normalized.activeDeckId);
    setActiveListId(normalized.activeListId);
    setSelectedPageIndex(normalized.selectedPageIndex);
    currentSelectionRef.current = normalized;
  }, []);

  const loadDataset = useCallback(async (message = 'Đang tải dữ liệu workbook...', preferredSelection = {}, forceRefresh = false, options = {}) => {
    if (!options.silent) setStatus(message);
    if (forceRefresh) setRefreshing(true);
    try {
      const endpoint = forceRefresh ? '/api/guide-data?refresh=1' : '/api/guide-data';
      if (forceRefresh) clearCachedDataset();
      const response = await apiFetch(endpoint, forceRefresh ? { cache: 'no-store' } : {});
      if (!response.ok) throw new Error(`Không tải được dữ liệu: HTTP ${response.status}`);
      const nextDataset = await response.json();
      writeCachedDataset(nextDataset);
      markCatalogRevisionStored();
      applyDataset(nextDataset, preferredSelection);
      setStatus(`Đã tải ${nextDataset.source.totalItems} địa điểm.`);
      return nextDataset;
    } finally {
      if (forceRefresh) setRefreshing(false);
    }
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
      setStatus(`Đã mở dữ liệu đã lưu (${cached.dataset.source?.totalItems || 0} địa điểm).`);
      if (needsTemplateCatalogRefresh(cached.dataset)) {
        clearCachedDataset();
        loadDataset('Đang nạp lại thư viện mẫu V2...', stored, true, { silent: true }).catch((error) => {
          console.error(error);
          setStatus(`Đang dùng dữ liệu đã lưu. Chưa tải được mẫu mới: ${error.message}`);
        });
      } else if (shouldCheckDatasetInBackground()) {
        markDatasetBackgroundChecked();
        loadDataset('Đang kiểm tra dữ liệu mới...', {}, false, { silent: true }).catch((error) => {
          console.error(error);
          setStatus(`Đang dùng dữ liệu đã lưu. Chưa tải được cập nhật mới: ${error.message}`);
        });
      }
    } else if (initialDataset) {
      writeCachedDataset(initialDataset);
      applyDataset(initialDataset, stored);
      setStatus(`Đã tải ${initialDataset.source?.totalItems || 0} địa điểm.`);
    } else {
      loadDataset('Đang tải dữ liệu workbook...').catch((error) => {
        console.error(error);
        setStatus(error.message);
      });
    }
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    // Fetch partner list
    apiFetch('/api/partners').then(async (res) => {
      if (res.ok) setPartners(await res.json());
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const refreshIfServerChanged = async () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - focusRefreshRef.current < 5000) return;
      focusRefreshRef.current = now;

      try {
        const response = await apiFetch('/api/guide-data?refresh=1', { cache: 'no-store' });
        if (!response.ok) return;
        const nextDataset = await response.json();
        if (
          deckCatalogSignature(nextDataset) === deckCatalogSignature(datasetRef.current)
          && listCountSignature(nextDataset) === listCountSignature(datasetRef.current)
        ) return;
        writeCachedDataset(nextDataset);
        applyDataset(nextDataset, currentSelectionRef.current);
        setStatus(`Đã cập nhật dữ liệu mới (${nextDataset.source?.totalItems || 0} địa điểm).`);
      } catch (error) {
        console.warn(error);
      }
    };

    const onFocus = () => { refreshIfServerChanged(); };
    const onVisibilityChange = () => { refreshIfServerChanged(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [applyDataset]);

  useEffect(() => {
    currentSelectionRef.current = { activeDeckId, activeListId, selectedPageIndex };
    try {
      window.localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify({ activeDeckId, activeListId, selectedPageIndex }));
    } catch {
      // Ignore storage failures.
    }
  }, [activeDeckId, activeListId, selectedPageIndex]);

  useEffect(() => {
    if (!dataset || v2CatalogRefreshAttemptedRef.current || !needsTemplateCatalogRefresh(dataset)) return;
    v2CatalogRefreshAttemptedRef.current = true;
    clearCachedDataset();
    loadDataset('Đang nạp lại thư viện mẫu V2...', currentSelectionRef.current, true, { silent: true }).catch((error) => {
      console.error(error);
      setStatus(`Chưa tải được mẫu V2 mới: ${error.message}`);
    });
  }, [dataset, loadDataset]);

  useEffect(() => {
    if (activeDeckId !== SPOTLIGHT_PARTNER_DECK_ID) return;
    if (!activeDeck || (activeDeck.lists || []).length > 0) return;
    if (spotlightPartnerRefreshRef.current) return;
    spotlightPartnerRefreshRef.current = true;
    clearCachedDataset();
    loadDataset('Đang nạp lại mẫu Spotlight Đối tác...', {
      activeDeckId: SPOTLIGHT_PARTNER_DECK_ID,
      activeListId: null,
      selectedPageIndex: 0,
    }, true).catch((error) => {
      console.error(error);
      setStatus(error.message || 'Chưa tải được mẫu Spotlight Đối tác.');
    });
  }, [activeDeck, activeDeckId, loadDataset]);

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
    setActiveView('preview');
    setCaptionToolsVisible(false);
    setStatus('Đã hoàn tác về lựa chọn trước đó.');
  }, []);

  const handleDeckSelect = useCallback((deck) => {
    const defaultList = (deck.lists || []).find((list) => listIsMain(list)) || deck.lists[0] || null;
    pushSelectionSnapshot();
    setActiveDeckId(deck.id);
    setActiveListId(defaultList?.id || null);
    setSelectedPageIndex(0);
    setStatus(`Đang xem deck: ${deck.navTitle}.`);
  }, [pushSelectionSnapshot]);

  const handleListSelect = useCallback((list) => {
    pushSelectionSnapshot();
    setActiveListId(list.id);
    setSelectedPageIndex(0);
    setStatus(`Đang xem list: ${list.navTitle || list.title}.`);
  }, [pushSelectionSnapshot]);

  const previewGeneratedList = useCallback((list) => {
    handleListSelect(list);
    setActiveView('preview');
    setCaptionToolsVisible(false);
    setStatus(`Đã mở preview list: ${list.navTitle || list.title}.`);
  }, [handleListSelect]);

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

  const updateActiveCoverTextInDataset = useCallback((updates) => {
    if (!dataset || !activeDeckId || !activeListId) return null;
    let updatedList = null;
    const nextDataset = {
      ...dataset,
      decks: dataset.decks.map((deck) => {
        if (deck.id !== activeDeckId) return deck;
        return {
          ...deck,
          lists: deck.lists.map((list) => {
            if (list.id !== activeListId) return list;
            const pages = (list.pages || []).map((page, index) => {
              if (index !== selectedPageIndex || page.type !== 'cover') return page;
              return {
                ...page,
                ...(updates.coverTitle !== undefined ? { title: updates.coverTitle } : {}),
                ...(updates.coverSubtitle !== undefined ? { subtitle: updates.coverSubtitle } : {}),
              };
            });
            updatedList = {
              ...list,
              ...(updates.coverTitle !== undefined ? { title: updates.coverTitle || list.title, coverTitle: updates.coverTitle || list.coverTitle } : {}),
              pages,
            };
            return updatedList;
          }),
        };
      }),
    };
    writeCachedDataset(nextDataset);
    setDataset(nextDataset);
    return updatedList;
  }, [activeDeckId, activeListId, dataset, selectedPageIndex]);

  const handleCoverTextChange = useCallback((updates) => {
    updateActiveCoverTextInDataset(updates);
  }, [updateActiveCoverTextInDataset]);

  const saveCoverText = useCallback(async () => {
    if (!activeDeck || !activeList || !activePage || activePage.type !== 'cover') return;
    if (listIsMain(activeList)) {
      setStatus('List gốc lấy từ Google Sheet: chữ cover đã sửa tạm trong phiên, muốn lưu lâu dài hãy sửa trên Sheet hoặc tạo list AI.');
      return;
    }

    setSavingCoverText(true);
    try {
      const response = await apiFetch(`/api/decks/${encodeURIComponent(activeDeck.id)}/lists/${encodeURIComponent(activeList.id)}/cover`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coverTitle: activePage.title || activeList.coverTitle || activeList.title || '',
          coverSubtitle: activePage.subtitle || '',
        }),
      });
      const payload = await readApiPayload(response);
      if (!response.ok) throw new Error(apiErrorMessage(payload, `Lưu chữ cover thất bại: HTTP ${response.status}`));
      clearCachedDataset();
      setStatus('Đã lưu chữ cover cho list AI.');
    } catch (error) {
      setStatus(error?.message || 'Không lưu được chữ cover.');
    } finally {
      setSavingCoverText(false);
    }
  }, [activeDeck, activeList, activePage]);

  const requestCaption = useCallback(async (target = 'full') => {
    if (!activeDeck || !captionSourceList) {
      setStatus('Chưa có list để gửi sang DeepSeek.');
      return;
    }

    setBusy(true);
    setStatus(`Đang gọi DeepSeek cho list "${captionSourceList.title}"...`);
    try {
      const response = await apiFetch('/api/ai/deepseek/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: activeDeck.id,
          listId: captionSourceList.id,
          tone: captionTone,
          target,
          current: {
            coverTitle: (caption.coverTitle || '').trim(),
            headline: caption.headline.trim(),
            body: caption.body.trim(),
            hashtags: normalizeHashtagInput(caption.hashtags),
          },
        }),
      });
      const payload = await readApiPayload(response);
      if (!response.ok) throw new Error(apiErrorMessage(payload, `DeepSeek trả lỗi HTTP ${response.status}`));
      if (target === 'full') {
        setCaption({
          coverTitle: (payload.coverTitle || '').slice(0, 35),
          headline: payload.headline || '',
          body: sanitizeCaptionBody(payload.body, captionSourceList) || '',
          hashtags: Array.isArray(payload.hashtags) ? payload.hashtags.join(' ') : '',
        });
      } else {
        setCaption((prev) => ({
          coverTitle: target === 'cover_title' ? (payload.coverTitle || '').slice(0, 35) : prev.coverTitle,
          headline: target === 'headline' ? (payload.headline || '') : prev.headline,
          body: target === 'body' ? (sanitizeCaptionBody(payload.body, captionSourceList) || '') : prev.body,
          hashtags: target === 'hashtags' ? (Array.isArray(payload.hashtags) ? payload.hashtags.join(' ') : '') : prev.hashtags,
        }));
      }
      setStatus(`Đã nhận caption DeepSeek cho list "${captionSourceList.title}".`);
    } catch (error) {
      console.warn(error);
      setStatus(`Gọi DeepSeek thất bại: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }, [activeDeck, caption, captionSourceList, captionTone]);

  const createDeckFromCaption = useCallback(async () => {
    if (!activeDeck) {
      setStatus('Chưa có deck để tạo list AI mới.');
      return;
    }
    const coverTitle = (caption.coverTitle || '').trim();
    if (!coverTitle) {
      setStatus('Cần có tiêu đề cover (≤ 35 ký tự) trước khi tạo list AI.');
      return;
    }
    if (!caption.body.trim()) {
      setStatus('Cần có body caption trước khi tạo list AI.');
      return;
    }

    setBusy(true);
    setStatus(`Đang tạo list AI mới trong deck "${activeDeck.navTitle}"...`);
    try {
      const response = await apiFetch('/api/decks/generate-from-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: activeDeck.id,
          listId: captionSourceList?.id || activeListId,
          tone: captionTone,
          caption: {
            coverTitle: coverTitle.slice(0, 35),
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
      }, true);
      setStatus(`Đã tạo list mới "${payload.navTitle}" ngay trong deck "${activeDeck.navTitle}".`);
    } catch (error) {
      setStatus(error?.message || 'Không tạo được list AI mới.');
    } finally {
      setBusy(false);
    }
  }, [activeDeck, activeListId, caption, captionSourceList, loadDataset]);

  const createBatchLists = useCallback(async (count) => {
    if (!activeDeck) {
      setStatus('Chưa có deck để tạo batch list.');
      return;
    }
    const safeCount = Math.min(10, Math.max(1, Number(count) || 5));
    if (safeCount >= 5 && !window.confirm(`Tạo ${safeCount} list AI? Có thể mất vài phút.`)) return;
    setBusy(true);
    setStatus(`Đang tạo ${safeCount} list AI (xoay vòng tone)...`);
    try {
      const response = await apiFetch('/api/decks/generate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId: activeDeck.id, count: safeCount }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Tạo batch thất bại: HTTP ${response.status}`);
      }
      const payload = await response.json();
      await loadDataset('Đang nạp lại dữ liệu sau khi tạo batch...', {
        activeDeckId: activeDeck.id,
        activeListId: payload.lists?.[0]?.listId || activeListId,
        selectedPageIndex: 0,
      }, true);
      const msg = payload.failCount > 0
        ? `Đã tạo ${payload.successCount}/${safeCount} list (${payload.failCount} lỗi).`
        : `Đã tạo xong ${payload.successCount} list AI.`;
      setStatus(msg);
    } catch (error) {
      setStatus(error?.message || 'Không tạo được batch list.');
    } finally {
      setBusy(false);
    }
  }, [activeDeck, activeListId, loadDataset]);

  const createPartnerSpotlight = useCallback(async (partner) => {
    if (!partner?.id && !partner?.name) {
      setStatus('Chưa chọn đối tác.');
      return;
    }
    setBusy(true);
    setStatus(`Đang tạo spotlight cho "${partner.name}"...`);
    try {
      const response = await apiFetch('/api/decks/generate-partner-spotlight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: partner.id, partnerName: partner.name }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Tạo spotlight đối tác thất bại: HTTP ${response.status}`);
      }
      const payload = await response.json();
      await loadDataset('Đang nạp lại dữ liệu sau khi tạo spotlight đối tác...', {
        activeDeckId: payload.deckId,
        activeListId: payload.listId,
        selectedPageIndex: 0,
      }, true);
      setStatus(`Đã tạo spotlight "${payload.partnerName}" (${payload.pageCount} trang).`);
    } catch (error) {
      setStatus(error?.message || 'Không tạo được spotlight đối tác.');
    } finally {
      setBusy(false);
    }
  }, [loadDataset]);

  const deleteGeneratedList = useCallback(async (deckId, listId) => {
    const confirmed = window.confirm('Bạn có chắc chắn muốn xóa bộ ảnh AI này?');
    if (!confirmed) return;

    setBusy(true);
    setStatus('Đang xóa list AI...');
    try {
      const deckBeforeDelete = dataset?.decks?.find((deck) => deck.id === deckId);
      const listIndex = deckBeforeDelete?.lists?.findIndex((list) => list.id === listId) ?? -1;
      const response = await apiFetch(`/api/decks/${encodeURIComponent(deckId)}/lists/${encodeURIComponent(listId)}`, { method: 'DELETE' });
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
          const response = await apiFetch(`/api/decks/${encodeURIComponent(group.deckId)}/lists/${encodeURIComponent(listId)}`, { method: 'DELETE' });
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
      setActiveView('preview');
      setStatus(`Đã xóa ${listCount} list AI.`);
    } catch (error) {
      setStatus(error?.message || 'Không xóa được các list AI đã chọn.');
    } finally {
      setBusy(false);
    }
  }, [activeDeckId, activeListId, applyDataset, dataset, selectedListsForDelete]);

  const removeExportedGeneratedLists = useCallback(async (exportedLists = []) => {
    const groups = new Map();
    for (const item of exportedLists) {
      if (!item?.deckId || !item?.listId) continue;
      const deck = dataset?.decks?.find((entry) => entry.id === item.deckId);
      const list = deck?.lists?.find((entry) => entry.id === item.listId);
      if (!list || listIsMain(list)) continue;
      const listIds = groups.get(item.deckId) || [];
      if (!listIds.includes(item.listId)) listIds.push(item.listId);
      groups.set(item.deckId, listIds);
    }

    const cleanupGroups = Array.from(groups, ([deckId, listIds]) => ({ deckId, listIds }))
      .filter((group) => group.listIds.length > 0);
    const cleanupCount = cleanupGroups.reduce((total, group) => total + group.listIds.length, 0);
    if (cleanupCount === 0) return;

    setStatus(`Đã xuất xong. Đang xóa ${cleanupCount} list AI đã xuất...`);
    const focusIndexByDeck = new Map();
    for (const group of cleanupGroups) {
      const deckBeforeDelete = dataset.decks.find((deck) => deck.id === group.deckId);
      const deleteIndexes = group.listIds
        .map((id) => deckBeforeDelete?.lists?.findIndex((list) => list.id === id) ?? -1)
        .filter((index) => index >= 0);
      focusIndexByDeck.set(group.deckId, deleteIndexes.length > 0 ? Math.min(...deleteIndexes) : 0);

      for (const listId of group.listIds) {
        const response = await apiFetch(`/api/decks/${encodeURIComponent(group.deckId)}/lists/${encodeURIComponent(listId)}`, { method: 'DELETE' });
        if (!response.ok && response.status !== 204) {
          const message = await response.text();
          throw new Error(message || `Xóa list đã xuất thất bại: HTTP ${response.status}`);
        }
      }
    }

    const nextDataset = {
      ...dataset,
      decks: dataset.decks.map((deck) => {
        const group = cleanupGroups.find((item) => item.deckId === deck.id);
        return group ? { ...deck, lists: deck.lists.filter((list) => !group.listIds.includes(list.id)) } : deck;
      }),
    };
    const activeDeckAfterDelete = nextDataset.decks.find((deck) => deck.id === activeDeckId) || nextDataset.decks[0] || null;
    const focusIndex = focusIndexByDeck.get(activeDeckAfterDelete?.id) ?? 0;
    const activeListStillExists = activeDeckAfterDelete?.lists?.some((list) => list.id === activeListId);
    writeCachedDataset(nextDataset);
    applyDataset(nextDataset, {
      activeDeckId: activeDeckAfterDelete?.id,
      activeListId: activeListStillExists
        ? activeListId
        : activeDeckAfterDelete?.lists?.[Math.max(0, Math.min(focusIndex, (activeDeckAfterDelete?.lists?.length || 1) - 1))]?.id,
      selectedPageIndex: 0,
    });
    setSelectedListsForDelete((prev) => {
      const removed = new Set(cleanupGroups.flatMap((group) => group.listIds));
      return new Set(Array.from(prev).filter((id) => !removed.has(id)));
    });
    setStatus(`Đã xuất và xóa ${cleanupCount} list AI đã xuất.`);
  }, [activeDeckId, activeListId, applyDataset, dataset]);

  const handleExportPage = useCallback(async () => {
    await exportSelectedPagePng({
      deck: activeDeck,
      list: activeList,
      selectedPageIndex,
      quality: exportQuality,
    }, exportCb);
  }, [activeDeck, activeList, exportCb, exportQuality, selectedPageIndex]);

  const handleExportList = useCallback(async () => {
    await exportActiveList({
      deck: activeDeck,
      list: activeList,
      quality: exportQuality,
    }, exportCb);
  }, [activeDeck, activeList, exportCb, exportQuality]);

  const handleExportBatch = useCallback(async (options = {}) => {
    const shouldDelete = options.deleteAfterExport !== false;
    setExportModalOpen(false);
    setActiveView('preview');
    const result = await exportBatch({ dataset, selectedListIds: selectedListsForExport, quality: exportQuality }, exportCb);
    setSelectedListsForExport(new Set());
    if (result?.success && shouldDelete) {
      setBusy(true);
      try {
        await removeExportedGeneratedLists(result.exportedLists);
      } catch (error) {
        setStatus(error?.message || 'Đã xuất file nhưng chưa xóa được list AI đã xuất.');
      } finally {
        setBusy(false);
      }
    }
  }, [dataset, exportCb, exportQuality, removeExportedGeneratedLists, selectedListsForExport]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const targetTag = event.target?.tagName?.toLowerCase();
      const isTyping = targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select' || event.target?.isContentEditable;
      if (isTyping) return;

      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 's') {
        event.preventDefault();
        if (!busy) {
          exportSelectedPagePng({
            deck: activeDeck,
            list: activeList,
            selectedPageIndex,
            quality: exportQuality,
          }, exportCb);
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
        setActiveView('preview');
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
    exportQuality,
    pushSelectionSnapshot,
    restoreSelectionSnapshot,
    selectedPageIndex,
  ]);

  const openPreviewView = useCallback(() => {
    setActiveView('preview');
    setCaptionToolsVisible(false);
  }, []);

  const openTemplatesView = useCallback(() => {
    setActiveView('templates');
    setCaptionToolsVisible(false);
  }, []);

  const openCaptionView = useCallback(() => {
    if (captionSourceList && captionSourceList.id !== activeListId) {
      setActiveListId(captionSourceList.id);
      setSelectedPageIndex(0);
    }
    setActiveView('caption');
    setCaptionToolsVisible(true);
  }, [activeListId, captionSourceList]);

  const previewDeck = useCallback((deck) => {
    handleDeckSelect(deck);
    setActiveView('preview');
    setCaptionToolsVisible(false);
  }, [handleDeckSelect]);

  const captionDeck = useCallback((deck) => {
    handleDeckSelect(deck);
    setActiveView('caption');
    setCaptionToolsVisible(true);
  }, [handleDeckSelect]);

  const openExportView = useCallback(() => {
    setActiveView('export');
    setCaptionToolsVisible(false);
    setSelectedListsForExport(() => {
      const next = new Set();
      (dataset?.decks || []).forEach((deck) => {
        (deck.lists || [])
          .filter((list) => !listIsMain(list))
          .forEach((list) => {
            if (list?.id) next.add(list.id);
          });
      });
      return next;
    });
    setExportModalOpen(true);
  }, [dataset]);

  const openDataView = useCallback(() => {
    setActiveView('data');
    setCaptionToolsVisible(false);
  }, []);

  const openDeleteView = useCallback(() => {
    setActiveView('delete');
    setCaptionToolsVisible(false);
    setSelectedListsForDelete(() => {
      const next = new Set();
      if (activeList && !listIsMain(activeList)) next.add(activeList.id);
      return next;
    });
    setDeleteModalOpen(true);
  }, [activeList]);

  const workspaceClasses = [
    'workspace-grid',
    'list-focus-mode',
    activeView === 'templates' ? 'templates-mode' : '',
    activeView === 'preview' || activeView === 'export' || activeView === 'delete' ? 'preview-mode' : '',
    activeView === 'caption' ? 'caption-mode' : '',
    activeView === 'data' ? 'data-mode' : '',
  ].filter(Boolean).join(' ');

  return (
    <main className="app-shell">
      <Sidebar
        dataset={dataset}
        activeView={activeView}
        onOpenTemplates={openTemplatesView}
        onOpenPreview={openPreviewView}
        onOpenCaption={openCaptionView}
        onOpenExport={openExportView}
        onOpenData={openDataView}
        onOpenDelete={openDeleteView}
      />

      <section className="studio-shell">
        <header className="studio-topbar deck-toolbar">
          <div className="deck-heading">
            <div className="studio-breadcrumb">
              <span>Dalat Studio</span>
              <span className="breadcrumb-separator">/</span>
              <span>{activeDeck?.navTitle || 'Đang tải'}</span>
            </div>
            <div className="studio-title-row">
              <span className="deck-avatar" aria-hidden="true">DS</span>
              <div>
                <h2 id="deckTitle" className="section-title">{activeDeck?.title || 'Đang tải...'}</h2>
                <p id="deckSubtitle" className="deck-subtitle">{activeDeck?.description || 'Tool đang đọc workbook và dựng các bộ ảnh mẫu.'}</p>
              </div>
            </div>
            <div className="studio-stat-row">
              <span>{activeDeck?.lists?.length || 0} list</span>
              <span>{activeList?.pages?.length || 0} trang</span>
              <span>{activePageItems.length} dữ liệu</span>
              <span>{activePartnerCount} đối tác</span>
            </div>
          </div>
          <div className="toolbar-actions">
            <span className="sync-meta" title={dataset?.generatedAt || ''}>
              {refreshing ? 'Đang sync Sheet...' : `Sheet: ${formatSheetSyncTime(dataset?.generatedAt)}`}
            </span>
            <button
              id="refreshBtn"
              className="toolbar-button"
              type="button"
              disabled={busy || refreshing}
              onClick={() => loadDataset('Đang tải lại dữ liệu workbook...', {}, true).catch((error) => setStatus(error.message))}
            >
              {refreshing ? 'Đang sync...' : 'Làm mới'}
            </button>
          </div>
        </header>

        <div className="status-strip">
          <span className="status-dot" />
          <p id="statusText" className="status-text">{status}</p>
        </div>
        <ProgressBar progress={progress} />

        {activeView === 'templates' ? (
          <div className={workspaceClasses}>
            <TemplateGalleryPanel
              dataset={dataset}
              activeDeckId={activeDeckId}
              activeListId={activeListId}
              onDeckSelect={handleDeckSelect}
              onListSelect={handleListSelect}
              onPreviewDeck={previewDeck}
              onCaptionDeck={captionDeck}
            />
          </div>
        ) : activeView === 'data' ? (
          <div className={workspaceClasses}>
            <DataStatsPanel
              dataset={dataset}
              activeDeckId={activeDeckId}
              onPreviewDeck={previewDeck}
            />
          </div>
        ) : activeView === 'caption' ? (
          <div className={workspaceClasses}>
            <CaptionTools
              visible={captionToolsVisible}
              dataset={dataset}
              activeDeck={activeDeck}
              activeList={captionSourceList}
              selectedListId={activeListId}
              tone={captionTone}
              setTone={setCaptionTone}
              caption={caption}
              setCaption={setCaption}
              busy={busy}
              onDeckSelect={handleDeckSelect}
              onListSelect={handleListSelect}
              onGeneratedListSelect={previewGeneratedList}
              onRequestCaption={requestCaption}
              onCreateList={createDeckFromCaption}
              onCreateBatchLists={createBatchLists}
              onCreatePartnerSpotlight={createPartnerSpotlight}
              partners={partners}
              onCopy={copyText}
            />

            <aside className="right-panel">
              <section className="inspector-shell caption-context-shell">
                <div className="panel-head compact">
                  <div>
                    <p className="panel-kicker">Mẫu đang chọn</p>
                    <h3 className="panel-title">{captionInspectList?.navTitle || captionInspectList?.title || 'Chưa có list'}</h3>
                  </div>
                </div>
                <div id="pageInspector" className="page-inspector">
                  <PageInspector
                    deck={activeDeck}
                    list={captionInspectList}
                    selectedPageIndex={selectedPageIndex}
                  />
                </div>
              </section>
            </aside>
          </div>
        ) : (
          <div className={workspaceClasses}>
            <PreviewDashboardPanel
              dataset={dataset}
              activeDeck={activeDeck}
              activeList={activeList}
              activeDeckId={activeDeckId}
              activeListId={activeListId}
              selectedPageIndex={selectedPageIndex}
              onDeckSelect={handleDeckSelect}
              onListSelect={handleListSelect}
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
                  <PageInspector
                    deck={activeDeck}
                    list={activeList}
                    selectedPageIndex={selectedPageIndex}
                    onCoverTextChange={handleCoverTextChange}
                    onCoverTextSave={saveCoverText}
                    savingCoverText={savingCoverText}
                    onExportPage={handleExportPage}
                    onExportList={handleExportList}
                    busy={busy}
                  />
                </div>
              </section>

            </aside>
          </div>
        )}
      </section>

      <ExportModal
        open={exportModalOpen}
        dataset={dataset}
        selectedIds={selectedListsForExport}
        setSelectedIds={setSelectedListsForExport}
        quality={exportQuality}
        setQuality={setExportQuality}
        busy={busy}
        onClose={() => {
          setExportModalOpen(false);
          if (activeView === 'export') setActiveView('preview');
        }}
        onExport={handleExportBatch}
      />
      <DeleteListsModal
        open={deleteModalOpen}
        dataset={dataset}
        selectedIds={selectedListsForDelete}
        setSelectedIds={setSelectedListsForDelete}
        busy={busy}
        onClose={() => {
          setDeleteModalOpen(false);
          if (activeView === 'delete') setActiveView('preview');
        }}
        onDelete={deleteSelectedLists}
      />
    </main>
  );
}
