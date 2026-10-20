'use client';

// Toàn bộ trạng thái và thao tác của studio (tách nguyên văn từ DeckStudio).
// Giao diện Classic và V2 cùng dùng hook này, nên hành vi tạo/lưu/xuất chỉ có một nơi.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isKnownPhotoPreset, DEFAULT_PHOTO_PRESETS, supportsPhotoPreset } from '../../lib/photoPresets.mjs';
import { cleanRequiredPartners, loadRequiredPartnerChoices, saveRequiredPartnerChoices, supportsRequiredPartners } from '../../lib/requiredPartners.mjs';
import { apiFetch, fetchGuideDataset, formatApiError } from '../../lib/apiClient';
import { emptyCaption, normalizeHashtagInput, normalizeSelection, readStoredSelection } from '../../lib/selection';
import useExportProgress from '../useExportProgress';
import { queuedGeneration } from '../../lib/manualGenerationQueue';
import { SELECTION_STORAGE_KEY, listIsMain, sanitizeDataset } from '../../lib/utils';
import { templateAllowed } from '../../lib/sourceTemplatePolicy.mjs';
import { setSpotlightV2CoverImagePool } from '../../lib/pageMarkup';
import { clearCachedDataset, markDatasetBackgroundChecked, readCachedDataset, shouldCheckDatasetInBackground, writeCachedDataset } from '../../lib/datasetCache';
import { canApplyPublishedDataset, canReadPublishedDataset } from '../../lib/publishedDataset.mjs';
import { diagnoseUnconfirmedSheetSync } from '../../lib/sheetSyncDiagnostic';
import { verifyRuntimeSession } from '../../lib/runtimeSession';
import { exportActiveList, exportBatch, exportSelectedPagePng, formatSkippedListSummary } from '../../lib/exportClient';
import { applyExportedAt, groupListIds } from '../../lib/listStatus.mjs';
import { studioConfirm } from '../ui/confirmDialog';
import { BUILTIN_DESTINATION_FALLBACKS, SPOTLIGHT_PARTNER_DECK_ID, apiErrorMessage, mergeDestinations, readApiPayload } from './shared';
import { markCatalogRevisionStored, needsTemplateCatalogRefresh } from './catalog';
import { sanitizeCaptionBody } from './captionGuards';

export default function useStudioController({ initialDataset = null } = {}) {
  const initialDeck = initialDataset?.decks?.[0] || null;
  const initialList = initialDeck?.lists?.[0] || null;
  const [dataset, setDataset] = useState(initialDataset);
  const [exportImageInspection, setExportImageInspection] = useState(null);
  const exportImageAnswer = useRef(null);
  const answerExportImages = useCallback((accepted) => {
    exportImageAnswer.current?.(accepted);
    exportImageAnswer.current = null;
    setExportImageInspection(null);
  }, []);
  useEffect(() => () => { exportImageAnswer.current?.(false); }, []);
  const [activeDeckId, setActiveDeckId] = useState(initialDeck?.id || null);
  const [photoPresets, setPhotoPresets] = useState(DEFAULT_PHOTO_PRESETS);
  const [photoPresetChoices, setPhotoPresetChoices] = useState({});
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem('dalat-photo-presets-v1') || '{}');
      setPhotoPresetChoices(Object.fromEntries(Object.entries(saved).filter(([,v])=>isKnownPhotoPreset(v)))); } catch { /* default: original */ }
    apiFetch('/api/photo-presets').then(r=>r.ok?r.json():Promise.reject()).then(value=>{
      if (!Array.isArray(value.presets) || !value.presets.length) throw new Error('Danh mục bảng màu không hợp lệ');
      setPhotoPresets(value.presets);
    }).catch(()=>setPhotoPresets([{id:null,label:'Ảnh gốc'}]));
  }, []);
  const selectedPhotoPreset = supportsPhotoPreset(activeDeckId) && photoPresets.some(p => p.id === photoPresetChoices[activeDeckId]) ? photoPresetChoices[activeDeckId] || null : null;
  const changePhotoPreset = useCallback(value => {
    setPhotoPresetChoices(previous=>{ const next={...previous,[activeDeckId]:value};
      try { localStorage.setItem('dalat-photo-presets-v1',JSON.stringify(next)); } catch { /* still usable in this session */ }
      return next; });
  }, [activeDeckId]);
  const [requiredPartnerChoices, setRequiredPartnerChoices] = useState({});
  useEffect(() => { setRequiredPartnerChoices(loadRequiredPartnerChoices()); }, []);
  const [activeListId, setActiveListId] = useState(initialList?.id || null);
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(initialDataset?.source?.totalItems
    ? `Đã tải ${initialDataset.source.totalItems} địa điểm.`
    : 'Đang tải dữ liệu workbook...');
  const [activeView, setActiveView] = useState('templates');
  const [studioTheme, setStudioTheme] = useState(() => {
    try { return localStorage.getItem('dalat-studio-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch { return 'dark'; }
  });
  const [editorSaveState, setEditorSaveState] = useState('saved');
  const editorOriginalDataset = useRef(null);
  useEffect(() => {
    const warn = event => { if (editorOriginalDataset.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const [editorPane, setEditorPane] = useState('preview');
  useEffect(() => {
    try { setStudioTheme(localStorage.getItem('dalat-studio-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')); } catch {}
  }, []);
  const toggleStudioTheme = () => setStudioTheme(previous => {
    const next = previous === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('dalat-studio-theme', next); } catch {}
    return next;
  });
  const [captionToolsVisible, setCaptionToolsVisible] = useState(false);
  const [captionTone, setCaptionTone] = useState('lich_trinh_huu_ich');
  const [caption, setCaption] = useState(emptyCaption);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedListsForExport, setSelectedListsForExport] = useState(new Set());
  const [exportQuality, setExportQuality] = useState('optimized');
  const [exportFormat, setExportFormat] = useState('png');
  const [selectedListsForDelete, setSelectedListsForDelete] = useState(new Set());
  const { progress, showProgress, updateProgress, completeProgress, failProgress } = useExportProgress();
  const [partners, setPartners] = useState([]);
  const [partnersRevision, setPartnersRevision] = useState(0);
  // A freshly added/replaced XLSX reads its Drive photos in the background; when
  // they are ready, reload that source's catalog and partners once.
  const photosReadyReloadRef = useRef(null);
  const loadDatasetRef = useRef(null);
  const partnerSourceId = dataset?.source?.destinationId || '';
  useEffect(() => {
    // Danh sách đối tác thuộc nguồn đang mở; nạp lại khi đổi nguồn.
    if (!partnerSourceId) return undefined;
    let cancelled = false;
    apiFetch('/api/partners').then(async (res) => {
      if (res.ok && !cancelled) setPartners(await res.json());
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [partnerSourceId, partnersRevision]);
  // Đối tác hiển thị được theo từng mẫu (backend chạy thử builder); tải khi mở bộ chọn.
  const [partnerEligibility, setPartnerEligibility] = useState({});
  const eligibilityRequests = useRef(new Set());
  useEffect(() => { eligibilityRequests.current = new Set(); setPartnerEligibility({}); }, [partners]);
  const ensurePartnerEligibility = useCallback((deckId) => {
    if (!deckId || !partnerSourceId) return;
    const key = `${partnerSourceId}:${deckId}`;
    if (eligibilityRequests.current.has(key)) return;
    eligibilityRequests.current.add(key);
    setPartnerEligibility(previous => ({ ...previous, [key]: { status: 'loading' } }));
    apiFetch(`/api/partners/eligibility?deckId=${encodeURIComponent(deckId)}`).then(async (res) => {
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPartnerEligibility(previous => ({ ...previous, [key]: { status: 'ready', data } }));
    }).catch(() => {
      eligibilityRequests.current.delete(key);
      setPartnerEligibility(previous => ({ ...previous, [key]: { status: 'error' } }));
    });
  }, [partnerSourceId]);
  const requiredPartnerKey = `${partnerSourceId}:${activeDeckId}`;
  const selectedRequiredPartners = supportsRequiredPartners(dataset?.decks?.find(deck => deck.id === activeDeckId))
    ? requiredPartnerChoices[requiredPartnerKey] || [] : [];
  const changeRequiredPartners = useCallback(names => {
    setRequiredPartnerChoices(previous => {
      const next = { ...previous, [requiredPartnerKey]: cleanRequiredPartners(names) };
      if (!next[requiredPartnerKey].length) delete next[requiredPartnerKey];
      saveRequiredPartnerChoices(next);
      return next;
    });
  }, [requiredPartnerKey]);
  const [savingPageText, setSavingPageText] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [destinationInfo, setDestinationInfo] = useState(null);
  const [switchingDestination, setSwitchingDestination] = useState(false);
  const [hookSourcesInfo, setHookSourcesInfo] = useState(null);
  const [hookSourcesBusy, setHookSourcesBusy] = useState(false);
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
  const [runtimePerformance, setRuntimePerformance] = useState({ mode: 'checking', reason: 'Đang đánh giá khả năng xử lý của máy.' });
  const [automationState, setAutomationState] = useState({ locked: false, schedules: [], runs: [] });
  const [manualJob, setManualJob] = useState(null);
  const queueGenerationRequest = useCallback(async (url, options) => {
    const kind = url.endsWith('generate-batch') ? 'batch' : url.endsWith('generate-partner-spotlight') ? 'partner' : 'caption';
    try {
      return await queuedGeneration(kind, JSON.parse(options.body), dataset?.source?.destinationId || 'dalat',
        { mode: hookSourcesInfo?.mode || 'normal', sourceId: hookSourcesInfo?.activeSourceId || '' },
        job => { setManualJob(job); if (['queued', 'running'].includes(job.status)) setStatus(job.status === 'queued' ? 'Đã xếp hàng — chờ lượt hiện tại hoàn tất. Không chạy tác vụ nặng song song.' : 'Đang tạo list từ yêu cầu đã xếp hàng...'); });
    } finally { setManualJob(null); }
  }, [dataset?.source?.destinationId, hookSourcesInfo]);
  const [driveCacheReadyNotice, setDriveCacheReadyNotice] = useState(false);
  const [manualSyncProgress, setManualSyncProgress] = useState(null);
  const [manualSyncVisible, setManualSyncVisible] = useState(false);
  const manualSyncDestination = manualSyncProgress?.destinationId;
  const manualSyncTerminal = ['complete', 'error'].includes(manualSyncProgress?.phase);
  useEffect(() => {
    if (!manualSyncDestination || manualSyncTerminal) return;
    let disposed = false;
    const poll = async () => {
      try {
        const response = await apiFetch('/api/night-sync/status', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        if (disposed) return;
        const source = payload.sources?.find(s => s.id === manualSyncDestination);
        const queued = payload.queued?.includes(manualSyncDestination);
        if (!source || (!queued && payload.running !== manualSyncDestination)) return;
        setManualSyncProgress(previous => {
          if (['complete', 'error'].includes(previous?.phase)) return previous;
          return { ...previous, phase: source.phase, total: source.progress?.total || 0,
            completed: source.progress?.completed || 0,
            message: source.phase === 'paused' ? 'Đang chờ tác vụ tạo/xuất hoàn tất…'
              : payload.running !== manualSyncDestination ? 'Đang chờ nguồn khác cập nhật…'
              : source.progress?.stage || 'Đang chuẩn bị cập nhật…' };
        });
      } catch { /* The update request reports connection errors. */ }
    };
    void poll(); const timer = setInterval(poll, 1200);
    return () => { disposed = true; clearInterval(timer); };
  }, [manualSyncDestination, manualSyncTerminal]);
  const [dismissedCacheDestinationId, setDismissedCacheDestinationId] = useState(null);
  const [dismissedSyncWarning, setDismissedSyncWarning] = useState('');
  const currentSelectionRef = useRef({ activeDeckId: initialDeck?.id || null, activeListId: initialList?.id || null, selectedPageIndex: 0 });
  const v2CatalogRefreshAttemptedRef = useRef(false);
  const selectionHistoryRef = useRef([]);
  const spotlightPartnerRefreshRef = useRef(false);
  const datasetRef = useRef(initialDataset);
  // Không kiểm tra lại guide-data ngay khi cửa sổ trình duyệt vừa được launcher
  // đưa lên foreground; bootstrap bên dưới đang tải đúng dữ liệu đó.
  const driveCacheWasWaitingRef = useRef(false);
  const creatingListsRef = useRef(false);
  const datasetLoadPromiseRef = useRef(null);

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
  const activePage = activeList?.pages?.[selectedPageIndex] || null;
  const activePageItems = Array.isArray(activePage?.items) ? activePage.items : [];
  const activePartnerCount = activePageItems.filter((item) => item.isPartner).length;

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
    if (sanitized?.decks) sanitized.decks = sanitized.decks.filter(deck =>
      templateAllowed(sanitized.source, deck.id) || (deck.id === SPOTLIGHT_PARTNER_DECK_ID && deck.creationDisabled));
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
    // React Strict Mode chạy effect bootstrap hai lần trong development. Dùng
    // chung request đang chạy để không đồng bộ manifest và dựng toàn bộ catalog
    // hai lần, đồng thời focus event cũng không mở thêm request guide-data.
    if (datasetLoadPromiseRef.current) return datasetLoadPromiseRef.current;
    const request = (async () => {
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
    })();
    datasetLoadPromiseRef.current = request;
    try {
      return await request;
    } finally {
      if (datasetLoadPromiseRef.current === request) datasetLoadPromiseRef.current = null;
    }
  }, [applyDataset]);

  const loadDestinations = useCallback(async () => {
    const response = await apiFetch('/api/destinations', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Không tải được danh sách điểm đến: HTTP ${response.status}`);
    const payload = await response.json();
    setDestinationInfo(payload);
    return payload;
  }, []);

  // Night sync publishes locally without reloading this browser. Never replace
  // an editing session or apply a response after the user switches destinations.
  const publishedDatasetVersions = useRef(new Map());
  const backgroundDatasetContext = useRef(null);
  backgroundDatasetContext.current = {
    dataset, destinationId: destinationInfo?.active?.id || dataset?.source?.destinationId,
    blocked: busy || refreshing || switchingDestination || savingPageText || automationState.locked
      || Boolean(manualJob) || exportModalOpen || deleteModalOpen
      || activeView === 'preview' || activeView === 'caption'
      || editorSaveState !== 'saved',
  };
  useEffect(() => {
    let disposed = false;
    let timer;
    const guards = () => ({ draft: Boolean(editorOriginalDataset.current), loading: Boolean(datasetLoadPromiseRef.current) });
    const safe = context => canReadPublishedDataset(context, guards());
    const poll = async () => {
      try {
        const response = await apiFetch('/api/night-sync/status', { cache: 'no-store' });
        if (!response.ok || disposed) return;
        const sync = await response.json();
        const context = backgroundDatasetContext.current;
        const source = sync.sources?.find(entry => entry.id === context?.destinationId);
        const revision = source?.lastPublishedAt;
        if (!revision || publishedDatasetVersions.current.get(source.id) === revision
          || sync.running === source.id || !safe(context)) return;
        const result = await apiFetch('/api/guide-data', { cache: 'no-store' });
        if (!result.ok || disposed) return;
        const next = await result.json();
        const latest = backgroundDatasetContext.current;
        if (disposed || !canApplyPublishedDataset(context, latest, source.id, next, guards())) return;
        applyDataset(next, currentSelectionRef.current);
        writeCachedDataset(next);
        markCatalogRevisionStored();
        publishedDatasetVersions.current.set(source.id, revision);
        setStatus('Đã nạp dữ liệu sau đồng bộ. Chỉ dùng ảnh hợp lệ; list đã lưu được giữ nguyên.');
      } catch (error) {
        console.warn('[night-sync] Chưa nạp được dữ liệu đã công bố:', error.message);
      } finally {
        if (!disposed) timer = window.setTimeout(poll, 5000);
      }
    };
    poll();
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [applyDataset]);

  const loadRuntimePerformance = useCallback(async () => {
    const response = await apiFetch('/api/runtime-performance', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Không tải được trạng thái sức máy: HTTP ${response.status}`);
    const payload = await response.json();
    setRuntimePerformance(payload);
    return payload;
  }, []);

  const loadHookSources = useCallback(async () => {
    const response = await apiFetch('/api/hook-sources', { cache: 'no-store' });
    const payload = await readApiPayload(response);
    if (!response.ok) throw new Error(apiErrorMessage(payload, `Không tải được nguồn Hook: HTTP ${response.status}`));
    setHookSourcesInfo(payload);
    return payload;
  }, []);

  const loadAutomationState = useCallback(async () => {
    const response = await apiFetch('/api/automation', { cache: 'no-store' });
    if (!response.ok) return null;
    const payload = await response.json();
    setAutomationState((current) => JSON.stringify(current) === JSON.stringify(payload) ? current : payload);
    return payload;
  }, []);

  const createHookSource = useCallback(async ({ name, docUrl, file }) => {
    setHookSourcesBusy(true);
    setStatus('Đang kiểm tra nguồn Hook lễ...');
    try {
      const body = new FormData();
      body.set('name', name);
      if (docUrl) body.set('docUrl', docUrl);
      if (file) body.set('file', file);
      const response = await apiFetch('/api/hook-sources', { method: 'POST', body, cache: 'no-store' });
      const payload = await readApiPayload(response);
      if (!response.ok) throw new Error(apiErrorMessage(payload, `Không thêm được nguồn Hook: HTTP ${response.status}`));
      setHookSourcesInfo(payload);
      setStatus(`Đã lưu bộ Hook “${name}” với ${payload.sources?.find((entry) => entry.name === name)?.hookCount || 0} câu.`);
      return payload;
    } finally {
      setHookSourcesBusy(false);
    }
  }, []);

  const updateHookSource = useCallback(async (sourceId, { name, docUrl, file }) => {
    setHookSourcesBusy(true);
    setStatus(file ? 'Đang kiểm tra file Hook mới...' : 'Đang cập nhật nguồn Hook...');
    try {
      const body = new FormData();
      if (name) body.set('name', name);
      if (docUrl) body.set('docUrl', docUrl);
      if (file) body.set('file', file);
      const response = await apiFetch(`/api/hook-sources/${encodeURIComponent(sourceId)}`, { method: 'PUT', body, cache: 'no-store' });
      const payload = await readApiPayload(response);
      if (!response.ok) throw new Error(apiErrorMessage(payload, `Không cập nhật được nguồn Hook: HTTP ${response.status}`));
      setHookSourcesInfo(payload);
      setStatus('Đã cập nhật nguồn Hook. List cũ được giữ nguyên.');
      return payload;
    } finally {
      setHookSourcesBusy(false);
    }
  }, []);

  const refreshHookSource = useCallback(async (sourceId) => {
    setHookSourcesBusy(true);
    setStatus('Đang tải lại Hook từ Google Docs...');
    try {
      const response = await apiFetch(`/api/hook-sources/${encodeURIComponent(sourceId)}/refresh`, { method: 'POST', cache: 'no-store' });
      const payload = await readApiPayload(response);
      if (!response.ok) throw new Error(apiErrorMessage(payload, `Không tải lại được Hook: HTTP ${response.status}`));
      setHookSourcesInfo(payload);
      setStatus('Đã tải lại Hook. List cũ được giữ nguyên.');
      return payload;
    } finally {
      setHookSourcesBusy(false);
    }
  }, []);

  const deleteHookSource = useCallback(async (sourceId) => {
    setHookSourcesBusy(true);
    try {
      const response = await apiFetch(`/api/hook-sources/${encodeURIComponent(sourceId)}`, { method: 'DELETE', cache: 'no-store' });
      const payload = await readApiPayload(response);
      if (!response.ok) throw new Error(apiErrorMessage(payload, `Không xóa được nguồn Hook: HTTP ${response.status}`));
      setHookSourcesInfo(payload);
      setStatus('Đã xóa nguồn Hook. List cũ không bị thay đổi.');
      return payload;
    } finally {
      setHookSourcesBusy(false);
    }
  }, []);

  const changeHookMode = useCallback(async (mode, sourceId = '') => {
    setHookSourcesBusy(true);
    setStatus('Đang tải Hook...');
    try {
      const response = await apiFetch('/api/hook-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, ...(sourceId ? { sourceId } : {}) }),
        cache: 'no-store',
      });
      const payload = await readApiPayload(response);
      if (!response.ok) throw new Error(apiErrorMessage(payload, `Không chuyển được chế độ Hook: HTTP ${response.status}`));
      setHookSourcesInfo(payload);
      setStatus(mode === 'festival' ? 'Đã bật Hook lễ cho các list mới.' : 'Đã chuyển về Hook thường cho các list mới.');
      return payload;
    } finally {
      setHookSourcesBusy(false);
    }
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

    await loadHookSources().catch(() => undefined);
    return updatedActive;
  }, [applyDataset, loadHookSources]);

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
      if (payload?.active?.id !== destinationId) {
        throw new Error(`Backend trả về nguồn “${payload?.active?.label || payload?.active?.id || 'không xác định'}” thay vì nguồn vừa chọn.`);
      }
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

  const addDestination = useCallback(async ({ label, sheetUrl, file, kind, dalatContent }) => {
    if (switchingDestination) return;
    setSwitchingDestination(true);
    setRefreshing(true);
    setStatus(`Đang kiểm tra workbook ${label}...`);
    try {
      const body = new FormData();
      body.set('label', label);
      if (sheetUrl) body.set('sheetUrl', sheetUrl);
      if (kind) body.set('kind', kind);
      if (dalatContent !== undefined) body.set('dalatContent', dalatContent ? 'true' : 'false');
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
      photosReadyReloadRef.current = payload.active?.id || null;
      setStatus(`Đã thêm và chuyển sang ${payload.active?.label || label} (${payload.dataset?.source?.totalItems || 0} địa điểm). Đang đọc ảnh Drive của workbook…`);
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
      photosReadyReloadRef.current = updatedActive?.id || destinationId;
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
    setManualSyncProgress({ destinationId, phase: 'waiting', message: 'Đang gửi yêu cầu cập nhật...', total: 0, completed: 0 });
    setManualSyncVisible(true);
    setStatus('Đang tải mới từ Google Sheet...');
    try {
      const response = await apiFetch(`/api/destinations/${encodeURIComponent(destinationId)}/refresh-from-sheet?background=1`, {
        method: 'POST',
        cache: 'no-store',
      }).catch(async () => { throw new Error(await diagnoseUnconfirmedSheetSync()); });
      let payload = await readApiPayload(response);
      if (!response.ok) {
        if (payload?.code === 'BACKEND_TIMEOUT' || payload?.code === 'BACKEND_TRANSPORT_ERROR') {
          setStatus('Đang kiểm tra phản hồi backend sau khi đồng bộ bị ngắt...');
          throw new Error(await diagnoseUnconfirmedSheetSync());
        }
        throw new Error(apiErrorMessage(payload, `Không tải mới được từ Google Sheet: HTTP ${response.status}`));
      }
      if (payload?.accepted) {
        for (;;) {
          const statusResponse = await apiFetch('/api/night-sync/status', { cache: 'no-store' });
          if (!statusResponse.ok) throw new Error('Không đọc được tiến độ cập nhật. Xem Đồng bộ dữ liệu trước khi thử lại.');
          const sync = await statusResponse.json();
          const source = sync.sources?.find(entry => entry.id === destinationId);
          const pending = sync.running === destinationId || sync.queued?.includes(destinationId);
          setManualSyncProgress({ destinationId, phase: pending ? 'warming' : source?.phase,
            message: source?.error || source?.progress?.stage || 'Đang chờ cập nhật...',
            total: source?.progress?.total || 0, completed: source?.progress?.completed || 0 });
          if (!pending) {
            if (source?.phase !== 'complete' && source?.phase !== 'partial') {
              throw new Error(source?.error || 'Lượt cập nhật chưa hoàn tất; chưa thể tạo list.');
            }
            const currentDestinationId = destinationInfo?.active?.id || datasetRef.current?.source?.destinationId;
            if (destinationId !== currentDestinationId) {
              // A fresh machine must sync an inactive source before it can switch.
              // This POST only reads the workbook just saved by the manual job.
              const switchResponse = await apiFetch('/api/destination', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: destinationId }),
                cache: 'no-store',
              });
              const switched = await readApiPayload(switchResponse);
              if (!switchResponse.ok) throw new Error(apiErrorMessage(switched, 'Đã tải dữ liệu nhưng chưa chuyển được nguồn.'));
              payload = { ...switched, sync };
            } else {
              const datasetResponse = await apiFetch('/api/guide-data', { cache: 'no-store' });
              const dataset = await readApiPayload(datasetResponse);
              if (!datasetResponse.ok) throw new Error(apiErrorMessage(dataset, 'Không đọc được dữ liệu sau cập nhật.'));
              payload = { dataset, active: { id: dataset.source?.destinationId, label: dataset.source?.destinationLabel }, sync };
            }
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      if (payload?.active?.id !== destinationId) {
        throw new Error(`Đã chặn kết quả sai nguồn: yêu cầu “${destinationId}” nhưng backend trả về “${payload?.active?.id || 'không xác định'}”.`);
      }
      const updatedActive = await applyDestinationMutation(payload);
      const label = updatedActive?.label || payload?.dataset?.source?.destinationLabel || 'Sheet';
      const syncResult = payload.sync?.sources?.find(source => source.id === destinationId)?.result;
      if (syncResult?.hookErrors?.length) {
        setManualSyncProgress(previous => ({ ...previous, phase: 'complete', total: 0,
          message: `Đã cập nhật dữ liệu và ảnh; còn lỗi hook: ${syncResult.hookErrors.join(' · ')}. Mẫu thiếu hook chưa thể tạo; các mẫu đủ dữ liệu vẫn dùng được.` }));
        setStatus('Cập nhật dữ liệu hoàn tất nhưng còn lỗi hook; xem chi tiết trong Dữ liệu & Cài đặt.');
        return updatedActive;
      }
      setManualSyncProgress(previous => ({ ...previous, phase: 'complete', total: 0,
        message: syncResult?.failed ? `Đã hoàn tất. Có thể tạo list bằng ảnh hợp lệ; ${syncResult.failed} ảnh lỗi bị loại và sẽ được thử lại trong lịch đêm 23:00–06:00 khi tool đang chạy.` : 'Đã cập nhật dữ liệu thành công.' }));
      setStatus(`Đã cập nhật ${label} từ Google Sheet (${payload.dataset?.source?.totalItems || 0} địa điểm).${syncResult?.failed ? ` Còn ${syncResult.failed} ảnh tải lỗi; xem Đồng bộ dữ liệu để biết chi tiết.` : ''}`);
      return updatedActive;
    } catch (error) {
      setManualSyncProgress(previous => ({ ...previous, phase: 'error', total: 0, message: error.message || 'Cập nhật thất bại.' }));
      throw error;
    } finally {
      setSwitchingDestination(false);
      setRefreshing(false);
    }
  }, [applyDestinationMutation, destinationInfo?.active?.id, switchingDestination]);

  // Link Google Sheet do người dùng nhập; tool không kèm link nào. Nguồn Thường/Threads
  // mới chỉ có dữ liệu sau lượt cập nhật đầu tiên, rồi mới chuyển sang.
  const addSource = useCallback(async ({ label, sheetUrl, file, kind, dalatContent }) => {
    if (file) return addDestination({ label, sheetUrl, file, kind, dalatContent });
    if (switchingDestination) return null;
    setStatus(`Đang kiểm tra Google Sheet ${label}...`);
    const response = await apiFetch('/api/destinations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, sheetUrl, kind, dalatContent }),
      cache: 'no-store',
    });
    const payload = await readApiPayload(response);
    if (!response.ok) throw new Error(apiErrorMessage(payload, `Không thêm được Google Sheet: HTTP ${response.status}`));
    if (payload?.needsFirstSync && payload?.created?.id) {
      setDestinationInfo((previous) => ({
        active: previous?.active || payload.active || null,
        destinations: mergeDestinations(previous?.destinations, payload.destinations),
      }));
      setStatus(`Đã thêm ${payload.created.label}. Đang tải dữ liệu và ảnh lần đầu...`);
      return refreshDestinationFromSheet(payload.created.id);
    }
    return applyDestinationMutation(payload);
  }, [addDestination, applyDestinationMutation, refreshDestinationFromSheet, switchingDestination]);

  const updateSheetLink = useCallback(async (destinationId, sheetUrl) => {
    const response = await apiFetch(`/api/destinations/${encodeURIComponent(destinationId)}/sheet-link`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetUrl }),
      cache: 'no-store',
    });
    const payload = await readApiPayload(response);
    if (!response.ok) throw new Error(apiErrorMessage(payload, `Không lưu được link Google Sheet: HTTP ${response.status}`));
    setDestinationInfo(payload);
    setStatus('Đã lưu link Google Sheet trên máy này.');
    return payload;
  }, []);

  useEffect(() => {
    const stored = readStoredSelection();
    currentSelectionRef.current = stored;
    setActiveDeckId(stored.activeDeckId);
    setActiveListId(stored.activeListId);
    setSelectedPageIndex(stored.selectedPageIndex);

    let cancelled = false;

    const bootstrap = async () => {
      loadHookSources().catch((error) => console.error(error));
      loadRuntimePerformance().catch((error) => console.error(error));
      loadAutomationState().catch((error) => console.error(error));
      let destinations = null;
      try {
        destinations = await loadDestinations();
      } catch (error) {
        console.error(error);
      }
      if (destinations && !destinations.active) {
        // Máy chưa có nguồn: không đọc dữ liệu cũ trong trình duyệt, chờ người dùng thêm nguồn.
        clearCachedDataset();
        if (!cancelled) setStatus('Máy này chưa có nguồn dữ liệu. Hãy thêm link Google Sheet để bắt đầu.');
        return;
      }

      const cached = initialDataset ? null : readCachedDataset();
      const activeDestinationId = destinations?.active?.id || cached?.dataset?.source?.destinationId || null;
      if (cached?.dataset && activeDestinationId && cached.dataset?.source?.destinationId !== activeDestinationId) {
        clearCachedDataset();
      } else if (cached?.dataset) {
        if (needsTemplateCatalogRefresh(cached.dataset, destinations?.active)) {
          v2CatalogRefreshAttemptedRef.current = true;
          clearCachedDataset();
          // Read the published catalog; a UI catalog refresh must not trigger a
          // Google Sheet/Drive sync or require Internet access.
          loadDataset('Đang nạp lại thư viện mẫu...', stored, false, { silent: true }).catch((error) => {
            console.error(error);
            if (!cancelled) {
              applyDataset(cached.dataset, stored);
              setStatus(`Đang dùng dữ liệu đã lưu. Chưa tải được mẫu mới: ${error.message}`);
            }
          });
        } else {
          // Never paint a known-stale layout first. Only use it as a fallback
          // if reading the current, already-published local dataset fails.
          if (!cancelled) {
            applyDataset(cached.dataset, stored);
            setStatus(`Đã mở dữ liệu đã lưu (${cached.dataset.source?.totalItems || 0} địa điểm${cached.dataset.source?.destinationLabel ? ` — ${cached.dataset.source.destinationLabel}` : ''}).`);
          }
          if (shouldCheckDatasetInBackground()) {
            markDatasetBackgroundChecked();
            loadDataset('Đang kiểm tra dữ liệu mới...', {}, false, { silent: true }).catch((error) => {
              console.error(error);
              if (!cancelled) setStatus(`Đang dùng dữ liệu đã lưu. Chưa tải được cập nhật mới: ${error.message}`);
            });
          }
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

    // Development dùng React Strict Mode: effect được setup/cleanup/setup một
    // lượt để phát hiện side effect. Đẩy bootstrap sang macrotask để cleanup đầu
    // tiên hủy nó; chỉ setup thực sự mới gọi các API dữ liệu nặng.
    const bootstrapTimer = window.setTimeout(() => {
      bootstrap().catch((error) => {
        console.error(error);
        if (!cancelled) setStatus(error.message);
      });

    }, 0);

    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    return () => {
      cancelled = true;
      window.clearTimeout(bootstrapTimer);
    };
  }, [applyDataset, initialDataset, loadAutomationState, loadDataset, loadDestinations, loadHookSources, loadRuntimePerformance]);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const poll = async () => {
      let delay = 15_000;
      try {
        const next = await loadAutomationState();
        if (next?.locked) delay = 2_000;
      } catch {
        delay = 30_000;
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, delay);
      }
    };
    timer = window.setTimeout(poll, 15_000);
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [loadAutomationState]);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    let warned = false;
    const checkSession = async () => {
      let delay = 5000;
      try {
        await verifyRuntimeSession();
        warned = false;
      } catch (error) {
        delay = 15000;
        if (!error?.runtimeReloading && !warned) {
          warned = true;
          console.warn(`[runtime] ${error?.message || error}`);
        }
      } finally {
        if (!cancelled) timer = window.setTimeout(checkSession, delay);
      }
    };
    checkSession();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  loadDatasetRef.current = loadDataset;

  useEffect(() => {
    let cancelled = false;
    let readyNoticeTimer = null;
    let pollTimer = null;
    let lastFailureStatus = null;

    const loadDriveCacheStatus = async () => {
      let nextDelay = 1200;
      try {
        const response = await apiFetch('/api/drive-cache/status', { cache: 'no-store' });
        if (!response.ok) {
          nextDelay = 10000;
          if (lastFailureStatus !== response.status) {
            console.warn(`[drive-cache] status HTTP ${response.status}; tạm giảm tần suất kiểm tra.`);
            lastFailureStatus = response.status;
          }
          return;
        }
        lastFailureStatus = null;
        const next = await response.json();
        if (cancelled) return;
        // Khi cache đã sẵn sàng, payload thường không đổi. Tránh tạo state object
        // mới mỗi 1,2 giây vì nó buộc toàn bộ studio/catalog ảnh render lại dù
        // không có tiến độ mới.
        setDriveCacheStatus((current) => (
          JSON.stringify(current) === JSON.stringify(next) ? current : next
        ));
        nextDelay = next.ready ? 5000 : 1200;
        if (!next.ready) {
          driveCacheWasWaitingRef.current = true;
        } else if (driveCacheWasWaitingRef.current) {
          driveCacheWasWaitingRef.current = false;
          if (photosReadyReloadRef.current && next.destinationId === photosReadyReloadRef.current) {
            photosReadyReloadRef.current = null;
            void loadDatasetRef.current?.('Đang nạp ảnh của nguồn vừa nhập...', currentSelectionRef.current || {}, false)?.catch?.(() => {});
            setPartnersRevision((value) => value + 1);
          }
          setDismissedCacheDestinationId(null);
          setDriveCacheReadyNotice(true);
          if (readyNoticeTimer) window.clearTimeout(readyNoticeTimer);
          readyNoticeTimer = window.setTimeout(() => setDriveCacheReadyNotice(false), 5000);
        }
      } catch {
        nextDelay = 10000;
        // Backend guard vẫn chặn tạo list nếu cache chưa sẵn sàng.
      } finally {
        if (!cancelled) pollTimer = window.setTimeout(loadDriveCacheStatus, nextDelay);
      }
    };

    loadDriveCacheStatus();
    return () => {
      cancelled = true;
      if (pollTimer) window.clearTimeout(pollTimer);
      if (readyNoticeTimer) window.clearTimeout(readyNoticeTimer);
    };
  }, []);

  // Returning from a native picker or another window must not reload guide data.
  // Dataset updates belong to explicit data/list operations, not window focus.

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
    loadDataset('Đang nạp lại thư viện mẫu...', currentSelectionRef.current, false, { silent: true }).catch((error) => {
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
                ...(updates.items !== undefined && (page.localRender || (page.layoutVariant === 'itinerary-note-day' || page.layoutVariant === 'itinerary-note-dark-day' || page.layoutVariant === 'itinerary-note-threads-day' || page.layoutVariant === 'threads-toplist-page') || page.layoutVariant === 'itinerary-note-timed-day' || page.layoutVariant === 'spotlight-v6-diary-page' || page.layoutVariant === 'spotlight-v6-map-place' || page.layoutVariant === 'itinerary-note-threads-budget' || page.layoutVariant === 'threads-expense-sheet' || (activeDeckId === 'spotlight-v6-persimmon' && page.layoutVariant === 'spotlight-v6-page')) ? { items: page.items.map((item, i) => ({ ...item, ...updates.items[i] })) } : {}),
                ...(updates.chipText !== undefined && page.layoutVariant === 'itinerary-note-timed-day' ? { chipText: updates.chipText } : {}),
                ...(updates.title !== undefined ? { title: updates.title } : {}),
                ...(updates.subtitle !== undefined ? { subtitle: updates.subtitle } : {}),
                ...(updates.titlePlacement !== undefined && (page.imageRole || page.layoutVariant === 'spotlight-v6-diary-page' || page.spotlightDesignRevision === 1) ? { titlePlacement: updates.titlePlacement } : {}),
                ...(page.type === 'cover' && page.spotlightDesignRevision === 1 && updates.coverImages ? { coverImages: updates.coverImages, backgroundImage: updates.coverImages[0] } : {}),
                ...(page.type === 'cover' && page.spotlightDesignRevision === 1 && updates.coverApproval !== undefined ? { coverApproval: updates.coverApproval } : {}),
                ...(updates.textScale !== undefined ? { textScale: updates.textScale } : {}),
                ...(updates.textFontSize !== undefined ? { textFontSize: updates.textFontSize } : {}),
                ...(updates.diaryFontSize !== undefined && page.layoutVariant === 'spotlight-v6-diary-page' ? { diaryFontSize: updates.diaryFontSize } : {}),
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
    if (!editorOriginalDataset.current) editorOriginalDataset.current = datasetRef.current;
    setEditorSaveState('dirty');
    updateActivePageTextInDataset(updates);
  }, [updateActivePageTextInDataset]);

  const savePageText = useCallback(async () => {
    if (!activeDeck || !activeList || !activePage) return;
    // Blur commits the number input before the save click. Read the synchronous
    // draft ref so this request cannot capture the previous render's value.
    const pageToSave = datasetRef.current?.decks?.find(deck => deck.id === activeDeck.id)?.lists?.find(list => list.id === activeList.id)?.pages?.[selectedPageIndex] ?? activePage;
    setSavingPageText(true);
    try {
      const response = await apiFetch(`/api/decks/${encodeURIComponent(activeDeck.id)}/lists/${encodeURIComponent(activeList.id)}/pages/${selectedPageIndex}/text`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: activePage.title || '',
          textScale: activePage.textScale ?? 100,
          textFontSize: pageToSave.textFontSize ?? null,
          ...(activePage.imageRole ? { titlePlacement: activePage.titlePlacement } : {}),
          ...(activePage.type === 'cover' && activePage.spotlightDesignRevision === 1 ? { coverImages: activePage.coverImages?.length ? activePage.coverImages : [activePage.backgroundImage], coverApproval: activePage.coverApproval || '', titlePlacement: activePage.titlePlacement } : {}),
          ...(activePage.layoutVariant === 'spotlight-v6-diary-page' ? { diaryFontSize: activePage.diaryFontSize ?? 13 } : {}),
          subtitle: activePage.subtitle || '',
          ...(activePage.localRender && activePage.type === 'list' ? { items: activePage.items.map(({ name, metaPrimary }) => ({ name, metaPrimary })) } : {}),
          ...(activePage.layoutVariant === 'spotlight-v6-diary-page' ? { titlePlacement: activePage.titlePlacement, items: activePage.items.map(({ name, metaPrimary }) => ({ name, metaPrimary })) } : {}),
          ...(activePage.layoutVariant === 'itinerary-note-timed-day' ? { chipText: activePage.chipText || '' } : {}),
          ...((activePage.layoutVariant === 'itinerary-note-day' || activePage.layoutVariant === 'itinerary-note-dark-day' || activePage.layoutVariant === 'itinerary-note-threads-day' || activePage.layoutVariant === 'threads-toplist-page') ? { items: activePage.items.map(({ name, metaPrimary }) => ({ name, metaPrimary })) } : {}),
          ...(activePage.layoutVariant === 'itinerary-note-timed-day' ? { items: activePage.items.map(({ name, metaPrimary, scheduleTime }) => ({ name, metaPrimary, scheduleTime })) } : {}),
          ...(activePage.layoutVariant === 'spotlight-v6-map-place' ? { items: activePage.items.map(({ name, metaPrimary }) => ({ name, metaPrimary })) } : {}),
          // Bảng chi phí/chi tiêu Threads: số tiền (metaSecondary) cũng là nội dung người dùng sửa.
          ...(activePage.layoutVariant === 'itinerary-note-threads-budget' || activePage.layoutVariant === 'threads-expense-sheet' ? { items: activePage.items.map(({ name, metaPrimary, metaSecondary }) => ({ name, metaPrimary, metaSecondary: metaSecondary ?? '' })) } : {}),
          ...(activeDeck.id === 'spotlight-v6-persimmon' && activePage.layoutVariant === 'spotlight-v6-page' ? { items: activePage.items.map(({ name, metaPrimary }) => ({ name, metaPrimary })) } : {}),
        }),
      });
      const payload = await readApiPayload(response);
      if (!response.ok) throw new Error(apiErrorMessage(payload, `Lưu nội dung trang thất bại: HTTP ${response.status}`));
      const result = updateActivePageTextInDataset({ title: payload.title, subtitle: payload.subtitle, ...(payload.coverImages ? { coverImages: payload.coverImages } : {}), ...(payload.coverApproval !== undefined ? { coverApproval: payload.coverApproval } : {}), ...(payload.textFontSize !== undefined ? { textFontSize: payload.textFontSize } : {}), ...(payload.textScale !== undefined ? { textScale: payload.textScale } : {}), ...(payload.diaryFontSize !== undefined ? { diaryFontSize: payload.diaryFontSize } : {}), ...(payload.titlePlacement ? { titlePlacement: payload.titlePlacement } : {}), ...(payload.chipText !== undefined ? { chipText: payload.chipText } : {}), ...(payload.items ? { items: payload.items } : {}) });
      if (result?.nextDataset) writeCachedDataset(result.nextDataset);
      setStatus(`Đã lưu nội dung trang ${selectedPageIndex + 1}.`);
      setEditorSaveState('saved');
      editorOriginalDataset.current = null;
    } catch (error) {
      setEditorSaveState('failed');
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
      const response = await apiFetch('/api/ai/caption', {
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
    if (!activeDeck) {
      setStatus('Chưa có deck để tạo list AI mới.');
      return;
    }
    if (!automationState.locked && !driveCacheStatus.ready && activeDeck.id !== 'threads-toplist-dalat' && activeDeck.id !== 'itinerary-note-timed' && !activeDeck.id.startsWith('itinerary-note-threads-')) {
      setStatus('Đang đồng bộ ảnh Google Drive vào cache, tạm thời chưa thể tạo list.');
      return;
    }
    const isNonAiTemplate = Boolean(activeDeck.localTemplate) || activeDeck.id === 'threads-food-local'
      || activeDeck.id === 'threads-cafe-local'
      || activeDeck.id === 'threads-mix-local'
      || activeDeck.id === 'threads-mix-text'
      || activeDeck.id === 'carousel-mau-1'
      || activeDeck.id === 'one-way-story'
      || activeDeck.id === 'spotlight-v5'
      || activeDeck.id === 'spotlight-v6-green'
      || activeDeck.id === 'spotlight-v6-dark'
      || activeDeck.id === 'spotlight-v6-persimmon'
      || activeDeck.id === 'spotlight-v6-maps'
      || activeDeck.id === 'spotlight-v6-diary'
      || activeDeck.id === 'spotlight-v6-cherry-blossom'
      || (activeDeck.id === 'summary-note' || activeDeck.id === 'itinerary-note-dark' || (activeDeck.id === 'itinerary-note-2days' || activeDeck.id.startsWith('itinerary-note-threads-')) || activeDeck.id === 'itinerary-note-timed' || activeDeck.id === 'threads-toplist-dalat');
    const festivalProvidesCover = hookSourcesInfo?.mode === 'festival'
      && hookSourcesInfo?.eligibleDeckIds?.includes(activeDeck.id);
    const coverTitle = (caption.coverTitle || '').trim();
    if (!isNonAiTemplate && !festivalProvidesCover && !coverTitle) {
      setStatus('Cần có tiêu đề cover trước khi tạo list AI.');
      return;
    }

    setBusy(true);
    setStatus('Đang kiểm tra sức máy trước khi tạo list...');
    try {
      const runtime = await (await apiFetch('/api/runtime-performance', { cache: 'no-store' })).json();
      setRuntimePerformance(runtime);
      setStatus(runtime.mode === 'legacy'
        ? `Tạo list ở chế độ tương thích: ${runtime.reason}`
        : (isNonAiTemplate
          ? `Đang tạo ${activeDeck.navTitle} từ dữ liệu...`
          : `Đang tạo list AI mới trong deck "${activeDeck.navTitle}"...`));
    } catch {
      setStatus(isNonAiTemplate
      ? `Đang tạo ${activeDeck.navTitle} từ dữ liệu...`
      : `Đang tạo list AI mới trong deck "${activeDeck.navTitle}"...`);
    }
    try {
      const response = await queueGenerationRequest('/api/decks/generate-from-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: activeDeck.id,
          listId: captionSourceList?.id || activeListId,
          photoPreset: selectedPhotoPreset,
          requiredPartners: selectedRequiredPartners,
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
      await loadHookSources().catch(() => undefined);
      setStatus(`Đã tạo list mới "${payload.navTitle}" ngay trong deck "${activeDeck.navTitle}".${payload.warnings?.length ? ` Lưu ý: ${payload.warnings.join(' ')}` : ''}`);
    } catch (error) {
      setStatus(error?.message || 'Không tạo được list AI mới.');
    } finally {
      setBusy(false);
    }
  }, [selectedPhotoPreset, selectedRequiredPartners, activeDeck, activeListId, caption, captionSourceList, driveCacheStatus.ready, hookSourcesInfo, loadDataset, loadHookSources, queueGenerationRequest, automationState.locked]);

  const createBatchLists = useCallback(async (count) => {
    if (!activeDeck) {
      setStatus('Chưa có deck để tạo batch list.');
      return;
    }
    if (!automationState.locked && !driveCacheStatus.ready && activeDeck.id !== 'threads-toplist-dalat' && activeDeck.id !== 'itinerary-note-timed' && !activeDeck.id.startsWith('itinerary-note-threads-')) {
      setStatus('Đang đồng bộ ảnh Google Drive vào cache, tạm thời chưa thể tạo list.');
      return;
    }
    if (creatingListsRef.current) return;
    const safeCount = Math.min(10, Math.max(1, Number(count) || 5));
    if (safeCount >= 5 && !(await studioConfirm({ title: `Tạo ${safeCount} list AI?`, message: 'Có thể mất vài phút. Bạn vẫn dùng được các phần khác trong lúc chờ.', confirmLabel: `Tạo ${safeCount} list` }))) return;
    creatingListsRef.current = true;
    const requestId = `${activeDeck.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setBusy(true);
    setStatus('Đang kiểm tra sức máy trước khi tạo list...');
    try {
      const runtime = await (await apiFetch('/api/runtime-performance', { cache: 'no-store' })).json();
      setRuntimePerformance(runtime);
      setStatus(runtime.mode === 'legacy'
        ? `Đang tạo ${safeCount} list ở chế độ tương thích...`
        : `Đang tạo ${safeCount} list AI (xoay vòng tone)...`);
      const response = await queueGenerationRequest('/api/decks/generate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId: activeDeck.id, count: safeCount, requestId, photoPreset: selectedPhotoPreset, requiredPartners: selectedRequiredPartners }),
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
      await loadHookSources().catch(() => undefined);
      const failures = (payload.errors || []).map(error => `Lượt ${error.index}: ${error.message}`).join(' | ');
      const msg = payload.failCount > 0
        ? `${activeDeck.navTitle}: đã tạo ${payload.successCount}/${safeCount} list (${payload.failCount} lỗi)${failures ? `: ${failures}` : '.'}`
        : `Đã tạo xong ${payload.successCount} list AI.`;
      const warnings = (payload.lists || []).flatMap(list => (list.warnings || []).map(message => `${list.navTitle}: ${message}`));
      setStatus(msg + (warnings.length ? ` Lưu ý (${warnings.length}): ${warnings.join(' ')}` : ''));
    } catch (error) {
      setStatus(error?.message || 'Không tạo được batch list.');
    } finally {
      creatingListsRef.current = false;
      setBusy(false);
    }
  }, [selectedPhotoPreset, selectedRequiredPartners, activeDeck, activeListId, driveCacheStatus.ready, loadDataset, loadHookSources, queueGenerationRequest, automationState.locked]);

  const createPartnerSpotlight = useCallback(async (partner) => {
    if (!automationState.locked && !driveCacheStatus.ready) {
      setStatus('Đang đồng bộ ảnh Google Drive vào cache, tạm thời chưa thể tạo spotlight.');
      return;
    }
    if (!partner?.id && !partner?.name) {
      setStatus('Chưa chọn đối tác.');
      return;
    }
    setBusy(true);
    setStatus('Đang kiểm tra sức máy trước khi tạo spotlight...');
    try {
      const runtime = await (await apiFetch('/api/runtime-performance', { cache: 'no-store' })).json();
      setRuntimePerformance(runtime);
      setStatus(runtime.mode === 'legacy'
        ? `Đang tạo spotlight ở chế độ tương thích cho "${partner.name}"...`
        : `Đang tạo spotlight cho "${partner.name}"...`);
      const response = await queueGenerationRequest('/api/decks/generate-partner-spotlight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: partner.id, partnerName: partner.name, photoPreset: selectedPhotoPreset }),
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
      setStatus(`Đã tạo spotlight "${payload.partnerName}" (${payload.pageCount} trang).${payload.warnings?.length ? ` Lưu ý: ${payload.warnings.join(' ')}` : ''}`);
    } catch (error) {
      setStatus(error?.message || 'Không tạo được spotlight đối tác.');
    } finally {
      setBusy(false);
    }
  }, [selectedPhotoPreset, driveCacheStatus.ready, loadDataset, queueGenerationRequest, automationState.locked]);

  const deleteGeneratedList = useCallback(async (deckId, listId) => {
    const confirmed = await studioConfirm({ title: 'Xóa list AI này?', message: 'Bộ ảnh AI sẽ bị xóa khỏi danh sách. List chính của mẫu vẫn được giữ.', confirmLabel: 'Xóa list', tone: 'danger' });
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
    const confirmed = await studioConfirm({ title: `Xóa ${listCount} list AI?`, message: `Các list đã chọn trong ${groups.length} mẫu sẽ bị xóa. List chính của các mẫu vẫn được giữ.`, confirmLabel: `Xóa ${listCount} list`, tone: 'danger' });
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

  // Ghi mốc "đã xuất" cho list đã tạo (trạng thái trong màn Duyệt & Xuất). Lỗi ở bước này
  // không ảnh hưởng file đã xuất nên chỉ ghi cảnh báo.
  const recordExportedLists = useCallback(async (items) => {
    const groups = groupListIds(items);
    if (!groups.length) return;
    try {
      const response = await apiFetch('/api/decks/mark-exported', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groups }) });
      if (!response.ok) return;
      const { exportedAt } = await response.json();
      const nextDataset = applyExportedAt(datasetRef.current, groups, exportedAt);
      datasetRef.current = nextDataset;
      setDataset(nextDataset);
      writeCachedDataset(nextDataset);
    } catch (error) {
      console.warn('[export] Chưa ghi được trạng thái đã xuất:', error?.message || error);
    }
  }, []);

  const setManualExportActive = useCallback(async (active) => {
    const response = await apiFetch('/api/automation/manual-export', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok && active) throw new Error(await formatApiError(response, 'Chưa thể bắt đầu xuất'));
  }, []);

  const handleExportPage = useCallback(async () => {
    let claimed = false;
    try {
      await setManualExportActive(true); claimed = true;
      await exportSelectedPagePng({ deck: activeDeck, list: activeList, dataset, selectedPageIndex, format: exportFormat, quality: exportQuality }, exportCb);
      await loadRuntimePerformance().catch(() => undefined);
    } catch (error) {
      failProgress(error?.message || 'Chưa thể xuất trang.'); setBusy(false);
      setStatus(error?.message || 'Chưa thể xuất trang.');
    } finally {
      if (claimed) await setManualExportActive(false).catch(() => undefined);
    }
  }, [activeDeck, activeList, dataset, exportCb, exportQuality, exportFormat, failProgress, loadRuntimePerformance, selectedPageIndex, setManualExportActive]);

  const handleExportList = useCallback(async () => {
    let claimed = false;
    try {
      await setManualExportActive(true); claimed = true;
      const result = await exportActiveList({ deck: activeDeck, list: activeList, dataset, format: exportFormat, quality: exportQuality }, exportCb);
      if (result?.success) await recordExportedLists([{ deckId: activeDeck?.id, listId: activeList?.id }]);
      await loadRuntimePerformance().catch(() => undefined);
    } catch (error) {
      failProgress(error?.message || 'Chưa thể xuất list.'); setBusy(false);
      setStatus(error?.message || 'Chưa thể xuất list.');
    } finally {
      if (claimed) await setManualExportActive(false).catch(() => undefined);
    }
  }, [activeDeck, activeList, dataset, exportCb, exportQuality, exportFormat, failProgress, loadRuntimePerformance, recordExportedLists, setManualExportActive]);

  const handleExportBatch = useCallback(async (options = {}) => {
    const shouldDelete = options.deleteAfterExport !== false;
    setExportModalOpen(false);
    setActiveView('preview');
    let claimed = false;
    let result;
    try {
      await setManualExportActive(true); claimed = true;
      result = await exportBatch({ dataset, selectedListIds: selectedListsForExport, format: exportFormat, quality: exportQuality,
        confirmSkipImages: (inspection) => new Promise(resolve => {
          exportImageAnswer.current = resolve;
          setExportImageInspection(inspection);
        }),
      }, exportCb);
    } catch (error) {
      failProgress(error?.message || 'Chưa thể xuất hàng loạt.'); setBusy(false);
      answerExportImages(false);
      setStatus(error?.message || 'Chưa thể xuất hàng loạt.');
    } finally {
      if (claimed) await setManualExportActive(false).catch(() => undefined);
    }
    await loadRuntimePerformance().catch(() => undefined);
    if (result?.success) await recordExportedLists(result.exportedLists);
    if (result?.success) setSelectedListsForExport(new Set((result.skippedLists || []).map(list => list.listId)));
    if (result?.success && shouldDelete) {
      setBusy(true);
      try {
        await removeExportedGeneratedLists(result.exportedLists);
        setStatus(`Đã xuất và xóa ${result.exportedLists.length} list; giữ nguyên các list bị bỏ qua. ${formatSkippedListSummary(result.skippedLists)}`);
      } catch (error) {
        setStatus(error?.message || 'Đã xuất file nhưng chưa xóa được list AI đã xuất.');
      } finally {
        setBusy(false);
      }
    }
  }, [dataset, exportCb, exportQuality, exportFormat, failProgress, answerExportImages, loadRuntimePerformance, recordExportedLists, removeExportedGeneratedLists, selectedListsForExport, setManualExportActive]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const targetTag = event.target?.tagName?.toLowerCase();
      const isTyping = targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select' || event.target?.isContentEditable;
      if (isTyping) return;

      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 's') {
        event.preventDefault();
        if (!busy) {
          if (activeDeck?.id === 'threads-food-local' || activeDeck?.id === 'threads-cafe-local' || activeDeck?.id === 'threads-mix-local' || activeDeck?.id === 'threads-mix-text') handleExportList();
          else handleExportPage();
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
    handleExportPage,
    handleExportList,
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

  const openSchedulerView = useCallback(() => {
    setActiveView('scheduler');
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
    activeView === 'scheduler' ? 'scheduler-mode' : '',
  ].filter(Boolean).join(' ');

  const activeDestinationId = destinationInfo?.active?.id || dataset?.source?.destinationId || '';
  const needsFirstSource = Boolean(destinationInfo) && !destinationInfo.active;
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
    && !automationState.locked
    && dismissedCacheDestinationId !== cacheStatusDestinationId;

  const resolveDestinationCount = (entry) => {
    if (entry.id === activeDestinationId && dataset?.source?.totalItems) {
      return dataset.source.totalItems;
    }
    return entry.totalItems;
  };


  return {
    recordExportedLists,
    initialDeck,
    initialList,
    dataset,
    setDataset,
    exportImageInspection,
    setExportImageInspection,
    exportImageAnswer,
    answerExportImages,
    activeDeckId,
    setActiveDeckId,
    photoPresets,
    setPhotoPresets,
    photoPresetChoices,
    setPhotoPresetChoices,
    selectedPhotoPreset,
    changePhotoPreset,
    requiredPartnerChoices,
    setRequiredPartnerChoices,
    activeListId,
    setActiveListId,
    selectedPageIndex,
    setSelectedPageIndex,
    busy,
    setBusy,
    status,
    setStatus,
    activeView,
    setActiveView,
    studioTheme,
    setStudioTheme,
    editorSaveState,
    setEditorSaveState,
    editorOriginalDataset,
    editorPane,
    setEditorPane,
    toggleStudioTheme,
    captionToolsVisible,
    setCaptionToolsVisible,
    captionTone,
    setCaptionTone,
    caption,
    setCaption,
    exportModalOpen,
    setExportModalOpen,
    deleteModalOpen,
    setDeleteModalOpen,
    selectedListsForExport,
    setSelectedListsForExport,
    exportQuality,
    setExportQuality,
    exportFormat,
    setExportFormat,
    selectedListsForDelete,
    setSelectedListsForDelete,
    progress,
    showProgress,
    updateProgress,
    completeProgress,
    failProgress,
    partners,
    setPartners,
    partnersRevision,
    setPartnersRevision,
    photosReadyReloadRef,
    loadDatasetRef,
    partnerSourceId,
    partnerEligibility,
    setPartnerEligibility,
    eligibilityRequests,
    ensurePartnerEligibility,
    requiredPartnerKey,
    selectedRequiredPartners,
    changeRequiredPartners,
    savingPageText,
    setSavingPageText,
    refreshing,
    setRefreshing,
    destinationInfo,
    setDestinationInfo,
    switchingDestination,
    setSwitchingDestination,
    hookSourcesInfo,
    setHookSourcesInfo,
    hookSourcesBusy,
    setHookSourcesBusy,
    driveCacheStatus,
    setDriveCacheStatus,
    runtimePerformance,
    setRuntimePerformance,
    automationState,
    setAutomationState,
    manualJob,
    setManualJob,
    queueGenerationRequest,
    driveCacheReadyNotice,
    setDriveCacheReadyNotice,
    manualSyncProgress,
    setManualSyncProgress,
    manualSyncVisible,
    setManualSyncVisible,
    manualSyncDestination,
    manualSyncTerminal,
    dismissedCacheDestinationId,
    setDismissedCacheDestinationId,
    dismissedSyncWarning,
    setDismissedSyncWarning,
    currentSelectionRef,
    v2CatalogRefreshAttemptedRef,
    selectionHistoryRef,
    spotlightPartnerRefreshRef,
    datasetRef,
    driveCacheWasWaitingRef,
    creatingListsRef,
    datasetLoadPromiseRef,
    activeDeck,
    activeList,
    captionSourceList,
    activePage,
    activePageItems,
    activePartnerCount,
    exportCb,
    applyDataset,
    loadDataset,
    loadDestinations,
    publishedDatasetVersions,
    backgroundDatasetContext,
    loadRuntimePerformance,
    loadHookSources,
    loadAutomationState,
    createHookSource,
    updateHookSource,
    refreshHookSource,
    deleteHookSource,
    changeHookMode,
    applyDestinationMutation,
    switchDestination,
    addDestination,
    replaceDestinationWorkbook,
    refreshDestinationFromSheet,
    addSource,
    updateSheetLink,
    pushSelectionSnapshot,
    restoreSelectionSnapshot,
    handleDeckSelect,
    handleListSelect,
    previewGeneratedList,
    handlePageSelect,
    copyText,
    updateActivePageTextInDataset,
    handlePageTextChange,
    savePageText,
    requestCaption,
    createDeckFromCaption,
    createBatchLists,
    createPartnerSpotlight,
    deleteGeneratedList,
    deleteSelectedLists,
    removeExportedGeneratedLists,
    setManualExportActive,
    handleExportPage,
    handleExportList,
    handleExportBatch,
    openPreviewView,
    openTemplatesView,
    openCaptionView,
    previewDeck,
    captionDeck,
    openExportView,
    openDataView,
    openSettingsView,
    openSchedulerView,
    openDeleteView,
    workspaceClasses,
    activeDestinationId,
    needsFirstSource,
    destinationOptions,
    studioTitle,
    studioShort,
    destinationScrollBusy,
    cacheDestinationShortLabel,
    cacheStatusDestinationId,
    showCacheWarmOverlay,
    resolveDestinationCount,
  };
}
