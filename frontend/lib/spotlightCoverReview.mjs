export function coverSourceId(source) {
  try {
    const url = new URL(source, 'http://local');
    const id = url.searchParams.get('id') || url.pathname.match(/\/file\/d\/([^/]+)/)?.[1];
    if (id && (url.pathname === '/assets/drive-file' || /drive\.google\.com$/.test(url.hostname))) return `drive:${id}`;
    return `${url.origin === 'http://local' ? '' : url.origin}${url.pathname}`;
  } catch { return source; }
}
export function hookTopic(hook) {
  const text = String(hook || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
  for (const [topic, pattern] of [['green', /dia diem xanh|rung thong|giua rung|mang xanh/], ['night', /choi dem|ve dem|di dem/], ['food', /an gi|quan an|an uong|mon ngon/], ['cafe', /ca phe|cafe|coffee/], ['stay', /homestay|luu tru|khach san/], ['city', /pho phuong|pho thi|giua pho/]]) if (pattern.test(text)) return topic;
  return null;
}
export function coverApprovalToken(page) { return JSON.stringify([page.title, (page.coverImages?.length ? page.coverImages : [page.backgroundImage]).map(coverSourceId)]); }
export function coverReviewError(list) {
  if (list?.spotlightDesignRevision !== 1) return '';
  const page = list.pages.find(p => p.type === 'cover');
  if (!page) return '';
  const urls = page.coverImages?.length ? page.coverImages : [page.backgroundImage];
  const ids = urls.map(coverSourceId), topic = hookTopic(page.title);
  if (page.layoutVariant === 'spotlight-v2-cover' && urls.length !== 4) return 'Ảnh bìa V2 cần đủ 4 ảnh khác nhau; chọn lại trước khi xuất.';
  if (new Set(ids).size !== ids.length || !urls.every(Boolean)) return 'Ảnh bìa đang thiếu hoặc trùng ảnh; chọn lại trước khi xuất.';
  const manual = page.coverApproval === coverApprovalToken(page);
  if (topic && !manual && (topic !== list.coverReview?.topic || !ids.every(id => list.coverReview?.approvedSourceIds.includes(id)))) return 'Ảnh bìa chưa được xác nhận phù hợp hook. Kiểm tra ảnh ở trang bìa và xác nhận hoặc đổi hook trước khi xuất.';
  return '';
}
export function coverReviewWarnings(list) {
  const page=list?.pages?.find(p=>p.type==='cover');
  const manual=page&&page.coverApproval===coverApprovalToken(page);
  return (list?.coverReview?.warnings||[]).filter(warning=>!manual||!warning.startsWith('Chưa có ảnh bìa được gắn nhãn'));
}
