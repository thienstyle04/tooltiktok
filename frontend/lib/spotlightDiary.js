// The same measured bounds are used for preview and all export modes.
export function fitSpotlightDiary(root, strict = false) {
  const nodes = root?.matches?.('.spotlight-v6-diary-page') ? [root] : [...(root?.querySelectorAll?.('.spotlight-v6-diary-page') || [])];
  for (const node of nodes) {
    const safe = node.querySelector('.diary-safe');
    const copy = node.querySelector('.diary-copy');
    if (!safe?.clientHeight || !copy) continue;
    let size = Math.min(13, Math.max(9, Number(node.dataset.diaryFontSize) || 13));
    const overflow = () => copy.scrollHeight > safe.clientHeight + 1 || copy.scrollWidth > safe.clientWidth + 1;
    node.style.setProperty('--diary-font', size + 'px');
    const minimum = Math.min(size, 11);
    while (overflow() && size > minimum) { size -= .5; node.style.setProperty('--diary-font', size + 'px'); }
    const invalid = overflow();
    node.dataset.diaryOverflow = String(invalid);
    node.title = invalid ? 'Nội dung quá dài. Cần rút gọn trước khi xuất.' : '';
    if (invalid && strict) throw new Error(`Spotlight Nhật ký: tràn chữ trang ${Number(node.dataset.pageIndex || 0) + 1}. Cần rút gọn trước khi xuất.`);
  }
}
