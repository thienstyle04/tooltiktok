import { currentPageLabel, imageSourceClass, sourceLabel } from '../lib/utils';

export default function PageInspector({ deck, list, selectedPageIndex }) {
  const page = list?.pages?.[selectedPageIndex];
  if (!deck || !list || !page) {
    return <p className="empty-inspector">Chọn một trang trong preview để xem dữ liệu và ảnh đang dùng.</p>;
  }

  const items = Array.isArray(page.items) ? page.items : [];
  const hasItems = items.length > 0;
  const mappedCount = items.filter((item) => item.imageSource === 'manual' || item.imageSource === 'auto' || item.imageMapped).length;
  const fallbackCount = items.filter((item) => imageSourceClass(item) === 'fallback').length;
  const partnerCount = items.filter((item) => item.isPartner).length;
  const coverImage = hasItems ? (items[0]?.imageUrl || page.backgroundImage || '') : (page.backgroundImage || '');

  return (
    <>
      <div className="inspector-summary">
        {coverImage ? <img className="inspector-thumb" src={coverImage} alt={page.title || list.title} /> : null}
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
              <li key={`${item.id || item.name}-${index}`} className="inspector-item rich">
                <img className="inspector-item-thumb" src={item.imageUrl} alt={item.name} />
                <span className="inspector-item-copy">
                  <span className="inspector-item-label">{item.label || ''}</span>
                  <span className="inspector-item-name">{item.name}</span>
                  <span className="inspector-item-meta">{item.metaPrimary || ''}</span>
                </span>
                <span className={`inspector-item-source ${imageSourceClass(item)}`}>{sourceLabel(item)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="inspector-cover-note">
          <strong>Trang này là cover</strong>
          <span>Cover chỉ dùng ảnh nền và tiêu đề. Dữ liệu địa điểm/dịch vụ sẽ hiện khi chọn các trang nội dung phía sau.</span>
        </div>
      )}
    </>
  );
}
