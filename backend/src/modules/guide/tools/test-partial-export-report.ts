import assert from 'node:assert/strict';
import { AutomationSchedulerService } from '../automation-scheduler.service';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

const scheduler: any = Object.create(AutomationSchedulerService.prototype);
const run: any = { status: 'awaiting-export', listIds: ['one', 'two'], generated: [{ deckId: 'a', listId: 'one' }, { deckId: 'b', listId: 'two' }] };
let persisted: any;
scheduler.authorizeExport = () => run;
scheduler.persist = () => { persisted = JSON.parse(JSON.stringify(run)); };
const outcome = { exportedLists: [{ deckId: 'a', listId: 'one' }], skippedLists: [{ deckId: 'b', listId: 'two', errors: [{ page: 2, id: 'missing-id', reason: 'missing' }] }] };
scheduler.reportProgress('run', 'token', 99, 'Saving', outcome);
assert.deepEqual(persisted.exportedLists, outcome.exportedLists);
assert.deepEqual(persisted.skippedLists, outcome.skippedLists);
assert.throws(() => scheduler.reportProgress('run', 'token', 99, '', { exportedLists: [{ deckId: 'a', listId: 'one' }], skippedLists: [] }), /không khớp/);
assert.throws(() => scheduler.reportProgress('run', 'token', 99, '', { exportedLists: [{ deckId: 'x', listId: 'one' }], skippedLists: outcome.skippedLists }), /không khớp/);
console.log('PASS: scheduler preserves partial report and rejects omitted/wrong-owner list results');

async function archiveTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-partial-report-'));
  try {
    const JSZip = require(path.resolve('../frontend/node_modules/jszip'));
    const zip = new JSZip(); zip.file('complete-list/caption.txt', 'Complete fixture list');
    const bytes = await zip.generateAsync({ type: 'nodebuffer' });
    Object.assign(run, { id: 'fixture-run-id', outputDir: dir, scheduleName: 'Fixture', createdAt: new Date().toISOString(), errors: [] });
    await scheduler.acceptArchive('run', 'token', Readable.from([bytes]));
    assert.equal(run.status, 'partial');
    assert.match(run.phase, /1 list; bỏ qua 1 list/);
    const report = path.join(dir, 'restart.json'); fs.writeFileSync(report, JSON.stringify(persisted));
    assert.deepEqual(JSON.parse(fs.readFileSync(report, 'utf8')).skippedLists, outcome.skippedLists);
    run.exportedLists = [];
    await assert.rejects(scheduler.acceptArchive('run', 'token', Readable.from([bytes])), /ZIP rỗng/);
    console.log('PASS: actual ZIP accepted as partial, restart report retained, empty success list rejected');
  } finally { fs.rmSync(dir, { recursive: true }); }
}
archiveTest().catch(error => { console.error(error); process.exitCode = 1; });
