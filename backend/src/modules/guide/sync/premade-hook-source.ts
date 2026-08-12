/**
 * Pool hook trang bìa tĩnh (không AI) cho các mẫu ngoài spotlight-v3/carousel-mau-1/spotlight-guide.
 * Nguồn: backend/data/premade-hooks.json — do người dùng soạn sẵn theo từng nhóm mẫu.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export type PremadeHookPoolKey = 'itinerary_3n2d' | 'itinerary_4n3d' | 'budget' | 'highlight';

const POOL_KEYS: PremadeHookPoolKey[] = ['itinerary_3n2d', 'itinerary_4n3d', 'budget', 'highlight'];

const DECK_POOL_MAP: Record<string, PremadeHookPoolKey> = {
  'grid-4-mutant': 'highlight',
  'grid-8-quaytung': 'highlight',
  'spotlight-v2': 'highlight',
  'spotlight-partner': 'highlight',
};

export function getPremadeHookPoolKey(deckId: string): PremadeHookPoolKey | null {
  return DECK_POOL_MAP[deckId] ?? null;
}

export function getDeckIdsForPremadeHookPool(poolKey: PremadeHookPoolKey): string[] {
  return Object.entries(DECK_POOL_MAP)
    .filter(([, key]) => key === poolKey)
    .map(([id]) => id);
}

function normalizeHookLine(line: string): string {
  return String(line || '').replace(/\s+/g, ' ').trim();
}

let cache: Record<PremadeHookPoolKey, string[]> | null = null;
let cacheMtimeMs = -1;
let cacheFilePath = '';

function readPools(dataRoot: string): Record<PremadeHookPoolKey, string[]> {
  const filePath = path.join(dataRoot, 'premade-hooks.json');
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const pools = {} as Record<PremadeHookPoolKey, string[]>;
  for (const key of POOL_KEYS) {
    const list = Array.isArray(raw?.[key]) ? raw[key] : [];
    pools[key] = list.map(normalizeHookLine).filter(Boolean);
  }
  return pools;
}

// Không cache "cứng" mãi mãi: nếu lần đọc đầu tiên thất bại (ví dụ file chưa
// kịp tạo lúc server mới khởi động) hoặc file được cập nhật sau đó, phải đọc
// lại từ đĩa — nếu không pool sẽ bị khoá ở trạng thái rỗng/cũ suốt đời process,
// buộc phải restart backend mới thấy hook mới.
export function loadPremadeHookPool(poolKey: PremadeHookPoolKey, dataRoot: string): string[] {
  const filePath = path.join(dataRoot, 'premade-hooks.json');
  let mtimeMs = -1;
  try {
    mtimeMs = fs.statSync(filePath).mtimeMs;
  } catch {
    // File chưa tồn tại — coi như -1, cache rỗng bên dưới sẽ tự thử lại ở lần gọi sau.
  }

  const isStale = !cache || cacheFilePath !== filePath || cacheMtimeMs !== mtimeMs;
  if (isStale) {
    try {
      cache = readPools(dataRoot);
      cacheMtimeMs = mtimeMs;
      cacheFilePath = filePath;
    } catch (error) {
      console.warn('[premade-hooks] Không đọc được premade-hooks.json:', error instanceof Error ? error.message : error);
      cache = { itinerary_3n2d: [], itinerary_4n3d: [], budget: [], highlight: [] };
      // Không lưu mtimeMs khi đọc lỗi, để lần gọi kế tiếp thử đọc lại thay vì khoá cứng rỗng.
    }
  }
  return cache?.[poolKey] || [];
}
