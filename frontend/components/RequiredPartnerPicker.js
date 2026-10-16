'use client';
import { useId, useMemo, useRef, useState } from 'react';
import { MAX_REQUIRED_PARTNERS, partnerKey, partnerOptions, sectionLabel } from '../lib/requiredPartners.mjs';

// Chọn đối tác phải có mặt trong mọi list tạo ra. Các ô đối tác còn lại tool vẫn
// tự xoay vòng; backend chặn và báo lỗi nếu mẫu không xếp được đối tác đã chọn.
// `eligibility` (nếu có) là kết quả chạy thử builder của mẫu: chỉ đối tác hiển
// thị được trong mẫu mới chọn được, phần còn lại gom riêng kèm lý do.
export default function RequiredPartnerPicker({ partners, value, onChange, disabled, unavailableNote = '', compact = false, eligibility, onOpen }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const pickerId = useId();
  const triggerRef = useRef(null);
  const options = useMemo(() => partnerOptions(partners), [partners]);
  const verdicts = useMemo(() => new Map((eligibility?.status === 'ready' ? eligibility.data?.partners || [] : [])
    .map(entry => [partnerKey(entry.name), entry])), [eligibility]);
  const checking = eligibility?.status === 'loading';
  const ready = eligibility?.status === 'ready';
  const usable = option => !ready || verdicts.get(option.key)?.eligible !== false;
  const selected = Array.isArray(value) ? value : [];
  const selectedKeys = new Set(selected.map(partnerKey));
  const known = new Set(options.map(option => option.key));
  const needle = query.trim().toLocaleLowerCase('vi');
  const filtered = options.filter(option => !needle || [option.name, option.address, ...option.sections.map(sectionLabel)]
    .join(' ').toLocaleLowerCase('vi').includes(needle));
  const available = filtered.filter(usable), unavailable = filtered.filter(option => !usable(option));
  const full = selected.length >= MAX_REQUIRED_PARTNERS;
  const toggle = option => onChange(selectedKeys.has(option.key)
    ? selected.filter(name => partnerKey(name) !== option.key)
    : full ? selected : [...selected, option.name]);
  const remove = name => onChange(selected.filter(item => partnerKey(item) !== partnerKey(name)));
  const close = () => { setOpen(false); setQuery(''); triggerRef.current?.focus(); };
  const label = selected.length ? `${selected.length} đối tác bắt buộc` : 'Tự động (không bắt buộc)';
  const row = (option, enabled) => {
    const checked = selectedKeys.has(option.key);
    const reason = verdicts.get(option.key)?.reason;
    return <label key={option.key} className={(checked ? 'selected' : '') + (enabled ? '' : ' unavailable')}>
      <input type="checkbox" checked={checked} disabled={checking || (!checked && (full || !enabled))} onChange={() => toggle(option)} />
      <span><strong>{option.name}</strong><small>{option.sections.map(sectionLabel).join(' / ')}{option.address ? ` · ${option.address}` : ''}</small>
        {!enabled && reason ? <small className="required-partner-reason">{reason}</small> : null}</span>
    </label>;
  };
  return <div className={'required-partner-picker' + (compact ? ' compact' : '')}
    onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); close(); } }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setQuery(''); } }}>
    <button ref={triggerRef} type="button" className="required-partner-trigger" disabled={disabled}
      aria-expanded={open && !disabled} aria-controls={pickerId} onClick={() => { if (!open) onOpen?.(); setOpen(!open); }}>
      <span>Đối tác: {label}</span><span className="photo-preset-chevron" aria-hidden="true">{open && !disabled ? '−' : '+'}</span>
    </button>
    {selected.length ? <ul className="required-partner-chips" aria-label="Đối tác bắt buộc đã chọn">
      {selected.map(name => {
        const key = partnerKey(name), verdict = verdicts.get(key);
        const missing = options.length > 0 && !known.has(key), blocked = ready && verdict?.eligible === false;
        const note = missing ? 'không có trong nguồn' : blocked ? 'không hiển thị được trong mẫu này' : '';
        return <li key={key} className={note ? 'stale' : ''} title={note ? (blocked && verdict.reason ? verdict.reason : note) : undefined}>
          <span>{name}{note ? ` · ${note}` : ''}</span>
          <button type="button" disabled={disabled} aria-label={`Bỏ ${name}`} onClick={() => remove(name)}>×</button>
        </li>;
      })}
    </ul> : null}
    {open && !disabled ? <fieldset id={pickerId} className="required-partner-options">
      <legend>Đối tác phải có trong mọi list</legend>
      {unavailableNote ? <p className="required-partner-note">{unavailableNote}</p> : <>
        {checking ? <p className="required-partner-note" role="status">Đang kiểm tra đối tác hiển thị được trong mẫu này… Lần đầu có thể mất vài giây.</p> : null}
        {eligibility?.status === 'error' ? <p className="required-partner-note" role="status">Chưa kiểm tra được theo mẫu; tool vẫn kiểm tra lúc tạo list.</p> : null}
        {ready && eligibility.data?.error ? <p className="required-partner-note" role="alert">Mẫu chưa tạo được với dữ liệu hiện tại: {eligibility.data.error}</p> : null}
        <input type="search" placeholder="Tìm tên, nhóm hoặc địa chỉ…" value={query} aria-label="Tìm đối tác"
          onChange={event => setQuery(event.target.value)} />
        <div className="required-partner-list">
          {available.map(option => row(option, true))}
          {!available.length ? <p className="required-partner-note">{!options.length ? 'Chưa có đối tác có ảnh trong dữ liệu nguồn.'
            : ready && !needle ? 'Không có đối tác nào hiển thị được trong mẫu này.' : 'Không tìm thấy đối tác phù hợp.'}</p> : null}
          {unavailable.length ? <details className="required-partner-unavailable">
            <summary>Không hiển thị được trong mẫu này ({unavailable.length})</summary>
            {unavailable.map(option => row(option, false))}
          </details> : null}
        </div>
      </>}
      <div className="required-partner-footer">
        <p>Có mặt trong mọi list; ô đối tác còn lại tool tự xoay vòng. Mẫu không đủ ô sẽ báo lỗi, không tạo thiếu.{full ? ` Tối đa ${MAX_REQUIRED_PARTNERS} đối tác.` : ''}</p>
        {selected.length ? <button type="button" className="toolbar-button" onClick={() => onChange([])}>Bỏ chọn tất cả</button> : null}
      </div>
    </fieldset> : null}
  </div>;
}
