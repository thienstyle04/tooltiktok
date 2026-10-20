import { useEffect, useRef } from 'react';

// Ô chọn file tiếng Việt thay cho nút gốc "Choose File / No file chosen" của trình duyệt.
// Input thật vẫn nằm trong DOM (ẩn bằng clip) để label, form validation và setInputFiles hoạt động.
export default function FilePicker({ file = null, buttonLabel = 'Chọn file', emptyLabel = 'Chưa chọn file', className = '', ...inputProps }) {
  const input = useRef(null);
  // Cha bỏ file (ví dụ sau khi gửi xong) thì xóa cả input, để chọn lại đúng file đó vẫn phát sự kiện change.
  useEffect(() => { if (!file && input.current) input.current.value = ''; }, [file]);
  return (
    <span className={`ui-file-picker ${className}`.trim()} data-has-file={file ? 'true' : undefined} data-disabled={inputProps.disabled ? 'true' : undefined}>
      <input ref={input} type="file" className="ui-file-input" {...inputProps} />
      <span className="ui-file-button" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></svg>
        {buttonLabel}
      </span>
      <span className="ui-file-name" aria-hidden="true" title={file?.name || undefined}>{file ? file.name : emptyLabel}</span>
    </span>
  );
}
