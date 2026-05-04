import { listIsMain } from '../lib/utils';
import DeckCanvas from './DeckCanvas';
import DeckSkeleton from './DeckSkeleton';

export default function PreviewPanel({ deck, list, selectedPageIndex, onPageSelect, onDeleteList, loading }) {
  if (loading) {
    return (
      <section className="preview-panel">
        <div className="panel-head">
          <div>
            <p className="panel-kicker">Preview deck</p>
            <h3 className="panel-title">Các trang đang dựng</h3>
          </div>
          <p className="panel-note">Đang nạp dữ liệu và ảnh.</p>
        </div>
        <div className="page-grid">
          <DeckSkeleton />
        </div>
      </section>
    );
  }

  if (!deck || !list) {
    return (
      <section className="preview-panel">
        <div className="empty-state">Không có deck nào để hiển thị.</div>
      </section>
    );
  }

  const isMain = listIsMain(list);
  const badgeText = isMain ? 'Gốc' : `AI ${list.navTitle}`;
  const sectionTone = (list.navTitle || '').toLowerCase().includes('ai') ? 'ai' : 'main';
  const sectionDescription = list.description || (isMain
    ? 'Bản gốc đang dùng làm layout chuẩn.'
    : 'Bản AI được sinh mới từ caption.');

  return (
    <section className="preview-panel">
      <div className="panel-head">
        <div>
          <p className="panel-kicker">Preview deck</p>
          <h3 className="panel-title">Các trang đang dựng</h3>
        </div>
        <p className="panel-note">{String(list.pages.length).padStart(2, '0')} trang trong list này</p>
      </div>
      <div id="pageGrid" className="page-grid">
        <section className="list-preview-section active" data-list-section-id={list.id}>
          <div className="list-preview-head">
            <div>
              <div className={`list-preview-badge ${sectionTone}`}>{badgeText}</div>
              <h3 className="list-preview-title">{list.title}</h3>
              <p className="list-preview-description">{sectionDescription}</p>
              <div className="list-preview-hashtags">
                {(list.captionHashtags || []).map((tag) => (
                  <span key={tag} className="preview-hashtag">{tag.startsWith('#') ? tag : `#${tag}`}</span>
                ))}
              </div>
            </div>
            <div className="list-preview-meta-group">
              <div className="list-preview-meta">{String(list.pages.length).padStart(2, '0')} trang</div>
              {!isMain && (
                <button
                  className="list-delete-btn"
                  type="button"
                  title="Xóa bộ ảnh AI này"
                  aria-label={`Xóa ${list.navTitle}`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onDeleteList(deck.id, list.id);
                  }}
                >
                  x
                </button>
              )}
            </div>
          </div>
          <DeckCanvas list={list} selectedPageIndex={selectedPageIndex} onPageSelect={onPageSelect} />
        </section>
      </div>
    </section>
  );
}
