import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, PassThrough } from 'node:stream';
import { AutomationSchedulerService } from '../automation-scheduler.service';

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-export-failure-'));
  const sentinel = path.join(root, 'existing-valid-export.zip');
  fs.writeFileSync(sentinel, 'USER FILE MUST NOT CHANGE');
  const scheduler: any = Object.create(AutomationSchedulerService.prototype);
  let run: any;
  scheduler.authorizeExport = () => run;
  scheduler.persist = () => undefined;
  const fresh = (id: string) => run = { id, status: 'exporting', outputDir: root, scheduleName: 'Isolated cleanup',
    outputFileName: 'fixture.zip', createdAt: new Date().toISOString(), errors: [], exportedLists: [{ deckId: 'test', listId: 'test-list' }] };
  const files = () => fs.readdirSync(root, { recursive: true }).map(String);
  for (const mode of ['invalid', 'truncated', 'error', 'aborted', 'closed']) {
    fresh('fixture-' + mode);
    let input: any;
    if (mode === 'invalid' || mode === 'truncated') input = Readable.from([Buffer.alloc(mode === 'invalid' ? 12 : 160)]);
    else {
      input = new PassThrough();
      setTimeout(() => {
        input.write(Buffer.alloc(160));
        if (mode === 'aborted') input.emit('aborted');
        else input.destroy(mode === 'error' ? new Error('Simulated upload failure') : undefined);
      }, 20);
    }
    await assert.rejects(Promise.race([
      scheduler.acceptArchive('test', 'token', input),
      new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Cleanup hung')), 5000); timer.unref(); }),
    ]), /Đã xóa file ZIP xuất dở/);
    assert.equal(run.status, 'failed', mode + ': terminal state');
    assert.equal(files().length, 1, mode + ': remove partial file and own empty directory only');
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'USER FILE MUST NOT CHANGE');
    scheduler.reportExportFailure('test', 'token', 'Late browser report');
    assert.match(run.phase, /Đã xóa file ZIP xuất dở/, 'late report must not lose cleanup notice');
    console.log('PASS upload failure cleanup:', mode);
  }
  const JSZip = require(path.resolve('../frontend/node_modules/jszip'));
  const zip = new JSZip(); zip.file('successful-list/data.txt', 'Valid fixture');
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  fresh('fixture-retry');
  const result = await scheduler.acceptArchive('test', 'token', Readable.from([bytes]));
  assert.equal(run.status, 'completed');
  assert.deepEqual(fs.readFileSync(result.outputPath), bytes);
  const before = fs.readFileSync(result.outputPath);
  run.status = 'exporting';
  await assert.rejects(scheduler.acceptArchive('test', 'token', Readable.from([bytes])), /không ghi đè/);
  assert.deepEqual(fs.readFileSync(result.outputPath), before);
  assert.ok(files().every(name => !name.includes('.partial-')));
  console.log('PASS retry writes complete ZIP; existing successful ZIP/user files preserved. ROOT=' + root);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
