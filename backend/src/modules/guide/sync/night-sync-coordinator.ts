import * as fs from 'node:fs';
import * as path from 'node:path';
import { vietnamSyncWindow, withSyncPermit } from './night-sync-policy';

export interface NightSourceResult { downloaded: number; failed: number; added: number; changed: number; }
export interface SyncProgress { stage: string; completed?: number; total?: number; failed?: number; }
interface SourceState {
  progress?: SyncProgress;
  initialized: boolean; sheetNight?: string; completedNight?: string;
  lastSuccess?: string; retryAt?: number; error?: string;
  phase?: 'waiting' | 'running' | 'paused' | 'complete' | 'partial' | 'error';
  result?: NightSourceResult;
}
interface State { sources: Record<string, SourceState>; report?: { night: string; read: boolean; message: string }; }
interface Options {
  file: string;
  sources: () => Array<{ id: string; label: string }>;
  initialized: (id: string) => boolean;
  busy: () => boolean;
  run: (id: string, sheetDone: boolean, markSheetDone: () => void, progress: (value: SyncProgress) => void) => Promise<NightSourceResult>;
  now?: () => number;
}

/** Sequential background jobs; never changes the user's active destination. */
export class NightSyncCoordinator {
  private state: State = { sources: {} };
  private timer?: NodeJS.Timeout;
  private running?: string;
  private ticking = false;
  private manualJobs = new Map<string, Promise<void>>();
  private manualTail: Promise<void> = Promise.resolve();
  private controller?: AbortController;
  private readonly now: () => number;
  constructor(private readonly options: Options) {
    this.now = options.now || Date.now;
    try { this.state = JSON.parse(fs.readFileSync(options.file, 'utf8')); } catch { /* first run */ }
    this.state.sources ||= {};
    for (const entry of Object.values(this.state.sources)) {
      if (entry.phase === 'running' || entry.phase === 'paused') entry.phase = 'partial';
    }
  }
  private source(id: string): SourceState {
    return this.state.sources[id] ||= { initialized: this.options.initialized(id), phase: 'waiting' };
  }
  private save(): void {
    fs.mkdirSync(path.dirname(this.options.file), { recursive: true });
    const temp = this.options.file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2));
    fs.renameSync(temp, this.options.file);
  }
  status() {
    const window = vietnamSyncWindow(this.now());
    return { ...window, running: this.running || null, queued: [...this.manualJobs.keys()], report: this.state.report,
      sources: this.options.sources().map(s => ({ ...s, ...this.source(s.id) })) };
  }
  acknowledge(): void { if (this.state.report) { this.state.report.read = true; this.save(); } }
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.tick().catch(console.error); }, 60000);
    this.timer.unref();
    void this.tick().catch(console.error);
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.controller?.abort(); }
  async initial(id: string): Promise<void> {
    if (!this.options.sources().some(s => s.id === id)) throw new Error('Nguồn không có Google Sheet.');
    if (this.source(id).initialized) throw new Error('Nguồn đã khởi tạo; chỉ cập nhật trong 23:00–06:00.');
    if (this.running || this.ticking) throw new Error('Một nguồn khác đang cập nhật.');
    await this.runOne(id, true);
  }
  manual(id: string): Promise<void> {
    if (!this.options.sources().some(s => s.id === id)) return Promise.reject(new Error('Nguồn không có Google Sheet.'));
    const existing = this.manualJobs.get(id);
    if (existing) return existing;
    const job = this.manualTail.then(async () => {
      while (this.running || this.ticking) await new Promise(resolve => setTimeout(resolve, 250));
      await this.runOne(id, true);
      const state = this.source(id);
      if (state.phase === 'error') throw new Error(state.error);
    }).finally(() => { this.manualJobs.delete(id); });
    this.manualJobs.set(id, job);
    this.manualTail = job.catch(() => undefined);
    return job;
  }
  async tick(): Promise<void> {
    if (this.running || this.ticking || this.manualJobs.size) return;
    this.ticking = true;
    try { await this.tickOnce(); } finally { this.ticking = false; }
  }
  private async tickOnce(): Promise<void> {
    const window = vietnamSyncWindow(this.now());
    if (!window.allowed) {
      const previousNight = new Date(this.now() + 7 * 3600000 - 86400000).toISOString().slice(0, 10);
      if (this.state.report?.night !== previousNight) {
        this.state.report = { night: previousNight, read: false, message: 'Kết quả cập nhật đêm: xem từng nguồn. Nguồn chưa hoàn tất có thể do tool tắt, tác vụ đang bận hoặc tải thất bại.' };
        this.save();
      }
      return;
    }
    for (const source of this.options.sources()) {
      if (this.manualJobs.size) break;
      if (this.running) break;
      if (!vietnamSyncWindow(this.now()).allowed) break;
      const state = this.source(source.id);
      if (state.completedNight === window.night || (state.retryAt || 0) > this.now()) continue;
      await this.runOne(source.id, false);
    }
  }
  private async runOne(id: string, initial: boolean): Promise<void> {
    const state = this.source(id), night = vietnamSyncWindow(this.now()).night;
    this.running = id;
    this.controller = new AbortController();
    const signal = this.controller.signal;
    state.phase = 'running'; state.progress = { stage: 'Đang chuẩn bị cập nhật' }; state.error = undefined; this.save();
    const waitForIdle = async () => {
      while (this.options.busy()) {
        state.phase = 'paused';
        if (signal.aborted || (!initial && !vietnamSyncWindow(this.now()).allowed)) throw new Error('Đã dừng cập nhật; chờ khung giờ tiếp theo.');
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      state.phase = 'running';
    };
    const cutoff = setInterval(() => {
      if (!initial && !vietnamSyncWindow(this.now()).allowed) this.controller?.abort();
    }, 250);
    cutoff.unref();
    try {
      await waitForIdle();
      state.result = await withSyncPermit({ manual: initial, signal, waitForIdle }, () => this.options.run(id, !initial && state.sheetNight === night, () => {
        if (!initial || vietnamSyncWindow(this.now()).allowed) state.sheetNight = night;
        this.save();
      }, progress => { state.progress = progress; }));
      state.initialized = true;
      state.phase = state.result.failed ? 'partial' : 'complete';
      state.retryAt = state.result.failed ? this.now() + 30 * 60000 : undefined;
      if (!state.result.failed) {
        if (!initial || vietnamSyncWindow(this.now()).allowed) state.completedNight = night;
        state.lastSuccess = new Date(this.now()).toISOString();
      }
    } catch (error) {
      state.phase = 'error'; state.error = error instanceof Error ? error.message : String(error);
      state.retryAt = this.now() + 30 * 60000;
    } finally {
      clearInterval(cutoff);
      this.running = undefined; this.controller = undefined; this.save();
    }
  }
}
