import type { GuideItem } from '../../../common/interfaces/guide.types';

/** Threads Local uses Dia_chi, not the composed Dia_chi + Ten_phuong display value. */
export function threadsVenueAddress(item: Pick<GuideItem, 'streetAddress' | 'address'>): string {
  // address is composed with Ten_phuong, so even legacy/custom inputs must not
  // fall back to it. Missing Dia_chi means unavailable, never a fabricated address.
  return String(item.streetAddress ?? '').trim();
}
