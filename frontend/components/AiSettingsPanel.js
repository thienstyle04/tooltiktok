'use client';
import { useEffect, useState } from 'react';

export default function AiSettingsPanel() {
  const [status,setStatus]=useState(null),[provider,setProvider]=useState('deepseek'),[model,setModel]=useState('deepseek-chat');
  const [key,setKey]=useState(''),[models,setModels]=useState([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [loading,setLoading]=useState(true),[reload,setReload]=useState(0);
  async function call(path='',method='GET',body) {
    const r=await fetch('/api/ai/settings'+path,{method,headers:{'Content-Type':'application/json','x-dalat-ai-settings':'1'},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(75000)});
    const data=await r.json();if(!r.ok)throw Error(data.message || 'Không cập nhật được cấu hình AI.');return data;
  }
  useEffect(()=>{let disposed=false;setLoading(true);setMessage('');call().then(s=>{if(!disposed){setStatus(s);setProvider(s.active);setModel(s.profiles[s.active].model);}}).catch(e=>{if(!disposed)setMessage(e.message);}).finally(()=>{if(!disposed)setLoading(false);});return()=>{disposed=true;};},[reload]);
  function choose(id){setProvider(id);setModel(status?.profiles[id]?.model || '');setKey('');setModels([]);setMessage('');}
  async function action(kind){
    setBusy(true);setMessage('');
    try {
      const input={provider,model,...(key.trim()?{apiKey:key.trim()}:{})};
      if(kind==='models'){const r=await call('/models','POST',input);setModels(r.models);if(!r.models.some(m=>m.id===model))setModel('');setMessage(r.models.length?`Đã tải ${r.models.length} model ứng viên. Chọn trong danh sách rồi kiểm tra khả năng trả JSON; chưa đổi nhà cung cấp đang dùng.`:'Không tìm thấy model văn bản phù hợp. Kiểm tra quyền API của project.');}
      else if(kind==='test'){await call('/test','POST',input);setMessage('Kết nối và phản hồi JSON hợp lệ. Kết quả không bảo đảm quota cho cả batch.');}
      else {const r=await call('','PUT',kind==='remove'?{provider,removeKey:true}: {...input,activate:kind==='save'});setStatus(r);setKey('');setMessage(kind==='remove'?'Đã xóa key lưu riêng. Nếu có key môi trường, tool sẽ dùng key môi trường.':kind==='store'?'Đã lưu cấu hình trên máy, chưa kiểm tra kết nối. Không đổi nhà cung cấp đang dùng.':'Đã lưu và kích hoạt. Áp dụng cho tác vụ bắt đầu tiếp theo.');}
    }catch(e){setMessage(e.message);}finally{setBusy(false);}
  }
  return <section className="settings-card ai-settings-card" aria-label="Nhà cung cấp AI">
    <h3>Nhà cung cấp AI</h3>
    <p>Đang dùng: <strong>{status?`${status.active} · ${status.profiles[status.active].model}`:loading?'Đang đọc cấu hình…':'Không đọc được cấu hình'}</strong>. Không tự chuyển khi hết tiền/quota.</p>
    {!status && !loading && <button type="button" onClick={()=>setReload(n=>n+1)}>Thử tải lại cấu hình</button>}
    <fieldset disabled={busy || !status} style={{display:'grid',gap:12,border:0,padding:0}}>
      <label>Nhà cung cấp <select value={provider} onChange={e=>choose(e.target.value)}><option value="deepseek">DeepSeek</option><option value="gemini">Gemini</option></select></label>
      <label>API key mới <input type="password" autoComplete="new-password" value={key} onChange={e=>setKey(e.target.value)} placeholder="Để trống để giữ key đang dùng" /></label>
      <small>Nguồn key: {status?.profiles[provider]?.keySource==='saved'?'Đã lưu mã hóa trên máy':status?.profiles[provider]?.keySource==='environment'?'Biến môi trường':'Chưa có key'}. Key đã lưu không được hiển thị lại.</small>
      <label>Model <select aria-label="Model" value={model} onChange={e=>setModel(e.target.value)}>
        <option value="">{models.length?'Chọn model để tạo bài':'Bấm Tải danh sách model trước'}</option>
        {model && !models.some(m=>m.id===model) && <option value={model}>{model} — cấu hình đã lưu, chưa xác minh</option>}
        {models.map(m=><option key={m.id} value={m.id}>{m.name} ({m.id})</option>)}
      </select></label>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <button type="button" onClick={()=>action('models')}>Tải danh sách model</button>
        <button type="button" disabled={!model} onClick={()=>action('test')}>Kiểm tra kết nối</button>
        <button type="button" disabled={!model} onClick={()=>action('save')}>Lưu và sử dụng</button>
        <button type="button" onClick={()=>action('store')}>Lưu cấu hình</button>
        <button type="button" disabled={status?.profiles[provider]?.keySource!=='saved'} onClick={()=>{if(window.confirm('Xóa key lưu riêng của nhà cung cấp này?'))action('remove');}}>Xóa key lưu riêng</button>
      </div>
    </fieldset>
    <p>Lưu cấu hình chỉ lưu key/model trên máy, không gọi API, không đổi nhà cung cấp đang dùng. Chọn lại nhà cung cấp để dùng cấu hình đã lưu, kể cả sau khi mở lại tool.</p>
    <p>Kiểm tra kết nối và Lưu và sử dụng đều gửi một yêu cầu AI ngắn, có thể tính phí. Không nhập key vào chat hoặc chia sẻ ảnh chụp key.</p>
    {provider==='gemini' && <p>Google AI Pro không xác nhận quota API. Tạo key tại <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a> và kiểm tra quota/thanh toán của project. Nội dung gửi API tuân theo chính sách dữ liệu của gói API bạn chọn.</p>}
    <p role="status">{busy?'Đang xử lý…':message}</p>
  </section>;
}
