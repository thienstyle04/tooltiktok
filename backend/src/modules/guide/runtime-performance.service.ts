import { Injectable } from '@nestjs/common';
import * as os from 'node:os';

export type RuntimePerformanceMode = 'checking' | 'modern' | 'legacy';

export interface RuntimePerformanceStatus {
  mode: RuntimePerformanceMode;
  reason: string;
  evaluatedAt: string | null;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  cpuCount: number;
  drivePrefetchConcurrency: number;
  generationConcurrency: number;
  busy: boolean;
}

export interface RuntimePerformanceReport {
  success?: boolean;
  hidden?: boolean;
  browserSupported?: boolean;
  elapsedMs?: number;
  failureKind?: 'resource' | 'unsupported' | 'benchmark';
}

const MIN_TOTAL_MEMORY = 8 * 1024 ** 3;
const MIN_FREE_MEMORY = Math.floor(1.5 * 1024 ** 3);
const MAX_BENCHMARK_MS = 12_000;

@Injectable()
export class RuntimePerformanceService {
  private mode: RuntimePerformanceMode = 'checking';
  private reason = 'Đang đánh giá khả năng xử lý của máy.';
  private evaluatedAt: string | null = null;
  private lowMemorySamples: number[] = [];
  private activeDriveTasks = 0;
  private activeGenerations = 0;

  async runGenerationTask<T>(task: () => Promise<T>): Promise<T> {
    this.activeGenerations += 1;
    try { return await task(); }
    finally { this.activeGenerations -= 1; }
  }
  private driveWaiters: Array<{ limit: number; start: () => void }> = [];

  async runDriveTask<T>(limit: number, task: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      this.driveWaiters.push({ limit, start: resolve });
      this.drainDriveQueue();
    });
    try { return await task(); }
    finally {
      this.activeDriveTasks -= 1;
      this.drainDriveQueue();
    }
  }

  private drainDriveQueue(): void {
    while (this.driveWaiters.length) {
      const next = this.driveWaiters[0];
      const configured = Number.isFinite(next.limit) ? Math.max(1, Math.min(5, Math.floor(next.limit))) : 1;
      const limit = this.getStatus().mode === 'modern' ? configured : 1;
      if (this.activeDriveTasks >= limit) return;
      this.driveWaiters.shift();
      this.activeDriveTasks += 1;
      next.start();
    }
  }
  private memoryProbe = (): { totalMemoryBytes: number; freeMemoryBytes: number; cpuCount: number } => ({
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytes: os.freemem(),
    cpuCount: Math.max(1, os.cpus().length),
  });

  /** Chỉ dùng bởi test cục bộ; không được expose qua API. */
  setMemoryProbeForTest(probe: () => { totalMemoryBytes: number; freeMemoryBytes: number; cpuCount: number }): void {
    this.memoryProbe = probe;
  }

  getStatus(): RuntimePerformanceStatus {
    this.evaluateSystemMemory();
    const { totalMemoryBytes, freeMemoryBytes, cpuCount } = this.memoryProbe();
    return {
      mode: this.mode,
      reason: this.reason,
      evaluatedAt: this.evaluatedAt,
      totalMemoryBytes,
      freeMemoryBytes,
      cpuCount,
      drivePrefetchConcurrency: this.mode === 'modern' ? 0 : 1,
      generationConcurrency: 1,
      busy: this.activeDriveTasks > 0 || this.activeGenerations > 0,
    };
  }

  report(report: RuntimePerformanceReport): RuntimePerformanceStatus {
    this.evaluateSystemMemory();
    if (this.mode === 'legacy') return this.getStatus();
    const elapsedMs = Number(report.elapsedMs || 0);
    if (report.failureKind === 'resource') {
      this.setLegacy('Xuất ảnh thiếu tài nguyên; dùng Cân bằng tương thích cho phiên này.');
    } else if (report.hidden || report.browserSupported !== true) {
      this.setLegacy(report.hidden
        ? 'Không thể đo sức máy khi tab đang ẩn; dùng Cân bằng tương thích cho phiên này.'
        : 'Trình duyệt không hỗ trợ phép đo; dùng Cân bằng tương thích cho phiên này.');
    } else if (report.success !== true || report.failureKind === 'unsupported') {
      this.setLegacy('Kiểm tra xử lý ảnh không hoàn tất; dùng Cân bằng tương thích cho phiên này.');
    } else if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || elapsedMs > MAX_BENCHMARK_MS) {
      this.setLegacy('Kiểm tra xử lý ảnh quá chậm; dùng Cân bằng tương thích cho phiên này.');
    } else {
      this.mode = 'modern';
      this.reason = 'Máy đáp ứng Cân bằng mới.';
      this.evaluatedAt = new Date().toISOString();
    }
    return this.getStatus();
  }

  markResourceFailure(reason = 'Xuất ảnh thiếu tài nguyên; dùng Cân bằng tương thích cho phiên này.'): RuntimePerformanceStatus {
    this.setLegacy(reason);
    return this.getStatus();
  }

  private evaluateSystemMemory(): void {
    if (this.mode === 'legacy') return;
    const { totalMemoryBytes, freeMemoryBytes } = this.memoryProbe();
    if (totalMemoryBytes < MIN_TOTAL_MEMORY) {
      this.setLegacy('Máy có dưới 8 GB RAM; dùng Cân bằng tương thích cho phiên này.');
      return;
    }
    if (freeMemoryBytes >= MIN_FREE_MEMORY) {
      this.lowMemorySamples = [];
      return;
    }
    const now = Date.now();
    if (this.mode === 'checking') {
      this.setLegacy('RAM trống dưới 1,5 GB; dùng Cân bằng tương thích cho phiên này.');
      return;
    }
    if (this.lowMemorySamples.length === 0) this.lowMemorySamples = [now];
    if (now - this.lowMemorySamples[0] >= 2_000) {
      this.setLegacy('RAM trống thấp liên tiếp; dùng Cân bằng tương thích cho phiên này.');
    }
  }

  private setLegacy(reason: string): void {
    this.mode = 'legacy';
    this.reason = reason;
    this.evaluatedAt = new Date().toISOString();
  }
}
