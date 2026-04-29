import { renderCoverPage, renderListPage } from '../lib/pageMarkup';
import { listIsMain } from '../lib/utils';

function pageHtml(list, page, index, selectedPageIndex) {
  const raw = page.type === 'cover'
    ? renderCoverPage(page, index, list.pages.length, list.id, list.captionHashtags || [])
    : renderListPage(page, index, list.pages.length, list.id, list.captionHashtags || []);
  return index === selectedPageIndex
    ? raw.replace('class="story-page', 'class="story-page is-selected')
    : raw;
}

function buildListPagesHtml(list, selectedPageIndex) {
  return list.pages.map((page, index) => pageHtml(list, page, index, selectedPageIndex)).join('');
}

export default function PreviewPanel({ deck, list, selectedPageIndex, onPageClick, onDeleteList }) {
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
    : 'Bản AI được sinh mới từ caption và đặt bên dưới bản gốc.');
  const pagesHtml = buildListPagesHtml(list, selectedPageIndex);

  return (
    <section className="preview-panel">
      <div className="panel-head">
        <div>
          <p className="panel-kicker">Preview deck</p>
          <h3 className="panel-title">Các trang đang dựng</h3>
        </div>
        <p className="panel-note">Tổng quan theo từng list.</p>
      </div>
      <div id="pageGrid" className="page-grid" onClick={onPageClick}>
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
                  ×
                </button>
              )}
            </div>
          </div>
          <div className="list-preview-stage">
            <div className="list-preview-grid" dangerouslySetInnerHTML={{ __html: pagesHtml }} />
          </div>
        </section>
      </div>
    </section>
  );
}
