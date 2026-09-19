import { useEffect, useId, useState } from 'react';

export default function FontSizeControl({ value, actualSizes = [], onChange, onReset, disabled = false }) {
  // Multi-size pages still need a visible numeric starting point. Use the
  // largest rendered size, without creating an override until the user edits.
  const measured = actualSizes.length ? Math.max(...actualSizes) : null;
  const displayed = value ?? measured ?? '';
  const id = useId();
  const [draft, setDraft] = useState(displayed);
  const [error, setError] = useState('');
  useEffect(() => { setDraft(displayed); setError(''); }, [displayed]);
  const valid = raw => raw !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 8 && Number(raw) <= 72 && Number(raw) * 2 === Math.round(Number(raw) * 2);
  const change = raw => {
    setDraft(raw);
    setError('');
  };
  const commit = () => {
    if (String(draft) === String(displayed)) return;
    if (valid(draft)) onChange(Number(draft));
    else { setDraft(displayed); setError('Nhập số từ 8 đến 72, bước 0,5 px. Đã giữ cỡ chữ trước đó.'); }
  };
  const step = delta => {
    const base = value ?? measured;
    if (base == null) return;
    const next = Math.max(8, Math.min(72, Math.round((base + delta) * 2) / 2));
    setDraft(next); setError(''); onChange(next);
  };
  return <section className="font-size-control" aria-label="Điều chỉnh cỡ chữ">
    <div className="font-size-control-heading">
      <label htmlFor={id}>Cỡ chữ</label>
      <button type="button" className="font-size-reset" disabled={disabled} onClick={() => { setDraft(''); setError(''); onReset(); }}>Theo mẫu</button>
    </div>
    <div className="font-size-stepper">
      <button type="button" aria-label="Giảm cỡ chữ 0,5 px" disabled={disabled || displayed === '' || Number(displayed) <= 8} onClick={() => step(-0.5)}>−</button>
      <div className="font-size-value">
        <input id={id} aria-describedby={`${id}-help ${id}-error`} aria-invalid={!!error} inputMode="decimal" type="number" min="8" max="72" step="0.5" placeholder="Theo mẫu" disabled={disabled} value={draft}
          onChange={event => change(event.target.value)} onBlur={commit}
          onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); commit(); }
            if (event.key === 'Escape') { event.preventDefault(); setDraft(displayed); setError(''); }
          }} />
        <span aria-hidden="true">px</span>
      </div>
      <button type="button" aria-label="Tăng cỡ chữ 0,5 px" disabled={disabled || displayed === '' || Number(displayed) >= 72} onClick={() => step(0.5)}>+</button>
    </div>
    <p id={`${id}-help`} className="font-size-help">Trang đang chọn · 8–72 px · bước 0,5<br />Nhập số rồi nhấn Enter hoặc rời ô để áp dụng.
      <br />Đang hiển thị: {actualSizes.length ? `${actualSizes.join(' / ')} px` : 'Chưa đo được chữ trên trang'}.
      {value == null ? <><br />{actualSizes.length > 1 ? 'Ô số hiển thị cỡ lớn nhất của trang. Khi chỉnh, tất cả chữ trên trang dùng cỡ đã chọn.' : 'Đang dùng cỡ chữ của mẫu.'}</> : null}
    </p>
    <p id={`${id}-error`} className="font-size-error" role="status">{error}</p>
  </section>;
}
