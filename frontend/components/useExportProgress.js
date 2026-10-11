import { useCallback, useEffect, useRef, useState } from 'react';

export default function useExportProgress() {
  const [progress, setProgress] = useState({ visible: false, failed: false, value: 0, label: '' });
  const timer = useRef(null);
  const running = useRef(false);
  const clearTimer = useCallback(() => { clearTimeout(timer.current); timer.current = null; }, []);
  useEffect(() => () => { running.current = false; clearTimer(); }, [clearTimer]);
  const showProgress = useCallback((label = 'Đang chuẩn bị xuất file...', value = 0) => {
    clearTimer(); running.current = true;
    setProgress({ visible: true, failed: false, value, label });
  }, [clearTimer]);
  const updateProgress = useCallback((value, label) => {
    if (!running.current) return;
    setProgress(previous => ({ ...previous, value: Math.max(0, Math.min(100, Number(value) || 0)), label: label || previous.label }));
  }, []);
  const completeProgress = useCallback((label = 'Đã xuất xong file.') => {
    clearTimer(); running.current = false;
    setProgress({ visible: true, failed: false, value: 100, label });
    timer.current = setTimeout(() => setProgress(previous => ({ ...previous, visible: false })), 1600);
  }, [clearTimer]);
  const failProgress = useCallback((label = 'Xuất file thất bại.') => {
    clearTimer(); running.current = false;
    setProgress({ visible: false, failed: true, value: 0, label });
  }, [clearTimer]);
  return { progress, showProgress, updateProgress, completeProgress, failProgress };
}
