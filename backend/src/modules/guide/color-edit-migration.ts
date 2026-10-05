import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const LEGACY_COLOR_DECKS: Record<string, string> = {
  'spotlight-v5-color-edit': 'spotlight-v5', 'spotlight-v6-color-edit': 'spotlight-v6',
};
const preset = 'iphone-color-edit-v1';
function merge(a: any, b: any): any {
  if (a === undefined) return b;
  if (Array.isArray(a) && Array.isArray(b)) {
    const out = [...a];
    for (const item of b) {
      const existing = item?.id ? out.find(x => x?.id === item.id) : out.find(x => JSON.stringify(x) === JSON.stringify(item));
      if (!existing) out.push(item);
      else if (JSON.stringify(existing) !== JSON.stringify(item)) throw Error('Trùng ID list khi chuyển mẫu Color Edit: ' + item.id);
    }
    return out;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const out = {...a}; for (const [key, value] of Object.entries(b)) out[key] = merge(out[key], value); return out;
  }
  if (JSON.stringify(a) === JSON.stringify(b)) return a;
  throw Error('Xung đột dữ liệu chỉnh sửa khi chuyển mẫu Color Edit.');
}
export function migrateColorEditDocument(input: any): any {
  if (Array.isArray(input)) return input.map(migrateColorEditDocument);
  if (!input || typeof input !== 'object') return input;
  const out: any = {};
  for (const [key, value] of Object.entries(input)) {
    const newKey = LEGACY_COLOR_DECKS[key] || key;
    let next = migrateColorEditDocument(value);
    if (LEGACY_COLOR_DECKS[key] && Array.isArray(next)) next = next.map((list: any) => (
      list?.pages ? { ...list, photoPreset: list.photoPreset || preset, pages: list.pages.map((page: any) => ({ ...page, photoPreset: page.photoPreset || preset })) } : list
    ));
    out[newKey] = merge(out[newKey], next);
  }
  if (LEGACY_COLOR_DECKS[input.deckId]) {
    out.deckId = LEGACY_COLOR_DECKS[input.deckId];
    out.photoPreset = input.photoPreset || preset;
  }
  return out;
}
// Validate every document before touching any file. Backups are durable and
// rollback is performed if a later replacement fails. A rerun is a no-op.
export function migrateColorEditStores(dataRoot: string): string[] {
  if (!fs.existsSync(dataRoot)) return [];
  const names = fs.readdirSync(dataRoot).filter(name => /^(generated-caption-lists|page-text-overrides|used-inventory)(\.[\w-]+)?\.json$/.test(name) || name === 'automation-schedules.json');
  const changes = names.flatMap(name => {
    const target = path.join(dataRoot, name), before = fs.readFileSync(target, 'utf8').replace(/^\uFEFF/, '');
    if (!Object.keys(LEGACY_COLOR_DECKS).some(id => before.includes('"' + id + '"'))) return [];
    const parsed = JSON.parse(before), next = migrateColorEditDocument(parsed);
    if (JSON.stringify(next) === JSON.stringify(parsed)) return [];
    return [{ target, name, before: fs.readFileSync(target), next: JSON.stringify(next, null, 2) }];
  });
  if (!changes.length) return [];
  const backup = path.join(dataRoot, 'migration-backups', 'photo-presets-' + Date.now() + '-' + randomUUID());
  fs.mkdirSync(backup, {recursive:true});
  for (const change of changes) fs.writeFileSync(path.join(backup, change.name), change.before);
  const applied: typeof changes = [];
  try {
    for (const change of changes) {
      const temporary = change.target + '.preset-migration-' + randomUUID();
      fs.writeFileSync(temporary, change.next, 'utf8');
      try { fs.renameSync(temporary, change.target); applied.push(change); }
      finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    }
  } catch (error) {
    for (const change of applied.reverse()) {
      const temporary = change.target + '.preset-rollback-' + randomUUID();
      try { fs.writeFileSync(temporary, change.before); fs.renameSync(temporary, change.target); }
      finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    }
    throw error;
  }
  return changes.map(change => change.name);
}
