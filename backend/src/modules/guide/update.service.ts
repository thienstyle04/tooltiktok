import { BadRequestException, ConflictException, Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getRuntimeSession } from '../../runtime-session';
import { resolveBackendDataDir, resolveBackendRoot, resolveWorkspaceRoot } from '../../config';
import { GuideService } from './guide.service';
import { AutomationSchedulerService } from './automation-scheduler.service';
import { setUpdateLocked } from '../../runtime-update-lock';

type ReleaseInfo = { version: string; commit: string; notes: string[]; artifact: { path: string; size: number; sha256: string } };
type SavedState = { scheduledAt: string | null };

@Injectable()
export class UpdateService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly installRoot = String(process.env.DALAT_INSTALL_ROOT || '').trim();
  private readonly statePath = path.join(resolveBackendDataDir(resolveBackendRoot(__dirname)), 'app-update-state.json');
  private readonly protocol: { fetchLatest: () => Promise<ReleaseInfo>; compareVersions: (a: string, b: string) => number } =
    require(path.join(resolveWorkspaceRoot(resolveBackendRoot(__dirname)), 'scripts', 'update-protocol.js'));
  private latest: ReleaseInfo | null = null;
  private error = '';
  private checking = false;
  private applying = false;
  private scheduledAt: string | null = this.readState().scheduledAt;
  private checkTimer?: ReturnType<typeof setInterval>;
  private scheduleTimer?: ReturnType<typeof setInterval>;
  private statusTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly guide: GuideService, private readonly automation: AutomationSchedulerService) {}

  onApplicationBootstrap(): void {
    if (!this.installRoot) return;
    void this.check();
    this.checkTimer = setInterval(() => { void this.check(); }, 60 * 60_000);
    this.scheduleTimer = setInterval(() => { void this.runScheduled(); }, 60_000);
    this.statusTimer = setInterval(() => { void this.status(); }, 5_000);
    this.checkTimer.unref?.();
    this.scheduleTimer.unref?.();
    this.statusTimer.unref?.();
    void this.runScheduled();
  }

  onApplicationShutdown(): void {
    if (this.checkTimer) clearInterval(this.checkTimer);
    if (this.scheduleTimer) clearInterval(this.scheduleTimer);
    if (this.statusTimer) clearInterval(this.statusTimer);
  }

  status() {
    const currentVersion = getRuntimeSession().appVersion;
    const processState = this.readProcessState();
    if (processState?.phase === 'error' || this.applying && !processState) {
      this.applying = false;
      setUpdateLocked(false);
    }
    const available = this.latest && this.protocol.compareVersions(this.latest.version, currentVersion) > 0 ? this.latest : null;
    return {
      enabled: Boolean(this.installRoot), currentVersion, availableVersion: available?.version || null,
      notes: available?.notes || [], scheduledAt: this.scheduledAt, checking: this.checking,
      applying: this.applying || Boolean(processState && ['queued', 'checking', 'downloading', 'staging', 'waiting', 'restarting', 'rollback'].includes(processState.phase)),
      updateProgress: processState, busy: this.isBusy(), error: processState?.phase === 'error' ? processState.message : this.error,
    };
  }

  async check() {
    if (!this.installRoot || this.checking) return this.status();
    this.checking = true;
    try {
      this.latest = await this.protocol.fetchLatest();
      this.error = '';
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.checking = false;
    }
    return this.status();
  }

  defer(scheduledAt: unknown) {
    if (!this.installRoot) throw new ConflictException('Máy này chưa cài trình cập nhật một lần.');
    const timestamp = typeof scheduledAt === 'string' ? Date.parse(scheduledAt) : NaN;
    if (!Number.isFinite(timestamp) || timestamp <= Date.now() || timestamp > Date.now() + 366 * 86400_000) throw new BadRequestException('Ngày giờ cập nhật không hợp lệ.');
    this.scheduledAt = new Date(timestamp).toISOString();
    this.saveState();
    return this.status();
  }

  cancelSchedule() {
    this.scheduledAt = null;
    this.saveState();
    return this.status();
  }

  freezeForInstall() {
    if (!this.applying && !this.processActive()) throw new ConflictException('Chưa có yêu cầu cập nhật đang chạy.');
    if (this.isBusy()) throw new ConflictException('Tool đang bận; chưa thể chuyển phiên bản.');
    setUpdateLocked(true);
    return { ready: true };
  }

  async install() {
    if (!this.installRoot) throw new ConflictException('Máy này chưa cài trình cập nhật một lần.');
    if (this.applying || this.processActive()) throw new ConflictException('Bản cập nhật đang được cài.');
    if (this.isBusy()) throw new ConflictException('Đang tạo list, xuất file hoặc đồng bộ. Hãy thử lại khi tác vụ hoàn tất.');
    if (!this.latest || this.protocol.compareVersions(this.latest.version, getRuntimeSession().appVersion) <= 0) await this.check();
    if (!this.latest || this.protocol.compareVersions(this.latest.version, getRuntimeSession().appVersion) <= 0) throw new ConflictException('Chưa có phiên bản mới đã ký để cài.');
    const script = path.join(resolveWorkspaceRoot(resolveBackendRoot(__dirname)), 'scripts', 'update-client.js');
    const helper = path.join(resolveWorkspaceRoot(resolveBackendRoot(__dirname)), 'scripts', 'launch-update-helper.ps1');
    if (!fs.existsSync(script) || !fs.existsSync(helper)) throw new ConflictException('Thiếu trình cập nhật trên máy này.');
    fs.writeFileSync(path.join(this.installRoot, 'shared', 'update-process.json'), JSON.stringify({ phase: 'queued', message: 'Đang khởi chạy trình cập nhật.', updatedAt: new Date().toISOString() }));
    this.applying = true;
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper,
      '-NodePath', process.execPath, '-ClientScript', script, '-InstallRoot', this.installRoot], {
      windowsHide: true, stdio: 'ignore',
      env: { ...process.env, DALAT_UPDATE_REQUESTED_VERSION: this.latest.version },
    });
    try {
      await new Promise<void>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Không khởi chạy được trình cập nhật độc lập (mã ${code}).`)));
      });
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.applying = false;
      setUpdateLocked(false);
      fs.writeFileSync(path.join(this.installRoot, 'shared', 'update-process.json'), JSON.stringify({ phase: 'error', message: this.error, updatedAt: new Date().toISOString() }));
      throw new ConflictException(this.error);
    }
    return this.status();
  }

  private async runScheduled() {
    if (!this.scheduledAt || Date.parse(this.scheduledAt) > Date.now() || this.applying || this.processActive() || this.isBusy()) return;
    const processState = this.readProcessState();
    if (processState?.phase === 'error' && Date.now() - Date.parse(processState.updatedAt) < 30 * 60_000) return;
    try { await this.install(); } catch (error) { this.error = error instanceof Error ? error.message : String(error); }
  }

  private isBusy(): boolean {
    return this.guide.isUserOperationBusy() || this.automation.isDataSyncBusy() || Boolean(this.guide.getNightSyncStatus().running);
  }

  private processActive(): boolean {
    return ['queued', 'checking', 'downloading', 'staging', 'waiting', 'restarting', 'rollback'].includes(this.readProcessState()?.phase || '');
  }

  private readState(): SavedState {
    try {
      const value = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      return { scheduledAt: typeof value.scheduledAt === 'string' ? value.scheduledAt : null };
    } catch { return { scheduledAt: null }; }
  }

  private readProcessState(): { phase: string; message: string; updatedAt: string; bytes?: number; total?: number } | null {
    if (!this.installRoot) return null;
    try {
      const value = JSON.parse(fs.readFileSync(path.join(this.installRoot, 'shared', 'update-process.json'), 'utf8'));
      if (!value?.phase || !Number.isFinite(Date.parse(value.updatedAt)) || Date.now() - Date.parse(value.updatedAt) > 60 * 60_000) return null;
      return value;
    } catch { return null; }
  }

  private saveState() {
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    const temporary = `${this.statePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ scheduledAt: this.scheduledAt }));
    fs.renameSync(temporary, this.statePath);
  }
}
