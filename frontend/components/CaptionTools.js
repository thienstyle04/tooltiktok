import { useRef, useState } from 'react';
import { listIsMain } from '../lib/utils';

export default function CaptionTools({
  visible,
  dataset,
  activeDeck,
  activeList,
  selectedListId,
  tone,
  setTone,
  caption,
  setCaption,
  busy,
  partners,
  onDeckSelect,
  onListSelect,
  onGeneratedListSelect,
  onRequestCaption,
  onCreateList,
  onCreateBatchLists,
  onCreatePartnerSpotlight,
  onCopy,
}) {
  const [batchCount, setBatchCount] = useState(5);
  const [batchDropdownOpen, setBatchDropdownOpen] = useState(false);
  const batchDropdownRef = useRef(null);
  const decks = dataset?.decks || [];
  const allLists = activeDeck?.lists || [];
  const mainLists = allLists.filter((list) => listIsMain(list));
  const generatedLists = allLists.filter((list) => !listIsMain(list));
  const lists = mainLists.length ? mainLists : allLists.slice(0, 1);
  const selectedCaptionList = lists.find((list) => list.id === activeList?.id) || lists[0] || null;
  const isSpotlightPartnerDeck = activeDeck?.id === 'spotlight-partner';

  const handleDeckChange = (event) => {
    const deck = decks.find((item) => item.id === event.target.value);
    if (!deck) return;
    onDeckSelect(deck);
  };

  const handleListChange = (event) => {
    const list = lists.find((item) => item.id === event.target.value);
    if (list) onListSelect(list);
  };

  return (
    <section className="ai-shell">
      <div className="panel-head ai-panel-head">
        <div>
          <p className="panel-kicker">Caption AI</p>
          <h3 className="panel-title">Tạo caption & list mới</h3>
        </div>
        <span className="ai-state-pill">{visible ? 'Đang mở' : 'Sẵn sàng'}</span>
      </div>

      <div className="ai-toolbar">
        <div className="caption-target-picker">
          <div className="caption-target-field">
            <label className="ai-tone-label" htmlFor="captionDeckSelect">Mẫu deck</label>
            <select
              id="captionDeckSelect"
              className="ai-tone-select"
              value={activeDeck?.id || ''}
              disabled={busy || decks.length === 0}
              onChange={handleDeckChange}
            >
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id}>{deck.navTitle || deck.title}</option>
              ))}
            </select>
          </div>
          <div className="caption-target-field">
            <label className="ai-tone-label" htmlFor="captionListSelect">List cần sinh caption</label>
            <select
              id="captionListSelect"
              className="ai-tone-select"
              value={selectedCaptionList?.id || ''}
              disabled={busy || lists.length === 0}
              onChange={handleListChange}
            >
              {lists.map((list) => (
                <option key={list.id} value={list.id}>{list.navTitle || list.title}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="ai-tone-group">
          <label className="ai-tone-label" htmlFor="captionTone">Tone caption</label>
          <select id="captionTone" className="ai-tone-select" value={tone} onChange={(event) => setTone(event.target.value)}>
            <option value="lich_trinh_huu_ich">Lịch trình hữu ích</option>
            <option value="gen_z">Gen Z</option>
            <option value="review_chan_that">Review chân thật</option>
            <option value="ban_hang_nhe">Bán hàng nhẹ</option>
            <option value="tinh_te">Tinh tế</option>
          </select>
        </div>
        <div className="ai-actions">
          <button id="generateCaptionBtn" className="toolbar-button secondary" type="button" disabled={busy} onClick={() => onRequestCaption('full')}>Tạo caption</button>
          {!isSpotlightPartnerDeck ? (
          <div className="ai-batch-group" ref={batchDropdownRef}>
            <button
              id="createDeckFromCaptionBtn"
              className="toolbar-button secondary ai-batch-main"
              type="button"
              disabled={busy}
              onClick={() => {
                setBatchDropdownOpen(false);
                if (batchCount === 1) {
                  onCreateList();
                } else {
                  onCreateBatchLists?.(batchCount);
                }
              }}
            >
              {batchCount === 1 ? 'Tạo list AI' : `Tạo ${batchCount} list`}
            </button>
            <button
              className="toolbar-button secondary ai-batch-arrow"
              type="button"
              disabled={busy}
              aria-label="Chọn số lượng list"
              onClick={() => setBatchDropdownOpen((prev) => !prev)}
            >
              ▾
            </button>
            {batchDropdownOpen && (
              <div className="ai-batch-dropdown">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`ai-batch-option${batchCount === n ? ' active' : ''}`}
                    onClick={() => {
                      setBatchCount(n);
                      setBatchDropdownOpen(false);
                    }}
                  >
                    {n === 1 ? 'Tạo 1 list' : `Tạo ${n} list`}
                  </button>
                ))}
              </div>
            )}
          </div>
          ) : null}
          <button id="copyFullCaptionBtn" className="toolbar-button" type="button" onClick={() => onCopy([caption.headline, caption.body, caption.hashtags].filter(Boolean).join('\n\n'), 'Đã copy full caption.')}>Copy caption</button>
        </div>
      </div>

      <div className="ai-grid">
        <section className="ai-block">
          <div className="ai-block-head">
            <div>
              <p className="ai-block-label">Tiêu đề cover</p>
              <p className="ai-block-note">Tối đa 35 ký tự, dùng làm title trang cover.</p>
            </div>
            <div className="ai-block-actions">
              <button id="regenCoverTitleBtn" className="toolbar-button" type="button" disabled={busy} onClick={() => onRequestCaption('cover_title')}>Sinh lại</button>
              <button id="copyCoverTitleBtn" className="toolbar-button" type="button" onClick={() => onCopy((caption.coverTitle || '').trim(), 'Đã copy tiêu đề cover.')}>Copy</button>
            </div>
          </div>
          <textarea
            id="captionCoverTitle"
            className="ai-output compact"
            placeholder="Tiêu đề cover sẽ hiện ở đây..."
            maxLength={35}
            value={caption.coverTitle || ''}
            onChange={(event) => setCaption((prev) => ({ ...prev, coverTitle: event.target.value.slice(0, 35) }))}
          />
        </section>

        <section className="ai-block">
          <div className="ai-block-head">
            <div>
              <p className="ai-block-label">Caption đăng bài</p>
              <p className="ai-block-note">Nội dung copy dán khi đăng TikTok.</p>
            </div>
            <div className="ai-block-actions">
              <button id="regenHeadlineBtn" className="toolbar-button" type="button" disabled={busy} onClick={() => onRequestCaption('headline')}>Sinh lại</button>
              <button id="copyHeadlineBtn" className="toolbar-button" type="button" onClick={() => onCopy(caption.headline.trim(), 'Đã copy caption đăng bài.')}>Copy</button>
            </div>
          </div>
          <textarea id="captionHeadline" className="ai-output compact" placeholder="Caption đăng bài sẽ hiện ở đây..." value={caption.headline} onChange={(event) => setCaption((prev) => ({ ...prev, headline: event.target.value }))} />
        </section>

        <section className="ai-block">
          <div className="ai-block-head">
            <div>
              <p className="ai-block-label">Body</p>
              <p className="ai-block-note">Phần giải thích ngắn cho caption.</p>
            </div>
            <div className="ai-block-actions">
              <button id="regenBodyBtn" className="toolbar-button" type="button" disabled={busy} onClick={() => onRequestCaption('body')}>Sinh lại</button>
              <button id="copyBodyBtn" className="toolbar-button" type="button" onClick={() => onCopy(caption.body.trim(), 'Đã copy body.')}>Copy</button>
            </div>
          </div>
          <textarea id="captionBody" className="ai-output" placeholder="Body caption sẽ hiện ở đây..." value={caption.body} onChange={(event) => setCaption((prev) => ({ ...prev, body: event.target.value }))} />
        </section>

        <section className="ai-block">
          <div className="ai-block-head">
            <div>
              <p className="ai-block-label">Hashtags</p>
              <p className="ai-block-note">Đúng 5 hashtag cho TikTok.</p>
            </div>
            <div className="ai-block-actions">
              <button id="regenHashtagsBtn" className="toolbar-button" type="button" disabled={busy} onClick={() => onRequestCaption('hashtags')}>Sinh lại</button>
              <button id="copyHashtagsBtn" className="toolbar-button" type="button" onClick={() => onCopy(caption.hashtags.trim(), 'Đã copy hashtags.')}>Copy</button>
            </div>
          </div>
          <textarea id="captionHashtags" className="ai-output compact" placeholder="Hashtags sẽ hiện ở đây..." value={caption.hashtags} onChange={(event) => setCaption((prev) => ({ ...prev, hashtags: event.target.value }))} />
        </section>

        {isSpotlightPartnerDeck ? (
        <section className="ai-block generated-list-panel">
          <div className="ai-block-head generated-list-head">
            <div>
              <p className="ai-block-label">Spotlight Đối tác</p>
              <p className="ai-block-note">Chọn đối tác để sinh bộ ảnh spotlight riêng.</p>
            </div>
          </div>
          {(partners || []).length > 0 ? (
            <div className="partner-spotlight-picker">
              <div className="generated-list-grid">
                {(partners || []).map((partner) => (
                  <button
                    key={partner.id}
                    type="button"
                    className="generated-list-card"
                    disabled={busy}
                    onClick={() => onCreatePartnerSpotlight?.(partner)}
                  >
                    <span className="generated-list-index">{partner.imageCount}</span>
                    <span className="generated-list-copy">
                      <strong>{partner.name}</strong>
                      <small>{partner.section} · {partner.address}</small>
                    </span>
                    <span className="generated-list-action">Tạo</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="generated-list-empty">Chưa có đối tác nào trong dữ liệu.</p>
          )}
        </section>
        ) : null}

        <section className="ai-block generated-list-panel">
          <div className="ai-block-head generated-list-head">
            <div>
              <p className="ai-block-label">List AI đã tạo</p>
              <p className="ai-block-note">{generatedLists.length} list mới trong mẫu {activeDeck?.navTitle || activeDeck?.title || 'đang chọn'}.</p>
            </div>
            <span className="generated-list-count">{String(generatedLists.length).padStart(2, '0')}</span>
          </div>

          {generatedLists.length > 0 ? (
            <div className="generated-list-grid">
              {generatedLists.map((list, index) => (
                <button
                  key={list.id}
                  type="button"
                  className={`generated-list-card ${selectedListId === list.id ? 'active' : ''}`}
                  onClick={() => onGeneratedListSelect?.(list)}
                >
                  <span className="generated-list-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="generated-list-copy">
                    <strong>{list.navTitle || list.title}</strong>
                    <small>{list.pages?.length || 0} trang · {list.title}</small>
                  </span>
                  <span className="generated-list-action">Xem</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="generated-list-empty">Chưa có list AI mới cho mẫu này.</p>
          )}
        </section>
      </div>
    </section>
  );
}
