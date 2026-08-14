export const DEFAULT_CAPTION_DESCRIPTION = 'Lưu list này để xem lại các địa điểm và sắp xếp lịch trình thuận tiện hơn.';

export function buildCaptionExportText(list, overrides = {}) {
  const title = String(
    overrides.title ?? list?.postCaption ?? list?.title ?? list?.coverTitle ?? list?.navTitle ?? '',
  ).trim();
  let description = String(
    overrides.description ?? list?.captionBody ?? list?.description ?? '',
  ).trim();
  const hashtagsValue = overrides.hashtags ?? list?.captionHashtags ?? [];
  const hashtags = Array.isArray(hashtagsValue)
    ? hashtagsValue.map((tag) => String(tag || '').trim()).filter(Boolean).join(' ')
    : String(hashtagsValue || '').trim();

  // Các list cũ từng bị ghi rỗng description khi đồng bộ cấu trúc mẫu mẹ.
  // Không thể phục hồi nguyên văn AI body đã mất, nên dùng câu trung tính để file
  // caption vẫn luôn đủ Tiêu đề -> Mô tả -> Hashtag.
  if (!description && title && hashtags) description = DEFAULT_CAPTION_DESCRIPTION;

  return [title, description, hashtags].filter(Boolean).join('\n\n').trim();
}
