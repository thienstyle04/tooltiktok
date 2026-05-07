import { memo, useMemo } from 'react';
import { renderCoverPage, renderListPage } from '../lib/pageMarkup';

function renderSlideHtml(list, page, index) {
  return page.type === 'cover'
    ? renderCoverPage(page, index, list.pages.length, list.id, list.captionHashtags || [], list)
    : renderListPage(page, index, list.pages.length, list.id, list.captionHashtags || [], list);
}

function SlideCard({ list, page, index, selected, onSelect }) {
  const html = useMemo(
    () => renderSlideHtml(list, page, index),
    [list, page, index],
  );

  return (
    <div
      className={`slide-card-frame ${selected ? 'is-selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Chon trang ${index + 1}`}
      onClick={() => onSelect(list.id, index)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(list.id, index);
        }
      }}
    >
      <span className="slide-card-number">{String(index + 1).padStart(2, '0')}</span>
      <div className="slide-card-content" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

export default memo(SlideCard);
