import { proxyBackendRequest } from '../../../lib/backendProxy';

const API_CACHE_CONTROL = 'no-store, no-cache, must-revalidate, proxy-revalidate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Prefetch Drive trước khi xuất có thể >2 phút trên máy mới (cache trống).
export const maxDuration = 300;

export function GET(request) {
  return proxyApiRequest(request);
}

export function HEAD(request) {
  return proxyApiRequest(request);
}

export function POST(request) {
  return proxyApiRequest(request);
}

export function PUT(request) {
  return proxyApiRequest(request);
}

export function PATCH(request) {
  return proxyApiRequest(request);
}

export function DELETE(request) {
  return proxyApiRequest(request);
}

function proxyApiRequest(request) {
  const pathname = new URL(request.url).pathname || '';
  const isPrefetch = pathname.includes('/api/drive-files/prefetch');
  const isGuideData = pathname.includes('/api/guide-data');
  const timeoutMs = isPrefetch ? 280_000 : (isGuideData ? 180_000 : 120_000);
  return proxyBackendRequest(request, {
    cacheControl: API_CACHE_CONTROL,
    timeoutMs,
  });
}
