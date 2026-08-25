import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import mammoth from 'mammoth';

import { HookMode, HookSourceSummary, HookSourceType, HookSourcesResponse } from '../../../common/interfaces/guide.types';

export const MAX_HOOK_SOURCE_FILE_BYTES = 5 * 1024 * 1024;
export const FESTIVAL_HOOK_DESTINATION_ID = 'dalat';
export const FESTIVAL_HOOK_DECK_IDS = ['spotlight-guide', 'spotlight-v2', 'spotlight-v3', 'carousel-mau-1'] as const;

export interface HookSourceUpload { buffer: Buffer; originalname: string; size: number; mimetype?: string }
type StoredSource = {
  id: string; name: string; type: HookSourceType; docId?: string; docUrl?: string;
  originalFileName?: string; hooks: string[]; usedKeys: string[]; revision: string;
  updatedAt: string; lastLoadedAt: string; lastError?: string;
};
type State = { version: 1; mode: HookMode; activeSourceId: string; updatedAt: string; sources: StoredSource[] };
export type HookReservation = { token: string; hook: string; sourceId: string; sourceRevision: string };
type SourceInput = { name?: unknown; docUrl?: unknown };

const EMPTY_STATE: State = { version: 1, mode: 'normal', activeSourceId: '', updatedAt: '', sources: [] };
const keyOf = (value: unknown) => String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi-VN');

function normalizeName(value: unknown): string {
  const name = String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 60) throw new Error('Tên bộ hook phải có từ 2 đến 60 ký tự.');
  return name;
}

export function parseFestivalHookText(text: string): string[] {
  const seen = new Set<string>();
  const hooks: string[] = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const hook = raw.replace(/^\uFEFF/, '').replace(/^\s*(?:[-–—•*]|\d+[.)])\s+/, '').replace(/\s+/g, ' ').trim();
    const key = keyOf(hook);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    hooks.push(hook);
  }
  return hooks;
}

function docIdFromUrl(value: unknown): string {
  const id = String(value || '').trim().match(/^https:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/i)?.[1] || '';
  if (!id) throw new Error('Link Google Docs không hợp lệ.');
  return id;
}

async function fetchGoogleDoc(docId: string): Promise<string> {
  const response = await fetch(`https://docs.google.com/document/d/${encodeURIComponent(docId)}/export?format=txt`, {
    headers: { 'User-Agent': 'Dalat Carousel Hook Source Reader' }, redirect: 'follow', signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`Google Docs HTTP ${response.status}. Hãy mở quyền "Bất kỳ ai có đường liên kết".`);
  if (!/text\/plain/i.test(String(response.headers.get('content-type') || ''))) {
    throw new Error('Google Docs chưa cho phép tải nội dung dạng văn bản công khai.');
  }
  return response.text();
}

async function readUpload(file: HookSourceUpload): Promise<{ text: string; type: HookSourceType; fileName: string }> {
  if (!file?.buffer?.length) throw new Error('Vui lòng chọn file DOCX hoặc TXT.');
  if (file.buffer.byteLength > MAX_HOOK_SOURCE_FILE_BYTES || Number(file.size || 0) > MAX_HOOK_SOURCE_FILE_BYTES) {
    throw new Error('File hook vượt quá giới hạn 5 MB.');
  }
  const fileName = path.basename(String(file.originalname || '')).trim();
  if (/\.txt$/i.test(fileName)) return { text: file.buffer.toString('utf8'), type: 'txt', fileName };
  if (/\.docx$/i.test(fileName)) {
    if (file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b) throw new Error('File DOCX không hợp lệ.');
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return { text: result.value, type: 'docx', fileName };
  }
  throw new Error('Chỉ chấp nhận file .docx hoặc .txt.');
}

export class FestivalHookSourceStore {
  private state: State;
  private readonly statePath: string;
  private readonly reservations = new Map<string, { sourceId: string; key: string }>();
  private mutating = false;

  constructor(private readonly dataRoot: string, private readonly fetchDoc = fetchGoogleDoc, private readonly random = Math.random) {
    this.statePath = path.join(dataRoot, 'hook-sources.dalat.json');
    this.state = this.load();
  }

  getStatus(activeDestinationId: string): HookSourcesResponse {
    const available = activeDestinationId === FESTIVAL_HOOK_DESTINATION_ID;
    return {
      destinationId: FESTIVAL_HOOK_DESTINATION_ID, available,
      mode: available ? this.state.mode : 'normal',
      activeSourceId: available && this.state.mode === 'festival' ? this.state.activeSourceId : '',
      eligibleDeckIds: [...FESTIVAL_HOOK_DECK_IDS],
      sources: this.state.sources.map((source) => this.summary(source, available)),
    };
  }

  async create(input: SourceInput, file?: HookSourceUpload): Promise<void> {
    this.beginMutation();
    try {
    const name = normalizeName(input.name); this.assertUniqueName(name);
    const docUrl = String(input.docUrl || '').trim();
    if (Boolean(docUrl) === Boolean(file?.buffer?.length)) throw new Error('Hãy cung cấp đúng một nguồn: Link Google Docs hoặc file DOCX/TXT.');
    const loaded = docUrl ? await this.loadDoc(docUrl) : await this.loadFile(file as HookSourceUpload);
    const now = new Date().toISOString();
    this.state.sources.push({ id: `hook-${crypto.randomUUID()}`, name, ...loaded, usedKeys: [], revision: crypto.randomUUID(), updatedAt: now, lastLoadedAt: now });
    this.persist();
    } finally {
      this.mutating = false;
    }
  }

  async update(id: string, input: SourceInput, file?: HookSourceUpload): Promise<void> {
    this.beginMutation();
    try {
    const source = this.requireSource(id);
    const name = input.name === undefined || String(input.name).trim() === '' ? source.name : normalizeName(input.name);
    this.assertUniqueName(name, source.id);
    const docUrl = String(input.docUrl || '').trim();
    if (docUrl && file?.buffer?.length) throw new Error('Không thể gửi đồng thời Link Google Docs và file.');
    const loaded = docUrl ? await this.loadDoc(docUrl) : file?.buffer?.length ? await this.loadFile(file) : null;
    const now = new Date().toISOString();
    if (loaded) {
      delete source.docId;
      delete source.docUrl;
      delete source.originalFileName;
    }
    Object.assign(source, loaded || {}, { name, updatedAt: now });
    if (loaded) Object.assign(source, { usedKeys: [], revision: crypto.randomUUID(), lastLoadedAt: now, lastError: '' });
    this.persist();
    } finally {
      this.mutating = false;
    }
  }

  async refresh(id: string): Promise<void> {
    this.beginMutation();
    try {
    const source = this.requireSource(id);
    if (source.type !== 'google-doc' || !source.docId) throw new Error('Chỉ nguồn Google Docs mới có thể tải lại.');
    try {
      const hooks = this.hooksFromText(await this.fetchDoc(source.docId));
      const now = new Date().toISOString();
      Object.assign(source, { hooks, usedKeys: [], revision: crypto.randomUUID(), updatedAt: now, lastLoadedAt: now, lastError: '' });
      this.persist();
    } catch (error) {
      source.lastError = error instanceof Error ? error.message : String(error);
      source.updatedAt = new Date().toISOString(); this.persist(); throw error;
    }
    } finally {
      this.mutating = false;
    }
  }

  setMode(mode: HookMode, sourceId: string, activeDestinationId: string): void {
    this.assertMutable();
    if (activeDestinationId !== FESTIVAL_HOOK_DESTINATION_ID) throw new Error('Hook lễ chỉ áp dụng cho nguồn Đà Lạt.');
    if (mode !== 'normal' && mode !== 'festival') throw new Error('Chế độ hook không hợp lệ.');
    if (mode === 'festival') {
      const source = this.requireSource(sourceId);
      if (!source.hooks.length) throw new Error('Nguồn Hook lễ đang trống.');
      source.usedKeys = [];
      this.state.activeSourceId = source.id;
    } else this.state.activeSourceId = '';
    this.state.mode = mode; this.persist();
  }

  deactivate(): void {
    this.assertMutable();
    if (this.state.mode === 'normal' && !this.state.activeSourceId) return;
    this.state.mode = 'normal';
    this.state.activeSourceId = '';
    this.persist();
  }

  delete(id: string): void {
    this.assertMutable();
    if (this.state.mode === 'festival' && this.state.activeSourceId === id) throw new Error('Hãy chuyển sang Hook thường hoặc nguồn lễ khác trước khi xóa.');
    const before = this.state.sources.length;
    this.state.sources = this.state.sources.filter((source) => source.id !== id);
    if (before === this.state.sources.length) throw new Error('Không tìm thấy nguồn hook.');
    if (this.state.activeSourceId === id) this.state.activeSourceId = '';
    this.persist();
  }

  reserve(deckId: string, destinationId: string): HookReservation | null {
    if (destinationId !== FESTIVAL_HOOK_DESTINATION_ID || this.state.mode !== 'festival' || !FESTIVAL_HOOK_DECK_IDS.includes(deckId as typeof FESTIVAL_HOOK_DECK_IDS[number])) return null;
    if (this.mutating) throw new Error('Nguồn Hook lễ đang được cập nhật. Vui lòng thử lại sau.');
    const source = this.requireSource(this.state.activeSourceId);
    const reserved = new Set([...this.reservations.values()].filter((entry) => entry.sourceId === source.id).map((entry) => entry.key));
    let candidates = source.hooks.filter((hook) => !source.usedKeys.includes(keyOf(hook)) && !reserved.has(keyOf(hook)));
    if (!candidates.length && reserved.size === 0) { source.usedKeys = []; candidates = source.hooks.filter((hook) => !reserved.has(keyOf(hook))); }
    if (!candidates.length) throw new Error('Các hook còn lại đang được dùng bởi yêu cầu tạo list khác. Vui lòng thử lại.');
    const index = Math.min(candidates.length - 1, Math.floor(Math.max(0, this.random()) * candidates.length));
    const hook = candidates[index], token = crypto.randomUUID();
    this.reservations.set(token, { sourceId: source.id, key: keyOf(hook) });
    return { token, hook, sourceId: source.id, sourceRevision: source.revision };
  }

  commit(reservation: HookReservation | null): void {
    if (!reservation) return;
    const pending = this.reservations.get(reservation.token); if (!pending) return;
    const source = this.state.sources.find((entry) => entry.id === pending.sourceId);
    try {
      if (source && source.revision === reservation.sourceRevision && !source.usedKeys.includes(pending.key)) {
        const previousUsedKeys = [...source.usedKeys];
        source.usedKeys.push(pending.key); source.updatedAt = new Date().toISOString();
        try {
          this.persist();
        } catch (error) {
          source.usedKeys = previousUsedKeys;
          throw error;
        }
      }
    } finally {
      this.reservations.delete(reservation.token);
    }
  }

  rollback(reservation: HookReservation | null): void { if (reservation) this.reservations.delete(reservation.token); }

  private async loadDoc(url: string) {
    const docId = docIdFromUrl(url), hooks = this.hooksFromText(await this.fetchDoc(docId));
    return { type: 'google-doc' as const, docId, docUrl: `https://docs.google.com/document/d/${encodeURIComponent(docId)}/edit`, hooks };
  }

  private async loadFile(file: HookSourceUpload) {
    const parsed = await readUpload(file);
    return { type: parsed.type, originalFileName: parsed.fileName, hooks: this.hooksFromText(parsed.text) };
  }

  private hooksFromText(text: string): string[] { const hooks = parseFestivalHookText(text); if (!hooks.length) throw new Error('Nguồn không có câu hook hợp lệ.'); return hooks; }
  private requireSource(id: string): StoredSource { const source = this.state.sources.find((entry) => entry.id === String(id || '').trim()); if (!source) throw new Error('Không tìm thấy nguồn hook.'); return source; }
  private beginMutation(): void { this.assertMutable(); this.mutating = true; }
  private assertMutable(): void {
    if (this.mutating) throw new Error('Nguồn Hook lễ đang được cập nhật. Vui lòng thử lại sau.');
    if (this.reservations.size) throw new Error('Đang tạo list bằng Hook lễ. Vui lòng thử lại sau.');
  }
  private assertUniqueName(name: string, exceptId = ''): void { if (this.state.sources.some((source) => source.id !== exceptId && keyOf(source.name) === keyOf(name))) throw new Error('Tên bộ hook đã tồn tại.'); }

  private summary(source: StoredSource, available: boolean): HookSourceSummary {
    const usedCount = new Set(source.usedKeys).size;
    return { id: source.id, name: source.name, type: source.type, ...(source.docUrl ? { docUrl: source.docUrl } : {}), ...(source.originalFileName ? { originalFileName: source.originalFileName } : {}), hookCount: source.hooks.length, usedCount, remainingCount: Math.max(0, source.hooks.length - usedCount), updatedAt: source.updatedAt, lastLoadedAt: source.lastLoadedAt, cacheStatus: source.lastError ? 'error' : 'ready', ...(source.lastError ? { lastError: source.lastError } : {}), active: available && this.state.mode === 'festival' && this.state.activeSourceId === source.id };
  }

  private load(): State {
    try {
      if (!fs.existsSync(this.statePath)) return { ...EMPTY_STATE, sources: [] };
      const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as Partial<State>;
      const sources = Array.isArray(parsed.sources) ? parsed.sources.filter((source): source is StoredSource => Boolean(source?.id && source?.name && Array.isArray(source?.hooks))) : [];
      const active = parsed.mode === 'festival' && sources.some((source) => source.id === parsed.activeSourceId) ? String(parsed.activeSourceId) : '';
      return { version: 1, mode: active ? 'festival' : 'normal', activeSourceId: active, updatedAt: String(parsed.updatedAt || ''), sources };
    } catch { return { ...EMPTY_STATE, sources: [] }; }
  }

  private persist(): void {
    fs.mkdirSync(this.dataRoot, { recursive: true }); this.state.updatedAt = new Date().toISOString();
    const nonce = `${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const temporary = `${this.statePath}.tmp-${nonce}`;
    const backup = `${this.statePath}.bak-${nonce}`;
    fs.writeFileSync(temporary, JSON.stringify(this.state, null, 2), 'utf8');
    let movedExisting = false;
    try {
      if (fs.existsSync(this.statePath)) {
        fs.renameSync(this.statePath, backup);
        movedExisting = true;
      }
      fs.renameSync(temporary, this.statePath);
      if (movedExisting) fs.unlinkSync(backup);
    } catch (error) {
      try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* best effort */ }
      if (movedExisting && !fs.existsSync(this.statePath) && fs.existsSync(backup)) {
        try { fs.renameSync(backup, this.statePath); } catch { /* preserve original error */ }
      }
      throw error;
    }
  }
}
