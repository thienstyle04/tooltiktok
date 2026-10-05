import { BadRequestException } from '@nestjs/common';
import { COLOR_EDIT_PRESET, COLOR_EDIT_SETTINGS } from './color-edit';
import type { GuideDeckList } from '../../common/interfaces/guide.types';

export type PhotoPresetId = typeof COLOR_EDIT_PRESET;
export const TEXT_ONLY_DECKS = ['summary-note', 'itinerary-note-2days', 'itinerary-note-dark', 'itinerary-note-timed', 'threads-toplist-dalat', 'threads-mix-text'];
export function supportsPhotoPreset(deckId: string): boolean {
  return Boolean(deckId) && !TEXT_ONLY_DECKS.includes(deckId) && !deckId.startsWith('itinerary-note-threads-');
}
export function photoPresetsCatalog() {
  return { presets: [{ id: null, label: 'Ảnh gốc' }, { id: COLOR_EDIT_PRESET, label: 'Color Edit', settings: COLOR_EDIT_SETTINGS }], textOnlyDeckIds: TEXT_ONLY_DECKS };
}
export function validatePhotoPreset(value: unknown, deckId?: string): PhotoPresetId | undefined {
  if (value === undefined || value === null) return undefined;
  if (value !== COLOR_EDIT_PRESET) throw new BadRequestException('Bảng màu không được hỗ trợ.');
  if (deckId && !supportsPhotoPreset(deckId)) throw new BadRequestException('Mẫu chỉ có chữ không sử dụng bảng màu.');
  return COLOR_EDIT_PRESET;
}
export function applyListPhotoPreset(list: GuideDeckList, value: unknown): void {
  const preset = validatePhotoPreset(value);
  if (preset) list.photoPreset = preset; else delete list.photoPreset;
  list.pages = list.pages.map(page => {
    const next = { ...page };
    if (preset) next.photoPreset = preset; else delete next.photoPreset;
    return next;
  });
}
