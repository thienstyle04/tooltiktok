'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import s from './prototype.module.css';
import FakeSlide from './FakeSlide';
import { Icon } from './parts';
import { GROUPS, PARTNERS, SOURCES, STATUS_LABEL, TEMPLATES, buildPages, timeAgo } from './data';

const SAMPLE_PAGES = Object.fromEntries(TEMPLATES.map(template => [template.id, buildPages(template, 0)]));
export const templateById = id => TEMPLATES.find(template => template.id === id);

export function StatusChip({ status }) {
  return <span className={s.statusChip} data-status={status}>{STATUS_LABEL[status]}</span>;
}

/* ---------------- Hôm nay ---------------- */
export function TodayView({ lists, schedules, jobs, recent, onOpenList, onOpenReview, onPickTemplate, onRetryJob }) {
  const waiting = lists.filter(list => list.status !== 'exported');
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const failed = jobs.filter(job => job.status === 'failed');
  const stats = [
    ['Chờ duyệt', lists.filter(list => list.status === 'new').length, 'list mới tạo'],
    ['Đã sửa', lists.filter(list => list.status === 'edited').length, 'chờ xuất'],
    ['Đã xuất', lists.filter(list => list.status === 'exported').length, 'trong tuần'],
    ['Lịch kế tiếp', schedules.find(schedule => schedule.enabled)?.time || '—', schedules.find(schedule => schedule.enabled)?.name || 'Không có lịch bật'],
  ];
  return (
    <div className={s.viewStack}>
      <section className={s.hero}>
        <div><p className={s.eyebrow}>Hôm nay</p><h1>{greeting} 👋</h1><p>Có <b>{waiting.length} list</b> đang chờ bạn duyệt hoặc xuất.</p></div>
        <div className={s.heroActions}><button type="button" className={s.primary} onClick={onOpenReview}><Icon name="review" /> Duyệt ngay</button><button type="button" onClick={() => onPickTemplate(null)}><Icon name="plus" /> Tạo list mới</button></div>
      </section>
      <div className={s.statGrid}>{stats.map(([label, value, hint], index) => (
        <motion.article key={label} className={s.statCard} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .05 }}>
          <span>{label}</span><strong>{value}</strong><small>{hint}</small>
        </motion.article>
      ))}</div>
      <div className={s.todayGrid}>
        <section className={s.panel}>
          <header className={s.panelHead}><h2>Tiếp tục duyệt</h2><button type="button" className={s.linkButton} onClick={onOpenReview}>Xem tất cả →</button></header>
          {waiting.slice(0, 4).map(list => {
            const template = templateById(list.templateId);
            return <button key={list.id} type="button" className={s.queueRow} onClick={() => onOpenList(list.id)}>
              <span className={s.queueThumb}><FakeSlide template={template} page={list.pages[0]} /></span>
              <span className={s.queueCopy}><strong>{list.name}</strong><small>{list.pages.length} trang · {timeAgo(list.createdAt)}</small></span>
              <StatusChip status={list.status} />
            </button>;
          })}
          {!waiting.length ? <p className={s.taskEmpty}>Đã duyệt hết. Tạo list mới để có bài cho ngày mai.</p> : null}
        </section>
        <div className={s.viewStack}>
          <section className={s.panel}>
            <header className={s.panelHead}><h2>Mẫu dùng gần đây</h2></header>
            <div className={s.recentRow}>{recent.slice(0, 3).map(id => {
              const template = templateById(id);
              return <button key={id} type="button" className={s.recentCard} onClick={() => onPickTemplate(template)}>
                <span className={s.recentThumb}><FakeSlide template={template} page={SAMPLE_PAGES[id][0]} /></span><strong>{template.name}</strong><small>Tạo tiếp →</small>
              </button>;
            })}</div>
          </section>
          <section className={s.panel}>
            <header className={s.panelHead}><h2>Cần chú ý</h2></header>
            {failed.length ? failed.map(job => <div key={job.id} className={s.alertRow}><Icon name="alert" /><span><strong>{job.title}</strong><small>{job.detail}</small></span><button type="button" onClick={() => onRetryJob(job.id)}>Thử lại</button></div>)
              : <p className={s.taskEmpty}>Mọi tác vụ đều ổn.</p>}
            {schedules.filter(schedule => schedule.enabled).map(schedule => <div key={schedule.id} className={s.alertRow} data-tone="info"><Icon name="auto" /><span><strong>{schedule.name}</strong><small>Chạy {schedule.next} · {schedule.templates.join(', ')}</small></span></div>)}
          </section>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Tạo ---------------- */
function TemplateCard({ template, pinned, onTogglePin, onOpen }) {
  const pages = SAMPLE_PAGES[template.id];
  return (
    <motion.article layout className={s.templateCard} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} whileHover="hover">
      <button type="button" className={s.templateOpen} onClick={() => onOpen(template)} aria-label={`Tạo list từ mẫu ${template.name}`}>
        <span className={s.fan}>{[2, 1, 0].map(index => (
          <motion.span key={index} className={s.fanSlide} style={{ zIndex: 3 - index }}
            variants={{ hover: { x: (1 - index) * 48, rotate: (1 - index) * 6, y: index === 0 ? -6 : 0 } }}
            initial={{ x: -index * 10, rotate: -index * 4 }} transition={{ type: 'spring', duration: .5, bounce: .25 }}>
            <FakeSlide template={template} page={pages[Math.min(index, pages.length - 1)]} index={index} />
          </motion.span>
        ))}</span>
      </button>
      <div className={s.templateMeta}>
        <div><strong>{template.name}</strong><small>{template.group} · {template.ratio} · {template.pageCount} trang</small></div>
        <button type="button" className={`${s.iconButton} ${pinned ? s.pinned : ''}`} aria-pressed={pinned} aria-label={pinned ? `Bỏ ghim ${template.name}` : `Ghim ${template.name}`} onClick={() => onTogglePin(template.id)}><Icon name="star" /></button>
      </div>
    </motion.article>
  );
}

export function CreateView({ pinned, recent, onTogglePin, onOpen }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const fold = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const searched = TEMPLATES.filter(template => fold(`${template.name} ${template.group}`).includes(fold(query)));
  const shown = searched.filter(template => !group || template.group === group);
  const sections = [
    ['Đã ghim', shown.filter(template => pinned.has(template.id))],
    ['Dùng gần đây', recent.map(templateById).filter(template => shown.includes(template) && !pinned.has(template.id))],
    ['Tất cả mẫu', shown],
  ].filter(([, items]) => items.length);
  return (
    <div className={s.viewStack}>
      <header className={s.viewHead}><div><p className={s.eyebrow}>Tạo</p><h1>Chọn mẫu để tạo list</h1><p>Rê chuột lên mẫu để xem 3 slide đầu. Bấm vào mẫu để cấu hình và tạo.</p></div></header>
      <div className={s.filterBar}>
        <label className={s.searchBox}><Icon name="search" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm mẫu…" aria-label="Tìm mẫu" /></label>
        <div className={s.chips} role="group" aria-label="Nhóm mẫu">{['', ...GROUPS].map(value => {
          const count = searched.filter(template => !value || template.group === value).length;
          return <button key={value || 'all'} type="button" aria-pressed={group === value} disabled={!count && group !== value} onClick={() => setGroup(value)}>
            {group === value ? <motion.span layoutId="proto-chip" className={s.chipPill} transition={{ type: 'spring', duration: .45, bounce: .2 }} /> : null}
            <span>{value || 'Tất cả'}</span><small>{count}</small>
          </button>;
        })}</div>
      </div>
      {sections.map(([title, items]) => (
        <section key={title}>
          <h2 className={s.sectionTitle}>{title} <small>{items.length}</small></h2>
          <div className={s.templateGrid}>{items.map(template => <TemplateCard key={`${title}-${template.id}`} template={template} pinned={pinned.has(template.id)} onTogglePin={onTogglePin} onOpen={onOpen} />)}</div>
        </section>
      ))}
      {!shown.length ? <div className={s.empty}><Icon name="search" size={26} /><strong>Không tìm thấy mẫu</strong><button type="button" onClick={() => { setQuery(''); setGroup(''); }}>Xóa bộ lọc</button></div> : null}
    </div>
  );
}

const PHOTO_PRESETS = [['Ảnh gốc', '#9aa59b'], ['Ấm', '#e3a06b'], ['Lạnh', '#7fa6c9'], ['Film', '#b9a27c']];

export function CreateDrawer({ template, onClose, onCreate }) {
  const [count, setCount] = useState(3);
  const [partners, setPartners] = useState([]);
  const [preset, setPreset] = useState('Ảnh gốc');
  const [hook, setHook] = useState('Hook thường');
  const pages = useMemo(() => (template ? SAMPLE_PAGES[template.id] : []), [template]);
  return (
    <AnimatePresence>
      {template ? (
        <motion.div className={s.drawerBackdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={event => event.target === event.currentTarget && onClose()}>
          <motion.aside className={s.drawer} role="dialog" aria-modal="true" aria-labelledby="proto-drawer-title"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', duration: .5, bounce: .12 }}
            onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
            <header className={s.drawerHead}>
              <div><p className={s.eyebrow}>{template.group} · {template.ratio}</p><h2 id="proto-drawer-title">{template.name}</h2><p>{template.description}</p></div>
              <button type="button" className={s.iconButton} aria-label="Đóng" onClick={onClose}><Icon name="close" /></button>
            </header>
            <div className={s.drawerStrip}>{pages.slice(0, 4).map((page, index) => <span key={index}><FakeSlide template={template} page={page} index={index} /></span>)}</div>
            <div className={s.drawerBody}>
              <label className={s.field}><span>Số list</span>
                <span className={s.stepper}><button type="button" aria-label="Bớt 1 list" disabled={count <= 1} onClick={() => setCount(c => c - 1)}>−</button><output>{count}</output><button type="button" aria-label="Thêm 1 list" disabled={count >= 10} onClick={() => setCount(c => c + 1)}>+</button></span>
              </label>
              <div className={s.field}><span>Đối tác bắt buộc <small>không chọn thì tool tự xoay vòng</small></span>
                <div className={s.chips}>{PARTNERS.map(name => {
                  const on = partners.includes(name);
                  return <button key={name} type="button" aria-pressed={on} className={on ? s.chipOn : ''} onClick={() => setPartners(list => on ? list.filter(item => item !== name) : [...list, name])}>{on ? '✓ ' : ''}{name}</button>;
                })}</div>
              </div>
              {template.style !== 'note' ? <div className={s.field}><span>Màu ảnh</span>
                <div className={s.swatches}>{PHOTO_PRESETS.map(([label, color]) => <button key={label} type="button" aria-pressed={preset === label} onClick={() => setPreset(label)}><i style={{ background: color }} />{label}</button>)}</div>
              </div> : null}
              <label className={s.field}><span>Hook cover</span><select value={hook} onChange={event => setHook(event.target.value)}><option>Hook thường</option><option>Hook lễ 30/4</option></select></label>
              <details className={s.more}><summary>Caption tùy chọn</summary><label className={s.field}><span>Caption đăng bài</span><textarea rows={3} placeholder="Để trống, AI sẽ gợi ý theo mẫu…" /></label></details>
            </div>
            <footer className={s.drawerFoot}>
              <small>{count} list × {template.pageCount} trang = {count * template.pageCount} trang · chạy nền, theo dõi ở 🔔</small>
              <button type="button" onClick={onClose}>Hủy</button>
              <button type="button" className={s.primary} onClick={() => onCreate(template, count)}>Tạo {count} list</button>
            </footer>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ---------------- Tự động ---------------- */
export function AutomationView({ schedules, onToggle, onRunNow, onNew }) {
  return (
    <div className={s.viewStack}>
      <header className={s.viewHead}><div><p className={s.eyebrow}>Tự động</p><h1>Lịch tạo & xuất</h1><p>Tool cần đang mở. Các lịch chạy lần lượt theo giờ Việt Nam.</p></div><button type="button" className={s.primary} onClick={onNew}><Icon name="plus" /> Tạo lịch</button></header>
      <div className={s.scheduleGrid}>{schedules.map(schedule => (
        <article key={schedule.id} className={s.scheduleCard} data-enabled={schedule.enabled}>
          <header><div><strong>{schedule.name}</strong><small>{schedule.repeat} · {schedule.time}</small></div>
            <button type="button" role="switch" aria-checked={schedule.enabled} aria-label={`Bật lịch ${schedule.name}`} className={s.switch} onClick={() => onToggle(schedule.id)}><motion.span layout transition={{ type: 'spring', duration: .35, bounce: .3 }} /></button>
          </header>
          <div className={s.chipsStatic}>{schedule.templates.map(item => <span key={item}>{item}</span>)}</div>
          <footer><span><Icon name="auto" size={15} /> {schedule.enabled ? `Lần tới: ${schedule.next}` : 'Đang tắt'}</span><button type="button" onClick={() => onRunNow(schedule)}>Chạy ngay</button></footer>
        </article>
      ))}</div>
    </div>
  );
}

/* ---------------- Cài đặt ---------------- */
export function SettingsView({ onSync }) {
  const [tab, setTab] = useState('sources');
  const [active, setActive] = useState('dalat');
  return (
    <div className={s.viewStack}>
      <header className={s.viewHead}><div><p className={s.eyebrow}>Cài đặt</p><h1>Nguồn dữ liệu & nâng cao</h1><p>Việc hằng ngày ở tab đầu; key AI, cache và Hook nằm trong Nâng cao.</p></div></header>
      <div className={s.segmented} role="tablist">{[['sources', 'Nguồn dữ liệu'], ['advanced', 'Nâng cao']].map(([id, label]) => (
        <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{tab === id ? <motion.span layoutId="proto-settings-tab" className={s.chipPill} /> : null}<span>{label}</span></button>
      ))}</div>
      {tab === 'sources' ? <div className={s.sourceGrid}>{SOURCES.map(source => (
        <article key={source.id} className={s.sourceCard} data-active={active === source.id}>
          <header><span className={s.sourceBadge}>{source.label.slice(0, 2).toUpperCase()}</span><div><strong>{source.label}</strong><small>{source.count} địa điểm · {source.kind}</small></div>{active === source.id ? <span className={s.statusChip} data-status="edited">Đang dùng</span> : null}</header>
          <small>Đồng bộ lần cuối: {source.synced}</small>
          <footer>{active !== source.id ? <button type="button" onClick={() => setActive(source.id)}>Dùng nguồn này</button> : null}<button type="button" onClick={() => onSync(source)}><Icon name="sync" size={15} /> Cập nhật ngay</button></footer>
        </article>
      ))}<article className={`${s.sourceCard} ${s.sourceAdd}`}><Icon name="plus" size={24} /><strong>Thêm nguồn</strong><small>Link Google Sheet hoặc file XLSX</small></article></div>
        : <div className={s.sourceGrid}>
          <article className={s.sourceCard}><strong>Nhà cung cấp AI</strong><small>Gemini · gemini-3.1-flash-lite · key đã lưu mã hóa</small><footer><button type="button">Đổi model</button><button type="button">Kiểm tra kết nối</button></footer></article>
          <article className={s.sourceCard}><strong>Cache ảnh Google Drive</strong><small>2517/2517 ảnh · 100%</small><div className={s.taskBar}><span style={{ width: '100%' }} /></div></article>
          <article className={s.sourceCard}><strong>Hook lễ</strong><small>Chưa có bộ Hook lễ. Thêm bằng link Google Docs hoặc file DOCX/TXT.</small><footer><button type="button">Thêm bộ Hook</button></footer></article>
        </div>}
    </div>
  );
}
