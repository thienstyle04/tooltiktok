'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import Icon from '../ui/Icon';
import ThemeToggle from '../ui/ThemeToggle';
import { ConfirmDialogHost, studioConfirm } from '../ui/confirmDialog';
import { trackButtonSpotlight } from '../ui/spotlight';
import StudioOverlays from '../StudioOverlays';
import UpdateNotice from '../UpdateNotice';
import ProgressBar from '../ProgressBar';
import AutomationSchedulerPanel from '../AutomationSchedulerPanel';
import SettingsPanel from '../SettingsPanel';
import DataStatsPanel from '../DataStatsPanel';
import ExportImageErrorsModal from '../ExportImageErrorsModal';
import DeleteListsModal from '../DeleteListsModal';
import TodayView from './TodayView';
import CreateView from './CreateView';
import ReviewView from './ReviewView';
import TaskCenter, { taskBadge, useTaskRecorder } from './TaskCenter';
import { CommandPalette, Toasts, useStatusToasts } from './Overlays';
import { usePinnedTemplates, useRecentTemplates, useTaskHistory } from './usePersisted';
import { creatableDecks } from '../ui/deckGroups';
import { collectLists } from '../../lib/listStatus.mjs';
import { APP_VERSION } from '../../lib/appVersion';

// Giao diện V2: Hôm nay · Tạo · Duyệt & Xuất · Tự động, Cài đặt ở chân menu, tác vụ ở thanh trên.
// Màn hiển thị suy ra từ activeView của controller (cùng tên màn Classic) để các cơ chế sẵn có
// — chặn nạp dữ liệu nền khi đang sửa, phím tắt, nút "Vào giao diện" — dùng chung.
const NAV = [
  { id: 'today', label: 'Hôm nay', icon: 'today' },
  { id: 'create', label: 'Tạo', icon: 'create' },
  { id: 'review', label: 'Duyệt & Xuất', icon: 'review' },
  { id: 'auto', label: 'Tự động', icon: 'auto' },
];
const TITLES = { today: 'Hôm nay', create: 'Tạo', review: 'Duyệt & Xuất', auto: 'Tự động', settings: 'Cài đặt' };

export function v2View(activeView) {
  if (activeView === 'today') return 'today';
  if (activeView === 'templates' || activeView === 'caption') return 'create';
  if (activeView === 'scheduler') return 'auto';
  if (activeView === 'settings' || activeView === 'data') return 'settings';
  return 'review';
}

export default function StudioV2({ studio }) {
  const {
    dataset, activeView, setActiveView, setCaptionToolsVisible, studioTheme, toggleStudioTheme, editorPane, editorSaveState,
    editorOriginalDataset, datasetRef, setDataset, setEditorSaveState, openTemplatesView, openPreviewView, openSchedulerView,
    openSettingsView, openDataView, captionDeck, previewDeck, handleDeckSelect, handleListSelect, status, progress,
    exportImageInspection, answerExportImages, deleteModalOpen, setDeleteModalOpen, selectedListsForDelete, setSelectedListsForDelete,
    deleteSelectedLists, busy, partners, partnerEligibility, ensurePartnerEligibility, destinationOptions, hookSourcesInfo, automationState,
    setAutomationState, activeDestinationId, resolveDestinationCount, driveCacheStatus, destinationScrollBusy, refreshing, switchDestination,
    setStatus, addSource, replaceDestinationWorkbook, refreshDestinationFromSheet, updateSheetLink, setPartnerLogic, createHookSource, updateHookSource,
    refreshHookSource, deleteHookSource, changeHookMode, hookSourcesBusy, loadDataset, activeDeckId,
  } = studio;
  const view = v2View(activeView);
  const [settingsTab, setSettingsTab] = useState('sources');
  const [taskOpen, setTaskOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pinned, togglePin] = usePinnedTemplates();
  const [recent, rememberTemplate] = useRecentTemplates();
  const [history, recordTask, clearHistory] = useTaskHistory();
  useTaskRecorder(studio, recordTask);

  // Mở studio vào "Hôm nay" (controller khởi tạo activeView = 'templates').
  useEffect(() => {
    if (activeView === 'templates') setActiveView('today');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = useCallback(next => {
    setTaskOpen(false);
    if (next === 'today') { setActiveView('today'); setCaptionToolsVisible(false); }
    if (next === 'create') openTemplatesView();
    if (next === 'review') openPreviewView();
    if (next === 'auto') openSchedulerView();
    if (next === 'settings') { if (settingsTab === 'stats') openDataView(); else openSettingsView(); }
  }, [openDataView, openPreviewView, openSchedulerView, openSettingsView, openTemplatesView, setActiveView, setCaptionToolsVisible, settingsTab]);
  const openList = useCallback(entry => { handleDeckSelect(entry.deck); handleListSelect(entry.list); openPreviewView(); }, [handleDeckSelect, handleListSelect, openPreviewView]);
  const openTemplate = useCallback(deck => { rememberTemplate(deck.id); captionDeck(deck); }, [captionDeck, rememberTemplate]);

  const { toasts, push, dismiss } = useStatusToasts(status, text => (/^Đã tạo/.test(text) ? { action: { label: 'Duyệt ngay', run: openPreviewView } } : undefined));
  // Lỗi xuất file chỉ báo qua thanh tiến độ ở Classic; V2 báo thêm bằng toast để không bị bỏ sót.
  useEffect(() => { if (progress.failed && progress.label) push(progress.label, { tone: 'error' }); }, [progress.failed, progress.label, push]);

  useEffect(() => {
    const onKey = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen(open => !open); }
      if (event.key === 'Escape') setTaskOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const lists = useMemo(() => collectLists(dataset), [dataset]);
  const waitingCount = lists.filter(entry => entry.status !== 'exported').length;
  const badge = taskBadge(studio);
  const paletteEntries = useMemo(() => [
    ...NAV.map(item => ({ id: `go-${item.id}`, group: 'Lệnh', label: `Mở ${item.label}`, run: () => go(item.id) })),
    { id: 'go-settings', group: 'Lệnh', label: 'Mở Cài đặt', hint: 'Nguồn dữ liệu, AI, Hook, cache', run: () => go('settings') },
    { id: 'go-stats', group: 'Lệnh', label: 'Thống kê dữ liệu', run: () => { setSettingsTab('stats'); openDataView(); } },
    { id: 'tasks', group: 'Lệnh', label: 'Xem tác vụ đang chạy', run: () => setTaskOpen(true) },
    { id: 'theme', group: 'Lệnh', label: 'Đổi giao diện sáng/tối', run: toggleStudioTheme },
    ...creatableDecks(dataset).map(deck => ({ id: `deck-${deck.id}`, group: 'Mẫu', label: deck.navTitle, hint: 'Tạo list', run: () => openTemplate(deck) })),
    ...lists.map(entry => ({ id: `list-${entry.list.id}`, group: 'List', label: entry.list.navTitle || entry.list.title, hint: entry.deck.navTitle, run: () => openList(entry) })),
  ], [dataset, go, lists, openDataView, openList, openTemplate, toggleStudioTheme]);

  return (
    <main className="app-shell studio-workflow studio-v2" data-studio-theme={studioTheme} data-editor-pane={editorPane} data-view={view}
      onPointerMove={trackButtonSpotlight}
      onClickCapture={event => {
        const control = event.target.closest('button');
        if (!editorOriginalDataset.current || !control || control.closest('.right-panel') || control.closest('[data-app-update-ui]') || control.closest('[data-studio-confirm]') || control.closest('[data-v2-safe]') || control.classList.contains('studio-theme-toggle') || control.closest('.v2-pane-switch')) return;
        // Giống Classic: hỏi trước khi rời bản nháp; đồng ý thì bỏ nháp rồi bấm lại nút đó.
        event.preventDefault(); event.stopPropagation();
        studioConfirm({ title: 'Bỏ thay đổi chưa lưu?', message: 'Trang có thay đổi chưa lưu. Bỏ thay đổi để tiếp tục?', confirmLabel: 'Bỏ thay đổi', cancelLabel: 'Ở lại chỉnh sửa', tone: 'danger' }).then(confirmed => {
          if (!confirmed || !editorOriginalDataset.current) return;
          datasetRef.current = editorOriginalDataset.current;
          setDataset(editorOriginalDataset.current);
          editorOriginalDataset.current = null;
          setEditorSaveState('saved');
          if (control.isConnected) control.click();
        });
      }}>
      <StudioOverlays studio={studio} />

      <aside className="v2-sidebar">
        <div className="v2-brand"><b aria-hidden="true">ĐL</b><span>Dalat Studio<small>v{APP_VERSION}</small></span></div>
        <nav className="v2-nav" aria-label="Điều hướng chính">{NAV.map(item => (
          <button key={item.id} type="button" aria-label={item.id === 'review' && waitingCount ? `${item.label} (${waitingCount} chờ)` : item.label} aria-current={view === item.id ? 'page' : undefined} onClick={() => go(item.id)}>
            {view === item.id ? <motion.span layoutId="v2-nav-pill" className="v2-nav-pill" transition={{ type: 'spring', duration: 0.5, bounce: 0.2 }} /> : null}
            <Icon name={item.icon} /><span className="v2-nav-label">{item.label}</span>
            {item.id === 'review' && waitingCount ? <small className="v2-nav-count">{waitingCount}</small> : null}
          </button>
        ))}</nav>
        <div className="v2-sidebar-foot">
          <button type="button" className="v2-foot-button v2-palette-hint" data-v2-safe aria-label="Tìm nhanh (Ctrl K)" onClick={() => setPaletteOpen(true)}><Icon name="search" size={16} /><span>Tìm nhanh</span><kbd>Ctrl K</kbd></button>
          <button type="button" className="v2-foot-button" aria-label="Cài đặt" aria-current={view === 'settings' ? 'page' : undefined} onClick={() => go('settings')}><Icon name="settings" size={16} /><span>Cài đặt</span></button>
          <p className="v2-ready"><span className={`footer-status-dot ${dataset ? 'ui-ping' : 'ui-ping waiting'}`} aria-hidden="true" />{dataset ? (dataset.source?.destinationLabel || 'Sẵn sàng') : 'Đang nạp dữ liệu'}</p>
        </div>
      </aside>

      <section className="v2-workspace">
        <header className="v2-topbar">
          <div className="v2-title"><h2 id="deckTitle">{TITLES[view]}</h2><p>{dataset?.source?.destinationLabel || 'Đang tải nguồn dữ liệu'}{dataset?.source?.totalItems ? ` · ${dataset.source.totalItems} địa điểm` : ''}</p></div>
          <div className="v2-top-actions">
            <ThemeToggle theme={studioTheme} onToggle={toggleStudioTheme} />
            <button type="button" className="v2-icon-button v2-task-button" data-v2-safe aria-label={`Tác vụ${badge ? `: ${badge} đang chạy` : ''}`} aria-expanded={taskOpen} onClick={() => setTaskOpen(open => !open)}>
              <Icon name="list" />{badge ? <motion.b key={badge} initial={{ scale: 0.4 }} animate={{ scale: 1 }}>{badge}</motion.b> : null}
            </button>
          </div>
          <div className="v2-task-anchor" data-v2-safe><TaskCenter studio={studio} open={taskOpen} onClose={() => setTaskOpen(false)} history={history} onClearHistory={clearHistory} /></div>
        </header>
        <ProgressBar progress={progress} />
        <UpdateNotice hasUnsavedChanges={editorSaveState !== 'saved'} />

        <div className="v2-content">
          {view === 'today' ? <TodayView studio={studio} recent={recent} onOpenList={openList} onGoReview={() => go('review')} onGoCreate={() => go('create')} onOpenTemplate={openTemplate} onOpenTasks={() => setTaskOpen(true)} /> : null}
          {view === 'create' ? <CreateView studio={studio} pinned={pinned} onTogglePin={togglePin} recent={recent} onRemember={rememberTemplate}
            drawerOpen={activeView === 'caption'} onOpenDrawer={captionDeck} onCloseDrawer={openTemplatesView} onPreviewDeck={previewDeck} /> : null}
          {view === 'review' ? <ReviewView studio={studio} onCreate={() => go('create')} /> : null}
          {view === 'auto' ? <div className="v2-view-stack">
            <header className="v2-view-head"><div><p className="v2-eyebrow">Tự động</p><h1>Lịch tạo & xuất</h1><p>Tool cần đang mở. Các lịch chạy lần lượt theo giờ Việt Nam; tiến độ hiện ở mục Tác vụ.</p></div></header>
            <AutomationSchedulerPanel partners={partners} partnerEligibility={partnerEligibility} onNeedPartnerEligibility={ensurePartnerEligibility}
              dataset={dataset} destinations={destinationOptions} hookSourcesInfo={hookSourcesInfo} automationState={automationState} onStateChange={setAutomationState} />
          </div> : null}
          {view === 'settings' ? <div className="v2-view-stack">
            <header className="v2-view-head"><div><p className="v2-eyebrow">Cài đặt</p><h1>{settingsTab === 'stats' ? 'Thống kê dữ liệu' : 'Nguồn dữ liệu & nâng cao'}</h1><p>Việc hằng ngày ở tab đầu; key AI, đồng bộ, Hook và cache nằm trong Nâng cao.</p></div></header>
            <div className="v2-segmented v2-settings-tabs" role="tablist" aria-label="Phần cài đặt">{[['sources', 'Nguồn dữ liệu'], ['advanced', 'Nâng cao'], ['stats', 'Thống kê']].map(([id, label]) => {
              const selected = id === 'stats' ? activeView === 'data' : activeView !== 'data' && settingsTab === id;
              return <button key={id} type="button" role="tab" aria-selected={selected} onClick={() => { setSettingsTab(id); if (id === 'stats') openDataView(); else openSettingsView(); }}>
                {selected ? <motion.span layoutId="v2-settings-tab" className="v2-chip-pill" /> : null}<span>{label}</span></button>;
            })}</div>
            {activeView === 'data' ? <DataStatsPanel dataset={dataset} activeDeckId={activeDeckId} onPreviewDeck={previewDeck} /> : (
              <SettingsPanel section={settingsTab === 'advanced' ? 'advanced' : 'sources'}
                activeDestinationId={activeDestinationId} destinations={destinationOptions.map(entry => ({ ...entry, totalItems: resolveDestinationCount(entry) }))}
                cacheStatus={driveCacheStatus} busy={destinationScrollBusy} refreshing={refreshing} hookSourcesInfo={hookSourcesInfo} hookSourcesBusy={hookSourcesBusy}
                onDestinationChange={destinationId => { switchDestination(destinationId).catch(error => setStatus(error.message)); }}
                onAddDestination={addSource} onReplaceDestinationWorkbook={(destinationId, file) => replaceDestinationWorkbook(destinationId, file)}
                onRefreshFromSheet={destinationId => refreshDestinationFromSheet(destinationId)} onUpdateSheetLink={updateSheetLink} onSetPartnerLogic={setPartnerLogic}
                onCreateHookSource={createHookSource} onUpdateHookSource={updateHookSource} onRefreshHookSource={refreshHookSource}
                onDeleteHookSource={deleteHookSource} onChangeHookMode={changeHookMode}
                onRefresh={() => { loadDataset('Đang tải lại dữ liệu workbook...', {}, true).catch(error => setStatus(error.message)); }} />
            )}
          </div> : null}
        </div>
      </section>

      <CommandPalette open={paletteOpen} entries={paletteEntries} onClose={() => setPaletteOpen(false)} />
      <Toasts toasts={toasts} onDismiss={dismiss} />
      <ExportImageErrorsModal inspection={exportImageInspection} onAnswer={answerExportImages} />
      <DeleteListsModal open={deleteModalOpen} dataset={dataset} selectedIds={selectedListsForDelete} setSelectedIds={setSelectedListsForDelete} busy={busy}
        onClose={() => setDeleteModalOpen(false)} onDelete={deleteSelectedLists} />
      <ConfirmDialogHost />
    </main>
  );
}
