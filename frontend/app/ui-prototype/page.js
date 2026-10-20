'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MotionConfig, motion } from 'motion/react';
import s from './prototype.module.css';
import { INITIAL_JOBS, INITIAL_SCHEDULES, TEMPLATES, initialLists, makeList } from './data';
import { CommandPalette, ConfirmDialog, Icon, TaskCenter, Toasts } from './parts';
import { AutomationView, CreateDrawer, CreateView, SettingsView, TodayView, templateById } from './views';
import ReviewView from './ReviewView';

// Prototype GĐ0 của giao diện mới: chỉ dữ liệu minh họa, không gọi API, không ghi gì vào tool thật.
const NAV = [
  { id: 'today', label: 'Hôm nay', icon: 'today' },
  { id: 'create', label: 'Tạo', icon: 'create' },
  { id: 'review', label: 'Duyệt & Xuất', icon: 'review' },
  { id: 'auto', label: 'Tự động', icon: 'auto' },
];

function setPath(page, path, value) {
  const [head, index, key] = path.split('.');
  if (head !== 'items') return { ...page, [head]: value };
  return { ...page, items: page.items.map((item, i) => (i === Number(index) ? { ...item, [key]: value } : item)) };
}

let jobCounter = 0;

export default function Prototype() {
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [view, setView] = useState('today');
  const [lists, setLists] = useState([]);
  const [jobs, setJobs] = useState(INITIAL_JOBS);
  const [schedules, setSchedules] = useState(INITIAL_SCHEDULES);
  const [pinned, setPinned] = useState(() => new Set(['spotlight-v6']));
  const [recent, setRecent] = useState(['itinerary-3n2d', 'spotlight-v6', 'note-timed']);
  const [activeListId, setActiveListId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [selection, setSelection] = useState(() => new Set());
  const [drawerTemplate, setDrawerTemplate] = useState(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const listsRef = useRef(lists); listsRef.current = lists;

  useEffect(() => {
    const seeded = initialLists();
    setLists(seeded); setActiveListId(seeded[0].id);
    try { setTheme(localStorage.getItem('dalat-studio-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')); } catch {}
    setReady(true);
  }, []);

  const toast = useCallback((text, extra = {}) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(previous => [...previous.slice(-3), { id, text, ...extra }]);
    setTimeout(() => setToasts(previous => previous.filter(entry => entry.id !== id)), extra.action ? 7000 : 4500);
  }, []);
  const ask = request => new Promise(resolve => setConfirm({ ...request, resolve }));
  const answer = value => { confirm?.resolve(value); setConfirm(null); };

  // ---------- Hàng đợi tác vụ mô phỏng: chạy lần lượt từng việc như tool thật ----------
  const queueJob = useCallback(job => {
    jobCounter += 1;
    setJobs(previous => [{ id: `job-${jobCounter}`, status: 'queued', progress: 0, speed: 6, ...job }, ...previous]);
  }, []);
  const hasPending = jobs.some(job => job.status === 'running' || job.status === 'queued');
  useEffect(() => {
    if (!hasPending) return undefined;
    const timer = setInterval(() => setJobs(previous => {
      let next = previous;
      if (!next.some(job => job.status === 'running')) {
        const waiting = [...next].reverse().find(job => job.status === 'queued');
        if (waiting) next = next.map(job => (job.id === waiting.id ? { ...job, status: 'running' } : job));
      }
      return next.map(job => (job.status === 'running' ? { ...job, progress: Math.min(100, job.progress + job.speed) } : job));
    }), 200);
    return () => clearInterval(timer);
  }, [hasPending]);
  useEffect(() => {
    const finished = jobs.filter(job => job.status === 'running' && job.progress >= 100);
    if (!finished.length) return;
    setJobs(previous => previous.map(job => (finished.some(done => done.id === job.id) ? { ...job, status: job.fail ? 'failed' : 'done', finishedAt: Date.now() } : job)));
    for (const job of finished) {
      if (job.kind === 'create') {
        const template = templateById(job.templateId);
        const created = Array.from({ length: job.count }, () => makeList(template, { status: 'new' }));
        setLists(previous => [...created, ...previous]);
        toast(`Đã tạo ${job.count} list ${template.name}.`, { action: { label: 'Duyệt ngay', run: () => { setActiveListId(created[0].id); setView('review'); } } });
      } else if (job.kind === 'export') {
        setLists(previous => job.removeAfter ? previous.filter(list => !job.listIds.includes(list.id)) : previous.map(list => (job.listIds.includes(list.id) ? { ...list, status: 'exported' } : list)));
        toast(`Đã xuất ${job.listIds.length} list · ZIP lưu ở Desktop\\Bai-dang (minh họa).`);
      } else if (job.kind === 'sync') toast(`Đã cập nhật nguồn ${job.sourceLabel}.`);
    }
  }, [jobs, toast]);

  // ---------- Duyệt & sửa ----------
  const activeList = lists.find(list => list.id === activeListId);
  const pages = activeList ? drafts[activeList.id] || activeList.pages : null;
  const dirty = Boolean(activeList && drafts[activeList.id]);
  const saveDraft = useCallback(() => {
    if (!activeList || !drafts[activeList.id]) return;
    const saved = drafts[activeList.id];
    setLists(previous => previous.map(list => (list.id === activeList.id ? { ...list, pages: saved, status: 'edited' } : list)));
    setDrafts(previous => { const next = { ...previous }; delete next[activeList.id]; return next; });
    toast('Đã lưu thay đổi.');
  }, [activeList, drafts, toast]);
  const discardDraft = () => setDrafts(previous => { const next = { ...previous }; delete next[activeListId]; return next; });
  // Hỏi trước khi rời bản nháp; có thêm lựa chọn "Lưu rồi tiếp tục".
  const guard = async action => {
    if (!dirty) { action(); return; }
    const choice = await ask({ title: 'Lưu thay đổi trước khi rời?', message: `“${activeList.name}” có thay đổi chưa lưu.`, cancelLabel: 'Ở lại', tone: 'danger',
      actions: [{ id: 'discard', label: 'Bỏ thay đổi', tone: 'danger' }, { id: 'save', label: 'Lưu rồi tiếp tục' }] });
    if (choice === 'save') { saveDraft(); action(); }
    if (choice === 'discard') { discardDraft(); action(); }
  };
  const go = next => guard(() => { setView(next); setTaskOpen(false); });
  const openList = id => guard(() => { setActiveListId(id); setView('review'); setFocusRequest(n => n + 1); });

  const startExport = (listIds, options) => {
    const names = listsRef.current.filter(list => listIds.includes(list.id));
    queueJob({ kind: 'export', title: `Xuất ${listIds.length} list · ${options.format} · ${options.quality}`, listIds, removeAfter: options.removeAfter, speed: 9 });
    setSelection(new Set());
    toast(`Đã xếp hàng xuất ${names.length} list. Theo dõi ở 🔔.`);
  };

  useEffect(() => {
    const onKey = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen(open => !open); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && view === 'review') { event.preventDefault(); saveDraft(); }
      if (event.key === 'Escape') { setTaskOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, saveDraft]);
  useEffect(() => {
    const warn = event => { if (Object.keys(drafts).length) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [drafts]);

  const paletteEntries = useMemo(() => [
    { id: 'c-create', group: 'Lệnh', label: 'Tạo list mới', hint: 'Mở thư viện mẫu', run: () => go('create') },
    { id: 'c-review', group: 'Lệnh', label: 'Mở Duyệt & Xuất', run: () => go('review') },
    { id: 'c-auto', group: 'Lệnh', label: 'Mở lịch tự động', run: () => go('auto') },
    { id: 'c-settings', group: 'Lệnh', label: 'Mở Cài đặt', run: () => go('settings') },
    { id: 'c-tasks', group: 'Lệnh', label: 'Xem tác vụ đang chạy', run: () => setTaskOpen(true) },
    { id: 'c-theme', group: 'Lệnh', label: 'Đổi giao diện sáng/tối', run: () => setTheme(t => (t === 'dark' ? 'light' : 'dark')) },
    ...TEMPLATES.map(template => ({ id: `t-${template.id}`, group: 'Mẫu', label: template.name, hint: `${template.group} · tạo list`, run: () => setDrawerTemplate(template) })),
    ...lists.map(list => ({ id: `l-${list.id}`, group: 'List', label: list.name, hint: `${list.pages.length} trang`, run: () => openList(list.id) })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [lists, dirty, activeListId]);

  const runningCount = jobs.filter(job => job.status === 'running' || job.status === 'queued').length;
  const failedCount = jobs.filter(job => job.status === 'failed').length;
  const reviewCount = lists.filter(list => list.status !== 'exported').length;

  return (
    <MotionConfig reducedMotion="user">
      <main className={s.root} data-theme={theme} style={{ visibility: ready ? 'visible' : 'hidden' }}>
        <aside className={s.sidebar}>
          <div className={s.brand}><b>ĐL</b><span>Dalat Studio<small>Prototype giao diện mới</small></span></div>
          <nav className={s.nav} aria-label="Điều hướng chính">{NAV.map(item => (
            <button key={item.id} type="button" aria-label={item.id === 'review' && reviewCount ? `${item.label} (${reviewCount} chờ)` : item.label} aria-current={view === item.id ? 'page' : undefined} onClick={() => go(item.id)}>
              {view === item.id ? <motion.span layoutId="proto-nav" className={s.navPill} transition={{ type: 'spring', duration: .5, bounce: .2 }} /> : null}
              <Icon name={item.icon} /><span>{item.label}</span>
              {item.id === 'review' && reviewCount ? <small className={s.navCount}>{reviewCount}</small> : null}
            </button>
          ))}</nav>
          <div className={s.sidebarFoot}>
            <button type="button" aria-label="Tìm nhanh (Ctrl K)" className={s.paletteHint} onClick={() => setPaletteOpen(true)}><Icon name="search" size={16} /><span>Tìm nhanh</span><kbd>Ctrl K</kbd></button>
            <button type="button" aria-label="Cài đặt" aria-current={view === 'settings' ? 'page' : undefined} className={s.footButton} onClick={() => go('settings')}><Icon name="settings" size={16} /> Cài đặt</button>
            <a className={s.backLink} href="/">← Về tool hiện tại</a>
          </div>
        </aside>

        <section className={s.workspace}>
          <header className={s.topbar}>
            <p className={s.protoBadge}>Prototype GĐ0 · dữ liệu minh họa · không ghi vào tool thật</p>
            <div className={s.topActions}>
              <button type="button" className={s.iconButton} aria-label="Đổi giao diện sáng tối" onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
              <button type="button" className={`${s.iconButton} ${s.bell}`} aria-label={`Tác vụ: ${runningCount} đang chạy`} aria-expanded={taskOpen} onClick={() => setTaskOpen(open => !open)}>
                <Icon name="bell" />{runningCount ? <motion.b key={runningCount} initial={{ scale: .4 }} animate={{ scale: 1 }}>{runningCount}</motion.b> : failedCount ? <i aria-hidden="true" /> : null}
              </button>
            </div>
            <TaskCenter open={taskOpen} jobs={jobs} onClose={() => setTaskOpen(false)}
              onCancel={id => setJobs(previous => previous.map(job => (job.id === id ? { ...job, status: 'cancelled', finishedAt: Date.now() } : job)))}
              onRetry={id => setJobs(previous => previous.map(job => (job.id === id ? { ...job, status: 'queued', progress: 0, fail: false, detail: '' } : job)))}
              onClear={() => setJobs(previous => previous.filter(job => ['queued', 'running'].includes(job.status)))} />
          </header>

          <div className={s.content}>
            {view === 'today' ? <TodayView lists={lists} schedules={schedules} jobs={jobs} recent={recent} onOpenList={openList} onOpenReview={() => go('review')}
              onPickTemplate={template => (template ? setDrawerTemplate(template) : go('create'))}
              onRetryJob={id => setJobs(previous => previous.map(job => (job.id === id ? { ...job, status: 'queued', progress: 0, detail: '' } : job)))} /> : null}
            {view === 'create' ? <CreateView pinned={pinned} recent={recent} onOpen={setDrawerTemplate}
              onTogglePin={id => setPinned(previous => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; })} /> : null}
            {view === 'review' ? <ReviewView lists={lists} activeListId={activeListId} pages={pages} dirty={dirty} selection={selection} setSelection={setSelection} focusRequest={focusRequest}
              onOpenList={openList} onSave={saveDraft} onDiscard={discardDraft} onExport={startExport}
              onField={(pageIndex, path, value) => setDrafts(previous => {
                const base = previous[activeListId] || activeList.pages;
                return { ...previous, [activeListId]: base.map((page, index) => (index === pageIndex ? setPath(page, path, value) : page)) };
              })} /> : null}
            {view === 'auto' ? <AutomationView schedules={schedules}
              onToggle={id => setSchedules(previous => previous.map(schedule => (schedule.id === id ? { ...schedule, enabled: !schedule.enabled } : schedule)))}
              onRunNow={schedule => { queueJob({ kind: 'create', title: `Lịch “${schedule.name}” · tạo 3 list`, templateId: 'spotlight-v6', count: 3, speed: 5 }); toast('Đã xếp hàng chạy lịch. Theo dõi ở 🔔.'); }}
              onNew={() => toast('Bản thật: mở ngăn kéo tạo lịch giống ngăn kéo tạo list.')} /> : null}
            {view === 'settings' ? <SettingsView onSync={source => { queueJob({ kind: 'sync', title: `Cập nhật nguồn ${source.label}`, sourceLabel: source.label, speed: 7 }); toast(`Đang cập nhật ${source.label} · theo dõi ở 🔔.`); }} /> : null}
          </div>
        </section>

        <CreateDrawer template={drawerTemplate} onClose={() => setDrawerTemplate(null)} onCreate={(template, count) => {
          queueJob({ kind: 'create', title: `Tạo ${count} list · ${template.name}`, templateId: template.id, count, speed: Math.max(2, 12 / count) });
          setRecent(previous => [template.id, ...previous.filter(id => id !== template.id)].slice(0, 6));
          setDrawerTemplate(null);
          toast(`Đã xếp hàng tạo ${count} list. Bạn có thể làm việc khác trong lúc chờ.`);
        }} />
        <CommandPalette open={paletteOpen} entries={paletteEntries} onClose={() => setPaletteOpen(false)} />
        <ConfirmDialog request={confirm} onAnswer={answer} />
        <Toasts toasts={toasts} onDismiss={id => setToasts(previous => previous.filter(entry => entry.id !== id))} />
      </main>
    </MotionConfig>
  );
}
