'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { exportActiveList, exportBatch, exportSelectedPagePng } from '../lib/exportClient';
import { apiFetch, fetchGuideDataset, formatApiError } from '../lib/apiClient';
import {
  clearCachedDataset,
  markDatasetBackgroundChecked,
  readCachedDataset,
  shouldCheckDatasetInBackground,
  writeCachedDataset,
} from '../lib/datasetCache';
import { emptyCaption, normalizeHashtagInput, normalizeSelection, readStoredSelection } from '../lib/selection';
import { RETIRED_DECK_IDS, SELECTION_STORAGE_KEY, STUDIO_CATALOG_REVISION, STUDIO_CATALOG_REVISION_KEY, budget72HListHasLegacyScheduleCosts, budget72HTableMatchesMain, listIsMain, sanitizeDataset } from '../lib/utils';
import { setSpotlightV2CoverImagePool } from '../lib/pageMarkup';
import CaptionTools from './CaptionTools';
import DataStatsPanel from './DataStatsPanel';
import DeleteListsModal from './DeleteListsModal';
import ExportModal from './ExportModal';
import PageInspector from './PageInspector';
import PreviewDashboardPanel from './PreviewDashboardPanel';
import ProgressBar from './ProgressBar';
import Sidebar from './Sidebar';
import SettingsPanel from './SettingsPanel';
import TemplateGalleryPanel from './TemplateGalleryPanel';

const GENERIC_CAPTION_BODY = 'Lưu list này để có lịch đi Đà Lạt gọn hơn, dễ chọn điểm theo buổi và đỡ mất thời gian mò từng nơi.';
const SPOTLIGHT_PARTNER_DECK_ID = 'spotlight-partner';
const BUILTIN_DESTINATION_FALLBACKS = [
  { id: 'dalat', label: 'Đà Lạt', shortLabel: 'ĐL' },
  { id: 'greenland', label: 'Green Land', shortLabel: 'GL' },
];

function mergeDestinations(...lists) {
  const merged = new Map();
  for (const list of lists) {
    for (const entry of list || []) {
      if (!entry?.id) continue;
      merged.set(entry.id, { ...(merged.get(entry.id) || {}), ...entry });
    }
  }
  return [...merged.values()];
}

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
  'grid-6-quaytung',
  'grid-8-feed',
  'grid-8-quaytung',
  'spotlight-v2',
  'spotlight-v3',
  'carousel-mau-1',
  'itinerary-4n3d-stack',
  'itinerary-timeline',
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

function needsGrid6QuaytungCatalogRefresh(dataset) {
  const deck = (dataset?.decks || []).find((item) => item.id === 'grid-6-quaytung');
  if (!deck) return true;
  const main = (deck.lists || []).find((list) => listIsMain(list));
  if (!main) return true;
  if (Number(main.templateVersion || 0) < 6) return true;
  if ((main.pages || []).length < 8) return true;
  const cover = main.pages.find((page) => page.type === 'cover');
  return cover?.layoutVariant !== 'grid-6-quaytung-cover';
}

function needsGrid8QuaytungCatalogRefresh(dataset) {
  const deck = (dataset?.decks || []).find((item) => item.id === 'grid-8-quaytung');
  if (!deck) return true;
  const main = (deck.lists || []).find((list) => listIsMain(list));
  if (!main) return true;
  if (Number(main.templateVersion || 0) < 3) return true;
  if ((main.pages || []).length < 7) return true;
  const cover = main.pages.find((page) => page.type === 'cover');
  return cover?.layoutVariant !== 'grid-8-quaytung-cover';
}

const GRID_5_MIN_TEMPLATE_VERSION = 4;

function needsGrid5CatalogRefresh(dataset) {
  const deck = (dataset?.decks || []).find((item) => item.id === 'grid-5');
  if (!deck) return true;
  const main = (deck.lists || []).find((list) => listIsMain(list));
  if (!main) return true;
  if (Number(main.templateVersion || 0) < GRID_5_MIN_TEMPLATE_VERSION) return true;
  if ((main.pages || []).length < 8) return true;
  const cover = main.pages.find((page) => page.type === 'cover');
  return cover?.layoutVariant !== 'grid-5';
}

const BUDGET_72H_SUMMARY_MIN_TEMPLATE_VERSION = 7;

function isStaleBudget72HSummaryList(list, deck = null) {
  if (!list) return true;
  if (Number(list.templateVersion || 0) < BUDGET_72H_SUMMARY_MIN_TEMPLATE_VERSION) return true;
  if (budget72HListHasLegacyScheduleCosts(list)) return true;
  if (!listIsMain(list) && deck) {
    const mainList = (deck.lists || []).find((entry) => listIsMain(entry));
    if (mainList && budget72HTableMatchesMain(list, mainList)) return true;
  }
  return false;
}

function needsBudget72HSummaryCatalogRefresh(dataset) {
  const deck = (dataset?.decks || []).find((item) => item.id === 'budget-72h-summary');
  if (!deck) return true;
  return (deck.lists || []).some((list) => isStaleBudget72HSummaryList(list, deck));
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
    || needsGrid6QuaytungCatalogRefresh(dataset)
    || needsGrid8QuaytungCatalogRefresh(dataset)
    || needsGrid5CatalogRefresh(dataset)
    || needsBudget72HSummaryCatalogRefresh(dataset);
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
  const [savingPageText, setSavingPageText] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [destinationInfo, setDestinationInfo] = useState(null);
  const [switchingDestination, setSwitchingDestination] = useState(false);
  const [driveCacheStatus, setDriveCacheStatus] = useState({
    phase: 'checking',
    ready: false,
    total: 0,
    completed: 0,
    cached: 0,
    downloaded: 0,
    failed: 0,
    percent: 0,
    message: 'Đang kiểm tra cache ảnh Google Drive...',
  });
  const [driveCacheReadyNotice, setDriveCacheReadyNotice] = useState(false);
  const [dismissedCacheDestinationId, setDismissedCacheDestinationId] = useState(null);
  const currentSelectionRef = useRef({ activeDeckId: initialDeck?.id || null, activeListId: initialList?.id || null, selectedPageIndex: 0 });
  const v2CatalogRefreshAttemptedRef = useRef(false);
  const selectionHistoryRef = useRef([]);
  const spotlightPartnerRefreshRef = useRef(false);
  const datasetRef = useRef(initialDataset);
  const focusRefreshRef = useRef(0);
  const driveCacheWasWaitingRef = useRef(false);
  const creatingListsRef = useRef(false);

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
      const response = await fetchGuideDataset(endpoint, forceRefresh ? { cache: 'no-store' } : {});
      if (!response.ok) throw new Error(await formatApiError(response, 'Không tải được dữ liệu'));
      const nextDataset = await response.json();
      writeCachedDataset(nextDataset);
      markCatalogRevisionStored();
      applyDataset(nextDataset, preferredSelection);
      const label = nextDataset?.source?.destinationLabel || 'Sheet';
      setStatus(`Đã tải ${nextDataset.source.totalItems} địa điểm (${label}).`);
      return nextDataset;
    } finally {
      if (forceRefresh) setRefreshing(false);
    }
  }, [applyDataset]);

  const loadDestinations = useCallback(async () => {
    const response = await apiFetch('/api/destinations', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Không tải được danh sách điểm đến: HTTP ${response.status}`);
    const payload = await response.json();
    setDestinationInfo(payload);
    return payload;
  }, []);

  const applyDestinationMutation = useCallback(async (payload) => {
    let latestDestinationInfo = null;
    try {
      const destinationsResponse = await apiFetch('/api/destinations', { cache: 'no-store' });
      if (destinationsResponse.ok) latestDestinationInfo = await destinationsResponse.json();
    } catch {
      // Keep the current destination list if the follow-up refresh fails.
    }

    const updatedActive = payload?.active
      ? {
          ...payload.active,
          totalItems: payload?.dataset?.source?.totalItems ?? payload?.active?.totalItems,
          syncedAt: payload?.dataset?.generatedAt || payload?.active?.syncedAt,
        }
      : (latestDestinationInfo?.active || null);

    setDestinationInfo((previous) => ({
      active: updatedActive || previous?.active || null,
      destinations: mergeDestinations(
        BUILTIN_DESTINATION_FALLBACKS,
        previous?.destinations,
        latestDestinationInfo?.destinations,
        payload?.destinations,
        updatedActive ? [updatedActive] : [],
      ),
    }));

    if (payload?.dataset) {
      clearCachedDataset();
      writeCachedDataset(payload.dataset);
      markCatalogRevisionStored();
      applyDataset(payload.dataset, currentSelectionRef.current);
    }

    return updatedActive;
  }, [applyDataset]);

  const switchDestination = useCallback(async (destinationId) => {
    if (!destinationId || destinationId === destinationInfo?.active?.id || switchingDestination) return;
    setSwitchingDestination(true);
    setRefreshing(true);
    setStatus('Đang chuyển nguồn dữ liệu...');
    try {
      const response = await apiFetch('/api/destination', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: destinationId }),
        cache: 'no-store',
      });
      const payload = await readApiPayload(response);
      if (!response.ok) throw new Error(apiErrorMessage(payload, `Không chuyển được nguồn dữ liệu: HTTP ${response.status}`));
      await applyDestinationMutation(payload);
      const label = payload?.active?.label || payload?.dataset?.source?.destinationLabel || 'Sheet';
      setStatus(`Đã chuyển sang ${label} (${payload.dataset?.source?.totalItems || 0} địa điểm).`);
    } catch (error) {
      setStatus(`Không thể chuyển nguồn: ${error?.message || 'Không truy cập được dữ liệu'}. Hệ thống đã giữ nguyên nguồn đang dùng.`);
    } finally {
      setSwitchingDestination(false);
      setRefreshing(false);
    }
  }, [applyDestinationMutation, destinationInfo?.active?.id, switchingDestination]);

  const addDestination = useCallback(async ({ label, sheetUrl, file }) => {
    if (switchingDestination) return;
    setSwitchingDestination(true);
    setRefreshing(true);
    setStatus(`Đang kiểm tra workbook ${label}...`);
    try {
      const body = new FormData();
      body.set('label', label);
      if (sheetUrl) body.set('sheetUrl', sheetUrl);
      if (file) body.set('file', file);
      const response = await apiFetch('/api/destinations/xlsx', {
        method: 'POST',
        body,
        cache: 'no-store',
      });
      const payload = await readApiPayload(response);
      if (!response.ok) {
        throw new Error(apiErrorMessage(payload, `Không thêm được workbook XLSX: HTTP ${response.status}`));
      }
      await applyDestinationMutation(payload);
      setStatus(`Đã thêm và chuyển sang ${payload.active?.label || label} (${payload.dataset?.source?.totalItems || 0} địa điểm).`);
      return payload.active;
    } finally {
      setSwitchingDestination(false);
      setRefreshing(false);
    }
  }, [applyDestinationMutation, switchingDestination]);

  const replaceDestinationWorkbook = useCallback(async (destinationId, file) => {
    if (!destinationId || !file || switchingDestination) return null;
    setSwitchingDestination(true);
    setRefreshing(true);
    setStatus('Đang thay file XLSX...');
    try {
      const body = new FormData();
      body.set('file', file);
      const response = await apiFetch(`/api/destinations/${encodeURIComponent(destinationId)}/xlsx`, {
        method: 'PUT',
        body,
        cache: 'no-store',
      });
      const payload = await readApiPayload(response);
      if (!response.ok) {
        throw new Error(apiErrorMessage(payload, `Không thay được file XLSX: HTTP ${response.status}`));
      }
      const updatedActive = await applyDestinationMutation(payload);
      const label = updatedActive?.label || payload?.dataset?.source?.destinationLabel || 'Sheet';
      setStatus(`Đã cập nhật workbook cho ${label} (${payload.dataset?.source?.totalItems || 0} địa điểm).`);
      return updatedActive;
    } finally {
      setSwitchingDestination(false);
      setRefreshing(false);
    }
  }, [applyDestinationMutation, switchingDestination]);

  const refreshDestinationFromSheet = useCallback(async (destinationId) => {
    if (!destinationId || switchingDestination) return null;
    setSwitchingDestination(true);
    setRefreshing(true);
    setStatus('Đang tải mới từ Google Sheet...');
    try {
      const response = await apiFetch(`/api/destinations/${encodeURIComponent(destinationId)}/refresh-from-sheet`, {
        method: 'POST',
        cache: 'no-store',
      });
      const payload = await readApiPayload(response);
      if (!response.ok) {
        throw new Error(apiErrorMessage(payload, `Không tải mới được từ Google Sheet: HTTP ${response.status}`));
      }
      const updatedActive = await applyDestinationMutation(payload);
      const label = updatedActive?.label || payload?.dataset?.source?.destinationLabel || 'Sheet';
      setStatus(`Đã tải mới ${label} từ Google Sheet (${payload.dataset?.source?.totalItems || 0} địa điểm).`);
      return updatedActive;
    } finally {
      setSwitchingDestination(false);
      setRefreshing(false);
    }
  }, [applyDestinationMutation, switchingDestination]);

  useEffect(() => {
    const stored = readStoredSelection();
    currentSelectionRef.current = stored;
    setActiveDeckId(stored.activeDeckId);
    setActiveListId(stored.activeListId);
    setSelectedPageIndex(stored.selectedPageIndex);

    let cancelled = false;

    const bootstrap = async () => {
      let destinations = null;
      try {
        destinations = await loadDestinations();
      } catch (error) {
        console.error(error);
      }

      const cached = initialDataset ? null : readCachedDataset();
      const activeDestinationId = destinations?.active?.id || cached?.dataset?.source?.destinationId || null;
      if (cached?.dataset && activeDestinationId && cached.dataset?.source?.destinationId !== activeDestinationId) {
        clearCachedDataset();
      } else if (cached?.dataset) {
        if (!cancelled) {
          applyDataset(cached.dataset, stored);
          setStatus(`Đã mở dữ liệu đã lưu (${cached.dataset.source?.totalItems || 0} địa điểm${cached.dataset.source?.destinationLabel ? ` — ${cached.dataset.source.destinationLabel}` : ''}).`);
        }
        if (needsTemplateCatalogRefresh(cached.dataset)) {
          clearCachedDataset();
          loadDataset('Đang nạp lại thư viện mẫu V2...', stored, true, { silent: true }).catch((error) => {
            console.error(error);
            if (!cancelled) setStatus(`Đang dùng dữ liệu đã lưu. Chưa tải được mẫu mới: ${error.message}`);
          });
        } else if (shouldCheckDatasetInBackground()) {
          markDatasetBackgroundChecked();
          loadDataset('Đang kiểm tra dữ liệu mới...', {}, false, { silent: true }).catch((error) => {
            console.error(error);
            if (!cancelled) setStatus(`Đang dùng dữ liệu đã lưu. Chưa tải được cập nhật mới: ${error.message}`);
          });
        }
        return;
      }

      if (initialDataset) {
        writeCachedDataset(initialDataset);
        applyDataset(initialDataset, stored);
        setStatus(`Đã tải ${initialDataset.source?.totalItems || 0} địa điểm.`);
        return;
      }

      loadDataset('Đang tải dữ liệu workbook...', stored).catch((error) => {
        console.error(error);
        if (!cancelled) setStatus(error.message);
      });
    };

    bootstrap().catch((error) => {
      console.error(error);
      if (!cancelled) setStatus(error.message);
    });

    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    // Fetch partner list
    apiFetch('/api/partners').then(async (res) => {
      if (res.ok) setPartners(await res.json());
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [applyDataset, initialDataset, loadDataset, loadDestinations]);

  useEffect(() => {
    let cancelled = false;
    let readyNoticeTimer = null;

    const loadDriveCacheStatus = async () => {
      try {
        const response = await apiFetch('/api/drive-cache/status', { cache: 'no-store' });
        if (!response.ok) return;
        const next = await response.json();
        if (cancelled) return;
        setDriveCacheStatus(next);
        if (!next.ready) {
          driveCacheWasWaitingRef.current = true;
        } else if (driveCacheWasWaitingRef.current) {
          driveCacheWasWaitingRef.current = false;
          setDismissedCacheDestinationId(null);
          setDriveCacheReadyNotice(true);
          if (readyNoticeTimer) window.clearTimeout(readyNoticeTimer);
          readyNoticeTimer = window.setTimeout(() => setDriveCacheReadyNotice(false), 5000);
        }
      } catch {
        // Backend guard vẫn chặn tạo list nếu cache chưa sẵn sàng.
      }
    };

    loadDriveCacheStatus();
    const interval = window.setInterval(loadDriveCacheStatus, 1200);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (readyNoticeTimer) window.clearTimeout(readyNoticeTimer);
    };
  }, []);

  useEffect(() => {
    const refreshIfServerChanged = async () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - focusRefreshRef.current < 5000) return;
      focusRefreshRef.current = now;

      try {
        const response = await apiFetch('/api/guide-data', { cache: 'no-store' });
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

  const updateActivePageTextInDataset = useCallback((updates) => {
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
              if (index !== selectedPageIndex) return page;
              return {
                ...page,
                ...(updates.title !== undefined ? { title: updates.title } : {}),
                ...(updates.subtitle !== undefined ? { subtitle: updates.subtitle } : {}),
              };
            });
            const editingCover = selectedPageIndex === 0 && pages[0]?.type === 'cover';
            updatedList = {
              ...list,
              ...(editingCover && updates.title !== undefined
                ? { title: updates.title, coverTitle: updates.title }
                : {}),
              pages,
            };
            return updatedList;
          }),
        };
      }),
    };
    datasetRef.current = nextDataset;
    setDataset(nextDataset);
    return { updatedList, nextDataset };
  }, [activeDeckId, activeListId, dataset, selectedPageIndex]);

  const handlePageTextChange = useCallback((updates) => {
    updateActivePageTextInDataset(updates);
  }, [updateActivePageTextInDataset]);

  const savePageText = useCallback(async () => {
    if (!activeDeck || !activeList || !activePage) return;
    setSavingPageText(true);
    try {
      const response = await apiFetch(`/api/decks/${encodeURIComponent(activeDeck.id)}/lists/${encodeURIComponent(activeList.id)}/pages/${selectedPageIndex}/text`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: activePage.title || '',
          subtitle: activePage.subtitle || '',
        }),
      });
      const payload = await readApiPayload(response);
      if (!response.ok) throw new Error(apiErrorMessage(payload, `Lưu nội dung trang thất bại: HTTP ${response.status}`));
      const result = updateActivePageTextInDataset({ title: payload.title, subtitle: payload.subtitle });
      if (result?.nextDataset) writeCachedDataset(result.nextDataset);
      setStatus(`Đã lưu nội dung trang ${selectedPageIndex + 1}.`);
    } catch (error) {
      setStatus(error?.message || 'Không lưu được nội dung trang. Bản nháp vẫn được giữ.');
    } finally {
      setSavingPageText(false);
    }
  }, [activeDeck, activeList, activePage, selectedPageIndex, updateActivePageTextInDataset]);

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
          coverTitle: (payload.coverTitle || '').slice(0, 56),
          headline: payload.headline || '',
          body: sanitizeCaptionBody(payload.body, captionSourceList) || '',
          hashtags: Array.isArray(payload.hashtags) ? payload.hashtags.join(' ') : '',
        });
      } else {
        setCaption((prev) => ({
          coverTitle: target === 'cover_title' ? (payload.coverTitle || '').slice(0, 56) : prev.coverTitle,
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
    if (!driveCacheStatus.ready) {
      setStatus('Đang đồng bộ ảnh Google Drive vào cache, tạm thời chưa thể tạo list.');
      return;
    }
    if (!activeDeck) {
      setStatus('Chưa có deck để tạo list AI mới.');
      return;
    }
    const isNonAiTemplate = activeDeck.id === 'carousel-mau-1';
    const coverTitle = (caption.coverTitle || '').trim();
    if (!isNonAiTemplate && !coverTitle) {
      setStatus('Cần có tiêu đề cover trước khi tạo list AI.');
      return;
    }

    setBusy(true);
    setStatus(isNonAiTemplate
      ? `Đang tạo Mẫu 1 từ Google Sheet "${activeDeck.navTitle}"...`
      : `Đang tạo list AI mới trong deck "${activeDeck.navTitle}"...`);
    try {
      const response = await apiFetch('/api/decks/generate-from-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: activeDeck.id,
          listId: captionSourceList?.id || activeListId,
          tone: captionTone,
          caption: {
            coverTitle: isNonAiTemplate ? '' : coverTitle.slice(0, 56),
            headline: isNonAiTemplate ? '' : caption.headline.trim(),
            body: isNonAiTemplate ? '' : caption.body.trim(),
            hashtags: isNonAiTemplate ? [] : normalizeHashtagInput(caption.hashtags),
          },
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Tạo list AI thất bại: HTTP ${response.status}`);
      }
      const payload = await response.json();
      // Không cần refresh=1: list AI mới đã được lưu ở backend và luôn được merge tươi mỗi lần đọc,
      // nên chỉ cần nạp lại dataset thường (không ép đồng bộ lại Google Sheet) là đủ và nhanh hơn nhiều.
      await loadDataset('Đang nạp lại deck sau khi tạo list AI...', {
        activeDeckId: payload.deckId,
        activeListId: payload.listId,
        selectedPageIndex: 0,
      }, false);
      setStatus(`Đã tạo list mới "${payload.navTitle}" ngay trong deck "${activeDeck.navTitle}".`);
    } catch (error) {
      setStatus(error?.message || 'Không tạo được list AI mới.');
    } finally {
      setBusy(false);
    }
  }, [activeDeck, activeListId, caption, captionSourceList, driveCacheStatus.ready, loadDataset]);

  const createBatchLists = useCallback(async (count) => {
    if (!driveCacheStatus.ready) {
      setStatus('Đang đồng bộ ảnh Google Drive vào cache, tạm thời chưa thể tạo list.');
      return;
    }
    if (!activeDeck) {
      setStatus('Chưa có deck để tạo batch list.');
      return;
    }
    if (creatingListsRef.current) return;
    const safeCount = Math.min(10, Math.max(1, Number(count) || 5));
    if (safeCount >= 5 && !window.confirm(`Tạo ${safeCount} list AI? Có thể mất vài phút.`)) return;
    creatingListsRef.current = true;
    const requestId = `${activeDeck.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setBusy(true);
    setStatus(`Đang tạo ${safeCount} list AI (xoay vòng tone)...`);
    try {
      const response = await apiFetch('/api/decks/generate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId: activeDeck.id, count: safeCount, requestId }),
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
      }, false);
      const msg = payload.failCount > 0
        ? `Đã tạo ${payload.successCount}/${safeCount} list (${payload.failCount} lỗi)${payload.errors?.[0]?.message ? `: ${payload.errors[0].message}` : '.'}`
        : `Đã tạo xong ${payload.successCount} list AI.`;
      setStatus(msg);
    } catch (error) {
      setStatus(error?.message || 'Không tạo được batch list.');
    } finally {
      creatingListsRef.current = false;
      setBusy(false);
    }
  }, [activeDeck, activeListId, driveCacheStatus.ready, loadDataset]);

  const createPartnerSpotlight = useCallback(async (partner) => {
    if (!driveCacheStatus.ready) {
      setStatus('Đang đồng bộ ảnh Google Drive vào cache, tạm thời chưa thể tạo spotlight.');
      return;
    }
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
      }, false);
      setStatus(`Đã tạo spotlight "${payload.partnerName}" (${payload.pageCount} trang).`);
    } catch (error) {
      setStatus(error?.message || 'Không tạo được spotlight đối tác.');
    } finally {
      setBusy(false);
    }
  }, [driveCacheStatus.ready, loadDataset]);

  const deleteGeneratedList = useCallback(async (deckId, listId) => {
    const confirmed = window.confirm('Bạn có chắc chắn muốn xóa bộ ảnh AI này?');
    if (!confirmed) return;

    setBusy(true);
    setStatus('Đang xóa list AI...');
    try {
      const deckBeforeDelete = datasetRef.current?.decks?.find((deck) => deck.id === deckId);
      const listIndex = deckBeforeDelete?.lists?.findIndex((list) => list.id === listId) ?? -1;
      const response = await apiFetch(`/api/decks/${encodeURIComponent(deckId)}/lists/${encodeURIComponent(listId)}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 204 && response.status !== 404) {
        throw new Error(await formatApiError(response, 'Xóa thất bại'));
      }

      // Đọc datasetRef.current (không dùng `dataset` đóng gói lúc gọi hàm) để tránh
      // ghi đè mất tác dụng của một lượt xóa khác đang chạy đồng thời.
      const latestDataset = datasetRef.current;
      const nextDataset = {
        ...latestDataset,
        decks: latestDataset.decks.map((deck) => deck.id === deckId
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
  }, [activeListId, applyDataset]);

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
        const deckBeforeDelete = datasetRef.current.decks.find((deck) => deck.id === group.deckId);
        const deleteIndexes = group.listIds
          .map((id) => deckBeforeDelete?.lists?.findIndex((list) => list.id === id) ?? -1)
          .filter((index) => index >= 0);
        focusIndexByDeck.set(group.deckId, deleteIndexes.length > 0 ? Math.min(...deleteIndexes) : 0);
      }
      const deleteResponse = await apiFetch('/api/decks/delete-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups }),
      });
      if (!deleteResponse.ok) {
        throw new Error(await formatApiError(deleteResponse, 'Xóa thất bại'));
      }
      const deleteResult = await deleteResponse.json();
      if (deleteResult.remainingIds?.length) {
        throw new Error(`Không thể xóa ${deleteResult.remainingIds.length} list. Vui lòng thử lại.`);
      }
      // Đọc datasetRef.current (không dùng `dataset` đóng gói lúc gọi hàm) để tránh
      // ghi đè mất tác dụng của một lượt xóa khác đang chạy đồng thời.
      const latestDataset = datasetRef.current;
      const nextDataset = {
        ...latestDataset,
        decks: latestDataset.decks.map((deck) => {
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
      setStatus(`Đã xóa ${deleteResult.deletedCount}/${listCount} list AI.`);
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
      const deckBeforeDelete = datasetRef.current.decks.find((deck) => deck.id === group.deckId);
      const deleteIndexes = group.listIds
        .map((id) => deckBeforeDelete?.lists?.findIndex((list) => list.id === id) ?? -1)
        .filter((index) => index >= 0);
      focusIndexByDeck.set(group.deckId, deleteIndexes.length > 0 ? Math.min(...deleteIndexes) : 0);

    }

    const deleteResponse = await apiFetch('/api/decks/delete-lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups: cleanupGroups }),
    });
    if (!deleteResponse.ok) {
      throw new Error(await formatApiError(deleteResponse, 'Xóa list đã xuất thất bại'));
    }
    const deleteResult = await deleteResponse.json();
    if (deleteResult.remainingIds?.length) {
      throw new Error(`Không thể xóa ${deleteResult.remainingIds.length} list đã xuất. Vui lòng thử lại.`);
    }

    // Đọc datasetRef.current (không dùng `dataset` đóng gói lúc gọi hàm) để tránh
    // ghi đè mất tác dụng của một lượt xóa khác đang chạy đồng thời.
    const latestDataset = datasetRef.current;
    const nextDataset = {
      ...latestDataset,
      decks: latestDataset.decks.map((deck) => {
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
    setStatus(`Đã xuất và xóa ${deleteResult.deletedCount}/${cleanupCount} list AI đã xuất.`);
  }, [activeDeckId, activeListId, applyDataset, dataset]);

  const handleExportPage = useCallback(async () => {
    await exportSelectedPagePng({
      deck: activeDeck,
      list: activeList,
      dataset,
      selectedPageIndex,
      quality: exportQuality,
    }, exportCb);
  }, [activeDeck, activeList, dataset, exportCb, exportQuality, selectedPageIndex]);

  const handleExportList = useCallback(async () => {
    await exportActiveList({
      deck: activeDeck,
      list: activeList,
      dataset,
      quality: exportQuality,
    }, exportCb);
  }, [activeDeck, activeList, dataset, exportCb, exportQuality]);

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
            dataset,
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
    dataset,
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

  const openSettingsView = useCallback(() => {
    setActiveView('settings');
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
    activeView === 'settings' ? 'settings-mode' : '',
  ].filter(Boolean).join(' ');

  const activeDestinationId = destinationInfo?.active?.id || dataset?.source?.destinationId || 'dalat';
  const destinationOptions = mergeDestinations(
    BUILTIN_DESTINATION_FALLBACKS,
    destinationInfo?.destinations,
  );
  const studioTitle = destinationInfo?.active?.label || dataset?.source?.destinationLabel || 'Carousel Studio';
  const studioShort = destinationInfo?.active?.shortLabel
    || destinationOptions.find((entry) => entry.id === activeDestinationId)?.shortLabel
    || 'CS';
  const destinationScrollBusy = busy || refreshing || switchingDestination;
  const cacheDestinationShortLabel = {
    dalat: 'ĐL',
    greenland: 'GL',
  }[driveCacheStatus.destinationId] || studioShort;
  const cacheStatusDestinationId = driveCacheStatus.destinationId || activeDestinationId;
  const showCacheWarmOverlay = !driveCacheStatus.ready
    && dismissedCacheDestinationId !== cacheStatusDestinationId;

  const resolveDestinationCount = (entry) => {
    if (entry.id === activeDestinationId && dataset?.source?.totalItems) {
      return dataset.source.totalItems;
    }
    return entry.totalItems;
  };

  return (
    <main className="app-shell">
      {showCacheWarmOverlay ? (
        <div className="cache-warm-overlay" role="dialog" aria-modal="true" aria-labelledby="cacheWarmTitle">
          <section className="cache-warm-dialog">
            <div className="cache-warm-icon" aria-hidden="true">{cacheDestinationShortLabel}</div>
            <p className="panel-kicker">Chuẩn bị dữ liệu lần đầu</p>
            <h2 id="cacheWarmTitle">
              {driveCacheStatus.phase === 'error' ? 'Chưa thể tải dữ liệu' : 'Đang chuẩn bị dữ liệu'}
            </h2>
            <p className="cache-warm-message">{driveCacheStatus.message}</p>
            <div
              className="cache-warm-progress"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={driveCacheStatus.percent || 0}
            >
              <span style={{ width: `${Math.max(0, Math.min(100, driveCacheStatus.percent || 0))}%` }} />
            </div>
            <div className="cache-warm-stats">
              <strong>{driveCacheStatus.percent || 0}%</strong>
              <span>
                {driveCacheStatus.total
                  ? `${driveCacheStatus.completed || 0}/${driveCacheStatus.total} ảnh`
                  : 'Đang kiểm tra danh sách ảnh'}
              </span>
            </div>
            {driveCacheStatus.failed > 0 ? (
              <p className="cache-warm-warning">{driveCacheStatus.failed} ảnh hiện chưa tải được.</p>
            ) : null}
            <p className="cache-warm-note">
              Tạm thời chưa thể sinh list. Vui lòng giữ ứng dụng mở cho đến khi quá trình hoàn tất.
            </p>
            {driveCacheStatus.phase === 'error' ? (
              <div className="cache-warm-actions">
                <button
                  type="button"
                  className="toolbar-button primary cache-retry-button"
                  disabled={refreshing}
                  onClick={() => {
                    setDismissedCacheDestinationId(null);
                    loadDataset('Đang thử tải lại dữ liệu...', {}, true).catch((error) => setStatus(error.message));
                  }}
                >
                  {refreshing ? 'Đang thử lại...' : 'Thử lại'}
                </button>
                <button
                  type="button"
                  className="toolbar-button cache-exit-button"
                  onClick={() => {
                    setDismissedCacheDestinationId(cacheStatusDestinationId);
                    setActiveView('settings');
                    setCaptionToolsVisible(false);
                    setStatus('Đồng bộ dữ liệu chưa hoàn tất. Bạn có thể kiểm tra nguồn trong Cài đặt; chức năng tạo list vẫn tạm khóa.');
                  }}
                >
                  Vào giao diện
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {driveCacheReadyNotice ? (
        <div className="cache-ready-notice" role="status">
          <strong>Dữ liệu đã sẵn sàng</strong>
          <span>Bạn có thể tạo và xuất list.</span>
        </div>
      ) : null}

      <Sidebar
        dataset={dataset}
        activeView={activeView}
        onOpenTemplates={openTemplatesView}
        onOpenPreview={openPreviewView}
        onOpenCaption={openCaptionView}
        onOpenExport={openExportView}
        onOpenData={openDataView}
        onOpenSettings={openSettingsView}
        onOpenDelete={openDeleteView}
      />

      <section className="studio-shell">
        <header className="studio-topbar deck-toolbar">
          <div className="deck-heading">
            <div className="studio-breadcrumb">
              <span>{studioTitle} Studio</span>
              <span className="breadcrumb-separator">/</span>
              <span>{activeDeck?.navTitle || 'Đang tải'}</span>
            </div>
            <div className="studio-title-row">
              <span className="deck-avatar" aria-hidden="true">{studioShort}</span>
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
        ) : activeView === 'settings' ? (
          <div className={workspaceClasses}>
            <SettingsPanel
              activeDestinationId={activeDestinationId}
              destinations={destinationOptions.map((entry) => ({
                ...entry,
                totalItems: resolveDestinationCount(entry),
              }))}
              cacheStatus={driveCacheStatus}
              busy={destinationScrollBusy}
              refreshing={refreshing}
              onDestinationChange={(destinationId) => {
                switchDestination(destinationId).catch((error) => setStatus(error.message));
              }}
              onAddDestination={addDestination}
              onReplaceDestinationWorkbook={(destinationId, file) => replaceDestinationWorkbook(destinationId, file)}
              onRefreshFromSheet={(destinationId) => refreshDestinationFromSheet(destinationId)}
              onRefresh={() => {
                loadDataset('Đang tải lại dữ liệu workbook...', {}, true).catch((error) => setStatus(error.message));
              }}
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
              cacheReady={driveCacheStatus.ready}
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
                    onPageTextChange={handlePageTextChange}
                    onPageTextSave={savePageText}
                    savingPageText={savingPageText}
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
