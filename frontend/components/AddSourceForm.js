'use client';
// Form thêm nguồn dữ liệu, dùng ở Cài đặt và màn hình máy chưa có nguồn.
// Link Google Sheet không nằm trong tool: mỗi máy tự nhập link của mình.
import { useState } from 'react';

export const SOURCE_KIND_OPTIONS = [
  { value: 'standard', label: 'Thường', hint: 'Carousel, lịch trình, spotlight…' },
  { value: 'threads', label: 'Threads', hint: 'Chỉ mẫu Threads và Note' },
];

export default function AddSourceForm({ busy = false, onSubmit, submitLabel = 'Thêm và sử dụng' }) {
  const [mode, setMode] = useState('sheet');
  const [label, setLabel] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState('standard');
  const [dalatContent, setDalatContent] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const disabled = busy || adding;
  const ready = label.trim().length >= 2 && dalatContent !== null
    && (mode === 'sheet' ? Boolean(sheetUrl.trim()) : Boolean(file));

  const submit = async (event) => {
    event.preventDefault();
    if (!ready) return;
    setError('');
    setAdding(true);
    try {
      await onSubmit({
        label: label.trim(),
        sheetUrl: sheetUrl.trim(),
        file: mode === 'xlsx' ? file : null,
        kind,
        dalatContent: dalatContent === true,
      });
      setLabel('');
      setSheetUrl('');
      setFile(null);
      setDalatContent(null);
    } catch (submitError) {
      setError(submitError?.message || 'Không thể thêm nguồn dữ liệu.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <form className="settings-source-form add-source-form" onSubmit={submit}>
        <fieldset className="add-source-choice" disabled={disabled}>
          <legend>Lấy dữ liệu từ</legend>
          <label><input type="radio" name="add-source-mode" checked={mode === 'sheet'} onChange={() => setMode('sheet')} /> Link Google Sheet</label>
          <label><input type="radio" name="add-source-mode" checked={mode === 'xlsx'} onChange={() => setMode('xlsx')} /> File XLSX</label>
        </fieldset>
        <label>
          <span>Tên hiển thị</span>
          <input
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Ví dụ: Nha Trang"
            minLength={2}
            maxLength={60}
            disabled={disabled}
            required
          />
        </label>
        {mode === 'xlsx' ? (
          <label>
            <span>File XLSX</span>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={disabled}
              required
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>
        ) : null}
        <label>
          <span>{mode === 'sheet' ? 'Link Google Sheet' : 'Link Google Sheet dự phòng (tùy chọn)'}</span>
          <input
            type="url"
            value={sheetUrl}
            onChange={(event) => setSheetUrl(event.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            disabled={disabled}
            required={mode === 'sheet'}
          />
        </label>
        <fieldset className="add-source-choice" disabled={disabled}>
          <legend>Loại nguồn</legend>
          {SOURCE_KIND_OPTIONS.map((option) => (
            <label key={option.value} title={option.hint}>
              <input type="radio" name="add-source-kind" value={option.value} checked={kind === option.value} onChange={() => setKind(option.value)} />
              {' '}{option.label} <small>{option.hint}</small>
            </label>
          ))}
        </fieldset>
        <fieldset className="add-source-choice" disabled={disabled}>
          <legend>Nội dung về Đà Lạt?</legend>
          <label><input type="radio" name="add-source-dalat" checked={dalatContent === true} onChange={() => setDalatContent(true)} /> Có <small>mở chữ, hook và mẫu riêng Đà Lạt</small></label>
          <label><input type="radio" name="add-source-dalat" checked={dalatContent === false} onChange={() => setDalatContent(false)} /> Không <small>chỉ dùng mẫu chung</small></label>
        </fieldset>
        <button type="submit" className="toolbar-button primary settings-add-button" disabled={disabled || !ready}>
          {adding ? 'Đang kiểm tra dữ liệu...' : submitLabel}
        </button>
      </form>
      {error ? <p className="settings-form-error" role="alert">{error}</p> : null}
      <p className="settings-form-note">
        Sheet cần chia sẻ “Bất kỳ ai có đường liên kết đều có thể xem”. Sau khi thêm, tool tải dữ liệu và ảnh lần đầu rồi tự chuyển sang nguồn mới. File XLSX tối đa 20 MB.
      </p>
    </>
  );
}
