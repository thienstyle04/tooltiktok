'use client';

import { useMemo } from 'react';
import { motion } from 'motion/react';
import Icon from '../ui/Icon';
import SlideThumb from './SlideThumb';
import { StatusChip } from './ReviewView';
import { collectLists } from '../../lib/listStatus.mjs';
import { creatableDecks } from '../ui/deckGroups';
import { listIsMain } from '../../lib/utils';

const ACTIVE_RUN = new Set(['queued', 'refreshing', 'warming', 'generating', 'awaiting-export', 'exporting']);
const vnTime = value => {
  try { return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); } catch { return ''; }
};

// Hôm nay: list chờ duyệt, lịch sắp chạy, việc cần chú ý và lối tắt tới mẫu dùng gần đây.
export default function TodayView({ studio, recent, onOpenList, onGoReview, onGoCreate, onOpenTemplate, onOpenTasks }) {
  const { dataset, automationState, driveCacheStatus } = studio;
  const entries = useMemo(() => collectLists(dataset), [dataset]);
  const waiting = entries.filter(entry => entry.status !== 'exported');
  const count = status => entries.filter(entry => entry.status === status).length;
  const nextSchedule = (automationState.schedules || []).filter(schedule => schedule.enabled && schedule.nextRunAt)
    .sort((a, b) => Date.parse(a.nextRunAt) - Date.parse(b.nextRunAt))[0];
  const failedRuns = (automationState.runs || []).filter(run => ['failed', 'partial', 'interrupted'].includes(run.status)).slice(0, 3);
  const activeRun = (automationState.runs || []).find(run => ACTIVE_RUN.has(run.status));
  const decks = creatableDecks(dataset);
  const recentDecks = recent.map(id => decks.find(deck => deck.id === id)).filter(Boolean).slice(0, 3);
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const coverImageUrls = dataset?.source?.coverImageUrls || [];
  // Dữ liệu chưa tải xong: không báo nhầm "đã duyệt hết".
  const loading = !dataset?.decks?.length;
  const stats = [
    ['Chờ duyệt', count('new'), 'list mới tạo'],
    ['Đã sửa', count('edited'), 'chờ xuất lại'],
    ['Đã xuất', count('exported'), 'còn lưu trong tool'],
    ['Lịch kế tiếp', nextSchedule ? vnTime(nextSchedule.nextRunAt) : '—', nextSchedule?.name || 'Không có lịch bật'],
  ];

  return (
    <div className="v2-view-stack">
      <section className="v2-hero">
        <div><p className="v2-eyebrow">Hôm nay · {dataset?.source?.destinationLabel || 'Studio'}</p><h1>{greeting}</h1>
          <p>{loading ? 'Đang tải dữ liệu…' : waiting.length ? <>Có <b>{waiting.length} list</b> đang chờ duyệt hoặc xuất.</> : 'Không còn list nào chờ duyệt.'}</p></div>
        <div className="v2-hero-actions">
          <button type="button" className="toolbar-button primary" onClick={onGoReview}><Icon name="review" size={16} /> Duyệt & xuất</button>
          <button type="button" className="toolbar-button" onClick={onGoCreate}><Icon name="plus" size={16} /> Tạo list mới</button>
        </div>
      </section>
      <div className="v2-stat-grid">{stats.map(([label, value, hint], index) => (
        <motion.article key={label} className="v2-stat" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
          <span>{label}</span><strong>{loading && index < 3 ? '…' : value}</strong><small>{hint}</small>
        </motion.article>
      ))}</div>
      <div className="v2-today-grid">
        <section className="v2-panel">
          <header className="v2-panel-head"><h2>Tiếp tục duyệt</h2><button type="button" className="v2-link" onClick={onGoReview}>Xem tất cả →</button></header>
          {waiting.slice(0, 5).map(entry => (
            <button key={entry.list.id} type="button" className="v2-row" onClick={() => onOpenList(entry)}>
              <SlideThumb list={entry.list} page={entry.list.pages?.[0]} width={42} coverImageUrls={coverImageUrls} />
              <span className="v2-row-copy"><strong>{entry.list.navTitle || entry.list.title}</strong><small>{entry.deck.navTitle} · {entry.list.pages?.length || 0} trang</small></span>
              <StatusChip status={entry.status} />
            </button>
          ))}
          {!waiting.length ? <p className="v2-muted">{loading ? 'Đang tải danh sách list…' : 'Đã duyệt hết. Tạo list mới để có bài cho ngày mai.'}</p> : null}
        </section>
        <div className="v2-view-stack">
          <section className="v2-panel">
            <header className="v2-panel-head"><h2>Mẫu dùng gần đây</h2><button type="button" className="v2-link" onClick={onGoCreate}>Thư viện mẫu →</button></header>
            {recentDecks.length ? <div className="v2-recent">{recentDecks.map(deck => {
              const list = (deck.lists || []).find(item => listIsMain(item)) || deck.lists?.[0];
              return <button key={deck.id} type="button" className="v2-recent-card" onClick={() => onOpenTemplate(deck)}>
                {list?.pages?.[0] ? <SlideThumb list={list} page={list.pages[0]} width={96} coverImageUrls={coverImageUrls} /> : <span className="v2-thumb v2-thumb-placeholder" />}
                <strong>{deck.navTitle}</strong><small>Tạo tiếp →</small>
              </button>;
            })}</div> : <p className="v2-muted">Mẫu bạn tạo list sẽ hiện ở đây để tạo tiếp nhanh.</p>}
          </section>
          <section className="v2-panel">
            <header className="v2-panel-head"><h2>Cần chú ý</h2><button type="button" className="v2-link" onClick={onOpenTasks}>Tác vụ →</button></header>
            {!driveCacheStatus.ready ? <div className="v2-alert" data-tone="info"><Icon name="sync" /><span><strong>Đang chuẩn bị ảnh</strong><small>{driveCacheStatus.message}</small></span></div> : null}
            {driveCacheStatus.ready && driveCacheStatus.syncWarning ? <div className="v2-alert"><Icon name="alert" /><span><strong>Cảnh báo đồng bộ</strong><small>{driveCacheStatus.syncWarning}</small></span></div> : null}
            {activeRun ? <div className="v2-alert" data-tone="info"><Icon name="auto" /><span><strong>Đang chạy lịch “{activeRun.scheduleName}”</strong><small>{activeRun.phase}</small></span></div> : null}
            {failedRuns.map(run => <div key={run.id} className="v2-alert"><Icon name="alert" /><span><strong>Lịch “{run.scheduleName}” chưa hoàn tất</strong><small>{run.phase}</small></span></div>)}
            {nextSchedule ? <div className="v2-alert" data-tone="info"><Icon name="auto" /><span><strong>{nextSchedule.name}</strong><small>Chạy {vnTime(nextSchedule.nextRunAt)} · {(nextSchedule.templates || []).length} mẫu</small></span></div> : null}
            {driveCacheStatus.ready && !driveCacheStatus.syncWarning && !activeRun && !failedRuns.length && !nextSchedule ? <p className="v2-muted">Mọi thứ đều ổn.</p> : null}
          </section>
        </div>
      </div>
    </div>
  );
}
