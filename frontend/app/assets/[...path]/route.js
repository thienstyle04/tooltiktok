import { proxyBackendRequest } from '../../../lib/backendProxy';

const ASSET_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800, immutable';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export function GET(request) {
  return proxyBackendRequest(request, { cacheControl: ASSET_CACHE_CONTROL });
}

export function HEAD(request) {
  return proxyBackendRequest(request, { cacheControl: ASSET_CACHE_CONTROL });
}
