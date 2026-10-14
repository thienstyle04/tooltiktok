// ─── Hàng đợi tạo list và các cờ "đang bận" ─────────────────────────────────
// Scheduler, trình cập nhật và night sync dựa vào các cờ này để không chạy
// chồng lên việc tạo/xuất list của người dùng.
import { BadRequestException } from '@nestjs/common';
import { isUpdateLocked } from '../../runtime-update-lock';

export interface GenerationGateHost {
  /** Bọc từng việc tạo list (AI provider, giới hạn hiệu năng, chỉ dữ liệu cục bộ). */
  runTask<T>(task: () => Promise<T>): Promise<T>;
  /** Nguồn dữ liệu đang được nạp. */
  isDataLoading(): boolean;
}

const EXPORT_LEASE_MS = 90_000;

export class GenerationGate {
  private queue: Promise<void> = Promise.resolve();
  private depth = 0;
  private readonly exportLeases = new Map<string, number>();
  private syncBusyProbe: () => boolean = () => false;

  constructor(private readonly host: GenerationGateHost) {}

  /** Chạy lần lượt từng việc; việc lỗi không chặn các việc phía sau. */
  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    this.depth += 1;
    const previous = this.queue;
    let release: () => void = () => undefined;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await this.host.runTask(task);
    } finally {
      this.depth = Math.max(0, this.depth - 1);
      release();
    }
  }

  isGenerationBusy(): boolean {
    return this.depth > 0;
  }

  isUserOperationBusy(): boolean {
    this.dropExpiredLeases();
    return this.isGenerationBusy() || this.exportLeases.size > 0 || this.host.isDataLoading();
  }

  setSyncBusyProbe(probe: () => boolean): void {
    this.syncBusyProbe = probe;
  }

  updateExportLease(id: string, active: boolean): void {
    if (!/^[\w-]{1,100}$/.test(id)) throw new BadRequestException('Mã tác vụ xuất không hợp lệ.');
    if (active) this.exportLeases.set(id, Date.now() + EXPORT_LEASE_MS); else this.exportLeases.delete(id);
  }

  syncMustWait(): boolean {
    return this.isUserOperationBusy() || this.syncBusyProbe() || isUpdateLocked();
  }

  private dropExpiredLeases(): void {
    for (const [id, expires] of this.exportLeases) if (expires <= Date.now()) this.exportLeases.delete(id);
  }
}
