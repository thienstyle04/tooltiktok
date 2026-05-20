const HOP_BY_HOP_HEADERS = [
  'accept-encoding',
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

const BODYLESS_RESPONSE_STATUSES = new Set([101, 204, 205, 304]);

export async function proxyBackendRequest(request, options = {}) {
  const requestUrl = new URL(request.url);
  const backendOrigins = getBackendOrigins(requestUrl);
  const method = request.method.toUpperCase();
  const requestBody = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();
  const errors = [];

  for (const backendOrigin of backendOrigins) {
    const backendUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, backendOrigin);
    try {
      const response = await fetch(backendUrl, {
        method,
        headers: getForwardHeaders(request),
        body: requestBody ? requestBody.slice(0) : undefined,
        cache: 'no-store',
        redirect: 'manual',
        signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
      });

      const headers = new Headers(response.headers);
      headers.delete('content-encoding');
      headers.delete('content-length');
      const isDriveFallbackImage = headers.get('x-drive-image-fallback') === '1';
      if (options.cacheControl && !isDriveFallbackImage) {
        headers.set('Cache-Control', options.cacheControl);
      }

      const body = method === 'HEAD' || BODYLESS_RESPONSE_STATUSES.has(response.status)
        ? null
        : await response.arrayBuffer();

      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      errors.push(`${backendOrigin}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return Response.json(
    {
      message: 'Không kết nối được backend. Hãy kiểm tra cửa sổ start.bat có dòng backend đang chạy và không bị lỗi.',
      detail: errors.join(' | '),
    },
    { status: 502 },
  );
}

function getForwardHeaders(request) {
  const headers = new Headers(request.headers);
  for (const header of HOP_BY_HOP_HEADERS) headers.delete(header);
  return headers;
}

function normalizeOrigin(origin) {
  return origin.replace(/\/+$/, '');
}

function getBackendOrigins(requestUrl) {
  const configuredOrigins = [
    process.env.BACKEND_ORIGIN,
    process.env.NEXT_PUBLIC_BACKEND_ORIGIN,
  ];
  const requestHostOrigin = requestUrl.hostname
    ? `${requestUrl.protocol}//${requestUrl.hostname}:3000`
    : '';
  return uniqueOrigins([
    ...configuredOrigins,
    requestHostOrigin,
    'http://127.0.0.1:3000',
    'http://localhost:3000',
  ]);
}

function uniqueOrigins(origins) {
  const seen = new Set();
  return origins
    .map((origin) => String(origin || '').trim())
    .filter(Boolean)
    .map(normalizeOrigin)
    .filter((origin) => {
      if (seen.has(origin)) return false;
      seen.add(origin);
      return true;
    });
}
