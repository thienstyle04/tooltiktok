import SlideCard from './SlideCard';

export default function DeckCanvas({ list, selectedPageIndex, onPageSelect }) {
  if (!list?.pages?.length) {
    return (
      <div className="list-preview-stage">
        <div className="empty-state compact">List này chưa có trang để preview.</div>
      </div>
    );
  }

  return (
    <div className="list-preview-stage">
      <div className="list-preview-grid" role="list" aria-label={`Preview ${list.title}`}>
        {list.pages.map((page, index) => (
          <SlideCard
            key={`${list.id}-${index}-${page.type || 'page'}`}
            list={list}
            page={page}
            index={index}
            selected={index === selectedPageIndex}
            onSelect={onPageSelect}
          />
        ))}
      </div>
    </div>
  );
}
