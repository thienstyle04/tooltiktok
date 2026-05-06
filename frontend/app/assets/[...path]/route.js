import { proxyBackendRequest } from '../../../lib/backendProxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export function GET(request) {
  return proxyBackendRequest(request);
}

export function HEAD(request) {
  return proxyBackendRequest(request);
}
