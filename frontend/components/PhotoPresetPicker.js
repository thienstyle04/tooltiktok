'use client';
import { useId, useRef, useState } from 'react';
import { DEFAULT_PHOTO_PRESETS } from '../lib/photoPresets.mjs';
export default function PhotoPresetPicker({value, onChange, disabled, presets=DEFAULT_PHOTO_PRESETS}) {
  const [open,setOpen]=useState(false);
  const pickerId=useId();
  const triggerRef=useRef(null);
  const closePicker=()=>{setOpen(false);triggerRef.current?.focus();};
  const selected=presets.find(p=>p.id===(value||null))||presets[0];
  return <div className="photo-preset-picker" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();closePicker();}}} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
    <button ref={triggerRef} className="photo-preset-trigger" type="button" disabled={disabled} aria-expanded={open&&!disabled} aria-controls={pickerId} onClick={()=>setOpen(!open)}>
      <span className={'photo-preset-swatch'+(value?' edited':'')} aria-hidden="true" />Bảng màu: {selected.label}<span className="photo-preset-chevron" aria-hidden="true">{open&&!disabled?'−':'+'}</span>
    </button>
    {open&&!disabled?<fieldset id={pickerId} className="photo-preset-options"><legend>Chọn bảng màu cho list mới</legend>{presets.map(p=><label key={p.id||'original'} className={(value||null)===p.id?'selected':''}>
      <input type="radio" aria-label={p.label} name={pickerId} checked={(value||null)===p.id} onChange={()=>{onChange(p.id);closePicker();}} />
      <span><strong>{p.label}</strong><small>{p.id?'Tông trầm, tăng nét và chi tiết':'Giữ màu ảnh từ dữ liệu nguồn'}</small></span>
    </label>)}<p>Chỉ áp dụng cho list mới; giữ nguyên ảnh nguồn.</p></fieldset>:null}
  </div>;
}
