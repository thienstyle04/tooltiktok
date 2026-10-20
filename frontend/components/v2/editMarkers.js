// "Bấm vào chữ trên slide để sửa": đánh dấu data-edit-field lên preview bằng cách so khớp
// nội dung chữ với các trường của trang. Chỉ chạy trên DOM preview, không sửa renderer
// nên markup dùng để xuất ảnh không có thuộc tính này.
const normalize = value => String(value ?? '').toLocaleLowerCase('vi').replace(/\s+/g, '');

export function editableFields(page) {
  const fields = [];
  const push = (path, value) => { if (normalize(value).length >= 2) fields.push({ path, value }); };
  push('title', page?.title);
  push('subtitle', page?.subtitle);
  push('chipText', page?.chipText);
  (page?.items || []).forEach((item, index) => {
    push(`items.${index}.name`, item?.name);
    push(`items.${index}.metaPrimary`, item?.metaPrimary);
    push(`items.${index}.metaSecondary`, item?.metaSecondary);
    push(`items.${index}.scheduleTime`, item?.scheduleTime);
  });
  return fields;
}

const SKIP_TAGS = new Set(['IMG', 'SVG', 'PATH', 'STYLE', 'SCRIPT', 'BR']);

export function markEditableText(root, page) {
  if (!root || !page) return 0;
  root.querySelectorAll('[data-edit-field]').forEach(node => node.removeAttribute('data-edit-field'));
  const elements = [...root.querySelectorAll('*')].filter(node => !SKIP_TAGS.has(node.tagName.toUpperCase()));
  const texts = new Map(elements.map(node => [node, normalize(node.textContent)]));
  let marked = 0;
  for (const { path, value } of editableFields(page)) {
    const target = normalize(value);
    const pick = matches => elements.reduce((best, node) => {
      if (node.hasAttribute('data-edit-field') || !matches(texts.get(node))) return best;
      return !best || best.contains(node) ? node : best;   // phần tử sâu nhất chứa đúng đoạn chữ
    }, null);
    const exact = pick(text => text === target);
    // Một số mẫu thêm số thứ tự/biểu tượng quanh chữ: chấp nhận chênh vài ký tự.
    const near = exact || pick(text => text.length <= target.length + 8 && text.includes(target));
    if (near) { near.setAttribute('data-edit-field', path); marked += 1; }
  }
  return marked;
}
