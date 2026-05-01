import { memo, useMemo } from 'react';
import { renderCoverPage, renderListPage } from '../lib/pageMarkup';

function renderSlideHtml(list, page, index, selectedPageIndex) {
  const raw = page.type === 'cover'
    ? renderCoverPage(page, index, list.pages.length, list.id, list.captionHashtags || [], list)
    : renderListPage(page, index, list.pages.length, list.id, list.captionHashtags || [], list);

  const html = index === selectedPageIndex
    ? raw
      .replace('class="story-page', 'class="story-page is-selected')
      .replaceAll('loading="lazy" decoding="async" fetchpriority="low"', 'loading="eager" decoding="async" fetchpriority="high"')
    : raw;

  return html;
}

function SlideCard({ list, page, index, selectedPageIndex, onSelect }) {
  const html = useMemo(
    () => renderSlideHtml(list, page, index, selectedPageIndex),
    [list, page, index, selectedPageIndex],
  );

  return (
    <div
      className={`slide-card-frame ${index === selectedPageIndex ? 'is-selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`Chọn trang ${index + 1}`}
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
