// Nhóm mẫu và kiểu dùng chung giữa GuideService và các module tách ra (caption-text, list-display...).
import type { DeepSeekCaptionResponse } from '../../common/interfaces/guide.types';
import { ITINERARY_NOTE_DARK_ID } from './logic/itinerary-note';
import { THREADS_TOPLIST_ID } from './logic/threads-toplist';

/** Mẫu chỉ có chữ (note/Threads), không có ảnh địa điểm. */
export const isTextNoteDeck = (deckId: string): boolean => deckId === THREADS_TOPLIST_ID || deckId === 'summary-note' || deckId === ITINERARY_NOTE_DARK_ID || (deckId === 'itinerary-note-2days' || deckId.startsWith('itinerary-note-threads-')) || deckId === 'itinerary-note-timed';

export function isSpotlightV5Deck(deckId: string): boolean {
  return deckId === 'spotlight-v5' || deckId === 'spotlight-v5-color-edit';
}

export type CaptionTone = DeepSeekCaptionResponse['tone'];
