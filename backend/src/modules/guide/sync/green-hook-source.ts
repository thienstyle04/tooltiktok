import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseFestivalHookText } from './festival-hook-source';

const CACHE_TTL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 25_000;

type GreenHookState = {
  version: 1;
  docId: string;
  docUrl: string;
  hooks: string[];
  usedKeys: string[];
  revision: string;
  fetchedAt: number;
  updatedAt: string;
  lastError?: string;
};

export type GreenHookReservation = {
  token: string;
  hook: string;
  sourceId: string;
  sourceRevision: string;
};

const keyOf = (value: unknown): string => String(value || '')
  .normalize('NFC')
  .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase('vi-VN');

function docIdFromUrl(value: unknown): string {
  const url = String(value || '').trim();
  const id = url.match(/^https:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/i)?.[1] || '';
  if (!id) throw new Error('Không tìm thấy link Google Docs “Hook mảng xanh” hợp lệ trong Sheet Hinh_nen.');
  return id;
}

async function fetchGreenHookDocument(docId: string): Promise<string> {
  const response = await fetch(
    `https://docs.google.com/document/d/${encodeURIComponent(docId)}/export?format=txt`,
    {
      headers: { 'User-Agent': 'Dalat Carousel Green Hook Reader' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`Hook mảng xanh Google Docs HTTP ${response.status}. Hãy bật quyền “Bất kỳ ai có đường liên kết”.`);
  }
  const contentType = String(response.headers.get('content-type') || '');
  if (!/text\/plain/i.test(contentType)) {
    throw new Error('Google Docs Hook mảng xanh chưa cho phép tải văn bản công khai.');
  }
  return response.text();
}

export class GreenHookSourceStore {
  private readonly statePath: string;
  private state: GreenHookState | null;
  private readonly reservations = new Map<string, { key: string; revision: string }>();
  private syncPromise: Promise<void> | null = null;

  constructor(
    private readonly dataRoot: string,
    private readonly fetchDocument = fetchGreenHookDocument,
    private readonly random = Math.random,
  ) {
    this.statePath = path.join(dataRoot, 'spotlight-v6-green-hooks.json');
    this.state = this.load();
  }

  async ensureReady(docUrl: string, forceRefresh = false): Promise<void> {
    const normalizedUrl = String(docUrl || '').trim();
    const docId = docIdFromUrl(normalizedUrl);
    const isFresh = this.state?.docId === docId
      && this.state.hooks.length > 0
      && Date.now() - this.state.fetchedAt < CACHE_TTL_MS;
    if (!forceRefresh && isFresh) return;
    if (this.syncPromise) return this.syncPromise;

    this.syncPromise = (async () => {
      try {
        const text = await this.fetchDocument(docId);
        const hooks = parseFestivalHookText(text);
        if (!hooks.length) throw new Error('Google Docs Hook mảng xanh không có câu hook hợp lệ.');
        const previous = this.state;
        const sameDoc = previous?.docId === docId;
        const validKeys = new Set(hooks.map(keyOf));
        const now = new Date().toISOString();
        const next: GreenHookState = {
          version: 1,
          docId,
          docUrl: `https://docs.google.com/document/d/${encodeURIComponent(docId)}/edit`,
          hooks,
          usedKeys: sameDoc
            ? [...new Set((previous?.usedKeys || []).filter((key) => validKeys.has(key)))]
            : [],
          revision: crypto.randomUUID(),
          fetchedAt: Date.now(),
          updatedAt: now,
        };
        this.persist(next);
        this.state = next;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!this.state?.hooks.length) throw new Error(`Không tải được Hook mảng xanh: ${message}`);
        // Giữ nguyên pool/revision đang dùng nếu refresh lỗi; chỉ lưu thông tin lỗi.
        const retained = { ...this.state, lastError: message, updatedAt: new Date().toISOString() };
        this.persist(retained);
        this.state = retained;
      } finally {
        this.syncPromise = null;
      }
    })();
    return this.syncPromise;
  }

  reserve(): GreenHookReservation {
    const state = this.state;
    if (!state?.hooks.length) throw new Error('Cache Hook mảng xanh chưa sẵn sàng.');
    const reservedKeys = new Set(
      [...this.reservations.values()]
        .filter((entry) => entry.revision === state.revision)
        .map((entry) => entry.key),
    );
    let candidates = state.hooks.filter((hook) => !state.usedKeys.includes(keyOf(hook)) && !reservedKeys.has(keyOf(hook)));
    if (!candidates.length && reservedKeys.size === 0) {
      state.usedKeys = [];
      candidates = state.hooks;
    }
    if (!candidates.length) throw new Error('Các Hook mảng xanh còn lại đang được request khác giữ chỗ. Vui lòng thử lại.');
    const index = Math.min(candidates.length - 1, Math.floor(Math.max(0, this.random()) * candidates.length));
    const hook = candidates[index];
    const token = crypto.randomUUID();
    this.reservations.set(token, { key: keyOf(hook), revision: state.revision });
    return {
      token,
      hook,
      sourceId: state.docId,
      sourceRevision: state.revision,
    };
  }

  commit(reservation: GreenHookReservation | null): void {
    if (!reservation) return;
    const pending = this.reservations.get(reservation.token);
    if (!pending) return;
    try {
      if (!this.state || this.state.revision !== reservation.sourceRevision || pending.revision !== this.state.revision) return;
      if (this.state.usedKeys.includes(pending.key)) return;
      const next = {
        ...this.state,
        usedKeys: [...this.state.usedKeys, pending.key],
        updatedAt: new Date().toISOString(),
      };
      this.persist(next);
      this.state = next;
    } finally {
      this.reservations.delete(reservation.token);
    }
  }

  rollback(reservation: GreenHookReservation | null): void {
    if (reservation) this.reservations.delete(reservation.token);
  }

  getCachedHooks(): string[] {
    return this.state?.hooks ? [...this.state.hooks] : [];
  }

  private load(): GreenHookState | null {
    try {
      if (!fs.existsSync(this.statePath)) return null;
      const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as Partial<GreenHookState>;
      if (!parsed.docId || !Array.isArray(parsed.hooks) || !parsed.hooks.length) return null;
      return {
        version: 1,
        docId: String(parsed.docId),
        docUrl: String(parsed.docUrl || ''),
        hooks: parseFestivalHookText(parsed.hooks.join('\n')),
        usedKeys: Array.isArray(parsed.usedKeys) ? [...new Set(parsed.usedKeys.map(keyOf).filter(Boolean))] : [],
        revision: String(parsed.revision || crypto.randomUUID()),
        fetchedAt: Number(parsed.fetchedAt || 0),
        updatedAt: String(parsed.updatedAt || ''),
        ...(parsed.lastError ? { lastError: String(parsed.lastError) } : {}),
      };
    } catch {
      return null;
    }
  }

  private persist(state: GreenHookState): void {
    fs.mkdirSync(this.dataRoot, { recursive: true });
    const tempPath = `${this.statePath}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf8');
    try {
      fs.renameSync(tempPath, this.statePath);
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  }
}
