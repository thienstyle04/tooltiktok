'use client';

import { useCallback, useEffect, useState } from 'react';

// Dữ liệu tiện ích lưu trên máy này (localStorage): mẫu ghim, mẫu gần đây, lịch sử tác vụ.
// Không phải dữ liệu nghiệp vụ; mất đi chỉ làm danh sách trống lại.
function readJson(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; } catch { return fallback; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* chỉ dùng trong phiên */ }
}

function usePersistedArray(key, limit) {
  const [items, setItems] = useState([]);
  useEffect(() => { const stored = readJson(key, []); if (Array.isArray(stored)) setItems(stored.slice(0, limit)); }, [key, limit]);
  const update = useCallback(updater => setItems(previous => {
    const next = updater(previous).slice(0, limit);
    writeJson(key, next);
    return next;
  }), [key, limit]);
  return [items, update];
}

export function usePinnedTemplates() {
  const [pinned, update] = usePersistedArray('dalat-pinned-templates-v1', 40);
  const toggle = useCallback(id => update(previous => (previous.includes(id) ? previous.filter(item => item !== id) : [id, ...previous])), [update]);
  return [pinned, toggle];
}

export function useRecentTemplates() {
  const [recent, update] = usePersistedArray('dalat-recent-templates-v1', 8);
  const remember = useCallback(id => { if (id) update(previous => [id, ...previous.filter(item => item !== id)]); }, [update]);
  return [recent, remember];
}

export function useTaskHistory() {
  const [history, update] = usePersistedArray('dalat-task-history-v1', 20);
  const record = useCallback(entry => update(previous => [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), ...entry }, ...previous]), [update]);
  const clear = useCallback(() => update(() => []), [update]);
  return [history, record, clear];
}

export function timeAgo(value) {
  const time = Date.parse(value || '');
  if (!time) return '';
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60_000));
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} giờ trước` : `${Math.round(hours / 24)} ngày trước`;
}
