export async function apiFetch(path, init = {}) {
  let sameOriginResponse = null;
  let sameOriginError = null;

  try {
    sameOriginResponse = await fetch(path, init);
    if (sameOriginResponse.status !== 404 || !shouldTryBackendFallback(path)) {
      return sameOriginResponse;
    }
  } catch (error) {
    sameOriginError = error;
    if (!shouldTryBackendFallback(path)) throw error;
  }

  try {
    return await fetch(toBackendUrl(path), init);
  } catch (error) {
    if (sameOriginResponse) return sameOriginResponse;
    throw sameOriginError || error;
  }
}

function shouldTryBackendFallback(path) {
  return typeof window !== 'undefined' && String(path || '').startsWith('/api/');
}

function toBackendUrl(path) {
  return new URL(path, getBackendOrigin()).toString();
}

function getBackendOrigin() {
  return (process.env.NEXT_PUBLIC_BACKEND_ORIGIN || 'http://127.0.0.1:3000').replace(/\/+$/, '');
}
