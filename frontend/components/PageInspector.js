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
  onPageTextChange,
  onPageTextSave,
  savingPageText = false,
  onExportPage,
  onExportList,
  busy = false,
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
  const canEditPage = typeof onPageTextChange === 'function';
  const canSavePage = canEditPage && typeof onPageTextSave === 'function';
  const titleLimit = page.type === 'cover' ? 60 : 90;
  const pageTitle = String(page.title || '');
  const pageSubtitle = String(page.subtitle || '');

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

      {canEditPage ? (
        <div className="inspector-cover-editor inspector-page-editor">
          <label className="inspector-field">
            <span className="inspector-field-head"><span>Tiêu đề trang</span><span>{pageTitle.length}/{titleLimit}</span></span>
            <textarea value={pageTitle} placeholder="Nhập tiêu đề trang..." rows={2} maxLength={titleLimit} onChange={(event) => onPageTextChange({ title: event.target.value })} />
          </label>
          <label className="inspector-field">
            <span className="inspector-field-head"><span>Mô tả trang</span><span>{pageSubtitle.length}/220</span></span>
            <textarea value={pageSubtitle} placeholder="Có thể để trống mô tả..." rows={4} maxLength={220} onChange={(event) => onPageTextChange({ subtitle: event.target.value })} />
          </label>
          <div className="inspector-editor-actions">
            <span>Xem trước cập nhật ngay · chỉ lưu khi bấm nút.</span>
            {canSavePage ? (
              <button className="toolbar-button secondary" type="button" disabled={savingPageText} onClick={onPageTextSave}>
                {savingPageText ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

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
                {item.imageUrl ? <img className="inspector-item-thumb" src={item.imageUrl} alt={item.name} loading="lazy" decoding="async" draggable="false" /> : null}
                <span className="inspector-item-copy">
                  <span className="inspector-item-label">{item.label || ''}</span>
                  <span className="inspector-item-name">{item.name}</span>
                  <span className="inspector-item-meta">{item.metaPrimary || ''}</span>
                </span>
                {item.imageUrl
                  ? <span className={`inspector-item-source ${imageSourceClass(item)}`}>{sourceLabel(item)}</span>
                  : <span className="inspector-item-source text-only">Bảng</span>}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="inspector-cover-note">
          <strong>Trang này là cover</strong>
          <span>Cover dùng ảnh nền và chữ riêng. Có thể sửa tiêu đề và mô tả ở trên mà không cần sinh lại bằng AI.</span>
        </div>
      )}

      {typeof onExportPage === 'function' || typeof onExportList === 'function' ? (
        <div className="inspector-export-actions">
          <p className="inspector-export-kicker">Xuất ảnh</p>
          <div className="inspector-export-buttons">
            {typeof onExportPage === 'function' ? <button className="toolbar-button secondary" type="button" disabled={busy} onClick={onExportPage}>Xuất trang PNG</button> : null}
            {typeof onExportList === 'function' ? <button className="toolbar-button" type="button" disabled={busy} onClick={onExportList}>Xuất list ZIP</button> : null}
          </div>
          <p className="inspector-export-hint">Phím tắt: Ctrl+S xuất trang · ← → đổi trang</p>
        </div>
      ) : null}
    </>
  );
}
