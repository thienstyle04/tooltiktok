import { BadRequestException, ConflictException, Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { getAppConfig, resolveBackendDataDir, resolveBackendRoot } from '../../config';
import { getRuntimeSession } from '../../runtime-session';
import { GuideService } from './guide.service';
import {
  AutomationRun,
  AutomationRunError,
  AutomationSchedule,
  AutomationScheduleInput,
  AutomationStateResponse,
  AutomationTemplateRequest,
} from './automation-scheduler.types';

const execFileAsync = promisify(execFile);
const TIMEZONE_OFFSET_MS = 7 * 60 * 60 * 1000;
const MIN_LISTS_PER_TEMPLATE = 3;
const MAX_LISTS_PER_TEMPLATE = 5;
const RUN_HISTORY_LIMIT = 100;
const ACTIVE_STATUSES = new Set(['queued', 'refreshing', 'warming', 'generating', 'awaiting-export', 'exporting']);

type StoredState = { version: 1; schedules: AutomationSchedule[]; runs: AutomationRun[] };

@Injectable()
export class AutomationSchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly dataRoot = resolveBackendDataDir(resolveBackendRoot(__dirname));
  private readonly statePath = path.join(this.dataRoot, 'automation-schedules.json');
  private state: StoredState = { version: 1, schedules: [], runs: [] };
  private timer: ReturnType<typeof setInterval> | null = null;
  private activeRunId = '';
  private runQueue: Promise<void> = Promise.resolve();
  private browser: any = null;
  private manualExportUntil = 0;
  private manualActiveId = '';
  private manualJobs = new Map<string, { id: string; requestId: string; status: string; destinationId: string; result?: unknown; error?: string }>();

  submitManualGeneration(input: { kind: string; destinationId: string; requestId: string; request: any }) {
    const existing = [...this.manualJobs.values()].find(job => job.requestId === input.requestId);
    if (existing) return { ...existing };
    if (!['caption', 'batch', 'partner'].includes(input.kind) || !input.requestId || !input.request?.deckId && input.kind !== 'partner') throw new BadRequestException('Yêu cầu tạo list không hợp lệ.');
    if (!this.guideService.getDestinations().destinations.some(d => d.id === input.destinationId)) throw new BadRequestException('Destination không hợp lệ.');
    if ([...this.manualJobs.values()].filter(j => ['queued', 'running'].includes(j.status)).length >= 30) throw new ConflictException('Hàng đợi đã đủ 30 yêu cầu.');
    // Keep only bounded metadata/results in memory on long-running low-RAM machines.
    for (const [id, saved] of this.manualJobs) {
      if (this.manualJobs.size < 200) break;
      if (!['queued', 'running'].includes(saved.status)) this.manualJobs.delete(id);
    }
    const request = structuredClone(input.request);
    // Never let a manual request impersonate an automated run or consume its hook selection.
    delete request.automationRunId;
    const hook = request.hookSelection;
    if (!hook || !['normal', 'festival'].includes(hook.mode) || hook.mode === 'festival' && !hook.sourceId) throw new BadRequestException('Cần chốt nguồn hook khi gửi yêu cầu.');
    const job = { id: crypto.randomUUID(), requestId: input.requestId, status: 'queued', destinationId: input.destinationId } as { id: string; requestId: string; status: string; destinationId: string; result?: unknown; error?: string };
    this.manualJobs.set(job.id, job);
    // Share the same FIFO as complete scheduled runs, including render and ZIP.
    this.runQueue = this.runQueue.then(async () => {
      while (this.manualExportUntil > Date.now() && job.status === 'queued') await new Promise(resolve => setTimeout(resolve, 500));
      if (job.status !== 'queued') return;
      try {
        await this.waitForExistingSync(() => job.status !== 'queued');
      } catch (error) {
        job.status = 'failed'; job.error = error instanceof Error ? error.message : String(error);
        return;
      }
      if (job.status !== 'queued') return;
      this.manualActiveId = job.id;
      job.status = 'running';
      const previousDestination = this.guideService.getDestinations().active.id;
      const previousHook = this.guideService.getHookSources();
      try {
        job.result = await this.guideService.enqueueGeneration(async () => {
          try {
            if (previousDestination !== job.destinationId) await this.guideService.setActiveDestination({ id: job.destinationId });
            if (input.kind === 'batch') return await this.guideService.generateBatchLists(request);
            if (input.kind === 'caption') return await this.guideService.generateDeckFromCaption(request);
            return await this.guideService.generatePartnerSpotlight(request);
          } finally {
            if (this.guideService.getDestinations().active.id !== previousDestination) await this.guideService.setActiveDestination({ id: previousDestination });
            const currentHook = this.guideService.getHookSources();
            if (previousDestination === 'dalat' && (currentHook.mode !== previousHook.mode || currentHook.activeSourceId !== previousHook.activeSourceId)) this.guideService.setHookMode({ mode: previousHook.mode, sourceId: previousHook.activeSourceId });
          }
        });
        job.status = 'completed';
      } catch (error) {
        job.status = 'failed'; job.error = error instanceof Error ? error.message : String(error);
      } finally { this.manualActiveId = ''; }
    });
    return { ...job };
  }

  getManualGeneration(id: string) {
    const job = this.manualJobs.get(id);
    if (!job) throw new BadRequestException('Không còn yêu cầu này trong phiên backend; có thể tool đã khởi động lại. Không tự tạo lại để tránh trùng list.');
    return { ...job };
  }

  cancelManualGeneration(id: string) {
    const job = this.manualJobs.get(id);
    if (!job) return this.getManualGeneration(id);
    if (job.status === 'running') throw new ConflictException('Yêu cầu đã bắt đầu; chỉ hủy được yêu cầu đang chờ.');
    if (job.status === 'queued') job.status = 'cancelled';
    return { ...job };
  }

  constructor(private readonly guideService: GuideService) {
    this.state = this.load();
  }

  onApplicationBootstrap(): void {
    const now = new Date().toISOString();
    for (const run of this.state.runs) {
      if (ACTIVE_STATUSES.has(run.status)) {
        run.status = 'interrupted';
        run.phase = 'Backend đã khởi động lại; lượt này không tự chạy lại.';
        run.updatedAt = now;
        run.completedAt = now;
        delete run.exportToken;
      }
    }
    this.recalculateSchedules();
    this.persist();
    this.timer = setInterval(() => this.tick(), 5_000);
    this.timer.unref?.();
    setTimeout(() => this.tick(), 1_500).unref?.();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.closeBrowser();
  }

  getState(): AutomationStateResponse {
    const browser = this.findBrowser();
    return {
      locked: Boolean(this.activeRunId),
      outputPicker: 'save-file-v1',
      ...(this.activeRunId ? { activeRunId: this.activeRunId } : {}),
      schedules: this.state.schedules.map((entry) => this.publicSchedule(entry)),
      runs: this.state.runs.slice(0, 30).map((entry) => this.publicRun(entry)),
      browserAvailable: Boolean(browser),
      ...(browser ? { browserName: browser.name } : {}),
      timezone: 'Asia/Saigon',
      minListsPerTemplate: MIN_LISTS_PER_TEMPLATE,
      maxListsPerTemplate: MAX_LISTS_PER_TEMPLATE,
    };
  }

  assertUserMutationAllowed(): void {
    if (this.manualActiveId) throw new ConflictException('Đang xử lý yêu cầu tạo list trong hàng đợi.');
    if (!this.activeRunId) return;
    const run = this.requireRun(this.activeRunId);
    throw new ConflictException(`Lịch tự động "${run.scheduleName}" đang chạy. Vui lòng chờ hoàn tất hoặc hủy lượt.`);
  }

  isDataSyncBusy(): boolean {
    return Boolean(this.manualActiveId || this.activeRunId || this.manualExportUntil > Date.now());
  }

  setManualExportActive(active: boolean): AutomationStateResponse {
    if (active && (this.activeRunId || this.manualActiveId || this.guideService.isGenerationBusy())) {
      throw new ConflictException('Đang chạy lịch tự động; chưa thể bắt đầu lượt xuất thủ công.');
    }
    this.manualExportUntil = active ? Date.now() + 2 * 60 * 60 * 1000 : 0;
    return this.getState();
  }

  create(input: AutomationScheduleInput): AutomationStateResponse {
    const schedule = this.validateSchedule(input);
    this.state.schedules.push(schedule);
    this.recalculateSchedule(schedule);
    this.persist();
    return this.getState();
  }

  update(id: string, input: AutomationScheduleInput): AutomationStateResponse {
    this.assertScheduleMutable(id);
    const previous = this.requireSchedule(id);
    const replacement = this.validateSchedule(input, previous);
    Object.assign(previous, replacement, { id: previous.id, createdAt: previous.createdAt, updatedAt: new Date().toISOString() });
    this.recalculateSchedule(previous);
    this.persist();
    return this.getState();
  }

  delete(id: string): AutomationStateResponse {
    this.assertScheduleMutable(id);
    const before = this.state.schedules.length;
    this.state.schedules = this.state.schedules.filter((entry) => entry.id !== id);
    if (before === this.state.schedules.length) throw new BadRequestException('Không tìm thấy lịch.');
    this.persist();
    return this.getState();
  }

  setEnabled(id: string, enabled: boolean): AutomationStateResponse {
    this.assertScheduleMutable(id);
    const schedule = this.requireSchedule(id);
    schedule.enabled = Boolean(enabled);
    schedule.updatedAt = new Date().toISOString();
    this.recalculateSchedule(schedule);
    this.persist();
    return this.getState();
  }

  runNow(id: string): AutomationStateResponse {
    const schedule = this.requireSchedule(id);
    const run = this.newRun(schedule, new Date().toISOString());
    this.enqueue(run);
    return this.getState();
  }

  retry(runId: string): AutomationStateResponse {
    const previous = this.requireRun(runId);
    if (ACTIVE_STATUSES.has(previous.status)) throw new ConflictException('Lượt này vẫn đang chạy.');
    const schedule = this.state.schedules.find((entry) => entry.id === previous.scheduleId) || {
      id: previous.scheduleId,
      name: previous.scheduleName,
      destinationId: previous.destinationId,
      frequency: 'once' as const,
      onceAt: new Date(Date.now() + 60_000).toISOString(),
      outputDir: previous.outputDir,
      outputFileName: previous.outputFileName,
      enabled: false,
      templates: previous.templates,
      hook: previous.hook,
      createdAt: previous.createdAt,
      updatedAt: new Date().toISOString(),
    };
    const completedByDeck = new Map<string, number>();
    for (const item of previous.generated) completedByDeck.set(item.deckId, (completedByDeck.get(item.deckId) || 0) + 1);
    const remaining = previous.templates
      .map((item) => ({ deckId: item.deckId, count: Math.max(0, item.count - (completedByDeck.get(item.deckId) || 0)) }))
      .filter((item) => item.count > 0);
    const run = this.newRun(schedule, new Date().toISOString(), remaining.length ? remaining : [], previous.id);
    run.generated = [...previous.generated];
    run.listIds = [...previous.listIds];
    this.enqueue(run);
    return this.getState();
  }

  deleteRunHistory(runId: string): AutomationStateResponse {
    const run = this.requireRun(runId);
    if (this.activeRunId === runId || ACTIVE_STATUSES.has(run.status)) {
      throw new ConflictException('Không thể xóa lịch sử lượt đang chạy hoặc đang chờ. Hãy hủy và chờ lượt kết thúc.');
    }
    const previous = this.state.runs;
    this.state.runs = previous.filter(entry => entry.id !== runId);
    try { this.persist(); } catch (error) { this.state.runs = previous; throw error; }
    return this.getState();
  }

  cancel(runId: string): AutomationStateResponse {
    const run = this.requireRun(runId);
    if (!ACTIVE_STATUSES.has(run.status)) return this.getState();
    run.cancelRequested = true;
    run.phase = 'Đang hủy sau bước hiện tại...';
    run.updatedAt = new Date().toISOString();
    this.persist();
    void this.closeBrowser();
    return this.getState();
  }

  getExportContext(runId: string, token: string): { runId: string; listIds: string[]; quality: 'optimized' } {
    const run = this.authorizeExport(runId, token);
    if (!['awaiting-export', 'exporting'].includes(run.status)) throw new ConflictException('Lượt chưa sẵn sàng để xuất.');
    return { runId: run.id, listIds: [...run.listIds], quality: 'optimized' };
  }

  reportProgress(runId: string, token: string, progress: number, phase: string, outcome?: Pick<AutomationRun, 'exportedLists' | 'skippedLists'>): void {
    const run = this.authorizeExport(runId, token);
    if (!ACTIVE_STATUSES.has(run.status)) return;
    if (outcome) {
      const exported = outcome.exportedLists || [], skipped = outcome.skippedLists || [];
      const all = [...exported, ...skipped];
      if (all.length !== run.listIds.length || new Set(all.map(item => item.listId)).size !== all.length || all.some(item => !run.generated.some(source => source.listId === item.listId && source.deckId === item.deckId))) throw new ConflictException('Kết quả xuất không khớp các list của lượt chạy.');
      run.exportedLists = exported;
      run.skippedLists = skipped;
    }
    run.status = 'exporting';
    run.progress = Math.min(98, Math.max(70, Number(progress) || 70));
    run.phase = String(phase || 'Đang xuất file...').slice(0, 240);
    run.updatedAt = new Date().toISOString();
    this.persist();
  }

  async acceptArchive(runId: string, token: string, request: any): Promise<{ outputPath: string; bytes: number }> {
    const run = this.authorizeExport(runId, token);
    if (run.cancelRequested) throw new ConflictException('Lượt đã bị hủy.');
    if (run.exportedLists && !run.exportedLists.length) throw new ConflictException('Không có list xuất thành công; không nhận ZIP rỗng.');
    const stamp = this.fileStamp(run.startedAt || run.createdAt);
    const runDir = path.join(run.outputDir, `${stamp}-${this.safeName(run.scheduleName)}-${run.id.slice(-8)}`);
    fs.mkdirSync(runDir, { recursive: true });
    const finalPath = path.join(runDir, run.outputFileName || `${stamp}.zip`);
    const temporaryPath = `${finalPath}.partial-${process.pid}`;
    let bytes = 0;
    try {
      await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(temporaryPath, { flags: 'wx' });
        request.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 2 * 1024 * 1024 * 1024) request.destroy(new Error('ZIP vượt giới hạn 2 GiB.'));
        });
        request.once('error', reject);
        output.once('error', reject);
        output.once('finish', resolve);
        request.pipe(output);
      });
      if (bytes < 100) throw new Error('ZIP nhận được rỗng hoặc không đầy đủ.');
      this.assertZipArchive(temporaryPath, bytes);
      fs.renameSync(temporaryPath, finalPath);
      run.outputPath = finalPath;
      run.progress = 100;
      run.status = run.errors.length || run.skippedLists?.length ? 'partial' : 'completed';
      run.phase = run.exportedLists ? `Đã xuất ${run.exportedLists.length} list; bỏ qua ${run.skippedLists?.length || 0} list lỗi ảnh.` : (run.errors.length ? 'Đã xuất phần tạo thành công; một số mẫu có lỗi.' : 'Đã tạo list và lưu ZIP thành công.');
      run.completedAt = new Date().toISOString();
      run.updatedAt = run.completedAt;
      delete run.exportToken;
      this.persist();
      return { outputPath: finalPath, bytes };
    } catch (error) {
      try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch { /* best effort */ }
      throw error;
    }
  }

  private assertZipArchive(filePath: string, expectedBytes: number): void {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size !== expectedBytes) {
      throw new Error('ZIP nhận được không đầy đủ so với dữ liệu đã truyền.');
    }

    const descriptor = fs.openSync(filePath, 'r');
    try {
      const header = Buffer.alloc(4);
      if (fs.readSync(descriptor, header, 0, header.length, 0) !== header.length
        || !header.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
        throw new Error('File nhận được không phải ZIP hợp lệ.');
      }

      // End-of-central-directory can be followed by a ZIP comment of up to 65,535 bytes.
      const tailLength = Math.min(stat.size, 65_557);
      const tail = Buffer.alloc(tailLength);
      fs.readSync(descriptor, tail, 0, tail.length, stat.size - tailLength);
      if (tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])) < 0) {
        throw new Error('ZIP bị thiếu phần kết thúc; file có thể đã bị ngắt khi truyền.');
      }
    } finally {
      fs.closeSync(descriptor);
    }
  }

  reportExportFailure(runId: string, token: string, message: string): void {
    const run = this.authorizeExport(runId, token);
    this.failRun(run, `Xuất file thất bại: ${String(message || 'Không rõ lỗi.').slice(0, 500)}`);
  }

  async chooseOutputDirectory(): Promise<{ path: string; directory: string; fileName: string }> {
    if (process.platform !== 'win32') throw new BadRequestException('Chọn thư mục tự động hiện chỉ hỗ trợ Windows.');
    const script = [
      '$ErrorActionPreference = "Stop"',
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      'Add-Type -AssemblyName System.Windows.Forms',
      '[System.Windows.Forms.Application]::EnableVisualStyles()',
      // A topmost owner keeps the native dialog above the browser app window.
      // Hide the helper from the taskbar and dispose it on OK, Cancel or error.
      '$owner = New-Object System.Windows.Forms.Form',
      '$owner.ShowInTaskbar = $false',
      '$owner.TopMost = $true',
      '$owner.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None',
      '$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen',
      '$owner.Size = New-Object System.Drawing.Size(1, 1)',
      '$owner.Opacity = 0',
      '$dialog = New-Object System.Windows.Forms.SaveFileDialog',
      '$dialog.Title = "Chọn nơi lưu ZIP tự động"',
      '$dialog.Filter = "Tệp ZIP (*.zip)|*.zip"',
      '$dialog.DefaultExt = "zip"',
      '$dialog.AddExtension = $true',
      '$dialog.OverwritePrompt = $false',
      '$dialog.FileName = "dalat-carousel-tu-dong.zip"',
      'try { $owner.Show(); $owner.Activate(); $owner.BringToFront(); $result = $dialog.ShowDialog($owner); if ($result -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.FileName) } } finally { $dialog.Dispose(); $owner.Dispose() }',
    ].join('; ');
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true });
    const selected = String(stdout || '').trim();
    if (!selected) throw new BadRequestException('Bạn chưa chọn nơi lưu file ZIP.');
    const resolved = path.resolve(selected);
    const directory = path.dirname(resolved);
    const fileName = this.validateOutputFileName(path.basename(resolved));
    if (!fileName) throw new BadRequestException('Tên file ZIP không hợp lệ.');
    this.assertOutputDirectory(directory);
    return { path: path.join(directory, fileName), directory, fileName };
  }

  private tick(): void {
    const now = Date.now();
    for (const schedule of this.state.schedules) {
      if (!schedule.enabled || !schedule.nextRunAt) continue;
      const due = Date.parse(schedule.nextRunAt);
      if (!Number.isFinite(due) || due > now) continue;
      const scheduledFor = schedule.nextRunAt;
      const key = this.scheduleKey(schedule, due);
      schedule.lastScheduledKey = key;
      if (now - due > 2 * 60 * 1000) {
        const missed = this.newRun(schedule, scheduledFor);
        missed.status = 'missed';
        missed.phase = 'Tool không hoạt động đúng giờ; lượt đã được bỏ qua.';
        missed.completedAt = new Date().toISOString();
        missed.updatedAt = missed.completedAt;
        this.state.runs.unshift(missed);
        this.trimRuns();
      } else {
        this.enqueue(this.newRun(schedule, scheduledFor));
      }
      if (schedule.frequency === 'once') schedule.enabled = false;
      this.recalculateSchedule(schedule, due + 1_000);
      this.persist();
    }
  }

  private enqueue(run: AutomationRun): void {
    this.state.runs.unshift(run);
    this.trimRuns();
    this.persist();
    this.runQueue = this.runQueue.then(() => this.execute(run)).catch((error) => {
      if (ACTIVE_STATUSES.has(run.status)) this.failRun(run, error instanceof Error ? error.message : String(error));
    });
  }

  private async execute(run: AutomationRun): Promise<void> {
    while ((this.manualExportUntil > Date.now() || this.guideService.isGenerationBusy()) && !run.cancelRequested) {
      run.phase = this.manualExportUntil > Date.now()
        ? 'Đang chờ lượt xuất thủ công hoàn tất...'
        : 'Đang chờ lượt tạo list thủ công hoàn tất...';
      this.touch(run, false);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    // Do not mark generation busy while waiting for an existing sync: the
    // coordinator checks that flag before downloading/publishing each source.
    try {
      await this.waitForExistingSync(() => Boolean(run.cancelRequested));
    } catch (error) {
      this.failRun(run, error instanceof Error ? error.message : String(error));
      return;
    }
    this.activeRunId = run.id;
    run.startedAt = new Date().toISOString();
    let previousDestination = '';
    try {
      this.assertNotCancelled(run);
      this.assertOutputDirectory(run.outputDir);
      if (!this.findBrowser()) throw new Error('Không tìm thấy Chrome hoặc Edge để xuất tự động.');
      this.assertHookSelectionReady(run);
      await this.assertFrontendReady();
      previousDestination = this.guideService.getDestinations().active.id;
      run.status = 'refreshing'; run.progress = 3; run.phase = 'Đang mở dữ liệu cục bộ của nguồn...'; this.touch(run);
      // A scheduled generation is not an explicit manual sync. Refreshing here
      // also deadlocks: the sync coordinator yields while this run is active.
      if (previousDestination !== run.destinationId) {
        await this.guideService.setActiveDestination({ id: run.destinationId });
      }
      this.assertNotCancelled(run);
      run.status = 'warming'; run.progress = 12; run.phase = 'Đang chuẩn bị cache ảnh...'; this.touch(run);
      await this.waitForDriveCache(run);

      let requestedDone = 0;
      const totalRequested = Math.max(1, run.templates.reduce((sum, entry) => sum + entry.count, 0));
      for (const template of run.templates) {
        this.assertNotCancelled(run);
        run.status = 'generating';
        run.phase = `Đang tạo ${template.count} list ${template.deckId}...`;
        run.progress = 18 + Math.round((requestedDone / totalRequested) * 42);
        this.touch(run);
        try {
          const response = await this.guideService.enqueueGeneration(() => this.guideService.generateBatchLists({
            deckId: template.deckId,
            count: template.count,
            requestId: `automation:${run.id}:${template.deckId}`,
            hookSelection: run.hook,
            automationRunId: run.id,
          }));
          for (const item of response.lists || []) {
            run.generated.push({ deckId: template.deckId, listId: item.listId });
            run.listIds.push(item.listId);
          }
          if (response.failCount || response.successCount < template.count) {
            run.errors.push({ deckId: template.deckId, requested: template.count, completed: response.successCount, message: (response.errors || []).map((item) => item.message).join('; ') || `Chỉ tạo được ${response.successCount}/${template.count} list.` });
          }
        } catch (error) {
          run.errors.push({ deckId: template.deckId, requested: template.count, completed: 0, message: error instanceof Error ? error.message : String(error) });
        }
        requestedDone += template.count;
        this.touch(run);
      }
      this.assertNotCancelled(run);
      if (!run.listIds.length) throw new Error(run.errors.map((entry) => `${entry.deckId}: ${entry.message}`).join(' | ') || 'Không tạo được list nào để xuất.');

      run.status = 'awaiting-export'; run.progress = 62; run.phase = `Đã tạo ${run.listIds.length} list; đang mở trình render ẩn...`;
      run.exportToken = crypto.randomBytes(32).toString('hex');
      this.touch(run);
      await this.launchRenderer(run);
      if (!['completed', 'partial'].includes(run.status)) throw new Error(run.phase || 'Phiên render kết thúc trước khi lưu ZIP.');
    } catch (error) {
      if (run.cancelRequested) {
        run.status = 'cancelled'; run.phase = 'Đã hủy lượt tự động.'; run.completedAt = new Date().toISOString(); this.touch(run);
      } else if (!['completed', 'partial', 'failed'].includes(run.status)) {
        this.failRun(run, error instanceof Error ? error.message : String(error));
      }
    } finally {
      await this.closeBrowser();
      delete run.exportToken;
      this.touch(run);
      if (previousDestination && previousDestination !== this.guideService.getDestinations().active.id) {
        await this.guideService.setActiveDestination({ id: previousDestination }).catch(() => undefined);
      }
      this.activeRunId = '';
      this.persist();
    }
  }

  private async waitForExistingSync(cancelled: () => boolean): Promise<void> {
    const deadline = Date.now() + 15 * 60 * 1000;
    while (!cancelled()) {
      const sync = this.guideService.getNightSyncStatus();
      if (!sync.running && !sync.queued.length) return;
      if (Date.now() >= deadline) throw new Error('Cập nhật dữ liệu chưa hoàn tất sau 15 phút. Hãy chờ cập nhật xong rồi tạo lại.');
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }

  private async launchRenderer(run: AutomationRun): Promise<void> {
    const found = this.findBrowser();
    if (!found || !run.exportToken) throw new Error('Không tìm thấy trình duyệt để render.');
    const puppeteer = await import('puppeteer-core');
    this.browser = await puppeteer.launch({
      executablePath: found.path,
      headless: true,
      args: ['--disable-extensions', '--disable-background-networking', '--no-first-run', '--disable-default-apps'],
    });
    const page = await this.browser.newPage();
    page.setDefaultTimeout(15 * 60 * 1000);
    const url = new URL(getAppConfig().frontendOrigin);
    url.searchParams.set('automationRunId', run.id);
    url.searchParams.set('automationToken', run.exportToken);
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const deadline = Date.now() + 60 * 60 * 1000;
    while (Date.now() < deadline && ACTIVE_STATUSES.has(run.status) && !run.cancelRequested) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    if (Date.now() >= deadline) throw new Error('Xuất tự động vượt quá 60 phút.');
  }

  private async waitForDriveCache(run: AutomationRun): Promise<void> {
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      this.assertNotCancelled(run);
      const status = this.guideService.getDriveCacheWarmStatus();
      run.progress = 12 + Math.round((Number(status.percent) || 0) * 0.05);
      run.phase = status.message || 'Đang chuẩn bị cache ảnh...';
      this.touch(run, false);
      if (status.ready) return;
      if (status.phase === 'error') throw new Error(status.message || 'Không thể chuẩn bị cache ảnh.');
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    throw new Error('Chuẩn bị cache ảnh vượt quá 15 phút.');
  }

  private validateSchedule(input: AutomationScheduleInput, previous?: AutomationSchedule): AutomationSchedule {
    const name = String(input.name ?? previous?.name ?? '').replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 80) throw new BadRequestException('Tên lịch phải có từ 2 đến 80 ký tự.');
    const destinationId = String(input.destinationId ?? previous?.destinationId ?? '').trim();
    const destination = this.guideService.getDestinations().destinations.find((entry) => entry.id === destinationId);
    if (!destination) throw new BadRequestException('Destination không tồn tại.');
    const frequency = input.frequency ?? previous?.frequency ?? 'once';
    if (!['once', 'daily'].includes(frequency)) throw new BadRequestException('Kiểu lịch không hợp lệ.');
    const templates = this.validateTemplates(input.templates ?? previous?.templates ?? []);
    const rawOutputDir = String(input.outputDir ?? previous?.outputDir ?? '').trim();
    if (!rawOutputDir) throw new BadRequestException('Hãy chọn thư mục lưu file.');
    const outputDir = path.resolve(rawOutputDir);
    this.assertOutputDirectory(outputDir);
    const outputFileName = this.validateOutputFileName(String(input.outputFileName ?? previous?.outputFileName ?? '').trim() || undefined);
    if (!this.findBrowser()) throw new BadRequestException('Không tìm thấy Chrome hoặc Edge để xuất tự động.');
    const hookMode = input.hook?.mode ?? previous?.hook.mode ?? 'normal';
    const sourceId = String(input.hook?.sourceId ?? previous?.hook.sourceId ?? '').trim();
    if (hookMode === 'festival') {
      if (destinationId !== 'dalat') throw new BadRequestException('Hook lễ chỉ áp dụng cho Đà Lạt.');
      const hookStatus = this.guideService.getHookSources();
      if (!hookStatus.sources.some((entry) => entry.id === sourceId && entry.cacheStatus === 'ready')) throw new BadRequestException('Nguồn Hook lễ không tồn tại hoặc chưa sẵn sàng.');
    }
    const onceAt = String(input.onceAt ?? previous?.onceAt ?? '').trim();
    const dailyTime = String(input.dailyTime ?? previous?.dailyTime ?? '').trim();
    if (frequency === 'once' && (!Number.isFinite(Date.parse(onceAt)) || Date.parse(onceAt) <= Date.now())) throw new BadRequestException('Giờ chạy một lần phải nằm trong tương lai.');
    if (frequency === 'daily' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dailyTime)) throw new BadRequestException('Giờ chạy hằng ngày không hợp lệ.');
    const now = new Date().toISOString();
    return {
      id: previous?.id || `schedule-${crypto.randomUUID()}`,
      name,
      destinationId,
      frequency,
      ...(frequency === 'once' ? { onceAt: new Date(onceAt).toISOString() } : { dailyTime }),
      outputDir,
      ...(outputFileName ? { outputFileName } : {}),
      enabled: input.enabled ?? previous?.enabled ?? true,
      templates,
      hook: { mode: hookMode, ...(hookMode === 'festival' ? { sourceId } : {}) },
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    };
  }

  private validateTemplates(input: AutomationTemplateRequest[]): AutomationTemplateRequest[] {
    if (!Array.isArray(input) || !input.length) throw new BadRequestException('Hãy chọn ít nhất một mẫu.');
    const merged = new Map<string, number>();
    for (const raw of input) {
      const deckId = String(raw?.deckId || '').trim();
      const count = Math.trunc(Number(raw?.count));
      if (!deckId || count < MIN_LISTS_PER_TEMPLATE || count > MAX_LISTS_PER_TEMPLATE) {
        throw new BadRequestException(`Mỗi mẫu phải có từ ${MIN_LISTS_PER_TEMPLATE} đến ${MAX_LISTS_PER_TEMPLATE} list.`);
      }
      if (merged.has(deckId)) throw new BadRequestException(`Mẫu ${deckId} đang bị chọn lặp trong cùng một lịch.`);
      merged.set(deckId, count);
    }
    return [...merged].map(([deckId, count]) => ({ deckId, count }));
  }

  private assertOutputDirectory(value: string): void {
    if (!value || !path.isAbsolute(value)) throw new BadRequestException('Hãy chọn thư mục lưu file hợp lệ.');
    if (!fs.existsSync(value) || !fs.statSync(value).isDirectory()) throw new BadRequestException('Thư mục lưu file không tồn tại.');
    const probe = path.join(value, `.dalat-automation-write-test-${process.pid}-${crypto.randomBytes(6).toString('hex')}.tmp`);
    try {
      fs.accessSync(value, fs.constants.W_OK);
      fs.writeFileSync(probe, '', { flag: 'wx' });
      fs.unlinkSync(probe);
    } catch {
      try { if (fs.existsSync(probe)) fs.unlinkSync(probe); } catch { /* best effort */ }
      throw new BadRequestException('Tool không có quyền ghi vào thư mục đã chọn.');
    }
  }

  private validateOutputFileName(value?: string): string | undefined {
    if (!value) return undefined;
    const fileName = path.basename(value);
    if (fileName !== value || /[<>:"/\\|?*\x00-\x1f]/.test(fileName)) {
      throw new BadRequestException('Tên file ZIP không hợp lệ.');
    }
    const withExtension = fileName.toLowerCase().endsWith('.zip') ? fileName : `${fileName}.zip`;
    if (withExtension.length > 120) throw new BadRequestException('Tên file ZIP quá dài.');
    return withExtension;
  }

  private assertHookSelectionReady(run: Pick<AutomationRun, 'destinationId' | 'hook'>): void {
    if (run.hook.mode !== 'festival') return;
    if (run.destinationId !== 'dalat') throw new Error('Hook lễ chỉ áp dụng cho Đà Lạt.');
    const sourceId = String(run.hook.sourceId || '').trim();
    const source = this.guideService.getHookSources().sources.find((entry) => entry.id === sourceId);
    if (!source || source.cacheStatus !== 'ready') {
      throw new Error('Nguồn Hook lễ của lịch đã bị xóa hoặc không còn sẵn sàng. Lượt không được chuyển sang nguồn Hook khác.');
    }
  }

  private async assertFrontendReady(): Promise<void> {
    const origin = getAppConfig().frontendOrigin;
    const expected = getRuntimeSession();
    const health = await fetch(`${origin}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!health.ok) throw new Error(`Frontend/backend không đồng bộ: /api/health HTTP ${health.status}.`);
    const payload = await health.json() as { sessionId?: string; appVersion?: string };
    const frontendSession = String(health.headers.get('x-dalat-frontend-session') || '');
    const frontendVersion = String(health.headers.get('x-dalat-frontend-version') || '');
    if (payload.sessionId !== expected.sessionId || payload.appVersion !== expected.appVersion || (frontendSession && frontendSession !== expected.sessionId) || (frontendVersion && frontendVersion !== expected.appVersion)) {
      throw new Error('Frontend/backend không cùng phiên bản hoặc session. Hãy chạy lại start.bat.');
    }
    const cache = await fetch(`${origin}/api/drive-cache/status`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!cache.ok) throw new Error(`Frontend/backend không đồng bộ: /api/drive-cache/status HTTP ${cache.status}.`);
  }

  private newRun(schedule: AutomationSchedule, scheduledFor: string, templates = schedule.templates, retryOf = ''): AutomationRun {
    const now = new Date().toISOString();
    return {
      id: `run-${crypto.randomUUID()}`,
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      scheduledFor,
      destinationId: schedule.destinationId,
      status: 'queued', phase: 'Đang chờ lượt tự động trước hoàn tất...', progress: 0,
      templates: templates.map((entry) => ({ ...entry })), hook: { ...schedule.hook }, outputDir: schedule.outputDir,
      ...(schedule.outputFileName ? { outputFileName: schedule.outputFileName } : {}),
      listIds: [], generated: [], errors: [], createdAt: now, updatedAt: now,
      ...(retryOf ? { retryOf } : {}),
    };
  }

  private recalculateSchedules(): void {
    for (const schedule of this.state.schedules) {
      if (!schedule.enabled) {
        delete schedule.nextRunAt;
      } else if (!schedule.nextRunAt || !Number.isFinite(Date.parse(schedule.nextRunAt))) {
        this.recalculateSchedule(schedule);
      }
    }
  }

  private recalculateSchedule(schedule: AutomationSchedule, after = Date.now()): void {
    if (!schedule.enabled) { delete schedule.nextRunAt; return; }
    if (schedule.frequency === 'once') {
      schedule.nextRunAt = schedule.onceAt && Date.parse(schedule.onceAt) >= after ? schedule.onceAt : undefined;
      return;
    }
    const [hour, minute] = String(schedule.dailyTime || '00:00').split(':').map(Number);
    const local = new Date(after + TIMEZONE_OFFSET_MS);
    let due = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour - 7, minute, 0, 0);
    if (due < after) due += 24 * 60 * 60 * 1000;
    schedule.nextRunAt = new Date(due).toISOString();
  }

  private scheduleKey(schedule: AutomationSchedule, due: number): string { return `${schedule.id}:${new Date(due).toISOString().slice(0, 16)}`; }
  private touch(run: AutomationRun, persist = true): void { run.updatedAt = new Date().toISOString(); if (persist) this.persist(); }
  private failRun(run: AutomationRun, message: string): void { run.status = 'failed'; run.phase = message; run.errors.push({ message }); run.completedAt = new Date().toISOString(); this.touch(run); }
  private assertNotCancelled(run: AutomationRun): void { if (run.cancelRequested) throw new Error('Lượt đã được yêu cầu hủy.'); }
  private requireSchedule(id: string): AutomationSchedule { const found = this.state.schedules.find((entry) => entry.id === id); if (!found) throw new BadRequestException('Không tìm thấy lịch.'); return found; }
  private requireRun(id: string): AutomationRun { const found = this.state.runs.find((entry) => entry.id === id); if (!found) throw new BadRequestException('Không tìm thấy lượt chạy.'); return found; }
  private authorizeExport(id: string, token: string): AutomationRun {
    const run = this.requireRun(id);
    const expected = Buffer.from(run.exportToken || '', 'utf8');
    const received = Buffer.from(String(token || ''), 'utf8');
    if (!expected.length || expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
      throw new BadRequestException('Token phiên render không hợp lệ.');
    }
    return run;
  }
  private assertScheduleMutable(id: string): void { if (this.activeRunId && this.requireRun(this.activeRunId).scheduleId === id) throw new ConflictException('Không thể sửa lịch đang chạy. Hãy hủy lượt trước.'); }
  private publicSchedule(schedule: AutomationSchedule): AutomationSchedule { return JSON.parse(JSON.stringify(schedule)); }
  private publicRun(run: AutomationRun): AutomationRun { const copy = JSON.parse(JSON.stringify(run)); delete copy.exportToken; return copy; }
  private trimRuns(): void { this.state.runs = this.state.runs.slice(0, RUN_HISTORY_LIMIT); }
  private safeName(value: string): string { return String(value || 'lich').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 48) || 'lich'; }
  private fileStamp(value: string): string { const local = new Date(Date.parse(value) + TIMEZONE_OFFSET_MS); return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}_${String(local.getUTCHours()).padStart(2, '0')}-${String(local.getUTCMinutes()).padStart(2, '0')}-${String(local.getUTCSeconds()).padStart(2, '0')}`; }

  private findBrowser(): { name: string; path: string } | null {
    const local = process.env.LOCALAPPDATA || '';
    const candidates = [
      ['Chrome', process.env.CHROME_PATH || ''],
      ['Chrome', path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe')],
      ['Chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'],
      ['Chrome', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'],
      ['Edge', process.env.EDGE_PATH || ''],
      ['Edge', path.join(local, 'Microsoft', 'Edge', 'Application', 'msedge.exe')],
      ['Edge', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'],
      ['Edge', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'],
    ];
    for (const [name, candidate] of candidates) if (candidate && fs.existsSync(candidate)) return { name, path: candidate };
    return null;
  }

  private async closeBrowser(): Promise<void> { const browser = this.browser; this.browser = null; if (browser) await browser.close().catch(() => undefined); }

  private load(): StoredState {
    try {
      if (!fs.existsSync(this.statePath)) return { version: 1, schedules: [], runs: [] };
      const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as Partial<StoredState>;
      return { version: 1, schedules: Array.isArray(parsed.schedules) ? parsed.schedules : [], runs: Array.isArray(parsed.runs) ? parsed.runs : [] };
    } catch { return { version: 1, schedules: [], runs: [] }; }
  }

  private persist(): void {
    fs.mkdirSync(this.dataRoot, { recursive: true });
    const temporary = `${this.statePath}.tmp-${process.pid}-${Date.now()}`;
    const backup = `${this.statePath}.bak-${process.pid}-${Date.now()}`;
    fs.writeFileSync(temporary, JSON.stringify(this.state, null, 2), 'utf8');
    let movedExisting = false;
    try {
      if (fs.existsSync(this.statePath)) { fs.renameSync(this.statePath, backup); movedExisting = true; }
      fs.renameSync(temporary, this.statePath);
      if (movedExisting) fs.unlinkSync(backup);
    } catch (error) {
      try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* best effort */ }
      if (movedExisting && !fs.existsSync(this.statePath) && fs.existsSync(backup)) {
        try { fs.renameSync(backup, this.statePath); } catch { /* preserve original */ }
      }
      throw error;
    }
  }
}
