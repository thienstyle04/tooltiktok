import { BadRequestException } from '@nestjs/common';
import { COLOR_EDIT_PRESET, COLOR_EDIT_SETTINGS, REFERENCE_PHOTO_PRESETS, photoPresetSettings, type PhotoPresetId } from '../../common/photo-preset-catalog';
import type { GuideDeckList } from '../../common/interfaces/guide.types';

export type { PhotoPresetId } from '../../common/photo-preset-catalog';
export const TEXT_ONLY_DECKS = ['threads-note-dark-list', 'summary-note', 'itinerary-note-2days', 'itinerary-note-dark', 'itinerary-note-timed', 'threads-toplist-dalat', 'threads-mix-text'];
export function supportsPhotoPreset(deckId: string): boolean {
  return Boolean(deckId) && !TEXT_ONLY_DECKS.includes(deckId) && !deckId.startsWith('itinerary-note-threads-');
}
export function photoPresetsCatalog() {
  return { presets: [{ id: null, label: 'Ảnh gốc', description: 'Giữ màu ảnh từ dữ liệu nguồn' },
    { id: COLOR_EDIT_PRESET, label: 'Color Edit', description: 'Bảng màu cũ · tông trầm, nét và chi tiết', settings: COLOR_EDIT_SETTINGS },
    ...REFERENCE_PHOTO_PRESETS], textOnlyDeckIds: TEXT_ONLY_DECKS };
}
export function validatePhotoPreset(value: unknown, deckId?: string): PhotoPresetId | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !photoPresetSettings(value)) throw new BadRequestException('Bảng màu không được hỗ trợ.');
  if (deckId && !supportsPhotoPreset(deckId)) throw new BadRequestException('Mẫu chỉ có chữ không sử dụng bảng màu.');
  return value as PhotoPresetId;
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
