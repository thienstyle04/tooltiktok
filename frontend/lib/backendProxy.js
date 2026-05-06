const backendOrigin = process.env.NEXT_PUBLIC_BACKEND_ORIGIN || 'http://127.0.0.1:3000';

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
  const backendUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, normalizeOrigin(backendOrigin));
  const method = request.method.toUpperCase();

  try {
    const response = await fetch(backendUrl, {
      method,
      headers: getForwardHeaders(request),
      body: method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer(),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
    });

    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');
    if (options.cacheControl) headers.set('Cache-Control', options.cacheControl);

    const body = method === 'HEAD' || BODYLESS_RESPONSE_STATUSES.has(response.status)
      ? null
      : await response.arrayBuffer();

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    return Response.json(
      {
        message: 'Khong ket noi duoc backend.',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}

function getForwardHeaders(request) {
  const headers = new Headers(request.headers);
  for (const header of HOP_BY_HOP_HEADERS) headers.delete(header);
  return headers;
}

function normalizeOrigin(origin) {
  return origin.replace(/\/+$/, '');
}
