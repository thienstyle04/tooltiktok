import { BadRequestException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

type Provider = 'deepseek' | 'gemini';
type Profile = { model: string; secret?: string };
type Config = { active: Provider; profiles: Record<Provider, Profile> };
type Session = { provider: Provider; model: string; key: string; fatal?: AiError };
// Candidate filter only: generateContent alone does not guarantee JSON support.
export function isTextModel(id: string): boolean {
  return !/(?:^|[-_.])(transcribe|transcription|audio|tts|live|image|vision-generation|embedding|embed|robotics)(?:[-_.]|$)/i.test(id);
}
export function safeAiDetail(value: unknown, key: string): string {
  let text=String(value || '');
  for (const secret of [key, encodeURIComponent(key)].filter(Boolean)) text=text.split(secret).join('[REDACTED]');
  return text.replace(/https?:\/\/\S+/gi,'[URL]').replace(/(?:AIza[\w-]+|sk-[\w-]+)/g,'[REDACTED]').replace(/(bearer\s+|(?:api[_ -]?key|authorization)\s*[:=]\s*)[^\s,;]+/gi,'$1[REDACTED]').replace(/[\r\n\t]+/g,' ').slice(0,600);
}
export class AiError extends BadRequestException {
  constructor(public readonly code: string, message: string, public readonly fatal = false) {
    super({ message, code });
  }
}
function crypt(value: string, decrypt = false): string {
  if (process.platform !== 'win32') throw new BadRequestException('Lưu key an toàn hiện yêu cầu Windows; có thể dùng biến môi trường.');
  const script = `Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); $b=${decrypt ? '[Convert]::FromBase64String($v)' : '[Text.Encoding]::UTF8.GetBytes($v)'}; $r=[Security.Cryptography.ProtectedData]::${decrypt ? 'Unprotect' : 'Protect'}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write(${decrypt ? '[Text.Encoding]::UTF8.GetString($r)' : '[Convert]::ToBase64String($r)'})`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { input: value, encoding: 'utf8', windowsHide: true, timeout: 10_000 });
  if (r.status !== 0) throw new BadRequestException('Không thể mã hóa/đọc key trên tài khoản Windows này. Hãy nhập lại key.');
  return r.stdout.trim();
}

export class AiProvider {
  private readonly scope = new AsyncLocalStorage<Session>();
  private readonly file = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'DalatStudio', 'ai-settings.json');
  private read(): Config {
    if (!fs.existsSync(this.file)) return { active: 'deepseek', profiles: { deepseek: { model: 'deepseek-chat' }, gemini: { model: '' } } };
    try {
      const c = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!['deepseek','gemini'].includes(c.active) || !c.profiles || ['deepseek','gemini'].some(id => typeof c.profiles[id]?.model !== 'string' || (c.profiles[id].secret !== undefined && typeof c.profiles[id].secret !== 'string'))) throw new Error('Invalid config');
      return c;
    }
    catch { throw new BadRequestException('Không đọc được cấu hình AI. Không tự đổi nhà cung cấp.'); }
  }
  private provider(value: unknown): Provider {
    if (value !== 'deepseek' && value !== 'gemini') throw new BadRequestException('Nhà cung cấp AI không hợp lệ.');
    return value;
  }
  private session(input?: any): Session {
    const config = this.read();
    const provider = this.provider(input?.provider ?? config.active);
    const profile = config.profiles[provider];
    const model = String(input?.model ?? profile.model).trim();
    if (model && !/^[a-zA-Z0-9._-]{1,120}$/.test(model)) throw new BadRequestException('Tên model không hợp lệ.');
    const env = provider === 'deepseek' ? process.env.DEEPSEEK_API_KEY : process.env.GEMINI_API_KEY;
    const key = input?.apiKey !== undefined ? String(input.apiKey).trim() : profile.secret ? crypt(profile.secret, true) : String(env || '').trim();
    return { provider, model, key };
  }
  status() {
    const c = this.read();
    return { active: c.active, profiles: Object.fromEntries(Object.entries(c.profiles).map(([id,p]) => [id, { model:p.model, hasKey:Boolean(p.secret || (id==='deepseek'?process.env.DEEPSEEK_API_KEY:process.env.GEMINI_API_KEY)), keySource:p.secret?'saved':(id==='deepseek'?process.env.DEEPSEEK_API_KEY:process.env.GEMINI_API_KEY)?'environment':'none' }])) };
  }
  async save(input: any) {
    if (input.activate && input.removeKey) throw new BadRequestException('Không thể vừa xóa key vừa kích hoạt.');
    const c = this.read(), provider = this.provider(input.provider);
    if (input.activate) await this.test(input);
    const model = String(input.model ?? c.profiles[provider].model).trim();
    if (model && !/^[a-zA-Z0-9._-]{1,120}$/.test(model)) throw new BadRequestException('Tên model không hợp lệ.');
    const profile = { ...c.profiles[provider], model };
    if (input.removeKey) delete profile.secret;
    else if (input.apiKey !== undefined) {
      if (!String(input.apiKey).trim()) throw new BadRequestException('Key trống. Dùng nút Xóa key nếu cần.');
      profile.secret = crypt(String(input.apiKey).trim());
    }
    c.profiles[provider] = profile;
    if (input.activate) c.active = provider;
    fs.mkdirSync(path.dirname(this.file), { recursive:true });
    const tmp = this.file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(c), { mode:0o600 });
    fs.renameSync(tmp, this.file);
    return this.status();
  }
  async models(input: any) {
    const s = this.session(input); this.requireKey(s, false);
    if (s.provider === 'deepseek') return { models:[{ id:'deepseek-chat', name:'DeepSeek Chat' }] };
    const models: Array<{id:string;name:string}> = [];
    let token = '';
    do {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000' + (token?'&pageToken='+encodeURIComponent(token):''), { headers:{'x-goog-api-key':s.key}, signal:AbortSignal.timeout(15_000), redirect:'error' }).catch(()=>{throw new AiError('NETWORK','Không kết nối được Gemini.');});
      const data = await r.json(); if(!r.ok) throw this.failure(s,r.status,data);
      for(const m of data.models || []) {
        const id=String(m.name).replace(/^models\//,'');
        if(m.supportedGenerationMethods?.includes('generateContent') && isTextModel(id)) models.push({ id, name:m.displayName || m.name });
      }
      token=data.nextPageToken || '';
    } while(token);
    return { models: models.sort((a,b)=>a.id.localeCompare(b.id)) };
  }
  async test(input: any) {
    const s = this.session(input);
    const text = await this.request(s, { messages:[{role:'user',content:'Return only this JSON object: {"ok":true}'}], max_tokens:256 });
    if (JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g,'')).ok !== true) throw new AiError('INVALID_OUTPUT','Model không trả đúng cấu trúc JSON kiểm thử.');
    return { ok:true, provider:s.provider, model:s.model };
  }
  run<T>(task: () => Promise<T>): Promise<T> {
    return this.scope.getStore() ? task() : this.scope.run(this.session(), task);
  }
  current() { const s=this.scope.getStore() || this.session(); return {provider:s.provider,model:s.model}; }
  hasKey() { return Boolean((this.scope.getStore() || this.session()).key); }
  fatalError() { return this.scope.getStore()?.fatal; }
  async chat(body: any): Promise<Response> {
    const s=this.scope.getStore() || this.session();
    if(s.fatal) throw s.fatal;
    try { return new Response(JSON.stringify({choices:[{message:{content:await this.request(s,body)}}]}),{headers:{'Content-Type':'application/json'}}); }
    catch(e) { if(e instanceof AiError && e.fatal) s.fatal=e; throw e; }
  }
  private requireKey(s:Session, requireModel=true) {
    if(!s.key) throw new AiError('MISSING_KEY', `Chưa có API key ${s.provider}. Mở Dữ liệu & Cài đặt → Nhà cung cấp AI.`, true);
    if(requireModel && !s.model) throw new AiError('MISSING_MODEL','Chưa chọn model AI.',true);
  }
  private failure(s:Session,status:number,data:any) {
    const detail=String(data?.error?.message || '').toLowerCase();
    const quota=status===402 || (status===429 && /billing|balance|credit|quota.*exceed|daily|per.day/.test(detail));
    const code=quota?'QUOTA':status===401||status===403?'AUTH':status===400||status===404?'MODEL':status===429?'RATE_LIMIT':'UPSTREAM';
    const reason=quota?'Hết số dư hoặc quota API.':code==='AUTH'?'API key không hợp lệ hoặc không đủ quyền.':code==='MODEL'?'Model hoặc tham số không được API chấp nhận.':code==='RATE_LIMIT'?'API đang giới hạn yêu cầu.':'Nhà cung cấp AI tạm thời lỗi.';
    const diagnostic=safeAiDetail(data?.error?.message,s.key);
    return new AiError(code,`${s.provider} (${s.model}): ${reason} HTTP ${status}.${diagnostic ? ` Chi tiết API: ${diagnostic}` : ''} Không tự chuyển nhà cung cấp.`,['QUOTA','AUTH','MODEL'].includes(code));
  }
  private async request(s:Session,body:any):Promise<string> {
    this.requireKey(s);
    const gemini=s.provider==='gemini';
    if(gemini && !isTextModel(s.model)) throw new AiError('MODEL','Model chuyên âm thanh/ảnh không phù hợp tạo caption JSON. Hãy tải danh sách và chọn model văn bản.',true);
    const url=gemini?`https://generativelanguage.googleapis.com/v1beta/models/${s.model}:generateContent`:'https://api.deepseek.com/chat/completions';
    const payload=gemini?{
      systemInstruction:{parts:[{text:(body.messages || []).filter((m:any)=>m.role==='system').map((m:any)=>m.content).join('\n') || 'Return valid JSON.'}]},
      contents:(body.messages || []).filter((m:any)=>m.role!=='system').map((m:any)=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),
      generationConfig:{responseMimeType:'application/json',maxOutputTokens:Math.max(Number(body.max_tokens)||900,4096)},
    }:{...body,model:s.model,stream:false};
    for(let attempt=0;attempt<2;attempt++) {
      try {
        const response=await fetch(url,{method:'POST',headers:gemini?{'Content-Type':'application/json','x-goog-api-key':s.key}:{'Content-Type':'application/json',Authorization:`Bearer ${s.key}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(30_000),redirect:'error'});
        const data=await response.json();
        if(!response.ok) {
          const error=this.failure(s,response.status,data);
          if(!attempt && !error.fatal && (response.status===429 || response.status>=500)){await new Promise(r=>setTimeout(r,1000));continue;}
          throw error;
        }
        const candidate=gemini?data.candidates?.[0]:data.choices?.[0];
        if(!gemini && candidate?.finish_reason && candidate.finish_reason !== 'stop') throw new AiError('INVALID_OUTPUT','AI không hoàn tất nội dung (hết token hoặc bị chặn).');
        if(gemini && (data.promptFeedback?.blockReason || candidate?.finishReason!=='STOP')) throw new AiError('INVALID_OUTPUT','Gemini không hoàn tất nội dung (bị chặn hoặc hết giới hạn token).');
        const text=gemini?candidate?.content?.parts?.filter((p:any)=>!p.thought).map((p:any)=>p.text||'').join(''):candidate?.message?.content;
        if(!text) throw new AiError('INVALID_OUTPUT','AI không trả nội dung.');
        try { JSON.parse(String(text).replace(/^```(?:json)?\s*|\s*```$/g,'')); } catch {throw new AiError('INVALID_OUTPUT','AI trả nội dung không phải JSON hợp lệ.');}
        return text;
      } catch(e) {
        if(e instanceof AiError) throw e;
        if(!attempt && (e as Error)?.name==='TypeError'){await new Promise(r=>setTimeout(r,500));continue;}
        throw new AiError('NETWORK','Không nhận được phản hồi AI trong thời gian cho phép. Hãy kiểm tra kết nối; không tự chuyển nhà cung cấp.');
      }
    }
    throw new AiError('NETWORK','Không kết nối được AI.');
  }
}
export const aiProvider = new AiProvider();
