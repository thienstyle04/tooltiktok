import { currentPageLabel, imageSourceClass, sourceLabel } from '../lib/utils';

function isPortableImageUrl(value) {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) || url.startsWith('/assets/drive-file');
}

function firstPortableListImage(list) {
  for (const page of list?.pages || []) {
    if (isPortableImageUrl(page.backgroundImage)) return page.backgroundImage;
    for (const item of page.items || []) {
      if (isPortableImageUrl(item.imageUrl)) return item.imageUrl;
      const candidate = item.candidateImageUrls?.find(isPortableImageUrl);
      if (candidate) return candidate;
    }
  }
  return '';
}

export default function PageInspector({
  deck,
  list,
  selectedPageIndex,
  onCoverTextChange,
  onCoverTextSave,
  savingCoverText = false,
}) {
  const page = list?.pages?.[selectedPageIndex];
  if (!deck || !list || !page) {
    return <p className="empty-inspector">Chọn một trang trong preview để xem dữ liệu và ảnh đang dùng.</p>;
  }

  const items = Array.isArray(page.items) ? page.items : [];
  const hasItems = items.length > 0;
  const itemsWithImages = items.filter((item) => item.imageUrl);
  const mappedCount = itemsWithImages.filter((item) => item.imageSource === 'manual' || item.imageSource === 'auto' || item.imageMapped).length;
  const fallbackCount = itemsWithImages.filter((item) => imageSourceClass(item) === 'fallback').length;
  const partnerCount = items.filter((item) => item.isPartner).length;
  const pageBackground = isPortableImageUrl(page.backgroundImage)
    ? page.backgroundImage
    : firstPortableListImage(list) || page.backgroundImage || '';
  const coverImage = hasItems ? (itemsWithImages[0]?.imageUrl || pageBackground) : pageBackground;
  const canEditCover = !hasItems && page.type === 'cover' && typeof onCoverTextChange === 'function';
  const canSaveCover = canEditCover && typeof onCoverTextSave === 'function';

  return (
    <>
      <div className="inspector-summary">
        {coverImage ? <img className="inspector-thumb" src={coverImage} alt={page.title || list.title} loading="lazy" decoding="async" draggable="false" /> : null}
        <div className="inspector-copy">
          <p className="inspector-eyebrow">{deck.navTitle} · {list.navTitle || list.title}</p>
          <h4>{page.title || list.title}</h4>
          <p>{hasItems ? 'Trang dữ liệu' : 'Trang bìa'} · {page.chipText || 'Cover'} · Trang {currentPageLabel(selectedPageIndex, list)}</p>
        </div>
      </div>

      {hasItems ? (
        <>
          <div className="inspector-stats">
            <div><strong>{items.length}</strong><span>dữ liệu</span></div>
            <div><strong>{mappedCount}</strong><span>có ảnh</span></div>
            <div><strong>{partnerCount}</strong><span>đối tác</span></div>
            <div><strong>{fallbackCount}</strong><span>minh họa</span></div>
          </div>
          <ul className="inspector-list">
            {items.map((item, index) => (
              <li key={`${item.id || item.name}-${index}`} className={`inspector-item ${item.imageUrl ? 'rich' : ''}`}>
                {item.imageUrl ? (
                  <img className="inspector-item-thumb" src={item.imageUrl} alt={item.name} loading="lazy" decoding="async" draggable="false" />
                ) : null}
                <span className="inspector-item-copy">
                  <span className="inspector-item-label">{item.label || ''}</span>
                  <span className="inspector-item-name">{item.name}</span>
                  <span className="inspector-item-meta">{item.metaPrimary || ''}</span>
                </span>
                {item.imageUrl ? (
                  <span className={`inspector-item-source ${imageSourceClass(item)}`}>{sourceLabel(item)}</span>
                ) : (
                  <span className="inspector-item-source text-only">Bảng</span>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          {canEditCover ? (
            <div className="inspector-cover-editor">
              <label className="inspector-field">
                <span>Chữ cover</span>
                <textarea
                  value={page.subtitle || ''}
                  placeholder="Nhập chữ muốn hiện trên cover..."
                  rows={4}
                  maxLength={220}
                  onChange={(event) => onCoverTextChange({ coverSubtitle: event.target.value })}
                />
              </label>
              <div className="inspector-editor-actions">
                <span>{list.id?.includes('caption-') ? 'List AI: lưu để lần sau mở lại vẫn còn.' : 'List gốc: sửa tạm trong phiên hiện tại.'}</span>
                {canSaveCover ? (
                  <button className="toolbar-button secondary" type="button" disabled={savingCoverText} onClick={onCoverTextSave}>
                    {savingCoverText ? 'Đang lưu...' : 'Lưu chữ cover'}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="inspector-cover-note">
            <strong>Trang này là cover</strong>
            <span>Cover dùng ảnh nền và chữ phụ. Sửa nội dung ở ô trên rồi xuất lại, không cần sinh caption AI.</span>
          </div>
        </>
      )}
    </>
  );
}
