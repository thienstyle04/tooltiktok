import { proxyBackendRequest } from '../../../lib/backendProxy';

const API_CACHE_CONTROL = 'no-store, no-cache, must-revalidate, proxy-revalidate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

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
  return proxyBackendRequest(request, { cacheControl: API_CACHE_CONTROL });
}
