'use client';

import { APP_VERSION } from './appVersion';
import { apiFetch } from './apiClient';

const SESSION_STORAGE_KEY = 'dalat-runtime-session-id';
const RELOAD_STORAGE_KEY = 'dalat-runtime-reload-target';

export async function verifyRuntimeSession(options = {}) {
  const healthResponse = await apiFetch('/api/health', { cache: 'no-store' });
  if (!healthResponse.ok) {
    throw runtimeError(`Không kiểm tra được phiên backend (HTTP ${healthResponse.status}). Frontend/backend có thể không đồng bộ.`);
  }
  const health = await healthResponse.json();
  if (!health?.sessionId) throw runtimeError('Backend không trả mã phiên. Có thể đang chạy backend cũ.');
  const frontendSession = healthResponse.headers.get('x-dalat-frontend-session');
  const frontendVersion = healthResponse.headers.get('x-dalat-frontend-version');
  if (frontendSession && frontendSession !== health.sessionId) {
    throw runtimeError('Frontend và backend đang thuộc hai phiên khác nhau. Hãy chạy lại start.bat.');
  }
  if (frontendVersion && frontendVersion !== APP_VERSION) {
    throw runtimeError(`Giao diện v${APP_VERSION} đang chạy qua proxy v${frontendVersion}. Hãy chạy lại start.bat.`);
  }
  if (health.appVersion && health.appVersion !== APP_VERSION) {
    throw runtimeError(`Frontend v${APP_VERSION} đang nối với backend v${health.appVersion}. Hãy chạy lại start.bat.`);
  }

  const previous = readStoredSession();
  storeSession(health.sessionId);
  if (previous && previous !== health.sessionId) {
    reloadForSession(health.sessionId);
    const error = runtimeError('Phiên tool đã thay đổi; giao diện đang tải lại bản mới.');
    error.runtimeReloading = true;
    throw error;
  }

  if (options.checkExportRoutes) await verifyExportRoutes(options.assetFileId);
  return health;
}

async function verifyExportRoutes(assetFileId = '') {
  const checks = [
    ['trạng thái cache Drive', () => apiFetch('/api/drive-cache/status', { cache: 'no-store' })],
    ['kiểm tra file cache', () => fetch('/api/drive-files/cache-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds: [] }),
      cache: 'no-store',
    })],
    ['chuẩn bị file cache', () => fetch('/api/drive-files/prefetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds: [] }),
      cache: 'no-store',
    })],
  ];
  for (const [label, request] of checks) {
    const response = await request();
    if (!response.ok) throw runtimeError(`${label} trả HTTP ${response.status}. Frontend/backend không đồng bộ; hãy chạy lại start.bat.`);
  }
  if (assetFileId) {
    const response = await fetch(`/assets/drive-file?id=${encodeURIComponent(assetFileId)}`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!response.ok) {
      throw runtimeError(`API ảnh Drive trả HTTP ${response.status}. Frontend/backend không đồng bộ; hãy chạy lại start.bat.`);
    }
  }
}

function readStoredSession() {
  if (typeof window === 'undefined') return '';
  try { return sessionStorage.getItem(SESSION_STORAGE_KEY) || ''; } catch { return ''; }
}

function storeSession(sessionId) {
  if (typeof window === 'undefined') return;
  try { sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId); } catch {}
}

function reloadForSession(sessionId) {
  if (typeof window === 'undefined') return;
  try {
    if (sessionStorage.getItem(RELOAD_STORAGE_KEY) === sessionId) return;
    sessionStorage.setItem(RELOAD_STORAGE_KEY, sessionId);
    const url = new URL(window.location.href);
    url.searchParams.set('runtimeSession', sessionId);
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

function runtimeError(message) {
  const error = new Error(message);
  error.runtimeSessionError = true;
  return error;
}
