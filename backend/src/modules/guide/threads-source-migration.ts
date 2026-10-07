import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDalatThreadsSource, isDeckAllowedForSource, sourceTemplateError, THREADS_NOTE_DECK_IDS } from './sync/destination-config';

const STORE_NAME = /^(generated-caption-lists|page-text-overrides)(?:\.([\w-]+))?\.json$/;
const MARKER = 'threads-source-migration-v1.json';
const PENDING = 'threads-source-migration.pending.json';

function read(file: string): any { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
function atomic(file: string, bytes: string | Buffer) {
  const temporary = file + '.threads-' + randomUUID();
  try {
    const fd = fs.openSync(temporary, 'wx');
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

// Called before either GuideService or scheduler loads user state. All backups
// must exist before the first replacement. A durable journal recovers a crash
// between replacements; the completion marker is committed last.
export function migrateThreadsSourceStores(dataRoot: string, beforeReplace?: (name: string) => void) {
  const root = path.resolve(dataRoot);
  fs.mkdirSync(root, { recursive: true });
  const marker = path.join(root, MARKER), pending = path.join(root, PENDING);
  if (fs.existsSync(pending)) {
    const journal = read(pending);
    if (!fs.existsSync(marker) || read(marker).transaction !== journal.transaction) {
      const backup = path.resolve(root, 'migration-backups', String(journal.backupName));
      const allowedRoot = path.join(root, 'migration-backups') + path.sep;
      if (!backup.startsWith(allowedRoot) || path.basename(backup) !== journal.backupName) throw Error('Đường dẫn sao lưu Threads không hợp lệ.');
      for (const name of journal.files || []) {
        if (!STORE_NAME.test(name) && name !== 'automation-schedules.json') throw Error('Tên file sao lưu Threads không hợp lệ.');
        atomic(path.join(root, name), fs.readFileSync(path.join(backup, name)));
      }
    }
    fs.unlinkSync(pending);
  }
  if (fs.existsSync(marker)) return { ...read(marker), alreadyCompleted: true };

  const changes: Array<{ name: string; bytes: Buffer; next: any }> = [];
  const removed: Array<{ sourceId: string; deckId: string; listId: string }> = [];
  const removedBySource = new Map<string, Map<string, Set<string>>>();
  for (const name of fs.readdirSync(root).sort()) {
    const match = STORE_NAME.exec(name);
    if (!match || match[1] !== 'generated-caption-lists') continue;
    const sourceId = match[2] || 'dalat';
    if (isDalatThreadsSource(sourceId)) continue;
    const file = path.join(root, name), document = read(file);
    if (!document.decks || typeof document.decks !== 'object') throw Error(`Không đọc được cấu trúc list: ${name}; chưa dọn dữ liệu.`);
    let changed = false;
    for (const deckId of THREADS_NOTE_DECK_IDS) {
      const lists = document.decks[deckId];
      if (lists === undefined) continue;
      if (!Array.isArray(lists)) throw Error(`List ${deckId} trong ${name} không hợp lệ; chưa dọn dữ liệu.`);
      const retained = lists.filter(list => list?.id === 'main' || list?.id === `${deckId}-main`);
      for (const list of lists.filter(list => !retained.includes(list))) {
        if (!list?.id) throw Error(`List thiếu ID trong ${name}; chưa dọn dữ liệu.`);
        removed.push({ sourceId, deckId, listId: list.id });
        const decks = removedBySource.get(sourceId) || new Map<string, Set<string>>();
        const ids = decks.get(deckId) || new Set<string>(); ids.add(list.id); decks.set(deckId, ids); removedBySource.set(sourceId, decks);
      }
      if (retained.length !== lists.length) {
        if (retained.length) document.decks[deckId] = retained;
        else delete document.decks[deckId];
        changed = true;
      }
    }
    if (changed) changes.push({ name, bytes: fs.readFileSync(file), next: document });
  }
  for (const name of fs.readdirSync(root).sort()) {
    const match = STORE_NAME.exec(name);
    if (!match || match[1] !== 'page-text-overrides') continue;
    const deleted = removedBySource.get(match[2] || 'dalat');
    if (!deleted) continue;
    const file = path.join(root, name), document = read(file);
    if (!document.decks || typeof document.decks !== 'object') throw Error(`Không đọc được chỉnh sửa: ${name}; chưa dọn dữ liệu.`);
    let changed = false;
    for (const [deckId, ids] of deleted) for (const id of ids) {
      if (document.decks[deckId]?.[id] !== undefined) { delete document.decks[deckId][id]; changed = true; }
    }
    if (changed) changes.push({ name, bytes: fs.readFileSync(file), next: document });
  }
  const pausedSchedules: string[] = [];
  const scheduleFile = path.join(root, 'automation-schedules.json');
  if (fs.existsSync(scheduleFile)) {
    const document = read(scheduleFile);
    if (!Array.isArray(document.schedules)) throw Error('Không đọc được lịch Hẹn giờ; chưa dọn dữ liệu.');
    for (const schedule of document.schedules) {
      const invalid = (schedule.templates || []).filter((template: any) => isDalatThreadsSource(schedule.destinationId)
        ? !isDeckAllowedForSource(schedule.destinationId, template.deckId)
        : THREADS_NOTE_DECK_IDS.includes(template.deckId));
      if (!invalid.length) continue;
      schedule.enabled = false; delete schedule.nextRunAt;
      schedule.disabledReason = 'Lịch tạm dừng do thay đổi nguồn mẫu. ' + invalid.map((template: any) => sourceTemplateError(schedule.destinationId, template.deckId)).join(' ');
      pausedSchedules.push(schedule.id);
    }
    if (pausedSchedules.length) changes.push({ name: 'automation-schedules.json', bytes: fs.readFileSync(scheduleFile), next: document });
  }
  const transaction = randomUUID(), backupName = 'threads-source-' + Date.now() + '-' + transaction;
  const backup = path.join(root, 'migration-backups', backupName);
  const report = { version: 1, transaction, completedAt: new Date().toISOString(), backupPath: changes.length ? backup : null, removed, pausedSchedules };
  if (changes.length) {
    fs.mkdirSync(backup, { recursive: true });
    for (const change of changes) atomic(path.join(backup, change.name), change.bytes);
    atomic(pending, JSON.stringify({ transaction, backupName, files: changes.map(change => change.name) }));
  }
  try {
    for (const change of changes) {
      beforeReplace?.(change.name);
      atomic(path.join(root, change.name), JSON.stringify(change.next, null, 2));
    }
    atomic(marker, JSON.stringify(report, null, 2));
  } catch (error) {
    for (const change of changes) atomic(path.join(root, change.name), change.bytes);
    if (fs.existsSync(pending)) fs.unlinkSync(pending);
    throw error;
  }
  if (fs.existsSync(pending)) fs.unlinkSync(pending);
  if (removed.length || pausedSchedules.length) console.log(`[threads-source] Đã dọn ${removed.length} list, tạm dừng ${pausedSchedules.length} lịch; sao lưu: ${backup}`);
  return report;
}
