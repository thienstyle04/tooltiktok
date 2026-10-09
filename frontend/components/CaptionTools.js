import { useState } from 'react';
import { listIsMain } from '../lib/utils';
import PhotoPresetPicker from './PhotoPresetPicker';
import { supportsPhotoPreset } from '../lib/photoPresets.mjs';

const DATA_TEMPLATES = new Set([
  'threads-food-local', 'threads-cafe-local', 'threads-mix-local', 'threads-mix-text',
  'carousel-mau-1', 'one-way-story', 'spotlight-v5', 'spotlight-v6-green',
  'spotlight-v6-dark', 'spotlight-v6-persimmon', 'spotlight-v6-maps', 'spotlight-v6-diary',
  'summary-note', 'itinerary-note-dark', 'itinerary-note-2days', 'itinerary-note-timed', 'threads-toplist-dalat',
]);

export default function CaptionTools({
  photoPreset, photoPresets, onPhotoPresetChange, dataset, activeDeck, activeList,
  selectedListId, tone, setTone, caption, setCaption, busy, cacheReady, partners,
  onDeckSelect, onListSelect, onGeneratedListSelect, onRequestCaption,
  onCreateList, onCreateBatchLists, onCreatePartnerSpotlight, onCopy,
}) {
  const [batchCount, setBatchCount] = useState(5);
  const [partnerQuery, setPartnerQuery] = useState('');
  const decks = (dataset?.decks || []).filter(deck => !deck.creationDisabled && deck.id !== 'spotlight-partner');
  const allLists = activeDeck?.lists || [];
  const mainLists = allLists.filter(listIsMain);
  const generatedLists = allLists.filter(list => !listIsMain(list));
  const sourceLists = mainLists.length ? mainLists : allLists.slice(0, 1);
  const selectedCaptionList = sourceLists.find(list => list.id === activeList?.id) || sourceLists[0];
  const isPartner = activeDeck?.id === 'spotlight-partner';
  const isDataTemplate = DATA_TEMPLATES.has(activeDeck?.id) || activeDeck?.id?.startsWith('itinerary-note-threads-');
  const needsPhotoCache = activeDeck?.id !== 'threads-toplist-dalat'
    && activeDeck?.id !== 'itinerary-note-timed' && !activeDeck?.id?.startsWith('itinerary-note-threads-');
  const creationDisabled = busy || !activeDeck || (needsPhotoCache && !cacheReady);
  const templateName = activeDeck?.navTitle || activeDeck?.title || 'mẫu';
  const partnerEntries = Array.isArray(partners) ? partners : [];
  const filteredPartners = partnerEntries.filter(partner =>
    [partner.name, partner.section, partner.address].join(' ').toLocaleLowerCase('vi').includes(partnerQuery.trim().toLocaleLowerCase('vi')));
  const create = () => {
    if (creationDisabled) return;
    if (batchCount === 1 && (isDataTemplate || caption.coverTitle?.trim())) onCreateList();
    else onCreateBatchLists?.(batchCount);
  };
  const captionFields = [
    { id: 'captionCoverTitle', label: 'Tiêu đề bìa', key: 'coverTitle', target: 'cover_title', maxLength: 56 },
    { id: 'captionHeadline', label: 'Caption đăng bài', key: 'headline', target: 'headline' },
    { id: 'captionHashtags', label: 'Hashtags', key: 'hashtags', target: 'hashtags' },
  ];

  if (activeDeck?.creationDisabled || activeDeck?.id === 'spotlight-partner') return (
    <section className="ai-shell list-create-panel">
      <header className="list-create-head"><div><h3>Mẫu đã ngừng sử dụng</h3>
        <p>Spotlight Đối tác không còn tạo mới. List đã lưu vẫn có thể chỉnh sửa và xuất trong List đã tạo.</p></div></header>
      <div className="list-create-body"><label htmlFor="captionDeckSelect">Chọn mẫu khác</label>
        <select id="captionDeckSelect" value="" disabled={busy} onChange={event => {
          const deck = decks.find(item => item.id === event.target.value); if (deck) onDeckSelect(deck);
        }}><option value="">Chọn mẫu…</option>{decks.map(deck => <option key={deck.id} value={deck.id}>{deck.navTitle || deck.title}</option>)}</select>
      </div>
    </section>
  );

  return (
    <section className="ai-shell list-create-panel">
      <header className="list-create-head">
        <div><p className="panel-kicker">TẠO NỘI DUNG</p><h3>Tạo list mới</h3>
          <p>Chọn mẫu và cấu hình, phần còn lại để tool xử lý.</p></div>
        <span className="list-create-badge">{busy ? 'Đang xử lý' : 'Bước 2'}</span>
      </header>
      <div className="list-create-body">
        <div className={'list-create-controls' + (isPartner ? ' partner-controls' : '')}>
          <div className="list-create-field">
            <label htmlFor="captionDeckSelect">Mẫu sử dụng</label>
            <select id="captionDeckSelect" value={activeDeck?.id || ''} disabled={busy || !decks.length}
              onChange={event => { const deck = decks.find(item => item.id === event.target.value); if (deck) { setPartnerQuery(''); onDeckSelect(deck); } }}>
              {!decks.length ? <option value="">Chưa có mẫu</option> : null}
              {decks.map(deck => <option key={deck.id} value={deck.id}>{deck.navTitle || deck.title}</option>)}
            </select>
          </div>
          {!isPartner ? <div className="list-create-field">
            <label htmlFor="nonAiBatchCountSelect">Số lượng</label>
            <select id="nonAiBatchCountSelect" value={batchCount} disabled={busy} onChange={event => setBatchCount(Number(event.target.value))}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map(count => <option key={count} value={count}>{count} list</option>)}
            </select>
          </div> : null}
          {supportsPhotoPreset(activeDeck?.id) ? <div className="list-create-field">
            <span className="list-create-label">Màu ảnh</span>
            <PhotoPresetPicker value={photoPreset} presets={photoPresets} onChange={onPhotoPresetChange} disabled={busy} />
          </div> : null}
        </div>
        <div className="list-create-submit">
          <p>{isPartner ? 'Chọn đối tác bên dưới để tạo một bộ Spotlight riêng.'
            : isDataTemplate ? 'Dùng dữ liệu và hook có sẵn theo mẫu. Không cần nhập caption.'
            : 'Tự tạo nội dung theo mẫu. Caption riêng nằm trong phần tùy chọn bên dưới.'}</p>
          {!isPartner ? <button id="createDeckFromCaptionBtn" className="toolbar-button secondary list-create-primary"
            type="button" disabled={creationDisabled} onClick={create}>{busy ? 'Đang tạo…' : `Tạo ${batchCount} list`}<span aria-hidden="true">→</span></button> : null}
        </div>
        {needsPhotoCache && !cacheReady ? <p className="list-create-notice" role="status">Đang chuẩn bị ảnh Drive. Bạn có thể chọn cấu hình trước; nút tạo sẽ mở khi ảnh sẵn sàng.</p> : null}

        {isPartner ? <section className="list-create-partners">
          <label className="list-create-label" htmlFor="createPartnerSearch">Tìm đối tác</label>
          <input id="createPartnerSearch" type="search" placeholder="Tên đối tác, nhóm hoặc địa chỉ…" value={partnerQuery}
            disabled={busy} onChange={event => setPartnerQuery(event.target.value)} />
          <div className="list-create-partner-grid">
            {filteredPartners.map(partner => <button key={partner.id} className="generated-list-card" type="button"
              disabled={creationDisabled} onClick={() => onCreatePartnerSpotlight?.(partner)}>
              <span className="generated-list-copy"><strong>{partner.name}</strong><small>{partner.section} · {partner.address}</small></span>
              <span className="generated-list-action">Tạo →</span>
            </button>)}
          </div>
          {!filteredPartners.length ? <p className="list-create-empty">{partnerEntries.length ? 'Không tìm thấy đối tác phù hợp.' : 'Chưa có đối tác trong dữ liệu nguồn.'}</p> : null}
        </section> : null}

        {!isDataTemplate && !isPartner ? <details className="list-create-advanced" key={activeDeck?.id}>
          <summary>Caption tùy chọn<span>Chỉ mở khi cần nhập hoặc chỉnh riêng</span></summary>
          <div className="list-create-advanced-body">
            <div className="list-create-advanced-controls">
              <div className="list-create-field"><label htmlFor="captionListSelect">List tham chiếu</label>
                <select id="captionListSelect" value={selectedCaptionList?.id || ''} disabled={busy || !sourceLists.length}
                  onChange={event => { const list = sourceLists.find(item => item.id === event.target.value); if (list) onListSelect(list); }}>
                  {sourceLists.map(list => <option key={list.id} value={list.id}>{list.navTitle || list.title}</option>)}
                </select>
              </div>
              <div className="list-create-field"><label htmlFor="captionTone">Giọng caption</label>
                <select id="captionTone" value={tone} disabled={busy} onChange={event => setTone(event.target.value)}>
                  <option value="lich_trinh_huu_ich">Lịch trình hữu ích</option><option value="gen_z">Gen Z</option>
                  <option value="review_chan_that">Review chân thật</option><option value="ban_hang_nhe">Bán hàng nhẹ</option><option value="tinh_te">Tinh tế</option>
                </select>
              </div>
            </div>
            <div className="list-create-caption-actions">
              <button id="generateCaptionBtn" className="toolbar-button" type="button" disabled={busy} onClick={() => onRequestCaption('full')}>Gợi ý caption</button>
              <button id="copyFullCaptionBtn" className="toolbar-button" type="button" disabled={![caption.headline, caption.body, caption.hashtags].some(Boolean)}
                onClick={() => onCopy([caption.headline, caption.body, caption.hashtags].filter(Boolean).join('\n\n'), 'Đã copy caption.')}>Copy caption</button>
            </div>
            {captionFields.map(field => <div className="list-create-caption-field" key={field.key}>
              <div><label htmlFor={field.id}>{field.label}</label><span>
                <button className="toolbar-button" type="button" disabled={busy} onClick={() => onRequestCaption(field.target)}>Gợi ý lại</button>
                <button className="toolbar-button" type="button" disabled={!caption[field.key]?.trim()} onClick={() => onCopy((caption[field.key] || '').trim(), `Đã copy ${field.label.toLowerCase()}.`)}>Copy</button>
              </span></div>
              <textarea id={field.id} rows={2} maxLength={field.maxLength} value={caption[field.key] || ''} disabled={busy}
                placeholder={`Nhập ${field.label.toLowerCase()} nếu cần…`}
                onChange={event => setCaption(previous => ({ ...previous, [field.key]: event.target.value }))} />
            </div>)}
          </div>
        </details> : null}

        <section className="list-create-recent">
          <header><div><h4>List đã tạo</h4><p>{templateName}</p></div><span className="generated-list-count">{generatedLists.length}</span></header>
          {generatedLists.length ? <div className="generated-list-grid">
            {generatedLists.map((list, index) => <button key={list.id} type="button" disabled={busy}
              className={`generated-list-card ${selectedListId === list.id ? 'active' : ''}`} onClick={() => onGeneratedListSelect?.(list)}>
              <span className="generated-list-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="generated-list-copy"><strong>{list.navTitle || list.title}</strong><small>{list.pages?.length || 0} trang · {list.title}</small></span>
              <span className="generated-list-action">Mở →</span>
            </button>)}
          </div> : <p className="list-create-empty">Chưa có list mới. List tạo xong sẽ xuất hiện tại đây.</p>}
        </section>
      </div>
    </section>
  );
}
