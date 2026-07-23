/**
 * Pool hook cover cho spotlight-v3 — lấy từ Google Doc "Hook ảnh cuộn".
 * Cache local để máy mới / mất mạng tạm vẫn dùng được.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const DEFAULT_DOC_ID = '1NGgDbpoUGDormMJKlMdYJoYWAt-nmVq_neDSH3PyueE';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 25_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

export type SpotlightHookCache = {
  docId: string;
  fetchedAt: number;
  hooks: string[];
};

let memoryCache: SpotlightHookCache | null = null;

function resolveCachePath(dataRoot: string): string {
  return path.join(dataRoot, 'spotlight-v3-hooks.json');
}

function normalizeHookLine(line: string): string {
  return String(line || '')
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseSpotlightHookDocument(text: string): string[] {
  const seen = new Set<string>();
  const hooks: string[] = [];
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = normalizeHookLine(rawLine);
    if (!line || line.length < 8) continue;
    if (/^hook ảnh cuộn$/i.test(line)) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hooks.push(line);
  }
  return hooks;
}

function readDiskCache(dataRoot: string): SpotlightHookCache | null {
  try {
    const filePath = resolveCachePath(dataRoot);
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as SpotlightHookCache;
    if (!Array.isArray(parsed?.hooks) || parsed.hooks.length === 0) return null;
    return {
      docId: String(parsed.docId || DEFAULT_DOC_ID),
      fetchedAt: Number(parsed.fetchedAt || 0),
      hooks: parsed.hooks.map(normalizeHookLine).filter(Boolean),
    };
  } catch {
    return null;
  }
}

function writeDiskCache(dataRoot: string, cache: SpotlightHookCache): void {
  try {
    fs.mkdirSync(dataRoot, { recursive: true });
    fs.writeFileSync(resolveCachePath(dataRoot), JSON.stringify(cache, null, 2), 'utf8');
  } catch (error) {
    console.warn('[spotlight-hooks] Không ghi được cache:', error instanceof Error ? error.message : error);
  }
}

async function fetchHookDocument(docId: string): Promise<string> {
  const url = `https://docs.google.com/document/d/${encodeURIComponent(docId)}/export?format=txt`;
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`Hook Doc HTTP ${response.status}`);
  }
  return response.text();
}

export async function loadSpotlightV3Hooks(options: {
  dataRoot: string;
  docId?: string;
  forceRefresh?: boolean;
}): Promise<string[]> {
  const docId = String(options.docId || process.env.SPOTLIGHT_V3_HOOK_DOC_ID || DEFAULT_DOC_ID).trim() || DEFAULT_DOC_ID;
  const now = Date.now();

  if (!options.forceRefresh && memoryCache?.hooks?.length && memoryCache.docId === docId && now - memoryCache.fetchedAt < CACHE_TTL_MS) {
    return memoryCache.hooks;
  }

  const disk = readDiskCache(options.dataRoot);
  if (!options.forceRefresh && disk?.hooks?.length && disk.docId === docId && now - disk.fetchedAt < CACHE_TTL_MS) {
    memoryCache = disk;
    return disk.hooks;
  }

  try {
    const text = await fetchHookDocument(docId);
    const hooks = parseSpotlightHookDocument(text);
    if (!hooks.length) throw new Error('Hook Doc trống sau khi parse');
    const cache: SpotlightHookCache = { docId, fetchedAt: now, hooks };
    memoryCache = cache;
    writeDiskCache(options.dataRoot, cache);
    console.log(`[spotlight-hooks] Đã tải ${hooks.length} hook từ Google Doc.`);
    return hooks;
  } catch (error) {
    console.warn('[spotlight-hooks] Fetch Doc thất bại, dùng cache cũ nếu có:', error instanceof Error ? error.message : error);
    if (disk?.hooks?.length) {
      memoryCache = disk;
      return disk.hooks;
    }
    if (memoryCache?.hooks?.length) return memoryCache.hooks;
    return [];
  }
}

export function pickSpotlightV3Hook(hooks: string[], usedTitles: string[] = [], seed = ''): string {
  const pool = hooks.map(normalizeHookLine).filter(Boolean);
  if (!pool.length) return '';

  const used = new Set(usedTitles.map((title) => normalizeHookLine(title).toLowerCase()).filter(Boolean));
  const fresh = pool.filter((hook) => !used.has(hook.toLowerCase()));
  const candidates = fresh.length > 0 ? fresh : pool;

  let hash = 0;
  const key = `${seed}|${candidates.length}|${used.size}`;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
  }
  return candidates[hash % candidates.length] || candidates[0] || '';
}

export function getCachedSpotlightV3Hooks(): string[] {
  return memoryCache?.hooks?.length ? [...memoryCache.hooks] : [];
}

export function setCachedSpotlightV3Hooks(hooks: string[], docId = DEFAULT_DOC_ID): void {
  memoryCache = {
    docId,
    fetchedAt: Date.now(),
    hooks: hooks.map(normalizeHookLine).filter(Boolean),
  };
}

/** Vị trí chữ cover V3 — random, không ưu tiên giữa. */
export const SPOTLIGHT_V3_COVER_PLACEMENTS = [
  'top-left',
  'top-center',
  'top-right',
  'mid-left',
  'mid-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;

export function pickSpotlightV3CoverPlacement(seed: string): typeof SPOTLIGHT_V3_COVER_PLACEMENTS[number] {
  let hash = 0;
  const key = String(seed || 'cover');
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
  }
  return SPOTLIGHT_V3_COVER_PLACEMENTS[hash % SPOTLIGHT_V3_COVER_PLACEMENTS.length];
}
