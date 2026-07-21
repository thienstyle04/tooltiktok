export async function apiFetch(path, init = {}) {
  let sameOriginResponse = null;
  let sameOriginError = null;
  const canFallback = shouldTryBackendFallback(path);

  try {
    sameOriginResponse = await fetch(path, init);
    if (!canFallback || !shouldFallbackResponse(sameOriginResponse)) {
      return sameOriginResponse;
    }
  } catch (error) {
    sameOriginError = error;
    if (!canFallback) throw error;
  }

  for (const backendOrigin of getBackendOrigins()) {
    try {
      return await fetch(toBackendUrl(path, backendOrigin), init);
    } catch {
      // Try the next likely origin. The same-origin proxy response below keeps
      // the useful backend error payload when every direct fallback fails.
    }
  }

  if (sameOriginResponse) return sameOriginResponse;
  throw sameOriginError || new Error('Không kết nối được backend.');
}

function shouldTryBackendFallback(path) {
  return typeof window !== 'undefined' && String(path || '').startsWith('/api/');
}

function shouldFallbackResponse(response) {
  // Không fallback 404: Nest trả 404 JSON là lỗi nghiệp vụ thật (list/deck thiếu),
  // không phải proxy miss. Fallback khiến UI hiện lỗi rối khi xóa list đã mất.
  return [500, 502, 503, 504].includes(Number(response?.status));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchGuideDataset(endpoint, init = {}, attempts = 3) {
  let lastResponse = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await apiFetch(endpoint, init);
    lastResponse = response;
    if (response.ok) return response;
    const retryable = [500, 502, 503, 504].includes(response.status);
    if (!retryable || attempt >= attempts - 1) return response;
    await sleep(1200 * (attempt + 1));
  }
  return lastResponse;
}

export async function formatApiError(response, prefix = 'Yêu cầu thất bại') {
  const detail = await readApiErrorMessage(response);
  return `${prefix}: ${detail}`;
}

async function readApiErrorMessage(response) {
  try {
    const payload = await response.clone().json();
    const message = String(payload?.message || payload?.error || '').trim();
    if (message) return message;
  } catch {
    // Ignore non-JSON error bodies.
  }
  return `HTTP ${response.status}`;
}

function toBackendUrl(path, origin) {
  return new URL(path, origin).toString();
}

function getBackendOrigins() {
  const origins = [
    process.env.NEXT_PUBLIC_BACKEND_ORIGIN,
    getBrowserHostBackendOrigin(),
    'http://127.0.0.1:3000',
    'http://localhost:3000',
  ];
  const seen = new Set();
  return origins
    .map((origin) => String(origin || '').trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .filter((origin) => {
      if (seen.has(origin)) return false;
      seen.add(origin);
      return true;
    });
}

function getBrowserHostBackendOrigin() {
  if (typeof window === 'undefined' || !window.location?.hostname) return '';
  return `${window.location.protocol}//${window.location.hostname}:3000`;
}
