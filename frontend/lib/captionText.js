export const DEFAULT_CAPTION_DESCRIPTION = 'Lưu list này để xem lại các địa điểm và sắp xếp lịch trình thuận tiện hơn.';

function isSummaryNoteList(list) {
  return String(list?.id || '').startsWith('summary-note-')
    || Boolean(list?.pages?.some((page) => page?.layoutVariant === 'summary-note-page'));
}

export function buildSummaryNoteCaptionText(list) {
  const combinedText = [
    list?.title,
    list?.coverTitle,
    ...(list?.pages || []).map((page) => page?.title),
  ].filter(Boolean).join(' ');
  const destination = /green\s*land/i.test(combinedText) ? 'Green Land' : 'Đà Lạt';
  return [
    `Em sắp có chuyến đi ${destination} vào tuần tới ạ`,
    'Và em có tổng hợp được các địa điểm em phải ghé trên Tóp tóp như hình bên dưới',
    `Mọi người ở ${destination} xem giúp em các quán này ukiii ko ạ 🥰🥰🥰`,
  ].join('\n');
}

export function buildCaptionExportText(list, overrides = {}) {
  if (list?.pages?.some(page => page.layoutVariant === 'itinerary-note-timed-day')) return String(overrides.title ?? list.postCaption ?? 'Lịch trình Đà Lạt 2 ngày theo khung giờ tham khảo mình đã tổng hợp ở bên dưới.');
  if (list?.pages?.some(page => page.layoutVariant === 'itinerary-note-day')) return String(overrides.title ?? list.postCaption ?? 'Mình tổng hợp lịch trình Đà Lạt 2 ngày như hình bên dưới.');
  if (isSummaryNoteList(list)) return buildSummaryNoteCaptionText(list);
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
