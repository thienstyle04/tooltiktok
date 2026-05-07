import { DATASET_CACHE_KEY } from './utils';

const DATASET_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DATASET_BACKGROUND_CHECK_INTERVAL_MS = 10 * 60 * 1000;
const DATASET_BACKGROUND_CHECK_KEY = `${DATASET_CACHE_KEY}:checkedAt`;

function storageList() {
  if (typeof window === 'undefined') return [];
  return [window.sessionStorage, window.localStorage].filter(Boolean);
}

export function readCachedDataset() {
  const now = Date.now();
  for (const storage of storageList()) {
    try {
      const raw = storage.getItem(DATASET_CACHE_KEY);
      if (!raw) continue;
      const entry = JSON.parse(raw);
      if (!entry?.dataset || typeof entry.savedAt !== 'number') continue;
      if (now - entry.savedAt > DATASET_CACHE_TTL_MS) continue;
      return entry;
    } catch {
      // Ignore malformed or unavailable browser storage.
    }
  }
  return null;
}

export function writeCachedDataset(dataset) {
  if (!dataset) return;
  const entry = JSON.stringify({ savedAt: Date.now(), dataset });
  for (const storage of storageList()) {
    try {
      storage.setItem(DATASET_CACHE_KEY, entry);
    } catch {
      // A full browser quota should not block the studio.
    }
  }
}

export function clearCachedDataset() {
  for (const storage of storageList()) {
    try {
      storage.removeItem(DATASET_CACHE_KEY);
      storage.removeItem(DATASET_BACKGROUND_CHECK_KEY);
    } catch {
      // Ignore storage failures.
    }
  }
}

export function shouldCheckDatasetInBackground() {
  if (typeof window === 'undefined') return false;
  const now = Date.now();
  for (const storage of storageList()) {
    try {
      const checkedAt = Number(storage.getItem(DATASET_BACKGROUND_CHECK_KEY) || 0);
      if (checkedAt && now - checkedAt < DATASET_BACKGROUND_CHECK_INTERVAL_MS) return false;
    } catch {
      // Ignore storage failures.
    }
  }
  return true;
}

export function markDatasetBackgroundChecked() {
  const value = String(Date.now());
  for (const storage of storageList()) {
    try {
      storage.setItem(DATASET_BACKGROUND_CHECK_KEY, value);
    } catch {
      // Ignore storage failures.
    }
  }
}
