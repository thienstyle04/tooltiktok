export const COLOR_EDIT_PRESET = 'iphone-color-edit-v1';
export const DEFAULT_PHOTO_PRESETS = [{ id: null, label: 'Ảnh gốc' }, { id: COLOR_EDIT_PRESET, label: 'Color Edit' }];
const textOnly = new Set(['summary-note', 'itinerary-note-2days', 'itinerary-note-dark', 'itinerary-note-timed', 'threads-toplist-dalat', 'threads-mix-text']);
export function supportsPhotoPreset(deckId) { return Boolean(deckId) && !textOnly.has(deckId) && !deckId.startsWith('itinerary-note-threads-'); }
export function photoDisplayUrl(source, preset) {
  if (!source || !preset || source.startsWith('/assets/color-edit?')) return source;
  if (!source.startsWith('/assets/') && !/^https?:\/\//i.test(source)) return source;
  return `/assets/color-edit?preset=${encodeURIComponent(preset)}&source=${encodeURIComponent(source)}`;
}
export function photoRenderPage(page, preset) {
  const value = page.photoPreset || preset;
  if (!value || page.layoutVariant === 'spotlight-v6-map-page') return page;
  const next = { ...page, photoPreset: value };
  if (page.backgroundImage) next.backgroundImage = photoDisplayUrl(page.backgroundImage, value);
  if (page.coverImages) next.coverImages = page.coverImages.map(src => photoDisplayUrl(src, value));
  if (page.items) next.items = page.items.map(item => ({ ...item,
    imageUrl: photoDisplayUrl(item.imageUrl, value),
    candidateImageUrls: (item.candidateImageUrls || []).map(src => photoDisplayUrl(src, value)),
  }));
  return next;
}
export function photoRenderArguments(page, args) {
  const list = args[4], preset = page.photoPreset || list?.photoPreset;
  if (!preset || page.layoutVariant === 'spotlight-v6-map-page') return { page, args, preset: null };
  const nextArgs = [...args];
  if (list) nextArgs[4] = { ...list, pages: (list.pages || []).map(p => photoRenderPage(p, preset)) };
  if (Array.isArray(args[5])) nextArgs[5] = args[5].map(src => photoDisplayUrl(src, preset));
  return { page: photoRenderPage(page, preset), args: nextArgs, preset };
}
export function strictPhotoMarkup(html, preset) {
  if (!preset || /<article[^>]*data-export-strict="true"/.test(html)) return html;
  return html.replace('<article ', '<article data-export-strict="true" data-photo-preset="' + preset + '" ');
}
