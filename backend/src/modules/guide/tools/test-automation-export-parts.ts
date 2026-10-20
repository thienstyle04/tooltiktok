import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { AutomationSchedulerService } from '../automation-scheduler.service';

// Lượt tự động lớn: chia nhiều phần ZIP, một phần lỗi không làm mất phần đã lưu, phần toàn list hỏng
// không chặn lượt, thông báo tổng kết nói rõ list không tạo được, phát hiện xuất đứng yên, chạy bù khi
// lỡ giờ, chờ giao diện khởi động. Thư mục tạm, không dùng dữ liệu/lịch thật.
async function zipBytes(label: string): Promise<Buffer> {
  const JSZip = require(path.resolve('../frontend/node_modules/jszip'));
  const zip = new JSZip(); zip.file(`${label}/data.txt`, label);
  return zip.generateAsync({ type: 'nodebuffer' });
}

function harness(root: string) {
  const scheduler: any = Object.create(AutomationSchedulerService.prototype);
  const marked: string[][] = [];
  scheduler.state = { version: 1, schedules: [], runs: [] };
  scheduler.persist = () => undefined;
  scheduler.guideService = { markListsExported: (groups: any[]) => { marked.push(groups.flatMap(group => group.listIds)); return { markedCount: 0 }; } };
  scheduler.authorizeExport = (id: string) => scheduler.state.runs.find((run: any) => run.id === id);
  const lists = Array.from({ length: 20 }, (_, index) => ({ deckId: index < 10 ? 'deck-a' : 'deck-b', listId: `list-${String(index + 1).padStart(2, '0')}` }));
  const run: any = { id: 'run-parts-0001', scheduleId: 's', scheduleName: 'Lịch chia phần', scheduledFor: new Date().toISOString(), destinationId: 'dalat',
    status: 'exporting', phase: '', progress: 70, templates: [{ deckId: 'deck-a', count: 10 }, { deckId: 'deck-b', count: 12 }], hook: { mode: 'normal' },
    outputDir: root, outputFileName: 'tong-hop.zip', format: 'png', listIds: lists.map(item => item.listId), generated: lists,
    errors: [{ deckId: 'deck-b', requested: 12, completed: 10, message: 'deck-b: cần ít nhất 1 đối tác hợp lệ; hiện có 0.' }],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), startedAt: new Date().toISOString() };
  run.exportParts = scheduler.splitExportParts(run.listIds, 'png');
  run.exportedLists = []; run.skippedLists = []; run.outputPaths = [];
  scheduler.state.runs.push(run);
  return { scheduler, run, lists, marked };
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-export-parts-'));
  try {
    // Chia phần theo định dạng.
    const probe: any = Object.create(AutomationSchedulerService.prototype);
    const ids = Array.from({ length: 90 }, (_, index) => `l${index}`);
    assert.deepEqual(probe.splitExportParts(ids, 'jpg').map((part: any) => part.listIds.length), [20, 20, 20, 20, 10]);
    assert.equal(probe.splitExportParts(ids, 'png').length, 12);
    assert.deepEqual(probe.splitExportParts(ids, 'png').map((part: any) => part.index).slice(0, 3), [1, 2, 3]);

    const { scheduler, run, lists, marked } = harness(root);
    assert.deepEqual(run.exportParts.map((part: any) => part.listIds.length), [8, 8, 4]);
    const context = scheduler.getExportContext.call({ ...scheduler, authorizeExport: () => ({ ...run, status: 'awaiting-export' }) }, run.id, 't');
    assert.deepEqual(context.parts.map((part: string[]) => part.length), [8, 8, 4], 'Ngữ cảnh xuất trả các phần cho trình render');

    const partLists = (index: number) => lists.filter(item => run.exportParts[index].listIds.includes(item.listId));
    // Phần 1: xuất đủ.
    scheduler.reportProgress(run.id, 't', 80, 'Phần 1/3', { exportedLists: partLists(0), skippedLists: [] }, 1);
    // Kết quả phần không khớp danh sách của phần bị từ chối.
    assert.throws(() => scheduler.reportProgress(run.id, 't', 80, 'x', { exportedLists: partLists(1), skippedLists: [] }, 1), /không khớp/);
    const first = await scheduler.acceptArchive(run.id, 't', Readable.from([await zipBytes('part-1')]), '1');
    assert.match(path.basename(first.outputPath), /^tong-hop-phan-1-tren-3\.zip$/);
    assert.equal(run.status, 'exporting', 'Chưa chốt khi còn phần chưa xong');
    assert.deepEqual(marked[marked.length - 1], run.exportParts[0].listIds, 'List của phần đã lưu được đánh dấu Đã xuất ngay');
    await assert.rejects(scheduler.acceptArchive(run.id, 't', Readable.from([await zipBytes('again')]), '1'), /không ghi đè/);

    // Phần 2: 2 list lỗi ảnh, 6 list xuất.
    const second = partLists(1);
    scheduler.reportProgress(run.id, 't', 85, 'Phần 2/3', { exportedLists: second.slice(2), skippedLists: second.slice(0, 2).map(item => ({ ...item, errors: [{ reason: 'Thiếu ảnh' }] })) }, 2);
    // Phần 3: lưu ZIP lỗi giữa chừng -> chỉ phần 3 lỗi, lượt không thất bại.
    scheduler.reportProgress(run.id, 't', 90, 'Phần 3/3', { exportedLists: partLists(2), skippedLists: [] }, 3);
    await assert.rejects(scheduler.acceptArchive(run.id, 't', Readable.from([Buffer.alloc(160)]), '3'), /Đã xóa file ZIP xuất dở/);
    assert.equal(run.status, 'exporting');
    assert.ok(run.exportParts[2].error);
    // Báo lỗi muộn cho phần đã lưu không đổi kết quả của nó.
    scheduler.reportExportFailure(run.id, 't', 'Báo muộn', 1);
    assert.ok(!run.exportParts[0].error);
    await scheduler.acceptArchive(run.id, 't', Readable.from([await zipBytes('part-2')]), '2');
    assert.equal(run.status, 'partial', 'Có phần lỗi, list bỏ qua và list không tạo được -> một phần');
    assert.equal(run.outputPaths.length, 2);
    assert.equal(run.outputPath, path.dirname(first.outputPath), 'Lượt nhiều phần trỏ tới thư mục của lượt');
    assert.equal(run.phase, 'Đã tạo 20/22 list, xuất 14 list vào 2 file ZIP. Không tạo được 2 list ở 1 mẫu. Bỏ qua 2 list lỗi ảnh/dữ liệu. 1 phần ZIP không lưu được. Xem chi tiết bên dưới.');
    assert.ok(fs.readdirSync(path.dirname(first.outputPath)).every(name => !name.includes('.partial-')));
    const markedIds = new Set(marked.flat());
    assert.ok(run.exportParts[2].listIds.every((id: string) => !markedIds.has(id)), 'List của phần lưu lỗi không được đánh dấu Đã xuất');
    assert.ok(second.slice(0, 2).every(item => !markedIds.has(item.listId)), 'List bị bỏ qua không được đánh dấu Đã xuất');
    assert.ok(run.exportParts[0].listIds.every((id: string) => markedIds.has(id)));
    console.log('PASS export parts: split by format, per-part outcome/archives, failed part keeps others, summary:', run.phase);

    // Phần mà mọi list đều hỏng: không có ZIP nhưng vẫn được coi là xong; lượt chỉ có phần đó thì thất bại rõ ràng.
    {
      const { scheduler: s2, run: r2, lists: l2 } = harness(fs.mkdtempSync(path.join(root, 'allbad-')));
      r2.listIds = r2.listIds.slice(0, 3); r2.generated = l2.slice(0, 3); r2.errors = [];
      r2.exportParts = s2.splitExportParts(r2.listIds, 'jpg');
      s2.reportProgress(r2.id, 't', 80, 'x', { exportedLists: [], skippedLists: l2.slice(0, 3).map(item => ({ ...item, errors: [{ reason: 'Thiếu ảnh' }] })) }, 1);
      assert.equal(r2.status, 'failed');
      assert.match(r2.phase, /Tất cả list đều thiếu ảnh/);
      console.log('PASS all-invalid part settles without ZIP:', r2.phase);
    }

    // Lỗi chung khi đã lưu vài phần: lượt thành "một phần", giữ file đã lưu.
    {
      const dir = fs.mkdtempSync(path.join(root, 'abort-'));
      const { scheduler: s3, run: r3, lists: l3 } = harness(dir);
      r3.errors = [];
      s3.reportProgress(r3.id, 't', 80, 'x', { exportedLists: l3.filter(item => r3.exportParts[0].listIds.includes(item.listId)), skippedLists: [] }, 1);
      await s3.acceptArchive(r3.id, 't', Readable.from([await zipBytes('p1')]), '1');
      s3.reportExportFailure(r3.id, 't', 'Trình duyệt bị đóng');
      assert.equal(r3.status, 'partial');
      assert.equal(r3.outputPaths.length, 1);
      assert.ok(r3.exportParts.slice(1).every((part: any) => part.error));
      console.log('PASS global failure after saved parts keeps them:', r3.phase);
    }

    // Xuất không có tiến độ quá lâu thì dừng; có tiến độ thì không bị cắt ở 60 phút.
    {
      const stalled: any = { status: 'exporting', listIds: ['a'], updatedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString() };
      await assert.rejects(probe.watchExport(stalled, 5), /không có tiến độ trong 15 phút/);
      const moving: any = { status: 'exporting', listIds: Array.from({ length: 145 }, (_, i) => String(i)), updatedAt: new Date().toISOString() };
      setTimeout(() => { moving.status = 'completed'; }, 40);
      await probe.watchExport(moving, 5);
      console.log('PASS export watchdog: stall stops, progressing run continues');
    }

    // Chạy bù khi lỡ giờ (trong 6 tiếng), bỏ lượt khi tắt chạy bù hoặc quá lâu; lỗi xếp hàng không làm dừng bộ hẹn giờ.
    {
      const s4: any = Object.create(AutomationSchedulerService.prototype);
      s4.state = { version: 1, schedules: [], runs: [] };
      s4.persist = () => undefined;
      const queued: any[] = [];
      s4.enqueue = (entry: any) => { if (entry.scheduleId === 'broken') throw new Error('Mẫu không còn thuộc nguồn này.'); queued.push(entry); s4.state.runs.unshift(entry); };
      const schedule = (id: string, hoursAgo: number, catchUp: boolean) => ({ id, name: id, destinationId: 'dalat', frequency: 'daily', dailyTime: '09:00',
        outputDir: root, format: 'jpg', enabled: true, catchUp, templates: [{ deckId: 'grid-4', count: 3 }], hook: { mode: 'normal' },
        createdAt: '', updatedAt: '', nextRunAt: new Date(Date.now() - hoursAgo * 3600_000).toISOString() });
      s4.state.schedules = [schedule('catch', 1, true), schedule('late', 7, true), schedule('off', 1, false), schedule('broken', 0.01, false)];
      assert.doesNotThrow(() => s4.tick());
      const byId = (id: string) => s4.state.runs.find((entry: any) => entry.scheduleId === id);
      assert.equal(queued.length, 1);
      assert.equal(byId('catch').catchUp, true);
      assert.match(byId('catch').phase, /Chạy bù lượt lúc/);
      assert.equal(byId('late').status, 'missed');
      assert.match(byId('late').phase, /quá 6 tiếng/);
      assert.equal(byId('off').status, 'missed');
      assert.match(byId('off').phase, /Chạy bù khi lỡ giờ/);
      assert.equal(byId('broken').status, 'failed');
      assert.ok(s4.state.schedules.every((entry: any) => Date.parse(entry.nextRunAt) > Date.now()), 'Lịch hằng ngày chuyển sang lần kế tiếp');
      console.log('PASS catch-up: within 6h runs, too late/disabled missed with hint, enqueue error recorded');

      // Tool tắt 3 ngày: một bản ghi gộp các lượt cũ, chỉ lần hẹn hôm nay (30 phút trước) được chạy bù,
      // lần kế tiếp là ngày mai; các tick sau không xử lý thêm ngày cũ nào.
      queued.length = 0; s4.state.runs = [];
      const today = Date.now() - 30 * 60_000 - (Date.now() % 60_000);
      const local = new Date(today + 7 * 3600_000);
      const away = { ...schedule('away', 0, true), dailyTime: `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`,
        nextRunAt: new Date(today - 3 * 86_400_000).toISOString() };
      s4.state.schedules = [away];
      s4.tick(); s4.tick(); s4.tick();
      assert.equal(queued.length, 1, 'Chỉ một lượt chạy bù');
      assert.equal(queued[0].scheduledFor, new Date(today).toISOString(), 'Chạy bù lần hẹn gần nhất, không phải ngày cũ');
      const missedRuns = s4.state.runs.filter((entry: any) => entry.status === 'missed');
      assert.equal(missedRuns.length, 1, 'Các lượt cũ gộp thành một bản ghi');
      assert.match(missedRuns[0].phase, /bỏ qua 3 lượt/);
      assert.equal(away.nextRunAt, new Date(today + 86_400_000).toISOString());
      console.log('PASS tool off 3 days: one merged missed record, catch-up only today, next run tomorrow');
    }

    // Lượt bắt đầu khi giao diện chưa lên: chờ thay vì thất bại ngay.
    {
      const s5: any = Object.create(AutomationSchedulerService.prototype);
      let calls = 0;
      s5.assertFrontendReady = async () => { calls++; if (calls < 2) throw new Error('fetch failed'); };
      s5.persist = () => undefined;
      const runState: any = { phase: '', updatedAt: '' };
      await s5.waitForFrontendReady(runState);
      assert.equal(calls, 2);
      assert.match(runState.phase, /chờ giao diện/);
      console.log('PASS waits for frontend before starting');
    }

    // Lịch lưu/sửa giữ đúng lựa chọn chạy bù (bỏ chọn khi sửa phải tắt).
    {
      const s6: any = Object.create(AutomationSchedulerService.prototype);
      s6.guideService = { getDestinations: () => ({ destinations: [{ id: 'dalat' }] }), assertTemplateAllowed: () => undefined };
      s6.findBrowser = () => ({ name: 'Edge', path: 'x' });
      const input = { name: 'Lịch thử', destinationId: 'dalat', frequency: 'daily', dailyTime: '08:00', outputDir: root, format: 'jpg', templates: [{ deckId: 'grid-4', count: 3 }] };
      const created = s6.validateSchedule({ ...input, catchUp: true });
      assert.equal(created.catchUp, true);
      assert.equal(s6.validateSchedule({ ...input, catchUp: false }, created).catchUp, false);
      assert.equal(s6.validateSchedule(input).catchUp, false, 'Lịch cũ không có trường này: giữ hành vi cũ');
      console.log('PASS catch-up option saved and cleared');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
