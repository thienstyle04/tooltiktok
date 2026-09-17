'use client';
import { useState } from 'react';
import { listIsMain } from '../lib/utils';

export default function StudioListLibrary({dataset, selected, setSelected, onEdit, onExport, onDelete}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState({});
  const entries = (dataset?.decks || []).flatMap(deck => (deck.lists || []).filter(list => !listIsMain(list)).map(list => ({deck, list})));
  const shown = entries.filter(({deck,list}) => (!filter || deck.id === filter) && `${deck.navTitle} ${list.navTitle} ${list.title}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));
  const chosen = entries.filter(({list}) => selected.has(list.id));
  const groups = (dataset?.decks || []).map(deck=>({deck, entries:shown.filter(entry=>entry.deck.id===deck.id)})).filter(group=>group.entries.length);
  const populatedDecks = (dataset?.decks || []).filter(deck=>entries.some(entry=>entry.deck.id===deck.id));
  return <section className="studio-library">
    <div className="studio-library-filters"><label>Tìm list<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tên list hoặc mẫu…"/></label><label>Lọc mẫu<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="">Mẫu có list đã tạo</option>{populatedDecks.map(deck=><option key={deck.id} value={deck.id}>{deck.navTitle} ({entries.filter(entry=>entry.deck.id===deck.id).length} list)</option>)}</select></label></div>
    <div className="studio-library-actions"><span>{chosen.length} list · {chosen.reduce((n,{list})=>n+(list.pages?.length || 0),0)} trang đã chọn</span><button className="toolbar-button" onClick={()=>setSelected(new Set(shown.map(({list})=>list.id)))}>Chọn kết quả</button><button className="toolbar-button" onClick={()=>setSelected(new Set())}>Bỏ chọn</button><button className="toolbar-button primary" disabled={!chosen.length} onClick={onExport}>Xuất đã chọn</button><button className="toolbar-button" disabled={!chosen.length} onClick={onDelete}>Xóa đã chọn</button></div>
    <div className="studio-library-groups">{groups.map(({deck,entries:group})=><section className="studio-library-group" key={deck.id}>
      <header><input type="checkbox" aria-label={`Chọn tất cả ${deck.navTitle}`} checked={group.every(({list})=>selected.has(list.id))} onChange={e=>{const checked=e.target.checked;setSelected(previous=>{const next=new Set(previous);group.forEach(({list})=>checked?next.add(list.id):next.delete(list.id));return next;});}}/><button type="button" aria-expanded={Boolean(expanded[deck.id])} onClick={()=>setExpanded(previous=>({...previous,[deck.id]:!previous[deck.id]}))}><strong>{deck.navTitle}</strong><span>{group.length} list · {group.reduce((n,{list})=>n+list.pages.length,0)} trang</span><b>{expanded[deck.id]?'Thu gọn ↑':'Xem list ↓'}</b></button></header>
      {expanded[deck.id] && <div className="studio-library-rows">{group.map(({list})=><article className="studio-library-row" key={list.id}><input type="checkbox" aria-label={`Chọn ${list.navTitle || list.title}`} checked={selected.has(list.id)} onChange={()=>setSelected(previous=>{const next=new Set(previous);next.has(list.id)?next.delete(list.id):next.add(list.id);return next;})}/><div><strong>{list.navTitle || list.title}</strong><p>{list.pages?.length || 0} trang</p></div><button className="toolbar-button" onClick={()=>onEdit(deck,list)}>Chỉnh sửa</button></article>)}</div>}
    </section>)}</div>
    {!shown.length && <p className="empty-state">Chưa có list phù hợp. Chọn “Làm bài” để tạo list hoặc đổi bộ lọc.</p>}
  </section>;
}
