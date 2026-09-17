import SlideCard from './SlideCard';
import FittedStudioPreview from './FittedStudioPreview';

export default function PreviewDashboardPanel({dataset, activeDeck, activeList, activeDeckId, activeListId, selectedPageIndex, onDeckSelect, onListSelect, onPageSelect, loading}) {
  const decks = dataset?.decks || [];
  const lists = activeDeck?.lists || [];
  const pages = activeList?.pages || [];
  const index = Math.min(Math.max(0, selectedPageIndex || 0), Math.max(0, pages.length - 1));
  return <div className="studio-editor-preview">
    <section className="studio-page-picker">
      <h3>Trang trong list</h3>
      <label>Mẫu<select value={activeDeckId || ''} onChange={e=>{const deck=decks.find(d=>d.id===e.target.value);if(deck)onDeckSelect(deck);}}>{decks.map(deck=><option key={deck.id} value={deck.id}>{deck.navTitle}</option>)}</select></label>
      <label>List<select value={activeListId || ''} onChange={e=>{const list=lists.find(l=>l.id===e.target.value);if(list)onListSelect(list);}}>{lists.map(list=><option key={list.id} value={list.id}>{list.navTitle || list.title}</option>)}</select></label>
      <nav className="studio-page-picker-list" aria-label="Trang trong list">{pages.map((page,i)=><button key={i} type="button" aria-current={i===index?'page':undefined} onClick={()=>onPageSelect(activeList.id,i)}><b>{String(i+1).padStart(2,'0')}</b><span>{page.chipText || page.title || `Trang ${i+1}`}</span></button>)}</nav>
    </section>
    <section className="studio-selected-preview" aria-label="Preview trang đang chọn">
      <header><h3>Trang {index+1}/{pages.length}</h3><span>{pages[index]?.chipText || pages[index]?.title}</span></header>
      {pages[index] ? <FittedStudioPreview key={`${activeList.id}-${index}`}><SlideCard list={activeList} page={pages[index]} index={index} selected onSelect={onPageSelect} coverImageUrls={dataset?.source?.coverImageUrls || []}/></FittedStudioPreview> : <p>{loading?'Đang tải dữ liệu…':'Mẫu chưa có trang. Chọn Tạo list để bắt đầu.'}</p>}
    </section>
  </div>;
}
