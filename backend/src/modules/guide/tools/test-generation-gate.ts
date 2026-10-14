import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { GuideService } from '../guide.service';

// Chốt hành vi hàng đợi tạo list và các cờ "đang bận" mà scheduler, updater
// và night sync dựa vào.
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function main() {
  const service: any = new GuideService();
  service.destinationDataLoading = false;
  assert.equal(service.isGenerationBusy(), false);
  assert.equal(service.isUserOperationBusy(), false);

  // Chạy tuần tự đúng thứ tự gửi vào; cờ bận bật trong lúc còn việc.
  const order: string[] = [];
  let releaseFirst!: () => void;
  const first = service.enqueueGeneration(() => new Promise<string>((resolve) => {
    order.push('first:start');
    releaseFirst = () => { order.push('first:end'); resolve('A'); };
  }));
  const second = service.enqueueGeneration(async () => { order.push('second'); return 'B'; });
  const failing = service.enqueueGeneration(async () => { order.push('failing'); throw new Error('boom'); });
  const after = service.enqueueGeneration(async () => { order.push('after'); return 'D'; });
  await tick(); await tick();
  assert.deepEqual(order, ['first:start'], 'Việc sau phải chờ việc trước xong');
  assert.equal(service.isGenerationBusy(), true);
  assert.equal(service.isUserOperationBusy(), true);
  releaseFirst();
  assert.equal(await first, 'A');
  assert.equal(await second, 'B');
  await assert.rejects(failing, /boom/);
  assert.equal(await after, 'D', 'Lỗi của một việc không được chặn hàng đợi');
  assert.deepEqual(order, ['first:start', 'first:end', 'second', 'failing', 'after']);
  assert.equal(service.isGenerationBusy(), false);
  assert.equal(service.isUserOperationBusy(), false);

  // Giữ chỗ khi đang xuất file: hết hạn sau 90 giây, mã phải hợp lệ.
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    assert.throws(() => service.updateExportLease('bad id!', true), BadRequestException);
    assert.throws(() => service.updateExportLease('x'.repeat(101), true), BadRequestException);
    service.updateExportLease('export-1', true);
    assert.equal(service.isUserOperationBusy(), true);
    assert.equal(service.isGenerationBusy(), false, 'Xuất file không tính là đang tạo list');
    now += 89_999;
    assert.equal(service.isUserOperationBusy(), true);
    now += 1;
    assert.equal(service.isUserOperationBusy(), false, 'Giữ chỗ hết hạn sau 90 giây');
    service.updateExportLease('export-2', true);
    service.updateExportLease('export-2', false);
    assert.equal(service.isUserOperationBusy(), false);
  } finally {
    Date.now = realNow;
  }

  // Đang nạp dữ liệu nguồn cũng là bận; sync còn phải chờ probe của scheduler.
  service.destinationDataLoading = true;
  assert.equal(service.isUserOperationBusy(), true);
  assert.equal(service.syncMustWait(), true);
  service.destinationDataLoading = false;
  assert.equal(service.syncMustWait(), false);
  let schedulerBusy = true;
  service.setSyncBusyProbe(() => schedulerBusy);
  assert.equal(service.syncMustWait(), true);
  assert.equal(service.isUserOperationBusy(), false, 'Probe của scheduler chỉ ảnh hưởng sync');
  schedulerBusy = false;
  assert.equal(service.syncMustWait(), false);

  console.log('PASS generation gate: FIFO queue, error does not block, busy flags, 90s export lease, data-loading and sync probe');
}

main().catch((error) => { console.error(error); process.exit(1); });
