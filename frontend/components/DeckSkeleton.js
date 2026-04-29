const skeletonCards = Array.from({ length: 6 }, (_, index) => index);

export default function DeckSkeleton() {
  return (
    <div className="deck-skeleton" aria-label="Đang tải preview">
      <div className="deck-skeleton-head">
        <span />
        <strong />
        <em />
      </div>
      <div className="deck-skeleton-grid">
        {skeletonCards.map((item) => (
          <div key={item} className="deck-skeleton-card">
            <span />
            <strong />
            <em />
          </div>
        ))}
      </div>
    </div>
  );
}
