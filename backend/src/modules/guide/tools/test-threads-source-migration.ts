import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { migrateThreadsSourceStores } from '../threads-source-migration';
import { getDestinationConfig, registerDestination, unregisterDestination } from '../sync/destination-config';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'threads-migration-test-'));
const put = (name: string, data: any) => fs.writeFileSync(path.join(root, name), JSON.stringify(data));
const read = (name: string) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
try {
  registerDestination({ ...getDestinationConfig('dalat-threads'), id: 'sheet-existingthreads' });
  const lists = { version: 1, diaryUsedLines: { keep: ['unchanged'] }, decks: {
    'threads-food-local': [{ id: 'threads-food-local-caption-01', pages: [] }],
    'itinerary-note-dark': [{ id: 'itinerary-note-dark-caption-01', pages: [] }],
    'spotlight-v6': [{ id: 'spotlight-v6-caption-01', pages: [] }],
  } };
  for (const id of ['dalat', 'dalat-test', 'greenland', 'sheet-other', 'sheet-existingthreads']) put(`generated-caption-lists.${id}.json`, lists);
  put('generated-caption-lists.json', lists);
  put('page-text-overrides.dalat.json', { version: 1, decks: {
    'threads-food-local': { 'threads-food-local-caption-01': { 0: { title: 'Remove only this' } }, 'threads-food-local-main': { 0: { title: 'Keep preview' } } },
    'spotlight-v6': { 'spotlight-v6-caption-01': { 0: { title: 'Keep custom text' } } },
  } });
  const history = [{ id: 'completed-run', status: 'completed', destinationId: 'dalat', templates: [{ deckId: 'threads-food-local', count: 4 }] }];
  put('automation-schedules.json', { version: 1, schedules: [
    { id: 'mixed', enabled: true, destinationId: 'dalat', nextRunAt: 'tomorrow', templates: [{ deckId: 'threads-food-local', count: 4 }, { deckId: 'spotlight-v6', count: 3 }] },
    { id: 'valid', enabled: true, destinationId: 'sheet-existingthreads', nextRunAt: 'tomorrow', templates: [{ deckId: 'threads-food-local', count: 4 }] },
  ], runs: history });
  put('used-inventory.dalat.json', { usedItemIds: ['old-cycle'], usedImageUrls: ['cached'] });
  put('sheet-drive-images.dalat.json', { items: { keep: 'keep' } });
  const before = new Map(fs.readdirSync(root).map(name => [name, fs.readFileSync(path.join(root, name))]));
  // Failure while validating corrupt state cannot delete anything.
  const bad = path.join(root, 'page-text-overrides.dalat.json');
  fs.writeFileSync(bad, 'broken json');
  assert.throws(() => migrateThreadsSourceStores(root));
  for (const [name, bytes] of before) if (name !== path.basename(bad)) assert.ok(bytes.equals(fs.readFileSync(path.join(root, name))));
  fs.writeFileSync(bad, before.get(path.basename(bad))!);
  assert.throws(() => migrateThreadsSourceStores(root, name => { if (name === 'page-text-overrides.dalat.json') throw Error('Simulated disk failure'); }), /disk failure/);
  for (const [name, bytes] of before) assert.ok(bytes.equals(fs.readFileSync(path.join(root, name))), name + ' rollback');
  assert.ok(!fs.existsSync(path.join(root, 'threads-source-migration-v1.json')));

  // Simulate a process dying mid-transaction: the next startup restores all
  // originals from the journal before retrying, including editable page text.
  const backupName = 'crash-fixture', backup = path.join(root, 'migration-backups', backupName);
  fs.mkdirSync(backup);
  const files = ['generated-caption-lists.dalat.json', 'page-text-overrides.dalat.json'];
  for (const name of files) fs.writeFileSync(path.join(backup, name), before.get(name)!);
  put(files[0], { decks: {} });
  put('threads-source-migration.pending.json', { transaction: 'crash', backupName, files });
  const result = migrateThreadsSourceStores(root);
  assert.equal(result.removed.length, 10);
  assert.deepEqual(result.pausedSchedules, ['mixed']);
  for (const id of ['dalat', 'dalat-test', 'greenland', 'sheet-other']) assert.deepEqual(Object.keys(read(`generated-caption-lists.${id}.json`).decks), ['spotlight-v6']);
  assert.deepEqual(read('generated-caption-lists.sheet-existingthreads.json'), lists);
  const overrides = read('page-text-overrides.dalat.json');
  assert.ok(!overrides.decks['threads-food-local']['threads-food-local-caption-01']);
  assert.equal(overrides.decks['threads-food-local']['threads-food-local-main'][0].title, 'Keep preview');
  assert.equal(overrides.decks['spotlight-v6']['spotlight-v6-caption-01'][0].title, 'Keep custom text');
  const schedules = read('automation-schedules.json');
  assert.equal(schedules.schedules[0].enabled, false); assert.ok(!schedules.schedules[0].nextRunAt);
  assert.match(schedules.schedules[0].disabledReason, /Đà Lạt Threads/);
  assert.equal(schedules.schedules[1].enabled, true); assert.deepEqual(schedules.runs, history);
  for (const name of ['used-inventory.dalat.json', 'sheet-drive-images.dalat.json']) assert.ok(before.get(name)!.equals(fs.readFileSync(path.join(root, name))));
  for (const name of fs.readdirSync(result.backupPath!)) assert.ok(before.get(name)!.equals(fs.readFileSync(path.join(result.backupPath!, name))), name + ' backup');
  const cleaned = fs.readFileSync(path.join(root, files[0]));
  assert.equal(migrateThreadsSourceStores(root).alreadyCompleted, true);
  assert.ok(cleaned.equals(fs.readFileSync(path.join(root, files[0]))));
  // Recovery retains the exact originals, not just a parsed approximation.
  const restored = fs.mkdtempSync(path.join(root, 'restore-'));
  for (const name of fs.readdirSync(result.backupPath!)) fs.copyFileSync(path.join(result.backupPath!, name), path.join(restored, name));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(restored, files[0]), 'utf8')), lists);
  console.log('PASS migration: 10 old lists, custom Threads preserved, related overrides only, mixed schedule paused/history preserved, validation/disk rollback, crash recovery, idempotence, exact backups and restore.');
} finally {
  unregisterDestination('sheet-existingthreads');
  if (!root.startsWith(path.join(os.tmpdir(), 'threads-migration-test-'))) throw Error('Unsafe test cleanup');
  fs.rmSync(root, { recursive: true, force: true });
}
