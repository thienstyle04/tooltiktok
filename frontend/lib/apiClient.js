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
  return [404, 502, 503, 504].includes(Number(response?.status));
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
