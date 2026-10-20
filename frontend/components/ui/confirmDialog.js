'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import useStudioDialog from '../useStudioDialog';

// Hộp xác nhận của studio thay cho window.confirm (kiểu spring-modal).
// studioConfirm() trả về Promise<boolean>. Khi chưa có ConfirmDialogHost (component chạy riêng lẻ),
// nó quay về window.confirm để hành vi cũ không đổi.
let openConfirm = null;

export function studioConfirm(options) {
  const request = typeof options === 'string' ? { message: options } : options;
  if (!openConfirm) return Promise.resolve(window.confirm(request.message));
  return new Promise(resolve => openConfirm({ ...request, resolve }));
}

export function ConfirmDialogHost() {
  const [request, setRequest] = useState(null);
  const pending = useRef(null);
  const titleId = useId(), messageId = useId();
  const finish = useCallback(result => {
    const current = pending.current;
    pending.current = null;
    setRequest(null);
    current?.resolve(result);
  }, []);
  useEffect(() => {
    openConfirm = next => {
      pending.current?.resolve(false);
      pending.current = next;
      setRequest(next);
    };
    return () => {
      openConfirm = null;
      pending.current?.resolve(false);
      pending.current = null;
    };
  }, []);
  const dialogRef = useStudioDialog(Boolean(request), () => finish(false));
  if (!request) return null;
  const danger = request.tone === 'danger';
  return (
    <div className="modal-overlay ui-confirm-overlay" data-studio-confirm onClick={event => event.target === event.currentTarget && finish(false)}>
      <div ref={dialogRef} className="modal-card ui-confirm-card" data-tone={request.tone || 'default'} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={messageId}>
        <span className="ui-confirm-icon" aria-hidden="true">{danger ? '!' : '?'}</span>
        <h3 id={titleId}>{request.title || 'Xác nhận thao tác'}</h3>
        <p id={messageId}>{request.message}</p>
        <div className="ui-confirm-actions">
          <button type="button" className="toolbar-button" onClick={() => finish(false)}>{request.cancelLabel || 'Hủy'}</button>
          <button type="button" className={`toolbar-button ${danger ? 'ui-danger-button' : 'primary'}`} onClick={() => finish(true)}>{request.confirmLabel || 'Đồng ý'}</button>
        </div>
      </div>
    </div>
  );
}
