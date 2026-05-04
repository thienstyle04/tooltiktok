import { listIsMain } from '../lib/utils';

export default function CaptionTools({
  visible,
  dataset,
  activeDeck,
  activeList,
  tone,
  setTone,
  caption,
  setCaption,
  busy,
  onDeckSelect,
  onListSelect,
  onRequestCaption,
  onCreateList,
  onCopy,
}) {
  const decks = dataset?.decks || [];
  const allLists = activeDeck?.lists || [];
  const mainLists = allLists.filter((list) => listIsMain(list));
  const lists = mainLists.length ? mainLists : allLists.slice(0, 1);
  const selectedCaptionList = lists.find((list) => list.id === activeList?.id) || lists[0] || null;

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
          <button id="createDeckFromCaptionBtn" className="toolbar-button secondary" type="button" disabled={busy} onClick={onCreateList}>Tạo list AI</button>
          <button id="copyFullCaptionBtn" className="toolbar-button" type="button" onClick={() => onCopy([caption.headline, caption.body, caption.hashtags].filter(Boolean).join('\n\n'), 'Đã copy full caption.')}>Copy caption</button>
        </div>
      </div>

      <div className="ai-grid">
        <section className="ai-block">
          <div className="ai-block-head">
            <div>
              <p className="ai-block-label">Headline</p>
              <p className="ai-block-note">Tối đa 35 ký tự, dùng cho cover.</p>
            </div>
            <div className="ai-block-actions">
              <button id="regenHeadlineBtn" className="toolbar-button" type="button" disabled={busy} onClick={() => onRequestCaption('headline')}>Sinh lại</button>
              <button id="copyHeadlineBtn" className="toolbar-button" type="button" onClick={() => onCopy(caption.headline.trim(), 'Đã copy headline.')}>Copy</button>
            </div>
          </div>
          <textarea id="captionHeadline" className="ai-output compact" placeholder="Headline sẽ hiện ở đây..." value={caption.headline} onChange={(event) => setCaption((prev) => ({ ...prev, headline: event.target.value }))} />
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
      </div>
    </section>
  );
}
